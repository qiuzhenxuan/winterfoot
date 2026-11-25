// =====================================================================
//  冬麓图鉴 — the little collection book (星图 / 鱼 / 雪人衣橱)
//
//  Holds what the player has found, draws the book's pages, and is saved with the
//  rest of the game. Zones call journal.discover(kind, id) when something is found.
// =====================================================================

// Star charts are drawn on a small pixel canvas: x / y run 0..1 across the card
export const CONSTELLATIONS = [
  {
    id: "orion",
    name: "猎户座",
    line: "猎户座的三颗腰带星排成一条直线，左上角那颗橙红色的参宿四，看上去暖暖的，像远处的一盏灯。",
    stars: [[0.3, 0.2, 3, "#ffb27a"], [0.7, 0.24, 2], [0.42, 0.52, 2], [0.5, 0.49, 2], [0.58, 0.46, 2], [0.34, 0.88, 2], [0.72, 0.84, 3, "#bfe0ff"], [0.5, 0.04, 1]],
    links: [[0, 2], [1, 4], [2, 3], [3, 4], [2, 5], [4, 6], [0, 7], [7, 1]],
  },
  {
    id: "dipper",
    name: "北斗七星",
    line: "北斗七星挂在北边的山尖上，把勺口那两颗星连起来往外延长，就找到了北极星。",
    stars: [[0.12, 0.3, 2], [0.26, 0.26, 2], [0.38, 0.32, 2], [0.5, 0.4, 2], [0.56, 0.62, 2], [0.8, 0.66, 2], [0.84, 0.44, 2], [0.9, 0.1, 3, "#fff6c8"]],
    links: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 3]],
    dashed: [[5, 7]],
  },
  {
    id: "pleiades",
    name: "昴星团",
    line: "镜头里的昴星团像一小把撒在黑丝绒上的碎钻。",
    stars: [[0.42, 0.36, 2], [0.52, 0.3, 3], [0.6, 0.4, 2], [0.48, 0.48, 2], [0.36, 0.52, 2], [0.62, 0.56, 2], [0.54, 0.62, 2], [0.44, 0.64, 1], [0.68, 0.32, 1]],
    links: [],
    glow: "#9cc8ff",
  },
  {
    id: "sirius",
    name: "大犬座 · 天狼星",
    line: "天狼星在东南方低低地闪着，是冬夜里最亮的那颗星。",
    stars: [[0.34, 0.24, 4, "#dff1ff"], [0.24, 0.42, 2], [0.42, 0.52, 2], [0.56, 0.62, 2], [0.72, 0.78, 2], [0.5, 0.84, 2], [0.66, 0.48, 2]],
    links: [[0, 1], [0, 2], [2, 3], [3, 4], [3, 5], [2, 6]],
  },
  {
    id: "cassiopeia",
    name: "仙后座",
    line: "仙后座在头顶摆成一个歪歪的 W，像在悄悄写一个名字的首字母。",
    stars: [[0.1, 0.34, 2], [0.3, 0.64, 2], [0.48, 0.42, 3], [0.68, 0.7, 2], [0.9, 0.38, 2]],
    links: [[0, 1], [1, 2], [2, 3], [3, 4]],
  },
  {
    id: "triangle",
    name: "冬季大三角",
    line: "冬季大三角：参宿四、天狼星、南河三，在夜空里连成一个大大的三角形。",
    stars: [[0.22, 0.24, 3, "#ffb27a"], [0.78, 0.3, 3, "#fff3c4"], [0.46, 0.84, 4, "#dff1ff"]],
    links: [[0, 1], [1, 2], [2, 0]],
  },
  {
    id: "gemini",
    name: "双子座",
    line: "双子座的两颗亮星并肩站着，像一对从不分开的好朋友。",
    stars: [[0.36, 0.14, 3, "#fff3c4"], [0.58, 0.18, 3, "#ffd9a8"], [0.3, 0.46, 2], [0.56, 0.5, 2], [0.22, 0.82, 2], [0.5, 0.86, 2], [0.66, 0.74, 1]],
    links: [[0, 2], [2, 4], [1, 3], [3, 5], [3, 6], [2, 3]],
  },
  {
    id: "milkyway",
    name: "银河",
    line: "银河淡淡地横过山脊，冷冽的空气让每一颗星都格外清楚。",
    band: true,
    stars: [],
    links: [],
  },
  {
    id: "meteor",
    name: "流星",
    line: "一颗流星从镜头边缘划了过去——许过的愿，会悄悄实现的。",
    special: "meteor",
    hint: "晴朗的夜里多看几次望远镜，也许能等到一颗流星。",
    stars: [],
    links: [],
  },
  {
    id: "aurora",
    name: "极光",
    line: "北边的天空飘着绿色的光带，一层一层地轻轻摆动——冬麓北边的夜空，真的有极光。",
    special: "aurora",
    hint: "极光很少出现。北边山脊上的天色亮起来时，快去观星台看看。",
    stars: [],
    links: [],
  },
];


// ---------------------------------------------------------------------
//  Fish of 镜湖 (catch & release). when: hours windows; snow: minimum snow level
//  shape: "slim" | "round" | "long" | "shrimp"; body / belly / fin colours drive both the
//  pixel card and the 3D fish that leaps out of the ice hole.
// ---------------------------------------------------------------------
export const FISH = [
  { id: "silverfish", name: "小银鱼", size: [6, 11], weight: 5, shape: "slim", body: "#cfe0ec", belly: "#f4fbff", fin: "#9fb8cc",
    line: "一条细细长长的小银鱼，像一缕会游的月光。", when: "全天", hint: "什么时候都能钓到，先从它开始吧。" },
  { id: "crucian", name: "圆滚滚的鲫鱼", size: [12, 24], weight: 5, shape: "round", body: "#b39a62", belly: "#e8d8a8", fin: "#8a7445",
    line: "圆滚滚的鲫鱼，大概整个冬天都在湖底偷吃零食。", when: "全天", hint: "什么时候都能钓到。" },
  { id: "shrimp", name: "害羞的小虾", size: [3, 7], weight: 3, shape: "shrimp", body: "#f2a48c", belly: "#ffd6c6", fin: "#d97a62",
    line: "鱼钩上挂着一只小虾，好像有点不好意思。", when: "全天", hint: "偶尔会挂在鱼钩上。" },
  { id: "trout", name: "冰湖虹鳟", size: [20, 42], weight: 4, shape: "slim", body: "#a9c0a8", belly: "#eef2dc", fin: "#7f9a7e", stripe: "#f09ab4",
    line: "身上带着一道淡淡的彩虹，冬天里也这么好看。", when: "白天 6 点到 17 点", hours: [[6, 17]], hint: "白天才出来晒太阳。" },
  { id: "whitefish", name: "晨雾白鲑", size: [18, 36], weight: 3, shape: "slim", body: "#e6ecef", belly: "#ffffff", fin: "#b8c6cf",
    line: "清晨的薄雾还没散，白鲑就在冰下慢慢游，像一片会动的雪。", when: "清晨 5 点到 9 点", hours: [[5, 9]], hint: "太阳刚出来的时候去冰洞看看。" },
  { id: "dusk_perch", name: "暮光鳜鱼", size: [16, 34], weight: 3, shape: "round", body: "#d98b4a", belly: "#ffd9a0", fin: "#a85a2c", spots: "#7a3e1c",
    line: "夕阳落在冰面上的时候，鳜鱼身上的花纹也跟着发光。", when: "黄昏 16 点到 19 点半", hours: [[16, 19.5]], hint: "黄昏时分会游到冰洞附近。" },
  { id: "snow_perch", name: "雪花鲈", size: [14, 30], weight: 3, shape: "round", body: "#8fb3c9", belly: "#eaf6ff", fin: "#6a8ea6", spots: "#ffffff",
    line: "鳞片上的白点像落了一身雪花，下雪天特别爱咬钩。", when: "下雪的时候", snow: 1, hint: "下雪的时候才出来。" },
  { id: "starfish_minnow", name: "星光小鱼", size: [5, 10], weight: 4, shape: "slim", body: "#9fc4ff", belly: "#e2eeff", fin: "#6f94d6", spots: "#fff3a8",
    line: "鳞片上映着满天星星，一眨眼就游回了湖底。", when: "夜里 20 点到清晨 5 点", hours: [[20, 24], [0, 5]], hint: "只在夜里出现。" },
  { id: "sculpin", name: "瞌睡小胖头", size: [8, 15], weight: 2, shape: "round", body: "#7e7466", belly: "#c9bba4", fin: "#5c5348",
    line: "大脑袋、小尾巴，半夜被钓上来还在打哈欠。", when: "深夜 22 点到 3 点", hours: [[22, 24], [0, 3]], hint: "深夜才醒着。" },
  { id: "ice_cod", name: "冰湖鳕", size: [25, 52], weight: 2, shape: "long", body: "#9aa7a1", belly: "#e7ece6", fin: "#6f7c76", spots: "#c8d2cc",
    line: "大雪天从深水里游上来的鳕鱼，摸上去冰冰凉凉。", when: "大雪的时候", snow: 2, hint: "要等一场大雪。" },
  { id: "koi", name: "金色小锦鲤", size: [15, 28], weight: 0.45, shape: "round", body: "#ffc23a", belly: "#fff0b8", fin: "#ff8a3a", spots: "#ffffff", rare: true,
    line: "传说在镜湖钓到金色锦鲤的人，新的一岁会特别好运。", when: "全天 · 很少见", hint: "很少见，多钓几次碰碰运气。" },
  { id: "old_pike", name: "镜湖老狗鱼", size: [70, 110], weight: 0.6, shape: "long", body: "#5f7a52", belly: "#d8dcae", fin: "#465c3c", spots: "#c9d68a", rare: true,
    line: "镜湖的老住户，牙齿尖尖，眼神却很温和。和它合个影，再放它回去当湖主。", when: "大雪的夜里 · 很少见", hours: [[20, 24], [0, 5]], snow: 2, hint: "传说它只在大雪的夜里出没。" },
];

const inHours = (h, ranges) => !ranges || ranges.some(([a, b]) => h >= a && h < b);
export function fishAvailable(f, hours, snowLevel) {
  return inHours(hours, f.hours) && (f.snow === undefined || snowLevel >= f.snow);
}

// Pixel fish card: icy water, a little fish drawn from a few ellipses with an outline
function drawFishCard(canvas, f, found) {
  const W = 64;
  const H = 44;
  canvas.width = W;
  canvas.height = H;
  const g = canvas.getContext("2d");
  if (!g) return;
  g.imageSmoothingEnabled = false;
  const grad = g.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, found ? "#9fd3ea" : "#a8b4bc");
  grad.addColorStop(1, found ? "#3f7fa6" : "#6f7d88");
  g.fillStyle = grad;
  g.fillRect(0, 0, W, H);
  const rnd = seeded(f.id.length * 977 + f.id.charCodeAt(0));
  // light ripples and bubbles
  g.fillStyle = "rgba(255,255,255,0.28)";
  for (let i = 0; i < 6; i++) g.fillRect(Math.floor(rnd() * W), Math.floor(rnd() * 10) + 2, 3 + Math.floor(rnd() * 5), 1);
  g.fillStyle = "rgba(255,255,255,0.45)";
  for (let i = 0; i < 4; i++) {
    const x = 48 + Math.floor(rnd() * 12);
    const y = 6 + Math.floor(rnd() * 18);
    g.fillRect(x, y, 1, 1);
  }
  // weeds at the bottom
  g.fillStyle = found ? "#2f6b5a" : "#56636b";
  for (let x = 2; x < W; x += 5 + Math.floor(rnd() * 4)) {
    const h = 4 + Math.floor(rnd() * 6);
    for (let y = 0; y < h; y++) g.fillRect(x + (y % 4 < 2 ? 0 : 1), H - 1 - y, 1, 1);
  }

  // rasterise the fish into a small grid so we can outline it
  const grid = new Map(); // "x,y" -> colour
  const put = (x, y, c) => grid.set(`${x},${y}`, c);
  const sil = !found;
  const col = (c) => (sil ? "#2b3238" : c);
  const cx = 30;
  const cy = 22;
  const shape = f.shape;
  const len = shape === "long" ? 20 : shape === "round" ? 14 : shape === "shrimp" ? 12 : 17;
  const ht = shape === "round" ? 8 : shape === "long" ? 5 : shape === "shrimp" ? 4 : 5.5;
  if (shape === "shrimp") {
    // curled body: chain of shrinking segments
    for (let i = 0; i < 9; i++) {
      const a = -0.2 + i * 0.36;
      const r = 4.2 - i * 0.32;
      const sx = cx + Math.cos(a) * 7;
      const sy = cy + Math.sin(a) * 6;
      for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) if (x * x + y * y <= r * r) put(Math.round(sx + x), Math.round(sy + y), col(i % 2 ? f.body : f.belly));
    }
    for (let i = 0; i < 9; i++) put(cx + 8 + i, cy - 6 - Math.round(i * 0.6), col(f.fin)); // feelers
    for (let i = 0; i < 7; i++) put(cx + 9 + i, cy - 4 - Math.round(i * 0.25), col(f.fin));
  } else {
    // tail
    for (let y = -ht; y <= ht; y++) {
      const w = Math.round(4 + Math.abs(y) * 0.5);
      for (let x = 0; x < w; x++) if (Math.abs(y) >= x * 0.55 - 1) put(cx - len - x + 1, cy + Math.round(y), col(f.fin));
    }
    // body (egg shape, fuller at the head)
    for (let y = -ht - 1; y <= ht + 1; y++) {
      for (let x = -len; x <= len; x++) {
        const k = x > 0 ? len * 0.92 : len;
        const hh = ht * (x > 0 ? 1 : 1 - 0.25 * (-x / len));
        if ((x * x) / (k * k) + (y * y) / (hh * hh) <= 1) {
          const belly = y > hh * 0.25;
          let c = belly ? f.belly : f.body;
          if (f.stripe && Math.abs(y - hh * 0.05) < 1.2 && x < len * 0.6) c = f.stripe;
          if (f.spots && !belly && ((x * 7 + y * 13) & 7) === 0 && x < len * 0.7) c = f.spots;
          put(cx + x, cy + y, col(c));
        }
      }
    }
    // dorsal and belly fins
    for (let i = 0; i < 6; i++) for (let j = 0; j <= Math.floor((6 - i) / 2); j++) put(cx - 4 + i, cy - Math.ceil(ht) - 1 - j, col(f.fin));
    for (let i = 0; i < 3; i++) put(cx + 1 + i, cy + Math.ceil(ht) + 1, col(f.fin));
    // gill line
    if (!sil) for (let y = -ht * 0.5; y <= ht * 0.5; y++) put(cx + Math.round(len * 0.45), cy + Math.round(y), f.fin);
  }
  // outline
  const dark = sil ? "#1a1f24" : "#2a1a12";
  for (const key of grid.keys()) {
    const [x, y] = key.split(",").map(Number);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const k2 = `${x + dx},${y + dy}`;
      if (!grid.has(k2)) {
        g.fillStyle = dark;
        g.fillRect(x + dx, y + dy, 1, 1);
      }
    }
  }
  for (const [key, c] of grid) {
    const [x, y] = key.split(",").map(Number);
    g.fillStyle = c;
    g.fillRect(x, y, 1, 1);
  }
  if (!sil) {
    // eye with a highlight, a shine on the back
    const ex = shape === "shrimp" ? cx + 9 : cx + Math.round(len * 0.62);
    const ey = shape === "shrimp" ? cy - 3 : cy - Math.round(ht * 0.3);
    g.fillStyle = "#15161c";
    g.fillRect(ex, ey, 2, 2);
    g.fillStyle = "#ffffff";
    g.fillRect(ex, ey, 1, 1);
    if (shape !== "shrimp") {
      g.fillStyle = "rgba(255,255,255,0.55)";
      for (let i = 0; i < 6; i++) g.fillRect(cx - 2 + i, cy - Math.round(ht * 0.62), 1, 1);
    }
    if (f.rare) {
      g.fillStyle = "#fff3a8";
      for (const [x, y] of [[6, 6], [56, 8], [10, 34]]) {
        g.fillRect(x, y - 1, 1, 3);
        g.fillRect(x - 1, y, 3, 1);
      }
    }
  }
}

const TABS = [
  { kind: "stars", title: "星图", empty: "夜里去北边观星台，用望远镜看看星星吧", hint: "天黑以后去北边观星台，用望远镜慢慢找。", list: () => CONSTELLATIONS },
  {
    kind: "fish",
    title: "鱼",
    empty: "去南边镜湖的冰钓小洞钓钓鱼吧。不同的时间和天气，会遇到不同的鱼。",
    list: () => FISH,
    draw: (cv, f, found) => drawFishCard(cv, f, found),
    detail: (f, book) => {
      const best = book.extra.fishBest && book.extra.fishBest[f.id];
      return `出没：${f.when}` + (best ? ` · 最大纪录 ${best} 厘米` : "");
    },
  },
];

// Tiny seeded random so a card looks the same every time it is drawn
function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Pixel night-sky card: chunky square stars, soft plus-shaped glints, stepped lines
function drawStarCard(canvas, c, found) {
  const W = 64;
  const H = 44;
  canvas.width = W;
  canvas.height = H;
  const g = canvas.getContext("2d");
  if (!g) return;
  g.imageSmoothingEnabled = false;
  const grad = g.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, found ? "#1b2550" : "#3a3550");
  grad.addColorStop(1, found ? "#2d2a5e" : "#4a4458");
  g.fillStyle = grad;
  g.fillRect(0, 0, W, H);
  const rnd = seeded(c.id.split("").reduce((s, ch) => s * 31 + ch.charCodeAt(0), 7));
  // faint background stars
  for (let i = 0; i < 26; i++) {
    g.fillStyle = `rgba(255,255,255,${0.12 + rnd() * 0.22})`;
    g.fillRect(Math.floor(rnd() * W), Math.floor(rnd() * H), 1, 1);
  }
  if (!found) {
    g.fillStyle = "rgba(255,255,255,0.55)";
    g.font = "bold 16px sans-serif";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText("？", W / 2, H / 2 + 1);
    return;
  }
  // ridge line at the bottom, like looking over the mountains
  g.fillStyle = "#151b34";
  for (let x = 0; x < W; x++) {
    const h = 3 + Math.round(Math.abs(Math.sin(x * 0.19 + c.id.length)) * 3 + Math.sin(x * 0.07) * 1.5);
    g.fillRect(x, H - h, 1, h);
  }
  if (c.band) {
    for (let i = 0; i < 160; i++) {
      const t = rnd();
      const x = Math.floor(t * W);
      const y = Math.floor(H * 0.75 - t * H * 0.55 + (rnd() - 0.5) * 12);
      g.fillStyle = `rgba(${200 + rnd() * 55 | 0},${205 + rnd() * 40 | 0},255,${0.25 + rnd() * 0.5})`;
      g.fillRect(x, y, 1, 1);
    }
    return;
  }
  if (c.special === "meteor") {
    for (let i = 0; i < 18; i++) {
      g.fillStyle = `rgba(255,248,214,${1 - i / 18})`;
      g.fillRect(46 - i * 2, 9 + i, 2, 1);
    }
    g.fillStyle = "#fffbe6";
    g.fillRect(46, 8, 2, 2);
    return;
  }
  if (c.special === "aurora") {
    for (let x = 0; x < W; x++) {
      const base = 16 + Math.sin(x * 0.16) * 4 + Math.sin(x * 0.05 + 1) * 3;
      for (let y = 0; y < 14; y++) {
        const a = (1 - y / 14) * 0.55;
        g.fillStyle = y < 3 ? `rgba(180,255,214,${a})` : `rgba(80,230,160,${a * 0.8})`;
        g.fillRect(x, Math.round(base + y), 1, 1);
      }
    }
    return;
  }
  const px = (s) => [Math.round(s[0] * (W - 8)) + 4, Math.round(s[1] * (H - 12)) + 3];
  const line = (a, b, dashed) => {
    const [x0, y0] = px(c.stars[a]);
    const [x1, y1] = px(c.stars[b]);
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
    g.fillStyle = dashed ? "rgba(255,236,170,0.45)" : "rgba(170,200,255,0.55)";
    for (let i = 0; i <= n; i++) {
      if (dashed && i % 3 === 2) continue;
      g.fillRect(Math.round(x0 + ((x1 - x0) * i) / n), Math.round(y0 + ((y1 - y0) * i) / n), 1, 1);
    }
  };
  for (const [a, b] of c.links) line(a, b, false);
  for (const [a, b] of c.dashed || []) line(a, b, true);
  for (const s of c.stars) {
    const [x, y] = px(s);
    const size = s[2] || 2;
    const col = s[3] || c.glow || "#fff7dc";
    g.fillStyle = "rgba(255,255,255,0.22)";
    if (size >= 3) {
      g.fillRect(x - 2, y, 5, 1);
      g.fillRect(x, y - 2, 1, 5);
    }
    g.fillStyle = col;
    const o = size >= 3 ? 1 : 0;
    g.fillRect(x - o, y - o, size >= 3 ? 3 : size >= 2 ? 2 : 1, size >= 3 ? 3 : size >= 2 ? 2 : 1);
  }
}

export class Journal {
  constructor({ onNew, onComplete } = {}) {
    this.onNew = onNew;
    this.onComplete = onComplete;
    this.tabs = TABS;
    this.found = { stars: [], fish: [] };
    this.extra = {}; // per-kind details (best fish size...), filled by later pages
    this.rewarded = [];
    this.tab = "stars";
    this.selected = null;
    this._bindDom();
  }

  // ---------- data ----------
  has(kind, id) {
    return (this.found[kind] || []).includes(id);
  }

  count(kind) {
    return (this.found[kind] || []).length;
  }

  total(kind) {
    const t = this.tabs.find((x) => x.kind === kind);
    return t ? t.list().length : 0;
  }

  entry(kind, id) {
    const t = this.tabs.find((x) => x.kind === kind);
    return t ? t.list().find((e) => e.id === id) : null;
  }

  // Returns { isNew, count, total, entry, complete }
  discover(kind, id) {
    const entry = this.entry(kind, id);
    if (!entry) return { isNew: false, count: this.count(kind), total: this.total(kind), entry: null, complete: false };
    if (!this.found[kind]) this.found[kind] = [];
    const isNew = !this.found[kind].includes(id);
    if (isNew) this.found[kind].push(id);
    const count = this.count(kind);
    const total = this.total(kind);
    const complete = isNew && count === total && !this.rewarded.includes(kind);
    if (isNew && this.onNew) this.onNew(kind, entry, count, total);
    if (complete) {
      this.rewarded.push(kind);
      if (this.onComplete) this.onComplete(kind);
    }
    this._refreshBadge();
    if (this.isOpen()) this.render();
    return { isNew, count, total, entry, complete };
  }

  // Keeps the biggest catch per fish; returns true when this one beats the old record
  recordFishSize(id, cm) {
    if (!this.extra.fishBest) this.extra.fishBest = {};
    const old = this.extra.fishBest[id] || 0;
    if (cm > old) this.extra.fishBest[id] = cm;
    return old > 0 && cm > old;
  }

  // Something not yet found, for the zones to aim at (null when the page is full)
  pickMissing(kind) {
    const t = this.tabs.find((x) => x.kind === kind);
    if (!t) return null;
    const left = t.list().filter((e) => !this.has(kind, e.id) && !e.special);
    return left.length ? left[Math.floor(Math.random() * left.length)] : null;
  }

  getState() {
    return { found: JSON.parse(JSON.stringify(this.found)), extra: JSON.parse(JSON.stringify(this.extra)), rewarded: this.rewarded.slice() };
  }

  restoreState(s) {
    if (!s || typeof s !== "object") return;
    if (s.found && typeof s.found === "object") {
      for (const [k, v] of Object.entries(s.found)) if (Array.isArray(v)) this.found[k] = v.filter((x) => typeof x === "string");
    }
    if (s.extra && typeof s.extra === "object") this.extra = s.extra;
    if (Array.isArray(s.rewarded)) this.rewarded = s.rewarded.filter((x) => typeof x === "string");
    this._refreshBadge();
  }

  reset() {
    this.found = { stars: [], fish: [] };
    this.extra = {};
    this.rewarded = [];
    this._refreshBadge();
  }

  addTab(tab) {
    if (!this.tabs.some((t) => t.kind === tab.kind)) this.tabs = [...this.tabs, tab];
    if (!this.found[tab.kind]) this.found[tab.kind] = [];
    this._buildTabs();
    this._refreshBadge();
  }

  // ---------- book ----------
  _bindDom() {
    const $ = (id) => (typeof document !== "undefined" && document.getElementById ? document.getElementById(id) : null);
    this.el = $("journal-modal");
    this.elTabs = $("journal-tabs");
    this.elGrid = $("journal-grid");
    this.elDetail = $("journal-detail");
    this.elProgress = $("journal-progress");
    this.elBadge = $("journal-count");
    if (!this.el) return;
    $("btn-close-journal")?.addEventListener("click", () => this.close());
    $("btn-journal")?.addEventListener("click", () => (this.isOpen() ? this.close() : this.open()));
    this.el.addEventListener("pointerdown", (e) => {
      if (e.target === this.el) this.close();
    });
    this._buildTabs();
    this._refreshBadge();
  }

  _buildTabs() {
    if (!this.elTabs) return;
    this.elTabs.innerHTML = "";
    for (const t of this.tabs) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "journal-tab" + (t.kind === this.tab ? " active" : "");
      b.dataset.kind = t.kind;
      b.textContent = t.title;
      b.addEventListener("click", () => {
        this.tab = t.kind;
        this.selected = null;
        this.render();
      });
      this.elTabs.appendChild(b);
    }
  }

  _refreshBadge() {
    if (!this.elBadge) return;
    let n = 0;
    let all = 0;
    for (const t of this.tabs) {
      n += this.count(t.kind);
      all += t.list().length;
    }
    this.elBadge.textContent = `${n}/${all}`;
  }

  isOpen() {
    return !!this.el && !this.el.classList.contains("hidden");
  }

  open(kind = null) {
    if (!this.el) return;
    if (kind) this.tab = kind;
    this.el.classList.remove("hidden");
    this.render();
  }

  close() {
    if (!this.el) return;
    this.el.classList.add("hidden");
  }

  stepTab(delta) {
    const i = this.tabs.findIndex((t) => t.kind === this.tab);
    const n = this.tabs.length;
    this.tab = this.tabs[(i + delta + n) % n].kind;
    this.selected = null;
    this.render();
  }

  render() {
    if (!this.el) return;
    const tab = this.tabs.find((t) => t.kind === this.tab) || this.tabs[0];
    for (const b of this.elTabs.children) b.classList.toggle("active", b.dataset.kind === tab.kind);
    const list = tab.list();
    this.elProgress.textContent = `${this.count(tab.kind)} / ${list.length}`;
    this.elGrid.innerHTML = "";
    this.elGrid.dataset.kind = tab.kind;
    for (const e of list) {
      const found = this.has(tab.kind, e.id);
      const card = document.createElement("button");
      card.type = "button";
      card.className = "journal-card" + (found ? " found" : "") + (this.selected === e.id ? " selected" : "");
      const cv = document.createElement("canvas");
      cv.className = "journal-art";
      if (tab.draw) tab.draw(cv, e, found, this);
      else drawStarCard(cv, e, found);
      const name = document.createElement("span");
      name.className = "journal-name";
      name.textContent = found ? e.name : "？？？";
      card.append(cv, name);
      card.addEventListener("click", () => {
        this.selected = e.id;
        this.render();
      });
      this.elGrid.appendChild(card);
    }
    const sel = this.selected && list.find((e) => e.id === this.selected);
    if (sel && this.has(tab.kind, sel.id)) {
      const extra = tab.detail ? tab.detail(sel, this) : "";
      this.elDetail.innerHTML = "";
      const h = document.createElement("strong");
      h.textContent = sel.name;
      const p = document.createElement("p");
      p.textContent = sel.line + (extra ? `\n${extra}` : "");
      this.elDetail.append(h, p);
    } else if (sel) {
      this.elDetail.textContent = sel.hint || tab.hint || "还没有找到。";
    } else {
      this.elDetail.textContent = this.count(tab.kind) ? "点一张卡片看看详情。" : tab.empty;
    }
  }
}
