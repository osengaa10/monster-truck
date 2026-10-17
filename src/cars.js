import * as THREE from '../vendor/three.module.min.js';
import { Parts } from './parts.js';

export const CAR_COLORS = [0xff6f91, 0x4dd0e1, 0xffb74d, 0x9ccc65, 0xba68c8, 0xfff176, 0x7986cb];
const VARIANTS = ['sedan', 'hatchback', 'van'];

const GLASS = 0x8fdcff;
const CHROME = 0xd8dde3;
const GREY = 0x9e9e9e;
const DARK = 0x2a2a2a;
const LIGHT = 0xfff3a0;
const RED = 0xff2a2a;
const WHITE = 0xffffff;
const TIRE = 0x1c1c1c;

function wheels(p, x, z, r) {
  for (const sx of [-x, x]) {
    for (const sz of [-z, z]) {
      p.xcyl(r, 0.4, 12, TIRE, sx, r, sz);
      p.xcyl(r * 0.55, 0.43, 10, CHROME, sx, r, sz);
    }
  }
}

// Lights, bumpers, grille and license plate at front (-z) and back (+z).
function ends(p, halfLen, lightY, width) {
  const lx = width / 2 - 0.4;
  p.box(width + 0.06, 0.28, 0.25, GREY, 0, 0.55, -halfLen).box(width + 0.06, 0.28, 0.25, GREY, 0, 0.55, halfLen);
  p.box(0.9, 0.22, 0.06, DARK, 0, lightY - 0.1, -halfLen + 0.03);
  p.box(0.6, 0.25, 0.04, WHITE, 0, 0.62, halfLen + 0.14);
  for (const x of [-lx, lx]) {
    p.box(0.45, 0.22, 0.06, LIGHT, x, lightY, -halfLen + 0.03);
    p.box(0.45, 0.2, 0.06, RED, x, lightY, halfLen - 0.03);
  }
}

function mirrors(p, B, x, y, z) {
  p.box(0.25, 0.15, 0.2, B, -x, y, z).box(0.25, 0.15, 0.2, B, x, y, z);
}

const BUILDERS = {
  sedan(p, B) {
    p.box(2.3, 0.75, 4.4, B, 0, 0.8, 0);
    p.box(2.24, 0.2, 1.2, B, 0, 1.22, -1.55);
    p.box(2.24, 0.2, 0.9, B, 0, 1.22, 1.7);
    p.box(2.0, 0.62, 2.1, GLASS, 0, 1.55, 0.15);
    for (const z of [-0.88, 0.15, 1.18]) p.box(0.12, 0.62, 0.14, B, -0.98, 1.55, z).box(0.12, 0.62, 0.14, B, 0.98, 1.55, z);
    p.box(2.06, 0.14, 1.9, B, 0, 1.92, 0.2);
    p.box(2.32, 0.1, 3.6, WHITE, 0, 0.98, 0);
    p.box(0.02, 0.55, 0.04, DARK, -1.16, 0.82, 0.2).box(0.02, 0.55, 0.04, DARK, 1.16, 0.82, 0.2);
    mirrors(p, B, 1.15, 1.32, -0.8);
    ends(p, 2.22, 0.95, 2.3);
    wheels(p, 1.05, 1.4, 0.45);
  },
  hatchback(p, B) {
    p.box(2.2, 0.8, 3.7, B, 0, 0.85, 0);
    p.box(2.14, 0.2, 1.0, B, 0, 1.3, -1.3);
    p.box(1.95, 0.65, 2.3, GLASS, 0, 1.6, 0.5);
    for (const z of [-0.6, 0.5, 1.6]) p.box(0.12, 0.65, 0.14, B, -0.95, 1.6, z).box(0.12, 0.65, 0.14, B, 0.95, 1.6, z);
    p.box(2.0, 0.14, 2.3, B, 0, 1.98, 0.5);
    p.box(2.22, 0.12, 3.0, WHITE, 0, 0.6, 0);
    mirrors(p, B, 1.1, 1.38, -0.5);
    ends(p, 1.87, 1.0, 2.2);
    wheels(p, 1.0, 1.2, 0.45);
  },
  van(p, B) {
    p.box(2.3, 1.6, 4.6, B, 0, 1.25, 0);
    p.box(2.0, 0.65, 0.06, GLASS, 0, 1.65, -2.31);
    p.box(0.06, 0.55, 3.0, GLASS, -1.16, 1.65, 0.5).box(0.06, 0.55, 3.0, GLASS, 1.16, 1.65, 0.5);
    p.box(1.6, 0.5, 0.06, GLASS, 0, 1.7, 2.31);
    p.box(2.32, 0.18, 4.62, WHITE, 0, 1.12, 0);
    p.box(0.02, 1.2, 0.04, DARK, 1.16, 1.2, -0.3).box(0.02, 1.2, 0.04, DARK, 1.16, 1.2, 1.0);
    p.box(1.8, 0.08, 3.4, DARK, 0, 2.1, 0.3); // roof rack
    mirrors(p, B, 1.18, 1.5, -2.0);
    ends(p, 2.32, 0.85, 2.3);
    wheels(p, 1.05, 1.55, 0.48);
  },
};

const cache = new Map();
const material = new THREE.MeshPhongMaterial({ vertexColors: true, shininess: 80 });

// Returns a ready-to-place car mesh (one draw call), facing -Z.
export function makeCar(colorIndex, variantIndex) {
  const key = colorIndex + ':' + variantIndex;
  let geo = cache.get(key);
  if (!geo) {
    const p = new Parts();
    BUILDERS[VARIANTS[variantIndex]](p, CAR_COLORS[colorIndex]);
    geo = p.build();
    cache.set(key, geo);
  }
  return new THREE.Mesh(geo, material);
}

export const CAR_VARIANT_COUNT = VARIANTS.length;
