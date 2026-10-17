import * as THREE from '../vendor/three.module.min.js';

const CONFETTI_COLORS = [0xff3d7f, 0xffdd00, 0x00e5ff, 0x76ff03, 0xff9100, 0xd500f9, 0xffffff];
const DUST_COLORS = [0xe3c9a0, 0xd4b080, 0xf2e2c6];

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _c = new THREE.Color();

// A fixed-size pool of instanced particles.
class Pool {
  constructor(scene, geometry, material, max, { gravity, drag, grow }) {
    this.max = max;
    this.gravity = gravity;
    this.drag = drag;
    this.grow = grow;
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
    this.spin.set([(Math.random() - 0.5) * 16, (Math.random() - 0.5) * 16, (Math.random() - 0.5) * 16], i * 3);
    this.life[i] = this.maxLife[i] = life;
    this.size[i] = size;
    this.mesh.setColorAt(i, _c.set(color));
    this.mesh.instanceColor.needsUpdate = true;
  }

  update(dt) {
    const drag = Math.exp(-this.drag * dt);
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
      const t = this.life[i] / this.maxLife[i];
      const sc = this.size[i] * (this.grow ? (1 + (1 - t) * 1.2) * Math.min(1, t * 3) : Math.min(1, t * 4));
      _p.set(this.pos[k], this.pos[k + 1], this.pos[k + 2]);
      _q.setFromEuler(_e.set(this.rot[k], this.rot[k + 1], this.rot[k + 2]));
      _s.set(sc, sc, sc);
      this.mesh.setMatrixAt(i, _m.compose(_p, _q, _s));
    }
    if (dirty) this.mesh.instanceMatrix.needsUpdate = true;
  }
}

export class Effects {
  constructor(scene) {
    this.confetti = new Pool(
      scene,
      new THREE.PlaneGeometry(0.3, 0.45),
      new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }),
      500,
      { gravity: 6, drag: 1.2, grow: false },
    );
    this.dust = new Pool(
      scene,
      new THREE.IcosahedronGeometry(0.55, 0),
      new THREE.MeshLambertMaterial({ flatShading: true, transparent: true, opacity: 0.75, depthWrite: false }),
      220,
      { gravity: -1.5, drag: 2.5, grow: true },
    );
    this.wowEl = document.getElementById('wow');
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

  sparkle(pos) {
    this.confettiBurst(pos, 25, 9, [0xffdd00, 0xfff59d, 0xffffff]);
  }

  dustBurst(pos, n = 14, spread = 4) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      this.dust.spawn(
        pos.x + Math.cos(a) * 1.5, 0.5 + Math.random(), pos.z + Math.sin(a) * 1.5,
        Math.cos(a) * spread * Math.random(), 1 + Math.random() * 3, Math.sin(a) * spread * Math.random(),
        DUST_COLORS[(Math.random() * DUST_COLORS.length) | 0], 0.4 + Math.random() * 0.4, 0.6 + Math.random() * 0.4,
      );
    }
  }

  // Kick up dust behind the wheels while driving.
  trail(truck, dt) {
    if (truck.airborne || Math.random() > dt * 15) return;
    const side = Math.random() < 0.5 ? -1.7 : 1.7;
    const cos = Math.cos(truck.heading);
    const sin = Math.sin(truck.heading);
    const x = truck.pos.x + side * cos + 2.4 * sin;
    const z = truck.pos.z - side * sin + 2.4 * cos;
    this.dust.spawn(x, truck.pos.y + 0.3, z, (Math.random() - 0.5) * 2, 0.5 + Math.random() * 1.5, 0,
      DUST_COLORS[(Math.random() * DUST_COLORS.length) | 0], 0.2 + Math.random() * 0.2, 0.5);
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

  showWow(text, sub = '') {
    const el = this.wowEl;
    el.innerHTML = text + (sub ? `<span class="sub">${sub}</span>` : '');
    el.classList.remove('show');
    void el.offsetWidth; // restart the CSS animation
    el.classList.add('show');
  }

  update(dt) {
    this.confetti.update(dt);
    this.dust.update(dt);
  }
}
