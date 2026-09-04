/**
 * QZ Tray integration — direct printing to a named printer, bypassing the
 * browser's print dialog.
 *
 * SECURITY: the private signing key lives on the server and never reaches this
 * file. Both promises below are network calls — one fetches the PUBLIC
 * certificate, the other posts a string and receives a signature. There is no
 * key material in the bundle.
 *
 * QZ Tray is optional. Everything here degrades to `available: false` when the
 * local agent is not installed or not running, and the caller falls back to the
 * existing browser PDF path.
 */

import qz from 'qz-tray';
import { sha256 } from 'js-sha256';

let configured = false;

/** Wire the security promises exactly once per page load. */
function configure() {
  if (configured) return;

  qz.api.setPromiseType((resolver) => new Promise(resolver));
  // qz-tray hashes the request internally during signing and needs a
  // synchronous digest; Web Crypto is async, hence the bundled implementation.
  qz.api.setSha256Type((data) => sha256(data));

  // Must match the server: node's RSA-SHA512.
  qz.security.setSignatureAlgorithm('SHA512');

  qz.security.setCertificatePromise((resolve, reject) => {
    fetch('/api/qz/certificate', { credentials: 'same-origin' })
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error('Could not fetch certificate'))))
      .then(resolve)
      .catch(reject);
  });

  qz.security.setSignaturePromise((toSign) => (resolve, reject) => {
    fetch('/api/qz/sign', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ request: toSign }),
    })
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error('Signing failed'))))
      .then(resolve)
      .catch(reject);
  });

  configured = true;
}

export const isConnected = () => {
  try { return qz.websocket.isActive(); } catch { return false; }
};

/**
 * Connect to the local agent. Fails fast — a machine without QZ Tray must not
 * make the operator wait before the fallback kicks in.
 */
export async function connect({ retries = 0, delay = 0 } = {}) {
  configure();
  if (isConnected()) return true;
  await qz.websocket.connect({ retries, delay });
  return true;
}

export async function disconnect() {
  if (isConnected()) await qz.websocket.disconnect();
}

/** Printer names as the operating system reports them. */
export async function listPrinters() {
  await connect();
  const found = await qz.printers.find();
  return Array.isArray(found) ? found : [found].filter(Boolean);
}

/**
 * Identifying details of the machine QZ Tray is running on. Returns IP and MAC
 * only — QZ does not report a hostname — so it is a hint for naming a
 * workstation, never the label itself.
 */
export async function networkInfo() {
  await connect();
  try { return await qz.websocket.getNetworkInfo(); } catch { return null; }
}

export async function defaultPrinter() {
  await connect();
  try { return await qz.printers.getDefault(); } catch { return null; }
}

/** Blob -> bare base64 (no data: prefix), which is what QZ expects. */
export function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read the PDF'));
    reader.onload = () => {
      const result = String(reader.result);
      resolve(result.slice(result.indexOf(',') + 1));
    };
    reader.readAsDataURL(blob);
  });
}

/**
 * Send a PDF straight to a printer.
 *
 * Every print parameter comes from the Printer Profile the server already
 * resolved. `scaleContent: false` is the whole point: scaling is exactly what
 * puts a cheque's fields off their pre-printed boxes, and it is the same thing
 * /PrintScaling /None asks a manual print dialog for.
 *
 * ROTATION IS DELIBERATELY NOT PASSED TO QZ.
 *
 * The PDF already carries its own /Rotate attribute, set from the printer
 * profile and proven correct in isolation. Sending `rotation` here as well
 * applied it a second time: a 90° profile came out effectively rotated twice,
 * clipping content off the top and left edges (the date vanished entirely,
 * "CASH" printed as "ASH") and displacing the amount-in-words vertically.
 * /Rotate is the single source of rotation; this function only uses the angle
 * to describe the resulting paper.
 *
 * @param {object}  opts
 * @param {string}  opts.printerName  OS printer name from listPrinters()
 * @param {string}  opts.base64       the PDF
 * @param {number}  opts.pageWidthMm  the PDF's MediaBox width
 * @param {number}  opts.pageHeightMm the PDF's MediaBox height
 * @param {number}  [opts.rotation]   0|90|180|270 — sizing only, never sent
 * @param {string}  [opts.jobName]
 */
export async function printPdf({
  printerName,
  base64,
  pageWidthMm,
  pageHeightMm,
  rotation = 0,
  jobName = 'Cheque',
}) {
  if (!printerName) throw new Error('No printer selected');
  await connect();

  // People are tied to a desk and a printer. If the saved name is not on this
  // machine, that is a real misconfiguration — say so plainly rather than
  // guessing at another device and printing a cheque somewhere unexpected.
  const available = await listPrinters();
  if (!available.includes(printerName)) {
    throw new Error(
      `“${printerName}” was not found on this computer. ` +
        `Printers here: ${available.join(', ') || 'none'}. ` +
        'Update your printer in Settings.',
    );
  }

  // A page with /Rotate 90 or 270 comes out of the printer with its long edge
  // the other way round, so the paper we declare has to match what is actually
  // produced — otherwise the driver clips the overhang, which looks exactly
  // like a positioning bug.
  const quarterTurned = rotation === 90 || rotation === 270;
  const size = quarterTurned
    ? { width: pageHeightMm, height: pageWidthMm }
    : { width: pageWidthMm, height: pageHeightMm };

  const config = qz.configs.create(printerName, {
    jobName,
    units: 'mm',
    size,
    margins: 0,
    // NEVER let the spooler resize the page.
    scaleContent: false,
    // Keep it vector; rasterising would resample the text.
    rasterize: false,
    interpolation: 'nearest-neighbor',
  });

  await qz.print(config, [
    { type: 'pixel', format: 'pdf', flavor: 'base64', data: base64 },
  ]);
}

/**
 * Is the agent reachable at all? Used to decide whether to offer direct
 * printing. Never throws.
 */
export async function probe() {
  try {
    await connect();
    return { available: true };
  } catch (err) {
    return { available: false, reason: err?.message || 'QZ Tray is not running' };
  }
}
