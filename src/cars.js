import * as THREE from '../vendor/three.module.min.js';
import { Parts, mat, MATERIAL } from './parts.js';

// Mostly everyday car colors, with a few bright ones mixed in.
export const CAR_COLORS = [0xc4c8cc, 0x1d1f22, 0xeeeeee, 0x1f3a6b, 0xa31621, 0xc8b89a, 0x2e5e3a, 0x3d7ec9, 0xf2b705, 0xe0581b, 0x7a2d8c];
const RUST = [0x8a4b2a, 0x6e3b22, 0xa0623a];

const GLASS = mat(0x26343f, 'glass');
const CHROME = mat(0xd8dde3, 'chrome');
const TRIM = mat(0x222426, 'rubber');
const SEAM = mat(0x0e0f10, 'rubber');
const ARCH = mat(0x0c0c0c, 'rubber');
const LIGHT = mat(0xfff6d0, 'light');
const REVERSE = mat(0xf4f4f4, 'light');
const RED = mat(0xc8141a, 'light');
const AMBER = mat(0xff9a1a, 'light');
const TIRE = mat(0x1a1a1a, 'rubber');
const RIM = mat(0xaab1b8, 'chrome');
const STEEL = mat(0x5d6267, 'metal');
const PLATE = 0xf4f4f0;
const PLATE_TEXT = 0x1d3a8a;

const _v = new THREE.Vector3();

// Body panels: a rounded side-profile solid with extra vertices to crumple.
const body = (p, pts, width, color, opts = {}) => p.profile(pts, width, color, { detail: p.lite ? 0 : 0.4, ...opts });
const xRot = (geo) => geo.rotateX(Math.PI / 2); // cylinder pointing along z

// ---------- Wheels ----------

// A tire with rounded sidewalls (a lathe turned to point along x).
function tire(p, x, y, z, r, w) {
  const pts = [[0.6, -0.5], [0.84, -0.53], [0.96, -0.45], [1, -0.28], [1, 0.28], [0.96, 0.45], [0.84, 0.53], [0.6, 0.5]]
    .map(([a, b]) => new THREE.Vector2(a * r, b * w));
  p.add(new THREE.LatheGeometry(pts, p.lite ? 10 : 18).rotateZ(Math.PI / 2), TIRE, x, y, z);
}

// Tire plus a wheel facing out on `side`: five-spoke alloy, or a plain steel wheel.
function wheel(p, x, y, z, r, w, side, style = 'alloy') {
  tire(p, x, y, z, r, w);
  p.xcyl(r * 0.6, w * 0.92, p.lite ? 8 : 14, TRIM, x, y, z); // wheel barrel, fills the middle
  const face = x + side * (w * 0.46);
  if (p.lite) {
    p.xcyl(r * 0.55, 0.03, 10, style === 'steel' ? STEEL : RIM, face, y, z);
    return;
  }
  const ring = (inner, outer, color, dx = 0) => p.add(new THREE.RingGeometry(inner, outer, 18).rotateY(side * Math.PI / 2), color, face + side * dx, y, z);
  if (style === 'steel') {
    p.xcyl(r * 0.55, 0.03, 16, STEEL, face, y, z);
    ring(r * 0.18, r * 0.3, CHROME, 0.02);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      p.xcyl(r * 0.05, 0.035, 6, SEAM, face + side * 0.005, y + Math.cos(a) * r * 0.42, z + Math.sin(a) * r * 0.42);
    }
    return;
  }
  ring(r * 0.48, r * 0.6, RIM, 0.01);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    p.box(0.03, r * 0.36, r * 0.13, RIM, face + side * 0.01, y + Math.cos(a) * r * 0.3, z + Math.sin(a) * r * 0.3, a);
  }
  p.xcyl(r * 0.15, 0.06, 12, CHROME, face + side * 0.01, y, z);
}

// Four wheels, plus dark arches on the body sides so they look tucked in.
function wheels(p, halfW, axleZ, r, { rear = axleZ, w = 0.34, archY, style, dually = false } = {}) {
  for (const z of [-axleZ, rear]) {
    for (const s of [-1, 1]) {
      const x = s * (halfW - w / 2 + 0.06);
      wheel(p, x, r, z, r, w, s, style);
      if (dually && z === rear) wheel(p, x - s * (w + 0.02), r, z, r, w, s, style);
      p.xcyl(r * 1.18, 0.04, 18, ARCH, s * (halfW + 0.005), archY ?? r, z);
    }
  }
}

// ---------- Body details ----------

function headlight(p, x, y, z, w, h) {
  p.box(w + 0.05, h + 0.05, 0.04, CHROME, x, y, z + 0.015);
  p.box(w, h, 0.05, LIGHT, x, y, z);
  p.box(w * 0.28, h * 0.6, 0.055, AMBER, x + Math.sign(x) * w * 0.32, y, z - 0.003);
}

function taillight(p, x, y, z, w, h) {
  p.box(w + 0.04, h + 0.04, 0.04, TRIM, x, y, z - 0.015);
  p.box(w, h, 0.05, RED, x, y, z);
  p.box(w * 0.28, h * 0.55, 0.055, REVERSE, x - Math.sign(x) * w * 0.28, y, z + 0.003);
}

// License plate; zOut is +1 on the back and -1 on the front.
function plate(p, y, z, zOut) {
  p.box(0.52, 0.14, 0.02, PLATE, 0, y, z);
  if (p.lite) return;
  p.box(0.36, 0.05, 0.02, PLATE_TEXT, 0, y, z + zOut * 0.006);
}

function grille(p, w, h, y, z, slat = CHROME) {
  p.box(w, h, 0.05, SEAM, 0, y, z);
  for (let i = 1; i <= 3; i++) p.box(w - 0.04, 0.025, 0.06, slat, 0, y - h / 2 + (i * h) / 4, z - 0.005);
  p.box(w + 0.04, 0.035, 0.06, CHROME, 0, y + h / 2, z - 0.005);
  if (!p.lite) p.add(xRot(new THREE.CylinderGeometry(0.06, 0.06, 0.03, 14)), CHROME, 0, y, z - 0.035); // badge
}

// Door seams and handles on both sides; seams are z positions front to back.
function doors(p, halfW, seams, y0, y1, handleY) {
  if (p.lite) return;
  for (const s of [-1, 1]) {
    const x = s * (halfW + 0.004);
    for (const z of seams) p.box(0.012, y1 - y0, 0.022, SEAM, x, (y0 + y1) / 2, z);
    for (let i = 0; i < seams.length - 1; i++) p.box(0.03, 0.035, 0.16, CHROME, x + s * 0.01, handleY, seams[i + 1] - 0.22);
  }
}

// Dark rocker strip along the bottom of each side.
function rockers(p, halfW, y, z0, z1) {
  if (p.lite) return;
  for (const s of [-1, 1]) p.box(0.03, 0.09, z1 - z0, SEAM, s * (halfW + 0.006), y, (z0 + z1) / 2);
}

function mirrors(p, B, halfW, y, z) {
  for (const s of [-1, 1]) {
    p.box(0.14, 0.04, 0.06, SEAM, s * (halfW + 0.06), y - 0.05, z);
    p.box(0.16, 0.13, 0.2, B, s * (halfW + 0.15), y, z);
    if (!p.lite) p.box(0.12, 0.09, 0.012, CHROME, s * (halfW + 0.15), y, z + 0.105);
  }
}

function wipers(p, y, z, span) {
  if (p.lite) return;
  p.box(span * 0.42, 0.025, 0.03, SEAM, -span * 0.2, y, z, 0, 0, 0.1);
  p.box(span * 0.42, 0.025, 0.03, SEAM, span * 0.25, y, z, 0, 0, 0.1);
}

function bumpers(p, halfW, front, back, y = 0.48, color = TRIM) {
  p.box(halfW * 2 + 0.04, 0.22, 0.2, color, 0, y, -front);
  p.box(halfW * 2 + 0.04, 0.22, 0.2, color, 0, y, back);
  p.box(halfW * 1.2, 0.05, 0.21, SEAM, 0, y - 0.07, -front); // lower lip
}

function exhaust(p, x, y, z) {
  if (p.lite) return;
  p.add(xRot(new THREE.CylinderGeometry(0.045, 0.05, 0.28, 10)), CHROME, x, y, z);
}

function antenna(p, x, y, z) {
  if (p.lite) return;
  p.ycyl(0.008, 0.6, 4, SEAM, x, y + 0.3, z);
}

// Lights, grille, plates, bumpers, doors, mirrors and wipers for an ordinary car.
function carDetails(p, B, o) {
  const { halfW, front, back } = o;
  for (const s of [-1, 1]) {
    headlight(p, s * (halfW - o.headW / 2 - 0.1), o.headY, -front, o.headW, o.headH ?? 0.15);
    taillight(p, s * (halfW - o.tailW / 2 - 0.08), o.tailY, back, o.tailW, o.tailH ?? 0.16);
  }
  if (o.grille) grille(p, o.grille[0], o.grille[1], o.grille[2], -front - 0.01, o.grilleSlat);
  bumpers(p, halfW, front + 0.04, back + 0.04, o.bumperY, o.bumper);
  plate(p, o.bumperY + 0.03, -front - 0.15, -1);
  plate(p, o.plateY ?? o.bumperY + 0.2, back + 0.02, 1);
  doors(p, halfW, o.seams, o.doorY[0], o.doorY[1], o.handleY);
  rockers(p, halfW, o.doorY[0] + 0.02, o.seams[0], o.seams[o.seams.length - 1]);
  mirrors(p, B, halfW, o.mirror[0], o.mirror[1]);
  wipers(p, o.wiper[0], o.wiper[1], halfW * 1.6);
  exhaust(p, halfW * 0.55, o.bumperY - 0.12, back + 0.05);
}

// Blacked-out pillars between the side windows.
function pillars(p, halfW, y, h, zs) {
  for (const z of zs) for (const s of [-1, 1]) p.box(0.05, h, 0.11, SEAM, s * halfW, y, z);
}

// ---------- Vehicles ----------
// Each builder fills Parts and returns { width, length, height }. Front is -z.

const BUILDERS = {
  sedan(p, B) {
    body(p, [[-2.25, 0.32], [2.25, 0.32], [2.3, 0.62], [2.18, 0.86], [0.95, 1.0], [-1.55, 1.02], [-2.22, 0.92], [-2.3, 0.6]], 1.86, B);
    body(p, [[1.0, 0.98], [0.15, 1.42], [-0.9, 1.42], [-1.6, 1.0]], 1.66, GLASS);
    p.box(1.5, 0.05, 0.95, B, 0, 1.43, 0.37); // roof
    pillars(p, 0.84, 1.2, 0.4, [0.1]);
    for (const s of [-1, 1]) p.box(0.03, 0.04, 2.5, CHROME, s * 0.94, 0.97, 0.1); // window sill trim
    p.box(1.5, 0.012, 0.02, SEAM, 0, 1.0, 1.62); // trunk lid gap
    p.box(1.6, 0.012, 0.02, SEAM, 0, 0.96, -1.0); // hood gap
    carDetails(p, B, {
      halfW: 0.93, front: 2.33, back: 2.35, headY: 0.74, headW: 0.42, tailY: 0.76, tailW: 0.4,
      grille: [0.8, 0.18, 0.66], bumperY: 0.48, seams: [-0.85, 0.2, 1.25], doorY: [0.4, 0.96], handleY: 0.86,
      mirror: [1.05, -0.85], wiper: [1.0, -1.02],
    });
    antenna(p, 0.6, 1.0, 1.95);
    wheels(p, 0.93, 1.4, 0.36);
    return { width: 1.9, length: 4.6, height: 1.45, wheel: 0.36 };
  },
  hatchback(p, B) {
    body(p, [[-1.85, 0.32], [1.85, 0.32], [1.9, 0.62], [1.78, 0.86], [0.75, 1.02], [-1.8, 1.05], [-1.9, 0.6]], 1.78, B);
    body(p, [[0.8, 1.0], [0.0, 1.48], [-1.6, 1.48], [-1.82, 1.02]], 1.6, GLASS);
    p.box(1.46, 0.05, 1.5, B, 0, 1.49, 0.8);
    pillars(p, 0.81, 1.24, 0.42, [0.25]);
    p.box(1.3, 0.06, 0.25, B, 0, 1.5, 1.78); // roof spoiler
    p.box(0.5, 0.025, 0.03, SEAM, 0.1, 1.15, 1.86, 0.5, 0, 0.15); // rear wiper
    carDetails(p, B, {
      halfW: 0.89, front: 1.93, back: 1.9, headY: 0.74, headW: 0.36, tailY: 0.95, tailW: 0.3, tailH: 0.2,
      grille: [0.7, 0.16, 0.64], bumperY: 0.48, plateY: 0.72, seams: [-0.62, 0.55], doorY: [0.4, 1.0], handleY: 0.88,
      mirror: [1.08, -0.65], wiper: [1.02, -0.82],
    });
    wheels(p, 0.89, 1.2, 0.35);
    return { width: 1.8, length: 3.8, height: 1.5, wheel: 0.35 };
  },
  suv(p, B) {
    body(p, [[-2.3, 0.5], [2.3, 0.5], [2.35, 0.9], [2.2, 1.18], [1.15, 1.3], [-2.25, 1.32], [-2.35, 0.8]], 2.0, B);
    body(p, [[1.2, 1.28], [0.45, 1.85], [-2.15, 1.85], [-2.25, 1.3]], 1.84, GLASS);
    p.box(1.7, 0.06, 2.55, B, 0, 1.87, 0.85);
    p.box(0.05, 0.05, 2.2, CHROME, -0.7, 1.93, 0.9).box(0.05, 0.05, 2.2, CHROME, 0.7, 1.93, 0.9); // roof rails
    pillars(p, 0.93, 1.58, 0.5, [-0.2, 0.9]);
    p.box(2.04, 0.3, 4.4, TRIM, 0, 0.62, 0); // cladding
    p.add(xRot(new THREE.CylinderGeometry(0.42, 0.42, 0.25, 18)), TIRE, 0, 1.0, 2.5); // spare tire on the back
    p.add(xRot(new THREE.CylinderGeometry(0.3, 0.3, 0.27, 14)), B, 0, 1.0, 2.5);
    carDetails(p, B, {
      halfW: 1.0, front: 2.35, back: 2.38, headY: 1.05, headW: 0.38, tailY: 1.1, tailW: 0.3, tailH: 0.25,
      grille: [1.0, 0.26, 0.98], bumperY: 0.62, plateY: 0.82, seams: [-1.05, 0.25, 1.55], doorY: [0.82, 1.28], handleY: 1.18,
      mirror: [1.42, -1.0], wiper: [1.32, -1.22],
    });
    wheels(p, 1.0, 1.5, 0.44);
    return { width: 2.05, length: 4.7, height: 1.95, wheel: 0.44 };
  },
  pickup(p, B) {
    body(p, [[-2.65, 0.5], [2.65, 0.5], [2.7, 0.92], [2.6, 1.2], [1.6, 1.3], [-2.6, 1.28], [-2.7, 0.8]], 2.0, B);
    body(p, [[1.65, 1.28], [1.05, 1.85], [-0.45, 1.85], [-0.5, 1.3]], 1.84, GLASS);
    p.box(1.7, 0.06, 1.35, B, 0, 1.87, 0.3);
    p.box(1.8, 0.1, 2.0, TRIM, 0, 1.3, 1.5); // bed liner
    for (const s of [-1, 1]) p.box(0.08, 0.06, 2.0, CHROME, s * 0.95, 1.36, 1.5); // bed rail caps
    p.box(1.85, 0.5, 0.2, mat(0x9aa1a8, 'metal'), 0, 1.55, 0.55); // toolbox
    p.box(0.3, 0.04, 0.03, CHROME, 0, 1.12, 2.74); // tailgate handle
    p.box(1.85, 0.012, 0.02, SEAM, 0, 1.27, 2.7); // tailgate gap
    pillars(p, 0.93, 1.58, 0.5, [-0.5]);
    carDetails(p, B, {
      halfW: 1.0, front: 2.73, back: 2.73, headY: 1.05, headW: 0.36, headH: 0.2, tailY: 1.05, tailW: 0.18, tailH: 0.4,
      grille: [1.4, 0.4, 0.98], bumperY: 0.6, bumper: CHROME, plateY: 0.82, seams: [-1.6, -0.45], doorY: [0.6, 1.28], handleY: 1.18,
      mirror: [1.45, -1.3], wiper: [1.32, -1.67],
    });
    wheels(p, 1.0, 1.75, 0.45);
    return { width: 2.05, length: 5.5, height: 1.9, wheel: 0.45 };
  },
  van(p, B) {
    body(p, [[-2.4, 0.45], [2.4, 0.45], [2.45, 0.85], [2.3, 1.15], [1.6, 1.5], [1.2, 2.05], [-2.35, 2.05], [-2.45, 0.8]], 2.0, B);
    body(p, [[1.62, 1.48], [1.22, 1.96], [-1.9, 1.96], [-1.9, 1.5]], 2.02, GLASS, { bevel: 0.02 });
    pillars(p, 1.01, 1.73, 0.48, [-0.9, 0.2, 1.2]);
    for (const s of [-1, 1]) p.box(0.03, 0.03, 1.4, SEAM, s * 1.012, 1.52, 0.6); // sliding door track
    p.box(1.5, 0.05, 2.8, mat(0x2a2a2a, 'metal'), 0, 2.12, 0.2); // roof rack
    for (const z of [-1.0, 0.2, 1.4]) p.box(1.7, 0.06, 0.06, mat(0x2a2a2a, 'metal'), 0, 2.15, z);
    carDetails(p, B, {
      halfW: 1.0, front: 2.45, back: 2.49, headY: 1.0, headW: 0.34, headH: 0.18, tailY: 1.3, tailW: 0.2, tailH: 0.42,
      grille: [1.0, 0.22, 0.88], bumperY: 0.55, plateY: 0.95, seams: [-1.55, -0.9, 0.2, 1.75], doorY: [0.55, 1.45], handleY: 1.25,
      mirror: [1.45, -1.55], wiper: [1.52, -1.65],
    });
    wheels(p, 1.0, 1.55, 0.42);
    return { width: 2.05, length: 4.9, height: 2.05, wheel: 0.42 };
  },
  limo(p, B) {
    body(p, [[-3.9, 0.32], [3.9, 0.32], [3.95, 0.62], [3.82, 0.86], [2.6, 1.0], [-3.2, 1.02], [-3.86, 0.92], [-3.95, 0.6]], 1.92, B);
    body(p, [[2.65, 0.98], [1.85, 1.42], [-2.5, 1.42], [-3.25, 1.0]], 1.72, GLASS);
    p.box(1.56, 0.05, 4.3, B, 0, 1.43, 0.33);
    pillars(p, 0.87, 1.2, 0.4, [-1.5, 0, 1.5]);
    for (const s of [-1, 1]) p.box(0.03, 0.04, 6.0, CHROME, s * 0.97, 0.97, 0.2); // long chrome sill
    for (const s of [-1, 1]) p.ycyl(0.01, 0.35, 4, CHROME, s * 0.95, 1.05, -3.3); // little flag poles
    for (const s of [-1, 1]) p.box(0.02, 0.14, 0.22, s < 0 ? 0xd01010 : 0x1040c0, s * 0.95, 1.16, -3.42);
    carDetails(p, B, {
      halfW: 0.96, front: 3.97, back: 3.94, headY: 0.74, headW: 0.42, tailY: 0.76, tailW: 0.42,
      grille: [0.9, 0.2, 0.66], bumperY: 0.48, bumper: CHROME, seams: [-2.45, -1.3, -0.1, 1.1, 2.5], doorY: [0.4, 0.97], handleY: 0.86,
      mirror: [1.05, -2.5], wiper: [1.0, -2.67],
    });
    antenna(p, -0.6, 1.0, 3.5);
    wheels(p, 0.96, 3.0, 0.37);
    return { width: 1.95, length: 7.9, height: 1.45, wheel: 0.37 };
  },
  junker(p, B, rng) {
    // An old beater: rusty, mismatched panels, dents, no glass left.
    const R = () => RUST[(rng() * 3) | 0];
    body(p, [[-2.25, 0.36], [2.25, 0.36], [2.3, 0.64], [2.18, 0.88], [0.95, 1.0], [-1.55, 1.02], [-2.22, 0.92], [-2.3, 0.62]], 1.86, B, { bevel: 0.04 });
    body(p, [[1.0, 0.98], [0.15, 1.42], [-0.9, 1.42], [-1.6, 1.0]], 1.66, mat(0x111111, 'rubber'), { bevel: 0.02 });
    p.box(1.5, 0.05, 0.95, R(), 0, 1.43, 0.37);
    pillars(p, 0.84, 1.2, 0.4, [0.1]);
    p.box(0.04, 0.55, 1.1, R(), 0.95, 0.66, -0.3);
    p.box(0.04, 0.55, 1.0, R(), -0.95, 0.66, 0.6);
    p.box(1.7, 0.06, 1.2, R(), 0, 0.99, -1.6, -0.08); // hood, popped open a bit
    p.box(0.04, 0.3, 0.6, 0x3a3a3a, 0.95, 0.7, 1.7);
    for (let i = 0; i < 6; i++) {
      // Rust spots.
      const s = rng() < 0.5 ? -1 : 1;
      p.box(0.02, 0.1 + rng() * 0.15, 0.15 + rng() * 0.25, RUST[1], s * 0.94, 0.5 + rng() * 0.35, -1.8 + rng() * 3.6);
    }
    headlight(p, 0.6, 0.74, -2.31, 0.38, 0.14);
    p.box(0.38, 0.14, 0.05, SEAM, -0.6, 0.74, -2.31); // smashed headlight
    taillight(p, 0.62, 0.76, 2.33, 0.36, 0.16);
    taillight(p, -0.62, 0.76, 2.33, 0.36, 0.16);
    doors(p, 0.93, [-0.85, 0.2, 1.25], 0.4, 0.96, 0.86);
    bumpers(p, 0.93, 2.34, 2.34, 0.48, mat(0x7a6a5a, 'metal'));
    exhaust(p, 0.5, 0.36, 2.4);
    wheels(p, 0.93, 1.4, 0.36, { style: 'steel' });
    return { width: 1.9, length: 4.6, height: 1.45, wheel: 0.36 };
  },
  bus(p) {
    const Y = 0xf7b500;
    const BLACK = mat(0x111111, 'rubber');
    body(p, [[-5.4, 0.6], [5.4, 0.6], [5.5, 1.0], [5.45, 1.4], [4.3, 1.55], [4.2, 3.0], [-5.4, 3.05], [-5.5, 1.0]], 2.5, Y, { bevel: 0.1 });
    // Black rub rails and window frame.
    for (const y of [0.85, 1.15, 1.65]) p.box(2.56, y === 1.65 ? 0.12 : 0.08, 10.8, BLACK, 0, y, 0);
    p.box(2.54, 0.06, 9.6, BLACK, 0, 2.78, 0.6);
    for (let i = 0; i < 9; i++) {
      for (const s of [-1, 1]) {
        p.box(0.04, 0.72, 0.9, GLASS, s * 1.27, 2.35, -3.5 + i * 1.0);
        p.box(0.05, 0.04, 0.9, CHROME, s * 1.272, 2.3, -3.5 + i * 1.0); // window latch bar
      }
    }
    // Front: windshield, "SCHOOL BUS" sign, grille, lights, mirrors on stalks.
    p.box(2.2, 0.85, 0.06, GLASS, 0, 2.35, -4.32);
    p.box(0.05, 0.85, 0.08, BLACK, 0, 2.35, -4.34);
    p.box(1.7, 0.3, 0.05, BLACK, 0, 3.15, -4.27);
    for (let i = 0; i < 10; i++) p.box(0.1, 0.16, 0.06, Y, -0.68 + i * 0.15, 3.15, -4.29); // the letters
    grille(p, 1.2, 0.5, 1.1, -5.6, BLACK);
    for (const s of [-1, 1]) {
      headlight(p, s * 0.9, 1.25, -5.58, 0.3, 0.22);
      p.add(xRot(new THREE.CylinderGeometry(0.13, 0.13, 0.08, 12)), RED, s * 0.95, 3.25, -4.25); // warning lights
      p.add(xRot(new THREE.CylinderGeometry(0.13, 0.13, 0.08, 12)), AMBER, s * 0.6, 3.25, -4.25);
      p.box(0.08, 0.08, 0.9, BLACK, s * 1.35, 2.2, -4.7); // mirror stalk
      p.box(0.18, 0.45, 0.3, BLACK, s * 1.42, 2.3, -5.1);
      taillight(p, s * 0.95, 1.4, 5.58, 0.3, 0.3);
      p.add(xRot(new THREE.CylinderGeometry(0.13, 0.13, 0.08, 12)), RED, s * 0.95, 2.95, 5.52);
      for (let i = 0; i < 4; i++) p.box(0.04, 0.08, 0.15, AMBER, s * 1.27, 1.0, -3.5 + i * 2.6); // side marker lights
    }
    // Stop arm (a red octagon) on the driver's side, and the door on the other.
    p.add(new THREE.CylinderGeometry(0.28, 0.28, 0.04, 8).rotateZ(Math.PI / 2), mat(0xd01010, 'paint'), -1.36, 2.2, -3.0);
    p.box(0.04, 1.95, 0.85, GLASS, 1.27, 1.6, -3.9);
    p.box(0.05, 1.95, 0.04, BLACK, 1.28, 1.6, -3.9);
    // Back: emergency door outline, roof hatches.
    p.box(1.2, 2.0, 0.03, BLACK, 0, 1.8, 5.56);
    p.box(1.1, 1.9, 0.035, Y, 0, 1.8, 5.565);
    p.box(1.0, 0.8, 0.06, GLASS, 0, 2.35, 5.55);
    p.box(0.25, 0.05, 0.05, CHROME, 0.35, 1.6, 5.6);
    for (const z of [-1.5, 2.5]) p.box(0.9, 0.08, 0.9, mat(0xdddddd, 'metal'), 0, 3.1, z);
    bumpers(p, 1.25, 5.65, 5.6, 0.62, BLACK);
    plate(p, 0.85, 5.68, 1);
    wheels(p, 1.25, 3.6, 0.55, { rear: 3.2, w: 0.42, style: 'steel', dually: true });
    return { width: 2.55, length: 11, height: 3.1, wheel: 0.55 };
  },
  rv(p) {
    const W = 0xf2f0ea;
    body(p, [[-4.0, 0.6], [4.0, 0.6], [4.1, 1.0], [3.95, 1.35], [3.2, 1.55], [2.9, 2.2], [3.7, 2.4], [3.7, 3.0], [-3.95, 3.1], [-4.05, 1.0]], 2.4, W, { bevel: 0.12 });
    body(p, [[3.22, 1.53], [2.95, 2.1], [2.3, 2.1], [2.3, 1.55]], 2.42, GLASS, { bevel: 0.02 });
    p.box(2.46, 0.25, 7.6, 0x8a5a2b, 0, 1.6, -0.1);
    p.box(2.46, 0.1, 7.6, 0xd07a2a, 0, 1.8, -0.1);
    p.box(2.46, 0.06, 6.0, 0x8a5a2b, 0, 2.85, 0.6);
    for (const z of [-1.0, 1.4, 2.9]) {
      for (const s of [-1, 1]) {
        p.box(0.04, 0.68, 1.08, TRIM, s * 1.225, 2.35, z);
        p.box(0.05, 0.6, 1.0, GLASS, s * 1.23, 2.35, z);
      }
    }
    // Door with a window and steps, and a striped awning rolled up above it.
    p.box(0.04, 1.6, 0.8, 0xdedad0, 1.23, 1.55, 0.2);
    p.box(0.05, 0.4, 0.4, GLASS, 1.235, 2.0, 0.2);
    p.box(0.06, 0.04, 0.12, CHROME, 1.26, 1.5, -0.08);
    p.box(0.35, 0.08, 0.7, mat(0x888888, 'metal'), 1.35, 0.6, 0.2);
    p.add(xRot(new THREE.CylinderGeometry(0.12, 0.12, 4.0, 10, 8)), 0x2e7d32, 1.32, 2.95, 0.6);
    // Ladder and spare-tire cover on the back.
    for (const s of [-1, 1]) p.ycyl(0.03, 2.2, 6, CHROME, s * 0.25 - 0.6, 2.0, 4.12);
    for (let i = 0; i < 6; i++) p.box(0.5, 0.03, 0.03, CHROME, -0.6, 1.1 + i * 0.36, 4.12);
    p.add(xRot(new THREE.CylinderGeometry(0.45, 0.45, 0.22, 18)), 0x8a5a2b, 0.55, 1.6, 4.15);
    p.box(1.0, 0.35, 0.9, mat(0xd8d8d8, 'metal'), 0, 3.25, 0.5); // AC unit
    p.box(0.6, 0.12, 0.6, mat(0xd8d8d8, 'metal'), 0, 3.15, -2.0); // skylight vent
    for (const s of [-1, 1]) {
      headlight(p, s * 0.85, 1.05, -4.18, 0.34, 0.2);
      taillight(p, s * 0.95, 1.1, 4.08, 0.25, 0.4);
    }
    grille(p, 1.1, 0.3, 1.05, -4.2);
    mirrors(p, W, 1.2, 1.7, -3.0);
    wipers(p, 1.58, -3.3, 2.0);
    bumpers(p, 1.2, 4.2, 4.12, 0.62, CHROME);
    plate(p, 0.85, -4.38, -1);
    wheels(p, 1.2, 2.8, 0.5, { rear: 2.2, w: 0.42, dually: true });
    return { width: 2.45, length: 8.2, height: 3.3, wheel: 0.5 };
  },
};

export const CAR_KINDS = ['sedan', 'hatchback', 'suv', 'pickup', 'van', 'junker'];
export const VEHICLE_POINTS = { sedan: 100, hatchback: 100, suv: 150, pickup: 150, van: 150, junker: 120, limo: 250, bus: 300, rv: 300 };

// ---------- Crushing ----------

// Two squashed shapes, stored as morph targets on the model so the crush
// can be animated smoothly on one shared geometry:
//   0 "dent": roof caved in where the tire hit, windows popped
//   1 "flat": everything above the wheels pressed down, the roof folded onto
//      the body, a sag across the middle, ends kicked up, sides buckled and
//      crumpled. Wheels stay round but splay out.
export function addCrushTargets(geo, size, seed = 1) {
  const pos = geo.attributes.position;
  const look = geo.attributes.look;
  const H = size.height;
  const L = size.length;
  const low = 2 * (size.wheel || 0); // top of the wheels
  const belt = Math.max(low, H * 0.5);
  const dent = new Float32Array(pos.count * 3);
  const flat = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    _v.fromBufferAttribute(pos, i);
    const { x, y, z } = _v;
    const across = x / (size.width / 2); // -1 .. 1, so nothing tears apart down the middle
    const glass = look && look.getX(i) < 0.06; // glass is the only near-mirror-smooth part
    const mid = Math.exp(-((z / (L * 0.3)) ** 2)); // where the tire went over
    const end = (z / (L / 2)) ** 4; // 0 in the middle, 1 at the bumpers
    // Crumple: a few overlapping waves, different for every model. They only
    // depend on x and z, so layers stacked on top of each other move together.
    const n1 = Math.sin(x * 4.1 + seed) * Math.sin(z * 2.7 + seed * 1.7);
    const n2 = Math.sin(z * 9.3 + x * 5 + seed * 3.1) * Math.sin(z * 4.3 - x * 6 - seed);
    const crumple = n1 * 0.6 + n2 * 0.4;

    // Dent: the roof sags in the middle; glass drops inside.
    let dy = y > belt ? y - (y - belt) * 0.6 * mid - 0.06 * mid : y;
    let dx = x;
    if (glass) {
      dy = belt + (y - belt) * 0.3;
      dx *= 0.88;
    }
    dent.set([dx, dy, z], i * 3);

    // Flat. First squash the heights (keeping stacked layers in order), then
    // shift everything above the wheels by the same sag, kick and crumple.
    let fy;
    let fx = x;
    if (y <= low) {
      fy = y * 0.92;
      fx += across * 0.07 * (1 - y / Math.max(low, 0.01)); // wheels splay out at the bottom
    } else {
      const base = low * 0.92;
      fy = y < belt ? base + (y - low) * 0.35 : base + (belt - low) * 0.35 + (y - belt) * 0.12;
    }
    if (glass) {
      fy = Math.min(fy, low * 0.92 + (belt - low) * 0.35 + 0.04);
      fx *= 0.9;
    }
    const up = Math.min(1, Math.max(0, (y - low) / 0.3));
    fy += up * H * (-0.16 * mid + 0.1 * end + 0.07 * crumple);
    fx += across * (0.07 * crumple + 0.06 * Math.sin(z * 3.3 + seed)) * up; // buckled sides
    fx *= 1 + 0.06 * up; // bulge out
    flat.set([fx + z * 0.012 * Math.sin(seed), Math.max(0.03, fy), z * (1 + crumple * 0.012)], i * 3);
  }
  const normalsFor = (arr) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    g.computeVertexNormals(); // the parts aren't indexed, so this gives crumpled, faceted panels
    return g.attributes.normal;
  };
  geo.morphAttributes.position = [new THREE.BufferAttribute(dent, 3), new THREE.BufferAttribute(flat, 3)];
  geo.morphAttributes.normal = [normalsFor(dent), normalsFor(flat)];
  return geo;
}

const cache = new Map();
const LOD_DISTANCE = 45; // beyond this, vehicles use the lighter model

function buildModel(kind, colorIndex, lite) {
  const p = new Parts({ detail: lite ? 0 : 0.7 });
  p.lite = lite;
  let seed = colorIndex * 97 + kind.length + 1;
  const rng = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const color = kind === 'junker' ? RUST[colorIndex % RUST.length] : CAR_COLORS[colorIndex % CAR_COLORS.length];
  const size = BUILDERS[kind](p, color, rng);
  return { geo: p.build(), size };
}

// Returns { geo (crushable, with morph targets), lite (far-away version), size }, cached.
function vehicleModel(kind, colorIndex = 0) {
  const key = kind + ':' + colorIndex;
  let m = cache.get(key);
  if (!m) {
    const full = buildModel(kind, colorIndex, false);
    m = { geo: addCrushTargets(full.geo, full.size, colorIndex + 1), lite: buildModel(kind, colorIndex, true).geo, size: full.size };
    cache.set(key, m);
  }
  return m;
}

// Ready-to-place vehicle (facing -Z): a LOD that shows the detailed model up
// close and a lighter one far away. userData.mesh is the detailed mesh.
export function makeVehicle(kind, colorIndex) {
  const m = vehicleModel(kind, colorIndex);
  const lod = new THREE.LOD();
  const mesh = new THREE.Mesh(m.geo, MATERIAL);
  mesh.castShadow = mesh.receiveShadow = true;
  const far = new THREE.Mesh(m.lite, MATERIAL);
  lod.addLevel(mesh, 0);
  lod.addLevel(far, LOD_DISTANCE);
  lod.userData.model = m;
  lod.userData.mesh = mesh;
  return lod;
}

// Once something is crushed, always show the detailed (squashable) model.
export function keepDetailed(lod) {
  if (!lod.isLOD) return;
  lod.levels.length = 1;
  lod.levels[0].object.visible = true;
  lod.levels[0].distance = 0;
  for (const child of lod.children) child.visible = child === lod.levels[0].object;
}
