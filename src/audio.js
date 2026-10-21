// All sounds are synthesized with Web Audio, so there are no files to load.

export class Sfx {
  constructor() {
    this.ctx = null;
  }

  // Must be called from inside a user gesture (iOS requirement).
  init() {
    if (this.ctx) {
      this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    // Play even when the iPhone ring/silent switch is on silent (Safari 17+).
    try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch { /* unsupported */ }
    const ctx = new AC();
    this.ctx = ctx;
    const comp = ctx.createDynamicsCompressor();
    comp.connect(ctx.destination);
    this.master = ctx.createGain();
    this.master.gain.value = 0.8;
    this.master.connect(comp);

    const len = ctx.sampleRate;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;

    this.startEngine();

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) ctx.suspend();
      else ctx.resume();
    });
  }

  get t() { return this.ctx.currentTime; }

  env(gainNode, start, peak, attack, decay) {
    const g = gainNode.gain;
    g.setValueAtTime(0.0001, start);
    g.exponentialRampToValueAtTime(peak, start + attack);
    g.exponentialRampToValueAtTime(0.0001, start + attack + decay);
  }

  osc(type, freq, dest) {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    o.connect(dest);
    return o;
  }

  gain(dest = this.master) {
    const g = this.ctx.createGain();
    g.connect(dest);
    return g;
  }

  noiseSrc(dest) {
    const s = this.ctx.createBufferSource();
    s.buffer = this.noise;
    s.loop = true;
    s.connect(dest);
    return s;
  }

  filter(type, freq, dest, q = 1) {
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    f.connect(dest);
    return f;
  }

  startEngine() {
    // oscillators -> lowpass -> tremolo (chugging) -> volume
    this.engineGain = this.gain();
    this.engineGain.gain.value = 0.06;
    const trem = this.gain(this.engineGain);
    trem.gain.value = 0.5;
    const lp = this.filter('lowpass', 500, trem);
    this.engineOsc1 = this.osc('sawtooth', 50, lp);
    this.engineOsc2 = this.osc('square', 51.5, lp);
    const lfoDepth = this.gain(trem.gain);
    lfoDepth.gain.value = 0.4;
    this.lfo = this.osc('sine', 14, lfoDepth);
    this.engineOsc1.start();
    this.engineOsc2.start();
    this.lfo.start();
  }

  setEngine(speedNorm, airborne) {
    if (!this.ctx) return;
    const f = 42 + speedNorm * 30 + (airborne ? 35 : 0);
    const t = this.t;
    this.engineOsc1.frequency.setTargetAtTime(f, t, 0.15);
    this.engineOsc2.frequency.setTargetAtTime(f * 1.03, t, 0.15);
    this.lfo.frequency.setTargetAtTime(10 + f * 0.1, t, 0.15);
  }

  honk() {
    if (!this.ctx) return;
    const t = this.t;
    const g = this.gain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.25, t + 0.02);
    g.gain.setValueAtTime(0.25, t + 0.35);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
    const lp = this.filter('lowpass', 1800, g);
    for (const f of [330, 415]) {
      const o = this.osc('sawtooth', f, lp);
      o.start(t);
      o.stop(t + 0.5);
    }
  }

  boing() {
    if (!this.ctx) return;
    const t = this.t;
    const g = this.gain();
    this.env(g, t, 0.35, 0.01, 0.35);
    const o = this.osc('sine', 150, g);
    o.frequency.exponentialRampToValueAtTime(520, t + 0.3);
    const depth = this.gain(o.frequency);
    depth.gain.value = 40;
    const vib = this.osc('sine', 28, depth);
    o.start(t); vib.start(t);
    o.stop(t + 0.4); vib.stop(t + 0.4);
  }

  pop() {
    if (!this.ctx) return;
    const t = this.t;
    const g = this.gain();
    this.env(g, t, 0.3, 0.005, 0.12);
    const o = this.osc('triangle', 700, g);
    o.frequency.exponentialRampToValueAtTime(1600, t + 0.08);
    o.start(t);
    o.stop(t + 0.15);
    // Twinkle.
    const g2 = this.gain();
    this.env(g2, t + 0.06, 0.12, 0.005, 0.2);
    const o2 = this.osc('sine', 2093, g2);
    o2.start(t + 0.06);
    o2.stop(t + 0.3);
  }

  // A short burst of filtered noise (one "grain" of a crunch or crack).
  grain(start, freq, q, peak, length, type = 'bandpass') {
    const g = this.gain();
    this.env(g, start, peak, 0.002, length);
    const n = this.noiseSrc(this.filter(type, freq, g, q));
    n.start(start, Math.random());
    n.stop(start + length + 0.05);
  }

  // A falling sine "thump" for weight.
  thump(start, from, to, peak, length) {
    const g = this.gain();
    this.env(g, start, peak, 0.004, length);
    const o = this.osc('sine', from, g);
    o.frequency.exponentialRampToValueAtTime(to, start + length);
    o.start(start);
    o.stop(start + length + 0.05);
  }

  // Squashing something, with a sound to match what it's made of.
  crush(kind) {
    if (!this.ctx) return;
    const t = this.t;
    const r = Math.random;
    if (kind === 'hay') {
      // Soft whump and a rustle of straw.
      this.thump(t, 140, 50, 0.5, 0.25);
      this.grain(t, 350, 0.7, 0.35, 0.3, 'lowpass');
      for (let i = 0; i < 8; i++) this.grain(t + 0.03 + r() * 0.35, 3000 + r() * 3000, 1, 0.08, 0.06, 'highpass');
      return;
    }
    if (kind === 'crates') {
      // Thump and a run of sharp wood cracks.
      this.thump(t, 160, 60, 0.6, 0.2);
      for (let i = 0; i < 6; i++) this.grain(t + i * 0.035 + r() * 0.02, 1400 + r() * 1400, 1.5, 0.45, 0.025);
      this.grain(t + 0.02, 600, 2, 0.3, 0.15);
      return;
    }
    if (kind === 'potty') {
      // A hollow plastic BONK.
      this.thump(t, 260, 120, 0.6, 0.3);
      const g = this.gain();
      this.env(g, t, 0.25, 0.003, 0.35);
      const o = this.osc('triangle', 330, this.filter('bandpass', 500, g, 6));
      o.frequency.exponentialRampToValueAtTime(180, t + 0.3);
      o.start(t);
      o.stop(t + 0.4);
      this.grain(t, 2000, 1, 0.3, 0.05);
      return;
    }
    // Vehicles: a heavy thump, crumpling sheet metal, a bending groan and
    // shattering glass. Big ones are deeper and last longer.
    const heavy = kind === 'bus' || kind === 'rv' || kind === 'limo' || kind === 'stack';
    const len = heavy ? 1.5 : 1;
    this.thump(t, heavy ? 90 : 120, heavy ? 28 : 38, 0.8, 0.35 * len);
    if (heavy) this.thump(t + 0.12, 70, 30, 0.5, 0.3);
    const grains = heavy ? 16 : 10;
    for (let i = 0; i < grains; i++) {
      this.grain(t + (i / grains) * 0.28 * len + r() * 0.02, (heavy ? 600 : 900) + r() * 2200, 3 + r() * 4, 0.35 + r() * 0.25, 0.02 + r() * 0.03);
    }
    this.grain(t, 1200, 0.8, 0.45, 0.18 * len); // the main crunch body
    // Sheet metal groaning as it bends.
    const g = this.gain();
    this.env(g, t + 0.03, 0.18, 0.04, 0.3 * len);
    const o = this.osc('sawtooth', heavy ? 140 : 200, this.filter('bandpass', heavy ? 450 : 650, g, 5));
    o.frequency.exponentialRampToValueAtTime(heavy ? 55 : 80, t + 0.35 * len);
    o.start(t + 0.03);
    o.stop(t + 0.45 * len);
    // Glass: a bright smash, then tinkling bits.
    if (kind !== 'junker') {
      this.grain(t + 0.02, 5000, 0.8, 0.3, 0.12, 'highpass');
      for (let i = 0; i < 9; i++) {
        const start = t + 0.04 + r() * 0.4;
        const tg = this.gain();
        this.env(tg, start, 0.05 + r() * 0.05, 0.002, 0.05 + r() * 0.08);
        const ping = this.osc('sine', 2500 + r() * 4000, tg);
        ping.start(start);
        ping.stop(start + 0.16);
      }
    }
  }

  thud(strength = 1) {
    if (!this.ctx) return;
    const t = this.t;
    const g = this.gain();
    this.env(g, t, 0.5 * strength + 0.1, 0.005, 0.3);
    const o = this.osc('sine', 140, g);
    o.frequency.exponentialRampToValueAtTime(38, t + 0.25);
    o.start(t);
    o.stop(t + 0.35);
    const g2 = this.gain();
    this.env(g2, t, 0.3 * strength, 0.005, 0.25);
    const n = this.noiseSrc(this.filter('lowpass', 350, g2));
    n.start(t, Math.random());
    n.stop(t + 0.3);
  }

  whoosh() {
    if (!this.ctx) return;
    const t = this.t;
    const g = this.gain();
    this.env(g, t, 0.25, 0.1, 0.5);
    const bp = this.filter('bandpass', 400, g, 2);
    bp.frequency.exponentialRampToValueAtTime(2200, t + 0.5);
    const n = this.noiseSrc(bp);
    n.start(t, Math.random());
    n.stop(t + 0.7);
  }

  fanfare(big = false) {
    if (!this.ctx) return;
    const t = this.t;
    const notes = big ? [523, 659, 784, 1047, 784, 1047] : [523, 659, 784, 1047];
    const step = 0.09;
    notes.forEach((f, i) => {
      const g = this.gain();
      const start = t + i * step;
      const last = i === notes.length - 1;
      this.env(g, start, 0.16, 0.01, last ? 0.6 : 0.12);
      const o = this.osc('square', f, this.filter('lowpass', 3000, g));
      o.start(start);
      o.stop(start + (last ? 0.7 : 0.2));
    });
    // Crowd cheer: a swell of filtered noise.
    const g = this.gain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(big ? 0.35 : 0.22, t + 0.25);
    g.gain.exponentialRampToValueAtTime(0.0001, t + (big ? 2.2 : 1.4));
    const bp = this.filter('bandpass', 1500, g, 0.6);
    const n = this.noiseSrc(bp);
    n.start(t, Math.random());
    n.stop(t + 2.3);
  }

  // Rising sparkly arpeggio for picking up a power-up.
  powerup() {
    if (!this.ctx) return;
    const t = this.t;
    [392, 523, 659, 784, 1047, 1319].forEach((f, i) => {
      const g = this.gain();
      const start = t + i * 0.055;
      this.env(g, start, 0.14, 0.01, 0.25);
      const o = this.osc('triangle', f, g);
      o.frequency.exponentialRampToValueAtTime(f * 1.5, start + 0.25);
      o.start(start);
      o.stop(start + 0.3);
    });
  }

  // A deep roar with a rushing blast of air, for nitro.
  nitro() {
    if (!this.ctx) return;
    const t = this.t;
    const g = this.gain();
    this.env(g, t, 0.4, 0.05, 1.2);
    const lp = this.filter('lowpass', 900, g);
    const o = this.osc('sawtooth', 60, lp);
    o.frequency.exponentialRampToValueAtTime(140, t + 0.8);
    o.start(t);
    o.stop(t + 1.3);
    const g2 = this.gain();
    this.env(g2, t, 0.3, 0.05, 1.0);
    const n = this.noiseSrc(this.filter('bandpass', 700, g2, 0.8));
    n.start(t, Math.random());
    n.stop(t + 1.1);
  }
}
