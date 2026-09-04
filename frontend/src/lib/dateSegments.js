/**
 * Client-side mirror of the server's segmented-date maths (lib/dateFormats.js).
 * Used for live labelling and the box-count warning; the server remains the
 * authority and refuses to save a mismatch.
 */

const PADDED_DIGIT_TOKENS = { YYYY: 4, YY: 2, MM: 2, DD: 2 };

// The full token list, longest-first — must stay in step with the server's
// TOKEN_ORDER. Matching only the padded tokens would read "MMMM" as two "MM"s
// and treat a month-name format as eight digits.
const TOKEN_ORDER = ['MMMM', 'MMMc', 'MMM', 'MM', 'M', 'DD', 'D', 'YYYY', 'YY'];

/** 'MM-DD-YYYY' -> [{token:'MM',size:2},{token:'DD',size:2},{token:'YYYY',size:4}] */
export function digitGroups(pattern) {
  if (!pattern) return null;
  const groups = [];
  let i = 0;

  while (i < pattern.length) {
    const token = TOKEN_ORDER.find((t) => pattern.startsWith(t, i));
    if (token) {
      const size = PADDED_DIGIT_TOKENS[token];
      if (!size) return null; // month name, or an unpadded M / D
      groups.push({ token, size });
      i += token.length;
    } else if (/[-/.\s,]/.test(pattern[i])) {
      i += 1; // separator: pre-printed on the stock, never drawn
    } else {
      return null; // unpadded M/D or a month name — cannot be segmented
    }
  }
  return groups.length ? groups : null;
}

export function digitCount(pattern) {
  const groups = digitGroups(pattern);
  return groups ? groups.reduce((sum, g) => sum + g.size, 0) : 0;
}

/**
 * One entry per box: which group it belongs to and which character of the
 * token it is — so the editor can label and colour them M M / D D / Y Y Y Y.
 */
export function boxLabels(pattern) {
  const groups = digitGroups(pattern) || [];
  const out = [];
  groups.forEach((group, groupIndex) => {
    for (let i = 0; i < group.size; i += 1) {
      out.push({
        token: group.token,
        groupIndex,
        char: group.token[0], // M, D or Y
        first: i === 0,
        last: i === group.size - 1,
      });
    }
  });
  return out;
}

/** Sample digits for the canvas preview: '09052025' for MM-DD-YYYY. */
export function sampleDigits(pattern, date = { year: 2025, month: 9, day: 5 }) {
  const groups = digitGroups(pattern) || [];
  return groups
    .map(({ token }) => {
      if (token === 'YYYY') return String(date.year).padStart(4, '0');
      if (token === 'YY') return String(date.year % 100).padStart(2, '0');
      if (token === 'MM') return String(date.month).padStart(2, '0');
      return String(date.day).padStart(2, '0');
    })
    .join('');
}

/** Even row of boxes, wider gap between groups. Mirrors buildSegmentBoxes. */
export function buildSegmentBoxes(pattern, options = {}) {
  const groups = digitGroups(pattern);
  if (!groups) return [];

  const {
    x = 120, y = 10, boxWidth = 4.5, boxHeight = 6, gap = 0.8, groupGap = 3.2,
  } = options;

  const boxes = [];
  let cursor = x;

  groups.forEach((group, groupIndex) => {
    for (let i = 0; i < group.size; i += 1) {
      boxes.push({
        x: Math.round(cursor * 100) / 100,
        y,
        width: boxWidth,
        height: boxHeight,
      });
      cursor += boxWidth + (i === group.size - 1 ? 0 : gap);
    }
    if (groupIndex < groups.length - 1) cursor += groupGap;
  });

  return boxes;
}
