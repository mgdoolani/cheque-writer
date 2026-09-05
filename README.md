# Cheque Writer

Self-hosted web app for printing bank cheques onto blank pre-printed stock.
Originally built and tested against Philippine bank cheques (BDO, BPI,
Metrobank, and others), but works with any bank, anywhere — you create your
own template from a photo or scan of your bank's actual cheque, and position
each field to match. Runs as two Docker containers on an office LAN.

Text is drawn at exact millimetre coordinates into a PDF — the app never
prints a picture of a cheque, and it never generates MICR (that's already
pre-printed on your bank's stock).

---

## ⚡ Quick Start (for the "try it first, read later" crowd)

```bash
git clone https://github.com/mgdoolani/cheque-writer.git
cd cheque-writer
# edit .env — set JWT_SECRET, ENCRYPTION_KEY, admin username/password
docker compose up -d --build
```

Open `http://<your-server-ip>:8080`. That's the whole server side — nothing
else to run on the server after this.

---

## 📖 New here? Start with these two guides

| Guide | What it's for |
|---|---|
| **[→ ACTION_STEPS.md](ACTION_STEPS.md)** | A plain-language, numbered checklist for first-time setup — installing QZ Tray, calibrating your printer, setting up your first bank template. Start here. |
| **[→ USER_GUIDE.md](USER_GUIDE.md)** | The fuller reference — everything in more depth, plus troubleshooting for when something doesn't line up. Come back to this if you get stuck. |

This README covers running/deploying the app on the server. The two guides
above cover actually *setting up and using* it.

---

## Running it

```bash
docker compose up -d --build   # start, and rebuild after code changes
docker compose ps              # both containers should be Up
docker compose logs -f app     # follow the app log
docker compose down            # stop
docker compose down -v         # stop AND erase the database
```

Then open `http://<CT-IP>:8080`.

There is nothing else to run. On first boot the app creates its own schema,
seeds the BDO / BPI / Metrobank starter templates, and creates the admin
account.

| Container | Purpose | Host port |
|---|---|---|
| `phcheck-app` | Express API + the built React UI, one origin | `8080` |
| `phcheck-db`  | PostgreSQL 16, this app's own instance | `5433` |

The database is entirely independent — its own container, volume and
credentials. It shares nothing with any other project.

---

## First sign-in

Log in with `ADMIN_USERNAME` / `ADMIN_PASSWORD` from `.env`.

While an account is still on the shipped default password (`ChangeMe123!`) the
app **refuses to do anything except change it**. This is enforced server-side:
every data route returns `403 mustChangePassword`, and the UI shows a
non-dismissible reset screen. The check runs on every boot, so an account reset
back to the default is caught again at the next restart.

After that, any user can change their own password from the profile menu in the
top-right corner.

---

## Deployment checklist

Work through this before the server is reachable by anyone but you.

- [ ] **Change every secret in `.env`.** `JWT_SECRET` and `ENCRYPTION_KEY` ship
      with generated values that are now in your git history. Regenerate both
      with `openssl rand -hex 32`.
- [ ] **Change the admin password** (the app forces this on first sign-in).
- [ ] **Back up `ENCRYPTION_KEY` somewhere safe.** Payee address, contact,
      email and TIN are AES-256-GCM encrypted with it. Lose the key and that
      data is unrecoverable — cheque records themselves stay readable.
- [ ] **Drop the `5433` port mapping** from `docker-compose.yml` unless you
      actually need to reach Postgres from another machine.
- [ ] Back up the `db_data` and `uploads` Docker volumes.

### If you put this behind HTTPS

Session cookies are currently sent **without** the `Secure` flag, because the
office LAN runs plain HTTP and setting it there would lock everyone out — the
browser would refuse to send the cookie back and no one could stay signed in.

**The moment this sits behind TLS (a reverse proxy, a real certificate, or any
`https://` URL), set:**

```yaml
# docker-compose.yml, under the `app` service's environment:
COOKIE_SECURE: "true"
```

then `docker compose up -d`. Without it the session cookie will travel over
plain HTTP whenever something reaches the app that way, which is exactly what
the flag exists to prevent.

The app reads this at `backend/src/middleware/auth.js` (`issueSession`). It is
the only TLS-dependent setting.

---

## Configuration reference

All of these live in `.env`.

| Variable | Default | Notes |
|---|---|---|
| `DB_USER` / `DB_PASSWORD` / `DB_NAME` | `phcheck` / — / `phcheckdb` | Postgres credentials |
| `DB_HOST_PORT` | `5433` | Host port for Postgres. Remove the mapping if unused |
| `WEB_PORT` | `8080` | Host port the UI is served on |
| `JWT_SECRET` | — | Session signing key. 64 hex chars |
| `ENCRYPTION_KEY` | — | AES-256-GCM key for personal data. **Exactly** 64 hex chars. Changing it makes existing encrypted values unreadable |
| `ADMIN_USERNAME` / `ADMIN_PASSWORD` | `admin` / `ChangeMe123!` | Bootstrap account, created on first boot only |
| `COOKIE_SECURE` | unset (`false`) | **Set to `true` behind HTTPS.** See above |

---

## How the layout system works

A bank template stores the physical size of the cheque and a list of fields,
each with its position **in millimetres** from the top-left corner.

Millimetres rather than pixels: a pixel means nothing without a DPI, and the
reference photo a user traces over can be any resolution. Millimetres are what
you get by putting a ruler on the actual cheque, so a saved template stays
correct regardless of what it was traced over or which screen it was traced on.

The uploaded reference image is a positioning aid shown in the editor. It is
never drawn into the printed PDF.

Positions are set once per bank and reused for every cheque after that.

---

## Project layout

```
backend/src/
  index.js           Express app: /api routes + serves the built UI
  db/                pool, schema.sql (idempotent, applied on boot), seed
  lib/               amount-to-words, date formats, crypto, PDF renderer, units
  middleware/        auth (JWT cookie), role and password-change gates
  routes/            auth, users, payees, templates, checks
frontend/src/
  api/               fetch wrapper
  auth/              session context and route guards
  components/        shell, modal, icons, shared form pieces
  pages/             one file per screen
  styles/            design tokens, then layer stylesheets
```

---

## License & Credit

MIT — see `LICENSE`. Use it, modify it, redistribute it, including
commercially.

Created by [mgdoolani](https://github.com/mgdoolani).
