import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const sizes = [16, 32, 48, 128];
mkdirSync("icons", { recursive: true });

for (const size of sizes) {
  writeFileSync(join("icons", `icon-${size}.png`), createIcon(size));
}

function createIcon(size) {
  const rgba = Buffer.alloc(size * size * 4);
  const radius = Math.max(3, Math.round(size * 0.18));
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const inside = roundedRect(x, y, size, radius);
      if (!inside) {
        rgba[i + 3] = 0;
        continue;
      }
      const stripe = Math.floor((x + y) / Math.max(3, Math.round(size / 7))) % 2 === 0;
      const color = stripe ? [47, 111, 100] : [20, 32, 29];
      rgba[i] = color[0];
      rgba[i + 1] = color[1];
      rgba[i + 2] = color[2];
      rgba[i + 3] = 255;
    }
  }

  drawLetter(rgba, size, "Z", Math.round(size * 0.2), Math.round(size * 0.22), Math.round(size * 0.28));
  drawLetter(rgba, size, "T", Math.round(size * 0.52), Math.round(size * 0.22), Math.round(size * 0.28));
  return encodePng(size, size, rgba);
}

function roundedRect(x, y, size, radius) {
  const max = size - 1;
  const cx = x < radius ? radius : x > max - radius ? max - radius : x;
  const cy = y < radius ? radius : y > max - radius ? max - radius : y;
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy <= radius * radius;
}

function drawLetter(rgba, size, letter, x, y, unit) {
  const stroke = Math.max(1, Math.round(unit * 0.18));
  const height = Math.round(unit * 1.8);
  const width = Math.round(unit * 1.05);
  const white = [244, 246, 242, 255];
  if (letter === "Z") {
    fillRect(rgba, size, x, y, width, stroke, white);
    fillRect(rgba, size, x, y + height - stroke, width, stroke, white);
    for (let i = 0; i < height; i++) {
      const px = x + width - Math.round((i / height) * width) - stroke;
      fillRect(rgba, size, px, y + i, stroke + 1, stroke, white);
    }
  } else {
    fillRect(rgba, size, x, y, width, stroke, white);
    fillRect(rgba, size, x + Math.round(width / 2) - Math.round(stroke / 2), y, stroke, height, white);
  }
}

function fillRect(rgba, size, x, y, w, h, color) {
  for (let yy = y; yy < y + h; yy++) {
    for (let xx = x; xx < x + w; xx++) {
      if (xx < 0 || yy < 0 || xx >= size || yy >= size) {
        continue;
      }
      const i = (yy * size + xx) * 4;
      rgba[i] = color[0];
      rgba[i + 1] = color[1];
      rgba[i + 2] = color[2];
      rgba[i + 3] = color[3];
    }
  }
}

function encodePng(width, height, rgba) {
  const scanlines = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    const rowStart = y * (width * 4 + 1);
    scanlines[rowStart] = 0;
    rgba.copy(scanlines, rowStart + 1, y * width * 4, (y + 1) * width * 4);
  }

  const chunks = [
    chunk("IHDR", Buffer.concat([u32(width), u32(height), Buffer.from([8, 6, 0, 0, 0])])),
    chunk("IDAT", deflateSync(scanlines)),
    chunk("IEND", Buffer.alloc(0))
  ];
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), ...chunks]);
}

function chunk(type, data) {
  const typeBuffer = Buffer.from(type);
  return Buffer.concat([u32(data.length), typeBuffer, data, u32(crc32(Buffer.concat([typeBuffer, data])))]);
}

function u32(value) {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32BE(value >>> 0);
  return buffer;
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) {
      crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}
