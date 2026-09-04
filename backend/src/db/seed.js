/**
 * First-boot data: the admin account and the three banks the office uses.
 *
 * Every step is "create only if missing", so restarting the container never
 * overwrites anything the user has since edited.
 */

import bcrypt from 'bcryptjs';
import { query } from './index.js';
import { defaultFields } from '../lib/checkLayout.js';

/**
 * Passwords that ship in the repo / compose file. Any account still using one
 * is forced to change it before it can do anything else.
 */
export const KNOWN_DEFAULT_PASSWORDS = ['ChangeMe123!'];

const BANKS = [
  { name: 'BDO — Current Account', bank: 'BDO Unibank' },
  { name: 'BPI — Current Account', bank: 'Bank of the Philippine Islands' },
  { name: 'Metrobank — Current Account', bank: 'Metrobank' },
];

async function seedAdmin() {
  const username = (process.env.ADMIN_USERNAME || 'admin').trim();
  const password = process.env.ADMIN_PASSWORD || 'ChangeMe123!';

  const { rows } = await query('SELECT id FROM users LIMIT 1');
  if (rows.length > 0) return null;

  const hash = await bcrypt.hash(password, 12);
  await query(
    `INSERT INTO users (username, password_hash, full_name, role, must_change_password)
     VALUES ($1, $2, 'Administrator', 'admin', $3)`,
    [username, hash, KNOWN_DEFAULT_PASSWORDS.includes(password)],
  );
  return username;
}

async function seedTemplates() {
  const { rows } = await query('SELECT count(*)::int AS n FROM check_templates');
  if (rows[0].n > 0) return 0;

  const size = { width: 178, height: 76 };
  for (const [i, { name, bank }] of BANKS.entries()) {
    await query(
      `INSERT INTO check_templates
         (name, bank_name, check_width_mm, check_height_mm, fields, is_default)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6)`,
      [name, bank, size.width, size.height, JSON.stringify(defaultFields(size)), i === 0],
    );
  }
  return BANKS.length;
}

/**
 * Flag every active account still sitting on a shipped default password. Runs
 * on every boot, so an install that predates this check is caught too, and an
 * admin who resets a colleague back to the default is caught next restart.
 */
async function flagDefaultPasswords() {
  const { rows } = await query(
    'SELECT id, username, password_hash, must_change_password FROM users WHERE is_active = TRUE',
  );

  const flagged = [];
  for (const user of rows) {
    let isDefault = false;
    for (const candidate of KNOWN_DEFAULT_PASSWORDS) {
      // eslint-disable-next-line no-await-in-loop -- a handful of users, at boot
      if (await bcrypt.compare(candidate, user.password_hash)) {
        isDefault = true;
        break;
      }
    }

    if (isDefault && !user.must_change_password) {
      await query('UPDATE users SET must_change_password = TRUE WHERE id = $1', [user.id]);
      flagged.push(user.username);
    } else if (!isDefault && user.must_change_password) {
      // Password was changed out-of-band (e.g. straight in psql) — clear it.
      await query('UPDATE users SET must_change_password = FALSE WHERE id = $1', [user.id]);
    }
  }
  return flagged;
}

/**
 * One-time move of the shared profile printer onto a personal setting.
 *
 * Printer selection used to live on the printer profile, which made it global:
 * whoever set it decided where every user's job went. It is now per-account.
 * Rather than discard whatever was configured, seed it as the personal default
 * of the longest-standing active admin — someone who was demonstrably printing
 * with it.
 *
 * Runs only while no user has a personal printer yet, so it never overwrites a
 * choice somebody has since made.
 */
async function migrateProfilePrinterToUser() {
  const { rows: alreadySet } = await query(
    "SELECT 1 FROM users WHERE coalesce(qz_printer_name, '') <> '' LIMIT 1",
  );
  if (alreadySet.length) return null;

  const { rows: profiles } = await query(
    `SELECT name, qz_printer_name FROM printer_profiles
      WHERE coalesce(qz_printer_name, '') <> ''
      ORDER BY is_default DESC, id
      LIMIT 1`,
  );
  if (!profiles.length) return null;

  const { rows: admins } = await query(
    `SELECT id, username FROM users
      WHERE role = 'admin' AND is_active = TRUE
      ORDER BY id LIMIT 1`,
  );
  if (!admins.length) return null;

  await query('UPDATE users SET qz_printer_name = $1 WHERE id = $2', [
    profiles[0].qz_printer_name,
    admins[0].id,
  ]);

  return { printer: profiles[0].qz_printer_name, username: admins[0].username };
}

export async function seed() {
  const createdAdmin = await seedAdmin();
  const templateCount = await seedTemplates();

  if (createdAdmin) {
    console.log(`  created bootstrap admin "${createdAdmin}" — change its password on first login`);
  }
  if (templateCount) {
    console.log(`  created ${templateCount} starter bank templates (BDO, BPI, Metrobank)`);
  }

  const moved = await migrateProfilePrinterToUser();
  if (moved) {
    console.log(
      `  printer selection is now per-user — "${moved.printer}" seeded as ` +
        `${moved.username}'s personal default`,
    );
  }

  const flagged = await flagDefaultPasswords();
  if (flagged.length) {
    console.warn(
      `  WARNING: still on the default password and locked to a password change: ${flagged.join(', ')}`,
    );
  }
}
