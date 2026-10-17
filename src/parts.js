import * as THREE from '../vendor/three.module.min.js';
import { mergeGeometries } from '../vendor/BufferGeometryUtils.js';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3(1, 1, 1);
const _c = new THREE.Color();

// Collects lots of small colored shapes and merges them into one geometry
// with vertex colors, so a detailed model is still a single draw call.
export class Parts {
  constructor() {
    this.geos = [];
  }

  add(geo, color, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    geo.dispose();
    g.deleteAttribute('uv');
    _m.compose(_p.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz)), _s);
    g.applyMatrix4(_m);
    _c.set(color);
    const n = g.attributes.position.count;
    const colors = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) colors.set([_c.r, _c.g, _c.b], i * 3);
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    this.geos.push(g);
    return this;
  }

  box(w, h, d, color, x, y, z, rx, ry, rz) {
    return this.add(new THREE.BoxGeometry(w, h, d), color, x, y, z, rx, ry, rz);
  }

  // Cylinder lying along the X axis (like a wheel or axle).
  xcyl(r, len, seg, color, x, y, z) {
    return this.add(new THREE.CylinderGeometry(r, r, len, seg), color, x, y, z, 0, 0, Math.PI / 2);
  }

  // Upright cylinder.
  ycyl(r, len, seg, color, x, y, z, rx, ry, rz) {
    return this.add(new THREE.CylinderGeometry(r, r, len, seg), color, x, y, z, rx, ry, rz);
  }

  build() {
    const g = mergeGeometries(this.geos);
    for (const p of this.geos) p.dispose();
    this.geos = [];
    g.computeBoundingSphere();
    return g;
  }
}
