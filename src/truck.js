import * as THREE from '../vendor/three.module.min.js';
import { WALL_X } from './world.js';

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
const WHEEL_R = 1.15;
const HALF_WIDTH = 1.9;
const SPIN_HOLD = 7;       // rad/s while holding a side in the air
const SWIPE_KICK = 9;      // rad/s added per swipe
const MAX_SPIN = 22;
const HOP_SPEED = 9;

const UP = new THREE.Vector3(0, 1, 0);
const X_AXIS = new THREE.Vector3(1, 0, 0);
const IDENTITY = new THREE.Quaternion();

function approach(v, target, step) {
  return v < target ? Math.min(v + step, target) : Math.max(v - step, target);
}

function buildMesh() {
  const root = new THREE.Group();
  const mats = {
    body: new THREE.MeshPhongMaterial({ shininess: 90, flatShading: true }),
    accent: new THREE.MeshPhongMaterial({ shininess: 60, flatShading: true }),
    dark: new THREE.MeshLambertMaterial({ color: 0x2a2a2a }),
    glass: new THREE.MeshPhongMaterial({ color: 0x9fe3ff, shininess: 120 }),
    tire: new THREE.MeshLambertMaterial({ color: 0x1d1d1d, flatShading: true }),
    hub: new THREE.MeshPhongMaterial({ color: 0xd0d0d0, shininess: 100 }),
    white: new THREE.MeshBasicMaterial({ color: 0xffffff }),
    black: new THREE.MeshBasicMaterial({ color: 0x111111 }),
    light: new THREE.MeshBasicMaterial({ color: 0xfff6a0 }),
  };
  const box = (w, h, d, mat, x, y, z, parent) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    parent.add(m);
    return m;
  };

  // Body pivots at axle height so landing squash looks like suspension.
  const body = new THREE.Group();
  body.position.y = WHEEL_R;
  root.add(body);
  const Y = -WHEEL_R; // offset so children use ground-relative heights
  box(2.4, 0.4, 4.2, mats.dark, 0, 1.3 + Y, 0, body);
  box(3.2, 1.0, 5.0, mats.body, 0, 2.3 + Y, 0, body);
  box(3.24, 0.26, 5.04, mats.accent, 0, 2.25 + Y, 0, body);
  box(2.6, 1.0, 2.2, mats.body, 0, 3.3 + Y, 0.4, body);
  box(2.3, 0.75, 0.08, mats.glass, 0, 3.35 + Y, -0.72, body);
  box(1.8, 0.22, 0.4, mats.accent, 0, 3.9 + Y, 0.2, body);
  box(3.0, 0.4, 0.45, mats.dark, 0, 1.85 + Y, -2.6, body);
  box(3.0, 0.4, 0.45, mats.dark, 0, 1.85 + Y, 2.6, body);
  box(0.5, 0.3, 0.06, mats.light, -1.1, 2.45 + Y, -2.52, body);
  box(0.5, 0.3, 0.06, mats.light, 1.1, 2.45 + Y, -2.52, body);

  // Big cartoon eyes on the windshield.
  const eyeGeo = new THREE.CircleGeometry(0.34, 20);
  const pupilGeo = new THREE.CircleGeometry(0.17, 16);
  const pupils = [];
  for (const sx of [-0.55, 0.55]) {
    const eye = new THREE.Mesh(eyeGeo, mats.white);
    eye.position.set(sx, 3.38 + Y, -0.77);
    eye.rotation.y = Math.PI;
    body.add(eye);
    const pupil = new THREE.Mesh(pupilGeo, mats.black);
    pupil.position.set(sx, 3.36 + Y, -0.79);
    pupil.rotation.y = Math.PI;
    pupil.userData.baseX = sx;
    body.add(pupil);
    pupils.push(pupil);
  }

  // Wheels.
  const tireGeo = new THREE.CylinderGeometry(WHEEL_R, WHEEL_R, 0.95, 12);
  tireGeo.rotateZ(Math.PI / 2);
  const hubGeo = new THREE.CylinderGeometry(0.5, 0.5, 1.0, 8);
  hubGeo.rotateZ(Math.PI / 2);
  const wheels = [];
  for (const [x, z] of [[-1.75, -1.9], [1.75, -1.9], [-1.75, 1.9], [1.75, 1.9]]) {
    const w = new THREE.Group();
    w.position.set(x, WHEEL_R, z);
    w.add(new THREE.Mesh(tireGeo, mats.tire));
    w.add(new THREE.Mesh(hubGeo, mats.hub));
    root.add(w);
    wheels.push(w);
  }
  return { root, body, wheels, pupils, mats };
}

export class Truck {
  constructor(scene) {
    const m = buildMesh();
    this.mesh = m.root;
    this.body = m.body;
    this.wheels = m.wheels;
    this.pupils = m.pupils;
    this.mats = m.mats;
    scene.add(this.mesh);

    this.pos = new THREE.Vector3();
    this.stuntQ = new THREE.Quaternion();
    this.angVel = new THREE.Vector3();
    this._q = new THREE.Quaternion();
    this._q2 = new THREE.Quaternion();
    this._v = new THREE.Vector3();
    this.setColors(TRUCK_COLORS[0]);
    this.reset();
  }

  setColors(c) {
    this.mats.body.color.setHex(c.body);
    this.mats.accent.color.setHex(c.accent);
  }

  reset() {
    this.pos.set(0, 0, 0);
    this.heading = 0;
    this.speed = 0;
    this.vy = 0;
    this.airborne = false;
    this.airTime = 0;
    this.spinAccum = 0;
    this.righting = false;
    this.pitch = 0;
    this.stuntQ.identity();
    this.angVel.set(0, 0, 0);
    this.squash = 0;
    this.squashVel = 0;
    this.wheelSpin = 0;
    this.steerLook = 0;
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
      this.heading = THREE.MathUtils.clamp(this.heading, -MAX_HEADING, MAX_HEADING);
      this.speed += (CRUISE_SPEED - this.speed) * (1 - Math.exp(-1.0 * dt));
      if (input.swipes.includes('up')) {
        this.bump(HOP_SPEED);
        events.push({ type: 'hop' });
      }
    }

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
      const step = 30 * dt;
      if (input.left && input.right) av.x = approach(av.x, -SPIN_HOLD, step); // front flip
      else if (input.left) av.y = approach(av.y, SPIN_HOLD, step);
      else if (input.right) av.y = approach(av.y, -SPIN_HOLD, step);
      for (const s of input.swipes) {
        if (s === 'up') av.x += SWIPE_KICK;          // backflip
        else if (s === 'down') av.x -= SWIPE_KICK;   // front flip
        else if (s === 'left') av.z += SWIPE_KICK;   // barrel roll left
        else if (s === 'right') av.z -= SWIPE_KICK;  // barrel roll right
      }
      av.clampScalar(-MAX_SPIN, MAX_SPIN);
      if (!input.left && !input.right) av.multiplyScalar(Math.exp(-0.4 * dt));

      const angle = av.length() * dt;
      if (angle > 0) {
        this._v.copy(av).normalize();
        this._q.setFromAxisAngle(this._v, angle);
        this.stuntQ.multiply(this._q);
        this.spinAccum += angle;
      }
    }

    if (this.pos.y <= ground) {
      const impact = -this.vy;
      events.push({
        type: 'land',
        airTime: this.airTime,
        spins: this.spinAccum / (Math.PI * 2),
        impact,
      });
      this.pos.y = ground;
      this.vy = 0;
      this.airborne = false;
      this.righting = false;
      this.stuntQ.identity();
      av.set(0, 0, 0);
      this.spinAccum = 0;
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
    this.wheels[0].rotation.order = this.wheels[1].rotation.order = 'YXZ';

    for (const p of this.pupils) {
      p.position.x = p.userData.baseX - this.steerLook * 0.1;
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
