import * as THREE from "three";

// The lake snowman's wardrobe: hats, scarves and noses the player can put on him.
// Some are worn from the start, some are bought with gold, and some turn up as the
// player explores (a hat fished out of the lake, gifts for filling the journal pages,
// an icicle nose on a snowy day).
//
// The 3D pieces are small low-poly models, flat shaded, painted with per-triangle
// colours (knit ribs, stripes, plaid) in the warm cottage palette. Every piece is built
// around the snowman's head centre, facing +z.

export const SNOWMAN_SLOTS = [
  { slot: "hat", title: "帽子" },
  { slot: "scarf", title: "围巾" },
  { slot: "nose", title: "鼻子" },
];

export const SNOWMAN_ITEMS = [
  { id: "beanie", slot: "hat", name: "红毛线帽", free: true, line: "织得有点歪，但是很暖和。" },
  { id: "tophat", slot: "hat", name: "旧礼帽", how: { catch: true }, hint: "在镜湖冰钓时，偶尔会钓上来。", line: "从冰洞里钓上来的旧礼帽，晾干以后居然很体面。" },
  { id: "fisher", slot: "hat", name: "渔夫帽", how: { journal: "fish", n: 6 }, hint: "鱼类图鉴记下 6 种鱼后送来。", line: "帽檐软软的，正适合陪你冰钓。" },
  { id: "earmuffs", slot: "hat", name: "星星耳罩", how: { journal: "stars", n: 5 }, hint: "星图册找到 5 个星座后送来。", line: "毛茸茸的耳罩，两边各缀着一颗小星星。" },
  { id: "wreath", slot: "hat", name: "松枝花环", price: 150, line: "松枝和红浆果编成的小花环，闻起来有森林的味道。" },
  { id: "blue", slot: "scarf", name: "蓝色毛线围巾", free: true, line: "最早给雪人织的那条，针脚密密的。" },
  { id: "stripe", slot: "scarf", name: "红白条纹围巾", price: 60, line: "像拐杖糖一样的红白条纹，过节就该戴它。" },
  { id: "plaid", slot: "scarf", name: "松林格纹围巾", price: 60, line: "墨绿和红色的格子，和松林很配。" },
  { id: "gold", slot: "scarf", name: "金色围巾", how: { both: true }, hint: "星图册和鱼类图鉴都集齐后送来。", line: "金灿灿的围巾，奖励认识了整个冬麓的你和雪人。" },
  { id: "carrot", slot: "nose", name: "胡萝卜鼻子", free: true, line: "经典款，又脆又甜（请不要吃）。" },
  { id: "pinecone", slot: "nose", name: "松果鼻子", price: 40, line: "从松林里捡来的小松果。" },
  { id: "berry", slot: "nose", name: "红浆果鼻子", price: 40, line: "圆圆的红鼻子，让雪人看起来有点害羞。" },
  { id: "icicle", slot: "nose", name: "冰锥鼻子", how: { snow: 2 }, hint: "下大雪的时候，来和雪人打个招呼。", line: "大雪天屋檐上掰下来的冰锥，亮晶晶的。" },
];

const ITEM = new Map(SNOWMAN_ITEMS.map((it) => [it.id, it]));
export const SNOWMAN_DEFAULT_WEAR = { hat: "beanie", scarf: "blue", nose: "carrot" };

// ---------------------------------------------------------------------------
//  3D pieces
// ---------------------------------------------------------------------------
let MATS = null;
function mats() {
  if (MATS) return MATS;
  MATS = {
    paint: new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.92, side: THREE.DoubleSide }),
    gloss: new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.35, side: THREE.DoubleSide }),
    ice: new THREE.MeshStandardMaterial({ color: 0xd6eeff, emissive: 0x2a4a66, emissiveIntensity: 0.25, flatShading: true, roughness: 0.18, metalness: 0.05 }),
  };
  return MATS;
}

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c3 = new THREE.Vector3();
const _col = new THREE.Color();
// Colour every triangle from its centroid (so knit ribs, stripes and plaid follow the
// model's own shape) and keep the flat-shaded look.
function paint(geo, fn) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  if (g !== geo) geo.dispose();
  const pos = g.attributes.position;
  const uv = g.attributes.uv;
  const cols = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i += 3) {
    _a.fromBufferAttribute(pos, i);
    _b.fromBufferAttribute(pos, i + 1);
    _c3.fromBufferAttribute(pos, i + 2);
    const cx = (_a.x + _b.x + _c3.x) / 3;
    const cy = (_a.y + _b.y + _c3.y) / 3;
    const cz = (_a.z + _b.z + _c3.z) / 3;
    const u = uv ? (uv.getX(i) + uv.getX(i + 1) + uv.getX(i + 2)) / 3 : 0;
    const v = uv ? (uv.getY(i) + uv.getY(i + 1) + uv.getY(i + 2)) / 3 : 0;
    _col.set(fn(cx, cy, cz, u, v, i / 3));
    for (let k = 0; k < 3; k++) {
      cols[(i + k) * 3] = _col.r;
      cols[(i + k) * 3 + 1] = _col.g;
      cols[(i + k) * 3 + 2] = _col.b;
    }
  }
  g.setAttribute("color", new THREE.BufferAttribute(cols, 3));
  g.computeVertexNormals();
  return g;
}

function mesh(geo, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}

const ang = (x, z) => Math.atan2(z, x) + Math.PI; // 0..2PI around the head
const band = (a, n) => Math.floor((a / (Math.PI * 2)) * n);

function starShape(r1, r2, pts = 5) {
  const s = new THREE.Shape();
  for (let i = 0; i <= pts * 2; i++) {
    const r = i % 2 ? r2 : r1;
    const t = (i / (pts * 2)) * Math.PI * 2 + Math.PI / 2;
    const x = Math.cos(t) * r;
    const y = Math.sin(t) * r;
    if (i === 0) s.moveTo(x, y);
    else s.lineTo(x, y);
  }
  return s;
}

function buildHat(id) {
  const M = mats();
  const g = new THREE.Group();
  if (id === "beanie") {
    const prof = [
      [0.212, 0.1], [0.214, 0.17], [0.202, 0.24], [0.172, 0.3], [0.124, 0.35], [0.064, 0.378], [0, 0.386],
    ].map(([x, y]) => new THREE.Vector2(x, y));
    g.add(mesh(paint(new THREE.LatheGeometry(prof, 14), (x, y, z) => (band(ang(x, z), 14) % 2 ? 0xb83a30 : 0xcc4a3a)), M.paint));
    g.add(mesh(paint(new THREE.TorusGeometry(0.205, 0.042, 5, 16).rotateX(Math.PI / 2), (x, y, z) => (band(ang(x, z), 16) % 2 ? 0xf1e3c4 : 0xe4d2ae)), M.paint, 0, 0.115, 0));
    g.add(mesh(paint(new THREE.IcosahedronGeometry(0.072, 1), (x, y) => (y > 0.02 ? 0xfaf0da : 0xe8d8b6)), M.paint, -0.03, 0.43, 0));
    g.rotation.set(0.02, 0, 0.13);
  } else if (id === "tophat") {
    const dark = (x, y, z) => (band(ang(x, z), 12) % 2 ? 0x2c2a33 : 0x34313c);
    g.add(mesh(paint(new THREE.CylinderGeometry(0.29, 0.3, 0.028, 18), (x, y) => (y > 0 ? 0x3a3742 : 0x24222a)), M.paint, 0, 0.165, 0));
    g.add(mesh(paint(new THREE.CylinderGeometry(0.178, 0.165, 0.32, 12, 1), dark), M.paint, 0, 0.34, 0));
    g.add(mesh(paint(new THREE.CylinderGeometry(0.17, 0.17, 0.06, 12, 1, true), () => 0x9c2f35), M.paint, 0, 0.215, 0));
    // a sprig tucked in the band, and a little patch from its time in the lake
    const sprig = mesh(paint(new THREE.ConeGeometry(0.03, 0.13, 4), () => 0x5c8a4a), M.paint, 0.15, 0.27, 0.08);
    sprig.rotation.z = -0.5;
    g.add(sprig);
    g.add(mesh(paint(new THREE.BoxGeometry(0.06, 0.05, 0.01), () => 0x4a4656), M.paint, -0.06, 0.38, 0.172));
    g.rotation.set(-0.05, 0, -0.1);
  } else if (id === "fisher") {
    const prof = [
      [0.318, 0.058], [0.29, 0.082], [0.245, 0.112], [0.198, 0.13], [0.192, 0.2], [0.186, 0.27], [0.16, 0.305], [0.09, 0.322], [0, 0.326],
    ].map(([x, y]) => new THREE.Vector2(x, y));
    g.add(
      mesh(
        paint(new THREE.LatheGeometry(prof, 14), (x, y, z) => {
          if (y < 0.135) return band(ang(x, z), 28) % 2 ? 0xb39a63 : 0xa88d57; // stitched brim
          if (y < 0.16) return 0x6f5b3a; // band
          return band(ang(x, z), 14) % 2 ? 0xc6ae74 : 0xbba36a;
        }),
        M.paint,
      ),
    );
    g.add(mesh(paint(new THREE.CylinderGeometry(0.196, 0.198, 0.035, 14, 1, true), () => 0x6f5b3a), M.paint, 0, 0.15, 0));
    // a tiny fish badge on the band
    const fish = new THREE.Shape();
    fish.moveTo(-0.04, 0);
    fish.quadraticCurveTo(0, 0.025, 0.035, 0);
    fish.quadraticCurveTo(0, -0.025, -0.04, 0);
    fish.lineTo(-0.06, 0.02);
    fish.lineTo(-0.06, -0.02);
    fish.lineTo(-0.04, 0);
    g.add(mesh(paint(new THREE.ShapeGeometry(fish), () => 0x8fc7de), M.gloss, 0.02, 0.15, 0.201));
    g.rotation.set(0.06, 0, 0.05);
  } else if (id === "earmuffs") {
    g.add(mesh(paint(new THREE.TorusGeometry(0.236, 0.02, 5, 16, Math.PI), (x, y, z) => (band(ang(x, y), 16) % 2 ? 0xd9a441 : 0xc8923a)), M.paint, 0, 0.0, 0));
    for (const sx of [-1, 1]) {
      const muff = mesh(
        paint(new THREE.IcosahedronGeometry(0.088, 1), (x, y, z) => ((Math.floor((y + 0.1) * 40) + Math.floor((z + 0.1) * 40)) % 3 ? 0xf3b8c4 : 0xfbd3dc)),
        M.paint,
        sx * 0.238,
        -0.01,
        0,
      );
      muff.scale.set(0.62, 1, 1);
      g.add(muff);
      const star = mesh(paint(new THREE.ShapeGeometry(starShape(0.05, 0.022)), () => 0xffd75a), M.gloss, sx * 0.297, -0.01, 0);
      star.rotation.y = sx * Math.PI / 2;
      g.add(star);
    }
  } else if (id === "wreath") {
    const greens = [0x3f6e45, 0x4d8250, 0x355f3d, 0x5a9157];
    g.add(mesh(paint(new THREE.TorusGeometry(0.168, 0.05, 6, 18).rotateX(Math.PI / 2), (x, y, z, u, v, i) => greens[(i * 7 + band(ang(x, z), 18)) % 4]), M.paint, 0, 0.16, 0));
    // pine needle tufts
    for (let k = 0; k < 9; k++) {
      const t = (k / 9) * Math.PI * 2;
      const tuft = mesh(paint(new THREE.ConeGeometry(0.03, 0.1, 4), () => greens[k % 4]), M.paint, Math.cos(t) * 0.19, 0.19, Math.sin(t) * 0.19);
      tuft.rotation.set(Math.sin(t) * 0.9, 0, -Math.cos(t) * 0.9);
      g.add(tuft);
    }
    for (let k = 0; k < 7; k++) {
      const t = (k / 7) * Math.PI * 2 + 0.3;
      g.add(mesh(paint(new THREE.IcosahedronGeometry(0.026, 0), (x, y) => (y > 0.01 ? 0xe8584a : 0xb8322c)), M.gloss, Math.cos(t) * 0.17, 0.205, Math.sin(t) * 0.17));
    }
    g.rotation.set(0.05, 0, 0.08);
  }
  return g;
}

const SCARF_PAINT = {
  blue: (x, y, z, u, v, i) => (band(u * Math.PI * 2, 22) % 2 ? 0x3f72b8 : 0x4a80c6),
  stripe: (x, y, z, u) => (band(u * Math.PI * 2, 12) % 2 ? 0xf4ecdc : 0xc23a34),
  plaid: (x, y, z, u, v) => {
    const a = band(u * Math.PI * 2, 12) % 3 === 0;
    const b = Math.floor(v * 6) % 3 === 0;
    return a && b ? 0xb8433a : a || b ? 0x2f5a3c : 0x3f7048;
  },
  gold: (x, y, z, u, v) => ((band(u * Math.PI * 2, 14) + Math.floor(v * 4)) % 2 ? 0xe6b23d : 0xf2c95a),
};
// The hanging tail is painted along its length instead of around it.
const TAIL_PAINT = {
  blue: (x, y) => (Math.floor((y + 0.2) * 22) % 2 ? 0x3f72b8 : 0x4a80c6),
  stripe: (x, y) => (Math.floor((y + 0.2) * 14) % 2 ? 0xf4ecdc : 0xc23a34),
  plaid: (x, y) => {
    const a = Math.floor((y + 0.2) * 14) % 3 === 0;
    const b = Math.floor((x + 0.2) * 60) % 3 === 0;
    return a && b ? 0xb8433a : a || b ? 0x2f5a3c : 0x3f7048;
  },
  gold: (x, y) => (Math.floor((y + 0.2) * 16) % 2 ? 0xe6b23d : 0xf2c95a),
};
const FRINGE = { blue: 0x2e5a96, stripe: 0xc23a34, plaid: 0xb8433a, gold: 0xc9952e };

function buildScarf(id) {
  const M = mats();
  const g = new THREE.Group();
  const ring = mesh(paint(new THREE.TorusGeometry(0.2, 0.056, 6, 22).rotateX(Math.PI / 2), SCARF_PAINT[id] || SCARF_PAINT.blue), M.paint, 0, -0.17, 0);
  ring.scale.set(1, 1.15, 1);
  g.add(ring);
  // the knot and the tail hanging over the chest, slightly blown to one side
  g.add(mesh(paint(new THREE.IcosahedronGeometry(0.058, 1), (TAIL_PAINT[id] || TAIL_PAINT.blue)), M.paint, -0.11, -0.19, 0.17));
  const tailGeo = new THREE.CylinderGeometry(0.052, 0.062, 0.32, 6, 4);
  tailGeo.scale(1, 1, 0.38);
  const tail = mesh(paint(tailGeo, TAIL_PAINT[id] || TAIL_PAINT.blue), M.paint, -0.12, -0.32, 0.29);
  tail.rotation.set(-0.28, 0, 0.16);
  g.add(tail);
  for (let k = 0; k < 4; k++) {
    const f = mesh(paint(new THREE.ConeGeometry(0.012, 0.05, 3), () => FRINGE[id] || FRINGE.blue), M.paint, -0.039 + k * 0.026, -0.18, 0);
    f.rotation.x = Math.PI;
    tail.add(f);
  }
  return g;
}

function buildNose(id) {
  const M = mats();
  const g = new THREE.Group();
  if (id === "carrot") {
    const geo = new THREE.ConeGeometry(0.048, 0.25, 6, 3).rotateX(Math.PI / 2);
    g.add(mesh(paint(geo, (x, y, z) => (Math.floor(z * 30) % 2 ? 0xe9762a : 0xf28a35)), M.paint, 0, -0.005, 0.315));
    g.rotation.x = 0.12;
  } else if (id === "pinecone") {
    const geo = new THREE.ConeGeometry(0.064, 0.16, 7, 4).rotateX(Math.PI / 2);
    g.add(mesh(paint(geo, (x, y, z) => ((band(ang(x, y), 7) + Math.floor(z * 40)) % 2 ? 0x7a4e2c : 0x9a6638)), M.paint, 0, 0, 0.29));
  } else if (id === "berry") {
    g.add(mesh(paint(new THREE.IcosahedronGeometry(0.058, 1), (x, y) => (y > 0.025 ? 0xf06a5a : y > -0.02 ? 0xd8443a : 0xb2322c)), M.gloss, 0, 0, 0.255));
    const leaf = new THREE.Shape();
    leaf.moveTo(0, 0);
    leaf.quadraticCurveTo(0.03, 0.03, 0.06, 0);
    leaf.quadraticCurveTo(0.03, -0.012, 0, 0);
    const lm = mesh(paint(new THREE.ShapeGeometry(leaf), () => 0x5c8a4a), M.paint, 0.0, 0.05, 0.25);
    lm.rotation.set(-1.0, 0, 0.5);
    g.add(lm);
  } else if (id === "icicle") {
    const geo = new THREE.ConeGeometry(0.036, 0.23, 5, 1).rotateX(Math.PI / 2);
    g.add(mesh(geo, M.ice, 0, -0.01, 0.325));
    g.rotation.x = 0.08;
  }
  return g;
}

export function buildSnowmanPiece(slot, id) {
  if (slot === "hat") return buildHat(id);
  if (slot === "scarf") return buildScarf(id);
  return buildNose(id);
}

// ---------------------------------------------------------------------------
//  Card art (pixel icons, 32x32)
// ---------------------------------------------------------------------------
function drawItemCard(canvas, it, owned) {
  const W = 40;
  const H = 34;
  canvas.width = W;
  canvas.height = H;
  const g = canvas.getContext && canvas.getContext("2d");
  if (!g) return;
  g.imageSmoothingEnabled = false;
  const grad = g.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, owned ? "#dceefa" : "#c3ccd2");
  grad.addColorStop(1, owned ? "#a9cce4" : "#97a4ad");
  g.fillStyle = grad;
  g.fillRect(0, 0, W, H);
  g.fillStyle = "rgba(255,255,255,0.55)";
  for (const [x, y] of [[4, 5], [33, 8], [9, 25], [30, 27], [20, 3]]) g.fillRect(x, y, 1, 1);
  const sil = !owned;
  const c = (col) => (sil ? "#4a5560" : col);
  const R = (x, y, w, h, col) => {
    g.fillStyle = c(col);
    g.fillRect(x, y, w, h);
  };
  const disc = (cx, cy, r, col, ry = r, yMax = 99, raw = false) => {
    g.fillStyle = raw ? col : c(col);
    for (let y = -Math.ceil(ry); y <= Math.ceil(ry); y++)
      for (let x = -Math.ceil(r); x <= Math.ceil(r); x++)
        if ((x * x) / (r * r) + (y * y) / (ry * ry) <= 1 && cy + y <= yMax) g.fillRect(cx + x, cy + y, 1, 1);
  };
  // a snowy head peeks out under hats, a neck under scarves, a face under noses
  // (the snow stays white on locked cards; only the piece itself is a silhouette)
  const snow = (cx, cy, r, ry) => disc(cx, cy, r, sil ? "#e6edf2" : "#f7fbff", ry, 99, true);
  const head = (cy) => snow(20, cy, 9, 8);
  const face = () => {
    snow(20, 17, 13, 12);
    g.fillStyle = "#22242c";
    g.fillRect(12, 12, 3, 3);
    g.fillRect(25, 12, 3, 3);
  };
  switch (it.id) {
    case "beanie":
      head(25);
      disc(20, 17, 10, "#c8443a", 8, 18);
      for (let x = 11; x <= 29; x += 2)
        for (let y = 9; y <= 18; y++) if (((x - 20) * (x - 20)) / 100 + ((y - 17) * (y - 17)) / 64 <= 1) R(x, y, 1, 1, "#b03a30");
      R(9, 18, 23, 4, "#efe0c0");
      for (let x = 10; x < 31; x += 3) R(x, 19, 1, 2, "#d9c49c");
      disc(20, 7, 3, "#fbf2de");
      break;
    case "tophat":
      head(27);
      R(13, 5, 14, 14, "#2f2d36");
      R(13, 5, 3, 14, "#3d3a46");
      R(13, 15, 14, 3, "#9c2f35");
      R(7, 19, 26, 3, "#24222a");
      R(26, 12, 2, 4, "#5c8a4a");
      break;
    case "fisher":
      head(26);
      disc(20, 15, 8, "#c2a96f", 7);
      R(12, 15, 17, 4, "#c2a96f");
      R(12, 16, 17, 2, "#6f5b3a");
      R(6, 19, 29, 3, "#a88d57");
      for (let x = 7; x < 34; x += 2) R(x, 21, 1, 1, "#8f774a");
      R(17, 16, 5, 2, "#8fc7de");
      break;
    case "earmuffs":
      head(20);
      for (let a = 0; a <= 20; a++) {
        const t = Math.PI * (a / 20);
        R(Math.round(20 - Math.cos(t) * 11), Math.round(18 - Math.sin(t) * 12), 2, 2, "#d9a441");
      }
      disc(8, 20, 4, "#f3b8c4", 5);
      disc(32, 20, 4, "#f3b8c4", 5);
      R(7, 19, 3, 3, "#ffd75a");
      R(31, 19, 3, 3, "#ffd75a");
      break;
    case "wreath":
      head(25);
      disc(20, 16, 12, "#3f6e45", 5);
      snow(20, 16, 7, 2.5);
      g.fillStyle = sil ? "#e6edf2" : "#f7fbff";
      g.fillRect(13, 14, 15, 3);
      for (const [x, y] of [[10, 15], [15, 12], [24, 12], [29, 15], [20, 20], [13, 19]]) R(x, y, 2, 2, "#e04f42");
      for (const [x, y] of [[8, 17], [31, 16], [19, 11]]) R(x, y, 2, 1, "#5a9157");
      break;
    case "blue":
    case "stripe":
    case "plaid":
    case "gold": {
      const pal = {
        blue: ["#3f72b8", "#4a80c6"],
        stripe: ["#c23a34", "#f4ecdc"],
        plaid: ["#3f7048", "#2f5a3c", "#b8433a"],
        gold: ["#e6b23d", "#f2c95a"],
      }[it.id];
      snow(20, 8, 8, 6);
      snow(20, 30, 12, 8);
      for (let x = 7; x <= 33; x++) {
        const k = Math.floor((x - 7) / 3);
        const col = it.id === "plaid" ? (k % 3 === 0 ? pal[2] : pal[k % 2]) : pal[k % 2];
        R(x, 13, 1, 6, col);
      }
      for (let y = 18; y <= 31; y++) {
        const k = Math.floor((y - 18) / 3);
        const col = it.id === "plaid" ? (k % 3 === 0 ? pal[2] : pal[k % 2]) : pal[k % 2];
        R(12 + Math.floor((y - 18) / 5), y, 5, 1, col);
      }
      for (let k = 0; k < 3; k++) R(14 + k * 2, 32, 1, 2, pal[0]);
      break;
    }
    case "carrot":
      face();
      for (let k = 0; k < 14; k++) R(18 + k, 17 + Math.floor(k / 5), 1, Math.max(1, 4 - Math.floor(k / 4)), k % 3 ? "#f28a35" : "#d96a22");
      break;
    case "pinecone":
      face();
      for (let k = 0; k < 12; k++) {
        const h = Math.max(1, Math.round(4.5 - k * 0.38));
        R(18 + k, 19 - h + (k > 8 ? 1 : 0), 1, h * 2 - (k > 8 ? 1 : 0), (k + Math.floor(k / 2)) % 3 ? "#8a5a32" : "#5f3c20");
      }
      break;
    case "berry":
      face();
      disc(20, 19, 4, "#d8443a");
      R(18, 17, 2, 2, "#f59a8c");
      R(21, 13, 3, 2, "#5c8a4a");
      break;
    case "icicle":
      face();
      for (let k = 0; k < 13; k++) R(18 + k, 18 + Math.floor(k / 4), 1, Math.max(1, 3 - Math.floor(k / 5)), k % 2 ? "#b9ddfa" : "#7fb5e0");
      R(19, 18, 3, 1, "#eef8ff");
      break;
    default:
      break;
  }
}

// ---------------------------------------------------------------------------
//  Wardrobe state + panel
// ---------------------------------------------------------------------------
export class SnowmanWardrobe {
  // getGold() -> number, spendGold(n) -> bool, onWear(wear), onUnlock(item), onChange()
  constructor({ getGold, spendGold, onWear, onDress, onChange, sound } = {}) {
    this.onDress = onDress;
    this.getGold = getGold || (() => 0);
    this.spendGold = spendGold || (() => false);
    this.onWear = onWear;
    this.onChange = onChange;
    this.sound = sound;
    this.reset(false);
    this._bindDom();
  }

  reset(notify = true) {
    this.owned = SNOWMAN_ITEMS.filter((it) => it.free).map((it) => it.id);
    this.wear = { ...SNOWMAN_DEFAULT_WEAR };
    this.sel = { slot: 0, idx: 0 };
    if (notify && this.onWear) this.onWear(this.wear);
  }

  has(id) {
    return this.owned.includes(id);
  }

  getState() {
    return { owned: [...this.owned], wear: { ...this.wear } };
  }

  restoreState(s) {
    if (!s || typeof s !== "object") return;
    if (Array.isArray(s.owned)) this.owned = Array.from(new Set([...this.owned, ...s.owned.filter((id) => ITEM.has(id))]));
    if (s.wear && typeof s.wear === "object") {
      for (const { slot } of SNOWMAN_SLOTS) {
        const id = s.wear[slot];
        if (ITEM.has(id) && ITEM.get(id).slot === slot && this.has(id)) this.wear[slot] = id;
      }
    }
    if (this.onWear) this.onWear(this.wear);
  }

  // Give an item (returns the item if it is new)
  unlock(id) {
    const it = ITEM.get(id);
    if (!it || this.has(id)) return null;
    this.owned.push(id);
    if (this.onChange) this.onChange();
    if (this.isOpen()) this.render();
    return it;
  }

  // Gifts that came due: journal milestones and weather. Returns the new items.
  checkUnlocks({ journal, snowLevel } = {}) {
    const got = [];
    for (const it of SNOWMAN_ITEMS) {
      if (this.has(it.id) || !it.how) continue;
      const h = it.how;
      let ok = false;
      if (h.journal && journal) ok = journal.count(h.journal) >= h.n;
      else if (h.both && journal) ok = journal.count("stars") >= journal.total("stars") && journal.count("fish") >= journal.total("fish");
      else if (h.snow != null) ok = (snowLevel || 0) >= h.snow;
      if (ok) {
        const n = this.unlock(it.id);
        if (n) got.push(n);
      }
    }
    return got;
  }

  put(id) {
    const it = ITEM.get(id);
    if (!it || !this.has(id)) return false;
    this.wear[it.slot] = id;
    if (this.onWear) this.onWear(this.wear);
    if (this.onChange) this.onChange();
    return true;
  }

  buy(id) {
    const it = ITEM.get(id);
    if (!it || this.has(id) || !it.price) return false;
    if (!this.spendGold(it.price)) return false;
    this.owned.push(id);
    this.put(id);
    return true;
  }

  // ---------- panel ----------
  _bindDom() {
    const $ = (id) => (typeof document !== "undefined" && document.getElementById ? document.getElementById(id) : null);
    this.el = $("snowman-modal");
    this.elRows = $("snowman-rows");
    this.elDetail = $("snowman-detail");
    this.elGold = $("snowman-gold");
    if (!this.el) return;
    $("btn-close-snowman")?.addEventListener("click", () => this.close());
    this.el.addEventListener("pointerdown", (e) => {
      if (e.target === this.el) this.close();
    });
  }

  isOpen() {
    return !!this.el && !this.el.classList.contains("hidden");
  }

  open() {
    if (!this.el) return;
    // start on the hat being worn
    const list = this._slotItems(0);
    this.sel = { slot: 0, idx: Math.max(0, list.findIndex((it) => it.id === this.wear.hat)) };
    this.el.classList.remove("hidden");
    this.render();
  }

  close() {
    if (!this.el) return;
    this.el.classList.add("hidden");
  }

  _slotItems(i) {
    return SNOWMAN_ITEMS.filter((it) => it.slot === SNOWMAN_SLOTS[i].slot);
  }

  move(dx, dy) {
    const nSlots = SNOWMAN_SLOTS.length;
    let { slot, idx } = this.sel;
    if (dy) {
      slot = (slot + dy + nSlots) % nSlots;
      idx = Math.min(idx, this._slotItems(slot).length - 1);
    }
    if (dx) {
      const n = this._slotItems(slot).length;
      idx = (idx + dx + n) % n;
    }
    this.sel = { slot, idx };
    this.render();
  }

  // Wear the selected item, or buy it if it is for sale
  activate() {
    const it = this._slotItems(this.sel.slot)[this.sel.idx];
    if (!it) return null;
    if (this.has(it.id)) {
      if (this.wear[it.slot] === it.id) return { kind: "same", item: it };
      this.put(it.id);
      if (this.onDress) this.onDress(it);
      this.render();
      return { kind: "wear", item: it };
    }
    if (it.price) {
      if (this.buy(it.id)) {
        if (this.onDress) this.onDress(it);
        this.render();
        return { kind: "buy", item: it };
      }
      this.render(`金币不够 ${it.price} G，先去出货箱卖点东西吧。`);
      return { kind: "poor", item: it };
    }
    return { kind: "locked", item: it };
  }

  render(note = "") {
    if (!this.el) return;
    if (this.elGold) this.elGold.textContent = `${this.getGold()} G`;
    this.elRows.innerHTML = "";
    SNOWMAN_SLOTS.forEach((s, si) => {
      const row = document.createElement("div");
      row.className = "snowman-row";
      const t = document.createElement("span");
      t.className = "snowman-row-title";
      t.textContent = s.title;
      row.appendChild(t);
      const cards = document.createElement("div");
      cards.className = "snowman-cards";
      this._slotItems(si).forEach((it, ii) => {
        const owned = this.has(it.id);
        const card = document.createElement("button");
        card.type = "button";
        card.className =
          "journal-card snowman-card" +
          (owned ? " found" : "") +
          (this.wear[it.slot] === it.id ? " worn" : "") +
          (this.sel.slot === si && this.sel.idx === ii ? " selected" : "");
        const cv = document.createElement("canvas");
        cv.className = "journal-art";
        drawItemCard(cv, it, owned);
        const name = document.createElement("span");
        name.className = "journal-name";
        name.textContent = owned || it.price ? it.name : "？？？";
        card.append(cv, name);
        if (!owned && it.price) {
          const tag = document.createElement("b");
          tag.className = "snowman-price";
          tag.textContent = `${it.price} G`;
          card.appendChild(tag);
        }
        card.addEventListener("click", () => {
          const same = this.sel.slot === si && this.sel.idx === ii;
          this.sel = { slot: si, idx: ii };
          // one tap wears an owned piece; a piece for sale needs a second tap to buy
          if (owned || same) {
            const r = this.activate();
            if (r && r.kind === "buy" && this.sound) this.sound.questDone?.();
            else if (r && r.kind === "wear" && this.sound) this.sound.paperRustle?.();
          } else this.render();
        });
        cards.appendChild(card);
      });
      row.appendChild(cards);
      this.elRows.appendChild(row);
    });
    const it = this._slotItems(this.sel.slot)[this.sel.idx];
    this.elDetail.innerHTML = "";
    if (!it) return;
    const h = document.createElement("strong");
    const p = document.createElement("p");
    if (this.has(it.id)) {
      h.textContent = it.name + (this.wear[it.slot] === it.id ? "（戴着呢）" : "");
      p.textContent = it.line + (this.wear[it.slot] === it.id ? "" : "\n点一下（或按 E）给雪人戴上。");
    } else if (it.price) {
      h.textContent = `${it.name} · ${it.price} G`;
      p.textContent = it.line + `\n再点一下（或按 E）买下来，你有 ${this.getGold()} G。`;
    } else {
      h.textContent = "？？？";
      p.textContent = it.hint;
    }
    if (note) p.textContent = note;
    this.elDetail.append(h, p);
  }
}
