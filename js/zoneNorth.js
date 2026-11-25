// =====================================================================
//  北：山脚小径 + 温泉 + 观星台 (NorthSpringZone)
//  Layout lives in zones.js (NORTH_TRAIL, HOT_SPRING_AREA, STARGAZE_SPUR, STARGAZE_AREA).
//
//  Zone module interface (shared with zoneSouth.js), used by world.js / main.js:
//    constructor(world, textures)  build meshes into world.group; use world._addBoxCollider /
//                                  world._addCircleCollider for solid props
//    getSurface(x, z)              -> { y, surface: "snow"|"wood"|"stone", slopeX? } or null (null = flat snow)
//    update(dt, elapsed, nightFactor, playerPos, lampGlow)
//    getInteractions(playerPos)    -> [{ id, x, z, name, label, reach?, tapR?, anchorY?, allowClick? }]
//    interact(id, ctx)             ctx: { toast, popup, emote, bless, sound, inventory, refreshUI, burst,
//                                         timeHours, nightFactor, day, player }
//
//  What lives here:
//    - stone stepping path from the cottage avenue north along NORTH_TRAIL, with a little
//      plank footbridge over a frozen runnel, snowy spruces, three lantern posts and signposts
//    - the rock-ringed hot spring (steam, shimmering water, deck, towel rack, bucket, slippers,
//      floating tea tray, changing shed, two stone lanterns, trail-marker cairn, frozen waterfall)
//    - the raised stargazing platform with stairs, railing, fairy lights, brass telescope,
//      bench and star chart
//    - a deer that shows up at the treeline at dusk and bounds off when you come close
// =====================================================================

import * as THREE from "three";
import { CONSTELLATIONS } from "./journal.js";
import { makeSnowDriftGeometry } from "./landscape.js";
import { NORTH_TRAIL, STARGAZE_SPUR, YARD_RECT } from "./zones.js";

function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
function smoothstep(e0, e1, x) {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
}

// ---------------------------------------------------------------------
//  Layout (all world coordinates, +X east, -Z north)
// ---------------------------------------------------------------------

// Hot spring pool: an organic blob, cut straight on its south side where the wooden deck sits
export const POOL = { cx: -3.4, cz: -41.6, cutZ: -39.2 };
const WATER_Y = 0.06; // water surface height (the pool basin is raised by its rock ring)
const POOL_BOTTOM = -0.38; // player's feet when standing in the middle of the pool (waist-deep look)
const POOL_SLOPE = 1.1; // metres from the edge until full depth
function poolR(t) {
  return 3.05 + 0.28 * Math.sin(3 * t + 0.7) + 0.16 * Math.sin(5 * t + 2.1);
}
function poolBlobSd(x, z) {
  const dx = x - POOL.cx;
  const dz = z - POOL.cz;
  return Math.hypot(dx, dz) - poolR(Math.atan2(dz, dx));
}
export function poolSd(x, z) {
  return Math.max(poolBlobSd(x, z), z - POOL.cutZ);
}

// Where the blob crosses the deck cut -> deck width
const CHORD = (() => {
  let mn = Infinity;
  let mx = -Infinity;
  for (let i = 0; i < 1440; i++) {
    const t = (i / 1440) * Math.PI * 2;
    const r = poolR(t);
    const z = POOL.cz + r * Math.sin(t);
    if (z > POOL.cutZ) {
      const x = POOL.cx + r * Math.cos(t);
      mn = Math.min(mn, x);
      mx = Math.max(mx, x);
    }
  }
  return { minX: mn, maxX: mx };
})();
const DECK_Y = 0.12;
export const SPRING_DECK = { minX: CHORD.minX - 0.28, maxX: CHORD.maxX + 0.28, minZ: POOL.cutZ, maxZ: -36.9 };

// Stargazing platform: a square deck on posts, rotated so its stairs face down the spur
export const PLAT = { cx: -17.6, cz: -47.6, h: 0.85, half: 2.0, stairL0: -3.75, stairL1: -2.0, stairHalfW: 0.7 };
const S2 = Math.SQRT1_2;
const PU = { x: -S2, z: -S2 }; // platform local +x (toward the far rail, north-west)
const PV = { x: S2, z: -S2 }; // platform local +z
const PLAT_ROT = (3 * Math.PI) / 4; // rotation.y that maps local +x -> PU, local +z -> PV
function platLocal(x, z) {
  const dx = x - PLAT.cx;
  const dz = z - PLAT.cz;
  return { u: dx * PU.x + dz * PU.z, v: dx * PV.x + dz * PV.z };
}
function platWorld(u, v) {
  return { x: PLAT.cx + u * PU.x + v * PV.x, z: PLAT.cz + u * PU.z + v * PV.z };
}

// Little plank footbridge over a frozen runnel, on the trail segment (-7.8,-14.5)->(-6.6,-21)
const BRIDGE = (() => {
  const [a, b] = [NORTH_TRAIL.pts[2], NORTH_TRAIL.pts[3]];
  const z = -18.3;
  const t = (z - a[1]) / (b[1] - a[1]);
  const x = a[0] + (b[0] - a[0]) * t;
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const tx = (b[0] - a[0]) / len;
  const tz = (b[1] - a[1]) / len;
  return { x, z, tx, tz, nx: -tz, nz: tx, halfLen: 1.15, halfW: 0.64, arch: 0.16 };
})();

// Frozen waterfall on the rocky step behind the spring
const FALL = { x: -3.6, z: -51.4 };
const FALL_ICE = { x: FALL.x + 0.2, z: FALL.z + 1.25, r: 1.2 };

// Walking lines that the stepping stones follow beyond the trail (and that the tests walk)
export const SPRING_WALK = [
  [-5.2, -31.0],
  [-4.9, -33.2],
  [-4.2, -36.75],
];
export const PLATFORM_WALK = [
  [-4.9, -33.2],
  [-8.6, -36.4],
  [-12.0, -42.0],
  [-14.6, -44.6],
  [-14.98, -44.98],
];

const SIGN_POS = { x: -9.4, z: -3.45, rot: 0.3 };
const FORK_SIGN_POS = { x: -6.3, z: -32.6 };
const CAIRN_POS = { x: -2.9, z: -32.4 };
const LAMP_SPECS = [
  [-6.27, -16.0, Math.PI],
  [-7.31, -24.5, 0],
  [-11.33, -38.58, 0.545],
];
const STONE_LANTERNS = [
  [-6.75, -37.3],
  [1.0, -43.8],
];
const SHED = { x: 0.75, z: -37.5, w: 1.7, d: 1.5 };
const DEER_HOME = { x: 3.3, z: -47.9 };

// [x, z, scale]
const TREE_SPECS = [
  // lining the trail
  [-10.3, -15.2, 1.25], [-4.6, -15.9, 1.05], [-10.0, -20.6, 1.35], [-3.9, -22.3, 1.2],
  [-9.6, -23.2, 1.15], [-3.2, -26.0, 1.3], [-8.5, -27.2, 1.05], [-3.0, -29.6, 1.15],
  [-8.4, -30.2, 1.25],
  // saplings
  [-9.0, -17.0, 0.62], [-4.6, -20.2, 0.7], [-2.3, -24.0, 0.62],
  // around the spring
  [-13.2, -34.5, 1.3], [-14.8, -38.4, 1.2], [-10.5, -48.5, 1.35], [-7.3, -49.6, 1.25],
  [0.6, -49.2, 1.3], [3.4, -35.0, 1.1], [1.8, -31.4, 1.2], [-1.2, -30.6, 1.0], [3.0, -42.0, 1.15],
  // framing the stargazing platform
  [-23.6, -44.2, 1.3], [-23.0, -49.8, 1.2], [-13.6, -50.8, 1.15], [-21.0, -41.4, 1.1],
];

const FONT = "'STKaiti','KaiTi','Kaiti SC','Noto Serif SC','Songti SC','SimSun','Microsoft YaHei','PingFang SC',serif";

// ---------------------------------------------------------------------
//  Lines
// ---------------------------------------------------------------------
const SOAK_DAY = [
  "暖暖的泉水漫过肩膀，冻僵的手指一点点软了下来。",
  "热气扑在脸上，远处的雪山在白雾里若隐若现。",
  "一片雪花飘向水面，还没落下就化成了一缕白气。",
  "泡得浑身暖洋洋的，连耳朵尖都红了。",
];
const SOAK_NIGHT = [
  "夜里的温泉格外安静，抬头就是满天星星，热气一路飘上去。",
  "灯笼的光落在水面上，一晃一晃的，像水里也点了一盏小灯。",
  "四周只剩下细细的水声，暖意从脚底一直漫到心里。",
  "泡着温泉看星星——今年的生日，大概会记很久很久。",
];
const SOAK_EDGE = [
  "坐在池边把脚伸进温泉，暖意顺着脚尖一点点爬上来。",
  "掬一捧温泉水洗洗脸，眉毛上的霜一下子就化了。",
  "蹲在池边伸手试了试水温——刚刚好，快下去泡一泡吧。",
];
const STAR_LINES = [
  "猎户座的三颗腰带星排成一条直线，像有人在夜空里系了条亮晶晶的腰带。",
  "北斗七星挂在北边的山尖上，把勺口那两颗星连起来往外延长，就找到了北极星。",
  "镜头里的昴星团像一小把撒在黑丝绒上的碎钻。",
  "天狼星在东南方低低地闪着，是冬夜里最亮的那颗星。",
  "仙后座在头顶摆成一个歪歪的 W，像在悄悄写一个名字的首字母。",
  "冬季大三角：参宿四、天狼星、南河三，在夜空里连成一个大大的三角形。",
  "猎户座左上角那颗橙红色的星是参宿四，看上去暖暖的，像远处的一盏灯。",
  "双子座的两颗亮星并肩站着，像一对从不分开的好朋友。",
  "银河淡淡地横过山脊，冷冽的空气让每一颗星都格外清楚。",
];
const SHOOTING_STAR_LINE = "一颗流星从镜头边缘划了过去——快许个愿！";
const AURORA_HINT =
  "镜头往北边一偏，山脊上方的天色好像比别处亮一点……都说冬麓北边的夜空偶尔会有极光，多来看看吧。";
const AURORA_LIVE = "北边的天空正飘着绿色的光带，一层一层地轻轻摆动——是极光！信里说的是真的。";
const SCOPE_DAY = ["天还亮着，等天黑再来吧。", "天还亮着，镜头里只有远处雪山上的松树。等天黑再来吧。"];
const SCOPE_DUSK = "太阳刚落山，天边只亮起了一两颗星。再等等，等天完全黑下来。";
const CAIRN_LINES = [
  "你在石堆顶上轻轻放了一块小石头，许了一个小小的愿望。",
  "又添了一块。路过的人都会这样做，好让后来的人不迷路。",
  "石头稳稳地立住了。听说叠得越高，愿望越容易实现。",
  "最后一块小石头放好了，石堆立得端端正正的。",
];
const CAIRN_FULL = "石堆已经叠得高高的了，再放就要倒啦。木杆上的红布条在风里轻轻飘着。";
const SIGN_LINE = "路牌上写着：沿小径一路向北，山脚下有一汪冒着热气的温泉；在温泉边往西拐，就是观星台。";

// A tiny shuffle bag so the same line never repeats twice in a row
class LineBag {
  constructor(lines) {
    this.lines = lines;
    this.bag = [];
    this.last = null;
  }
  next() {
    if (this.bag.length === 0) {
      this.bag = this.lines.slice();
      for (let i = this.bag.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [this.bag[i], this.bag[j]] = [this.bag[j], this.bag[i]];
      }
      if (this.bag.length > 1 && this.bag[this.bag.length - 1] === this.last) this.bag.unshift(this.bag.pop());
    }
    this.last = this.bag.pop();
    return this.last;
  }
}

// ---------------------------------------------------------------------
//  Geometry / texture helpers
// ---------------------------------------------------------------------

// Merge already-transformed geometries (position/normal/uv) into one non-indexed geometry
function mergeGeos(list) {
  const parts = list.map((g) => (g.index ? g.toNonIndexed() : g));
  let n = 0;
  for (const g of parts) n += g.attributes.position.count;
  const pos = new Float32Array(n * 3);
  const nor = new Float32Array(n * 3);
  const uv = new Float32Array(n * 2);
  let o = 0;
  for (const g of parts) {
    const c = g.attributes.position.count;
    pos.set(g.attributes.position.array, o * 3);
    nor.set(g.attributes.normal.array, o * 3);
    if (g.attributes.uv) uv.set(g.attributes.uv.array, o * 2);
    o += c;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  out.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
  out.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  out.computeBoundingSphere();
  return out;
}

function makeBeveledPaverGeo(w, d) {
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
}

function makeCanvas(w, h) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

function canvasTexture(c, repeatWrap = false) {
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  if (repeatWrap) {
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
  }
  tex.needsUpdate = true;
  return tex;
}

// Arrow glyph drawn as a path (font-independent). dir: "right" | "left" | "up"
function drawArrow(g, x, y, s, dir) {
  const ang = dir === "left" ? Math.PI : dir === "up" ? -Math.PI / 2 : 0;
  const pathArrow = () => {
    g.beginPath();
    g.moveTo(-0.5 * s, -0.13 * s);
    g.lineTo(0.08 * s, -0.13 * s);
    g.lineTo(0.08 * s, -0.36 * s);
    g.lineTo(0.55 * s, 0);
    g.lineTo(0.08 * s, 0.36 * s);
    g.lineTo(0.08 * s, 0.13 * s);
    g.lineTo(-0.5 * s, 0.13 * s);
    g.closePath();
  };
  g.save();
  g.translate(x, y + 2);
  g.rotate(ang);
  g.fillStyle = "rgba(255,226,180,0.4)";
  pathArrow();
  g.fill();
  g.restore();
  g.save();
  g.translate(x, y);
  g.rotate(ang);
  g.fillStyle = "#3b220f";
  pathArrow();
  g.fill();
  g.restore();
}

// Weathered carved wooden board. lines: [{ text, size, x, y }], arrows: [{ x, y, s, dir }]
function makeBoardTexture(w, h, lines, arrows, seed) {
  const c = makeCanvas(w, h);
  const g = c.getContext("2d");
  const rnd = mulberry(seed);
  const grad = g.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, "#a8774a");
  grad.addColorStop(1, "#8d5f36");
  g.fillStyle = grad;
  g.fillRect(0, 0, w, h);
  for (let i = 0; i < 30; i++) {
    const y0 = rnd() * h;
    const amp = 1 + rnd() * 2.5;
    g.strokeStyle = rnd() > 0.45 ? "rgba(70,38,16,0.26)" : "rgba(214,168,118,0.2)";
    g.lineWidth = 1 + rnd() * 1.8;
    g.beginPath();
    for (let x = 0; x <= w; x += 12) {
      const y = y0 + Math.sin(x * 0.025 + i * 1.7) * amp;
      if (x === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.stroke();
  }
  // a knot or two
  for (let k = 0; k < 2; k++) {
    const kx = w * (0.15 + rnd() * 0.7);
    const ky = h * (0.2 + rnd() * 0.6);
    g.strokeStyle = "rgba(70,38,16,0.3)";
    g.lineWidth = 1.5;
    g.beginPath();
    g.ellipse(kx, ky, 7, 3.5, 0, 0, Math.PI * 2);
    g.stroke();
  }
  g.strokeStyle = "rgba(52,27,10,0.6)";
  g.lineWidth = 5;
  g.strokeRect(4, 4, w - 8, h - 8);
  g.fillStyle = "#2f241c";
  for (const [nx, ny] of [[13, 13], [w - 13, 13], [13, h - 13], [w - 13, h - 13]]) {
    g.beginPath();
    g.arc(nx, ny, 3.5, 0, Math.PI * 2);
    g.fill();
  }
  g.textAlign = "center";
  g.textBaseline = "middle";
  for (const ln of lines) {
    g.font = `bold ${ln.size}px ${FONT}`;
    g.fillStyle = "rgba(255,226,180,0.45)";
    g.fillText(ln.text, ln.x, ln.y + 2);
    g.fillStyle = "#3b220f";
    g.fillText(ln.text, ln.x, ln.y);
  }
  for (const a of arrows || []) drawArrow(g, a.x, a.y, a.s, a.dir);
  return canvasTexture(c);
}

// Tileable shimmer on the water surface: soft light/dark wave bands
function makeWaterTexture() {
  const S = 128;
  const c = makeCanvas(S, S);
  const g = c.getContext("2d");
  const rnd = mulberry(4407);
  g.fillStyle = "#cfe9e6";
  g.fillRect(0, 0, S, S);
  for (let i = 0; i < 34; i++) {
    const y0 = rnd() * S;
    const amp = 2 + rnd() * 4;
    const k = (Math.PI * 2 * (1 + Math.floor(rnd() * 3))) / S;
    const ph = rnd() * Math.PI * 2;
    g.strokeStyle = rnd() > 0.5 ? "rgba(255,255,255,0.45)" : "rgba(120,170,172,0.35)";
    g.lineWidth = 1 + rnd() * 2.2;
    for (const off of [-S, 0, S]) {
      g.beginPath();
      for (let x = 0; x <= S; x += 4) {
        const y = y0 + off + Math.sin(x * k + ph) * amp;
        if (x === 0) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
      g.stroke();
    }
  }
  return canvasTexture(c, true);
}

// Tileable caustic-like light network for the additive shimmer layer
function makeCausticTexture() {
  const S = 128;
  const c = makeCanvas(S, S);
  const g = c.getContext("2d");
  const rnd = mulberry(8123);
  g.fillStyle = "#000";
  g.fillRect(0, 0, S, S);
  for (let i = 0; i < 26; i++) {
    const cx = rnd() * S;
    const cy = rnd() * S;
    const r = 8 + rnd() * 18;
    g.strokeStyle = `rgba(255,255,255,${0.35 + rnd() * 0.4})`;
    g.lineWidth = 1 + rnd() * 1.5;
    for (const ox of [-S, 0, S]) {
      for (const oy of [-S, 0, S]) {
        g.beginPath();
        g.ellipse(cx + ox, cy + oy, r, r * (0.6 + rnd() * 0.5), rnd() * Math.PI, 0, Math.PI * 2);
        g.stroke();
      }
    }
  }
  return canvasTexture(c, true);
}

function makeStarChartTexture() {
  const W = 256;
  const H = 192;
  const c = makeCanvas(W, H);
  const g = c.getContext("2d");
  const grad = g.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, "#1b2b4d");
  grad.addColorStop(1, "#0f1a33");
  g.fillStyle = grad;
  g.fillRect(0, 0, W, H);
  const rnd = mulberry(2718);
  for (let i = 0; i < 70; i++) {
    g.fillStyle = `rgba(220,230,255,${0.25 + rnd() * 0.4})`;
    g.fillRect(rnd() * W, 30 + rnd() * (H - 40), 1.2, 1.2);
  }
  const star = (x, y, r, col = "#fff6dc") => {
    const sg = g.createRadialGradient(x, y, 0, x, y, r * 3);
    sg.addColorStop(0, "rgba(255,246,220,0.9)");
    sg.addColorStop(1, "rgba(255,246,220,0)");
    g.fillStyle = sg;
    g.beginPath();
    g.arc(x, y, r * 3, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = col;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  };
  const link = (pts) => {
    g.strokeStyle = "rgba(170,195,255,0.55)";
    g.lineWidth = 1.2;
    g.beginPath();
    pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
    g.stroke();
  };
  // Orion (left)
  const ori = [[48, 62], [92, 60], [62, 100], [70, 102], [78, 104], [52, 150], [96, 146]];
  link([ori[0], ori[2], ori[5]]);
  link([ori[1], ori[4], ori[6]]);
  link([ori[2], ori[3], ori[4]]);
  ori.forEach(([x, y], i) => star(x, y, i === 0 ? 2.8 : i === 6 ? 2.6 : 1.8, i === 0 ? "#ffc69a" : i === 6 ? "#dfe8ff" : "#fff6dc"));
  // Big Dipper (right)
  const dip = [[150, 72], [176, 66], [196, 76], [214, 86], [222, 112], [252 - 6, 116], [244, 88]];
  link([dip[0], dip[1], dip[2], dip[3], dip[4], dip[5], dip[6], dip[3]]);
  dip.forEach(([x, y]) => star(x, y, 1.9));
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.font = `bold 26px ${FONT}`;
  g.fillStyle = "#f4e7c4";
  g.fillText("冬夜星图", W / 2, 22);
  g.font = `16px ${FONT}`;
  g.fillStyle = "rgba(225,232,255,0.85)";
  g.fillText("猎户座", 72, 176);
  g.fillText("北斗七星", 196, 146);
  g.strokeStyle = "rgba(232,210,160,0.7)";
  g.lineWidth = 3;
  g.strokeRect(3, 3, W - 6, H - 6);
  return canvasTexture(c);
}

function makeNorenTexture(ch) {
  const c = makeCanvas(64, 128);
  const g = c.getContext("2d");
  g.fillStyle = "#2f6f7a";
  g.fillRect(0, 0, 64, 128);
  g.fillStyle = "rgba(255,255,255,0.08)";
  for (let y = 0; y < 128; y += 6) g.fillRect(0, y, 64, 2);
  g.fillStyle = "#1f4c55";
  g.fillRect(0, 0, 64, 10);
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.font = `bold 40px ${FONT}`;
  g.fillStyle = "#f6f1e4";
  g.fillText(ch, 32, 66);
  return canvasTexture(c);
}

// ---------------------------------------------------------------------
//  The zone
// ---------------------------------------------------------------------
export class NorthSpringZone {
  constructor(world, textures) {
    this.world = world;
    this.textures = textures;
    this.isMobile = !!world.isMobile;
    this.colliders = []; // local copy of what we registered (handy for tests)
    this.group = new THREE.Group();
    this.group.name = "north-spring-zone";
    world.group.add(this.group);

    this._elapsed = 0;
    this._soakAt = -99;
    this._scopeAt = -99;
    this._signAt = -99;
    this._cairnAt = -99;
    this.steamBoost = 0;
    this.cairnAdded = 0;

    this._makeMaterials();
    this._buildSigns();
    this._buildLampPosts();
    this._buildFootbridgeAndRunnel();
    this._buildTrees();
    this._buildSpring();
    this._buildShed();
    this._buildStoneLanterns();
    this._buildCairn();
    this._buildWaterfall();
    this._buildPlatform();
    this._buildDeer();
    this._buildPaving();
    this._buildDrifts();
    if (!this.isMobile) this._buildTracks();
    this._buildBoulders();
    this._buildSteam();
    this._batchStatic();

    this.bagSoakDay = new LineBag(SOAK_DAY);
    this.bagSoakNight = new LineBag(SOAK_NIGHT);
    this.bagSoakEdge = new LineBag(SOAK_EDGE);
    this.bagStars = new LineBag(STAR_LINES);
    this.bagCairn = 0;

    const scopeW = platWorld(1.15, -0.85);
    this.interactions = [
      { id: "north_sign", x: SIGN_POS.x, z: SIGN_POS.z, name: "路牌", label: "看看路牌", reach: 1.8, tapR: 0.9, anchorY: 2.35 },
      { id: "cairn", x: CAIRN_POS.x, z: CAIRN_POS.z, name: "石堆路标", label: "往石堆上添一块小石头", reach: 1.8, tapR: 0.9, anchorY: 1.75 },
      { id: "soak", x: POOL.cx, z: POOL.cz, name: "山脚温泉", label: "泡个温泉，暖暖身子", reach: 4.4, tapR: 3.0, anchorY: 1.25 },
      { id: "telescope", x: scopeW.x, z: scopeW.z, name: "黄铜望远镜", label: "用望远镜看星星", reach: 1.7, tapR: 0.9, anchorY: PLAT.h + 1.75 },
    ];
  }

  // ---------------- colliders ----------------
  _circle(x, z, r) {
    this.world._addCircleCollider(x, z, r);
    this.colliders.push({ type: "circle", x, z, r });
  }
  _box(cx, cz, w, d) {
    this.world._addBoxCollider(cx, cz, w, d);
    this.colliders.push({ type: "box", minX: cx - w / 2, maxX: cx + w / 2, minZ: cz - d / 2, maxZ: cz + d / 2 });
  }
  _nearCollider(x, z, pad) {
    for (const c of this.colliders) {
      if (c.type === "circle") {
        if (Math.hypot(x - c.x, z - c.z) < c.r + pad) return true;
      } else if (x > c.minX - pad && x < c.maxX + pad && z > c.minZ - pad && z < c.maxZ + pad) {
        return true;
      }
    }
    return false;
  }

  _makeMaterials() {
    const t = this.textures;
    const snowInstTex = t.snowCap.clone();
    snowInstTex.needsUpdate = true;
    this.mats = {
      // snowCap map => flat caps thicken automatically in heavy snow (world._collectSnowCaps)
      snow: new THREE.MeshStandardMaterial({ map: t.snowCap, roughness: 0.9 }),
      // cloned map => NOT picked up by the auto-thickening (needed for InstancedMesh caps)
      snowInst: new THREE.MeshStandardMaterial({ map: snowInstTex, roughness: 0.92 }),
      bark: new THREE.MeshStandardMaterial({ map: t.bark, roughness: 0.95 }),
      leaf: new THREE.MeshStandardMaterial({ map: t.pineLeaves, roughness: 0.9 }),
      leafDark: new THREE.MeshStandardMaterial({ map: t.pineLeaves, color: 0xc2d8cc, roughness: 0.92 }),
      darkWood: new THREE.MeshStandardMaterial({ color: 0x462713, roughness: 0.9 }),
      wood: new THREE.MeshStandardMaterial({ color: 0x9a6a3e, roughness: 0.88 }),
      plank: new THREE.MeshStandardMaterial({ map: t.woodPlank, roughness: 0.86 }),
      plankWarm: new THREE.MeshStandardMaterial({ map: t.woodPlank, color: 0xe6d2bd, roughness: 0.86 }),
      stone: new THREE.MeshStandardMaterial({ map: t.stoneWall, roughness: 0.94 }),
      iron: new THREE.MeshStandardMaterial({ color: 0x2d313a, roughness: 0.55, metalness: 0.55 }),
      brass: new THREE.MeshStandardMaterial({ color: 0xd0a24c, roughness: 0.34, metalness: 0.5, emissive: 0x1e1405 }),
      rope: new THREE.MeshStandardMaterial({ color: 0xc9b48a, roughness: 0.95 }),
    };
    // One shared lantern glow for every zone lantern (world.update drives its emissive by night)
    this.lanternMat = new THREE.MeshStandardMaterial({
      color: 0xffe49e,
      emissive: new THREE.Color(0xffb444),
      emissiveIntensity: 1.4,
      roughness: 0.3,
    });
    this.world.lanternMaterials.push(this.lanternMat);
  }

  // ---------------- signposts ----------------
  _buildSigns() {
    const m = this.mats;
    // Trail-head notice board: two posts, a little shingle hood, board facing the yard
    {
      const g = new THREE.Group();
      g.position.set(SIGN_POS.x, 0, SIGN_POS.z);
      g.rotation.y = SIGN_POS.rot;
      const front = makeBoardTexture(
        256,
        128,
        [
          { text: "山脚温泉", size: 46, x: 146, y: 50 },
          { text: "观星台 · 由此向北", size: 22, x: 146, y: 96 },
        ],
        [{ x: 40, y: 64, s: 46, dir: "up" }],
        311
      );
      const back = makeBoardTexture(
        256,
        128,
        [
          { text: "冬麓小屋", size: 46, x: 146, y: 50 },
          { text: "沿小径向南", size: 22, x: 146, y: 96 },
        ],
        [{ x: 40, y: 64, s: 46, dir: "up" }],
        312
      );
      const edge = m.wood;
      const board = new THREE.Mesh(new THREE.BoxGeometry(1.08, 0.54, 0.06), [
        edge, edge, edge, edge,
        new THREE.MeshStandardMaterial({ map: front, roughness: 0.9 }),
        new THREE.MeshStandardMaterial({ map: back, roughness: 0.9 }),
      ]);
      board.position.set(0, 1.38, 0);
      board.castShadow = true;
      g.add(board);
      for (const px of [-0.5, 0.5]) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.9, 0.1), m.darkWood);
        post.position.set(px, 0.95, -0.02);
        post.castShadow = true;
        g.add(post);
      }
      // hood + snow
      for (const s of [-1, 1]) {
        const roof = new THREE.Mesh(new THREE.BoxGeometry(1.32, 0.04, 0.24), m.darkWood);
        roof.position.set(0, 1.86, s * 0.085);
        roof.rotation.x = s * 0.55;
        g.add(roof);
        const sn = new THREE.Mesh(new THREE.BoxGeometry(1.26, 0.05, 0.2), m.snow);
        sn.position.set(0, 1.895, s * 0.095);
        sn.rotation.x = s * 0.55;
        g.add(sn);
      }
      // little snow puff resting on the board's top edge
      const bs = new THREE.Mesh(new THREE.BoxGeometry(0.98, 0.04, 0.07), m.snow);
      bs.position.set(0, 1.67, 0);
      g.add(bs);
      this.group.add(g);
      const c = Math.cos(SIGN_POS.rot);
      const s = Math.sin(SIGN_POS.rot);
      for (const px of [-0.5, 0.5]) this._circle(SIGN_POS.x + px * c, SIGN_POS.z - px * s, 0.12);
    }

    // Fork signpost by the spring: arrow planks pointing to each place
    {
      const g = new THREE.Group();
      g.position.set(FORK_SIGN_POS.x, 0, FORK_SIGN_POS.z);
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.075, 2.05, 7), m.darkWood);
      post.position.y = 1.02;
      post.castShadow = true;
      g.add(post);
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.08, 0.06, 7), m.snow);
      cap.position.y = 2.07;
      g.add(cap);
      const targets = [
        { text: "观星台", to: [-12.0, -42.0], y: 1.78, seed: 41 },
        { text: "山脚温泉", to: [-4.2, -36.8], y: 1.5, seed: 42 },
        { text: "冬麓小屋", to: [-5.6, -27.5], y: 1.22, seed: 43 },
      ];
      const plankShape = new THREE.Shape();
      plankShape.moveTo(0.06, -0.105);
      plankShape.lineTo(0.9, -0.105);
      plankShape.lineTo(1.04, 0);
      plankShape.lineTo(0.9, 0.105);
      plankShape.lineTo(0.06, 0.105);
      plankShape.closePath();
      const plankGeo = new THREE.ExtrudeGeometry(plankShape, { depth: 0.045, bevelEnabled: false });
      plankGeo.translate(0, 0, -0.0225);
      const faceGeo = new THREE.PlaneGeometry(0.8, 0.18);
      for (const tg of targets) {
        const dx = tg.to[0] - FORK_SIGN_POS.x;
        const dz = tg.to[1] - FORK_SIGN_POS.z;
        const arm = new THREE.Group();
        arm.position.y = tg.y;
        arm.rotation.y = Math.atan2(-dz, dx);
        const plank = new THREE.Mesh(plankGeo, m.wood);
        plank.castShadow = true;
        arm.add(plank);
        const tf = makeBoardTexture(256, 58, [{ text: tg.text, size: 34, x: 112, y: 30 }], [{ x: 214, y: 29, s: 34, dir: "right" }], tg.seed);
        const tb = makeBoardTexture(256, 58, [{ text: tg.text, size: 34, x: 144, y: 30 }], [{ x: 42, y: 29, s: 34, dir: "left" }], tg.seed + 50);
        const f = new THREE.Mesh(faceGeo, new THREE.MeshStandardMaterial({ map: tf, roughness: 0.9 }));
        f.position.set(0.47, 0, 0.024);
        arm.add(f);
        const b = new THREE.Mesh(faceGeo, new THREE.MeshStandardMaterial({ map: tb, roughness: 0.9 }));
        b.position.set(0.47, 0, -0.024);
        b.rotation.y = Math.PI;
        arm.add(b);
        const sn = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.035, 0.05), m.snow);
        sn.position.set(0.47, 0.12, 0);
        arm.add(sn);
        g.add(arm);
      }
      this.group.add(g);
      this._circle(FORK_SIGN_POS.x, FORK_SIGN_POS.z, 0.14);
    }
  }

  // ---------------- lantern posts (world.js style, glow via emissive + halo, no point lights) ----------------
  _buildLampPosts() {
    const m = this.mats;
    const plinthGeo = new THREE.BoxGeometry(0.36, 0.34, 0.36);
    const postGeo = new THREE.BoxGeometry(0.16, 2.18, 0.16);
    const armGeo = new THREE.BoxGeometry(0.6, 0.09, 0.09);
    const strutGeo = new THREE.BoxGeometry(0.42, 0.06, 0.06);
    const capGeo = new THREE.BoxGeometry(0.24, 0.08, 0.24);
    const capSnowGeo = new THREE.BoxGeometry(0.22, 0.08, 0.22);
    const hoodGeo = new THREE.ConeGeometry(0.2, 0.14, 4);
    const globeGeo = new THREE.BoxGeometry(0.24, 0.3, 0.24);
    const bottomGeo = new THREE.BoxGeometry(0.2, 0.06, 0.2);
    const hoodSnowGeo = new THREE.ConeGeometry(0.15, 0.06, 4);
    for (const [lx, lz, rot] of LAMP_SPECS) {
      const g = new THREE.Group();
      g.position.set(lx, 0, lz);
      g.rotation.y = rot;
      const plinth = new THREE.Mesh(plinthGeo, m.stone);
      plinth.position.y = 0.17;
      plinth.castShadow = true;
      const post = new THREE.Mesh(postGeo, m.darkWood);
      post.position.y = 1.38;
      post.castShadow = true;
      const arm = new THREE.Mesh(armGeo, m.iron);
      arm.position.set(0.24, 2.34, 0);
      const strut = new THREE.Mesh(strutGeo, m.iron);
      strut.position.set(0.22, 2.16, 0);
      strut.rotation.z = 0.72;
      const cap = new THREE.Mesh(capGeo, m.iron);
      cap.position.set(0, 2.5, 0);
      const capSnow = new THREE.Mesh(capSnowGeo, m.snow);
      capSnow.position.set(0, 2.58, 0);
      const hood = new THREE.Mesh(hoodGeo, m.iron);
      hood.rotation.y = Math.PI / 4;
      hood.position.set(0.46, 2.24, 0);
      const hoodSnow = new THREE.Mesh(hoodSnowGeo, m.snow);
      hoodSnow.rotation.y = Math.PI / 4;
      hoodSnow.position.set(0.46, 2.31, 0);
      const globe = new THREE.Mesh(globeGeo, this.lanternMat);
      globe.position.set(0.46, 2.04, 0);
      const bottom = new THREE.Mesh(bottomGeo, m.iron);
      bottom.position.set(0.46, 1.87, 0);
      g.add(plinth, post, arm, strut, cap, capSnow, hood, hoodSnow, globe, bottom);
      this.world._addLanternHalo(g, 0.46, 2.04, 0, 1.42, 0.56);
      this.group.add(g);
      this._circle(lx, lz, 0.26);
    }
  }

  // ---------------- frozen runnel + plank footbridge ----------------
  _buildFootbridgeAndRunnel() {
    const m = this.mats;
    const B = BRIDGE;
    const rnd = mulberry(733);
    // Ice ribbon meandering across the trail, disappearing under snow at both ends
    {
      const pos = [];
      const uv = [];
      const idx = [];
      const steps = 34;
      for (let i = 0; i <= steps; i++) {
        const k = -4.0 + (8.0 * i) / steps;
        const wob = 0.25 * Math.sin(k * 0.9);
        const cx = B.x + B.nx * k + B.tx * wob;
        const cz = B.z + B.nz * k + B.tz * wob;
        const w = (0.72 + 0.14 * Math.sin(k * 1.7)) * (1 - 0.45 * smoothstep(2.8, 4.0, Math.abs(k)));
        for (const s of [-1, 1]) {
          pos.push(cx + B.tx * s * w * 0.5, 0.018, cz + B.tz * s * w * 0.5);
          uv.push(k * 0.5, s < 0 ? 0 : 1);
        }
        if (i < steps) {
          const a = i * 2;
          idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
        }
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
      geo.setIndex(idx);
      geo.computeVertexNormals();
      // make sure the strip faces up whichever way it was wound
      if (geo.attributes.normal.getY(0) < 0) {
        idx.reverse();
        geo.setIndex(idx);
        geo.computeVertexNormals();
      }
      const iceTex = this.textures.frozenIce.clone();
      iceTex.repeat.set(1, 1);
      iceTex.needsUpdate = true;
      const ice = new THREE.Mesh(
        geo,
        new THREE.MeshStandardMaterial({ map: iceTex, roughness: 0.18, metalness: 0.08, polygonOffset: true, polygonOffsetFactor: -2 })
      );
      ice.receiveShadow = true;
      this.group.add(ice);
      // snowy lips along both banks + mounds swallowing the ends
      const lipGeo = new THREE.SphereGeometry(0.45, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2);
      for (let k = -3.4; k <= 3.4; k += 0.85) {
        if (Math.abs(k) < 1.45) continue; // keep the trail crossing clean
        const wob = 0.25 * Math.sin(k * 0.9);
        for (const s of [-1, 1]) {
          const off = s * (0.5 + rnd() * 0.08);
          const lip = new THREE.Mesh(lipGeo, m.snow);
          lip.position.set(B.x + B.nx * k + B.tx * (wob + off), 0, B.z + B.nz * k + B.tz * (wob + off));
          lip.scale.set(0.75 + rnd() * 0.4, 0.16 + rnd() * 0.06, 0.32 + rnd() * 0.1);
          lip.rotation.y = Math.atan2(-B.nz, B.nx);
          lip.receiveShadow = true;
          this.group.add(lip);
        }
      }
      for (const s of [-1, 1]) {
        const k = s * 4.1;
        const mound = new THREE.Mesh(makeSnowDriftGeometry(7.3 + s, 24, 8), m.snow);
        mound.position.set(B.x + B.nx * k, -0.02, B.z + B.nz * k);
        mound.scale.set(0.95, 0.42, 0.8);
        mound.rotation.y = s * 0.8;
        mound.receiveShadow = true;
        this.group.add(mound);
      }
    }

    // The footbridge: two stringers, cross planks following a low arch, three posts per side with rails
    const g = new THREE.Group();
    g.position.set(B.x, 0, B.z);
    g.rotation.y = Math.atan2(B.tx, B.tz); // local +z = along the trail
    const archY = (s) => B.arch * Math.sin((Math.PI * (s + B.halfLen)) / (2 * B.halfLen));
    const plankGeo = new THREE.BoxGeometry(1.24, 0.045, 0.2);
    const nPl = 10;
    for (let i = 0; i < nPl; i++) {
      const s = -B.halfLen + 0.11 + (i * (2 * B.halfLen - 0.22)) / (nPl - 1);
      const p = new THREE.Mesh(plankGeo, i % 2 ? m.plank : m.plankWarm);
      p.position.set((rnd() - 0.5) * 0.04, archY(s) - 0.022 + 0.01, s);
      p.rotation.x = -Math.atan(((B.arch * Math.PI) / (2 * B.halfLen)) * Math.cos((Math.PI * (s + B.halfLen)) / (2 * B.halfLen)));
      p.rotation.y = (rnd() - 0.5) * 0.05;
      p.castShadow = true;
      p.receiveShadow = true;
      g.add(p);
    }
    for (const lx of [-0.5, 0.5]) {
      for (let seg = 0; seg < 2; seg++) {
        const s0 = seg === 0 ? -B.halfLen : 0;
        const s1 = seg === 0 ? 0 : B.halfLen;
        const y0 = archY(s0) - 0.06;
        const y1 = archY(s1) - 0.06;
        const len = Math.hypot(s1 - s0, y1 - y0);
        const st = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.1, len + 0.04), m.darkWood);
        st.position.set(lx, (y0 + y1) / 2, (s0 + s1) / 2);
        st.rotation.x = -Math.atan2(y1 - y0, s1 - s0);
        g.add(st);
      }
    }
    const postGeo = new THREE.BoxGeometry(0.09, 0.7, 0.09);
    const postSnowGeo = new THREE.BoxGeometry(0.1, 0.05, 0.1);
    for (const lx of [-0.72, 0.72]) {
      const tops = [];
      for (const s of [-1.0, 0, 1.0]) {
        const y = archY(s);
        const post = new THREE.Mesh(postGeo, m.darkWood);
        post.position.set(lx, y + 0.3, s);
        post.castShadow = true;
        g.add(post);
        const ps = new THREE.Mesh(postSnowGeo, m.snow);
        ps.position.set(lx, y + 0.675, s);
        g.add(ps);
        tops.push([s, y + 0.6]);
      }
      // colliders along the rail (posts + mid-span, so nobody slips between the posts)
      for (const s of [-1.0, -0.5, 0, 0.5, 1.0]) {
        this._circle(B.x + B.tx * s + B.nx * -lx, B.z + B.tz * s + B.nz * -lx, 0.1);
      }
      for (let i = 0; i < 2; i++) {
        const [s0, y0] = tops[i];
        const [s1, y1] = tops[i + 1];
        const len = Math.hypot(s1 - s0, y1 - y0);
        const rail = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, len + 0.06), m.wood);
        rail.position.set(lx, (y0 + y1) / 2, (s0 + s1) / 2);
        rail.rotation.x = -Math.atan2(y1 - y0, s1 - s0);
        g.add(rail);
        const rs = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.035, len * 0.9), m.snow);
        rs.position.set(lx, (y0 + y1) / 2 + 0.045, (s0 + s1) / 2);
        rs.rotation.x = rail.rotation.x;
        g.add(rs);
      }
    }
    this.group.add(g);
  }

  // ---------------- spruces (instanced: 4 draw calls for all of them) ----------------
  _buildTrees() {
    const m = this.mats;
    const bark = [];
    const leafA = [];
    const leafB = [];
    const snow = [];
    const trunk = new THREE.CylinderGeometry(0.18, 0.28, 1.38, 6);
    trunk.translate(0, 0.68, 0);
    bark.push(trunk);
    for (let r = 0; r < 3; r++) {
      const ra = (r / 3) * Math.PI * 2;
      const root = new THREE.BoxGeometry(0.36, 0.22, 0.16);
      root.rotateY(-ra);
      root.translate(Math.cos(ra) * 0.22, 0.11, Math.sin(ra) * 0.22);
      bark.push(root);
    }
    const tiers = [
      { r: 1.32, h: 1.05, y: 1.42 },
      { r: 1.06, h: 0.98, y: 2.22 },
      { r: 0.8, h: 0.88, y: 2.94 },
      { r: 0.54, h: 0.78, y: 3.58 },
      { r: 0.28, h: 0.62, y: 4.12 },
    ];
    tiers.forEach((t, ti) => {
      const f = new THREE.ConeGeometry(t.r, t.h, 7);
      f.rotateY(ti * 0.45);
      f.translate(0, t.y, 0);
      (ti % 2 === 0 ? leafA : leafB).push(f);
      const c = new THREE.ConeGeometry(t.r * 0.84, t.h * 0.52, 7);
      c.rotateY(ti * 0.45);
      c.translate(0, t.y + t.h * 0.28, 0);
      snow.push(c);
    });
    const geos = [mergeGeos(bark), mergeGeos(leafA), mergeGeos(leafB), mergeGeos(snow)];
    const matsArr = [m.bark, m.leaf, m.leafDark, m.snowInst];
    const n = TREE_SPECS.length;
    const meshes = geos.map((geo, i) => {
      const im = new THREE.InstancedMesh(geo, matsArr[i], n);
      im.castShadow = i < 3;
      im.receiveShadow = true;
      return im;
    });
    const rnd = mulberry(5521);
    const mtx = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    TREE_SPECS.forEach(([x, z, scale], i) => {
      const s = scale * (0.94 + rnd() * 0.14);
      q.setFromAxisAngle(up, rnd() * Math.PI * 2);
      const sy = s * (0.96 + rnd() * 0.1);
      mtx.compose(new THREE.Vector3(x, 0, z), q, new THREE.Vector3(s, sy, s));
      for (const im of meshes) im.setMatrixAt(i, mtx);
      this._circle(x, z, 0.52 * s);
    });
    for (const im of meshes) {
      im.instanceMatrix.needsUpdate = true;
      im.computeBoundingSphere();
      this.group.add(im);
    }
  }

  // ---------------- the hot spring ----------------
  _buildSpring() {
    const m = this.mats;
    const rnd = mulberry(9090);
    const boundary = (t, extra = 0) => {
      const r = poolR(t) + extra;
      return { x: POOL.cx + Math.cos(t) * r, z: POOL.cz + Math.sin(t) * r };
    };

    // --- water: outline of the blob, cut straight at the deck, tucked a little under rocks & deck ---
    const N = 72;
    const shape = new THREE.Shape();
    for (let i = 0; i < N; i++) {
      const t = (i / N) * Math.PI * 2;
      const p = boundary(t, 0.1);
      const x = p.x - POOL.cx;
      const z = Math.min(p.z, POOL.cutZ + 0.1) - POOL.cz;
      if (i === 0) shape.moveTo(x, -z);
      else shape.lineTo(x, -z);
    }
    shape.closePath();
    const waterGeo = new THREE.ShapeGeometry(shape, 1);
    waterGeo.rotateX(-Math.PI / 2);
    this.waterTex = makeWaterTexture();
    this.waterTex.repeat.set(0.42, 0.42);
    this.waterMat = new THREE.MeshStandardMaterial({
      map: this.waterTex,
      color: 0x4bb3ad,
      emissive: new THREE.Color(0x1d7f86),
      emissiveIntensity: 0.12,
      roughness: 0.14,
      metalness: 0.05,
      transparent: true,
      opacity: 0.93,
    });
    const water = new THREE.Mesh(waterGeo, this.waterMat);
    water.position.set(POOL.cx, WATER_Y, POOL.cz);
    water.receiveShadow = true;
    this.group.add(water);
    this.causticTex = makeCausticTexture();
    this.causticTex.repeat.set(0.3, 0.3);
    this.causticMat = new THREE.MeshBasicMaterial({
      map: this.causticTex,
      color: 0x9ff5e8,
      transparent: true,
      opacity: 0.12,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const caustic = new THREE.Mesh(waterGeo, this.causticMat);
    caustic.position.set(POOL.cx, WATER_Y + 0.006, POOL.cz);
    caustic.renderOrder = 2;
    this.group.add(caustic);

    // --- melted ring: damp dark ground fading back into the snow ---
    {
      const pos = [];
      const col = [];
      const idx = [];
      const M = 80;
      for (let i = 0; i <= M; i++) {
        const t = (i / M) * Math.PI * 2;
        const inner = boundary(t, -0.05);
        const outer = boundary(t, 1.25 + 0.3 * Math.sin(4 * t + 1.3) + 0.15 * Math.sin(9 * t));
        pos.push(inner.x, 0.014, inner.z, outer.x, 0.014, outer.z);
        col.push(0.36, 0.35, 0.33, 0.88, 0.62, 0.62, 0.62, 0.0);
        if (i < M) {
          const a = i * 2;
          idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
        }
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 4));
      geo.setIndex(idx);
      geo.computeVertexNormals();
      if (geo.attributes.normal.getY(0) < 0) {
        idx.reverse();
        geo.setIndex(idx);
        geo.computeVertexNormals();
      }
      const ring = new THREE.Mesh(
        geo,
        new THREE.MeshStandardMaterial({
          vertexColors: true,
          transparent: true,
          depthWrite: false,
          roughness: 0.7,
          polygonOffset: true,
          polygonOffsetFactor: -2,
        })
      );
      ring.receiveShadow = true;
      this.group.add(ring);
    }

    // --- waterline stones: dark, wet, no snow (the warm water keeps them bare) ---
    {
      const geo = new THREE.DodecahedronGeometry(1, 0);
      const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5, metalness: 0.05, flatShading: true });
      const palette = [0x4d5056, 0x5a5c60, 0x45474d, 0x63615c, 0x55534f].map((c) => new THREE.Color(c));
      const items = [];
      let t = 0;
      while (t < Math.PI * 2) {
        const p = boundary(t, 0.14);
        const r = 0.27 + rnd() * 0.17;
        const nearDeck = p.z > POOL.cutZ - 0.3 && p.x > SPRING_DECK.minX - 0.2 && p.x < SPRING_DECK.maxX + 0.2;
        if (!nearDeck) items.push({ x: p.x, z: p.z, r, t });
        // advance by roughly the stone's width along the rim
        t += (r * 1.55) / poolR(t);
      }
      const im = new THREE.InstancedMesh(geo, mat, items.length);
      const mtx = new THREE.Matrix4();
      const q = new THREE.Quaternion();
      const e = new THREE.Euler();
      items.forEach((it, i) => {
        e.set((rnd() - 0.5) * 0.6, -it.t + rnd() * 0.8, (rnd() - 0.5) * 0.5);
        q.setFromEuler(e);
        const sy = it.r * (0.55 + rnd() * 0.25);
        mtx.compose(new THREE.Vector3(it.x, sy * 0.55, it.z), q, new THREE.Vector3(it.r * 1.25, sy, it.r));
        im.setMatrixAt(i, mtx);
        im.setColorAt(i, palette[Math.floor(rnd() * palette.length)]);
        this._circle(it.x, it.z, it.r * 0.95);
      });
      im.castShadow = true;
      im.receiveShadow = true;
      im.instanceMatrix.needsUpdate = true;
      if (im.instanceColor) im.instanceColor.needsUpdate = true;
      im.computeBoundingSphere();
      this.group.add(im);
    }

    // --- moss tufts thriving in the warm damp ring ---
    if (!this.isMobile) {
      const geo = new THREE.DodecahedronGeometry(1, 0);
      const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, flatShading: true });
      const cols = [0x55803c, 0x6b9446, 0x48703a].map((c) => new THREE.Color(c));
      const n = 16;
      const im = new THREE.InstancedMesh(geo, mat, n);
      const mtx = new THREE.Matrix4();
      const q = new THREE.Quaternion();
      let k = 0;
      for (let i = 0; i < 60 && k < n; i++) {
        const t = rnd() * Math.PI * 2;
        const p = boundary(t, 0.55 + rnd() * 0.45);
        if (p.z > POOL.cutZ - 0.5 && p.x > SPRING_DECK.minX - 0.4 && p.x < SPRING_DECK.maxX + 0.4) continue;
        const r = 0.08 + rnd() * 0.08;
        q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rnd() * 6.28);
        mtx.compose(new THREE.Vector3(p.x, r * 0.25, p.z), q, new THREE.Vector3(r * 1.6, r * 0.55, r * 1.3));
        im.setMatrixAt(k, mtx);
        im.setColorAt(k, cols[k % cols.length]);
        k++;
      }
      im.count = k;
      im.instanceMatrix.needsUpdate = true;
      if (im.instanceColor) im.instanceColor.needsUpdate = true;
      im.computeBoundingSphere();
      this.group.add(im);
    }

    this._buildSpringDeck();
    this._buildFloatingTray();

    // --- ripple rings when the player wades ---
    this.ripples = [];
    const ringGeo = new THREE.RingGeometry(0.82, 1.0, 28);
    ringGeo.rotateX(-Math.PI / 2);
    for (let i = 0; i < 4; i++) {
      const rm = new THREE.Mesh(
        ringGeo,
        new THREE.MeshBasicMaterial({ color: 0xe8fffb, transparent: true, opacity: 0, depthWrite: false })
      );
      rm.visible = false;
      rm.userData.dynamic = true;
      rm.renderOrder = 3;
      this.group.add(rm);
      this.ripples.push({ mesh: rm, age: 9, life: 1.5, big: 1 });
    }
    this._rippleTimer = 0;
    this._lastRipplePos = { x: 0, z: 0 };
  }

  _buildSpringDeck() {
    const m = this.mats;
    const D = SPRING_DECK;
    const rnd = mulberry(1212);
    const g = new THREE.Group();
    const w = D.maxX - D.minX;
    const d = D.maxZ - D.minZ;
    const cx = (D.minX + D.maxX) / 2;
    // sleepers
    const slGeo = new THREE.BoxGeometry(0.12, 0.07, d - 0.1);
    for (const sx of [D.minX + 0.3, cx, D.maxX - 0.3]) {
      const sl = new THREE.Mesh(slGeo, m.darkWood);
      sl.position.set(sx, 0.035, (D.minZ + D.maxZ) / 2);
      g.add(sl);
    }
    // planks running east-west
    const nP = 9;
    const pw = d / nP;
    for (let i = 0; i < nP; i++) {
      const len = w - 0.04 - rnd() * 0.08;
      const p = new THREE.Mesh(new THREE.BoxGeometry(len, 0.05, pw - 0.025), i % 2 ? m.plank : m.plankWarm);
      p.position.set(cx + (rnd() - 0.5) * 0.06, DECK_Y - 0.025, D.minZ + pw * (i + 0.5));
      p.castShadow = true;
      p.receiveShadow = true;
      g.add(p);
    }
    // darker, damp lip beam where the deck meets the water
    const lip = new THREE.Mesh(
      new THREE.BoxGeometry(w + 0.02, 0.09, 0.1),
      new THREE.MeshStandardMaterial({ color: 0x3e2614, roughness: 0.55 })
    );
    lip.position.set(cx, DECK_Y - 0.04, D.minZ + 0.04);
    g.add(lip);
    // a wooden step sunk into the water so the way in reads clearly
    const step = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.05, 0.34), new THREE.MeshStandardMaterial({ color: 0x4a301c, roughness: 0.6 }));
    step.position.set(cx - 0.2, WATER_Y - 0.08, D.minZ - 0.22);
    g.add(step);

    // towel rack on the east end, two towels draped over the bar
    {
      const tx = D.maxX - 0.3;
      const tz = (D.minZ + D.maxZ) / 2 + 0.15;
      const postGeo = new THREE.BoxGeometry(0.06, 1.05, 0.06);
      for (const oz of [-0.42, 0.42]) {
        const p = new THREE.Mesh(postGeo, m.darkWood);
        p.position.set(tx, DECK_Y + 0.52, tz + oz);
        p.castShadow = true;
        g.add(p);
        const foot = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.05, 0.08), m.darkWood);
        foot.position.set(tx, DECK_Y + 0.025, tz + oz);
        g.add(foot);
      }
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.92, 6), m.wood);
      bar.rotation.x = Math.PI / 2;
      bar.position.set(tx, DECK_Y + 1.0, tz);
      g.add(bar);
      const towelMats = [
        new THREE.MeshStandardMaterial({ color: 0xf1e6d2, roughness: 0.98 }),
        new THREE.MeshStandardMaterial({ map: this.textures.tableRunner, roughness: 0.98 }),
      ];
      [[-0.18, 0], [0.2, 1]].forEach(([oz, mi]) => {
        for (const sx of [-1, 1]) {
          const panel = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.44, 0.3), towelMats[mi]);
          panel.position.set(tx + sx * 0.035, DECK_Y + 0.79, tz + oz);
          panel.rotation.z = sx * 0.05;
          g.add(panel);
        }
        const top = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.03, 0.3), towelMats[mi]);
        top.position.set(tx, DECK_Y + 1.03, tz + oz);
        g.add(top);
      });
      this._box(tx, tz, 0.36, 0.98);
    }

    // wooden bucket with a ladle near the water on the west end
    {
      const bx = D.minX + 0.45;
      const bz = D.minZ + 0.42;
      const bucket = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.17, 0.3, 12, 1, true), m.plank);
      bucket.position.set(bx, DECK_Y + 0.15, bz);
      bucket.castShadow = true;
      g.add(bucket);
      const bottom = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.02, 12), m.darkWood);
      bottom.position.set(bx, DECK_Y + 0.01, bz);
      g.add(bottom);
      for (const hy of [0.06, 0.24]) {
        const hoop = new THREE.Mesh(new THREE.CylinderGeometry(0.2 - hy * 0.1 + 0.012, 0.2 - hy * 0.1 + 0.012, 0.025, 12, 1, true), m.iron);
        hoop.position.set(bx, DECK_Y + hy, bz);
        g.add(hoop);
      }
      const inside = new THREE.Mesh(new THREE.CylinderGeometry(0.185, 0.185, 0.01, 12), new THREE.MeshStandardMaterial({ color: 0x4bb3ad, roughness: 0.15 }));
      inside.position.set(bx, DECK_Y + 0.25, bz);
      g.add(inside);
      const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.5, 5), m.wood);
      handle.position.set(bx + 0.1, DECK_Y + 0.38, bz);
      handle.rotation.z = -0.55;
      g.add(handle);
      const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.04, 0.07, 8), m.wood);
      cup.position.set(bx - 0.03, DECK_Y + 0.2, bz);
      g.add(cup);
      this._circle(bx, bz, 0.24);
    }

    // a pair of slippers left neatly at the south edge, toes pointing to the pool
    {
      const soleMat = new THREE.MeshStandardMaterial({ color: 0xd9c7a6, roughness: 0.95 });
      const strapMat = new THREE.MeshStandardMaterial({ color: 0xb3473b, roughness: 0.9 });
      const sx0 = cx + 0.35;
      const sz0 = D.maxZ - 0.3;
      for (const side of [-1, 1]) {
        const sole = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.025, 0.25), soleMat);
        sole.position.set(sx0 + side * 0.075, DECK_Y + 0.013, sz0);
        sole.rotation.y = side * 0.06;
        const strap = new THREE.Mesh(new THREE.BoxGeometry(0.105, 0.035, 0.07), strapMat);
        strap.position.set(sx0 + side * 0.075, DECK_Y + 0.04, sz0 - 0.06);
        strap.rotation.y = side * 0.06;
        g.add(sole, strap);
      }
    }

    // balanced stone stack on the deck's north-east corner
    {
      const sMat = new THREE.MeshStandardMaterial({ color: 0x7c7e82, roughness: 0.85, flatShading: true });
      let y = DECK_Y;
      const sx = D.maxX - 0.22;
      const sz = D.minZ + 0.22;
      [0.13, 0.105, 0.085, 0.06].forEach((r, i) => {
        const st = new THREE.Mesh(new THREE.DodecahedronGeometry(r, 0), sMat);
        const h = r * 0.55;
        st.scale.set(1.25, 0.55, 1.1);
        st.position.set(sx + (i % 2 ? 0.01 : -0.01), y + h, sz);
        st.rotation.y = i * 0.9;
        g.add(st);
        y += h * 1.85;
      });
    }

    // snow drift tucked against the deck's south-west corner
    const dr = new THREE.Mesh(makeSnowDriftGeometry(3.3, 24, 8), m.snow);
    dr.position.set(D.minX - 0.15, -0.02, D.maxZ + 0.1);
    dr.scale.set(0.7, 0.3, 0.55);
    g.add(dr);

    this.group.add(g);
  }

  _buildFloatingTray() {
    const m = this.mats;
    const tray = new THREE.Group();
    const board = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.04, 0.3), m.wood);
    tray.add(board);
    for (const [w, d, x, z] of [[0.44, 0.025, 0, 0.15], [0.44, 0.025, 0, -0.15], [0.025, 0.3, 0.21, 0], [0.025, 0.3, -0.21, 0]]) {
      const rim = new THREE.Mesh(new THREE.BoxGeometry(w, 0.05, d), m.darkWood);
      rim.position.set(x, 0.025, z);
      tray.add(rim);
    }
    const potMat = new THREE.MeshStandardMaterial({ color: 0x3f5c6e, roughness: 0.45 });
    const pot = new THREE.Mesh(new THREE.SphereGeometry(0.075, 10, 8), potMat);
    pot.scale.set(1, 0.85, 1);
    pot.position.set(-0.08, 0.085, 0);
    const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.045, 0.03, 8), potMat);
    lid.position.set(-0.08, 0.155, 0);
    const spout = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.02, 0.08, 6), potMat);
    spout.position.set(-0.0, 0.1, 0);
    spout.rotation.z = -0.9;
    tray.add(pot, lid, spout);
    const cupMat = new THREE.MeshStandardMaterial({ color: 0xf2ead8, roughness: 0.6 });
    for (const [x, z] of [[0.1, 0.06], [0.12, -0.07]]) {
      const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.024, 0.045, 8), cupMat);
      cup.position.set(x, 0.045, z);
      tray.add(cup);
    }
    tray.position.set(POOL.cx, WATER_Y + 0.02, POOL.cz);
    this.group.add(tray);
    tray.userData.dynamic = true;
    this.tray = tray;
  }

  // ---------------- changing shed ----------------
  _buildShed() {
    const m = this.mats;
    const S = SHED;
    const g = new THREE.Group();
    g.position.set(S.x, 0, S.z);
    const wallTex = this.textures.logWall.clone();
    wallTex.repeat.set(1, 1);
    wallTex.needsUpdate = true;
    const wallMat = new THREE.MeshStandardMaterial({ map: wallTex, roughness: 0.9 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(S.w, 1.9, S.d), wallMat);
    body.position.y = 0.95;
    body.castShadow = true;
    body.receiveShadow = true;
    g.add(body);
    // gable: a 45-degree prism sitting on the walls (ridge along x)
    const side = S.d / Math.SQRT2;
    const gable = new THREE.Mesh(new THREE.BoxGeometry(S.w, side, side), wallMat);
    gable.rotation.x = Math.PI / 4;
    gable.position.y = 1.9;
    g.add(gable);
    const roofMat = new THREE.MeshStandardMaterial({ map: this.textures.roofShingles, roughness: 0.85 });
    const slopeLen = side + 0.3;
    for (const s of [-1, 1]) {
      const roof = new THREE.Mesh(new THREE.BoxGeometry(S.w + 0.34, 0.07, slopeLen), roofMat);
      roof.rotation.x = s * (Math.PI / 4);
      roof.position.set(0, 1.9 + S.d / 4 + 0.05, s * (S.d / 4 + 0.035));
      roof.castShadow = true;
      g.add(roof);
      const sn = new THREE.Mesh(new THREE.BoxGeometry(S.w + 0.3, 0.08, slopeLen - 0.06), m.snow);
      sn.rotation.x = roof.rotation.x;
      sn.position.set(0, 1.9 + S.d / 4 + 0.1, s * (S.d / 4 + 0.075));
      g.add(sn);
    }
    // doorway on the west face (toward the deck) with a two-panel noren curtain
    const doorX = -S.w / 2 - 0.012;
    const recess = new THREE.Mesh(new THREE.BoxGeometry(0.02, 1.5, 0.72), new THREE.MeshStandardMaterial({ color: 0x24170e, roughness: 1 }));
    recess.position.set(doorX, 0.8, 0);
    g.add(recess);
    for (const oz of [-0.4, 0.4]) {
      const jamb = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.62, 0.08), m.darkWood);
      jamb.position.set(doorX - 0.02, 0.81, oz);
      g.add(jamb);
    }
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.92), m.darkWood);
    lintel.position.set(doorX - 0.02, 1.62, 0);
    g.add(lintel);
    this.norenPanels = [];
    ["温", "泉"].forEach((ch, i) => {
      const pivot = new THREE.Group();
      // seen from the deck (looking east) +z is on the right, so 温 hangs on the -z side
      pivot.position.set(doorX - 0.05, 1.56, i === 0 ? -0.175 : 0.175);
      const panel = new THREE.Mesh(
        new THREE.PlaneGeometry(0.33, 0.62),
        new THREE.MeshStandardMaterial({ map: makeNorenTexture(ch), roughness: 0.95, side: THREE.DoubleSide })
      );
      panel.rotation.y = -Math.PI / 2;
      panel.position.y = -0.31;
      pivot.add(panel);
      g.add(pivot);
      pivot.userData.dynamic = true;
      this.norenPanels.push(pivot);
    });
    const stepStone = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.08, 0.7), m.stone);
    stepStone.position.set(doorX - 0.25, 0.04, 0);
    g.add(stepStone);
    // warm little window on the south side
    const winMat = new THREE.MeshStandardMaterial({
      map: this.textures.windowWarm,
      emissive: new THREE.Color(0xffa94d),
      emissiveIntensity: 0.3,
      roughness: 0.5,
    });
    this.world.windowMaterials.push(winMat);
    const win = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.4, 0.04), winMat);
    win.position.set(0.15, 1.15, S.d / 2 + 0.01);
    g.add(win);
    const sill = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.05, 0.1), m.darkWood);
    sill.position.set(0.15, 0.93, S.d / 2 + 0.04);
    const sillSnow = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.04, 0.09), m.snow);
    sillSnow.position.set(0.15, 0.97, S.d / 2 + 0.045);
    g.add(sill, sillSnow);
    // wall lantern beside the door
    const lantern = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.2, 0.14), this.lanternMat);
    lantern.position.set(doorX - 0.1, 1.42, -0.58);
    const lhood = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.08, 4), m.iron);
    lhood.rotation.y = Math.PI / 4;
    lhood.position.set(doorX - 0.1, 1.56, -0.58);
    const lbr = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.03, 0.03), m.iron);
    lbr.position.set(doorX - 0.04, 1.6, -0.58);
    g.add(lantern, lhood, lbr);
    this.world._addLanternHalo(g, doorX - 0.1, 1.42, -0.58, 0.9, 0.5);
    // drift against the north wall
    const dr = new THREE.Mesh(makeSnowDriftGeometry(11.1, 24, 8), m.snow);
    dr.position.set(0, -0.02, -S.d / 2 - 0.25);
    dr.scale.set(1.1, 0.42, 0.5);
    g.add(dr);
    this.group.add(g);
    this._box(S.x, S.z, S.w + 0.2, S.d + 0.2);
  }

  // ---------------- stone lanterns (one carries the zone's only point light) ----------------
  _buildStoneLanterns() {
    const m = this.mats;
    const gBase = new THREE.BoxGeometry(0.5, 0.12, 0.5);
    const gShaft = new THREE.CylinderGeometry(0.11, 0.13, 0.5, 6);
    const gPlat = new THREE.CylinderGeometry(0.27, 0.24, 0.08, 6);
    const gPillar = new THREE.BoxGeometry(0.06, 0.26, 0.06);
    const gCore = new THREE.BoxGeometry(0.2, 0.22, 0.2);
    const gRoof = new THREE.ConeGeometry(0.37, 0.2, 6);
    const gRoofSnow = new THREE.ConeGeometry(0.31, 0.1, 6);
    const gFinial = new THREE.DodecahedronGeometry(0.055, 0);
    const lmat = new THREE.MeshStandardMaterial({ map: this.textures.stoneWall, color: 0xb9bcc0, roughness: 0.95 });
    STONE_LANTERNS.forEach(([x, z], i) => {
      const g = new THREE.Group();
      g.position.set(x, 0, z);
      g.rotation.y = 0.3 + i * 0.7;
      const base = new THREE.Mesh(gBase, lmat);
      base.position.y = 0.06;
      const shaft = new THREE.Mesh(gShaft, lmat);
      shaft.position.y = 0.37;
      const plat = new THREE.Mesh(gPlat, lmat);
      plat.position.y = 0.66;
      g.add(base, shaft, plat);
      for (const [px, pz] of [[0.12, 0.12], [-0.12, 0.12], [0.12, -0.12], [-0.12, -0.12]]) {
        const p = new THREE.Mesh(gPillar, lmat);
        p.position.set(px, 0.83, pz);
        g.add(p);
      }
      const core = new THREE.Mesh(gCore, this.lanternMat);
      core.position.y = 0.83;
      const roof = new THREE.Mesh(gRoof, lmat);
      roof.position.y = 1.06;
      const rs = new THREE.Mesh(gRoofSnow, m.snow);
      rs.position.y = 1.13;
      const fin = new THREE.Mesh(gFinial, lmat);
      fin.position.y = 1.2;
      g.add(core, roof, rs, fin);
      for (const o of g.children) o.castShadow = o !== core;
      this.world._addLanternHalo(g, 0, 0.83, 0, 1.15, 0.55);
      this.group.add(g);
      this._circle(x, z, 0.32);
    });
    // The single warm light of the zone sits in the lantern by the deck, washing deck, water and steam rocks
    const [lx, lz] = STONE_LANTERNS[0];
    const light = new THREE.PointLight(0xffb35a, 0, 10.5, 1.5);
    light.position.set(lx + 0.35, 1.0, lz - 0.25);
    this.world.scene.add(light);
    this.world.warmLights.push({ light, baseIntensity: 2.5, flicker: true, phase: 4.2 });
    this.light = light;
  }

  // ---------------- trail-marker cairn with a weathered pole and red ribbon ----------------
  _buildCairn() {
    const m = this.mats;
    const g = new THREE.Group();
    g.position.set(CAIRN_POS.x, 0, CAIRN_POS.z);
    const mat = new THREE.MeshStandardMaterial({ color: 0x85868a, roughness: 0.9, flatShading: true });
    const mat2 = new THREE.MeshStandardMaterial({ color: 0x6f7075, roughness: 0.9, flatShading: true });
    const rnd = mulberry(2468);
    let y = 0;
    const sizes = [0.34, 0.28, 0.23, 0.18, 0.14];
    sizes.forEach((r, i) => {
      const st = new THREE.Mesh(new THREE.DodecahedronGeometry(r, 0), i % 2 ? mat2 : mat);
      const h = r * 0.6;
      st.scale.set(1.2, 0.6, 1.05);
      st.position.set((rnd() - 0.5) * 0.05, y + h, (rnd() - 0.5) * 0.05);
      st.rotation.y = rnd() * 6.28;
      st.castShadow = true;
      g.add(st);
      // snow cushions on the upper faces
      const cap = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 4, 0, Math.PI * 2, 0, Math.PI / 2), m.snow);
      cap.scale.set(r * 0.8, r * 0.22, r * 0.7);
      cap.position.set(st.position.x + 0.02, y + h * 1.55, st.position.z + 0.02);
      g.add(cap);
      y += h * 1.75;
    });
    this.cairnTopY = y;
    // weathered marker pole with a faded red ribbon
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.032, 1.3, 5), new THREE.MeshStandardMaterial({ color: 0x6b5a48, roughness: 0.95 }));
    pole.position.set(0.04, y + 0.45, -0.02);
    pole.rotation.z = -0.06;
    g.add(pole);
    const ribbonPivot = new THREE.Group();
    ribbonPivot.position.set(0.075, y + 0.98, -0.02);
    const ribbonGeo = new THREE.PlaneGeometry(0.3, 0.06);
    ribbonGeo.translate(0.15, 0, 0);
    const ribbon = new THREE.Mesh(ribbonGeo, new THREE.MeshStandardMaterial({ color: 0xb8433a, roughness: 0.9, side: THREE.DoubleSide }));
    ribbonPivot.add(ribbon);
    const knot = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.05, 0.06), ribbon.material);
    ribbonPivot.add(knot);
    g.add(ribbonPivot);
    ribbonPivot.userData.dynamic = true;
    this.ribbon = ribbonPivot;
    // pebbles the player can add (hidden until placed)
    this.cairnPebbles = [];
    const pebbleSpots = [[-0.07, 0.06], [0.11, -0.05], [-0.02, -0.1], [0.12, 0.09]];
    pebbleSpots.forEach(([px, pz], i) => {
      const r = 0.06 + (i % 2) * 0.015;
      const p = new THREE.Mesh(new THREE.DodecahedronGeometry(r, 0), i % 2 ? mat : mat2);
      p.scale.set(1.2, 0.65, 1.0);
      p.position.set(px, y - 0.02 + r * 0.4, pz);
      p.visible = false;
      g.add(p);
      p.userData.dynamic = true;
      this.cairnPebbles.push({ mesh: p, pop: 0 });
    });
    this.group.add(g);
    this._circle(CAIRN_POS.x, CAIRN_POS.z, 0.42);
  }

  // ---------------- frozen waterfall on the rocky step behind the spring ----------------
  _buildWaterfall() {
    const m = this.mats;
    const g = new THREE.Group();
    g.position.set(FALL.x, 0, FALL.z);
    const rockMats = [0x6f7178, 0x7b7c80, 0x63656c, 0x85827d].map(
      (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.92, flatShading: true })
    );
    const capGeo = new THREE.SphereGeometry(1, 12, 5, 0, Math.PI * 2, 0, Math.PI / 2);
    // [x, y, z, r, snow]
    const rocks = [
      [-2.35, 0.75, 0.05, 1.2, true], [-1.05, 0.55, 0.45, 0.75, false], [1.55, 0.7, 0.1, 1.1, true],
      [2.65, 0.6, -0.25, 1.0, true], [-1.6, 1.9, -0.35, 1.0, true], [1.35, 1.85, -0.4, 0.95, true],
      [-0.6, 3.0, -0.85, 1.05, true], [0.95, 2.9, -0.9, 0.9, true], [0.15, 1.5, -1.05, 1.2, false],
      [0.2, 3.25, -1.2, 0.8, true], [-3.3, 0.5, -0.6, 0.9, true], [3.4, 0.55, -0.9, 0.85, true],
    ];
    const rnd = mulberry(6060);
    rocks.forEach(([x, y, z, r, snow], i) => {
      const rk = new THREE.Mesh(new THREE.DodecahedronGeometry(r, 0), rockMats[i % rockMats.length]);
      rk.position.set(x, y, z);
      rk.scale.set(1.15, 0.85, 0.9);
      rk.rotation.set(rnd() * 0.6, rnd() * 6.28, rnd() * 0.4);
      rk.castShadow = true;
      rk.receiveShadow = true;
      g.add(rk);
      if (snow) {
        const cap = new THREE.Mesh(capGeo, m.snow);
        cap.scale.set(r * 0.85, r * 0.3, r * 0.75);
        cap.position.set(x, y + r * 0.85 * 0.62, z - 0.05);
        cap.rotation.y = rnd() * 6.28;
        g.add(cap);
      }
    });
    // The ice: glassy columns frozen mid-fall from the lip down to the plunge
    this.iceMat = new THREE.MeshStandardMaterial({
      color: 0xd4eef9,
      emissive: new THREE.Color(0x5b9cc4),
      emissiveIntensity: 0.06,
      roughness: 0.12,
      metalness: 0.1,
      transparent: true,
      opacity: 0.86,
    });
    const cols = [
      [-0.3, 0.13, 2.95, 0.3], [-0.1, 0.19, 3.05, 0.38], [0.1, 0.2, 3.1, 0.42], [0.3, 0.17, 3.0, 0.36],
      [0.5, 0.12, 2.6, 0.4], [0.68, 0.08, 1.7, 0.36], [-0.48, 0.08, 1.9, 0.33], [0.2, 0.1, 2.2, 0.55],
    ];
    for (const [x, r, top, zf] of cols) {
      const bottom = top > 2.9 ? 0.05 : top - (top > 2 ? 1.3 : 1.0);
      const h = top - bottom;
      const geo = new THREE.CylinderGeometry(r * 0.75, r, h, 7);
      const col = new THREE.Mesh(geo, this.iceMat);
      col.position.set(x, bottom + h / 2, zf - 0.2);
      col.rotation.x = -0.12;
      g.add(col);
      if (top <= 2.9) {
        const tip = new THREE.Mesh(new THREE.ConeGeometry(r, 0.35, 7), this.iceMat);
        tip.rotation.x = Math.PI;
        tip.position.set(x, bottom - 0.17, zf - 0.17);
        g.add(tip);
      }
    }
    // icicles fringing the rock edges
    const iceTipGeo = new THREE.ConeGeometry(0.05, 0.38, 5);
    for (const [x, y, z] of [[-1.2, 1.25, 0.55], [-0.95, 1.2, 0.6], [1.0, 1.3, 0.5], [1.25, 1.25, 0.45], [-1.55, 2.55, 0.25], [1.35, 2.5, 0.2]]) {
      const ic = new THREE.Mesh(iceTipGeo, this.iceMat);
      ic.rotation.x = Math.PI;
      ic.position.set(x, y, z);
      ic.scale.y = 0.8 + rnd() * 0.6;
      g.add(ic);
    }
    // frozen plunge pool + lumps of splash ice
    const plungeTex = this.textures.frozenIce.clone();
    plungeTex.repeat.set(1, 1);
    plungeTex.needsUpdate = true;
    const plunge = new THREE.Mesh(
      new THREE.CylinderGeometry(FALL_ICE.r, FALL_ICE.r + 0.1, 0.06, 16),
      new THREE.MeshStandardMaterial({ map: plungeTex, roughness: 0.15, metalness: 0.1 })
    );
    plunge.position.set(FALL_ICE.x - FALL.x, 0.03, FALL_ICE.z - FALL.z);
    plunge.receiveShadow = true;
    g.add(plunge);
    const lumpGeo = new THREE.DodecahedronGeometry(1, 0);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI - 0.1;
      const lump = new THREE.Mesh(lumpGeo, this.iceMat);
      const r = 0.12 + rnd() * 0.12;
      lump.scale.set(r * 1.3, r * 0.8, r);
      lump.position.set(0.2 + Math.cos(a) * 0.55, r * 0.5, 0.5 - Math.sin(a) * 0.25);
      g.add(lump);
    }
    // a couple of glints that twinkle on the ice
    this.glints = [];
    if (!this.isMobile) {
      for (const [x, y, z] of [[0.05, 2.2, 0.3], [0.45, 1.1, 0.35], [-0.25, 0.6, 0.4]]) {
        const sp = new THREE.Sprite(
          new THREE.SpriteMaterial({
            map: this.textures.fireGlowSoft,
            color: 0xd8f6ff,
            transparent: true,
            opacity: 0,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
          })
        );
        sp.position.set(x, y, z);
        sp.scale.setScalar(0.25);
        g.add(sp);
        this.glints.push({ sprite: sp, phase: x * 7 + y * 3 });
      }
    }
    this.group.add(g);
    this._box(FALL.x + 0.1, FALL.z - 0.35, 6.6, 2.0);
  }

  // ---------------- stargazing platform ----------------
  _buildPlatform() {
    const m = this.mats;
    const H = PLAT.h;
    const g = new THREE.Group();
    g.position.set(PLAT.cx, 0, PLAT.cz);
    g.rotation.y = PLAT_ROT;
    const deckTex = this.textures.woodPlank.clone();
    deckTex.repeat.set(3, 5);
    deckTex.needsUpdate = true;
    const deckMat = new THREE.MeshStandardMaterial({ map: deckTex, roughness: 0.86 });
    const deck = new THREE.Mesh(new THREE.BoxGeometry(4.1, 0.1, 4.1), deckMat);
    deck.position.y = H - 0.05;
    deck.castShadow = true;
    deck.receiveShadow = true;
    g.add(deck);
    const skirtTex = this.textures.woodPlank.clone();
    skirtTex.repeat.set(4, 1);
    skirtTex.needsUpdate = true;
    const skirt = new THREE.Mesh(
      new THREE.BoxGeometry(3.86, H - 0.1, 3.86),
      new THREE.MeshStandardMaterial({ map: skirtTex, color: 0x8a6a52, roughness: 0.9 })
    );
    skirt.position.y = (H - 0.1) / 2;
    skirt.receiveShadow = true;
    g.add(skirt);

    // posts
    const RH = 0.95; // rail height above deck
    const postGeo = new THREE.BoxGeometry(0.14, H + RH, 0.14);
    const postSnowGeo = new THREE.BoxGeometry(0.15, 0.06, 0.15);
    const posts = [
      [1.95, 1.95], [1.95, -1.95], [-1.95, -1.95], [1.95, 0], [0, 1.95], [0, -1.95], [-1.95, 0.72], [-1.95, -0.72],
    ];
    for (const [u, v] of posts) {
      const p = new THREE.Mesh(postGeo, m.darkWood);
      p.position.set(u, (H + RH) / 2, v);
      p.castShadow = true;
      g.add(p);
      const ps = new THREE.Mesh(postSnowGeo, m.snow);
      ps.position.set(u, H + RH + 0.03, v);
      g.add(ps);
    }
    // the lantern post on the stair-side corner (taller)
    {
      const tall = new THREE.Mesh(new THREE.BoxGeometry(0.15, H + 2.05, 0.15), m.darkWood);
      tall.position.set(-1.95, (H + 2.05) / 2, 1.95);
      tall.castShadow = true;
      g.add(tall);
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.07, 0.07), m.iron);
      arm.position.set(-1.7, H + 1.95, 1.95);
      g.add(arm);
      const hood = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.13, 4), m.iron);
      hood.rotation.y = Math.PI / 4;
      hood.position.set(-1.5, H + 1.83, 1.95);
      const hs = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.05, 4), m.snow);
      hs.rotation.y = Math.PI / 4;
      hs.position.set(-1.5, H + 1.9, 1.95);
      const globe = new THREE.Mesh(new THREE.BoxGeometry(0.21, 0.27, 0.21), this.lanternMat);
      globe.position.set(-1.5, H + 1.64, 1.95);
      const bot = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.05, 0.17), m.iron);
      bot.position.set(-1.5, H + 1.49, 1.95);
      const topSnow = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.06, 0.16), m.snow);
      topSnow.position.set(-1.95, H + 2.08, 1.95);
      g.add(hood, hs, globe, bot, topSnow);
      this.world._addLanternHalo(g, -1.5, H + 1.64, 1.95, 1.3, 0.55);
    }

    // rails (top + mid), balusters (instanced), snow along the top rails
    const segs = [
      [[1.95, -1.95], [1.95, 1.95]],
      [[-1.95, 1.95], [1.95, 1.95]],
      [[-1.95, -1.95], [1.95, -1.95]],
      [[-1.95, 0.72], [-1.95, 1.95]],
      [[-1.95, -1.95], [-1.95, -0.72]],
    ];
    const balusters = [];
    const lights = [];
    for (const [[u0, v0], [u1, v1]] of segs) {
      const len = Math.hypot(u1 - u0, v1 - v0);
      const cu = (u0 + u1) / 2;
      const cv = (v0 + v1) / 2;
      const alongU = Math.abs(u1 - u0) > Math.abs(v1 - v0);
      for (const [yy, th] of [[H + RH - 0.04, 0.08], [H + 0.48, 0.06]]) {
        const rail = new THREE.Mesh(new THREE.BoxGeometry(alongU ? len : th, th, alongU ? th : len), m.wood);
        rail.position.set(cu, yy, cv);
        rail.castShadow = true;
        g.add(rail);
      }
      const rs = new THREE.Mesh(new THREE.BoxGeometry(alongU ? len - 0.1 : 0.1, 0.05, alongU ? 0.1 : len - 0.1), m.snow);
      rs.position.set(cu, H + RH + 0.02, cv);
      g.add(rs);
      const nB = Math.floor(len / 0.3);
      for (let i = 1; i < nB; i++) {
        const t = i / nB;
        balusters.push([u0 + (u1 - u0) * t, v0 + (v1 - v0) * t]);
      }
      const nL = Math.max(2, Math.round(len / 0.34));
      for (let i = 0; i <= nL; i++) {
        const t = i / nL;
        const sag = 0.06 * Math.sin(Math.PI * ((t * len) / 0.98 - Math.floor((t * len) / 0.98)));
        lights.push([u0 + (u1 - u0) * t, H + RH - 0.13 - sag, v0 + (v1 - v0) * t]);
      }
      // collider chain along the rail (world space)
      const nC = Math.max(1, Math.ceil(len / 0.3));
      for (let i = 0; i <= nC; i++) {
        const t = i / nC;
        const w = platWorld(u0 + (u1 - u0) * t, v0 + (v1 - v0) * t);
        this._circle(w.x, w.z, 0.13);
      }
    }
    {
      const bGeo = new THREE.BoxGeometry(0.05, RH - 0.1, 0.05);
      const im = new THREE.InstancedMesh(bGeo, m.wood, balusters.length);
      const mtx = new THREE.Matrix4();
      balusters.forEach(([u, v], i) => {
        mtx.makeTranslation(u, H + (RH - 0.1) / 2, v);
        im.setMatrixAt(i, mtx);
      });
      im.instanceMatrix.needsUpdate = true;
      im.computeBoundingSphere();
      im.castShadow = true;
      g.add(im);
    }
    // fairy lights strung under the top rail
    {
      this.fairyMat = new THREE.MeshStandardMaterial({
        color: 0xfff0c2,
        emissive: new THREE.Color(0xffc45e),
        emissiveIntensity: 1.2,
        roughness: 0.4,
      });
      this.world.lanternMaterials.push(this.fairyMat);
      const im = new THREE.InstancedMesh(new THREE.SphereGeometry(0.032, 6, 4), this.fairyMat, lights.length);
      const mtx = new THREE.Matrix4();
      lights.forEach(([u, y, v], i) => {
        mtx.makeTranslation(u, y, v);
        im.setMatrixAt(i, mtx);
      });
      im.instanceMatrix.needsUpdate = true;
      im.computeBoundingSphere();
      g.add(im);
    }

    // stairs: treads match the smooth ramp in getSurface at their centres
    {
      const L0 = PLAT.stairL0;
      const L1 = PLAT.stairL1;
      const run = (L1 - L0) / 5;
      const treadGeo = new THREE.BoxGeometry(run + 0.02, 0.06, 1.36);
      const riserGeo = new THREE.BoxGeometry(0.03, H / 5, 1.36);
      for (let k = 1; k <= 4; k++) {
        const uc = L0 + (L1 - L0) * (k / 5);
        const yTop = (k * H) / 5;
        const tr = new THREE.Mesh(treadGeo, k % 2 ? m.plank : m.plankWarm);
        tr.position.set(uc, yTop - 0.03, 0);
        tr.castShadow = true;
        tr.receiveShadow = true;
        g.add(tr);
        const ri = new THREE.Mesh(riserGeo, m.darkWood);
        ri.position.set(uc - run / 2, yTop - H / 10, 0);
        g.add(ri);
        // a dusting of snow on the tread ends where nobody steps
        for (const sv of [-0.56, 0.56]) {
          const sn = new THREE.Mesh(new THREE.BoxGeometry(run * 0.8, 0.03, 0.18), m.snow);
          sn.position.set(uc, yTop + 0.012, sv);
          g.add(sn);
        }
      }
      const sLen = Math.hypot(L1 - L0, H);
      const sAng = Math.atan2(H, L1 - L0);
      for (const sv of [-0.71, 0.71]) {
        const st = new THREE.Mesh(new THREE.BoxGeometry(sLen, 0.18, 0.06), m.darkWood);
        st.position.set((L0 + L1) / 2, H / 2 - 0.06, sv);
        st.rotation.z = sAng;
        st.castShadow = true;
        g.add(st);
        // bottom newel post + sloped handrail + mid rail
        const bu = L0 + 0.1;
        const np = new THREE.Mesh(new THREE.BoxGeometry(0.12, RH, 0.12), m.darkWood);
        np.position.set(bu, RH / 2, sv * 1.014);
        np.castShadow = true;
        g.add(np);
        const nps = new THREE.Mesh(postSnowGeo, m.snow);
        nps.position.set(bu, RH + 0.03, sv * 1.014);
        g.add(nps);
        for (const [y0, y1, th] of [[RH - 0.04, H + RH - 0.04, 0.07], [0.5, H + 0.48, 0.05]]) {
          const du = -1.95 - bu;
          const dy = y1 - y0;
          const len = Math.hypot(du, dy);
          const r = new THREE.Mesh(new THREE.BoxGeometry(len, th, th), m.wood);
          r.position.set((bu - 1.95) / 2, (y0 + y1) / 2, sv * 1.014);
          r.rotation.z = Math.atan2(dy, du);
          g.add(r);
          if (th > 0.06) {
            const rsn = new THREE.Mesh(new THREE.BoxGeometry(len * 0.9, 0.04, 0.08), m.snow);
            rsn.position.set((bu - 1.95) / 2, (y0 + y1) / 2 + 0.05, sv * 1.014);
            rsn.rotation.z = r.rotation.z;
            g.add(rsn);
          }
        }
        // colliders along the stair sides
        for (let u = bu; u <= -1.95 + 0.001; u += 0.3) {
          const w = platWorld(u, sv * 1.014);
          this._circle(w.x, w.z, 0.12);
        }
      }
    }

    // brass telescope on a wooden tripod
    {
      const tg = new THREE.Group();
      tg.position.set(1.15, H, -0.85);
      const legGeo = new THREE.CylinderGeometry(0.018, 0.024, 1.2, 5);
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2 + 0.4;
        const leg = new THREE.Mesh(legGeo, m.wood);
        leg.position.set(Math.cos(a) * 0.17, 0.56, Math.sin(a) * 0.17);
        leg.rotation.z = Math.cos(a) * 0.3;
        leg.rotation.x = -Math.sin(a) * 0.3;
        leg.castShadow = true;
        tg.add(leg);
      }
      const head = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.07, 8), m.iron);
      head.position.y = 1.13;
      tg.add(head);
      const yaw = new THREE.Group();
      yaw.position.y = 1.19;
      yaw.rotation.y = -Math.PI / 4; // pointing north by default
      tg.add(yaw);
      const pitch = new THREE.Group();
      pitch.rotation.z = 0.55;
      yaw.add(pitch);
      const tubeGeo = new THREE.CylinderGeometry(0.078, 0.062, 0.95, 14);
      tubeGeo.rotateZ(-Math.PI / 2); // axis along +x, wide end forward
      const tube = new THREE.Mesh(tubeGeo, m.brass);
      tube.position.x = 0.1;
      tube.castShadow = true;
      pitch.add(tube);
      const leather = new THREE.MeshStandardMaterial({ color: 0x3a2417, roughness: 0.8 });
      const dew = new THREE.Mesh(new THREE.CylinderGeometry(0.086, 0.086, 0.16, 14), leather);
      dew.rotation.z = -Math.PI / 2;
      dew.position.x = 0.62;
      pitch.add(dew);
      const lens = new THREE.Mesh(
        new THREE.CylinderGeometry(0.07, 0.07, 0.01, 14),
        new THREE.MeshStandardMaterial({ color: 0x1b2a44, roughness: 0.05, metalness: 0.3, emissive: 0x0b1530 })
      );
      lens.rotation.z = -Math.PI / 2;
      lens.position.x = 0.67;
      pitch.add(lens);
      for (const rx of [-0.25, 0.1, 0.45]) {
        const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.084, 0.084, 0.025, 14), m.brass);
        ring.rotation.z = -Math.PI / 2;
        ring.position.x = rx;
        pitch.add(ring);
      }
      const eye = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.03, 0.14, 8), m.iron);
      eye.rotation.z = -Math.PI / 2;
      eye.position.x = -0.43;
      pitch.add(eye);
      const finder = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.017, 0.3, 8), m.brass);
      finder.rotation.z = -Math.PI / 2;
      finder.position.set(0.08, 0.1, 0);
      pitch.add(finder);
      const fork = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.1, 0.16), m.iron);
      fork.position.y = -0.03;
      yaw.add(fork);
      g.add(tg);
      yaw.userData.dynamic = true;
      this.scopeYaw = yaw;
      this.scopePitch = pitch;
      this.scopeYawTarget = yaw.rotation.y;
      this.scopePitchTarget = pitch.rotation.z;
      const w = platWorld(1.15, -0.85);
      this._circle(w.x, w.z, 0.36);
    }

    // bench looking out to the north-west, with a folded blanket and a mug
    {
      const bg = new THREE.Group();
      bg.position.set(1.0, H, 1.05);
      const seat = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.06, 1.3), m.plankWarm);
      seat.position.y = 0.44;
      seat.castShadow = true;
      bg.add(seat);
      for (const lv of [-0.52, 0.52]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.42, 0.07), m.darkWood);
        leg.position.set(0, 0.21, lv);
        bg.add(leg);
      }
      const back = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.34, 1.3), m.plankWarm);
      back.position.set(-0.21, 0.72, 0);
      back.rotation.z = 0.12;
      bg.add(back);
      for (const lv of [-0.55, 0.55]) {
        const bp = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.36, 0.06), m.darkWood);
        bp.position.set(-0.2, 0.6, lv);
        bp.rotation.z = 0.12;
        bg.add(bp);
      }
      const blanket = new THREE.Mesh(
        new THREE.BoxGeometry(0.34, 0.07, 0.42),
        new THREE.MeshStandardMaterial({ map: this.textures.tableRunner, roughness: 0.95 })
      );
      blanket.position.set(0.02, 0.505, 0.25);
      bg.add(blanket);
      const mugMat = new THREE.MeshStandardMaterial({ color: 0xc8553d, roughness: 0.6 });
      const mug = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.04, 0.1, 10), mugMat);
      mug.position.set(0.05, 0.52, -0.32);
      const handle = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.06, 0.035), mugMat);
      handle.position.set(0.1, 0.52, -0.32);
      const cocoa = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.038, 0.01, 10), new THREE.MeshStandardMaterial({ color: 0x5a3220, roughness: 0.4 }));
      cocoa.position.set(0.05, 0.565, -0.32);
      bg.add(mug, handle, cocoa);
      const sn = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.04, 0.26), m.snow);
      sn.position.set(0, 0.49, 0.5);
      bg.add(sn);
      g.add(bg);
      for (const lv of [0.6, 1.5]) {
        const w = platWorld(1.0, lv);
        this._circle(w.x, w.z, 0.3);
      }
    }

    // star chart on a slanted lectern
    {
      const lg = new THREE.Group();
      lg.position.set(-0.95, H, -1.55);
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.85, 0.07), m.darkWood);
      post.position.y = 0.425;
      lg.add(post);
      const chartTex = makeStarChartTexture();
      const edge = m.darkWood;
      const board = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.42, 0.03), [
        edge, edge, edge, edge, new THREE.MeshStandardMaterial({ map: chartTex, roughness: 0.8 }), edge,
      ]);
      board.position.set(0, 0.95, 0.02);
      board.rotation.x = -0.6;
      lg.add(board);
      const sn = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.03, 0.05), m.snow);
      sn.position.set(0, 1.13, -0.1);
      sn.rotation.x = -0.6;
      lg.add(sn);
      g.add(lg);
      const w = platWorld(-0.95, -1.55);
      this._circle(w.x, w.z, 0.18);
    }

    // snow drifted into deck corners + around the base
    const capGeo = new THREE.SphereGeometry(1, 12, 5, 0, Math.PI * 2, 0, Math.PI / 2);
    for (const [u, v, s] of [[1.7, 1.72, 0.32], [1.72, -1.7, 0.36], [-1.7, -1.72, 0.3]]) {
      const c = new THREE.Mesh(capGeo, m.snow);
      c.position.set(u, H, v);
      c.scale.set(s, s * 0.32, s * 0.9);
      g.add(c);
    }
    for (const [u, v, s, seed] of [[2.25, 1.2, 0.9, 1.1], [0.6, -2.3, 1.0, 2.2], [-1.0, 2.3, 0.8, 3.3], [2.2, -1.6, 0.7, 4.4]]) {
      const d = new THREE.Mesh(makeSnowDriftGeometry(seed + 20, 24, 8), m.snow);
      d.position.set(u, -0.02, v);
      d.scale.set(s, 0.36, s * 0.6);
      d.rotation.y = seed;
      d.receiveShadow = true;
      g.add(d);
    }
    // landing slab at the foot of the stairs
    const slab = new THREE.Mesh(makeBeveledPaverGeo(0.9, 1.3), new THREE.MeshStandardMaterial({ map: this.textures.flagstonePaver, color: 0xa0a5aa, roughness: 0.86 }));
    slab.position.set(PLAT.stairL0 - 0.35, 0.005, 0);
    slab.receiveShadow = true;
    g.add(slab);

    this.group.add(g);
  }

  // ---------------- the dusk deer ----------------
  _buildDeer() {
    const g = new THREE.Group();
    const body = new THREE.MeshStandardMaterial({ color: 0x7a5236, roughness: 0.9, transparent: true, opacity: 0 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x4a3122, roughness: 0.9, transparent: true, opacity: 0 });
    const cream = new THREE.MeshStandardMaterial({ color: 0xe8dcc6, roughness: 0.9, transparent: true, opacity: 0 });
    const antler = new THREE.MeshStandardMaterial({ color: 0x9c8462, roughness: 0.85, transparent: true, opacity: 0 });
    this.deerMats = [body, dark, cream, antler];
    const add = (parent, geo, mat, x, y, z, rz = 0) => {
      const mm = new THREE.Mesh(geo, mat);
      mm.position.set(x, y, z);
      mm.rotation.z = rz;
      mm.castShadow = true;
      parent.add(mm);
      return mm;
    };
    add(g, new THREE.BoxGeometry(0.9, 0.4, 0.34), body, 0, 0.98, 0);
    add(g, new THREE.BoxGeometry(0.72, 0.07, 0.28), cream, 0, 0.77, 0);
    add(g, new THREE.BoxGeometry(0.06, 0.13, 0.12), cream, -0.47, 1.07, 0, 0.4);
    const legGeo = new THREE.BoxGeometry(0.07, 0.8, 0.07);
    this.deerLegs = [];
    for (const [lx, lz] of [[0.33, 0.11], [0.33, -0.11], [-0.33, 0.11], [-0.33, -0.11]]) {
      const pivot = new THREE.Group();
      pivot.position.set(lx, 0.8, lz);
      add(pivot, legGeo, body, 0, -0.4, 0);
      add(pivot, new THREE.BoxGeometry(0.075, 0.06, 0.075), dark, 0, -0.78, 0);
      g.add(pivot);
      this.deerLegs.push(pivot);
    }
    // neck pivots at the shoulder; long enough that a grazing deer's nose reaches the snow
    const neck = new THREE.Group();
    neck.position.set(0.36, 1.0, 0);
    neck.rotation.z = -0.35;
    add(neck, new THREE.BoxGeometry(0.17, 0.8, 0.16), body, 0.06, 0.36, 0, -0.165);
    const head = new THREE.Group();
    head.position.set(0.12, 0.72, 0);
    head.rotation.z = 0.25;
    add(head, new THREE.BoxGeometry(0.28, 0.16, 0.15), body, 0.08, 0, 0);
    add(head, new THREE.BoxGeometry(0.09, 0.1, 0.11), dark, 0.25, -0.02, 0);
    add(head, new THREE.BoxGeometry(0.12, 0.05, 0.13), cream, 0.08, -0.08, 0);
    for (const s of [-1, 1]) {
      const ear = add(head, new THREE.BoxGeometry(0.05, 0.13, 0.07), body, -0.02, 0.1, s * 0.1, 0.3);
      ear.rotation.x = s * 0.5;
      const a1 = add(head, new THREE.BoxGeometry(0.025, 0.24, 0.025), antler, 0.0, 0.2, s * 0.05, 0.15);
      a1.rotation.x = s * 0.25;
      const a2 = add(head, new THREE.BoxGeometry(0.02, 0.12, 0.02), antler, 0.06, 0.26, s * 0.09, -0.6);
      a2.rotation.x = s * 0.3;
      const a3 = add(head, new THREE.BoxGeometry(0.02, 0.1, 0.02), antler, -0.04, 0.32, s * 0.1, 0.5);
      a3.rotation.x = s * 0.35;
    }
    neck.add(head);
    g.add(neck);
    g.position.set(DEER_HOME.x, 0, DEER_HOME.z);
    g.rotation.y = Math.PI; // facing west, toward the steaming pool
    g.visible = false;
    this.group.add(g);
    g.userData.dynamic = true;
    this.deer = {
      group: g,
      neck,
      head,
      state: "hidden",
      opacity: 0,
      t: 0,
      grazeT: 0,
      grazing: true,
      fled: false,
      hop: 0,
    };
  }

  // ---------------- stepping-stone paving (instanced by slab shape) ----------------
  _buildPaving() {
    const rnd = mulberry(5153);
    const geos = {
      H: makeBeveledPaverGeo(0.62, 0.4),
      V: makeBeveledPaverGeo(0.42, 0.58),
      Sq: makeBeveledPaverGeo(0.52, 0.52),
      Sm: makeBeveledPaverGeo(0.4, 0.36),
      Bg: makeBeveledPaverGeo(0.62, 0.5),
    };
    const lists = { H: [], V: [], Sq: [], Sm: [], Bg: [] };
    const placed = [];
    const bridgeClear = (x, z) => {
      const dx = x - BRIDGE.x;
      const dz = z - BRIDGE.z;
      const s = dx * BRIDGE.tx + dz * BRIDGE.tz;
      const l = dx * BRIDGE.nx + dz * BRIDGE.nz;
      return Math.abs(s) > BRIDGE.halfLen + 0.25 || Math.abs(l) > 1.1;
    };
    const put = (key, x, z, rot, rad, force = false) => {
      if (!force) {
        for (const p of placed) if (Math.hypot(p.x - x, p.z - z) < p.r + rad) return false;
        if (!bridgeClear(x, z)) return false;
        if (this._nearCollider(x, z, rad * 0.6)) return false;
      }
      placed.push({ x, z, r: rad });
      lists[key].push({ x, z, rot: rot + (rnd() - 0.5) * 0.04 });
      return true;
    };

    // 1. tidy connector from the front avenue's west end (axis-aligned courses, same rhythm)
    const rowsZ = [-2.78, -2.32, -1.86];
    rowsZ.forEach((z, r) => {
      const xs = r === 1 ? [-5.72, -6.4, -7.08, -7.76] : [-6.03, -6.71, -7.39, -8.07];
      for (const x of xs) put("H", x, z, 0, 0.0, true);
    });
    placed.length = 0;
    for (const z of rowsZ) for (let x = -8.3; x <= -5.6; x += 0.32) placed.push({ x, z, r: 0.2 });

    // 2. along the trail: smooth curve through NORTH_TRAIL
    const curve = new THREE.CatmullRomCurve3(NORTH_TRAIL.pts.map(([x, z]) => new THREE.Vector3(x, 0, z)), false, "centripetal");
    const total = curve.getLength();
    const N = Math.ceil(total / 0.05);
    const pts = curve.getSpacedPoints(N);
    const sample = (s) => {
      const f = THREE.MathUtils.clamp(s / total, 0, 1) * N;
      const i = Math.min(N - 1, Math.floor(f));
      const a = pts[i];
      const b = pts[i + 1];
      const k = f - i;
      const x = a.x + (b.x - a.x) * k;
      const z = a.z + (b.z - a.z) * k;
      const tl = Math.hypot(b.x - a.x, b.z - a.z) || 1;
      const tx = (b.x - a.x) / tl;
      const tz = (b.z - a.z) / tl;
      // in the yard, nudge the paving a little west so it clears the woodpile beside the cottage
      const shift = -0.15 * smoothstep(-2.6, -3.8, z) * (1 - smoothstep(-10.8, -12.8, z));
      return { x: x + shift, z, tx, tz, nx: -tz, nz: tx };
    };
    this._trailSample = sample;
    this._trailLen = total;

    // tidy two-course paving inside the yard, loosening into stepping stones beyond it
    // two staggered courses on a 0.64 m rhythm (course B offset by 0.3)
    for (const [off, phase] of [[-0.24, 0], [0.24, 0.3]]) {
      for (let s = phase; s < total; s += 0.64) {
        const p = sample(s);
        if (p.z > -3.04) continue;
        const tidy = 1 - smoothstep(-12.4, -14.6, p.z);
        if (tidy <= 0) break;
        if (tidy < 1 && rnd() > tidy * 0.9) continue;
        put("V", p.x + p.nx * off, p.z + p.nz * off, Math.atan2(p.tx, p.tz), 0.25);
      }
    }
    const lay = (sampleFn, s0, s1, step, opts = {}) => {
      let side = 1;
      for (let s = s0; s <= s1; s += step * (0.9 + rnd() * 0.25)) {
        const p = sampleFn(s);
        if (opts.skip && opts.skip(p)) continue;
        if (rnd() < 0.05) continue; // the odd gap where snow has drifted over a stone
        const rot = Math.atan2(p.tx, p.tz);
        const pick = rnd();
        const key = pick < 0.35 ? "Sq" : pick < 0.7 ? "Sm" : "Bg";
        const rad = key === "Sm" ? 0.21 : 0.27;
        const off = side * (0.17 + rnd() * 0.08);
        put(key, p.x + p.nx * off, p.z + p.nz * off, rot + (rnd() - 0.5) * 0.5, rad);
        if (rnd() < 0.3) {
          const off2 = -side * (0.3 + rnd() * 0.08);
          put("Sm", p.x + p.nx * off2, p.z + p.nz * off2 + (rnd() - 0.5) * 0.1, rot + (rnd() - 0.5) * 0.7, 0.2);
        }
        side = -side;
      }
    };
    lay(sample, 0, total, 0.6, { skip: (p) => p.z > -12.9 });

    // 3. on to the deck, and the branch to the stargazing platform
    const polySampler = (poly) => {
      const segs = [];
      let acc = 0;
      for (let i = 0; i < poly.length - 1; i++) {
        const [ax, az] = poly[i];
        const [bx, bz] = poly[i + 1];
        const l = Math.hypot(bx - ax, bz - az);
        segs.push({ ax, az, bx, bz, l, s0: acc });
        acc += l;
      }
      const fn = (s) => {
        let sg = segs[segs.length - 1];
        for (const q of segs) if (s <= q.s0 + q.l) { sg = q; break; }
        const k = THREE.MathUtils.clamp((s - sg.s0) / sg.l, 0, 1);
        const tx = (sg.bx - sg.ax) / sg.l;
        const tz = (sg.bz - sg.az) / sg.l;
        return { x: sg.ax + (sg.bx - sg.ax) * k, z: sg.az + (sg.bz - sg.az) * k, tx, tz, nx: -tz, nz: tx };
      };
      return { fn, len: acc };
    };
    const sw = polySampler(SPRING_WALK);
    lay(sw.fn, 0.5, sw.len - 0.25, 0.62);
    const pw = polySampler(PLATFORM_WALK);
    lay(pw.fn, 0.9, pw.len - 1.15, 0.66); // stop short of the landing slab at the stairs
    this._walks = { spring: sw, platform: pw };

    // build one InstancedMesh per slab shape, tinted per stone like world.js' paver palette
    const mat = new THREE.MeshStandardMaterial({ map: this.textures.flagstonePaver, roughness: 0.86, metalness: 0.05 });
    const palette = [0xb7aa9a, 0xaa9e8f, 0xa0a5aa, 0xc1b5a5, 0x979da3].map((c) => new THREE.Color(c));
    const mtx = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const one = new THREE.Vector3(1, 1, 1);
    for (const key of Object.keys(lists)) {
      const list = lists[key];
      if (list.length === 0) continue;
      const im = new THREE.InstancedMesh(geos[key], mat, list.length);
      list.forEach((it, i) => {
        q.setFromAxisAngle(up, it.rot);
        mtx.compose(new THREE.Vector3(it.x, 0.012, it.z), q, one);
        im.setMatrixAt(i, mtx);
        im.setColorAt(i, palette[Math.floor(rnd() * palette.length)]);
      });
      im.receiveShadow = true;
      im.instanceMatrix.needsUpdate = true;
      if (im.instanceColor) im.instanceColor.needsUpdate = true;
      im.computeBoundingSphere();
      this.group.add(im);
    }
    this.paverCount = placed.length;
  }

  // ---------------- soft roadside drifts (thicken/thin with the weather via world.pathSnowCaps) ----------------
  _buildDrifts() {
    const rnd = mulberry(8080);
    const driftGeo = new THREE.SphereGeometry(0.45, 10, 7);
    const add = (x, z, sx, sz, rot) => {
      const dr = new THREE.Mesh(driftGeo, this.mats.snow);
      dr.scale.set(sx, 0.11, sz);
      dr.position.set(x, 0.028, z);
      dr.rotation.y = rot;
      dr.receiveShadow = true;
      this.group.add(dr);
      this.world.pathSnowCaps.push({ mesh: dr, baseY: 0.028, baseScaleY: 0.11 });
    };
    const sample = this._trailSample;
    for (let s = 1.6; s < this._trailLen - 0.5; s += 2.3 + rnd() * 0.4) {
      const p = sample(s);
      let side = rnd() > 0.5 ? 1 : -1;
      // in the yard: only on the west side (the cottage and woodpile are east)
      const inYard = p.z > YARD_RECT.minZ;
      const eastIsPlus = p.nx > 0;
      if (inYard) side = eastIsPlus ? -1 : 1;
      const off = side * (0.78 + rnd() * 0.12);
      const x = p.x + p.nx * off;
      const z = p.z + p.nz * off;
      if (this._nearCollider(x, z, 0.55)) continue;
      const dxB = x - BRIDGE.x;
      const dzB = z - BRIDGE.z;
      if (Math.abs(dxB * BRIDGE.tx + dzB * BRIDGE.tz) < 1.9) continue;
      add(x, z, 0.5 + rnd() * 0.22, 1.25 + rnd() * 0.65, Math.atan2(p.tx, p.tz) + (rnd() - 0.5) * 0.25);
    }
    for (const walk of [this._walks.spring, this._walks.platform]) {
      for (let s = 1.2; s < walk.len - 0.6; s += 2.6 + rnd() * 0.6) {
        const p = walk.fn(s);
        const side = rnd() > 0.5 ? 1 : -1;
        const off = side * (0.72 + rnd() * 0.12);
        const x = p.x + p.nx * off;
        const z = p.z + p.nz * off;
        if (this._nearCollider(x, z, 0.55) || poolSd(x, z) < 1.4) continue;
        add(x, z, 0.45 + rnd() * 0.2, 1.1 + rnd() * 0.5, Math.atan2(p.tx, p.tz) + (rnd() - 0.5) * 0.25);
      }
    }
  }

  // ---------------- animal tracks (desktop only) ----------------
  _buildTracks() {
    const geo = new THREE.CircleGeometry(1, 8);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({ color: 0xa9bfd6, transparent: true, opacity: 0.5, depthWrite: false });
    const prints = [];
    // rabbit hops across the trail between two spruces: two long hind feet ahead, two small fore feet behind
    {
      const a = { x: -2.4, z: -25.6 };
      const b = { x: -9.6, z: -26.9 };
      const len = Math.hypot(b.x - a.x, b.z - a.z);
      const tx = (b.x - a.x) / len;
      const tz = (b.z - a.z) / len;
      const nx = -tz;
      const nz = tx;
      for (let s = 0.3; s < len; s += 0.62) {
        const cx = a.x + tx * s + nx * Math.sin(s * 0.7) * 0.25;
        const cz = a.z + tz * s + nz * Math.sin(s * 0.7) * 0.25;
        const rot = Math.atan2(tx, tz);
        prints.push([cx + tx * 0.14 + nx * 0.06, cz + tz * 0.14 + nz * 0.06, 0.035, 0.075, rot]);
        prints.push([cx + tx * 0.14 - nx * 0.06, cz + tz * 0.14 - nz * 0.06, 0.035, 0.075, rot]);
        prints.push([cx - tx * 0.05, cz - tz * 0.05, 0.028, 0.035, rot]);
        prints.push([cx - tx * 0.16 + nx * 0.01, cz - tz * 0.16 + nz * 0.01, 0.028, 0.035, rot]);
      }
    }
    // deer hoof prints from the treeline down to the warm water
    {
      const a = { x: DEER_HOME.x - 0.4, z: DEER_HOME.z + 0.2 };
      const b = { x: 0.9, z: -44.9 };
      const len = Math.hypot(b.x - a.x, b.z - a.z);
      const tx = (b.x - a.x) / len;
      const tz = (b.z - a.z) / len;
      const nx = -tz;
      const nz = tx;
      let side = 1;
      for (let s = 0; s < len; s += 0.34) {
        const cx = a.x + tx * s + nx * side * 0.09;
        const cz = a.z + tz * s + nz * side * 0.09;
        const rot = Math.atan2(tx, tz);
        prints.push([cx + nx * 0.022, cz + nz * 0.022, 0.018, 0.04, rot]);
        prints.push([cx - nx * 0.022, cz - nz * 0.022, 0.018, 0.04, rot]);
        side = -side;
      }
    }
    const im = new THREE.InstancedMesh(geo, mat, prints.length);
    const mtx = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    prints.forEach(([x, z, sx, sz, rot], i) => {
      q.setFromAxisAngle(up, rot);
      mtx.compose(new THREE.Vector3(x, 0.016, z), q, new THREE.Vector3(sx, 1, sz));
      im.setMatrixAt(i, mtx);
    });
    im.instanceMatrix.needsUpdate = true;
    im.computeBoundingSphere();
    this.group.add(im);
  }

  // ---------------- snow-capped boulders (outer pool ring, trail side, platform) ----------------
  _buildBoulders() {
    const rnd = mulberry(3030);
    const items = [];
    // outer ring around the pool: bigger stones, snow on their outer (cold) side only
    let t = -0.3;
    while (t < Math.PI * 2 - 0.3) {
      const r = 0.42 + rnd() * 0.3;
      const southArc = Math.abs(((t - Math.PI / 2 + Math.PI * 3) % (Math.PI * 2)) - Math.PI) < 0.95;
      const extra = 0.75 + r * 0.6 + rnd() * 0.3;
      const x = POOL.cx + Math.cos(t) * (poolR(t) + extra);
      const z = POOL.cz + Math.sin(t) * (poolR(t) + extra);
      const okSpot =
        !southArc &&
        !this._nearCollider(x, z, r * 0.9) &&
        Math.hypot(x - FALL_ICE.x, z - FALL_ICE.z) > FALL_ICE.r + r + 0.3;
      if (okSpot) items.push({ x, z, r, ox: Math.cos(t), oz: Math.sin(t), collide: true });
      t += 0.55 + rnd() * 0.35;
    }
    // a few along the trail & by the platform
    for (const [x, z, r] of [[-10.2, -18.2, 0.5], [-3.4, -27.6, 0.45], [-9.1, -29.0, 0.38], [-21.6, -46.6, 0.6], [-14.2, -47.4, 0.45]]) {
      if (!this._nearCollider(x, z, r * 0.9)) items.push({ x, z, r, ox: 0, oz: 0, collide: true });
    }
    const geo = new THREE.DodecahedronGeometry(1, 0);
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.92, flatShading: true });
    const capGeo = new THREE.SphereGeometry(1, 12, 5, 0, Math.PI * 2, 0, Math.PI / 2);
    const palette = [0x6f7178, 0x7b7c80, 0x8d8a86, 0x66686e].map((c) => new THREE.Color(c));
    const im = new THREE.InstancedMesh(geo, mat, items.length);
    const caps = new THREE.InstancedMesh(capGeo, this.mats.snowInst, items.length);
    const mtx = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    items.forEach((it, i) => {
      const a = 1.1 + rnd() * 0.25;
      const b = 0.72 + rnd() * 0.2;
      const c = 0.95 + rnd() * 0.15;
      e.set(rnd() * 0.4, rnd() * 6.28, rnd() * 0.3);
      q.setFromEuler(e);
      const hy = it.r * b;
      mtx.compose(new THREE.Vector3(it.x, hy * 0.82, it.z), q, new THREE.Vector3(it.r * a, hy, it.r * c));
      im.setMatrixAt(i, mtx);
      im.setColorAt(i, palette[Math.floor(rnd() * palette.length)]);
      e.set(0, rnd() * 6.28, 0);
      q.setFromEuler(e);
      const off = it.r * 0.28;
      mtx.compose(
        new THREE.Vector3(it.x + it.ox * off, hy * 0.82 + hy * 0.62, it.z + it.oz * off),
        q,
        new THREE.Vector3(it.r * a * 0.74, hy * 0.36, it.r * c * 0.7)
      );
      caps.setMatrixAt(i, mtx);
      if (it.collide) this._circle(it.x, it.z, it.r * 1.0);
    });
    for (const x of [im, caps]) {
      x.instanceMatrix.needsUpdate = true;
      x.computeBoundingSphere();
      x.receiveShadow = true;
      this.group.add(x);
    }
    im.castShadow = true;
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
  }

  // ---------------- steam ----------------
  _buildSteam() {
    this._steamRnd = mulberry(1357);
    const n = this.isMobile ? 10 : 22;
    this.steam = [];
    for (let i = 0; i < n; i++) {
      const sp = new THREE.Sprite(
        new THREE.SpriteMaterial({ map: this.textures.smokePuff, color: 0xffffff, transparent: true, opacity: 0, depthWrite: false })
      );
      sp.renderOrder = 4;
      this.group.add(sp);
      const p = { sprite: sp, age: 0, life: 1, x: 0, z: 0, h: 2, size: 1, sway: 0, rotS: 0 };
      this._respawnSteam(p);
      p.age = this._steamRnd() * p.life;
      this.steam.push(p);
    }
    // low mist clinging to the water
    this.mist = [];
    const nm = this.isMobile ? 1 : 3;
    for (let i = 0; i < nm; i++) {
      const sp = new THREE.Sprite(
        new THREE.SpriteMaterial({ map: this.textures.smokePuff, color: 0xffffff, transparent: true, opacity: 0.12, depthWrite: false })
      );
      const a = (i / 3) * Math.PI * 2 + 0.5;
      sp.position.set(POOL.cx + Math.cos(a) * 1.0, WATER_Y + 0.32, POOL.cz + Math.sin(a) * 0.9);
      sp.scale.set(3.6, 1.3, 1);
      sp.renderOrder = 4;
      this.group.add(sp);
      this.mist.push({ sprite: sp, phase: i * 2.1, bx: sp.position.x, bz: sp.position.z });
    }
    this._steamColor = new THREE.Color();
    this._steamDay = new THREE.Color(0xffffff);
    this._steamNight = new THREE.Color(0xb4c3d6);
    this._steamWarm = new THREE.Color(0xffd7a6);
  }

  _respawnSteam(p) {
    const r = this._steamRnd;
    for (let k = 0; k < 8; k++) {
      const t = r() * Math.PI * 2;
      const rr = Math.sqrt(r()) * poolR(t) * 0.82;
      const x = POOL.cx + Math.cos(t) * rr;
      const z = POOL.cz + Math.sin(t) * rr;
      if (poolSd(x, z) < -0.3) {
        p.x = x;
        p.z = z;
        break;
      }
    }
    p.age = 0;
    p.life = 3.2 + r() * 2.2;
    p.h = 2.0 + r() * 1.4;
    p.size = 1.0 + r() * 0.7;
    p.sway = r() * Math.PI * 2;
    p.rotS = (r() - 0.5) * 0.4;
    p.sprite.material.rotation = r() * Math.PI * 2;
  }

  // Merge every static, opaque, single-material mesh that shares a material into one mesh
  // (hundreds of little planks, posts and stones -> a few dozen draw calls).
  // Skipped: anything under a node flagged userData.dynamic (animated parts), multi-material meshes, instanced meshes, and the snow-cap material (world.js thickens those
  // caps individually in heavy snow, so they must stay separate meshes).
  _batchStatic() {
    this.group.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(this.group.matrixWorld).invert();
    const buckets = new Map();
    const visit = (o) => {
      if (o.userData.dynamic) return;
      if (
        o.isMesh &&
        !o.isInstancedMesh &&
        !Array.isArray(o.material) &&
        o.material !== this.mats.snow &&
        o.geometry.attributes.uv &&
        o.geometry.attributes.normal &&
        !o.geometry.attributes.color
      ) {
        const key = `${o.material.uuid}|${o.castShadow ? 1 : 0}|${o.receiveShadow ? 1 : 0}`;
        if (!buckets.has(key)) buckets.set(key, []);
        buckets.get(key).push(o);
      }
      for (const c of o.children) visit(c);
    };
    for (const c of this.group.children) visit(c);
    const m = new THREE.Matrix4();
    for (const list of buckets.values()) {
      if (list.length < 2) continue;
      const geos = list.map((o) => o.geometry.clone().applyMatrix4(m.multiplyMatrices(inv, o.matrixWorld)));
      const merged = new THREE.Mesh(mergeGeos(geos), list[0].material);
      merged.castShadow = list[0].castShadow;
      merged.receiveShadow = list[0].receiveShadow;
      for (const o of list) o.parent.remove(o);
      this.group.add(merged);
    }
  }

  // =====================================================================
  //  Surface
  // =====================================================================
  getSurface(x, z) {
    if (z > -13.6 || z < -53 || x < -24 || x > 4.5) return null;

    // stargazing platform + stairs
    if (z < -42.5 && x < -12.5) {
      const { u, v } = platLocal(x, z);
      if (u >= -PLAT.half && u <= PLAT.half && Math.abs(v) <= PLAT.half) return { y: PLAT.h, surface: "wood" };
      if (u >= PLAT.stairL0 && u < PLAT.stairL1 && Math.abs(v) <= PLAT.stairHalfW) {
        return { y: (PLAT.h * (u - PLAT.stairL0)) / (PLAT.stairL1 - PLAT.stairL0), surface: "wood" };
      }
      return null;
    }

    // footbridge over the runnel
    if (z > -20.5 && z < -16.0) {
      const dx = x - BRIDGE.x;
      const dz = z - BRIDGE.z;
      const s = dx * BRIDGE.tx + dz * BRIDGE.tz;
      const l = dx * BRIDGE.nx + dz * BRIDGE.nz;
      if (Math.abs(s) <= BRIDGE.halfLen && Math.abs(l) <= BRIDGE.halfW) {
        return { y: BRIDGE.arch * Math.sin((Math.PI * (s + BRIDGE.halfLen)) / (2 * BRIDGE.halfLen)), surface: "wood" };
      }
      return null;
    }

    // hot spring water + deck
    if (z < -36.5 && z > -45.6 && x > -7.0 && x < 0.6) {
      const sd = poolSd(x, z);
      if (sd < 0) {
        return { y: WATER_Y + (POOL_BOTTOM - WATER_Y) * smoothstep(0, POOL_SLOPE, -sd), surface: "stone" };
      }
      const D = SPRING_DECK;
      if (x >= D.minX && x <= D.maxX && z >= D.minZ && z <= D.maxZ) {
        const edge = Math.min(x - D.minX, D.maxX - x, D.maxZ - z);
        return { y: DECK_Y * smoothstep(0, 0.3, edge), surface: "wood" };
      }
      return null;
    }

    // frozen plunge pool under the waterfall
    if (z < -48.5) {
      const d = Math.hypot(x - FALL_ICE.x, z - FALL_ICE.z);
      if (d < FALL_ICE.r) return { y: 0.06 * smoothstep(0, 0.25, FALL_ICE.r - d), surface: "stone" };
    }
    return null;
  }

  // =====================================================================
  //  Animation
  // =====================================================================
  update(dt, elapsed, nightFactor, playerPos, lampGlow) {
    this._elapsed = elapsed;
    dt = Math.min(dt, 0.1);

    // water shimmer + soft night glow
    this.waterTex.offset.set((elapsed * 0.011) % 1, (elapsed * 0.007) % 1);
    this.causticTex.offset.set((-elapsed * 0.016) % 1, (elapsed * 0.01) % 1);
    const breathe = 0.92 + 0.08 * Math.sin(elapsed * 0.9);
    this.waterMat.emissiveIntensity = (0.1 + lampGlow * 0.55) * breathe;
    this.causticMat.opacity = 0.09 + lampGlow * 0.13 + 0.03 * Math.sin(elapsed * 1.7);
    this.iceMat.emissiveIntensity = 0.05 + lampGlow * 0.22;

    // steam: brighter by day, cool blue-grey at night with a hint of lantern warmth
    this.steamBoost = Math.max(0, this.steamBoost - dt * 0.35);
    const c = this._steamColor.copy(this._steamDay).lerp(this._steamNight, clamp01(nightFactor));
    c.lerp(this._steamWarm, 0.18 * lampGlow);
    const peak = (0.52 - 0.08 * nightFactor) * (1 + this.steamBoost * 0.5);
    const wind = 0.12;
    for (const p of this.steam) {
      p.age += dt * (1 + this.steamBoost * 0.8);
      if (p.age >= p.life) this._respawnSteam(p);
      const t = p.age / p.life;
      const sp = p.sprite;
      sp.position.set(
        p.x + t * wind * p.life + Math.sin(elapsed * 0.8 + p.sway) * 0.12 * t,
        WATER_Y + 0.12 + t * p.h,
        p.z + Math.cos(elapsed * 0.6 + p.sway) * 0.08 * t
      );
      const sc = p.size * (0.55 + t * 1.5);
      sp.scale.set(sc, sc, 1);
      sp.material.opacity = peak * Math.pow(Math.sin(Math.PI * Math.min(1, t * 1.15)), 1.4);
      sp.material.rotation += p.rotS * dt;
      sp.material.color.copy(c);
    }
    for (const mm of this.mist) {
      mm.sprite.material.opacity = (0.2 + 0.06 * Math.sin(elapsed * 0.5 + mm.phase)) * (1 - nightFactor * 0.3) * (1 + this.steamBoost * 0.5);
      mm.sprite.material.color.copy(c);
      mm.sprite.position.x = mm.bx + Math.sin(elapsed * 0.17 + mm.phase) * 0.35;
      mm.sprite.position.z = mm.bz + Math.cos(elapsed * 0.13 + mm.phase) * 0.25;
    }

    // floating tea tray drifting slowly around the pool
    if (this.tray) {
      const a = elapsed * 0.07;
      this.tray.position.set(POOL.cx + 0.25 + Math.cos(a) * 1.05, WATER_Y + 0.025 + Math.sin(elapsed * 1.6) * 0.008, POOL.cz - 0.3 + Math.sin(a) * 0.8);
      this.tray.rotation.y = -a * 0.6;
      this.tray.rotation.z = Math.sin(elapsed * 1.3) * 0.03;
      this.tray.rotation.x = Math.cos(elapsed * 1.1) * 0.03;
    }

    // ripples when wading
    const inPool = poolSd(playerPos.x, playerPos.z) < -0.1;
    this._rippleTimer -= dt;
    if (inPool) {
      const moved = Math.hypot(playerPos.x - this._lastRipplePos.x, playerPos.z - this._lastRipplePos.z);
      if ((moved > 0.3 && this._rippleTimer <= 0) || this._rippleTimer < -1.4) {
        const r = this.ripples.reduce((best, q) => (q.age > best.age ? q : best), this.ripples[0]);
        r.age = 0;
        r.big = moved > 0.3 ? 1.15 : 0.7;
        r.mesh.position.set(playerPos.x, WATER_Y + 0.012, playerPos.z);
        r.mesh.visible = true;
        this._rippleTimer = 0.42;
        this._lastRipplePos.x = playerPos.x;
        this._lastRipplePos.z = playerPos.z;
      }
    }
    for (const r of this.ripples) {
      if (!r.mesh.visible) continue;
      r.age += dt;
      const t = r.age / r.life;
      if (t >= 1) {
        r.mesh.visible = false;
        continue;
      }
      const s = (0.3 + t * 0.9) * r.big;
      r.mesh.scale.set(s, 1, s);
      r.mesh.material.opacity = 0.38 * (1 - t) * (1 - t);
    }

    // cloth & ribbon in the breeze
    const gust = 0.6 + 0.4 * Math.sin(elapsed * 0.37);
    if (this.ribbon) {
      this.ribbon.rotation.y = 0.5 + Math.sin(elapsed * 2.3) * 0.35 * gust;
      this.ribbon.rotation.x = Math.sin(elapsed * 3.7) * 0.25 * gust;
    }
    if (this.norenPanels) {
      const near = Math.hypot(playerPos.x - (SHED.x - SHED.w / 2), playerPos.z - SHED.z) < 1.3 ? 1 : 0;
      this.norenPanels.forEach((p, i) => {
        const target = Math.sin(elapsed * 1.4 + i * 1.3) * 0.05 * gust + near * 0.35;
        p.rotation.z = THREE.MathUtils.lerp(p.rotation.z, target, Math.min(1, dt * 4));
      });
    }

    // telescope slews smoothly to where it was last pointed
    if (this.scopeYaw) {
      const k = Math.min(1, dt * 1.6);
      this.scopeYaw.rotation.y += (this.scopeYawTarget - this.scopeYaw.rotation.y) * k;
      this.scopePitch.rotation.z += (this.scopePitchTarget - this.scopePitch.rotation.z) * k;
    }

    // twinkling glints on the frozen waterfall
    for (const gl of this.glints) {
      const tw = Math.max(0, Math.sin(elapsed * 1.3 + gl.phase)) ** 8;
      gl.sprite.material.opacity = (0.15 + 0.6 * (1 - nightFactor * 0.5)) * tw;
      gl.sprite.scale.setScalar(0.18 + 0.2 * tw);
    }

    // pebbles popping onto the cairn
    for (const pb of this.cairnPebbles) {
      if (pb.pop > 0) {
        pb.pop = Math.max(0, pb.pop - dt * 3);
        const s = 1 + Math.sin((1 - pb.pop) * Math.PI) * 0.35;
        pb.mesh.scale.set(1.2 * s, 0.65 * s, 1.0 * s);
      }
    }

    this._updateDeer(dt, elapsed, nightFactor, playerPos);
  }

  _updateDeer(dt, elapsed, nightFactor, playerPos) {
    const d = this.deer;
    if (!d) return;
    const dusk = nightFactor > 0.16 && nightFactor < 0.64;
    const dist = Math.hypot(playerPos.x - d.group.position.x, playerPos.z - d.group.position.z);
    const setOpacity = (o) => {
      d.opacity = o;
      for (const mm of this.deerMats) mm.opacity = o;
      // fully opaque => back to the regular opaque pass (no sorting artefacts)
      const tr = o < 0.999;
      for (const mm of this.deerMats) {
        if (mm.transparent !== tr) {
          mm.transparent = tr;
          mm.needsUpdate = true;
        }
      }
      d.group.visible = o > 0.01;
    };
    switch (d.state) {
      case "hidden":
        if (!dusk) d.fled = false;
        if (dusk && !d.fled && dist > 11) {
          d.group.position.set(DEER_HOME.x, 0, DEER_HOME.z);
          d.group.rotation.y = Math.PI;
          d.state = "fadeIn";
        }
        break;
      case "fadeIn":
        setOpacity(Math.min(1, d.opacity + dt * 0.5));
        if (d.opacity >= 1) d.state = "idle";
        if (dist < 7.5) d.state = "alert";
        break;
      case "idle":
        if (!dusk) d.state = "fadeOut";
        else if (dist < 7.5) {
          d.state = "alert";
          d.t = 0;
        }
        break;
      case "alert":
        d.t += dt;
        if (d.t > 1.1) {
          d.state = "flee";
          d.t = 0;
        }
        break;
      case "flee": {
        d.t += dt;
        const ang = Math.atan2(0.66, 0.75); // north-east into the forest
        d.group.rotation.y += (ang - d.group.rotation.y) * Math.min(1, dt * 6);
        const sp = Math.min(4.2, d.t * 6);
        d.group.position.x += Math.cos(d.group.rotation.y) * sp * dt;
        d.group.position.z -= Math.sin(d.group.rotation.y) * sp * dt;
        d.hop += dt * 9;
        d.group.position.y = Math.abs(Math.sin(d.hop)) * 0.28;
        if (d.t > 0.5) setOpacity(Math.max(0, d.opacity - dt * 0.9));
        if (d.opacity <= 0.01) {
          d.group.position.y = 0;
          d.state = "hidden";
          d.fled = true;
        }
        break;
      }
      case "fadeOut":
        setOpacity(Math.max(0, d.opacity - dt * 0.5));
        if (d.opacity <= 0.01) d.state = "hidden";
        if (dusk && d.opacity > 0.01) d.state = "fadeIn";
        break;
      default:
        break;
    }
    if (!d.group.visible) return;

    // head: graze with the nose in the snow, lift up and look around; snap up when alert
    let neckTarget;
    let headTarget;
    const alert = d.state === "alert" || d.state === "flee";
    if (alert) {
      neckTarget = -0.15;
      headTarget = 0.1;
    } else {
      d.grazeT -= dt;
      if (d.grazeT <= 0) {
        d.grazing = !d.grazing;
        d.grazeT = d.grazing ? 3 + Math.random() * 3 : 1.8 + Math.random() * 2;
      }
      neckTarget = d.grazing ? -2.25 : -0.35;
      headTarget = d.grazing ? 1.15 + Math.sin(elapsed * 3.1) * 0.06 : 0.25;
    }
    const kk = Math.min(1, dt * (alert ? 6 : 2.2));
    d.neck.rotation.z += (neckTarget - d.neck.rotation.z) * kk;
    d.head.rotation.z += (headTarget - d.head.rotation.z) * kk;
    d.head.rotation.y = d.state === "alert" ? 0.5 : d.grazing ? 0 : Math.sin(elapsed * 0.8) * 0.4;
    const legSwing = d.state === "flee" ? Math.sin(d.hop * 2) * 0.6 : 0;
    this.deerLegs.forEach((l, i) => (l.rotation.z = i < 2 ? legSwing : -legSwing));
  }

  // =====================================================================
  //  Interactions
  // =====================================================================
  // Records a sighting in the star chart; returns the line to add to the toast
  _starNote(ctx, id) {
    const book = ctx.journal;
    if (!book) return "";
    const r = book.discover("stars", id);
    if (!r.isNew) return "";
    ctx.sound.questDone?.();
    return `\n✦ 新记入星图册：${r.entry.name}（${r.count}/${r.total}）`;
  }

  getInteractions(playerPos) {
    const soak = this.interactions[2];
    const inPool = poolSd(playerPos.x, playerPos.z) < -0.15;
    soak.label = inPool ? "在温泉里舒舒服服地泡一会儿" : "泡个温泉，暖暖身子";
    const cairn = this.interactions[1];
    cairn.label = this.cairnAdded < this.cairnPebbles.length ? "往石堆上添一块小石头" : "看看路边的石堆路标";
    return this.interactions;
  }

  // ctx.emote(x, z, kind, height, duration): height is the bubble height above y = 0,
  // so add the player's current surface height (deck / stairs / pool) to the usual 2.35
  _emoteOverPlayer(ctx, kind, duration = 1.6) {
    const p = ctx.player.position;
    ctx.emote(p.x, p.z, kind, p.y + 2.35, duration);
  }

  interact(id, ctx) {
    const now = this._elapsed;
    const p = ctx.player.position;
    switch (id) {
      case "north_sign": {
        if (now - this._signAt < 1.2) return;
        this._signAt = now;
        ctx.toast(SIGN_LINE);
        ctx.sound.dialogueBlip();
        break;
      }
      case "cairn": {
        if (now - this._cairnAt < 1.0) return;
        this._cairnAt = now;
        if (this.cairnAdded < this.cairnPebbles.length) {
          const pb = this.cairnPebbles[this.cairnAdded];
          pb.mesh.visible = true;
          pb.pop = 1;
          ctx.toast(CAIRN_LINES[Math.min(this.cairnAdded, CAIRN_LINES.length - 1)]);
          this.cairnAdded++;
          ctx.sound.plantSeed();
          ctx.popup(CAIRN_POS.x, this.cairnTopY + 0.5, CAIRN_POS.z, "+1 小石头", "#e4e7ec");
          if (this.cairnAdded === this.cairnPebbles.length) {
            ctx.sound.questDone();
            this._emoteOverPlayer(ctx, "sparkle");
            ctx.bless(CAIRN_POS.x, this.cairnTopY + 1.0, CAIRN_POS.z);
          }
        } else {
          ctx.toast(CAIRN_FULL);
        }
        break;
      }
      case "soak": {
        if (now - this._soakAt < 2.5) return;
        this._soakAt = now;
        const inPool = poolSd(p.x, p.z) < -0.15;
        const night = ctx.nightFactor > 0.5;
        const line = !inPool ? this.bagSoakEdge.next() : night ? this.bagSoakNight.next() : this.bagSoakDay.next();
        ctx.toast(line);
        ctx.sound.waterSplash();
        setTimeout(() => ctx.sound.sipWarm(), 420);
        this._emoteOverPlayer(ctx, "heart");
        ctx.popup(p.x, p.y + 1.75, p.z, "暖洋洋~", "#ffd59a");
        ctx.bless(p.x, p.y + 2.0, p.z);
        this.steamBoost = 1;
        break;
      }
      case "telescope": {
        if (now - this._scopeAt < 2.2) return;
        this._scopeAt = now;
        const nf = ctx.nightFactor;
        // swing the tube to a new patch of sky (stays roughly northward)
        this.scopeYawTarget = -Math.PI / 4 + (Math.random() - 0.5) * 1.6;
        this.scopePitchTarget = 0.4 + Math.random() * 0.45;
        if (nf < 0.2) {
          ctx.toast(SCOPE_DAY[Math.floor(Math.random() * SCOPE_DAY.length)]);
          ctx.sound.dialogueBlip();
          this._emoteOverPlayer(ctx, "dots");
          break;
        }
        if (nf < 0.5) {
          ctx.toast(SCOPE_DUSK);
          ctx.sound.dialogueBlip();
          this._emoteOverPlayer(ctx, "dots");
          break;
        }
        // optional: main.js may pass the live aurora strength (atmosphere uAurora) as ctx.aurora
        const aurora = typeof ctx.aurora === "number" ? ctx.aurora : 0;
        if (aurora > 0.25) {
          this.scopeYawTarget = -Math.PI / 4;
          this.scopePitchTarget = 0.32;
          ctx.toast(AURORA_LIVE + this._starNote(ctx, "aurora"));
          ctx.sound.questDone();
          this._emoteOverPlayer(ctx, "exclaim");
          ctx.bless(p.x, p.y + 2.0, p.z);
          break;
        }
        const roll = Math.random();
        if (roll < 1 / 6) {
          this.scopeYawTarget = -Math.PI / 4;
          this.scopePitchTarget = 0.3;
          ctx.toast(AURORA_HINT);
          ctx.sound.shootingStar(false);
          this._emoteOverPlayer(ctx, "question");
        } else if (roll < 1 / 6 + 1 / 10) {
          ctx.toast(SHOOTING_STAR_LINE + this._starNote(ctx, "meteor"));
          ctx.sound.shootingStar(false);
          this._emoteOverPlayer(ctx, "exclaim");
          ctx.bless(p.x, p.y + 2.0, p.z);
        } else {
          // Aim at a constellation the star chart is still missing most of the time, so the
          // book fills up at a friendly pace; otherwise revisit an old favourite
          const book = ctx.journal;
          const ready = now - (this._newStarAt ?? -1e9) > 35; // one new find per little while
          const missing = book && ready && Math.random() < 0.75 ? book.pickMissing("stars") : null;
          if (missing) this._newStarAt = now;
          const pick = missing || (book ? CONSTELLATIONS.filter((c) => !c.special)[Math.floor(Math.random() * 8)] : null);
          if (pick) {
            this.scopeYawTarget = -Math.PI / 4 + ((pick.id.length % 5) - 2) * 0.32;
            ctx.toast(pick.line + this._starNote(ctx, pick.id));
          } else {
            ctx.toast(this.bagStars.next());
          }
          ctx.sound.sipWarm();
          this._emoteOverPlayer(ctx, "sparkle");
          ctx.bless(p.x, p.y + 2.0, p.z);
        }
        break;
      }
      default:
        break;
    }
  }
}
