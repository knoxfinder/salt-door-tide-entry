import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';

const WIDTH = 1024;
const HEIGHT = 1024;

type RGB = [number, number, number];

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const mix = (a: RGB, b: RGB, t: number): RGB => [
  lerp(a[0], b[0], t),
  lerp(a[1], b[1], t),
  lerp(a[2], b[2], t),
];
const smoothstep = (edge0: number, edge1: number, x: number) => {
  const t = clamp01((x - edge0) / (edge1 - edge0 || 1));
  return t * t * (3 - 2 * t);
};

function hash2(x: number, y: number): number {
  let n = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263);
  n = (n ^ (n >>> 13)) >>> 0;
  n = Math.imul(n, 1274126177) >>> 0;
  return (n ^ (n >>> 16)) / 4294967296;
}

function valueNoise(x: number, y: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi);
  const b = hash2(xi + 1, yi);
  const c = hash2(xi, yi + 1);
  const d = hash2(xi + 1, yi + 1);
  return lerp(lerp(a, b, u), lerp(c, d, u), v);
}

function fbm(x: number, y: number, octaves: number): number {
  let value = 0;
  let amplitude = 0.5;
  let frequency = 1;
  let sum = 0;
  for (let i = 0; i < octaves; i++) {
    value += amplitude * valueNoise(x * frequency, y * frequency);
    sum += amplitude;
    amplitude *= 0.5;
    frequency *= 2.03;
  }
  return value / sum;
}

function crcTable(): Uint32Array {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
}

const CRC = crcTable();

function crc32(buf: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(8 + data.length + 4);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  const crcInput = new Uint8Array(4 + data.length);
  for (let i = 0; i < 4; i++) crcInput[i] = type.charCodeAt(i);
  crcInput.set(data, 4);
  view.setUint32(8 + data.length, crc32(crcInput));
  return out;
}

function encodePNG(width: number, height: number, rgba: Uint8Array): Uint8Array {
  const stride = width * 4;
  const raw = new Uint8Array(height * (1 + stride));
  for (let y = 0; y < height; y++) {
    raw[y * (1 + stride)] = 0;
    raw.set(rgba.subarray(y * stride, (y + 1) * stride), y * (1 + stride) + 1);
  }
  const ihdr = new Uint8Array(13);
  const idv = new DataView(ihdr.buffer);
  idv.setUint32(0, width);
  idv.setUint32(4, height);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const idat = deflateSync(raw, { level: 9 });
  const signature = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdrChunk = chunk('IHDR', ihdr);
  const idatChunk = chunk('IDAT', idat);
  const iendChunk = chunk('IEND', new Uint8Array(0));
  const png = new Uint8Array(signature.length + ihdrChunk.length + idatChunk.length + iendChunk.length);
  let offset = 0;
  for (const part of [signature, ihdrChunk, idatChunk, iendChunk]) {
    png.set(part, offset);
    offset += part.length;
  }
  return png;
}

function baseColor(x: number, y: number, nx: number, ny: number): RGB {
  const horizon = 0.7;
  if (ny < horizon) {
    const t = ny / horizon;
    let sky = mix([250, 252, 251], [205, 230, 236], Math.pow(t, 0.82));
    sky = mix(sky, [252, 252, 248], (1 - smoothstep(0, 0.45, ny)) * 0.28);
    const cloudA = fbm(nx * 3.1 + 7.4, ny * 2.3 - 1.6, 4);
    const cloudB = fbm(nx * 5.2 - 3.1, ny * 3.8 + 5.2, 3);
    const cloud = smoothstep(0.52, 0.84, cloudA) * 0.16 + smoothstep(0.62, 0.9, cloudB) * 0.08;
    return mix(sky, [246, 250, 249], cloud * (1 - t));
  }
  const t = (ny - horizon) / (1 - horizon);
  let flat = mix([236, 241, 237], [250, 248, 243], Math.pow(t, 0.75));
  const salt = fbm(nx * 12.2 + 1.7, ny * 18.5 - 3.1, 5);
  const plates = fbm(nx * 4.8 + 19.4, ny * 7.4 + 2.8, 3);
  const cracks = Math.abs(fbm(nx * 48, ny * 36, 4) - 0.5);
  flat = mix(flat, [214, 220, 216], salt * 0.18);
  flat = mix(flat, [205, 212, 208], smoothstep(0.56, 0.8, plates) * 0.1);
  flat = mix(flat, [185, 194, 191], smoothstep(0.42, 0.49, cracks) * 0.18);
  const horizonMist = Math.exp(-((ny - horizon) * (ny - horizon)) / 0.0018);
  return mix(flat, [244, 248, 247], horizonMist * 0.45);
}

function drawOceanRing(
  col: RGB,
  x: number,
  y: number,
  nx: number,
  ny: number,
  cx: number,
  cy: number,
  ringR: number,
  ringT: number
): RGB {
  let out = col;
  const dx = x - cx;
  const dy = (y - cy) * 1.05;
  const ang = Math.atan2(dy, dx);
  const rad = Math.hypot(dx, dy);
  const coil = ang * 4.4 + rad * 0.033 - 1.2;
  const flowA = fbm(Math.cos(coil) * 2.7 + 4.3, Math.sin(coil) * 2.7 - 1.4, 5);
  const flowB = fbm(rad * 0.036 + 6.8, ang * 2.2 - 2.1, 4);
  const flowC = fbm(nx * 7.5 + ang * 0.8, ny * 7.5 - rad * 0.012, 3);

  const columnWidth = 74 + 58 * (1 - smoothstep(cy - 40, cy + 350, y));
  const columnOffset = Math.sin((y - cy) * 0.036) * 20;
  const dColumn = Math.abs(dx + columnOffset);
  const columnMask =
    (1 - smoothstep(columnWidth, columnWidth + 28, dColumn)) *
    smoothstep(cy + 360, cy + 10, y) *
    smoothstep(cy - 140, cy - 10, y);
  if (columnMask > 0) {
    const cTex = fbm(nx * 8.5 + 2.4, ny * 13.2 - 2.8, 4);
    let water = mix([0, 84, 128], [0, 188, 202], cTex);
    water = mix(water, [150, 250, 246], smoothstep(0.5, 0.92, flowC) * 0.55);
    water = mix(water, [255, 220, 130], smoothstep(0.7, 0.96, cTex) * 0.2);
    out = mix(out, water, columnMask * 0.58);
  }

  const dRing = Math.abs(rad - ringR);
  const ringMask = 1 - smoothstep(ringT, ringT + 24, dRing);
  if (ringMask > 0) {
    const deep: RGB = [0, 54, 98];
    const teal: RGB = [0, 154, 176];
    const cyan: RGB = [98, 244, 248];
    const foam: RGB = [242, 255, 252];
    const gold: RGB = [255, 208, 96];
    const ember: RGB = [255, 118, 88];
    let sea = mix(deep, teal, clamp01(flowA * 0.85 + flowC * 0.3));
    sea = mix(sea, cyan, smoothstep(0.3, 0.8, flowB));
    const crest = smoothstep(0.54, 0.92, flowA * 0.55 + flowB * 0.55);
    const filament = smoothstep(0.66, 0.98, Math.abs(Math.sin(coil * 2.3 + flowA * 1.6)));
    sea = mix(sea, foam, crest * 0.62 + filament * 0.2);
    const inner = smoothstep(ringT, 0, dRing);
    const outer = smoothstep(ringT, ringT - 20, dRing);
    sea = mix(sea, gold, clamp01(inner * 0.55 + crest * 0.22));
    sea = mix(sea, cyan, outer * 0.22);
    sea = mix(sea, ember, smoothstep(0.84, 1, flowA) * 0.1);
    sea = mix(sea, [220, 255, 252], Math.exp((-dRing * dRing) / 440) * 0.45);
    out = mix(out, sea, ringMask);
  }

  const outerBloom = smoothstep(ringT + 100, ringT - 8, dRing);
  const sprayNoise = fbm(nx * 19 + ang * 0.85, ny * 23 - 3.4, 4);
  const upward = clamp01((cy + 80 - y) / 380);
  const sprayMask = outerBloom * upward * smoothstep(0.46, 0.88, sprayNoise) * 0.72;
  out = mix(out, [118, 248, 242], sprayMask);
  out = mix(out, [255, 238, 156], sprayMask * smoothstep(0.68, 0.96, sprayNoise) * 0.5);
  if (upward > 0.12 && outerBloom > 0.28 && hash2(x + 23, y * 3 + 7) > 0.9985) {
    out = mix(out, [240, 255, 253], 0.75);
  }

  const coreDist = Math.hypot(dx / 1.1, dy / 0.92);
  const core = Math.exp((-coreDist * coreDist) / 15500) * smoothstep(ringR - 24, 24, rad);
  const beam = Math.exp((-dx * dx) / 1500) * clamp01((cy + 170 - y) / 540);
  out = mix(out, [42, 224, 228], core * 0.44);
  out = mix(out, [226, 255, 251], core * 0.24 + beam * 0.24);
  out = mix(out, [255, 216, 112], beam * 0.09);
  return out;
}

function drawFragments(col: RGB, x: number, y: number, cx: number, cy: number): RGB {
  let out = col;
  for (let k = 0; k < 16; k++) {
    const angle = -1.45 + k * 0.31 + ((k * 5) % 7) * 0.03;
    const radius = 90 + ((k * 37) % 205);
    const lift = ((k % 5) * 9 + k * 4);
    const fx = cx + Math.cos(angle) * radius * (0.8 + (k % 3) * 0.16);
    const fy = cy - 28 + Math.sin(angle) * radius * 0.48 - lift;
    const fw = 11 + ((k * 13) % 34);
    const fh = 8 + ((k * 17) % 28);
    const px = x - fx;
    const py = y - fy;
    const rot = ((k % 7) - 3) * 0.15;
    const rx = px * Math.cos(rot) - py * Math.sin(rot);
    const ry = px * Math.sin(rot) + py * Math.cos(rot);
    if (Math.abs(rx) >= fw || Math.abs(ry) >= fh) continue;
    const edge = Math.min(fw - Math.abs(rx), fh - Math.abs(ry));
    const face = clamp01(edge / 2.6);
    const lit = 0.38 + 0.62 * clamp01(0.7 - rx / (fw * 1.8) - ry / (fh * 2.8));
    let frag = mix([34, 50, 66], [182, 212, 220], lit);
    if (k % 4 === 0) frag = mix(frag, [255, 126, 98], 0.08);
    const wx = rx + fw;
    const wy = ry + fh;
    const cellW = 5.4;
    const cellH = 4.4;
    const onWindow =
      Math.abs((wx % cellW) - cellW / 2) > 1.3 && Math.abs((wy % cellH) - cellH / 2) > 1.0;
    if (onWindow && ((Math.floor(wx / cellW) + Math.floor(wy / cellH) + k) % 4) !== 0) {
      const warm = (k + Math.floor(wx)) % 3 === 0;
      frag = mix(frag, warm ? [255, 218, 122] : [132, 246, 242], 0.88);
    }
    out = mix(out, frag, face * 0.95);
    out = mix(out, [165, 250, 245], (1 - face) * 0.22);
  }
  return out;
}

function drawDoorScene(col: RGB, x: number, y: number): RGB {
  let out = col;
  const doorX = 465;
  const doorY = 773;
  const doorW = 34;
  const doorH = 68;
  const towerX = 456;
  const towerY = doorY - 12;
  const towerW = doorW + 18;
  const towerH = doorH + 30;

  if (x >= towerX && x < towerX + towerW && y >= towerY && y < towerY + towerH) {
    const tx = x - towerX;
    const ty = y - towerY;
    const edge = tx < 2 || tx >= towerW - 2 || ty < 2 || ty >= towerH - 2;
    out = mix(out, edge ? [162, 166, 164] : [228, 232, 229], edge ? 0.85 : 0.62);
  }
  if (x >= towerX - 2 && x < towerX + towerW + 2 && y >= towerY - 4 && y < towerY) {
    out = mix(out, [210, 36, 44], 0.94);
  }
  if (x >= towerX - 1 && x < towerX + towerW + 1 && y === towerY - 4) {
    out = mix(out, [255, 210, 120], 0.3);
  }

  const inDoorX = x >= doorX && x <= doorX + doorW;
  const inDoorY = y >= doorY && y <= doorY + doorH;
  if (inDoorX && inDoorY) {
    const lx = x - doorX;
    const ly = y - doorY;
    const border = lx < 2 || lx > doorW - 2 || ly < 2 || ly > doorH - 2;
    const gap = Math.abs(lx - doorW / 2);
    const openW = 5.6 + (1 - ly / doorH) * 1.9;
    if (border) {
      out = [102, 8, 15];
    } else if (gap < openW) {
      const t = ly / doorH;
      let interior = mix([12, 122, 152], [126, 246, 242], t);
      interior = mix(interior, [255, 228, 148], (1 - gap / openW) * 0.38 * (1 - t));
      interior = mix(interior, [255, 255, 248], Math.exp((-((lx - doorW / 2) ** 2)) / 8) * 0.12);
      out = interior;
    } else {
      const seam = gap < openW + 1.2;
      let scarlet = mix([176, 18, 30], [236, 54, 56], 0.35 + 0.28 * (1 - ly / doorH));
      scarlet = mix(scarlet, [122, 10, 18], smoothstep(openW + 1, openW + 8, gap) * 0.22);
      out = seam ? mix([90, 186, 196], scarlet, 0.18) : scarlet;
      if (ly > 7 && ly < 10 && gap > openW + 5 && gap < openW + 10) out = [255, 216, 112];
    }
  }

  const doorCx = doorX + doorW / 2;
  const doorBase = doorY + doorH;
  const gdx = x - doorCx;
  const gdy = y - doorBase;
  const cast =
    Math.exp((-gdx * gdx) / 230 - (gdy * gdy) / 440) * smoothstep(doorBase - 2, doorBase + 62, y);
  out = mix(out, [255, 126, 112], cast * 0.13);
  out = mix(out, [130, 246, 242], cast * 0.09);

  const ox = doorX + doorW + 17;
  const oy = doorY + doorH - 1;
  const body = Math.hypot((x - ox) / 2.0, (y - (oy - 7)) / 5.3);
  const head = Math.hypot(x - (ox + 0.5), y - (oy - 14));
  const legs = y > oy - 5 && y < oy && Math.abs(x - ox) < 3 && Math.abs(Math.abs(x - ox) - 1.2) < 1.0;
  if (body < 1 || legs) out = mix(out, [20, 30, 40], 0.96);
  if (head < 2.4) out = mix(out, [26, 38, 48], 0.96);

  return out;
}

function render(): Uint8Array {
  const rgba = new Uint8Array(WIDTH * HEIGHT * 4);
  const cx = WIDTH * 0.5;
  const cy = HEIGHT * 0.39;
  const ringR = 274;
  const ringT = 58;

  for (let y = 0; y < HEIGHT; y++) {
    for (let x = 0; x < WIDTH; x++) {
      const nx = x / WIDTH;
      const ny = y / HEIGHT;
      let col = baseColor(x, y, nx, ny);

      const reflectionD = Math.hypot((x - cx) / 1.12, (y - (cy + 292)) / 0.33);
      col = mix(col, [150, 236, 231], 0.24 * Math.exp((-reflectionD * reflectionD) / 53000));

      col = drawOceanRing(col, x, y, nx, ny, cx, cy, ringR, ringT);
      col = drawFragments(col, x, y, cx, cy);
      col = drawDoorScene(col, x, y);

      if (ny > 0.7 && hash2(x, y) > 0.9978) {
        col = mix(col, [255, 255, 255], 0.3);
      }

      const vx = (x - WIDTH / 2) / (WIDTH * 0.56);
      const vy = (y - HEIGHT * 0.43) / (HEIGHT * 0.64);
      const vignette = smoothstep(0.62, 1.18, Math.hypot(vx, vy));
      col = mix(col, [236, 241, 239], vignette * 0.17);

      const i = (y * WIDTH + x) * 4;
      rgba[i] = Math.round(col[0]);
      rgba[i + 1] = Math.round(col[1]);
      rgba[i + 2] = Math.round(col[2]);
      rgba[i + 3] = 255;
    }
  }
  return rgba;
}

function main() {
  const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? 'out';
  mkdirSync(outDir, { recursive: true });
  const rgba = render();
  const png = encodePNG(WIDTH, HEIGHT, rgba);
  writeFileSync(join(outDir, 'entry.png'), png);
}

main();
