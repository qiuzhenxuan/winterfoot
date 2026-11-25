// =====================================================================
//  南：松林小径 + 镜湖 (SouthLakeZone)
//  Layout lives in zones.js (SOUTH_TRAIL, LAKE, LAKE_SHORE).
//
//  Zone module interface (shared with zoneNorth.js), used by world.js / main.js:
//    constructor(world, textures)  build meshes into world.group; use world._addBoxCollider /
//                                  world._addCircleCollider for solid props
//    getSurface(x, z)              -> { y, surface: "snow"|"wood"|"stone", slopeX? } or null (null = flat snow)
//    update(dt, elapsed, nightFactor, playerPos, lampGlow)
//    getInteractions(playerPos)    -> [{ id, x, z, name, label, reach?, tapR?, anchorY?, allowClick? }]
//    interact(id, ctx)             ctx: { toast, popup, emote, bless, sound, inventory, refreshUI, burst,
//                                         timeHours, nightFactor, day, player }
//
//  What lives here:
//    - a stepping-stone flagstone trail through snowy spruces, with lantern posts, winterberry
//      bushes, boulders, a fallen log (with a little robin) and wooden signposts at both ends
//    - the frozen mirror lake: ice with cracks / snow dust / clear black-ice patches, a snowy bank
//      lip, reeds & cattails, a pressure ridge, edge rocks, glints
//    - a wooden pier on the north shore with a bench and a hanging lantern (the zone's one PointLight)
//    - an ice-fishing hole with stool, bucket, rod & bobber ("冰钓"), plus a tiny fishing hut
//    - shore extras: a snowman in a knit beanie, a red sled, animal tracks in the snow
// =====================================================================

import * as THREE from "three";
import { FISH, fishAvailable } from "./journal.js";
import { makeSnowDriftGeometry } from "./landscape.js";
import { SOUTH_TRAIL, LAKE, LAKE_SHORE } from "./zones.js";

function createMulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------
//  Layout of the features (all derived from zones.js where possible)
// ---------------------------------------------------------------------
// Ice-normalised radius: < 1 on the ice, 1 at the ice edge
function iceK(x, z) {
  return Math.hypot((x - LAKE.cx) / LAKE.rx, (z - LAKE.cz) / LAKE.rz);
}
function shoreK(x, z) {
  return Math.hypot((x - LAKE_SHORE.cx) / LAKE_SHORE.rx, (z - LAKE_SHORE.cz) / LAKE_SHORE.rz);
}
// Point on the ice ellipse scaled by k at polar angle a (radians, 0 = east, +90° = south)
function icePoint(a, k) {
  return { x: LAKE.cx + Math.cos(a) * LAKE.rx * k, z: LAKE.cz + Math.sin(a) * LAKE.rz * k };
}
function shorePoint(a, k) {
  return { x: LAKE_SHORE.cx + Math.cos(a) * LAKE_SHORE.rx * k, z: LAKE_SHORE.cz + Math.sin(a) * LAKE_SHORE.rz * k };
}
const DEG = Math.PI / 180;

// Pier on the north shore, west of where the trail reaches the lake
const DOCK = { x: -12.4, z0: 33.5, z1: 39.8, hw: 0.8, top: 0.365, stepZ0: 33.12, stepTop: 0.19 };
const BENCH = { x: DOCK.x, z: 39.18 };
// Ice-fishing hole, east part of the lake (out of the way of the dock & trail end)
const HOLE = { x: -5.4, z: 41.0 };
// Little fishing hut on the ice, door facing the hole
const HUT = { x: -2.4, z: 43.6, w: 1.7, d: 1.5, h: 1.42 };
// Signposts
const SIGN_HEAD = { x: -3.25, z: 13.0 };
const SIGN_LAKE = { x: -10.0, z: 32.75 };
// Snowman on the south-west shore, sled on the north-east shore
const SNOWMAN = { x: -19.2, z: 45.3 };
const SLED = { x: -4.3, z: 34.65 };

// Snowy bank lip around the ice (ice-normalised radius -> height)
const RIM_K = [0.985, 1.0, 1.03, 1.065, 1.1, 1.16];
const RIM_Y = [0.032, 0.05, 0.1, 0.088, 0.045, 0.0];
function rimHeight(k) {
  for (let i = 0; i < RIM_K.length - 1; i++) {
    if (k <= RIM_K[i + 1]) {
      const t = (k - RIM_K[i]) / (RIM_K[i + 1] - RIM_K[i]);
      return RIM_Y[i] + (RIM_Y[i + 1] - RIM_Y[i]) * Math.max(0, t);
    }
  }
  return 0;
}

const ICE_Y = 0.03;

// ---------------------------------------------------------------------
//  Fishing catches (catch & release — the inventory has no fish slot)
// ---------------------------------------------------------------------
// Fish species live in journal.js (FISH) so the book and the lake share them.
// What else can end up on the hook:
const JUNK_CATCHES = [
  { name: "一只旧手套", color: "#e3cbff", glove: true, text: "……是谁的手套掉进湖里了？拧干挂在码头的木桩上，失主说不定会回来找。" },
  { name: "一片冻住的枫叶", color: "#ffb47e", text: "秋天落进湖里的枫叶，被冰保存得刚刚好，红得像一枚小小的书签。" },
  { name: "空钩", color: "#cfe3f0", empty: true, text: "鱼饵被悄悄吃光了。镜湖的鱼今天格外机灵。" },
];
const BOTTLE_CATCH = { name: "冰里的漂流瓶", color: "#bff0ff", rare: true, text: "冰洞里漂上来一只小玻璃瓶，纸条上写着：愿你被这个世界温柔以待。" };

const BENCH_DAY = [
  { text: "冰面像一面镜子，倒映着整片松林和天空。就这样坐一会儿吧。" },
  { text: "拧开保温杯喝一口热可可，湖对岸的雪人好像在冲你招手。", sip: true },
  { text: "一阵风吹过，松枝上的雪簌簌落下，湖面上只剩下风的声音。" },
  { text: "远处冰钓小屋的烟囱冒着细细的烟，大概有人在里面煮茶。" },
];
const BENCH_MORNING = { text: "清晨的薄雾贴着冰面慢慢散开，松林里有小鸟在叫。" };
const BENCH_DUSK = { text: "夕阳把冰面染成了蜜糖色，长椅也被晒得暖暖的。" };
const BENCH_NIGHT = [
  { text: "夜里的镜湖把星星也冻了进去。抬头是一片星空，低头又是一片。" },
  { text: "码头的灯笼轻轻摇晃，像是在和天上的星星说悄悄话。" },
  { text: "风停了，整个湖安静得能听见雪落下的声音。数着星星，心里暖暖的。" },
];
const SNOWMAN_LINES = [
  "雪人戴着歪歪的毛线帽，正望着湖面发呆。",
  "你帮雪人把围巾理了理，它看起来更神气了。",
  "雪人手里的小树枝像一根钓竿——它大概也想去冰钓。",
];

// Shared scratch objects for instance matrices
const _m4 = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _c = new THREE.Color();
function composeM(x, y, z, rx, ry, rz, sx, sy, sz) {
  _e.set(rx, ry, rz, "YXZ");
  _q.setFromEuler(_e);
  _p.set(x, y, z);
  _s.set(sx, sy, sz);
  return _m4.compose(_p, _q, _s).clone();
}

function makeCanvas(w, h) {
  if (typeof document === "undefined") return null;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}
function pixelTexture(canvas) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}

// Ensure a generated ground-ish surface faces up (+Y); flips winding if needed
function faceUp(geo) {
  geo.computeVertexNormals();
  const n = geo.attributes.normal;
  let sum = 0;
  for (let i = 0; i < n.count; i += 7) sum += n.getY(i);
  if (sum < 0) {
    const idx = geo.index.array;
    for (let i = 0; i < idx.length; i += 3) {
      const t = idx[i + 1];
      idx[i + 1] = idx[i + 2];
      idx[i + 2] = t;
    }
    geo.index.needsUpdate = true;
    geo.computeVertexNormals();
  }
  return geo;
}

export class SouthLakeZone {
  constructor(world, textures) {
    this.world = world;
    this.textures = textures;
    this.group = world.group;
    this.mobile = !!world.isMobile;
    this.rnd = createMulberry(4242);

    // Animated bits
    this.glowPools = []; // { mat, base, gain } warm reflections on the ice at night
    this.smokePuffs = [];
    this.twinkles = [];
    this.sparkles = [];
    this.slideMarks = null;
    this.dockPlanks = null;

    this._buildMaterials();
    this._buildTrailCurve();
    this._buildTrail();
    this._buildTrees();
    this._buildTrailProps();
    this._buildLanternPosts();
    this._buildSignposts();
    this._buildLake();
    this._buildDock();
    this._buildFishingSpot();
    this._buildFishingHut();
    this._buildShoreExtras();
    this._buildFootprints();
    if (!this.mobile) this._buildIceDelights();

    // Fishing state machine: idle -> wait (line in the water) -> bite (bobber dips) -> cooldown
    this.fish = { state: "idle", timer: 0, cooldown: 0, ctx: null, last: -1, count: 0, day: -1, jumpT: -1, catch: null };
    this.benchIdx = 0;
    this.benchNightIdx = 0;
    this.snowmanIdx = 0;
    this._lastPX = 0;
    this._lastPZ = 0;
    this._markTimer = 0;
    this._sparkTimer = 0;
    this._markSide = 1;

    this._fishIt = { id: "south_fish", x: HOLE.x, z: HOLE.z, name: "冰钓小洞", label: "在冰洞旁冰钓一会儿", reach: 2.1, tapR: 1.0, anchorY: 1.25 };
    this._interactions = [
      this._fishIt,
      { id: "south_bench", x: BENCH.x, z: BENCH.z, name: "码头长椅", label: "坐在码头长椅上看湖", reach: 1.9, tapR: 1.0, anchorY: 1.85 },
      { id: "south_sign_head", x: SIGN_HEAD.x, z: SIGN_HEAD.z, name: "松林路牌", label: "看看木牌上写了什么", reach: 1.75, tapR: 0.8, anchorY: 2.25 },
      { id: "south_sign_lake", x: SIGN_LAKE.x, z: SIGN_LAKE.z, name: "镜湖路牌", label: "看看木牌上写了什么", reach: 1.75, tapR: 0.8, anchorY: 2.25 },
      { id: "south_snowman", x: SNOWMAN.x, z: SNOWMAN.z, name: "湖边雪人", label: "和湖边的雪人打个招呼", reach: 1.85, tapR: 0.9, anchorY: 2.05 },
    ];
    this._noInteractions = [];
  }

  // ===================================================================
  //  Materials (shared by every repeated prop)
  // ===================================================================
  _buildMaterials() {
    const tx = this.textures;
    const M = (o) => new THREE.MeshStandardMaterial(o);
    this.mat = {
      snow: M({ map: tx.snowCap, roughness: 0.9 }),
      // Instanced snow must NOT be picked up by world._collectSnowCaps (it scales mesh.scale.y,
      // which for an InstancedMesh would move every instance) -> a clone of the map opts out.
      instSnow: M({ map: tx.snowCap.clone(), roughness: 0.92 }),
      bark: M({ map: tx.bark, roughness: 0.95 }),
      leaf: M({ map: tx.pineLeaves, roughness: 0.9 }),
      leafDark: M({ map: tx.pineLeaves, color: 0xc2d8cc, roughness: 0.92 }),
      stone: M({ map: tx.stoneWall, roughness: 0.94 }),
      darkWood: M({ color: 0x462713, roughness: 0.9 }),
      wood: M({ map: tx.woodPlank, roughness: 0.88 }),
      plank: M({ map: tx.woodPlank, color: 0xffffff, roughness: 0.86 }),
      iron: M({ color: 0x2d313a, roughness: 0.55, metalness: 0.55 }),
      bush: M({ color: 0x265239, roughness: 0.92 }),
      berry: M({ color: 0xd93636, roughness: 0.5 }),
      endGrain: M({ color: 0xdfb482, roughness: 0.85 }),
      paver: M({ map: tx.flagstonePaver, color: 0xffffff, roughness: 0.86, metalness: 0.05 }),
      red: M({ color: 0xc93a32, roughness: 0.8 }),
      cream: M({ color: 0xf3e6cc, roughness: 0.85 }),
      rope: M({ color: 0xc9a46a, roughness: 0.95 }),
      iceShard: M({ color: 0xd6f1ff, roughness: 0.12, metalness: 0.12, flatShading: true }),
    };
    // Lantern glass shared by every lantern in the zone (world.update drives its night glow)
    this.mat.lantern = M({ color: 0xffe49e, emissive: new THREE.Color(0xffb444), emissiveIntensity: 1.4, roughness: 0.3 });
    this.world.lanternMaterials.push(this.mat.lantern);

    const driftTex = tx.snowGround.clone();
    driftTex.repeat.set(0.7, 0.7);
    driftTex.needsUpdate = true;
    this.mat.drift = M({ map: driftTex, color: 0xfbfdff, roughness: 0.88 });

    this.geo = {
      snowCushion: new THREE.SphereGeometry(1, 14, 6, 0, Math.PI * 2, 0, Math.PI / 2),
      driftA: makeSnowDriftGeometry(41.3, 24, 8),
      driftB: makeSnowDriftGeometry(17.9, 24, 8),
      box: new THREE.BoxGeometry(1, 1, 1),
    };
  }

  _add(mesh, cast = false, receive = true) {
    mesh.castShadow = cast;
    mesh.receiveShadow = receive;
    this.group.add(mesh);
    return mesh;
  }

  // list: [{ m: Matrix4, c?: hex }]
  _instanced(geo, mat, list, cast = false, receive = true) {
    if (!list.length) return null;
    const im = new THREE.InstancedMesh(geo, mat, list.length);
    for (let i = 0; i < list.length; i++) {
      im.setMatrixAt(i, list[i].m);
      if (list[i].c !== undefined) im.setColorAt(i, _c.setHex(list[i].c));
    }
    im.instanceMatrix.needsUpdate = true;
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
    im.computeBoundingSphere();
    return this._add(im, cast, receive);
  }

  _circle(x, z, r) {
    this.world._addCircleCollider(x, z, r);
  }
  _boxC(cx, cz, w, d) {
    this.world._addBoxCollider(cx, cz, w, d);
  }

  // ===================================================================
  //  Trail centreline: smooth curve through SOUTH_TRAIL.pts
  // ===================================================================
  _buildTrailCurve() {
    const pts = SOUTH_TRAIL.pts.map(([x, z]) => new THREE.Vector3(x, 0, z));
    this.curve = new THREE.CatmullRomCurve3(pts, false, "centripetal");
    this.trailLen = this.curve.getLength();
    this._tp = new THREE.Vector3();
    this._tt = new THREE.Vector3();
  }

  // Point along the trail at arc length s, offset `lat` metres sideways (+ = east of a southbound walker)
  _trailAt(s, lat = 0) {
    const u = THREE.MathUtils.clamp(s / this.trailLen, 0, 1);
    this.curve.getPointAt(u, this._tp);
    this.curve.getTangentAt(u, this._tt);
    const tx = this._tt.x;
    const tz = this._tt.z;
    const l = Math.hypot(tx, tz) || 1;
    const dx = tx / l;
    const dz = tz / l;
    const nx = dz;
    const nz = -dx;
    return { x: this._tp.x + nx * lat, z: this._tp.z + nz * lat, dx, dz, nx, nz, yaw: Math.atan2(dx, dz) };
  }

  // ===================================================================
  //  1. Flagstone stepping-stone trail + roadside snow drifts
  // ===================================================================
  _buildTrail() {
    const rnd = createMulberry(5252);
    const makeBeveledPaverGeo = (w, d) => {
      const r = 0.045;
      const hw = w / 2;
      const hd = d / 2;
      const shape = new THREE.Shape();
      shape.moveTo(-hw + r, -hd);
      shape.lineTo(hw - r, -hd);
      shape.quadraticCurveTo(hw, -hd, hw, -hd + r);
      shape.lineTo(hw, hd - r);
      shape.quadraticCurveTo(hw, hd, hw - r, hd);
      shape.lineTo(-hw + r, hd);
      shape.quadraticCurveTo(-hw, hd, -hw, hd - r);
      shape.lineTo(-hw, -hd + r);
      shape.quadraticCurveTo(-hw, -hd, -hw + r, -hd);
      const geo = new THREE.ExtrudeGeometry(shape, {
        depth: 0.022,
        bevelEnabled: true,
        bevelThickness: 0.012,
        bevelSize: 0.014,
        bevelSegments: 2,
      });
      geo.rotateX(-Math.PI / 2);
      return geo;
    };
    const geoSq = makeBeveledPaverGeo(0.52, 0.52);
    const geoRect = makeBeveledPaverGeo(0.62, 0.4);
    const palette = [0xb7aa9a, 0xaa9e8f, 0xa0a5aa, 0xc1b5a5, 0x979da3];
    const sq = [];
    const rect = [];
    const pick = () => palette[Math.floor(rnd() * palette.length)];

    // Pavers alternate: a staggered pair of square stones, then one wide slab across the path.
    // The first rows are single zig-zag stones continuing the yard's stepping stones at (-5.0, 12.35).
    const s0 = 1.35;
    const sEnd = this.trailLen - 0.35;
    let row = 0;
    for (let s = s0; s <= sEnd; s += 0.6, row++) {
      const fadeOut = THREE.MathUtils.clamp((s - (sEnd - 3.0)) / 3.0, 0, 1); // sparser near the lake: path sinks into snow
      const jit = (rnd() - 0.5) * 0.06;
      if (row < 3) {
        const p = this._trailAt(s, (row % 2 === 0 ? 0.16 : -0.14) + jit);
        sq.push({ m: composeM(p.x, 0.012, p.z, 0, p.yaw + (rnd() - 0.5) * 0.3, 0, 1, 1, 1), c: pick() });
        continue;
      }
      if (row % 2 === 1) {
        for (const lat of [-0.29, 0.3]) {
          if (rnd() < 0.06 + fadeOut * 0.45) continue;
          const p = this._trailAt(s + (rnd() - 0.5) * 0.08, lat + jit);
          const sc = 0.88 + rnd() * 0.16;
          sq.push({ m: composeM(p.x, 0.012, p.z, 0, p.yaw + (rnd() - 0.5) * 0.22, 0, sc, 1, sc), c: pick() });
        }
      } else {
        if (rnd() < 0.04 + fadeOut * 0.5) continue;
        const p = this._trailAt(s, (rnd() - 0.5) * 0.22);
        const sc = 0.92 + rnd() * 0.14;
        rect.push({ m: composeM(p.x, 0.012, p.z, 0, p.yaw + (rnd() - 0.5) * 0.14, 0, sc, 1, 1), c: pick() });
      }
    }

    // A short spur of single stepping stones from the trail end west to the pier's step
    const end = this._trailAt(this.trailLen);
    const spurA = { x: end.x - 0.4, z: end.z - 0.15 };
    const spurB = { x: DOCK.x + 0.75, z: DOCK.stepZ0 + 0.1 };
    const spurN = 6;
    for (let i = 0; i < spurN; i++) {
      const t = (i + 0.5) / spurN;
      const bow = Math.sin(t * Math.PI) * -0.45; // gentle arc toward the north
      const x = spurA.x + (spurB.x - spurA.x) * t + (i % 2 ? 0.1 : -0.1) * 0.6;
      const z = spurA.z + (spurB.z - spurA.z) * t + bow + (i % 2 ? 0.12 : -0.1);
      const sc = 0.82 + rnd() * 0.14;
      sq.push({ m: composeM(x, 0.012, z, 0, rnd() * 0.8, 0, sc, 1, sc), c: pick() });
    }
    this._instanced(geoSq, this.mat.paver, sq, false, true);
    this._instanced(geoRect, this.mat.paver, rect, false, true);

    // Soft wind-blown drifts hugging the path edges (they thicken in heavy snow via world.pathSnowCaps)
    const drifts = [];
    let side = 1;
    for (let s = s0 + 0.6; s < this.trailLen - 0.4; s += 2.1 + rnd() * 0.5) {
      side = rnd() < 0.7 ? -side : side;
      const p = this._trailAt(s, side * (0.86 + rnd() * 0.14));
      drifts.push({ m: composeM(p.x, 0.028, p.z, 0, p.yaw + (rnd() - 0.5) * 0.25, 0, 0.52 + rnd() * 0.22, 0.11, 1.25 + rnd() * 0.65) });
    }
    const dm = this._instanced(new THREE.SphereGeometry(0.45, 10, 7), this.mat.instSnow, drifts, false, true);
    if (dm) this.world.pathSnowCaps.push({ mesh: dm, baseY: 0, baseScaleY: 1 });

    // Larger soft snow banks between the trees, easing the trail into the hills
    const banks = [
      [3.4, -3.0, 2.2], [6.8, 3.4, 2.6], [11.2, -3.4, 2.8], [13.0, 3.6, 2.0],
      [17.0, 3.2, 2.4], [18.4, -3.5, 2.2], [9.0, 4.4, 1.8], [21.8, -3.2, 2.0],
    ];
    banks.forEach(([s, lat, sz], i) => {
      const p = this._trailAt(s, lat);
      const m = new THREE.Mesh(i % 2 ? this.geo.driftA : this.geo.driftB, this.mat.drift);
      m.scale.set(sz * 0.55, 0.32 + (i % 3) * 0.08, sz * 0.42);
      m.position.set(p.x, -0.03, p.z);
      m.rotation.y = p.yaw + i * 0.7;
      this._add(m, false, true);
    });
  }

  // ===================================================================
  //  2. Snowy spruces (tiered-cone style of world._buildForest), all instanced
  // ===================================================================
  _buildTrees() {
    const rnd = createMulberry(9113);
    const specs = [];
    // Along the trail: [arc length s, lateral offset (+east), scale]
    const trail = [
      [2.8, 3.4, 1.12], [7.6, 3.1, 1.2], [10.3, 4.4, 1.3], [13.7, 2.95, 1.06], [16.4, 4.1, 1.24], [20.5, 3.65, 1.0],
      [4.6, -3.6, 1.25], [8.4, -2.95, 1.04], [10.4, -4.7, 1.3], [14.9, -3.25, 1.16], [17.9, -2.85, 1.0], [19.7, -4.5, 1.28],
      // saplings tucked closer to the path
      [6.1, -2.35, 0.6], [11.7, 2.4, 0.55], [9.1, 2.35, 0.62], [17.3, 2.45, 0.58],
    ];
    for (const [s, lat, sc] of trail) {
      const p = this._trailAt(s, lat);
      specs.push([p.x, p.z, sc]);
    }
    // Around the lake, just outside the walkable shore (the south side stays open toward the camera)
    const lake = [
      [-150, 1.12, 1.22], [-168, 1.17, 1.34], [174, 1.13, 1.18], [158, 1.2, 1.3],
      [-128, 1.13, 1.26], [-108, 1.16, 1.12], [-60, 1.14, 1.16], [-42, 1.1, 1.02],
      [-138, 1.3, 1.4],
    ];
    for (const [a, k, sc] of lake) {
      const p = shorePoint(a * DEG, k);
      specs.push([p.x, p.z, sc]);
    }
    this.treeSpecs = specs;

    const tiers = [
      { r: 1.32, h: 1.05, y: 1.42 },
      { r: 1.06, h: 0.98, y: 2.22 },
      { r: 0.8, h: 0.88, y: 2.94 },
      { r: 0.54, h: 0.78, y: 3.58 },
      { r: 0.28, h: 0.62, y: 4.12 },
    ];
    const trunks = [];
    const roots = [];
    const fol = tiers.map(() => []);
    const caps = tiers.map(() => []);
    for (const [x, z, scale] of specs) {
      const yaw = rnd() * Math.PI * 2;
      const s = scale * (0.94 + rnd() * 0.14);
      trunks.push({ m: composeM(x, 0.68 * s - 0.04, z, 0, yaw, 0, s, s, s) });
      for (let r = 0; r < 3; r++) {
        const ra = yaw + (r / 3) * Math.PI * 2;
        roots.push({ m: composeM(x + Math.cos(ra) * 0.22 * s, 0.09 * s, z - Math.sin(ra) * 0.22 * s, 0, ra, 0, s, s, s) });
      }
      tiers.forEach((t, ti) => {
        fol[ti].push({ m: composeM(x, t.y * s, z, 0, yaw + ti * 0.45, 0, s, s, s) });
        caps[ti].push({ m: composeM(x, (t.y + t.h * 0.28) * s, z, 0, yaw + ti * 0.45, 0, s, s, s) });
      });
      this._circle(x, z, 0.52 * s);
    }
    this._instanced(new THREE.CylinderGeometry(0.18, 0.28, 1.38, 6), this.mat.bark, trunks, true, true);
    this._instanced(new THREE.BoxGeometry(0.36, 0.22, 0.16), this.mat.bark, roots, false, true);
    tiers.forEach((t, ti) => {
      this._instanced(new THREE.ConeGeometry(t.r, t.h, 7), ti % 2 === 0 ? this.mat.leaf : this.mat.leafDark, fol[ti], true, true);
      this._instanced(new THREE.ConeGeometry(t.r * 0.84, t.h * 0.52, 7), this.mat.instSnow, caps[ti], false, true);
    });
  }

  // ===================================================================
  //  3. Trail props: winterberry bushes, boulders, fallen log with a robin
  // ===================================================================
  _buildTrailProps() {
    // Winterberry bushes [s, lat, scale] on the trail + two on the lake's north shore
    const bushPts = [];
    for (const [s, lat, sc] of [[7.1, 2.2, 1.0], [9.5, -2.25, 0.9], [14.6, 2.25, 1.05], [20.4, -2.15, 0.95]]) {
      const p = this._trailAt(s, lat);
      bushPts.push([p.x, p.z, sc]);
    }
    bushPts.push([-15.6, 34.6, 1.1], [-2.3, 36.2, 0.9]);
    const bodies = [];
    const tops = [];
    const berries = [];
    for (const [bx, bz, sc] of bushPts) {
      bodies.push({ m: composeM(bx, 0.34 * sc, bz, 0, bx, 0, 1.15 * sc, 0.82 * sc, 1.15 * sc) });
      tops.push({ m: composeM(bx, 0.6 * sc, bz, 0, bx, 0, 0.46 * sc, 0.2 * sc, 0.44 * sc) });
      for (let k = 0; k < 7; k++) {
        const ang = (k / 7) * Math.PI * 2 + bz;
        berries.push({ m: composeM(bx + Math.cos(ang) * 0.44 * sc, (0.28 + (k % 3) * 0.11) * sc, bz + Math.sin(ang) * 0.44 * sc, 0, ang, 0, 1, 1, 1) });
      }
      this._circle(bx, bz, 0.44 * sc);
    }
    this._instanced(new THREE.DodecahedronGeometry(0.48, 0), this.mat.bush, bodies, true, true);
    this._instanced(this.geo.snowCushion, this.mat.instSnow, tops, false, true);
    this._instanced(new THREE.BoxGeometry(0.1, 0.1, 0.1), this.mat.berry, berries, false, false);

    // Boulders: trail-side ones plus the snow-dusted rocks at the lake's edge
    this.rockSpecs = [];
    for (const [s, lat, sc] of [[3.5, 2.3, 0.72], [12.4, 2.45, 0.62], [21.6, -2.3, 0.9]]) {
      const p = this._trailAt(s, lat);
      this.rockSpecs.push([p.x, p.z, sc]);
    }
    for (const [a, k, sc] of [[176, 1.12, 1.05], [138, 1.1, 0.85], [96, 1.13, 1.15], [72, 1.1, 0.7], [34, 1.12, 0.95], [-14, 1.1, 0.8], [-150, 1.1, 0.75]]) {
      const p = icePoint(a * DEG, k);
      this.rockSpecs.push([p.x, p.z, sc]);
    }
    const rocks = [];
    const rcaps = [];
    for (const [rx, rz, rs] of this.rockSpecs) {
      rocks.push({ m: composeM(rx, 0.32 * rs, rz, 0, rx * 0.7, 0, 1.15 * rs, 0.78 * rs, 1.0 * rs) });
      rcaps.push({ m: composeM(rx, 0.6 * rs, rz, 0, rx * 0.7, 0, 0.48 * rs, 0.17 * rs, 0.42 * rs) });
      this._circle(rx, rz, 0.56 * rs);
    }
    this._instanced(new THREE.DodecahedronGeometry(0.56, 0), this.mat.stone, rocks, true, true);
    this._instanced(this.geo.snowCushion, this.mat.instSnow, rcaps, false, true);

    // Fallen log lying alongside the path (west side), snow along its back, bracket fungus, a robin
    const lp = this._trailAt(16.3, -2.35);
    const log = new THREE.Group();
    log.position.set(lp.x, 0, lp.z);
    log.rotation.y = lp.yaw - Math.PI / 2; // local +X runs along the trail
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.23, 2.0, 8), [this.mat.bark, this.mat.endGrain, this.mat.endGrain]);
    trunk.rotation.z = Math.PI / 2;
    trunk.position.y = 0.19;
    trunk.castShadow = true;
    trunk.receiveShadow = true;
    log.add(trunk);
    const logSnow = new THREE.Mesh(new THREE.BoxGeometry(1.84, 0.07, 0.24), this.mat.snow);
    logSnow.position.y = 0.41;
    log.add(logSnow);
    const stub = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 0.34, 5), this.mat.bark);
    stub.position.set(0.35, 0.3, -0.2);
    stub.rotation.x = -0.9;
    log.add(stub);
    const fungusMat = new THREE.MeshStandardMaterial({ color: 0xc89a63, roughness: 0.85 });
    for (const [fx, fy, fr] of [[-0.5, 0.2, 0.09], [-0.34, 0.12, 0.065]]) {
      const f = new THREE.Mesh(new THREE.CylinderGeometry(fr, fr * 1.1, 0.03, 7, 1, false, 0, Math.PI), fungusMat);
      f.position.set(fx, fy, 0.21);
      log.add(f);
    }
    // A plump little robin on the log; hops to the other end when you walk past
    const robin = new THREE.Group();
    const rBrown = new THREE.MeshStandardMaterial({ color: 0x7a5236, roughness: 0.9 });
    const rRed = new THREE.MeshStandardMaterial({ color: 0xe0582c, roughness: 0.85 });
    const rBeak = new THREE.MeshStandardMaterial({ color: 0xe8b13a, roughness: 0.6 });
    const rEye = new THREE.MeshBasicMaterial({ color: 0x1b1b22 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.12, 0.19), rBrown);
    body.position.y = 0.07;
    robin.add(body);
    const breast = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.09, 0.03), rRed);
    breast.position.set(0, 0.07, 0.095);
    robin.add(breast);
    const head = new THREE.Group();
    head.position.set(0, 0.15, 0.06);
    const headM = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.09, 0.1), rBrown);
    head.add(headM);
    const face = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.05, 0.02), rRed);
    face.position.set(0, -0.01, 0.05);
    head.add(face);
    const beak = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.02, 0.05), rBeak);
    beak.position.set(0, 0.0, 0.075);
    head.add(beak);
    for (const ex of [-0.051, 0.051]) {
      const eye = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.02, 0.02), rEye);
      eye.position.set(ex, 0.015, 0.025);
      head.add(eye);
    }
    robin.add(head);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.02, 0.11), rBrown);
    tail.position.set(0, 0.1, -0.13);
    tail.rotation.x = -0.45;
    robin.add(tail);
    robin.position.set(-0.55, 0.43, 0);
    robin.rotation.y = 0.6;
    log.add(robin);
    this._add(log, false, true);
    this.robin = { mesh: robin, head, ends: [-0.55, 0.62], at: 0, hopT: -1, cool: 0, logGroup: log, peckT: 2 };
    // Colliders: three circles along the log
    for (const off of [-0.7, 0, 0.7]) {
      const q = this._trailAt(16.3 + off, -2.35);
      this._circle(q.x, q.z, 0.3);
    }
  }

  // ===================================================================
  //  4. Lantern posts (style of world._buildLampPosts; no PointLights — halos + emissive only)
  // ===================================================================
  _buildLanternPosts() {
    const g = {
      plinth: new THREE.BoxGeometry(0.36, 0.34, 0.36),
      post: new THREE.BoxGeometry(0.16, 2.18, 0.16),
      arm: new THREE.BoxGeometry(0.6, 0.09, 0.09),
      strut: new THREE.BoxGeometry(0.42, 0.06, 0.06),
      cap: new THREE.BoxGeometry(0.24, 0.08, 0.24),
      capSnow: new THREE.BoxGeometry(0.22, 0.08, 0.22),
      hood: new THREE.ConeGeometry(0.2, 0.14, 4),
      globe: new THREE.BoxGeometry(0.24, 0.3, 0.24),
      bottom: new THREE.BoxGeometry(0.2, 0.06, 0.2),
      hoodSnow: new THREE.ConeGeometry(0.15, 0.07, 4),
    };
    const m = this.mat;
    // [s, lat]: the arm reaches out over the path
    for (const [s, lat] of [[5.4, 1.95], [12.0, -1.95], [21.75, 2.0]]) {
      const p = this._trailAt(s, lat);
      const grp = new THREE.Group();
      grp.position.set(p.x, 0, p.z);
      // local +X -> toward the centreline
      const dx = -Math.sign(lat) * p.nx;
      const dz = -Math.sign(lat) * p.nz;
      grp.rotation.y = Math.atan2(-dz, dx);
      const add = (geo, mat, x, y, z, rz = 0, ry = 0, cast = false) => {
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(x, y, z);
        mesh.rotation.z = rz;
        mesh.rotation.y = ry;
        mesh.castShadow = cast;
        grp.add(mesh);
        return mesh;
      };
      add(g.plinth, m.stone, 0, 0.17, 0, 0, 0, true);
      add(g.post, m.darkWood, 0, 1.38, 0, 0, 0, true);
      add(g.arm, m.iron, 0.24, 2.34, 0);
      add(g.strut, m.iron, 0.22, 2.16, 0, 0.72);
      add(g.cap, m.iron, 0, 2.5, 0);
      add(g.capSnow, m.snow, 0, 2.58, 0);
      add(g.hood, m.iron, 0.46, 2.24, 0, 0, Math.PI / 4);
      add(g.hoodSnow, m.instSnow, 0.46, 2.32, 0, 0, Math.PI / 4);
      add(g.globe, m.lantern, 0.46, 2.04, 0);
      add(g.bottom, m.iron, 0.46, 1.87, 0);
      this.world._addLanternHalo(grp, 0.46, 2.04, 0, 1.42, 0.56);
      // a little drift heaped against the plinth
      const d = add(this.geo.snowCushion, m.instSnow, -0.05, 0, 0.05);
      d.scale.set(0.34, 0.12, 0.3);
      this.group.add(grp);
      this._circle(p.x, p.z, 0.26);
    }
  }

  // ===================================================================
  //  5. Wooden signposts with pixel-font carved text
  // ===================================================================
  // Board face texture: pixel wood + carved text + a pixel arrow pointing to the board's tip
  _makeBoardTexture(text, dir, wPx) {
    const H = 32;
    const W = wPx;
    const cv = makeCanvas(W, H);
    if (!cv) return null;
    const ctx = cv.getContext("2d");
    const rnd = createMulberry(text.length * 131 + (dir > 0 ? 7 : 3));
    // Wood planks
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const r = rnd();
        ctx.fillStyle = r < 0.5 ? "#a8794a" : r < 0.85 ? "#9f7043" : "#b3844f";
        ctx.fillRect(x, y, 1, 1);
      }
    }
    ctx.fillStyle = "#8a5e36";
    for (let i = 0; i < 7; i++) {
      const gy = 3 + Math.floor(rnd() * (H - 6));
      const gx = Math.floor(rnd() * W);
      ctx.fillRect(gx, gy, 6 + Math.floor(rnd() * 14), 1);
    }
    ctx.fillStyle = "#c9965c";
    ctx.fillRect(0, 1, W, 1);
    ctx.fillStyle = "#6e4626";
    ctx.fillRect(0, 0, W, 1);
    ctx.fillRect(0, H - 1, W, 1);
    ctx.fillRect(0, 0, 1, H);
    ctx.fillRect(W - 1, 0, 1, H);

    // Carved text: render, then hard-threshold alpha so it reads as crisp pixel lettering
    const tc = makeCanvas(W, H);
    const t = tc.getContext("2d");
    t.font = 'bold 19px "Microsoft YaHei", "PingFang SC", "Noto Sans SC", sans-serif';
    t.textBaseline = "middle";
    t.textAlign = "center";
    const arrowW = 11;
    const gap = 5;
    const tw = Math.ceil(t.measureText ? t.measureText(text).width : 40);
    const total = tw + gap + arrowW;
    const left = Math.round((W - total) / 2);
    const textCx = dir > 0 ? left + tw / 2 : left + arrowW + gap + tw / 2;
    const arrowX0 = dir > 0 ? left + tw + gap : left;
    const drawArrow = (oy) => {
      // shaft + head
      const cy = 16 + oy;
      if (dir > 0) {
        t.fillRect(arrowX0, cy - 1, 6, 3);
        for (let i = 0; i < 5; i++) t.fillRect(arrowX0 + 6 + i, cy - 4 + i, 1, 9 - i * 2);
      } else {
        t.fillRect(arrowX0 + 5, cy - 1, 6, 3);
        for (let i = 0; i < 5; i++) t.fillRect(arrowX0 + 4 - i, cy - 4 + i, 1, 9 - i * 2);
      }
    };
    t.fillStyle = "#e9c99a"; // highlight (lower lip of the carving)
    t.fillText(text, textCx, 17 + 1);
    drawArrow(1);
    t.fillStyle = "#3a2213";
    t.fillText(text, textCx, 17);
    drawArrow(0);
    const img = t.getImageData(0, 0, W, H);
    const d = img.data;
    for (let i = 3; i < d.length; i += 4) d[i] = d[i] > 110 ? 255 : 0;
    t.putImageData(img, 0, 0);
    ctx.drawImage(tc, 0, 0);
    return pixelTexture(cv);
  }

  _buildSignpost(pos, boards) {
    const grp = new THREE.Group();
    grp.position.set(pos.x, 0, pos.z);
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.13, 2.0, 0.13), this.mat.darkWood);
    post.position.y = 1.0;
    post.castShadow = true;
    grp.add(post);
    const top = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.14, 4), this.mat.darkWood);
    top.position.y = 2.07;
    top.rotation.y = Math.PI / 4;
    grp.add(top);
    const topSnow = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.08, 4), this.mat.instSnow);
    topSnow.position.y = 2.13;
    topSnow.rotation.y = Math.PI / 4;
    grp.add(topSnow);
    const base = new THREE.Mesh(this.geo.snowCushion, this.mat.instSnow);
    base.scale.set(0.3, 0.12, 0.28);
    grp.add(base);

    const sideMat = new THREE.MeshStandardMaterial({ color: 0x9a6a3e, roughness: 0.9 });
    const BH = 0.24;
    const tipShape = new THREE.Shape();
    tipShape.moveTo(0, -BH / 2);
    tipShape.lineTo(0.15, 0);
    tipShape.lineTo(0, BH / 2);
    tipShape.lineTo(0, -BH / 2);
    const tipGeo = new THREE.ExtrudeGeometry(tipShape, { depth: 0.05, bevelEnabled: false });
    tipGeo.translate(0, 0, -0.025);

    boards.forEach(({ text, dx, dz, y }) => {
      const W = 0.22 + text.length * 0.17;
      const wPx = Math.round((32 * W) / BH / 4) * 4;
      const frontTex = this._makeBoardTexture(text, 1, wPx);
      const backTex = this._makeBoardTexture(text, -1, wPx);
      const faceF = frontTex ? new THREE.MeshStandardMaterial({ map: frontTex, roughness: 0.9 }) : sideMat;
      const faceB = backTex ? new THREE.MeshStandardMaterial({ map: backTex, roughness: 0.9 }) : sideMat;
      // The camera looks north, so a board pointing straight north/south would be seen end-on.
      // Keep every board within 45° of the east-west axis so its carved face stays readable.
      let ang = Math.atan2(dz, dx);
      const lim = Math.PI / 4;
      if (Math.abs(ang) <= Math.PI / 2) ang = THREE.MathUtils.clamp(ang, -lim, lim);
      else ang = ang > 0 ? Math.max(ang, Math.PI - lim) : Math.min(ang, -Math.PI + lim);
      const arm = new THREE.Group();
      arm.position.y = y;
      arm.rotation.y = -ang; // local +X points along the (clamped) direction
      const board = new THREE.Mesh(new THREE.BoxGeometry(W, BH, 0.05), [sideMat, sideMat, sideMat, sideMat, faceF, faceB]);
      board.position.x = W / 2 - 0.1;
      board.castShadow = true;
      arm.add(board);
      const tip = new THREE.Mesh(tipGeo, sideMat);
      tip.position.x = W - 0.1;
      arm.add(tip);
      const sn = new THREE.Mesh(new THREE.BoxGeometry(W * 0.9, 0.035, 0.07), this.mat.snow);
      sn.position.set(W / 2 - 0.1 - W * 0.03, BH / 2 + 0.016, 0);
      arm.add(sn);
      // tiny iron nail heads
      const nail = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.025, 0.07), this.mat.iron);
      nail.position.set(0, 0, 0);
      arm.add(nail);
      grp.add(arm);
    });
    this._add(grp, false, true);
    this._circle(pos.x, pos.z, 0.16);
  }

  _buildSignposts() {
    // Trail head: lake down the trail (south), cottage back north
    const toTrail = this._trailAt(4.5);
    this._buildSignpost(SIGN_HEAD, [
      { text: "镜湖", dx: toTrail.x - SIGN_HEAD.x, dz: toTrail.z - SIGN_HEAD.z, y: 1.62 },
      { text: "冬麓小屋", dx: -0.8 - SIGN_HEAD.x, dz: -4.0 - SIGN_HEAD.z, y: 1.28 },
    ]);
    // Lake: cottage back up the trail, pier west, fishing hole east on the ice
    const up = this._trailAt(this.trailLen - 5.0);
    this._buildSignpost(SIGN_LAKE, [
      { text: "冬麓小屋", dx: up.x - SIGN_LAKE.x, dz: up.z - SIGN_LAKE.z, y: 1.66 },
      { text: "码头", dx: DOCK.x - SIGN_LAKE.x, dz: DOCK.z0 + 1.5 - SIGN_LAKE.z, y: 1.34 },
      { text: "冰钓", dx: HOLE.x - SIGN_LAKE.x, dz: HOLE.z - SIGN_LAKE.z, y: 1.02 },
    ]);
  }

  // ===================================================================
  //  6. The frozen lake
  // ===================================================================
  _buildLake() {
    const rnd = createMulberry(7071);
    // --- Ice: disc with world-space UVs and a deep-centre -> pale-edge vertex tint
    const disc = new THREE.RingGeometry(0.0001, 1, 96, 6);
    disc.rotateX(-Math.PI / 2);
    const pos = disc.attributes.position;
    const uvA = disc.attributes.uv;
    const col = new Float32Array(pos.count * 3);
    const cDeep = new THREE.Color(0xbfe2f4);
    const cMid = new THREE.Color(0xd6eefb);
    const cEdge = new THREE.Color(0xf1f9ff);
    const tmp = new THREE.Color();
    const uv2 = new Float32Array(pos.count * 2);
    for (let i = 0; i < pos.count; i++) {
      const lx = pos.getX(i);
      const lz = pos.getZ(i);
      const k = Math.hypot(lx, lz);
      const x = LAKE.cx + lx * LAKE.rx;
      const z = LAKE.cz + lz * LAKE.rz;
      pos.setXYZ(i, x, ICE_Y, z);
      uvA.setXY(i, x * 0.25, z * 0.25);
      uv2[i * 2] = (x - (LAKE.cx - LAKE.rx)) / (2 * LAKE.rx);
      uv2[i * 2 + 1] = 1 - (z - (LAKE.cz - LAKE.rz)) / (2 * LAKE.rz);
      if (k < 0.7) tmp.lerpColors(cDeep, cMid, k / 0.7);
      else tmp.lerpColors(cMid, cEdge, Math.min(1, (k - 0.7) / 0.3));
      col[i * 3] = tmp.r;
      col[i * 3 + 1] = tmp.g;
      col[i * 3 + 2] = tmp.b;
    }
    disc.setAttribute("color", new THREE.BufferAttribute(col, 3));
    disc.computeVertexNormals();
    disc.computeBoundingSphere();
    const iceTex = this.textures.frozenIce.clone();
    iceTex.repeat.set(1, 1);
    iceTex.wrapS = THREE.RepeatWrapping;
    iceTex.wrapT = THREE.RepeatWrapping;
    iceTex.needsUpdate = true;
    const iceMat = new THREE.MeshStandardMaterial({ map: iceTex, vertexColors: true, roughness: 0.16, metalness: 0.16 });
    const ice = this._add(new THREE.Mesh(disc, iceMat), false, true);
    ice.name = "mirrorLakeIce";

    // --- Overlay: cracks, snow dust, wind streaks and clear black-ice patches (one pixel canvas)
    const ov = disc.clone();
    ov.setAttribute("uv", new THREE.BufferAttribute(uv2, 2));
    ov.deleteAttribute("color");
    const ovp = ov.attributes.position;
    for (let i = 0; i < ovp.count; i++) ovp.setY(i, ICE_Y + 0.004);
    const ovTex = this._makeIceOverlayTexture();
    if (ovTex) {
      const ovMat = new THREE.MeshStandardMaterial({
        map: ovTex,
        transparent: true,
        depthWrite: false,
        roughness: 0.3,
        metalness: 0.05,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -2,
      });
      const ovMesh = this._add(new THREE.Mesh(ov, ovMat), false, true);
      ovMesh.renderOrder = 1;
    }

    // --- Snowy bank lip around the ice (walkable; getSurface follows its height)
    const segs = 120;
    const nk = RIM_K.length;
    const rp = [];
    const ruv = [];
    const ridx = [];
    for (let i = 0; i <= segs; i++) {
      const a = (i / segs) * Math.PI * 2;
      const wob = 0.78 + 0.44 * (0.5 + 0.5 * Math.sin(a * 3 + 1.3) * Math.cos(a * 7 + 0.4));
      for (let j = 0; j < nk; j++) {
        const k = RIM_K[j] + (j > 0 && j < nk - 1 ? Math.sin(a * 11 + j) * 0.006 : 0);
        const p = icePoint(a, k);
        const y = j === 0 || j === nk - 1 ? RIM_Y[j] : RIM_Y[j] * wob;
        rp.push(p.x, y, p.z);
        ruv.push(p.x * 0.3, p.z * 0.3);
      }
    }
    for (let i = 0; i < segs; i++) {
      for (let j = 0; j < nk - 1; j++) {
        const a = i * nk + j;
        const b = (i + 1) * nk + j;
        ridx.push(a, b, a + 1, b, b + 1, a + 1);
      }
    }
    const rim = new THREE.BufferGeometry();
    rim.setAttribute("position", new THREE.Float32BufferAttribute(rp, 3));
    rim.setAttribute("uv", new THREE.Float32BufferAttribute(ruv, 2));
    rim.setIndex(ridx);
    faceUp(rim);
    const rimTex = this.textures.snowGround.clone();
    rimTex.repeat.set(1, 1);
    rimTex.needsUpdate = true;
    this._add(new THREE.Mesh(rim, new THREE.MeshStandardMaterial({ map: rimTex, color: 0xfbfdff, roughness: 0.9 })), false, true);

    // --- Reeds & cattails in clusters at the edge (kept away from the pier & trail end)
    const stalks = [];
    const leaves = [];
    const heads = [];
    const headSnow = [];
    const reedCols = [0xb89a5e, 0xa88a52, 0xc4a86e, 0x9c8450];
    const clusters = [-150, -172, 162, 128, 104, 62, 18, -28, -54];
    if (this.mobile) clusters.length = 6;
    for (const ca of clusters) {
      const n = 6 + Math.floor(rnd() * 4);
      for (let i = 0; i < n; i++) {
        const a = (ca + (rnd() - 0.5) * 7) * DEG;
        const p = icePoint(a, 0.975 + rnd() * 0.075);
        const h = 0.55 + rnd() * 0.5;
        const tilt = (rnd() - 0.5) * 0.28;
        const tilt2 = (rnd() - 0.5) * 0.28;
        const yaw = rnd() * Math.PI;
        stalks.push({ m: composeM(p.x, 0.02, p.z, tilt, yaw, tilt2, 1, h, 1), c: reedCols[i % reedCols.length] });
        if (rnd() < 0.55) {
          _e.set(tilt, yaw, tilt2, "YXZ");
          _q.setFromEuler(_e);
          _p.set(0, h - 0.07, 0).applyQuaternion(_q);
          heads.push({ m: composeM(p.x + _p.x, 0.02 + _p.y, p.z + _p.z, tilt, yaw, tilt2, 1, 1, 1) });
          _p.set(0, h + 0.015, 0).applyQuaternion(_q);
          headSnow.push({ m: composeM(p.x + _p.x, 0.02 + _p.y, p.z + _p.z, 0, yaw, 0, 0.04, 0.025, 0.04) });
        }
        if (i % 2 === 0) {
          leaves.push({ m: composeM(p.x + 0.03, 0.02, p.z, tilt * 2.4 + 0.25, yaw + 1.2, tilt2 * 2, 1, h * 0.62, 1), c: 0xa99a64 });
        }
      }
    }
    const stalkGeo = new THREE.BoxGeometry(0.026, 1, 0.026);
    stalkGeo.translate(0, 0.5, 0);
    const leafGeo = new THREE.BoxGeometry(0.055, 1, 0.012);
    leafGeo.translate(0, 0.5, 0);
    const reedMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.92 });
    this._instanced(stalkGeo, reedMat, stalks, false, false);
    this._instanced(leafGeo, reedMat, leaves, false, false);
    this._instanced(new THREE.CylinderGeometry(0.034, 0.034, 0.17, 6), new THREE.MeshStandardMaterial({ color: 0x5a3a22, roughness: 0.95 }), heads, false, false);
    this._instanced(new THREE.SphereGeometry(1, 6, 4), this.mat.instSnow, headSnow, false, false);

    // --- Snow patches dusted onto the ice
    for (const [x, z, sx, sz, r] of [[-15.4, 40.6, 1.6, 0.9, 0.4], [-7.6, 45.8, 1.3, 0.8, 1.1], [-10.3, 37.5, 1.0, 0.6, 2.2], [-3.4, 39.2, 0.9, 0.55, 0.3], [-12.8, 43.4, 1.2, 0.7, 2.9], [-9.4, 47.6, 1.1, 0.5, 0.1]]) {
      const m = new THREE.Mesh(r > 1.5 ? this.geo.driftA : this.geo.driftB, this.mat.drift);
      m.scale.set(sx, 0.045, sz);
      m.position.set(x, ICE_Y - 0.004, z);
      m.rotation.y = r;
      this._add(m, false, true);
    }

    // --- Lake surroundings: soft snow mounds just outside the shore to ease into the hills
    for (const [a, k, sc] of [[-160, 1.08, 2.6], [180, 1.06, 2.2], [150, 1.08, 2.8], [120, 1.07, 3.0], [90, 1.06, 3.2], [60, 1.07, 2.8], [28, 1.06, 2.4], [-118, 1.06, 2.2], [-70, 1.06, 2.0]]) {
      const p = shorePoint(a * DEG, k);
      const m = new THREE.Mesh(a > 0 ? this.geo.driftA : this.geo.driftB, this.mat.drift);
      m.scale.set(sc * 0.6, 0.5 + (Math.abs(a) % 3) * 0.12, sc * 0.45);
      m.position.set(p.x, -0.04, p.z);
      m.rotation.y = a * DEG + Math.PI / 2;
      this._add(m, false, true);
    }
  }

  _makeIceOverlayTexture() {
    const W = 288;
    const H = 208;
    const cv = makeCanvas(W, H);
    if (!cv) return null;
    const ctx = cv.getContext("2d");
    const img = ctx.createImageData(W, H);
    const d = img.data;
    const rnd = createMulberry(8086);
    const inside = (px, py) => {
      const nx = (px + 0.5) / W * 2 - 1;
      const ny = (py + 0.5) / H * 2 - 1;
      return nx * nx + ny * ny < 0.985;
    };
    const blend = (px, py, r, g, b, a) => {
      px |= 0;
      py |= 0;
      if (px < 0 || py < 0 || px >= W || py >= H || !inside(px, py)) return;
      const i = (py * W + px) * 4;
      const da = d[i + 3] / 255;
      const oa = a + da * (1 - a);
      if (oa <= 0) return;
      d[i] = (r * a + d[i] * da * (1 - a)) / oa;
      d[i + 1] = (g * a + d[i + 1] * da * (1 - a)) / oa;
      d[i + 2] = (b * a + d[i + 2] * da * (1 - a)) / oa;
      d[i + 3] = oa * 255;
    };
    // world (x,z) -> pixel
    const toPx = (x, z) => [((x - (LAKE.cx - LAKE.rx)) / (2 * LAKE.rx)) * W, ((z - (LAKE.cz - LAKE.rz)) / (2 * LAKE.rz)) * H];

    // Clear black-ice patches (deeper, glassy blue)
    for (let n = 0; n < 6; n++) {
      const a = rnd() * Math.PI * 2;
      const k = rnd() * 0.55;
      const cx = W / 2 + Math.cos(a) * k * W / 2;
      const cy = H / 2 + Math.sin(a) * k * H / 2;
      const r = 9 + rnd() * 16;
      for (let y = -r; y <= r; y++) {
        for (let x = -r * 1.4; x <= r * 1.4; x++) {
          const q = Math.hypot(x / 1.4, y) / r;
          if (q > 1) continue;
          if (rnd() < 0.12 * q) continue; // ragged pixel edge
          blend(cx + x, cy + y, 70, 128, 172, 0.17 * (1 - q * q));
        }
      }
    }
    // Wind-blown snow streaks (from the north-west)
    for (let n = 0; n < 9; n++) {
      let x = rnd() * W;
      let y = rnd() * H;
      const len = 20 + rnd() * 40;
      const ang = 0.42 + (rnd() - 0.5) * 0.2;
      for (let i = 0; i < len; i++) {
        x += Math.cos(ang);
        y += Math.sin(ang) * 0.75;
        const fade = Math.sin((i / len) * Math.PI);
        blend(x, y, 248, 252, 255, 0.28 * fade);
        if (rnd() < 0.5) blend(x, y + 1, 248, 252, 255, 0.16 * fade);
      }
    }
    // Snow dust drifting in along the edges
    for (let n = 0; n < 1500; n++) {
      const a = rnd() * Math.PI * 2;
      const k = 1 - Math.pow(rnd(), 2.2) * 0.32;
      const x = W / 2 + Math.cos(a) * k * W / 2;
      const y = H / 2 + Math.sin(a) * k * H / 2;
      const al = 0.3 + rnd() * 0.5;
      blend(x, y, 250, 253, 255, al);
      if (rnd() < 0.4) blend(x + 1, y, 250, 253, 255, al * 0.7);
    }
    // Cracks: white etched line with a faint deep-blue shadow, branching random walks
    const crack = (x, y, ang, len, depth) => {
      for (let i = 0; i < len; i++) {
        x += Math.cos(ang);
        y += Math.sin(ang);
        ang += (rnd() - 0.5) * 0.55;
        blend(x + 1, y + 1, 84, 136, 180, 0.32);
        blend(x, y, 244, 251, 255, 0.82);
        if (depth < 2 && rnd() < 0.05) crack(x, y, ang + (rnd() < 0.5 ? -1 : 1) * (0.6 + rnd() * 0.6), len * (0.35 + rnd() * 0.25), depth + 1);
      }
    };
    for (let n = 0; n < 5; n++) {
      const a = rnd() * Math.PI * 2;
      const k = 0.15 + rnd() * 0.6;
      crack(W / 2 + Math.cos(a) * k * W / 2, H / 2 + Math.sin(a) * k * H / 2, rnd() * Math.PI * 2, 30 + rnd() * 50, 0);
    }
    // A star crack near the pier end (someone jumped off the pier last winter)
    {
      const [sx, sy] = toPx(DOCK.x + 1.6, DOCK.z1 + 1.4);
      for (let b = 0; b < 6; b++) crack(sx, sy, (b / 6) * Math.PI * 2 + rnd() * 0.4, 9 + rnd() * 12, 1);
    }
    // Radial hairline cracks around the fishing hole (from drilling)
    {
      const [hx, hy] = toPx(HOLE.x, HOLE.z);
      for (let b = 0; b < 5; b++) crack(hx, hy, (b / 5) * Math.PI * 2 + 0.3, 7 + rnd() * 8, 2);
      // slushy splash marks around the hole
      for (let n = 0; n < 60; n++) {
        const a = rnd() * Math.PI * 2;
        const r = 6 + rnd() * 9;
        blend(hx + Math.cos(a) * r, hy + Math.sin(a) * r * 0.75, 236, 248, 255, 0.45);
      }
    }
    ctx.putImageData(img, 0, 0);
    return pixelTexture(cv);
  }

  // ===================================================================
  //  7. Wooden pier with a bench and the zone's single warm lantern light
  // ===================================================================
  _buildDock() {
    const rnd = createMulberry(3131);
    const len = DOCK.z1 - DOCK.z0;
    const width = DOCK.hw * 2;
    const g = new THREE.Group();
    g.position.set(DOCK.x, 0, 0);

    // Deck planks (instanced; the ones under your feet dip a little, like the yard bridge)
    const plankGeo = new THREE.BoxGeometry(width, 0.05, 0.19);
    const step = 0.225;
    const n = Math.floor((len - 0.02) / step);
    const plankCols = [0xffffff, 0xf2e4d2, 0xe8d6bf, 0xfaf0e2, 0xdcc8ae];
    const planks = new THREE.InstancedMesh(plankGeo, this.mat.plank, n);
    this.dockPlanks = { mesh: planks, list: [], dirty: false };
    for (let i = 0; i < n; i++) {
      const z = DOCK.z0 + 0.11 + i * step;
      const ox = (rnd() - 0.5) * 0.05;
      const yaw = (rnd() - 0.5) * 0.025;
      const y = DOCK.top - 0.025 + (rnd() - 0.5) * 0.006;
      planks.setMatrixAt(i, composeM(ox, y, z, 0, yaw, 0, 1, 1, 1));
      planks.setColorAt(i, _c.setHex(plankCols[Math.floor(rnd() * plankCols.length)]));
      this.dockPlanks.list.push({ z, ox, yaw, y, flex: 0 });
    }
    planks.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    planks.instanceMatrix.needsUpdate = true;
    planks.instanceColor.needsUpdate = true;
    planks.castShadow = true;
    planks.receiveShadow = true;
    planks.computeBoundingSphere();
    g.add(planks);

    // Landing step on the shore
    const stepPlank = new THREE.Mesh(new THREE.BoxGeometry(width - 0.1, 0.06, 0.36), this.mat.wood);
    stepPlank.position.set(0, DOCK.stepTop - 0.03, (DOCK.stepZ0 + DOCK.z0) / 2);
    stepPlank.receiveShadow = true;
    g.add(stepPlank);
    for (const sx of [-0.55, 0.55]) {
      const blk = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, 0.3), this.mat.darkWood);
      blk.position.set(sx, 0.07, (DOCK.stepZ0 + DOCK.z0) / 2);
      g.add(blk);
    }

    // Stringers & cross beams
    const zMid = (DOCK.z0 + DOCK.z1) / 2;
    for (const sx of [-0.55, 0.55]) {
      const st = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, len), this.mat.darkWood);
      st.position.set(sx, DOCK.top - 0.1, zMid);
      g.add(st);
    }
    const pileZ = [33.75, 35.15, 36.55, 37.95, 39.62];
    const piles = [];
    const pileSnow = [];
    const frost = [];
    for (const pz of pileZ) {
      const beam = new THREE.Mesh(new THREE.BoxGeometry(width - 0.04, 0.08, 0.08), this.mat.darkWood);
      beam.position.set(0, DOCK.top - 0.16, pz);
      g.add(beam);
      for (const sx of [-0.74, 0.74]) {
        const x = DOCK.x + sx;
        const onIce = iceK(x, pz) < 1.0;
        const base = onIce ? ICE_Y : 0;
        const topY = DOCK.top + 0.08;
        const h = topY - base + 0.05;
        piles.push({ m: composeM(x, base - 0.05 + h / 2, pz, 0, rnd(), 0, 1, h, 1) });
        pileSnow.push({ m: composeM(x, topY + 0.012, pz, 0, 0, 0, 1, 1, 1) });
        if (onIce) frost.push({ m: composeM(x, ICE_Y + 0.006, pz, 0, rnd(), 0, 1, 1, 1) });
      }
    }
    this.group.add(g);
    this._instanced(new THREE.CylinderGeometry(0.085, 0.095, 1, 7), this.mat.bark, piles, true, true);
    this._instanced(new THREE.CylinderGeometry(0.095, 0.09, 0.035, 7), this.mat.instSnow, pileSnow, false, false);
    this._instanced(new THREE.CylinderGeometry(0.19, 0.22, 0.018, 9), new THREE.MeshStandardMaterial({ color: 0xeef8ff, roughness: 0.5 }), frost, false, true);

    // Snow lying on the deck edges & heaped at the landing (flat caps thicken in heavy snow)
    for (const [sx, z, l, w] of [[-0.66, 34.2, 1.3, 0.22], [0.64, 35.5, 0.9, 0.2], [-0.62, 37.2, 0.7, 0.18], [0.66, 38.1, 0.8, 0.2], [-0.6, 38.9, 0.5, 0.2]]) {
      const sn = new THREE.Mesh(new THREE.BoxGeometry(w, 0.035, l), this.mat.snow);
      sn.position.set(DOCK.x + sx, DOCK.top + 0.012, z);
      this._add(sn, false, true);
    }
    // Coiled mooring rope
    const coilGeo = new THREE.TorusGeometry(0.12, 0.028, 5, 14);
    coilGeo.rotateX(-Math.PI / 2);
    for (let i = 0; i < 2; i++) {
      const c = new THREE.Mesh(coilGeo, this.mat.rope);
      c.position.set(DOCK.x + 0.44, DOCK.top + 0.03 + i * 0.045, 34.25);
      c.scale.setScalar(1 - i * 0.18);
      this._add(c, false, false);
    }

    // Bench at the end, facing south over the lake
    const bench = new THREE.Group();
    bench.position.set(BENCH.x, DOCK.top, BENCH.z);
    const seatY = 0.42;
    for (const dz of [-0.13, 0, 0.13]) {
      const sl = new THREE.Mesh(new THREE.BoxGeometry(1.32, 0.04, 0.12), this.mat.wood);
      sl.position.set(0, seatY, dz);
      sl.castShadow = true;
      bench.add(sl);
    }
    for (const lx of [-0.56, 0.56]) {
      for (const lz of [-0.14, 0.14]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.07, seatY, 0.07), this.mat.darkWood);
        leg.position.set(lx, seatY / 2, lz);
        bench.add(leg);
      }
      const back = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.5, 0.06), this.mat.darkWood);
      back.position.set(lx, seatY + 0.25, -0.2);
      back.rotation.x = -0.1;
      bench.add(back);
      const armR = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.04, 0.42), this.mat.darkWood);
      armR.position.set(lx * 1.04, seatY + 0.2, -0.02);
      bench.add(armR);
    }
    for (const by of [0.2, 0.38]) {
      const slat = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.1, 0.035), this.mat.wood);
      slat.position.set(0, seatY + by, -0.215 - by * 0.08);
      slat.rotation.x = -0.1;
      slat.castShadow = true;
      bench.add(slat);
    }
    const backSnow = new THREE.Mesh(new THREE.BoxGeometry(1.26, 0.04, 0.07), this.mat.snow);
    backSnow.position.set(0, seatY + 0.455, -0.255);
    bench.add(backSnow);
    const seatSnow = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.035, 0.34), this.mat.snow);
    seatSnow.position.set(0.48, seatY + 0.035, 0.01);
    bench.add(seatSnow);
    // A red thermos and a folded knit blanket left on the seat
    const thermos = new THREE.Mesh(new THREE.CylinderGeometry(0.048, 0.048, 0.2, 8), this.mat.red);
    thermos.position.set(-0.5, seatY + 0.12, 0.02);
    bench.add(thermos);
    const tcap = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.05, 8), this.mat.iron);
    tcap.position.set(-0.5, seatY + 0.245, 0.02);
    bench.add(tcap);
    const blanket = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.06, 0.28), new THREE.MeshStandardMaterial({ color: 0xb8483a, roughness: 0.95 }));
    blanket.position.set(-0.18, seatY + 0.05, 0.02);
    blanket.rotation.y = 0.12;
    bench.add(blanket);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.345, 0.062, 0.05), this.mat.cream);
    stripe.position.set(-0.18, seatY + 0.051, 0.02);
    stripe.rotation.y = 0.12;
    bench.add(stripe);
    this._add(bench, false, true);
    this._boxC(BENCH.x, BENCH.z - 0.02, 1.44, 0.6);

    // Lantern post on the pier's south-east corner, lantern hanging out over the ice
    const lp = new THREE.Group();
    lp.position.set(DOCK.x + 0.74, DOCK.top, 39.62);
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.11, 1.75, 0.11), this.mat.darkWood);
    post.position.y = 0.875;
    post.castShadow = true;
    lp.add(post);
    const pCap = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.05, 0.16), this.mat.iron);
    pCap.position.y = 1.775;
    lp.add(pCap);
    const pSnow = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.06, 0.15), this.mat.snow);
    pSnow.position.y = 1.83;
    lp.add(pSnow);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.5), this.mat.iron);
    arm.position.set(0, 1.66, 0.22);
    lp.add(arm);
    const armSnow = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.03, 0.4), this.mat.snow);
    armSnow.position.set(0, 1.7, 0.25);
    lp.add(armSnow);
    const chain = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.16, 0.012), this.mat.iron);
    chain.position.set(0, 1.56, 0.44);
    lp.add(chain);
    const lantern = new THREE.Group();
    lantern.position.set(0, 1.36, 0.44);
    const lHood = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.1, 4), this.mat.iron);
    lHood.position.y = 0.14;
    lHood.rotation.y = Math.PI / 4;
    lantern.add(lHood);
    const lGlass = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.2, 0.15), this.mat.lantern);
    lantern.add(lGlass);
    const lBase = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.035, 0.17), this.mat.iron);
    lBase.position.y = -0.115;
    lantern.add(lBase);
    for (const [fx, fz] of [[-0.075, -0.075], [0.075, -0.075], [-0.075, 0.075], [0.075, 0.075]]) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.22, 0.018), this.mat.iron);
      bar.position.set(fx, 0, fz);
      lantern.add(bar);
    }
    lp.add(lantern);
    this.dockLantern = lantern;
    this.world._addLanternHalo(lp, 0, 1.36, 0.44, 1.25, 0.55);
    this._add(lp, false, true);
    this._circle(DOCK.x + 0.74, 39.62, 0.12);
    // The zone's single warm PointLight (world.update scales it by lampGlow & flickers it)
    const light = new THREE.PointLight(0xffb54c, 0, 9.5, 1.6);
    light.position.set(DOCK.x + 0.74, DOCK.top + 1.3, 40.06);
    this.group.add(light);
    this.world.warmLights.push({ light, baseIntensity: 2.4, flicker: true, phase: 4.2 });
    this._addGlowPool(DOCK.x + 0.8, 40.5, 3.4, 0.5);

    // A pair of ice skates hung by their laces on the post (decorative)
    if (!this.mobile) {
      const skateMat = new THREE.MeshStandardMaterial({ color: 0xf4efe6, roughness: 0.7 });
      const bladeMat = new THREE.MeshStandardMaterial({ color: 0xc9d3dc, roughness: 0.25, metalness: 0.8 });
      for (const [ox, rz] of [[0.075, 0.12], [0.075, -0.1]]) {
        const sk = new THREE.Group();
        sk.position.set(ox, 1.0, rz * 0.6);
        sk.rotation.x = rz;
        const boot = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.12, 0.15), skateMat);
        boot.position.set(0.03, -0.12, 0.02);
        sk.add(boot);
        const toe = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.08), skateMat);
        toe.position.set(0.03, -0.15, 0.12);
        sk.add(toe);
        const blade = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.03, 0.22), bladeMat);
        blade.position.set(0.03, -0.2, 0.05);
        sk.add(blade);
        const lace = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.08, 0.01), this.mat.cream);
        lace.position.set(0.01, -0.04, 0);
        sk.add(lace);
        lp.add(sk);
      }
    }

    // A red mitten that appears on a pile once you fish one out of the lake
    const mitten = new THREE.Group();
    const mPalm = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.13, 0.04), this.mat.red);
    mitten.add(mPalm);
    const mThumb = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.06, 0.035), this.mat.red);
    mThumb.position.set(0.055, 0.0, 0);
    mThumb.rotation.z = -0.4;
    mitten.add(mThumb);
    const mCuff = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.035, 0.045), this.mat.cream);
    mCuff.position.y = 0.075;
    mitten.add(mCuff);
    mitten.position.set(DOCK.x - 0.74, DOCK.top + 0.02, 36.55 + 0.1);
    mitten.rotation.set(0.1, 0.3, 0.15);
    mitten.visible = false;
    this._add(mitten, false, false);
    this.mitten = mitten;
  }

  // Warm additive light pool on the ice: the "mirror" reflection of a lantern / window at night
  _addGlowPool(x, z, size, gain) {
    const geo = new THREE.PlaneGeometry(size, size * 1.3);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({
      map: this.textures.fireGlowSoft,
      color: 0xffc887,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, ICE_Y + 0.012, z);
    m.renderOrder = 2;
    this.group.add(m);
    this.glowPools.push({ mat, gain });
  }

  // ===================================================================
  //  8. Ice-fishing spot
  // ===================================================================
  _buildFishingSpot() {
    const H = HOLE;
    const g = new THREE.Group();
    g.position.set(H.x, 0, H.z);
    // Dark water in the hole, a short ice wall and a slushy lip
    const water = new THREE.Mesh(new THREE.CircleGeometry(0.33, 18), new THREE.MeshStandardMaterial({ color: 0x103246, roughness: 0.06, metalness: 0.35 }));
    water.rotation.x = -Math.PI / 2;
    water.position.y = ICE_Y + 0.012;
    g.add(water);
    this.holeWater = water;
    const wall = new THREE.Mesh(
      new THREE.CylinderGeometry(0.34, 0.34, 0.06, 18, 1, true),
      new THREE.MeshStandardMaterial({ color: 0x9fd0ea, roughness: 0.2, metalness: 0.1, side: THREE.BackSide })
    );
    wall.position.y = ICE_Y + 0.03;
    g.add(wall);
    const lipGeo = new THREE.RingGeometry(0.33, 0.52, 20);
    lipGeo.rotateX(-Math.PI / 2);
    const lip = new THREE.Mesh(lipGeo, new THREE.MeshStandardMaterial({ color: 0xeaf6ff, roughness: 0.55 }));
    lip.position.y = ICE_Y + 0.06;
    g.add(lip);
    // Chunks of cut ice around the hole
    const rnd = createMulberry(6060);
    const chunks = [];
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + rnd() * 0.5;
      const r = 0.6 + rnd() * 0.35;
      const s = 0.08 + rnd() * 0.07;
      chunks.push({ m: composeM(H.x + Math.cos(a) * r, ICE_Y + s * 0.4, H.z + Math.sin(a) * r, rnd() * 0.6, rnd() * 3, rnd() * 0.5, s * 1.6, s, s * 1.2) });
    }
    this._instanced(this.geo.box, this.mat.iceShard, chunks, false, true);

    // Bobber (red top, white bottom, tiny antenna)
    const bob = new THREE.Group();
    const bTop = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), this.mat.red);
    bob.add(bTop);
    const bBot = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 4, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xf6f4ee, roughness: 0.5 }));
    bob.add(bBot);
    const ant = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.07, 0.01), this.mat.red);
    ant.position.y = 0.065;
    bob.add(ant);
    bob.position.set(0.03, ICE_Y + 0.025, -0.02);
    g.add(bob);
    this.bobber = bob;

    // Rod in a forked-stick holder; tip sits right above the hole
    const holder = { x: 0.66, z: -0.34 };
    for (const r of [0.35, -0.35]) {
      const st = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.42, 0.03), this.mat.darkWood);
      st.position.set(holder.x, 0.2, holder.z);
      st.rotation.z = r;
      g.add(st);
    }
    const base = new THREE.Vector3(holder.x + 0.12, 0.3, holder.z + 0.06);
    const tip = new THREE.Vector3(0.03, 1.0, -0.02);
    const dir = new THREE.Vector3().subVectors(tip, base);
    const rodLen = dir.length() + 0.3;
    dir.normalize();
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.02, rodLen, 5), new THREE.MeshStandardMaterial({ color: 0x5b2f24, roughness: 0.6 }));
    rod.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    rod.position.copy(base).addScaledVector(dir, rodLen / 2 - 0.3);
    g.add(rod);
    const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.2, 6), new THREE.MeshStandardMaterial({ color: 0xc8a272, roughness: 0.95 }));
    grip.quaternion.copy(rod.quaternion);
    grip.position.copy(base).addScaledVector(dir, -0.18);
    g.add(grip);
    const reel = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.035, 10), this.mat.iron);
    reel.position.copy(base).addScaledVector(dir, -0.04);
    reel.position.y -= 0.04;
    reel.rotation.z = Math.PI / 2;
    reel.rotation.y = Math.atan2(dir.x, dir.z);
    g.add(reel);
    // Fishing line (a 1-px line so it never shimmers)
    const lineGeo = new THREE.BufferGeometry();
    lineGeo.setAttribute("position", new THREE.Float32BufferAttribute([tip.x, tip.y, tip.z, 0.03, 0.08, -0.02], 3));
    const line = new THREE.Line(lineGeo, new THREE.LineBasicMaterial({ color: 0xeef4f8, transparent: true, opacity: 0.85 }));
    g.add(line);
    this.fishLine = line;
    this.rodTip = tip;

    // Little stool with a knitted cushion
    const stool = new THREE.Group();
    stool.position.set(-0.8, ICE_Y, 0.12);
    const seat = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.19, 0.05, 9), this.mat.wood);
    seat.position.y = 0.4;
    stool.add(seat);
    const cushion = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.17, 0.045, 9), new THREE.MeshStandardMaterial({ color: 0x3f6fa8, roughness: 0.95 }));
    cushion.position.y = 0.445;
    stool.add(cushion);
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + 0.3;
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.42, 0.035), this.mat.darkWood);
      leg.position.set(Math.cos(a) * 0.12, 0.2, Math.sin(a) * 0.12);
      leg.rotation.set(Math.sin(a) * 0.18, 0, -Math.cos(a) * 0.18);
      stool.add(leg);
    }
    g.add(stool);

    // Wooden bucket with iron bands & a handle
    const bucket = new THREE.Group();
    bucket.position.set(0.72, ICE_Y, 0.52);
    const bMat = new THREE.MeshStandardMaterial({ map: this.textures.woodPlank, roughness: 0.9, side: THREE.DoubleSide });
    const shell = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.135, 0.3, 12, 1, true), bMat);
    shell.position.y = 0.15;
    bucket.add(shell);
    const bottom = new THREE.Mesh(new THREE.CircleGeometry(0.135, 12), bMat);
    bottom.rotation.x = -Math.PI / 2;
    bottom.position.y = 0.01;
    bucket.add(bottom);
    for (const by of [0.06, 0.25]) {
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.143 + by * 0.11, 0.14 + by * 0.11, 0.022, 12, 1, true), this.mat.iron);
      band.position.y = by;
      bucket.add(band);
    }
    const bWater = new THREE.Mesh(new THREE.CircleGeometry(0.158, 12), new THREE.MeshStandardMaterial({ color: 0x1d4a63, roughness: 0.1, metalness: 0.3 }));
    bWater.rotation.x = -Math.PI / 2;
    bWater.position.y = 0.23;
    bucket.add(bWater);
    const handle = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.008, 4, 14, Math.PI), this.mat.iron);
    handle.position.y = 0.3;
    handle.rotation.y = 0.5;
    bucket.add(handle);
    g.add(bucket);

    // Tackle box
    const tb = new THREE.Group();
    tb.position.set(-0.52, ICE_Y, -0.62);
    tb.rotation.y = 0.4;
    const tbBody = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.13, 0.17), new THREE.MeshStandardMaterial({ color: 0x3c7f8a, roughness: 0.6 }));
    tbBody.position.y = 0.065;
    tb.add(tbBody);
    const tbLid = new THREE.Mesh(new THREE.BoxGeometry(0.31, 0.035, 0.18), new THREE.MeshStandardMaterial({ color: 0x2f6872, roughness: 0.6 }));
    tbLid.position.y = 0.145;
    tb.add(tbLid);
    const tbHandle = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.025, 0.025), this.mat.iron);
    tbHandle.position.y = 0.175;
    tb.add(tbHandle);
    g.add(tb);

    // Small candle lantern on the ice by the stool
    const cl = new THREE.Group();
    cl.position.set(-1.02, ICE_Y, -0.36);
    const clGlass = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.15, 0.11), this.mat.lantern);
    clGlass.position.y = 0.1;
    cl.add(clGlass);
    const clCap = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.08, 4), this.mat.iron);
    clCap.position.y = 0.215;
    clCap.rotation.y = Math.PI / 4;
    cl.add(clCap);
    const clBase = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.025, 0.13), this.mat.iron);
    clBase.position.y = 0.0125;
    cl.add(clBase);
    const clRing = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.006, 4, 8), this.mat.iron);
    clRing.position.y = 0.27;
    cl.add(clRing);
    g.add(cl);
    this.world._addLanternHalo(g, -1.02, 0.12, -0.36, 0.7, 0.5);
    this._add(g, false, true);
    this._addGlowPool(H.x - 1.0, H.z - 0.2, 1.3, 0.4);

    // A fish that leaps out of the hole on a catch, then dives back (catch & release).
    // One little low-poly fish, re-shaped and re-coloured for whichever species bit.
    const fish = new THREE.Group();
    this.fishBodyMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.42, metalness: 0.18, flatShading: true });
    this.fishFinMat = new THREE.MeshStandardMaterial({ color: 0x9fb8cc, roughness: 0.6, side: THREE.DoubleSide, flatShading: true });
    const eyeMat = new THREE.MeshStandardMaterial({ color: 0x15161c, roughness: 0.2 });
    const glintMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    this.fishParts = {
      body: new THREE.Mesh(new THREE.BufferGeometry(), this.fishBodyMat),
      tail: new THREE.Mesh(new THREE.BufferGeometry(), this.fishFinMat),
      dorsal: new THREE.Mesh(new THREE.BufferGeometry(), this.fishFinMat),
      eyeL: new THREE.Mesh(new THREE.IcosahedronGeometry(0.014, 0), eyeMat),
      eyeR: new THREE.Mesh(new THREE.IcosahedronGeometry(0.014, 0), eyeMat),
      glintL: new THREE.Mesh(new THREE.IcosahedronGeometry(0.005, 0), glintMat),
      glintR: new THREE.Mesh(new THREE.IcosahedronGeometry(0.005, 0), glintMat),
    };
    for (const m of Object.values(this.fishParts)) fish.add(m);
    fish.visible = false;
    fish.position.set(H.x, 0.1, H.z);
    this.group.add(fish);
    this.fishMesh = fish;
    this._paintLeapingFish(FISH[0], 9);

    this._circle(H.x, H.z, 0.44);
    this._circle(H.x - 0.8, H.z + 0.12, 0.22);
    this._circle(H.x + 0.72, H.z + 0.52, 0.2);
  }

  // ===================================================================
  //  9. Tiny ice-fishing hut (door faces the hole, warm window faces the camera)
  // ===================================================================
  _buildFishingHut() {
    const { x, z, w, d, h } = HUT;
    const g = new THREE.Group();
    g.position.set(x, ICE_Y, z);
    const wallTex = (this.textures.barnWood || this.textures.woodPlank).clone();
    wallTex.repeat.set(1.5, 1);
    wallTex.needsUpdate = true;
    const wallMat = new THREE.MeshStandardMaterial({ map: wallTex, color: 0xd9a07a, roughness: 0.9 });
    const walls = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wallMat);
    walls.position.y = h / 2;
    walls.castShadow = true;
    walls.receiveShadow = true;
    g.add(walls);
    // Gable ends (a box rotated 45° pokes a triangle above the walls)
    const gs = d / Math.SQRT2;
    const gable = new THREE.Mesh(new THREE.BoxGeometry(w - 0.02, gs, gs), wallMat);
    gable.position.y = h;
    gable.rotation.x = Math.PI / 4;
    g.add(gable);
    // Roof slabs + snow
    const roofTex = this.textures.roofShingles.clone();
    roofTex.repeat.set(1.2, 0.8);
    roofTex.needsUpdate = true;
    const roofMat = new THREE.MeshStandardMaterial({ map: roofTex, color: 0x9a5b45, roughness: 0.85 });
    const slabLen = (d / 2) * Math.SQRT2 + 0.24;
    for (const sgn of [-1, 1]) {
      const slab = new THREE.Mesh(new THREE.BoxGeometry(w + 0.3, 0.07, slabLen), roofMat);
      slab.rotation.x = sgn * (Math.PI / 4);
      slab.position.set(0, h + d / 4 + 0.02, sgn * (d / 4 + 0.02));
      slab.castShadow = true;
      g.add(slab);
      const sn = new THREE.Mesh(new THREE.BoxGeometry(w + 0.32, 0.07, slabLen - 0.04), this.mat.snow);
      sn.rotation.x = sgn * (Math.PI / 4);
      sn.position.set(0, h + d / 4 + 0.075, sgn * (d / 4 + 0.075));
      g.add(sn);
    }
    // Stovepipe
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.6, 8), this.mat.iron);
    pipe.position.set(0.48, h + 0.55, -0.22);
    g.add(pipe);
    const pipeCap = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.08, 8), this.mat.iron);
    pipeCap.position.set(0.48, h + 0.9, -0.22);
    g.add(pipeCap);
    this.hutChimneyTop = new THREE.Vector3(x + 0.48, ICE_Y + h + 0.98, z - 0.22);
    // Door on the west wall
    const door = new THREE.Mesh(new THREE.BoxGeometry(0.04, 1.05, 0.62), new THREE.MeshStandardMaterial({ map: this.textures.woodDoor, roughness: 0.9 }));
    door.position.set(-w / 2 - 0.015, 0.54, 0.05);
    g.add(door);
    const knob = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.05, 0.05), new THREE.MeshStandardMaterial({ color: 0xd4a640, roughness: 0.4, metalness: 0.7 }));
    knob.position.set(-w / 2 - 0.045, 0.55, 0.28);
    g.add(knob);
    // Warm window on the south wall (registered as a world window -> glows at night)
    const winMat = new THREE.MeshStandardMaterial({
      map: this.textures.windowWarm,
      emissive: new THREE.Color(0xffa94a),
      emissiveMap: this.textures.windowWarm,
      emissiveIntensity: 0.3,
      roughness: 0.4,
    });
    this.world.windowMaterials.push(winMat);
    const win = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.36, 0.03), winMat);
    win.position.set(-0.2, 0.86, d / 2 + 0.01);
    g.add(win);
    for (const [fx, fy, fw, fh] of [[-0.2, 1.06, 0.52, 0.05], [-0.2, 0.66, 0.52, 0.05], [-0.45, 0.86, 0.05, 0.42], [0.05, 0.86, 0.05, 0.42], [-0.2, 0.86, 0.03, 0.36]]) {
      const fr = new THREE.Mesh(new THREE.BoxGeometry(fw, fh, 0.05), this.mat.darkWood);
      fr.position.set(fx, fy, d / 2 + 0.02);
      g.add(fr);
    }
    const sill = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.04, 0.1), this.mat.snow);
    sill.position.set(-0.2, 0.655, d / 2 + 0.06);
    g.add(sill);
    // Icicles along the south eave
    const icicles = [];
    const eaveZ = z + d / 2 + 0.1;
    const eaveY = ICE_Y + h - 0.09;
    for (let i = 0; i < 9; i++) {
      const ix = x - w / 2 - 0.08 + (i + 0.5) * ((w + 0.16) / 9);
      const len = 0.08 + ((i * 7) % 5) * 0.035;
      icicles.push({ m: composeM(ix, eaveY - len / 2, eaveZ, Math.PI, 0, 0, 1, len / 0.2, 1) });
    }
    this._instanced(new THREE.ConeGeometry(0.022, 0.2, 4), this.mat.iceShard, icicles, false, false);
    // Firewood stacked by the east wall
    const logGeo = new THREE.CylinderGeometry(0.07, 0.07, 0.6, 6);
    for (const [ly, lz] of [[0.07, -0.26], [0.07, -0.1], [0.07, 0.06], [0.2, -0.18], [0.2, -0.02], [0.33, -0.1]]) {
      const lg = new THREE.Mesh(logGeo, [this.mat.bark, this.mat.endGrain, this.mat.endGrain]);
      lg.rotation.z = Math.PI / 2;
      lg.rotation.y = Math.PI / 2;
      lg.position.set(w / 2 + 0.1, ly, lz);
      g.add(lg);
    }
    const woodSnow = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.035, 0.5), this.mat.snow);
    woodSnow.position.set(w / 2 + 0.1, 0.41, -0.1);
    g.add(woodSnow);
    this._add(g, false, true);
    // Snow drifted against the north wall
    const dr = new THREE.Mesh(this.geo.driftA, this.mat.drift);
    dr.scale.set(1.1, 0.22, 0.45);
    dr.position.set(x, ICE_Y - 0.01, z - d / 2 - 0.15);
    this._add(dr, false, true);
    this._boxC(x + 0.06, z, w + 0.32, d + 0.12);
    this._addGlowPool(x - 0.2, z + d / 2 + 0.9, 1.6, 0.32);

    // Chimney smoke (desktop only)
    if (!this.mobile && this.textures.smokePuff) {
      for (let i = 0; i < 4; i++) {
        const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.textures.smokePuff, color: 0xe4e8ee, transparent: true, opacity: 0, depthWrite: false }));
        this.group.add(sp);
        this.smokePuffs.push({ sprite: sp, phase: i / 4 });
      }
    }
  }

  // ===================================================================
  //  10. Shore extras: snowman in a beanie, a red sled
  // ===================================================================
  _buildShoreExtras() {
    // Snowman (yard style, smaller, knit beanie & blue scarf, holding a twig "fishing rod")
    const sm = new THREE.Group();
    sm.position.set(SNOWMAN.x, 0, SNOWMAN.z);
    sm.rotation.y = 0.75; // looks out over the lake toward the camera side
    const snowBody = new THREE.MeshStandardMaterial({ color: 0xf7fbff, roughness: 0.85 });
    const parts = [
      [0.4, 0.46, 0.64, 0.32],
      [0.29, 0.35, 0.5, 0.86],
      [0.22, 0.24, 0.4, 1.3],
    ];
    for (const [rt, rb, hh, y] of parts) {
      const p = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, hh, 8), snowBody);
      p.position.y = y;
      p.castShadow = true;
      sm.add(p);
    }
    const scarfMat = new THREE.MeshStandardMaterial({ color: 0x3f72b8, roughness: 0.9 });
    const scarf = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.27, 0.11, 8), scarfMat);
    scarf.position.y = 1.12;
    sm.add(scarf);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.34, 0.05), scarfMat);
    tail.position.set(-0.16, 0.95, 0.25);
    tail.rotation.z = 0.2;
    sm.add(tail);
    // Knit beanie with a pom-pom
    const beanie = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.235, 0.22, 8), this.mat.red);
    beanie.position.y = 1.58;
    beanie.rotation.z = 0.12;
    sm.add(beanie);
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.245, 0.245, 0.07, 8), this.mat.cream);
    brim.position.y = 1.49;
    brim.rotation.z = 0.12;
    sm.add(brim);
    const pom = new THREE.Mesh(new THREE.DodecahedronGeometry(0.075, 0), this.mat.cream);
    pom.position.set(-0.04, 1.73, 0);
    sm.add(pom);
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.24, 5), new THREE.MeshStandardMaterial({ color: 0xf27a24 }));
    nose.rotation.x = Math.PI / 2;
    nose.position.set(0, 1.3, 0.3);
    sm.add(nose);
    const coal = new THREE.MeshBasicMaterial({ color: 0x1e2028 });
    for (const ex of [-0.085, 0.085]) {
      const eye = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.04), coal);
      eye.position.set(ex, 1.38, 0.21);
      sm.add(eye);
    }
    for (const [mx, my] of [[-0.09, 1.22], [-0.03, 1.2], [0.03, 1.2], [0.09, 1.22]]) {
      const mo = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, 0.03), coal);
      mo.position.set(mx, my, 0.215);
      sm.add(mo);
    }
    for (const by of [0.78, 0.93]) {
      const btn = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.04), coal);
      btn.position.set(0, by, 0.32);
      sm.add(btn);
    }
    const twigL = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.05, 0.05), this.mat.darkWood);
    twigL.position.set(-0.44, 0.98, 0);
    twigL.rotation.z = -0.35;
    sm.add(twigL);
    const twigR = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.05, 0.05), this.mat.darkWood);
    twigR.position.set(0.42, 1.04, 0.04);
    twigR.rotation.z = 0.5;
    sm.add(twigR);
    // the "rod": a long thin twig held out toward the lake with a dangling line
    const rod = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.95, 0.025), this.mat.darkWood);
    rod.position.set(0.66, 1.38, 0.2);
    rod.rotation.set(0.5, 0, -0.55);
    sm.add(rod);
    const smLine = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.6, 0.008), this.mat.cream);
    smLine.position.set(1.0, 1.42, 0.5);
    sm.add(smLine);
    const smBob = new THREE.Mesh(new THREE.SphereGeometry(0.035, 6, 4), this.mat.red);
    smBob.position.set(1.0, 1.1, 0.5);
    sm.add(smBob);
    const base = new THREE.Mesh(this.geo.snowCushion, this.mat.instSnow);
    base.scale.set(0.62, 0.12, 0.56);
    sm.add(base);
    this._add(sm, false, true);
    this.snowmanGroup = sm;
    this._circle(SNOWMAN.x, SNOWMAN.z, 0.48);

    // Red wooden sled resting on the shore, nose toward the ice, tow rope trailing
    const sled = new THREE.Group();
    sled.position.set(SLED.x, 0, SLED.z);
    sled.rotation.y = 0.25;
    const sledRed = new THREE.MeshStandardMaterial({ color: 0xb8402f, roughness: 0.75 });
    for (const sx of [-0.24, 0.24]) {
      const runner = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 1.0), this.mat.iron);
      runner.position.set(sx, 0.03, 0);
      sled.add(runner);
      const curl = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.02, 4, 8, Math.PI), this.mat.iron);
      curl.rotation.y = Math.PI / 2;
      curl.position.set(sx, 0.12, 0.5);
      curl.rotation.z = Math.PI / 2;
      sled.add(curl);
      for (const sz of [-0.3, 0.1]) {
        const strut = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.14, 0.035), this.mat.darkWood);
        strut.position.set(sx, 0.11, sz);
        sled.add(strut);
      }
    }
    for (const sz of [-0.32, -0.12, 0.08, 0.28]) {
      const slat = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.035, 0.15), sledRed);
      slat.position.set(0, 0.2, sz);
      slat.castShadow = true;
      sled.add(slat);
    }
    const sledSnow = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.03, 0.3), this.mat.snow);
    sledSnow.position.set(0.06, 0.232, -0.18);
    sled.add(sledSnow);
    const rope = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.02, 0.62), this.mat.rope);
    rope.position.set(0.05, 0.03, -0.78);
    rope.rotation.y = 0.35;
    sled.add(rope);
    this._add(sled, false, true);
    this._boxC(SLED.x, SLED.z, 0.82, 1.18);
  }

  // ===================================================================
  //  11. Animal tracks in the snow (fox across the trail, rabbit by the lake, birds at the pier)
  // ===================================================================
  _buildFootprints() {
    const rnd = createMulberry(2718);
    const prints = [];
    const add = (x, z, rx, rz, yaw) => {
      if (iceK(x, z) < 1.04) return; // no prints on the ice / bank lip
      prints.push({ m: composeM(x, 0.007, z, 0, yaw, 0, rx, 1, rz) });
    };
    // Fox: neat single-file line crossing the trail
    {
      const s = 10.9;
      for (let lat = -5.2; lat <= 5.2; lat += 0.34) {
        if (Math.abs(lat) < 0.7) continue; // the stones themselves stay clear
        const wig = Math.sin(lat * 0.8) * 0.5;
        const p = this._trailAt(s + wig, lat);
        const side = Math.round(lat / 0.34) % 2 === 0 ? 1 : -1;
        add(p.x + p.dx * side * 0.05, p.z + p.dz * side * 0.05, 0.045, 0.06, p.yaw + Math.PI / 2);
      }
    }
    // Rabbit: hop groups along the west shore (two long hind feet ahead, two small fore feet behind)
    for (let a = 150; a <= 215; a += 5.5) {
      const p = shorePoint(a * DEG, 0.88 + Math.sin(a * 0.2) * 0.02);
      const q = shorePoint((a + 1) * DEG, 0.88);
      const dx = q.x - p.x;
      const dz = q.z - p.z;
      const l = Math.hypot(dx, dz) || 1;
      const fx = dx / l;
      const fz = dz / l;
      const yaw = Math.atan2(fx, fz);
      add(p.x - fz * 0.07 + fx * 0.12, p.z + fx * 0.07 + fz * 0.12, 0.035, 0.085, yaw);
      add(p.x + fz * 0.07 + fx * 0.12, p.z - fx * 0.07 + fz * 0.12, 0.035, 0.085, yaw);
      add(p.x - fx * 0.12, p.z - fz * 0.12, 0.03, 0.035, yaw);
      add(p.x - fx * 0.26 + fz * 0.02, p.z - fz * 0.26 - fx * 0.02, 0.03, 0.035, yaw);
    }
    // Little birds pottering about near the pier's landing
    for (let i = 0; i < 16; i++) {
      const x = DOCK.x - 1.3 - rnd() * 1.4;
      const z = 33.0 + rnd() * 1.7;
      add(x, z, 0.022, 0.03, rnd() * Math.PI);
      add(x + 0.05, z + 0.03, 0.022, 0.03, rnd() * Math.PI);
    }
    const geo = new THREE.CircleGeometry(1, 7);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshStandardMaterial({
      color: 0xbdd0e4,
      roughness: 1,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });
    this._instanced(geo, mat, prints, false, true);
  }

  // ===================================================================
  //  12. Desktop-only delights: pressure ridge, sun glints, skating sparkles & slide marks
  // ===================================================================
  _buildIceDelights() {
    const rnd = createMulberry(1357);
    // Pressure ridge: a crooked seam of pushed-up ice shards in the south-west of the lake
    const a = { x: -14.6, z: 44.4 };
    const b = { x: -10.4, z: 47.3 };
    const shards = [];
    const n = 18;
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      const bend = Math.sin(t * Math.PI) * 0.35;
      const x = a.x + (b.x - a.x) * t - bend * 0.5 + (rnd() - 0.5) * 0.1;
      const z = a.z + (b.z - a.z) * t + bend + (rnd() - 0.5) * 0.1;
      const yaw = Math.atan2(b.x - a.x, b.z - a.z) + (rnd() - 0.5) * 0.7;
      const hgt = 0.06 + rnd() * 0.08;
      shards.push({ m: composeM(x, ICE_Y + hgt * 0.3, z, (rnd() - 0.5) * 0.9, yaw, (rnd() - 0.5) * 0.5, 0.22 + rnd() * 0.2, hgt, 0.05 + rnd() * 0.05) });
    }
    this._instanced(this.geo.box, this.mat.iceShard, shards, false, true);
    const ridgeSnow = new THREE.Mesh(this.geo.driftB, this.mat.drift);
    ridgeSnow.scale.set(2.5, 0.04, 0.34);
    ridgeSnow.position.set((a.x + b.x) / 2 + 0.25, ICE_Y - 0.005, (a.z + b.z) / 2 + 0.4);
    ridgeSnow.rotation.y = Math.atan2(b.x - a.x, b.z - a.z) + Math.PI / 2;
    this._add(ridgeSnow, false, true);

    // Small 4-point star texture for glints & sparkles
    const cv = makeCanvas(16, 16);
    let starTex = null;
    if (cv) {
      const c = cv.getContext("2d");
      c.fillStyle = "rgba(255,255,255,0.55)";
      c.fillRect(7, 2, 2, 12);
      c.fillRect(2, 7, 12, 2);
      c.fillStyle = "rgba(255,255,255,1)";
      c.fillRect(7, 5, 2, 6);
      c.fillRect(5, 7, 6, 2);
      starTex = new THREE.CanvasTexture(cv);
      starTex.magFilter = THREE.NearestFilter;
      starTex.colorSpace = THREE.SRGBColorSpace;
    }
    // Sun glints twinkling on the ice (3 groups out of phase)
    for (let gI = 0; gI < 3; gI++) {
      const pts = [];
      for (let i = 0; i < 7; i++) {
        const ang = rnd() * Math.PI * 2;
        const k = Math.sqrt(rnd()) * 0.9;
        const p = icePoint(ang, k);
        pts.push(p.x, ICE_Y + 0.06, p.z);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
      const mat = new THREE.PointsMaterial({
        map: starTex,
        color: 0xf4fbff,
        size: 0.22,
        sizeAttenuation: true,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      const pts3 = new THREE.Points(geo, mat);
      this.group.add(pts3);
      this.twinkles.push({ mat, phase: gI * 2.1, speed: 0.9 + gI * 0.35 });
    }
    // Sparkles kicked up when walking on the ice
    for (let i = 0; i < 10; i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: starTex, color: 0xeaf8ff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
      sp.visible = false;
      sp.scale.set(0.12, 0.12, 1);
      this.group.add(sp);
      this.sparkles.push({ sprite: sp, age: 1, life: 0.6, vx: 0, vy: 0, vz: 0 });
    }
    this._sparkIdx = 0;
    // Faint slide marks left on the ice behind the player (ring buffer, they fade over ~25 s)
    const markGeo = new THREE.PlaneGeometry(0.035, 0.4);
    markGeo.rotateX(-Math.PI / 2);
    const marks = new THREE.InstancedMesh(markGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.32, depthWrite: false }), 64);
    const zero = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < 64; i++) marks.setMatrixAt(i, zero);
    marks.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    marks.frustumCulled = false;
    marks.renderOrder = 1;
    this.group.add(marks);
    this.slideMarks = { mesh: marks, list: Array.from({ length: 64 }, () => ({ x: 0, z: 0, yaw: 0, age: 99 })), idx: 0, refresh: 0 };
  }

  // ===================================================================
  //  Interface: surface height & material
  // ===================================================================
  getSurface(x, z) {
    if (z < 32.0 || z > 52.2 || x < -21.6 || x > 3.6) return null;
    // Pier deck & landing step
    if (Math.abs(x - DOCK.x) <= DOCK.hw + 0.02 && z >= DOCK.stepZ0 && z <= DOCK.z1 + 0.06) {
      return { y: z < DOCK.z0 ? DOCK.stepTop : DOCK.top, surface: "wood" };
    }
    const k = iceK(x, z);
    if (k < 1.0) return { y: ICE_Y, surface: "stone" };
    if (k < RIM_K[RIM_K.length - 1]) return { y: rimHeight(k), surface: "snow" };
    return null;
  }

  // ===================================================================
  //  Interface: per-frame animation
  // ===================================================================
  update(dt, elapsed, nightFactor, playerPos, lampGlow) {
    // Warm lantern / window reflections on the ice
    for (const gp of this.glowPools) gp.mat.opacity = lampGlow * gp.gain;

    const px = playerPos.x;
    const pz = playerPos.z;
    const near = pz > 8;
    const moved = Math.hypot(px - this._lastPX, pz - this._lastPZ);
    const speed = dt > 0 ? moved / dt : 0;
    this._lastPX = px;
    this._lastPZ = pz;

    this._updateFishing(dt, elapsed);
    if (!near) return;

    // Robin on the fallen log
    const r = this.robin;
    if (r) {
      r.cool = Math.max(0, r.cool - dt);
      const lg = r.logGroup.position;
      const dist = Math.hypot(px - lg.x, pz - lg.z);
      if (r.hopT < 0 && r.cool <= 0 && dist < 2.6) {
        r.hopT = 0;
        r.cool = 5;
      }
      if (r.hopT >= 0) {
        r.hopT += dt / 0.5;
        const from = r.ends[r.at];
        const to = r.ends[1 - r.at];
        const t = Math.min(1, r.hopT);
        r.mesh.position.x = from + (to - from) * t;
        r.mesh.position.y = 0.43 + Math.sin(t * Math.PI) * 0.22;
        r.mesh.rotation.y = to > from ? 1.3 : -1.6;
        if (t >= 1) {
          r.at = 1 - r.at;
          r.hopT = -1;
          r.mesh.rotation.y = r.at === 1 ? -0.7 : 0.6;
        }
      } else {
        // idle: little head tilts & pecks
        r.peckT -= dt;
        if (r.peckT < 0) r.peckT = 1.6 + ((elapsed * 7.3) % 2.2);
        const peck = r.peckT < 0.25 ? Math.sin((r.peckT / 0.25) * Math.PI) * 0.6 : 0;
        r.head.rotation.x = peck;
        r.head.rotation.z = Math.sin(elapsed * 1.3) * 0.18;
        r.mesh.position.y = 0.43 + Math.abs(Math.sin(elapsed * 2.1)) * 0.004;
      }
    }

    if (pz < 26) return; // everything below only matters near the lake

    // Hut chimney smoke
    for (const s of this.smokePuffs) {
      const t = (elapsed * 0.22 + s.phase) % 1;
      s.sprite.position.set(this.hutChimneyTop.x + t * 0.5 + Math.sin(elapsed + s.phase * 6) * 0.06, this.hutChimneyTop.y + t * 1.5, this.hutChimneyTop.z - t * 0.2);
      const sc = 0.22 + t * 0.6;
      s.sprite.scale.set(sc, sc, 1);
      s.sprite.material.opacity = Math.sin(t * Math.PI) * 0.32;
    }

    // Glints on the ice (bright by day, faint starlight at night)
    for (const tw of this.twinkles) {
      const w = 0.5 + 0.5 * Math.sin(elapsed * tw.speed + tw.phase);
      tw.mat.opacity = Math.pow(w, 4) * (0.85 - 0.55 * lampGlow);
    }

    // Pier planks dip under your feet
    const dp = this.dockPlanks;
    if (dp) {
      const onDock = Math.abs(px - DOCK.x) <= DOCK.hw && pz >= DOCK.z0 && pz <= DOCK.z1;
      let changed = false;
      for (let i = 0; i < dp.list.length; i++) {
        const pl = dp.list[i];
        let target = 0;
        if (onDock) {
          const dz = Math.abs(pz - pl.z);
          if (dz < 0.45) target = -0.02 * Math.cos((dz / 0.45) * Math.PI * 0.5);
        }
        const nf = pl.flex + (target - pl.flex) * Math.min(1, dt * 14);
        if (Math.abs(nf - pl.flex) > 0.00005) {
          pl.flex = nf;
          dp.mesh.setMatrixAt(i, composeM(pl.ox, pl.y + pl.flex, pl.z, 0, pl.yaw, 0, 1, 1, 1));
          changed = true;
        }
      }
      if (changed) dp.mesh.instanceMatrix.needsUpdate = true;
    }

    // Ice sparkles & slide marks while walking on the ice
    const onIce = iceK(px, pz) < 0.98 && !(Math.abs(px - DOCK.x) <= DOCK.hw && pz <= DOCK.z1);
    if (this.sparkles.length) {
      if (onIce && speed > 1.2 && moved < 1) {
        this._sparkTimer -= dt;
        if (this._sparkTimer <= 0) {
          this._sparkTimer = 0.09;
          const sp = this.sparkles[this._sparkIdx];
          this._sparkIdx = (this._sparkIdx + 1) % this.sparkles.length;
          const ang = elapsed * 37.1;
          sp.sprite.position.set(px + Math.cos(ang) * 0.18, ICE_Y + 0.05, pz + Math.sin(ang) * 0.18);
          sp.vx = Math.cos(ang) * 0.25;
          sp.vz = Math.sin(ang) * 0.25;
          sp.vy = 0.5 + ((ang * 13) % 1) * 0.3;
          sp.age = 0;
          sp.sprite.visible = true;
        }
      }
      for (const sp of this.sparkles) {
        if (!sp.sprite.visible) continue;
        sp.age += dt;
        if (sp.age >= sp.life) {
          sp.sprite.visible = false;
          continue;
        }
        sp.sprite.position.x += sp.vx * dt;
        sp.sprite.position.y += sp.vy * dt;
        sp.sprite.position.z += sp.vz * dt;
        const t = sp.age / sp.life;
        sp.sprite.material.opacity = Math.sin(t * Math.PI) * 0.9;
        const sc = 0.13 * (1 - t * 0.5);
        sp.sprite.scale.set(sc, sc, 1);
      }
    }
    const sm = this.slideMarks;
    if (sm) {
      if (onIce && speed > 1.2 && moved < 1) {
        this._markTimer -= dt;
        if (this._markTimer <= 0) {
          this._markTimer = 0.16;
          const dx = (px - this._prevMarkX) || 0;
          const dz = (pz - this._prevMarkZ) || 0;
          const yaw = Math.atan2(dx, dz);
          this._markSide = -this._markSide;
          const ox = Math.cos(yaw) * 0.1 * this._markSide;
          const oz = -Math.sin(yaw) * 0.1 * this._markSide;
          const mk = sm.list[sm.idx];
          sm.idx = (sm.idx + 1) % sm.list.length;
          mk.x = px + ox;
          mk.z = pz + oz;
          mk.yaw = yaw;
          mk.age = 0;
          sm.refresh = 0;
        }
      }
      this._prevMarkX = px;
      this._prevMarkZ = pz;
      sm.refresh -= dt;
      if (sm.refresh <= 0) {
        sm.refresh = 0.25;
        const life = 25;
        for (let i = 0; i < sm.list.length; i++) {
          const mk = sm.list[i];
          if (mk.age > life + 1) continue;
          mk.age += 0.25;
          const f = Math.max(0, 1 - mk.age / life);
          sm.mesh.setMatrixAt(i, composeM(mk.x, ICE_Y + 0.006, mk.z, 0, mk.yaw, 0, f, 1, 0.4 + 0.6 * f));
        }
        sm.mesh.instanceMatrix.needsUpdate = true;
      }
    }
  }

  _updateFishing(dt, elapsed) {
    const f = this.fish;
    if (f.cooldown > 0) f.cooldown = Math.max(0, f.cooldown - dt);
    let bobY = ICE_Y + 0.025 + Math.sin(elapsed * 1.8) * 0.006;
    if (f.state === "wait") {
      f.timer -= dt;
      // nibbles: small twitches
      bobY += Math.max(0, Math.sin(elapsed * 9)) * 0.008 * (f.timer < 0.8 ? 1 : 0.3);
      if (f.timer <= 0) {
        f.state = "bite";
        f.timer = 0.45;
        if (f.ctx) f.ctx.emote(HOLE.x, HOLE.z, "exclaim", 1.35);
      }
    } else if (f.state === "bite") {
      f.timer -= dt;
      bobY -= 0.05 * Math.sin(Math.min(1, (0.45 - f.timer) / 0.15) * Math.PI * 0.5);
      if (f.timer <= 0) this._resolveCatch();
    }
    if (f.state === "idle" && f.cooldown <= 0 && this._fishIt.label !== "在冰洞旁冰钓一会儿") this._fishIt.label = "在冰洞旁冰钓一会儿";
    this.bobber.position.y = bobY;
    // keep the line attached to the bobber
    const lp = this.fishLine.geometry.attributes.position;
    lp.setY(1, bobY + 0.04);
    lp.needsUpdate = true;

    // Leaping fish (out of the hole, a twist in the air, back in with a splash)
    if (f.jumpT >= 0) {
      f.jumpT += dt / 1.25;
      const t = Math.min(1, f.jumpT);
      const fm = this.fishMesh;
      fm.visible = true;
      fm.position.set(HOLE.x + 0.12 * Math.sin(t * Math.PI), 0.08 + Math.sin(t * Math.PI) * 1.15, HOLE.z + 0.1 * t);
      fm.rotation.set(-Math.PI / 2 + t * Math.PI, t * 1.6, Math.sin(elapsed * 20) * 0.25);
      if (t >= 1) {
        fm.visible = false;
        f.jumpT = -1;
        if (f.ctx) {
          f.ctx.burst(HOLE.x, 0.12, HOLE.z, 0x9fdcff, 10, 1.4);
          f.ctx.sound.waterSplash();
        }
      }
    }
  }

  // Shape and colour the leaping fish for one species (lathe body, flat fins, beady eyes)
  _paintLeapingFish(def, cm) {
    const P = this.fishParts;
    const L = def.shape === "long" ? 0.42 : def.shape === "round" ? 0.26 : def.shape === "shrimp" ? 0.16 : 0.32;
    const R = def.shape === "round" ? 0.085 : def.shape === "long" ? 0.05 : def.shape === "shrimp" ? 0.035 : 0.058;
    // profile from tail (y = 0) to nose (y = L), fuller towards the head
    const prof = [];
    const N = 7;
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      const r = i === 0 ? R * 0.22 : i === N ? 0.0001 : R * Math.pow(Math.sin(Math.PI * Math.pow(t, 0.8)), 0.75);
      prof.push(new THREE.Vector2(r, t * L));
    }
    let geo = new THREE.LatheGeometry(prof, 8);
    geo.rotateX(Math.PI / 2); // nose along +z
    geo.translate(0, 0, -L * 0.45);
    geo.scale(0.62, 1, 1); // flattened sideways like a real fish
    geo = geo.toNonIndexed();
    geo.computeVertexNormals();
    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const cBody = new THREE.Color(def.body);
    const cBelly = new THREE.Color(def.belly);
    const cStripe = def.stripe ? new THREE.Color(def.stripe) : null;
    const cSpot = def.spots ? new THREE.Color(def.spots) : null;
    const tmp = new THREE.Color();
    for (let i = 0; i < pos.count; i += 3) {
      // colour per triangle so the low-poly facets read crisply
      const y = (pos.getY(i) + pos.getY(i + 1) + pos.getY(i + 2)) / 3;
      const z = (pos.getZ(i) + pos.getZ(i + 1) + pos.getZ(i + 2)) / 3;
      const k = y / R;
      tmp.copy(k < -0.15 ? cBelly : cBody);
      if (cStripe && Math.abs(k + 0.02) < 0.32) tmp.copy(cStripe);
      if (cSpot && k > 0.05 && ((i / 3) * 7) % 5 < 1) tmp.copy(cSpot);
      if (z > L * 0.38) tmp.multiplyScalar(0.92); // head a touch darker
      for (let j = 0; j < 3; j++) tmp.toArray(colors, (i + j) * 3);
    }
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    P.body.geometry.dispose();
    P.body.geometry = geo;

    // forked tail and a little dorsal fin
    const tail = new THREE.Shape();
    const tl = L * 0.32;
    tail.moveTo(0, 0);
    tail.lineTo(-tl, R * 1.15);
    tail.lineTo(-tl * 0.72, 0);
    tail.lineTo(-tl, -R * 1.15);
    tail.lineTo(0, 0);
    const tg = new THREE.ShapeGeometry(tail);
    tg.rotateY(-Math.PI / 2); // shape x -> z, so the negative x of the fork trails behind
    tg.translate(0, 0, -L * 0.45 + 0.004);
    P.tail.geometry.dispose();
    P.tail.geometry = def.shape === "shrimp" ? new THREE.BufferGeometry() : tg;
    const dor = new THREE.Shape();
    dor.moveTo(0, 0);
    dor.lineTo(-L * 0.16, R * 0.75);
    dor.lineTo(-L * 0.26, 0);
    dor.lineTo(0, 0);
    const dg = new THREE.ShapeGeometry(dor);
    dg.rotateY(-Math.PI / 2);
    dg.translate(0, R * 0.82, L * 0.08);
    P.dorsal.geometry.dispose();
    P.dorsal.geometry = def.shape === "shrimp" ? new THREE.BufferGeometry() : dg;
    this.fishFinMat.color.set(def.fin);
    this.fishBodyMat.emissive.setHex(def.rare ? 0x553800 : 0x000000);

    const ez = L * 0.34;
    const ex = R * 0.36;
    const ey = R * 0.16;
    P.eyeL.position.set(ex, ey, ez);
    P.eyeR.position.set(-ex, ey, ez);
    P.glintL.position.set(ex + 0.008, ey + 0.006, ez + 0.006);
    P.glintR.position.set(-ex - 0.008, ey + 0.006, ez + 0.006);
    // bigger catches look a bit bigger (clamped so the old pike still fits the hole)
    const sc = THREE.MathUtils.clamp(0.75 + (cm || 10) / 60, 0.8, 1.9);
    this.fishMesh.scale.setScalar(sc);
  }

  _resolveCatch() {
    const f = this.fish;
    const ctx = f.ctx;
    f.state = "idle";
    f.cooldown = 3.2;
    this._fishIt.label = "把鱼线重新理好……";
    if (!ctx) return;
    const hours = ctx.timeHours ?? 12;
    const snow = ctx.snowLevel ?? 1;
    const book = ctx.journal;
    let c;
    const r = Math.random();
    if (r < 0.03) {
      c = BOTTLE_CATCH;
    } else if (r < 0.22) {
      const pool = JUNK_CATCHES.filter((j) => j !== f.last);
      c = pool[Math.floor(Math.random() * pool.length)];
    } else {
      // Fish that swim at this hour in this weather; ones the book is still missing bite a bit more
      const avail = FISH.filter((x) => fishAvailable(x, hours, snow));
      let sum = 0;
      const w = avail.map((x) => {
        let k = x.weight * (book && !book.has("fish", x.id) ? 1.6 : 1) * (x.id === f.lastFishId ? 0.5 : 1);
        sum += k;
        return k;
      });
      let roll = Math.random() * sum;
      let pick = avail[avail.length - 1];
      for (let i = 0; i < avail.length; i++) {
        roll -= w[i];
        if (roll <= 0) {
          pick = avail[i];
          break;
        }
      }
      f.lastFishId = pick.id;
      // sizes lean small; now and then a big one
      const t = Math.pow(Math.random(), 1.6);
      const cm = Math.round(pick.size[0] + (pick.size[1] - pick.size[0]) * t);
      c = { fishDef: pick, name: pick.name, cm, rare: !!pick.rare, color: pick.rare ? "#ffd34d" : "#dff1ff", text: pick.line };
    }
    f.last = c;
    if (ctx.day !== f.day) {
      f.day = ctx.day;
      f.count = 0;
    }
    f.count++;

    ctx.sound.waterSplash();
    ctx.burst(HOLE.x, 0.15, HOLE.z, c.rare ? 0xffd34d : 0x9fdcff, c.rare ? 18 : 12, 1.7);
    ctx.popup(HOLE.x, 1.3, HOLE.z, c.empty ? "空钩……" : c.cm ? `钓到了 ${c.name}! ${c.cm} 厘米` : `钓到了 ${c.name}!`, c.color);
    let msg = c.text;
    if (c.fishDef) {
      msg += c.fishDef.shape === "shrimp" ? " 放它回去找妈妈吧。" : " 量了量有 " + c.cm + " 厘米，又轻轻放回湖里啦。";
      if (book) {
        const res = book.discover("fish", c.fishDef.id);
        const record = book.recordFishSize(c.fishDef.id, c.cm);
        if (res.isNew) {
          msg += `\n✦ 新记入鱼类图鉴：${c.fishDef.name}（${res.count}/${res.total}）`;
          ctx.sound.questDone?.();
        } else if (record) {
          msg += `\n✦ 刷新了${c.fishDef.name}的最大纪录！`;
        }
      }
    }
    if (f.count === 5) msg += " 今天已经钓了 5 次，冰洞边的小鱼都要认识你啦。";
    ctx.toast(msg);
    if (c.fishDef) {
      this._paintLeapingFish(c.fishDef, c.cm);
      f.jumpT = 0;
    }
    if (c.glove && this.mitten) this.mitten.visible = true;
    if (c.rare) {
      ctx.sound.coinChime();
      ctx.emote(HOLE.x, HOLE.z, "sparkle", 1.6);
      ctx.bless(HOLE.x, 1.9, HOLE.z);
    }
  }

  // ===================================================================
  //  Interface: interactions
  // ===================================================================
  getInteractions(playerPos) {
    if (!playerPos || playerPos.z < 9) return this._noInteractions;
    return this._interactions;
  }

  interact(id, ctx) {
    switch (id) {
      case "south_fish": {
        const f = this.fish;
        if (f.state === "wait" || f.state === "bite") {
          ctx.toast("嘘——浮漂在轻轻晃，鱼快上钩了。");
          return;
        }
        if (f.cooldown > 0) {
          ctx.toast("先把鱼线重新理好，再放下去。");
          return;
        }
        f.state = "wait";
        f.timer = 1.1 + Math.random() * 0.9;
        f.ctx = ctx;
        this._fishIt.label = "浮漂动了动……";
        ctx.sound.dialogueBlip();
        ctx.popup(HOLE.x, 1.0, HOLE.z, "放下鱼线~", "#bfe6ff");
        break;
      }
      case "south_bench": {
        const nf = ctx.nightFactor ?? 0;
        const h = ctx.timeHours ?? 12;
        let line;
        if (nf > 0.55) {
          line = BENCH_NIGHT[this.benchNightIdx++ % BENCH_NIGHT.length];
        } else if (h >= 16.2 && h < 18.6 && this.benchIdx % 2 === 0) {
          line = BENCH_DUSK;
          this.benchIdx++;
        } else if (h >= 5.5 && h < 8 && this.benchIdx % 2 === 0) {
          line = BENCH_MORNING;
          this.benchIdx++;
        } else {
          line = BENCH_DAY[this.benchIdx++ % BENCH_DAY.length];
        }
        ctx.toast(line.text);
        if (line.sip) ctx.sound.sipWarm();
        ctx.emote(BENCH.x, BENCH.z, nf > 0.55 ? "sparkle" : "heart", 1.95);
        ctx.bless(BENCH.x, 2.2, BENCH.z);
        break;
      }
      case "south_sign_head":
        ctx.sound.paperRustle();
        ctx.toast("木牌上刻着：往南穿过松林小径，尽头就是结了冰的镜湖。");
        break;
      case "south_sign_lake":
        ctx.sound.paperRustle();
        ctx.toast("木牌上刻着：镜湖 · 冬天湖面冻得结结实实。码头在西边，冰钓的小洞在东边的冰面上。");
        break;
      case "south_snowman": {
        ctx.toast(SNOWMAN_LINES[this.snowmanIdx++ % SNOWMAN_LINES.length]);
        ctx.emote(SNOWMAN.x, SNOWMAN.z, "heart", 2.05);
        ctx.popup(SNOWMAN.x, 1.9, SNOWMAN.z, "嘿嘿~", "#e8f4ff");
        break;
      }
      default:
        break;
    }
  }
}
