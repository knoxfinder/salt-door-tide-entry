// salt-door-tide-entry: a deterministic procedural scene for make.fun's ai-excited-01.
// Node 22, standard library only. A tiny scarlet elevator stands on a pale salt flat
// and opens into a huge luminous ocean ring that coils upward past floating city
// fragments and a lone watcher. Writes /output/entry.png (or $MAKEFUN_OUTPUT_DIR).

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';

const W = 1024;
const H = 1024;
const OUT_DIR = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
const OUT_FILE = join(OUT_DIR, 'entry.png');

// ---------------- scalar helpers ----------------
const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
const clamp = (v: number, a: number, b: number): number => (v < a ? a : v > b ? b : v);
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const sstep = (e0: number, e1: number, x: number): number => {
  const t = clamp01((x - e0) / (e1 - e0 || 1e-9));
  return t * t * (3 - 2 * t);
};

// ---------------- deterministic hash / noise ----------------
const ihash = (x: number, y: number): number => {
  let h = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1);
  h = Math.imul(h ^ (h >>> 15), 0x2545f491);
  h ^= h >>> 13;
  h = Math.imul(h, 0x27d4eb2d);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
};
const vnoise = (x: number, y: number): number => {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = ihash(xi, yi);
  const b = ihash(xi + 1, yi);
  const c = ihash(xi, yi + 1);
  const d = ihash(xi + 1, yi + 1);
  return lerp(lerp(a, b, u), lerp(c, d, u), v);
};
const fbm = (x: number, y: number, oct: number): number => {
  let s = 0;
  let amp = 0.5;
  let f = 1;
  let norm = 0;
  for (let i = 0; i < oct; i++) {
    s += amp * vnoise(x * f, y * f);
    norm += amp;
    amp *= 0.5;
    f *= 2.03;
  }
  return s / norm;
};

// ---------------- palette ----------------
const SKY_TOP = [4, 9, 18];
const SKY_MID = [10, 40, 62];
const SKY_LOW = [34, 108, 130];
const SKY_HOR = [176, 228, 228];
const FLAT_NEAR = [242, 244, 240];
const FLAT_FAR = [200, 220, 222];
const WATER_DEEP = [4, 34, 56];
const WATER_MID = [30, 176, 200];
const WATER_BRIGHT = [176, 250, 250];
const FOAM = [245, 255, 255];
const GOLD = [255, 198, 76];
const GOLD_LT = [255, 236, 176];
const SCARLET = [238, 62, 46];
const SCARLET_DK = [156, 28, 22];
const SCARLET_LT = [255, 116, 82];
const FRAG_DK = [8, 18, 30];
const FRAG_TEAL = [52, 170, 190];

// ---------------- geometry ----------------
const HY = 0.720;              // horizon
const AA = 1.4 / W;            // one anti-alias step
const CX = 0.500;              // ring centre x
const CY = 0.400;              // ring centre y
const RX = 0.335;              // ring major radius (x)
const RY = 0.200;              // ring major radius (y, perspective)
const TUBE = 0.050;            // ring tube radius
const GAP = 0.30;              // angular half-width of the ring's bottom opening

const LX = -0.42;
const LY = -0.56;
const LZ = 0.72;
const LN = 1 / Math.hypot(LX, LY, LZ);
const LXn = LX * LN;
const LYn = LY * LN;
const LZn = LZ * LN;

// the rising coil: a spiral ribbon that climbs out of the ring
const COIL_N = 150;
const coilX = new Float64Array(COIL_N + 1);
const coilY = new Float64Array(COIL_N + 1);
const coilW = new Float64Array(COIL_N + 1);
const coilD = new Float64Array(COIL_N + 1);
let coilMinX = 2;
let coilMaxX = -2;
let coilMinY = 2;
let coilMaxY = -2;
for (let i = 0; i <= COIL_N; i++) {
  const t = i / COIL_N;
  const ang = -1.15 + t * Math.PI * 2 * 1.5;
  const rad = 0.30 - 0.18 * t;
  const x = 0.50 + rad * Math.cos(ang);
  const y = 0.52 - rad * 0.34 * Math.sin(ang) - 0.36 * t;
  coilX[i] = x;
  coilY[i] = y;
  coilW[i] = 0.030 * (1 - 0.45 * t);
  coilD[i] = Math.sin(ang);
  if (x < coilMinX) coilMinX = x;
  if (x > coilMaxX) coilMaxX = x;
  if (y < coilMinY) coilMinY = y;
  if (y > coilMaxY) coilMaxY = y;
}
coilMinX -= 0.05;
coilMaxX += 0.05;
coilMinY -= 0.05;
coilMaxY += 0.05;

// floating city fragments
type Frag = { x: number; y: number; w: number; h: number; ang: number; front: boolean };
const FRAGS: Frag[] = [
  { x: 0.175, y: 0.300, w: 0.078, h: 0.112, ang: 0.26, front: false },
  { x: 0.815, y: 0.255, w: 0.062, h: 0.140, ang: -0.30, front: false },
  { x: 0.625, y: 0.130, w: 0.052, h: 0.072, ang: 0.40, front: false },
  { x: 0.360, y: 0.150, w: 0.046, h: 0.062, ang: -0.36, front: false },
  { x: 0.735, y: 0.545, w: 0.088, h: 0.076, ang: 0.15, front: true },
  { x: 0.235, y: 0.600, w: 0.072, h: 0.062, ang: -0.20, front: true },
  { x: 0.880, y: 0.660, w: 0.060, h: 0.050, ang: 0.10, front: true },
  { x: 0.130, y: 0.470, w: 0.050, h: 0.082, ang: 0.30, front: true },
];

// ---------------- scene pieces ----------------
function ringGlowAt(px: number, py: number): number {
  const dx = (px - CX) / RX;
  const dy = (py - CY) / RY;
  const rr = Math.hypot(dx, dy);
  const gr = Math.hypot(dx / (RX * rr), dy / (RY * rr)) || 1e-9;
  const sd = (rr - 1) / gr;
  const ad = Math.abs(sd);
  const outer = Math.exp(-Math.max(0, ad - TUBE) / 0.075);
  const inner = sd < 0 ? Math.exp(-Math.max(0, -sd - TUBE) / 0.090) : 0;
  return outer * 0.50 + inner * 0.07;
}

function voronoiEdge(px: number, py: number, cell: number): number {
  const gx = Math.floor(px / cell);
  const gy = Math.floor(py / cell);
  let d1 = 1e9;
  let d2 = 1e9;
  for (let oy = -1; oy <= 1; oy++) {
    for (let ox = -1; ox <= 1; ox++) {
      const cx2 = gx + ox;
      const cy2 = gy + oy;
      const jx = (cx2 + 0.15 + 0.7 * ihash(cx2 * 5 + 1, cy2 * 3 + 2)) * cell;
      const jy = (cy2 + 0.15 + 0.7 * ihash(cy2 * 7 + 3, cx2 * 11 + 5)) * cell;
      const ddx = px - jx;
      const ddy = py - jy;
      const dd = ddx * ddx + ddy * ddy;
      if (dd < d1) {
        d2 = d1;
        d1 = dd;
      } else if (dd < d2) {
        d2 = dd;
      }
    }
  }
  return Math.sqrt(d2) - Math.sqrt(d1);
}

// ---------------- render ----------------
function render(): Buffer {
  const rgb = Buffer.allocUnsafe(W * H * 3);
  let o = 0;
  for (let y = 0; y < H; y++) {
    const py = (y + 0.5) / H;
    for (let x = 0; x < W; x++) {
      const px = (x + 0.5) / W;

      // ---- sky ----
      const tv = clamp01(py / HY);
      let r = lerp(SKY_TOP[0], SKY_MID[0], sstep(0, 0.6, tv));
      let g = lerp(SKY_TOP[1], SKY_MID[1], sstep(0, 0.6, tv));
      let b = lerp(SKY_TOP[2], SKY_MID[2], sstep(0, 0.6, tv));
      const lw = sstep(0.55, 1.0, tv) * 0.75;
      r = lerp(r, SKY_LOW[0], lw);
      g = lerp(g, SKY_LOW[1], lw);
      b = lerp(b, SKY_LOW[2], lw);
      const hz = sstep(0.90, 1.0, tv) * 0.62;
      r = lerp(r, SKY_HOR[0], hz);
      g = lerp(g, SKY_HOR[1], hz);
      b = lerp(b, SKY_HOR[2], hz);

      const nb = (fbm(px * 2.1 - py * 0.9, py * 2.7 + 3.0, 5) - 0.5) * 0.5;
      r += nb * 40;
      g += nb * 70;
      b += nb * 60;

      // stars
      const scx = Math.floor(px * 95);
      const scy = Math.floor(py * 95);
      if (ihash(scx * 3 + 1, scy * 7 + 2) > 0.958 && py < HY * 0.92) {
        const sx = (scx + 0.5) / 95;
        const sy = (scy + 0.5) / 95;
        const ddx = px - sx;
        const ddy = py - sy;
        const sa = Math.exp(-(ddx * ddx + ddy * ddy) * 160000) * (0.35 + 0.65 * ihash(scy, scx));
        r += sa * 210;
        g += sa * 235;
        b += sa * 255;
      }

      // ---- ring backdrop glow ----
      const rdx = (px - CX) / RX;
      const rdy = (py - CY) / RY;
      const rr = Math.hypot(rdx, rdy);
      const gr = Math.hypot(rdx / (RX * rr), rdy / (RY * rr)) || 1e-9;
      const sd = (rr - 1) / gr;
      const ad = Math.abs(sd);
      const gl = ringGlowAt(px, py);
      r += gl * 70;
      g += gl * 180;
      b += gl * 190;

      // ---- back fragments ----
      for (let i = 0; i < FRAGS.length; i++) {
        const f = FRAGS[i];
        if (f.front) continue;
        const ca = Math.cos(f.ang);
        const sa = Math.sin(f.ang);
        const dxf = px - f.x;
        const dyf = py - f.y;
        const lx = dxf * ca + dyf * sa;
        const ly = -dxf * sa + dyf * ca;
        const cov = sstep(f.w, f.w - AA, Math.abs(lx)) * sstep(f.h, f.h - AA, Math.abs(ly));
        if (cov <= 0.002) continue;
        let cr = FRAG_DK[0];
        let cg = FRAG_DK[1];
        let cb = FRAG_DK[2];
        const up = sstep(f.h - 0.024, f.h, -ly);
        cr = lerp(cr, FRAG_TEAL[0], up * 0.9);
        cg = lerp(cg, FRAG_TEAL[1], up * 0.9);
        cb = lerp(cb, FRAG_TEAL[2], up * 0.9);
        const left = sstep(f.w - 0.014, f.w, -lx);
        cr = lerp(cr, 120, left * 0.5);
        cg = lerp(cg, 220, left * 0.5);
        cb = lerp(cb, 238, left * 0.5);
        const wc = 0.011;
        const wu = (lx + f.w) / wc;
        const wv = (ly + f.h) / (wc * 1.25);
        const ci = Math.floor(wu);
        const cj = Math.floor(wv);
        const fu = wu - ci;
        const fv = wv - cj;
        if (fu > 0.22 && fu < 0.78 && fv > 0.25 && fv < 0.75 && ihash(ci * 3 + 11, cj * 5 + 7) > 0.42) {
          cr = lerp(cr, GOLD[0], 0.9);
          cg = lerp(cg, GOLD[1], 0.9);
          cb = lerp(cb, GOLD[2], 0.9);
        }
        r = lerp(r, cr, cov);
        g = lerp(g, cg, cov);
        b = lerp(b, cb, cov);
      }

      // ---- ring solid ----
      let cov = 1 - sstep(TUBE - AA, TUBE, ad);
      const th = Math.atan2(rdy, rdx);
      let dth = Math.abs(th - Math.PI * 0.5);
      if (dth > Math.PI) dth = Math.PI * 2 - dth;
      cov *= sstep(GAP, GAP - 0.16, dth);
      if (cov > 0.002) {
        const cw = clamp(sd / TUBE, -1, 1);
        const sw = Math.sqrt(Math.max(0, 1 - cw * cw));
        const sgn = sd >= 0 ? 1 : -1;
        const nx = cw * (sgn * rdx / (RX * rr) / gr);
        const ny = cw * (sgn * rdy / (RY * rr) / gr);
        const nz = sw;
        const ndl = Math.max(0, nx * LXn + ny * LYn + nz * LZn);
        const diff = sstep(0.05, 0.85, ndl);
        let cr = lerp(WATER_DEEP[0], WATER_MID[0], diff);
        let cg = lerp(WATER_DEEP[1], WATER_MID[1], diff);
        let cb = lerp(WATER_DEEP[2], WATER_MID[2], diff);
        const hi = Math.pow(ndl, 3.2) * 0.75;
        cr = lerp(cr, WATER_BRIGHT[0], hi);
        cg = lerp(cg, WATER_BRIGHT[1], hi);
        cb = lerp(cb, WATER_BRIGHT[2], hi);
        const sp = Math.pow(ndl, 30) * 0.6;
        cr += sp * 230;
        cg += sp * 255;
        cb += sp * 255;
        const fm = fbm(px * 16, py * 16 + th * 3, 4);
        const fo = sstep(0.55, 0.9, fm) * sstep(0.45, 0.9, ndl) * 0.8;
        cr = lerp(cr, FOAM[0], fo);
        cg = lerp(cg, FOAM[1], fo);
        cb = lerp(cb, FOAM[2], fo);
        const rim = Math.pow(1 - nz, 3.0) * Math.max(0, -(nx * 0.5 + ny * 0.8)) * 0.9;
        cr = lerp(cr, GOLD[0], rim);
        cg = lerp(cg, GOLD[1], rim);
        cb = lerp(cb, GOLD[2], rim);
        r = lerp(r, cr, cov);
        g = lerp(g, cg, cov);
        b = lerp(b, cb, cov);
      }

      // ---- energy arcs orbiting the ring ----
      for (let ai = 0; ai < 2; ai++) {
        const arx = ai === 0 ? RX * 1.26 : RX * 1.48;
        const ary = ai === 0 ? RY * 1.26 : RY * 1.48;
        const ax2 = (px - CX) / arx;
        const ay2 = (py - CY) / ary;
        const arr = Math.hypot(ax2, ay2);
        const agr = Math.hypot(ax2 / (arx * arr), ay2 / (ary * arr)) || 1e-9;
        const asd = Math.abs((arr - 1) / agr);
        const acov = Math.exp(-(asd * asd) / (0.004 * 0.004));
        if (acov > 0.01) {
          const ath = Math.atan2(ay2, ax2);
          const dash = 0.5 + 0.5 * Math.sin(ath * (ai === 0 ? 7 : 11) + ai * 1.7);
          const amt = acov * Math.pow(dash, 2.2) * (ai === 0 ? 0.55 : 0.35);
          r += amt * 200;
          g += amt * 240;
          b += amt * 255;
        }
      }

      // ---- rising coil ----
      if (px > coilMinX && px < coilMaxX && py > coilMinY && py < coilMaxY) {
        let bd = 1e9;
        let bi = 0;
        let bt = 0;
        for (let i = 0; i < COIL_N; i++) {
          const ax = coilX[i];
          const ay = coilY[i];
          const vx = coilX[i + 1] - ax;
          const vy = coilY[i + 1] - ay;
          const wx = px - ax;
          const wy = py - ay;
          let t = (wx * vx + wy * vy) / (vx * vx + vy * vy);
          t = t < 0 ? 0 : t > 1 ? 1 : t;
          const ddx = px - (ax + vx * t);
          const ddy = py - (ay + vy * t);
          const dd = ddx * ddx + ddy * ddy;
          if (dd < bd) {
            bd = dd;
            bi = i;
            bt = t;
          }
        }
        const dist = Math.sqrt(bd);
        const wid = lerp(coilW[bi], coilW[bi + 1], bt);
        const ccov = 1 - sstep(wid - AA, wid, dist);
        if (ccov > 0.002) {
          const ax = coilX[bi];
          const ay = coilY[bi];
          const bx = coilX[bi + 1];
          const by = coilY[bi + 1];
          const cx0 = ax + (bx - ax) * bt;
          const cy0 = ay + (by - ay) * bt;
          let ox = px - cx0;
          let oy = py - cy0;
          const ol = Math.hypot(ox, oy) || 1e-9;
          ox /= ol;
          oy /= ol;
          const cw = clamp(dist / wid, 0, 1);
          const sw = Math.sqrt(Math.max(0, 1 - cw * cw));
          const nx = cw * ox;
          const ny = cw * oy;
          const nz = sw;
          const ndl = Math.max(0, nx * LXn + ny * LYn + nz * LZn);
          const diff = sstep(0.05, 0.85, ndl);
          let cr = lerp(WATER_DEEP[0], WATER_MID[0], diff);
          let cg = lerp(WATER_DEEP[1], WATER_MID[1], diff);
          let cb = lerp(WATER_DEEP[2], WATER_MID[2], diff);
          const hi = Math.pow(ndl, 3.0) * 0.95;
          cr = lerp(cr, WATER_BRIGHT[0], hi);
          cg = lerp(cg, WATER_BRIGHT[1], hi);
          cb = lerp(cb, WATER_BRIGHT[2], hi);
          const sp = Math.pow(ndl, 22) * 0.9;
          cr += sp * 235;
          cg += sp * 255;
          cb += sp * 255;
          const fm = fbm(px * 20, py * 20 + bi * 0.5, 4);
          const fo = sstep(0.5, 0.9, fm) * sstep(0.4, 0.9, ndl) * 0.85;
          cr = lerp(cr, FOAM[0], fo);
          cg = lerp(cg, FOAM[1], fo);
          cb = lerp(cb, FOAM[2], fo);
          r = lerp(r, cr, ccov);
          g = lerp(g, cg, ccov);
          b = lerp(b, cb, ccov);
        }
      }

      // ---- front fragments ----
      for (let i = 0; i < FRAGS.length; i++) {
        const f = FRAGS[i];
        if (!f.front) continue;
        const ca = Math.cos(f.ang);
        const sa = Math.sin(f.ang);
        const dxf = px - f.x;
        const dyf = py - f.y;
        const lx = dxf * ca + dyf * sa;
        const ly = -dxf * sa + dyf * ca;
        const cov = sstep(f.w, f.w - AA, Math.abs(lx)) * sstep(f.h, f.h - AA, Math.abs(ly));
        if (cov <= 0.002) continue;
        let cr = FRAG_DK[0];
        let cg = FRAG_DK[1];
        let cb = FRAG_DK[2];
        const up = sstep(f.h - 0.024, f.h, -ly);
        cr = lerp(cr, FRAG_TEAL[0], up * 0.9);
        cg = lerp(cg, FRAG_TEAL[1], up * 0.9);
        cb = lerp(cb, FRAG_TEAL[2], up * 0.9);
        const left = sstep(f.w - 0.014, f.w, -lx);
        cr = lerp(cr, 120, left * 0.5);
        cg = lerp(cg, 220, left * 0.5);
        cb = lerp(cb, 238, left * 0.5);
        const wc = 0.011;
        const wu = (lx + f.w) / wc;
        const wv = (ly + f.h) / (wc * 1.25);
        const ci = Math.floor(wu);
        const cj = Math.floor(wv);
        const fu = wu - ci;
        const fv = wv - cj;
        if (fu > 0.22 && fu < 0.78 && fv > 0.25 && fv < 0.75 && ihash(ci * 3 + 11, cj * 5 + 7) > 0.42) {
          cr = lerp(cr, GOLD[0], 0.9);
          cg = lerp(cg, GOLD[1], 0.9);
          cb = lerp(cb, GOLD[2], 0.9);
        }
        r = lerp(r, cr, cov);
        g = lerp(g, cg, cov);
        b = lerp(b, cb, cov);
      }

      // ---- salt flat ----
      const ga = sstep(HY - AA, HY + AA, py);
      if (ga > 0.002) {
        const ft = sstep(HY, 1.0, py);
        let fr = lerp(FLAT_FAR[0], FLAT_NEAR[0], ft);
        let fg = lerp(FLAT_FAR[1], FLAT_NEAR[1], ft);
        let fb = lerp(FLAT_FAR[2], FLAT_NEAR[2], ft);
        const tex = (fbm(px * 34, py * 24 + 7, 4) - 0.5) * 0.16;
        fr *= 1 + tex;
        fg *= 1 + tex;
        fb *= 1 + tex;
        const vd = voronoiEdge(px, py, 0.10);
        const crack = sstep(0.010, 0.0, vd);
        const cdark = 1 - crack * 0.30;
        fr *= cdark;
        fg *= cdark;
        fb *= cdark;
        const cool = (1 - ft) * 0.30;
        fr = lerp(fr, 120, cool);
        fg = lerp(fg, 175, cool);
        fb = lerp(fb, 185, cool);
        const refl = 0.34 * Math.exp(-(py - HY) / 0.11);
        const rg2 = ringGlowAt(px, 2 * HY - py) * refl;
        fr += rg2 * 60;
        fg += rg2 * 170;
        fb += rg2 * 185;
        const edx = (px - 0.470) / 0.055;
        const edy = (py - 0.800) / 0.075;
        const eref = Math.exp(-(edx * edx + edy * edy)) * sstep(0.795, 0.84, py) * 0.5;
        fr = lerp(fr, SCARLET[0], eref);
        fg = lerp(fg, SCARLET[1], eref);
        fb = lerp(fb, SCARLET[2], eref);
        r = lerp(r, fr, ga);
        g = lerp(g, fg, ga);
        b = lerp(b, fb, ga);
      }

      // ---- light beam from the open door up to the ring ----
      {
        const ax = 0.470;
        const ay = 0.700;
        const bx = 0.500;
        const by = 0.400;
        const vx = bx - ax;
        const vy = by - ay;
        const wx = px - ax;
        const wy = py - ay;
        let t = (wx * vx + wy * vy) / (vx * vx + vy * vy);
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const ddx = px - (ax + vx * t);
        const ddy = py - (ay + vy * t);
        const dd = ddx * ddx + ddy * ddy;
        const bw = 0.006 + 0.045 * t;
        const beam = Math.exp(-dd / (2 * bw * bw)) * (1 - 0.50 * t);
        // warm gold at the door cooling to cyan as it climbs to the ring
        const warm = 1 - t;
        r += beam * (92 + warm * 168);
        g += beam * (205 - warm * 30);
        b += beam * (218 - warm * 158);
      }

      // ---- embers rising from the portal ----
      if (px > 0.39 && px < 0.64 && py > 0.36 && py < 0.83) {
        for (let e = 0; e < 30; e++) {
          const r1 = ihash(e * 13 + 3, 91);
          const r2 = ihash(e * 7 + 5, 57);
          const r3 = ihash(e * 29 + 1, 23);
          const t2 = r1;
          const ex2 = lerp(0.470, 0.500, t2) + Math.sin(t2 * 9.0 + r2 * 6.2832) * (0.006 + 0.055 * t2);
          const ey2 = lerp(0.782, 0.400, t2);
          const rad = 0.0015 + 0.0024 * r3 * (1 - 0.30 * t2);
          const ddx2 = px - ex2;
          const ddy2 = py - ey2;
          const g2 = Math.exp(-(ddx2 * ddx2 + ddy2 * ddy2) / (2 * rad * rad));
          if (g2 < 0.02) continue;
          const warmth = 1 - t2;
          const inten = g2 * (0.55 + 0.45 * r2) * (1 - 0.45 * t2);
          r += inten * (150 + warmth * 105);
          g += inten * (110 + warmth * 90);
          b += inten * (40 + warmth * 90);
        }
      }

      // ---- scarlet elevator ----
      {
        const ex = 0.470;
        const eby = 0.800;
        const ehw = 0.030;
        const ehh = 0.120;
        const etop = eby - ehh;
        const sdx = (px - ex) / (ehw * 1.9);
        const sdy = (py - (eby + 0.006)) / 0.013;
        const shd = Math.max(0, 1 - (sdx * sdx + sdy * sdy));
        if (shd > 0) {
          r = lerp(r, 12, shd * 0.45);
          g = lerp(g, 16, shd * 0.45);
          b = lerp(b, 24, shd * 0.45);
        }
        if (px > ex - ehw && px < ex + ehw && py > etop && py < eby) {
          const u = (px - (ex - ehw)) / (2 * ehw);
          const vv = (py - etop) / ehh;
          let cr = lerp(SCARLET_LT[0], SCARLET_DK[0], u * 0.85);
          let cg = lerp(SCARLET_LT[1], SCARLET_DK[1], u * 0.85);
          let cb = lerp(SCARLET_LT[2], SCARLET_DK[2], u * 0.85);
          const lite = 1.08 - vv * 0.22;
          cr *= lite;
          cg *= lite;
          cb *= lite;
          const inset = (px - (ex - ehw * 0.80)) / (ehw * 1.60);
          if (px > ex - ehw * 0.80 && px < ex + ehw * 0.80 && py > etop + 0.014 && py < eby - 0.010) {
            const doorShade = 0.84 + 0.16 * (1 - inset);
            cr *= doorShade;
            cg *= doorShade;
            cb *= doorShade;
            // the parted doors leave a bright portal gap down the middle
            const gapc = ex - 0.004;
            const gapHalf = 0.0072;
            const gd = Math.abs(px - gapc);
            const portal = 1 - sstep(gapHalf * 0.35, gapHalf, gd);
            const seam = (1 - sstep(0.0, 0.0022, Math.abs(gd - gapHalf))) * (1 - portal);
            if (seam > 0.001) {
              cr = lerp(cr, 30, seam * 0.8);
              cg = lerp(cg, 22, seam * 0.8);
              cb = lerp(cb, 24, seam * 0.8);
            }
            if (portal > 0.001) {
              const pv = (py - etop) / ehh;
              const bloom = 1 - 0.28 * pv;
              cr = lerp(cr, WATER_BRIGHT[0], portal * 0.95);
              cg = lerp(cg, WATER_BRIGHT[1], portal * 0.95);
              cb = lerp(cb, WATER_BRIGHT[2], portal * 0.95);
              cr += portal * 34 * bloom;
              cg += portal * 24 * bloom;
            }
          }
          if (py < etop + 0.011 || py > eby - 0.013) {
            cr = GOLD[0];
            cg = GOLD[1];
            cb = GOLD[2];
          }
          r = cr;
          g = cg;
          b = cb;
          const edge = Math.min(px - (ex - ehw), ex + ehw - px) / ehw;
          if (edge < 0.12) {
            const dk = 1 - sstep(0.0, 0.12, edge) * 0.5;
            r *= dk;
            g *= dk;
            b *= dk;
          }
        }
        // roof slab
        if (px > ex - ehw * 1.16 && px < ex + ehw * 1.16 && py > etop - 0.014 && py < etop + 0.002) {
          r = 30;
          g = 34;
          b = 42;
          if (py < etop - 0.008) {
            r = GOLD[0];
            g = GOLD[1];
            b = GOLD[2];
          }
        }
        // beacon
        const bdx = (px - ex) / 0.010;
        const bdy = (py - (etop - 0.022)) / 0.010;
        const bea = Math.exp(-(bdx * bdx + bdy * bdy));
        r += bea * 150;
        g += bea * 180;
        b += bea * 150;
      }

      // ---- watcher ----
      {
        const wx = 0.545;
        const wy = 0.802;
        const hh = 0.030;
        const dx = px - wx;
        const dy = py - wy;
        let cov = 0;
        const hdx = dx / 0.0055;
        const hdy = (py - (wy - hh)) / 0.0055;
        if (hdx * hdx + hdy * hdy < 1) cov = 1;
        const bodyTop = wy - hh + 0.007;
        if (py > bodyTop && py < wy - 0.010) {
          const bw = lerp(0.0035, 0.0085, (py - bodyTop) / (wy - 0.010 - bodyTop));
          if (Math.abs(dx) < bw) cov = 1;
        }
        if (py > wy - 0.011 && py < wy && Math.abs(dx) < 0.0075) cov = 1;
        if (cov > 0) {
          const rim = sstep(0.004, 0.0, dx + 0.004);
          let cr = 8;
          let cg = 14;
          let cb = 22;
          cr = lerp(cr, 120, rim * 0.7);
          cg = lerp(cg, 220, rim * 0.7);
          cb = lerp(cb, 235, rim * 0.7);
          r = lerp(r, cr, cov);
          g = lerp(g, cg, cov);
          b = lerp(b, cb, cov);
        }
        const gdx = (px - (wx + 0.004)) / 0.0035;
        const gdy = (py - (wy - hh + 0.002)) / 0.0035;
        const glint = Math.exp(-(gdx * gdx + gdy * gdy));
        r += glint * 200;
        g += glint * 230;
        b += glint * 160;
      }

      rgb[o++] = clamp(r, 0, 255) | 0;
      rgb[o++] = clamp(g, 0, 255) | 0;
      rgb[o++] = clamp(b, 0, 255) | 0;
    }
  }
  return rgb;
}

// ---------------- PNG encoding ----------------
const CRC_TABLE = ((): Uint32Array => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const out = Buffer.allocUnsafe(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

function encodePNG(width: number, height: number, rgb: Buffer): Buffer {
  const stride = width * 3;
  const raw = Buffer.allocUnsafe((stride + 1) * height);
  const prev = Buffer.alloc(stride);
  const cur = Buffer.alloc(stride);
  const cand = Buffer.alloc(stride);
  const best = Buffer.alloc(stride);
  for (let y = 0; y < height; y++) {
    rgb.copy(cur, 0, y * stride, y * stride + stride);
    let bestType = 0;
    let bestSum = Infinity;
    for (let f = 0; f < 5; f++) {
      let sum = 0;
      for (let i = 0; i < stride; i++) {
        const a = i >= 3 ? cur[i - 3] : 0;
        const b = prev[i];
        const c = i >= 3 ? prev[i - 3] : 0;
        let v: number;
        if (f === 0) v = cur[i];
        else if (f === 1) v = cur[i] - a;
        else if (f === 2) v = cur[i] - b;
        else if (f === 3) v = cur[i] - ((a + b) >> 1);
        else v = cur[i] - paeth(a, b, c);
        v &= 0xff;
        cand[i] = v;
        sum += v < 128 ? v : 256 - v;
      }
      if (sum < bestSum) {
        bestSum = sum;
        bestType = f;
        cand.copy(best);
      }
    }
    raw[y * (stride + 1)] = bestType;
    best.copy(raw, y * (stride + 1) + 1);
    cur.copy(prev);
  }
  const idat = deflateSync(raw, { level: 9 });
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

// ---------------- main ----------------
const pixels = render();
const png = encodePNG(W, H, pixels);
mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(OUT_FILE, png);
console.log(`wrote ${OUT_FILE} (${png.length} bytes, ${W}x${H})`);
