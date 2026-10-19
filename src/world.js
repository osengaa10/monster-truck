import * as THREE from '../vendor/three.module.min.js';
import { WALL_X, LANES } from './consts.js';
import { BUILDERS, Sequencer } from './track.js';
import { makeCrushable, startCrush, animateCrush, CAR_KINDS } from './crushables.js';
import { makePickup, POWER_KINDS } from './powerups.js';
import { Scenery, BIOMES, BIOME_ORDER } from './scenery.js';
import { Parts, mat, MATERIAL } from './parts.js';
import {
  dirtTextures, concreteTexture, bannerTexture, fenceTexture, plankTexture, trussTexture, hazardTexture,
} from './textures.js';

// The track runs along -Z. "Distance" d = -z. Track spans x in [-WALL_X, WALL_X].
export { WALL_X };

const AHEAD = 450;
const BEHIND = 60;
const TILE = 16;       // the dirt texture repeats every TILE units
const WALL_SNAP = 48;  // the banners repeat every 48 units
const RAMP_TILE = 10;
const BIOME_SEGMENTS = 7; // the scenery changes every this many segments
const MAX_STARS = 256;
const FLAG_COLORS = [0xff4d4d, 0xffd93d, 0x4dabff, 0x6bff8a, 0xff7ae0, 0xffa94d];

const _to = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

const params = new URLSearchParams(location.search);
const FORCED_SEGMENTS = (params.get('seg') || '').split(',').filter(Boolean);
const FORCED_POWER = POWER_KINDS.includes(params.get('power')) ? params.get('power') : null;
const FORCED_BIOME = BIOMES[params.get('biome')] ? params.get('biome') : null;

// Build a solid that follows a height profile across [x0, x1].
// samples: [{ d, y }] with increasing d. Vertex colors tint the top in bands.
// Group 0 is the top surface, group 1 the sides and ends.
function profileGeometry(samples, x0, x1, topColors, sideColor) {
  const top = { pos: [], col: [], uv: [] };
  const side = { pos: [], col: [], uv: [] };
  // Corners in counter-clockwise order as seen from outside. Each is [x, y, d, u, v].
  const quad = (buf, corners, c) => {
    for (const k of [0, 1, 2, 0, 2, 3]) {
      const p = corners[k];
      buf.pos.push(p[0], p[1], -p[2]);
      buf.col.push(c.r, c.g, c.b);
      buf.uv.push(p[3] / RAMP_TILE, p[4] / RAMP_TILE);
    }
  };
  let s = 0; // distance along the surface, so steep faces don't stretch the texture
  for (let i = 0; i < samples.length - 1; i++) {
    const a = samples[i];
    const b = samples[i + 1];
    const s1 = s + Math.hypot(b.d - a.d, b.y - a.y);
    quad(top, [[x0, a.y, a.d, x0, s], [x1, a.y, a.d, x1, s], [x1, b.y, b.d, x1, s1], [x0, b.y, b.d, x0, s1]], topColors[i % topColors.length]);
    quad(side, [[x0, 0, a.d, a.d, 0], [x0, a.y, a.d, a.d, a.y], [x0, b.y, b.d, b.d, b.y], [x0, 0, b.d, b.d, 0]], sideColor);
    quad(side, [[x1, 0, a.d, a.d, 0], [x1, 0, b.d, b.d, 0], [x1, b.y, b.d, b.d, b.y], [x1, a.y, a.d, a.d, a.y]], sideColor);
    s = s1;
  }
  const first = samples[0];
  const last = samples[samples.length - 1];
  if (first.y > 0.01) quad(side, [[x0, 0, first.d, x0, 0], [x1, 0, first.d, x1, 0], [x1, first.y, first.d, x1, first.y], [x0, first.y, first.d, x0, first.y]], sideColor);
  if (last.y > 0.01) quad(side, [[x1, 0, last.d, x1, 0], [x0, 0, last.d, x0, 0], [x0, last.y, last.d, x0, last.y], [x1, last.y, last.d, x1, last.y]], sideColor);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(top.pos.concat(side.pos), 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(top.col.concat(side.col), 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(top.uv.concat(side.uv), 2));
  g.addGroup(0, top.pos.length / 3, 0);
  g.addGroup(top.pos.length / 3, side.pos.length / 3, 1);
  g.computeVertexNormals();
  return g;
}

// All the stars share one instanced mesh (one draw call for all of them).
class StarField {
  constructor(scene, geometry, material) {
    this.mesh = new THREE.InstancedMesh(geometry, material, MAX_STARS);
    this.mesh.frustumCulled = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.free = [];
    for (let i = MAX_STARS - 1; i >= 0; i--) {
      this.free.push(i);
      this.hide(i);
    }
    scene.add(this.mesh);
  }

  alloc() {
    return this.free.length ? this.free.pop() : -1;
  }

  release(i) {
    if (i < 0) return;
    this.hide(i);
    this.free.push(i);
  }

  hide(i) {
    this.mesh.setMatrixAt(i, _m.makeScale(0, 0, 0));
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  place(i, pos, rotY, scale) {
    if (i < 0) return;
    _q.setFromAxisAngle(UP, rotY);
    _s.setScalar(scale);
    this.mesh.setMatrixAt(i, _m.compose(pos, _q, _s));
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

function starShape() {
  const s = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? 1.3 : 0.55;
    const a = (i / 10) * Math.PI * 2 + Math.PI / 2;
    if (i === 0) s.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else s.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  s.closePath();
  return s;
}

export class World {
  constructor(scene) {
    this.scene = scene;
    this.segments = [];
    this.features = [];
    this.biome = BIOME_ORDER[0];
    this.currentBiome = null;
    this.scenery = new Scenery(scene);

    // Surfaces: packed dirt, or a steel mega ramp (plank deck + see-through truss sides).
    const packed = dirtTextures({ dark: 0x6e4a2a, light: 0x9c7046, ruts: 2, pebbles: 300, smooth: 0.5, seed: 5 }, [1, 1]);
    const dirtMat = new THREE.MeshStandardMaterial({ vertexColors: true, map: packed.map, normalMap: packed.normalMap, roughness: 0.95 });
    const deckMat = new THREE.MeshStandardMaterial({ vertexColors: true, map: plankTexture([1, 1]), roughness: 0.75, side: THREE.DoubleSide });
    const trussMat = new THREE.MeshStandardMaterial({
      vertexColors: true, map: trussTexture([1, 1]), alphaTest: 0.5, side: THREE.DoubleSide, metalness: 0.7, roughness: 0.4,
    });
    this.surfaceStyles = {
      dirt: { mat: dirtMat, top: [0xffffff], side: 0xa08a78, shadow: true },
      roller: { mat: dirtMat, top: [0xf2ebe2], side: 0xa08a78, shadow: false },
      steel: { mat: [deckMat, trussMat], top: [0xffffff], side: 0xffffff, shadow: true },
    };
    for (const st of Object.values(this.surfaceStyles)) {
      st.top = st.top.map((c) => new THREE.Color(c));
      st.side = new THREE.Color(st.side);
    }
    this.hazardMat = new THREE.MeshStandardMaterial({ map: hazardTexture([1, 1]), roughness: 0.5 });

    this.starGeo = new THREE.ExtrudeGeometry(starShape(), { depth: 0.4, bevelEnabled: true, bevelSize: 0.12, bevelThickness: 0.12, bevelSegments: 2 });
    this.starGeo.center();
    this.starMat = new THREE.MeshStandardMaterial({ color: 0xffc400, emissive: 0x6a4200, metalness: 0.85, roughness: 0.25 });
    this.stars = new StarField(scene, this.starGeo, this.starMat);

    this.buildGround();
    this.reset();
  }

  buildGround() {
    const LEN = 600;
    const dirt = dirtTextures({ dark: 0x6b4526, light: 0xa77a4c, ruts: 3, pebbles: 350, seed: 1 }, [WALL_X * 2 / TILE, LEN / TILE]);
    this.floor = new THREE.Mesh(
      new THREE.PlaneGeometry(WALL_X * 2, LEN).rotateX(-Math.PI / 2),
      new THREE.MeshStandardMaterial({ map: dirt.map, normalMap: dirt.normalMap, roughness: 1 }),
    );
    this.floor.receiveShadow = true;
    this.floorTint = new THREE.Color(0xffffff);

    // Arena walls: concrete, a strip of banners facing the track, and a
    // chain-link catch fence on top.
    this.walls = new THREE.Group();
    const concrete = new THREE.MeshStandardMaterial({ map: concreteTexture([1, LEN / 4]), roughness: 0.9 });
    const wallGeo = new THREE.BoxGeometry(1, 1.6, LEN);
    const banner = new THREE.MeshStandardMaterial({ map: bannerTexture(LEN / WALL_SNAP), roughness: 0.6 });
    const bannerGeo = new THREE.PlaneGeometry(LEN, 1.15);
    const fenceMat = new THREE.MeshStandardMaterial({
      map: fenceTexture([LEN / 1.5, 2.6 / 1.5]), alphaTest: 0.5, side: THREE.DoubleSide, metalness: 0.7, roughness: 0.4,
    });
    const fenceGeo = new THREE.PlaneGeometry(LEN, 2.6);
    const railMat = new THREE.MeshStandardMaterial({ color: 0x9aa1a8, metalness: 0.8, roughness: 0.35 });
    const railGeo = new THREE.CylinderGeometry(0.06, 0.06, LEN, 6).rotateX(Math.PI / 2);
    const postGeo = new THREE.CylinderGeometry(0.07, 0.07, 2.8, 6);
    const POST_GAP = 4;
    const posts = new THREE.InstancedMesh(postGeo, railMat, (LEN / POST_GAP) * 2);
    const m = new THREE.Matrix4();
    let n = 0;
    for (const side of [-1, 1]) {
      const x = side * (WALL_X + 0.5);
      const w = new THREE.Mesh(wallGeo, concrete);
      w.position.set(x, 0.8, 0);
      w.castShadow = w.receiveShadow = true;
      const b = new THREE.Mesh(bannerGeo, banner);
      b.position.set(side * (WALL_X - 0.01), 0.85, 0);
      b.rotation.y = -side * Math.PI / 2;
      const f = new THREE.Mesh(fenceGeo, fenceMat);
      f.position.set(x, 1.6 + 1.3, 0);
      f.rotation.y = Math.PI / 2;
      const rail = new THREE.Mesh(railGeo, railMat);
      rail.position.set(x, 1.6 + 2.6, 0);
      this.walls.add(w, b, f, rail);
      for (let z = -LEN / 2; z < LEN / 2; z += POST_GAP) posts.setMatrixAt(n++, m.makeTranslation(x, 1.6 + 1.4, z));
    }
    this.walls.add(posts);
    this.scene.add(this.floor, this.walls);
  }

  reset() {
    for (const seg of this.segments) this.disposeSegment(seg);
    this.segments = [];
    this.features = [];
    this.nextD = -BEHIND;
    this.segCount = 0;
    this.sequencer = new Sequencer(FORCED_SEGMENTS);
  }

  // ---------- Physics queries ----------

  // Ground height at distance d and sideways position x.
  heightAt(d, x = 0) {
    let h = 0;
    for (const f of this.features) {
      if (d >= f.d0 && d <= f.d1 && x >= f.x0 && x <= f.x1) h = Math.max(h, f.heightAt(d));
    }
    return h;
  }

  // What the ground is made of here ('dirt', 'roller', 'steel'), or null for the floor.
  styleAt(d, x = 0) {
    let h = 0.05;
    let style = null;
    for (const f of this.features) {
      if (d >= f.d0 && d <= f.d1 && x >= f.x0 && x <= f.x1) {
        const fh = f.heightAt(d);
        if (fh >= h) {
          h = fh;
          style = f.style;
        }
      }
    }
    return style;
  }

  lipCrossed(prevD, d, x = 0) {
    for (const f of this.features) {
      if (f.type === 'ramp' && prevD < f.d1 && d >= f.d1 && x >= f.x0 && x <= f.x1) return f;
    }
    return null;
  }

  // ---------- Building blocks used by track.js ----------

  addFeature(f) {
    this.features.push({ x0: -WALL_X, x1: WALL_X, ...f });
  }

  addSurface(seg, samples, { x0 = -WALL_X, x1 = WALL_X, style = 'dirt' } = {}) {
    const st = this.surfaceStyles[style];
    const geo = profileGeometry(samples, x0, x1, st.top, st.side);
    const mesh = new THREE.Mesh(geo, st.mat);
    mesh.castShadow = st.shadow;
    mesh.receiveShadow = true;
    this.scene.add(mesh);
    seg.objects.push(mesh);
    seg.geometries.push(geo);
    return mesh;
  }

  // Yellow and black stripes along the lip of a steel ramp.
  addLipStripe(seg, x0, x1, y, d) {
    const geo = new THREE.BoxGeometry(x1 - x0, 0.14, 0.9);
    const uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * (x1 - x0) / 1.5);
    const m = new THREE.Mesh(geo, this.hazardMat);
    m.position.set((x0 + x1) / 2, y + 0.02, -(d - 0.45));
    this.scene.add(m);
    seg.objects.push(m);
    seg.geometries.push(geo);
  }

  // Which crushable to put down next, depending on the scenery.
  crushKind() {
    const extra = this.biome === 'country' ? ['hay', 'hay'] : this.biome === 'desert' ? ['junker', 'crates'] : ['potty'];
    return pick([...CAR_KINDS, ...CAR_KINDS, 'junker', 'crates', ...extra]);
  }

  addCrushRow(seg, d, fill, kinds = null) {
    for (const x of [-10.5, -5.2, 0, 5.2, 10.5]) {
      if (Math.random() > fill) continue;
      this.addCrushable(seg, kinds ? pick(kinds) : this.crushKind(), x + rand(-0.4, 0.4), d + rand(-0.6, 0.6));
    }
  }

  addCrushable(seg, kind, x, d, opts) {
    const c = makeCrushable(kind, x, d, opts);
    this.scene.add(c.mesh);
    seg.objects.push(c.mesh);
    seg.crushables.push(c);
    return c;
  }

  addStar(seg, x, y, d) {
    seg.stars.push({ i: this.stars.alloc(), pos: new THREE.Vector3(x, y, -d), rot: Math.random() * Math.PI, baseY: y, taken: false, t: 0, gone: false });
  }

  addPowerUp(seg, kind, x, y, d) {
    kind = FORCED_POWER || kind;
    const m = makePickup(kind);
    m.position.set(x, y, -d);
    this.scene.add(m);
    seg.objects.push(m);
    seg.pickups.push({ mesh: m, kind, baseY: y, taken: false, t: 0, phase: Math.random() * 6 });
  }

  // A flag on a pole; `inward` (+1 or -1) is which way the flag points.
  // Flags go into the segment's merged props mesh.
  addFlag(seg, x, y, d, inward = -Math.sign(x)) {
    seg.props.ycyl(0.08, 4, 8, mat(0xdddddd, 'chrome'), x, y + 2, -d);
    seg.props.box(1.8, 1.1, 0.04, mat(pick(FLAG_COLORS), 'matte'), x + inward * 0.9, y + 3.4, -d, 0, 0, 0);
  }

  // ---------- Generation ----------

  addSegment() {
    const n = this.segCount++;
    const seg = { start: this.nextD, objects: [], crushables: [], stars: [], pickups: [], balloons: [], geometries: [], props: new Parts() };
    let d = seg.start;
    this.biome = seg.biome = FORCED_BIOME || BIOME_ORDER[Math.floor(n / BIOME_SEGMENTS) % BIOME_ORDER.length];

    if (n === 0) {
      d += BEHIND + 25; // flat start runway
    } else {
      const kind = this.sequencer.next();
      d += 12;
      // Now and then a power-up waits at the start of a section.
      if (kind !== 'sky' && (FORCED_POWER ? n % 2 === 1 : n >= 2 && Math.random() < 0.35)) {
        this.addPowerUp(seg, pick(POWER_KINDS), pick(LANES), 2.6, d);
        d += 8;
      }
      seg.kind = kind;
      d = BUILDERS[kind](this, seg, d + 4);
    }

    this.scenery.build(seg, seg.start, d, seg.biome);
    if (!seg.props.empty) {
      const g = seg.props.build();
      const m = new THREE.Mesh(g, MATERIAL);
      m.castShadow = true;
      this.scene.add(m);
      seg.objects.push(m);
      seg.geometries.push(g);
    }
    seg.end = d;
    this.nextD = d;
    this.segments.push(seg);
  }

  disposeSegment(seg) {
    for (const st of seg.stars) this.stars.release(st.i);
    for (const o of seg.objects) this.scene.remove(o);
    for (const g of seg.geometries) g.dispose();
  }

  // ---------- Per-frame ----------

  update(dt, truck) {
    const truckD = truck.distance;
    while (this.nextD < truckD + AHEAD) this.addSegment();
    while (this.segments.length && this.segments[0].end < truckD - BEHIND) {
      this.disposeSegment(this.segments.shift());
    }
    const minD = truckD - BEHIND - 50;
    this.features = this.features.filter((f) => f.d1 > minD);

    // Keep the endless ground under the truck (snapped so textures don't slide).
    const z = Math.round(truck.pos.z / TILE) * TILE - 200;
    this.floor.position.z = z;
    this.walls.position.z = Math.round(truck.pos.z / WALL_SNAP) * WALL_SNAP - 200;

    const events = [];
    // Entering a new biome: tell the sky, and tint the arena dirt to match.
    const here = this.segments.find((sg) => truckD >= sg.start && truckD < sg.end);
    if (here && here.biome !== this.currentBiome) {
      this.currentBiome = here.biome;
      this.floorTint.set(BIOMES[here.biome].floor);
      events.push({ type: 'biome', biome: here.biome });
    }
    this.floor.material.color.lerp(this.floorTint, 1 - Math.exp(-dt * 1.5));
    this.scenery.update(this.segments);
    const now = performance.now() / 1000;
    const scale = truck.scale;
    const center = truck.mesh.position;
    const cy = truck.pos.y + 2 * scale;
    const grab = (4 * scale) ** 2;
    const magnet = truck.powers.magnet > 0;
    for (const seg of this.segments) {
      for (const s of seg.stars) {
        if (s.gone) continue;
        const p = s.pos;
        if (s.taken) {
          // Pop: grow a little, then shrink away while floating up.
          s.t += dt;
          p.y += dt * 10;
          if (s.t > 0.4) {
            s.gone = true;
            this.stars.hide(s.i);
          } else {
            this.stars.place(s.i, p, s.rot, Math.max(0, 1 + s.t * 4 - s.t * s.t * 30));
          }
          continue;
        }
        s.rot += dt * 3;
        _to.set(center.x - p.x, cy - p.y, truck.pos.z - p.z);
        const dist2 = _to.lengthSq();
        if (magnet && dist2 < 30 * 30) {
          // Stars fly to the truck.
          s.pulled = true;
          p.addScaledVector(_to, Math.min(1, dt * 6));
        } else if (!s.pulled) {
          p.y = s.baseY + Math.sin(now * 3 + s.baseY) * 0.3;
        }
        if (dist2 < grab) {
          s.taken = true;
          events.push({ type: 'star', pos: p.clone() });
        }
        this.stars.place(s.i, p, s.rot, 1);
      }
      for (const u of seg.pickups) {
        if (u.taken) {
          if (!u.mesh.visible) continue;
          u.t += dt;
          u.mesh.scale.setScalar(Math.max(0, 1 + u.t * 3 - u.t * u.t * 20));
          if (u.t > 0.4) u.mesh.visible = false;
          continue;
        }
        u.mesh.position.y = u.baseY + Math.sin(now * 2 + u.phase) * 0.35;
        const [r1, r2] = u.mesh.userData.rings;
        r1.rotation.y += dt * 2;
        r2.rotation.z += dt * 2.6;
        const p = u.mesh.position;
        _to.set(center.x - p.x, cy - p.y, truck.pos.z - p.z);
        if (_to.lengthSq() < (4.8 * scale) ** 2) {
          u.taken = true;
          events.push({ type: 'power', kind: u.kind, pos: p.clone() });
        }
      }
      for (const c of seg.crushables) {
        if (c.crushed) {
          animateCrush(c, dt);
          continue;
        }
        if (
          Math.abs(c.x - truck.pos.x) < c.halfW + 2.0 * scale
          && Math.abs(c.d - truckD) < c.halfL + 2.4 * scale
          && truck.pos.y < c.top + 0.4
        ) {
          startCrush(c);
          events.push({ type: 'crush', pos: c.mesh.position.clone(), points: c.points, kind: c.kind, debris: c.debris, glass: c.glass });
        }
      }
    }
    return events;
  }
}
