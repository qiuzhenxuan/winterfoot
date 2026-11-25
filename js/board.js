import * as THREE from "three";

// 布告栏小委托: a wooden notice board by the yard path. Every morning a couple of notes
// from the valley's neighbours go up on it: bring some carrots, catch a few fish, look
// at the stars... Take a note down to start it. Errands pay out by post the moment
// they're done; deliveries are handed over at the board.

const PEOPLE = {
  lin: { name: "杂货铺林婶", color: "#c8443a" },
  zhou: { name: "钓鱼的周伯", color: "#3f72b8" },
  aman: { name: "邮差阿满", color: "#5c8a4a" },
  xiaoyu: { name: "小雨", color: "#d47aa0" },
  chen: { name: "磨坊的陈叔", color: "#b8862f" },
};

const ITEM_NAMES = {
  carrot: "胡萝卜",
  radish: "白萝卜",
  cabbage: "卷心菜",
  pumpkin: "南瓜",
  egg: "鸡蛋",
  milk: "鲜奶",
  wool: "羊毛",
  firewood: "松木柴火",
};

// unit: what the count is called; n: [min, max]; pay(n, prices) -> gold
export const BOARD_TEMPLATES = [
  { id: "d_carrot", type: "deliver", item: "carrot", unit: "根", who: "lin", n: [2, 4], text: "想烤一盘胡萝卜蛋糕，麻烦送 {n} 根胡萝卜到布告栏来。" },
  { id: "d_radish", type: "deliver", item: "radish", unit: "根", who: "lin", n: [2, 3], text: "腌菜坛子空了，想要 {n} 根白萝卜。" },
  { id: "d_cabbage", type: "deliver", item: "cabbage", unit: "颗", who: "chen", n: [1, 2], text: "磨坊今晚包饺子，缺 {n} 颗卷心菜。" },
  { id: "d_pumpkin", type: "deliver", item: "pumpkin", unit: "个", who: "chen", n: [1, 1], text: "孙女想要一个南瓜做灯笼，能匀给我一个吗？" },
  { id: "d_egg", type: "deliver", item: "egg", unit: "颗", who: "lin", n: [2, 3], text: "店里的鸡蛋卖完了，求 {n} 颗新鲜土鸡蛋。" },
  { id: "d_milk", type: "deliver", item: "milk", unit: "瓶", who: "xiaoyu", n: [1, 2], text: "想给奶奶煮热牛奶，需要 {n} 瓶鲜奶。" },
  { id: "d_wool", type: "deliver", item: "wool", unit: "团", who: "aman", n: [1, 2], text: "邮包的手套破了，想要 {n} 团羊毛自己织一副。" },
  { id: "d_wood", type: "deliver", item: "firewood", unit: "根", who: "zhou", n: [2, 3], text: "冰钓小屋的炉子快灭了，送 {n} 根柴火来吧。" },
  { id: "e_fish", type: "fish", unit: "条", who: "zhou", n: [2, 3], text: "老腰又疼了，替我去镜湖钓 {n} 条鱼吧，钓上来记一下就放生。" },
  { id: "e_star", type: "star", unit: "次", who: "xiaoyu", n: [1, 1], text: "今晚想知道天上有什么，能帮我用北边的望远镜看一次星星吗？" },
  { id: "e_fire", type: "campfire", unit: "次", who: "aman", n: [2, 2], text: "送信路过林间篝火时冻坏了，帮忙给篝火添 {n} 次柴。" },
  { id: "e_pet", type: "pet", unit: "次", who: "xiaoyu", n: [3, 4], text: "牧场的小动物们今天有点闷，去陪它们玩 {n} 次吧。" },
  { id: "e_feed", type: "feed", unit: "次", who: "chen", n: [1, 1], text: "刚送了一车新干草，帮我把牧场的食槽添满。" },
  { id: "e_ship", type: "ship", unit: "G", who: "lin", n: [150, 300], text: "镇上的集市缺货，往出货箱卖出 {n} G 的东西吧。" },
  { id: "e_snowman", type: "snowman", unit: "次", who: "xiaoyu", n: [1, 1], text: "镜湖边的雪人好久没换衣服了，给它换一身新装扮好不好？" },
  { id: "e_wood", type: "wood", unit: "根", who: "aman", n: [3, 4], text: "山路上的松枝被雪压断了，捡 {n} 根松木柴火回来。" },
];
const TPL = new Map(BOARD_TEMPLATES.map((t) => [t.id, t]));
const EVENT_PAY = { fish: 55, star: 90, campfire: 35, pet: 25, feed: 70, snowman: 80, wood: 22 };

function seeded(seed) {
  let s = (seed * 2654435761) >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 100000) / 100000;
  };
}

const roundPay = (g) => Math.max(20, Math.round(g / 5) * 5);

export class NoticeBoard {
  // prices: {carrot: 35, ...}; getInventory() -> inventory object; addGold(n); onChange();
  // onNotes(count) -> how many notes hang on the board; onDone(note, text)
  constructor({ prices = {}, getInventory, addGold, onChange, onNotes, onDone, sound } = {}) {
    this.prices = prices;
    this.getInventory = getInventory || (() => ({}));
    this.addGold = addGold || (() => {});
    this.onChange = onChange;
    this.onNotes = onNotes;
    this.onDone = onDone;
    this.sound = sound;
    this.reset(false);
    this._bindDom();
  }

  reset(notify = true) {
    this.day = 0;
    this.posted = []; // today's notes still on the board
    this.active = []; // notes the player took down
    this.completed = 0;
    this.sel = 0;
    if (notify) this._notify();
  }

  // ---------- state ----------
  _make(tid, rnd) {
    const t = TPL.get(tid);
    const [a, b] = t.n;
    let n = a + Math.floor(rnd() * (b - a + 1));
    if (t.type === "ship") n = Math.round(n / 10) * 10;
    let reward;
    if (t.type === "deliver") reward = roundPay(n * (this.prices[t.item] || 20) * 1.35 + 20);
    else if (t.type === "ship") reward = roundPay(n * 0.3 + 30);
    else reward = roundPay(n * (EVENT_PAY[t.type] || 40) + 20);
    return { tid, n, reward, progress: 0 };
  }

  // New morning: fresh notes go up (the ones nobody took come down)
  newDay(day) {
    if (day === this.day) return;
    this.day = day;
    const rnd = seeded(day * 31 + 7);
    const busy = new Set(this.active.map((a) => a.tid));
    const pool = BOARD_TEMPLATES.filter((t) => !busy.has(t.id));
    const picks = [];
    // one delivery and one errand most days, so there is always something to do
    const deliveries = pool.filter((t) => t.type === "deliver");
    const errands = pool.filter((t) => t.type !== "deliver");
    if (deliveries.length) picks.push(deliveries[Math.floor(rnd() * deliveries.length)].id);
    if (errands.length) picks.push(errands[Math.floor(rnd() * errands.length)].id);
    this.posted = picks.map((id) => this._make(id, rnd));
    this.sel = 0;
    this._notify();
  }

  template(note) {
    return TPL.get(note.tid);
  }

  describe(note) {
    const t = TPL.get(note.tid);
    return t.text.replace("{n}", note.n);
  }

  person(note) {
    return PEOPLE[TPL.get(note.tid).who];
  }

  have(note) {
    const t = TPL.get(note.tid);
    if (t.type !== "deliver") return note.progress;
    return this.getInventory()[t.item] || 0;
  }

  ready(note) {
    return this.have(note) >= note.n;
  }

  take(i) {
    const note = this.posted[i];
    if (!note) return null;
    this.posted.splice(i, 1);
    this.active.push(note);
    this._notify();
    return note;
  }

  // Hand over the goods for a delivery note
  deliver(note) {
    const t = TPL.get(note.tid);
    if (t.type !== "deliver" || !this.active.includes(note) || !this.ready(note)) return false;
    const inv = this.getInventory();
    inv[t.item] -= note.n;
    this._finish(note);
    return true;
  }

  _finish(note) {
    this.active = this.active.filter((a) => a !== note);
    this.completed += 1;
    this.addGold(note.reward);
    const p = this.person(note);
    const line = `✦ 委托完成！${p.name}送来 ${note.reward} 金币作为谢礼。`;
    if (this.onDone) this.onDone(note, line);
    this._notify();
  }

  // Something happened in the world (a fish caught, a fire stoked...)
  note(type, amount = 1) {
    let changed = false;
    for (const a of [...this.active]) {
      const t = TPL.get(a.tid);
      if (t.type !== type) continue;
      a.progress = Math.min(a.n, a.progress + amount);
      changed = true;
      if (a.progress >= a.n) this._finish(a);
    }
    if (changed) {
      if (this.onChange) this.onChange();
      if (this.isOpen()) this.render();
    }
  }

  getState() {
    return { day: this.day, posted: this.posted.map((x) => ({ ...x })), active: this.active.map((x) => ({ ...x })), completed: this.completed };
  }

  restoreState(s) {
    if (!s || typeof s !== "object") return;
    const ok = (x) => x && TPL.has(x.tid) && x.n > 0 && x.reward > 0;
    const clean = (x) => ({ tid: x.tid, n: x.n | 0, reward: x.reward | 0, progress: Math.max(0, x.progress | 0) });
    this.day = s.day | 0;
    this.posted = Array.isArray(s.posted) ? s.posted.filter(ok).map(clean).slice(0, 3) : [];
    this.active = Array.isArray(s.active) ? s.active.filter(ok).map(clean).slice(0, 6) : [];
    this.completed = Math.max(0, s.completed | 0);
    this._notify(false);
  }

  _notify(save = true) {
    if (this.onNotes) this.onNotes(this.posted.length);
    if (save && this.onChange) this.onChange();
    if (this.isOpen()) this.render();
  }

  // ---------- panel ----------
  _bindDom() {
    const $ = (id) => (typeof document !== "undefined" && document.getElementById ? document.getElementById(id) : null);
    this.el = $("board-modal");
    this.elNotes = $("board-notes");
    this.elMine = $("board-mine");
    this.elCount = $("board-count");
    if (!this.el) return;
    $("btn-close-board")?.addEventListener("click", () => this.close());
    this.el.addEventListener("pointerdown", (e) => {
      if (e.target === this.el) this.close();
    });
  }

  isOpen() {
    return !!this.el && !this.el.classList.contains("hidden");
  }

  open() {
    if (!this.el) return;
    this.sel = 0;
    this.el.classList.remove("hidden");
    this.render();
  }

  close() {
    if (!this.el) return;
    this.el.classList.add("hidden");
  }

  // Keyboard: the list is posted notes first, then the player's own
  _items() {
    return [...this.posted.map((n, i) => ({ kind: "posted", note: n, i })), ...this.active.map((n) => ({ kind: "mine", note: n }))];
  }

  move(d) {
    const n = this._items().length;
    if (!n) return;
    this.sel = (this.sel + d + n) % n;
    this.render();
  }

  activate() {
    const it = this._items()[this.sel];
    if (!it) return null;
    return this._act(it);
  }

  _act(it) {
    if (it.kind === "posted") {
      this.take(it.i);
      if (this.sound) this.sound.paperRustle?.();
      return { kind: "take", note: it.note };
    }
    const t = TPL.get(it.note.tid);
    if (t.type === "deliver") {
      if (this.deliver(it.note)) {
        if (this.sound) this.sound.questDone?.();
        return { kind: "deliver", note: it.note };
      }
      this.render(`还差 ${it.note.n - this.have(it.note)} ${t.unit}${ITEM_NAMES[t.item]}。`);
      return { kind: "short", note: it.note };
    }
    return { kind: "busy", note: it.note };
  }

  _noteEl(note, kind, idx, selected) {
    const t = TPL.get(note.tid);
    const p = PEOPLE[t.who];
    const card = document.createElement("div");
    card.className = `board-note ${kind}` + (selected ? " selected" : "");
    card.style.setProperty("--tilt", `${((idx * 37) % 7) - 3}deg`);
    const pin = document.createElement("i");
    pin.className = "board-pin";
    pin.style.background = p.color;
    const who = document.createElement("strong");
    who.textContent = p.name;
    const body = document.createElement("p");
    body.textContent = this.describe(note);
    const foot = document.createElement("div");
    foot.className = "board-foot";
    const pay = document.createElement("span");
    pay.className = "board-pay";
    pay.textContent = `谢礼 ${note.reward} G`;
    foot.appendChild(pay);
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "board-btn";
    if (kind === "posted") {
      btn.textContent = "揭下来";
    } else {
      const have = Math.min(this.have(note), note.n);
      const prog = document.createElement("span");
      prog.className = "board-prog";
      prog.textContent = t.type === "deliver" ? `背包里 ${this.have(note)}/${note.n}` : `${have}/${note.n}`;
      foot.appendChild(prog);
      if (t.type === "deliver") {
        btn.textContent = "交付";
        btn.disabled = !this.ready(note);
      } else {
        btn.textContent = "进行中";
        btn.disabled = true;
      }
    }
    foot.appendChild(btn);
    card.append(pin, who, body, foot);
    return { card, btn };
  }

  render(note = "") {
    if (!this.el) return;
    const items = this._items();
    this.sel = Math.min(this.sel, Math.max(0, items.length - 1));
    this.elCount.textContent = `已完成 ${this.completed} 件`;
    this.elNotes.innerHTML = "";
    this.elMine.innerHTML = "";
    items.forEach((it, k) => {
      const { card, btn } = this._noteEl(it.note, it.kind, k, k === this.sel);
      const run = () => {
        this.sel = k;
        this._act(it);
        if (this.isOpen()) this.render();
      };
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        run();
      });
      card.addEventListener("click", () => {
        this.sel = k;
        this.render();
      });
      (it.kind === "posted" ? this.elNotes : this.elMine).appendChild(card);
    });
    if (!this.posted.length) {
      const e = document.createElement("div");
      e.className = "board-empty";
      e.textContent = "今天的委托都被揭走了。明天早上会有新的纸条。";
      this.elNotes.appendChild(e);
    }
    if (!this.active.length) {
      const e = document.createElement("div");
      e.className = "board-empty";
      e.textContent = "还没有接下委托。揭下一张纸条就开始了：跑腿的事做完谢礼会直接寄来，送东西的回到这里交付。";
      this.elMine.appendChild(e);
    }
    if (note) {
      const e = document.createElement("div");
      e.className = "board-empty warn";
      e.textContent = note;
      this.elMine.appendChild(e);
    }
  }
}

// ---------------------------------------------------------------------------
//  3D: the board itself (faceted posts, uneven planks, a little snowy roof)
// ---------------------------------------------------------------------------
const _c = new THREE.Color();
function tint(geo, fn) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const pos = g.attributes.position;
  const cols = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i += 3) {
    const y = (pos.getY(i) + pos.getY(i + 1) + pos.getY(i + 2)) / 3;
    const x = (pos.getX(i) + pos.getX(i + 1) + pos.getX(i + 2)) / 3;
    _c.set(fn(x, y, i / 3));
    for (let k = 0; k < 3; k++) _c.toArray(cols, (i + k) * 3);
  }
  g.setAttribute("color", new THREE.BufferAttribute(cols, 3));
  g.computeVertexNormals();
  return g;
}

export function buildNoticeBoardModel() {
  const group = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.9 });
  const snowMat = new THREE.MeshStandardMaterial({ color: 0xf5f9ff, flatShading: true, roughness: 0.8 });
  const paperMat = new THREE.MeshStandardMaterial({ color: 0xf6ead0, roughness: 0.95, side: THREE.DoubleSide });
  const add = (geo, mat, x, y, z, rx = 0, ry = 0, rz = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.rotation.set(rx, ry, rz);
    m.castShadow = true;
    m.receiveShadow = true;
    group.add(m);
    return m;
  };
  const dark = [0x6b4428, 0x5e3b22, 0x734a2c];
  // posts: tapered hexagonal logs
  for (const sx of [-0.68, 0.68]) {
    add(tint(new THREE.CylinderGeometry(0.06, 0.075, 2.15, 6, 3), (x, y, i) => dark[(i + Math.floor(y * 4)) % 3]), wood, sx, 1.07, 0, 0, sx * 0.4, sx * 0.02);
  }
  // backboard: five planks, each a little different
  const planks = [0x9a6a3e, 0xa87644, 0x936239, 0xa16f40, 0x8f5f36];
  for (let k = 0; k < 5; k++) {
    const y = 0.92 + k * 0.19;
    const geo = new THREE.BoxGeometry(1.36 - (k % 2) * 0.04, 0.175, 0.05, 6, 1, 1);
    const pos = geo.attributes.position;
    for (let v = 0; v < pos.count; v++) pos.setY(v, pos.getY(v) + Math.sin(pos.getX(v) * 5.3 + k * 1.7) * 0.006);
    add(tint(geo, (x, yy, i) => ((Math.floor((x + 1) * 6) + k) % 4 === 0 ? 0x7d5230 : planks[k])), wood, (k % 2 ? 0.01 : -0.01), y, 0.02, 0, 0, (k - 2) * 0.004);
  }
  // frame rails and a crossbar
  add(tint(new THREE.BoxGeometry(1.5, 0.07, 0.08), () => 0x5e3b22), wood, 0, 0.8, 0.04);
  add(tint(new THREE.BoxGeometry(1.5, 0.07, 0.08), () => 0x5e3b22), wood, 0, 1.86, 0.04);
  // roof: two slanted boards meeting at a ridge, snow on top
  const roofGeo = new THREE.BoxGeometry(1.78, 0.04, 0.42, 4, 1, 2);
  add(tint(roofGeo.clone(), (x, y, i) => (i % 5 ? 0x6b4428 : 0x5a3820)), wood, 0, 2.08, 0.13, 0.42, 0, 0);
  add(tint(roofGeo, (x, y, i) => (i % 5 ? 0x6b4428 : 0x5a3820)), wood, 0, 2.08, -0.13, -0.42, 0, 0);
  const capGeo = new THREE.CapsuleGeometry(0.075, 1.62, 2, 6).rotateZ(Math.PI / 2);
  const cap = add(capGeo, snowMat, 0, 2.2, 0);
  cap.scale.set(1, 0.8, 1.4);
  for (const sz of [-1, 1]) {
    const drift = add(new THREE.CapsuleGeometry(0.05, 1.56, 2, 6).rotateZ(Math.PI / 2), snowMat, 0, 2.115, sz * 0.12);
    drift.scale.set(1, 0.6, 3.2);
    drift.rotation.x = sz * 0.42;
  }
  // a little sign plank under the roof
  add(tint(new THREE.BoxGeometry(0.62, 0.15, 0.04), () => 0xc89a5a), wood, 0, 1.98, 0.1);
  const signMark = new THREE.MeshStandardMaterial({ color: 0x5e3b22, roughness: 1 });
  for (let k = 0; k < 3; k++) add(new THREE.BoxGeometry(0.1, 0.025, 0.01), signMark, -0.16 + k * 0.16, 1.98, 0.125);
  // snow drifted at the foot of the posts
  for (const sx of [-0.68, 0.68]) {
    const mound = add(new THREE.IcosahedronGeometry(0.2, 1), snowMat, sx, 0.02, 0.02);
    mound.scale.set(1.2, 0.35, 1);
  }

  // the paper notes: a fixed set of spots; the game shows as many as are posted
  const notes = [];
  const spots = [
    [-0.36, 1.32, -0.06],
    [0.34, 1.36, 0.05],
    [-0.02, 1.12, 0.03],
  ];
  for (const [x, y, r] of spots) {
    const n = new THREE.Group();
    n.position.set(x, y, 0.056);
    n.rotation.z = r;
    const paper = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.4, 4, 5), paperMat);
    const p = paper.geometry.attributes.position;
    for (let v = 0; v < p.count; v++) p.setZ(v, Math.max(0, -0.1 - p.getY(v)) * 0.25); // the bottom curls out a little
    paper.geometry.computeVertexNormals();
    n.add(paper);
    for (let l = 0; l < 4; l++) {
      const line = new THREE.Mesh(new THREE.PlaneGeometry(0.22 - (l === 3 ? 0.08 : 0), 0.018), signMark);
      line.position.set(-(l === 3 ? 0.04 : 0), 0.07 - l * 0.055, 0.004);
      n.add(line);
    }
    const pin = new THREE.Mesh(new THREE.IcosahedronGeometry(0.025, 0), new THREE.MeshStandardMaterial({ color: 0xc8443a, roughness: 0.4 }));
    pin.position.set(0, 0.17, 0.02);
    n.add(pin);
    n.userData.noBatch = true;
    group.add(n);
    notes.push(n);
  }
  const setCount = (k) => notes.forEach((n, i) => (n.visible = i < k));
  return { group, notes, setCount };
}
