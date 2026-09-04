# Cheque Writer — Complete Setup & User Guide

Self-hosted, free, open-source cheque printing for any business —
originally built for Philippine banks, works with any bank's cheque
layout. No cloud, no per-cheque fees, no paywall.

Created by [mgdoolani](https://github.com/mgdoolani).

---

## Table of Contents

1. [What This Is](#what-this-is)
2. [Security & Privacy Overview](#security--privacy-overview)
3. [Requirements](#requirements)
4. [Installation](#installation)
5. [First-Time Setup Checklist](#first-time-setup-checklist)
6. [Understanding Roles](#understanding-roles)
7. [Step 1: Set Up a Bank Template](#step-1-set-up-a-bank-template)
8. [Step 2: Install QZ Tray (Every Printing Computer)](#step-2-install-qz-tray-every-printing-computer)
9. [Step 3: Set Up a Printer Profile (Admin)](#step-3-set-up-a-printer-profile-admin)
10. [Step 4: Set Your Personal Printer (Every User)](#step-4-set-your-personal-printer-every-user)
11. [Writing a Cheque](#writing-a-cheque)
12. [Settings](#settings)
13. [User Management](#user-management)
14. [Reports & Audit Trail](#reports--audit-trail)
15. [Going Live — Security Checklist](#going-live--security-checklist)
16. [Troubleshooting](#troubleshooting)
17. [License](#license)

---

## What This Is

Cheque Writer is a self-hosted web app for printing bank cheques —
correctly formatted amounts in words, exact-position printing that
lines up with your bank's pre-printed cheque stock, and a full record
of what was printed, when, and by whom.

It exists because commercial alternatives often charge per cheque or
gate features behind a paywall once you print above a certain amount.
This is free, runs on your own hardware, and you can modify it however
you like.

---

## Security & Privacy Overview

- **Everything stays on your own server.** No cloud, no third-party
  service sees your data.
- **Sensitive payee data (address, contact, email, TIN) is encrypted
  at rest** using AES-256-GCM — even someone with direct database
  access can't read it without the encryption key.
- **Every action is logged** in an audit trail: who logged in, who
  created or printed a cheque, who changed settings, who voided
  something and why.
- **Role-based access** — only Admins can manage users, view the audit
  trail, edit templates, or change global settings. Accounting-role
  users can write and print cheques but can't touch configuration.
- **No ads, ever**, and no telemetry sent anywhere.
- **Sessions use HttpOnly cookies** — not accessible to a stray script
  even if one somehow ran in your browser.
- A void cheque is never deleted — it stays in the record with a
  reason, but is excluded from money totals, so your books stay
  accurate without losing history.

---

## Requirements

- A Linux server (Docker + Docker Compose) — this was built and
  tested on a Proxmox LXC container running Debian Bookworm, but any
  Docker host works.
- A modern browser (Chrome recommended) on every computer that will
  use the app.
- **QZ Tray** (free, open-source) installed on every computer that
  will actually print a cheque — see [Step 2](#step-2-install-qz-tray-every-printing-computer).
- A printer capable of printing on your bank's cheque stock.
- A scanner or camera to capture a reference image of a blank cheque
  for each bank you use.

---

## Installation

```bash
git clone <this-repo>
cd cheque-writer
```

Before starting, generate your own secrets — **never use the defaults
from the repo in a real deployment**:

```bash
openssl rand -base64 48   # → JWT_SECRET
openssl rand -hex 32      # → ENCRYPTION_KEY (32 bytes, for AES-256)
```

Paste both into your `.env` file, then:

```bash
docker compose up -d --build
```

Open `http://<your-server-ip>:8080` in a browser.

---

## First-Time Setup Checklist

1. Log in with the bootstrap admin account (check your `.env` /
   README for the seed credentials).
2. **You'll be forced to change the password immediately** — this
   happens automatically, by design, on any account still using a
   known default password.
3. Go to **Settings → Company** and enter your business name — this
   shows throughout the app (sidebar, browser tab, login screen,
   reports) but is never printed on the cheque itself (the cheque's
   pre-printed account name comes from your bank stock).
4. Decide your **Amount style** (UK: "One Hundred **And** Twenty" vs
   US: "One Hundred Twenty"), **Currency word** (e.g. "Pesos" /
   "Centavos", or your own currency's words), and **default date
   format** — all in Settings.

---

## Understanding Roles

| Role | Can do |
|---|---|
| **Admin** | Everything — manage users, edit templates, configure printers, change settings, view audit trail, void cheques |
| **Accounting** | Write, preview, and print cheques; manage payees; view (but not edit) settings and printer info relevant to their own printing |

**Only an Administrator can create user accounts.** There is no
self-signup — this is deliberate, since cheque-writing access should
be tightly controlled. Set each new employee's account up yourself
under **Users**, and hand them their temporary password — they'll be
forced to change it on first login.

---

## Step 1: Set Up a Bank Template

**Do this before anything else.** Templates define where each field
(payee, date, amount, etc.) sits on a specific bank's cheque — nothing
else works without at least one properly positioned template.

1. Go to **Bank Templates → New Template**. Give it a name and the
   cheque's physical width/height in millimeters — **measure a real
   cheque with a ruler**, don't guess.
2. Upload a **reference scan** of a blank cheque from that bank —
   ideally 300 DPI or higher. This image is only ever used as a
   positioning guide; it is **never printed**.
3. **Use the Crop & Straighten tool** before confirming the upload.
   This matters more than it sounds: if your scan is even slightly
   skewed or cropped short (a very easy mistake — scanning a cheque
   without it lying perfectly flat and centered on the scanner bed
   commonly clips a few millimeters off one edge), every field you
   position afterward will be silently wrong by a growing amount as
   you go down the cheque. The tool shows you a live readout while
   you adjust the crop — keep adjusting until it says **"ok"**, not
   "MISMATCH." Don't skip this step.
4. **Position each field** by dragging it into place on the canvas.
   Use arrow keys for fine adjustment (0.5mm per press, hold Shift for
   0.1mm, Ctrl for 5mm). Fields available: Payee, Date, Amount
   (numbers), Amount (words), Cheque Number, Memo, Signature line,
   Crossed/Account-Payee-Only marking.
5. **Date field type matters.** Look closely at a real cheque from
   this bank:
   - If it has a **blank line** for the date, use the plain **Date**
     field.
   - If it has **individual printed boxes** for each digit
     (`M M - D D - Y Y Y Y`), use **Date (digit boxes)** instead — a
     single text field will never line up with pre-printed boxes.
6. Print the **alignment sheet** on plain paper and hold it against a
   real blank cheque before trusting the positions.

You'll come back to this template to attach a printer profile once
you've set one up — see Step 3.

---

## Step 2: Install QZ Tray (Every Printing Computer)

Cheque Writer prints directly to your printer through **QZ Tray**, a
free local helper app — not through your browser's print dialog. This
is deliberate: browser print dialogs cannot reliably match custom
cheque paper sizes and often "helpfully" rescale content, misaligning
every field. QZ Tray bypasses that entirely.

1. Download and install QZ Tray from **https://qz.io** on every
   computer that will physically print a cheque.
2. Make sure it's running (check for its icon in your system tray).
3. The **first time** the app tries to print from a given computer,
   QZ Tray will show an **Allow / approval popup** asking whether to
   trust the connection. **Tick "Remember this decision"** — this
   makes it a one-time step per computer. If you don't tick that box,
   it will keep asking every single time you print, which gets
   tedious fast.
4. **Caveat worth knowing:** some multifunction printers register
   *two* separate entries in Windows for the same physical device —
   one for normal printing, and one for a fax/scan function (often
   labeled `(Fax)`). Printing to the wrong one can silently "succeed"
   with no error while nothing physically prints. If a printer choice
   isn't working, check whether there's a second, non-`(Fax)` entry
   for the same printer and use that instead.

---

## Step 3: Set Up a Printer Profile (Admin)

A **Printer Profile** describes the physical printer's characteristics
— separate from what any individual field says.

1. Go to **Printers → Set up a printer**.
2. Pick your printer model from the list, or choose "Other." If your
   exact model isn't listed, you may hit a common issue: **many
   inkjet printer drivers refuse a custom paper size below a certain
   height** (often ~127mm / 5 inches), even if your actual cheque is
   shorter (e.g. 76mm). The wizard will guide you through discovering
   this and working around it automatically — it pads the page to
   your printer's real minimum and positions your cheque within it,
   rather than fighting the driver.
3. **Feed path** — "Middle of the tray" is correct for almost every
   printer. Only change this if your printer specifically loads paper
   from one edge.
4. **Print direction / rotation** — leave at 0° initially. If your
   test print comes out upside-down or sideways, that's what this
   fixes (a printer fed logo-first often needs 270°).
5. **Test print and nudge** — print a test sheet, see where it lands,
   and use the nudge controls (arrow buttons, ±1mm) to walk it into
   perfect alignment. This is real-time — every nudge reprints
   immediately so you can see the effect.
6. **"Use this printer for" — attach the bank templates that will use
   this printer.** This step is easy to forget and important: a
   template with no printer profile attached simply can't print.
7. Once saved, you can return anytime via the **Edit & calibrate**
   button on the Printers page — you don't need to start over to
   adjust calibration later.

---

## Step 4: Set Your Personal Printer (Every User)

This is separate from the Printer Profile above, and it matters in any
office with more than one person using the app.

- The **Printer Profile** (Step 3) describes the physical
  characteristics of a printer model — shared, set up once.
- **Which literal device your own print jobs go to is personal**, set
  in **Settings → My Printer**, using the dropdown of printers QZ Tray
  sees *on your own computer*.
- This matters because **a printer is often only physically connected
  to one computer**. If you log into the app from a different desk
  without that same printer available, your saved choice will still
  show, but it simply won't work from that machine — that's expected,
  not a bug. Each person sets their own default once, at their own
  usual desk.

---

## Writing a Cheque

1. **New Cheque**.
2. **Payee** — pick from your saved payee book, or type a new name
   directly. **To write a cash cheque, just type `CASH` as the
   payee** — there's no special "cash mode," it's simply a payee name
   like any other.
3. **Amount** — type the number; it auto-formats with commas as you
   type (e.g. `1,500.00`).
4. **Date** — uses whatever format is configured for that bank
   template (plain line or digit boxes).
5. **Cheque number** (optional) — for your own internal tracking only,
   never printed on the cheque.
6. **Marking** (optional) — Crossed Cheque / Account Payee Only.
7. The **amount in words is generated automatically** — you never
   type it. It follows your configured style (UK/US) and currency
   word from Settings.
8. **Save & Preview** shows exactly how it will print, watermarked, in
   an on-screen preview (not a downloaded file).
9. **Print** sends it directly to your personal printer via QZ Tray —
   no print dialog, no paper-size guessing.

---

## Settings

- **Amount style** — UK ("One Hundred And Twenty") vs US ("One
  Hundred Twenty").
- **Currency word** — e.g. "Pesos" / "Centavos"; type your own if
  using a different currency, with a live preview showing the exact
  phrasing before you save.
- **Date format** — dozens of numeric and word-based formats, with a
  worked example shown for each.
- **Duplicate detection window** — how many days back to warn about a
  possible duplicate cheque (payee + amount + date match).
- **Reprint policy** — whether reprints are allowed, and whether a
  reason is required.
- **Company name** — shown throughout the app; never on the cheque
  itself.
- **Theme** — light/dark, personal per account.

---

## User Management

**Only Admins can create accounts.** Under **Users**:

- Create a new user with a temporary password — they're forced to
  change it on first login.
- Deactivate or reactivate an account.
- Reset a user's password if they're locked out.
- Roles are Admin or Accounting only — see [Understanding Roles](#understanding-roles).

---

## Reports & Audit Trail

- **Cheque Register** — searchable, filterable log of every cheque
  written, with running totals for whatever filter is applied.
  Exportable to CSV.
- **Reports** — monthly summaries, top payees, per-bank breakdowns.
- **Audit Trail** (Admin only) — every login, cheque creation, print,
  reprint (with reason), void (with reason), and settings change, with
  who did it and when.

---

## Going Live — Security Checklist

Before this touches real cheques and real money:

- [ ] Regenerate `JWT_SECRET` and `ENCRYPTION_KEY` (see
      [Installation](#installation)) — never use example values from
      this repo.
- [ ] Wipe any test data: `docker compose down -v` then bring it back
      up fresh (this also resets QZ Tray's certificate, so every
      workstation will need to re-approve it once more — expected).
- [ ] Set `COOKIE_SECURE=true` in `.env` **only once the app is served
      over HTTPS** — it deliberately refuses to send the login cookie
      over an unencrypted connection.
- [ ] If you want HTTPS: browsers only trust certificates from a real
      domain name (via Let's Encrypt, free) or you can use a
      self-signed certificate and manually trust it on each device —
      either way, this typically sits behind a reverse proxy (Nginx or
      Caddy) in front of the app, not configured inside the app
      itself.
- [ ] Delete any test/demo user accounts.
- [ ] Confirm every bank template has real, ruler-verified dimensions
      and fields positioned against a real (not placeholder) scan.

---

## Troubleshooting

**Nothing prints, no error shown.**
Check whether you accidentally selected a `(Fax)` printer entry
instead of the real print queue (see Step 2, caveat).

**Print comes out shifted to one side.**
Recalibrate using the nudge tool (Printers → Edit & calibrate). Nudge
in the direction opposite to the error — printing too far left? Nudge
right.

**Print comes out upside-down or sideways.**
Adjust Print Direction / rotation on the Printer Profile, then
re-test.

**Fields are progressively more misaligned toward the bottom of the
cheque.**
This is the classic symptom of a cropped or skewed reference scan.
Re-upload it using the Crop & Straighten tool and check the DPI/size
readout says "ok," then reposition the fields from scratch — old
positions traced against a bad scan can't be salvaged by nudging.

**"Printing unavailable" button.**
Either QZ Tray isn't running on this computer, or you haven't set a
personal printer yet in Settings → My Printer.

**A colleague's printer profile shows as unavailable to me.**
Expected if it's physically connected to a different computer than
the one you're on — check the "Located at" label on the printer
profile.

---

## License

MIT — see `LICENSE`. Use it, modify it, redistribute it, including
commercially. Attribution appreciated but not required beyond keeping
the license notice.

If this saved you money or hassle, consider [buying me a coffee](#) —
never required, always appreciated.
