// Gradient sky dome with a sun, a ring of far-away silhouettes (hills,
// mountains, mesas or a city skyline), slowly changing time-of-day colors,
// and an environment map so shiny paint and chrome reflect the sky.
import * as THREE from '../vendor/three.module.min.js';

const PALETTES = [
  { top: 0x2f7fd8, horizon: 0xbfe3ff, sun: 0xfff6e8, hemi: 0xd8ecff, ground: 0x6b5a40 }, // midday
  { top: 0x3f6fb8, horizon: 0xffd9a0, sun: 0xffd9a8, hemi: 0xffefd6, ground: 0x6b5236 }, // golden hour
  { top: 0x5a5fb0, horizon: 0xffa8a0, sun: 0xffb8a0, hemi: 0xffe0e6, ground: 0x5e4636 }, // sunset
  { top: 0x2c3c86, horizon: 0xc0b0f0, sun: 0xe0d8ff, hemi: 0xdcd8ff, ground: 0x4a4050 }, // dusk
].map((p) => Object.fromEntries(Object.entries(p).map(([k, v]) => [k, new THREE.Color(v)])));
const PALETTE_SECONDS = 50;

const vertexShader = `
varying vec3 vDir;
void main() {
  vDir = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const fragmentShader = `
uniform vec3 top;
uniform vec3 horizon;
uniform vec3 ground;
uniform vec3 sunColor;
uniform vec3 sunDir;
varying vec3 vDir;
void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 col = h > 0.0
    ? mix(horizon, top, pow(smoothstep(0.0, 1.0, h), 0.55))
    : mix(horizon, ground, smoothstep(0.0, 0.2, -h));
  float s = max(dot(d, sunDir), 0.0);
  col += sunColor * (pow(s, 900.0) * 6.0 + pow(s, 40.0) * 0.35 + pow(s, 6.0) * 0.12);
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

// Silhouette shapes around the horizon. t goes 0..1 around the circle and
// every shape must wrap smoothly at t = 1.
const PROFILES = {
  hills: (t, r) => 14 + 10 * Math.sin(t * Math.PI * 2 * 3 + r[0]) + 6 * Math.sin(t * Math.PI * 2 * 7 + r[1]) + 3 * Math.sin(t * Math.PI * 2 * 17 + r[2]),
  mountains: (t, r) => {
    const a = Math.abs(Math.sin(t * Math.PI * 5 + r[0]));
    const b = Math.abs(Math.sin(t * Math.PI * 11 + r[1]));
    return 18 + 38 * a * a + 14 * b + 4 * Math.sin(t * Math.PI * 2 * 31 + r[2]);
  },
  mesas: (t, r) => {
    const v = Math.sin(t * Math.PI * 2 * 4 + r[0]) + 0.6 * Math.sin(t * Math.PI * 2 * 9 + r[1]);
    return 8 + (v > 0.35 ? 34 : v > -0.2 ? 34 * (v + 0.2) / 0.55 : 0) + 2 * Math.sin(t * Math.PI * 2 * 40 + r[2]);
  },
  city: (t, r) => {
    const i = Math.floor(t * 120);
    const n = Math.sin(i * 12.9898 + r[0]) * 43758.5453;
    const f = n - Math.floor(n);
    return 6 + (f > 0.25 ? f * f * 70 : 4);
  },
};

const RING_SEGMENTS = 480; // enough for flat-topped buildings in the skyline

function ringGeometry(radius) {
  const g = new THREE.BufferGeometry();
  const pos = new Float32Array((RING_SEGMENTS + 1) * 2 * 3);
  const idx = [];
  for (let i = 0; i < RING_SEGMENTS; i++) {
    const a = i * 2;
    idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
  }
  for (let i = 0; i <= RING_SEGMENTS; i++) {
    const ang = (i / RING_SEGMENTS) * Math.PI * 2;
    const x = Math.cos(ang) * radius;
    const z = Math.sin(ang) * radius;
    pos.set([x, -10, z, x, 10, z], i * 6);
  }
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setIndex(idx);
  return g;
}

function setRingShape(geo, profile, seed) {
  const r = [seed * 1.7, seed * 3.1, seed * 5.3];
  const pos = geo.attributes.position;
  for (let i = 0; i <= RING_SEGMENTS; i++) {
    pos.setY(i * 2 + 1, Math.max(2, profile(i / RING_SEGMENTS, r)));
  }
  pos.needsUpdate = true;
  geo.computeBoundingSphere();
}

export class Sky {
  constructor(scene, renderer) {
    this.uniforms = {
      top: { value: new THREE.Color() },
      horizon: { value: new THREE.Color() },
      ground: { value: new THREE.Color() },
      sunColor: { value: new THREE.Color() },
      sunDir: { value: new THREE.Vector3(-0.45, 0.55, 0.3).normalize() },
    };
    this.material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader,
      fragmentShader,
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: false,
      fog: false,
    });
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(400, 32, 16), this.material);
    this.dome.renderOrder = -1000;
    this.dome.frustumCulled = false;

    // Two rings: a far, hazy one and a nearer, darker one.
    this.rings = [
      { radius: 390, haze: 0.72 },
      { radius: 330, haze: 0.5 },
    ].map(({ radius, haze }, i) => {
      const mesh = new THREE.Mesh(ringGeometry(radius), new THREE.MeshBasicMaterial({ fog: false, side: THREE.DoubleSide }));
      mesh.renderOrder = -900 + i;
      mesh.frustumCulled = false;
      return { mesh, haze, seed: i + 1 };
    });
    this.landColor = new THREE.Color(0x5c7a4a);
    this.targetLand = this.landColor.clone();
    this.setProfile('hills');

    this.group = new THREE.Group();
    this.group.add(this.dome, ...this.rings.map((r) => r.mesh));
    scene.add(this.group);

    // A tiny copy of the dome, rendered into an environment map.
    this.renderer = renderer;
    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.envScene = new THREE.Scene();
    this.envScene.add(new THREE.Mesh(new THREE.SphereGeometry(10, 32, 16), this.material));
    this.envTarget = null;
    this.envTimer = 0;
    this.envKey = '';

    this.sun = new THREE.Color();
    this.hemi = new THREE.Color();
    this.fog = new THREE.Color();
  }

  // 'hills' | 'mountains' | 'mesas' | 'city', plus the color of the land.
  setProfile(kind, landColor) {
    for (const r of this.rings) setRingShape(r.mesh.geometry, PROFILES[kind], r.seed + kind.length);
    if (landColor !== undefined) this.targetLand.set(landColor);
  }

  get sunDirection() {
    return this.uniforms.sunDir.value;
  }

  update(dt, elapsed, cameraPos, scene) {
    const t = elapsed / PALETTE_SECONDS;
    const i = Math.floor(t) % PALETTES.length;
    const a = PALETTES[i];
    const b = PALETTES[(i + 1) % PALETTES.length];
    const f = THREE.MathUtils.smoothstep(t % 1, 0.7, 1);
    const u = this.uniforms;
    u.top.value.copy(a.top).lerp(b.top, f);
    u.horizon.value.copy(a.horizon).lerp(b.horizon, f);
    u.ground.value.copy(a.ground).lerp(b.ground, f);
    u.sunColor.value.copy(a.sun).lerp(b.sun, f);
    this.sun.copy(u.sunColor.value);
    this.hemi.copy(a.hemi).lerp(b.hemi, f);
    this.fog.copy(u.horizon.value);
    if (scene.fog) scene.fog.color.copy(this.fog);

    this.landColor.lerp(this.targetLand, 1 - Math.exp(-dt * 1.5));
    for (const r of this.rings) r.mesh.material.color.copy(this.landColor).lerp(u.horizon.value, r.haze);

    this.group.position.set(cameraPos.x, 0, cameraPos.z);

    // Re-render the environment map now and then while the colors change.
    this.envTimer -= dt;
    const key = i + ':' + Math.round(f * 6);
    if (!this.envTarget || (key !== this.envKey && this.envTimer <= 0)) {
      this.envKey = key;
      this.envTimer = 1.5;
      const old = this.envTarget;
      this.envTarget = this.pmrem.fromScene(this.envScene, 0.02);
      scene.environment = this.envTarget.texture;
      if (old) old.dispose();
    }
  }
}
