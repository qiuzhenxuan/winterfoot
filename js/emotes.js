import * as THREE from "three";

// Stardew-style pixel emote bubbles that pop up above animals / NPCs, plus a small
// bobbing arrow that marks whatever the player would interact with next.

// 9x8 pixel icons ('#' = icon colour, 'o' = secondary colour)
const ICONS = {
  heart: {
    color: "#e0394a",
    color2: "#ff9aa6",
    rows: [
      ".##...##.",
      "#oo#.####",
      "#o#######",
      "#########",
      ".#######.",
      "..#####..",
      "...###...",
      "....#....",
    ],
  },
  note: {
    color: "#4b2714",
    rows: [
      "....####.",
      "....#..#.",
      "....#..#.",
      "....#..#.",
      "..###.##.",
      ".####.##.",
      ".###.....",
      ".........",
    ],
  },
  exclaim: {
    color: "#d6402f",
    rows: [
      "...###...",
      "...###...",
      "...###...",
      "...###...",
      "....#....",
      ".........",
      "...###...",
      "...###...",
    ],
  },
  question: {
    color: "#3a6fb0",
    rows: [
      "..#####..",
      ".##...##.",
      ".....##..",
      "....##...",
      "...##....",
      ".........",
      "...##....",
      "...##....",
    ],
  },
  sparkle: {
    color: "#f0b419",
    color2: "#fff3a8",
    rows: [
      "....#....",
      "....#....",
      "...#o#...",
      "##oo#oo##",
      "...#o#...",
      "....#....",
      "....#....",
      ".........",
    ],
  },
  mail: {
    color: "#6b3b1c",
    color2: "#f7f0df",
    rows: [
      ".........",
      "#########",
      "##ooooo##",
      "#o#ooo#o#",
      "#oo#o#oo#",
      "#ooo#ooo#",
      "#########",
      ".........",
    ],
  },
  dots: {
    color: "#6b3b1c",
    rows: [
      ".........",
      ".........",
      ".........",
      "##.##.##.",
      "##.##.##.",
      ".........",
      ".........",
      ".........",
    ],
  },
};

function makeBubbleTexture(icon) {
  // 16x16 logical pixels, drawn at 4x for crisp nearest-neighbour scaling
  const P = 4;
  const c = document.createElement("canvas");
  c.width = 16 * P;
  c.height = 16 * P;
  const g = c.getContext("2d");
  const px = (x, y, col) => {
    g.fillStyle = col;
    g.fillRect(x * P, y * P, P, P);
  };
  const outline = "#4b2714";
  const fill = "#fffaf0";
  const shade = "#ead7b5";
  // Rounded bubble body: x 1..14, y 1..11
  for (let y = 1; y <= 11; y++) {
    for (let x = 1; x <= 14; x++) {
      const corner = (x === 1 || x === 14) && (y === 1 || y === 11);
      if (corner) continue;
      const edge = x === 1 || x === 14 || y === 1 || y === 11 ||
        ((x === 2 || x === 13) && (y === 2 || y === 10));
      px(x, y, edge && !((x === 2 || x === 13) && (y === 2 || y === 10)) ? outline : fill);
    }
  }
  // inner rounded corners
  for (const [x, y] of [[2, 2], [13, 2], [2, 10], [13, 10]]) px(x, y, outline);
  // soft shade along the bottom inside edge
  for (let x = 3; x <= 12; x++) px(x, 10, shade);
  // Tail pointing down
  px(6, 12, outline); px(7, 12, fill); px(8, 12, outline);
  px(7, 13, outline);
  px(7, 11, fill);
  // Icon (9x8) centred at x 3..11, y 2..9
  icon.rows.forEach((row, ry) => {
    for (let rx = 0; rx < row.length; rx++) {
      const ch = row[rx];
      if (ch === "#") px(3 + rx, 2 + ry, icon.color);
      else if (ch === "o") px(3 + rx, 2 + ry, icon.color2 || icon.color);
    }
  });
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeArrowTexture() {
  const P = 4;
  const rows = [
    ".#######.",
    "#ooooooo#",
    "#ooooooo#",
    ".#ooooo#.",
    "..#ooo#..",
    "...#o#...",
    "....#....",
  ];
  const c = document.createElement("canvas");
  c.width = 9 * P;
  c.height = 7 * P;
  const g = c.getContext("2d");
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      if (row[x] === ".") continue;
      g.fillStyle = row[x] === "#" ? "#4b2714" : (y < 2 ? "#ffe98a" : "#f5b935");
      g.fillRect(x * P, y * P, P, P);
    }
  });
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class EmoteSystem {
  constructor(scene) {
    this.scene = scene;
    this.textures = {};
    for (const k of Object.keys(ICONS)) this.textures[k] = makeBubbleTexture(ICONS[k]);
    this.active = [];

    // Interaction focus arrow
    this.arrow = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: makeArrowTexture(), transparent: true, depthTest: false, depthWrite: false })
    );
    this.arrow.renderOrder = 999;
    this.arrow.scale.set(0.34, 0.26, 1);
    this.arrow.visible = false;
    this.arrowTarget = new THREE.Vector3();
    this.arrowKey = null;
    this.arrowPop = 0;
    this.scene.add(this.arrow);
    this.indicators = new Map(); // key -> { sprite, pos, height }
  }

  // A bubble that stays up (e.g. "you have mail") until cleared with pos = null
  setIndicator(key, pos, type = "mail", height = 1.9) {
    let ind = this.indicators.get(key);
    if (!pos) {
      if (ind) ind.sprite.visible = false;
      return;
    }
    if (!ind) {
      const sprite = new THREE.Sprite(
        new THREE.SpriteMaterial({ map: this.textures[type], transparent: true, depthTest: false, depthWrite: false })
      );
      sprite.renderOrder = 997;
      sprite.scale.set(0.48, 0.48, 1);
      this.scene.add(sprite);
      ind = { sprite, pos: { x: 0, y: 0, z: 0 }, height, pop: 0 };
      this.indicators.set(key, ind);
    }
    if (!ind.sprite.visible) ind.pop = 0;
    ind.sprite.visible = true;
    ind.pos = pos;
    ind.height = height;
  }

  /**
   * Show an emote above something.
   * @param {THREE.Object3D|{x,y,z}} target  object to follow (or fixed world position)
   * @param {string} type   heart | note | exclaim | question | sparkle | dots
   * @param {number} height world-units above the target origin
   */
  show(target, type = "heart", height = 1.4, duration = 1.5) {
    const tex = this.textures[type] || this.textures.heart;
    // Replace an emote already on this target so they never stack
    for (const e of this.active) {
      if (e.target === target) e.age = Math.max(e.age, e.life - 0.12);
    }
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false })
    );
    sprite.renderOrder = 998;
    sprite.scale.set(0.001, 0.001, 1);
    this.scene.add(sprite);
    this.active.push({ sprite, target, height, age: 0, life: duration });
  }

  clear() {
    for (const e of this.active) {
      this.scene.remove(e.sprite);
      e.sprite.material.dispose();
    }
    this.active.length = 0;
  }

  // anchor: {x,y,z} or null; key: identity of the target so a change re-pops the arrow
  setFocus(anchor, key) {
    if (!anchor) {
      this.arrowKey = null;
      return;
    }
    if (key !== this.arrowKey) {
      this.arrowKey = key;
      this.arrowPop = 0;
      if (!this.arrow.visible) this.arrow.position.set(anchor.x, anchor.y, anchor.z);
    }
    this.arrowTarget.set(anchor.x, anchor.y, anchor.z);
  }

  update(dt, elapsed) {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const e = this.active[i];
      e.age += dt;
      if (e.age >= e.life) {
        this.scene.remove(e.sprite);
        e.sprite.material.dispose();
        this.active.splice(i, 1);
        continue;
      }
      const t = e.age;
      // pop: 0 -> 1.18 -> 1 overshoot, then gentle float & fade out at the end
      let s;
      if (t < 0.12) s = (t / 0.12) * 1.18;
      else if (t < 0.22) s = 1.18 - ((t - 0.12) / 0.1) * 0.18;
      else s = 1;
      const fadeStart = e.life - 0.3;
      const alpha = t > fadeStart ? Math.max(0, 1 - (t - fadeStart) / 0.3) : 1;
      const size = 0.5 * s;
      e.sprite.scale.set(size, size, 1);
      e.sprite.material.opacity = alpha;
      const p = e.target.isObject3D ? e.target.getWorldPosition(_tmp) : e.target;
      e.sprite.position.set(p.x, p.y + e.height + Math.min(t, 0.6) * 0.12 + Math.sin(t * 6) * 0.015, p.z);
    }

    for (const ind of this.indicators.values()) {
      if (!ind.sprite.visible) continue;
      ind.pop = Math.min(1, ind.pop + dt * 4);
      const s = 0.48 * (ind.pop < 1 ? 0.4 + ind.pop * 0.6 + Math.sin(ind.pop * Math.PI) * 0.25 : 1);
      ind.sprite.scale.set(s, s, 1);
      ind.sprite.position.set(ind.pos.x, ind.pos.y + ind.height + Math.abs(Math.sin(elapsed * 2.6)) * 0.14, ind.pos.z);
    }

    // Focus arrow: glide between targets, bob, pop in on change, fade out when nothing is in reach
    const want = this.arrowKey !== null;
    if (want) {
      if (!this.arrow.visible) {
        this.arrow.visible = true;
        this.arrow.material.opacity = 0;
      }
      this.arrow.position.lerp(this.arrowTarget, Math.min(1, dt * 14));
      this.arrowPop = Math.min(1, this.arrowPop + dt * 5);
      this.arrow.material.opacity = Math.min(0.95, this.arrow.material.opacity + dt * 6);
    } else if (this.arrow.visible) {
      this.arrow.material.opacity = Math.max(0, this.arrow.material.opacity - dt * 6);
      if (this.arrow.material.opacity <= 0) this.arrow.visible = false;
    }
    if (this.arrow.visible) {
      const pop = this.arrowPop < 1 ? 1 + Math.sin(this.arrowPop * Math.PI) * 0.35 : 1;
      this.arrow.scale.set(0.34 * pop, 0.26 * pop, 1);
      this.arrow.position.y = this.arrowTarget.y + Math.abs(Math.sin(elapsed * 3.2)) * 0.12;
    }
  }
}

const _tmp = new THREE.Vector3();
