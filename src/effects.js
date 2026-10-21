import * as THREE from '../vendor/three.module.min.js';
import { softDot } from './textures.js';

const CONFETTI_COLORS = [0xff3d7f, 0xffdd00, 0x00e5ff, 0x76ff03, 0xff9100, 0xd500f9, 0xffffff];
const DUST_COLORS = [0xc9a77c, 0xb8946a, 0xd9c09a];
const MUD_COLORS = [0x5a3a1e, 0x6b4526, 0x4a2f18];
const FLAME_COLORS = [0xffe082, 0xffb300, 0xff6d00, 0xff3d00];

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _c = new THREE.Color();
const Z_AXIS = new THREE.Vector3(0, 0, 1);

// A fixed-size pool of instanced particles.
// - billboard: always faces the camera (soft dust, smoke, flames)
// - floor: bounces off the ground (debris chunks)
class Pool {
  constructor(scene, geometry, material, max, { gravity, drag, grow, billboard = false, floor = false }) {
    this.max = max;
    this.gravity = gravity;
    this.drag = drag;
    this.grow = grow;
    this.billboard = billboard;
    this.floor = floor;
    this.mesh = new THREE.InstancedMesh(geometry, material, max);
    this.mesh.frustumCulled = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.pos = new Float32Array(max * 3);
    this.vel = new Float32Array(max * 3);
    this.rot = new Float32Array(max * 3);
    this.spin = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max);
    this.size = new Float32Array(max);
    this.next = 0;
    _m.makeScale(0, 0, 0);
    for (let i = 0; i < max; i++) {
      this.mesh.setMatrixAt(i, _m);
      this.mesh.setColorAt(i, _c.set(0xffffff));
    }
    scene.add(this.mesh);
  }

  spawn(x, y, z, vx, vy, vz, color, size, life) {
    const i = this.next;
    this.next = (this.next + 1) % this.max;
    this.pos.set([x, y, z], i * 3);
    this.vel.set([vx, vy, vz], i * 3);
    this.rot.set([Math.random() * 6, Math.random() * 6, Math.random() * 6], i * 3);
    const spin = this.billboard ? 2 : 16;
    this.spin.set([(Math.random() - 0.5) * spin, (Math.random() - 0.5) * spin, (Math.random() - 0.5) * spin], i * 3);
    this.life[i] = this.maxLife[i] = life;
    this.size[i] = size;
    this.mesh.setColorAt(i, _c.set(color));
    this.mesh.instanceColor.needsUpdate = true;
  }

  // Particles shrink away as they get near the camera, so the camera
  // never flies through a giant blob of dust or smoke.
  update(dt, camera) {
    const drag = Math.exp(-this.drag * dt);
    const camPos = camera.position;
    let dirty = false;
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) continue;
      dirty = true;
      this.life[i] -= dt;
      const k = i * 3;
      if (this.life[i] <= 0) {
        _m.makeScale(0, 0, 0);
        this.mesh.setMatrixAt(i, _m);
        continue;
      }
      this.vel[k + 1] -= this.gravity * dt;
      for (let j = 0; j < 3; j++) {
        this.vel[k + j] *= drag;
        this.pos[k + j] += this.vel[k + j] * dt;
        this.rot[k + j] += this.spin[k + j] * dt;
      }
      if (this.floor && this.pos[k + 1] < 0.1) {
        this.pos[k + 1] = 0.1;
        this.vel[k + 1] *= -0.35;
        this.vel[k] *= 0.6;
        this.vel[k + 2] *= 0.6;
        this.spin[k] *= 0.5;
        this.spin[k + 2] *= 0.5;
      }
      const t = this.life[i] / this.maxLife[i];
      _p.set(this.pos[k], this.pos[k + 1], this.pos[k + 2]);
      const near = THREE.MathUtils.clamp((_p.distanceTo(camPos) - 5) / 7, 0, 1);
      const sc = near * this.size[i] * (this.grow ? (1 + (1 - t) * 1.5) * Math.min(1, t * 3) : Math.min(1, t * 4));
      if (this.billboard) _q.copy(camera.quaternion).multiply(_q2.setFromAxisAngle(Z_AXIS, this.rot[k]));
      else _q.setFromEuler(_e.set(this.rot[k], this.rot[k + 1], this.rot[k + 2]));
      _s.set(sc, sc, sc);
      this.mesh.setMatrixAt(i, _m.compose(_p, _q, _s));
    }
    if (dirty) this.mesh.instanceMatrix.needsUpdate = true;
  }
}

export class Effects {
  constructor(scene) {
    const dot = softDot(64);
    this.confetti = new Pool(
      scene,
      new THREE.PlaneGeometry(0.3, 0.45),
      new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }),
      500,
      { gravity: 6, drag: 1.2, grow: false },
    );
    this.dust = new Pool(
      scene,
      new THREE.PlaneGeometry(1.6, 1.6),
      new THREE.MeshLambertMaterial({ map: dot, transparent: true, opacity: 0.55, depthWrite: false }),
      260,
      { gravity: -1.2, drag: 2.2, grow: true, billboard: true },
    );
    this.glow = new Pool(
      scene,
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ map: dot, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }),
      200,
      { gravity: -2, drag: 3, grow: false, billboard: true },
    );
    this.chunks = new Pool(
      scene,
      new THREE.BoxGeometry(0.4, 0.22, 0.55),
      new THREE.MeshStandardMaterial({ roughness: 0.6, metalness: 0.3 }),
      160,
      { gravity: 22, drag: 0.4, grow: false, floor: true },
    );
    // Tires and hubcaps that pop off crushed vehicles and bounce away.
    this.discs = new Pool(
      scene,
      new THREE.CylinderGeometry(0.5, 0.5, 0.28, 16),
      new THREE.MeshStandardMaterial({ roughness: 0.55, metalness: 0.4 }),
      40,
      { gravity: 22, drag: 0.3, grow: false, floor: true },
    );
    this.wowEl = document.getElementById('wow');
    this.popupLayer = document.getElementById('popups');
  }

  confettiBurst(pos, n = 120, speed = 16, colors = CONFETTI_COLORS) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * speed * 0.6;
      this.confetti.spawn(
        pos.x, pos.y + 3, pos.z - 5,
        Math.cos(a) * r, speed * (0.6 + Math.random() * 0.6), Math.sin(a) * r * 0.5 - 5, // drift away from the camera
        colors[(Math.random() * colors.length) | 0], 0.8 + Math.random() * 0.6, 2 + Math.random() * 1.5,
      );
    }
  }

  // Shattering windows when a car gets crushed.
  glass(pos, n = 30) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 3 + Math.random() * 6;
      this.confetti.spawn(pos.x, pos.y + 1.6, pos.z, Math.cos(a) * r, 5 + Math.random() * 7, Math.sin(a) * r,
        Math.random() < 0.6 ? 0x8fdcff : 0xffffff, 0.5 + Math.random() * 0.4, 0.8 + Math.random() * 0.5);
    }
  }

  // Bits flying off whatever got crushed: panels, trim, splinters.
  debris(pos, colors = [0x777777], n = 14, size = 1) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 4 + Math.random() * 7;
      const color = i % 4 === 0 ? 0x1a1a1a : colors[(Math.random() * colors.length) | 0];
      this.chunks.spawn(pos.x, pos.y + 1.2, pos.z, Math.cos(a) * r, 6 + Math.random() * 8, Math.sin(a) * r,
        color, (0.6 + Math.random() * 0.9) * size, 1.6 + Math.random() * 0.8);
    }
  }

  // A tire or hubcap popping off and bouncing away.
  disc(pos, color, size) {
    const a = Math.random() * Math.PI * 2;
    const r = 5 + Math.random() * 6;
    this.discs.spawn(pos.x + Math.cos(a), pos.y + 0.6, pos.z + Math.sin(a), Math.cos(a) * r, 7 + Math.random() * 6, Math.sin(a) * r,
      color, size, 2.2 + Math.random() * 0.8);
  }

  // Everything that happens visually when something gets squashed.
  // ev: { pos, kind, debris (colors), glass }
  crush(ev) {
    const pos = ev.pos;
    const big = ev.kind === 'bus' || ev.kind === 'rv' || ev.kind === 'limo' || ev.kind === 'stack';
    if (ev.kind === 'hay') {
      this.dustBurst(pos, 30, 8, [0xe8cf8a, 0xd9b25a, 0xf2e2b0]);
      this.confettiBurst(pos, 120, 12, [0xd9b25a, 0xf0d890, 0xc49a40]);
      return;
    }
    this.dustBurst(pos, big ? 34 : 22, big ? 10 : 7);
    if (ev.kind === 'crates') {
      this.debris(pos, ev.debris, 26, 0.9);
      return;
    }
    this.debris(pos, ev.debris, big ? 26 : 16, big ? 1.4 : 1);
    if (ev.kind === 'potty') return;
    if (ev.glass) this.glass(pos, big ? 60 : 36);
    this.sparks(pos, 14);
    // A tire or two and a hubcap.
    const tires = big ? 2 : Math.random() < 0.6 ? 1 : 0;
    for (let i = 0; i < tires; i++) this.disc(pos, 0x1c1c1c, big ? 1.5 : 1.0);
    if (Math.random() < 0.7) this.disc(pos, 0xc8ced4, 0.55);
  }

  // A grey puff from an exhaust stack.
  smoke(pos, big = false) {
    const shade = 0x6a + ((Math.random() * 0x30) | 0);
    this.dust.spawn(pos.x, pos.y, pos.z, (Math.random() - 0.5) * 1.5, 3 + Math.random() * 2, 1,
      (shade << 16) | (shade << 8) | shade, big ? 0.7 : 0.4, big ? 0.9 : 0.55);
  }

  // Nitro: flames shooting out of the exhaust stacks.
  flame(pos) {
    for (let i = 0; i < 3; i++) {
      this.glow.spawn(pos.x + (Math.random() - 0.5) * 0.2, pos.y + 0.2, pos.z + 0.1,
        (Math.random() - 0.5) * 1.5, 5 + Math.random() * 4, 2 + Math.random() * 2,
        FLAME_COLORS[(Math.random() * FLAME_COLORS.length) | 0], 0.9 + Math.random() * 0.6, 0.25 + Math.random() * 0.15);
    }
  }

  // Sparks when landing on a steel ramp.
  sparks(pos, n = 40) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 6 + Math.random() * 10;
      this.glow.spawn(pos.x + (Math.random() - 0.5) * 3, pos.y + 0.3, pos.z + (Math.random() - 0.5) * 4,
        Math.cos(a) * r, 2 + Math.random() * 6, Math.sin(a) * r,
        Math.random() < 0.5 ? 0xfff3b0 : 0xffb300, 0.25 + Math.random() * 0.25, 0.3 + Math.random() * 0.3);
    }
  }

  sparkle(pos) {
    this.confettiBurst(pos, 25, 9, [0xffdd00, 0xfff59d, 0xffffff]);
  }

  dustBurst(pos, n = 14, spread = 4, colors = DUST_COLORS) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      this.dust.spawn(
        pos.x + Math.cos(a) * 1.5, pos.y + 0.5 + Math.random(), pos.z + Math.sin(a) * 1.5,
        Math.cos(a) * spread * Math.random(), 1 + Math.random() * 3, Math.sin(a) * spread * Math.random(),
        colors[(Math.random() * colors.length) | 0], 0.9 + Math.random() * 0.8, 0.8 + Math.random() * 0.6,
      );
    }
  }

  // Kick up dust and mud clods behind the wheels while driving.
  trail(truck, dt) {
    if (truck.airborne) return;
    const s = truck.scale;
    const cos = Math.cos(truck.heading);
    const sin = Math.sin(truck.heading);
    if (Math.random() < dt * 18) {
      const side = (Math.random() < 0.5 ? -1.9 : 1.9) * s;
      const x = truck.pos.x + side * cos + 2.4 * s * sin;
      const z = truck.pos.z - side * sin + 2.4 * s * cos;
      this.dust.spawn(x, truck.pos.y + 0.4, z, (Math.random() - 0.5) * 2, 0.5 + Math.random() * 1.5, 1,
        DUST_COLORS[(Math.random() * DUST_COLORS.length) | 0], (0.5 + Math.random() * 0.4) * s, 0.7);
    }
    if (Math.random() < dt * 6) {
      // Roost: clods flung up and back off the rear tires.
      const side = (Math.random() < 0.5 ? -1.9 : 1.9) * s;
      const x = truck.pos.x + side * cos + 2.2 * s * sin;
      const z = truck.pos.z - side * sin + 2.2 * s * cos;
      this.chunks.spawn(x, truck.pos.y + 0.8 * s, z, (Math.random() - 0.5) * 3, 5 + Math.random() * 4, 6 + Math.random() * 5,
        MUD_COLORS[(Math.random() * MUD_COLORS.length) | 0], 0.25 + Math.random() * 0.3, 0.9);
    }
  }

  fireworks(center) {
    for (let k = 0; k < 4; k++) {
      setTimeout(() => {
        const p = center.clone().add(new THREE.Vector3((Math.random() - 0.5) * 24, 10 + Math.random() * 8, -20 - Math.random() * 20));
        const color = CONFETTI_COLORS[(Math.random() * CONFETTI_COLORS.length) | 0];
        for (let i = 0; i < 70; i++) {
          const v = new THREE.Vector3().randomDirection().multiplyScalar(12 + Math.random() * 4);
          this.confetti.spawn(p.x, p.y, p.z, v.x, v.y, v.z, Math.random() < 0.7 ? color : 0xffffff, 0.9, 2);
        }
      }, k * 250);
    }
  }

  // Floating "+100" text at a spot in the 3D world.
  popup(text, worldPos, camera, color = '#fff') {
    const v = worldPos.clone();
    v.y += 4;
    v.project(camera);
    if (v.z > 1) return; // behind the camera
    const el = document.createElement('div');
    el.className = 'popup';
    el.textContent = text;
    el.style.color = color;
    el.style.left = ((v.x + 1) / 2) * 100 + '%';
    el.style.top = ((1 - v.y) / 2) * 100 + '%';
    this.popupLayer.appendChild(el);
    setTimeout(() => el.remove(), 1200);
  }

  showWow(text, trick = '', sub = '') {
    const el = this.wowEl;
    const size = (s, long, xlong) => (s.length > xlong ? ' xlong' : s.length > long ? ' long' : '');
    el.innerHTML = `<span class="word${size(text, 14, 99)}">${text}</span>`
      + (trick ? `<span class="trick${size(trick, 26, 48)}">${trick}</span>` : '')
      + (sub ? `<span class="sub${size(sub, 18, 99)}">${sub}</span>` : '');
    el.classList.remove('show');
    void el.offsetWidth; // restart the CSS animation
    el.classList.add('show');
  }

  update(dt, camera) {
    this.confetti.update(dt, camera);
    this.dust.update(dt, camera);
    this.glow.update(dt, camera);
    this.chunks.update(dt, camera);
    this.discs.update(dt, camera);
  }
}
