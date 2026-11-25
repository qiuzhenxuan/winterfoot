import * as THREE from "three";

// 小屋摆设: furniture and keepsakes the player places around the cottage.
//
// The cottage has a handful of free spots (a patch of floor by the hearth for a rug,
// corners by the door, the kitchen and the study...). Walking up to one shows a faint
// ring on the floor; pressing E there opens a small panel listing what fits the spot.
// Furniture is bought with gold straight from that panel; a few keepsakes arrive as
// gifts (for helping the neighbours, for filling the journal pages) and wait in
// storage until the player finds a place for them.
//
// Every model is a small low-poly piece, flat shaded and painted per triangle in the
// warm cottage palette, merged into one mesh per material so a fully furnished room
// costs only a few extra draws.

export const DECOR_SPOTS = [
  { id: "hearth", name: "壁炉前的空地", kind: "rug", x: -1.75, z: -0.25, rot: 0, r: 0.6 },
  { id: "bedside", name: "床边空地", kind: "floor", x: -3.5, z: 0.25, rot: 1.2 },
  { id: "study", name: "书桌旁的墙角", kind: "floor", x: -6.1, z: -1.6, rot: Math.PI / 2 },
  { id: "door_l", name: "门边左侧", kind: "floor", x: -1.62, z: 3.0, rot: Math.PI },
  { id: "door_r", name: "门边右侧", kind: "floor", x: 1.68, z: 3.0, rot: Math.PI },
  { id: "window", name: "南墙圣诞树旁", kind: "floor", x: 3.4, z: 3.0, rot: Math.PI },
  { id: "tea", name: "茶几东边", kind: "floor", x: 2.85, z: -0.3, rot: -1.0 },
  { id: "kitchen", name: "厨房角落", kind: "floor", x: 6.1, z: -1.15, rot: -Math.PI / 2 },
];

export const DECOR_ITEMS = [
  { id: "rug_snow", kind: "rug", name: "雪花圆地毯", price: 120, line: "深蓝色的圆地毯，中间织着一朵大雪花，踩上去软软的。" },
  { id: "rug_plaid", kind: "rug", name: "松林格纹地毯", price: 100, line: "墨绿和红色的格子毯，两头还有一排小流苏。" },
  { id: "pine_pot", kind: "floor", name: "盆栽小松树", price: 80, line: "种在陶土盆里的小松树，挂着几颗红珠子，顶上一颗小星星。", foot: [0.5, 0.5] },
  { id: "floor_lamp", kind: "floor", name: "暖光落地灯", price: 150, line: "布灯罩透出橘黄色的光，夜里看书刚刚好。", foot: [0.45, 0.45] },
  { id: "rocker", kind: "floor", name: "毛毯摇椅", price: 200, line: "搭着格子毛毯的老摇椅，坐上去会吱呀吱呀地晃。", foot: [0.74, 0.78] },
  { id: "bookshelf", kind: "floor", name: "小书架", price: 180, line: "塞满了旧书的小书架，有几本书已经歪倒了。", foot: [0.95, 0.38] },
  { id: "gramophone", kind: "floor", name: "唱片机", price: 220, line: "黄铜喇叭的老唱片机，摆好以后唱片会慢慢转起来。", foot: [0.55, 0.48] },
  { id: "cushions", kind: "floor", name: "拼布坐垫堆", how: { board: 3 }, hint: "帮邻居完成 3 件布告栏委托后，林婶会缝一堆送你。", from: "林婶", line: "林婶用碎布头拼起来的坐垫，一屁股坐下去就不想起来。", foot: [0.72, 0.66] },
  { id: "fish_trophy", kind: "floor", name: "镜湖大鱼标本", how: { board: 8 }, hint: "帮邻居完成 8 件布告栏委托后，周伯会送来他的宝贝。", from: "钓鱼的周伯", line: "周伯年轻时在镜湖钓到的大鱼，他说这条鱼该挂在更勤快的人家里。", foot: [0.5, 0.42] },
  { id: "fish_tank", kind: "floor", name: "小鱼缸", how: { journal: "fish" }, hint: "鱼类图鉴集齐以后，会有人送来。", from: "冬麓的邻居们", line: "两条小金鱼在里面慢慢游，偶尔吐一个泡泡。", foot: [0.62, 0.38] },
  { id: "star_lamp", kind: "floor", name: "星空小夜灯", how: { journal: "stars" }, hint: "星图册集齐以后，会有人送来。", from: "冬麓的邻居们", line: "灯罩上戳满了小孔，开着它就像把星空搬进了屋里。", foot: [0.5, 0.5] },
];

const ITEM = new Map(DECOR_ITEMS.map((it) => [it.id, it]));
const SPOT = new Map(DECOR_SPOTS.map((s) => [s.id, s]));

// ---------------------------------------------------------------------------
//  Low-poly helpers
// ---------------------------------------------------------------------------
let MATS = null;
function mats() {
  if (MATS) return MATS;
  MATS = {
    paint: new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.9 }),
    gloss: new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.35, metalness: 0.35 }),
    // lit from within: lamp shades, the star lamp's dome
    glow: new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide }),
    glass: new THREE.MeshStandardMaterial({ color: 0xcdeefa, transparent: true, opacity: 0.22, roughness: 0.06, metalness: 0.1, depthWrite: false }),
    water: new THREE.MeshStandardMaterial({ color: 0x4fa6cc, transparent: true, opacity: 0.32, roughness: 0.15, depthWrite: false }),
    pool: new THREE.MeshBasicMaterial({ color: 0xffc977, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false }),
    ring: new THREE.MeshBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0, depthWrite: false }),
  };
  return MATS;
}

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const _col = new THREE.Color();
const _m4 = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();

function tone(hex, k) {
  _col.set(hex);
  if (k >= 0) _col.lerp(new THREE.Color(1, 1, 1), k);
  else _col.multiplyScalar(1 + k);
  return _col.getHex();
}

// Colour every triangle from its centroid. `fn` gets (x, y, z, tri, u, v) in the
// geometry's own space and returns a colour; plain colours get a tiny per-triangle
// wobble so big faces don't look machine-made.
function paint(geo, fn) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  if (g !== geo) geo.dispose();
  const pos = g.attributes.position;
  const uv = g.attributes.uv;
  const cols = new Float32Array(pos.count * 3);
  const f = typeof fn === "function" ? fn : null;
  for (let i = 0; i < pos.count; i += 3) {
    _a.fromBufferAttribute(pos, i);
    _b.fromBufferAttribute(pos, i + 1);
    _c.fromBufferAttribute(pos, i + 2);
    const cx = (_a.x + _b.x + _c.x) / 3;
    const cy = (_a.y + _b.y + _c.y) / 3;
    const cz = (_a.z + _b.z + _c.z) / 3;
    const t = i / 3;
    const u = uv ? (uv.getX(i) + uv.getX(i + 1) + uv.getX(i + 2)) / 3 : 0;
    const v = uv ? (uv.getY(i) + uv.getY(i + 1) + uv.getY(i + 2)) / 3 : 0;
    if (f) _col.set(f(cx, cy, cz, t, u, v));
    else {
      _col.set(fn);
      const w = 1 + (((t * 37) % 7) - 3) * 0.012;
      _col.multiplyScalar(w);
    }
    for (let k = 0; k < 3; k++) {
      cols[(i + k) * 3] = _col.r;
      cols[(i + k) * 3 + 1] = _col.g;
      cols[(i + k) * 3 + 2] = _col.b;
    }
  }
  g.setAttribute("color", new THREE.BufferAttribute(cols, 3));
  g.deleteAttribute("uv");
  g.computeVertexNormals();
  return g;
}

// Collects painted parts and merges them into one mesh per material.
class Kit {
  constructor() {
    this.parts = { paint: [], gloss: [], glow: [], glass: [], water: [], pool: [] };
    this.group = new THREE.Group();
  }
  // add(geo, mat, [x,y,z], [rx,ry,rz], [sx,sy,sz])
  add(geo, mat, p = [0, 0, 0], r = [0, 0, 0], s = [1, 1, 1]) {
    _e.set(r[0], r[1], r[2]);
    _q.setFromEuler(_e);
    _m4.compose(_p.set(p[0], p[1], p[2]), _q, _s.set(s[0], s[1], s[2]));
    const g = geo.index ? geo.toNonIndexed() : geo;
    g.applyMatrix4(_m4);
    this.parts[mat].push(g);
    return g;
  }
  box(w, h, d, col, p, r, s, mat = "paint") {
    return this.add(paint(new THREE.BoxGeometry(w, h, d), col), mat, p, r, s);
  }
  cyl(rt, rb, h, seg, col, p, r, s, mat = "paint") {
    return this.add(paint(new THREE.CylinderGeometry(rt, rb, h, seg), col), mat, p, r, s);
  }
  build() {
    const M = mats();
    for (const [key, list] of Object.entries(this.parts)) {
      if (!list.length) continue;
      const geo = mergeSimple(list, key !== "glass" && key !== "water" && key !== "pool");
      const m = new THREE.Mesh(geo, M[key]);
      m.castShadow = key === "paint" || key === "gloss";
      m.receiveShadow = key === "paint";
      if (key === "pool") m.renderOrder = 2;
      this.group.add(m);
    }
    return this.group;
  }
}

function mergeSimple(list, withColor) {
  let n = 0;
  for (const g of list) n += g.attributes.position.count;
  const pos = new Float32Array(n * 3);
  const nor = new Float32Array(n * 3);
  const col = withColor ? new Float32Array(n * 3) : null;
  let o = 0;
  for (const g of list) {
    if (!g.attributes.normal) g.computeVertexNormals();
    pos.set(g.attributes.position.array, o * 3);
    nor.set(g.attributes.normal.array, o * 3);
    if (col) {
      if (g.attributes.color) col.set(g.attributes.color.array, o * 3);
      else col.fill(1, o * 3, (o + g.attributes.position.count) * 3);
    }
    o += g.attributes.position.count;
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  out.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
  if (col) out.setAttribute("color", new THREE.BufferAttribute(col, 3));
  out.computeBoundingSphere();
  return out;
}

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function starShape(r1, r2, pts = 5) {
  const s = new THREE.Shape();
  for (let i = 0; i <= pts * 2; i++) {
    const r = i % 2 ? r2 : r1;
    const t = (i / (pts * 2)) * Math.PI * 2 + Math.PI / 2;
    if (i === 0) s.moveTo(Math.cos(t) * r, Math.sin(t) * r);
    else s.lineTo(Math.cos(t) * r, Math.sin(t) * r);
  }
  return s;
}

// Palette
const C = {
  wood: 0x8a5a33,
  woodDark: 0x5c381f,
  woodLight: 0xb27c48,
  cream: 0xf1e4c4,
  red: 0xbf4438,
  redDark: 0x8e2f2a,
  green: 0x4f7d48,
  greenDark: 0x35593a,
  navy: 0x2c4165,
  blue: 0x3f5f8c,
  gold: 0xe5b54b,
  brass: 0xc7953a,
  terracotta: 0xc0693c,
  soil: 0x4a3222,
};

// ---------------------------------------------------------------------------
//  Models (origin on the floor, facing +z)
// ---------------------------------------------------------------------------
function buildRugSnow(kit) {
  const R = 0.82;
  const SX = 1.2;
  kit.add(
    paint(new THREE.RingGeometry(0, R, 24, 7).rotateX(-Math.PI / 2), (x, y, z) => {
      const r = Math.hypot(x, z) / R;
      const a = Math.atan2(z, x) + Math.PI;
      const b = Math.floor((a / (Math.PI * 2)) * 24) % 24;
      if (r > 0.88) return b % 2 ? C.red : C.cream;
      if (r > 0.76) return 0x22344f;
      if (r < 0.15) return 0xf6f2e6;
      if (b % 4 === 0 && r < 0.7) return r > 0.5 ? 0xdfe9f2 : 0xf6f2e6;
      if (b % 4 === 2 && r > 0.4 && r < 0.56) return 0xdfe9f2;
      return Math.floor(r * 7) % 2 ? C.blue : tone(C.blue, -0.06);
    }),
    "paint",
    [0, 0.062, 0],
    [0, 0, 0],
    [SX, 1, 1]
  );
  kit.cyl(R, R + 0.02, 0.058, 24, tone(C.cream, -0.25), [0, 0.029, 0], [0, 0, 0], [SX, 1, 1]);
}

function buildRugPlaid(kit) {
  const W = 1.8;
  const D = 1.15;
  kit.add(
    paint(new THREE.PlaneGeometry(W, D, 18, 12).rotateX(-Math.PI / 2), (x, y, z) => {
      if (Math.abs(x) > W / 2 - 0.08 || Math.abs(z) > D / 2 - 0.08) return 0x2f4a2e;
      const ix = Math.floor((x + W / 2) / 0.1);
      const iz = Math.floor((z + D / 2) / 0.096);
      const vx = ix % 6 < 2;
      const vz = iz % 6 < 2;
      if (vx && vz) return C.redDark;
      if (vx || vz) return C.red;
      if (ix % 6 === 4 || iz % 6 === 4) return 0xcfbd8f;
      return (ix + iz) % 2 ? 0x4a7346 : 0x557f4e;
    }),
    "paint",
    [0, 0.062, 0]
  );
  kit.box(W, 0.058, D, 0x2a4029, [0, 0.029, 0]);
  for (const sx of [-1, 1]) {
    for (let i = 0; i < 10; i++) {
      const z = -D / 2 + 0.08 + (i * (D - 0.16)) / 9;
      kit.box(0.08, 0.012, 0.035, i % 2 ? C.cream : tone(C.cream, -0.12), [sx * (W / 2 + 0.035), 0.01, z]);
    }
  }
}

function buildPinePot(kit) {
  kit.add(
    paint(new THREE.CylinderGeometry(0.17, 0.13, 0.26, 8), (x, y) => (y > 0.0 && y < 0.05 ? C.cream : C.terracotta)),
    "paint",
    [0, 0.13, 0]
  );
  kit.cyl(0.195, 0.19, 0.055, 8, tone(C.terracotta, 0.12), [0, 0.27, 0]);
  kit.cyl(0.165, 0.165, 0.02, 8, C.soil, [0, 0.29, 0]);
  kit.cyl(0.035, 0.045, 0.2, 6, C.woodDark, [0, 0.38, 0]);
  const tiers = [
    [0.38, 0.42, 0.6],
    [0.3, 0.36, 0.82],
    [0.2, 0.3, 1.02],
  ];
  tiers.forEach(([r, h, y], k) => {
    kit.add(
      paint(new THREE.ConeGeometry(r, h, 7, 2), (x, yy, z, t) => {
        if (yy < -h / 2 + 0.05) return 0x2e5233;
        return t % 2 ? C.green : tone(C.green, k === 0 ? -0.12 : 0.06);
      }),
      "paint",
      [0, y, 0],
      [0, k * 0.4, 0]
    );
  });
  // red and gold beads
  const beads = [
    [0.22, 0.52, 0.18, C.red],
    [-0.2, 0.55, 0.16, C.gold],
    [0.05, 0.5, -0.27, C.red],
    [-0.1, 0.78, 0.2, C.red],
    [0.18, 0.76, -0.08, C.gold],
    [0.04, 0.98, 0.14, C.gold],
  ];
  for (const [x, y, z, col] of beads) kit.add(paint(new THREE.IcosahedronGeometry(0.032, 0), col), "gloss", [x, y, z]);
  const st = new THREE.ExtrudeGeometry(starShape(0.075, 0.034), { depth: 0.025, bevelEnabled: false });
  st.translate(0, 0, -0.0125);
  kit.add(paint(st, C.gold), "gloss", [0, 1.22, 0]);
  // ribbon bow on the pot
  kit.add(paint(new THREE.ConeGeometry(0.04, 0.07, 4), C.red), "paint", [-0.035, 0.18, 0.165], [0, 0, Math.PI / 2]);
  kit.add(paint(new THREE.ConeGeometry(0.04, 0.07, 4), C.red), "paint", [0.035, 0.18, 0.165], [0, 0, -Math.PI / 2]);
}

function buildFloorLamp(kit) {
  kit.cyl(0.16, 0.2, 0.05, 10, C.woodDark, [0, 0.025, 0]);
  kit.cyl(0.08, 0.11, 0.06, 8, C.brass, [0, 0.08, 0], undefined, undefined, "gloss");
  kit.cyl(0.022, 0.022, 1.22, 6, C.brass, [0, 0.72, 0], undefined, undefined, "gloss");
  kit.cyl(0.05, 0.035, 0.08, 6, C.brass, [0, 1.3, 0], undefined, undefined, "gloss");
  // the shade glows warm, with a darker fringe along its hem
  kit.add(
    paint(new THREE.CylinderGeometry(0.15, 0.28, 0.3, 10, 2, true), (x, y, z, t) => {
      if (y < -0.1) return 0xe8a95a;
      return t % 2 ? 0xffe3a8 : 0xfbd48d;
    }),
    "glow",
    [0, 1.42, 0]
  );
  kit.add(paint(new THREE.IcosahedronGeometry(0.045, 0), 0xfff4cf), "glow", [0, 1.34, 0]);
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    kit.box(0.018, 0.05, 0.018, C.red, [Math.cos(a) * 0.282, 1.245, Math.sin(a) * 0.282]);
  }
  kit.add(new THREE.CircleGeometry(0.8, 20).rotateX(-Math.PI / 2), "pool", [0, 0.012, 0]);
  // a book left on the base
  kit.box(0.14, 0.035, 0.1, C.navy, [0.06, 0.07, 0.11], [0, 0.4, 0]);
}

function buildRocker(kit) {
  // two curved rockers
  const sh = new THREE.Shape();
  const N = 10;
  for (let i = 0; i <= N; i++) {
    const x = -0.44 + (0.88 * i) / N;
    const y = 0.015 + 0.32 * x * x;
    if (i === 0) sh.moveTo(x, y);
    else sh.lineTo(x, y);
  }
  for (let i = N; i >= 0; i--) {
    const x = -0.44 + (0.88 * i) / N;
    sh.lineTo(x, 0.075 + 0.32 * x * x);
  }
  for (const sx of [-1, 1]) {
    const g = new THREE.ExtrudeGeometry(sh, { depth: 0.05, bevelEnabled: false });
    g.rotateY(-Math.PI / 2);
    kit.add(paint(g, C.woodDark), "paint", [sx * 0.27 + 0.025, 0, 0]);
  }
  for (const sx of [-1, 1]) {
    for (const sz of [-0.2, 0.2]) kit.cyl(0.025, 0.028, 0.3, 6, C.wood, [sx * 0.27, 0.24, sz]);
  }
  kit.box(0.62, 0.06, 0.56, C.wood, [0, 0.4, 0]);
  // back posts, rail and slats, leaning back a little
  const lean = -0.2;
  for (const sx of [-1, 1]) kit.cyl(0.03, 0.03, 0.78, 6, C.wood, [sx * 0.28, 0.78, -0.3], [lean, 0, 0]);
  kit.box(0.64, 0.09, 0.05, C.woodLight, [0, 1.16, -0.38], [lean, 0, 0]);
  for (let i = 0; i < 4; i++) kit.box(0.07, 0.6, 0.025, C.woodLight, [-0.18 + i * 0.12, 0.8, -0.31], [lean, 0, 0]);
  // arm rests
  for (const sx of [-1, 1]) {
    kit.box(0.07, 0.045, 0.5, C.woodLight, [sx * 0.31, 0.64, -0.02]);
    kit.cyl(0.022, 0.022, 0.22, 6, C.wood, [sx * 0.31, 0.52, 0.18]);
  }
  // plaid blanket over the back, folded down onto the seat
  const plaid = (x, y, z) => {
    const ix = Math.floor((x + 1) / 0.07);
    const iy = Math.floor((y + z + 2) / 0.07);
    if (ix % 4 === 0 && iy % 4 === 0) return C.redDark;
    if (ix % 4 === 0 || iy % 4 === 0) return C.cream;
    return C.red;
  };
  kit.add(paint(new THREE.BoxGeometry(0.46, 0.56, 0.035, 6, 7, 1), plaid), "paint", [0.02, 0.86, -0.27], [lean, 0, 0]);
  kit.add(paint(new THREE.BoxGeometry(0.48, 0.04, 0.38, 6, 1, 5), plaid), "paint", [0.02, 0.45, -0.02]);
  kit.add(paint(new THREE.BoxGeometry(0.46, 0.2, 0.035, 6, 3, 1), plaid), "paint", [0.02, 0.36, 0.17], [0.15, 0, 0]);
}

function buildBookshelf(kit) {
  const W = 0.9;
  const D = 0.32;
  for (const sx of [-1, 1]) kit.box(0.05, 1.3, D, C.wood, [sx * (W / 2 - 0.025), 0.65, 0]);
  kit.box(W + 0.06, 0.05, D + 0.04, C.woodLight, [0, 1.325, 0.01]);
  kit.box(W, 0.09, D, C.woodDark, [0, 0.045, 0]);
  for (const y of [0.45, 0.86]) kit.box(W - 0.1, 0.035, D - 0.02, C.woodLight, [0, y, 0]);
  kit.box(W - 0.1, 1.22, 0.02, C.woodDark, [0, 0.66, -D / 2 + 0.01]);
  const cols = [C.red, C.navy, C.green, 0xd7a142, 0x7b4f7d, 0x2f6c73, C.redDark, 0xc9b58a, 0x5b6f3c];
  const r = rng(77);
  for (const base of [0.09, 0.468, 0.878]) {
    let x = -W / 2 + 0.07;
    let k = 0;
    while (x < W / 2 - 0.12) {
      const w = 0.04 + r() * 0.035;
      const h = 0.2 + r() * 0.12;
      const col = cols[Math.floor(r() * cols.length)];
      const lean = k > 2 && r() < 0.15 ? 0.25 : 0;
      kit.add(
        paint(new THREE.BoxGeometry(w, h, 0.2), (bx, by) => (Math.abs(by) > h / 2 - 0.035 && Math.abs(by) < h / 2 - 0.015 ? C.gold : col)),
        "paint",
        [x + w / 2 + (lean ? 0.05 : 0), base + h / 2 - (lean ? 0.01 : 0), 0.02],
        [0, 0, -lean]
      );
      x += w + (lean ? 0.06 : 0.004);
      k++;
    }
  }
  // on top: a lying stack of two books and a little potted plant
  kit.box(0.24, 0.045, 0.17, C.navy, [-0.2, 1.372, 0.02], [0, 0.1, 0]);
  kit.box(0.2, 0.04, 0.15, C.red, [-0.19, 1.414, 0.02], [0, -0.15, 0]);
  kit.cyl(0.06, 0.045, 0.09, 7, C.terracotta, [0.24, 1.395, 0.02]);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    kit.add(paint(new THREE.ConeGeometry(0.03, 0.14, 4), i % 2 ? C.green : tone(C.green, 0.1)), "paint", [0.24 + Math.cos(a) * 0.03, 1.5, 0.02 + Math.sin(a) * 0.03], [Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5]);
  }
}

function buildGramophone(kit, anim) {
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) kit.cyl(0.025, 0.02, 0.12, 6, C.woodDark, [sx * 0.21, 0.06, sz * 0.17]);
  kit.add(
    paint(new THREE.BoxGeometry(0.5, 0.42, 0.42, 2, 2, 1), (x, y, z) => (z > 0.2 && Math.abs(x) < 0.2 && Math.abs(y) < 0.16 ? C.woodLight : C.wood)),
    "paint",
    [0, 0.33, 0]
  );
  kit.add(paint(new THREE.IcosahedronGeometry(0.018, 0), C.brass), "gloss", [0.13, 0.34, 0.215]);
  kit.box(0.54, 0.04, 0.46, C.woodDark, [0, 0.56, 0]);
  kit.box(0.38, 0.09, 0.32, C.woodLight, [0.02, 0.625, 0.02]);
  kit.cyl(0.14, 0.14, 0.012, 16, 0x2b2b2b, [0.02, 0.676, 0.03]);
  // tone arm
  kit.cyl(0.02, 0.02, 0.05, 6, C.brass, [0.17, 0.695, -0.09], undefined, undefined, "gloss");
  kit.box(0.015, 0.015, 0.16, C.brass, [0.12, 0.712, -0.02], [0, 0.55, 0], undefined, "gloss");
  // crank on the side
  kit.box(0.08, 0.015, 0.015, C.brass, [0.235, 0.61, 0.02], undefined, undefined, "gloss");
  kit.box(0.015, 0.06, 0.015, C.brass, [0.27, 0.58, 0.02], undefined, undefined, "gloss");
  // neck and flared horn, petals in two brasses
  kit.cyl(0.025, 0.03, 0.24, 6, C.brass, [-0.1, 0.77, -0.1], [0.3, 0, 0.3], undefined, "gloss");
  const prof = [];
  for (let i = 0; i <= 8; i++) {
    const t = i / 8;
    prof.push(new THREE.Vector2(0.025 + 0.29 * Math.pow(t, 2.4), t * 0.48));
  }
  kit.add(
    paint(new THREE.LatheGeometry(prof, 10), (x, y, z) => {
      const a = Math.atan2(z, x) + Math.PI;
      const b = Math.floor((a / (Math.PI * 2)) * 10);
      if (y > 0.36) return 0xf0c862;
      return b % 2 ? C.gold : C.brass;
    }),
    "gloss",
    [-0.14, 0.86, -0.07],
    [0.75, 0, 0.5]
  );
  // the record spins
  const rec = new THREE.Mesh(
    paint(new THREE.CylinderGeometry(0.125, 0.125, 0.01, 16, 1), (x, y, z) => {
      const r = Math.hypot(x, z);
      if (y < 0.004) return 0x1d1d1d;
      if (r < 0.04) return C.red;
      return Math.floor(r * 60) % 2 ? 0x2a2a2a : 0x161616;
    }),
    mats().gloss
  );
  rec.position.set(0.02, 0.687, 0.03);
  kit.group.add(rec);
  anim.push((t) => (rec.rotation.y = -t * 3.4));
}

function buildCushions(kit) {
  const patch = (cols) => (x, y, z) => {
    const q = (x > 0 ? 1 : 0) + (z > 0 ? 2 : 0);
    if (Math.abs(x) < 0.02 || Math.abs(z) < 0.02) return C.cream;
    return cols[q];
  };
  kit.add(paint(new THREE.SphereGeometry(0.34, 10, 6), patch([C.red, 0xd79b45, C.navy, C.green])), "paint", [0, 0.12, 0], [0, 0.3, 0], [1.1, 0.36, 0.95]);
  kit.add(paint(new THREE.IcosahedronGeometry(0.02, 0), C.cream), "paint", [0, 0.245, 0]);
  kit.add(paint(new THREE.SphereGeometry(0.25, 10, 6), patch([0x7b4f7d, C.cream, C.red, 0x2f6c73])), "paint", [-0.06, 0.3, -0.06], [0.12, -0.4, 0.08], [1, 0.4, 0.92]);
  kit.add(paint(new THREE.IcosahedronGeometry(0.018, 0), C.gold), "paint", [-0.06, 0.4, -0.04]);
  // a striped bolster rolled up in front
  kit.add(
    paint(new THREE.CylinderGeometry(0.085, 0.085, 0.46, 8, 5), (x, y) => (Math.floor((y + 1) / 0.092) % 2 ? C.green : C.cream)),
    "paint",
    [0.05, 0.085, 0.3],
    [0, 0.25, Math.PI / 2]
  );
}

function buildFishTrophy(kit) {
  kit.add(
    paint(new THREE.BoxGeometry(0.42, 0.6, 0.34, 1, 2, 1), (x, y, z) => (z > 0.16 && Math.abs(x) < 0.15 && y > -0.2 && y < 0.2 ? C.wood : C.woodDark)),
    "paint",
    [0, 0.3, 0]
  );
  kit.box(0.48, 0.04, 0.4, C.woodLight, [0, 0.62, 0]);
  // oval plaque standing up, with a little back leg
  kit.add(
    paint(new THREE.CylinderGeometry(0.22, 0.22, 0.04, 14), (x, y, z) => (Math.hypot(x, z) > 0.19 ? C.woodDark : C.wood)),
    "paint",
    [0, 0.92, -0.06],
    [Math.PI / 2, 0, 0],
    [1.45, 1, 1]
  );
  kit.box(0.05, 0.32, 0.03, C.woodDark, [0, 0.78, -0.15], [-0.4, 0, 0]);
  kit.box(0.16, 0.035, 0.01, C.gold, [0, 0.72, -0.035], undefined, undefined, "gloss");
  // the fish
  kit.add(
    paint(new THREE.SphereGeometry(0.1, 10, 6), (x, y, z, t) => {
      if (y < -0.03) return 0xdfe7ea;
      if (y > 0.02 && t % 5 === 0) return 0x2c4c5e;
      return y > 0.0 ? 0x3f7088 : 0x8fb3c2;
    }),
    "gloss",
    [0.02, 0.93, -0.01],
    [0, 0, 0.08],
    [2.4, 1, 0.5]
  );
  const tail = new THREE.Shape();
  tail.moveTo(0, 0);
  tail.lineTo(-0.13, 0.1);
  tail.lineTo(-0.1, 0);
  tail.lineTo(-0.13, -0.1);
  tail.lineTo(0, 0);
  const tg = new THREE.ExtrudeGeometry(tail, { depth: 0.02, bevelEnabled: false });
  kit.add(paint(tg, 0x335f73), "paint", [-0.2, 0.915, -0.02]);
  const fin = new THREE.Shape();
  fin.moveTo(-0.08, 0);
  fin.lineTo(0.02, 0.07);
  fin.lineTo(0.08, 0);
  kit.add(paint(new THREE.ExtrudeGeometry(fin, { depth: 0.015, bevelEnabled: false }), 0x335f73), "paint", [0.02, 0.98, -0.018]);
  kit.add(paint(new THREE.IcosahedronGeometry(0.014, 0), 0x111111), "gloss", [0.2, 0.945, 0.035]);
  kit.add(paint(new THREE.IcosahedronGeometry(0.008, 0), 0xffffff), "gloss", [0.205, 0.95, 0.046]);
}

function buildFishTank(kit, anim) {
  kit.add(
    paint(new THREE.BoxGeometry(0.62, 0.5, 0.36, 2, 1, 1), (x, y, z) => (z > 0.17 ? (Math.abs(x) < 0.015 ? C.woodDark : C.wood) : C.woodDark)),
    "paint",
    [0, 0.25, 0]
  );
  for (const sx of [-1, 1]) kit.add(paint(new THREE.IcosahedronGeometry(0.016, 0), C.brass), "gloss", [sx * 0.05, 0.3, 0.185]);
  kit.box(0.64, 0.03, 0.38, C.woodLight, [0, 0.515, 0]);
  // gravel, weed and a little stone arch
  const r = rng(5);
  kit.add(paint(new THREE.BoxGeometry(0.54, 0.04, 0.28, 6, 1, 3), () => [0xd8c39a, 0xbfa57a, 0xe7d8b6, 0x9f8a6a][Math.floor(r() * 4)]), "paint", [0, 0.55, 0]);
  for (const [x, z, h] of [[-0.19, -0.06, 0.2], [-0.15, 0.05, 0.14], [0.2, -0.07, 0.17]]) {
    kit.add(paint(new THREE.ConeGeometry(0.025, h, 4), C.green), "paint", [x, 0.57 + h / 2, z]);
  }
  kit.add(paint(new THREE.TorusGeometry(0.06, 0.025, 4, 7, Math.PI), 0x8c8d90), "paint", [0.06, 0.57, -0.06]);
  kit.add(new THREE.BoxGeometry(0.55, 0.3, 0.29), "water", [0, 0.68, 0]);
  kit.add(new THREE.BoxGeometry(0.58, 0.36, 0.32), "glass", [0, 0.7, 0]);
  // frame and hood
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) kit.box(0.02, 0.36, 0.02, C.woodDark, [sx * 0.29, 0.7, sz * 0.16]);
  kit.box(0.62, 0.04, 0.36, C.woodDark, [0, 0.9, 0]);
  // two goldfish that swim slow loops
  const fishes = [];
  for (const [col, ph, rad, y] of [[0xf08a2c, 0, 0.17, 0.7], [0xf6c443, 2.5, 0.12, 0.64]]) {
    const f = new THREE.Group();
    f.add(new THREE.Mesh(paint(new THREE.SphereGeometry(0.03, 6, 4), col), mats().gloss));
    f.children[0].scale.set(1.7, 1, 0.7);
    const tl = new THREE.Mesh(paint(new THREE.ConeGeometry(0.025, 0.05, 4), tone(col, 0.2)), mats().paint);
    tl.rotation.z = Math.PI / 2;
    tl.position.x = -0.06;
    f.add(tl);
    kit.group.add(f);
    fishes.push({ f, ph, rad, y });
  }
  anim.push((t) => {
    for (const { f, ph, rad, y } of fishes) {
      const a = t * 0.6 + ph;
      f.position.set(Math.cos(a) * rad, y + Math.sin(a * 2.3) * 0.025, Math.sin(a) * rad * 0.45);
      f.rotation.y = -a - Math.PI / 2;
    }
  });
}

function buildStarLamp(kit, anim) {
  kit.cyl(0.16, 0.18, 0.04, 10, C.woodDark, [0, 0.02, 0]);
  kit.cyl(0.04, 0.05, 0.46, 6, C.wood, [0, 0.26, 0]);
  kit.cyl(0.24, 0.23, 0.04, 10, C.woodLight, [0, 0.5, 0]);
  kit.cyl(0.09, 0.1, 0.06, 10, C.brass, [0, 0.55, 0], undefined, undefined, "gloss");
  const r = rng(11);
  kit.add(
    paint(new THREE.IcosahedronGeometry(0.14, 1), (x, y) => {
      if (y < -0.07) return 0x1d2a45;
      return r() < 0.22 ? 0xfff0a0 : r() < 0.5 ? 0x24375c : 0x2c4270;
    }),
    "glow",
    [0, 0.68, 0],
    [0, 0, 0],
    [1, 0.88, 1]
  );
  kit.add(paint(new THREE.IcosahedronGeometry(0.022, 0), C.gold), "gloss", [0, 0.81, 0]);
  kit.add(new THREE.CircleGeometry(0.55, 16).rotateX(-Math.PI / 2), "pool", [0, 0.524, 0]);
  // little stars floating above
  const stars = new THREE.Group();
  const sg = paint(new THREE.OctahedronGeometry(0.028, 0), 0xffe88a);
  for (let i = 0; i < 6; i++) {
    const s = new THREE.Mesh(sg, mats().glow);
    const a = (i / 6) * Math.PI * 2;
    s.userData = { a, y: 0.98 + (i % 3) * 0.09, r: 0.16 + (i % 2) * 0.07 };
    stars.add(s);
  }
  kit.group.add(stars);
  anim.push((t) => {
    for (const s of stars.children) {
      const u = s.userData;
      const a = u.a + t * 0.35;
      s.position.set(Math.cos(a) * u.r, u.y + Math.sin(t * 1.3 + u.a * 2) * 0.03, Math.sin(a) * u.r);
      s.rotation.y = t * 1.5 + u.a;
    }
  });
}

const BUILDERS = {
  rug_snow: buildRugSnow,
  rug_plaid: buildRugPlaid,
  pine_pot: buildPinePot,
  floor_lamp: buildFloorLamp,
  rocker: buildRocker,
  bookshelf: buildBookshelf,
  gramophone: buildGramophone,
  cushions: buildCushions,
  fish_trophy: buildFishTrophy,
  fish_tank: buildFishTank,
  star_lamp: buildStarLamp,
};

// Returns { group, tick(t) } for one item, origin on the floor, facing +z.
export function buildDecorModel(id) {
  const kit = new Kit();
  const anim = [];
  const fn = BUILDERS[id];
  if (fn) fn(kit, anim);
  const group = kit.build();
  group.name = `decor-${id}`;
  return { group, tick: anim.length ? (t) => anim.forEach((f) => f(t)) : null };
}

// A soft dashed ring on the floor that marks a free spot
export function buildSpotMarker(spot) {
  const g = new THREE.Group();
  const r = spot.kind === "rug" ? 0.62 : 0.36;
  const mat = mats().ring.clone();
  const ring = new THREE.Mesh(new THREE.RingGeometry(r - 0.035, r, 24, 1), mat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.05;
  g.add(ring);
  const dots = new THREE.Mesh(new THREE.RingGeometry(r * 0.35 - 0.025, r * 0.35, 12, 1), mat);
  dots.rotation.x = -Math.PI / 2;
  dots.position.y = 0.05;
  g.add(dots);
  g.position.set(spot.x, 0, spot.z);
  if (spot.kind === "rug") g.scale.set(1.25, 1, 1);
  g.userData.mat = mat;
  return g;
}

// ---------------------------------------------------------------------------
//  Card icons (40 x 34 pixel art)
// ---------------------------------------------------------------------------
export function drawDecorCard(canvas, it, owned) {
  const W = 40;
  const H = 34;
  canvas.width = W;
  canvas.height = H;
  const g = canvas.getContext && canvas.getContext("2d");
  if (!g) return;
  g.imageSmoothingEnabled = false;
  // a little patch of plank floor and log wall
  g.fillStyle = owned ? "#e9d2a8" : "#bdb4a6";
  g.fillRect(0, 0, W, 22);
  g.fillStyle = owned ? "#dcc095" : "#b1a899";
  for (const y of [6, 13, 20]) g.fillRect(0, y, W, 1);
  g.fillStyle = owned ? "#b98352" : "#958a7d";
  g.fillRect(0, 22, W, 12);
  g.fillStyle = owned ? "#a8723f" : "#877c70";
  for (const y of [25, 29, 33]) g.fillRect(0, y, W, 1);
  const sil = !owned;
  const c = (col) => (sil ? "#4a4640" : col);
  const R = (x, y, w, h, col) => {
    g.fillStyle = c(col);
    g.fillRect(x, y, w, h);
  };
  const disc = (cx, cy, rx, ry, col) => {
    g.fillStyle = c(col);
    for (let y = -Math.ceil(ry); y <= Math.ceil(ry); y++)
      for (let x = -Math.ceil(rx); x <= Math.ceil(rx); x++) if ((x * x) / (rx * rx) + (y * y) / (ry * ry) <= 1) g.fillRect(cx + x, cy + y, 1, 1);
  };
  switch (it.id) {
    case "rug_snow":
      disc(20, 25, 17, 7.5, "#f1e4c4");
      for (let k = 0; k < 12; k++) {
        const a = (k / 12) * Math.PI * 2;
        R(20 + Math.round(Math.cos(a) * 16), 25 + Math.round(Math.sin(a) * 7), 1, 1, "#bf4438");
      }
      disc(20, 25, 15, 6, "#22344f");
      disc(20, 25, 13.5, 5.3, "#3f5f8c");
      R(9, 25, 23, 1, "#f6f2e6");
      for (let k = -4; k <= 4; k++) R(20 + k * 2, 25 + k, 1, 1, "#f6f2e6"), R(20 - k * 2, 25 + k, 1, 1, "#f6f2e6");
      R(19, 24, 3, 3, "#ffffff");
      break;
    case "rug_plaid":
      R(4, 18, 32, 14, "#2f4a2e");
      R(5, 19, 30, 12, "#557f4e");
      for (let x = 7; x < 34; x += 6) R(x, 19, 2, 12, "#bf4438");
      for (let y = 21; y < 31; y += 5) R(5, y, 30, 2, "#bf4438");
      for (let x = 7; x < 34; x += 6) for (let y = 21; y < 31; y += 5) R(x, y, 2, 2, "#8e2f2a");
      for (let y = 19; y < 31; y += 2) R(2, y, 2, 1, "#f1e4c4"), R(36, y, 2, 1, "#f1e4c4");
      break;
    case "pine_pot":
      R(14, 24, 12, 3, "#d9844f");
      R(15, 27, 10, 5, "#c0693c");
      R(15, 28, 10, 1, "#f1e4c4");
      R(19, 22, 2, 2, "#5c381f");
      for (const [y, w] of [[15, 9], [10, 7], [5, 5]]) {
        for (let k = 0; k < 7; k++) {
          const hw = Math.max(1, Math.round((w * (k + 1)) / 7));
          R(20 - hw, y + k, hw * 2, 1, k % 2 ? "#4f7d48" : "#3f6a3b");
          R(20 - hw, y + k, 1, 1, "#35593a");
        }
      }
      R(18, 2, 4, 4, "#e5b54b");
      R(17, 3, 6, 2, "#e5b54b");
      R(15, 19, 2, 2, "#bf4438");
      R(23, 14, 2, 2, "#e5b54b");
      R(21, 20, 2, 2, "#bf4438");
      break;
    case "floor_lamp":
      if (owned) disc(20, 31, 12, 2.5, "#f6d999");
      R(14, 30, 12, 3, "#5c381f");
      R(19, 10, 2, 20, "#c7953a");
      for (let k = 0; k < 8; k++) R(14 - Math.floor(k * 0.5), 3 + k, 12 + k, 1, k % 2 ? "#ffe3a8" : "#fbd48d");
      R(10, 11, 20, 1, "#bf4438");
      if (owned) for (const [x, y] of [[8, 5], [32, 6], [6, 10], [34, 11]]) R(x, y, 1, 1, "#fff3c4");
      break;
    case "rocker":
      for (let k = 0; k < 22; k++) R(9 + k, 30 - Math.round(((k - 11) * (k - 11)) / 30), 1, 2, "#5c381f");
      R(12, 22, 3, 7, "#8a5a33");
      R(25, 22, 3, 7, "#8a5a33");
      R(10, 20, 20, 3, "#8a5a33");
      R(26, 3, 3, 18, "#b27c48");
      R(10, 14, 3, 7, "#b27c48");
      R(10, 13, 9, 2, "#b27c48");
      R(20, 5, 8, 15, "#bf4438");
      for (let y = 7; y < 20; y += 4) R(20, y, 8, 1, "#f1e4c4");
      R(23, 5, 1, 15, "#f1e4c4");
      R(14, 18, 10, 3, "#bf4438");
      break;
    case "bookshelf":
      R(8, 2, 24, 31, "#5c381f");
      R(10, 4, 20, 27, "#3b2414");
      for (const y of [12, 21, 30]) R(9, y, 22, 2, "#b27c48");
      {
        const cols = ["#bf4438", "#2c4165", "#4f7d48", "#d7a142", "#7b4f7d", "#2f6c73"];
        let k = 0;
        for (const top of [5, 14, 23]) {
          let x = 10;
          while (x < 28) {
            const w = 2 + ((k * 7) % 3 ? 1 : 0);
            const h = 5 + ((k * 5) % 3);
            R(x, top + 7 - h, w, h, cols[k % cols.length]);
            x += w;
            k++;
          }
        }
      }
      R(7, 1, 26, 2, "#b27c48");
      break;
    case "gramophone":
      R(11, 20, 18, 11, "#8a5a33");
      R(15, 23, 10, 6, "#b27c48");
      R(12, 31, 2, 2, "#5c381f");
      R(26, 31, 2, 2, "#5c381f");
      R(10, 18, 20, 2, "#5c381f");
      disc(22, 17, 6, 1.5, "#222222");
      R(14, 10, 2, 8, "#c7953a");
      for (let k = 0; k < 9; k++) R(15 + k, 9 - k, 2 + Math.floor(k * 0.6), 2 + k, k % 2 ? "#e5b54b" : "#c7953a");
      R(22, 1, 3, 11, "#f0c862");
      break;
    case "cushions":
      disc(20, 27, 15, 5, "#bf4438");
      for (let y = 22; y < 33; y++) for (let x = 20; x < 36; x++) if (((x - 20) ** 2) / 225 + ((y - 27) ** 2) / 25 <= 1) R(x, y, 1, 1, y < 27 ? "#d79b45" : "#2c4165");
      for (let y = 22; y < 33; y++) for (let x = 5; x < 20; x++) if (((x - 20) ** 2) / 225 + ((y - 27) ** 2) / 25 <= 1 && y >= 27) R(x, y, 1, 1, "#4f7d48");
      disc(17, 19, 10, 4.5, "#7b4f7d");
      for (let y = 15; y < 24; y++) for (let x = 17; x < 28; x++) if (((x - 17) ** 2) / 100 + ((y - 19) ** 2) / 20.25 <= 1) R(x, y, 1, 1, y < 19 ? "#f1e4c4" : "#2f6c73");
      R(16, 18, 2, 2, "#e5b54b");
      R(14, 30, 14, 3, "#4f7d48");
      for (let x = 15; x < 28; x += 3) R(x, 30, 1, 3, "#f1e4c4");
      break;
    case "fish_trophy":
      R(12, 24, 16, 9, "#5c381f");
      R(10, 22, 20, 2, "#b27c48");
      disc(20, 12, 15, 9, "#5c381f");
      disc(20, 12, 13, 7.5, "#8a5a33");
      disc(21, 12, 8, 3.5, "#3f7088");
      for (let x = 14; x < 29; x++) R(x, 13, 1, 2, "#dfe7ea");
      R(8, 9, 2, 7, "#335f73");
      R(10, 11, 3, 3, "#335f73");
      R(26, 11, 2, 1, "#111111");
      R(18, 7, 5, 2, "#335f73");
      R(17, 19, 6, 1, "#e5b54b");
      break;
    case "fish_tank":
      R(8, 24, 24, 9, "#5c381f");
      R(9, 25, 22, 7, "#8a5a33");
      R(19, 25, 1, 7, "#5c381f");
      R(8, 6, 24, 2, "#5c381f");
      R(9, 8, 22, 15, "#a9daf0");
      R(9, 10, 22, 13, "#6db7d8");
      R(9, 20, 22, 3, "#d8c39a");
      R(11, 13, 1, 7, "#4f7d48");
      R(12, 15, 1, 5, "#4f7d48");
      R(28, 14, 1, 6, "#4f7d48");
      R(16, 13, 4, 2, "#f08a2c");
      R(15, 13, 1, 2, "#f6b06a");
      R(22, 16, 3, 2, "#f6c443");
      R(25, 16, 1, 2, "#f8dc85");
      R(8, 22, 1, 2, "#5c381f");
      R(31, 22, 1, 2, "#5c381f");
      R(14, 10, 1, 1, "#e8f6ff");
      R(15, 8, 1, 1, "#e8f6ff");
      break;
    case "star_lamp":
      R(12, 31, 16, 2, "#5c381f");
      R(19, 20, 2, 11, "#8a5a33");
      R(9, 18, 22, 2, "#b27c48");
      R(15, 16, 10, 2, "#c7953a");
      disc(20, 12, 6, 5, "#2c4270");
      R(14, 14, 13, 2, "#1d2a45");
      for (const [x, y] of [[18, 9], [22, 11], [16, 12], [21, 8], [24, 13]]) R(x, y, 1, 1, "#fff0a0");
      for (const [x, y] of [[7, 5], [32, 3], [29, 9], [10, 11]]) {
        R(x, y, 1, 1, "#ffe88a");
        R(x - 1, y + 1, 3, 1, "#ffe88a");
        R(x, y + 2, 1, 1, "#ffe88a");
      }
      break;
    default:
      break;
  }
}

function drawStowCard(canvas) {
  canvas.width = 40;
  canvas.height = 34;
  const g = canvas.getContext && canvas.getContext("2d");
  if (!g) return;
  g.imageSmoothingEnabled = false;
  g.fillStyle = "#e9d2a8";
  g.fillRect(0, 0, 40, 34);
  // an open wooden crate
  g.fillStyle = "#8a5a33";
  g.fillRect(9, 14, 22, 16);
  g.fillStyle = "#b27c48";
  for (const y of [15, 20, 25]) g.fillRect(10, y, 20, 3);
  g.fillStyle = "#5c381f";
  g.fillRect(9, 14, 2, 16);
  g.fillRect(29, 14, 2, 16);
  g.fillRect(9, 12, 22, 2);
  g.fillStyle = "#c7953a";
  for (const x of [18, 19, 20, 21]) g.fillRect(x, 4 + Math.abs(x - 19.5) * 2, 1, 6 - Math.abs(x - 19.5));
  g.fillRect(19, 2, 2, 8);
}

// ---------------------------------------------------------------------------
//  State + panel
// ---------------------------------------------------------------------------
export class CottageDecor {
  // getGold() -> number, spendGold(n) -> bool, onPlace(placed), onChange()
  constructor({ getGold, spendGold, onPlace, onChange, sound } = {}) {
    this.getGold = getGold || (() => 0);
    this.spendGold = spendGold || (() => false);
    this.onPlace = onPlace;
    this.onChange = onChange;
    this.sound = sound;
    this.spotId = null;
    this.sel = 0;
    this.reset(false);
    this._bindDom();
  }

  reset(notify = true) {
    this.owned = [];
    this.placed = {};
    if (notify && this.onPlace) this.onPlace(this.placed);
  }

  has(id) {
    return this.owned.includes(id);
  }

  spotOf(id) {
    for (const [s, i] of Object.entries(this.placed)) if (i === id) return s;
    return null;
  }

  getState() {
    return { owned: [...this.owned], placed: { ...this.placed } };
  }

  restoreState(s) {
    if (!s || typeof s !== "object") return;
    if (Array.isArray(s.owned)) this.owned = Array.from(new Set(s.owned.filter((id) => ITEM.has(id))));
    this.placed = {};
    if (s.placed && typeof s.placed === "object") {
      const used = new Set();
      for (const [spot, id] of Object.entries(s.placed)) {
        const sp = SPOT.get(spot);
        const it = ITEM.get(id);
        if (!sp || !it || !this.has(id) || used.has(id) || sp.kind !== it.kind) continue;
        this.placed[spot] = id;
        used.add(id);
      }
    }
    if (this.onPlace) this.onPlace(this.placed);
  }

  unlock(id) {
    const it = ITEM.get(id);
    if (!it || this.has(id)) return null;
    this.owned.push(id);
    if (this.onChange) this.onChange();
    if (this.isOpen()) this.render();
    return it;
  }

  // Keepsakes that came due: board jobs done, journal pages filled. Returns the new ones.
  checkUnlocks({ journal, board } = {}) {
    const got = [];
    for (const it of DECOR_ITEMS) {
      if (!it.how || this.has(it.id)) continue;
      const h = it.how;
      let ok = false;
      if (h.board != null && board) ok = (board.completed || 0) >= h.board;
      else if (h.journal && journal) ok = journal.count(h.journal) >= journal.total(h.journal);
      if (ok) {
        const n = this.unlock(it.id);
        if (n) got.push(n);
      }
    }
    return got;
  }

  // Put an owned item on a spot (moving it from wherever it was). Whatever stood
  // there goes back into storage.
  place(spotId, id) {
    const sp = SPOT.get(spotId);
    const it = ITEM.get(id);
    if (!sp || !it || !this.has(id) || sp.kind !== it.kind) return false;
    const was = this.spotOf(id);
    if (was) delete this.placed[was];
    this.placed[spotId] = id;
    if (this.onPlace) this.onPlace(this.placed);
    if (this.onChange) this.onChange();
    return true;
  }

  stow(spotId) {
    if (!this.placed[spotId]) return false;
    delete this.placed[spotId];
    if (this.onPlace) this.onPlace(this.placed);
    if (this.onChange) this.onChange();
    return true;
  }

  buy(id) {
    const it = ITEM.get(id);
    if (!it || this.has(id) || !it.price) return false;
    if (!this.spendGold(it.price)) return false;
    this.owned.push(id);
    return true;
  }

  // ---------- panel ----------
  _bindDom() {
    const $ = (id) => (typeof document !== "undefined" && document.getElementById ? document.getElementById(id) : null);
    this.el = $("decor-modal");
    this.elTitle = $("decor-title");
    this.elCards = $("decor-cards");
    this.elDetail = $("decor-detail");
    this.elGold = $("decor-gold");
    if (!this.el) return;
    $("btn-close-decor")?.addEventListener("click", () => this.close());
    this.el.addEventListener("pointerdown", (e) => {
      if (e.target === this.el) this.close();
    });
  }

  isOpen() {
    return !!this.el && !this.el.classList.contains("hidden");
  }

  // The cards shown for the open spot: what fits there, then "put away" if it holds something
  _entries() {
    const sp = SPOT.get(this.spotId);
    if (!sp) return [];
    const list = DECOR_ITEMS.filter((it) => it.kind === sp.kind).map((it) => ({ item: it }));
    // owned things first, then for sale, then keepsakes still to come
    const rank = (e) => (this.has(e.item.id) ? 0 : e.item.price ? 1 : 2);
    list.sort((a, b) => rank(a) - rank(b));
    if (this.placed[this.spotId]) list.push({ stow: true });
    return list;
  }

  open(spotId) {
    if (!this.el || !SPOT.has(spotId)) return;
    this.spotId = spotId;
    const list = this._entries();
    const cur = this.placed[spotId];
    this.sel = Math.max(0, list.findIndex((e) => e.item && e.item.id === cur));
    this.el.classList.remove("hidden");
    this.render();
  }

  close() {
    if (!this.el) return;
    this.el.classList.add("hidden");
  }

  move(d) {
    const n = this._entries().length;
    if (!n) return;
    this.sel = (this.sel + d + n) % n;
    this.render();
  }

  // Place the selected item here, buy it if it is for sale, or put away what stands here
  activate() {
    const e = this._entries()[this.sel];
    if (!e) return null;
    const spot = this.spotId;
    if (e.stow) {
      const id = this.placed[spot];
      this.stow(spot);
      this.sel = 0;
      this.render("收进储物箱了，想摆的时候再拿出来。");
      return { kind: "stow", item: ITEM.get(id) };
    }
    const it = e.item;
    if (this.has(it.id)) {
      if (this.placed[spot] === it.id) return { kind: "same", item: it };
      const from = this.spotOf(it.id);
      this.place(spot, it.id);
      this._selectItem(it.id);
      this.render();
      return { kind: from ? "move" : "place", item: it, from: from ? SPOT.get(from) : null };
    }
    if (it.price) {
      if (this.buy(it.id)) {
        this.place(spot, it.id);
        this._selectItem(it.id);
        this.render();
        return { kind: "buy", item: it };
      }
      this.render(`金币不够 ${it.price} G，先去出货箱卖点东西吧。`);
      return { kind: "poor", item: it };
    }
    return { kind: "locked", item: it };
  }

  _selectItem(id) {
    const i = this._entries().findIndex((e) => e.item && e.item.id === id);
    if (i >= 0) this.sel = i;
  }

  render(note = "") {
    if (!this.el) return;
    const sp = SPOT.get(this.spotId);
    if (!sp) return;
    if (this.elGold) this.elGold.textContent = `${this.getGold()} G`;
    if (this.elTitle) this.elTitle.textContent = sp.name;
    const list = this._entries();
    this.elCards.innerHTML = "";
    list.forEach((e, i) => {
      const card = document.createElement("button");
      card.type = "button";
      const cv = document.createElement("canvas");
      cv.className = "journal-art";
      const name = document.createElement("span");
      name.className = "journal-name";
      if (e.stow) {
        card.className = "journal-card decor-card found stow" + (this.sel === i ? " selected" : "");
        drawStowCard(cv);
        name.textContent = "收起来";
        card.append(cv, name);
      } else {
        const it = e.item;
        const owned = this.has(it.id);
        const here = this.placed[sp.id] === it.id;
        const where = owned && !here ? this.spotOf(it.id) : null;
        card.className = "journal-card decor-card" + (owned ? " found" : "") + (here ? " worn" : "") + (this.sel === i ? " selected" : "");
        drawDecorCard(cv, it, owned || !!it.price);
        name.textContent = owned || it.price ? it.name : "？？？";
        card.append(cv, name);
        if (!owned && it.price) {
          const tag = document.createElement("b");
          tag.className = "snowman-price";
          tag.textContent = `${it.price} G`;
          card.appendChild(tag);
        } else if (where) {
          const tag = document.createElement("b");
          tag.className = "decor-where";
          tag.textContent = "摆在别处";
          card.appendChild(tag);
        }
      }
      card.addEventListener("click", () => {
        const same = this.sel === i;
        this.sel = i;
        const it = e.item;
        // one tap places an owned piece or puts one away; buying needs a second tap
        if (e.stow || (it && this.has(it.id)) || same) {
          const r = this.activate();
          this._sound(r);
        } else this.render();
      });
      this.elCards.appendChild(card);
    });
    this.elDetail.innerHTML = "";
    const e = list[this.sel];
    if (!e) return;
    const h = document.createElement("strong");
    const p = document.createElement("p");
    if (e.stow) {
      const it = ITEM.get(this.placed[sp.id]);
      h.textContent = "收起来";
      p.textContent = `把${it ? it.name : "这里的摆设"}收进储物箱，空出这块地方。`;
    } else {
      const it = e.item;
      const here = this.placed[sp.id] === it.id;
      if (this.has(it.id)) {
        const where = this.spotOf(it.id);
        h.textContent = it.name + (here ? "（摆在这儿）" : "");
        let tip = "\n点一下（或按 E）摆到" + sp.name + "。";
        if (here) tip = "";
        else if (where) tip = `\n现在摆在${SPOT.get(where).name}，点一下（或按 E）搬到这儿来。`;
        p.textContent = it.line + tip;
      } else if (it.price) {
        h.textContent = `${it.name} · ${it.price} G`;
        p.textContent = it.line + `\n再点一下（或按 E）买下来摆到这儿，你有 ${this.getGold()} G。`;
      } else {
        h.textContent = "？？？";
        p.textContent = it.hint;
      }
    }
    if (note) p.textContent = note;
    this.elDetail.append(h, p);
  }

  _sound(r) {
    if (!r || !this.sound) return;
    if (r.kind === "buy") this.sound.questDone?.();
    else if (r.kind === "place" || r.kind === "move" || r.kind === "stow") this.sound.paperRustle?.();
  }
}

export function decorSpot(id) {
  return SPOT.get(id) || null;
}
