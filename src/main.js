import * as THREE from '../vendor/three.module.min.js';
import { Input } from './input.js';
import { Truck, TRUCK_COLORS, EXHAUST_TIPS } from './truck.js';
import { World } from './world.js';
import { Effects } from './effects.js';
import { Sfx } from './audio.js';
import { truckSvg } from './truck-art.js';
import { trickTitle, scoreTrick } from './tricks.js';
import { Sky } from './sky.js';
import { POWERS, POWER_KINDS } from './powerups.js';
import { BIOMES } from './scenery.js';
import { softDot } from './textures.js';

const params = new URLSearchParams(location.search);

// ---------- Renderer / scene ----------

const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
let pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
renderer.setPixelRatio(pixelRatio);
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xbfe3ff, 110, 420);

const camera = new THREE.PerspectiveCamera(65, 1, 0.5, 900);
const hemi = new THREE.HemisphereLight(0xd8ecff, 0x6a5a40, 1.3);
const sun = new THREE.DirectionalLight(0xffffff, 2.6);
const SHADOW_SPAN = 34;
sun.castShadow = true;
Object.assign(sun.shadow.camera, { left: -SHADOW_SPAN, right: SHADOW_SPAN, top: SHADOW_SPAN, bottom: -SHADOW_SPAN, near: 1, far: 220 });
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.04;
scene.add(hemi, sun, sun.target);
const sky = new Sky(scene, renderer);

// Quality tiers: 2 = big soft shadows, 1 = smaller shadows, 0 = no shadows.
// Starts high (or from ?quality=low|medium|high) and steps down if the device struggles.
const QUALITY = { low: 0, medium: 1, high: 2 };
let quality = QUALITY[params.get('quality')] ?? 2;
const autoQuality = !params.has('quality');
function applyQuality() {
  renderer.shadowMap.enabled = quality > 0;
  sun.castShadow = quality > 0;
  const size = quality === 2 ? 2048 : 1024;
  if (sun.shadow.mapSize.x !== size) {
    sun.shadow.mapSize.set(size, size);
    if (sun.shadow.map) {
      sun.shadow.map.dispose();
      sun.shadow.map = null;
    }
  }
  // Materials need recompiling when shadows switch on or off.
  scene.traverse((o) => {
    if (!o.material) return;
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) m.needsUpdate = true;
  });
}
applyQuality();

function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.fov = camera.aspect < 1 ? 80 : 65; // see more of the road on a phone held upright
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

// ---------- Game objects ----------

const world = new World(scene);
const truck = new Truck(scene);
const effects = new Effects(scene);
const sfx = new Sfx();
window.__truck = truck; // handy for debugging from the console
window.__world = world;
window.__THREE = THREE;
window.__camera = camera;

// Soft round shadow under the truck so it's easy to see how high it is
// (on top of the real shadow, which is hard to read when it's far away).
const shadow = new THREE.Mesh(
  new THREE.PlaneGeometry(5, 6.5).rotateX(-Math.PI / 2),
  new THREE.MeshBasicMaterial({ map: softDot(64, 'rgba(0,0,0,0.5)', 'rgba(0,0,0,0)'), transparent: true, depthWrite: false }),
);
shadow.renderOrder = 1;
scene.add(shadow);

// ---------- HUD ----------

const hud = document.getElementById('hud');
const pickEl = document.getElementById('pick');
const starsEl = document.getElementById('stars');
const starCountEl = document.getElementById('star-count');
const scoreEl = document.getElementById('score');
const scoreCountEl = document.getElementById('score-count');
const arrowLeft = document.getElementById('arrow-left');
const arrowRight = document.getElementById('arrow-right');
const honkEl = document.getElementById('honk');
const garageEl = document.getElementById('garage');

const store = {
  get(key, fallback) {
    try { const v = localStorage.getItem(key); return v === null ? fallback : JSON.parse(v); } catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* private mode */ }
  },
};

let stars = store.get('mt-stars', 0);
starCountEl.textContent = stars;

function bump(el) {
  el.classList.remove('bump');
  void el.offsetWidth; // restart the CSS animation
  el.classList.add('bump');
}

function addStars(n) {
  const before = stars;
  stars += n;
  starCountEl.textContent = stars;
  bump(starsEl);
  store.set('mt-stars', stars);
  // Big party every 25 stars.
  if (Math.floor(stars / 25) > Math.floor(before / 25)) {
    setTimeout(() => {
      effects.fireworks(truck.pos);
      sfx.fanfare(true);
      effects.showWow('🎉 ' + Math.floor(stars / 25) * 25 + ' 🎉', '', '⭐⭐⭐');
    }, 900);
  }
}

// Points only ever go up, and are remembered between visits.
let score = store.get('mt-score', 0);
let shownScore = score;
const fmt = (n) => Math.floor(n).toLocaleString('en-US');
scoreCountEl.textContent = fmt(score);

function addPoints(n, pos, label = '', color = '#fff') {
  score += n;
  store.set('mt-score', score);
  bump(scoreEl);
  effects.popup('+' + fmt(n) + (label ? ' ' + label : ''), pos, camera, color);
}

// Animate the counter rolling up to the real score.
function updateScore(dt) {
  if (shownScore >= score) return;
  shownScore = Math.min(score, shownScore + Math.max(1, (score - shownScore) * Math.min(1, dt * 5)));
  scoreCountEl.textContent = fmt(shownScore);
}

const choicesEl = document.getElementById('truck-choices');
TRUCK_COLORS.forEach((c, i) => {
  const b = document.createElement('div');
  b.className = 'truck-btn';
  b.dataset.btn = 'pick';
  b.dataset.index = i;
  b.innerHTML = truckSvg(c, i);
  choicesEl.appendChild(b);
});
truck.setColors(TRUCK_COLORS[store.get('mt-truck', 0)] || TRUCK_COLORS[0]);

// ---------- State ----------

let playing = false;
let garageTimer = null;
let wallCooldown = 0;
let shake = 0;
let elapsed = 0;
let crushStreak = 0;
let lastCrush = -10;
let smokeTimer = 0;

function startGame(index) {
  sfx.init();
  truck.setColors(TRUCK_COLORS[index]);
  store.set('mt-truck', index);
  pickEl.classList.add('hidden');
  hud.classList.remove('hidden');
  playing = true;
  input.clear();
  sfx.honk();
}

function showPicker() {
  playing = false;
  pickEl.classList.remove('hidden');
  hud.classList.add('hidden');
}

const input = new Input({
  onButtonDown(btn, el) {
    if (btn === 'pick') {
      el.classList.add('on');
      startGame(Number(el.dataset.index));
    } else if (btn === 'honk') {
      sfx.init();
      sfx.honk();
      honkEl.classList.add('on');
    } else if (btn === 'garage') {
      garageEl.classList.add('holding');
      clearTimeout(garageTimer);
      garageTimer = setTimeout(() => {
        garageEl.classList.remove('holding');
        showPicker();
      }, 1000);
    }
  },
  onButtonUp(btn, el) {
    if (btn === 'pick') el.classList.remove('on');
    else if (btn === 'honk') honkEl.classList.remove('on');
    else if (btn === 'garage') {
      garageEl.classList.remove('holding');
      clearTimeout(garageTimer);
    }
  },
});

// iOS only lets audio start from a "real" gesture like touchend, not touchstart.
for (const ev of ['touchend', 'mouseup', 'keydown']) {
  window.addEventListener(ev, () => { if (playing) sfx.init(); });
}

// ---------- Events from the simulation ----------

const EMOJI = ['🤩', '🔥', '🚀', '🌈', '💥', '🎉'];
const BIG_CRUSH = new Set(['bus', 'rv', 'limo', 'stack']);
const CRUSH_WORDS = { bus: 'KA-BOOM!', rv: 'KA-BOOM!', limo: 'SMASH!', stack: 'DOUBLE CRUNCH!', potty: 'BONK!', crates: 'SMASH!', hay: 'POOF!' };

function handleEvent(ev) {
  switch (ev.type) {
    case 'launch':
      sfx.whoosh();
      effects.dustBurst(truck.pos, 16, 6);
      for (const t of EXHAUST_TIPS) effects.smoke(truck.mesh.localToWorld(t.clone()), true);
      if (ev.mega) effects.showWow('🚀', ev.label || 'MEGA JUMP!');
      break;
    case 'hop':
      sfx.boing();
      effects.dustBurst(truck.pos, 8);
      break;
    case 'wall':
      if (wallCooldown <= 0) {
        sfx.boing();
        wallCooldown = 0.5;
      }
      break;
    case 'land': {
      const strength = Math.min(ev.impact / 20, 1);
      sfx.thud(strength);
      effects.dustBurst(truck.pos, 8 + Math.round(strength * 20), 4 + strength * 6);
      shake = Math.max(shake, strength * 0.9);
      if (world.styleAt(truck.distance, truck.pos.x) === 'steel') effects.sparks(truck.pos);
      if (!playing) break;
      const double = truck.powers.magnet > 0;
      const result = scoreTrick(ev, { airTime: ev.airTime, mega: ev.mega, doublePoints: double });
      if (result.rotations) {
        addStars(result.stars);
        addPoints(result.points, truck.pos, '', '#ffe14d');
        sfx.fanfare(result.tier >= 2);
        effects.confettiBurst(truck.pos, Math.min(100 + 40 * result.tier, 400));
        if (result.tier >= 5) setTimeout(() => effects.fireworks(truck.pos), 300);
        const emoji = EMOJI[(Math.random() * EMOJI.length) | 0];
        const sub = '+' + fmt(result.points) + (result.multipliers.length ? '  ' + result.multipliers.join(' ') : '') + '  ⭐+' + result.stars;
        effects.showWow(`${emoji} ${result.word} ${emoji}`, trickTitle(ev), sub);
      } else if (result.air) {
        addPoints(result.points, truck.pos, 'AIR');
        if (ev.airTime > 1.4) {
          addStars(1);
          effects.sparkle(truck.pos);
        }
      }
      break;
    }
    case 'crush': {
      sfx.crush(ev.kind);
      effects.crush(ev);
      truck.bump(5);
      shake = Math.max(shake, BIG_CRUSH.has(ev.kind) ? 0.7 : 0.4);
      if (!playing) break;
      // Crushing things one after another builds a combo.
      crushStreak = elapsed - lastCrush < 2 ? crushStreak + 1 : 1;
      lastCrush = elapsed;
      addStars(1);
      const mult = crushStreak * (truck.powers.magnet > 0 ? 2 : 1);
      addPoints(ev.points * mult, ev.pos, (CRUSH_WORDS[ev.kind] || 'CRUNCH!') + (mult > 1 ? ' ×' + mult : ''), '#ff9f43');
      break;
    }
    case 'star':
      sfx.pop();
      effects.sparkle(ev.pos);
      if (!playing) break;
      addStars(1);
      addPoints(truck.powers.magnet > 0 ? 100 : 50, ev.pos, '', '#ffe14d');
      break;
    case 'biome':
      sky.setProfile(BIOMES[ev.biome].ring, BIOMES[ev.biome].land);
      break;
    case 'power': {
      const p = POWERS[ev.kind];
      truck.addPower(ev.kind, p.duration);
      sfx.powerup();
      if (ev.kind === 'nitro') sfx.nitro();
      effects.sparkle(ev.pos);
      effects.confettiBurst(ev.pos, 60, 12, [p.color, 0xffffff]);
      effects.showWow(p.icon, p.name);
      break;
    }
  }
}

// ---------- Power-up chips (icon + countdown ring) ----------

const powersEl = document.getElementById('powers');
const chips = {};
for (const kind of POWER_KINDS) {
  const el = document.createElement('div');
  el.className = 'chip hidden';
  el.innerHTML = `<span>${POWERS[kind].icon}</span><svg viewBox="0 0 40 40"><circle cx="20" cy="20" r="17"/></svg>`;
  el.style.setProperty('--chip', '#' + POWERS[kind].color.toString(16).padStart(6, '0'));
  powersEl.appendChild(el);
  chips[kind] = { el, ring: el.querySelector('circle') };
}

function updatePowers() {
  for (const kind of POWER_KINDS) {
    const left = truck.powers[kind];
    const c = chips[kind];
    c.el.classList.toggle('hidden', left <= 0);
    if (left > 0) c.ring.style.strokeDashoffset = String(107 * (1 - left / POWERS[kind].duration));
  }
}

// ---------- Sky and sunlight ----------

const _lightSpace = new THREE.Matrix4();
const _toLight = new THREE.Matrix4();
const _snap = new THREE.Vector3();
const ORIGIN = new THREE.Vector3();

function updateSky(dt) {
  sky.update(dt, elapsed, camera.position, scene);
  sun.color.copy(sky.sun);
  hemi.color.copy(sky.hemi);
  // The shadow box follows the truck, snapped to whole shadow-map texels
  // (measured along the light's own axes) so shadow edges don't shimmer.
  const texel = (SHADOW_SPAN * 2) / sun.shadow.mapSize.x;
  _lightSpace.lookAt(sky.sunDirection, ORIGIN, THREE.Object3D.DEFAULT_UP);
  // Centered near the ground, so shadows still land when the truck is way up high.
  _snap.copy(truck.pos);
  _snap.y = Math.min(_snap.y, world.heightAt(truck.distance, truck.pos.x) + 10);
  _snap.applyMatrix4(_toLight.copy(_lightSpace).transpose());
  _snap.x = Math.round(_snap.x / texel) * texel;
  _snap.y = Math.round(_snap.y / texel) * texel;
  _snap.applyMatrix4(_lightSpace);
  sun.target.position.copy(_snap);
  sun.position.copy(_snap).addScaledVector(sky.sunDirection, 120);
}

// ---------- Camera ----------

const camPos = new THREE.Vector3(0, 8, 14);
const camLook = new THREE.Vector3();
const tmp = new THREE.Vector3();
let camHeading = 0;
let camZoom = 1;

function updateCamera(dt) {
  camHeading += (truck.heading - camHeading) * Math.min(1, dt * 3);
  // Pull back for mega jumps (and for the giant truck), and follow it up high.
  const mega = truck.airborne && truck.jumpMega;
  camZoom += ((mega ? 1.45 : 1) * truck.scale - camZoom) * Math.min(1, dt * 2);
  const follow = mega ? 0.85 : 0.6;
  const portrait = camera.aspect < 1;
  const dist = (truck.airborne ? 16 : 13) * (portrait ? 1.25 : 1) * camZoom;
  const height = (truck.airborne ? 8 : 6.5) * camZoom;
  tmp.set(
    truck.pos.x + Math.sin(camHeading) * dist,
    truck.pos.y * follow + height,
    truck.pos.z + Math.cos(camHeading) * dist,
  );
  const k = 1 - Math.exp(-dt * 5);
  camPos.x += (tmp.x - camPos.x) * k;
  // Drop quickly after landing a huge jump, so the truck doesn't vanish off the top of the screen.
  camPos.y += (tmp.y - camPos.y) * (camPos.y - tmp.y > 8 ? 1 - Math.exp(-dt * 9) : k);
  camPos.z = tmp.z; // stay locked behind so the truck never runs away from the camera
  camPos.y = Math.max(camPos.y, world.heightAt(-camPos.z, camPos.x) + 2.5); // never dip into a ramp
  tmp.set(
    truck.pos.x - Math.sin(camHeading) * 8,
    truck.pos.y * 0.8 + 2.5 * truck.scale,
    truck.pos.z - Math.cos(camHeading) * 8,
  );
  camLook.lerp(tmp, 1 - Math.exp(-dt * 8));

  camera.position.copy(camPos);
  if (shake > 0) {
    camera.position.x += (Math.random() - 0.5) * shake;
    camera.position.y += (Math.random() - 0.5) * shake;
    shake = Math.max(0, shake - dt * 2);
  }
  camera.lookAt(camLook);
  // Debugging aids: window.__camOffset (a Vector3) looks at the truck from that offset;
  // window.__camAt = { pos, look } (Vector3s) parks the camera anywhere.
  if (window.__camOffset) {
    camera.position.copy(truck.pos).add(window.__camOffset);
    camera.lookAt(truck.pos.x, truck.pos.y + 2, truck.pos.z);
  } else if (window.__camAt) {
    camera.position.copy(window.__camAt.pos);
    camera.lookAt(window.__camAt.look);
  }
}

// The steering arrow jumps under the finger, then goes back to its corner.
function placeArrow(el, pos) {
  if (pos) {
    el.style.left = pos.x + 'px';
    el.style.top = pos.y + 'px';
    el.style.right = el.style.bottom = 'auto';
    el.classList.add('follow');
  } else if (el.classList.contains('follow')) {
    el.removeAttribute('style');
    el.classList.remove('follow');
  }
}

// ---------- ?stats: frame rate and draw calls, for checking performance ----------

const statsEl = params.has('stats') ? document.body.appendChild(document.createElement('div')) : null;
if (statsEl) statsEl.style.cssText = 'position:fixed;left:8px;bottom:8px;z-index:9;font:12px monospace;color:#fff;background:rgba(0,0,0,.6);padding:4px 6px;pointer-events:none;white-space:pre';
let statsFrames = 0;
let statsTime = 0;
function updateStats(rawDt) {
  statsFrames++;
  statsTime += rawDt;
  if (statsTime < 0.5) return;
  const r = renderer.info.render;
  statsEl.textContent = `${Math.round(statsFrames / statsTime)} fps  ${r.calls} calls  ${Math.round(r.triangles / 1000)}k tris\nquality ${quality}  px ${pixelRatio}`;
  statsFrames = 0;
  statsTime = 0;
}

// ---------- Main loop ----------

const NO_INPUT = { left: false, right: false, swipes: [] };
const SUBSTEPS = Math.max(1, Number(params.get('substeps')) || 1);
const NO_INPUT_HELD = (state) => ({ ...state, swipes: [] }); // keep holds, don't repeat swipes
let timeScale = 1;
let last = performance.now();
let slowFrames = 0;

function frame(now) {
  requestAnimationFrame(frame);
  const rawDt = (now - last) / 1000;
  last = now;
  // Slow motion near the top of mega jumps.
  const slowmo = truck.airborne && truck.jumpMega && Math.abs(truck.vy) < 9;
  timeScale += ((slowmo ? 0.55 : 1) - timeScale) * Math.min(1, rawDt * 5);
  const dt = THREE.MathUtils.clamp(rawDt, 0, 1 / 30) * timeScale;
  elapsed += dt;
  wallCooldown -= dt;

  // If the device is struggling, render fewer pixels.
  if (rawDt > 0.025 && rawDt < 0.2) slowFrames++;
  else slowFrames = Math.max(0, slowFrames - 1);
  if (slowFrames > 90) {
    if (pixelRatio > 1) {
      pixelRatio = Math.max(1, pixelRatio - 0.5);
      renderer.setPixelRatio(pixelRatio);
      resize();
    } else if (autoQuality && quality > 0) {
      quality--;
      applyQuality();
    }
    slowFrames = 0;
  }

  const state = playing ? input.poll() : NO_INPUT;
  if (!playing) input.clear();
  arrowLeft.classList.toggle('on', state.left);
  arrowRight.classList.toggle('on', state.right);
  placeArrow(arrowLeft, state.leftPos);
  placeArrow(arrowRight, state.rightPos);

  // ?substeps=N runs the simulation N times per frame (for testing on slow machines).
  for (let i = 0; i < SUBSTEPS; i++) {
    for (const ev of truck.update(dt, i === 0 ? state : NO_INPUT_HELD(state), world)) handleEvent(ev);
    for (const ev of world.update(dt, truck)) handleEvent(ev);
  }
  effects.trail(truck, dt);
  smokeTimer -= dt;
  if (smokeTimer <= 0) {
    smokeTimer = truck.airborne ? 0.08 : 0.15;
    truck.mesh.updateMatrixWorld();
    for (const t of EXHAUST_TIPS) {
      const tip = truck.mesh.localToWorld(t.clone());
      if (truck.powers.nitro > 0) effects.flame(tip);
      else effects.smoke(tip);
    }
  }
  effects.update(dt, camera);
  sfx.setEngine(truck.speed / 24, truck.airborne);

  const ground = world.heightAt(truck.distance, truck.pos.x);
  const h = Math.max(0, truck.pos.y - ground);
  shadow.position.set(truck.pos.x, ground + 0.08, truck.pos.z);
  shadow.rotation.y = truck.heading;
  shadow.scale.setScalar(truck.scale * (1 + h * 0.04));
  shadow.material.opacity = Math.max(0.25, 1 - h * 0.05) * (quality > 0 ? 0.6 : 1);

  updateScore(dt);
  updatePowers();
  updateCamera(dt * SUBSTEPS);
  updateSky(dt);
  renderer.render(scene, camera);
  if (statsEl) updateStats(rawDt);
}
requestAnimationFrame(frame);

// ---------- Offline support ----------

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
