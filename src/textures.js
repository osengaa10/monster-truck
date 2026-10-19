// Procedural textures, all drawn on canvases at startup (no image files, so
// the game stays tiny and works offline).
import * as THREE from '../vendor/three.module.min.js';

export function makeRng(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Tileable fractal value noise in [0, 1], size x size.
export function fbm(size, { octaves = 4, period = 8, gain = 0.5, rng = Math.random } = {}) {
  const out = new Float32Array(size * size);
  let amp = 1;
  let total = 0;
  for (let o = 0; o < octaves; o++) {
    const p = period << o;
    const grid = new Float32Array(p * p);
    for (let i = 0; i < grid.length; i++) grid[i] = rng();
    const cell = size / p;
    for (let y = 0; y < size; y++) {
      const gy = y / cell;
      const y0 = Math.floor(gy);
      let ty = gy - y0;
      ty = ty * ty * (3 - 2 * ty);
      const r0 = (y0 % p) * p;
      const r1 = ((y0 + 1) % p) * p;
      for (let x = 0; x < size; x++) {
        const gx = x / cell;
        const x0 = Math.floor(gx);
        let tx = gx - x0;
        tx = tx * tx * (3 - 2 * tx);
        const c0 = x0 % p;
        const c1 = (x0 + 1) % p;
        const a = grid[r0 + c0] + (grid[r0 + c1] - grid[r0 + c0]) * tx;
        const b = grid[r1 + c0] + (grid[r1 + c1] - grid[r1 + c0]) * tx;
        out[y * size + x] += (a + (b - a) * ty) * amp;
      }
    }
    total += amp;
    amp *= gain;
  }
  for (let i = 0; i < out.length; i++) out[i] /= total;
  return out;
}

function canvas(w, h = w) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

export function texture(c, { repeat = [1, 1], color = true, wrap = true } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (wrap) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat[0], repeat[1]);
  if (color) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

// Fill a canvas pixel by pixel: fn(i, x, y) -> [r, g, b] (0-255).
function paint(size, fn) {
  const c = canvas(size);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  const d = img.data;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      const [r, g, b] = fn(i, x, y);
      d[i * 4] = r;
      d[i * 4 + 1] = g;
      d[i * 4 + 2] = b;
      d[i * 4 + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

// Tangent-space normal map from a (tileable) height field.
function normalMap(height, size, strength) {
  const h = (x, y) => height[((y + size) % size) * size + ((x + size) % size)];
  return paint(size, (i, x, y) => {
    const dx = (h(x + 1, y - 1) + 2 * h(x + 1, y) + h(x + 1, y + 1)) - (h(x - 1, y - 1) + 2 * h(x - 1, y) + h(x - 1, y + 1));
    const dy = (h(x - 1, y + 1) + 2 * h(x, y + 1) + h(x + 1, y + 1)) - (h(x - 1, y - 1) + 2 * h(x, y - 1) + h(x + 1, y - 1));
    let nx = -dx * strength;
    let ny = dy * strength;
    const len = Math.hypot(nx, ny, 1);
    return [(nx / len * 0.5 + 0.5) * 255, (ny / len * 0.5 + 0.5) * 255, (1 / len * 0.5 + 0.5) * 255];
  });
}

const mix = (a, b, t) => a + (b - a) * t;
const mix3 = (a, b, t) => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];
const hexRgb = (h) => [(h >> 16) & 255, (h >> 8) & 255, h & 255];

// Dirt with clods, pebbles and (optionally) tire ruts running along the track.
// Returns { map, normalMap } as canvases.
function dirtCanvases(size, { dark, light, ruts = 0, pebbles = 900, smooth = 0, seed = 1, period = 6 }) {
  const rng = makeRng(seed);
  const base = fbm(size, { octaves: 5, period, rng });
  const fine = fbm(size, { octaves: 2, period: 64, rng });
  const height = new Float32Array(size * size);
  for (let i = 0; i < height.length; i++) height[i] = base[i] * (1 - smooth * 0.6) + fine[i] * 0.35 * (1 - smooth);
  // Tire ruts: pairs of parallel grooves with tread marks, running along v.
  const rutMask = new Float32Array(size);
  for (let r = 0; r < ruts; r++) {
    const cx = rng() * size;
    const w = size * (0.05 + rng() * 0.03);
    for (let x = 0; x < size; x++) {
      let dx = Math.abs(x - cx);
      dx = Math.min(dx, size - dx);
      if (dx < w) rutMask[x] = Math.max(rutMask[x], Math.cos((dx / w) * Math.PI * 0.5));
    }
  }
  const tread = size / 16;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const m = rutMask[x];
      if (!m) continue;
      const i = y * size + x;
      const lug = ((y + (x % 7 < 3 ? tread / 2 : 0)) % tread) < tread * 0.45 ? 1 : 0;
      height[i] = mix(height[i], 0.32 + lug * 0.08 + fine[i] * 0.12, m * 0.6);
    }
  }
  // Pebbles: small bright bumps.
  const pebble = new Float32Array(size * size);
  for (let k = 0; k < pebbles; k++) {
    const px = rng() * size;
    const py = rng() * size;
    const pr = 0.8 + rng() * 2.2;
    for (let y = Math.floor(py - pr); y <= py + pr; y++) {
      for (let x = Math.floor(px - pr); x <= px + pr; x++) {
        const dd = Math.hypot(x - px, y - py) / pr;
        if (dd > 1) continue;
        const i = ((y + size) % size) * size + ((x + size) % size);
        pebble[i] = Math.max(pebble[i], Math.sqrt(1 - dd * dd));
      }
    }
  }
  for (let i = 0; i < height.length; i++) height[i] += pebble[i] * 0.25;
  const D = hexRgb(dark);
  const L = hexRgb(light);
  const map = paint(size, (i, x) => {
    const t = Math.min(1, Math.max(0, (height[i] - 0.25) * 1.6));
    let c = mix3(D, L, t);
    c = mix3(c, mix3(D, [0, 0, 0], 0.2), rutMask[x] * 0.25);
    if (pebble[i] > 0.2) c = mix3(c, [170, 158, 140], pebble[i] * 0.35);
    return c;
  });
  return { map, normal: normalMap(height, size, 2.2) };
}

export function dirtTextures(opts, repeat) {
  const c = dirtCanvases(512, opts);
  return { map: texture(c.map, { repeat }), normalMap: texture(c.normal, { repeat, color: false }) };
}

export function grassTexture(repeat, { dark = 0x3f7f2f, light = 0x7bb84a, seed = 3 } = {}) {
  const size = 256;
  const rng = makeRng(seed);
  const n = fbm(size, { octaves: 5, period: 4, rng });
  const D = hexRgb(dark);
  const L = hexRgb(light);
  const c = paint(size, (i) => mix3(D, L, n[i]));
  const ctx = c.getContext('2d');
  // Little blades of grass.
  for (let k = 0; k < 2500; k++) {
    const x = rng() * size;
    const y = rng() * size;
    const t = rng();
    ctx.strokeStyle = `rgba(${mix(D[0], L[0] * 1.15, t) | 0},${mix(D[1], L[1] * 1.1, t) | 0},${mix(D[2], L[2], t) | 0},0.7)`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + (rng() - 0.5) * 3, y - 2 - rng() * 4);
    ctx.stroke();
  }
  return texture(c, { repeat });
}

export function concreteTexture(repeat) {
  const size = 256;
  const rng = makeRng(7);
  const n = fbm(size, { octaves: 5, period: 4, rng });
  const s = fbm(size, { octaves: 2, period: 32, rng });
  const c = paint(size, (i, x, y) => {
    const v = 150 + n[i] * 70 - s[i] * 25 - (y > size * 0.85 ? (y - size * 0.85) * 1.2 : 0);
    return [v, v * 0.98, v * 0.95];
  });
  return texture(c, { repeat });
}

// Long strip of colorful made-up banners for the arena walls.
export function bannerTexture(repeatX) {
  const W = 2048;
  const H = 128;
  const c = canvas(W, H);
  const ctx = c.getContext('2d');
  const panels = [
    ['#d32f2f', '#ffffff', 'MONSTER TRUCK'],
    ['#1a1a1a', '#ffd600', 'BIG AIR!'],
    ['#1565c0', '#ffffff', '⭐ STAR SERIES ⭐'],
    ['#ffd600', '#1a1a1a', 'CRUSH IT!'],
    ['#2e7d32', '#ffffff', 'FLIP ZONE'],
    ['#6a1b9a', '#ffeb3b', 'MEGA RAMP'],
  ];
  const pw = W / panels.length;
  panels.forEach(([bg, fg, text], i) => {
    ctx.fillStyle = bg;
    ctx.fillRect(i * pw, 0, pw, H);
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fillRect(i * pw, 0, pw, H * 0.45);
    ctx.fillStyle = fg;
    ctx.font = `900 ${H * 0.5}px system-ui, -apple-system, Helvetica, Arial, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, i * pw + pw / 2, H * 0.54, pw * 0.9);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(i * pw + pw - 3, 0, 3, H);
  });
  ctx.fillStyle = '#e0e0e0';
  ctx.fillRect(0, 0, W, 6);
  ctx.fillRect(0, H - 6, W, 6);
  return texture(c, { repeat: [repeatX, 1] });
}

// Chain-link fence: alpha-tested diamond wire pattern.
export function fenceTexture(repeat) {
  const size = 64;
  const c = canvas(size);
  const ctx = c.getContext('2d');
  ctx.strokeStyle = '#c8cdd2';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  for (let k = -1; k <= 1; k++) {
    ctx.moveTo(k * size, 0);
    ctx.lineTo(k * size + size, size);
    ctx.moveTo(k * size + size, 0);
    ctx.lineTo(k * size, size);
  }
  ctx.stroke();
  return texture(c, { repeat });
}

// Plywood deck boards for big built ramps.
export function plankTexture(repeat) {
  const size = 256;
  const rng = makeRng(11);
  const grain = fbm(size, { octaves: 4, period: 4, rng });
  const scuff = fbm(size, { octaves: 3, period: 4, rng });
  const c = paint(size, (i, x, y) => {
    const board = Math.floor(y / (size / 8));
    const g = grain[(y * size + ((x * 3 + board * 50) % size))];
    const seam = y % (size / 8) < 2 ? 0.5 : 1;
    // Darker where tires have worn it, down the middle of the deck.
    const wear = 1 - 0.25 * Math.max(0, scuff[i] - 0.4) * 2;
    const v = (0.62 + g * 0.3 + ((board * 37) % 10) / 70) * seam * wear;
    return [178 * v, 140 * v, 98 * v];
  });
  return texture(c, { repeat });
}

// Soft round blob (for dust, smoke and shadows).
export function softDot(size = 64, inner = 'rgba(255,255,255,1)', outer = 'rgba(255,255,255,0)') {
  const c = canvas(size);
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, inner);
  g.addColorStop(1, outer);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return texture(c, { wrap: false });
}

// Steel scaffolding seen from the side: alpha-tested frame with X bracing.
export function trussTexture(repeat) {
  const size = 128;
  const c = canvas(size);
  const ctx = c.getContext('2d');
  ctx.strokeStyle = '#8d959c';
  ctx.lineCap = 'square';
  ctx.lineWidth = 10;
  ctx.strokeRect(5, 5, size - 10, size - 10);
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(8, 8);
  ctx.lineTo(size - 8, size - 8);
  ctx.moveTo(size - 8, 8);
  ctx.lineTo(8, size - 8);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 2;
  ctx.strokeRect(3, 3, size - 6, size - 6);
  return texture(c, { repeat });
}

// Yellow and black warning stripes.
export function hazardTexture(repeat) {
  const c = canvas(64);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#ffc400';
  ctx.fillRect(0, 0, 64, 64);
  ctx.fillStyle = '#151515';
  for (let k = -64; k < 128; k += 32) {
    ctx.beginPath();
    ctx.moveTo(k, 64);
    ctx.lineTo(k + 16, 64);
    ctx.lineTo(k + 80, 0);
    ctx.lineTo(k + 64, 0);
    ctx.fill();
  }
  return texture(c, { repeat });
}

// Desert sand with wind ripples.
export function sandTexture(repeat) {
  const size = 256;
  const rng = makeRng(13);
  const n = fbm(size, { octaves: 5, period: 4, rng });
  const c = paint(size, (i, x, y) => {
    const ripple = Math.sin((y + n[i] * 40) * 0.35) * 0.5 + 0.5;
    const v = 0.82 + n[i] * 0.22 + ripple * 0.06;
    return [222 * v, 184 * v, 136 * v];
  });
  return texture(c, { repeat });
}

// Paved concourse around the stadium.
export function asphaltTexture(repeat) {
  const size = 256;
  const rng = makeRng(17);
  const n = fbm(size, { octaves: 5, period: 8, rng });
  const c = paint(size, (i) => {
    const v = 92 + n[i] * 40 + (rng() < 0.03 ? 30 : 0);
    return [v, v, v * 1.02];
  });
  return texture(c, { repeat });
}

// One row of fans in the stands: heads and shirts in all colors.
// Tiles horizontally; v goes from the seat (0) to the top of the row (1).
export function crowdTexture() {
  const W = 512;
  const H = 64;
  const c = canvas(W, H);
  const ctx = c.getContext('2d');
  const rng = makeRng(23);
  ctx.fillStyle = '#3a3f47';
  ctx.fillRect(0, 0, W, H);
  const shirts = ['#e53935', '#1e88e5', '#fdd835', '#43a047', '#fb8c00', '#8e24aa', '#ffffff', '#212121', '#00acc1', '#d81b60'];
  const skins = ['#f1c27d', '#e0ac69', '#c68642', '#8d5524', '#ffdbac'];
  for (let x = 4; x < W; x += 9 + rng() * 4) {
    const h = 26 + rng() * 12;
    ctx.fillStyle = shirts[(rng() * shirts.length) | 0];
    ctx.beginPath();
    ctx.ellipse(x, H - h * 0.35, 5.5, h * 0.42, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = skins[(rng() * skins.length) | 0];
    ctx.beginPath();
    ctx.arc(x, H - h * 0.85, 4, 0, Math.PI * 2);
    ctx.fill();
    if (rng() < 0.2) {
      // Waving arms!
      ctx.strokeStyle = ctx.fillStyle;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(x - 4, H - h * 0.6);
      ctx.lineTo(x - 8, H - h * 1.05);
      ctx.moveTo(x + 4, H - h * 0.6);
      ctx.lineTo(x + 8, H - h * 1.05);
      ctx.stroke();
    }
  }
  return texture(c, { repeat: [1, 1] });
}

// A soft, lumpy cloud made of overlapping puffs (with alpha).
export function cloudTexture(seed = 29) {
  const W = 256;
  const H = 128;
  const c = canvas(W, H);
  const ctx = c.getContext('2d');
  const rng = makeRng(seed);
  for (let i = 0; i < 26; i++) {
    const x = W * (0.2 + rng() * 0.6);
    const y = H * (0.45 + rng() * 0.25);
    const r = H * (0.12 + rng() * 0.2);
    const g = ctx.createRadialGradient(x, y - r * 0.3, 0, x, y, r);
    g.addColorStop(0, 'rgba(255,255,255,0.9)');
    g.addColorStop(0.6, 'rgba(245,248,252,0.6)');
    g.addColorStop(1, 'rgba(230,236,245,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  return texture(c, { wrap: false });
}
