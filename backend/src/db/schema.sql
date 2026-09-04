-- Cheque Writer schema. Applied on every boot; every statement is idempotent.

CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  username      TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  full_name     TEXT NOT NULL DEFAULT '',
  role          TEXT NOT NULL DEFAULT 'accounting'
                CHECK (role IN ('admin', 'accounting')),
  theme         TEXT NOT NULL DEFAULT 'system'
                CHECK (theme IN ('light', 'dark', 'system')),
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_login_at TIMESTAMPTZ
);

-- Global key/value settings: amount-words style, currency label, date format...
CREATE TABLE IF NOT EXISTS settings (
  key        TEXT PRIMARY KEY,
  value      TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL
);

-- Address/contact/TIN are AES-256-GCM ciphertext (lib/crypto.js). Name stays
-- plaintext because it has to be searchable and it is printed on the cheque.
CREATE TABLE IF NOT EXISTS payees (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  address_enc TEXT,
  contact_enc TEXT,
  email_enc   TEXT,
  tin_enc     TEXT,
  notes       TEXT,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS payees_name_idx ON payees (lower(name));

-- One row per bank layout. `fields` holds the dragged box coordinates in mm.
CREATE TABLE IF NOT EXISTS check_templates (
  id                  SERIAL PRIMARY KEY,
  name                TEXT NOT NULL,
  bank_name           TEXT NOT NULL DEFAULT '',
  check_width_mm      NUMERIC(7,2) NOT NULL DEFAULT 178,
  check_height_mm     NUMERIC(7,2) NOT NULL DEFAULT 76,
  orientation         TEXT NOT NULL DEFAULT 'landscape'
                      CHECK (orientation IN ('landscape', 'portrait')),
  paper_mode          TEXT NOT NULL DEFAULT 'exact'
                      CHECK (paper_mode IN ('exact', 'feed')),
  paper_size          TEXT NOT NULL DEFAULT 'A4'
                      CHECK (paper_size IN ('A4', 'LETTER', 'LEGAL')),
  feed_offset_x_mm    NUMERIC(7,2) NOT NULL DEFAULT 0,
  feed_offset_y_mm    NUMERIC(7,2) NOT NULL DEFAULT 0,
  reference_image     TEXT,
  reference_image_dpi NUMERIC(7,1),
  signature_image     TEXT,
  fields              JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_active           BOOLEAN NOT NULL DEFAULT TRUE,
  is_default          BOOLEAN NOT NULL DEFAULT FALSE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- payee_name / amount_words / date_text are SNAPSHOTS: what was actually put on
-- the paper. Settings can change later without rewriting history.
CREATE TABLE IF NOT EXISTS checks (
  id               SERIAL PRIMARY KEY,
  template_id      INTEGER REFERENCES check_templates(id) ON DELETE SET NULL,
  payee_id         INTEGER REFERENCES payees(id) ON DELETE SET NULL,
  payee_name       TEXT NOT NULL,
  amount           NUMERIC(16,2) NOT NULL CHECK (amount >= 0),
  amount_words     TEXT NOT NULL DEFAULT '',
  check_date       DATE NOT NULL,
  date_text        TEXT NOT NULL DEFAULT '',
  check_number     TEXT,
  memo             TEXT,
  marking          TEXT NOT NULL DEFAULT 'none'
                   CHECK (marking IN ('none', 'crossed', 'account_payee')),
  status           TEXT NOT NULL DEFAULT 'draft'
                   CHECK (status IN ('draft', 'printed', 'void')),
  print_count      INTEGER NOT NULL DEFAULT 0,
  first_printed_at TIMESTAMPTZ,
  last_printed_at  TIMESTAMPTZ,
  void_reason      TEXT,
  voided_at        TIMESTAMPTZ,
  created_by       INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS checks_date_idx    ON checks (check_date DESC);
CREATE INDEX IF NOT EXISTS checks_payee_idx   ON checks (payee_id);
CREATE INDEX IF NOT EXISTS checks_status_idx  ON checks (status);
CREATE INDEX IF NOT EXISTS checks_name_idx    ON checks (lower(payee_name));

-- A cheque number is for tracking only, but two live cheques must not claim the
-- same one. Voided cheques are excluded so a number can be reissued.
CREATE UNIQUE INDEX IF NOT EXISTS checks_number_unique
  ON checks (check_number)
  WHERE check_number IS NOT NULL AND check_number <> '' AND status <> 'void';

CREATE TABLE IF NOT EXISTS audit_logs (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER REFERENCES users(id) ON DELETE SET NULL,
  username    TEXT NOT NULL DEFAULT '',
  action      TEXT NOT NULL,
  entity_type TEXT,
  entity_id   INTEGER,
  detail      JSONB NOT NULL DEFAULT '{}'::jsonb,
  ip_address  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS audit_created_idx ON audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS audit_entity_idx  ON audit_logs (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS audit_user_idx    ON audit_logs (user_id);

-- ── Additive migrations ───────────────────────────────────────────────────────
-- CREATE TABLE IF NOT EXISTS above will not touch a table that already exists,
-- so columns added after the first release go here. Each one is idempotent.

-- Set when an account is still on a known default password. While it is true
-- the user can do nothing but change their password.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMPTZ;

-- Paper Feed Path preset (Print Options). Only meaningful when paper_mode is
-- 'feed'; it computes the starting feed_offset_x_mm so an operator picks
-- Center/Left/Right instead of guessing millimetres. The offsets remain the
-- values that actually render, so fine-tuning afterwards still wins.
ALTER TABLE check_templates
  ADD COLUMN IF NOT EXISTS feed_path TEXT NOT NULL DEFAULT 'center'
  CHECK (feed_path IN ('center', 'left', 'right'));

-- ── Printer profiles ─────────────────────────────────────────────────────────
-- Sheet size and feed offsets are properties of the PRINTER, not the bank.
-- Keeping them per-template meant re-entering them for every bank, and worse,
-- it pushed people to inflate a template's cheque height to satisfy a printer
-- minimum — which silently moves every field coordinate.
--
-- A profile holds the printer's constraints once; templates reference it.
CREATE TABLE IF NOT EXISTS printer_profiles (
  id                 SERIAL PRIMARY KEY,
  name               TEXT NOT NULL,
  model              TEXT NOT NULL DEFAULT '',
  -- The smallest page the printer will accept. A cheque shorter than this is
  -- drawn on a page padded up to it, rather than rejected or rescaled.
  min_page_width_mm  NUMERIC(7,2) NOT NULL DEFAULT 0,
  min_page_height_mm NUMERIC(7,2) NOT NULL DEFAULT 0,
  feed_path          TEXT NOT NULL DEFAULT 'center'
                     CHECK (feed_path IN ('center', 'left', 'right')),
  -- Calibration nudges applied on top of the feed path.
  offset_x_mm        NUMERIC(7,2) NOT NULL DEFAULT 0,
  offset_y_mm        NUMERIC(7,2) NOT NULL DEFAULT 0,
  notes              TEXT,
  is_default         BOOLEAN NOT NULL DEFAULT FALSE,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE check_templates
  ADD COLUMN IF NOT EXISTS printer_profile_id INTEGER
  REFERENCES printer_profiles(id) ON DELETE SET NULL;

-- Print direction. Real feed mechanics do not always reduce to portrait vs
-- landscape: a printer fed logo-first may need the whole page turned 270° to
-- come out right-side-up. This is a property of how the PRINTER takes paper,
-- so it lives with the sheet size and offsets rather than on each bank template.
ALTER TABLE printer_profiles
  ADD COLUMN IF NOT EXISTS rotation INTEGER NOT NULL DEFAULT 0
  CHECK (rotation IN (0, 90, 180, 270));

-- ── QZ Tray signing material ─────────────────────────────────────────────────
-- QZ Tray requires every print request to be signed by a certificate the local
-- agent trusts. The PRIVATE KEY MUST NEVER REACH THE BROWSER — the frontend
-- posts the string to be signed and receives only a signature.
--
-- Stored here rather than on disk because only the database and the uploads
-- volume survive a container rebuild. The private key is AES-256-GCM encrypted
-- with ENCRYPTION_KEY (lib/crypto.js), so a database dump alone does not
-- disclose it. Losing ENCRYPTION_KEY means regenerating the pair and
-- re-approving it in QZ Tray once.
CREATE TABLE IF NOT EXISTS qz_signing (
  id              INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  certificate_pem TEXT NOT NULL,
  private_key_enc TEXT NOT NULL,
  fingerprint     TEXT NOT NULL DEFAULT '',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at      TIMESTAMPTZ
);

-- Which OS printer this profile prints to, as named by QZ Tray's enumeration.
ALTER TABLE printer_profiles
  ADD COLUMN IF NOT EXISTS qz_printer_name TEXT;

-- ── Per-user printer (QZ Tray) ───────────────────────────────────────────────
-- Which physical device a person prints to is a property of WHERE THEY SIT, not
-- of the cheque layout. Keeping it on the shared printer profile meant whoever
-- set it decided where everyone's jobs went, from any desk.
--
-- The profile keeps the things that really are properties of the printer MODEL
-- (minimum page, rotation, feed path, calibration offsets); the target device
-- moves here, per account.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS qz_printer_name TEXT;

-- printer_profiles.qz_printer_name is retained but NO LONGER USED FOR ROUTING.
-- It is kept so the previously configured value is not lost, and is migrated
-- into the admin's personal setting on first boot after this change (db/seed.js).

-- Who calibrated a printer profile, and when.
-- Calibration offsets are SHARED on the profile while the target device is
-- per-user, so it matters whose physical unit produced these numbers: two
-- printers of the same model can differ by a millimetre or two, and one
-- person's calibration does not transfer perfectly to another desk.
ALTER TABLE printer_profiles
  ADD COLUMN IF NOT EXISTS calibrated_by INTEGER REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE printer_profiles
  ADD COLUMN IF NOT EXISTS calibrated_at TIMESTAMPTZ;
ALTER TABLE printer_profiles
  ADD COLUMN IF NOT EXISTS calibrated_on_printer TEXT;

-- Pixel dimensions of the reference scan.
-- The editor stretches the scan to fill the declared cheque rectangle, so if
-- the scan's proportions do not match the declared width x height, every traced
-- coordinate is skewed by an affine error (a scale AND an offset) that no
-- single printer calibration value can undo. Storing the pixel size lets the
-- editor detect and report that instead of silently mis-tracing.
ALTER TABLE check_templates
  ADD COLUMN IF NOT EXISTS reference_image_px_w INTEGER;
ALTER TABLE check_templates
  ADD COLUMN IF NOT EXISTS reference_image_px_h INTEGER;

-- Which desk/computer this printer physically lives at.
-- Distinct from calibrated_by: that says whose NUMBERS these are, this says
-- whose PRINTER it is. Free text because QZ Tray reports an IP and MAC but not
-- a hostname, and "Front desk PC" is more use to a colleague than 192.168.30.44.
ALTER TABLE printer_profiles
  ADD COLUMN IF NOT EXISTS workstation TEXT;
