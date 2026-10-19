// Things to squash: every kind of vehicle plus a few props. Each crushable
// has a footprint (halfW across the track, halfL along it), a top height and
// a points value, and knows how to show itself crushed.
import * as THREE from '../vendor/three.module.min.js';
import { Parts, mat, MATERIAL } from './parts.js';
import { makeVehicle, crushGeometry, CAR_COLORS, CAR_KINDS, VEHICLE_POINTS } from './cars.js';

const rand = (a, b) => a + Math.random() * (b - a);
const randColor = () => (Math.random() * CAR_COLORS.length) | 0;

function propModel(build) {
  const p = new Parts();
  const size = build(p);
  const geo = p.build();
  return { geo, crushed: crushGeometry(geo, size.height, 3), size };
}

const PROPS = {
  potty: () => propModel((p) => {
    const BLUE = 0x1f6fd1;
    p.box(1.3, 2.2, 1.3, BLUE, 0, 1.1, 0);
    p.box(1.4, 0.15, 1.4, 0xf2f2f2, 0, 2.28, 0);
    p.box(1.0, 1.8, 0.04, 0x1a5cb0, 0, 1.05, -0.67); // door
    p.box(0.25, 0.25, 0.02, mat(0xfff3a0, 'light'), 0, 1.75, -0.7); // little moon window
    p.box(0.08, 0.3, 0.06, mat(0xd8dde3, 'chrome'), 0.35, 1.0, -0.71);
    return { width: 1.4, length: 1.4, height: 2.35 };
  }),
  crates: () => propModel((p) => {
    const WOOD = [0xb5874f, 0xa0743f, 0xc39a5f];
    const put = (x, y, z, s, i) => {
      p.box(s, s, s, WOOD[i % 3], x, y + s / 2, z);
      for (const d of [-1, 1]) p.box(s + 0.02, 0.12, 0.12, 0x7a5228, x, y + s / 2 + d * s * 0.38, z - s / 2);
    };
    put(-0.65, 0, 0, 1.2, 0);
    put(0.65, 0, 0.1, 1.2, 1);
    put(0, 1.2, 0.05, 1.1, 2);
    return { width: 2.5, length: 1.3, height: 2.3 };
  }),
  hay: () => propModel((p) => {
    for (const x of [-0.8, 0.8]) {
      p.add(new THREE.CylinderGeometry(0.85, 0.85, 1.3, 16).rotateX(Math.PI / 2), 0xd9b25a, x, 0.85, 0);
      p.add(new THREE.CylinderGeometry(0.86, 0.86, 0.1, 16).rotateX(Math.PI / 2), 0xb8913f, x, 0.85, 0);
    }
    p.add(new THREE.CylinderGeometry(0.85, 0.85, 1.3, 16).rotateX(Math.PI / 2), 0xe0bc66, 0, 2.2, 0);
    return { width: 3.3, length: 1.3, height: 3.05 };
  }),
};
const propCache = {};

const CRUSH_POINTS = { ...VEHICLE_POINTS, potty: 150, crates: 80, hay: 80, stack: 400 };
// Bits that fly off when something gets crushed.
const DEBRIS = { potty: [0x1f6fd1, 0xf2f2f2], crates: [0xb5874f, 0x7a5228], hay: [0xd9b25a, 0xf0d890] };

// Build a crushable of `kind` at (x, d). `across` turns it sideways
// (long side across the track, like buses lined up for a bus jump).
export function makeCrushable(kind, x, d, { across = false } = {}) {
  const group = new THREE.Group();
  const parts = [];
  let size;
  let colors;
  if (kind === 'stack') {
    // Two cars piled on top of each other.
    const k1 = CAR_KINDS[(Math.random() * 4) | 0];
    const k2 = CAR_KINDS[(Math.random() * 3) | 0];
    const c1 = randColor();
    const bottom = makeVehicle(k1, c1);
    const top = makeVehicle(k2, randColor());
    const h1 = bottom.userData.model.size.height;
    top.position.y = h1 * 0.92;
    top.rotation.y = rand(-0.25, 0.25);
    group.add(bottom, top);
    parts.push({ mesh: bottom, model: bottom.userData.model, y1: 0 });
    parts.push({ mesh: top, model: top.userData.model, y1: h1 * 0.4 });
    const s = bottom.userData.model.size;
    size = { width: s.width, length: s.length, height: h1 + top.userData.model.size.height };
    colors = [CAR_COLORS[c1], 0x8fdcff];
  } else if (PROPS[kind]) {
    const model = (propCache[kind] ||= PROPS[kind]());
    const mesh = new THREE.Mesh(model.geo, MATERIAL);
    mesh.castShadow = mesh.receiveShadow = true;
    group.add(mesh);
    parts.push({ mesh, model, y1: 0 });
    size = model.size;
    colors = DEBRIS[kind];
  } else {
    const color = randColor();
    const mesh = makeVehicle(kind, color);
    group.add(mesh);
    parts.push({ mesh, model: mesh.userData.model, y1: 0 });
    size = mesh.userData.model.size;
    colors = [CAR_COLORS[color], 0x8fdcff];
  }
  const flip = Math.random() < 0.5 && kind !== 'potty' ? Math.PI : 0;
  group.rotation.y = (across ? Math.PI / 2 : 0) + flip + rand(-0.08, 0.08);
  group.position.set(x, 0, -d);
  const halfW = (across ? size.length : size.width) / 2;
  const halfL = (across ? size.width : size.length) / 2;
  return {
    kind, mesh: group, parts, x, d, halfW, halfL,
    top: size.height,
    points: CRUSH_POINTS[kind] ?? 100,
    debris: colors,
    glass: !PROPS[kind],
    crushed: false,
    t: 0,
  };
}

// Swap in the squashed models and press them down over a moment.
export function startCrush(c) {
  c.crushed = true;
  c.t = 0;
  for (const p of c.parts) {
    p.mesh.geometry = p.model.crushed;
    p.y0 = p.mesh.position.y;
    p.mesh.scale.y = 2.2; // starts tall and gets pressed flat
  }
  c.tilt = rand(-0.12, 0.12);
}

export function animateCrush(c, dt) {
  if (c.t >= 1) return;
  c.t = Math.min(1, c.t + dt * 7);
  const e = 1 - (1 - c.t) * (1 - c.t);
  for (const p of c.parts) {
    p.mesh.scale.y = 2.2 + (1 - 2.2) * e;
    p.mesh.position.y = p.y0 + (p.y1 - p.y0) * e;
  }
  c.mesh.rotation.z = c.tilt * e;
}

export { CAR_KINDS };
