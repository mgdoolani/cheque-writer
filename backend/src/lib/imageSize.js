/**
 * Pixel dimensions of a PNG or JPEG, read straight from the file header.
 *
 * Deliberately not `sharp`: that pulls a large native binary that has to
 * compile or download per-architecture, which is exactly the sort of thing that
 * breaks a build inside an unprivileged container. All we need is width and
 * height so we can check the reference image is detailed enough to trace over.
 */

import fs from 'node:fs';

function pngSize(buf) {
  // 8-byte signature, then IHDR: length(4) type(4) width(4) height(4)
  if (buf.length < 24) return null;
  if (buf.toString('ascii', 12, 16) !== 'IHDR') return null;
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

function jpegSize(buf) {
  let offset = 2; // skip SOI

  while (offset + 9 < buf.length) {
    if (buf[offset] !== 0xff) {
      offset += 1; // resync past padding
      continue;
    }
    const marker = buf[offset + 1];

    // SOF0..SOF15, excluding DHT(c4), JPGA(c8) and DAC(cc) which share the range.
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      return { height: buf.readUInt16BE(offset + 5), width: buf.readUInt16BE(offset + 7) };
    }

    const segmentLength = buf.readUInt16BE(offset + 2);
    if (segmentLength < 2) return null;
    offset += 2 + segmentLength;
  }
  return null;
}

/** @returns {{width:number,height:number}|null} */
export function imageSize(filePath) {
  let fd;
  try {
    fd = fs.openSync(filePath, 'r');
    const buf = Buffer.alloc(64 * 1024);
    const read = fs.readSync(fd, buf, 0, buf.length, 0);
    const header = buf.subarray(0, read);

    if (header.length > 8 && header.readUInt32BE(0) === 0x89504e47) return pngSize(header);
    if (header.length > 4 && header[0] === 0xff && header[1] === 0xd8) return jpegSize(header);
    return null;
  } catch {
    return null;
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}
