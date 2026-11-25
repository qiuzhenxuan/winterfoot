import * as THREE from "three";

// Real 3D fireworks that burst over the whole valley (visible from the yard and through the
// cottage windows). Every shell is placed inside the current camera view at a random distance,
// so there is always something blooming on screen while the far ones feel like "the rest of
// the world" celebrating too. Light travels faster than sound: booms arrive a beat later.

const PALETTES = [
  [0xffd75e, 0xfff4c2], // gold
  [0xff5f7e, 0xffd0da], // rose
  [0x6fc8ff, 0xe4f6ff], // ice blue
  [0x9cf07a, 0xeeffe0], // mint
  [0xc792ff, 0xf3e6ff], // lilac
  [0xff9a3c, 0xffe2b8], // tangerine
  [0xffffff, 0xbfe6ff], // silver
];

const _v = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _right = new THREE.Vector3();
const _up = new THREE.Vector3();
const _c1 = new THREE.Color();
const _c2 = new THREE.Color();

function makeHaloTexture() {
  const s = 64;
  const c = document.createElement("canvas");
  c.width = c.height = s;
  const g = c.getContext("2d");
  const grd = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  grd.addColorStop(0, "rgba(255,255,255,0.85)");
  grd.addColorStop(0.25, "rgba(255,255,255,0.35)");
  grd.addColorStop(0.6, "rgba(255,255,255,0.08)");
  grd.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grd;
  g.fillRect(0, 0, s, s);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Flat outline shapes in a unit disc, as n [u, w] points (u = right, w = up)
function shapePoints(kind, n) {
  const pts = [];
  if (kind === "star") {
    // five-pointed star outline, one point straight up
    const verts = [];
    for (let i = 0; i < 10; i++) {
      const r = i % 2 === 0 ? 1 : 0.42;
      const a = Math.PI / 2 + (i * Math.PI) / 5;
      verts.push([Math.cos(a) * r, Math.sin(a) * r]);
    }
    for (let j = 0; j < n; j++) {
      const t = (j / n) * 10;
      const i = Math.floor(t);
      const f = t - i;
      const a = verts[i % 10];
      const b = verts[(i + 1) % 10];
      pts.push([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]);
    }
  } else {
    // six-armed snowflake: each arm is a spoke with one pair of side branches
    const per = Math.max(6, Math.floor(n / 6));
    for (let arm = 0; arm < 6 && pts.length < n; arm++) {
      const a = Math.PI / 2 + (arm * Math.PI) / 3;
      const ca = Math.cos(a), sa = Math.sin(a);
      const spoke = Math.round(per * 0.6);
      const branch = Math.floor((per - spoke) / 2);
      for (let k = 1; k <= spoke; k++) {
        const r = k / spoke;
        pts.push([ca * r, sa * r]);
      }
      for (const side of [-1, 1]) {
        const ba = a + side * (Math.PI / 3);
        for (let k = 1; k <= branch; k++) {
          const r = (k / branch) * 0.34;
          pts.push([ca * 0.58 + Math.cos(ba) * r, sa * 0.58 + Math.sin(ba) * r]);
        }
      }
    }
    while (pts.length < n) pts.push([0, 0]);
  }
  return pts.slice(0, n);
}

export class WorldFireworks {
  constructor(scene, sound, { isMobile = false } = {}) {
    this.scene = scene;
    this.sound = sound;
    this.isMobile = isMobile;
    this.max = isMobile ? 2200 : 4200;
    this.burstScale = isMobile ? 0.7 : 1;

    const n = this.max;
    this.pos = new Float32Array(n * 3);
    this.vel = new Float32Array(n * 3);
    this.col = new Float32Array(n * 3);
    this.baseCol = new Float32Array(n * 3);
    this.size = new Float32Array(n);
    this.alpha = new Float32Array(n);
    this.age = new Float32Array(n);
    this.life = new Float32Array(n);
    this.drag = new Float32Array(n);
    this.grav = new Float32Array(n);
    this.flags = new Uint8Array(n); // 1 = alive, 2 = twinkle, 4 = rocket, 8 = fade to warm
    this.baseSize = new Float32Array(n);
    this.rocketShell = new Array(n).fill(null);
    this.free = [];
    for (let i = n - 1; i >= 0; i--) this.free.push(i);
    this.alive = [];

    // compact draw buffers: alive particles are packed into [0, n) every frame
    this.drawPos = new Float32Array(n * 3);
    this.drawCol = new Float32Array(n * 3);
    this.drawSize = new Float32Array(n);
    this.drawAlpha = new Float32Array(n);
    const geo = new THREE.BufferGeometry();
    this.posAttr = new THREE.BufferAttribute(this.drawPos, 3).setUsage(THREE.DynamicDrawUsage);
    this.colAttr = new THREE.BufferAttribute(this.drawCol, 3).setUsage(THREE.DynamicDrawUsage);
    this.sizeAttr = new THREE.BufferAttribute(this.drawSize, 1).setUsage(THREE.DynamicDrawUsage);
    this.alphaAttr = new THREE.BufferAttribute(this.drawAlpha, 1).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute("position", this.posAttr);
    geo.setAttribute("color", this.colAttr);
    geo.setAttribute("aSize", this.sizeAttr);
    geo.setAttribute("aAlpha", this.alphaAttr);
    geo.setDrawRange(0, 0);

    this.uniforms = { uScale: { value: 800 } };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      fog: false,
      blending: THREE.AdditiveBlending,
      vertexShader: `
        attribute vec3 color;
        attribute float aSize;
        attribute float aAlpha;
        uniform float uScale;
        varying vec3 vColor;
        varying float vAlpha;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mv;
          float px = aSize * uScale / max(1.0, -mv.z);
          // Keep far sparks readable but never as big as a snowball
          gl_PointSize = clamp(px, 1.5, 34.0);
          vColor = color;
          vAlpha = aAlpha * clamp(px / 1.5, 0.35, 1.0);
        }
      `,
      fragmentShader: `
        varying vec3 vColor;
        varying float vAlpha;
        void main() {
          vec2 c = gl_PointCoord - 0.5;
          // Chunky pixel spark: square core + soft plus-shaped glow
          float sq = max(abs(c.x), abs(c.y));
          float core = 1.0 - smoothstep(0.16, 0.24, sq);
          float glow = (1.0 - smoothstep(0.0, 0.5, length(c))) * 0.55;
          float a = max(core, glow) * vAlpha;
          if (a < 0.01) discard;
          vec3 col = mix(vColor, vec3(1.0), core * 0.45);
          gl_FragColor = vec4(col * a, a);
        }
      `,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
    this.scene.add(this.points);

    // Soft sky glow behind each burst
    this.haloTex = makeHaloTexture();
    this.halos = [];
    for (let i = 0; i < 8; i++) {
      const s = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: this.haloTex,
          transparent: true,
          depthWrite: false,
          fog: false,
          blending: THREE.AdditiveBlending,
          opacity: 0,
        })
      );
      s.visible = false;
      s.renderOrder = 4;
      this.scene.add(s);
      this.halos.push({ sprite: s, age: 0, life: 1, peak: 0.5 });
    }
    this.haloIdx = 0;

    // One shared light, created up front so materials never need recompiling mid-show
    this.light = new THREE.PointLight(0xffffff, 0, 0, 0);
    this.light.castShadow = false;
    this.scene.add(this.light);

    // Global flash (drives the light, sky tint and snow tint)
    this.flash = 0;
    this.flashColor = new THREE.Color(1, 1, 1);

    // Show scheduling
    this.showTime = 0;
    this.showLen = 0;
    this.showOn = false;
    this.nextShell = 0;
    this.shellCount = 0;
    this.pending = []; // delayed events (sounds)
    this.onBurst = null;

    this.camera = null;
    this.isIndoor = false;
  }

  get active() {
    return this.showOn || this.alive.length > 0;
  }

  // seconds: total length of the show; quietStart: a single lonely shell first
  start(seconds = 45, { quietStart = true } = {}) {
    this.showOn = true;
    this.showTime = 0;
    this.showLen = seconds;
    this.shellCount = 0;
    this.nextShell = quietStart ? 0.2 : 0;
    this.quietStart = quietStart;
  }

  // A single shooting star sliding in from the top-right corner of the current view
  shootingStar() {
    const cam = this.camera;
    if (!cam) return;
    const dist = 85;
    const at = (nx, ny) => {
      _v.set(nx, ny, 0.5).unproject(cam);
      _dir.copy(_v).sub(cam.position).normalize();
      return cam.position.clone().addScaledVector(_dir, dist);
    };
    const a = at(1.08, 0.98);
    const b = at(0.18, 0.5);
    const life = 1.25;
    _c1.setRGB(0.92, 0.97, 1.0);
    const i = this._spawn(a.x, a.y, a.z, (b.x - a.x) / life, (b.y - a.y) / life, (b.z - a.z) / life, life, 0.9, _c1, 0, 0, 16);
    if (i >= 0) this.meteorPrev = a;
    this.sound?.shootingStar?.(this.isIndoor);
  }

  stop() {
    this.showOn = false;
  }

  // Interval between shells: one at a time, then building up, a gentle middle, a big finale
  _intervalAt(t) {
    const L = this.showLen;
    if (this.quietStart && this.shellCount === 1) return 2.4;
    if (this.quietStart && this.shellCount === 2) return 1.3;
    if (t > L - 5) return 0.11 + Math.random() * 0.12; // finale salvo
    const ramp = Math.min(1, t / 12);
    const base = THREE.MathUtils.lerp(1.0, 0.42, ramp);
    return base * (0.55 + Math.random() * 0.9);
  }

  _alloc() {
    if (!this.free.length) return -1;
    const i = this.free.pop();
    this.alive.push(i);
    return i;
  }

  _spawn(x, y, z, vx, vy, vz, life, size, color, drag, grav, flags = 0) {
    const i = this._alloc();
    if (i < 0) return -1;
    const k = i * 3;
    this.pos[k] = x; this.pos[k + 1] = y; this.pos[k + 2] = z;
    this.vel[k] = vx; this.vel[k + 1] = vy; this.vel[k + 2] = vz;
    this.baseCol[k] = color.r; this.baseCol[k + 1] = color.g; this.baseCol[k + 2] = color.b;
    this.col[k] = color.r; this.col[k + 1] = color.g; this.col[k + 2] = color.b;
    this.age[i] = 0;
    this.life[i] = life;
    this.baseSize[i] = size;
    this.size[i] = size;
    this.alpha[i] = 1;
    this.drag[i] = drag;
    this.grav[i] = grav;
    this.flags[i] = 1 | flags;
    return i;
  }

  // Pick a burst point that is guaranteed to be on screen, somewhere out in the valley
  _pickBurstPoint() {
    const cam = this.camera;
    const indoor = this.isIndoor;
    for (let tries = 0; tries < 10; tries++) {
      const nx = (Math.random() * 2 - 1) * 0.82;
      // Indoors the window vista has a ring of peaks ~36 m out: most shells burst in front of
      // them, a few far ones clear the ridgeline high up
      const farIndoor = indoor && Math.random() < 0.35;
      const ny = indoor
        ? (farIndoor ? 0.6 + Math.random() * 0.28 : 0.12 + Math.random() * 0.72)
        : 0.05 + Math.random() * 0.75;
      const dist = indoor
        ? (farIndoor ? 55 + Math.random() * 30 : 25 + Math.random() * 18)
        : 34 + Math.random() * 54;
      _v.set(nx, ny, 0.5).unproject(cam);
      _dir.copy(_v).sub(cam.position).normalize();
      let d = dist;
      if (!indoor && this.occluderHeight) {
        // March toward the burst: stop in front of the first hill / forest that would hide it
        for (let t = 10; t < dist; t += 3) {
          const qx = cam.position.x + _dir.x * t;
          const qy = cam.position.y + _dir.y * t;
          const qz = cam.position.z + _dir.z * t;
          if (qy < this.occluderHeight(qx, qz)) {
            d = t - 5;
            break;
          }
        }
        if (d < 16) continue;
      }
      const p = cam.position.clone().addScaledVector(_dir, d);
      if (indoor && p.z > -10) continue;
      const minY = indoor ? 6.5 : 7;
      if (p.y < minY) continue;
      // Real line-of-sight test (room walls, beams, pines, peaks outside the window)
      if (this.occlusionRoot && !this._burstIsClear(p, d)) continue;
      return { p, dist: d };
    }
    if (this.stats) this.stats.fallbacks++;
    // Nothing clear found: go high and far, near the top of the frame (always open sky)
    for (let k = 0; k < 4; k++) {
      _v.set((Math.random() * 2 - 1) * 0.6, 0.78 + Math.random() * 0.1, 0.5).unproject(cam);
      _dir.copy(_v).sub(cam.position).normalize();
      const d = 60 + Math.random() * 20;
      const p = cam.position.clone().addScaledVector(_dir, d);
      if (!this.occlusionRoot || this._burstIsClear(p, d) || k === 3) return { p, dist: d };
    }
    return { p: cam.position.clone().add(new THREE.Vector3(0, 12, -60)), dist: 60 };
  }

  // The centre and four points around the rim of the future burst must all be visible
  _burstIsClear(p, dist) {
    const cam = this.camera;
    if (!this._ray) this._ray = new THREE.Raycaster();
    _dir.copy(p).sub(cam.position).normalize();
    _right.crossVectors(_dir, cam.up).normalize();
    _up.crossVectors(_right, _dir).normalize();
    const R = 0.17 * dist; // ~ burst radius (see _burst)
    const offs = [[0, 0], [R, 0], [-R, 0], [0, R], [0, -R * 0.6]];
    for (const [ox, oy] of offs) {
      _v.copy(p).addScaledVector(_right, ox).addScaledVector(_up, oy);
      const target = _v.clone();
      const len = target.distanceTo(cam.position);
      this._ray.set(cam.position, target.sub(cam.position).normalize());
      this._ray.far = len;
      const hits = this._ray.intersectObjects(this._occluders(), false);
      for (const h of hits) {
        if (this._isSolid(h.object)) return false;
      }
    }
    return true;
  }

  // Solid meshes under the occlusion root, collected once (skips particles / sprites so the
  // raycast stays cheap)
  _occluders() {
    if (this._occRoot !== this.occlusionRoot) {
      this._occRoot = this.occlusionRoot;
      this._occList = [];
      this.occlusionRoot.traverse((o) => {
        if (o.isMesh && !o.isSprite) this._occList.push(o);
      });
    }
    return this._occList;
  }

  _isSolid(obj) {
    if (!obj.isMesh || obj.isSprite) return false;
    const m = Array.isArray(obj.material) ? obj.material[0] : obj.material;
    if (m && m.transparent && (m.opacity ?? 1) < 0.85) return false; // glass, light shafts
    for (let o = obj; o; o = o.parent) if (!o.visible) return false;
    return true;
  }

  _launchShell(opts = {}) {
    if (!this.camera) return;
    const t0 = performance.now();
    const { p, dist } = this._pickBurstPoint();
    const st = (this.stats ||= { picks: 0, fallbacks: 0, maxMs: 0 });
    st.picks++;
    st.maxMs = Math.max(st.maxMs, performance.now() - t0);
    const rise = 13 + Math.random() * 9;
    const riseTime = 1.0 + Math.random() * 0.5;
    const sx = p.x + (Math.random() - 0.5) * 3;
    const sz = p.z + (Math.random() - 0.5) * 3;
    const sy = p.y - rise;
    const pal = opts.palette || PALETTES[Math.floor(Math.random() * PALETTES.length)];
    const kinds = ["peony", "peony", "ring", "willow", "double", "crackle", "star", "snowflake"];
    const kind = opts.kind || kinds[Math.floor(Math.random() * kinds.length)];
    // ballistic rise that slows to ~0 at the apex
    const vy = (2 * rise) / riseTime;
    const g = vy / riseTime;
    const shell = { target: p, dist, pal, kind, scale: opts.scale || 1 };
    _c1.setHex(0xffd9a0);
    const i = this._spawn(sx, sy, sz, (p.x - sx) / riseTime, vy, (p.z - sz) / riseTime, riseTime, 0.42 * (dist / 55), _c1, 0, g, 4);
    if (i >= 0) this.rocketShell[i] = shell;
    this.sound?.fireworkWhistle?.(dist, this.isIndoor);
  }

  _burst(shell, x, y, z) {
    const { dist, pal, kind } = shell;
    const S = (dist / 55) * shell.scale;
    const n0 = Math.round((kind === "willow" ? 110 : kind === "star" ? 100 : kind === "snowflake" ? 108 : 130) * this.burstScale);
    _c1.setHex(pal[0]);
    _c2.setHex(pal[1]);
    const radius = (8.5 + Math.random() * 3.5) * S;
    const sparkSize = 0.62 * S;

    const sphere = (count, r, col, life, drag, grav, flags) => {
      for (let j = 0; j < count; j++) {
        // even spread on the sphere (golden spiral) with a little jitter
        const t = (j + 0.5) / count;
        const inc = Math.acos(1 - 2 * t);
        const az = j * 2.39996 + Math.random() * 0.2;
        const sp = (r * drag) * (0.92 + Math.random() * 0.16);
        const dx = Math.sin(inc) * Math.cos(az);
        const dy = Math.cos(inc);
        const dz = Math.sin(inc) * Math.sin(az);
        this._spawn(x, y, z, dx * sp, dy * sp, dz * sp, life * (0.85 + Math.random() * 0.3), sparkSize, col, drag, grav, flags);
      }
    };

    if (kind === "peony") {
      sphere(n0, radius, _c1, 2.0, 1.7, 2.2 * S, 8);
    } else if (kind === "double") {
      sphere(Math.round(n0 * 0.65), radius, _c1, 2.1, 1.7, 2.2 * S, 8);
      sphere(Math.round(n0 * 0.45), radius * 0.5, _c2, 1.7, 1.8, 2.0 * S, 0);
    } else if (kind === "crackle") {
      sphere(n0, radius * 0.9, _c1, 2.4, 1.6, 2.4 * S, 2);
    } else if (kind === "willow") {
      _c1.setHex(0xffc35a);
      sphere(n0, radius * 0.9, _c1, 3.4, 1.5, 4.2 * S, 8 | 2);
    } else if (kind === "ring" || kind === "star" || kind === "snowflake") {
      // flat shape facing the camera so it always reads clearly
      const cam = this.camera;
      _dir.set(x, y, z).sub(cam.position).normalize();
      _right.crossVectors(_dir, cam.up).normalize();
      _up.crossVectors(_right, _dir).normalize();
      const tilt = kind === "ring" ? (Math.random() - 0.5) * 0.9 : (Math.random() - 0.5) * 0.35;
      const pts = kind === "ring" ? null : shapePoints(kind, n0);
      const ct = Math.cos(tilt), st = Math.sin(tilt);
      const drag = 1.7;
      for (let j = 0; j < n0; j++) {
        const a = (j / n0) * Math.PI * 2;
        let u, w;
        if (pts) {
          [u, w] = pts[j];
        } else {
          u = Math.cos(a);
          w = Math.sin(a);
        }
        const ru = u * ct - w * st;
        const rw = u * st + w * ct;
        const sp = radius * drag;
        const vx = (_right.x * ru + _up.x * rw) * sp;
        const vy = (_right.y * ru + _up.y * rw) * sp;
        const vz = (_right.z * ru + _up.z * rw) * sp;
        const col = kind === "snowflake"
          ? (j % 3 === 0 ? _c2.setHex(0xffffff) : _c1.setHex(0x9fdcff))
          : kind === "star"
            ? (j % 3 === 0 ? _c2.setHex(0xfff4c2) : _c1.setHex(0xffcf4a))
            : _c1;
        this._spawn(x, y, z, vx, vy, vz, 2.2, sparkSize * 1.05, col, drag, 1.2 * S, 0);
      }
      if (kind === "ring") {
        _c2.setHex(pal[1]);
        sphere(Math.round(n0 * 0.25), radius * 0.35, _c2, 1.4, 1.9, 1.6 * S, 0);
      }
    }

    // bright white flash at the centre
    _c2.setRGB(1, 0.98, 0.9);
    for (let j = 0; j < 6; j++) {
      this._spawn(x, y, z, (Math.random() - 0.5) * 2 * S, (Math.random() - 0.5) * 2 * S, (Math.random() - 0.5) * 2 * S, 0.22, sparkSize * 4.2, _c2, 3, 0, 0);
    }

    // sky glow
    const h = this.halos[this.haloIdx];
    this.haloIdx = (this.haloIdx + 1) % this.halos.length;
    h.sprite.position.set(x, y, z);
    const hs = radius * 4.2;
    h.sprite.scale.set(hs, hs, 1);
    h.sprite.material.color.setHex(kind === "star" ? 0xffcf4a : kind === "snowflake" ? 0x9fdcff : kind === "willow" ? 0xffc35a : pal[0]);
    h.sprite.visible = true;
    h.age = 0;
    h.life = 1.3;
    h.peak = this.isIndoor ? 0.5 : 0.6;

    // global flash
    const strength = THREE.MathUtils.clamp(70 / dist, 0.55, 1.4) * shell.scale;
    this.flashColor.copy(h.sprite.material.color);
    this.flash = Math.min(1.2, this.flash * 0.5 + strength);
    this.lightPos = { x, y, z };

    this.sound?.fireworkBoom?.(dist, this.isIndoor, kind === "crackle" || kind === "willow");
    if (this.onBurst) this.onBurst({ x, y, z, dist, kind, index: this.shellCount });
  }

  update(dt, camera, isIndoor, renderer) {
    dt *= this.timeScale ?? 1;
    this.camera = camera;
    this.isIndoor = isIndoor;
    if (renderer) {
      const h = renderer.domElement.height;
      this.uniforms.uScale.value = h / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
    }

    // schedule shells
    if (this.showOn) {
      this.showTime += dt;
      this.nextShell -= dt;
      while (this.nextShell <= 0 && this.showOn) {
        this.shellCount += 1;
        const first = this.quietStart && this.shellCount === 1;
        this._launchShell(first ? { kind: "peony", palette: PALETTES[0], scale: 1.25 } : {});
        // in the busy middle, sometimes fire a pair from different spots
        if (!first && this.showTime > 8 && Math.random() < 0.25) this._launchShell();
        this.nextShell += this._intervalAt(this.showTime);
      }
      if (this.showTime >= this.showLen) {
        // closing: one big golden star
        this._launchShell({ kind: "star", scale: 1.35 });
        this.showOn = false;
      }
    }

    // particles
    const P = this.pos, V = this.vel;
    for (let ai = this.alive.length - 1; ai >= 0; ai--) {
      const i = this.alive[ai];
      const k = i * 3;
      this.age[i] += dt;
      const f = this.flags[i];
      if (f & 16) {
        // shooting star head: straight glide, leaves a fading tail behind it
        const px = P[k], py = P[k + 1], pz = P[k + 2];
        P[k] += V[k] * dt; P[k + 1] += V[k + 1] * dt; P[k + 2] += V[k + 2] * dt;
        const t = this.age[i] / this.life[i];
        this.alpha[i] = t < 0.15 ? t / 0.15 : t > 0.8 ? (1 - t) / 0.2 : 1;
        const steps = 5;
        for (let q = 0; q < steps; q++) {
          const f2 = q / steps;
          _c2.setRGB(0.75, 0.88, 1.0);
          const tail = this._spawn(px + (P[k] - px) * f2, py + (P[k + 1] - py) * f2, pz + (P[k + 2] - pz) * f2,
            0, 0, 0, 0.55, 0.55, _c2, 0, 0, 0);
          if (tail >= 0) this.alpha[tail] = this.alpha[i] * 0.8;
        }
        if (this.age[i] >= this.life[i]) this._kill(ai, i);
        continue;
      }
      if (f & 4) {
        // rocket: rises, sheds a trail, bursts at the end of its life
        V[k + 1] -= this.grav[i] * dt;
        P[k] += V[k] * dt; P[k + 1] += V[k + 1] * dt; P[k + 2] += V[k + 2] * dt;
        const shell = this.rocketShell[i];
        if (Math.random() < 0.9) {
          _c1.setHex(0xffb35c);
          const s = shell ? shell.dist / 55 : 1;
          this._spawn(P[k] + (Math.random() - 0.5) * 0.2, P[k + 1] - 0.2, P[k + 2], (Math.random() - 0.5) * 0.8, -1.5 * s, (Math.random() - 0.5) * 0.8, 0.45 + Math.random() * 0.25, 0.28 * s, _c1, 1.5, 1.5 * s, 0);
        }
        this.alpha[i] = 0.9;
        if (this.age[i] >= this.life[i]) {
          if (shell) this._burst(shell, P[k], P[k + 1], P[k + 2]);
          this.rocketShell[i] = null;
          this._kill(ai, i);
        }
        continue;
      }
      if (this.age[i] >= this.life[i]) {
        this._kill(ai, i);
        continue;
      }
      const d = Math.exp(-this.drag[i] * dt);
      V[k] *= d; V[k + 1] = V[k + 1] * d - this.grav[i] * dt; V[k + 2] *= d;
      P[k] += V[k] * dt; P[k + 1] += V[k + 1] * dt; P[k + 2] += V[k + 2] * dt;
      const t = this.age[i] / this.life[i];
      let a = Math.pow(1 - t, 1.4);
      if (f & 2 && t > 0.35) a *= Math.random() < 0.5 ? 0.15 : 1.25;
      this.alpha[i] = Math.min(1, a * (t < 0.08 ? 1.3 : 1));
      // cool down: white-hot to the shell colour, warm shells fade to ember orange
      const heat = Math.max(0, 1 - t * 8);
      let r = this.baseCol[k], g = this.baseCol[k + 1], b = this.baseCol[k + 2];
      if (f & 8 && t > 0.55) {
        const e = (t - 0.55) / 0.45;
        r = r + (1.0 - r) * e * 0.5; g = g + (0.45 - g) * e * 0.6; b = b + (0.15 - b) * e * 0.7;
      }
      this.col[k] = r + (1 - r) * heat * 0.6;
      this.col[k + 1] = g + (1 - g) * heat * 0.6;
      this.col[k + 2] = b + (1 - b) * heat * 0.6;
      this.size[i] = this.baseSize[i] * (1 - t * 0.35);
    }

    const n = this.alive.length;
    for (let j = 0; j < n; j++) {
      const i = this.alive[j];
      const k = i * 3, q = j * 3;
      this.drawPos[q] = P[k]; this.drawPos[q + 1] = P[k + 1]; this.drawPos[q + 2] = P[k + 2];
      this.drawCol[q] = this.col[k]; this.drawCol[q + 1] = this.col[k + 1]; this.drawCol[q + 2] = this.col[k + 2];
      this.drawSize[j] = this.size[i];
      this.drawAlpha[j] = this.alpha[i];
    }
    this.points.geometry.setDrawRange(0, n);
    this.points.visible = n > 0;
    if (n > 0) {
      this.posAttr.addUpdateRange(0, n * 3);
      this.colAttr.addUpdateRange(0, n * 3);
      this.sizeAttr.addUpdateRange(0, n);
      this.alphaAttr.addUpdateRange(0, n);
      this.posAttr.needsUpdate = true;
      this.colAttr.needsUpdate = true;
      this.sizeAttr.needsUpdate = true;
      this.alphaAttr.needsUpdate = true;
    }

    // halos
    for (const h of this.halos) {
      if (!h.sprite.visible) continue;
      h.age += dt;
      const t = h.age / h.life;
      if (t >= 1) {
        h.sprite.visible = false;
        continue;
      }
      h.sprite.material.opacity = h.peak * (t < 0.06 ? t / 0.06 : Math.pow(1 - (t - 0.06) / 0.94, 2));
    }

    // flash light: outdoors it hangs at the burst and washes the snow; indoors it sits
    // just outside the big north window so the colour spills into the room
    this.flash = Math.max(0, this.flash - dt * 2.6 * Math.max(0.4, this.flash));
    if (this.flash > 0.002) {
      this.light.color.copy(this.flashColor);
      if (isIndoor) {
        this.light.position.set(1.4, 2.7, -2.0);
        this.light.distance = 13;
        this.light.decay = 1;
        this.light.intensity = Math.min(1, this.flash) * 6;
      } else if (this.lightPos) {
        this.light.position.set(this.lightPos.x, this.lightPos.y, this.lightPos.z);
        this.light.distance = 0;
        this.light.decay = 0;
        this.light.intensity = Math.min(1, this.flash) * 0.28;
      }
    } else {
      this.light.intensity = 0;
    }
  }

  _kill(ai, i) {
    this.flags[i] = 0;
    const last = this.alive.length - 1;
    this.alive[ai] = this.alive[last];
    this.alive.pop();
    this.free.push(i);
  }
}
