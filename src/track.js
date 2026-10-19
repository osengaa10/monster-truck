// The kinds of track sections ("features"), and the sequencer that picks
// which one comes next. Each builder lays out its ramps, surfaces, stars and
// things to crush starting at distance d, and returns where it ends.
import { WALL_X, GRAVITY, SPEED, LANES } from './consts.js';

const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

// Time until a jump launched at height H with upward speed v comes back down to landH.
const flightTime = (H, v, landH = 0) => (v + Math.sqrt(v * v + 2 * GRAVITY * Math.max(0, H - landH))) / GRAVITY;
const arcY = (H, v, t) => H + v * t - 0.5 * GRAVITY * t * t;

// Piecewise-linear height lookup in [{ d, y }].
function interp(samples, d) {
  for (let i = 1; i < samples.length; i++) {
    const b = samples[i];
    if (d <= b.d) {
      const a = samples[i - 1];
      return a.y + (b.y - a.y) * ((d - a.d) / (b.d - a.d || 1));
    }
  }
  return samples[samples.length - 1].y;
}

// Smooth curve from height y0 to y1 between d0 and d1 (cosine ease).
function ease(samples, d0, d1, y0, y1, n = 10) {
  for (let i = samples.length ? 1 : 0; i <= n; i++) {
    const t = i / n;
    samples.push({ d: d0 + (d1 - d0) * t, y: y0 + (y1 - y0) * (1 - Math.cos(t * Math.PI)) / 2 });
  }
  return samples;
}

// Ground that isn't a launch ramp (decks, landing hills, bumps).
function surface(w, seg, samples, { x0 = -WALL_X, x1 = WALL_X, style = 'dirt' } = {}) {
  w.addSurface(seg, samples, { x0, x1, style });
  w.addFeature({ type: 'surface', style, d0: samples[0].d, d1: samples[samples.length - 1].d, x0, x1, heightAt: (d) => interp(samples, d) });
}

// A curved launch ramp ending in a lip at d0 + L.
function launchRamp(w, seg, d0, { H, L, launch, x0 = -WALL_X, x1 = WALL_X, style = 'dirt', mega = false, label = '' }) {
  const d1 = d0 + L;
  const samples = [];
  const N = Math.max(12, Math.round(L / 2));
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    samples.push({ d: d0 + t * L, y: H * t * t });
  }
  w.addSurface(seg, samples, { x0, x1, style });
  w.addFeature({
    type: 'ramp', style, d0, d1, x0, x1, height: H, launch, mega, label,
    heightAt: (d) => { const t = (d - d0) / L; return H * t * t; },
  });
  if (style === 'steel') w.addLipStripe(seg, x0, x1, H, d1);
  for (const x of [x0 + 0.6, x1 - 0.6]) w.addFlag(seg, x, H, d1 - 0.5, x < (x0 + x1) / 2 ? 1 : -1);
  return { d1, H, launch, x0, x1, lane: (x0 + x1) / 2 };
}

// A landing hill placed where the jump comes down: a short steep face,
// a flat top, then a long smooth slope back to the ground.
function landingHill(w, seg, lip, { Hl, style = 'dirt' }) {
  const t = flightTime(lip.H, lip.launch, Hl / 2);
  const dL = lip.d1 + SPEED * t;
  const Ls = Math.max(14, Hl * 4.5);
  const dA = dL - Ls / 2;
  const dB = dL + Ls / 2;
  const up = Math.max(3, Hl * 1.1);
  const samples = ease([], dA - 3 - up, dA - 3, 0, Hl, 6);
  samples.push({ d: dA, y: Hl });
  ease(samples, dA, dB, Hl, 0, 14);
  surface(w, seg, samples, { x0: lip.x0, x1: lip.x1, style });
  return { start: dA - 3 - up, end: dB, landT: t };
}

// Stars along the flight path, in one lane.
function arcStars(w, seg, lip, count, x, tEnd) {
  for (let i = 1; i <= count; i++) {
    const t = (i / (count + 1)) * tEnd;
    w.addStar(seg, x, arcY(lip.H, lip.launch, t) + 2, lip.d1 + SPEED * t);
  }
}

// Sometimes park a row of cars before a jump.
function approach(w, seg, d, chance = 0.5) {
  if (Math.random() > chance) return d;
  w.addCrushRow(seg, d + 6, rand(0.4, 0.8));
  return d + 30;
}

export const BUILDERS = {
  // One, two or three little kickers in a row.
  kickers(w, seg, d) {
    const n = pick([1, 2, 2, 3]);
    for (let i = 0; i < n; i++) {
      const H = rand(1.8, 2.8);
      const lip = launchRamp(w, seg, d, { H, L: H * 3.4, launch: rand(9, 11.5) });
      const tF = flightTime(H, lip.launch);
      arcStars(w, seg, lip, 3, pick(LANES), tF * 0.9);
      d = lip.d1 + SPEED * tF + rand(8, 14);
    }
    return d + 8;
  },

  // The classic: a big dirt ramp, sometimes with a landing hill.
  ramp(w, seg, d) {
    d = approach(w, seg, d, 0.55);
    const H = rand(3.5, 6);
    const lip = launchRamp(w, seg, d, { H, L: H * 4.5, launch: rand(15, 19) });
    if (Math.random() < 0.5) {
      const hill = landingHill(w, seg, lip, { Hl: H * 0.6 });
      arcStars(w, seg, lip, 5, pick(LANES), hill.landT * 0.85);
      return hill.end + rand(15, 25);
    }
    const tF = flightTime(H, lip.launch);
    arcStars(w, seg, lip, 5, pick(LANES), tF * 0.9);
    // Sometimes park cars right where the truck lands. CRUNCH.
    if (Math.random() < 0.5) w.addCrushRow(seg, lip.d1 + SPEED * tF * rand(0.85, 1.0), 0.8);
    return lip.d1 + SPEED * tF + rand(20, 35);
  },

  // Launch off the lip, fly over a flat deck, land on the far slope.
  tabletop(w, seg, d) {
    const H = rand(3.5, 4.5);
    const lip = launchRamp(w, seg, d, { H, L: H * 4.2, launch: rand(13, 15) });
    // The jump comes back down to deck height after 2v/g; end the deck a bit
    // before that so the truck lands on the down slope.
    const deck = SPEED * (2 * lip.launch / GRAVITY) * 0.7;
    const drop = H * 5;
    const samples = [{ d: lip.d1, y: H }, { d: lip.d1 + deck, y: H }];
    ease(samples, lip.d1 + deck, lip.d1 + deck + drop, H, 0, 12);
    surface(w, seg, samples);
    arcStars(w, seg, lip, 5, pick(LANES), (2 * lip.launch / GRAVITY) * 0.9);
    return lip.d1 + deck + drop + rand(18, 26);
  },

  // Quick little bumps: bouncy!
  whoops(w, seg, d) {
    const count = Math.round(rand(6, 9));
    const wave = rand(7, 9);
    const A = rand(0.9, 1.3);
    const samples = [];
    const N = count * 8;
    for (let i = 0; i <= N; i++) {
      const dd = d + (i / N) * count * wave;
      samples.push({ d: dd, y: A * (1 - Math.cos(((dd - d) / wave) * Math.PI * 2)) / 2 });
    }
    surface(w, seg, samples, { style: 'roller' });
    const lane = pick(LANES);
    for (let i = 0; i < count; i += 2) w.addStar(seg, lane, A + 3, d + (i + 0.5) * wave);
    return d + count * wave + 18;
  },

  // Long, gentle rolling hills.
  rollers(w, seg, d) {
    const count = 4;
    const wave = 26;
    const A = 1.8;
    const samples = [];
    const N = count * 10;
    for (let i = 0; i <= N; i++) {
      const dd = d + (i / N) * count * wave;
      samples.push({ d: dd, y: A * (1 - Math.cos(((dd - d) / wave) * Math.PI * 2)) / 2 });
    }
    surface(w, seg, samples, { style: 'roller' });
    for (let i = 0; i < count; i++) w.addStar(seg, pick(LANES), A + 3.5, d + (i + 0.5) * wave + 4);
    return d + count * wave + 20;
  },

  // Pick a side: a big kicker in one lane, cars to crush in the other.
  laneKickers(w, seg, d) {
    const side = pick([-1, 1]);
    const [x0, x1] = side < 0 ? [-WALL_X, -1.5] : [1.5, WALL_X];
    const H = rand(4, 5);
    const lip = launchRamp(w, seg, d, { H, L: H * 4, launch: rand(15, 17), x0, x1 });
    const tF = flightTime(H, lip.launch);
    arcStars(w, seg, lip, 6, lip.lane, tF * 0.9);
    // The other lane: a column of cars to drive through.
    for (let k = 0; k < 3; k++) w.addCrushable(seg, w.crushKind(), -side * 7 + rand(-0.6, 0.6), d + 6 + k * 7);
    return lip.d1 + SPEED * tF + rand(20, 30);
  },

  // Jump a gap full of junk onto a landing hill.
  gap(w, seg, d) {
    const H = rand(4.5, 6);
    const lip = launchRamp(w, seg, d, { H, L: H * 4.3, launch: rand(16, 18.5) });
    const hill = landingHill(w, seg, lip, { Hl: H * 0.7 });
    for (let dd = lip.d1 + 7; dd < hill.start - 4; dd += 6.5) {
      w.addCrushRow(seg, dd, 0.75, ['junker', 'junker', 'stack', 'sedan', 'crates']);
    }
    arcStars(w, seg, lip, 6, pick(LANES), hill.landT * 0.85);
    return hill.end + rand(18, 28);
  },

  // Fly over (or onto!) a row of school buses.
  bus(w, seg, d) {
    const H = 5.5;
    const lip = launchRamp(w, seg, d, { H, L: 24, launch: 17 });
    const tF = flightTime(H, lip.launch);
    const landD = lip.d1 + SPEED * tF;
    const count = Math.round(rand(5, 7));
    for (let i = 0; i < count; i++) {
      const bd = landD - 2.9 * (count - 1) + i * 2.9 + 2;
      for (const x of [-5.8, 5.8]) w.addCrushable(seg, 'bus', x, bd, { across: true });
    }
    arcStars(w, seg, lip, 6, pick(LANES), tF * 0.9);
    return landD + 28;
  },

  // A big field of stuff to squash.
  crushZone(w, seg, d) {
    const rows = Math.round(rand(5, 7));
    for (let i = 0; i < rows; i++) {
      if (Math.random() < 0.25) {
        // A long vehicle parked along the track in one lane.
        w.addCrushable(seg, pick(['limo', 'rv']), pick(LANES), d + 8 + i * 10);
      } else {
        w.addCrushRow(seg, d + 8 + i * 10, rand(0.55, 0.85));
      }
    }
    return d + rows * 10 + 20;
  },

  // A towering steel mega ramp with a steel landing ramp.
  mega(w, seg, d) {
    d = approach(w, seg, d, 0.4);
    const H = rand(14, 17);
    const lip = launchRamp(w, seg, d, { H, L: H * 2.9, launch: rand(27, 30), style: 'steel', mega: true, label: 'MEGA RAMP!' });
    const hill = landingHill(w, seg, lip, { Hl: 9, style: 'steel' });
    arcStars(w, seg, lip, 9, pick(LANES), hill.landT * 0.85);
    return hill.end + rand(25, 35);
  },

  // The biggest jump of all, with nitro waiting right before it.
  sky(w, seg, d) {
    for (const x of LANES) w.addPowerUp(seg, 'nitro', x, 2.6, d + 8);
    d += 24;
    const H = 24;
    const lip = launchRamp(w, seg, d, { H, L: 64, launch: 34, style: 'steel', mega: true, label: 'SKY RAMP!' });
    const hill = landingHill(w, seg, lip, { Hl: 12, style: 'steel' });
    arcStars(w, seg, lip, 12, pick(LANES), hill.landT * 0.85);
    return hill.end + 35;
  },
};

const WEIGHTS = { kickers: 2, ramp: 3, tabletop: 2, whoops: 1.5, rollers: 1, laneKickers: 2, gap: 2, bus: 1.5, crushZone: 1.5 };
const RESTS = ['crushZone', 'whoops', 'rollers', 'kickers'];

// Picks the next feature: never the same twice in a row, building up to a
// mega or sky ramp every few sections, with something easy right after.
export class Sequencer {
  constructor(forced = []) {
    this.forced = forced.filter((k) => BUILDERS[k]);
    this.i = 0;
    this.last = '';
    this.heat = 0;
    this.bigs = 0;
  }

  next() {
    let kind;
    if (this.forced.length) {
      kind = this.forced[this.i++ % this.forced.length];
    } else if (!this.last) {
      kind = 'ramp';
    } else if (this.last === 'mega' || this.last === 'sky') {
      kind = pick(RESTS);
    } else if (this.heat >= 4 && Math.random() < 0.35 * (this.heat - 3)) {
      this.bigs++;
      kind = this.bigs % 2 === 0 ? 'sky' : 'mega';
      this.heat = 0;
    } else {
      const options = Object.keys(WEIGHTS).filter((k) => k !== this.last);
      let r = Math.random() * options.reduce((s, k) => s + WEIGHTS[k], 0);
      kind = options.find((k) => (r -= WEIGHTS[k]) < 0) || options[0];
    }
    this.heat++;
    this.last = kind;
    return kind;
  }
}
