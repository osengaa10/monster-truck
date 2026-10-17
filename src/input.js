// Touch + mouse + keyboard input.
// - Holding the left/right half of the screen steers (both = straight).
// - Quick swipes queue stunt moves ('up', 'down', 'left', 'right').
// - Elements with [data-btn] are buttons; touches that start on them never steer.

const SWIPE_WINDOW_MS = 250;

export class Input {
  constructor({ onButtonDown, onButtonUp }) {
    this.onButtonDown = onButtonDown;
    this.onButtonUp = onButtonUp;
    this.pointers = new Map(); // id -> { x, y, ax, ay, at, btn }
    this.keys = new Set();
    this.swipes = [];

    const opts = { passive: false };
    window.addEventListener('touchstart', (e) => {
      e.preventDefault();
      for (const t of e.changedTouches) this.down(t.identifier, t.clientX, t.clientY, t.target);
    }, opts);
    window.addEventListener('touchmove', (e) => {
      e.preventDefault();
      for (const t of e.changedTouches) this.move(t.identifier, t.clientX, t.clientY);
    }, opts);
    const end = (e) => {
      e.preventDefault();
      for (const t of e.changedTouches) this.up(t.identifier);
    };
    window.addEventListener('touchend', end, opts);
    window.addEventListener('touchcancel', end, opts);

    // Mouse, for testing on a computer.
    window.addEventListener('mousedown', (e) => this.down('mouse', e.clientX, e.clientY, e.target));
    window.addEventListener('mousemove', (e) => this.move('mouse', e.clientX, e.clientY));
    window.addEventListener('mouseup', () => this.up('mouse'));

    // Block iOS pinch-zoom, long-press menus, etc.
    for (const ev of ['gesturestart', 'gesturechange', 'gestureend', 'contextmenu', 'dblclick']) {
      document.addEventListener(ev, (e) => e.preventDefault(), opts);
    }

    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      const swipe = {
        ArrowUp: 'up', KeyW: 'up',
        ArrowDown: 'down', KeyS: 'down',
        KeyQ: 'left', KeyE: 'right',
      }[e.code];
      if (swipe) this.swipes.push(swipe);
      if (e.code === 'Space') this.onButtonDown('honk', null);
    });
    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
      if (e.code === 'Space') this.onButtonUp('honk', null);
    });
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.pointers.clear();
    });
  }

  down(id, x, y, target) {
    const btnEl = target && target.closest ? target.closest('[data-btn]') : null;
    const btn = btnEl ? btnEl.dataset.btn : null;
    this.pointers.set(id, { x, y, ax: x, ay: y, at: performance.now(), btn, btnEl });
    if (btn) this.onButtonDown(btn, btnEl);
  }

  move(id, x, y) {
    const p = this.pointers.get(id);
    if (!p || p.btn) return;
    p.x = x;
    p.y = y;
    const now = performance.now();
    // Only fast flicks count: re-anchor slow drags.
    if (now - p.at > SWIPE_WINDOW_MS) {
      p.ax = x; p.ay = y; p.at = now;
      return;
    }
    const dx = x - p.ax;
    const dy = y - p.ay;
    const threshold = Math.max(35, Math.min(window.innerWidth, window.innerHeight) * 0.06);
    if (Math.hypot(dx, dy) > threshold) {
      if (Math.abs(dx) > Math.abs(dy)) this.swipes.push(dx > 0 ? 'right' : 'left');
      else this.swipes.push(dy > 0 ? 'down' : 'up');
      // Re-anchor so frantic scribbling keeps producing more stunts.
      p.ax = x; p.ay = y; p.at = now;
    }
  }

  up(id) {
    const p = this.pointers.get(id);
    if (!p) return;
    this.pointers.delete(id);
    if (p.btn) this.onButtonUp(p.btn, p.btnEl);
  }

  // Returns what's being held and drains queued swipes.
  // up/down/rollLeft/rollRight are keyboard-only holds for flips and rolls.
  poll() {
    const k = this.keys;
    let left = k.has('ArrowLeft') || k.has('KeyA');
    let right = k.has('ArrowRight') || k.has('KeyD');
    const up = k.has('ArrowUp') || k.has('KeyW');
    const down = k.has('ArrowDown') || k.has('KeyS');
    const rollLeft = k.has('KeyQ');
    const rollRight = k.has('KeyE');
    // Where the finger on each side is, so the arrow buttons can follow it.
    let leftPos = null;
    let rightPos = null;
    const mid = window.innerWidth / 2;
    for (const p of this.pointers.values()) {
      if (p.btn) continue;
      if (p.x < mid) {
        left = true;
        leftPos = p;
      } else {
        right = true;
        rightPos = p;
      }
    }
    const swipes = this.swipes;
    this.swipes = [];
    return { left, right, up, down, rollLeft, rollRight, leftPos, rightPos, swipes };
  }

  clear() {
    this.swipes = [];
  }
}
