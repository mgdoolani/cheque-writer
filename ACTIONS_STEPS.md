# Action Steps — Setting Up Cheque Writer

A simple, step-by-step guide. No technical background needed — just
follow the steps in order.

This guide is split into three parts, because different steps happen
on different machines:

| Part | Where | Who |
|---|---|---|
| 🖥️ **Server Side** | The Linux server | Done once, by whoever set up the server |
| 💻 **Client Side** | Each Windows/Mac computer with a printer | Done once per printing computer |
| 🌐 **Browser Side** | Any computer, in a web browser | Everyone, using the app day to day |

---

## 🖨️ Before you start: check your printer

This app has been tested and confirmed working on an **Epson L5390**.

**Not every printer can feed a cheque properly.** A Brother printer was
also tested and ran into errors — its paper feeder couldn't handle a
cheque's small, narrow size the way the Epson could. Before relying on
this for real cheques, do a full test run (Step 11 below) and confirm
your specific printer feeds the cheque through cleanly, without
jamming or erroring out.

**Recommended: use 90° rotation** so the cheque feeds through
**vertically** (the long edge going in first) rather than
horizontally. This matches how most printers' paper feeders are
actually built to grab and pull paper through, and avoids the feeding
problems some printers have with a short, wide sheet going in
sideways. You'll set this in Step 6 (Printer Setup) under "Print
direction."

---

## 🖥️ Server Side (Linux server — do this once)

### 1. Set up your secret keys

On the server, open the `.env` file. You'll see two lines that need
real values: `JWT_SECRET` and `ENCRYPTION_KEY`.

Think of these like a lock and key for a treasure box — they keep your
data safe. Never share them with anyone, and never leave them at the
example values that came with the app.

Run these two commands on the server to generate real ones, and paste
the results into `.env`:

```bash
openssl rand -base64 48   # for JWT_SECRET
openssl rand -hex 32      # for ENCRYPTION_KEY
```

### 2. Change the default passwords

Set your own admin username and password in `.env` before starting the
app for the first time.

### 3. Start the app

On the server, run:

```bash
docker compose up -d --build
```

This turns the app on. Wait about 10–20 seconds for it to finish
starting up.

**✅ That's it for the server.** Once the app is running, you don't
need to come back to the server or touch it in a terminal again for
normal day-to-day use. Everything from here on happens in a web
browser, on any computer on the network.

---

## 💻 Client Side (each Windows/Mac computer with a printer — do this once per computer)

### 0. Install QZ Tray

On **each Windows or Mac computer that has a printer connected to
it** (not the server), download and install **QZ Tray** — a free
helper program. Get it from **https://qz.io**

Think of QZ Tray as a bridge between the app (running in your browser)
and your printer. Without it, the app has no way to talk directly to
your printer. This needs to be installed on every computer that will
actually print a cheque — but not on the server itself.

---

## 🌐 Browser Side (any computer — everyone follows this)

### 4. Open the app in your browser

Go to `http://<your-server's-address>:8080` (ask whoever set up the
server what the address is).

### 5. Log in as admin

Use the username and password from Server Side Step 2. The app will
immediately ask you to pick a brand new password — this happens
automatically and is required. It's a safety feature, not a bug.

### 6. Set up your printer (do this BEFORE Step 9)

Go to **Printers → Set up a printer**. Follow the wizard: pick your
printer, print a test page, and use the arrow buttons to nudge it
until it lines up correctly.

**Important to understand:** Printer Calibration moves the **whole
cheque** on the page — like sliding an entire piece of paper left,
right, up, or down until it's sitting where it should. It does **not**
control where the Payee, Date, or Amount sit on the cheque itself —
that's a completely different thing, covered in the next step.

<details>
<summary>Why does calibration exist separately from templates?</summary>

Printers don't always feed paper in exactly the same spot every time —
there's a small amount of physical wiggle depending on the printer
model and how the paper sits in the tray. Calibration is a one-time
correction for *that* — nothing to do with your cheque's actual
layout, just where the printer happens to put ink relative to the
paper.

</details>

**Reminder:** see "Before you start: check your printer" above — 90°
rotation (feeding the cheque vertically) is recommended for the best
chance of a clean, jam-free feed.

### 7. Set up a Bank Template

Go to **Bank Templates → New Template**. Upload a clear photo or scan
of a blank cheque from your bank — **300 DPI is recommended** (DPI
just means how sharp the picture is; bigger number = clearer picture).

Then drag each box — Payee, Date, Amount, etc. — to the exact spot
where that information should be written on the cheque.

**Important to understand:** Bank Templates decide **where on the
cheque** each piece of information goes — payee here, date there,
amount there. Printer Calibration (Step 6) then moves **everything
together** if the paper isn't sitting perfectly straight in the
printer. These are two separate jobs, working together.

<details>
<summary>Still fuzzy on the difference? Read this.</summary>

Think of it like a printed form on a photocopier. The **template** is
the form itself — where each blank line is printed. **Calibration** is
whether the photocopier feeds the paper slightly crooked or off-
center. Fixing a crooked feed doesn't redesign the form, and
redesigning the form doesn't fix a crooked feed — they're separate
problems with separate fixes.

</details>

### 8. Connect the template to the printer — VERY IMPORTANT

Go back to your printer (or the template) and find **"Use this
printer for"**. Tick the bank template you just made.

**If you skip this step, nothing will print.** The app won't know
which printer to send that bank's cheques to until you connect them.

### 9. Choose your own printer (Settings → My Printer)

Go to **Settings → My Printer** and pick your printer from the
dropdown.

This is personal — it's tied to **you**, not to the whole app. If
someone else logs in from a different computer, they need to pick
their own printer too, at their own desk.

### 10. Make Settings your own

While you're in **Settings**, go through everything and set it up the
way your business actually works — this is what makes the app feel
like *yours*, not a generic default:

- **Currency word** — e.g. "Pesos," or your own currency
- **Cents/Centavos wording** — how the smaller unit is spelled out
- **Amount style** — UK ("One Hundred And Twenty") or US ("One
  Hundred Twenty")
- **Date format** — pick how dates should look on your cheques
- **Company Name** — enter your own business name; it'll show
  throughout the app so it feels like your own system

### 11. Test print on an old, unused cheque

Never test on a real cheque you plan to use. Use a spent or void one.

**Heads up:** a small window from QZ Tray will pop up asking for
permission ("Allow this to print?"). Click **Allow**, and tick
**"Remember this decision."**

<details>
<summary>Why does it keep asking even after I tick "Remember"?</summary>

This is expected, not a bug: fully silent printing (where it never
asks again, ever) is a paid QZ Tray feature. This app uses QZ Tray's
free, self-signed certificate option instead, which is why the prompt
reappears from time to time. Just click Allow each time it shows up —
it only takes a second, and your cheque still prints normally either
way.

</details>

### 12. Adjust if needed

If the print isn't perfectly centered, go back to **Printers → Edit &
calibrate** and nudge it with the arrow buttons. Print again. Repeat
until it looks right.

### 13. You're ready

Once a test print looks correct, you're good to start writing real
cheques.

### 14. Add your Payees (optional, but saves time)

Go to **Payees** and add the people/companies you write cheques to
often, so you don't retype them every time.

**Writing a cash cheque?** Just type `CASH` as the payee when writing
a new cheque — there's no special "cash mode," it's simply a name like
any other.

### 15. Add other Users (if more than one person will use this)

Only an **Admin** can add new users — this keeps things secure. Go to
**Users → Add User**, set a temporary password, and hand it to them.
They'll be asked to set their own password the first time they log in.

### 16. Every new user must set up their own printer

Just like Step 9 — **each person** who uses this app needs to:
1. Install QZ Tray on their own computer (Client Side, Step 0)
2. Go to their own **Settings → My Printer**, at their own desk, and
   choose the printer that's actually connected to *their* computer

The app remembers this separately for every person, because printers
are usually only plugged into one specific computer.

---

That's it. Once every step above is done once, day-to-day use is just:
open the app, write a cheque, print.
