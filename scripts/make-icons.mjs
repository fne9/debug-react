import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const outDir = join(fileURLToPath(new URL("..", import.meta.url)), "public", "icons");
mkdirSync(outDir, { recursive: true });

const CRC_TABLE = new Int32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});

function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const out = Buffer.alloc(8 + data.length + 4);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, "ascii");
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

function encodePng(rgba, width, height) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;

  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0;
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const BG_TOP = [27, 43, 74];
const BG_BOTTOM = [11, 18, 33];
const ATOM = [97, 218, 251];
const DOT = [245, 158, 11];

const ORBIT_A = 0.74;
const ORBIT_B = 0.3;
const ORBIT_W = 0.048;
const NUCLEUS_R = 0.15;
const NUCLEUS_RING = 0.06;
const DOT_CENTER = [0.56, 0.56];
const DOT_R = 0.21;
const DOT_RING = 0.07;

function samplePixel(nx, ny) {

  const r = 0.22;
  const qx = Math.max(Math.abs(nx) - (1 - r), 0);
  const qy = Math.max(Math.abs(ny) - (1 - r), 0);
  if (Math.hypot(qx, qy) > r) return [0, 0, 0, 0];

  const t = (ny + 1) / 2;
  let color = [
    BG_TOP[0] + (BG_BOTTOM[0] - BG_TOP[0]) * t,
    BG_TOP[1] + (BG_BOTTOM[1] - BG_TOP[1]) * t,
    BG_TOP[2] + (BG_BOTTOM[2] - BG_TOP[2]) * t,
  ];

  for (const deg of [0, 60, 120]) {
    const a = (deg * Math.PI) / 180;
    const x = nx * Math.cos(a) + ny * Math.sin(a);
    const y = -nx * Math.sin(a) + ny * Math.cos(a);
    const g = Math.hypot(x / ORBIT_A, y / ORBIT_B);
    if (Math.abs(g - 1) * ORBIT_B < ORBIT_W) color = [...ATOM];
  }

  const dNucleus = Math.hypot(nx, ny);
  if (dNucleus < NUCLEUS_R + NUCLEUS_RING) color = [...BG_BOTTOM];
  if (dNucleus < NUCLEUS_R) color = [...ATOM];

  const dDot = Math.hypot(nx - DOT_CENTER[0], ny - DOT_CENTER[1]);
  if (dDot < DOT_R + DOT_RING) color = [...BG_BOTTOM];
  if (dDot < DOT_R) color = [...DOT];

  return [color[0], color[1], color[2], 255];
}

function renderIcon(size) {
  const SS = 4;
  const rgba = Buffer.alloc(size * size * 4);
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const nx = ((px + (sx + 0.5) / SS) / size) * 2 - 1;
          const ny = ((py + (sy + 0.5) / SS) / size) * 2 - 1;
          const [cr, cg, cb, ca] = samplePixel(nx, ny);
          r += cr * (ca / 255);
          g += cg * (ca / 255);
          b += cb * (ca / 255);
          a += ca;
        }
      }
      const n = SS * SS;
      const alpha = a / n;
      const i = (py * size + px) * 4;

      rgba[i] = alpha > 0 ? Math.min(255, Math.round((r / n) / (alpha / 255))) : 0;
      rgba[i + 1] = alpha > 0 ? Math.min(255, Math.round((g / n) / (alpha / 255))) : 0;
      rgba[i + 2] = alpha > 0 ? Math.min(255, Math.round((b / n) / (alpha / 255))) : 0;
      rgba[i + 3] = Math.round(alpha);
    }
  }
  return encodePng(rgba, size, size);
}

for (const size of [16, 32, 48, 128]) {
  const file = join(outDir, `icon${size}.png`);
  writeFileSync(file, renderIcon(size));
  console.log(`gerado: ${file}`);
}
