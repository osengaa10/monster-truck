import * as THREE from '../vendor/three.module.min.js';
import { WALL_X } from './world.js';
import { Parts } from './parts.js';

export const TRUCK_COLORS = [
  { body: 0xe53935, accent: 0xffd600 },
  { body: 0x1e88e5, accent: 0xffffff },
  { body: 0x43a047, accent: 0xffd600 },
  { body: 0x8e24aa, accent: 0x00e5ff },
];

const CRUISE_SPEED = 24;
const GRAVITY = 14;        // low "moon" gravity = big, floaty air time
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

const DARK = 0x2a2a2a;
const CHROME = 0xd8dde3;
const GLASS = 0x8fdcff;
const LIGHT = 0xfff3a0;
const RED = 0xff2a2a;
const TIRE = 0x1c1c1c;

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
  // Chassis rails and cross members.
  p.box(0.3, 0.3, 5.4, DARK, -0.9, 1.4 + Y, 0).box(0.3, 0.3, 5.4, DARK, 0.9, 1.4 + Y, 0);
  for (const z of [-1.9, 0, 1.9]) p.box(1.8, 0.25, 0.3, DARK, 0, 1.4 + Y, z);
  // Main body, stripe, hood with scoop.
  p.box(3.0, 0.9, 4.6, B, 0, 2.3 + Y, 0);
  p.box(3.04, 0.2, 4.64, A, 0, 1.95 + Y, 0);
  p.box(2.8, 0.3, 1.6, B, 0, 2.85 + Y, -1.5, -0.1);
  p.box(1.0, 0.32, 0.9, DARK, 0, 3.1 + Y, -1.45);
  p.box(0.9, 0.22, 0.06, CHROME, 0, 3.1 + Y, -1.92);
  // Cab, roof stripe, windows.
  p.box(2.6, 1.05, 2.2, B, 0, 3.3 + Y, 0.4);
  p.box(2.66, 0.14, 2.1, A, 0, 3.88 + Y, 0.4);
  p.box(2.2, 0.7, 0.06, GLASS, 0, 3.35 + Y, -0.72);
  p.box(0.06, 0.6, 1.5, GLASS, -1.31, 3.38 + Y, 0.35).box(0.06, 0.6, 1.5, GLASS, 1.31, 3.38 + Y, 0.35);
  p.box(2.1, 0.55, 0.06, GLASS, 0, 3.4 + Y, 1.52);
  p.box(0.04, 0.5, 0.06, DARK, -1.33, 3.0 + Y, 0.2).box(0.04, 0.5, 0.06, DARK, 1.33, 3.0 + Y, 0.2); // door seams
  p.box(0.06, 0.06, 0.3, CHROME, -1.34, 3.05 + Y, 0.7).box(0.06, 0.06, 0.3, CHROME, 1.34, 3.05 + Y, 0.7); // handles
  // Roof light bar.
  p.box(2.2, 0.16, 0.35, DARK, 0, 4.03 + Y, -0.35);
  for (const x of [-0.75, -0.25, 0.25, 0.75]) p.box(0.38, 0.24, 0.22, LIGHT, x, 4.17 + Y, -0.42);
  // Pickup bed, tailgate, roll bar.
  p.box(0.14, 0.5, 0.8, B, -1.43, 3.0 + Y, 1.9).box(0.14, 0.5, 0.8, B, 1.43, 3.0 + Y, 1.9);
  p.box(3.0, 0.5, 0.14, B, 0, 3.0 + Y, 2.23);
  p.ycyl(0.08, 0.9, 6, CHROME, -1.1, 3.55 + Y, 1.62).ycyl(0.08, 0.9, 6, CHROME, 1.1, 3.55 + Y, 1.62);
  p.xcyl(0.08, 2.28, 6, CHROME, 0, 4.0 + Y, 1.62);
  // Exhaust stacks.
  for (const t of EXHAUST_TIPS) {
    p.ycyl(0.15, 1.75, 10, CHROME, t.x, 3.65 + Y, t.z);
    p.ycyl(0.18, 0.16, 10, DARK, t.x, 4.5 + Y, t.z);
  }
  // Grille, headlights, tail lights.
  p.box(2.0, 0.65, 0.08, CHROME, 0, 2.3 + Y, -2.33);
  for (let x = -0.8; x <= 0.81; x += 0.4) p.box(0.1, 0.5, 0.05, DARK, x, 2.3 + Y, -2.38);
  for (const x of [-1.12, 1.12]) {
    p.box(0.6, 0.45, 0.06, CHROME, x, 2.45 + Y, -2.32);
    p.box(0.46, 0.32, 0.06, LIGHT, x, 2.45 + Y, -2.36);
    p.box(0.45, 0.3, 0.06, RED, x, 2.45 + Y, 2.33);
  }
  // Bumpers, side steps, mirrors.
  p.box(3.3, 0.35, 0.4, CHROME, 0, 1.8 + Y, -2.5).box(3.3, 0.35, 0.4, CHROME, 0, 1.8 + Y, 2.5);
  for (const x of [-1.2, -0.4, 0.4, 1.2]) p.box(0.12, 0.12, 0.06, DARK, x, 1.8 + Y, -2.72);
  p.box(0.3, 0.1, 1.4, DARK, -1.6, 1.95 + Y, 0.4).box(0.3, 0.1, 1.4, DARK, 1.6, 1.95 + Y, 0.4);
  for (const s of [-1, 1]) {
    p.box(0.4, 0.08, 0.08, DARK, s * 1.48, 3.25 + Y, -0.55);
    p.box(0.12, 0.38, 0.28, B, s * 1.72, 3.3 + Y, -0.55);
    p.box(0.02, 0.3, 0.2, CHROME, s * 1.72, 3.3 + Y, -0.7);
  }
  return p.build();
}

// Axles and shocks: they stay put while the body squashes.
function chassisGeometry(A) {
  const p = new Parts();
  for (const z of [-1.9, 1.9]) {
    p.xcyl(0.15, 3.6, 8, DARK, 0, WHEEL_R, z);
    p.box(0.9, 0.5, 0.5, DARK, 0, WHEEL_R, z); // differential
    for (const s of [-1, 1]) {
      for (const dz of [-0.35, 0.35]) {
        p.ycyl(0.07, 1.0, 6, CHROME, s * 1.45, 1.55, z + dz, 0, 0, s * 0.25);
        p.ycyl(0.17, 0.55, 8, A, s * 1.4, 1.8, z + dz, 0, 0, s * 0.25);
      }
    }
  }
  return p.build();
}

function wheelGeometry(A) {
  const p = new Parts();
  p.xcyl(WHEEL_R, 1.0, 20, TIRE, 0, 0, 0);
  // Chunky staggered tread lugs.
  const LUGS = 18;
  for (let i = 0; i < LUGS; i++) {
    const a = (i / LUGS) * TURN;
    const r = WHEEL_R + 0.06;
    p.box(0.46, 0.2, 0.36, TIRE, i % 2 ? -0.26 : 0.26, Math.cos(a) * r, Math.sin(a) * r, a);
  }
  // Rim, lug nuts and a colored center cap (on both faces).
  p.xcyl(0.62, 1.04, 14, CHROME, 0, 0, 0);
  p.xcyl(0.5, 1.06, 14, 0x9aa3ad, 0, 0, 0);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * TURN;
    p.xcyl(0.07, 1.1, 6, DARK, 0, Math.cos(a) * 0.35, Math.sin(a) * 0.35);
  }
  p.xcyl(0.18, 1.12, 10, A, 0, 0, 0);
  return p.build();
}

function buildMesh() {
  const root = new THREE.Group();
  const mats = {
    paint: new THREE.MeshPhongMaterial({ vertexColors: true, shininess: 90 }),
    flames: new THREE.MeshBasicMaterial({ map: flameTexture(), transparent: true, alphaTest: 0.05 }),
    white: new THREE.MeshBasicMaterial({ color: 0xffffff }),
    black: new THREE.MeshBasicMaterial({ color: 0x111111 }),
  };

  // Body pivots at axle height so landing squash looks like suspension.
  const body = new THREE.Group();
  body.position.y = WHEEL_R;
  root.add(body);
  const bodyMesh = new THREE.Mesh(new THREE.BufferGeometry(), mats.paint);
  body.add(bodyMesh);
  const chassisMesh = new THREE.Mesh(new THREE.BufferGeometry(), mats.paint);
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
    f.position.set(s * 1.515, 2.45 + Y, 0.1);
    f.rotation.y = s * Math.PI / 2;
    body.add(f);
  }

  // Big cartoon eyes and eyebrows on the windshield.
  const eyeGeo = new THREE.CircleGeometry(0.34, 20);
  const pupilGeo = new THREE.CircleGeometry(0.17, 16);
  const browGeo = new THREE.BoxGeometry(0.55, 0.1, 0.05);
  const pupils = [];
  const brows = [];
  for (const sx of [-0.55, 0.55]) {
    const eye = new THREE.Mesh(eyeGeo, mats.white);
    eye.position.set(sx, 3.36 + Y, -0.77);
    eye.rotation.y = Math.PI;
    const pupil = new THREE.Mesh(pupilGeo, mats.black);
    pupil.position.set(sx, 3.34 + Y, -0.79);
    pupil.rotation.y = Math.PI;
    pupil.userData.baseX = sx;
    const brow = new THREE.Mesh(browGeo, mats.black);
    brow.position.set(sx, 3.76 + Y, -0.8);
    brow.userData.side = Math.sign(sx);
    body.add(eye, pupil, brow);
    pupils.push(pupil);
    brows.push(brow);
  }

  const wheels = [];
  for (const [x, z] of [[-WHEEL_X, -1.9], [WHEEL_X, -1.9], [-WHEEL_X, 1.9], [WHEEL_X, 1.9]]) {
    const w = new THREE.Mesh(new THREE.BufferGeometry(), mats.paint);
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
    this.trick = new THREE.Vector3(); // rotation done on each axis this jump
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
    this.righting = false;
    this.pitch = 0;
    this.stuntQ.identity();
    this.angVel.set(0, 0, 0);
    this.trick.set(0, 0, 0);
    this.squash = 0;
    this.squashVel = 0;
    this.wheelSpin = 0;
    this.steerLook = 0;
    this.excited = 0;
  }

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
    }
  }

  update(dt, input, world) {
    const events = [];
    let steer = 0;
    if (input.left && !input.right) steer = 1;
    else if (input.right && !input.left) steer = -1;
    this.steerLook += (steer - this.steerLook) * Math.min(1, dt * 8);

    if (!this.airborne) {
      if (steer) this.heading += steer * STEER_RATE * dt;
      else this.heading *= Math.exp(-1.5 * dt); // drift back to straight
      this.speed += (CRUISE_SPEED - this.speed) * (1 - Math.exp(-1.0 * dt));
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
    const lim = WALL_X - HALF_WIDTH;
    if (Math.abs(this.pos.x) > lim) {
      const side = Math.sign(this.pos.x);
      this.pos.x = side * lim;
      if (side * this.forwardX > 0) {
        this.heading = -this.heading * 0.5;
        events.push({ type: 'wall' });
      }
    }

    const d = this.distance;
    const ground = world.heightAt(d);

    if (!this.airborne) {
      const ramp = world.lipCrossed(prevD, d);
      if (ramp) {
        this.airborne = true;
        this.vy = ramp.launch;
        this.pos.y = ramp.height;
        this.airTime = 0;
        events.push({ type: 'launch', mega: ramp.mega });
      } else {
        // Follow the ground, but take off over crests too fast to stick to.
        const ballistic = this.pos.y + this.vy * dt - 0.5 * GRAVITY * dt * dt;
        if (ballistic > ground + 0.02) {
          this.airborne = true;
          this.airTime = 0;
          this.vy -= GRAVITY * dt;
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
      const ahead = world.heightAt(d + 1.5);
      const behind = world.heightAt(d - 1.5);
      const target = Math.atan2(ahead - behind, 3);
      this.pitch += (target - this.pitch) * Math.min(1, dt * 15);
    }

    this.updateVisuals(dt);
    return events;
  }

  updateAir(dt, input, world, events) {
    this.airTime += dt;
    this.vy -= GRAVITY * dt;
    this.pos.y += this.vy * dt;
    this.pitch *= Math.exp(-1.5 * dt);

    const ground = world.heightAt(this.distance);
    const h = this.pos.y - ground;
    const timeToLand = this.vy < 0 ? (this.vy + Math.sqrt(this.vy * this.vy + 2 * GRAVITY * Math.max(h, 0))) / GRAVITY : Infinity;
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
        this.trick.addScaledVector(av, dt);
      }
    }

    if (this.pos.y <= ground) {
      const impact = -this.vy;
      // A trick counts once it's at least 3/4 of the way round.
      const count = (a) => Math.sign(a) * Math.floor(Math.abs(a) / TURN + 0.25);
      events.push({
        type: 'land',
        airTime: this.airTime,
        impact,
        flips: count(this.trick.x),
        spins: count(this.trick.y),
        rolls: count(this.trick.z),
      });
      this.pos.y = ground;
      this.vy = 0;
      this.airborne = false;
      this.righting = false;
      this.stuntQ.identity();
      av.set(0, 0, 0);
      this.trick.set(0, 0, 0);
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

    this.wheelSpin -= (this.airborne ? 1.6 : 1) * this.speed / WHEEL_R * dt;
    for (const w of this.wheels) w.rotation.x = this.wheelSpin;
    // Front wheels turn with steering.
    this.wheels[0].rotation.y = this.wheels[1].rotation.y = this.steerLook * 0.4;

    // Eyes look where you steer; eyebrows shoot up in the air.
    for (const p of this.pupils) p.position.x = p.userData.baseX - this.steerLook * 0.1;
    this.excited += ((this.airborne ? 1 : 0) - this.excited) * Math.min(1, dt * 10);
    for (const b of this.brows) {
      b.position.y = 3.76 - WHEEL_R + this.excited * 0.12;
      b.rotation.z = -b.userData.side * (0.12 + this.excited * 0.25); // happy, then surprised
    }

    this.mesh.position.copy(this.pos);
    this._q.setFromAxisAngle(UP, this.heading);
    this._q2.setFromAxisAngle(X_AXIS, this.pitch);
    this.mesh.quaternion.copy(this._q).multiply(this._q2).multiply(this.stuntQ);
    // Spin around the middle of the truck rather than its wheels.
    if (this.airborne) {
      this._v.set(0, 2, 0).applyQuaternion(this.mesh.quaternion);
      this.mesh.position.set(this.pos.x - this._v.x, this.pos.y + 2 - this._v.y, this.pos.z - this._v.z);
    }
  }
}
