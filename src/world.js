import * as THREE from '../vendor/three.module.min.js';

// The track runs along -Z. "Distance" d = -z. Track spans x in [-WALL_X, WALL_X].
export const WALL_X = 14;

const GRAVITY = 14;
const SPEED = 24;
const AHEAD = 450;
const BEHIND = 60;
const SNAP = 8;

const CAR_COLORS = [0xff6f91, 0x4dd0e1, 0xffb74d, 0x9ccc65, 0xba68c8, 0xfff176, 0x7986cb];
const BALLOON_COLORS = [0xff4d4d, 0xffd93d, 0x4dabff, 0x6bff8a, 0xff7ae0, 0xffa94d];

const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

function canvasTexture(size, draw, repeatX, repeatY) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeatX, repeatY);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function speckle(ctx, size, base, colors, count, maxR) {
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < count; i++) {
    ctx.fillStyle = pick(colors);
    ctx.beginPath();
    ctx.arc(Math.random() * size, Math.random() * size, Math.random() * maxR + 1, 0, Math.PI * 2);
    ctx.fill();
  }
}

// Build a solid that follows a height profile across the full track width.
// samples: [{ d, y }] with increasing d. Vertex colors give stripes on top.
function profileGeometry(samples, x0, x1, topColors, sideColor) {
  const pos = [];
  const col = [];
  const v = (x, y, d, c) => { pos.push(x, y, -d); col.push(c.r, c.g, c.b); };
  const quad = (a, b, c, d, color) => { v(...a, color); v(...b, color); v(...c, color); v(...a, color); v(...c, color); v(...d, color); };
  for (let i = 0; i < samples.length - 1; i++) {
    const a = samples[i];
    const b = samples[i + 1];
    quad([x0, a.y, a.d], [x1, a.y, a.d], [x1, b.y, b.d], [x0, b.y, b.d], topColors[i % topColors.length]);
    for (const x of [x0, x1]) {
      quad([x, 0, a.d], [x, a.y, a.d], [x, b.y, b.d], [x, 0, b.d], sideColor);
    }
  }
  for (const s of [samples[0], samples[samples.length - 1]]) {
    if (s.y > 0.01) quad([x0, 0, s.d], [x1, 0, s.d], [x1, s.y, s.d], [x0, s.y, s.d], sideColor);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

function starShape() {
  const s = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? 1.3 : 0.55;
    const a = (i / 10) * Math.PI * 2 + Math.PI / 2;
    if (i === 0) s.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else s.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  s.closePath();
  return s;
}

export class World {
  constructor(scene) {
    this.scene = scene;
    this.segments = [];
    this.features = [];

    // Shared materials and geometries.
    this.rampMat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, flatShading: true });
    this.rampColors = [new THREE.Color(0xff8a1f), new THREE.Color(0xffc93c)];
    this.megaColors = [new THREE.Color(0xff3d7f), new THREE.Color(0xffe14d)];
    this.rollerColors = [new THREE.Color(0xa0703f), new THREE.Color(0xb9854f)];
    this.rampSide = new THREE.Color(0x7a4a21);

    this.starGeo = new THREE.ExtrudeGeometry(starShape(), { depth: 0.4, bevelEnabled: false });
    this.starGeo.center();
    this.starMat = new THREE.MeshPhongMaterial({ color: 0xffdd00, emissive: 0xb07a00, shininess: 100, flatShading: true });

    this.carBodyGeo = new THREE.BoxGeometry(2.3, 0.9, 4.2);
    this.carCabGeo = new THREE.BoxGeometry(1.9, 0.75, 2.1);
    this.carWheelGeo = new THREE.CylinderGeometry(0.45, 0.45, 0.4, 10).rotateZ(Math.PI / 2);
    this.carCabMat = new THREE.MeshPhongMaterial({ color: 0xcff4ff, shininess: 100 });
    this.carWheelMat = new THREE.MeshLambertMaterial({ color: 0x222222 });
    this.carMats = CAR_COLORS.map((c) => new THREE.MeshPhongMaterial({ color: c, shininess: 70, flatShading: true }));

    this.trunkGeo = new THREE.CylinderGeometry(0.5, 0.7, 3, 6);
    this.leafGeo = new THREE.ConeGeometry(3, 7, 7);
    this.trunkMat = new THREE.MeshLambertMaterial({ color: 0x8b5a2b, flatShading: true });
    this.leafMats = [0x2e9e48, 0x3fbf5a, 0x26874a].map((c) => new THREE.MeshLambertMaterial({ color: c, flatShading: true }));
    this.balloonGeo = new THREE.SphereGeometry(1.4, 12, 10).scale(1, 1.2, 1);
    this.balloonMats = BALLOON_COLORS.map((c) => new THREE.MeshPhongMaterial({ color: c, shininess: 120 }));
    this.stringGeo = new THREE.CylinderGeometry(0.04, 0.04, 4, 3);
    this.stringMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    this.cloudGeo = new THREE.SphereGeometry(6, 9, 7);
    this.cloudMat = new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0x9a9a9a, flatShading: true });
    this.flagPoleGeo = new THREE.CylinderGeometry(0.1, 0.1, 4, 4);
    this.flagGeo = new THREE.PlaneGeometry(1.8, 1.1);
    this.flagMats = BALLOON_COLORS.map((c) => new THREE.MeshLambertMaterial({ color: c, side: THREE.DoubleSide }));
    this.poleMat = new THREE.MeshLambertMaterial({ color: 0xeeeeee });

    this.buildGround();
    this.reset();
  }

  buildGround() {
    const LEN = 600;
    const dirt = canvasTexture(256, (ctx, s) => speckle(ctx, s, '#b98450', ['#a87444', '#c9955f', '#9c6a3c', '#d1a06a'], 500, 5), WALL_X * 2 / SNAP, LEN / SNAP);
    const grass = canvasTexture(256, (ctx, s) => speckle(ctx, s, '#5cc95a', ['#4fb84e', '#6bd968', '#48a847', '#7be077'], 600, 4), 400 / 16, LEN / 16);
    const stripes = canvasTexture(64, (ctx, s) => {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, s, s);
      ctx.fillStyle = '#ff3b3b';
      ctx.fillRect(0, 0, s / 2, s);
    }, LEN / 4, 1);

    this.floor = new THREE.Mesh(new THREE.PlaneGeometry(WALL_X * 2, LEN).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ map: dirt }));
    this.floor.position.y = 0;
    this.grass = new THREE.Mesh(new THREE.PlaneGeometry(400, LEN).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ map: grass }));
    this.grass.position.y = -0.05;
    const wallMat = new THREE.MeshLambertMaterial({ map: stripes });
    const wallGeo = new THREE.BoxGeometry(1, 1.6, LEN);
    this.walls = [-1, 1].map((side) => {
      const w = new THREE.Mesh(wallGeo, wallMat);
      w.position.set(side * (WALL_X + 0.5), 0.8, 0);
      return w;
    });
    this.scene.add(this.floor, this.grass, ...this.walls);
  }

  reset() {
    for (const seg of this.segments) this.disposeSegment(seg);
    this.segments = [];
    this.features = [];
    this.nextD = -BEHIND;
    this.segCount = 0;
  }

  // ---------- Physics queries ----------

  heightAt(d) {
    let h = 0;
    for (const f of this.features) {
      if (d >= f.d0 && d <= f.d1) h = Math.max(h, f.heightAt(d));
    }
    return h;
  }

  lipCrossed(prevD, d) {
    for (const f of this.features) {
      if (f.type === 'ramp' && prevD < f.d1 && d >= f.d1) return f;
    }
    return null;
  }

  // ---------- Generation ----------

  addSegment() {
    const n = this.segCount++;
    const seg = { start: this.nextD, objects: [], cars: [], stars: [], balloons: [], geometries: [] };
    let d = seg.start;

    if (n === 0) {
      d += BEHIND + 25; // flat start runway
    } else {
      const kind = n % 6 === 0 ? 'mega' : (n % 4 === 2 ? 'rollers' : 'ramp');
      d += 12;
      if (Math.random() < 0.55) {
        this.addCarRow(seg, d + 6, rand(0.4, 0.8));
        d += 24; // room to bounce off the cars before the ramp
      }
      if (kind === 'rollers') {
        d = this.addRollers(seg, d + 4);
      } else {
        d = this.addRamp(seg, d + 4, kind === 'mega');
      }
    }

    this.addScenery(seg, seg.start, d);
    seg.end = d;
    this.nextD = d;
    this.segments.push(seg);
  }

  addRamp(seg, d0, mega) {
    const H = mega ? 9 : rand(3.5, 6);
    const L = mega ? 34 : H * 4.5;
    const launch = mega ? 24 : rand(15, 19);
    const d1 = d0 + L;
    const samples = [];
    const N = 14;
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      samples.push({ d: d0 + t * L, y: H * t * t });
    }
    const geo = profileGeometry(samples, -WALL_X, WALL_X, mega ? this.megaColors : this.rampColors, this.rampSide);
    const mesh = new THREE.Mesh(geo, this.rampMat);
    this.scene.add(mesh);
    seg.objects.push(mesh);
    seg.geometries.push(geo);

    this.features.push({
      type: 'ramp', d0, d1, height: H, launch, mega,
      heightAt: (d) => { const t = (d - d0) / L; return H * t * t; },
    });

    // Flags on the lip corners.
    for (const side of [-1, 1]) this.addFlag(seg, side * (WALL_X - 0.6), H, d1 - 0.5);

    // Collectible stars along the flight arc in one lane.
    const tFlight = (launch + Math.sqrt(launch * launch + 2 * GRAVITY * H)) / GRAVITY;
    const lane = pick([-7, 0, 7]);
    const count = mega ? 7 : 5;
    for (let i = 1; i <= count; i++) {
      const t = (i / (count + 1)) * tFlight * 0.9;
      const y = H + launch * t - 0.5 * GRAVITY * t * t + 2;
      this.addStar(seg, lane, y, d1 + SPEED * t);
    }

    const flight = SPEED * tFlight;
    // Sometimes park cars right where the truck lands. CRUNCH.
    if (Math.random() < 0.5) this.addCarRow(seg, d1 + flight * rand(0.85, 1.0), 0.8);
    return d1 + flight + rand(20, 35);
  }

  addRollers(seg, d0) {
    const count = 4;
    const wave = 26;
    const A = 1.8;
    const len = count * wave;
    const samples = [];
    const N = count * 10;
    const f = (d) => A * (1 - Math.cos(((d - d0) / wave) * Math.PI * 2)) / 2;
    for (let i = 0; i <= N; i++) {
      const d = d0 + (i / N) * len;
      samples.push({ d, y: f(d) });
    }
    const geo = profileGeometry(samples, -WALL_X, WALL_X, this.rollerColors, this.rampSide);
    const mesh = new THREE.Mesh(geo, this.rampMat);
    this.scene.add(mesh);
    seg.objects.push(mesh);
    seg.geometries.push(geo);
    this.features.push({ type: 'roller', d0, d1: d0 + len, heightAt: f });
    for (let i = 0; i < count; i++) {
      this.addStar(seg, pick([-7, 0, 7]), A + 3.5, d0 + (i + 0.5) * wave + 4);
    }
    return d0 + len + 20;
  }

  addCarRow(seg, d, fill) {
    for (const x of [-10.5, -5.2, 0, 5.2, 10.5]) {
      if (Math.random() > fill) continue;
      const car = new THREE.Group();
      const bodyMesh = new THREE.Mesh(this.carBodyGeo, pick(this.carMats));
      bodyMesh.position.y = 0.9;
      const cab = new THREE.Mesh(this.carCabGeo, this.carCabMat);
      cab.position.set(0, 1.7, 0.2);
      car.add(bodyMesh, cab);
      for (const [wx, wz] of [[-1.15, -1.3], [1.15, -1.3], [-1.15, 1.3], [1.15, 1.3]]) {
        const w = new THREE.Mesh(this.carWheelGeo, this.carWheelMat);
        w.position.set(wx, 0.45, wz);
        car.add(w);
      }
      car.position.set(x + rand(-0.5, 0.5), 0, -d);
      car.rotation.y = rand(-0.15, 0.15);
      this.scene.add(car);
      seg.objects.push(car);
      seg.cars.push({ mesh: car, x: car.position.x, d, crushed: false, t: 0 });
    }
  }

  addStar(seg, x, y, d) {
    const m = new THREE.Mesh(this.starGeo, this.starMat);
    m.position.set(x, y, -d);
    m.rotation.y = Math.random() * Math.PI;
    this.scene.add(m);
    seg.objects.push(m);
    seg.stars.push({ mesh: m, baseY: y, taken: false, t: 0 });
  }

  addFlag(seg, x, y, d) {
    const pole = new THREE.Mesh(this.flagPoleGeo, this.poleMat);
    pole.position.set(x, y + 2, -d);
    const flag = new THREE.Mesh(this.flagGeo, pick(this.flagMats));
    flag.position.set(x - Math.sign(x) * 0.9, y + 3.4, -d);
    flag.rotation.y = Math.PI / 2;
    this.scene.add(pole, flag);
    seg.objects.push(pole, flag);
  }

  addScenery(seg, d0, d1) {
    for (let d = d0 + rand(0, 10); d < d1; d += rand(9, 18)) {
      for (const side of [-1, 1]) {
        if (Math.random() < 0.3) continue;
        const x = side * rand(WALL_X + 5, 70);
        const s = rand(0.7, 1.4);
        const trunk = new THREE.Mesh(this.trunkGeo, this.trunkMat);
        trunk.position.set(x, 1.5 * s, -d);
        trunk.scale.setScalar(s);
        const leaves = new THREE.Mesh(this.leafGeo, pick(this.leafMats));
        leaves.position.set(x, 6 * s, -d);
        leaves.scale.setScalar(s);
        this.scene.add(trunk, leaves);
        seg.objects.push(trunk, leaves);
      }
    }
    // Floating balloons next to the track.
    for (let d = d0 + rand(10, 40); d < d1; d += rand(30, 60)) {
      const side = Math.random() < 0.5 ? -1 : 1;
      const g = new THREE.Group();
      const b = new THREE.Mesh(this.balloonGeo, pick(this.balloonMats));
      const str = new THREE.Mesh(this.stringGeo, this.stringMat);
      str.position.y = -3.6;
      g.add(b, str);
      const y = rand(6, 14);
      g.position.set(side * rand(WALL_X + 3, WALL_X + 12), y, -d);
      this.scene.add(g);
      seg.objects.push(g);
      seg.balloons.push({ mesh: g, baseY: y, phase: Math.random() * 6 });
    }
    // Puffy clouds.
    if (Math.random() < 0.8) {
      const g = new THREE.Group();
      for (let i = 0; i < 4; i++) {
        const c = new THREE.Mesh(this.cloudGeo, this.cloudMat);
        c.position.set(i * 7 - 10, rand(-1, 2), rand(-3, 3));
        c.scale.setScalar(rand(0.8, 1.3));
        g.add(c);
      }
      g.position.set(pick([-1, 1]) * rand(50, 110), rand(35, 60), -rand(d0, d1));
      this.scene.add(g);
      seg.objects.push(g);
    }
  }

  disposeSegment(seg) {
    for (const o of seg.objects) this.scene.remove(o);
    for (const g of seg.geometries) g.dispose();
  }

  // ---------- Per-frame ----------

  update(dt, truck) {
    const truckD = truck.distance;
    while (this.nextD < truckD + AHEAD) this.addSegment();
    while (this.segments.length && this.segments[0].end < truckD - BEHIND) {
      this.disposeSegment(this.segments.shift());
    }
    const minD = truckD - BEHIND - 50;
    this.features = this.features.filter((f) => f.d1 > minD);

    // Keep the endless ground under the truck (snapped so textures don't slide).
    const z = Math.round(truck.pos.z / SNAP) * SNAP - 200;
    this.floor.position.z = z;
    this.grass.position.z = z;
    for (const w of this.walls) w.position.z = z;

    const events = [];
    const now = performance.now() / 1000;
    const center = truck.mesh.position;
    const cy = truck.pos.y + 2;
    for (const seg of this.segments) {
      for (const s of seg.stars) {
        if (s.taken) {
          s.t += dt;
          s.mesh.scale.setScalar(Math.max(0, 1 + s.t * 4 - s.t * s.t * 30));
          s.mesh.position.y += dt * 10;
          if (s.t > 0.4) s.mesh.visible = false;
          continue;
        }
        s.mesh.rotation.y += dt * 3;
        s.mesh.position.y = s.baseY + Math.sin(now * 3 + s.baseY) * 0.3;
        const dx = s.mesh.position.x - center.x;
        const dy = s.mesh.position.y - cy;
        const dz = s.mesh.position.z - truck.pos.z;
        if (dx * dx + dy * dy + dz * dz < 4 * 4) {
          s.taken = true;
          events.push({ type: 'star', pos: s.mesh.position.clone() });
        }
      }
      for (const c of seg.cars) {
        if (c.crushed) {
          if (c.t < 1) {
            c.t = Math.min(1, c.t + dt * 8);
            c.mesh.scale.set(1 + c.t * 0.25, 1 - c.t * 0.72, 1 + c.t * 0.1);
          }
          continue;
        }
        if (Math.abs(c.x - truck.pos.x) < 2.9 && Math.abs(c.d - truckD) < 3.8 && truck.pos.y < 2.2) {
          c.crushed = true;
          events.push({ type: 'crush', pos: c.mesh.position.clone() });
        }
      }
      for (const b of seg.balloons) {
        b.mesh.position.y = b.baseY + Math.sin(now * 1.5 + b.phase) * 0.8;
      }
    }
    return events;
  }
}
