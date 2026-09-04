/**
 * Crop / straighten helpers for the reference scan.
 *
 * Deliberately client-side canvas work. The alternative — resizing on the
 * server — means a native image library (sharp), which is exactly the kind of
 * per-architecture binary that breaks a build inside an unprivileged container.
 * The browser already has everything needed, and the server keeps receiving a
 * plain JPEG it validates the same way as before.
 */

/** Size of the bounding box an image occupies once rotated by `deg`. */
export function rotatedBounds(width, height, deg) {
  const rad = (deg * Math.PI) / 180;
  const sin = Math.abs(Math.sin(rad));
  const cos = Math.abs(Math.cos(rad));
  return {
    width: Math.round(width * cos + height * sin),
    height: Math.round(width * sin + height * cos),
  };
}

/** Draw `img` rotated about its centre onto a canvas of the rotated bounds. */
export function renderRotated(img, deg, scale = 1) {
  const bounds = rotatedBounds(img.naturalWidth, img.naturalHeight, deg);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bounds.width * scale));
  canvas.height = Math.max(1, Math.round(bounds.height * scale));

  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate((deg * Math.PI) / 180);
  ctx.drawImage(
    img,
    (-img.naturalWidth * scale) / 2,
    (-img.naturalHeight * scale) / 2,
    img.naturalWidth * scale,
    img.naturalHeight * scale,
  );
  return canvas;
}

/**
 * First guess at where the cheque sits, by looking for where the page stops
 * looking like its own border.
 *
 * Intentionally crude: it samples a downscaled copy, takes the median border
 * colour as "background", and walks in from each edge until a row or column
 * contains enough pixels that differ from it. Good enough to save the user most
 * of the dragging; never good enough to trust without them looking at it, which
 * is why the result is only ever an initial box they can move.
 *
 * @returns {{x:number,y:number,width:number,height:number}} fractions 0..1
 */
export function guessContentBox(canvas) {
  const SAMPLE = 240;
  const w = Math.max(1, Math.min(SAMPLE, canvas.width));
  const h = Math.max(1, Math.round((canvas.height / canvas.width) * w));

  const small = document.createElement('canvas');
  small.width = w;
  small.height = h;
  const ctx = small.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(canvas, 0, 0, w, h);

  let data;
  try {
    data = ctx.getImageData(0, 0, w, h).data;
  } catch {
    return { x: 0, y: 0, width: 1, height: 1 };
  }

  const lum = (i) => 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];

  // Background = median luminance of the outermost ring.
  const border = [];
  for (let x = 0; x < w; x += 1) {
    border.push(lum((0 * w + x) * 4), lum(((h - 1) * w + x) * 4));
  }
  for (let y = 0; y < h; y += 1) {
    border.push(lum((y * w + 0) * 4), lum((y * w + (w - 1)) * 4));
  }
  border.sort((a, b) => a - b);
  const background = border[Math.floor(border.length / 2)];

  const DIFF = 26;      // how different a pixel must be to count as content
  const COVERAGE = 0.04; // and how much of a line must qualify

  const rowHasContent = (y) => {
    let n = 0;
    for (let x = 0; x < w; x += 1) {
      if (Math.abs(lum((y * w + x) * 4) - background) > DIFF) n += 1;
    }
    return n / w > COVERAGE;
  };
  const colHasContent = (x) => {
    let n = 0;
    for (let y = 0; y < h; y += 1) {
      if (Math.abs(lum((y * w + x) * 4) - background) > DIFF) n += 1;
    }
    return n / h > COVERAGE;
  };

  let top = 0;
  while (top < h - 1 && !rowHasContent(top)) top += 1;
  let bottom = h - 1;
  while (bottom > top && !rowHasContent(bottom)) bottom -= 1;
  let left = 0;
  while (left < w - 1 && !colHasContent(left)) left += 1;
  let right = w - 1;
  while (right > left && !colHasContent(right)) right -= 1;

  // Nothing convincing found — offer the whole image rather than a sliver.
  if (right - left < w * 0.2 || bottom - top < h * 0.2) {
    return { x: 0, y: 0, width: 1, height: 1 };
  }

  return {
    x: left / w,
    y: top / h,
    width: (right - left + 1) / w,
    height: (bottom - top + 1) / h,
  };
}

/**
 * Produce the final image: source rotated, then cropped to `box` (fractions of
 * the rotated bounds), at full source resolution.
 */
export function exportCropped(img, deg, box, type = 'image/jpeg', quality = 0.92) {
  const rotated = renderRotated(img, deg, 1);

  const sx = Math.round(box.x * rotated.width);
  const sy = Math.round(box.y * rotated.height);
  const sw = Math.max(1, Math.round(box.width * rotated.width));
  const sh = Math.max(1, Math.round(box.height * rotated.height));

  const out = document.createElement('canvas');
  out.width = sw;
  out.height = sh;
  out.getContext('2d').drawImage(rotated, sx, sy, sw, sh, 0, 0, sw, sh);

  return new Promise((resolve, reject) => {
    out.toBlob(
      (blob) => (blob ? resolve({ blob, width: sw, height: sh }) : reject(new Error('Could not build the cropped image'))),
      type,
      quality,
    );
  });
}

/** Pixel size the confirmed crop will produce, without doing the work. */
export function croppedPixelSize(img, deg, box) {
  const bounds = rotatedBounds(img.naturalWidth, img.naturalHeight, deg);
  return {
    width: Math.max(1, Math.round(box.width * bounds.width)),
    height: Math.max(1, Math.round(box.height * bounds.height)),
  };
}
