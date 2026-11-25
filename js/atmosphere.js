import * as THREE from "three";

const SKY_KEYFRAMES = [
  // Deep starry winter midnight
  { h: 0.0,  top: 0x060d20, mid: 0x0e1d3d, hor: 0x182e57, fog: 0x10203e, sun: 0x7ba4e6, sunI: 0.52, hemiS: 0x223e70, hemiG: 0x10192b, hemiI: 0.48, night: 1.0,  stars: 1.0  },
  // Pre-dawn twilight
  { h: 5.2,  top: 0x101d42, mid: 0x283e72, hor: 0x6b5c82, fog: 0x2e3b63, sun: 0x99b2e6, sunI: 0.55, hemiS: 0x415b91, hemiG: 0x1f2842, hemiI: 0.56, night: 0.84, stars: 0.6  },
  // Crisp rose-gold winter dawn
  { h: 6.6,  top: 0x3b72bd, mid: 0x86aed9, hor: 0xfac898, fog: 0xd9c8be, sun: 0xffd092, sunI: 1.85, hemiS: 0x9bc4f2, hemiG: 0x627391, hemiI: 0.72, night: 0.22, stars: 0.04 },
  // Bright alpine winter noon
  { h: 12.0, top: 0x3a84d6, mid: 0x84bee8, hor: 0xd9ecfa, fog: 0xcbe2f5, sun: 0xfff9ed, sunI: 2.35, hemiS: 0xaad4ff, hemiG: 0x7c97b8, hemiI: 0.82, night: 0.0,  stars: 0.0  },
  // Late afternoon clear sun
  { h: 15.8, top: 0x3f7ec9, mid: 0x8eb8e0, hor: 0xf4dcbe, fog: 0xd6d9e5, sun: 0xffdfb0, sunI: 2.25, hemiS: 0x9ec0eb, hemiG: 0x6e80a3, hemiI: 0.72, night: 0.05, stars: 0.0  },
  // TRUE GOLDEN HOUR (黄金时刻): molten amber-gold low sun vs luminous alpine cobalt-blue shadows!
  { h: 17.15, top: 0x1b3c75, mid: 0xd46a4e, hor: 0xffab45, fog: 0xe39e74, sun: 0xff9430, sunI: 2.95, hemiS: 0x628cd4, hemiG: 0x304068, hemiI: 0.56, night: 0.45, stars: 0.06 },
  // Rich Sunset Alpenglow (晚霞落日)
  { h: 17.75, top: 0x132659, mid: 0x96456b, hor: 0xf77e3e, fog: 0x8c5675, sun: 0xff7834, sunI: 1.75, hemiS: 0x4b69b0, hemiG: 0x243054, hemiI: 0.52, night: 0.78, stars: 0.28 },
  // TRUE BLUE HOUR (蓝调时刻): velvet sapphire-indigo twilight vs blazing warm amber windows, lanterns & campfire!
  { h: 18.55, top: 0x091638, mid: 0x173778, hor: 0x3f5b99, fog: 0x1e366b, sun: 0x7aa9f2, sunI: 0.78, hemiS: 0x285099, hemiG: 0x122040, hemiI: 0.60, night: 0.96, stars: 0.72 },
  // Starry winter night
  { h: 20.5, top: 0x060d20, mid: 0x0e1d3d, hor: 0x182e57, fog: 0x10203e, sun: 0x7ba4e6, sunI: 0.55, hemiS: 0x223e70, hemiG: 0x10192b, hemiI: 0.48, night: 1.0,  stars: 0.98 },
  { h: 24.0, top: 0x060d20, mid: 0x0e1d3d, hor: 0x182e57, fog: 0x10203e, sun: 0x7ba4e6, sunI: 0.52, hemiS: 0x223e70, hemiG: 0x10192b, hemiI: 0.48, night: 1.0,  stars: 1.0  },
];

function lerpColorHex(hexA, hexB, t, out) {
  const ca = new THREE.Color(hexA);
  const cb = new THREE.Color(hexB);
  out.copy(ca).lerp(cb, t);
  return out;
}

export class AtmosphereSystem {
  constructor(scene, textures, options = {}) {
    this.scene = scene;
    this.textures = textures;
    this.isMobilePerf = !!options.isMobilePerf;
    this.timeHours = 17.15; // Start at breathtaking Golden Hour winter sunset!
    this.timeFlow = true;
    this.timeSpeed = 0.035; // ~11 real minutes per in-game day (Stardew-like pacing, lingers on golden hour)
    this.snowLevel = 1; // 0 = off, 1 = cozy snow, 2 = heavy snow
    this.nightFactor = 0.45;
    this.isIndoor = false;

    // Linear distant atmospheric perspective fog (0% haze on homestead 0..38m — crystal-clear foreground colors!)
    this.fog = new THREE.Fog(0xe39e74, 38, 128);
    this.skySunDir = new THREE.Vector3(0, 0.2, -1).normalize();
    this.currentSky = null;
    this.scene.fog = this.fog;

    this._initLights();
    this._initSkyDome();
    this._initSnowParticles();
    this._initChimneySmoke();
    this._initFrostMotes();

    this.update(0, new THREE.Vector3(0, 0, 0), new THREE.Vector3(-0.3, 4.9, -7.2));
  }

  _initLights() {
    this.hemiLight = new THREE.HemisphereLight(0xbdd5f0, 0x565a75, 0.85);
    this.scene.add(this.hemiLight);

    this.dirLight = new THREE.DirectionalLight(0xffae62, 1.6);
    this.dirLight.castShadow = true;
    const shadowSize = this.isMobilePerf ? 1024 : 4096;
    this.dirLight.shadow.mapSize.set(shadowSize, shadowSize);
    this.dirLight.shadow.camera.near = 2;
    this.dirLight.shadow.camera.far = 65;
    const d = 21;
    this.dirLight.shadow.camera.left = -d;
    this.dirLight.shadow.camera.right = d;
    this.dirLight.shadow.camera.top = d;
    this.dirLight.shadow.camera.bottom = -d;
    this.dirLight.shadow.bias = -0.00035;
    this.dirLight.shadow.normalBias = 0.022;
    this.dirLight.shadow.radius = this.isMobilePerf ? 1.5 : 2.4;
    this.scene.add(this.dirLight);
    this.scene.add(this.dirLight.target);
  }

  _initSkyDome() {
    this.skyUniforms = {
      uTopColor: { value: new THREE.Color(0x2b3f73) },
      uMidColor: { value: new THREE.Color(0x9d5e66) },
      uHorizonColor: { value: new THREE.Color(0xf59d5e) },
      uSunDir: { value: new THREE.Vector3(-0.6, 0.25, -0.7).normalize() },
      uMoonDir: { value: new THREE.Vector3(0.52, 0.2, -0.83).normalize() },
      uSunGlow: { value: 0.7 },
      uNight: { value: 0.0 },
      uCloudCover: { value: 0.5 },
      uTime: { value: 0.0 },
      uFlash: { value: new THREE.Color(0, 0, 0) },
      uFlashDir: { value: new THREE.Vector3(0, 0.3, -1).normalize() },
      uAurora: { value: 0.0 },
    };
    // Each night there is a 50% chance the northern lights come out
    this.auroraTonight = Math.random() < 0.5;
    this._wasNight = false;
    this.forceAurora = null; // debug override: true / false / null

    const skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: false,
      fog: false,
      uniforms: this.skyUniforms,
      vertexShader: `
        varying vec3 vWorldDir;
        void main() {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vWorldDir = normalize(position);
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: `
        uniform vec3 uTopColor;
        uniform vec3 uMidColor;
        uniform vec3 uHorizonColor;
        uniform vec3 uSunDir;
        uniform vec3 uMoonDir;
        uniform float uSunGlow;
        uniform float uNight;
        uniform float uCloudCover;
        uniform float uTime;
        uniform vec3 uFlash;
        uniform vec3 uFlashDir;
        uniform float uAurora;
        varying vec3 vWorldDir;

        float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float vnoise(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          float a = hash(i);
          float b = hash(i + vec2(1.0, 0.0));
          float c = hash(i + vec2(0.0, 1.0));
          float d = hash(i + vec2(1.0, 1.0));
          return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
        }
        // Value noise whose x axis wraps every period cells, so noise laid around the
        // horizon (x = azimuth / 2pi * period) meets itself due south without a seam
        float vnoiseWrap(vec2 p, float period) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          float x0 = mod(i.x, period);
          float x1 = mod(i.x + 1.0, period);
          float a = hash(vec2(x0, i.y));
          float b = hash(vec2(x1, i.y));
          float c = hash(vec2(x0, i.y + 1.0));
          float d = hash(vec2(x1, i.y + 1.0));
          return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
        }
        float fbm(vec2 p) {
          float s = 0.0;
          float a = 0.5;
          for (int i = 0; i < 5; i++) {
            s += a * vnoise(p);
            p = p * 2.03 + vec2(1.7, 9.2);
            a *= 0.5;
          }
          return s;
        }

        void main() {
          vec3 d = normalize(vWorldDir);
          float h = clamp(d.y, 0.0, 1.0);
          vec3 col = mix(uHorizonColor, uMidColor, smoothstep(0.0, 0.26, h));
          col = mix(col, uTopColor, smoothstep(0.22, 0.82, h));

          // Sun glow + crisp sun disc (hidden behind the alpine ranges when low)
          float sunAmt = max(dot(d, normalize(uSunDir)), 0.0);
          col += vec3(1.0, 0.74, 0.42) * pow(sunAmt, 14.0) * 0.48 * uSunGlow;
          col += vec3(1.0, 0.86, 0.64) * pow(sunAmt, 64.0) * 0.35 * uSunGlow;
          float disc = smoothstep(0.99935, 0.99968, sunAmt) * (1.0 - uNight);
          col = mix(col, vec3(1.0, 0.94, 0.8), disc);

          // Layered drifting stratocumulus on a virtual cloud deck (lit from the sun side)
          vec2 cp = d.xz / (d.y + 0.14) * 1.45 + vec2(uTime * 0.0045, uTime * 0.0018);
          float n = fbm(cp);
          float nDetail = fbm(cp * 2.7 + 4.1);
          float shape = n * 0.78 + nDetail * 0.22;
          float lo = mix(0.66, 0.48, uCloudCover);
          float cover = smoothstep(lo, lo + 0.22, shape)
            * smoothstep(0.015, 0.14, d.y) * (1.0 - smoothstep(0.5, 0.92, d.y));
          float thick = smoothstep(lo + 0.08, lo + 0.34, shape);
          float sunSide = pow(sunAmt, 3.0) * uSunGlow;
          vec3 cloudShade = mix(uMidColor, uTopColor, 0.42) * 0.92 + 0.03;
          vec3 cloudLit = mix(uHorizonColor * 1.12, vec3(1.0, 0.95, 0.9), 0.42);
          vec3 cloudCol = mix(cloudShade, cloudLit, clamp(0.42 + sunSide * 0.75 - thick * 0.3, 0.0, 1.0));
          // Bright silver lining where thin cloud edges face the sun
          cloudCol += vec3(1.0, 0.85, 0.6) * (1.0 - thick) * sunSide * 0.45;
          cloudCol = mix(cloudCol, uTopColor * 1.35 + vec3(0.02, 0.025, 0.04), uNight * 0.75);
          col = mix(col, cloudCol, cover * 0.66);

          // Aurora: green curtains with a violet crown, rippling rays, strongest to the north
          if (uAurora > 0.001 && d.y > 0.0) {
            // atan jumps from +pi to -pi due south: every azimuth term below repeats exactly
            // once per turn (integer frequencies, wrapped noise) so the curtain has no seam there
            float az = atan(d.x, -d.z);
            float azTurn = az / 6.2831853;
            float at = uTime;
            float base = 0.13 + 0.06 * sin(az * 2.0 + at * 0.05) + 0.03 * sin(az * 4.0 - at * 0.09);
            float rel = d.y - base;
            float curtain = smoothstep(-0.015, 0.025, rel) * exp(-max(rel, 0.0) * 3.2);
            float rays = vnoiseWrap(vec2(azTurn * 163.0 + at * 0.12, at * 0.05), 163.0);
            rays = 0.35 + 0.65 * smoothstep(0.25, 0.85, rays);
            float folds = 0.4 + 0.6 * smoothstep(0.25, 0.75, vnoiseWrap(vec2(azTurn * 15.0 - at * 0.03, at * 0.02 + 3.7), 15.0));
            float north = 0.3 + 0.7 * smoothstep(-0.5, 0.8, cos(az));
            vec3 aCol = mix(vec3(0.22, 1.0, 0.6), vec3(0.6, 0.32, 1.0), smoothstep(0.06, 0.34, rel));
            col += aCol * curtain * rays * folds * north * uAurora * 1.15 * (1.0 - cover * 0.85);
          }

          // Crescent moon + soft halo at night
          vec3 md = normalize(uMoonDir);
          float moonAmt = max(dot(d, md), 0.0);
          float moonDisc = smoothstep(0.99962, 0.99978, moonAmt);
          vec3 shadowDir = normalize(md + vec3(-0.0105, 0.0065, -0.004));
          float shadowDisc = smoothstep(0.99962, 0.99978, max(dot(d, shadowDir), 0.0));
          float moonLit = moonDisc * (1.0 - shadowDisc * 0.92);
          float moonVis = smoothstep(0.55, 0.9, uNight) * (1.0 - cover * 0.85);
          col += vec3(0.98, 0.96, 0.88) * moonLit * moonVis * 1.1;
          col += vec3(0.45, 0.56, 0.85) * pow(moonAmt, 260.0) * 0.28 * moonVis;
          col += vec3(0.3, 0.4, 0.7) * pow(moonAmt, 40.0) * 0.08 * moonVis;

          // Fireworks light up the sky around the burst (and faintly everywhere)
          float fwGlow = 0.05 + 0.95 * pow(max(dot(normalize(vWorldDir), uFlashDir), 0.0), 12.0);
          col += uFlash * fwGlow;
          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });

    this.skyDome = new THREE.Mesh(new THREE.SphereGeometry(95, 40, 24), skyMat);
    this.skyDome.renderOrder = -100;
    this.skyDome.frustumCulled = false;
    this.scene.add(this.skyDome);

    // Night starfield (twinkling, varied brightness & warmth; sits beyond the alpine ranges)
    const starCount = this.isMobilePerf ? 650 : 1100;
    const starPos = new Float32Array(starCount * 3);
    const starCol = new Float32Array(starCount * 3);
    const tint = new THREE.Color();
    for (let i = 0; i < starCount; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(0.06 + Math.pow(Math.random(), 0.8) * 0.94);
      const r = 250;
      starPos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      starPos[i * 3 + 1] = r * Math.cos(phi);
      starPos[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
      const b = 0.35 + Math.pow(Math.random(), 3.0) * 0.65;
      tint.setHSL(Math.random() < 0.3 ? 0.08 : 0.6, 0.35, 0.82).multiplyScalar(b);
      starCol[i * 3] = tint.r;
      starCol[i * 3 + 1] = tint.g;
      starCol[i * 3 + 2] = tint.b;
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute("position", new THREE.BufferAttribute(starPos, 3));
    starGeo.setAttribute("color", new THREE.BufferAttribute(starCol, 3));
    this.starMat = new THREE.PointsMaterial({
      size: 2.1,
      sizeAttenuation: false,
      vertexColors: true,
      transparent: true,
      opacity: 0.2,
      fog: false,
      depthWrite: false,
    });
    this.stars = new THREE.Points(starGeo, this.starMat);
    this.stars.frustumCulled = false;
    this.scene.add(this.stars);
  }

  _initSnowParticles() {
    // True 3D Depth-Layered Volumetric Snow (near-lens fadeout eliminates flat screen-filter sticker look!)
    // Larger pool: light snow uses ~a quarter of it, heavy snow all of it (~3.8x denser)
    // Flakes live in real 3D world space but are spawned only inside the camera's view frustum,
    // so (almost) every flake is on screen. Light snow uses a small slice of the pool.
    this.snowCount = this.isMobilePerf ? 2400 : 4200;
    this.snowNear = 1.8;
    this.snowFar = 24; // most of the scene (cabin, yard) sits ~15-28m away; flakes behind it are hidden anyway
    this._snowPV = new THREE.Matrix4();
    this._snowV = new THREE.Vector3();
    this._snowDir = new THREE.Vector3();
    this._snowFwd = new THREE.Vector3();
    // Smoothly blended snow state (0 = off, 1 = light, 2 = heavy); density is the active fraction of the pool
    this.snowBlend = { density: 0.12, heavy: 0, initialized: false };
    const positions = new Float32Array(this.snowCount * 3);
    const sizes = new Float32Array(this.snowCount);
    const alphas = new Float32Array(this.snowCount);
    this.snowMeta = new Float32Array(this.snowCount * 3); // fallSpeed, phase, drift

    for (let i = 0; i < this.snowCount; i++) {
      positions[i * 3] = 0;
      positions[i * 3 + 1] = -50; // parked until the first update scatters them in view
      positions[i * 3 + 2] = 0;

      const depthTier = Math.random();
      sizes[i] = 0.11 + Math.pow(depthTier, 1.4) * 0.19; // delicate varied 3D flake diameters
      alphas[i] = 0.48 + Math.random() * 0.44;
      this.snowMeta[i * 3] = 1.05 + depthTier * 1.45;
      this.snowMeta[i * 3 + 1] = Math.random() * Math.PI * 2;
      this.snowMeta[i * 3 + 2] = 0.4 + Math.random() * 0.9;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
    geo.setAttribute("aAlpha", new THREE.BufferAttribute(alphas, 1));

    this.snowUniforms = {
      uMap: { value: this.textures.snowflake },
      uColor: { value: new THREE.Color(0xfffaf2) },
      uOpacity: { value: 0.86 },
      uSizeMult: { value: 1.0 },
      uPixelRatio: { value: Math.min(window.devicePixelRatio || 1, this.isMobilePerf ? 1.5 : 2) },
      uNearFade: { value: new THREE.Vector2(4.0, 9.5) },
    };

    this.snowMat = new THREE.ShaderMaterial({
      uniforms: this.snowUniforms,
      transparent: true,
      depthWrite: false,
      vertexShader: `
        attribute float aSize;
        attribute float aAlpha;
        uniform float uPixelRatio;
        uniform float uSizeMult;
        uniform vec2 uNearFade;
        varying float vAlpha;
        void main() {
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          float dist = -mvPosition.z;
          // Smoothly fade out snowflakes within 4..9.5m of lens so NO giant flake ever pastes onto the screen!
          float nearFade = smoothstep(uNearFade.x, uNearFade.y, dist);
          float farFade = 1.0 - smoothstep(26.0, 46.0, dist);
          // Also fade out very close to ground y < 0.25 for natural landing
          float groundFade = smoothstep(0.05, 0.7, position.y);
          vAlpha = aAlpha * nearFade * farFade * groundFade;
          gl_PointSize = clamp((aSize * uSizeMult * uPixelRatio * 290.0) / max(dist, 1.0), 1.6, 22.0 * uPixelRatio);
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: `
        uniform sampler2D uMap;
        uniform vec3 uColor;
        uniform float uOpacity;
        varying float vAlpha;
        void main() {
          vec4 tex = texture2D(uMap, gl_PointCoord);
          float a = tex.a * vAlpha * uOpacity;
          if (a < 0.02) discard;
          gl_FragColor = vec4(uColor * tex.rgb, a);
        }
      `,
    });

    this.snowPoints = new THREE.Points(geo, this.snowMat);
    this.snowPoints.frustumCulled = false;
    this.scene.add(this.snowPoints);
  }

  _initChimneySmoke() {
    // Soft billowing wood smoke: feathered sprites that swell, drift downwind and dissolve
    this.smokePuffs = [];
    const count = this.isMobilePerf ? 14 : 22;
    for (let i = 0; i < count; i++) {
      const mat = new THREE.SpriteMaterial({
        map: this.textures.smokePuff,
        color: 0xeef3f8,
        transparent: true,
        opacity: 0,
        depthWrite: false,
      });
      const mesh = new THREE.Sprite(mat);
      mesh.renderOrder = 3;
      this.scene.add(mesh);
      this.smokePuffs.push({
        mesh,
        age: (i / count) * 6.0,
        life: 6.0,
        seed: i * 1.73,
        spin: (i % 2 ? 1 : -1) * (0.08 + (i % 5) * 0.03),
      });
    }
    this.smokeTint = new THREE.Color();
  }

  _initFrostMotes() {
    // Cozy warm/icy sparkles floating slowly near the clearing at night
    const count = 48;
    const pos = new Float32Array(count * 3);
    this.moteBase = [];
    for (let i = 0; i < count; i++) {
      const x = (Math.random() - 0.5) * 26;
      const y = 0.6 + Math.random() * 2.8;
      const z = (Math.random() - 0.5) * 22;
      pos[i * 3] = x;
      pos[i * 3 + 1] = y;
      pos[i * 3 + 2] = z;
      this.moteBase.push({ x, y, z, phase: Math.random() * Math.PI * 2 });
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    this.moteMat = new THREE.PointsMaterial({
      color: 0xffe29a,
      size: 0.16,
      transparent: true,
      opacity: 0.0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.motes = new THREE.Points(geo, this.moteMat);
    this.scene.add(this.motes);
  }

  setTime(hours) {
    this.timeHours = ((hours % 24) + 24) % 24;
  }

  setSnowLevel(level) {
    this.snowLevel = level;
  }

  setIndoorMode(indoor) {
    this.isIndoor = indoor;
    this.snowPoints.visible = !indoor && this.snowLevel > 0;
    this.motes.visible = !indoor;
    for (const p of this.smokePuffs) p.mesh.visible = !indoor;
    // Keep gentle atmospheric fog indoors too so the 3D pine forest & mountains outside the panoramic windows have rich depth!
    this.scene.fog = this.fog;
  }

  getSkySample(hours = this.timeHours) {
    const h = ((hours % 24) + 24) % 24;
    let a = SKY_KEYFRAMES[0];
    let b = SKY_KEYFRAMES[SKY_KEYFRAMES.length - 1];
    for (let i = 0; i < SKY_KEYFRAMES.length - 1; i++) {
      if (h >= SKY_KEYFRAMES[i].h && h <= SKY_KEYFRAMES[i + 1].h) {
        a = SKY_KEYFRAMES[i];
        b = SKY_KEYFRAMES[i + 1];
        break;
      }
    }
    const span = Math.max(0.0001, b.h - a.h);
    const t = THREE.MathUtils.smoothstep((h - a.h) / span, 0, 1);

    return {
      top: lerpColorHex(a.top, b.top, t, new THREE.Color()),
      mid: lerpColorHex(a.mid, b.mid, t, new THREE.Color()),
      hor: lerpColorHex(a.hor, b.hor, t, new THREE.Color()),
      fog: lerpColorHex(a.fog, b.fog, t, new THREE.Color()),
      sun: lerpColorHex(a.sun, b.sun, t, new THREE.Color()),
      sunI: THREE.MathUtils.lerp(a.sunI, b.sunI, t),
      hemiS: lerpColorHex(a.hemiS, b.hemiS, t, new THREE.Color()),
      hemiG: lerpColorHex(a.hemiG, b.hemiG, t, new THREE.Color()),
      hemiI: THREE.MathUtils.lerp(a.hemiI, b.hemiI, t),
      night: THREE.MathUtils.lerp(a.night, b.night, t),
      stars: THREE.MathUtils.lerp(a.stars, b.stars, t),
    };
  }

  getPhaseInfo() {
    const h = this.timeHours;
    if (h >= 5.5 && h < 9.5) return { label: "清晨", icon: "🌅" };
    if (h >= 9.5 && h < 16.2) return { label: "白天", icon: "☀️" };
    if (h >= 16.2 && h < 18.1) return { label: "黄金黄昏", icon: "🌇" };
    if (h >= 18.1 && h < 19.6) return { label: "蓝调时刻", icon: "🌆" };
    return { label: "夜晚", icon: "🌙" };
  }

  getFormattedClock() {
    const totalMins = Math.floor(this.timeHours * 60) % (24 * 60);
    const hh = String(Math.floor(totalMins / 60)).padStart(2, "0");
    const mm = String(totalMins % 60).padStart(2, "0");
    return `${hh}:${mm}`;
  }

  // Put flake i at a random spot inside the camera frustum.
  // ndcY: fixed screen height (e.g. just above the top edge) or null for anywhere.
  _spawnFlakeInView(arr, idx, camera, ndcX, ndcY) {
    const v = this._snowV;
    const dir = this._snowDir;
    const fwd = this._snowFwd;
    const x = ndcX !== null ? ndcX : Math.random() * 2.3 - 1.15;
    const y = ndcY !== null ? ndcY : Math.random() * 2.3 - 1.15;
    v.set(x, y, 0.5).unproject(camera);
    dir.copy(v).sub(camera.position).normalize();
    camera.getWorldDirection(fwd);
    const cosA = Math.max(0.05, dir.dot(fwd));
    // Never place a flake beyond where this view ray meets the ground (it would be hidden)
    let maxD = this.snowFar;
    if (dir.y < -0.001) {
      const tGround = (camera.position.y - 0.25) / -dir.y;
      maxD = Math.min(maxD, tGround * cosA);
    }
    maxD = Math.max(this.snowNear + 0.5, maxD);
    // Uniform in depth: plenty of mid/near flakes in front of the cabin, fewer tiny distant ones
    const d = this.snowNear + Math.random() * (maxD - this.snowNear);
    const t = d / cosA;
    const px = camera.position.x + dir.x * t;
    const py = Math.max(0.3, camera.position.y + dir.y * t);
    const pz = camera.position.z + dir.z * t;
    arr[idx] = px;
    arr[idx + 1] = py;
    arr[idx + 2] = pz;
  }

  update(dt, focusPos, chimneyPos, elapsed = 0, camera = null) {
    if (this.timeFlow) {
      this.timeHours = (this.timeHours + dt * this.timeSpeed) % 24;
    }

    const s = this.getSkySample();
    this.currentSky = s;
    this.nightFactor = s.night;
    // Roll the aurora once each time night falls; fade it in and out with the darkness
    const isNight = s.night > 0.6;
    if (isNight && !this._wasNight) this.auroraTonight = Math.random() < 0.5;
    this._wasNight = isNight;
    const auroraOn = this.forceAurora ?? this.auroraTonight;
    const auroraTarget = auroraOn ? THREE.MathUtils.smoothstep(s.night, 0.65, 0.95) : 0;
    this.skyUniforms.uAurora.value = THREE.MathUtils.lerp(this.skyUniforms.uAurora.value, auroraTarget, Math.min(1, dt * 0.35));

    this.skyUniforms.uTopColor.value.copy(s.top);
    this.skyUniforms.uMidColor.value.copy(s.mid);
    this.skyUniforms.uHorizonColor.value.copy(s.hor);
    this.skyUniforms.uSunGlow.value = Math.max(0.0, 1.0 - s.night * 0.85);
    this.skyUniforms.uNight.value = s.night;
    this.skyUniforms.uTime.value = elapsed;
    const cloudTarget = this.snowLevel === 2 ? 0.95 : this.snowLevel === 1 ? 0.5 : 0.28;
    this.skyUniforms.uCloudCover.value = THREE.MathUtils.lerp(this.skyUniforms.uCloudCover.value, cloudTarget, Math.min(1, dt * 0.8));
    this.starMat.opacity = s.stars * (0.82 + 0.18 * Math.sin(elapsed * 2.1)) * (1 - this.skyUniforms.uCloudCover.value * 0.45);
    this.stars.rotation.y = elapsed * 0.002;

    // Sun/Moon directional arc (low cinematic raking golden light at 17:15; sunset glow visible in North-West alpine sky!)
    const isDay = this.timeHours >= 5.8 && this.timeHours <= 18.4;
    let elev, azim;
    if (isDay) {
      const p = (this.timeHours - 5.8) / (18.4 - 5.8); // 0..1
      elev = Math.sin(p * Math.PI) * 0.92 + 0.09;
      azim = THREE.MathUtils.lerp(-1.42, 1.42, p);
    } else {
      const nightH = this.timeHours > 18.4 ? this.timeHours - 18.4 : this.timeHours + (24 - 18.4);
      const p = nightH / 11.4;
      elev = Math.sin(p * Math.PI) * 0.78 + 0.24;
      azim = THREE.MathUtils.lerp(-0.95, 0.95, p);
    }

    const dirVec = new THREE.Vector3(
      Math.sin(azim) * Math.cos(elev),
      Math.sin(elev),
      Math.cos(azim) * 0.52
    ).normalize();

    // Place sky sunset sun-glow on the visible northern/western mountain horizon for breathtaking Golden Hour vistas!
    const skySunDir = new THREE.Vector3(
      dirVec.x * 0.85,
      Math.max(0.05, dirVec.y * 0.62),
      -0.68
    ).normalize();
    this.skyUniforms.uSunDir.value.copy(skySunDir);
    this.skySunDir.copy(skySunDir);

    if (!this.isIndoor) {
      this.dirLight.color.copy(s.sun);
      this.dirLight.intensity = s.sunI;
      this.dirLight.position.set(
        focusPos.x + dirVec.x * 26,
        dirVec.y * 26,
        focusPos.z + dirVec.z * 26
      );
      this.dirLight.target.position.set(focusPos.x, 0, focusPos.z);

      this.hemiLight.color.copy(s.hemiS);
      this.hemiLight.groundColor.copy(s.hemiG);
      this.hemiLight.intensity = s.hemiI;

      this.fog.color.copy(s.fog);
      // Zero murky foreground haze! Fog ONLY softly blends distant outer forest & alpine mountains!
      this.fog.near = this.snowLevel === 2 ? 32 : 40;
      this.fog.far = this.snowLevel === 2 ? 105 : 132;
    } else {
      // Softly synced outdoor daylight/moonlight shining onto the 3D snowy forest vista outside the enlarged windows!
      this.dirLight.color.copy(s.sun);
      this.dirLight.intensity = Math.max(0.32, s.sunI * 0.45);
      this.dirLight.position.set(
        dirVec.x * 24,
        Math.max(8, dirVec.y * 22),
        dirVec.z * 24 - 10
      );
      this.dirLight.target.position.set(0, 0, -8);

      this.hemiLight.color.copy(s.hemiS);
      this.hemiLight.groundColor.setHex(0x4f3a29);
      this.hemiLight.intensity = Math.max(0.45, s.hemiI * 0.62);

      this.fog.color.copy(s.fog);
      this.fog.near = 28;
      this.fog.far = 92;
    }

    this.skyDome.position.set(focusPos.x, 0, focusPos.z);
    this.stars.position.set(focusPos.x, 0, focusPos.z);

    // Update 3D Depth-Layered Volumetric Snowfall
    // Intensity eases between levels: added flakes drift in from the top of the view,
    // removed ones finish falling before they disappear.
    const sb = this.snowBlend;
    const targetDensity = this.snowLevel === 2 ? 1.0 : this.snowLevel === 1 ? 0.12 : 0;
    const targetHeavy = this.snowLevel === 2 ? 1 : 0;
    if (!sb.initialized) {
      sb.density = targetDensity;
      sb.heavy = targetHeavy;
    }
    sb.density = THREE.MathUtils.lerp(sb.density, targetDensity, Math.min(1, dt * 0.9));
    sb.heavy = THREE.MathUtils.lerp(sb.heavy, targetHeavy, Math.min(1, dt * 0.7));

    // Keep drawing while any flake is still in the air, so stopping the snow lets it settle naturally
    const anySnow = this.snowLevel > 0 || sb.density > 0.004 || (this.snowLive || 0) > 0;
    const showSnow = !this.isIndoor && anySnow && !!camera;
    this.snowPoints.visible = showSnow;
    if (showSnow) {
      const h = sb.heavy;
      this.snowPoints.geometry.setDrawRange(0, this.snowCount);
      this.snowUniforms.uSizeMult.value = THREE.MathUtils.lerp(1.15, 2.3, h);
      this.snowUniforms.uOpacity.value = THREE.MathUtils.lerp(0.8, 0.95, h);
      this.snowUniforms.uNearFade.value.set(THREE.MathUtils.lerp(4.0, 1.6, h), THREE.MathUtils.lerp(9.5, 5.0, h));
      // Snow gently reflects golden-hour amber or blue-hour twilight without washing out
      this.snowUniforms.uColor.value.setHex(0xffffff).lerp(s.hor, 0.16);
      // ...and catches the colour of fireworks bursting overhead
      if (this.fireworkFlash > 0.01 && this.fireworkColor) {
        this.snowUniforms.uColor.value.lerp(this.fireworkColor, Math.min(0.55, this.fireworkFlash * 0.45));
      }

      camera.updateMatrixWorld();
      const pv = this._snowPV.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
      const e = pv.elements;
      const vi = camera.matrixWorldInverse.elements;

      const posAttr = this.snowPoints.geometry.attributes.position;
      const arr = posAttr.array;
      const speedMult = THREE.MathUtils.lerp(0.9, 1.55, h);
      const gust = 1 + Math.sin(elapsed * 0.37) * 0.25 * h; // heavy snow comes in gusts
      const windX = THREE.MathUtils.lerp(0.75, 2.3, h) * gust;
      const windZ = THREE.MathUtils.lerp(0.28, 0.9, h) * gust;
      const activeLimit = sb.density * this.snowCount * (this.snowQuality ?? 1);
      const PARKED = -50;
      let live = 0;

      for (let i = 0; i < this.snowCount; i++) {
        const idx = i * 3;
        const active = i < activeLimit;

        if (arr[idx + 1] <= PARKED + 1) {
          if (!active) continue;
          // First frame: scatter through the whole view. Later: newly enabled flakes enter from the top.
          this._spawnFlakeInView(arr, idx, camera, null, sb.initialized ? 1.08 + Math.random() * 0.1 : null);
          live++;
          continue;
        }

        const spd = this.snowMeta[idx] * speedMult;
        const phase = this.snowMeta[idx + 1];
        const drift = this.snowMeta[idx + 2];

        const x = arr[idx] + (windX + Math.sin(elapsed * 1.15 + phase) * 0.85 * drift) * dt;
        const y = arr[idx + 1] - spd * dt;
        const z = arr[idx + 2] + (windZ + Math.cos(elapsed * 0.95 + phase * 1.3) * 0.65 * drift) * dt;

        if (y < 0.05) {
          if (!active) {
            arr[idx + 1] = PARKED; // snow easing off: landed flake is not replaced
            continue;
          }
          this._spawnFlakeInView(arr, idx, camera, null, 1.08 + Math.random() * 0.1);
          live++;
          continue;
        }

        // Where is it on screen?
        const w = e[3] * x + e[7] * y + e[11] * z + e[15];
        const depth = -(vi[2] * x + vi[6] * y + vi[10] * z + vi[14]);
        const nx = (e[0] * x + e[4] * y + e[8] * z + e[12]) / w;
        const ny = (e[1] * x + e[5] * y + e[9] * z + e[13]) / w;
        if (depth < 0.6 || depth > this.snowFar + 4 || ny < -1.3 || ny > 1.6 || Math.abs(nx) > 1.3) {
          if (!active) {
            arr[idx + 1] = PARKED;
            continue;
          }
          if (depth > 0.6 && Math.abs(nx) > 1.3 && ny > -1.2 && ny < 1.2) {
            // blown out sideways by the wind: re-enter from the opposite edge
            this._spawnFlakeInView(arr, idx, camera, -Math.sign(nx) * 1.12, ny);
          } else {
            this._spawnFlakeInView(arr, idx, camera, null, 1.08 + Math.random() * 0.1);
          }
          live++;
          continue;
        }

        arr[idx] = x;
        arr[idx + 1] = y;
        arr[idx + 2] = z;
        live++;
      }
      this.snowLive = live;
      sb.initialized = true;
      posAttr.needsUpdate = true;
    }

    // Update Chimney Smoke Puffs (tinted by the sky: warm at golden hour, moonlit blue-grey at night)
    if (!this.isIndoor && chimneyPos) {
      this.smokeTint.setHex(0xf1f4f8).lerp(s.hor, 0.22).multiplyScalar(1 - s.night * 0.55);
      const windMul = this.snowLevel === 2 ? 1.6 : 1.0;
      for (const puff of this.smokePuffs) {
        puff.age += dt;
        if (puff.age > puff.life) puff.age -= puff.life;
        const p = puff.age / puff.life;
        const rise = 1 - Math.pow(1 - p, 1.6);
        puff.mesh.position.set(
          chimneyPos.x + p * p * 2.6 * windMul + Math.sin(elapsed * 0.9 + puff.seed) * 0.18 * p,
          chimneyPos.y + 0.15 + rise * 4.2,
          chimneyPos.z - p * 0.7 + Math.cos(elapsed * 0.7 + puff.seed) * 0.14 * p
        );
        const sc = 0.45 + p * 2.3;
        puff.mesh.scale.set(sc, sc, 1);
        puff.mesh.material.rotation = puff.seed + elapsed * puff.spin;
        puff.mesh.material.color.copy(this.smokeTint);
        puff.mesh.material.opacity = Math.min(1, p * 7) * Math.pow(1 - p, 1.3) * 0.62;
      }
    }

    // Night warm dust/frost motes
    if (!this.isIndoor) {
      this.moteMat.opacity = Math.max(0, (this.nightFactor - 0.25) * 0.85);
      if (this.moteMat.opacity > 0.02) {
        const posAttr = this.motes.geometry.attributes.position;
        const arr = posAttr.array;
        for (let i = 0; i < this.moteBase.length; i++) {
          const b = this.moteBase[i];
          arr[i * 3] = b.x + Math.sin(elapsed * 0.6 + b.phase) * 0.6;
          arr[i * 3 + 1] = b.y + Math.sin(elapsed * 1.1 + b.phase * 1.7) * 0.3;
          arr[i * 3 + 2] = b.z + Math.cos(elapsed * 0.5 + b.phase) * 0.6;
        }
        posAttr.needsUpdate = true;
      }
    }
  }
}
