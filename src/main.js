import * as THREE from '../vendor/three.module.min.js';
import { Input } from './input.js';
import { Truck, TRUCK_COLORS, EXHAUST_TIPS } from './truck.js';
import { World } from './world.js';
import { Effects } from './effects.js';
import { Sfx } from './audio.js';
import { truckSvg } from './truck-art.js';

// ---------- Renderer / scene ----------

const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
let pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
renderer.setPixelRatio(pixelRatio);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x8fd3ff);
scene.fog = new THREE.Fog(0x8fd3ff, 90, 380);

const camera = new THREE.PerspectiveCamera(65, 1, 0.5, 600);
const hemi = new THREE.HemisphereLight(0xd8f0ff, 0x7a6a4a, 1.6);
const sun = new THREE.DirectionalLight(0xffffff, 2.2);
sun.position.set(-30, 60, 20);
scene.add(hemi, sun, sun.target);

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

// Soft round shadow under the truck so it's easy to see how high it is.
const shadowTex = (() => {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(0,0,0,0.55)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
})();
const shadow = new THREE.Mesh(
  new THREE.PlaneGeometry(5, 6.5).rotateX(-Math.PI / 2),
  new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false }),
);
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

const BIG_WORDS = ['', 'WOW!', 'SUPER!', 'AMAZING!', 'INCREDIBLE!'];
const EMOJI = ['🤩', '🔥', '🚀', '🌈', '💥', '🎉'];
const TIMES = ['', '', 'DOUBLE ', 'TRIPLE ', 'QUADRUPLE '];
const times = (n) => (n < TIMES.length ? TIMES[n] : 'MEGA ');

// e.g. { flips: 2, spins: -1 } -> ['DOUBLE BACKFLIP', '360 SPIN']
function trickNames({ flips, spins, rolls }) {
  const names = [];
  if (flips) names.push(times(Math.abs(flips)) + (flips > 0 ? 'BACKFLIP' : 'FRONT FLIP'));
  if (spins) names.push(360 * Math.abs(spins) + ' SPIN');
  if (rolls) names.push(times(Math.abs(rolls)) + 'BARREL ROLL');
  return names;
}

function handleEvent(ev) {
  switch (ev.type) {
    case 'launch':
      sfx.whoosh();
      effects.dustBurst(truck.pos, 16, 6);
      for (const t of EXHAUST_TIPS) effects.smoke(truck.mesh.localToWorld(t.clone()), true);
      if (ev.mega) effects.showWow('🚀', 'MEGA JUMP!');
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
      if (!playing) break;
      const names = trickNames(ev);
      const total = Math.abs(ev.flips) + Math.abs(ev.spins) + Math.abs(ev.rolls);
      const airPoints = ev.airTime > 0.8 ? Math.round(ev.airTime * 10) * 10 : 0;
      if (total >= 1) {
        // Tricks score big, and mixing different tricks doubles it.
        const combo = names.length > 1 ? 2 : 1;
        const points = 500 * total * total * combo + airPoints;
        const reward = total + 1;
        addStars(reward);
        addPoints(points, truck.pos, '', '#ffe14d');
        sfx.fanfare(total >= 3);
        effects.confettiBurst(truck.pos, Math.min(80 + 40 * total, 300));
        const word = BIG_WORDS[Math.min(total, BIG_WORDS.length - 1)];
        const emoji = EMOJI[(Math.random() * EMOJI.length) | 0];
        const trick = names.join(' + ') + (combo > 1 ? ' COMBO!' : '!');
        effects.showWow(`${emoji} ${word} ${emoji}`, trick, '+' + fmt(points) + ' ⭐+' + reward);
      } else if (airPoints) {
        addPoints(airPoints, truck.pos, 'AIR');
        if (ev.airTime > 1.4) {
          addStars(1);
          effects.sparkle(truck.pos);
        }
      }
      break;
    }
    case 'crush':
      sfx.crunch();
      effects.dustBurst(ev.pos, 18, 7);
      effects.glass(ev.pos);
      truck.bump(5);
      shake = Math.max(shake, 0.35);
      if (!playing) break;
      // Crushing cars one after another builds a combo.
      crushStreak = elapsed - lastCrush < 2 ? crushStreak + 1 : 1;
      lastCrush = elapsed;
      addStars(1);
      addPoints(100 * crushStreak, ev.pos, crushStreak > 1 ? 'x' + crushStreak : '', '#ff9f43');
      break;
    case 'star':
      sfx.pop();
      effects.sparkle(ev.pos);
      if (!playing) break;
      addStars(1);
      addPoints(50, ev.pos, '', '#ffe14d');
      break;
  }
}

// ---------- Sky colors that slowly change ----------

const PALETTES = [
  { sky: 0x8fd3ff, sun: 0xffffff, hemi: 0xd8f0ff },
  { sky: 0xffd08a, sun: 0xffe2b5, hemi: 0xfff0d0 },
  { sky: 0xff9fc0, sun: 0xffc6b0, hemi: 0xffe0ea },
  { sky: 0xb8a8ff, sun: 0xe8e0ff, hemi: 0xe6e0ff },
].map((p) => ({ sky: new THREE.Color(p.sky), sun: new THREE.Color(p.sun), hemi: new THREE.Color(p.hemi) }));
const PALETTE_SECONDS = 45;

function updateSky() {
  const t = elapsed / PALETTE_SECONDS;
  const i = Math.floor(t) % PALETTES.length;
  const a = PALETTES[i];
  const b = PALETTES[(i + 1) % PALETTES.length];
  const f = THREE.MathUtils.smoothstep(t % 1, 0.7, 1);
  scene.background.copy(a.sky).lerp(b.sky, f);
  scene.fog.color.copy(scene.background);
  sun.color.copy(a.sun).lerp(b.sun, f);
  hemi.color.copy(a.hemi).lerp(b.hemi, f);
}

// ---------- Camera ----------

const camPos = new THREE.Vector3(0, 8, 14);
const camLook = new THREE.Vector3();
const tmp = new THREE.Vector3();
let camHeading = 0;

function updateCamera(dt) {
  camHeading += (truck.heading - camHeading) * Math.min(1, dt * 3);
  const portrait = camera.aspect < 1;
  const dist = (truck.airborne ? 16 : 13) * (portrait ? 1.25 : 1);
  const height = truck.airborne ? 8 : 6.5;
  tmp.set(
    truck.pos.x + Math.sin(camHeading) * dist,
    truck.pos.y * 0.6 + height,
    truck.pos.z + Math.cos(camHeading) * dist,
  );
  const k = 1 - Math.exp(-dt * 5);
  camPos.x += (tmp.x - camPos.x) * k;
  camPos.y += (tmp.y - camPos.y) * k;
  camPos.z = tmp.z; // stay locked behind so the truck never runs away from the camera
  tmp.set(
    truck.pos.x - Math.sin(camHeading) * 8,
    truck.pos.y * 0.8 + 2.5,
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

  sun.position.set(truck.pos.x - 30, 60, truck.pos.z + 20);
  sun.target.position.copy(truck.pos);
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

// ---------- Main loop ----------

const NO_INPUT = { left: false, right: false, swipes: [] };
let last = performance.now();
let slowFrames = 0;

function frame(now) {
  requestAnimationFrame(frame);
  const rawDt = (now - last) / 1000;
  last = now;
  const dt = THREE.MathUtils.clamp(rawDt, 0, 1 / 30);
  elapsed += dt;
  wallCooldown -= dt;

  // If the device is struggling, render fewer pixels.
  if (rawDt > 0.025 && rawDt < 0.2) slowFrames++;
  else slowFrames = Math.max(0, slowFrames - 1);
  if (slowFrames > 90 && pixelRatio > 1) {
    pixelRatio = Math.max(1, pixelRatio - 0.5);
    renderer.setPixelRatio(pixelRatio);
    resize();
    slowFrames = 0;
  }

  const state = playing ? input.poll() : NO_INPUT;
  if (!playing) input.clear();
  arrowLeft.classList.toggle('on', state.left);
  arrowRight.classList.toggle('on', state.right);
  placeArrow(arrowLeft, state.leftPos);
  placeArrow(arrowRight, state.rightPos);

  for (const ev of truck.update(dt, state, world)) handleEvent(ev);
  for (const ev of world.update(dt, truck)) handleEvent(ev);
  effects.trail(truck, dt);
  smokeTimer -= dt;
  if (smokeTimer <= 0) {
    smokeTimer = truck.airborne ? 0.08 : 0.15;
    truck.mesh.updateMatrixWorld();
    for (const t of EXHAUST_TIPS) effects.smoke(truck.mesh.localToWorld(t.clone()));
  }
  effects.update(dt, camera.position);
  sfx.setEngine(truck.speed / 24, truck.airborne);

  const ground = world.heightAt(truck.distance);
  const h = Math.max(0, truck.pos.y - ground);
  shadow.position.set(truck.pos.x, ground + 0.08, truck.pos.z);
  shadow.rotation.y = truck.heading;
  shadow.scale.setScalar(1 + h * 0.04);
  shadow.material.opacity = Math.max(0.25, 1 - h * 0.05);

  updateScore(dt);
  updateSky();
  updateCamera(dt);
  renderer.render(scene, camera);
}
requestAnimationFrame(frame);

// ---------- Offline support ----------

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
