import * as THREE from '../vendor/three.module.min.js';
import { mergeGeometries } from '../vendor/BufferGeometryUtils.js';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3(1, 1, 1);
const _c = new THREE.Color();

// A color is either a plain number (painted) or a { color, slot } pair from
// mat(). The slot sets how the surface looks: each vertex carries its own
// roughness, metalness, glow and clearcoat, so a whole model can be drawn
// with one material in a single draw call.
const SLOT_LOOK = {
  //       roughness, metalness, glow, clearcoat
  paint: [0.35, 0.15, 0, 1],
  chrome: [0.16, 1, 0, 0],
  rubber: [0.92, 0, 0, 0],
  glass: [0.05, 0.6, 0, 0.6],
  light: [0.4, 0, 1.2, 0],
  metal: [0.55, 0.6, 0, 0],
  matte: [1, 0, 0, 0],
};
export const mat = (color, slot) => ({ color, slot });

// Teach a standard (or physical) material to read the per-vertex look.
function usePartsLook(material) {
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 look;\nvarying vec4 vLook;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvLook = look;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec4 vLook;')
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = vLook.x;')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = vLook.y;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * vLook.z;')
      .replace('#include <lights_physical_fragment>', '#include <lights_physical_fragment>\n#ifdef USE_CLEARCOAT\nmaterial.clearcoat *= vLook.w;\n#endif');
  };
  return material;
}

export function makeMaterial({ clearcoat = false } = {}) {
  return usePartsLook(clearcoat
    ? new THREE.MeshPhysicalMaterial({ vertexColors: true, clearcoat: 1, clearcoatRoughness: 0.08 })
    : new THREE.MeshStandardMaterial({ vertexColors: true }));
}

// Shared by everything that doesn't need its own (cars, props, scenery).
export const MATERIAL = makeMaterial();

// Collects lots of small colored shapes and merges them into one geometry,
// so a detailed model is still a single mesh and a single draw call.
// `detail` (a spacing, 0 for none) splits long boxes and cylinders into
// segments so models that get crushed can bend everywhere, not just at corners.
export class Parts {
  constructor({ detail = 0 } = {}) {
    this.geos = [];
    this.detail = detail;
  }

  segs(len) {
    return this.detail ? Math.max(1, Math.round(len / this.detail)) : 1;
  }

  add(geo, color, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    geo.dispose();
    g.deleteAttribute('uv');
    _m.compose(_p.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz)), _s);
    g.applyMatrix4(_m);
    const look = SLOT_LOOK[typeof color === 'object' ? color.slot : 'paint'];
    _c.set(typeof color === 'object' ? color.color : color);
    const n = g.attributes.position.count;
    const colors = new Float32Array(n * 3);
    const looks = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      colors.set([_c.r, _c.g, _c.b], i * 3);
      looks.set(look, i * 4);
    }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    g.setAttribute('look', new THREE.BufferAttribute(looks, 4));
    this.geos.push(g);
    return this;
  }

  get empty() {
    return this.geos.length === 0;
  }

  box(w, h, d, color, x, y, z, rx, ry, rz) {
    return this.add(new THREE.BoxGeometry(w, h, d, this.segs(w), this.segs(h), this.segs(d)), color, x, y, z, rx, ry, rz);
  }

  // Cylinder lying along the X axis (like a wheel or axle).
  xcyl(r, len, seg, color, x, y, z) {
    return this.add(new THREE.CylinderGeometry(r, r, len, seg, this.segs(len)), color, x, y, z, 0, 0, Math.PI / 2);
  }

  // Upright cylinder.
  ycyl(r, len, seg, color, x, y, z, rx, ry, rz) {
    return this.add(new THREE.CylinderGeometry(r, r, len, seg, this.segs(len)), color, x, y, z, rx, ry, rz);
  }

  // A rounded solid made from a side outline. pts are [along, up] pairs going
  // counter-clockwise, with the front at +along (which becomes -z). It is
  // `width` wide across x, centered on x.
  // `detail` (a spacing) adds extra vertices along the outline and across the
  // width, so the panels have something to bend when they get crushed.
  profile(pts, width, color, { x = 0, y = 0, z = 0, bevel = 0.08, detail = 0 } = {}) {
    let outline = pts;
    if (detail) {
      outline = [];
      pts.forEach((a, i) => {
        const b = pts[(i + 1) % pts.length];
        const n = Math.max(1, Math.round(Math.hypot(b[0] - a[0], b[1] - a[1]) / detail));
        for (let k = 0; k < n; k++) outline.push([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n]);
      });
    }
    const shape = new THREE.Shape(outline.map(([a, b]) => new THREE.Vector2(a, b)));
    const depth = Math.max(0.01, width - bevel * 2);
    const g = new THREE.ExtrudeGeometry(shape, {
      depth, steps: detail ? Math.max(1, Math.round(depth / (detail * 1.5))) : 1,
      bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 4,
    });
    g.translate(0, 0, -depth / 2);
    g.rotateY(Math.PI / 2);
    return this.add(g, color, x, y, z);
  }

  // Tube between two points (for frames and links).
  tube(r, a, b, seg, color) {
    const dir = new THREE.Vector3().subVectors(b, a);
    const len = dir.length();
    const g = new THREE.CylinderGeometry(r, r, len, seg);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize()));
    return this.add(g, color, (a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
  }

  build() {
    const g = mergeGeometries(this.geos);
    for (const p of this.geos) p.dispose();
    this.geos = [];
    g.computeBoundingSphere();
    return g;
  }
}
