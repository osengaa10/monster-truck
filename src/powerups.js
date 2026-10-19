// Power-ups: glowing orbs on the track. Driving or flying through one turns
// it on right away; nothing to press.
import * as THREE from '../vendor/three.module.min.js';

export const POWERS = {
  nitro: { icon: '🔥', name: 'NITRO!', color: 0xff6d00, duration: 8 },
  moon: { icon: '🌙', name: 'MOON GRAVITY!', color: 0x8c9eff, duration: 10 },
  giant: { icon: '💪', name: 'GIANT TRUCK!', color: 0x00e676, duration: 10 },
  magnet: { icon: '🧲', name: 'STAR MAGNET! 2× POINTS', color: 0xff1744, duration: 12 },
};
export const POWER_KINDS = Object.keys(POWERS);

function iconTexture(icon) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  ctx.font = '96px system-ui, "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(icon, 64, 70);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const shared = {};
function resources(kind) {
  if (shared[kind]) return shared[kind];
  const p = POWERS[kind];
  shared[kind] = {
    shell: new THREE.MeshStandardMaterial({
      color: p.color, emissive: p.color, emissiveIntensity: 0.6, transparent: true, opacity: 0.35,
      roughness: 0.1, metalness: 0.2, depthWrite: false,
    }),
    ring: new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: p.color, emissiveIntensity: 1.2, metalness: 0.6, roughness: 0.2 }),
    icon: new THREE.SpriteMaterial({ map: iconTexture(p.icon), depthWrite: false }),
  };
  return shared[kind];
}
const shellGeo = new THREE.SphereGeometry(1.6, 24, 16);
const ringGeo = new THREE.TorusGeometry(2.1, 0.12, 8, 40);

export function makePickup(kind) {
  const r = resources(kind);
  const g = new THREE.Group();
  const shell = new THREE.Mesh(shellGeo, r.shell);
  const ring = new THREE.Mesh(ringGeo, r.ring);
  const ring2 = new THREE.Mesh(ringGeo, r.ring);
  ring2.rotation.x = Math.PI / 2;
  const icon = new THREE.Sprite(r.icon);
  icon.scale.setScalar(2.2);
  icon.renderOrder = 2;
  g.add(shell, ring, ring2, icon);
  g.userData.rings = [ring, ring2];
  return g;
}
