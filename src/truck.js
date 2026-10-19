import * as THREE from '../vendor/three.module.min.js';
import { WALL_X, GRAVITY, SPEED } from './consts.js';
import { Parts, mat, makeMaterial } from './parts.js';

export const TRUCK_COLORS = [
  { body: 0xe53935, accent: 0xffd600 },
  { body: 0x1e88e5, accent: 0xffffff },
  { body: 0x43a047, accent: 0xffd600 },
  { body: 0x8e24aa, accent: 0x00e5ff },
];

const CRUISE_SPEED = SPEED;
const MOON_GRAVITY = 0.45; // gravity multiplier with the moon power-up
const NITRO_SPEED = 1.3;
const NITRO_LAUNCH = 1.25;
const GIANT_SCALE = 1.6;
const MAX_HEADING = 1.0;   // radians; can never turn around
const STEER_RATE = 1.7;
const AIR_STEER_RATE = 0.8;
const WHEEL_R = 1.15;
const WHEEL_X = 2.0;
const HALF_WIDTH = 2.5;
const SPIN_HOLD = 7;       // rad/s while holding a direction in the air
const SPIN_GRAB = 60;      // how fast holding takes over the spin (rad/s²)
const SPIN_DECAY = 1.2;    // how fast spins you aren't holding fade out
const SWIPE_KICK = 9;      // rad/s added per swipe
const MAX_SPIN = 22;
const HOP_SPEED = 9;
const TURN = Math.PI * 2;

const UP = new THREE.Vector3(0, 1, 0);
const X_AXIS = new THREE.Vector3(1, 0, 0);
const IDENTITY = new THREE.Quaternion();

const DARK = mat(0x2a2a2a, 'metal');
const CHROME = mat(0xd8dde3, 'chrome');
const GLASS = mat(0x2a3a48, 'glass');
const LIGHT = mat(0xfff6d0, 'light');
const RED = mat(0xff2a2a, 'light');
const TIRE = mat(0x1c1c1c, 'rubber');
const RIM = mat(0x9aa3ad, 'chrome');

// Smoke comes out of the tops of the exhaust stacks (truck-local coordinates).
export const EXHAUST_TIPS = [new THREE.Vector3(-0.7, 4.6, 1.65), new THREE.Vector3(0.7, 4.6, 1.65)];

function approach(v, target, step) {
  return v < target ? Math.min(v + step, target) : Math.max(v - step, target);
}

// Holding a direction: take over quickly, but never slow down a faster spin
// that's already going the same way.
function drive(v, target, step) {
  if (Math.sign(v) === Math.sign(target) && Math.abs(v) >= Math.abs(target)) return v;
  // Switching direction is extra snappy.
  return approach(v, target, Math.sign(v) === -Math.sign(target) ? step * 3 : step);
}

// Swiping: instantly reverse a spin going the other way, otherwise add to it.
function kick(v, dir) {
  return Math.sign(v) === -dir ? dir * SWIPE_KICK : v + dir * SWIPE_KICK;
}

function flameTexture() {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 128;
  const ctx = c.getContext('2d');
  const grad = ctx.createLinearGradient(512, 0, 60, 0);
  grad.addColorStop(0, '#fff36b');
  grad.addColorStop(0.35, '#ffb300');
  grad.addColorStop(0.75, '#ff3d00');
  grad.addColorStop(1, '#c41c00');
  const lengths = [300, 420, 360, 450, 280];
  lengths.forEach((len, i) => {
    const y = 18 + i * 23;
    ctx.beginPath();
    ctx.moveTo(512, y - 16);
    ctx.bezierCurveTo(512 - len * 0.4, y - 20, 512 - len * 0.75, y + 8, 512 - len, y - 14);
    ctx.bezierCurveTo(512 - len * 0.7, y + 16, 512 - len * 0.35, y + 22, 512, y + 18);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#7a1500';
    ctx.stroke();
  });
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Everything that bounces with the suspension. Heights are from the ground;
// the body group sits at axle height, so subtract WHEEL_R.
function bodyGeometry(B, A) {
  const Y = -WHEEL_R;
  const p = new Parts();
  const v = (x, y, z) => new THREE.Vector3(x, y + Y, z);
  // Tube frame rails and cross members.
  for (const x of [-0.9, 0.9]) p.tube(0.13, v(x, 1.45, -2.6), v(x, 1.45, 2.6), 8, DARK);
  for (const z of [-2.3, -0.6, 0.9, 2.3]) p.tube(0.1, v(-0.9, 1.45, z), v(0.9, 1.45, z), 8, DARK);
  // Fiberglass body: lower body with hood, then the cab on top.
  p.profile([[-2.35, 1.85], [2.35, 1.85], [2.45, 2.15], [2.42, 2.62], [1.0, 2.86], [-2.3, 2.8], [-2.42, 2.2]], 3.0, B, { y: Y, bevel: 0.12 });
  p.box(3.06, 0.16, 4.72, A, 0, 1.98 + Y, 0); // accent stripe along the bottom edge
  p.profile([[0.78, 2.8], [0.66, 3.85], [-1.32, 3.88], [-1.48, 2.8]], 2.6, B, { y: Y, bevel: 0.1 });
  p.box(2.5, 0.08, 1.7, A, 0, 3.98 + Y, 0.35); // roof stripe
  // Windows: windshield, side glass (sticks out a hair past the cab sides), rear.
  p.box(2.2, 0.82, 0.05, GLASS, 0, 3.33 + Y, -0.84, 0.11);
  p.profile([[0.6, 3.0], [0.52, 3.68], [-1.15, 3.7], [-1.28, 3.0]], 2.66, GLASS, { y: Y, bevel: 0.01 });
  p.box(2.0, 0.6, 0.05, GLASS, 0, 3.38 + Y, 1.6);
  for (const s of [-1, 1]) {
    p.box(0.04, 0.85, 0.06, DARK, s * 1.34, 3.05 + Y, 0.2); // door seam
    p.box(0.06, 0.06, 0.3, CHROME, s * 1.36, 3.15 + Y, 0.6); // handle
    p.box(0.42, 0.07, 0.07, DARK, s * 1.5, 3.25 + Y, -0.55); // mirror arm
    p.box(0.12, 0.34, 0.26, B, s * 1.74, 3.3 + Y, -0.55);
  }
  // Supercharger poking out of the hood, with an air scoop on top.
  p.box(0.9, 0.22, 0.8, CHROME, 0, 2.95 + Y, -1.5);
  for (const x of [-0.27, 0, 0.27]) p.box(0.07, 0.24, 0.76, DARK, x, 2.96 + Y, -1.5);
  p.profile([[-0.42, 3.06], [0.48, 3.06], [0.38, 3.2], [-0.38, 3.26]], 0.8, B, { y: Y, z: -1.5, bevel: 0.04 });
  p.box(0.6, 0.12, 0.05, DARK, 0, 3.14 + Y, -1.96);
  // Roof light bar.
  p.box(2.2, 0.16, 0.35, DARK, 0, 4.03 + Y, -0.35);
  for (const x of [-0.75, -0.25, 0.25, 0.75]) p.box(0.38, 0.22, 0.06, LIGHT, x, 4.05 + Y, -0.54);
  // Pickup bed: floor, rails, tailgate, roll bar.
  p.box(2.7, 0.08, 1.5, DARK, 0, 2.82 + Y, 1.6);
  for (const s of [-1, 1]) p.box(0.12, 0.38, 1.6, B, s * 1.42, 3.0 + Y, 1.55);
  p.box(3.0, 0.4, 0.12, B, 0, 2.98 + Y, 2.46);
  p.ycyl(0.08, 0.9, 8, CHROME, -1.1, 3.55 + Y, 1.62).ycyl(0.08, 0.9, 8, CHROME, 1.1, 3.55 + Y, 1.62);
  p.xcyl(0.08, 2.28, 8, CHROME, 0, 4.0 + Y, 1.62);
  // Exhaust stacks.
  for (const t of EXHAUST_TIPS) {
    p.ycyl(0.15, 1.75, 12, CHROME, t.x, 3.65 + Y, t.z);
    p.ycyl(0.18, 0.16, 12, DARK, t.x, 4.5 + Y, t.z);
  }
  // Grille, headlights, tail lights.
  p.box(2.0, 0.6, 0.08, CHROME, 0, 2.35 + Y, -2.58);
  for (let x = -0.8; x <= 0.81; x += 0.2) p.box(0.06, 0.48, 0.05, DARK, x, 2.35 + Y, -2.63);
  for (const x of [-1.12, 1.12]) {
    p.box(0.58, 0.4, 0.06, CHROME, x, 2.4 + Y, -2.57);
    p.box(0.46, 0.3, 0.06, LIGHT, x, 2.4 + Y, -2.61);
    p.box(0.42, 0.3, 0.06, RED, x, 2.45 + Y, 2.56);
  }
  // Tube bumpers front and back.
  for (const z of [-2.85, 2.75]) {
    p.tube(0.1, v(-1.6, 1.8, z), v(1.6, 1.8, z), 10, CHROME);
    p.tube(0.08, v(-1.2, 1.8, z), v(-0.9, 1.45, z * 0.9), 8, CHROME);
    p.tube(0.08, v(1.2, 1.8, z), v(0.9, 1.45, z * 0.9), 8, CHROME);
  }
  // Side steps.
  p.box(0.3, 0.08, 1.4, DARK, -1.62, 1.95 + Y, 0.4).box(0.3, 0.08, 1.4, DARK, 1.62, 1.95 + Y, 0.4);
  return p.build();
}

// Axles, links and shocks: they stay put while the body squashes.
function chassisGeometry(A) {
  const p = new Parts();
  const v = (x, y, z) => new THREE.Vector3(x, y, z);
  for (const z of [-1.9, 1.9]) {
    // Axle housing and differential.
    p.xcyl(0.17, 3.5, 10, DARK, 0, WHEEL_R, z);
    p.add(new THREE.SphereGeometry(0.42, 12, 8), DARK, 0.2, WHEEL_R, z);
    // 4-link bars from the axle up to the frame.
    const dir = -Math.sign(z);
    for (const x of [-0.75, 0.75]) p.tube(0.07, v(x, WHEEL_R - 0.1, z), v(x * 0.9, 1.35, z + dir * 1.1), 8, CHROME);
    p.tube(0.06, v(-0.3, WHEEL_R + 0.25, z), v(-0.6, 1.45, z + dir * 0.9), 8, CHROME);
    p.tube(0.06, v(0.3, WHEEL_R + 0.25, z), v(0.6, 1.45, z + dir * 0.9), 8, CHROME);
    // Two nitrogen shocks per corner: colored body, chrome shaft, reservoir.
    for (const s of [-1, 1]) {
      for (const dz of [-0.32, 0.32]) {
        p.ycyl(0.07, 1.0, 8, CHROME, s * 1.42, 1.5, z + dz, 0, 0, s * 0.22);
        p.ycyl(0.16, 0.6, 12, A, s * 1.36, 1.85, z + dz, 0, 0, s * 0.22);
        p.ycyl(0.09, 0.4, 8, CHROME, s * 1.18, 1.95, z + dz, 0, 0, s * 0.22);
      }
    }
  }
  return p.build();
}

function wheelGeometry(A) {
  const p = new Parts();
  // Tire carcass: rounded sidewalls (a lathe turned on its side).
  const R = WHEEL_R - 0.08;
  const prof = [[0.66, -0.52], [0.9, -0.54], [1.02, -0.5], [R, -0.38], [R + 0.02, 0], [R, 0.38], [1.02, 0.5], [0.9, 0.54], [0.66, 0.52]]
    .map(([r, y]) => new THREE.Vector2(r, y));
  p.add(new THREE.LatheGeometry(prof, 28).rotateZ(Math.PI / 2), TIRE);
  // Deep chevron paddle tread: two staggered rows of angled lugs.
  const LUGS = 20;
  for (let i = 0; i < LUGS; i++) {
    const a = (i / LUGS) * TURN;
    for (const side of [-1, 1]) {
      const aa = a + (side > 0 ? TURN / LUGS / 2 : 0);
      const r = R + 0.07;
      p.box(0.44, 0.18, 0.2, TIRE, side * 0.24, Math.cos(aa) * r, Math.sin(aa) * r, aa, side * 0.5, 0);
    }
  }
  // Beadlock rim: dish, bolt ring and a colored center cap (both faces).
  for (const s of [-1, 1]) {
    p.xcyl(0.66, 0.06, 20, RIM, s * 0.5, 0, 0);
    p.xcyl(0.6, 0.04, 20, CHROME, s * 0.53, 0, 0);
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TURN;
      p.xcyl(0.035, 0.08, 6, DARK, s * 0.55, Math.cos(a) * 0.58, Math.sin(a) * 0.58);
    }
    p.xcyl(0.36, 0.06, 16, DARK, s * 0.55, 0, 0);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TURN;
      p.xcyl(0.05, 0.1, 6, CHROME, s * 0.57, Math.cos(a) * 0.24, Math.sin(a) * 0.24);
    }
    p.xcyl(0.15, 0.12, 12, A, s * 0.58, 0, 0);
  }
  return p.build();
}

function buildMesh() {
  const root = new THREE.Group();
  const mats = {
    paint: makeMaterial({ clearcoat: true }),
    flames: new THREE.MeshStandardMaterial({ map: flameTexture(), transparent: true, alphaTest: 0.05, roughness: 0.3, metalness: 0.1 }),
    white: new THREE.MeshBasicMaterial({ color: 0xffffff }),
    black: new THREE.MeshBasicMaterial({ color: 0x111111 }),
  };

  // Body pivots at axle height so landing squash looks like suspension.
  const body = new THREE.Group();
  body.position.y = WHEEL_R;
  root.add(body);
  const bodyMesh = new THREE.Mesh(new THREE.BufferGeometry(), mats.paint);
  bodyMesh.castShadow = true;
  body.add(bodyMesh);
  const chassisMesh = new THREE.Mesh(new THREE.BufferGeometry(), mats.paint);
  chassisMesh.castShadow = true;
  root.add(chassisMesh);

  // Flame decals down both sides, licking backwards from the front.
  const Y = -WHEEL_R;
  for (const s of [-1, 1]) {
    const g = new THREE.PlaneGeometry(4.2, 0.62);
    if (s < 0) {
      const uv = g.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setX(i, 1 - uv.getX(i));
    }
    const f = new THREE.Mesh(g, mats.flames);
    f.position.set(s * 1.525, 2.42 + Y, 0.1);
    f.rotation.y = s * Math.PI / 2;
    body.add(f);
  }

  // Big cartoon eyes and eyebrows on the windshield.
  const eyeGeo = new THREE.CircleGeometry(0.3, 24);
  const pupilGeo = new THREE.CircleGeometry(0.15, 20);
  const browGeo = new THREE.BoxGeometry(0.55, 0.1, 0.05);
  const pupils = [];
  const brows = [];
  for (const sx of [-0.55, 0.55]) {
    const eye = new THREE.Mesh(eyeGeo, mats.white);
    // Stuck on the windshield, which leans back a little.
    eye.position.set(sx, 3.36 + Y, -0.88);
    eye.rotation.set(0.11, Math.PI, 0);
    const pupil = new THREE.Mesh(pupilGeo, mats.black);
    pupil.position.set(sx, 3.34 + Y, -0.9);
    pupil.rotation.set(0.11, Math.PI, 0);
    pupil.userData.baseX = sx;
    const brow = new THREE.Mesh(browGeo, mats.black);
    brow.position.set(sx, 3.72 + Y, -0.86);
    brow.userData.side = Math.sign(sx);
    body.add(eye, pupil, brow);
    pupils.push(pupil);
    brows.push(brow);
  }

  const wheels = [];
  for (const [x, z] of [[-WHEEL_X, -1.9], [WHEEL_X, -1.9], [-WHEEL_X, 1.9], [WHEEL_X, 1.9]]) {
    const w = new THREE.Mesh(new THREE.BufferGeometry(), mats.paint);
    w.castShadow = true;
    w.position.set(x, WHEEL_R, z);
    w.rotation.order = 'YXZ';
    root.add(w);
    wheels.push(w);
  }
  return { root, body, bodyMesh, chassisMesh, wheels, pupils, brows };
}

export class Truck {
  constructor(scene) {
    const m = buildMesh();
    this.mesh = m.root;
    this.body = m.body;
    this.bodyMesh = m.bodyMesh;
    this.chassisMesh = m.chassisMesh;
    this.wheels = m.wheels;
    this.pupils = m.pupils;
    this.brows = m.brows;
    scene.add(this.mesh);

    this.pos = new THREE.Vector3();
    this.stuntQ = new THREE.Quaternion();
    this.angVel = new THREE.Vector3();
    // Rotation done this jump on each axis, split by direction so a backflip
    // followed by a front flip counts as both instead of cancelling out.
    this.trickPos = new THREE.Vector3();
    this.trickNeg = new THREE.Vector3();
    this._q = new THREE.Quaternion();
    this._q2 = new THREE.Quaternion();
    this._v = new THREE.Vector3();
    this.setColors(TRUCK_COLORS[0]);
    this.reset();
  }

  setColors(c) {
    const old = [this.bodyMesh.geometry, this.chassisMesh.geometry, this.wheels[0].geometry];
    this.bodyMesh.geometry = bodyGeometry(c.body, c.accent);
    this.chassisMesh.geometry = chassisGeometry(c.accent);
    const wheel = wheelGeometry(c.accent);
    for (const w of this.wheels) w.geometry = wheel;
    for (const g of old) g.dispose();
  }

  reset() {
    this.pos.set(0, 0, 0);
    this.heading = 0;
    this.speed = 0;
    this.vy = 0;
    this.airborne = false;
    this.airTime = 0;
    this.jumpMega = false;
    this.righting = false;
    this.pitch = 0;
    this.stuntQ.identity();
    this.angVel.set(0, 0, 0);
    this.trickPos.set(0, 0, 0);
    this.trickNeg.set(0, 0, 0);
    this.squash = 0;
    this.squashVel = 0;
    this.wheelSpin = 0;
    this.steerLook = 0;
    this.excited = 0;
    this.droop = 0;
    this.powers = { nitro: 0, moon: 0, giant: 0, magnet: 0 };
    this.scale = 1;
  }

  addPower(kind, seconds) {
    this.powers[kind] = Math.max(this.powers[kind], seconds);
  }

  get gravity() { return GRAVITY * (this.powers.moon > 0 ? MOON_GRAVITY : 1); }
  get halfWidth() { return HALF_WIDTH * this.scale; }

  get distance() { return -this.pos.z; }
  get forwardX() { return -Math.sin(this.heading); }
  get forwardZ() { return -Math.cos(this.heading); }

  // Small bounce, e.g. after crushing a car.
  bump(vy) {
    if (this.airborne) {
      this.vy = Math.max(this.vy, vy);
    } else {
      this.airborne = true;
      this.vy = vy;
      this.airTime = 0;
      this.jumpMega = false;
    }
  }

  update(dt, input, world) {
    const events = [];
    for (const k in this.powers) this.powers[k] = Math.max(0, this.powers[k] - dt);
    this.scale += ((this.powers.giant > 0 ? GIANT_SCALE : 1) - this.scale) * Math.min(1, dt * 4);
    const g = this.gravity;
    let steer = 0;
    if (input.left && !input.right) steer = 1;
    else if (input.right && !input.left) steer = -1;
    this.steerLook += (steer - this.steerLook) * Math.min(1, dt * 8);

    if (!this.airborne) {
      if (steer) this.heading += steer * STEER_RATE * dt;
      else this.heading *= Math.exp(-1.5 * dt); // drift back to straight
      const cruise = CRUISE_SPEED * (this.powers.nitro > 0 ? NITRO_SPEED : 1);
      this.speed += (cruise - this.speed) * (1 - Math.exp(-1.0 * dt));
      if (input.swipes.includes('up')) {
        this.bump(HOP_SPEED);
        events.push({ type: 'hop' });
      }
    } else if (steer) {
      // A little air control, so you can line up with stars and landings.
      this.heading += steer * AIR_STEER_RATE * dt;
    }
    this.heading = THREE.MathUtils.clamp(this.heading, -MAX_HEADING, MAX_HEADING);

    // Horizontal motion.
    const prevD = this.distance;
    this.pos.x += this.forwardX * this.speed * dt;
    this.pos.z += this.forwardZ * this.speed * dt;

    // Bouncy walls.
    const lim = WALL_X - this.halfWidth;
    if (Math.abs(this.pos.x) > lim) {
      const side = Math.sign(this.pos.x);
      this.pos.x = side * lim;
      if (side * this.forwardX > 0) {
        this.heading = -this.heading * 0.5;
        events.push({ type: 'wall' });
      }
    }

    const d = this.distance;
    const x = this.pos.x;
    const ground = world.heightAt(d, x);

    if (!this.airborne) {
      const ramp = world.lipCrossed(prevD, d, x);
      if (ramp) {
        this.airborne = true;
        this.vy = ramp.launch * (this.powers.nitro > 0 ? NITRO_LAUNCH : 1);
        this.pos.y = ramp.height;
        this.airTime = 0;
        this.jumpMega = !!ramp.mega;
        events.push({ type: 'launch', mega: ramp.mega, label: ramp.label });
      } else {
        // Follow the ground, but take off over crests too fast to stick to.
        const ballistic = this.pos.y + this.vy * dt - 0.5 * g * dt * dt;
        if (ground - this.pos.y > Math.max(0.6, this.speed * dt * 1.6)) {
          // Drove onto the side of something taller: just pop up onto it
          // (following the ground here would fling the truck into the sky).
          this.pos.y = ground;
          this.vy = 0;
        } else if (ballistic > ground + 0.02) {
          this.airborne = true;
          this.airTime = 0;
          this.jumpMega = false;
          this.vy -= g * dt;
          this.pos.y = ballistic;
        } else {
          this.vy = (ground - this.pos.y) / dt;
          this.pos.y = ground;
        }
      }
    }

    if (this.airborne) {
      this.updateAir(dt, input, world, events);
    } else {
      // Tilt the truck to match the ground slope.
      const ahead = world.heightAt(d + 1.5, x);
      const behind = world.heightAt(d - 1.5, x);
      const target = Math.atan2(ahead - behind, 3);
      this.pitch += (target - this.pitch) * Math.min(1, dt * 15);
    }

    this.updateVisuals(dt);
    return events;
  }

  updateAir(dt, input, world, events) {
    this.airTime += dt;
    const g = this.gravity;
    this.vy -= g * dt;
    this.pos.y += this.vy * dt;
    this.pitch *= Math.exp(-1.5 * dt);

    const ground = world.heightAt(this.distance, this.pos.x);
    const h = this.pos.y - ground;
    const timeToLand = this.vy < 0 ? (this.vy + Math.sqrt(this.vy * this.vy + 2 * g * Math.max(h, 0))) / g : Infinity;
    // Magic auto-landing: just before touchdown, smoothly turn upright.
    this.righting = this.vy < 0 && timeToLand < 0.45;

    const av = this.angVel;
    if (this.righting) {
      av.multiplyScalar(Math.exp(-12 * dt));
      this.stuntQ.slerp(IDENTITY, 1 - Math.exp(-11 * dt));
    } else {
      const step = SPIN_GRAB * dt;
      const decay = Math.exp(-SPIN_DECAY * dt);
      // Which way each axis is being held: x = flip, y = spin, z = barrel roll.
      let hx = 0, hy = 0, hz = 0;
      if (input.left && input.right) hx = -1; // front flip
      else if (input.left) hy = 1;
      else if (input.right) hy = -1;
      if (input.up) hx = 1;                   // backflip
      else if (input.down) hx = -1;
      if (input.rollLeft) hz = 1;
      else if (input.rollRight) hz = -1;
      av.x = hx ? drive(av.x, hx * SPIN_HOLD, step) : av.x * decay;
      av.y = hy ? drive(av.y, hy * SPIN_HOLD, step) : av.y * decay;
      av.z = hz ? drive(av.z, hz * SPIN_HOLD, step) : av.z * decay;
      for (const s of input.swipes) {
        if (s === 'up') av.x = kick(av.x, 1);          // backflip
        else if (s === 'down') av.x = kick(av.x, -1);  // front flip
        else if (s === 'left') av.z = kick(av.z, 1);   // barrel roll left
        else if (s === 'right') av.z = kick(av.z, -1); // barrel roll right
      }
      av.clampScalar(-MAX_SPIN, MAX_SPIN);

      const angle = av.length() * dt;
      if (angle > 0) {
        this._v.copy(av).normalize();
        this._q.setFromAxisAngle(this._v, angle);
        this.stuntQ.multiply(this._q);
        for (const k of ['x', 'y', 'z']) {
          if (av[k] > 0) this.trickPos[k] += av[k] * dt;
          else this.trickNeg[k] -= av[k] * dt;
        }
      }
    }

    if (this.pos.y <= ground) {
      const impact = -this.vy;
      // A trick counts once it's at least 3/4 of the way round.
      const count = (a) => Math.floor(a / TURN + 0.25);
      const tp = this.trickPos;
      const tn = this.trickNeg;
      events.push({
        type: 'land',
        airTime: this.airTime,
        mega: this.jumpMega,
        impact,
        backflips: count(tp.x),
        frontflips: count(tn.x),
        spinsL: count(tp.y),
        spinsR: count(tn.y),
        rollsL: count(tp.z),
        rollsR: count(tn.z),
      });
      this.pos.y = ground;
      this.vy = 0;
      this.airborne = false;
      this.righting = false;
      this.stuntQ.identity();
      av.set(0, 0, 0);
      this.trickPos.set(0, 0, 0);
      this.trickNeg.set(0, 0, 0);
      this.squashVel -= Math.min(impact * 0.07, 1.4);
    }
  }

  updateVisuals(dt) {
    // Squash-and-stretch spring.
    const k = 220, c = 11;
    this.squashVel += (-k * this.squash - c * this.squashVel) * dt;
    this.squash += this.squashVel * dt;
    const s = THREE.MathUtils.clamp(this.squash, -0.45, 0.35);
    this.body.scale.set(1 - s * 0.5, 1 + s, 1 - s * 0.3);
    if (!this.airborne) this.body.position.y = WHEEL_R + Math.sin(performance.now() * 0.025) * 0.04;
    // Body leans into turns on the ground.
    this.body.rotation.z += ((this.airborne ? 0 : -this.steerLook * 0.06) - this.body.rotation.z) * Math.min(1, dt * 6);

    // In the air the suspension stretches out and the wheels hang down.
    this.droop += ((this.airborne ? 1 : 0) - this.droop) * Math.min(1, dt * (this.airborne ? 4 : 20));
    const hang = -this.droop * 0.3;
    this.chassisMesh.position.y = hang;
    this.wheelSpin -= (this.airborne ? 1.6 : 1) * this.speed / WHEEL_R * dt;
    for (const w of this.wheels) {
      w.rotation.x = this.wheelSpin;
      w.position.y = WHEEL_R + hang;
    }
    // Front wheels turn with steering.
    this.wheels[0].rotation.y = this.wheels[1].rotation.y = this.steerLook * 0.4;

    // Eyes look where you steer; eyebrows shoot up in the air.
    for (const p of this.pupils) p.position.x = p.userData.baseX - this.steerLook * 0.1;
    this.excited += ((this.airborne ? 1 : 0) - this.excited) * Math.min(1, dt * 10);
    for (const b of this.brows) {
      b.position.y = 3.72 - WHEEL_R + this.excited * 0.1;
      b.rotation.z = -b.userData.side * (0.12 + this.excited * 0.25); // happy, then surprised
    }

    this.mesh.position.copy(this.pos);
    this.mesh.scale.setScalar(this.scale);
    this._q.setFromAxisAngle(UP, this.heading);
    this._q2.setFromAxisAngle(X_AXIS, this.pitch);
    this.mesh.quaternion.copy(this._q).multiply(this._q2).multiply(this.stuntQ);
    // Spin around the middle of the truck rather than its wheels.
    if (this.airborne) {
      const pivot = 2 * this.scale;
      this._v.set(0, pivot, 0).applyQuaternion(this.mesh.quaternion);
      this.mesh.position.set(this.pos.x - this._v.x, this.pos.y + pivot - this._v.y, this.pos.z - this._v.z);
    }
  }
}
