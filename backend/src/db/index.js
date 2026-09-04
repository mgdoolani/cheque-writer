/**
 * Postgres pool + boot-time setup.
 *
 * This is a dedicated database for this app alone. It shares nothing with any
 * other project — its own container, its own volume, its own credentials.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const here = path.dirname(fileURLToPath(import.meta.url));

// NUMERIC comes back as a string by default (arbitrary precision). Amounts are
// NUMERIC(16,2) and are always handled as JS numbers above this layer.
pg.types.setTypeParser(pg.types.builtins.NUMERIC, (v) => (v === null ? null : Number(v)));
// DATE must stay a plain YYYY-MM-DD string — never a timezone-shifted Date.
pg.types.setTypeParser(pg.types.builtins.DATE, (v) => v);

export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30_000,
});

export const query = (text, params) => pool.query(text, params);

/** Run a set of statements in one transaction. */
export async function transaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/** Block until Postgres accepts connections (the container may still be booting). */
export async function waitForDatabase({ attempts = 30, delayMs = 2000 } = {}) {
  for (let i = 1; i <= attempts; i += 1) {
    try {
      await pool.query('SELECT 1');
      return;
    } catch (err) {
      if (i === attempts) throw err;
      console.log(`  database not ready (attempt ${i}/${attempts}) — retrying…`);
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
}

export async function applySchema() {
  const sql = fs.readFileSync(path.join(here, 'schema.sql'), 'utf8');
  await pool.query(sql);
}
