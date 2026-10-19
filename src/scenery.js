// Everything outside the arena walls, in three settings ("biomes") that take
// turns: a stadium, the countryside and a desert canyon. Each track segment
// gets its own ground strip and one merged mesh of props, so the scenery
// costs only a few draw calls no matter how busy it is.
import * as THREE from '../vendor/three.module.min.js';
import { WALL_X } from './consts.js';
import { Parts, mat, MATERIAL } from './parts.js';
import { grassTexture, sandTexture, asphaltTexture, crowdTexture, cloudTexture } from './textures.js';

export const BIOMES = {
  stadium: { ring: 'city', land: 0x5f646c, floor: 0xffffff },
  country: { ring: 'hills', land: 0x4f7a3a, floor: 0xffffff },
  desert: { ring: 'mesas', land: 0xa86a3e, floor: 0xffd9b8 },
};
export const BIOME_ORDER = ['stadium', 'country', 'desert'];

const GROUND_TILE = 16;
const BALLOON_COLORS = [0xff4d4d, 0xffd93d, 0x4dabff, 0x6bff8a, 0xff7ae0, 0xffa94d];

const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const _c = new THREE.Color();

// A color near `hex`, nudged in hue and lightness so no two props match.
function vary(hex, dh = 0.02, dl = 0.06) {
  return _c.set(hex).offsetHSL(rand(-dh, dh), rand(-0.05, 0.05), rand(-dl, dl)).getHex();
}
const matte = (hex) => mat(hex, 'matte');

// ---------- Props ----------

function pine(p, x, z, s) {
  p.ycyl(0.3 * s, 3 * s, 6, matte(vary(0x5b3d24)), x, 1.5 * s, z);
  const g = vary(0x2f5e34, 0.03, 0.08);
  for (let i = 0; i < 3; i++) {
    const r = (2.6 - i * 0.6) * s;
    p.add(new THREE.ConeGeometry(r, 3.6 * s, 8), matte(_c.set(g).offsetHSL(0, 0, i * 0.03).getHex()), x, (3.6 + i * 2.1) * s, z);
  }
}

function leafy(p, x, z, s) {
  p.ycyl(0.35 * s, 3.4 * s, 6, matte(vary(0x5b3d24)), x, 1.7 * s, z);
  const g = vary(0x4c7d36, 0.04, 0.08);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + rand(0, 1);
    p.add(new THREE.IcosahedronGeometry(rand(1.6, 2.2) * s, 1), matte(vary(g, 0.01, 0.05)),
      x + Math.cos(a) * 1.1 * s, (4.4 + rand(-0.4, 0.8)) * s, z + Math.sin(a) * 1.1 * s);
  }
}

function barn(p, x, z) {
  const red = vary(0x9e2a22, 0.01, 0.05);
  p.box(9, 6, 12, matte(red), x, 3, z);
  const roof = new THREE.Shape([new THREE.Vector2(-5, 0), new THREE.Vector2(5, 0), new THREE.Vector2(0, 4)]);
  p.add(new THREE.ExtrudeGeometry(roof, { depth: 12.6, bevelEnabled: false }).translate(0, 0, -6.3), matte(0x4a4a4a), x, 6, z);
  const side = -Math.sign(x);
  p.box(0.1, 4, 4, matte(0xf2f2f2), x + side * 4.5, 2, z);
  p.box(0.12, 0.3, 5.4, matte(0xf2f2f2), x + side * 4.52, 2, z, 0.75);
  p.box(0.12, 0.3, 5.4, matte(0xf2f2f2), x + side * 4.52, 2, z, -0.75);
  // Silo next to it.
  const sz = z + 9;
  p.ycyl(2.2, 13, 16, matte(vary(0xb8bcc0)), x, 6.5, sz);
  p.add(new THREE.SphereGeometry(2.2, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat(0xc8ccd0, 'metal'), x, 13, sz);
}

function farmFence(p, x, d0, d1) {
  const len = d1 - d0;
  const wood = matte(0x8a6a48);
  p.box(0.12, 0.15, len, wood, x, 0.9, -(d0 + len / 2));
  p.box(0.12, 0.15, len, wood, x, 0.45, -(d0 + len / 2));
  for (let d = d0; d < d1; d += 4) p.box(0.2, 1.3, 0.2, wood, x, 0.65, -d);
}

function hayBale(p, x, z) {
  p.add(new THREE.CylinderGeometry(0.9, 0.9, 1.4, 12).rotateZ(Math.PI / 2), matte(vary(0xd2ad5a, 0.01, 0.05)), x, 0.9, z, 0, rand(0, 3), 0);
}

function saguaro(p, x, z, s) {
  const g = vary(0x4d7a3c, 0.02, 0.05);
  const h = rand(5, 8) * s;
  p.ycyl(0.45 * s, h, 10, matte(g), x, h / 2, z);
  p.add(new THREE.SphereGeometry(0.45 * s, 10, 6), matte(g), x, h, z);
  for (const side of [-1, 1]) {
    if (Math.random() < 0.3) continue;
    const ay = h * rand(0.35, 0.6);
    const ax = x + side * 1.0 * s;
    p.box(1.0 * s, 0.6 * s, 0.6 * s, matte(g), x + side * 0.6 * s, ay, z);
    const ah = rand(1.5, 2.8) * s;
    p.ycyl(0.32 * s, ah, 8, matte(g), ax, ay + ah / 2, z);
    p.add(new THREE.SphereGeometry(0.32 * s, 8, 5), matte(g), ax, ay + ah, z);
  }
}

function rock(p, x, z, s, color = 0x8a6448) {
  const g = new THREE.DodecahedronGeometry(1, 0).scale(rand(1, 2) * s, rand(0.6, 1.2) * s, rand(1, 2) * s);
  p.add(g, matte(vary(color, 0.02, 0.08)), x, 0.3 * s, z, rand(0, 3), rand(0, 3), 0);
}

// Layered sandstone mesa: stacked, slightly tapering slabs.
function mesa(p, x, z) {
  const layers = Math.round(rand(3, 5));
  let y = 0;
  let r = rand(16, 28);
  for (let i = 0; i < layers; i++) {
    const h = rand(5, 9);
    const color = i % 2 ? 0xb5734a : 0xc98d5e;
    p.add(new THREE.CylinderGeometry(r * 0.94, r, h, 9), matte(vary(color, 0.01, 0.04)), x, y + h / 2, z, 0, rand(0, 3), 0);
    y += h;
    r *= rand(0.88, 0.97);
  }
}

// Tall floodlight tower behind the stands, lamps facing the track.
function lightTower(p, x, z) {
  const steel = mat(0x8d949a, 'metal');
  const toward = -Math.sign(x);
  p.ycyl(0.5, 30, 8, steel, x, 15, z);
  p.box(0.6, 4, 6, steel, x, 31, z);
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 2; j++) p.box(0.2, 1.4, 1.5, mat(0xfffbe8, 'light'), x + toward * 0.35, 30.2 + j * 1.6, z - 1.9 + i * 1.9);
  }
}

// ---------- Stadium stands ----------

const STEP_W = 1.6;
const STEP_H = 1.3;
const STEPS = 9;
const CROWD_U = 22; // one copy of the crowd texture covers this many units

// Rows of fans stepping up and away from the track on one side.
function standsGeometry(side, d0, d1) {
  const pos = [];
  const uv = [];
  const quad = (a, b, c, d, ua, ub, va, vb) => {
    // a,b along the bottom, c,d along the top; winding flips with side so faces point at the track.
    const corners = [[a, ua, va], [b, ub, va], [c, ub, vb], [d, ua, vb]];
    const order = side < 0 ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2];
    for (const k of order) {
      pos.push(...corners[k][0]);
      uv.push(corners[k][1], corners[k][2]);
    }
  };
  const x0 = side * (WALL_X + 5);
  const z0 = -d0;
  const z1 = -d1;
  const u0 = d0 / CROWD_U;
  const u1 = d1 / CROWD_U;
  for (let i = 0; i < STEPS; i++) {
    const x = x0 + side * i * STEP_W;
    const y = i * STEP_H;
    // Riser (the row of fans) faces the track; tread is the walkway on top.
    quad([x, y, z0], [x, y, z1], [x, y + STEP_H, z1], [x, y + STEP_H, z0], u0, u1, 0, 1);
    quad([x, y + STEP_H, z0], [x, y + STEP_H, z1], [x + side * STEP_W, y + STEP_H, z1], [x + side * STEP_W, y + STEP_H, z0], u0, u1, 0.99, 1);
  }
  const xb = x0 + side * STEPS * STEP_W;
  const yb = STEPS * STEP_H;
  quad([xb, yb, z0], [xb, yb, z1], [xb, yb + 4, z1], [xb, yb + 4, z0], u0, u1, 0.99, 1); // back wall
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}

// ---------- Scenery manager ----------

export class Scenery {
  constructor(scene) {
    this.scene = scene;
    this.groundMats = {
      stadium: new THREE.MeshLambertMaterial({ map: asphaltTexture([1, 1]) }),
      country: new THREE.MeshLambertMaterial({ map: grassTexture([1, 1]) }),
      desert: new THREE.MeshLambertMaterial({ map: sandTexture([1, 1]) }),
    };
    this.crowdMat = new THREE.MeshLambertMaterial({ map: crowdTexture() });
    this.cloudMats = [29, 31, 37].map((seed) => new THREE.SpriteMaterial({ map: cloudTexture(seed), depthWrite: false, fog: false }));
    // Balloon and string merged, one model per color.
    this.balloonGeos = BALLOON_COLORS.map((c) => new Parts()
      .add(new THREE.SphereGeometry(1.4, 16, 12).scale(1, 1.2, 1), c)
      .ycyl(0.04, 4, 3, mat(0xffffff, 'matte'), 0, -3.6, 0)
      .build());
  }

  add(seg, obj, geo) {
    this.scene.add(obj);
    seg.objects.push(obj);
    if (geo) seg.geometries.push(geo);
  }

  build(seg, d0, d1, biome) {
    // Ground strip, with UVs from world position so the texture lines up across segments.
    const len = d1 - d0;
    const ground = new THREE.PlaneGeometry(600, len).rotateX(-Math.PI / 2).translate(0, -0.05, -(d0 + len / 2));
    const gp = ground.attributes.position;
    const guv = ground.attributes.uv;
    for (let i = 0; i < gp.count; i++) guv.setXY(i, gp.getX(i) / GROUND_TILE, -gp.getZ(i) / GROUND_TILE);
    const gm = new THREE.Mesh(ground, this.groundMats[biome]);
    gm.receiveShadow = true;
    this.add(seg, gm, ground);

    const p = new Parts();
    const sides = [-1, 1];
    if (biome === 'stadium') {
      for (const side of sides) {
        const g = standsGeometry(side, d0, d1);
        this.add(seg, new THREE.Mesh(g, this.crowdMat), g);
      }
      const first = Math.ceil(d0 / 60) * 60;
      for (let d = first; d < d1; d += 60) for (const side of sides) lightTower(p, side * (WALL_X + 5 + STEPS * STEP_W + 4), -d);
    } else if (biome === 'country') {
      for (const side of sides) {
        farmFence(p, side * (WALL_X + 9), d0, d1);
        for (let d = d0 + rand(0, 8); d < d1; d += rand(6, 12)) {
          const x = side * rand(WALL_X + 5, 85);
          if (Math.abs(Math.abs(x) - (WALL_X + 9)) < 1.5) continue;
          const s = rand(0.8, 1.5);
          if (Math.random() < 0.55) pine(p, x, -d, s);
          else leafy(p, x, -d, s);
        }
        for (let d = d0 + rand(5, 20); d < d1; d += rand(18, 40)) hayBale(p, side * rand(WALL_X + 11, 40), -d);
      }
      if (Math.random() < 0.6) barn(p, pick(sides) * rand(45, 70), -rand(d0, d1));
    } else {
      for (const side of sides) {
        for (let d = d0 + rand(0, 10); d < d1; d += rand(8, 16)) {
          const x = side * rand(WALL_X + 4, 90);
          if (Math.random() < 0.5) saguaro(p, x, -d, rand(0.8, 1.3));
          else rock(p, x, -d, rand(0.6, 1.8));
        }
      }
      for (let d = d0 + rand(0, 60); d < d1; d += rand(70, 120)) mesa(p, pick(sides) * rand(70, 170), -d);
    }
    if (!p.empty) {
      const g = p.build();
      this.add(seg, new THREE.Mesh(g, MATERIAL), g);
    }

    // Floating balloons next to the track.
    for (let d = d0 + rand(10, 40); d < d1; d += rand(40, 80)) {
      const g = new THREE.Mesh(pick(this.balloonGeos), MATERIAL);
      const y = rand(7, 15);
      g.position.set(pick(sides) * rand(WALL_X + 3, WALL_X + 12), y, -d);
      this.add(seg, g);
      seg.balloons.push({ mesh: g, baseY: y, phase: Math.random() * 6 });
    }
    // Soft clouds high up.
    for (let d = d0 + rand(0, 80); d < d1; d += rand(80, 160)) {
      const c = new THREE.Sprite(pick(this.cloudMats));
      const w = rand(50, 90);
      c.scale.set(w, w * 0.45, 1);
      c.position.set(pick(sides) * rand(40, 200), rand(55, 90), -d);
      this.add(seg, c);
    }
  }

  update(segments) {
    const now = performance.now() / 1000;
    for (const seg of segments) {
      for (const b of seg.balloons) b.mesh.position.y = b.baseY + Math.sin(now * 1.5 + b.phase) * 0.8;
    }
  }
}
