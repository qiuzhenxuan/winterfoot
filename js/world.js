import * as THREE from "three";
import { makeSnowDriftGeometry } from "./landscape.js";
import { riverCenterX, RIVER } from "./river.js";
import { YARD_RECT, projectToWalkable } from "./zones.js";
import { SouthLakeZone } from "./zoneSouth.js";
import { NorthSpringZone } from "./zoneNorth.js";

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

export class OutdoorWorld {
  constructor(scene, textures, options = {}) {
    this.scene = scene;
    this.textures = textures;
    this.isMobile = !!options.isMobile; // zone modules use this to trim detail on phones
    this.group = new THREE.Group();
    this.scene.add(this.group);

    this.colliders = []; // { type: 'box', minX, maxX, minZ, maxZ } or { type: 'circle', x, z, r }
    this.warmLights = []; // { light, baseIntensity, flicker, phase }
    this.windowMaterials = [];
    this.windowInteriorGlows = []; // { mat, baseIntensity }
    this.lanternMaterials = [];
    this.lanternHalos = []; // { sprite, baseScale, baseOpacity } for dreamy warm lantern bloom!
    this.pathSnowCaps = []; // { mesh, baseScaleY } dynamic snow dusting atop pathway flagstones!
    this.shakeTrees = [];
    this.droppedItems = []; // { id, type, mesh, x, z, bobPhase }
    this.particles = [];
    this.steamWisps = []; // Subtle rising steam over heated animal water trough & stew pot

    // Key Homestead Anchors
    this.cottageCenter = new THREE.Vector3(-0.8, 0, -7.6);
    this.cottageDoorPos = new THREE.Vector3(-0.8, 0, -4.05);
    this.chimneyTopPos = new THREE.Vector3(1.1, 6.65, -8.25);
    this.shippingBinPos = new THREE.Vector3(3.15, 0, -4.25);
    this.mailboxPos = new THREE.Vector3(-3.2, 0, -3.55); // cottage-local (-2.4, 0, 4.05)
    this.mailFlagUp = false;
    // Well sits on dry ground a few steps west of the brook bank (it used to overlap the bank & ice)
    this.wellPos = new THREE.Vector3(8.35, 0, -4.15);
    this.campfirePos = new THREE.Vector3(16.2, 0, 3.05);
    this.claudeCrabPos = new THREE.Vector3(17.35, 0, 2.15);
    this.claudeHappyTimer = 0;
    this.claudeGreetIdx = 0;
    this.hayTroughPos = new THREE.Vector3(2.75, 0, 1.0);
    this.coopNestPos = new THREE.Vector3(4.55, 0, 2.2);
    this.paddockBounds = { minX: 1.95, maxX: 8.05, minZ: 0.7, maxZ: 5.6 };

    this.campfireBoost = 1.0;
    this.troughFilled = true;
    this.bridgePlanks = []; // { mesh, x, baseY, flex } for physical plank deflection under footsteps!
    this.bridgeSpec = { minX: 9.75, maxX: 14.25, centerZ: 3.05, halfW: 1.06, archHeight: 0.66 };

    // Yard rectangle: animals & rabbits stay inside it. The player can also walk the trails & zones (zones.js).
    this.bounds = { ...YARD_RECT };

    this._buildTerrainAndPaths();
    this._buildFrozenBrookAndBridge();
    this._buildCottage();
    this._buildFarmFenceAndProps();
    this._buildAnimalPaddockAndBarn();
    this._buildLampPosts();
    this._buildCampfireGlade();
    this._buildForest();
    this._spawnInitialFirewood();

    // Areas beyond the yard. Each zone module builds into this.group and plugs into
    // surface height, update and interactions (see the interface note in zoneSouth.js).
    this.zones = [new SouthLakeZone(this, this.textures), new NorthSpringZone(this, this.textures)];

    this._buildGroundDetails();
    this._collectSnowCaps();
  }

  // Little Stardew-style ground clutter poking through the snow: dry grass tufts, pebbles,
  // fallen twigs and a few holly sprigs. Purely decorative (no colliders), kept off the
  // walkways, buildings, garden beds, paddock, brook and campfire.
  _buildGroundDetails() {
    const rnd = createMulberry(2468);
    const R = YARD_RECT;
    const isClear = (x, z, pad) => {
      if (x < R.minX + 0.6 || x > R.maxX - 0.6 || z < R.minZ + 0.6 || z > R.maxZ - 0.6) return false;
      for (const c of this.colliders) {
        if (c.type === "box") {
          if (x > c.minX - pad && x < c.maxX + pad && z > c.minZ - pad && z < c.maxZ + pad) return false;
        } else if (Math.hypot(x - c.x, z - c.z) < c.r + pad) return false;
      }
      for (const b of this.pathBoxes || []) {
        if (x > b.minX - 0.3 && x < b.maxX + 0.3 && z > b.minZ - 0.3 && z < b.maxZ + 0.3) return false;
      }
      if (x > -9.6 && x < 0.0 && z > -0.4 && z < 6.7) return false; // vegetable garden beds + fence
      const p = this.paddockBounds;
      if (x > p.minX - 0.5 && x < p.maxX + 0.5 && z > p.minZ - 0.5 && z < p.maxZ + 0.5) return false;
      if (Math.abs(x - riverCenterX(z)) < RIVER.yardHalfWidth + 1.5) return false;
      if (Math.hypot(x - this.campfirePos.x, z - this.campfirePos.z) < 2.4) return false;
      if (Math.hypot(x - this.wellPos.x, z - this.wellPos.z) < 1.4) return false;
      if (x > -6.5 && x < 4.8 && z > -11.6 && z < -3.0) return false; // cottage, porch & steps
      return true;
    };
    const pick = (count, pad, tries = 40) => {
      const out = [];
      for (let i = 0; i < count; i++) {
        for (let t = 0; t < tries; t++) {
          const x = R.minX + rnd() * (R.maxX - R.minX);
          const z = R.minZ + rnd() * (R.maxZ - R.minZ);
          if (!isClear(x, z, pad)) continue;
          if (out.some((o) => Math.hypot(o.x - x, o.z - z) < 0.55)) continue;
          out.push({ x, z });
          break;
        }
      }
      return out;
    };
    // Merge a few boxes (non-indexed) into one geometry for instancing
    const mergeBoxes = (parts) => {
      const pos = [];
      const nor = [];
      const m = new THREE.Matrix4();
      const q = new THREE.Quaternion();
      const e = new THREE.Euler();
      for (const pt of parts) {
        const g = new THREE.BoxGeometry(pt.w, pt.h, pt.d).toNonIndexed();
        e.set(pt.rx || 0, pt.ry || 0, pt.rz || 0);
        m.compose(new THREE.Vector3(pt.x || 0, (pt.y ?? pt.h / 2), pt.z || 0), q.setFromEuler(e), new THREE.Vector3(1, 1, 1));
        g.applyMatrix4(m);
        pos.push(...g.attributes.position.array);
        nor.push(...g.attributes.normal.array);
        g.dispose();
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
      geo.computeBoundingSphere();
      return geo;
    };
    const scatter = (geo, mat, spots, palette, scaleMin, scaleMax, yOff = 0) => {
      if (!spots.length) return null;
      const im = new THREE.InstancedMesh(geo, mat, spots.length);
      const m = new THREE.Matrix4();
      const q = new THREE.Quaternion();
      const up = new THREE.Vector3(0, 1, 0);
      const col = new THREE.Color();
      spots.forEach((sp, i) => {
        const s = scaleMin + rnd() * (scaleMax - scaleMin);
        q.setFromAxisAngle(up, rnd() * Math.PI * 2);
        m.compose(new THREE.Vector3(sp.x, yOff, sp.z), q, new THREE.Vector3(s, s * (0.85 + rnd() * 0.3), s));
        im.setMatrixAt(i, m);
        im.setColorAt(i, col.setHex(palette[Math.floor(rnd() * palette.length)]));
      });
      im.instanceMatrix.needsUpdate = true;
      if (im.instanceColor) im.instanceColor.needsUpdate = true;
      im.receiveShadow = true;
      im.castShadow = false;
      im.name = "ground-detail";
      this.group.add(im);
      return im;
    };
    const k = this.isMobile ? 0.55 : 1;
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, metalness: 0, flatShading: true });

    // Dry grass tufts: a fan of chunky blades in straw, olive and faded green
    const tuftGeo = mergeBoxes([
      { w: 0.05, h: 0.26, d: 0.05, rz: 0.05 },
      { w: 0.05, h: 0.2, d: 0.05, x: 0.06, rz: -0.45 },
      { w: 0.05, h: 0.21, d: 0.05, x: -0.06, rz: 0.45 },
      { w: 0.05, h: 0.17, d: 0.05, z: 0.06, rx: 0.45 },
      { w: 0.05, h: 0.16, d: 0.05, z: -0.06, rx: -0.45 },
    ]);
    scatter(tuftGeo, mat, pick(Math.round(110 * k), 0.35), [0xc9a65a, 0xb48f45, 0x8d9248, 0x6f8a46, 0xd8bf74], 0.8, 1.35, -0.02);

    // Pebbles: squat faceted stones in cool greys with a warm one here and there
    const pebbleGeo = new THREE.DodecahedronGeometry(0.1, 0);
    pebbleGeo.scale(1.25, 0.6, 1.0);
    pebbleGeo.translate(0, 0.03, 0);
    scatter(pebbleGeo, mat, pick(Math.round(55 * k), 0.3), [0x8a8f98, 0x9da1a8, 0x767b85, 0xa69a8a, 0x6c7079], 0.7, 1.6);

    // Fallen twigs: a forked stick lying in the snow
    const twigGeo = mergeBoxes([
      { w: 0.5, h: 0.035, d: 0.035, y: 0.02 },
      { w: 0.2, h: 0.03, d: 0.03, x: 0.1, y: 0.02, z: 0.06, ry: -0.6 },
    ]);
    scatter(twigGeo, mat, pick(Math.round(26 * k), 0.4), [0x6b4a2f, 0x5a3d27, 0x7a5636], 0.8, 1.2);

    // Holly sprigs: dark leaves with red berries, a dash of Stardew winter colour
    const hollyLeaves = mergeBoxes([
      { w: 0.16, h: 0.04, d: 0.08, y: 0.05, ry: 0.4, rz: 0.3 },
      { w: 0.16, h: 0.04, d: 0.08, y: 0.05, ry: -0.9, rz: -0.3 },
      { w: 0.15, h: 0.04, d: 0.08, y: 0.07, ry: 2.0, rx: 0.3 },
    ]);
    const hollyBerries = mergeBoxes([
      { w: 0.05, h: 0.05, d: 0.05, y: 0.09 },
      { w: 0.05, h: 0.05, d: 0.05, x: 0.05, y: 0.08, z: 0.02 },
      { w: 0.045, h: 0.045, d: 0.045, x: -0.02, y: 0.08, z: 0.05 },
    ]);
    const hollySpots = pick(Math.round(14 * k), 0.4);
    const hollyRnd = createMulberry(97531);
    // same transforms for leaves & berries so they stay together
    const savedState = hollySpots.map(() => ({ s: 0.9 + hollyRnd() * 0.5, r: hollyRnd() * Math.PI * 2 }));
    const placeHolly = (geo, color) => {
      const im = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ color, roughness: 0.7, flatShading: true }), Math.max(1, hollySpots.length));
      const m = new THREE.Matrix4();
      const q = new THREE.Quaternion();
      hollySpots.forEach((sp, i) => {
        const st = savedState[i];
        q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), st.r);
        m.compose(new THREE.Vector3(sp.x, 0, sp.z), q, new THREE.Vector3(st.s, st.s, st.s));
        im.setMatrixAt(i, m);
      });
      im.count = hollySpots.length;
      im.instanceMatrix.needsUpdate = true;
      im.receiveShadow = true;
      im.name = "ground-detail-holly";
      this.group.add(im);
    };
    if (hollySpots.length) {
      placeHolly(hollyLeaves, 0x2f5a3a);
      placeHolly(hollyBerries, 0xd23a32);
    }
  }

  // Every flat snow cushion (roof, rails, posts, bough caps, banks...) can thicken in heavy snow
  // and thin out when it stops. Round things like the snowman are left alone.
  _collectSnowCaps() {
    this.snowAccum = 0.35; // 0 = melted thin, 0.35 = normal light snow, 1 = deep after a long blizzard
    this._snowCapScale = 1;
    this.snowCaps = [];
    const skip = new Set(this.pathSnowCaps.map((c) => c.mesh));
    this.group.traverse((o) => {
      if (!o.isMesh || skip.has(o) || !o.material || o.material.map !== this.textures.snowCap) return;
      const g = o.geometry;
      if (!g.boundingBox) g.computeBoundingBox();
      const size = new THREE.Vector3();
      g.boundingBox.getSize(size);
      if (size.y > 0.55 * Math.max(size.x, size.z)) return; // not a flat cap
      this.snowCaps.push({ mesh: o, baseY: o.scale.y });
    });
  }

  _updateSnowAccumulation(dt, snowLevel) {
    const target = snowLevel === 2 ? 1 : snowLevel === 1 ? 0.35 : 0;
    // builds up over ~1.5 minutes of blizzard, melts back over ~2.5 minutes
    const rate = target > this.snowAccum ? 1 / 90 : 1 / 150;
    this.snowAccum += Math.sign(target - this.snowAccum) * Math.min(Math.abs(target - this.snowAccum), rate * dt);
    const a = this.snowAccum;
    const capScale = a < 0.35 ? 0.6 + (a / 0.35) * 0.4 : 1 + ((a - 0.35) / 0.65) * 0.75;
    if (Math.abs(capScale - this._snowCapScale) > 0.003) {
      this._snowCapScale = capScale;
      for (const c of this.snowCaps) c.mesh.scale.y = c.baseY * capScale;
    }
    return a;
  }

  _addBoxCollider(cx, cz, w, d) {
    this.colliders.push({
      type: "box",
      minX: cx - w / 2,
      maxX: cx + w / 2,
      minZ: cz - d / 2,
      maxZ: cz + d / 2,
    });
  }

  _addLanternHalo(parent, x, y, z, scale = 1.25, baseOpacity = 0.52) {
    const sp = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: this.textures.fireGlowSoft,
        color: 0xffcf7a,
        transparent: true,
        opacity: baseOpacity,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    sp.position.set(x, y, z);
    sp.scale.set(scale, scale, 1);
    parent.add(sp);
    this.lanternHalos.push({ sprite: sp, baseScale: scale, baseOpacity, phase: x * 1.3 + z * 0.7 });
  }

  _addCircleCollider(x, z, r) {
    this.colliders.push({ type: "circle", x, z, r });
  }

  getBridgeDeckY(x) {
    const b = this.bridgeSpec;
    const t = THREE.MathUtils.clamp((x - b.minX) / (b.maxX - b.minX), 0, 1);
    const s = Math.sin(t * Math.PI);
    return 0.06 + Math.pow(s, 1.25) * b.archHeight;
  }

  getBridgeSlope(x) {
    const eps = 0.06;
    return (this.getBridgeDeckY(x + eps) - this.getBridgeDeckY(x - eps)) / (eps * 2);
  }

  // True 3D walkable surface elevation & material query (arched bridge deck + cottage porch & steps!)
  getSurfaceInfo(x, z) {
    if (this.zones) {
      for (const zn of this.zones) {
        const info = zn.getSurface ? zn.getSurface(x, z) : null;
        if (info) return { slopeX: 0, onBridge: false, ...info };
      }
    }
    const b = this.bridgeSpec;
    if (x >= b.minX && x <= b.maxX && Math.abs(z - b.centerZ) <= b.halfW + 0.06) {
      return {
        y: this.getBridgeDeckY(x),
        surface: "wood",
        slopeX: this.getBridgeSlope(x),
        onBridge: true,
      };
    }

    // Cottage front porch steps & raised wooden veranda deck (cx = -0.8, cz = -7.6, cabinD/2 = 2.4 -> wall z = -5.2)
    if (x >= -2.8 && x <= 1.2 && z >= -5.22 && z <= -2.95) {
      if (z <= -3.55) {
        return { y: 0.46, surface: "wood", slopeX: 0, onBridge: false };
      }
      // Smooth ramp up the layered stone front steps (z: -2.95 -> -3.55)
      if (x >= -1.8 && x <= 0.2) {
        const t = THREE.MathUtils.clamp((-2.95 - z) / 0.6, 0, 1);
        return { y: t * 0.46, surface: "stone", slopeX: 0, onBridge: false };
      }
    }

    // Outside the yard the player walks on the real terrain (zones are flat, but their far edges
    // can meet a gentle bank); main.js hands us the landscape after it is built
    if (this.landscape && (x < this.bounds.minX || x > this.bounds.maxX || z < this.bounds.minZ || z > this.bounds.maxZ)) {
      return { y: Math.max(0, this.landscape.valleyHeight(x, z)), surface: "snow", slopeX: 0, onBridge: false };
    }
    return { y: 0, surface: "snow", slopeX: 0, onBridge: false };
  }

  // walkZones: the player may leave the yard along the trails (zones.js); animals stay in the yard rectangle
  resolveMovement(x, z, radius = 0.36, walkZones = false) {
    let nx;
    let nz;
    if (walkZones) {
      const p = projectToWalkable(x, z);
      nx = p.x;
      nz = p.z;
    } else {
      nx = THREE.MathUtils.clamp(x, this.bounds.minX, this.bounds.maxX);
      nz = THREE.MathUtils.clamp(z, this.bounds.minZ, this.bounds.maxZ);
    }

    const b = this.bridgeSpec;
    // Brook bank collision ONLY applies strictly outside the bridge's North & South wooden handrails!
    // Inside the bridge corridor (z between the handrails), the solid railing box colliders keep the player
    // gliding smoothly along the wood rails without EVER snapping or pulling back in X.
    if (nz < b.centerZ - b.halfW || nz > b.centerZ + b.halfW) {
      const brookCenter = riverCenterX(nz);
      const halfBrook = RIVER.yardHalfWidth + 0.04 + radius;
      if (Math.abs(nx - brookCenter) < halfBrook) {
        nx = nx < brookCenter ? brookCenter - halfBrook : brookCenter + halfBrook;
      }
    }

    for (const c of this.colliders) {
      if (c.type === "box") {
        const minX = c.minX - radius;
        const maxX = c.maxX + radius;
        const minZ = c.minZ - radius;
        const maxZ = c.maxZ + radius;
        if (nx > minX && nx < maxX && nz > minZ && nz < maxZ) {
          const dxLeft = Math.abs(nx - minX);
          const dxRight = Math.abs(maxX - nx);
          const dzTop = Math.abs(nz - minZ);
          const dzBot = Math.abs(maxZ - nz);
          const m = Math.min(dxLeft, dxRight, dzTop, dzBot);
          if (m === dxLeft) nx = minX;
          else if (m === dxRight) nx = maxX;
          else if (m === dzTop) nz = minZ;
          else nz = maxZ;
        }
      } else {
        const dx = nx - c.x;
        const dz = nz - c.z;
        const dist = Math.hypot(dx, dz);
        const minDist = c.r + radius;
        if (dist < minDist && dist > 0.0001) {
          nx = c.x + (dx / dist) * minDist;
          nz = c.z + (dz / dist) * minDist;
        }
      }
    }
    // A collider near a zone edge may have pushed us outside; settle back inside
    if (walkZones) {
      const p = projectToWalkable(nx, nz);
      nx = p.x;
      nz = p.z;
    }
    return { x: nx, z: nz };
  }

  _buildTerrainAndPaths() {
    // Snow ground, rolling hills, distant pine belt & 360° alpine ranges now live in landscape.js (AlpineLandscape)

    // Sculpted layered snow mounds around the clearing perimeter
    const snowMat = new THREE.MeshStandardMaterial({
      map: this.textures.snowCap,
      roughness: 0.9,
    });
    const mounds = [
      [-13.5, -11.5, 6.2, 0.85, 4.8],
      [5.6, -12.7, 6.8, 0.9, 4.5],
      [-15.2, 3.2, 5.0, 0.72, 5.4],
      [-11.5, 11.8, 5.8, 0.76, 4.2],
      [5.5, 12.2, 6.0, 0.65, 4.2],
      [18.8, -6.5, 5.4, 0.9, 5.8],
      [19.0, 10.4, 5.8, 0.8, 5.0],
    ];
    // Soft wind-sculpted drifts that ease into the ground (each one uniquely lumpy)
    const driftTex = this.textures.snowGround.clone();
    driftTex.repeat.set(0.7, 0.7);
    driftTex.needsUpdate = true;
    const driftMat = new THREE.MeshStandardMaterial({ map: driftTex, color: 0xfbfdff, roughness: 0.88 });
    mounds.forEach(([x, z, sx, sy, sz], i) => {
      const main = new THREE.Mesh(makeSnowDriftGeometry(i * 1.7 + 0.3), driftMat);
      main.scale.set(sx * 0.6, sy * 1.05, sz * 0.6);
      main.position.set(x, -0.02, z);
      main.rotation.y = i * 0.9;
      main.receiveShadow = true;
      main.castShadow = true;
      this.group.add(main);
      const side = new THREE.Mesh(makeSnowDriftGeometry(i * 2.9 + 5.1, 24, 8), driftMat);
      side.scale.set(sx * 0.34, sy * 0.8, sz * 0.36);
      side.position.set(x + Math.cos(i * 2.1) * sx * 0.38, -0.02, z + Math.sin(i * 2.1) * sz * 0.38);
      side.rotation.y = i * 1.7;
      side.receiveShadow = true;
      this.group.add(side);
    });

    // Cozy Architectural Beveled Ashlar Village Stone Walkway (tidy whole beveled rectangular flagstones + soft wind-blown roadside snowdrifts!)
    const rndStone = createMulberry(5151);
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

    const geoPaverH = makeBeveledPaverGeo(0.62, 0.4); // horizontal course slab
    const geoPaverV = makeBeveledPaverGeo(0.42, 0.58); // vertical course slab
    const geoPaverSq = makeBeveledPaverGeo(0.52, 0.52); // courtyard / accent stepping slab
    const paverPalette = [0xb7aa9a, 0xaa9e8f, 0xa0a5aa, 0xc1b5a5, 0x979da3].map(
      (hex) =>
        new THREE.MeshStandardMaterial({
          map: this.textures.flagstonePaver,
          color: hex,
          roughness: 0.86,
          metalness: 0.05,
        })
    );
    this.paverMaterials = paverPalette;

    const placedBoxes = [];
    this.pathBoxes = placedBoxes; // walkway footprint, also kept clear by _buildGroundDetails
    const addAshlarPaver = (cx, cz, w, d, geo, rotY = 0) => {
      // Keep strictly clear of porch steps, bridge stone abutments, and stone well
      if (cx > -1.85 && cx < 0.25 && cz < -3.02 && cz > -3.72) return;
      if (cx > 9.32 && cx < 9.9 && cz > 1.8 && cz < 4.3) return;
      if (cx > 14.1 && cx < 14.68 && cz > 1.8 && cz < 4.3) return;
      if (Math.hypot(cx - this.wellPos.x, cz - this.wellPos.z) < 1.15) return;

      const pad = 0.015;
      const minX = cx - w / 2 - pad;
      const maxX = cx + w / 2 + pad;
      const minZ = cz - d / 2 - pad;
      const maxZ = cz + d / 2 + pad;
      for (const b of placedBoxes) {
        if (minX < b.maxX && maxX > b.minX && minZ < b.maxZ && maxZ > b.minZ) return;
      }
      placedBoxes.push({ minX, maxX, minZ, maxZ });

      const mat = paverPalette[Math.floor(rndStone() * paverPalette.length)];
      const m = new THREE.Mesh(geo, mat);
      m.position.set(cx, 0.012, cz);
      m.rotation.y = rotY + (rndStone() - 0.5) * 0.04;
      m.receiveShadow = true;
      this.group.add(m);
    };

    const driftGeo = new THREE.SphereGeometry(0.45, 10, 7);
    const addRoadsideSnowDrift = (x, z, sx, sz, rotY = 0) => {
      const dr = new THREE.Mesh(driftGeo, snowMat);
      dr.scale.set(sx, 0.11, sz);
      dr.position.set(x, 0.028, z);
      dr.rotation.y = rotY;
      dr.receiveShadow = true;
      this.group.add(dr);
      this.pathSnowCaps.push({ mesh: dr, baseY: 0.028, baseScaleY: 0.11 });
    };

    // Lay neat staggered horizontal masonry walkway (3 courses wide = ~1.44m)
    const layHorizAshlar = (xStart, xEnd, zCenter, courses = 3) => {
      const stepX = 0.68;
      const stepZ = 0.46;
      const z0 = zCenter - ((courses - 1) * stepZ) / 2;
      for (let r = 0; r < courses; r++) {
        const z = z0 + r * stepZ;
        const shift = (r % 2 === 1) ? stepX * 0.46 : 0;
        for (let x = xStart + shift; x <= xEnd; x += stepX) {
          addAshlarPaver(x, z, 0.62, 0.4, geoPaverH, 0);
        }
      }
      // Soft wind-blown snowdrifts hugging road borders gently (no polka-dots!)
      for (let x = xStart + 0.5; x < xEnd - 0.3; x += 2.35) {
        const side = rndStone() > 0.5 ? 1 : -1;
        const zEdge = zCenter + side * ((courses * stepZ) / 2 + 0.05);
        addRoadsideSnowDrift(x + (rndStone() - 0.5) * 0.5, zEdge, 1.35 + rndStone() * 0.7, 0.52 + rndStone() * 0.25, (rndStone() - 0.5) * 0.25);
      }
    };

    // Lay neat staggered vertical masonry walkway (3 courses wide = ~1.44m)
    const layVertAshlar = (xCenter, zStart, zEnd, courses = 3) => {
      const stepX = 0.48;
      const stepZ = 0.64;
      const x0 = xCenter - ((courses - 1) * stepX) / 2;
      for (let c = 0; c < courses; c++) {
        const x = x0 + c * stepX;
        const shift = (c % 2 === 1) ? stepZ * 0.46 : 0;
        for (let z = zStart + shift; z <= zEnd; z += stepZ) {
          addAshlarPaver(x, z, 0.42, 0.58, geoPaverV, 0);
        }
      }
      for (let z = zStart + 0.5; z < zEnd - 0.3; z += 2.25) {
        const side = rndStone() > 0.5 ? 1 : -1;
        const xEdge = xCenter + side * ((courses * stepX) / 2 + 0.05);
        addRoadsideSnowDrift(xEdge, z + (rndStone() - 0.5) * 0.5, 0.52 + rndStone() * 0.22, 1.25 + rndStone() * 0.65, (rndStone() - 0.5) * 0.25);
      }
    };

    // 1. Front cottage main cross-avenue (tidy warm stone promenade in front of cabin!)
    layHorizAshlar(-5.35, 9.3, -2.32, 3);
    // 2. Central south avenue between Vegetable Garden & Animal Paddock
    layVertAshlar(0.4, -1.35, 6.75, 3);
    // 3. Garden north entrance walkway
    layVertAshlar(-4.8, -1.35, 0.1, 3);
    // 4. Garden south forest trail
    layVertAshlar(-4.8, 6.35, 10.1, 3);
    // 5. East riverside walkway from cross-avenue down to bridge approach
    layVertAshlar(9.12, -1.35, 1.85, 2);
    // 6. Bridge west approach from paddock east gate to bridge west abutment
    layHorizAshlar(8.25, 9.15, 3.05, 3);
    // Corner turn stone smoothly linking east walkway & bridge west approach
    addAshlarPaver(8.98, 2.25, 0.52, 0.52, geoPaverSq, 0.12);
    // 7. East glade walkway from bridge east abutment to campfire glade
    layHorizAshlar(14.88, 15.62, 3.05, 3);

    // Neat square stepping stones trailing off into the snowy forest & entrances
    const trailingStones = [
      [-4.8, 10.85], [-4.55, 11.6], [-5.0, 12.35],
      [0.42, 7.5], [0.58, 8.28], [0.22, 9.05],
      [3.15, -3.32], [8.55, -3.32], [15.75, 4.32], [16.65, 1.35],
    ];
    for (const [sx, sz] of trailingStones) {
      addAshlarPaver(sx, sz, 0.52, 0.52, geoPaverSq, (sx * 0.9 + sz) % 0.45);
    }
  }

  _buildFrozenBrookAndBridge() {
    const bankSnowMat = new THREE.MeshStandardMaterial({
      map: this.textures.snowCap,
      roughness: 0.92,
    });
    const reedMat = new THREE.MeshStandardMaterial({ color: 0x7a653c, roughness: 0.9 });
    const cattailMat = new THREE.MeshStandardMaterial({ color: 0x4d2c19, roughness: 0.92 });
    const stoneMat = new THREE.MeshStandardMaterial({ map: this.textures.stoneWall, roughness: 0.94 });

    // The ice itself is one continuous ribbon built by AlpineLandscape (it runs from the northern
    // spring all the way out through the southern gorge). Here we only dress the yard stretch:
    // snowy banks, winter reeds and brookside cobbles, out to the edge of the flat clearing.
    for (let i = -21; i <= 21; i++) {
      const z = i * 1.1;
      const cx = riverCenterX(z);
      if (Math.hypot(cx, z) > 25.2) continue;

      if (z < 1.65 || z > 4.45) {
        const leftBank = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.2, 1.25), bankSnowMat);
        leftBank.position.set(cx - 1.38, 0.1, z);
        leftBank.receiveShadow = true;
        this.group.add(leftBank);

        const rightBank = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.2, 1.25), bankSnowMat);
        rightBank.position.set(cx + 1.38, 0.1, z);
        rightBank.receiveShadow = true;
        this.group.add(rightBank);

        // Winter reeds & frosty brookside cobbles every few tiles
        if (Math.abs(i) % 3 === 1) {
          const side = i % 2 === 0 ? -1.25 : 1.25;
          for (let r = 0; r < 3; r++) {
            const h = 0.58 + r * 0.14;
            const stalk = new THREE.Mesh(new THREE.BoxGeometry(0.04, h, 0.04), reedMat);
            stalk.position.set(cx + side + (r - 1) * 0.1, h * 0.5, z + (r - 1) * 0.12);
            stalk.rotation.z = (r - 1) * 0.12;
            this.group.add(stalk);
            if (r === 1) {
              const tip = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.2, 0.07), cattailMat);
              tip.position.set(cx + side, h - 0.08, z);
              this.group.add(tip);
            }
          }
          const pebble = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.2, 0.28), stoneMat);
          pebble.position.set(cx - side * 0.95, 0.11, z + 0.25);
          pebble.rotation.y = i * 0.8;
          this.group.add(pebble);
        }
      }
    }

    // Detailed Physically-Arched Wooden Footbridge at z = 3.05, spanning x = 9.75 .. 14.25 (peak arch +0.66m!)
    const bridge = new THREE.Group();
    const plankMat = new THREE.MeshStandardMaterial({ map: this.textures.woodPlank, roughness: 0.86 });
    const darkWoodMat = new THREE.MeshStandardMaterial({ color: 0x563119, roughness: 0.9 });
    const snowMat = new THREE.MeshStandardMaterial({ map: this.textures.snowCap, roughness: 0.9 });
    const ironMat = new THREE.MeshStandardMaterial({ color: 0x2c3038, roughness: 0.55, metalness: 0.55 });
    const b = this.bridgeSpec;

    // Stone bridge abutments anchoring both approaches cleanly to the cobblestone paths
    for (const ax of [b.minX - 0.14, b.maxX + 0.14]) {
      const abut = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.16, 2.38), stoneMat);
      abut.position.set(ax, 0.05, b.centerZ);
      abut.receiveShadow = true;
      bridge.add(abut);
    }

    // Curved under-deck timber arch stringer beams (clearly visible curved silhouette from 3/4 view!)
    const segCount = 12;
    for (const sideZ of [-0.94, 0.94]) {
      for (let i = 0; i < segCount; i++) {
        const x1 = THREE.MathUtils.lerp(b.minX, b.maxX, i / segCount);
        const x2 = THREE.MathUtils.lerp(b.minX, b.maxX, (i + 1) / segCount);
        const y1 = this.getBridgeDeckY(x1) - 0.12;
        const y2 = this.getBridgeDeckY(x2) - 0.12;
        const len = Math.hypot(x2 - x1, y2 - y1);
        const ang = Math.atan2(y2 - y1, x2 - x1);
        const beam = new THREE.Mesh(new THREE.BoxGeometry(len + 0.06, 0.16, 0.14), darkWoodMat);
        beam.position.set((x1 + x2) / 2, (y1 + y2) / 2, b.centerZ + sideZ);
        beam.rotation.z = ang;
        beam.castShadow = true;
        bridge.add(beam);
      }
    }

    // 15 Individual Tangential Arch Planks (each flexes slightly under the player's footsteps!)
    const plankCount = 15;
    this.bridgePlanks = [];
    for (let i = 0; i < plankCount; i++) {
      const t = (i + 0.5) / plankCount;
      const px = THREE.MathUtils.lerp(b.minX, b.maxX, t);
      const topY = this.getBridgeDeckY(px);
      const slope = this.getBridgeSlope(px);
      const baseY = topY - 0.05;
      const plank = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.1, 2.16), plankMat);
      plank.position.set(px, baseY, b.centerZ);
      plank.rotation.z = Math.atan(slope);
      plank.castShadow = true;
      plank.receiveShadow = true;
      bridge.add(plank);
      this.bridgePlanks.push({ mesh: plank, x: px, baseY, flex: 0 });
    }

    // Curved Side Posts, Handrails & X-Bracing following the exact bridge arch curve
    const postXs = [9.88, 10.95, 12.0, 13.05, 14.12];
    for (const side of [-1.02, 1.02]) {
      for (let i = 0; i < postXs.length; i++) {
        const px = postXs[i];
        const baseY = this.getBridgeDeckY(px);
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.02, 0.16), darkWoodMat);
        post.position.set(px, baseY + 0.44, b.centerZ + side);
        post.castShadow = true;
        bridge.add(post);

        const finial = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.08, 0.22), darkWoodMat);
        finial.position.set(px, baseY + 0.96, b.centerZ + side);
        bridge.add(finial);
        const cap = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.08, 0.2), snowMat);
        cap.position.set(px, baseY + 1.03, b.centerZ + side);
        bridge.add(cap);

        if (i < postXs.length - 1) {
          const nx = postXs[i + 1];
          const nBaseY = this.getBridgeDeckY(nx);
          const midX = (px + nx) / 2;
          const midY = (baseY + nBaseY) / 2;
          const segLen = Math.hypot(nx - px, nBaseY - baseY);
          const segAng = Math.atan2(nBaseY - baseY, nx - px);

          for (const hOff of [0.84, 0.34]) {
            const rail = new THREE.Mesh(new THREE.BoxGeometry(segLen + 0.06, 0.09, 0.1), plankMat);
            rail.position.set(midX, midY + hOff, b.centerZ + side);
            rail.rotation.z = segAng;
            rail.castShadow = true;
            bridge.add(rail);
          }
          for (const sgn of [-1, 1]) {
            const brace = new THREE.Mesh(new THREE.BoxGeometry(segLen * 0.9, 0.06, 0.05), darkWoodMat);
            brace.position.set(midX, midY + 0.59, b.centerZ + side + sgn * 0.012);
            brace.rotation.z = segAng + sgn * 0.44;
            bridge.add(brace);
          }
          const rSnow = new THREE.Mesh(new THREE.BoxGeometry(segLen * 0.88, 0.06, 0.12), snowMat);
          rSnow.position.set(midX, midY + 0.91, b.centerZ + side);
          rSnow.rotation.z = segAng;
          bridge.add(rSnow);
        }
      }
    }

    // Solid side railing colliders matching the curved wooden handrails (prevents clipping sideways & guides walking cleanly across the arch!)
    this._addBoxCollider((b.minX + b.maxX) / 2, b.centerZ - b.halfW + 0.02, b.maxX - b.minX + 0.05, 0.28);
    this._addBoxCollider((b.minX + b.maxX) / 2, b.centerZ + b.halfW - 0.02, b.maxX - b.minX + 0.05, 0.28);

    // Warm mini lantern perched on west-north & east-south bridge entry posts
    const blMat = new THREE.MeshStandardMaterial({
      color: 0xffe49e,
      emissive: new THREE.Color(0xffb547),
      emissiveIntensity: 1.4,
      roughness: 0.3,
    });
    this.lanternMaterials.push(blMat);
    for (const [lx, lz] of [[9.88, b.centerZ - 1.02], [14.12, b.centerZ + 1.02]]) {
      const ly = this.getBridgeDeckY(lx);
      const bLantern = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.24, 0.18), blMat);
      bLantern.position.set(lx, ly + 1.18, lz);
      bridge.add(bLantern);
      const bCap = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.07, 0.24), ironMat);
      bCap.position.set(lx, ly + 1.32, lz);
      bridge.add(bCap);
      this._addLanternHalo(bridge, lx, ly + 1.18, lz, 1.05, 0.48);
    }

    this.group.add(bridge);
  }

  _buildCottage() {
    const cottage = new THREE.Group();
    const cx = this.cottageCenter.x;
    const cz = this.cottageCenter.z;
    cottage.position.set(cx, 0, cz);

    const logLongMat = new THREE.MeshStandardMaterial({ map: this.textures.logWallLong, roughness: 0.88 });
    const logMat = new THREE.MeshStandardMaterial({ map: this.textures.logWall, roughness: 0.88 });
    const stoneLongMat = new THREE.MeshStandardMaterial({ map: this.textures.stoneWallLong, roughness: 0.94 });
    const stoneMat = new THREE.MeshStandardMaterial({ map: this.textures.stoneWall, roughness: 0.94 });
    const roofLongMat = new THREE.MeshStandardMaterial({ map: this.textures.roofShinglesLong, roughness: 0.82 });
    const roofMat = new THREE.MeshStandardMaterial({ map: this.textures.roofShingles, roughness: 0.82 });
    const snowMat = new THREE.MeshStandardMaterial({ map: this.textures.snowCap, roughness: 0.92 });
    const plankMat = new THREE.MeshStandardMaterial({ map: this.textures.woodPlank, roughness: 0.85 });
    const darkWoodMat = new THREE.MeshStandardMaterial({ color: 0x4b2a15, roughness: 0.9 });
    const trimWoodMat = new THREE.MeshStandardMaterial({ color: 0x6b3e1f, roughness: 0.86 });
    const brickMat = new THREE.MeshStandardMaterial({ map: this.textures.brickChimney, roughness: 0.92 });
    const shutterMat = new THREE.MeshStandardMaterial({ color: 0x355c44, roughness: 0.88 });
    const ironMat = new THREE.MeshStandardMaterial({ color: 0x2f333a, roughness: 0.55, metalness: 0.55 });
    const pineMat = new THREE.MeshStandardMaterial({ color: 0x265938, roughness: 0.9 });
    const berryMat = new THREE.MeshStandardMaterial({ color: 0xd63632, roughness: 0.55 });
    const glassMat = new THREE.MeshStandardMaterial({
      color: 0xfff3d4,
      emissive: new THREE.Color(0xffb84d),
      emissiveIntensity: 0.35,
      transparent: true,
      opacity: 0.28,
      roughness: 0.12,
      metalness: 0.15,
    });
    this.windowMaterials.push(glassMat);

    // ELONGATED CABIN DIMENSIONS: Length = 10.4 (was 6.2!), Depth = 4.8 (was 4.5!)
    const cabinW = 10.4;
    const cabinD = 4.8;
    const baseH = 0.72;
    const wallH = 2.95;

    // 1. Stepped Stone Masonry Foundation + Corner Quoins + Perimeter Snowdrifts
    const base = new THREE.Mesh(new THREE.BoxGeometry(cabinW + 0.45, baseH, cabinD + 0.42), stoneLongMat);
    base.position.set(0, baseH / 2, 0);
    base.castShadow = true;
    base.receiveShadow = true;
    cottage.add(base);

    const baseLedge = new THREE.Mesh(new THREE.BoxGeometry(cabinW + 0.58, 0.12, cabinD + 0.54), stoneMat);
    baseLedge.position.set(0, baseH, 0);
    baseLedge.receiveShadow = true;
    cottage.add(baseLedge);

    // Snowdrifts banked softly along cabin foundation edges
    for (const dx of [-4.2, -2.5, 2.6, 4.3]) {
      const drift = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.26, 0.55), snowMat);
      drift.position.set(dx, 0.13, cabinD / 2 + 0.36);
      drift.receiveShadow = true;
      cottage.add(drift);
    }

    // 2. Main Elongated Log Cabin Walls (built with REAL recessed bays for large glowing windows!)
    // Core solid back & top structure
    const walls = new THREE.Mesh(new THREE.BoxGeometry(cabinW, wallH, cabinD), logLongMat);
    walls.position.set(0, baseH + wallH / 2, 0);
    walls.castShadow = true;
    walls.receiveShadow = true;
    cottage.add(walls);

    // Architectural Timber Corner Pilasters + Mid-Wall Decorative Timber Posts & Beams
    for (const sx of [-cabinW / 2 - 0.08, cabinW / 2 + 0.08]) {
      for (const sz of [-cabinD / 2 - 0.08, cabinD / 2 + 0.08]) {
        // Protruding stacked notched log ends (7 tiers!)
        for (let row = 0; row < 7; row++) {
          const notch = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.26, 0.34), row % 2 === 0 ? darkWoodMat : trimWoodMat);
          notch.position.set(sx, baseH + 0.22 + row * 0.41, sz);
          notch.castShadow = true;
          cottage.add(notch);
        }
      }
    }

    // Intermediate vertical timber pilasters framing the enlarged windows on front wall
    for (const px of [-4.72, -1.86, 1.86, 4.72]) {
      const pilaster = new THREE.Mesh(new THREE.BoxGeometry(0.22, wallH + 0.06, 0.18), darkWoodMat);
      pilaster.position.set(px, baseH + wallH / 2, cabinD / 2 + 0.04);
      pilaster.castShadow = true;
      cottage.add(pilaster);
    }

    // Horizontal timber belt beam under the eaves
    const eaveBeam = new THREE.Mesh(new THREE.BoxGeometry(cabinW + 0.4, 0.22, 0.24), darkWoodMat);
    eaveBeam.position.set(0, baseH + wallH - 0.06, cabinD / 2 + 0.06);
    cottage.add(eaveBeam);

    // 3. Pitched Gable Roof with Timber Knee Braces, Snow Blanket & Attic Dormer!
    const gableSteps = 8;
    for (let i = 0; i < gableSteps; i++) {
      const t = i / gableSteps;
      const d = cabinD * (1 - t * 0.92);
      const y = baseH + wallH + i * 0.28 + 0.14;
      const gable = new THREE.Mesh(new THREE.BoxGeometry(cabinW - 0.04, 0.3, d), logLongMat);
      gable.position.set(0, y, 0);
      gable.castShadow = true;
      cottage.add(gable);
    }

    const slopeLen = 3.85;
    const roofW = cabinW + 1.25;
    const pitch = 0.63;

    const makeSlope = (signZ) => {
      const g = new THREE.Group();
      const shingles = new THREE.Mesh(new THREE.BoxGeometry(roofW, 0.22, slopeLen), roofLongMat);
      shingles.castShadow = true;
      shingles.receiveShadow = true;
      g.add(shingles);

      // Decorative dark bargeboards along left & right roof gable edges
      for (const ex of [-roofW / 2 - 0.04, roofW / 2 + 0.04]) {
        const barge = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.28, slopeLen + 0.12), darkWoodMat);
        barge.position.set(ex, 0.02, 0);
        g.add(barge);
      }

      // Thick sculpted snow blanket
      const snowBlanket = new THREE.Mesh(new THREE.BoxGeometry(roofW + 0.1, 0.24, slopeLen - 0.18), snowMat);
      snowBlanket.position.set(0, 0.2, -signZ * 0.04);
      snowBlanket.castShadow = true;
      snowBlanket.receiveShadow = true;
      g.add(snowBlanket);

      // Scalloped snow overhang cushions along the long eave
      for (let k = -5; k <= 5; k++) {
        const lump = new THREE.Mesh(
          new THREE.BoxGeometry(0.92, 0.18 + (Math.abs(k) % 2) * 0.05, 0.36),
          snowMat
        );
        lump.position.set(k * 1.02, 0.11, signZ * (slopeLen * 0.48));
        g.add(lump);
      }

      g.rotation.x = signZ * pitch;
      g.position.set(0, 4.65, signZ * 1.52);
      return g;
    };

    cottage.add(makeSlope(1));
    cottage.add(makeSlope(-1));

    // Exposed diagonal timber roof knee-braces along front eave
    for (const bx of [-4.72, -2.15, 2.15, 4.72]) {
      const brace = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 0.72), darkWoodMat);
      brace.position.set(bx, 3.45, cabinD / 2 + 0.26);
      brace.rotation.x = 0.7;
      brace.castShadow = true;
      cottage.add(brace);
    }

    // Thick snowy roof ridge cap
    const ridgeSnow = new THREE.Mesh(new THREE.BoxGeometry(roofW + 0.16, 0.28, 0.62), snowMat);
    ridgeSnow.position.set(0, 5.9, 0);
    ridgeSnow.castShadow = true;
    cottage.add(ridgeSnow);

    // Charming Pitched Attic Dormer Window (老虎窗) centered on the front roof slope!
    const dormer = new THREE.Group();
    dormer.position.set(0, 4.72, 1.85);
    const dormBody = new THREE.Mesh(new THREE.BoxGeometry(1.75, 1.12, 1.35), logMat);
    dormBody.castShadow = true;
    dormer.add(dormBody);

    const dormWinMat = new THREE.MeshStandardMaterial({
      map: this.textures.windowWarm,
      emissive: new THREE.Color(0xffb548),
      emissiveMap: this.textures.windowWarm,
      emissiveIntensity: 1.05,
      roughness: 0.3,
    });
    this.windowMaterials.push(dormWinMat);
    const dormPane = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.78, 0.12), dormWinMat);
    dormPane.position.set(0, 0.02, 0.66);
    dormer.add(dormPane);
    const dormSill = new THREE.Mesh(new THREE.BoxGeometry(1.36, 0.11, 0.24), darkWoodMat);
    dormSill.position.set(0, -0.4, 0.74);
    dormer.add(dormSill);
    const dormSillSnow = new THREE.Mesh(new THREE.BoxGeometry(1.26, 0.08, 0.18), snowMat);
    dormSillSnow.position.set(0, -0.32, 0.75);
    dormer.add(dormSillSnow);

    // Mini pitched roof on dormer
    for (const sgn of [-1, 1]) {
      const dSlope = new THREE.Mesh(new THREE.BoxGeometry(1.28, 0.12, 1.65), roofMat);
      dSlope.position.set(sgn * 0.52, 0.78, 0.05);
      dSlope.rotation.z = -sgn * 0.52;
      dSlope.castShadow = true;
      dormer.add(dSlope);
      const dSnow = new THREE.Mesh(new THREE.BoxGeometry(1.26, 0.12, 1.56), snowMat);
      dSnow.position.set(sgn * 0.52, 0.89, 0.05);
      dSnow.rotation.z = -sgn * 0.52;
      dormer.add(dSnow);
    }
    const dormGable = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.42, 0.12), trimWoodMat);
    dormGable.position.set(0, 0.64, 0.66);
    dormer.add(dormGable);
    cottage.add(dormer);

    // Varied translucent icicles hanging along the long front eave
    const icicleMat = new THREE.MeshStandardMaterial({
      color: 0xd9f2ff,
      roughness: 0.14,
      metalness: 0.12,
      transparent: true,
      opacity: 0.85,
    });
    const icicleXs = [-5.4, -4.75, -3.95, -3.1, -2.35, -1.65, 1.7, 2.45, 3.25, 4.1, 4.85, 5.45];
    for (let i = 0; i < icicleXs.length; i++) {
      const h = 0.26 + (i % 3) * 0.15;
      const ic = new THREE.Mesh(new THREE.ConeGeometry(0.055, h, 4), icicleMat);
      ic.rotation.x = Math.PI;
      ic.position.set(icicleXs[i], 3.4 - h * 0.5, 3.12);
      cottage.add(ic);
    }

    // 4. Stepped Stone-and-Brick Chimney with Flue Pot & Snow Collar
    const chimney = new THREE.Group();
    chimney.position.set(1.9, 0, -0.65);
    const chLower = new THREE.Mesh(new THREE.BoxGeometry(1.22, 3.2, 1.15), stoneMat);
    chLower.position.y = 3.2;
    chLower.castShadow = true;
    chimney.add(chLower);
    const chUpper = new THREE.Mesh(new THREE.BoxGeometry(1.02, 2.45, 1.02), brickMat);
    chUpper.position.y = 5.15;
    chUpper.castShadow = true;
    chimney.add(chUpper);
    const chRim = new THREE.Mesh(new THREE.BoxGeometry(1.22, 0.22, 1.22), stoneMat);
    chRim.position.y = 6.38;
    chimney.add(chRim);
    const chPot = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.28, 0.34, 8), brickMat);
    chPot.position.y = 6.62;
    chimney.add(chPot);
    const chSnow = new THREE.Mesh(new THREE.BoxGeometry(1.16, 0.1, 1.16), snowMat);
    chSnow.position.y = 6.52;
    chimney.add(chSnow);
    cottage.add(chimney);
    this.chimneyTopPos.set(cx + 1.9, 6.82, cz - 0.65);

    // 5. Enlarged 3D Recessed Bay & Panoramic Windows with Visible Warm Interior Depth!
    const addDetailedWindow = (wx, wy, wz, winW, winH, rotY = 0, bays = 2, interiorTheme = "living") => {
      const wg = new THREE.Group();
      wg.position.set(wx, wy, wz);
      wg.rotation.y = rotY;

      // Projecting exterior box casing
      const boxDepth = 0.34;
      const casing = new THREE.Mesh(new THREE.BoxGeometry(winW + 0.24, winH + 0.24, boxDepth), darkWoodMat);
      casing.position.z = 0.08;
      casing.castShadow = true;
      wg.add(casing);

      // Warm illuminated miniature interior room diorama inside the window recess!
      const backGlowMat = new THREE.MeshStandardMaterial({
        color: 0xffda8c,
        emissive: new THREE.Color(0xffa438),
        emissiveIntensity: 1.25,
        roughness: 0.65,
      });
      this.windowInteriorGlows.push({ mat: backGlowMat, baseIntensity: 1.55 });

      const innerBack = new THREE.Mesh(new THREE.PlaneGeometry(winW - 0.04, winH - 0.04), backGlowMat);
      innerBack.position.z = 0.16;
      wg.add(innerBack);

      // Warm room silhouette furniture inside window bay so exterior looking IN feels genuinely 3D!
      const silWood = new THREE.MeshStandardMaterial({ color: 0x5c2f14, emissive: 0x3b1a06, emissiveIntensity: 0.55 });
      const silCloth = new THREE.MeshStandardMaterial({ color: 0xc24334, emissive: 0x5e1810, emissiveIntensity: 0.4 });
      const silLamp = new THREE.MeshBasicMaterial({ color: 0xfff5c0 });

      if (interiorTheme === "bedroom") {
        // Hanging miniature pendant + bookshelf silhouette + cozy curtain drapes
        const shelf = new THREE.Mesh(new THREE.BoxGeometry(winW * 0.42, 0.55, 0.06), silWood);
        shelf.position.set(-winW * 0.22, -0.25, 0.19);
        wg.add(shelf);
        const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.22, 0.08), silLamp);
        lamp.position.set(winW * 0.18, 0.24, 0.2);
        wg.add(lamp);
        const desk = new THREE.Mesh(new THREE.BoxGeometry(winW * 0.45, 0.24, 0.06), silWood);
        desk.position.set(winW * 0.18, -0.42, 0.19);
        wg.add(desk);
      } else {
        // Warm living/kitchen: glowing hanging lantern, fireplace/stove silhouette, pot & table
        const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.24, 0.08), silLamp);
        lamp.position.set(0, 0.34, 0.2);
        wg.add(lamp);
        const hearth = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.48, 0.06), silWood);
        hearth.position.set(-winW * 0.26, -0.34, 0.19);
        wg.add(hearth);
        const fireDot = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.2, 0.05), new THREE.MeshBasicMaterial({ color: 0xff6e1f }));
        fireDot.position.set(-winW * 0.26, -0.4, 0.21);
        wg.add(fireDot);
        const mug = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.22, 0.06), silWood);
        mug.position.set(winW * 0.24, -0.44, 0.19);
        wg.add(mug);
      }

      // Cozy interior red curtains pulled to left & right sides
      for (const sgn of [-1, 1]) {
        const drape = new THREE.Mesh(new THREE.BoxGeometry(0.24, winH - 0.08, 0.07), silCloth);
        drape.position.set(sgn * (winW / 2 - 0.14), 0.02, 0.22);
        drape.rotation.z = sgn * 0.08;
        wg.add(drape);
      }

      // Subtle translucent glass pane
      const pane = new THREE.Mesh(new THREE.PlaneGeometry(winW, winH), glassMat);
      pane.position.z = 0.26;
      wg.add(pane);

      // Crisp 3D outer trim frame & mullions
      const topBar = new THREE.Mesh(new THREE.BoxGeometry(winW + 0.36, 0.16, 0.24), trimWoodMat);
      topBar.position.set(0, winH / 2 + 0.1, 0.22);
      wg.add(topBar);
      const topSnow = new THREE.Mesh(new THREE.BoxGeometry(winW + 0.3, 0.09, 0.2), snowMat);
      topSnow.position.set(0, winH / 2 + 0.21, 0.22);
      wg.add(topSnow);

      // Vertical mullions (2-bay or 3-bay panoramic!)
      for (let b = 1; b < bays; b++) {
        const mx = -winW / 2 + (winW * b) / bays;
        const mV = new THREE.Mesh(new THREE.BoxGeometry(0.08, winH, 0.08), darkWoodMat);
        mV.position.set(mx, 0, 0.27);
        wg.add(mV);
      }
      // Horizontal muntin bar
      const mH = new THREE.Mesh(new THREE.BoxGeometry(winW, 0.07, 0.08), darkWoodMat);
      mH.position.set(0, 0.08, 0.27);
      wg.add(mH);

      // Deep projecting wooden windowsill + evergreen winterberry planter box!
      const sill = new THREE.Mesh(new THREE.BoxGeometry(winW + 0.34, 0.16, 0.44), darkWoodMat);
      sill.position.set(0, -winH / 2 - 0.1, 0.24);
      sill.castShadow = true;
      wg.add(sill);

      const planter = new THREE.Mesh(new THREE.BoxGeometry(winW * 0.86, 0.24, 0.3), trimWoodMat);
      planter.position.set(0, -winH / 2 - 0.24, 0.3);
      planter.castShadow = true;
      wg.add(planter);

      // Frosted evergreen sprigs & crimson winterberries in planter box
      const sprigCount = Math.max(3, Math.round(winW * 2.2));
      for (let k = 0; k < sprigCount; k++) {
        const sx = THREE.MathUtils.lerp(-winW * 0.36, winW * 0.36, k / (sprigCount - 1));
        const sprig = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.18 + (k % 2) * 0.06, 0.2), pineMat);
        sprig.position.set(sx, -winH / 2 - 0.07, 0.32);
        wg.add(sprig);
        const cap = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.06, 0.15), snowMat);
        cap.position.set(sx, -winH / 2 + 0.03, 0.32);
        wg.add(cap);
        if (k % 2 === 0) {
          const berry = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 0.07), berryMat);
          berry.position.set(sx + 0.05, -winH / 2 - 0.05, 0.42);
          wg.add(berry);
        }
      }

      // Slatted forest-green timber shutters flanking each window
      for (const sgn of [-1, 1]) {
        const shutter = new THREE.Group();
        shutter.position.set(sgn * (winW / 2 + 0.28), 0, 0.16);
        const sBody = new THREE.Mesh(new THREE.BoxGeometry(0.32, winH + 0.08, 0.09), shutterMat);
        sBody.castShadow = true;
        shutter.add(sBody);
        for (let sl = -2; sl <= 2; sl++) {
          const slat = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.05, 0.11), darkWoodMat);
          slat.position.y = sl * 0.24;
          shutter.add(slat);
        }
        wg.add(shutter);
      }

      cottage.add(wg);
    };

    // Enlarged Front Left (2-bay wide) & Front Right (3-bay grand panoramic!) + West & East Windows
    addDetailedWindow(-3.3, 2.22, cabinD / 2, 2.05, 1.48, 0, 2, "bedroom");
    addDetailedWindow(3.3, 2.22, cabinD / 2, 2.25, 1.48, 0, 3, "living");
    addDetailedWindow(cabinW / 2, 2.24, 0.15, 2.0, 1.44, Math.PI / 2, 2, "living");
    addDetailedWindow(-cabinW / 2, 2.24, 0.35, 1.85, 1.42, -Math.PI / 2, 2, "bedroom");

    // 6. Extended Detailed Front Porch (Deck + Railings + Balusters + Carved Pillars + Steps + Rocking Bench)
    const porchW = 3.9;
    const porchDeck = new THREE.Mesh(new THREE.BoxGeometry(porchW, 0.46, 1.65), plankMat);
    porchDeck.position.set(0, 0.23, cabinD / 2 + 0.82);
    porchDeck.castShadow = true;
    porchDeck.receiveShadow = true;
    cottage.add(porchDeck);

    // Layered stone porch steps
    const step1 = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.24, 0.56), stoneMat);
    step1.position.set(0, 0.12, cabinD / 2 + 1.82);
    step1.receiveShadow = true;
    cottage.add(step1);
    const step2 = new THREE.Mesh(new THREE.BoxGeometry(1.75, 0.12, 0.36), stoneMat);
    step2.position.set(0, 0.3, cabinD / 2 + 1.62);
    step2.receiveShadow = true;
    cottage.add(step2);

    // Welcome doormat on porch (cleanly above porchDeck top y = 0.46)
    const doormat = new THREE.Mesh(
      new THREE.BoxGeometry(1.12, 0.05, 0.62),
      new THREE.MeshStandardMaterial({ color: 0x9c5e31, roughness: 0.96 })
    );
    doormat.position.set(0, 0.488, cabinD / 2 + 0.65);
    cottage.add(doormat);

    // Porch pillars with plinth bases & top diagonal knee-braces
    for (const px of [-1.72, 1.72]) {
      const pBase = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.26, 0.32), stoneMat);
      pBase.position.set(px, 0.59, cabinD / 2 + 1.48);
      cottage.add(pBase);
      const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.2, 2.55, 0.2), darkWoodMat);
      pillar.position.set(px, 1.85, cabinD / 2 + 1.48);
      pillar.castShadow = true;
      cottage.add(pillar);
      // Decorative diagonal brace
      const pBrace = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.1, 0.1), trimWoodMat);
      pBrace.position.set(px + (px < 0 ? 0.2 : -0.2), 2.86, cabinD / 2 + 1.48);
      pBrace.rotation.z = px < 0 ? 0.72 : -0.72;
      cottage.add(pBrace);
    }

    // Porch wooden railings & balusters on left and right sides
    for (const sgn of [-1, 1]) {
      const rx = sgn * 1.32;
      const topRail = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.1, 0.12), darkWoodMat);
      topRail.position.set(rx, 1.18, cabinD / 2 + 1.48);
      cottage.add(topRail);
      const railSnow = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.06, 0.12), snowMat);
      railSnow.position.set(rx, 1.26, cabinD / 2 + 1.48);
      cottage.add(railSnow);
      for (let b = 0; b < 4; b++) {
        const bal = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.72, 0.08), trimWoodMat);
        bal.position.set(rx - 0.35 + b * 0.23, 0.82, cabinD / 2 + 1.48);
        cottage.add(bal);
      }
      // Side railing connecting back to house wall
      const sideRail = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.1, 1.48), darkWoodMat);
      sideRail.position.set(sgn * 1.78, 1.18, cabinD / 2 + 0.75);
      cottage.add(sideRail);
    }

    // Mini cozy wooden porch bench on left side + steel milk jug on right
    const benchSeat = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.08, 0.42), plankMat);
    benchSeat.position.set(-1.26, 0.82, cabinD / 2 + 0.45);
    benchSeat.castShadow = true;
    cottage.add(benchSeat);
    const benchBack = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.42, 0.07), darkWoodMat);
    benchBack.position.set(-1.26, 1.05, cabinD / 2 + 0.24);
    cottage.add(benchBack);
    for (const lx of [-1.62, -0.9]) {
      const bl = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.36, 0.38), darkWoodMat);
      bl.position.set(lx, 0.64, cabinD / 2 + 0.45);
      cottage.add(bl);
    }
    const milkCan = new THREE.Mesh(
      new THREE.CylinderGeometry(0.13, 0.17, 0.44, 8),
      new THREE.MeshStandardMaterial({ color: 0xbfc8d1, metalness: 0.55, roughness: 0.35 })
    );
    milkCan.position.set(1.36, 0.68, cabinD / 2 + 0.5);
    milkCan.castShadow = true;
    cottage.add(milkCan);

    // Pitched Porch Gable Canopy with snow & festive pine garland
    const porchBeam = new THREE.Mesh(new THREE.BoxGeometry(porchW + 0.25, 0.22, 0.24), darkWoodMat);
    porchBeam.position.set(0, 3.1, cabinD / 2 + 1.48);
    cottage.add(porchBeam);

    const porchAwning = new THREE.Mesh(new THREE.BoxGeometry(porchW + 0.42, 0.16, 1.85), roofMat);
    porchAwning.rotation.x = 0.28;
    porchAwning.position.set(0, 3.3, cabinD / 2 + 0.9);
    porchAwning.castShadow = true;
    cottage.add(porchAwning);

    const porchSnow = new THREE.Mesh(new THREE.BoxGeometry(porchW + 0.48, 0.18, 1.75), snowMat);
    porchSnow.rotation.x = 0.28;
    porchSnow.position.set(0, 3.44, cabinD / 2 + 0.88);
    cottage.add(porchSnow);

    // Festive winter garland along porch beam + warm fairy bulbs!
    const bulbMat = new THREE.MeshStandardMaterial({
      color: 0xffeaa6,
      emissive: new THREE.Color(0xffb845),
      emissiveIntensity: 1.5,
      roughness: 0.25,
    });
    this.lanternMaterials.push(bulbMat);
    for (let i = -4; i <= 4; i++) {
      const gx = i * 0.42;
      const sag = Math.cos((i / 4) * Math.PI * 0.5) * -0.14;
      const gLeaf = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.14, 0.14), pineMat);
      gLeaf.position.set(gx, 2.98 + sag, cabinD / 2 + 1.56);
      cottage.add(gLeaf);
      if (i % 2 === 0) {
        const bulb = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.11, 0.09), bulbMat);
        bulb.position.set(gx, 2.88 + sag, cabinD / 2 + 1.6);
        cottage.add(bulb);
      }
    }

    // 7. Animated Front Wooden Door with Carved Frame & Wreath
    const doorFrame = new THREE.Mesh(new THREE.BoxGeometry(1.42, 2.28, 0.24), darkWoodMat);
    doorFrame.position.set(0, 1.62, cabinD / 2 + 0.02);
    cottage.add(doorFrame);

    const doorBack = new THREE.Mesh(
      new THREE.PlaneGeometry(1.14, 2.08),
      new THREE.MeshBasicMaterial({ color: 0x4f2c12 })
    );
    doorBack.position.set(0, 1.58, cabinD / 2 + 0.1);
    cottage.add(doorBack);

    this.doorPivot = new THREE.Group();
    this.doorPivot.position.set(-0.57, 1.58, cabinD / 2 + 0.12);
    const doorMat = new THREE.MeshStandardMaterial({ map: this.textures.woodDoor, roughness: 0.82 });
    const doorLeaf = new THREE.Mesh(new THREE.BoxGeometry(1.14, 2.08, 0.12), doorMat);
    doorLeaf.position.set(0.57, 0, 0);
    doorLeaf.castShadow = true;
    this.doorLeaf = doorLeaf;
    this.doorPivot.add(doorLeaf);
    cottage.add(this.doorPivot);

    // Wreath with red ribbon bow above door
    const wreath = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.08, 6, 10), pineMat);
    wreath.position.set(0, 2.9, cabinD / 2 + 0.2);
    cottage.add(wreath);
    const bow = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.16, 0.12), berryMat);
    bow.position.set(0, 2.64, cabinD / 2 + 0.24);
    cottage.add(bow);

    // Hanging Porch Lantern + Warm Spill Lights
    const lanternMat = new THREE.MeshStandardMaterial({
      color: 0xffe49e,
      emissive: new THREE.Color(0xffb847),
      emissiveIntensity: 1.5,
      roughness: 0.3,
    });
    this.lanternMaterials.push(lanternMat);
    const chain = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.34, 0.05), ironMat);
    chain.position.set(1.22, 2.86, cabinD / 2 + 1.25);
    cottage.add(chain);
    const lanternCap = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.14, 4), ironMat);
    lanternCap.rotation.y = Math.PI / 4;
    lanternCap.position.set(1.22, 2.66, cabinD / 2 + 1.25);
    cottage.add(lanternCap);
    const lanternBody = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.3, 0.22), lanternMat);
    lanternBody.position.set(1.22, 2.45, cabinD / 2 + 1.25);
    cottage.add(lanternBody);

    const porchLight = new THREE.PointLight(0xffb454, 2.8, 14.0, 1.4);
    porchLight.position.set(cx + 0.4, 2.45, cz + cabinD / 2 + 1.65);
    this.scene.add(porchLight);
    this.warmLights.push({ light: porchLight, baseIntensity: 3.6, flicker: true, phase: 0.4 });

    // Warm window glow spills on snow below BOTH enlarged front windows
    for (const wx of [-3.3, 3.3]) {
      const wl = new THREE.PointLight(0xffa942, 1.8, 9.5, 1.5);
      wl.position.set(cx + wx, 1.9, cz + cabinD / 2 + 0.95);
      this.scene.add(wl);
      this.warmLights.push({ light: wl, baseIntensity: 2.3, flicker: false, phase: wx });
    }

    // 8. Attached West Woodshed Lean-To + Stacked Logs + Chopping Stump with Axe!
    const shed = new THREE.Group();
    shed.position.set(-cabinW / 2 - 0.68, 0, -0.3);
    const barkMat = new THREE.MeshStandardMaterial({ map: this.textures.bark, roughness: 0.92 });
    const endMat = new THREE.MeshStandardMaterial({ color: 0xe2b985, roughness: 0.85 });

    for (const sz of [-1.25, 1.25]) {
      const sp = new THREE.Mesh(new THREE.BoxGeometry(0.16, 2.05, 0.16), darkWoodMat);
      sp.position.set(-0.55, 1.025, sz);
      sp.castShadow = true;
      shed.add(sp);
    }
    const shedRoof = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.14, 2.95), roofMat);
    shedRoof.position.set(-0.05, 2.28, 0);
    shedRoof.rotation.z = 0.34;
    shedRoof.castShadow = true;
    shed.add(shedRoof);
    const shedSnow = new THREE.Mesh(new THREE.BoxGeometry(1.56, 0.14, 2.88), snowMat);
    shedSnow.position.set(-0.06, 2.4, 0);
    shedSnow.rotation.z = 0.34;
    shed.add(shedSnow);

    // Stacked cordwood neatly tucked inside woodshed
    for (let row = 0; row < 4; row++) {
      for (let col = 0; col < 6 - (row % 2); col++) {
        const log = new THREE.Mesh(
          new THREE.CylinderGeometry(0.12, 0.12, 0.72, 6),
          [barkMat, endMat, endMat]
        );
        log.rotation.z = Math.PI / 2;
        log.position.set(-0.05, 0.14 + row * 0.21, -0.92 + col * 0.34 + (row % 2) * 0.16);
        log.castShadow = true;
        shed.add(log);
      }
    }
    // Chopping block + embedded iron axe outside woodshed front
    const stump = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.33, 0.56, 8), [barkMat, endMat, barkMat]);
    stump.position.set(-0.15, 0.28, 1.95);
    stump.castShadow = true;
    shed.add(stump);
    const axeBlade = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.18, 0.05), ironMat);
    axeBlade.position.set(-0.15, 0.62, 1.95);
    axeBlade.rotation.z = -0.35;
    shed.add(axeBlade);
    const axeHandle = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.56, 0.06), trimWoodMat);
    axeHandle.position.set(-0.34, 0.78, 1.95);
    axeHandle.rotation.z = 0.85;
    shed.add(axeHandle);
    cottage.add(shed);

    // 9. Cute Wooden Mailbox beside Front Courtyard Path
    const mailbox = new THREE.Group();
    mailbox.position.set(-2.4, 0, cabinD / 2 + 1.65);
    const mbPost = new THREE.Mesh(new THREE.BoxGeometry(0.14, 1.05, 0.14), darkWoodMat);
    mbPost.position.y = 0.525;
    mbPost.castShadow = true;
    mailbox.add(mbPost);
    const mbBox = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.28, 0.52), new THREE.MeshStandardMaterial({ color: 0x3f6282, roughness: 0.75 }));
    mbBox.position.set(0, 1.12, 0.06);
    mbBox.castShadow = true;
    mailbox.add(mbBox);
    // Red flag on a pivot: raised when there is unread mail, lowered along the box when empty
    this.mailFlagPivot = new THREE.Group();
    this.mailFlagPivot.position.set(0.19, 1.12, 0.06);
    const mbFlag = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.24, 0.12), berryMat);
    mbFlag.position.set(0, 0.12, 0);
    this.mailFlagPivot.add(mbFlag);
    this.mailFlagPivot.rotation.x = -Math.PI / 2;
    mailbox.add(this.mailFlagPivot);
    const mbSnow = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.07, 0.46), snowMat);
    mbSnow.position.set(0, 1.28, 0.06);
    mailbox.add(mbSnow);
    cottage.add(mailbox);
    this._addCircleCollider(this.mailboxPos.x, this.mailboxPos.z, 0.26);

    this.group.add(cottage);

    // Precise Cottage Colliders (keeping porch center entry cleanly open!)
    this._addBoxCollider(cx, cz, cabinW + 0.3, cabinD + 0.25);
    this._addBoxCollider(cx - cabinW / 2 - 0.68, cz - 0.15, 1.4, 3.6);
    // Porch side wings (leaves x in [-1.7 .. +0.1] walkable up to the door!)
    this._addBoxCollider(cx - 1.45, cz + cabinD / 2 + 0.95, 1.05, 1.35);
    this._addBoxCollider(cx + 1.45, cz + cabinD / 2 + 0.95, 1.05, 1.35);
    this._addCircleCollider(cx - 2.4, cz + cabinD / 2 + 1.65, 0.3);
  }

  _addFenceRun(x1, z1, x2, z2, woodMat, darkWoodMat, snowMat) {
    const len = Math.hypot(x2 - x1, z2 - z1);
    const cx = (x1 + x2) / 2;
    const cz = (z1 + z2) / 2;
    const angle = Math.atan2(x2 - x1, z2 - z1);
    const count = Math.max(2, Math.round(len / 1.35) + 1);

    for (let i = 0; i < count; i++) {
      const t = i / (count - 1);
      const px = THREE.MathUtils.lerp(x1, x2, t);
      const pz = THREE.MathUtils.lerp(z1, z2, t);
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.86, 0.18), darkWoodMat);
      post.position.set(px, 0.43, pz);
      post.castShadow = true;
      this.group.add(post);

      const cap = new THREE.Mesh(new THREE.BoxGeometry(0.21, 0.08, 0.21), snowMat);
      cap.position.set(px, 0.89, pz);
      this.group.add(cap);
    }

    for (const ry of [0.28, 0.62]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.11, len), woodMat);
      rail.position.set(cx, ry, cz);
      rail.rotation.y = angle;
      rail.castShadow = true;
      this.group.add(rail);
    }

    const horiz = Math.abs(x2 - x1) > Math.abs(z2 - z1);
    this._addBoxCollider(cx, cz, horiz ? len : 0.28, horiz ? 0.28 : len);
  }

  _buildFarmFenceAndProps() {
    const woodMat = new THREE.MeshStandardMaterial({ map: this.textures.woodPlank, roughness: 0.88 });
    const darkWoodMat = new THREE.MeshStandardMaterial({ color: 0x5c371d, roughness: 0.9 });
    const snowMat = new THREE.MeshStandardMaterial({ map: this.textures.snowCap, roughness: 0.9 });
    const stoneMat = new THREE.MeshStandardMaterial({ map: this.textures.stoneWall, roughness: 0.92 });
    const ironMat = new THREE.MeshStandardMaterial({ color: 0x353942, roughness: 0.55, metalness: 0.55 });

    // Low rustic wooden fence enclosing WEST vegetable garden: x in [-8.9, -0.7], z in [0.20, 6.10]
    // Open gates: North (-4.8, 0.20), East (-0.7, 3.10), South (-4.8, 6.10)
    this._addFenceRun(-8.9, 0.2, -5.75, 0.2, woodMat, darkWoodMat, snowMat);
    this._addFenceRun(-3.85, 0.2, -0.7, 0.2, woodMat, darkWoodMat, snowMat);
    this._addFenceRun(-8.9, 6.1, -5.75, 6.1, woodMat, darkWoodMat, snowMat);
    this._addFenceRun(-3.85, 6.1, -0.7, 6.1, woodMat, darkWoodMat, snowMat);
    this._addFenceRun(-8.9, 0.2, -8.9, 6.1, woodMat, darkWoodMat, snowMat);
    this._addFenceRun(-0.7, 0.2, -0.7, 2.15, woodMat, darkWoodMat, snowMat);
    this._addFenceRun(-0.7, 4.05, -0.7, 6.1, woodMat, darkWoodMat, snowMat);

    // 1. Detailed Stardew Shipping Bin at (3.15, -4.25) with iron corner straps & hinged lid
    const binGroup = new THREE.Group();
    binGroup.position.set(this.shippingBinPos.x, 0, this.shippingBinPos.z);

    const binBase = new THREE.Mesh(new THREE.BoxGeometry(1.48, 0.14, 1.06), darkWoodMat);
    binBase.position.y = 0.07;
    binGroup.add(binBase);

    const binBody = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.78, 0.96), woodMat);
    binBody.position.set(0, 0.48, 0);
    binBody.castShadow = true;
    binBody.receiveShadow = true;
    binGroup.add(binBody);

    for (const sx of [-0.48, 0.48]) {
      const strap = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.84, 1.02), ironMat);
      strap.position.set(sx, 0.48, 0);
      binGroup.add(strap);
    }
    const clasp = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.18, 0.08), new THREE.MeshStandardMaterial({ color: 0xe3b84b, metalness: 0.6, roughness: 0.35 }));
    clasp.position.set(0, 0.74, 0.5);
    binGroup.add(clasp);

    this.shippingBinLid = new THREE.Group();
    this.shippingBinLid.position.set(0, 0.86, -0.46);
    const lidMesh = new THREE.Mesh(new THREE.BoxGeometry(1.52, 0.16, 1.06), darkWoodMat);
    lidMesh.position.set(0, 0.08, 0.46);
    lidMesh.castShadow = true;
    this.shippingBinLid.add(lidMesh);

    const lidSnow = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.09, 0.9), snowMat);
    lidSnow.position.set(0, 0.19, 0.46);
    this.shippingBinLid.add(lidSnow);

    binGroup.add(this.shippingBinLid);
    this.group.add(binGroup);
    this._addBoxCollider(this.shippingBinPos.x, this.shippingBinPos.z, 1.54, 1.1);

    // 2. Detailed Stone Water Well with Windlass Crank, Coiled Rope & Hanging Wooden Bucket!
    const well = new THREE.Group();
    well.position.set(this.wellPos.x, 0, this.wellPos.z);

    const wellRing = new THREE.Mesh(new THREE.CylinderGeometry(0.82, 0.92, 0.82, 10), stoneMat);
    wellRing.position.set(0, 0.41, 0);
    wellRing.castShadow = true;
    wellRing.receiveShadow = true;
    well.add(wellRing);

    // Individual stone cap blocks around the rim
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      const capBlock = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.16, 0.24), stoneMat);
      capBlock.position.set(Math.cos(a) * 0.76, 0.86, Math.sin(a) * 0.76);
      capBlock.rotation.y = -a + Math.PI / 2;
      capBlock.castShadow = true;
      well.add(capBlock);
    }

    const wellWater = new THREE.Mesh(
      new THREE.CylinderGeometry(0.64, 0.64, 0.08, 10),
      new THREE.MeshStandardMaterial({ color: 0x3b8ec4, roughness: 0.14, metalness: 0.18 })
    );
    wellWater.position.set(0, 0.74, 0);
    well.add(wellWater);

    // Timber A-frame supports & windlass roller
    for (const sx of [-0.72, 0.72]) {
      const wp = new THREE.Mesh(new THREE.BoxGeometry(0.15, 1.55, 0.15), darkWoodMat);
      wp.position.set(sx, 1.5, 0);
      wp.castShadow = true;
      well.add(wp);
    }
    const roller = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 1.48, 8), woodMat);
    roller.rotation.z = Math.PI / 2;
    roller.position.set(0, 1.62, 0);
    well.add(roller);
    const crankArm = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.07, 0.07), ironMat);
    crankArm.position.set(0.86, 1.62, 0);
    well.add(crankArm);
    const crankHandle = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.26, 0.07), darkWoodMat);
    crankHandle.position.set(0.96, 1.72, 0);
    well.add(crankHandle);

    // Hanging rope & wooden bucket above water
    const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.45, 5), new THREE.MeshStandardMaterial({ color: 0xc29e63 }));
    rope.position.set(0, 1.36, 0);
    well.add(rope);
    const bucket = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.13, 0.26, 8), woodMat);
    bucket.position.set(0, 1.06, 0);
    bucket.castShadow = true;
    well.add(bucket);
    const bHoop = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.02, 5, 10), ironMat);
    bHoop.rotation.x = Math.PI / 2;
    bHoop.position.set(0, 1.08, 0);
    well.add(bHoop);

    // Shingled pitched roof + gable boards + thick snow ridge
    const wRoofMat = new THREE.MeshStandardMaterial({ map: this.textures.roofShingles, roughness: 0.84 });
    for (const sgn of [-1, 1]) {
      const wr = new THREE.Mesh(new THREE.BoxGeometry(1.92, 0.12, 1.05), wRoofMat);
      wr.position.set(0, 2.38, sgn * 0.4);
      wr.rotation.x = sgn * 0.58;
      wr.castShadow = true;
      well.add(wr);
      const ws = new THREE.Mesh(new THREE.BoxGeometry(1.94, 0.12, 0.92), snowMat);
      ws.position.set(0, 2.5, sgn * 0.38);
      ws.rotation.x = sgn * 0.58;
      well.add(ws);
    }
    const wellRidge = new THREE.Mesh(new THREE.BoxGeometry(1.96, 0.16, 0.36), snowMat);
    wellRidge.position.set(0, 2.74, 0);
    well.add(wellRidge);

    this.group.add(well);
    this._addCircleCollider(this.wellPos.x, this.wellPos.z, 1.02);

    // 3. Detailed Winter Scarecrow guarding the West Carrot Garden (with straw tufts & perched robin!)
    const scare = new THREE.Group();
    scare.position.set(-9.75, 0, 3.15);
    const strawMat = new THREE.MeshStandardMaterial({ color: 0xe3be59, roughness: 0.95 });
    const pole = new THREE.Mesh(new THREE.BoxGeometry(0.14, 2.0, 0.14), darkWoodMat);
    pole.position.y = 1.0;
    pole.castShadow = true;
    scare.add(pole);

    const cross = new THREE.Mesh(new THREE.BoxGeometry(1.42, 0.12, 0.12), darkWoodMat);
    cross.position.y = 1.38;
    cross.castShadow = true;
    scare.add(cross);

    // Straw hands peeking out of sleeves
    for (const sx of [-0.74, 0.74]) {
      const tuft = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.14, 0.14), strawMat);
      tuft.position.set(sx, 1.36, 0);
      scare.add(tuft);
    }

    const coat = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.72, 0.38), new THREE.MeshStandardMaterial({ color: 0x3b6c8c, roughness: 0.9 }));
    coat.position.y = 1.2;
    coat.castShadow = true;
    scare.add(coat);
    // Patch & rope belt
    const patch = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.18, 0.04), new THREE.MeshStandardMaterial({ color: 0xc97b42 }));
    patch.position.set(0.14, 1.08, 0.2);
    scare.add(patch);
    const belt = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.08, 0.42), strawMat);
    belt.position.y = 1.04;
    scare.add(belt);
    const scarf = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.12, 0.44), new THREE.MeshStandardMaterial({ color: 0xc93a32 }));
    scarf.position.y = 1.56;
    scare.add(scarf);

    const head = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.48, 0.48), new THREE.MeshStandardMaterial({ color: 0xe38834, roughness: 0.82 }));
    head.position.y = 1.82;
    head.castShadow = true;
    scare.add(head);
    const eyeM = new THREE.MeshBasicMaterial({ color: 0x26160c });
    for (const ex of [-0.11, 0.11]) {
      const e = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.04), eyeM);
      e.position.set(ex, 1.88, 0.24);
      scare.add(e);
    }
    const hatBrim = new THREE.Mesh(new THREE.BoxGeometry(0.84, 0.09, 0.84), new THREE.MeshStandardMaterial({ color: 0x5c3a21, roughness: 0.9 }));
    hatBrim.position.y = 2.08;
    scare.add(hatBrim);
    const hatTop = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.3, 0.34, 6), new THREE.MeshStandardMaterial({ color: 0x5c3a21, roughness: 0.9 }));
    hatTop.position.y = 2.28;
    scare.add(hatTop);
    const hatSnow = new THREE.Mesh(new THREE.CylinderGeometry(0.23, 0.24, 0.08, 6), snowMat);
    hatSnow.position.y = 2.47;
    scare.add(hatSnow);

    // Tiny cute winter bluebird perched on scarecrow's hat brim!
    const bird = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.12, 0.18), new THREE.MeshStandardMaterial({ color: 0x5ca6e6 }));
    bird.position.set(0.28, 2.18, 0.22);
    scare.add(bird);
    const beak = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.04, 0.08), new THREE.MeshStandardMaterial({ color: 0xf5b841 }));
    beak.position.set(0.28, 2.18, 0.33);
    scare.add(beak);

    this.group.add(scare);
    this._addCircleCollider(-9.75, 3.15, 0.45);

    // 4. Detailed Sculpted Snowman near South-East Path (9.55, 5.85 — well clear of bridge approach!)
    const snowman = new THREE.Group();
    snowman.position.set(9.55, 0, 5.85);
    snowman.rotation.y = -0.55;
    const sBot = new THREE.Mesh(new THREE.CylinderGeometry(0.44, 0.5, 0.72, 8), snowMat);
    sBot.position.y = 0.36;
    sBot.castShadow = true;
    snowman.add(sBot);
    const sMid = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.38, 0.56, 8), snowMat);
    sMid.position.y = 0.96;
    sMid.castShadow = true;
    snowman.add(sMid);
    const sHead = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.26, 0.44, 8), snowMat);
    sHead.position.y = 1.44;
    sHead.castShadow = true;
    snowman.add(sHead);

    // Red scarf with dangling tail
    const scarfMat = new THREE.MeshStandardMaterial({ color: 0xc93a32, roughness: 0.85 });
    const sScarf = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.3, 0.13, 8), scarfMat);
    sScarf.position.y = 1.24;
    snowman.add(sScarf);
    const sTail = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.38, 0.06), scarfMat);
    sTail.position.set(0.18, 1.04, 0.28);
    sTail.rotation.z = -0.22;
    snowman.add(sTail);

    // Top hat with crimson band
    const hatMat = new THREE.MeshStandardMaterial({ color: 0x262933, roughness: 0.85 });
    const thBrim = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.06, 8), hatMat);
    thBrim.position.y = 1.68;
    snowman.add(thBrim);
    const thCrown = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.24, 0.36, 8), hatMat);
    thCrown.position.y = 1.88;
    snowman.add(thCrown);
    const thRibbon = new THREE.Mesh(new THREE.CylinderGeometry(0.245, 0.245, 0.07, 8), scarfMat);
    thRibbon.position.y = 1.75;
    snowman.add(thRibbon);

    // Twig arms
    for (const sgn of [-1, 1]) {
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.06, 0.06), darkWoodMat);
      arm.position.set(sgn * 0.5, 1.06, 0);
      arm.rotation.z = sgn * 0.38;
      snowman.add(arm);
    }
    // Tapered carrot nose, coal eyes & buttons
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.28, 5), new THREE.MeshStandardMaterial({ color: 0xf27a24 }));
    nose.rotation.x = Math.PI / 2;
    nose.position.set(0, 1.44, 0.33);
    snowman.add(nose);
    const coalMat = new THREE.MeshBasicMaterial({ color: 0x1e2028 });
    for (const ex of [-0.1, 0.1]) {
      const eye = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.05), coalMat);
      eye.position.set(ex, 1.52, 0.24);
      snowman.add(eye);
    }
    for (const by of [0.85, 1.02]) {
      const btn = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 0.05), coalMat);
      btn.position.set(0, by, 0.35);
      snowman.add(btn);
    }
    this.group.add(snowman);
    this._addCircleCollider(9.55, 5.85, 0.58);

    // 5. Fine Yard Craftsmanship Props: Wooden Winter Sled, Pumpkin Wheelbarrow, Cider Barrels & Crossroads Signpost!
    // (a) Classic Curved-Runner Wooden Winter Sled parked cleanly on the open flat snow (zero drift/mailbox clipping!)
    const sled = new THREE.Group();
    sled.position.set(-4.75, 0, -3.95);
    sled.rotation.y = 0.14;
    const sledRed = new THREE.MeshStandardMaterial({ color: 0xb5392f, roughness: 0.8 });
    const ropeMat = new THREE.MeshStandardMaterial({ color: 0xd9bc82, roughness: 0.92 });
    for (const sz of [-0.22, 0.22]) {
      // Bottom iron ski runner resting cleanly atop y = 0 snow
      const runner = new THREE.Mesh(new THREE.BoxGeometry(1.04, 0.048, 0.048), ironMat);
      runner.position.set(-0.04, 0.024, sz);
      // Curved upward front ski tip joining runner end cleanly
      const tip = new THREE.Mesh(new THREE.TorusGeometry(0.135, 0.024, 5, 8, Math.PI * 0.72), ironMat);
      tip.position.set(0.48, 0.159, sz);
      tip.rotation.z = -Math.PI * 0.5;
      // Vertical struts cleanly between runner top (0.048) and deck underside (0.20)
      const strut1 = new THREE.Mesh(new THREE.BoxGeometry(0.052, 0.152, 0.052), sledRed);
      strut1.position.set(-0.32, 0.124, sz);
      const strut2 = strut1.clone();
      strut2.position.x = 0.28;
      sled.add(runner, tip, strut1, strut2);
    }
    // Front wooden steering crossbar + coiled hemp pull rope resting on snow
    const steerBar = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.048, 0.54), sledRed);
    steerBar.position.set(0.51, 0.26, 0);
    const pullRope = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.018, 5, 10), ropeMat);
    pullRope.rotation.x = Math.PI / 2;
    pullRope.position.set(0.7, 0.022, 0);
    sled.add(steerBar, pullRope);
    // Warm natural wooden deck slats (z in [-0.205, +0.205]) with non-overlapping red outer rails (z = ±0.235)
    for (let sl = -1; sl <= 1; sl++) {
      const slat = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.04, 0.115), woodMat);
      slat.position.set(-0.02, 0.22, sl * 0.145);
      slat.castShadow = true;
      sled.add(slat);
    }
    for (const sz of [-0.235, 0.235]) {
      const edge = new THREE.Mesh(new THREE.BoxGeometry(0.96, 0.052, 0.036), sledRed);
      edge.position.set(-0.02, 0.235, sz);
      sled.add(edge);
    }
    this.group.add(sled);
    this._addBoxCollider(-4.75, -3.95, 1.38, 0.72);

    // (b) Rustic Wooden Wheelbarrow loaded with Winter Pumpkins & Hay tucked beside West Garden North Fence (off road!)
    const wb = new THREE.Group();
    wb.position.set(-7.8, 0, -0.55);
    wb.rotation.y = 0.55;
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.08, 10), darkWoodMat);
    wheel.rotation.x = Math.PI / 2;
    wheel.position.set(0.56, 0.22, 0);
    wheel.castShadow = true;
    const wbTub = new THREE.Mesh(new THREE.BoxGeometry(0.84, 0.34, 0.58), woodMat);
    wbTub.position.set(0.04, 0.44, 0);
    wbTub.rotation.z = -0.1;
    wbTub.castShadow = true;
    wb.add(wheel, wbTub);
    for (const sz of [-0.22, 0.22]) {
      const handle = new THREE.Mesh(new THREE.BoxGeometry(1.12, 0.06, 0.06), darkWoodMat);
      handle.position.set(-0.14, 0.34, sz);
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.3, 0.06), darkWoodMat);
      leg.position.set(-0.32, 0.15, sz);
      wb.add(handle, leg);
    }
    const wbHay = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.16, 0.48), new THREE.MeshStandardMaterial({ map: this.textures.hayBale }));
    wbHay.position.set(0.05, 0.58, 0);
    const wbPump1 = new THREE.Mesh(new THREE.DodecahedronGeometry(0.18, 0), new THREE.MeshStandardMaterial({ color: 0xe67a1e, roughness: 0.72 }));
    wbPump1.position.set(0.16, 0.72, -0.06);
    const wbPump2 = new THREE.Mesh(new THREE.DodecahedronGeometry(0.14, 0), new THREE.MeshStandardMaterial({ color: 0xf29330, roughness: 0.72 }));
    wbPump2.position.set(-0.14, 0.7, 0.08);
    wb.add(wbHay, wbPump1, wbPump2);
    this.group.add(wb);
    this._addCircleCollider(-7.8, -0.55, 0.65);

    // (c) Oak Cider Barrels & Snow-Capped Crate beside Shipping Bin!
    const barrelGroup = new THREE.Group();
    barrelGroup.position.set(4.55, 0, -4.35);
    for (const [bx, bz, bh] of [[0, 0, 0.74], [0.58, 0.16, 0.66]]) {
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.25, bh, 10), woodMat);
      bar.position.set(bx, bh / 2, bz);
      bar.castShadow = true;
      barrelGroup.add(bar);
      for (const hy of [bh * 0.26, bh * 0.74]) {
        const hoop = new THREE.Mesh(new THREE.TorusGeometry(0.265, 0.02, 5, 10), ironMat);
        hoop.rotation.x = Math.PI / 2;
        hoop.position.set(bx, hy, bz);
        barrelGroup.add(hoop);
      }
      const bSnow = new THREE.Mesh(new THREE.CylinderGeometry(0.23, 0.24, 0.06, 10), snowMat);
      bSnow.position.set(bx, bh + 0.025, bz);
      barrelGroup.add(bSnow);
    }
    this.group.add(barrelGroup);
    this._addBoxCollider(4.82, -4.28, 1.15, 0.72);

    // (d) Carved Wooden Crossroads Direction Signpost placed cleanly on the corner lawn (off walkways!)
    const crossSign = new THREE.Group();
    crossSign.position.set(-0.95, 0, -0.85);
    const csPost = new THREE.Mesh(new THREE.BoxGeometry(0.13, 1.5, 0.13), darkWoodMat);
    csPost.position.y = 0.75;
    csPost.castShadow = true;
    const csCap = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.07, 0.17), snowMat);
    csCap.position.y = 1.53;
    const arrowW = new THREE.Mesh(new THREE.BoxGeometry(0.64, 0.2, 0.07), woodMat);
    arrowW.position.set(-0.24, 1.24, 0.06);
    arrowW.rotation.y = 0.12;
    const arrowE = new THREE.Mesh(new THREE.BoxGeometry(0.64, 0.2, 0.07), woodMat);
    arrowE.position.set(0.24, 1.0, -0.06);
    arrowE.rotation.y = -0.14;
    crossSign.add(csPost, csCap, arrowW, arrowE);
    this.group.add(crossSign);
    this._addCircleCollider(-0.95, -0.85, 0.22);
  }

  _buildAnimalPaddockAndBarn() {
    const woodMat = new THREE.MeshStandardMaterial({ map: this.textures.woodPlank, roughness: 0.88 });
    const darkWoodMat = new THREE.MeshStandardMaterial({ color: 0x5c371d, roughness: 0.9 });
    const snowMat = new THREE.MeshStandardMaterial({ map: this.textures.snowCap, roughness: 0.9 });
    const stoneMat = new THREE.MeshStandardMaterial({ map: this.textures.stoneWall, roughness: 0.94 });
    const barnMat = new THREE.MeshStandardMaterial({ map: this.textures.barnWood, roughness: 0.84 });
    const creamMat = new THREE.MeshStandardMaterial({ color: 0xf2e7d2, roughness: 0.85 });
    const hayMat = new THREE.MeshStandardMaterial({ map: this.textures.hayBale, roughness: 0.95 });
    const roofMat = new THREE.MeshStandardMaterial({ map: this.textures.roofShingles, roughness: 0.82 });
    const ironMat = new THREE.MeshStandardMaterial({ color: 0x30353e, roughness: 0.55, metalness: 0.55 });

    // 1. Trampled Straw-and-Snow Pasture Patch inside Animal Paddock (x: 1.5..8.5, z: 0.20..6.10)
    const paddockFloor = new THREE.Mesh(
      new THREE.BoxGeometry(6.75, 0.04, 5.65),
      new THREE.MeshStandardMaterial({ map: this.textures.paddockGround, roughness: 0.95 })
    );
    paddockFloor.position.set(5.0, 0.02, 3.15);
    paddockFloor.receiveShadow = true;
    this.group.add(paddockFloor);

    // 2. Paddock Wooden Fencing (West Gate x=1.5, z=2.15..4.05; East Gate x=8.5, z=2.15..4.00)
    this._addFenceRun(1.5, 0.2, 8.5, 0.2, woodMat, darkWoodMat, snowMat);
    this._addFenceRun(1.5, 6.1, 8.5, 6.1, woodMat, darkWoodMat, snowMat);
    this._addFenceRun(1.5, 0.2, 1.5, 2.15, woodMat, darkWoodMat, snowMat);
    this._addFenceRun(1.5, 4.05, 1.5, 6.1, woodMat, darkWoodMat, snowMat);
    this._addFenceRun(8.5, 0.2, 8.5, 2.15, woodMat, darkWoodMat, snowMat);
    this._addFenceRun(8.5, 4.0, 8.5, 6.1, woodMat, darkWoodMat, snowMat);

    // Half-open welcoming wooden gate leaves on West paddock entrance!
    for (const [gz, rot] of [[2.2, -0.85], [4.0, 0.95]]) {
      const gateLeaf = new THREE.Group();
      gateLeaf.position.set(1.5, 0, gz);
      gateLeaf.rotation.y = rot;
      const gRail1 = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.1, 0.72), woodMat);
      gRail1.position.set(0, 0.62, gz < 3.15 ? 0.36 : -0.36);
      const gRail2 = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.1, 0.72), woodMat);
      gRail2.position.set(0, 0.28, gz < 3.15 ? 0.36 : -0.36);
      const gEnd = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.74, 0.1), darkWoodMat);
      gEnd.position.set(0, 0.45, gz < 3.15 ? 0.68 : -0.68);
      gateLeaf.add(gRail1, gRail2, gEnd);
      this.group.add(gateLeaf);
    }

    // Little wooden farm signboard beside the West paddock gate
    const sign = new THREE.Group();
    sign.position.set(1.22, 0, 4.4);
    const sPost = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.15, 0.12), darkWoodMat);
    sPost.position.y = 0.575;
    sign.add(sPost);
    const sBoard = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.46, 0.68), woodMat);
    sBoard.position.set(0, 1.05, 0);
    sBoard.castShadow = true;
    sign.add(sBoard);
    const sRoof = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.08, 0.74), snowMat);
    sRoof.position.set(0, 1.31, 0);
    sign.add(sRoof);
    this.group.add(sign);

    // 3. Cozy Red Timber Mini-Barn (暖棚畜舍) at (6.55, 1.70)
    const barn = new THREE.Group();
    barn.position.set(6.55, 0, 1.7);

    const barnBase = new THREE.Mesh(new THREE.BoxGeometry(2.96, 0.34, 2.36), stoneMat);
    barnBase.position.y = 0.17;
    barnBase.castShadow = true;
    barnBase.receiveShadow = true;
    barn.add(barnBase);

    const barnBody = new THREE.Mesh(new THREE.BoxGeometry(2.76, 1.95, 2.16), barnMat);
    barnBody.position.y = 0.34 + 0.975;
    barnBody.castShadow = true;
    barnBody.receiveShadow = true;
    barn.add(barnBody);

    // White corner trim posts
    for (const bx of [-1.38, 1.38]) {
      for (const bz of [-1.08, 1.08]) {
        const trim = new THREE.Mesh(new THREE.BoxGeometry(0.15, 2.02, 0.15), creamMat);
        trim.position.set(bx, 1.32, bz);
        barn.add(trim);
      }
    }

    // Barn Front Dutch Doorway (facing South into paddock) with warm amber interior recess & hay bedding!
    const doorArch = new THREE.Mesh(new THREE.BoxGeometry(1.36, 1.52, 0.16), creamMat);
    doorArch.position.set(0, 1.08, 1.06);
    barn.add(doorArch);
    const barnInside = new THREE.Mesh(
      new THREE.PlaneGeometry(1.12, 1.34),
      new THREE.MeshStandardMaterial({ color: 0x6b3e1b, emissive: 0x70340a, emissiveIntensity: 0.75 })
    );
    barnInside.position.set(0, 1.04, 1.15);
    barn.add(barnInside);
    const innerHay = new THREE.Mesh(new THREE.BoxGeometry(1.12, 0.24, 0.38), hayMat);
    innerHay.position.set(0, 0.44, 1.05);
    barn.add(innerHay);

    // Swung-open red barn half-doors with white X-braces flanking the opening
    for (const sgn of [-1, 1]) {
      const bDoor = new THREE.Group();
      bDoor.position.set(sgn * 0.68, 1.04, 1.15);
      bDoor.rotation.y = -sgn * 2.1;
      const leaf = new THREE.Mesh(new THREE.BoxGeometry(0.54, 1.3, 0.08), barnMat);
      leaf.position.x = -sgn * 0.27;
      bDoor.add(leaf);
      const x1 = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.07, 0.095), creamMat);
      x1.position.x = -sgn * 0.27;
      x1.rotation.z = 0.85;
      const x2 = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.07, 0.112), creamMat);
      x2.position.x = -sgn * 0.27;
      x2.rotation.z = -0.85;
      bDoor.add(x1, x2);
      barn.add(bDoor);
    }

    // Gambrel / Pitched Barn Gable + Hayloft Window + Hoist Beam!
    for (let i = 0; i < 5; i++) {
      const w = 2.72 * (1 - i * 0.18);
      const gStep = new THREE.Mesh(new THREE.BoxGeometry(w, 0.25, 2.12), barnMat);
      gStep.position.y = 2.4 + i * 0.24;
      gStep.castShadow = true;
      barn.add(gStep);
    }

    // Hayloft opening with golden hay peeking out + hoist beam
    const loftFrame = new THREE.Mesh(new THREE.BoxGeometry(0.76, 0.64, 0.14), creamMat);
    loftFrame.position.set(0, 2.75, 1.06);
    barn.add(loftFrame);
    const loftHay = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.46, 0.16), hayMat);
    loftHay.position.set(0, 2.74, 1.08);
    barn.add(loftHay);
    const hoistBeam = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, 0.72), darkWoodMat);
    hoistBeam.position.set(0, 3.24, 1.24);
    barn.add(hoistBeam);

    // Pitched snowy barn roof (ridge runs along Z so gable faces south into the yard!)
    for (const sgn of [-1, 1]) {
      const rSlope = new THREE.Mesh(new THREE.BoxGeometry(2.05, 0.16, 2.65), roofMat);
      rSlope.position.set(sgn * 0.86, 2.86, 0);
      rSlope.rotation.z = -sgn * 0.66;
      rSlope.castShadow = true;
      rSlope.receiveShadow = true;
      barn.add(rSlope);

      const rSnow = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.18, 2.58), snowMat);
      rSnow.position.set(sgn * 0.86, 3.0, 0);
      rSnow.rotation.z = -sgn * 0.66;
      barn.add(rSnow);
    }
    const bRidge = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.22, 2.68), snowMat);
    bRidge.position.set(0, 3.65, 0);
    barn.add(bRidge);

    // Mini Barn Cupola + Weathervane Arrow on top of ridge!
    const cupola = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.42, 0.46), creamMat);
    cupola.position.set(0, 3.82, -0.1);
    barn.add(cupola);
    const cupRoof = new THREE.Mesh(new THREE.ConeGeometry(0.38, 0.32, 4), roofMat);
    cupRoof.rotation.y = Math.PI / 4;
    cupRoof.position.set(0, 4.18, -0.1);
    barn.add(cupRoof);
    const vanePole = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.36, 0.04), ironMat);
    vanePole.position.set(0, 4.46, -0.1);
    barn.add(vanePole);
    this.barnWeathervane = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.05, 0.05), ironMat);
    this.barnWeathervane.position.set(0, 4.58, -0.1);
    barn.add(this.barnWeathervane);

    // Warm Glowing Barn Lantern over Dutch door
    const bLanternMat = new THREE.MeshStandardMaterial({
      color: 0xffe49e,
      emissive: new THREE.Color(0xffb447),
      emissiveIntensity: 1.5,
      roughness: 0.3,
    });
    this.lanternMaterials.push(bLanternMat);
    const blBox = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.26, 0.2), bLanternMat);
    blBox.position.set(0, 2.02, 1.24);
    barn.add(blBox);
    const blCap = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.07, 0.28), ironMat);
    blCap.position.set(0, 2.18, 1.24);
    barn.add(blCap);
    this._addLanternHalo(barn, 0, 2.02, 1.26, 1.15, 0.52);

    const barnLight = new THREE.PointLight(0xffb452, 2.4, 11.5, 1.45);
    barnLight.position.set(6.55, 2.1, 3.2);
    this.scene.add(barnLight);
    this.warmLights.push({ light: barnLight, baseIntensity: 2.8, flicker: true, phase: 2.3 });

    this.group.add(barn);
    this._addBoxCollider(6.55, 1.7, 2.95, 2.3);

    // 4. Attached Cozy Chicken Coop Wing & Egg Nesting Box at (4.55, 1.30)
    const coop = new THREE.Group();
    coop.position.set(4.55, 0, 1.3);

    const coopBody = new THREE.Mesh(new THREE.BoxGeometry(1.36, 1.15, 1.2), woodMat);
    coopBody.position.y = 0.65;
    coopBody.castShadow = true;
    coopBody.receiveShadow = true;
    coop.add(coopBody);

    // Coop legs elevating floor slightly above snow
    for (const cx of [-0.58, 0.58]) {
      for (const cz of [-0.5, 0.5]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.24, 0.12), darkWoodMat);
        leg.position.set(cx, 0.12, cz);
        coop.add(leg);
      }
    }
    const coopRoof = new THREE.Mesh(new THREE.BoxGeometry(1.56, 0.14, 1.44), roofMat);
    coopRoof.position.set(0, 1.32, 0.02);
    coopRoof.rotation.x = 0.26;
    coopRoof.castShadow = true;
    coop.add(coopRoof);
    const coopSnow = new THREE.Mesh(new THREE.BoxGeometry(1.54, 0.14, 1.34), snowMat);
    coopSnow.position.set(0, 1.44, 0.02);
    coopSnow.rotation.x = 0.26;
    coop.add(coopSnow);

    // Little chicken entrance ramp + open straw nesting shelf with collectible eggs!
    const ramp = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.07, 0.72), woodMat);
    ramp.position.set(-0.34, 0.18, 0.85);
    ramp.rotation.x = 0.42;
    coop.add(ramp);

    const nestBox = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.26, 0.36), darkWoodMat);
    nestBox.position.set(0.28, 0.45, 0.7);
    coop.add(nestBox);
    const nestStraw = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.12, 0.28), hayMat);
    nestStraw.position.set(0.28, 0.57, 0.7);
    coop.add(nestStraw);

    // Visible eggs in coop nest (toggled cleanly by game logic!)
    this.coopEggMeshes = [];
    const eggMat = new THREE.MeshStandardMaterial({ color: 0xfdf7e6, roughness: 0.45 });
    const eggMat2 = new THREE.MeshStandardMaterial({ color: 0xf2d9b8, roughness: 0.48 });
    for (let e = 0; e < 3; e++) {
      const egg = new THREE.Mesh(new THREE.SphereGeometry(0.08, 7, 6), e === 1 ? eggMat2 : eggMat);
      egg.scale.set(0.85, 1.15, 0.85);
      egg.position.set(0.1 + e * 0.18, 0.67, 0.7 + (e % 2) * 0.04);
      coop.add(egg);
      this.coopEggMeshes.push(egg);
    }

    this.group.add(coop);
    this._addBoxCollider(4.55, 1.3, 1.45, 1.35);

    // 5. Wooden Hay Rack & Feeding Trough at (2.75, 1.00) + Stacked Golden Hay Bales!
    const trough = new THREE.Group();
    trough.position.set(this.hayTroughPos.x, 0, this.hayTroughPos.z);

    const trBase = new THREE.Mesh(new THREE.BoxGeometry(1.36, 0.44, 0.62), darkWoodMat);
    trBase.position.y = 0.22;
    trBase.castShadow = true;
    trough.add(trBase);

    this.troughHayMesh = new THREE.Mesh(new THREE.BoxGeometry(1.22, 0.26, 0.5), hayMat);
    this.troughHayMesh.position.y = 0.48;
    trough.add(this.troughHayMesh);

    // Slatted wooden hay rack above trough
    for (const sx of [-0.62, 0.62]) {
      const rp = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.05, 0.1), darkWoodMat);
      rp.position.set(sx, 0.52, -0.24);
      trough.add(rp);
    }
    const rackBack = new THREE.Mesh(new THREE.BoxGeometry(1.26, 0.48, 0.12), woodMat);
    rackBack.position.set(0, 0.85, -0.24);
    rackBack.rotation.x = 0.22;
    trough.add(rackBack);

    // Stacked golden hay bales tucked right beside the trough
    const bale1 = new THREE.Mesh(new THREE.BoxGeometry(0.76, 0.46, 0.52), hayMat);
    bale1.position.set(-0.22, 0.23, -0.64);
    bale1.rotation.y = 0.12;
    bale1.castShadow = true;
    trough.add(bale1);
    const bale2 = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.44, 0.48), hayMat);
    bale2.position.set(0.55, 0.22, -0.62);
    bale2.rotation.y = -0.18;
    bale2.castShadow = true;
    trough.add(bale2);

    this.group.add(trough);
    this._addBoxCollider(this.hayTroughPos.x, this.hayTroughPos.z - 0.15, 1.5, 0.95);

    // 6. Heated Wooden Water Trough at (2.85, 5.30) with unfrozen shimmering water & rising warm wisps!
    const wTrough = new THREE.Group();
    wTrough.position.set(2.85, 0, 5.3);
    const wtBody = new THREE.Mesh(new THREE.BoxGeometry(1.32, 0.46, 0.58), darkWoodMat);
    wtBody.position.y = 0.23;
    wtBody.castShadow = true;
    wTrough.add(wtBody);
    const wtWater = new THREE.Mesh(
      new THREE.BoxGeometry(1.16, 0.08, 0.44),
      new THREE.MeshStandardMaterial({ color: 0x4ca3db, roughness: 0.12, metalness: 0.15 })
    );
    wtWater.position.y = 0.44;
    wTrough.add(wtWater);
    this.group.add(wTrough);
    this._addBoxCollider(2.85, 5.3, 1.38, 0.68);

    // Rising gentle steam wisps above heated water trough
    const steamMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.38 });
    for (let i = 0; i < 4; i++) {
      const wisp = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.12), steamMat.clone());
      wisp.position.set(2.85 + (i - 1.5) * 0.22, 0.55 + i * 0.14, 5.3);
      this.group.add(wisp);
      this.steamWisps.push({ mesh: wisp, baseX: wisp.position.x, baseY: 0.52, baseZ: 5.3, phase: i * 1.6, height: 0.75 });
    }
  }

  setMailFlag(up) {
    this.mailFlagUp = !!up;
  }

  setCoopEggCount(count) {
    if (!this.coopEggMeshes) return;
    for (let i = 0; i < this.coopEggMeshes.length; i++) {
      this.coopEggMeshes[i].visible = i < count;
    }
  }

  setTroughFilled(filled) {
    this.troughFilled = filled;
    if (this.troughHayMesh) this.troughHayMesh.visible = filled;
  }

  _buildLampPosts() {
    const darkWoodMat = new THREE.MeshStandardMaterial({ color: 0x462713, roughness: 0.9 });
    const stoneMat = new THREE.MeshStandardMaterial({ map: this.textures.stoneWall, roughness: 0.94 });
    const ironMat = new THREE.MeshStandardMaterial({ color: 0x2d313a, roughness: 0.55, metalness: 0.55 });
    const snowMat = new THREE.MeshStandardMaterial({ map: this.textures.snowCap, roughness: 0.9 });

    // Relocated strictly OFF all cobblestone roads, paddock/garden gates & bridge approaches!
    const lampCoords = [
      [-6.8, -3.55],
      [1.65, -3.65],
      [8.0, -3.6],
      [14.65, 1.1],
      [-3.15, 7.25],
    ];

    for (let i = 0; i < lampCoords.length; i++) {
      const [lx, lz] = lampCoords[i];
      const g = new THREE.Group();
      g.position.set(lx, 0, lz);

      // Stone plinth base
      const plinth = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.34, 0.36), stoneMat);
      plinth.position.y = 0.17;
      plinth.castShadow = true;
      g.add(plinth);

      // Tapered timber post
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.16, 2.18, 0.16), darkWoodMat);
      post.position.y = 1.38;
      post.castShadow = true;
      g.add(post);

      // Wrought-iron bracket arm + curved strut
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.09, 0.09), ironMat);
      arm.position.set(0.24, 2.34, 0);
      g.add(arm);
      const strut = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.06, 0.06), ironMat);
      strut.position.set(0.22, 2.16, 0);
      strut.rotation.z = 0.72;
      g.add(strut);

      const postCap = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.08, 0.24), ironMat);
      postCap.position.set(0, 2.5, 0);
      g.add(postCap);
      const capSnow = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.08, 0.22), snowMat);
      capSnow.position.set(0, 2.58, 0);
      g.add(capSnow);

      // Detailed 4-sided lantern housing
      const lMat = new THREE.MeshStandardMaterial({
        color: 0xffe49e,
        emissive: new THREE.Color(0xffb444),
        emissiveIntensity: 1.4,
        roughness: 0.3,
      });
      this.lanternMaterials.push(lMat);

      const hood = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.14, 4), ironMat);
      hood.rotation.y = Math.PI / 4;
      hood.position.set(0.46, 2.24, 0);
      g.add(hood);
      const globe = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.3, 0.24), lMat);
      globe.position.set(0.46, 2.04, 0);
      g.add(globe);
      const bottom = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.06, 0.2), ironMat);
      bottom.position.set(0.46, 1.87, 0);
      g.add(bottom);
      this._addLanternHalo(g, 0.46, 2.04, 0, 1.42, 0.56);

      const pt = new THREE.PointLight(0xffb54c, 2.1, 10.2, 1.55);
      pt.position.set(lx + 0.46, 2.02, lz);
      this.scene.add(pt);
      this.warmLights.push({ light: pt, baseIntensity: 2.7, flicker: true, phase: i * 1.9 });

      this.group.add(g);
      this._addCircleCollider(lx, lz, 0.26);
    }
  }

  _buildCampfireGlade() {
    const g = new THREE.Group();
    g.position.set(this.campfirePos.x, 0, this.campfirePos.z);

    const stoneMat = new THREE.MeshStandardMaterial({ map: this.textures.stoneWall, roughness: 0.94 });
    const barkMat = new THREE.MeshStandardMaterial({ map: this.textures.bark, roughness: 0.92 });
    const ironMat = new THREE.MeshStandardMaterial({ color: 0x262930, roughness: 0.5, metalness: 0.65 });
    const snowMat = new THREE.MeshStandardMaterial({ map: this.textures.snowCap, roughness: 0.9 });

    // Ring of varied faceted fieldstones (soot-darkened on the inner face, frosted on top)
    const hearthRnd = createMulberry(3141);
    const hearthStoneMats = [0x8d8a86, 0x7b7c80, 0x9a948c, 0x6f7178].map(
      (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.92, flatShading: true })
    );
    const hearthFrostMat = new THREE.MeshStandardMaterial({ color: 0xf2f6fb, roughness: 0.9 });
    for (let i = 0; i < 11; i++) {
      const a = (i / 11) * Math.PI * 2 + (hearthRnd() - 0.5) * 0.12;
      const rr = 0.15 + hearthRnd() * 0.05;
      const st = new THREE.Mesh(new THREE.DodecahedronGeometry(rr, 0), hearthStoneMats[i % hearthStoneMats.length]);
      st.scale.set(1.2 + hearthRnd() * 0.3, 0.72 + hearthRnd() * 0.25, 0.95 + hearthRnd() * 0.2);
      st.position.set(Math.cos(a) * 0.68, rr * 0.55, Math.sin(a) * 0.68);
      st.rotation.set(hearthRnd() * 0.5, -a + hearthRnd() * 0.6, hearthRnd() * 0.4);
      st.castShadow = true;
      st.receiveShadow = true;
      g.add(st);
      // Thin powder of snow on the cold outer half of some stones
      if (i % 3 !== 1) {
        const fr = new THREE.Mesh(new THREE.SphereGeometry(rr * 0.75, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), hearthFrostMat);
        fr.scale.set(1.15, 0.28, 0.9);
        fr.position.set(Math.cos(a) * 0.74, rr * 0.55 + rr * 0.5, Math.sin(a) * 0.74);
        fr.rotation.y = -a;
        g.add(fr);
      }
    }
    // Scorched ash ring where the snow has melted back around the fire
    const ashRing = new THREE.Mesh(
      new THREE.RingGeometry(0.3, 1.05, 28, 1),
      new THREE.MeshStandardMaterial({ color: 0x4a4440, roughness: 1, transparent: true, opacity: 0.55, depthWrite: false })
    );
    ashRing.rotation.x = -Math.PI / 2;
    ashRing.position.y = 0.012;
    ashRing.receiveShadow = true;
    g.add(ashRing);

    // Glowing ember bed + teepee split firewood logs
    const ember = new THREE.Mesh(
      new THREE.CylinderGeometry(0.42, 0.48, 0.08, 8),
      new THREE.MeshBasicMaterial({ color: 0xb83812 })
    );
    ember.position.y = 0.05;
    g.add(ember);

    for (let i = 0; i < 4; i++) {
      const log = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.09, 0.92, 6), barkMat);
      log.position.y = 0.16;
      log.rotation.z = Math.PI / 2 - 0.18;
      log.rotation.y = (i * Math.PI) / 4;
      g.add(log);
    }

    // Compact wrought-iron tripod & hanging simmering cast-iron stew kettle (scaled as one unit)
    const tripod = new THREE.Group();
    tripod.scale.setScalar(0.7);
    g.add(tripod);
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + 0.3;
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.035, 1.85, 5), ironMat);
      leg.position.set(Math.cos(a) * 0.45, 0.85, Math.sin(a) * 0.45);
      leg.rotation.z = Math.cos(a) * 0.26;
      leg.rotation.x = -Math.sin(a) * 0.26;
      tripod.add(leg);
    }
    const chain = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.56, 4), ironMat);
    chain.position.set(0, 1.38, 0);
    tripod.add(chain);
    const kettle = new THREE.Mesh(new THREE.SphereGeometry(0.24, 8, 7), ironMat);
    kettle.position.set(0, 0.98, 0);
    kettle.scale.set(1.05, 0.86, 1.05);
    kettle.castShadow = true;
    tripod.add(kettle);
    const stew = new THREE.Mesh(
      new THREE.CylinderGeometry(0.18, 0.18, 0.04, 8),
      new THREE.MeshBasicMaterial({ color: 0xf08c32 })
    );
    stew.position.set(0, 1.13, 0);
    tripod.add(stew);

    // Sculpted Organic Multi-Tongue Tapered Campfire Flames + Glowing Coals + Soft Fire Halo!
    this.campfireFlames = [];
    const coalColors = [0xff4b12, 0xd9320c, 0xff8422];
    for (let c = 0; c < 10; c++) {
      const ca = (c / 10) * Math.PI * 2;
      const cr = 0.14 + (c % 3) * 0.11;
      const coal = new THREE.Mesh(
        new THREE.DodecahedronGeometry(0.065, 0),
        new THREE.MeshBasicMaterial({ color: coalColors[c % coalColors.length] })
      );
      coal.position.set(Math.cos(ca) * cr, 0.1, Math.sin(ca) * cr);
      g.add(coal);
    }

    const flameDefs = [
      { x: 0, z: 0, r: 0.16, h: 0.62, color: 0xff5a14, tilt: 0, speed: 10.5, phase: 0.2 },
      { x: -0.14, z: 0.06, r: 0.12, h: 0.48, color: 0xeb4510, tilt: 0.18, speed: 11.4, phase: 1.1 },
      { x: 0.15, z: -0.05, r: 0.12, h: 0.46, color: 0xeb4510, tilt: -0.18, speed: 10.8, phase: 2.3 },
      { x: 0.06, z: 0.13, r: 0.11, h: 0.42, color: 0xff6d1c, tilt: -0.12, speed: 12.2, phase: 3.1 },
      { x: -0.07, z: -0.13, r: 0.11, h: 0.44, color: 0xff6d1c, tilt: 0.12, speed: 11.8, phase: 4.2 },
      { x: -0.06, z: 0.03, r: 0.1, h: 0.42, color: 0xff9d26, tilt: 0.08, speed: 13.6, phase: 0.9 },
      { x: 0.08, z: -0.02, r: 0.095, h: 0.4, color: 0xff9d26, tilt: -0.08, speed: 14.0, phase: 2.1 },
      { x: 0, z: 0.02, r: 0.085, h: 0.36, color: 0xffe066, tilt: 0, speed: 15.8, phase: 1.6 },
      { x: 0.02, z: -0.02, r: 0.06, h: 0.26, color: 0xfff5c0, tilt: 0.03, speed: 17.0, phase: 3.5 },
    ];
    for (const fd of flameDefs) {
      const fGeo = new THREE.ConeGeometry(fd.r, fd.h, 5);
      fGeo.translate(0, fd.h * 0.5, 0);
      const m = new THREE.Mesh(
        fGeo,
        new THREE.MeshBasicMaterial({ color: fd.color, transparent: true, opacity: 0.94 })
      );
      m.position.set(fd.x, 0.16, fd.z);
      m.rotation.z = fd.tilt;
      g.add(m);
      this.campfireFlames.push({ mesh: m, ...fd });
    }

    // Soft radial additive fire glow halo around campfire
    const cfHalo = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: this.textures.fireGlowSoft,
        transparent: true,
        opacity: 0.68,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    cfHalo.position.set(0, 0.46, 0);
    cfHalo.scale.set(1.35, 1.15, 1);
    g.add(cfHalo);
    this.campfireHalo = cfHalo;

    // Rising ember sparks that spiral up and wink out in the cold air
    this.campfireSparks = [];
    const sparkRnd = createMulberry(777);
    for (let i = 0; i < 18; i++) {
      const sp = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: this.textures.fireGlowSoft,
          color: i % 3 === 0 ? 0xffe08a : 0xff9a3c,
          transparent: true,
          opacity: 0,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
      );
      sp.scale.setScalar(0.07);
      g.add(sp);
      this.campfireSparks.push({
        sprite: sp,
        phase: sparkRnd(),
        speed: 0.38 + sparkRnd() * 0.3,
        height: 1.6 + sparkRnd() * 1.4,
        swirl: 0.12 + sparkRnd() * 0.22,
        ang: sparkRnd() * Math.PI * 2,
        size: 0.05 + sparkRnd() * 0.05,
      });
    }

    this.campfireLight = new THREE.PointLight(0xff8c36, 3.4, 14.0, 1.4);
    this.campfireLight.position.set(this.campfirePos.x, 1.25, this.campfirePos.z);
    this.scene.add(this.campfireLight);

    // Cozy log bench beside campfire with folded crimson wool blanket & snow puffs
    const bench = new THREE.Mesh(new THREE.CylinderGeometry(0.23, 0.24, 1.9, 8), barkMat);
    bench.rotation.z = Math.PI / 2;
    bench.position.set(0.1, 0.24, 1.8);
    bench.castShadow = true;
    bench.receiveShadow = true;
    g.add(bench);
    const blanket = new THREE.Mesh(
      new THREE.BoxGeometry(0.68, 0.07, 0.46),
      new THREE.MeshStandardMaterial({ map: this.textures.tableRunner, roughness: 0.92 })
    );
    blanket.position.set(-0.25, 0.45, 1.8);
    g.add(blanket);
    const bSnow = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.07, 0.36), snowMat);
    bSnow.position.set(0.65, 0.46, 1.8);
    g.add(bSnow);

    this.group.add(g);
    this._addCircleCollider(this.campfirePos.x, this.campfirePos.z, 0.9);
    this._addBoxCollider(this.campfirePos.x + 0.1, this.campfirePos.z + 1.8, 1.95, 0.56);

    // Adorable Interactive Claude Crab Mascot ("Clawd" / Claude 小螃蟹) roasting a marshmallow by the campfire!
    this._buildClaudeCrab();
  }

  _buildClaudeCrab() {
    const crab = new THREE.Group();
    crab.position.set(this.claudeCrabPos.x, 0, this.claudeCrabPos.z);
    // Face south-west right toward the campfire & 3/4 camera!
    crab.rotation.y = Math.atan2(
      this.campfirePos.x - this.claudeCrabPos.x,
      this.campfirePos.z - this.claudeCrabPos.z
    );

    const coralMat = new THREE.MeshStandardMaterial({ color: 0xd97757, roughness: 0.68 });
    const coralDarkMat = new THREE.MeshStandardMaterial({ color: 0xb95a3b, roughness: 0.74 });
    const coralLightMat = new THREE.MeshStandardMaterial({ color: 0xeb9678, roughness: 0.72 });
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0x1a1311 });
    const glintMat = new THREE.MeshBasicMaterial({ color: 0xfff8f0 });
    const blushMat = new THREE.MeshBasicMaterial({ color: 0xf49ca0 });
    const twigMat = new THREE.MeshStandardMaterial({ color: 0x6b4022, roughness: 0.9 });
    const mallowMat = new THREE.MeshStandardMaterial({ color: 0xfff8eb, roughness: 0.85 });
    const toastMat = new THREE.MeshStandardMaterial({ color: 0xdf9f54, roughness: 0.85 });

    this.claudeCrabBody = new THREE.Group();

    // 4 Iconic Chunky Claude Pixel Legs (▘▘ ▝▝) standing cleanly on snow (y: 0 .. 0.19)
    this.claudeLegs = [];
    for (const [lx, lz] of [[-0.22, 0.08], [-0.08, 0.08], [0.08, 0.08], [0.22, 0.08], [-0.18, -0.09], [0.18, -0.09]]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.19, 0.085), coralDarkMat);
      leg.position.set(lx, 0.095, lz);
      leg.castShadow = true;
      this.claudeCrabBody.add(leg);
      this.claudeLegs.push({ mesh: leg, baseY: 0.095, phase: lx * 14 + lz * 8 });
    }

    // Iconic Blocky Claude Terracotta Torso (▐▛███▜▌ signature silhouette!)
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.64, 0.36, 0.34), coralMat);
    torso.position.set(0, 0.36, 0);
    torso.castShadow = true;
    torso.receiveShadow = true;
    this.claudeCrabBody.add(torso);

    // Soft bevelled top crown cap + warm belly trim (cleanly inset — zero coplanar faces!)
    const crown = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.055, 0.28), coralLightMat);
    crown.position.set(0, 0.565, 0);
    const belly = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.06, 0.355), coralLightMat);
    belly.position.set(0, 0.23, 0);
    this.claudeCrabBody.add(crown, belly);

    // Classic blocky side shoulder tabs of the Claude Code mascot
    for (const sgn of [-1, 1]) {
      const sideTab = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.15, 0.22), coralMat);
      sideTab.position.set(sgn * 0.37, 0.36, 0);
      sideTab.castShadow = true;
      this.claudeCrabBody.add(sideTab);
    }

    // Signature Dark Rectangular Pixel Eyes + Tiny Gleam + Rosy Cheeks on Front Face (+Z = +0.17)
    for (const ex of [-0.16, 0.16]) {
      const eye = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.115, 0.032), eyeMat);
      eye.position.set(ex, 0.4, 0.178);
      const glint = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.026, 0.036), glintMat);
      glint.position.set(ex + 0.015, 0.43, 0.184);
      const cheek = new THREE.Mesh(new THREE.BoxGeometry(0.072, 0.036, 0.024), blushMat);
      cheek.position.set(ex * 1.48, 0.31, 0.176);
      this.claudeCrabBody.add(eye, glint, cheek);
    }

    // Articulated Cute Coral Crab Pincer Claws (Left & Right)
    const makePincer = (sgn) => {
      const arm = new THREE.Group();
      arm.position.set(sgn * 0.42, 0.38, 0.04);

      const forearm = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.095, 0.14), coralDarkMat);
      forearm.position.set(sgn * 0.05, 0.03, 0.07);
      forearm.rotation.y = -sgn * 0.28;
      forearm.castShadow = true;
      arm.add(forearm);

      const clawPalm = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.13, 0.15), coralMat);
      clawPalm.position.set(sgn * 0.09, 0.1, 0.16);
      clawPalm.castShadow = true;
      arm.add(clawPalm);

      // Cute open V-shaped chunky crab pincer tips!
      const upperPinch = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.065, 0.12), coralLightMat);
      upperPinch.position.set(sgn * 0.07, 0.165, 0.23);
      upperPinch.rotation.x = -0.22;
      const lowerPinch = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.055, 0.11), coralDarkMat);
      lowerPinch.position.set(sgn * 0.11, 0.085, 0.23);
      lowerPinch.rotation.x = 0.22;
      arm.add(upperPinch, lowerPinch);

      return arm;
    };

    this.claudeLeftClaw = makePincer(-1);
    this.claudeRightClaw = makePincer(1);

    // Roasting Marshmallow on a Little Wooden Stick held warmly in the Right Claw toward the campfire!
    const twig = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.018, 0.62, 5), twigMat);
    twig.rotation.x = Math.PI / 2 - 0.18;
    twig.position.set(0.09, 0.17, 0.48);
    twig.castShadow = true;
    const marshmallow = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.052, 0.11, 8), mallowMat);
    marshmallow.rotation.x = Math.PI / 2 - 0.18;
    marshmallow.position.set(0.09, 0.22, 0.74);
    const toastCap = new THREE.Mesh(new THREE.CylinderGeometry(0.054, 0.054, 0.032, 8), toastMat);
    toastCap.rotation.x = Math.PI / 2 - 0.18;
    toastCap.position.set(0.09, 0.23, 0.78);
    this.claudeRightClaw.add(twig, marshmallow, toastCap);

    this.claudeCrabBody.add(this.claudeLeftClaw, this.claudeRightClaw);
    crab.add(this.claudeCrabBody);
    this.group.add(crab);
    this._addCircleCollider(this.claudeCrabPos.x, this.claudeCrabPos.z, 0.52);
  }

  interactClaudeCrab() {
    this.claudeHappyTimer = 1.45;
    this.spawnBurst(this.claudeCrabPos.x, 0.82, this.claudeCrabPos.z, 0xf2936b, 12, 2.2);
    this.spawnBurst(this.claudeCrabPos.x, 0.9, this.claudeCrabPos.z, 0xffe478, 8, 1.8);
    const lines = [
      "咔哒咔哒~ 烤棉花糖分你一颗，冬日暖暖的！",
      "Claude 小螃蟹挥了挥钳子：今天也没有 Bug 哦！",
      "篝火好暖和~ 烤完这串棉花糖就继续陪你写代码！",
      "Clack clack! 欢迎来冬麓篝火边歇一会儿~",
    ];
    const line = lines[this.claudeGreetIdx % lines.length];
    this.claudeGreetIdx += 1;
    return line;
  }

  _buildForest() {
    const rnd = createMulberry(9012);
    const barkMat = new THREE.MeshStandardMaterial({ map: this.textures.bark, roughness: 0.95 });
    const leafMat = new THREE.MeshStandardMaterial({ map: this.textures.pineLeaves, roughness: 0.9 });
    const leafDarkMat = new THREE.MeshStandardMaterial({ map: this.textures.pineLeaves, color: 0xc2d8cc, roughness: 0.92 });
    const snowMat = new THREE.MeshStandardMaterial({ map: this.textures.snowCap, roughness: 0.92 });
    const stoneMat = new THREE.MeshStandardMaterial({ map: this.textures.stoneWall, roughness: 0.95 });
    const berryBushMat = new THREE.MeshStandardMaterial({ color: 0x265239, roughness: 0.92 });
    const berryMat = new THREE.MeshStandardMaterial({ color: 0xd93636, roughness: 0.5 });

    // Curated forest ring framing the elongated cabin, west garden, east animal paddock, brook & glade!
    const treeSpecs = [
      // North backdrop behind elongated cabin
      [-12.8, -11.6, 1.32], [-11.0, -12.6, 1.2], [-4.6, -12.9, 1.35], [-1.0, -12.8, 1.25],
      [3.5, -12.4, 1.28], [7.8, -11.4, 1.22], [14.0, -7.4, 1.1], [14.8, -10.0, 1.28], [17.8, -8.5, 1.34],
      [-15.6, -8.8, 1.38], [-11.0, -8.4, 1.12], [6.6, -8.2, 1.12], [8.3, -6.7, 1.02],
      // West woods
      [-13.8, -4.8, 1.24], [-11.4, -3.5, 1.04], [-15.0, -0.6, 1.32], [-12.0, 0.8, 1.1],
      [-13.6, 4.4, 1.22], [-11.4, 6.2, 0.98], [-14.8, 8.2, 1.3], [-11.5, 10.2, 1.14],
      // South woods (clear sightlines to shifted vegetable garden & animal paddock!)
      [-8.4, 10.8, 1.05], [-7.9, 13.6, 1.22], [-1.6, 10.8, 1.02], [2.2, 11.4, 1.12],
      [6.4, 10.4, 1.06], [9.4, 9.8, 1.04], [14.6, 9.8, 1.18], [17.6, 8.8, 1.24],
      // East Pine Glade trees around campfire (kept cleanly clear of south sightlines to bridge & Claude crab!)
      [15.0, -4.6, 1.08], [17.8, -3.4, 1.25], [19.0, 0.6, 1.2], [19.5, 6.8, 1.15],
      [15.4, 8.6, 0.98], [17.2, -6.4, 1.16],
      // Deep silhouette outer forest ring
      [-19.2, -13.0, 1.48], [-18.8, -5.0, 1.42], [-19.0, 3.5, 1.42], [-18.4, 11.0, 1.45],
      [-3.5, -16.2, 1.52], [4.5, -15.8, 1.48], [16.2, -15.0, 1.48], [22.0, -4.0, 1.48],
      [22.4, 3.8, 1.44], [21.6, 10.5, 1.48],
    ];

    treeSpecs.forEach(([x, z, scale], idx) => {
      const tree = new THREE.Group();
      tree.position.set(x, 0, z);
      tree.rotation.y = rnd() * Math.PI * 2;
      const s = scale * (0.94 + rnd() * 0.14);

      // Tapered trunk with exposed root buttresses
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.18 * s, 0.28 * s, 1.38 * s, 6), barkMat);
      trunk.position.y = 0.68 * s;
      trunk.castShadow = true;
      trunk.receiveShadow = true;
      tree.add(trunk);

      for (let r = 0; r < 3; r++) {
        const ra = (r / 3) * Math.PI * 2;
        const root = new THREE.Mesh(new THREE.BoxGeometry(0.36 * s, 0.22 * s, 0.16 * s), barkMat);
        root.position.set(Math.cos(ra) * 0.22 * s, 0.11 * s, Math.sin(ra) * 0.22 * s);
        root.rotation.y = -ra;
        tree.add(root);
      }

      // 5 tiered octagonal/rotated sculpted spruce boughs with fluffy snow cushions!
      const tiers = [
        { r: 1.32, h: 1.05, y: 1.42 },
        { r: 1.06, h: 0.98, y: 2.22 },
        { r: 0.8, h: 0.88, y: 2.94 },
        { r: 0.54, h: 0.78, y: 3.58 },
        { r: 0.28, h: 0.62, y: 4.12 },
      ];
      tiers.forEach((t, ti) => {
        const foliage = new THREE.Mesh(
          new THREE.ConeGeometry(t.r * s, t.h * s, 7),
          ti % 2 === 0 ? leafMat : leafDarkMat
        );
        foliage.position.y = t.y * s;
        foliage.rotation.y = ti * 0.45;
        foliage.castShadow = true;
        foliage.receiveShadow = true;
        tree.add(foliage);

        // Sculpted snow cap resting atop each bough tier
        const cap = new THREE.Mesh(
          new THREE.ConeGeometry((t.r * 0.84) * s, (t.h * 0.52) * s, 7),
          snowMat
        );
        cap.position.y = (t.y + t.h * 0.28) * s;
        cap.rotation.y = ti * 0.45;
        cap.receiveShadow = true;
        tree.add(cap);
      });

      this.group.add(tree);

      if (x >= this.bounds.minX - 1 && x <= this.bounds.maxX + 1 && z >= this.bounds.minZ - 1 && z <= this.bounds.maxZ + 1) {
        this._addCircleCollider(x, z, 0.52 * s);
        this.shakeTrees.push({
          id: `tree_${idx}`,
          mesh: tree,
          x,
          z,
          scale: s,
          shakeTimer: 0,
          cooldown: 0,
        });
      }
    });

    const snowCushionGeo = new THREE.SphereGeometry(1, 14, 6, 0, Math.PI * 2, 0, Math.PI / 2);

    // Red winterberry bushes
    const bushCoords = [
      [-10.2, -5.0], [-10.5, 5.8], [8.6, 7.4], [6.4, -4.6], [14.6, -1.6], [18.2, 3.8], [-1.8, 8.2],
    ];
    for (const [bx, bz] of bushCoords) {
      const bush = new THREE.Group();
      bush.position.set(bx, 0, bz);
      const body = new THREE.Mesh(new THREE.DodecahedronGeometry(0.48, 0), berryBushMat);
      body.scale.set(1.15, 0.82, 1.15);
      body.position.y = 0.34;
      body.castShadow = true;
      bush.add(body);
      const snowTop = new THREE.Mesh(snowCushionGeo, snowMat);
      snowTop.scale.set(0.46, 0.2, 0.44);
      snowTop.position.y = 0.6;
      snowTop.rotation.y = bx;
      bush.add(snowTop);
      for (let k = 0; k < 7; k++) {
        const ang = (k / 7) * Math.PI * 2;
        const b = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.1), berryMat);
        b.position.set(Math.cos(ang) * 0.44, 0.28 + (k % 3) * 0.11, Math.sin(ang) * 0.44);
        bush.add(b);
      }
      this.group.add(bush);
      this._addCircleCollider(bx, bz, 0.46);
    }

    // Faceted snow-capped granite boulders
    const rockCoords = [
      [-10.6, -0.8, 1.05], [8.8, 8.4, 1.15], [16.8, -1.3, 0.98], [-8.0, 8.6, 0.88],
    ];
    for (const [rx, rz, rs] of rockCoords) {
      const rGroup = new THREE.Group();
      rGroup.position.set(rx, 0, rz);
      const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.56 * rs, 0), stoneMat);
      rock.scale.set(1.15, 0.78, 1.0);
      rock.position.y = 0.36 * rs;
      rock.rotation.y = rx * 0.7;
      rock.castShadow = true;
      rock.receiveShadow = true;
      rGroup.add(rock);
      const cap = new THREE.Mesh(snowCushionGeo, snowMat);
      cap.scale.set(0.48 * rs, 0.17 * rs, 0.42 * rs);
      cap.position.y = 0.64 * rs;
      cap.rotation.y = rx * 0.7;
      rGroup.add(cap);
      this.group.add(rGroup);
      this._addCircleCollider(rx, rz, 0.58 * rs);
    }
  }

  _spawnInitialFirewood() {
    const spots = [
      [-10.5, 4.0],
      [15.2, 0.2],
      [7.2, 7.6],
    ];
    for (const [x, z] of spots) {
      this.spawnFirewoodDrop(x, z);
    }
  }

  spawnFirewoodDrop(x, z) {
    const barkMat = new THREE.MeshStandardMaterial({ map: this.textures.bark, roughness: 0.9 });
    const endMat = new THREE.MeshStandardMaterial({ color: 0xdfb482, roughness: 0.85 });
    const g = new THREE.Group();
    const log = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.54, 6), [barkMat, endMat, endMat]);
    log.rotation.z = Math.PI / 2;
    log.castShadow = true;
    g.add(log);
    const log2 = log.clone();
    log2.position.set(0.04, 0.12, 0.06);
    log2.rotation.y = 0.42;
    g.add(log2);
    g.position.set(x, 0.18, z);
    this.group.add(g);

    this.droppedItems.push({
      id: `wood_${Math.random().toString(36).slice(2, 8)}`,
      type: "firewood",
      mesh: g,
      x,
      z,
      bobPhase: Math.random() * Math.PI * 2,
    });
  }

  removeDroppedItem(item) {
    const idx = this.droppedItems.indexOf(item);
    if (idx !== -1) {
      this.group.remove(item.mesh);
      this.droppedItems.splice(idx, 1);
    }
  }

  shakeTree(tree) {
    tree.shakeTimer = 0.65;
    this.spawnBurst(tree.x, 2.4 * tree.scale, tree.z, 0xf2f8ff, 18, 2.4);

    if (tree.cooldown <= 0) {
      tree.cooldown = 18;
      const ang = Math.random() * Math.PI * 2;
      const dx = tree.x + Math.cos(ang) * 1.15;
      const dz = tree.z + Math.sin(ang) * 1.15;
      const safe = this.resolveMovement(dx, dz, 0.2);
      this.spawnFirewoodDrop(safe.x, safe.z);
      return true;
    }
    return false;
  }

  stokeCampfire() {
    this.campfireBoost = Math.min(2.1, this.campfireBoost + 0.55);
    this.spawnBurst(this.campfirePos.x, 0.65, this.campfirePos.z, 0xffaa33, 14, 2.8);
  }

  spawnBurst(x, y, z, colorHex, count = 10, speed = 2.0) {
    const geo = new THREE.BoxGeometry(0.11, 0.11, 0.11);
    const mat = new THREE.MeshBasicMaterial({ color: colorHex });
    for (let i = 0; i < count; i++) {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x + (Math.random() - 0.5) * 0.35, y, z + (Math.random() - 0.5) * 0.35);
      this.group.add(m);
      const ang = Math.random() * Math.PI * 2;
      const spd = (0.4 + Math.random() * 0.8) * speed;
      this.particles.push({
        mesh: m,
        vx: Math.cos(ang) * spd * 0.7,
        vy: 1.4 + Math.random() * speed,
        vz: Math.sin(ang) * spd * 0.7,
        age: 0,
        life: 0.55 + Math.random() * 0.4,
      });
    }
  }

  update(dt, elapsed, nightFactor, playerPos, snowLevel = 1) {
    const lampGlow = THREE.MathUtils.clamp((nightFactor - 0.14) / 0.55, 0, 1);

    // Snow slowly piles up during heavy snow and thins when it stops (roofs, rails, roadside drifts)
    const accum = this.snowCaps ? this._updateSnowAccumulation(dt, snowLevel) : 0.35;
    if (this.pathSnowCaps && this.pathSnowCaps.length > 0) {
      const mult = accum < 0.35 ? 0.05 + (accum / 0.35) * 0.95 : 1 + ((accum - 0.35) / 0.65) * 0.9;
      const vis = mult > 0.08;
      for (const c of this.pathSnowCaps) {
        c.mesh.visible = vis;
        if (vis) c.mesh.scale.y = c.baseScaleY * mult;
      }
    }

    for (const mat of this.windowMaterials) {
      mat.emissiveIntensity = 0.22 + lampGlow * 1.35;
    }
    for (const g of this.windowInteriorGlows) {
      const hearthPulse = 0.94 + 0.06 * Math.sin(elapsed * 8.5);
      g.mat.emissiveIntensity = (0.48 + lampGlow * g.baseIntensity) * hearthPulse;
    }
    for (const mat of this.lanternMaterials) {
      mat.emissiveIntensity = 0.35 + lampGlow * 1.65;
    }
    for (const h of this.lanternHalos) {
      const pulse = 0.94 + 0.06 * Math.sin(elapsed * 5.2 + h.phase);
      const vis = 0.14 + lampGlow * 0.86;
      h.sprite.material.opacity = h.baseOpacity * vis * pulse;
      const sc = h.baseScale * (0.85 + 0.22 * lampGlow) * pulse;
      h.sprite.scale.set(sc, sc, 1);
    }
    for (const w of this.warmLights) {
      const flick = w.flicker ? (0.93 + 0.07 * Math.sin(elapsed * 7.5 + w.phase) + 0.04 * Math.sin(elapsed * 13.0 + w.phase)) : 1.0;
      w.light.intensity = w.baseIntensity * lampGlow * flick;
    }

    // Physical spring flex on the wooden bridge planks directly beneath the player's footsteps!
    const onBridge =
      playerPos.x >= this.bridgeSpec.minX &&
      playerPos.x <= this.bridgeSpec.maxX &&
      Math.abs(playerPos.z - this.bridgeSpec.centerZ) <= this.bridgeSpec.halfW;
    for (const p of this.bridgePlanks) {
      let targetFlex = 0;
      if (onBridge) {
        const dx = Math.abs(playerPos.x - p.x);
        if (dx < 0.62) {
          targetFlex = -0.036 * Math.cos((dx / 0.62) * Math.PI * 0.5);
        }
      }
      p.flex = THREE.MathUtils.lerp(p.flex, targetFlex, Math.min(1, dt * 14));
      p.mesh.position.y = p.baseY + p.flex;
    }

    // Gently sway barn weathervane in winter breeze
    if (this.barnWeathervane) {
      this.barnWeathervane.rotation.y = Math.sin(elapsed * 0.7) * 0.55;
    }

    // Rising subtle steam wisps over heated animal water trough
    for (const s of this.steamWisps) {
      const t = ((elapsed * 0.55 + s.phase) % 1 + 1) % 1;
      s.mesh.position.set(
        s.baseX + Math.sin(elapsed * 2 + s.phase) * 0.07,
        s.baseY + t * s.height,
        s.baseZ + Math.cos(elapsed * 1.6 + s.phase) * 0.05
      );
      s.mesh.scale.setScalar(0.6 + t * 0.7);
      s.mesh.material.opacity = Math.sin(t * Math.PI) * 0.36;
    }

    // Campfire organic sculpted flames, halo & light
    this.campfireBoost = Math.max(1.0, this.campfireBoost - dt * 0.025);
    const fireFlick = 0.88 + 0.12 * Math.sin(elapsed * 11.5) + 0.08 * Math.cos(elapsed * 18.0);
    const cfBoostSqrt = Math.sqrt(this.campfireBoost);
    this.campfireLight.intensity = (2.2 + lampGlow * 2.6) * this.campfireBoost * fireFlick;
    for (const f of this.campfireFlames) {
      const w1 = Math.sin(elapsed * f.speed + f.phase);
      const w2 = Math.cos(elapsed * (f.speed * 1.4) + f.phase * 1.6);
      const sy = (0.85 + 0.25 * w1 + 0.1 * w2) * cfBoostSqrt;
      const sxz = (0.92 + 0.1 * w2) * Math.pow(this.campfireBoost, 0.3);
      f.mesh.scale.set(sxz, sy, sxz);
      f.mesh.rotation.z = f.tilt + w1 * 0.15;
      f.mesh.rotation.x = w2 * 0.1;
    }
    if (this.campfireHalo) {
      const hs = (1.28 + 0.14 * fireFlick) * cfBoostSqrt;
      this.campfireHalo.scale.set(hs, hs * 0.85, 1);
    }
    if (this.campfireSparks) {
      for (const sp of this.campfireSparks) {
        const t = (elapsed * sp.speed * cfBoostSqrt + sp.phase) % 1;
        const a = sp.ang + t * 5.5;
        const rad = 0.08 + t * sp.swirl;
        sp.sprite.position.set(Math.cos(a) * rad + t * 0.25, 0.35 + t * sp.height * cfBoostSqrt, Math.sin(a) * rad);
        const blink = 0.75 + 0.25 * Math.sin(elapsed * 23 + sp.phase * 40);
        sp.sprite.material.opacity = Math.pow(1 - t, 1.6) * Math.min(1, t * 8) * blink;
        sp.sprite.scale.setScalar(sp.size * (1 - t * 0.6));
      }
    }

    // Adorable Claude Crab Mascot cozy warming bounce, marshmallow roast & happy greeting hop!
    if (this.claudeCrabBody) {
      if (this.claudeHappyTimer > 0) {
        this.claudeHappyTimer = Math.max(0, this.claudeHappyTimer - dt);
        const hop = Math.abs(Math.sin(this.claudeHappyTimer * Math.PI * 3.5)) * 0.24;
        this.claudeCrabBody.position.y = hop;
        this.claudeLeftClaw.rotation.x = -0.55 + Math.sin(elapsed * 22) * 0.38;
        this.claudeRightClaw.rotation.x = -0.35 + Math.cos(elapsed * 22) * 0.26;
        this.claudeCrabBody.rotation.z = Math.sin(elapsed * 16) * 0.08;
      } else {
        this.claudeCrabBody.position.y = Math.sin(elapsed * 2.8) * 0.018;
        this.claudeCrabBody.rotation.z = Math.sin(elapsed * 1.4) * 0.025;
        this.claudeLeftClaw.rotation.x = -0.1 + Math.sin(elapsed * 3.2) * 0.14;
        this.claudeRightClaw.rotation.x = Math.sin(elapsed * 2.1) * 0.09; // gently roasting marshmallow!
      }
      for (const l of this.claudeLegs) {
        const tap = this.claudeHappyTimer > 0
          ? Math.sin(elapsed * 24 + l.phase) * 0.035
          : Math.max(0, Math.sin(elapsed * 3.2 + l.phase)) * 0.012;
        l.mesh.position.y = l.baseY + tap;
      }
    }

    // Mailbox flag swings up when a new letter arrives (with a little wobble)
    if (this.mailFlagPivot) {
      const target = this.mailFlagUp ? Math.sin(elapsed * 2.2) * 0.06 : -Math.PI / 2;
      this.mailFlagPivot.rotation.x = THREE.MathUtils.lerp(this.mailFlagPivot.rotation.x, target, Math.min(1, dt * 6));
    }

    // Shipping bin lid animation
    const distBin = Math.hypot(playerPos.x - this.shippingBinPos.x, playerPos.z - this.shippingBinPos.z);
    const targetLidAngle = distBin < 2.2 ? -0.95 : 0;
    this.shippingBinLid.rotation.x = THREE.MathUtils.lerp(this.shippingBinLid.rotation.x, targetLidAngle, Math.min(1, dt * 9));

    // Cottage door creaks invitingly when stepping on porch
    const distDoor = Math.hypot(playerPos.x - this.cottageDoorPos.x, playerPos.z - this.cottageDoorPos.z);
    const targetDoorAngle = distDoor < 1.55 ? -0.4 : 0;
    this.doorPivot.rotation.y = THREE.MathUtils.lerp(this.doorPivot.rotation.y, targetDoorAngle, Math.min(1, dt * 8));

    // Shakeable pine trees
    for (const t of this.shakeTrees) {
      if (t.cooldown > 0) t.cooldown = Math.max(0, t.cooldown - dt);
      if (t.shakeTimer > 0) {
        t.shakeTimer = Math.max(0, t.shakeTimer - dt);
        const w = Math.sin(t.shakeTimer * 42) * 0.09 * (t.shakeTimer / 0.65);
        t.mesh.rotation.z = w;
        t.mesh.rotation.x = w * 0.6;
      } else {
        t.mesh.rotation.z = Math.sin(elapsed * 0.9 + t.x) * 0.012;
        t.mesh.rotation.x = 0;
      }
    }

    // Dropped firewood bobbing
    for (const item of this.droppedItems) {
      item.mesh.position.y = 0.2 + Math.sin(elapsed * 3.0 + item.bobPhase) * 0.05;
      item.mesh.rotation.y += dt * 0.8;
    }

    if (this.zones) {
      for (const zn of this.zones) zn.update?.(dt, elapsed, nightFactor, playerPos, lampGlow);
    }

    // Burst particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.age += dt;
      if (p.age >= p.life) {
        this.group.remove(p.mesh);
        this.particles.splice(i, 1);
        continue;
      }
      p.vy -= 7.8 * dt;
      p.mesh.position.x += p.vx * dt;
      p.mesh.position.y = Math.max(0.05, p.mesh.position.y + p.vy * dt);
      p.mesh.position.z += p.vz * dt;
      p.mesh.scale.setScalar(1 - p.age / p.life);
    }
  }
}
