import * as THREE from "three";
import {
  RIVER,
  riverCenterX,
  riverSurfaceY,
  riverHalfWidth,
  riverValleyFloorHalf,
  riverDistance,
  riverCarveStrength,
} from "./river.js";

/* ------------------------------------------------------------------
 * 冬麓远景：360° 程序化雪山 + 起伏雪丘 + 远处松林 + 山腰云带
 * - 三层山脉（近景覆林丘陵 / 中景山脊 / 远景高峰），北面最高
 * - 脊线噪声塑造尖峰与山脊，按坡度/海拔分布积雪、岩壁、林带
 * - 自定义高度相关大气透视：远山渐隐入天际，山顶依旧清晰
 * ------------------------------------------------------------------ */

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

// Seeded 2D gradient noise (classic Perlin), output roughly -1..1
class Noise2D {
  constructor(seed) {
    const rnd = mulberry(seed);
    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      const t = p[i];
      p[i] = p[j];
      p[j] = t;
    }
    this.perm = new Uint8Array(512);
    for (let i = 0; i < 512; i++) this.perm[i] = p[i & 255];
  }

  _grad(h, x, y) {
    switch (h & 7) {
      case 0: return x + y;
      case 1: return -x + y;
      case 2: return x - y;
      case 3: return -x - y;
      case 4: return x;
      case 5: return -x;
      case 6: return y;
      default: return -y;
    }
  }

  noise(x, y) {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const xf = x - xi;
    const yf = y - yi;
    const X = xi & 255;
    const Y = yi & 255;
    const u = xf * xf * xf * (xf * (xf * 6 - 15) + 10);
    const v = yf * yf * yf * (yf * (yf * 6 - 15) + 10);
    const P = this.perm;
    const aa = P[P[X] + Y];
    const ab = P[P[X] + Y + 1];
    const ba = P[P[X + 1] + Y];
    const bb = P[P[X + 1] + Y + 1];
    const x1 = this._grad(aa, xf, yf) + u * (this._grad(ba, xf - 1, yf) - this._grad(aa, xf, yf));
    const x2 = this._grad(ab, xf, yf - 1) + u * (this._grad(bb, xf - 1, yf - 1) - this._grad(ab, xf, yf - 1));
    return (x1 + v * (x2 - x1)) * 0.92;
  }

  fbm(x, y, oct = 4, lac = 2.03, gain = 0.5) {
    let sum = 0;
    let amp = 1;
    let norm = 0;
    for (let i = 0; i < oct; i++) {
      sum += this.noise(x, y) * amp;
      norm += amp;
      amp *= gain;
      x *= lac;
      y *= lac;
    }
    return sum / norm;
  }

  // Ridged multifractal: sharp crests, 0..1
  ridged(x, y, oct = 5) {
    let sum = 0;
    let amp = 0.55;
    let weight = 1;
    let norm = 0;
    for (let i = 0; i < oct; i++) {
      let n = 1 - Math.abs(this.noise(x, y));
      n *= n;
      n *= weight;
      weight = THREE.MathUtils.clamp(n * 1.6, 0, 1);
      sum += n * amp;
      norm += amp;
      amp *= 0.52;
      x = x * 2.07 + 13.1;
      y = y * 2.07 - 7.7;
    }
    return sum / norm;
  }
}

const smooth = (a, b, x) => {
  const t = THREE.MathUtils.clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

/* ---------------- Shared aerial-perspective haze ---------------- */
export function createHazeUniforms() {
  return {
    uHazeColor: { value: new THREE.Color(0xe39e74) },
    uHazeTop: { value: new THREE.Color(0xd46a4e) },
    uSunTint: { value: new THREE.Color(0x000000) },
    uHazeSunDir: { value: new THREE.Vector3(0, 0.2, -1).normalize() },
    uHazeStart: { value: 30 },
    uHazeScale: { value: 165 },
    uHazeMax: { value: 0.82 },
    uHazeFalloff: { value: 0.034 },
    uSparkle: { value: 0 },
  };
}

const HAZE_FRAGMENT = /* glsl */ `
  {
    vec3 hzToFrag = vHazeWorld - cameraPosition;
    float hzDist = length(hzToFrag);
    vec3 hzDir = hzToFrag / max(hzDist, 1e-3);
    float hzAmt = 1.0 - exp(-max(hzDist - uHazeStart, 0.0) / uHazeScale);
    float hzAlt = exp(-max(vHazeWorld.y, 0.0) * uHazeFalloff);
    hzAmt *= mix(0.52, 1.0, hzAlt) * uHazeMax;
    float hzSun = pow(max(dot(hzDir, uHazeSunDir), 0.0), 5.0);
    vec3 hzCol = mix(uHazeTop, uHazeColor, clamp(hzAlt * 1.25, 0.0, 1.0)) + uSunTint * hzSun;
    gl_FragColor.rgb = mix(gl_FragColor.rgb, hzCol, clamp(hzAmt, 0.0, 0.97));
  }
`;

// Inject distance + altitude aware haze into a built-in material (replaces linear scene fog)
export function applyAerialHaze(material, hazeUniforms, { sparkle = false } = {}) {
  material.fog = false;
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, hazeUniforms);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vHazeWorld;")
      .replace(
        "#include <project_vertex>",
        `#include <project_vertex>
        #ifdef USE_INSTANCING
          vHazeWorld = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
        #else
          vHazeWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;
        #endif`
      );
    let frag = shader.fragmentShader.replace(
      "#include <common>",
      `#include <common>
      varying vec3 vHazeWorld;
      uniform vec3 uHazeColor;
      uniform vec3 uHazeTop;
      uniform vec3 uSunTint;
      uniform vec3 uHazeSunDir;
      uniform float uHazeStart;
      uniform float uHazeScale;
      uniform float uHazeMax;
      uniform float uHazeFalloff;
      uniform float uSparkle;
      float hzHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }`
    );
    if (sparkle) {
      // Tiny view-dependent ice-crystal glints on fresh snow (twinkle as the camera moves)
      frag = frag.replace(
        "#include <emissivemap_fragment>",
        `#include <emissivemap_fragment>
        {
          vec2 cell = floor(vHazeWorld.xz * 11.0);
          float h = hzHash(cell);
          float dist = length(vHazeWorld - cameraPosition);
          float tw = 0.5 + 0.5 * sin(dot(cameraPosition.xz, vec2(1.9, 2.7)) * 0.9 + h * 91.0);
          float glint = step(0.986, h) * pow(tw, 18.0) * (1.0 - smoothstep(8.0, 34.0, dist));
          totalEmissiveRadiance += vec3(1.0, 0.97, 0.9) * glint * uSparkle;
        }`
      );
    }
    shader.fragmentShader = frag.replace("#include <fog_fragment>", HAZE_FRAGMENT);
  };
  material.customProgramCacheKey = () => (sparkle ? "aerial-haze-sparkle" : "aerial-haze");
  return material;
}

/* ---------------- Landscape ---------------- */
export class AlpineLandscape {
  /**
   * @param {THREE.Object3D} valleyParent  parent for terrain + forest belt (hidden indoors)
   * @param {THREE.Object3D} rangeParent   parent for mountain ranges + cloud banks (visible through cabin windows too)
   */
  constructor(valleyParent, rangeParent, textures, options = {}) {
    this.textures = textures;
    this.isMobile = !!options.isMobile;
    this.noise = new Noise2D(7331);
    this.noiseB = new Noise2D(4242);
    this.haze = createHazeUniforms();

    this.valleyGroup = new THREE.Group();
    this.valleyGroup.name = "valley-landscape";
    this.rangeGroup = new THREE.Group();
    this.rangeGroup.name = "alpine-ranges";
    valleyParent.add(this.valleyGroup);
    rangeParent.add(this.rangeGroup);

    this.clearingRadius = 26;

    this._buildGround();
    this._buildRanges();
    this._buildRiverRibbon();
    this._buildForestBelt();
    this._buildCloudBanks();
  }

  /* ---- Height functions ---- */
  // Rolling snowy hills outside the homestead clearing (0 inside r < 26)
  valleyHeight(x, z) {
    const r = Math.hypot(x, z);
    if (r <= this.clearingRadius) return 0;
    const t = smooth(this.clearingRadius, 78, r);
    const n = this.noise.fbm(x * 0.028 + 3.1, z * 0.028 - 1.7, 4);
    const lump = this.noiseB.fbm(x * 0.09, z * 0.09, 2) * 0.45;
    const h = t * t * (3.2 + n * 3.6) + t * lump + t * t * t * 5.5;
    return this._carveRiverValley(h, x, z, 0.55, 0.16);
  }

  // Cut a flat-floored valley along the river so the water never has to climb a hill:
  // inside the floor the ground sits just under the ice; beyond it the banks rise at `bankSlope`.
  _carveRiverValley(h, x, z, bankSlope, floorDepth) {
    const strength = riverCarveStrength(z);
    if (strength <= 0 || z > RIVER.zMouth + 10) return h;
    const d = riverDistance(x, z);
    const W = riverValleyFloorHalf(z);
    if (d > W + 40) return h;
    const floor = riverSurfaceY(z) - floorDepth;
    let carved;
    if (d <= W) {
      carved = floor;
    } else if (h >= floor) {
      carved = Math.min(h, floor + (d - W) * bankSlope);
    } else {
      // Ground lower than the river nearby: build a gentle natural levee instead of a cliff
      carved = THREE.MathUtils.lerp(floor, h, smooth(W, W + 10, d));
    }
    return THREE.MathUtils.lerp(h, carved, strength);
  }

  _rangeHeight(spec, x, z, r, theta) {
    const span = spec.r1 - spec.r0;
    // Organic, non-circular massif footprint
    const wobble = this.noiseB.fbm(Math.cos(theta) * 2.2 + spec.seed, Math.sin(theta) * 2.2, 3) * span * 0.22;
    const t = THREE.MathUtils.clamp((r - spec.r0 - wobble) / span, 0, 1);
    const belt = Math.pow(Math.sin(Math.pow(t, spec.skew) * Math.PI), 0.85);

    // North dominant, flanks a bit lower, south moderate
    const north = Math.max(0, -Math.sin(theta));
    const dirW = spec.dirMin + (1 - spec.dirMin) * Math.pow(north, 0.8);

    const s = spec.scale;
    const ridge = this.noise.ridged(x * s + spec.seed, z * s - spec.seed * 0.7, spec.octaves);
    const massif = 0.55 + 0.75 * (this.noiseB.fbm(x * s * 0.33 + 9.2, z * s * 0.33 + spec.seed, 3) * 0.5 + 0.5);
    let h = (spec.base + spec.amp * Math.pow(ridge, spec.sharp) * massif) * dirW;

    // Signature horn peaks
    for (const pk of spec.peaks || []) {
      let da = Math.atan2(Math.sin(theta - pk.a), Math.cos(theta - pk.a));
      const dr = (r - (spec.r0 + span * pk.t)) / span;
      const g = Math.exp(-(da * da) / (2 * pk.w * pk.w) - (dr * dr) / 0.06);
      h += pk.h * g;
    }
    const hr = h * belt - 2.2 * (1 - belt);
    // Gorge where the river leaves the valley (and a closing ravine at its source)
    return this._carveRiverValley(hr, x, z, 0.8, 0.9);
  }

  /* ---- Ground: flat clearing disc + rolling hill ring (world-space UVs, seamless) ---- */
  _buildGround() {
    const tex = this.textures.snowGround.clone();
    tex.repeat.set(1, 1);
    tex.needsUpdate = true;

    this.groundMat = applyAerialHaze(
      new THREE.MeshStandardMaterial({ map: tex, roughness: 0.92, metalness: 0.02, vertexColors: true }),
      this.haze,
      { sparkle: true }
    );

    const angSegs = this.isMobile ? 128 : 192;
    const radii = [];
    // Dense rows near the clearing edge, coarser toward the mountains
    for (let r = this.clearingRadius; r < 60; r += 2.0) radii.push(r);
    for (let r = 60; r < 110; r += 4.0) radii.push(r);
    for (let r = 110; r <= 175; r += 9.0) radii.push(r);

    const rows = radii.length;
    const pos = new Float32Array((rows * angSegs + angSegs + 1) * 3);
    const uv = new Float32Array((rows * angSegs + angSegs + 1) * 2);
    const col = new Float32Array((rows * angSegs + angSegs + 1) * 3);
    const idx = [];
    const c = new THREE.Color();

    const writeVert = (vi, x, y, z) => {
      pos[vi * 3] = x;
      pos[vi * 3 + 1] = y;
      pos[vi * 3 + 2] = z;
      uv[vi * 2] = x / 10;
      uv[vi * 2 + 1] = -z / 10;
      // Faint blue-grey hollows and brighter wind-polished crests
      const shade = THREE.MathUtils.clamp(0.9 + y * 0.012 + this.noiseB.noise(x * 0.06, z * 0.06) * 0.07, 0.82, 1.04);
      c.setRGB(shade * 0.985, shade * 0.995, shade);
      col[vi * 3] = c.r;
      col[vi * 3 + 1] = c.g;
      col[vi * 3 + 2] = c.b;
    };

    // Flat clearing disc: centre vertex + inner ring shared with hills (no seam, no z-fight)
    const centre = 0;
    writeVert(centre, 0, 0, 0);
    let vi = 1;
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < angSegs; i++) {
        const th = (i / angSegs) * Math.PI * 2;
        const x = Math.cos(th) * radii[j];
        const z = Math.sin(th) * radii[j];
        writeVert(vi++, x, j === 0 ? 0 : this.valleyHeight(x, z), z);
      }
    }
    const ring = (j, i) => 1 + j * angSegs + (i % angSegs);
    for (let i = 0; i < angSegs; i++) idx.push(centre, ring(0, i + 1), ring(0, i));
    for (let j = 0; j < rows - 1; j++) {
      for (let i = 0; i < angSegs; i++) {
        const a = ring(j, i);
        const b = ring(j, i + 1);
        const d = ring(j + 1, i);
        const e = ring(j + 1, i + 1);
        idx.push(a, b, d, b, e, d);
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos.subarray(0, vi * 3), 3));
    geo.setAttribute("uv", new THREE.BufferAttribute(uv.subarray(0, vi * 2), 2));
    geo.setAttribute("color", new THREE.BufferAttribute(col.subarray(0, vi * 3), 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();

    this.ground = new THREE.Mesh(geo, this.groundMat);
    this.ground.receiveShadow = true;
    this.ground.name = "snow-ground";
    this.valleyGroup.add(this.ground);
  }

  /* ---- Three faceted mountain ranges ---- */
  _buildRanges() {
    const m = this.isMobile ? 0.65 : 1;
    const ranges = [
      {
        name: "far-peaks", seed: 11.3, r0: 112, r1: 162, angSegs: Math.round(230 * m), radSegs: Math.round(15 * m),
        base: 10, amp: 31, sharp: 1.3, scale: 0.019, octaves: 4, skew: 0.62, dirMin: 0.5,
        snowline: 0.16, rock: [0x353c4d, 0x434859, 0x4f4c58], forestBand: 0,
        peaks: [
          { a: -Math.PI / 2 - 0.12, t: 0.32, w: 0.06, h: 14 },
          { a: -Math.PI / 2 + 0.42, t: 0.4, w: 0.05, h: 11 },
          { a: -Math.PI / 2 - 0.62, t: 0.38, w: 0.07, h: 9 },
          { a: 0.15, t: 0.36, w: 0.07, h: 7 },
          { a: Math.PI - 0.2, t: 0.36, w: 0.08, h: 7 },
        ],
      },
      {
        name: "mid-ridges", seed: 47.9, r0: 84, r1: 122, angSegs: Math.round(210 * m), radSegs: Math.round(12 * m),
        base: 5.5, amp: 18, sharp: 1.2, scale: 0.027, octaves: 4, skew: 0.7, dirMin: 0.58,
        snowline: 0.26, rock: [0x323a4c, 0x3e4558, 0x48475a], forestBand: 0.12,
        peaks: [
          { a: -Math.PI / 2 + 0.95, t: 0.4, w: 0.06, h: 6 },
          { a: -Math.PI / 2 - 1.05, t: 0.42, w: 0.07, h: 5 },
        ],
      },
      {
        name: "near-foothills", seed: 93.1, r0: 60, r1: 92, angSegs: Math.round(180 * m), radSegs: Math.round(9 * m),
        base: 3.8, amp: 9.5, sharp: 1.0, scale: 0.032, octaves: 3, skew: 0.8, dirMin: 0.7,
        snowline: 0.0, rock: [0x4a5162, 0x585a66, 0x5d5a5c], forestBand: 0.42,
      },
    ];

    this.rangeMeshes = [];
    for (const spec of ranges) {
      const mesh = this._buildRangeMesh(spec);
      this.rangeGroup.add(mesh);
      this.rangeMeshes.push(mesh);
    }
    this.rangeSpecs = ranges;
  }

  _buildRangeMesh(spec) {
    const { angSegs, radSegs } = spec;
    const verts = [];
    const heights = [];
    let maxH = 1;
    for (let j = 0; j <= radSegs; j++) {
      for (let i = 0; i < angSegs; i++) {
        // Stagger alternate rows so the facets read as natural triangles, not a polar grid
        const th = ((i + (j % 2) * 0.5) / angSegs) * Math.PI * 2;
        const rj = spec.r0 - 4 + ((spec.r1 + 4 - (spec.r0 - 4)) * j) / radSegs;
        const jitter = this.noiseB.noise(i * 0.71 + spec.seed, j * 1.37) * ((spec.r1 - spec.r0) / radSegs) * 0.35;
        const r = rj + jitter;
        const x = Math.cos(th) * r;
        const z = Math.sin(th) * r;
        const h = this._rangeHeight(spec, x, z, r, th);
        maxH = Math.max(maxH, h);
        verts.push(x, h, z);
        heights.push(h);
      }
    }
    const idx = [];
    const v = (j, i) => j * angSegs + (((i % angSegs) + angSegs) % angSegs);
    for (let j = 0; j < radSegs; j++) {
      for (let i = 0; i < angSegs; i++) {
        if (j % 2 === 0) {
          idx.push(v(j, i), v(j, i + 1), v(j + 1, i));
          idx.push(v(j, i + 1), v(j + 1, i + 1), v(j + 1, i));
        } else {
          idx.push(v(j, i), v(j, i + 1), v(j + 1, i + 1));
          idx.push(v(j, i), v(j + 1, i + 1), v(j + 1, i));
        }
      }
    }

    let geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
    geo.setIndex(idx);
    geo = geo.toNonIndexed();
    geo.computeVertexNormals();

    // Per-facet colouring: snow on gentle/high faces, bare rock on steep cliffs, dark pine band on low slopes
    const p = geo.attributes.position.array;
    const n = geo.attributes.normal.array;
    const colors = new Float32Array(p.length);
    const snowA = new THREE.Color(0xf3f7fc);
    const snowB = new THREE.Color(0xdfe8f3);
    const rockCols = spec.rock.map((h) => new THREE.Color(h));
    const forestA = new THREE.Color(0x2a4642);
    const forestB = new THREE.Color(0x365449);
    const tmp = new THREE.Color();
    for (let f = 0; f < p.length; f += 9) {
      const cy = (p[f + 1] + p[f + 4] + p[f + 7]) / 3;
      const cx = (p[f] + p[f + 3] + p[f + 6]) / 3;
      const cz = (p[f + 2] + p[f + 5] + p[f + 8]) / 3;
      const ny = n[f + 1];
      const hf = THREE.MathUtils.clamp(cy / maxH, 0, 1);
      const nz = this.noise.noise(cx * 0.11 + spec.seed, cz * 0.11);
      const nfine = this.noiseB.noise(cx * 0.35, cz * 0.35 + spec.seed);

      // Snow holds on flatter faces, more so with altitude; streaky couloirs from noise
      const snowThreshold = 0.86 - hf * 0.78 + nz * 0.12 + nfine * 0.05;
      const isSnow = (hf > spec.snowline && ny > snowThreshold) || (hf > 0.78 && ny > 0.2);
      const isForest = !isSnow && spec.forestBand > 0 && hf < spec.forestBand + nz * 0.08 && ny > 0.45;

      if (isSnow) {
        tmp.copy(snowA).lerp(snowB, THREE.MathUtils.clamp(0.5 + nfine * 0.8 - hf * 0.3, 0, 1));
      } else if (isForest) {
        tmp.copy(forestA).lerp(forestB, 0.5 + nfine * 0.5);
        // Dusting of snow between trees
        tmp.lerp(snowB, THREE.MathUtils.clamp(0.18 + nz * 0.2, 0, 0.4));
      } else if (spec.forestBand > 0.3 && ny > 0.42) {
        // Foothills: stay blanketed in snow unless the face is a genuine cliff
        tmp.copy(snowB).lerp(snowA, 0.4 + nfine * 0.4);
      } else {
        const k = Math.floor(THREE.MathUtils.clamp((nz * 0.5 + 0.5) * rockCols.length, 0, rockCols.length - 0.001));
        tmp.copy(rockCols[k]);
        // Frosted rock edges: light snow powder on moderately steep faces
        tmp.lerp(snowB, THREE.MathUtils.clamp((ny - 0.35) * 0.9 + hf * 0.15, 0, 0.42));
      }
      for (let k = 0; k < 3; k++) {
        colors[f + k * 3] = tmp.r;
        colors[f + k * 3 + 1] = tmp.g;
        colors[f + k * 3 + 2] = tmp.b;
      }
    }
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    geo.computeBoundingSphere();

    const mat = applyAerialHaze(
      new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.93, metalness: 0 }),
      this.haze
    );
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = spec.name;
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    return mesh;
  }

  /* ---- The whole frozen river as one continuous ribbon (source -> yard -> southern gorge) ---- */
  _buildRiverRibbon() {
    const tex = this.textures.frozenIce.clone();
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.needsUpdate = true;
    const mat = applyAerialHaze(
      new THREE.MeshStandardMaterial({ map: tex, color: 0xdff4ff, roughness: 0.2, metalness: 0.14 }),
      this.haze
    );

    const z0 = RIVER.zSource;
    const z1 = RIVER.zMouth;
    const step = 1.0;
    const cols = 5; // a few vertices across so the ice can sag slightly at the edges
    const pos = [];
    const uv = [];
    const idx = [];
    let rows = 0;
    let vLen = 0;
    let prevX = riverCenterX(z0);
    for (let z = z0; z <= z1 + 0.001; z += step) {
      const cx = riverCenterX(z);
      vLen += Math.hypot(cx - prevX, step);
      prevX = cx;
      const dz = 0.5;
      const sx = (riverCenterX(z + dz) - riverCenterX(z - dz)) / (2 * dz);
      // unit normal to the course in the xz plane
      const inv = 1 / Math.sqrt(1 + sx * sx);
      const nx = inv;
      const nz = -sx * inv;
      // Taper to a trickle right at the spring
      const taper = smooth(z0, z0 + 7, z);
      const hw = riverHalfWidth(z) * Math.max(0.12, taper);
      const y = riverSurfaceY(z);
      for (let c = 0; c < cols; c++) {
        const u = c / (cols - 1);
        const off = (u * 2 - 1) * hw;
        const edge = Math.abs(u * 2 - 1);
        pos.push(cx + nx * off, y - edge * edge * 0.03, z + nz * off);
        uv.push(u * (hw * 2) / 2.55, vLen / 1.2);
      }
      rows++;
    }
    for (let j = 0; j < rows - 1; j++) {
      for (let c = 0; c < cols - 1; c++) {
        const a = j * cols + c;
        const b = a + 1;
        const d = a + cols;
        const e = d + 1;
        idx.push(a, d, b, b, d, e);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    mesh.name = "frozen-river";
    this.river = mesh;
    this.valleyGroup.add(mesh);
  }

  /* ---- Distant pine forest on the hills & foothills (instanced, very cheap) ---- */
  _makePineGeometry() {
    const parts = [];
    const pushCone = (r, h, y, color, segs = 6, rot = 0) => {
      const g = new THREE.ConeGeometry(r, h, segs);
      g.rotateY(rot);
      g.translate(0, y, 0);
      const ng = g.toNonIndexed();
      g.dispose();
      const cnt = ng.attributes.position.count;
      const cols = new Float32Array(cnt * 3);
      for (let i = 0; i < cnt; i++) {
        cols[i * 3] = color.r;
        cols[i * 3 + 1] = color.g;
        cols[i * 3 + 2] = color.b;
      }
      ng.setAttribute("color", new THREE.BufferAttribute(cols, 3));
      parts.push(ng);
    };
    const trunk = new THREE.CylinderGeometry(0.12, 0.18, 0.9, 5).toNonIndexed();
    trunk.translate(0, 0.45, 0);
    const tc = new Float32Array(trunk.attributes.position.count * 3);
    for (let i = 0; i < tc.length; i += 3) {
      tc[i] = 0.24;
      tc[i + 1] = 0.15;
      tc[i + 2] = 0.11;
    }
    trunk.setAttribute("color", new THREE.BufferAttribute(tc, 3));
    parts.push(trunk);
    const leaf = new THREE.Color(0x173229);
    const leaf2 = new THREE.Color(0x1d3a31);
    const snow = new THREE.Color(0xe9f0f8);
    const tiers = [
      [0.95, 1.4, 1.3, 0.0],
      [0.74, 1.25, 2.05, 0.5],
      [0.5, 1.1, 2.72, 0.2],
      [0.26, 0.8, 3.28, 0.7],
    ];
    tiers.forEach(([r, h, y, rot], i) => {
      pushCone(r, h, y, i % 2 ? leaf2 : leaf, 6, rot);
      // Snow cushion resting on each bough tier
      pushCone(r * 0.8, h * 0.5, y + h * 0.29, snow, 6, rot);
    });

    // Merge non-indexed parts
    let total = 0;
    for (const g of parts) total += g.attributes.position.count;
    const pos = new Float32Array(total * 3);
    const nor = new Float32Array(total * 3);
    const col = new Float32Array(total * 3);
    let off = 0;
    for (const g of parts) {
      g.computeVertexNormals();
      pos.set(g.attributes.position.array, off * 3);
      nor.set(g.attributes.normal.array, off * 3);
      col.set(g.attributes.color.array, off * 3);
      off += g.attributes.position.count;
      g.dispose();
    }
    const merged = new THREE.BufferGeometry();
    merged.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    merged.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
    merged.setAttribute("color", new THREE.BufferAttribute(col, 3));
    return merged;
  }

  _buildForestBelt() {
    const rnd = mulberry(2026);
    const geo = this._makePineGeometry();
    const mat = applyAerialHaze(
      new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.9 }),
      this.haze
    );
    const target = this.isMobile ? 420 : 850;
    const near = this.rangeSpecs[2];
    const dummy = new THREE.Object3D();
    const placed = [];
    let attempts = 0;
    while (placed.length < target && attempts < target * 14) {
      attempts++;
      const th = rnd() * Math.PI * 2;
      // Bias toward the hill belt, thinning out up the foothills
      const r = 29 + Math.pow(rnd(), 0.85) * 52;
      const x = Math.cos(th) * r;
      const z = Math.sin(th) * r;
      // Clustered groves with open snowy meadows between them
      const grove = this.noise.fbm(x * 0.035 + 50, z * 0.035 - 20, 3);
      const needed = r < 36 ? 0.18 : 0.02;
      if (grove < needed + (rnd() - 0.5) * 0.2) continue;
      // Keep an open snowy meadow behind the cabin so the alpine panorama stays readable
      const behindCabin = z < 0 && Math.abs(x) < 0.62 * -z;
      if (behindCabin && r < 50 && rnd() < 0.82) continue;
      // No trees on the frozen river or its flat valley floor; thinner on the first bank
      const rd = riverDistance(x, z);
      const rw = riverValleyFloorHalf(z);
      if (z > RIVER.zSource - 10 && rd < rw + 1.5) continue;
      if (z > RIVER.zSource - 10 && rd < rw + 5 && rnd() < 0.6) continue;

      let y = this.valleyHeight(x, z);
      if (r > near.r0 - 4) {
        const hr = this._rangeHeight(near, x, z, r, th);
        if (hr > y) {
          // Only on lower, gentler foothill slopes (below the snowline)
          if (hr > 7.5) continue;
          y = hr;
        }
      }
      const s = (0.8 + rnd() * 0.6) * (r < 40 ? 1.0 : 1.18);
      placed.push({ x, y: y - 0.15, z, s, rot: rnd() * Math.PI * 2, lean: (rnd() - 0.5) * 0.06 });
    }

    const inst = new THREE.InstancedMesh(geo, mat, placed.length);
    placed.forEach((p, i) => {
      dummy.position.set(p.x, p.y, p.z);
      dummy.rotation.set(p.lean, p.rot, p.lean * 0.5);
      dummy.scale.set(p.s, p.s * (0.92 + ((i * 37) % 17) / 60), p.s);
      dummy.updateMatrix();
      inst.setMatrixAt(i, dummy.matrix);
    });
    inst.instanceMatrix.needsUpdate = true;
    inst.computeBoundingSphere();
    inst.name = "distant-pine-belt";
    this.forestBelt = inst;
    this.valleyGroup.add(inst);
  }

  /* ---- Soft cloud banks drifting around the peaks ---- */
  _makeCloudTexture(seed) {
    const w = 256;
    const h = 96;
    const cv = document.createElement("canvas");
    cv.width = w;
    cv.height = h;
    const ctx = cv.getContext("2d");
    const rnd = mulberry(seed);
    for (let i = 0; i < 26; i++) {
      const cx = w * (0.12 + rnd() * 0.76);
      const cy = h * (0.45 + (rnd() - 0.5) * 0.35);
      const rad = h * (0.16 + rnd() * 0.28);
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, rad);
      g.addColorStop(0, "rgba(255,255,255,0.42)");
      g.addColorStop(0.55, "rgba(255,255,255,0.18)");
      g.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }
    // Feather the left/right ends
    const fade = ctx.createLinearGradient(0, 0, w, 0);
    fade.addColorStop(0, "rgba(0,0,0,1)");
    fade.addColorStop(0.18, "rgba(0,0,0,0)");
    fade.addColorStop(0.82, "rgba(0,0,0,0)");
    fade.addColorStop(1, "rgba(0,0,0,1)");
    ctx.globalCompositeOperation = "destination-out";
    ctx.fillStyle = fade;
    ctx.fillRect(0, 0, w, h);
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  _buildCloudBanks() {
    const rnd = mulberry(808);
    const texs = [this._makeCloudTexture(11), this._makeCloudTexture(23), this._makeCloudTexture(37)];
    this.clouds = [];
    const count = this.isMobile ? 9 : 15;
    for (let i = 0; i < count; i++) {
      const th = (i / count) * Math.PI * 2 + rnd() * 0.3;
      const north = Math.max(0, -Math.sin(th));
      const r = 98 + rnd() * 30;
      const mat = new THREE.SpriteMaterial({
        map: texs[i % texs.length],
        transparent: true,
        depthWrite: false,
        fog: false,
        opacity: 0.5,
      });
      const sp = new THREE.Sprite(mat);
      const sw = 46 + rnd() * 40;
      sp.scale.set(sw, sw * (0.2 + rnd() * 0.08), 1);
      const y = 10 + north * 12 + rnd() * 8;
      sp.position.set(Math.cos(th) * r, y, Math.sin(th) * r);
      sp.renderOrder = 2;
      this.rangeGroup.add(sp);
      this.clouds.push({ sprite: sp, th, r, y, speed: (0.0025 + rnd() * 0.003) * (rnd() > 0.5 ? 1 : -1), base: 0.32 + rnd() * 0.22 });
    }
  }

  /* ---- Per-frame: sync haze with the sky, drift clouds ---- */
  update(dt, elapsed, sky, sunDir, snowLevel = 1, isIndoor = false) {
    const H = this.haze;
    H.uHazeColor.value.copy(sky.fog).lerp(sky.hor, 0.4).lerp(sky.hemiS, 0.18);
    H.uHazeTop.value.copy(sky.mid).lerp(sky.hor, 0.3).lerp(sky.hemiS, 0.3);
    H.uSunTint.value.copy(sky.sun).multiplyScalar(0.22 * (1 - sky.night * 0.85));
    if (sunDir) H.uHazeSunDir.value.copy(sunDir);

    const heavy = snowLevel === 2;
    const target = heavy ? 70 : snowLevel === 0 ? 210 : 165;
    H.uHazeScale.value = THREE.MathUtils.lerp(H.uHazeScale.value, target, Math.min(1, dt * 1.5));
    H.uHazeMax.value = heavy ? 0.95 : 0.8;
    H.uSparkle.value = (1 - sky.night * 0.75) * (snowLevel === 2 ? 0.35 : 0.9);

    this.valleyGroup.visible = !isIndoor;

    const lit = new THREE.Color().copy(sky.hor).lerp(new THREE.Color(0xffffff), 0.55);
    const shade = new THREE.Color().copy(sky.mid).lerp(sky.fog, 0.4);
    const cloudCol = shade.lerp(lit, 0.6 - sky.night * 0.3);
    for (const c of this.clouds) {
      c.th += c.speed * dt;
      c.sprite.position.set(Math.cos(c.th) * c.r, c.y + Math.sin(elapsed * 0.05 + c.r) * 0.8, Math.sin(c.th) * c.r);
      c.sprite.material.color.copy(cloudCol);
      c.sprite.material.opacity = c.base * (heavy ? 1.45 : 1) * (1 - sky.night * 0.45);
    }
  }
}

/* ---------------- Soft, wind-sculpted snowdrift (replaces box mounds) ----------------
 * Unit footprint radius 1, peak height 1; scale the mesh to taste.
 * Profile eases smoothly into the ground (no hard vertical rim), with a gentle
 * wind-blown asymmetry and lumpy surface so each drift reads as hand-shaped snow. */
const _driftNoise = new Noise2D(5150);
export function makeSnowDriftGeometry(seed = 0, segs = 32, rings = 10) {
  const pos = [];
  const uv = [];
  const idx = [];
  pos.push(0, 1, 0);
  uv.push(0.5, 0.5);
  for (let j = 1; j <= rings; j++) {
    const t = j / rings;
    for (let i = 0; i < segs; i++) {
      const a = (i / segs) * Math.PI * 2;
      const wob = 1 + _driftNoise.noise(Math.cos(a) * 1.3 + seed, Math.sin(a) * 1.3) * 0.22;
      const r = t * wob;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      // Wind-blown: steeper lee side (+x), long gentle windward tail (-x)
      const lean = 1 + Math.cos(a) * 0.18;
      const tt = Math.min(1, t * lean);
      let y = Math.pow(1 - tt * tt, 1.7);
      y *= 1 + _driftNoise.noise(x * 2.4 + seed * 3.1, z * 2.4) * 0.16;
      if (j === rings) y = 0;
      pos.push(x, Math.max(0, y), z);
      uv.push(0.5 + x * 0.5, 0.5 + z * 0.5);
    }
  }
  const ring = (j, i) => 1 + (j - 1) * segs + (i % segs);
  for (let i = 0; i < segs; i++) idx.push(0, ring(1, i + 1), ring(1, i));
  for (let j = 1; j < rings; j++) {
    for (let i = 0; i < segs; i++) {
      idx.push(ring(j, i), ring(j, i + 1), ring(j + 1, i));
      idx.push(ring(j, i + 1), ring(j + 1, i + 1), ring(j + 1, i));
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}
