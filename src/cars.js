import * as THREE from '../vendor/three.module.min.js';
import { Parts, mat, MATERIAL } from './parts.js';

// Mostly everyday car colors, with a few bright ones mixed in.
export const CAR_COLORS = [0xc4c8cc, 0x1d1f22, 0xeeeeee, 0x1f3a6b, 0xa31621, 0xc8b89a, 0x2e5e3a, 0x3d7ec9, 0xf2b705, 0xe0581b, 0x7a2d8c];
const RUST = [0x8a4b2a, 0x6e3b22, 0xa0623a];

const GLASS = mat(0x26343f, 'glass');
const CHROME = mat(0xd8dde3, 'chrome');
const TRIM = mat(0x222426, 'rubber');
const ARCH = mat(0x0c0c0c, 'rubber');
const LIGHT = mat(0xfff6d0, 'light');
const RED = mat(0xc8141a, 'light');
const AMBER = mat(0xff9a1a, 'light');
const TIRE = mat(0x1a1a1a, 'rubber');
const RIM = mat(0xaab1b8, 'chrome');
const PLATE = 0xf4f4f0;

const _v = new THREE.Vector3();

function wheel(p, x, y, z, r, w, side) {
  p.xcyl(r, w, 16, TIRE, x, y, z);
  p.xcyl(r * 0.62, w + 0.02, 12, RIM, x + side * 0.01, y, z);
  p.xcyl(r * 0.2, w + 0.05, 8, TRIM, x + side * 0.02, y, z);
}

// Four wheels, plus dark arches on the body sides so they look tucked in.
function wheels(p, halfW, axleZ, r, { rear = axleZ, w = 0.34, archY } = {}) {
  for (const z of [-axleZ, rear]) {
    for (const s of [-1, 1]) {
      wheel(p, s * (halfW - w / 2 + 0.06), r, z, r, w, s);
      p.xcyl(r * 1.18, 0.04, 16, ARCH, s * (halfW + 0.005), archY ?? r, z);
    }
  }
}

function lights(p, halfW, front, back, y, { tailY = y, wide = 0.42 } = {}) {
  for (const s of [-1, 1]) {
    const x = s * (halfW - wide / 2 - 0.08);
    p.box(wide, 0.16, 0.06, LIGHT, x, y, -front);
    p.box(wide * 0.3, 0.1, 0.06, AMBER, s * (halfW - 0.08), y - 0.02, -front + 0.04);
    p.box(wide, 0.16, 0.06, RED, x, tailY, back);
  }
  p.box(0.5, 0.14, 0.03, PLATE, 0, 0.55, back + 0.04);
}

function mirrors(p, B, halfW, y, z) {
  for (const s of [-1, 1]) p.box(0.18, 0.13, 0.22, B, s * (halfW + 0.08), y, z);
}

function bumpers(p, halfW, front, back, y = 0.48, color = TRIM) {
  p.box(halfW * 2 + 0.04, 0.22, 0.2, color, 0, y, -front);
  p.box(halfW * 2 + 0.04, 0.22, 0.2, color, 0, y, back);
}

// Each builder fills Parts and returns { width, length, height } (metres-ish).
const BUILDERS = {
  sedan(p, B) {
    p.profile([[-2.25, 0.32], [2.25, 0.32], [2.3, 0.62], [2.18, 0.86], [0.95, 1.0], [-1.55, 1.02], [-2.22, 0.92], [-2.3, 0.6]], 1.86, B);
    p.profile([[1.0, 0.98], [0.15, 1.42], [-0.9, 1.42], [-1.6, 1.0]], 1.66, GLASS);
    p.box(1.5, 0.05, 0.95, B, 0, 1.43, 0.37); // roof
    for (const z of [-0.45, 0.55]) for (const s of [-1, 1]) p.box(0.06, 0.4, 0.1, B, s * 0.82, 1.2, z);
    p.box(1.9, 0.03, 0.04, CHROME, 0, 0.72, 0).box(0.03, 0.04, 2.4, CHROME, 0.94, 0.86, 0.1).box(0.03, 0.04, 2.4, CHROME, -0.94, 0.86, 0.1);
    lights(p, 0.93, 2.28, 2.28, 0.74);
    bumpers(p, 0.93, 2.3, 2.3);
    mirrors(p, B, 0.93, 1.05, -0.85);
    wheels(p, 0.93, 1.4, 0.36);
    return { width: 1.9, length: 4.6, height: 1.45 };
  },
  hatchback(p, B) {
    p.profile([[-1.85, 0.32], [1.85, 0.32], [1.9, 0.62], [1.78, 0.86], [0.75, 1.02], [-1.8, 1.05], [-1.9, 0.6]], 1.78, B);
    p.profile([[0.8, 1.0], [0.0, 1.48], [-1.6, 1.48], [-1.82, 1.02]], 1.6, GLASS);
    p.box(1.46, 0.05, 1.5, B, 0, 1.49, 0.8);
    lights(p, 0.89, 1.88, 1.86, 0.74, { tailY: 0.95, wide: 0.32 });
    bumpers(p, 0.89, 1.9, 1.9);
    mirrors(p, B, 0.89, 1.08, -0.65);
    wheels(p, 0.89, 1.2, 0.35);
    return { width: 1.8, length: 3.8, height: 1.5 };
  },
  suv(p, B) {
    p.profile([[-2.3, 0.5], [2.3, 0.5], [2.35, 0.9], [2.2, 1.18], [1.15, 1.3], [-2.25, 1.32], [-2.35, 0.8]], 2.0, B);
    p.profile([[1.2, 1.28], [0.45, 1.85], [-2.15, 1.85], [-2.25, 1.3]], 1.84, GLASS);
    p.box(1.7, 0.06, 2.55, B, 0, 1.87, 0.85);
    p.box(0.05, 0.05, 2.2, CHROME, -0.7, 1.93, 0.9).box(0.05, 0.05, 2.2, CHROME, 0.7, 1.93, 0.9); // roof rails
    for (const z of [-0.2, 0.9]) for (const s of [-1, 1]) p.box(0.06, 0.5, 0.12, B, s * 0.93, 1.58, z);
    p.box(2.04, 0.3, 4.4, TRIM, 0, 0.62, 0); // cladding
    lights(p, 1.0, 2.33, 2.33, 1.05, { wide: 0.38 });
    bumpers(p, 1.0, 2.35, 2.35, 0.62);
    mirrors(p, B, 1.0, 1.42, -1.0);
    wheels(p, 1.0, 1.5, 0.44);
    return { width: 2.05, length: 4.7, height: 1.95 };
  },
  pickup(p, B) {
    p.profile([[-2.65, 0.5], [2.65, 0.5], [2.7, 0.92], [2.6, 1.2], [1.6, 1.3], [-2.6, 1.28], [-2.7, 0.8]], 2.0, B);
    p.profile([[1.65, 1.28], [1.05, 1.85], [-0.45, 1.85], [-0.5, 1.3]], 1.84, GLASS);
    p.box(1.7, 0.06, 1.35, B, 0, 1.87, 0.3);
    p.box(1.8, 0.1, 2.0, TRIM, 0, 1.3, 1.5); // bed liner
    for (const s of [-1, 1]) p.box(0.06, 0.5, 0.12, B, s * 0.93, 1.58, -0.5);
    p.box(1.6, 0.45, 0.06, CHROME, 0, 0.98, -2.72); // grille
    lights(p, 1.0, 2.68, 2.68, 1.05, { wide: 0.36 });
    bumpers(p, 1.0, 2.75, 2.75, 0.6, CHROME);
    mirrors(p, B, 1.0, 1.45, -1.3);
    wheels(p, 1.0, 1.75, 0.45);
    return { width: 2.05, length: 5.5, height: 1.9 };
  },
  van(p, B) {
    p.profile([[-2.4, 0.45], [2.4, 0.45], [2.45, 0.85], [2.3, 1.15], [1.6, 1.5], [1.2, 2.05], [-2.35, 2.05], [-2.45, 0.8]], 2.0, B);
    p.profile([[1.62, 1.48], [1.22, 1.96], [-1.9, 1.96], [-1.9, 1.5]], 2.02, GLASS, { bevel: 0.02 });
    p.box(2.04, 1.0, 0.04, TRIM, 0, 1.0, 0.2).box(2.04, 1.0, 0.04, TRIM, 0, 1.0, -0.9); // door seams
    lights(p, 1.0, 2.43, 2.43, 1.0, { tailY: 1.3, wide: 0.3 });
    bumpers(p, 1.0, 2.45, 2.45, 0.55);
    mirrors(p, B, 1.0, 1.45, -1.55);
    wheels(p, 1.0, 1.55, 0.42);
    return { width: 2.05, length: 4.9, height: 2.05 };
  },
  limo(p, B) {
    p.profile([[-3.9, 0.32], [3.9, 0.32], [3.95, 0.62], [3.82, 0.86], [2.6, 1.0], [-3.2, 1.02], [-3.86, 0.92], [-3.95, 0.6]], 1.92, B);
    p.profile([[2.65, 0.98], [1.85, 1.42], [-2.5, 1.42], [-3.25, 1.0]], 1.72, GLASS);
    p.box(1.56, 0.05, 4.3, B, 0, 1.43, 0.33);
    for (const z of [-1.5, 0, 1.5]) for (const s of [-1, 1]) p.box(0.06, 0.4, 0.14, B, s * 0.85, 1.2, z);
    p.box(1.96, 0.03, 0.04, CHROME, 0, 0.72, 0);
    lights(p, 0.96, 3.92, 3.92, 0.74);
    bumpers(p, 0.96, 3.95, 3.95, 0.48, CHROME);
    mirrors(p, B, 0.96, 1.05, -2.5);
    wheels(p, 0.96, 3.0, 0.37);
    return { width: 1.95, length: 7.9, height: 1.45 };
  },
  junker(p, B, rng) {
    // An old beater: rusty, mismatched panels, no glass left.
    p.profile([[-2.25, 0.36], [2.25, 0.36], [2.3, 0.64], [2.18, 0.88], [0.95, 1.0], [-1.55, 1.02], [-2.22, 0.92], [-2.3, 0.62]], 1.86, B, { bevel: 0.04 });
    p.profile([[1.0, 0.98], [0.15, 1.42], [-0.9, 1.42], [-1.6, 1.0]], 1.66, mat(0x111111, 'rubber'), { bevel: 0.02 });
    p.box(1.5, 0.05, 0.95, RUST[0], 0, 1.43, 0.37);
    p.box(0.04, 0.55, 1.1, RUST[(rng() * 3) | 0], 0.95, 0.66, -0.3);
    p.box(0.04, 0.55, 1.0, RUST[(rng() * 3) | 0], -0.95, 0.66, 0.6);
    p.box(1.7, 0.06, 1.2, RUST[1], 0, 0.99, -1.6, -0.05);
    p.box(0.04, 0.3, 0.6, 0x3a3a3a, 0.95, 0.7, 1.7);
    bumpers(p, 0.93, 2.3, 2.3, 0.48, mat(0x7a6a5a, 'metal'));
    wheels(p, 0.93, 1.4, 0.36);
    return { width: 1.9, length: 4.6, height: 1.45 };
  },
  bus(p) {
    const Y = 0xf7b500;
    const BLACK = mat(0x111111, 'rubber');
    p.profile([[-5.4, 0.6], [5.4, 0.6], [5.5, 1.0], [5.45, 1.4], [4.3, 1.55], [4.2, 3.0], [-5.4, 3.05], [-5.5, 1.0]], 2.5, Y, { bevel: 0.1 });
    p.box(2.56, 0.12, 10.8, BLACK, 0, 1.65, 0);
    p.box(2.56, 0.08, 10.8, BLACK, 0, 1.15, 0);
    for (let i = 0; i < 9; i++) {
      for (const s of [-1, 1]) p.box(0.04, 0.72, 0.9, GLASS, s * 1.27, 2.35, -3.5 + i * 1.0);
    }
    p.box(2.2, 0.85, 0.06, GLASS, 0, 2.35, -4.3);
    p.box(1.6, 0.8, 0.06, GLASS, 0, 2.35, 5.45);
    p.box(0.08, 0.45, 0.45, mat(0xd01010, 'paint'), -1.33, 2.2, -3.0); // stop sign
    for (const s of [-1, 1]) {
      p.box(0.3, 0.2, 0.06, LIGHT, s * 0.9, 1.25, -5.48);
      p.box(0.3, 0.3, 0.06, RED, s * 0.95, 1.4, 5.48);
      p.box(0.25, 0.25, 0.06, RED, s * 0.9, 3.15, -4.25);
    }
    bumpers(p, 1.25, 5.55, 5.5, 0.62, BLACK);
    wheels(p, 1.25, 3.6, 0.55, { rear: 3.2, w: 0.45 });
    return { width: 2.55, length: 11, height: 3.1 };
  },
  rv(p) {
    const W = 0xf2f0ea;
    p.profile([[-4.0, 0.6], [4.0, 0.6], [4.1, 1.0], [3.95, 1.35], [3.2, 1.55], [2.9, 2.2], [3.7, 2.4], [3.7, 3.0], [-3.95, 3.1], [-4.05, 1.0]], 2.4, W, { bevel: 0.12 });
    p.profile([[3.22, 1.53], [2.95, 2.1], [2.3, 2.1], [2.3, 1.55]], 2.42, GLASS, { bevel: 0.02 });
    p.box(2.46, 0.25, 7.6, 0x8a5a2b, 0, 1.6, -0.1);
    p.box(2.46, 0.1, 7.6, 0xd07a2a, 0, 1.8, -0.1);
    for (const z of [-1.0, 1.4]) for (const s of [-1, 1]) p.box(0.04, 0.6, 1.0, GLASS, s * 1.23, 2.35, z);
    p.box(0.04, 1.5, 0.75, 0xdedad0, 1.23, 1.6, 0.2); // door
    p.box(1.0, 0.35, 0.9, mat(0xd8d8d8, 'metal'), 0, 3.25, 0.5); // AC unit
    lights(p, 1.2, 4.08, 4.0, 1.05, { tailY: 1.1, wide: 0.34 });
    bumpers(p, 1.2, 4.1, 4.05, 0.62, CHROME);
    wheels(p, 1.2, 2.8, 0.5, { rear: 2.2, w: 0.42 });
    return { width: 2.45, length: 8.2, height: 3.3 };
  },
};

export const CAR_KINDS = ['sedan', 'hatchback', 'suv', 'pickup', 'van', 'junker'];
export const VEHICLE_POINTS = { sedan: 100, hatchback: 100, suv: 150, pickup: 150, van: 150, junker: 120, limo: 250, bus: 300, rv: 300 };

// Squash a model flat: everything above the body line gets pressed down,
// the sides bulge out a little and the panels get dented.
export function crushGeometry(geo, height, seed = 1) {
  const g = geo.clone();
  const pos = g.attributes.position;
  const keep = height * 0.38;
  for (let i = 0; i < pos.count; i++) {
    _v.fromBufferAttribute(pos, i);
    const n = Math.sin(_v.x * 3.1 + seed) * Math.sin(_v.z * 2.3 + seed * 1.7);
    let y = _v.y < keep ? _v.y * 0.85 : keep * 0.85 + (_v.y - keep) * 0.22;
    y += n * 0.06 * Math.min(1, (_v.y / height) * 2);
    const bulge = 1 + 0.08 * Math.max(0, 1 - Math.abs(y - keep * 0.6) / keep);
    pos.setXYZ(i, _v.x * bulge, Math.max(0.02, y), _v.z * (1 + n * 0.01));
  }
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

const cache = new Map();

// Returns { geo, crushed, size } for a vehicle kind and color (cached).
function vehicleModel(kind, colorIndex = 0) {
  const key = kind + ':' + colorIndex;
  let m = cache.get(key);
  if (!m) {
    const p = new Parts();
    let seed = colorIndex * 97 + kind.length + 1;
    const rng = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const color = kind === 'junker' ? RUST[colorIndex % RUST.length] : CAR_COLORS[colorIndex % CAR_COLORS.length];
    const size = BUILDERS[kind](p, color, rng);
    const geo = p.build();
    m = { geo, crushed: crushGeometry(geo, size.height, colorIndex), size };
    cache.set(key, m);
  }
  return m;
}

// Ready-to-place vehicle mesh (facing -Z).
export function makeVehicle(kind, colorIndex) {
  const m = vehicleModel(kind, colorIndex);
  const mesh = new THREE.Mesh(m.geo, MATERIAL);
  mesh.castShadow = mesh.receiveShadow = true;
  mesh.userData.model = m;
  return mesh;
}
