/**
 * Illustrative diagrams for the printer wizard, in the spirit of Chrysanth's
 * Printer options tab.
 *
 * These are pictures, not controls — nothing here is clickable and nothing
 * reads or writes state. They exist so an operator can recognise their own
 * situation at a glance instead of decoding words like "landscape".
 *
 * Drawn as inline SVG with currentColor so they inherit the theme.
 */

/**
 * A cheque going into a printer, with an arrow for the feed direction.
 *
 * The WHOLE cheque rotates — outline and printed marks together, as one group.
 * An earlier version rotated only the inner marks inside a fixed rectangle,
 * which told you nothing: the point of the picture is to show the sheet itself
 * turned the way the setting turns it.
 *
 * The sheet is drawn in a square region so a quarter turn still fits.
 */
export function FeedDirectionDiagram({ rotation = 0, size = 100 }) {
  // Sheet is 46x28 about the centre of a 56-wide square, so at 90° its long
  // edge (46) still sits inside the region.
  const CX = 60;
  const CY = 30;
  const W = 46;
  const H = 28;

  return (
    <svg
      viewBox="0 0 120 108"
      width={size}
      height={(size * 108) / 120}
      className="diagram"
      role="img"
      aria-label={`Cheque feeding into the printer, rotated ${rotation} degrees`}
    >
      {/* The entire cheque — outline and contents — turns together. */}
      <g transform={`rotate(${rotation} ${CX} ${CY})`}>
        <rect
          x={CX - W / 2} y={CY - H / 2} width={W} height={H} rx="2"
          fill="var(--surface)" stroke="currentColor" strokeWidth="1.5"
        />
        {/* A bank logo block, top-left of the cheque, so "up" is unambiguous. */}
        <rect
          x={CX - W / 2 + 3} y={CY - H / 2 + 3} width="13" height="5" rx="1"
          fill="var(--accent)" fillOpacity="0.85"
        />
        <rect
          x={CX - W / 2 + 3} y={CY - H / 2 + 12} width={W - 12} height="2.2" rx="1.1"
          fill="currentColor" opacity="0.32"
        />
        <rect
          x={CX - W / 2 + 3} y={CY - H / 2 + 18} width={W - 20} height="2.2" rx="1.1"
          fill="currentColor" opacity="0.32"
        />
      </g>

      {/* Feed arrow — fixed, because the paper path does not move. */}
      <path
        d="M60 60 L60 74 M54 68 L60 74 L66 68"
        fill="none" stroke="var(--accent)" strokeWidth="2.5"
        strokeLinecap="round" strokeLinejoin="round"
      />

      {/* Printer body */}
      <rect x="14" y="78" width="92" height="26" rx="4"
        fill="var(--surface-2)" stroke="currentColor" strokeWidth="1.5" />
      <rect x="26" y="84" width="68" height="4.5" rx="2.25"
        fill="currentColor" opacity="0.22" />
      <circle cx="96" cy="97" r="3" fill="var(--accent)" />
    </svg>
  );
}

/** Two rectangles distinguishing portrait from landscape. */
export function OrientationDiagram({ orientation = 'landscape', size = 74 }) {
  const portrait = orientation === 'portrait';
  const w = portrait ? 34 : 56;
  const h = portrait ? 56 : 34;
  const x = (74 - w) / 2;
  const y = (62 - h) / 2;

  return (
    <svg
      viewBox="0 0 74 62"
      width={size}
      height={(size * 62) / 74}
      className="diagram"
      role="img"
      aria-label={`${portrait ? 'Portrait' : 'Landscape'} page`}
    >
      <rect x={x} y={y} width={w} height={h} rx="2"
        fill="var(--surface)" stroke="currentColor" strokeWidth="1.5" />
      <rect x={x + 5} y={y + 6} width={w * 0.45} height="3" rx="1.5"
        fill="currentColor" opacity="0.5" />
      <rect x={x + 5} y={y + 14} width={w - 10} height="2.5" rx="1.25"
        fill="currentColor" opacity="0.28" />
      <rect x={x + 5} y={y + 20} width={w - 18} height="2.5" rx="1.25"
        fill="currentColor" opacity="0.28" />
    </svg>
  );
}

/** Where the cheque sits across the tray. */
export function FeedPathDiagram({ path = 'center', size = 74 }) {
  const trayX = 6;
  const trayW = 62;
  const chequeW = 26;
  const x =
    path === 'left' ? trayX + 2
      : path === 'right' ? trayX + trayW - chequeW - 2
        : trayX + (trayW - chequeW) / 2;

  return (
    <svg
      viewBox="0 0 74 44"
      width={size}
      height={(size * 44) / 74}
      className="diagram"
      role="img"
      aria-label={`Cheque loaded at the ${path} of the tray`}
    >
      <rect x={trayX} y="8" width={trayW} height="28" rx="3"
        fill="var(--surface-2)" stroke="currentColor" strokeWidth="1.2"
        strokeDasharray="3 2" />
      <rect x={x} y="12" width={chequeW} height="20" rx="1.5"
        fill="var(--surface)" stroke="var(--accent)" strokeWidth="1.8" />
      <rect x={x + 3} y="16" width={chequeW - 12} height="2.5" rx="1.25"
        fill="var(--accent)" opacity="0.55" />
      <rect x={x + 3} y="22" width={chequeW - 6} height="2" rx="1"
        fill="currentColor" opacity="0.28" />
    </svg>
  );
}
