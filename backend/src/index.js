/**
 * Cheque Writer — single process: JSON API under /api, and the built React
 * app for everything else. One origin means no CORS and a plain httpOnly
 * session cookie.
 */

import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';

import { waitForDatabase, applySchema, pool } from './db/index.js';
import { requireAuth, requirePasswordChanged } from './middleware/auth.js';
import { seed } from './db/seed.js';

import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import payeeRoutes from './routes/payees.js';
import templateRoutes from './routes/templates.js';
import checkRoutes from './routes/checks.js';
import settingRoutes from './routes/settings.js';
import reportRoutes from './routes/reports.js';
import auditRoutes from './routes/audit.js';
import printerRoutes from './routes/printers.js';
import qzRoutes from './routes/qz.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.resolve(here, '..', 'public');

const app = express();

app.set('trust proxy', 1);
app.use(
  helmet({
    // The UI is same-origin and loads no third-party scripts; the default CSP
    // would block Vite's inlined style handling without buying us anything.
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  }),
);
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());

/**
 * Product and deployment identity, readable WITHOUT signing in — the login
 * screen and the browser tab need it before anyone authenticates.
 *
 * Deliberately the narrowest possible payload: the product name and whatever
 * company name the admin typed. Nothing about users, cheques or configuration.
 * On a LAN app, a business showing its own name on its own login page is
 * expected; if this ever faced the internet it would be worth reconsidering.
 */
app.get('/api/branding', async (_req, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT value FROM settings WHERE key = 'company_name'",
    );
    res.json({
      productName: 'Cheque Writer',
      companyName: rows[0]?.value || '',
      credit: 'Created by mgdoolani',
    });
  } catch {
    // Branding must never be the reason a login page fails to render.
    res.json({ productName: 'Cheque Writer', companyName: '', credit: 'Created by mgdoolani' });
  }
});

app.get('/api/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ ok: true, database: 'up' });
  } catch (err) {
    res.status(503).json({ ok: false, database: 'down', error: err.message });
  }
});

// /api/auth is exempt: an account locked to a password change still has to be
// able to read its own record, change the password and sign out.
app.use('/api/auth', authRoutes);

const gated = [requireAuth, requirePasswordChanged];
app.use('/api/users', gated, userRoutes);
app.use('/api/payees', gated, payeeRoutes);
app.use('/api/templates', gated, templateRoutes);
app.use('/api/checks', gated, checkRoutes);
app.use('/api/settings', gated, settingRoutes);
app.use('/api/reports', gated, reportRoutes);
app.use('/api/audit', gated, auditRoutes);
app.use('/api/printers', gated, printerRoutes);
app.use('/api/qz', gated, qzRoutes);

app.use('/api', (_req, res) => res.status(404).json({ error: 'Unknown endpoint' }));

// ── Static frontend ───────────────────────────────────────────────────────────
if (fs.existsSync(publicDir)) {
  app.use(express.static(publicDir, { index: false, maxAge: '1h' }));
  // Client-side routing: anything that isn't a file or /api is the SPA.
  app.get('*', (_req, res) => res.sendFile(path.join(publicDir, 'index.html')));
} else {
  app.get('/', (_req, res) =>
    res.status(503).send('Frontend build not found. Run: docker compose up -d --build'),
  );
}

// eslint-disable-next-line no-unused-vars -- Express identifies handlers by arity
app.use((err, _req, res, _next) => {
  console.error(err);
  const status = err.status || 500;
  res.status(status).json({
    error: status === 500 ? 'Something went wrong on the server' : err.message,
  });
});

const port = Number(process.env.PORT) || 5000;

async function start() {
  console.log('Cheque Writer starting…');
  await waitForDatabase();
  console.log('  database reachable');
  await applySchema();
  console.log('  schema applied');
  await seed();

  app.listen(port, '0.0.0.0', () => {
    console.log(`  listening on http://0.0.0.0:${port}`);
  });
}

start().catch((err) => {
  console.error('Startup failed:', err);
  process.exit(1);
});
