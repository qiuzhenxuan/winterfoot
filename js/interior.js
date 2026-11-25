import * as THREE from "three";
import { makeSnowDriftGeometry } from "./landscape.js";
import { collectReferencedObjects, batchStaticMeshes } from "./staticBatch.js";
import { DECOR_SPOTS, DECOR_ITEMS, buildDecorModel, buildSpotMarker } from "./decor.js";

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

// Expanded, Richly Detailed Winterfoot Interior
// Features real cut-out panoramic windows revealing a live 3D snowy winter world outside,
// sunlight/moonlight shafts, bedroom & study nook, grand stone hearth with sleeping cat,
// and country kitchen & dining room.

export class CottageInterior {
  constructor(scene, textures, options = {}) {
    this.scene = scene;
    this.textures = textures;
    this.isMobilePerf = !!options.isMobilePerf;
    this.group = new THREE.Group();
    this.group.visible = false;
    this.scene.add(this.group);

    // Spacious elongated cabin floorplate: X in [-6.7, +6.7], Z in [-3.3, +3.5]
    this.bounds = { minX: -5.95, maxX: 5.95, minZ: -2.42, maxZ: 2.82 };
    this.colliders = [];

    // Interactive station anchors
    this.spawnPos = new THREE.Vector3(0, 0, 2.35);
    this.exitPos = new THREE.Vector3(0, 0, 2.95);
    this.bedPos = new THREE.Vector3(-4.45, 0, 1.3);
    this.deskPos = new THREE.Vector3(-4.15, 0, -2.0);
    this.fireplacePos = new THREE.Vector3(-1.45, 0, -2.15);
    this.catPos = new THREE.Vector3(-2.65, 0, -1.55);
    this.teaTablePos = new THREE.Vector3(1.15, 0, 0.75);
    this.stovePos = new THREE.Vector3(5.05, 0, -2.15);
    this.giftPilePos = new THREE.Vector3(1.8, 0, -2.28);
    this.cakePos = new THREE.Vector3(4.55, 0, 0.92);

    // Birthday cake state
    this.cakeCandleCount = THREE.MathUtils.clamp(Math.round(options.cakeCandles || 1), 1, 12);
    this.cakeFlames = [];
    this.cakeHitMeshes = [];
    this.cakeSmoke = [];
    this.cakeLit = true;
    this.cakeHovered = false;
    this.cakeLight = null;
    this.cakeSlices = 0;

    this.fireBoost = 1.0;
    this.catHappyTimer = 0;
    this.giftOpened = false;
    this.giftHovered = false;

    // Animated references
    this.hearthFlames = [];
    this.emberChunks = [];
    this.hearthSparks = [];
    this.candleFlames = [];
    this.steamWisps = [];
    this.soupBubbles = [];
    this.sunShaftMaterials = [];
    this.floorGlowMaterials = [];
    this.vistaTrees = [];
    this.vistaLampMats = [];
    this.vistaLampLights = [];
    this.giftHitMeshes = [];
    this.giftSparkles = [];
    this.giftConfetti = [];
    this.letterHitMeshes = [];
    this.letterSparkle = null;
    this.letterHovered = false;
    this.treeLightMats = [];
    this.clockPendulum = null;
    this.heroGiftLid = null;
    this.hearthGlowSprite = null;

    this._buildRoomShellAndWindows();
    this._buildBedroomAndStudy();
    this._buildFireplaceAndLivingArea();
    this._buildKitchenAndDining();
    this._buildEntranceGiftPiles();
    this._buildFestiveDecor();
    this._buildCeilingBeamsAndLighting();
    this._buildOutdoorVista();

    // Fold furniture, logs, books, boards... that never move into fewer merged meshes.
    // Anything the game keeps a handle on (cake, gifts, cat, fire, hover targets) stays as is.
    if (!options.noStaticBatch) {
      const refs = collectReferencedObjects([this], ["group", "scene", "textures", "parent", "colliders"]);
      this.staticBatchStats = batchStaticMeshes(this.group, refs, { name: "interior-static", lockedMaterials: refs.materials });
    }

    // 小屋摆设: furniture the player places (built after batching, so it can come and go)
    this.decorGroup = new THREE.Group();
    this.decorGroup.name = "cottage-decor";
    this.group.add(this.decorGroup);
    this.decorPieces = new Map(); // spotId -> { id, group, tick, collider }
    this.decorMarkers = new Map();
    for (const sp of DECOR_SPOTS) {
      const mk = buildSpotMarker(sp);
      mk.visible = false;
      this.decorGroup.add(mk);
      this.decorMarkers.set(sp.id, mk);
    }
  }

  // placed: { spotId: itemId }. Builds only what changed.
  setDecor(placed = {}) {
    for (const [spotId, piece] of this.decorPieces) {
      if (placed[spotId] === piece.id) continue;
      this.decorGroup.remove(piece.group);
      piece.group.traverse((o) => o.isMesh && o.geometry && o.geometry.dispose());
      if (piece.collider) this.colliders.splice(this.colliders.indexOf(piece.collider), 1);
      this.decorPieces.delete(spotId);
    }
    for (const sp of DECOR_SPOTS) {
      const id = placed[sp.id];
      if (!id || this.decorPieces.has(sp.id)) continue;
      const it = DECOR_ITEMS.find((d) => d.id === id);
      if (!it) continue;
      const { group, tick } = buildDecorModel(id);
      group.position.set(sp.x, 0, sp.z);
      group.rotation.y = sp.rot;
      this.decorGroup.add(group);
      let collider = null;
      if (it.foot) {
        // axis-aligned box around the turned footprint
        const [w, d] = it.foot;
        const c = Math.abs(Math.cos(sp.rot));
        const s = Math.abs(Math.sin(sp.rot));
        const bw = w * c + d * s;
        const bd = w * s + d * c;
        collider = { minX: sp.x - bw / 2, maxX: sp.x + bw / 2, minZ: sp.z - bd / 2, maxZ: sp.z + bd / 2, decor: true };
        this.colliders.push(collider);
      }
      this.decorPieces.set(sp.id, { id, group, tick, collider });
    }
  }

  // Free spots glow softly when the player walks near; placed pieces animate.
  updateDecor(dt, elapsed, px, pz, focusSpot = null) {
    if (!this.group.visible || !this.decorMarkers) return;
    for (const sp of DECOR_SPOTS) {
      const mk = this.decorMarkers.get(sp.id);
      const empty = !this.decorPieces.has(sp.id);
      const d = Math.hypot(px - sp.x, pz - sp.z);
      let target = empty ? THREE.MathUtils.clamp((2.4 - d) / 1.2, 0, 1) * 0.55 : 0;
      if (focusSpot === sp.id) target = Math.max(target, 0.85);
      const u = mk.userData;
      u.o = (u.o || 0) + (target - (u.o || 0)) * Math.min(1, dt * 6);
      u.mat.opacity = u.o * (focusSpot === sp.id ? 0.85 + 0.15 * Math.sin(elapsed * 4) : 1);
      mk.visible = u.o > 0.01;
    }
    for (const p of this.decorPieces.values()) if (p.tick) p.tick(elapsed);
  }

  _addBoxCollider(cx, cz, w, d) {
    this.colliders.push({
      minX: cx - w / 2,
      maxX: cx + w / 2,
      minZ: cz - d / 2,
      maxZ: cz + d / 2,
    });
  }

  resolveMovement(x, z, radius = 0.34) {
    let nx = THREE.MathUtils.clamp(x, this.bounds.minX, this.bounds.maxX);
    let nz = THREE.MathUtils.clamp(z, this.bounds.minZ, this.bounds.maxZ);
    for (const c of this.colliders) {
      const minX = c.minX - radius;
      const maxX = c.maxX + radius;
      const minZ = c.minZ - radius;
      const maxZ = c.maxZ + radius;
      if (nx > minX && nx < maxX && nz > minZ && nz < maxZ) {
        const dl = Math.abs(nx - minX);
        const dr = Math.abs(maxX - nx);
        const dt = Math.abs(nz - minZ);
        const db = Math.abs(maxZ - nz);
        const m = Math.min(dl, dr, dt, db);
        if (m === dl) nx = minX;
        else if (m === dr) nx = maxX;
        else if (m === dt) nz = minZ;
        else nz = maxZ;
      }
    }
    return { x: nx, z: nz };
  }

  _buildRoomShellAndWindows() {
    const floorMat = new THREE.MeshStandardMaterial({ map: this.textures.interiorFloorWide, roughness: 0.84 });
    const wallLongMat = new THREE.MeshStandardMaterial({ map: this.textures.logWallLong, roughness: 0.88 });
    const wallMat = new THREE.MeshStandardMaterial({ map: this.textures.logWall, roughness: 0.88 });
    const darkWood = new THREE.MeshStandardMaterial({ color: 0x4c2914, roughness: 0.9 });
    const trimWood = new THREE.MeshStandardMaterial({ color: 0x6b3e1f, roughness: 0.86 });
    const wainscotMat = new THREE.MeshStandardMaterial({ map: this.textures.woodPlank, color: 0xd9b38a, roughness: 0.88 });
    const snowMat = new THREE.MeshStandardMaterial({ map: this.textures.snowCap, roughness: 0.9 });
    const curtainMat = new THREE.MeshStandardMaterial({ map: this.textures.tableRunner, roughness: 0.92 });
    const brassMat = new THREE.MeshStandardMaterial({ color: 0xd9a845, metalness: 0.65, roughness: 0.35 });
    const glassMat = new THREE.MeshStandardMaterial({
      color: 0xd8eeff,
      transparent: true,
      opacity: 0.13,
      roughness: 0.08,
      metalness: 0.18,
      depthWrite: false,
    });
    const frostMat = new THREE.MeshBasicMaterial({
      color: 0xeef7ff,
      transparent: true,
      opacity: 0.32,
      depthWrite: false,
    });

    const roomW = 13.4;
    const roomD = 6.8;
    const wallH = 3.85;
    const wallT = 0.38;

    // 1. Warm Wide-Plank Timber Floor + Base Perimeter Trim
    const floor = new THREE.Mesh(new THREE.BoxGeometry(roomW + 0.5, 0.28, roomD + 0.5), floorMat);
    floor.position.set(0, -0.14, 0.1);
    floor.receiveShadow = true;
    this.group.add(floor);

    // Subtle dark timber cutaway border around south floor edge + entrance doorway threshold!
    const southBorderL = new THREE.Mesh(new THREE.BoxGeometry(5.6, 0.16, 0.26), darkWood);
    southBorderL.position.set(-3.9, 0.08, 3.48);
    const southBorderR = southBorderL.clone();
    southBorderR.position.x = 3.9;
    this.group.add(southBorderL, southBorderR);

    // Low doorway threshold & cozy woven welcome mat at South center (cleanly proud of timber floor!)
    const threshold = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.08, 0.34), trimWood);
    threshold.position.set(0, 0.042, 3.45);
    this.group.add(threshold);
    const doormat = new THREE.Mesh(
      new THREE.BoxGeometry(1.75, 0.05, 0.85),
      new THREE.MeshStandardMaterial({ color: 0x99592e, roughness: 0.96 })
    );
    doormat.position.set(0, 0.028, 2.95);
    doormat.receiveShadow = true;
    this.group.add(doormat);

    // Corner vertical timber posts framing the room
    for (const cx of [-roomW / 2, roomW / 2]) {
      for (const cz of [-3.3, 3.5]) {
        const col = new THREE.Mesh(new THREE.BoxGeometry(0.46, cz < 0 ? wallH + 0.12 : 1.05, 0.46), darkWood);
        col.position.set(cx, cz < 0 ? wallH / 2 : 0.52, cz);
        col.castShadow = true;
        this.group.add(col);
      }
    }

    // Helper: Add a richly detailed window casing, mullions, drapes, outdoor snow sill & light shaft!
    const buildWindowAssembly = ({ x, z, width, height, bottomY, rotY, bays = 2, hasShaft = true }) => {
      const wg = new THREE.Group();
      wg.position.set(x, bottomY + height / 2, z);
      wg.rotation.y = rotY;

      // Deep inner & outer frame jambs
      const frameD = wallT + 0.12;
      const topFrame = new THREE.Mesh(new THREE.BoxGeometry(width + 0.28, 0.14, frameD), darkWood);
      topFrame.position.y = height / 2 + 0.06;
      const botFrame = new THREE.Mesh(new THREE.BoxGeometry(width + 0.38, 0.14, frameD + 0.24), trimWood);
      botFrame.position.set(0, -height / 2 - 0.06, 0.04);
      botFrame.castShadow = true;
      botFrame.receiveShadow = true;
      wg.add(topFrame, botFrame);

      for (const sgn of [-1, 1]) {
        const jamb = new THREE.Mesh(new THREE.BoxGeometry(0.14, height + 0.12, frameD), darkWood);
        jamb.position.x = sgn * (width / 2 + 0.06);
        wg.add(jamb);
      }

      // Snow piled cleanly on the EXTERIOR sill (visible right through the glass!)
      const extSnow = new THREE.Mesh(new THREE.BoxGeometry(width + 0.14, 0.16, 0.26), snowMat);
      extSnow.position.set(0, -height / 2 + 0.06, -wallT / 2 - 0.08);
      wg.add(extSnow);

      // Delicate translucent icicles hanging just outside the top window lintel!
      const icicleMat = new THREE.MeshStandardMaterial({
        color: 0xdff5ff,
        roughness: 0.12,
        metalness: 0.12,
        transparent: true,
        opacity: 0.78,
      });
      const icCount = Math.max(4, Math.round(width * 2.2));
      for (let ic = 0; ic < icCount; ic++) {
        const ih = 0.16 + ((ic * 7) % 3) * 0.09;
        const ix = THREE.MathUtils.lerp(-width * 0.44, width * 0.44, ic / (icCount - 1));
        const icicle = new THREE.Mesh(new THREE.ConeGeometry(0.036, ih, 4), icicleMat);
        icicle.rotation.x = Math.PI;
        icicle.position.set(ix, height / 2 - ih * 0.48, -wallT / 2 - 0.07);
        wg.add(icicle);
      }

      // Slim 3D wooden mullions
      for (let b = 1; b < bays; b++) {
        const mx = -width / 2 + (width * b) / bays;
        const mv = new THREE.Mesh(new THREE.BoxGeometry(0.065, height, 0.07), darkWood);
        mv.position.x = mx;
        wg.add(mv);
      }
      const mh = new THREE.Mesh(new THREE.BoxGeometry(width, 0.065, 0.07), darkWood);
      mh.position.y = height * 0.14;
      wg.add(mh);

      // Subtle translucent glass + corner frost wisps
      const glass = new THREE.Mesh(new THREE.PlaneGeometry(width - 0.04, height - 0.04), glassMat);
      wg.add(glass);
      for (const sgn of [-1, 1]) {
        const fCorner = new THREE.Mesh(new THREE.PlaneGeometry(0.32, 0.28), frostMat);
        fCorner.position.set(sgn * (width / 2 - 0.18), -height / 2 + 0.16, 0.01);
        wg.add(fCorner);
      }

      // Brass curtain rod + cozy pulled-back gingham curtains on interior side!
      const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, width + 0.72, 6), brassMat);
      rod.rotation.z = Math.PI / 2;
      rod.position.set(0, height / 2 + 0.22, wallT / 2 + 0.1);
      wg.add(rod);
      for (const sgn of [-1, 1]) {
        const fin = new THREE.Mesh(new THREE.SphereGeometry(0.055, 6, 5), brassMat);
        fin.position.set(sgn * (width / 2 + 0.38), height / 2 + 0.22, wallT / 2 + 0.1);
        wg.add(fin);

        // Upper drape fold
        const drapeTop = new THREE.Mesh(new THREE.BoxGeometry(0.36, height * 0.62, 0.1), curtainMat);
        drapeTop.position.set(sgn * (width / 2 + 0.06), height * 0.2, wallT / 2 + 0.08);
        drapeTop.rotation.z = sgn * 0.07;
        drapeTop.castShadow = true;
        wg.add(drapeTop);
        // Lower flare below tie-back
        const drapeBot = new THREE.Mesh(new THREE.BoxGeometry(0.32, height * 0.44, 0.1), curtainMat);
        drapeBot.position.set(sgn * (width / 2 + 0.12), -height * 0.3, wallT / 2 + 0.08);
        drapeBot.rotation.z = -sgn * 0.08;
        wg.add(drapeBot);
        // Gold tie-back ribbon
        const tie = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.06, 0.12), brassMat);
        tie.position.set(sgn * (width / 2 + 0.09), -height * 0.08, wallT / 2 + 0.09);
        wg.add(tie);
      }

      // Tiny potted winter herb & ceramic teacup perched on inner sill
      const pot = new THREE.Mesh(
        new THREE.CylinderGeometry(0.09, 0.07, 0.14, 7),
        new THREE.MeshStandardMaterial({ color: 0xb55a36, roughness: 0.85 })
      );
      pot.position.set(-width * 0.28, -height / 2 + 0.08, wallT / 2 + 0.04);
      const herb = new THREE.Mesh(new THREE.DodecahedronGeometry(0.11, 0), new THREE.MeshStandardMaterial({ color: 0x3b7a46 }));
      herb.position.set(-width * 0.28, -height / 2 + 0.2, wallT / 2 + 0.04);
      wg.add(pot, herb);

      // Slanted soft-feathered volumetric window light shaft & floor glow pool!
      if (hasShaft) {
        const shaftMat = new THREE.MeshBasicMaterial({
          color: 0xffd28a,
          map: this.textures.lightShaftSoft,
          transparent: true,
          opacity: 0.16,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          side: THREE.DoubleSide,
        });
        this.sunShaftMaterials.push(shaftMat);

        const shaft = new THREE.Mesh(new THREE.PlaneGeometry(width * 1.05, 3.05), shaftMat);
        shaft.position.set(0, -height * 0.36, 1.36);
        shaft.rotation.x = -0.68;
        wg.add(shaft);

        const floorPoolMat = new THREE.MeshBasicMaterial({
          color: 0xffd699,
          map: this.textures.lightShaftSoft,
          transparent: true,
          opacity: 0.22,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        });
        this.floorGlowMaterials.push(floorPoolMat);

        const pool = new THREE.Mesh(new THREE.PlaneGeometry(width * 1.15, 2.15), floorPoolMat);
        pool.rotation.x = -Math.PI / 2;
        pool.position.set(0, -(bottomY + height / 2) + 0.025, 1.55);
        wg.add(pool);
      }

      this.group.add(wg);
    };

    // 2. NORTH WALL (z = -3.3, X in [-6.7, +6.7]) with TWO ENLARGED TRUE CUT-OUT WINDOWS!
    // Opening 1 (NW Study Window): x in [-5.35, -3.05], y in [1.05, 2.95] (2.30 x 1.90)
    // Opening 2 (NE Grand Panoramic Picture Window): x in [0.15, 3.55], y in [1.00, 2.95] (3.40 x 1.95!)
    const addNorthBlock = (x1, x2, y1, y2, mat = wallMat) => {
      const w = x2 - x1;
      const h = y2 - y1;
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, wallT), mat);
      m.position.set((x1 + x2) / 2, (y1 + y2) / 2, -3.3);
      m.receiveShadow = true;
      m.castShadow = true;
      this.group.add(m);
    };
    // Solid full-height piers
    addNorthBlock(-6.7, -5.35, 0, wallH, wallMat);
    addNorthBlock(-3.05, 0.15, 0, wallH, wallMat);
    addNorthBlock(3.55, 6.7, 0, wallH, wallMat);
    // Spandrels (under windows) & Lintels (above windows)
    addNorthBlock(-5.35, -3.05, 0, 1.05, wainscotMat);
    addNorthBlock(-5.35, -3.05, 2.95, wallH, wallMat);
    addNorthBlock(0.15, 3.55, 0, 1.0, wainscotMat);
    addNorthBlock(0.15, 3.55, 2.95, wallH, wallMat);

    // North baseboard & dado rail trim along full length
    const baseN = new THREE.Mesh(new THREE.BoxGeometry(roomW, 0.18, 0.08), darkWood);
    baseN.position.set(0, 0.09, -3.09);
    this.group.add(baseN);

    buildWindowAssembly({ x: -4.2, z: -3.3, width: 2.3, height: 1.9, bottomY: 1.05, rotY: 0, bays: 2 });
    buildWindowAssembly({ x: 1.85, z: -3.3, width: 3.4, height: 1.95, bottomY: 1.0, rotY: 0, bays: 3 });

    // 3. WEST WALL (x = -6.7, Z in [-3.3, +3.5]) with LARGE BEDROOM WINDOW!
    // Opening: z in [-1.15, +1.25], y in [1.05, 2.90] (2.40 x 1.85)
    const addSideBlock = (wallX, z1, z2, y1, y2, mat = wallMat) => {
      const d = z2 - z1;
      const h = y2 - y1;
      const m = new THREE.Mesh(new THREE.BoxGeometry(wallT, h, d), mat);
      m.position.set(wallX, (y1 + y2) / 2, (z1 + z2) / 2);
      m.receiveShadow = true;
      m.castShadow = true;
      this.group.add(m);
    };
    addSideBlock(-6.7, -3.3, -1.15, 0, wallH, wallMat);
    addSideBlock(-6.7, 1.25, 3.5, 0, wallH, wallMat);
    addSideBlock(-6.7, -1.15, 1.25, 0, 1.05, wainscotMat);
    addSideBlock(-6.7, -1.15, 1.25, 2.9, wallH, wallMat);
    buildWindowAssembly({ x: -6.7, z: 0.05, width: 2.4, height: 1.85, bottomY: 1.05, rotY: Math.PI / 2, bays: 2 });

    // 4. EAST WALL (x = +6.7, Z in [-3.3, +3.5]) with LARGE DINING WINDOW!
    // Opening: z in [-0.45, +2.05], y in [1.05, 2.90] (2.50 x 1.85)
    addSideBlock(6.7, -3.3, -0.45, 0, wallH, wallMat);
    addSideBlock(6.7, 2.05, 3.5, 0, wallH, wallMat);
    addSideBlock(6.7, -0.45, 2.05, 0, 1.05, wainscotMat);
    addSideBlock(6.7, -0.45, 2.05, 2.9, wallH, wallMat);
    buildWindowAssembly({ x: 6.7, z: 0.8, width: 2.5, height: 1.85, bottomY: 1.05, rotY: -Math.PI / 2, bays: 2 });

    // Side baseboards
    for (const sx of [-6.49, 6.49]) {
      const sb = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.18, roomD), darkWood);
      sb.position.set(sx, 0.09, 0.1);
      this.group.add(sb);
    }

    // Subtle exterior roof eave cap crowning the cutaway walls
    const capN = new THREE.Mesh(new THREE.BoxGeometry(roomW + 0.65, 0.18, 0.62), darkWood);
    capN.position.set(0, wallH + 0.09, -3.3);
    this.group.add(capN);
  }

  _buildBedroomAndStudy() {
    const darkWood = new THREE.MeshStandardMaterial({ color: 0x4c2914, roughness: 0.9 });
    const plankMat = new THREE.MeshStandardMaterial({ map: this.textures.woodPlank, roughness: 0.84 });
    const quiltMat = new THREE.MeshStandardMaterial({ map: this.textures.quiltPatch, roughness: 0.92 });
    const linenMat = new THREE.MeshStandardMaterial({ color: 0xfbf3e2, roughness: 0.9 });
    const greenCloth = new THREE.MeshStandardMaterial({ color: 0x34664b, roughness: 0.9 });
    const brassMat = new THREE.MeshStandardMaterial({ color: 0xdfb14c, metalness: 0.6, roughness: 0.35 });

    // 1. Cozy Braided Bedside Rug (3mm proud of floor — zero Z-fighting!)
    const bedRug = new THREE.Mesh(
      new THREE.CylinderGeometry(1.15, 1.15, 0.03, 14),
      new THREE.MeshStandardMaterial({ color: 0x527a66, roughness: 0.95 })
    );
    bedRug.scale.set(0.95, 1, 1.45);
    bedRug.position.set(-4.35, 0.018, 1.3);
    bedRug.receiveShadow = true;
    this.group.add(bedRug);

    // 2. Four-Post Carved Timber Bed (zero coplanar faces between posts, rails, headboard, footboard & mattress!)
    const bed = new THREE.Group();
    bed.position.set(-5.35, 0, 1.45);

    // Core bed base sitting strictly between the four corner posts (x: ±0.765, z: ±1.075, y: 0.07..0.43)
    const frame = new THREE.Mesh(new THREE.BoxGeometry(1.53, 0.36, 2.15), darkWood);
    frame.position.y = 0.25;
    frame.castShadow = true;
    bed.add(frame);

    // Side rails cleanly flush between head & foot posts (z: ±1.075)
    for (const sx of [-0.82, 0.82]) {
      const sideRail = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.26, 2.15), darkWood);
      sideRail.position.set(sx, 0.27, 0);
      sideRail.castShadow = true;
      bed.add(sideRail);
    }

    // Four carved corner bedposts (x: ±0.77..±0.91, z: ±1.08..±1.22)
    for (const [px, pz, h] of [[-0.84, -1.15, 1.25], [0.84, -1.15, 1.25], [-0.84, 1.15, 0.82], [0.84, 1.15, 0.82]]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.14, h, 0.14), darkWood);
      post.position.set(px, h / 2, pz);
      post.castShadow = true;
      bed.add(post);
      const knob = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), brassMat);
      knob.position.set(px, h + 0.04, pz);
      bed.add(knob);
    }

    // Headboard & footboard fit STRICTLY between corner posts (x: ±0.765) and ABOVE frame (y >= 0.432) — zero coplanar lines!
    const headboard = new THREE.Mesh(new THREE.BoxGeometry(1.52, 0.72, 0.095), plankMat);
    headboard.position.set(0, 0.792, -1.15);
    headboard.castShadow = true;
    bed.add(headboard);
    const headRailTop = new THREE.Mesh(new THREE.BoxGeometry(1.53, 0.07, 0.12), darkWood);
    headRailTop.position.set(0, 1.185, -1.15);
    bed.add(headRailTop);

    const footboard = new THREE.Mesh(new THREE.BoxGeometry(1.52, 0.34, 0.09), plankMat);
    footboard.position.set(0, 0.602, 1.15);
    footboard.castShadow = true;
    bed.add(footboard);
    const footRailTop = new THREE.Mesh(new THREE.BoxGeometry(1.53, 0.06, 0.115), darkWood);
    footRailTop.position.set(0, 0.79, 1.15);
    bed.add(footRailTop);

    // Mattress + Twin Plump Pillows + Patchwork Quilt + Folded Emerald Throw (non-overlapping vertical/depth bounds!)
    const mattress = new THREE.Mesh(new THREE.BoxGeometry(1.56, 0.19, 2.12), linenMat);
    mattress.position.y = 0.528; // y: 0.433..0.623, z: -1.06..+1.06 (4cm clear of head & foot boards!)
    mattress.receiveShadow = true;
    bed.add(mattress);

    for (const px of [-0.37, 0.37]) {
      const pillow = new THREE.Mesh(new THREE.BoxGeometry(0.64, 0.16, 0.44), linenMat);
      pillow.position.set(px, 0.705, -0.76);
      pillow.rotation.x = 0.16;
      pillow.castShadow = true;
      bed.add(pillow);
    }
    const quilt = new THREE.Mesh(new THREE.BoxGeometry(1.66, 0.18, 1.46), quiltMat);
    quilt.position.set(0, 0.585, 0.25); // top 0.675, ends z=+0.98
    quilt.castShadow = true;
    quilt.receiveShadow = true;
    bed.add(quilt);
    const foldThrow = new THREE.Mesh(new THREE.BoxGeometry(1.72, 0.09, 0.42), greenCloth);
    foldThrow.position.set(0, 0.68, 0.74); // cleanly proud above quilt top 0.675
    bed.add(foldThrow);

    this.group.add(bed);
    this._addBoxCollider(-5.35, 1.45, 1.85, 2.48);

    // 3. Bedside Nightstand with Glowing Warm Brass Lamp & Alarm Clock
    const stand = new THREE.Group();
    stand.position.set(-5.9, 0, -0.35);
    const sBody = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.68, 0.72), plankMat);
    sBody.position.y = 0.34;
    sBody.castShadow = true;
    stand.add(sBody);
    const lampBase = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 0.26, 7), brassMat);
    lampBase.position.set(0, 0.81, -0.05);
    stand.add(lampBase);
    const shade = new THREE.Mesh(
      new THREE.CylinderGeometry(0.14, 0.24, 0.24, 8),
      new THREE.MeshStandardMaterial({ color: 0xffe6a6, emissive: 0xffb347, emissiveIntensity: 0.95, roughness: 0.4 })
    );
    shade.position.set(0, 1.04, -0.05);
    stand.add(shade);
    const lampPt = new THREE.PointLight(0xffbb66, 1.4, 5.5, 1.5);
    lampPt.position.set(0.15, 1.15, 0);
    stand.add(lampPt);
    this.group.add(stand);
    this._addBoxCollider(-5.9, -0.35, 0.82, 0.82);

    // 4. Tall Timber Bookshelf in North-West Corner
    const shelf = new THREE.Group();
    shelf.position.set(-5.92, 0, -2.55);
    const sCase = new THREE.Mesh(new THREE.BoxGeometry(1.15, 2.35, 0.56), darkWood);
    sCase.position.y = 1.175;
    sCase.castShadow = true;
    shelf.add(sCase);
    const booksFace = new THREE.Mesh(
      new THREE.PlaneGeometry(0.98, 2.02),
      new THREE.MeshStandardMaterial({ map: this.textures.bookShelf, roughness: 0.88 })
    );
    booksFace.position.set(0, 1.18, 0.29);
    shelf.add(booksFace);
    // Ceramic pitcher sitting atop bookshelf
    const jug = new THREE.Mesh(
      new THREE.CylinderGeometry(0.11, 0.14, 0.28, 7),
      new THREE.MeshStandardMaterial({ color: 0x5d82a3, roughness: 0.45 })
    );
    jug.position.set(-0.22, 2.48, 0);
    shelf.add(jug);
    this.group.add(shelf);
    this._addBoxCollider(-5.92, -2.55, 1.22, 0.66);

    // 5. Study Writing Desk & Wooden Chair under the Large North-West Window!
    const desk = new THREE.Group();
    desk.position.set(-4.15, 0, -2.52);
    const dTop = new THREE.Mesh(new THREE.BoxGeometry(1.85, 0.1, 0.84), plankMat);
    dTop.position.y = 0.78;
    dTop.castShadow = true;
    desk.add(dTop);
    for (const lx of [-0.82, 0.82]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.78, 0.76), darkWood);
      leg.position.set(lx, 0.39, 0);
      desk.add(leg);
    }
    const drawer = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.48, 0.7), darkWood);
    drawer.position.set(0.5, 0.48, 0);
    desk.add(drawer);

    // Wax-Sealed Winter Letter (火漆信封) + Feather Quill + Brass Inkwell + Desk Candle!
    const letterGroup = new THREE.Group();
    letterGroup.position.set(-0.14, 0.832, 0.05);
    letterGroup.rotation.y = 0.14;

    const envPaperMat = new THREE.MeshStandardMaterial({ color: 0xfbf2dc, roughness: 0.82 });
    const envFlapMat = new THREE.MeshStandardMaterial({ color: 0xf1e2be, roughness: 0.85 });
    const waxMat = new THREE.MeshStandardMaterial({ color: 0xb82722, roughness: 0.35, metalness: 0.12 });

    const envBody = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.024, 0.31), envPaperMat);
    envBody.position.y = 0.012;
    envBody.castShadow = true;
    envBody.userData.isLetter = true;
    letterGroup.add(envBody);
    this.letterHitMeshes.push(envBody);

    // Triangular folded envelope flap sitting cleanly atop the envelope body (zero Z-fighting!)
    const envFlap = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.01, 3), envFlapMat);
    envFlap.scale.set(1.38, 1.0, 0.82);
    envFlap.position.set(0, 0.03, -0.05);
    envFlap.userData.isLetter = true;
    letterGroup.add(envFlap);
    this.letterHitMeshes.push(envFlap);

    // Crimson Wax Seal + Tiny Gold Stamp Emblem!
    const waxSeal = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.058, 0.016, 10), waxMat);
    waxSeal.position.set(0, 0.043, 0.015);
    waxSeal.userData.isLetter = true;
    const waxDot = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.008, 8), brassMat);
    waxDot.position.set(0, 0.054, 0.015);
    letterGroup.add(waxSeal, waxDot);
    this.letterHitMeshes.push(waxSeal);

    // Delicate floating golden sparkle above the wax-sealed letter!
    const lSpark = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.065, 0),
      new THREE.MeshBasicMaterial({ color: 0xffe882 })
    );
    lSpark.position.set(0, 0.28, 0.02);
    lSpark.userData.isLetter = true;
    letterGroup.add(lSpark);
    this.letterHitMeshes.push(lSpark);
    this.letterSparkle = lSpark;

    // Slightly wider transparent click volume so clicking the envelope from 3/4 view feels effortless
    const letterHitBox = new THREE.Mesh(
      new THREE.BoxGeometry(0.68, 0.28, 0.48),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })
    );
    letterHitBox.position.set(0, 0.14, 0);
    letterHitBox.userData.isLetter = true;
    letterGroup.add(letterHitBox);
    this.letterHitMeshes.push(letterHitBox);

    desk.add(letterGroup);

    const inkwell = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.09, 6), new THREE.MeshStandardMaterial({ color: 0x262933 }));
    inkwell.position.set(0.24, 0.87, -0.08);
    desk.add(inkwell);
    const quill = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.34, 0.07), linenMat);
    quill.position.set(0.29, 1.0, -0.08);
    quill.rotation.z = -0.35;
    desk.add(quill);

    // Stacked leather books
    const b1 = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.08, 0.34), new THREE.MeshStandardMaterial({ color: 0x8f2d28 }));
    b1.position.set(-0.62, 0.87, -0.1);
    const b2 = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.07, 0.3), new THREE.MeshStandardMaterial({ color: 0x2e5e41 }));
    b2.position.set(-0.6, 0.94, -0.12);
    b2.rotation.y = 0.2;
    desk.add(b1, b2);

    // Desk candle
    const dCandle = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.2, 6), linenMat);
    dCandle.position.set(0.62, 0.93, -0.14);
    desk.add(dCandle);
    const dFlame = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.09, 0.05), new THREE.MeshBasicMaterial({ color: 0xffd55a }));
    dFlame.position.set(0.62, 1.07, -0.14);
    desk.add(dFlame);
    this.candleFlames.push({ mesh: dFlame, baseY: 1.07, phase: 0.8 });

    // Wooden Study Chair tucked gently in front of desk
    const chair = this._makeWoodenChair(plankMat, darkWood);
    chair.position.set(-0.1, 0, 0.65);
    chair.rotation.y = Math.PI + 0.18;
    desk.add(chair);

    this.group.add(desk);
    this._addBoxCollider(-4.15, -2.4, 1.92, 1.2);
  }

  _makeWoodenChair(plankMat, darkWood) {
    const c = new THREE.Group();
    const slatWood = new THREE.MeshStandardMaterial({ color: 0x8f562c, roughness: 0.86 });
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.07, 0.52), plankMat);
    seat.position.y = 0.46;
    seat.castShadow = true;
    c.add(seat);
    for (const lx of [-0.21, 0.21]) {
      for (const lz of [-0.21, 0.21]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.425, 0.07), darkWood);
        leg.position.set(lx, 0.2125, lz);
        c.add(leg);
      }
      const backPost = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.56, 0.07), darkWood);
      backPost.position.set(lx, 0.775, -0.21);
      c.add(backPost);
    }
    // Slats fit cleanly BETWEEN the two posts (x in [-0.175, +0.175]) with zero coplanar overlap!
    for (const ry of [0.71, 0.94]) {
      const slat = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.09, 0.045), slatWood);
      slat.position.set(0, ry, -0.21);
      c.add(slat);
    }
    return c;
  }

  _buildFireplaceAndLivingArea() {
    const stoneMat = new THREE.MeshStandardMaterial({ map: this.textures.stoneWall, roughness: 0.92 });
    const stoneTallMat = new THREE.MeshStandardMaterial({ map: this.textures.stoneWallTall, roughness: 0.92 });
    const brickMat = new THREE.MeshStandardMaterial({ map: this.textures.brickChimney, roughness: 0.92 });
    const darkWood = new THREE.MeshStandardMaterial({ color: 0x4c2914, roughness: 0.9 });
    const plankMat = new THREE.MeshStandardMaterial({ map: this.textures.woodPlank, roughness: 0.85 });
    const barkMat = new THREE.MeshStandardMaterial({ map: this.textures.bark, roughness: 0.92 });
    const ironMat = new THREE.MeshStandardMaterial({ color: 0x262930, metalness: 0.6, roughness: 0.5 });
    const brassMat = new THREE.MeshStandardMaterial({ color: 0xe3b84c, metalness: 0.6, roughness: 0.35 });
    const sofaMat = new THREE.MeshStandardMaterial({ color: 0x8f342d, roughness: 0.9 });
    const cushionMat = new THREE.MeshStandardMaterial({ color: 0xe8c47a, roughness: 0.88 });
    const pineMat = new THREE.MeshStandardMaterial({ color: 0x275e3c, roughness: 0.9 });
    const berryMat = new THREE.MeshStandardMaterial({ color: 0xd93832, roughness: 0.55 });

    // 1. Grand Stepped Stone Fireplace (centered at x = -1.45, z = -2.75)
    const fp = new THREE.Group();
    fp.position.set(-1.45, 0, -2.75);

    const hearthSlab = new THREE.Mesh(new THREE.BoxGeometry(2.55, 0.22, 1.18), stoneMat);
    hearthSlab.position.y = 0.11;
    hearthSlab.receiveShadow = true;
    fp.add(hearthSlab);

    // Split stone fireplace surround cleanly around the recessed brick firebox (zero overlapping front faces!)
    const fpBackBlock = new THREE.Mesh(new THREE.BoxGeometry(2.22, 1.4, 0.46), stoneMat);
    fpBackBlock.position.set(0, 0.92, -0.18);
    fpBackBlock.castShadow = true;
    fp.add(fpBackBlock);
    for (const sgn of [-1, 1]) {
      const fpPier = new THREE.Mesh(new THREE.BoxGeometry(0.48, 1.4, 0.42), stoneMat);
      fpPier.position.set(sgn * 0.87, 0.92, 0.26);
      fpPier.castShadow = true;
      fp.add(fpPier);
    }
    const fpHeader = new THREE.Mesh(new THREE.BoxGeometry(1.26, 0.36, 0.42), stoneMat);
    fpHeader.position.set(0, 1.44, 0.26);
    fp.add(fpHeader);

    // Tapered upper chimney breast rising to ceiling (crisp stone courses!)
    const upperBreast = new THREE.Mesh(new THREE.BoxGeometry(1.75, 2.25, 0.68), stoneTallMat);
    upperBreast.position.set(0, 2.74, -0.18);
    upperBreast.castShadow = true;
    fp.add(upperBreast);

    // Sculpted 3D Recessed Firebox Chamber: soot firebrick back wall, angled masonry side cheeks, iron lintel & andirons!
    const sootBrickMat = new THREE.MeshStandardMaterial({
      map: this.textures.brickChimney,
      color: 0x5c362c,
      emissive: 0x3b1204,
      emissiveIntensity: 0.55,
      roughness: 0.96,
    });
    const fireChamberBack = new THREE.Mesh(new THREE.BoxGeometry(1.22, 1.04, 0.08), sootBrickMat);
    fireChamberBack.position.set(0, 0.74, 0.09);
    fp.add(fireChamberBack);

    const fireChamberTop = new THREE.Mesh(new THREE.BoxGeometry(1.24, 0.08, 0.34), ironMat);
    fireChamberTop.position.set(0, 1.24, 0.28);
    fp.add(fireChamberTop);

    for (const sgn of [-1, 1]) {
      const cheek = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.0, 0.32), sootBrickMat);
      cheek.position.set(sgn * 0.56, 0.73, 0.26);
      cheek.rotation.y = -sgn * 0.16;
      fp.add(cheek);

      // Wrought-iron andiron log cradle stand
      const andironPost = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.042, 0.38, 6), ironMat);
      andironPost.position.set(sgn * 0.36, 0.4, 0.48);
      const andironBall = new THREE.Mesh(new THREE.SphereGeometry(0.055, 6, 5), brassMat);
      andironBall.position.set(sgn * 0.36, 0.61, 0.48);
      const andironBar = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.3), ironMat);
      andironBar.position.set(sgn * 0.36, 0.29, 0.36);
      fp.add(andironPost, andironBall, andironBar);
    }

    // Low decorative hearth fender rail
    const fender = new THREE.Mesh(new THREE.BoxGeometry(1.18, 0.045, 0.045), ironMat);
    fender.position.set(0, 0.27, 0.52);
    fp.add(fender);

    // Multi-Chunk Pulsing Charcoal & Glowing Ember Bed (14 irregular embers!)
    const ashBase = new THREE.Mesh(
      new THREE.CylinderGeometry(0.46, 0.52, 0.08, 10),
      new THREE.MeshStandardMaterial({ color: 0x291a16, emissive: 0x6b1a06, emissiveIntensity: 0.7, roughness: 0.98 })
    );
    ashBase.position.set(0, 0.25, 0.37);
    fp.add(ashBase);

    const emberColors = [0xff4a12, 0xff771c, 0xd42c0c, 0xffa630];
    for (let e = 0; e < 14; e++) {
      const a = (e / 14) * Math.PI * 2 + (e % 3) * 0.3;
      const rad = 0.08 + ((e * 17) % 10) * 0.036;
      const eMat = new THREE.MeshStandardMaterial({
        color: emberColors[e % emberColors.length],
        emissive: emberColors[e % emberColors.length],
        emissiveIntensity: 1.4,
        roughness: 0.85,
      });
      const chunk = new THREE.Mesh(new THREE.DodecahedronGeometry(0.055 + (e % 3) * 0.018, 0), eMat);
      chunk.scale.set(1.2, 0.68, 1.0);
      chunk.position.set(Math.cos(a) * rad * 1.15, 0.29 + (e % 2) * 0.025, 0.37 + Math.sin(a) * rad * 0.42);
      fp.add(chunk);
      this.emberChunks.push({ mat: eMat, phase: e * 0.92 });
    }

    // Crossed Charred Split Firewood Logs resting on the iron andirons
    const charredMat = new THREE.MeshStandardMaterial({
      map: this.textures.bark,
      color: 0x3b261d,
      emissive: 0x611d05,
      emissiveIntensity: 0.45,
      roughness: 0.95,
    });
    const logSpecs = [
      { x: -0.14, y: 0.35, z: 0.38, len: 0.68, ry: 0.32, rz: Math.PI / 2 - 0.14 },
      { x: 0.16, y: 0.36, z: 0.39, len: 0.66, ry: -0.36, rz: Math.PI / 2 + 0.15 },
      { x: 0.0, y: 0.44, z: 0.36, len: 0.56, ry: 0.1, rz: Math.PI / 2 - 0.22 },
      { x: -0.05, y: 0.33, z: 0.44, len: 0.52, ry: -0.12, rz: Math.PI / 2 },
    ];
    for (const ls of logSpecs) {
      const log = new THREE.Mesh(new THREE.CylinderGeometry(0.068, 0.078, ls.len, 6), charredMat);
      log.position.set(ls.x, ls.y, ls.z);
      log.rotation.set(0, ls.ry, ls.rz);
      fp.add(log);
    }

    // Thick Carved Timber Mantel + Corbels + Winter Garland + Framed Winterfoot Painting + Candles!
    const mantel = new THREE.Mesh(new THREE.BoxGeometry(2.45, 0.18, 0.98), darkWood);
    mantel.position.set(0, 1.62, 0.02);
    mantel.castShadow = true;
    fp.add(mantel);

    for (const sx of [-0.88, 0.88]) {
      const corbel = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.28, 0.28), darkWood);
      corbel.position.set(sx, 1.42, 0.36);
      fp.add(corbel);
      // Brass candlestick on mantel
      const holder = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.09, 0.12, 6), brassMat);
      holder.position.set(sx, 1.77, 0.3);
      const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, 0.2, 6), new THREE.MeshStandardMaterial({ color: 0xfbf2d8 }));
      stick.position.set(sx, 1.92, 0.3);
      const fl = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.09, 0.05), new THREE.MeshBasicMaterial({ color: 0xffd557 }));
      fl.position.set(sx, 2.06, 0.3);
      fp.add(holder, stick, fl);
      this.candleFlames.push({ mesh: fl, baseY: 2.06, phase: sx * 2.1 });
    }

    // Evergreen garland with crimson berries draped across mantel
    for (let i = -4; i <= 4; i++) {
      const leaf = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.12, 0.12), pineMat);
      leaf.position.set(i * 0.24, 1.56 - Math.cos((i / 4) * Math.PI * 0.5) * 0.08, 0.5);
      fp.add(leaf);
      if (i % 2 === 0) {
        const b = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 0.07), berryMat);
        b.position.set(i * 0.24, 1.54, 0.56);
        fp.add(b);
      }
    }

    // Framed Pixel-Art Winterfoot Painting above the fireplace!
    const pFrame = new THREE.Mesh(new THREE.BoxGeometry(1.32, 0.92, 0.09), darkWood);
    pFrame.position.set(0, 2.52, 0.18);
    fp.add(pFrame);
    const pArt = new THREE.Mesh(
      new THREE.PlaneGeometry(1.14, 0.74),
      new THREE.MeshStandardMaterial({ map: this.textures.paintingSnow, roughness: 0.75 })
    );
    pArt.position.set(0, 2.52, 0.23);
    fp.add(pArt);

    // Woven Firewood Basket & Iron Poker Stand flanking hearth
    const basket = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.22, 0.38, 8), plankMat);
    basket.position.set(1.24, 0.2, 0.32);
    fp.add(basket);
    for (let k = 0; k < 3; k++) {
      const fLog = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.38, 6), barkMat);
      fLog.position.set(1.18 + k * 0.06, 0.4, 0.32);
      fLog.rotation.z = (k - 1) * 0.22;
      fp.add(fLog);
    }
    const toolStand = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.1, 0.74, 6), ironMat);
    toolStand.position.set(-1.18, 0.38, 0.32);
    fp.add(toolStand);

    // Sculpted Organic Multi-Tongue Tapered Flames (14 layered tongues + soft radial glow halo + rising sparks!)
    const flameDefs = [
      // Outer deep crimson-orange licking tips
      { x: -0.3, z: 0.37, r: 0.11, h: 0.42, color: 0xeb4610, tilt: 0.18, speed: 9.5, phase: 0.2, op: 0.92 },
      { x: -0.18, z: 0.35, r: 0.13, h: 0.56, color: 0xff5a14, tilt: 0.08, speed: 10.8, phase: 1.1, op: 0.94 },
      { x: -0.02, z: 0.34, r: 0.15, h: 0.66, color: 0xff6218, tilt: -0.04, speed: 11.4, phase: 2.3, op: 0.95 },
      { x: 0.16, z: 0.35, r: 0.13, h: 0.54, color: 0xff5a14, tilt: -0.1, speed: 10.2, phase: 3.1, op: 0.94 },
      { x: 0.29, z: 0.38, r: 0.105, h: 0.39, color: 0xe84410, tilt: -0.2, speed: 9.8, phase: 4.0, op: 0.92 },
      // Mid vibrant amber-tangerine tongues
      { x: -0.22, z: 0.4, r: 0.095, h: 0.38, color: 0xff8c1f, tilt: 0.12, speed: 12.6, phase: 0.8, op: 0.94 },
      { x: -0.09, z: 0.39, r: 0.115, h: 0.52, color: 0xff9b26, tilt: 0.04, speed: 13.4, phase: 1.9, op: 0.95 },
      { x: 0.07, z: 0.39, r: 0.12, h: 0.5, color: 0xff9824, tilt: -0.05, speed: 12.8, phase: 2.8, op: 0.95 },
      { x: 0.21, z: 0.4, r: 0.09, h: 0.36, color: 0xff8c1f, tilt: -0.14, speed: 13.0, phase: 3.7, op: 0.94 },
      // Inner hot golden-white core flames
      { x: -0.11, z: 0.42, r: 0.08, h: 0.36, color: 0xffd24a, tilt: 0.06, speed: 15.2, phase: 0.5, op: 0.96 },
      { x: 0.0, z: 0.42, r: 0.095, h: 0.44, color: 0xffe478, tilt: 0.0, speed: 16.0, phase: 1.6, op: 0.98 },
      { x: 0.11, z: 0.42, r: 0.078, h: 0.34, color: 0xffd24a, tilt: -0.06, speed: 14.8, phase: 2.9, op: 0.96 },
      { x: -0.03, z: 0.44, r: 0.065, h: 0.26, color: 0xfff5c2, tilt: 0.02, speed: 17.4, phase: 3.4, op: 0.98 },
      { x: 0.04, z: 0.44, r: 0.06, h: 0.24, color: 0xfff7cc, tilt: -0.02, speed: 18.0, phase: 4.6, op: 0.98 },
    ];
    for (const fd of flameDefs) {
      const geo = new THREE.ConeGeometry(fd.r, fd.h, 5);
      geo.translate(0, fd.h * 0.5, 0); // pivot cleanly at flame base!
      const mat = new THREE.MeshBasicMaterial({
        color: fd.color,
        transparent: true,
        opacity: fd.op,
      });
      const m = new THREE.Mesh(geo, mat);
      m.position.set(fd.x, 0.34, fd.z);
      m.rotation.z = fd.tilt;
      fp.add(m);
      this.hearthFlames.push({ mesh: m, ...fd });
    }

    // Soft additive radial firelight bloom halo inside the hearth!
    const haloMat = new THREE.MeshBasicMaterial({
      map: this.textures.fireGlowSoft,
      transparent: true,
      opacity: 0.72,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.hearthGlowSprite = new THREE.Mesh(new THREE.PlaneGeometry(1.18, 0.92), haloMat);
    this.hearthGlowSprite.position.set(0, 0.64, 0.49);
    fp.add(this.hearthGlowSprite);

    // 12 delicate rising ember sparks drifting up into chimney flue
    for (let i = 0; i < 12; i++) {
      const spMat = new THREE.MeshBasicMaterial({
        color: i % 3 === 0 ? 0xfff0a3 : i % 2 ? 0xffbb38 : 0xff6d1c,
        transparent: true,
        opacity: 0.9,
      });
      const sp = new THREE.Mesh(new THREE.OctahedronGeometry(0.028, 0), spMat);
      sp.position.set((Math.random() - 0.5) * 0.62, 0.42 + Math.random() * 0.65, 0.42);
      fp.add(sp);
      this.hearthSparks.push({
        mesh: sp,
        phase: i * 0.78,
        xOff: (Math.random() - 0.5) * 0.58,
        speed: 0.65 + (i % 4) * 0.14,
      });
    }

    this.hearthLight = new THREE.PointLight(0xff8a34, 4.6, 15.5, 1.3);
    this.hearthLight.position.set(0, 1.15, 1.15);
    if (!this.isMobilePerf) {
      this.hearthLight.castShadow = true;
      this.hearthLight.shadow.mapSize.set(1024, 1024);
      this.hearthLight.shadow.bias = -0.0018;
      this.hearthLight.shadow.normalBias = 0.025;
      this.hearthLight.shadow.radius = 2.8;
    }
    fp.add(this.hearthLight);

    this.group.add(fp);
    this._addBoxCollider(-1.45, -2.55, 2.68, 1.15);

    // 2. Finely Sculpted Sleeping Orange Tabby Cabin Cat ("团子") curled cleanly ON TOP of a plush velvet cat bed!
    const catGroup = new THREE.Group();
    catGroup.position.set(this.catPos.x, 0, this.catPos.z);

    // Quilted emerald velvet cat bed with raised soft bolster rim & cream inner fleece pad (y = 0 .. 0.113)
    const bedOuterMat = new THREE.MeshStandardMaterial({ color: 0x2f6348, roughness: 0.94 });
    const bedRimMat = new THREE.MeshStandardMaterial({ color: 0x3b7b59, roughness: 0.92 });
    const bedFleeceMat = new THREE.MeshStandardMaterial({ color: 0xf6ecd8, roughness: 0.96 });
    const catPadBase = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.49, 0.09, 18), bedOuterMat);
    catPadBase.position.y = 0.045;
    catPadBase.receiveShadow = true;
    const catPadRim = new THREE.Mesh(new THREE.TorusGeometry(0.43, 0.075, 10, 22), bedRimMat);
    catPadRim.rotation.x = Math.PI / 2;
    catPadRim.position.y = 0.095;
    catPadRim.castShadow = true;
    const catPadFleece = new THREE.Mesh(new THREE.CylinderGeometry(0.37, 0.37, 0.03, 16), bedFleeceMat);
    catPadFleece.position.y = 0.098;
    catPadFleece.receiveShadow = true;
    catGroup.add(catPadBase, catPadRim, catPadFleece);

    const catOrange = new THREE.MeshStandardMaterial({ color: 0xea8b38, roughness: 0.84 });
    const catOrangeDeep = new THREE.MeshStandardMaterial({ color: 0xd47124, roughness: 0.86 });
    const catCream = new THREE.MeshStandardMaterial({ color: 0xfcebd0, roughness: 0.86 });
    const catStripe = new THREE.MeshStandardMaterial({ color: 0xa64d14, roughness: 0.88 });
    const catPink = new THREE.MeshStandardMaterial({ color: 0xf29ca8, roughness: 0.78 });
    const catCollar = new THREE.MeshStandardMaterial({ color: 0xc2342e, roughness: 0.8 });
    const catWhiskerMat = new THREE.MeshStandardMaterial({ color: 0xfff8eb, roughness: 0.7 });
    const catEyeMat = new THREE.MeshBasicMaterial({ color: 0x2b180e });

    // Entire cat body sits cleanly ABOVE the fleece pad (base y = 0.115 -> ZERO sinking into cushion!)
    this.catBody = new THREE.Group();
    this.catBody.position.set(0, 0.115, 0);

    // Organic curled "croissant" torso + plump hind haunch + warm shoulder blend + cream chest fluff
    const cTorso = new THREE.Mesh(new THREE.SphereGeometry(0.205, 16, 12), catOrange);
    cTorso.scale.set(1.26, 0.75, 0.94);
    cTorso.position.set(-0.04, 0.148, -0.04);
    cTorso.castShadow = true;
    this.catBody.add(cTorso);

    const cHaunch = new THREE.Mesh(new THREE.SphereGeometry(0.155, 14, 12), catOrangeDeep);
    cHaunch.scale.set(1.06, 0.8, 1.04);
    cHaunch.position.set(-0.155, 0.122, 0.045);
    cHaunch.castShadow = true;
    this.catBody.add(cHaunch);

    const cShoulder = new THREE.Mesh(new THREE.SphereGeometry(0.145, 14, 10), catOrange);
    cShoulder.scale.set(1.02, 0.82, 0.95);
    cShoulder.position.set(0.095, 0.142, -0.015);
    cShoulder.castShadow = true;
    this.catBody.add(cShoulder);

    const cChest = new THREE.Mesh(new THREE.SphereGeometry(0.125, 12, 10), catCream);
    cChest.scale.set(0.96, 0.78, 0.96);
    cChest.position.set(0.13, 0.105, 0.045);
    this.catBody.add(cChest);

    // Smooth curved tabby stripes hugging the dorsal spine cleanly
    for (const [sx, rArc, ang] of [[-0.145, 0.148, 0.14], [-0.045, 0.156, 0.02], [0.055, 0.148, -0.12]]) {
      const st = new THREE.Mesh(new THREE.TorusGeometry(rArc, 0.016, 6, 14, Math.PI * 0.92), catStripe);
      st.position.set(sx, 0.152, -0.035);
      st.rotation.y = Math.PI / 2 + ang;
      st.rotation.z = 0.04;
      this.catBody.add(st);
    }

    // Tucked white-socked front paws with tiny sculpted toes + tucked hind paw resting cleanly on fleece!
    for (const [px, pz, rotY] of [[0.23, -0.03, -0.18], [0.22, 0.11, 0.25]]) {
      const pawG = new THREE.Group();
      pawG.position.set(px, 0.042, pz);
      pawG.rotation.y = rotY;
      const pawMain = new THREE.Mesh(new THREE.SphereGeometry(0.055, 10, 8), catCream);
      pawMain.scale.set(1.22, 0.62, 0.88);
      pawMain.castShadow = true;
      pawG.add(pawMain);
      for (const tz of [-0.026, 0, 0.026]) {
        const toe = new THREE.Mesh(new THREE.SphereGeometry(0.021, 7, 6), catCream);
        toe.scale.set(1.1, 0.75, 0.9);
        toe.position.set(0.052, -0.006, tz);
        pawG.add(toe);
      }
      this.catBody.add(pawG);
    }
    const bPaw = new THREE.Mesh(new THREE.SphereGeometry(0.068, 10, 8), catCream);
    bPaw.scale.set(1.18, 0.64, 0.86);
    bPaw.position.set(-0.11, 0.044, 0.165);
    this.catBody.add(bPaw);

    // Crimson velvet collar & gleaming brass bell snug around neck
    const collar = new THREE.Mesh(new THREE.TorusGeometry(0.105, 0.017, 7, 16), catCollar);
    collar.position.set(0.145, 0.162, 0.038);
    collar.rotation.y = Math.PI / 2 - 0.34;
    const bell = new THREE.Mesh(new THREE.SphereGeometry(0.027, 8, 6), brassMat);
    bell.position.set(0.205, 0.098, 0.082);
    this.catBody.add(collar, bell);

    // Finely Sculpted Sleeping Cat Head resting peacefully atop front paws!
    const cHeadGroup = new THREE.Group();
    cHeadGroup.position.set(0.175, 0.202, 0.035);
    cHeadGroup.rotation.y = 0.4;
    cHeadGroup.rotation.z = -0.08;

    const cHead = new THREE.Mesh(new THREE.SphereGeometry(0.142, 16, 12), catOrange);
    cHead.scale.set(1.02, 0.9, 1.06);
    cHead.castShadow = true;
    cHeadGroup.add(cHead);

    // Fluffy cream cheeks, soft chin & tiny sculpted pink triangle nose
    for (const mz of [-0.044, 0.044]) {
      const cheek = new THREE.Mesh(new THREE.SphereGeometry(0.054, 10, 8), catCream);
      cheek.scale.set(1.0, 0.88, 1.04);
      cheek.position.set(0.112, -0.032, mz);
      cHeadGroup.add(cheek);
    }
    const chin = new THREE.Mesh(new THREE.SphereGeometry(0.038, 8, 6), catCream);
    chin.scale.set(1.0, 0.72, 1.1);
    chin.position.set(0.106, -0.064, 0);
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.018, 3), catPink);
    nose.rotation.x = Math.PI;
    nose.rotation.z = -Math.PI / 2;
    nose.position.set(0.156, -0.012, 0);
    cHeadGroup.add(chin, nose);

    // Peaceful curved smiling sleeping eyes (crescent arcs cleanly proud of head surface!)
    for (const ez of [-0.054, 0.054]) {
      const eyeArc = new THREE.Mesh(new THREE.TorusGeometry(0.022, 0.0055, 5, 10, Math.PI), catEyeMat);
      eyeArc.position.set(0.136, 0.022, ez);
      eyeArc.rotation.y = Math.PI / 2 + (ez > 0 ? -0.34 : 0.34);
      eyeArc.rotation.z = Math.PI; // happy U-curve closed eyelid!
      cHeadGroup.add(eyeArc);
    }

    // Delicate 3D ivory cat whiskers fanning gently & symmetrically off both cheeks!
    for (const side of [-1, 1]) {
      for (const [wy, fanAng, wLen] of [[0.012, 0.16, 0.105], [-0.006, 0.0, 0.115], [-0.024, -0.16, 0.095]]) {
        const whisk = new THREE.Mesh(new THREE.CylinderGeometry(0.0022, 0.0014, wLen, 4), catWhiskerMat);
        whisk.rotation.x = side * (Math.PI / 2 - fanAng);
        whisk.position.set(0.118, -0.026 + wy, side * (0.048 + wLen * 0.42));
        cHeadGroup.add(whisk);
      }
    }

    // Tabby forehead "M" stripes hugging the crown cleanly
    for (const fz of [-0.026, 0, 0.026]) {
      const fMark = new THREE.Mesh(new THREE.BoxGeometry(0.052, 0.012, 0.014), catStripe);
      fMark.position.set(0.068, 0.118 - Math.abs(fz) * 0.25, fz);
      fMark.rotation.z = -0.38;
      cHeadGroup.add(fMark);
    }

    // Sculpted softly-rounded cat ears with pink inner pads & tiny cream ear tufts!
    for (const ez of [-0.084, 0.084]) {
      const earG = new THREE.Group();
      earG.position.set(0.005, 0.132, ez);
      earG.rotation.x = ez > 0 ? 0.28 : -0.28;
      earG.rotation.z = -0.1;

      const earOuter = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.052, 0.108, 7), catOrange);
      earOuter.scale.set(0.75, 1.0, 1.15);
      earOuter.castShadow = true;
      const earInner = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.031, 0.072, 6), catPink);
      earInner.scale.set(0.65, 1.0, 1.05);
      earInner.position.set(0.018, -0.006, 0);
      const earTuft = new THREE.Mesh(new THREE.SphereGeometry(0.016, 6, 5), catCream);
      earTuft.position.set(0.024, -0.032, 0);
      earG.add(earOuter, earInner, earTuft);
      cHeadGroup.add(earG);
    }
    this.catBody.add(cHeadGroup);

    // Seamless Continuous Curved Fluffy Striped Tail (TubeGeometry along CatmullRomCurve3 — NEVER breaks or disconnects!)
    this.catTail = new THREE.Group();
    this.catTail.position.set(-0.215, 0.075, 0.055); // anchored right inside the hind haunch!

    const tailCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0.055, 0.028, -0.018), // root embedded cleanly inside hind haunch
      new THREE.Vector3(-0.025, 0.01, 0.065),
      new THREE.Vector3(0.02, -0.012, 0.175),
      new THREE.Vector3(0.145, -0.014, 0.215),
      new THREE.Vector3(0.275, -0.002, 0.192),
      new THREE.Vector3(0.355, 0.026, 0.128),  // gently curled fluffy tail tip near front paws
    ]);

    const tailSegs = 28;
    const tailRadSegs = 10;
    const tailGeo = new THREE.TubeGeometry(tailCurve, tailSegs, 0.044, tailRadSegs, false);
    // Smooth organic fur taper from thick base to cozy rounded tip
    const tPos = tailGeo.attributes.position;
    const ringVerts = tailRadSegs + 1;
    const centerPt = new THREE.Vector3();
    for (let i = 0; i <= tailSegs; i++) {
      const u = i / tailSegs;
      tailCurve.getPointAt(u, centerPt);
      const scale = u < 0.55 ? 1.04 - u * 0.08 : 1.0 - (u - 0.55) * 0.44;
      for (let j = 0; j < ringVerts; j++) {
        const idx = i * ringVerts + j;
        tPos.setXYZ(
          idx,
          centerPt.x + (tPos.getX(idx) - centerPt.x) * scale,
          centerPt.y + (tPos.getY(idx) - centerPt.y) * scale,
          centerPt.z + (tPos.getZ(idx) - centerPt.z) * scale
        );
      }
    }
    tailGeo.computeVertexNormals();
    const tailMesh = new THREE.Mesh(tailGeo, catOrange);
    tailMesh.castShadow = true;
    this.catTail.add(tailMesh);

    // 4 Tangent-Aligned Dark Tabby Rings wrapping seamlessly around the curved tail!
    const zAxis = new THREE.Vector3(0, 0, 1);
    for (const u of [0.24, 0.44, 0.64, 0.81]) {
      const pt = tailCurve.getPointAt(u);
      const tan = tailCurve.getTangentAt(u).normalize();
      const ringScale = u < 0.55 ? 1.04 - u * 0.08 : 1.0 - (u - 0.55) * 0.44;
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.036 * ringScale, 0.0115 * ringScale, 6, 12), catStripe);
      ring.position.copy(pt);
      ring.quaternion.setFromUnitVectors(zAxis, tan);
      this.catTail.add(ring);
    }

    // Plump Cream Fur Tip seamlessly capping the very end of the curve!
    const tipPos = tailCurve.getPointAt(1.0);
    const tailTip = new THREE.Mesh(new THREE.SphereGeometry(0.036, 10, 8), catCream);
    tailTip.position.copy(tipPos);
    tailTip.castShadow = true;
    this.catTail.add(tailTip);

    this.catBody.add(this.catTail);

    catGroup.add(this.catBody);
    this.group.add(catGroup);
    this._addBoxCollider(this.catPos.x, this.catPos.z, 0.98, 0.98);

    // 3. Large Patterned Living Room Rug (with braided woven fringe!) + Zero-Clipping Plush Loveseat Sofa + Hot Cocoa Coffee Table!
    const mainRug = new THREE.Mesh(
      new THREE.BoxGeometry(4.4, 0.04, 2.75),
      new THREE.MeshStandardMaterial({ map: this.textures.cozyRug, roughness: 0.95 })
    );
    mainRug.position.set(0.65, 0.02, 0.45);
    mainRug.receiveShadow = true;
    this.group.add(mainRug);

    // Delicate woven cream rug tassels on left & right short ends
    const fringeMat = new THREE.MeshStandardMaterial({ color: 0xf2dfc0, roughness: 0.95 });
    for (const sgn of [-1, 1]) {
      for (let f = -5; f <= 5; f++) {
        const tas = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.02, 0.09), fringeMat);
        tas.position.set(0.65 + sgn * 2.28, 0.015, 0.45 + f * 0.24);
        this.group.add(tas);
      }
    }

    // Refined Country Loveseat Sofa (ZERO overlapping or coplanar parts — separate legs, skirt, armrests, seat & back cushions!)
    const sofa = new THREE.Group();
    sofa.position.set(-0.65, 0, 1.15);
    sofa.rotation.y = Math.PI + 0.25;
    const sofaCushionMat = new THREE.MeshStandardMaterial({ color: 0xa13d35, roughness: 0.88 });
    const sofaTrimWood = new THREE.MeshStandardMaterial({ color: 0x5c331a, roughness: 0.86 });

    // 4 solid dark-timber sofa legs standing cleanly on rug (y: 0.04 .. 0.15)
    for (const lx of [-0.78, 0.78]) {
      for (const lz of [-0.34, 0.34]) {
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.032, 0.12, 7), darkWood);
        leg.position.set(lx, 0.09, lz);
        leg.castShadow = true;
        sofa.add(leg);
      }
    }

    // Timber lower base deck strictly between armrests (x: -0.73..+0.73, y: 0.15..0.28, z: -0.40..+0.40)
    const sDeck = new THREE.Mesh(new THREE.BoxGeometry(1.46, 0.13, 0.8), darkWood);
    sDeck.position.set(0, 0.215, 0);
    sDeck.castShadow = true;
    sofa.add(sDeck);

    // Solid side armrest panels flanking strictly OUTSIDE the deck (x: ±0.73..±0.93, y: 0.15..0.63, z: -0.42..+0.42)
    for (const sgn of [-1, 1]) {
      const armPanel = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.48, 0.84), sofaMat);
      armPanel.position.set(sgn * 0.83, 0.39, 0);
      armPanel.castShadow = true;
      const armCap = new THREE.Mesh(new THREE.BoxGeometry(0.23, 0.065, 0.88), sofaTrimWood);
      armCap.position.set(sgn * 0.83, 0.6625, 0);
      armCap.castShadow = true;
      sofa.add(armPanel, armCap);
    }

    // Solid upholstered backrest strictly BETWEEN the armrests & ABOVE the deck (x: -0.725..+0.725, y: 0.28..0.96, z: -0.42..-0.22)
    const sBack = new THREE.Mesh(new THREE.BoxGeometry(1.45, 0.68, 0.2), sofaMat);
    sBack.position.set(0, 0.62, -0.32);
    sBack.castShadow = true;
    const sBackRail = new THREE.Mesh(new THREE.BoxGeometry(1.45, 0.055, 0.22), sofaTrimWood);
    sBackRail.position.set(0, 0.9875, -0.32);
    sofa.add(sBack, sBackRail);

    // 2 Plush Independent Seat Cushions sitting cleanly atop deck (y: 0.285..0.465, z: -0.20..+0.42)
    for (const cx of [-0.36, 0.36]) {
      const seatCush = new THREE.Mesh(new THREE.BoxGeometry(0.69, 0.175, 0.6), sofaCushionMat);
      seatCush.position.set(cx, 0.3725, 0.11);
      seatCush.castShadow = true;
      sofa.add(seatCush);

      // Matching plush back cushion sitting cleanly atop seat cushion & in front of backrest!
      const backCush = new THREE.Mesh(new THREE.BoxGeometry(0.67, 0.4, 0.16), sofaCushionMat);
      backCush.position.set(cx, 0.67, -0.12);
      backCush.rotation.x = -0.12;
      backCush.castShadow = true;
      sofa.add(backCush);
    }

    // Golden knit throw pillow resting cleanly atop left cushion (zero clipping!)
    const throwP = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.28, 0.13), cushionMat);
    throwP.position.set(-0.46, 0.61, 0.08);
    throwP.rotation.set(-0.18, 0.32, 0.16);
    throwP.castShadow = true;
    sofa.add(throwP);

    // Folded cozy plaid throw blanket draped neatly over right armrest cap!
    const throwBlanket = new THREE.Mesh(
      new THREE.BoxGeometry(0.26, 0.035, 0.44),
      new THREE.MeshStandardMaterial({ map: this.textures.tableRunner, roughness: 0.92 })
    );
    throwBlanket.position.set(0.83, 0.715, 0.06);
    sofa.add(throwBlanket);

    this.group.add(sofa);
    this._addBoxCollider(-0.65, 1.15, 1.94, 0.98);

    // Low Wooden Coffee Table with Steaming Hot Cocoa Teapot & Cookie Plate!
    const ct = new THREE.Group();
    ct.position.set(this.teaTablePos.x, 0, this.teaTablePos.z);
    const ctTop = new THREE.Mesh(new THREE.BoxGeometry(1.22, 0.09, 0.82), plankMat);
    ctTop.position.y = 0.48;
    ctTop.castShadow = true;
    ct.add(ctTop);
    for (const lx of [-0.5, 0.5]) {
      for (const lz of [-0.3, 0.3]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.46, 0.09), darkWood);
        leg.position.set(lx, 0.23, lz);
        ct.add(leg);
      }
    }
    // Porcelain Teapot + Steaming Mug + Plate of Cookies
    const teapot = new THREE.Mesh(
      new THREE.SphereGeometry(0.14, 8, 7),
      new THREE.MeshStandardMaterial({ color: 0xf7f1e3, roughness: 0.3 })
    );
    teapot.position.set(-0.24, 0.64, -0.08);
    ct.add(teapot);
    const mug = new THREE.Mesh(
      new THREE.CylinderGeometry(0.075, 0.065, 0.14, 7),
      new THREE.MeshStandardMaterial({ color: 0xc94238, roughness: 0.45 })
    );
    mug.position.set(0.14, 0.59, 0.14);
    ct.add(mug);
    const cocoa = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.02, 7), new THREE.MeshBasicMaterial({ color: 0x5c3018 }));
    cocoa.position.set(0.14, 0.66, 0.14);
    ct.add(cocoa);
    const plate = new THREE.Mesh(
      new THREE.CylinderGeometry(0.17, 0.15, 0.03, 9),
      new THREE.MeshStandardMaterial({ color: 0xf2e9d8 })
    );
    plate.position.set(0.28, 0.54, -0.14);
    ct.add(plate);
    for (const [ox, oz] of [[-0.05, 0], [0.06, 0.04], [0, -0.06]]) {
      const ck = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.03, 6), new THREE.MeshStandardMaterial({ color: 0xd4964c }));
      ck.position.set(0.28 + ox, 0.57, -0.14 + oz);
      ct.add(ck);
    }
    this.group.add(ct);
    this._addBoxCollider(this.teaTablePos.x, this.teaTablePos.z, 1.3, 0.9);

    // Rising gentle steam wisps from hot cocoa mug!
    for (let i = 0; i < 3; i++) {
      const wisp = new THREE.Mesh(
        new THREE.BoxGeometry(0.07, 0.07, 0.07),
        new THREE.MeshBasicMaterial({ color: 0xfff8eb, transparent: true, opacity: 0.4 })
      );
      this.group.add(wisp);
      this.steamWisps.push({
        mesh: wisp,
        baseX: this.teaTablePos.x + 0.14,
        baseY: 0.72,
        baseZ: this.teaTablePos.z + 0.14,
        phase: i * 2.1,
        height: 0.55,
      });
    }

    // 4. Wooden Storage Chest & Coat Rack near South-West Entry
    const chest = new THREE.Group();
    chest.position.set(-2.65, 0, 2.75);
    const chBody = new THREE.Mesh(new THREE.BoxGeometry(1.12, 0.62, 0.66), plankMat);
    chBody.position.y = 0.31;
    chBody.castShadow = true;
    chest.add(chBody);
    for (const sx of [-0.36, 0.36]) {
      const strap = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.66, 0.7), ironMat);
      strap.position.set(sx, 0.31, 0);
      chest.add(strap);
    }
    const chLock = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, 0.06), brassMat);
    chLock.position.set(0, 0.48, 0.34);
    chest.add(chLock);
    this.group.add(chest);
    this._addBoxCollider(-2.65, 2.75, 1.2, 0.74);

    // Acoustic guitar leaning cozily near the fireplace wall
    const guitar = new THREE.Group();
    guitar.position.set(0.0, 0.52, -2.92);
    guitar.rotation.z = 0.16;
    guitar.rotation.x = -0.15;
    const gBody = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.46, 0.12), new THREE.MeshStandardMaterial({ color: 0xc47b3a, roughness: 0.6 }));
    const gNeck = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.52, 0.06), darkWood);
    gNeck.position.y = 0.46;
    const gHole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.02, 8), new THREE.MeshBasicMaterial({ color: 0x261409 }));
    gHole.rotation.x = Math.PI / 2;
    gHole.position.set(0, 0.04, 0.06);
    guitar.add(gBody, gNeck, gHole);
    this.group.add(guitar);
  }

  _buildKitchenAndDining() {
    const darkWood = new THREE.MeshStandardMaterial({ color: 0x4c2914, roughness: 0.9 });
    const plankMat = new THREE.MeshStandardMaterial({ map: this.textures.woodPlank, roughness: 0.85 });
    const tileMat = new THREE.MeshStandardMaterial({ map: this.textures.kitchenTile, roughness: 0.72 });
    const ironMat = new THREE.MeshStandardMaterial({ color: 0x2a2e35, metalness: 0.55, roughness: 0.45 });
    const copperMat = new THREE.MeshStandardMaterial({ color: 0xc97340, metalness: 0.65, roughness: 0.32 });
    const runnerMat = new THREE.MeshStandardMaterial({ map: this.textures.tableRunner, roughness: 0.9 });
    const linenMat = new THREE.MeshStandardMaterial({ color: 0xfbf2dc, roughness: 0.85 });
    const brassMat = new THREE.MeshStandardMaterial({ color: 0xe3b84c, metalness: 0.6, roughness: 0.35 });

    // 1. Country Kitchen Counter, Tile Backsplash, Cast-Iron Stove & Open Spice Shelves (North-East!)
    const kitchen = new THREE.Group();
    kitchen.position.set(5.05, 0, -2.58);

    // Ceramic tile backsplash along north kitchen wall
    const backsplash = new THREE.Mesh(new THREE.BoxGeometry(2.8, 1.25, 0.08), tileMat);
    backsplash.position.set(0, 1.52, -0.48);
    kitchen.add(backsplash);

    // Butcher-block timber counter cabinets
    const counter = new THREE.Mesh(new THREE.BoxGeometry(2.75, 0.92, 0.96), plankMat);
    counter.position.y = 0.46;
    counter.castShadow = true;
    counter.receiveShadow = true;
    kitchen.add(counter);

    const counterTop = new THREE.Mesh(new THREE.BoxGeometry(2.82, 0.09, 1.04), darkWood);
    counterTop.position.y = 0.95;
    kitchen.add(counterTop);

    // Cast-Iron Wood-Burning Cook Stove integrated cleanly proud of wooden counter (zero top-face Z-fighting!)
    const stoveBox = new THREE.Mesh(new THREE.BoxGeometry(1.06, 1.01, 1.06), ironMat);
    stoveBox.position.set(-0.05, 0.505, 0.04);
    stoveBox.castShadow = true;
    kitchen.add(stoveBox);

    // Glowing firebox grate on front of cook stove
    const stoveGlow = new THREE.Mesh(
      new THREE.PlaneGeometry(0.46, 0.24),
      new THREE.MeshBasicMaterial({ color: 0xff6b22 })
    );
    stoveGlow.position.set(-0.05, 0.42, 0.585);
    kitchen.add(stoveGlow);

    // Cast-iron stovepipe rising smoothly to ceiling
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.12, 2.7, 8), ironMat);
    pipe.position.set(-0.05, 2.32, -0.26);
    kitchen.add(pipe);

    // 1b. Detailed Stove Burner Rings + Ultra-Fine Cast-Iron Dutch Oven Stew Pot + Copper Teakettle!
    const potIronMat = new THREE.MeshStandardMaterial({ color: 0x22262d, metalness: 0.65, roughness: 0.36 });
    const potRimMat = new THREE.MeshStandardMaterial({ color: 0x3b414c, metalness: 0.72, roughness: 0.28 });
    const burnerGlowMat = new THREE.MeshBasicMaterial({ color: 0xff5a18 });

    // Glowing cast-iron stovetop burner rings
    const burner1 = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.28, 0.025, 12), potIronMat);
    burner1.position.set(-0.24, 0.99, 0.04);
    const burnerSeam = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.015, 5, 12), burnerGlowMat);
    burnerSeam.rotation.x = Math.PI / 2;
    burnerSeam.position.set(-0.24, 1.005, 0.04);
    kitchen.add(burner1, burnerSeam);

    // Sculpted Cast-Iron Dutch Oven Stew Pot (with rounded belly, rolled rim, twin handles, ajar lid, ladle & chunky stew!)
    const potGroup = new THREE.Group();
    potGroup.position.set(-0.24, 1.01, 0.04);

    // Tapered base + slightly rounded heavy iron belly + rolled upper rim
    const potBase = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.22, 0.14, 14), potIronMat);
    potBase.position.y = 0.07;
    potBase.castShadow = true;
    const potUpper = new THREE.Mesh(new THREE.CylinderGeometry(0.275, 0.26, 0.22, 14), potIronMat);
    potUpper.position.y = 0.24;
    potUpper.castShadow = true;
    const potRim = new THREE.Mesh(new THREE.TorusGeometry(0.272, 0.028, 7, 16), potRimMat);
    potRim.rotation.x = Math.PI / 2;
    potRim.position.y = 0.35;
    potGroup.add(potBase, potUpper, potRim);

    // Twin curved side iron loop handles!
    for (const sgn of [-1, 1]) {
      const handle = new THREE.Mesh(new THREE.TorusGeometry(0.068, 0.018, 6, 10, Math.PI), potRimMat);
      handle.position.set(sgn * 0.275, 0.27, 0);
      handle.rotation.z = sgn * (-Math.PI / 2);
      potGroup.add(handle);
    }

    // Rich Simmering Winter Stew inside pot (amber broth + diced carrots, white radish, seared meat & green scallions!)
    const soupSurface = new THREE.Mesh(
      new THREE.CylinderGeometry(0.248, 0.248, 0.03, 14),
      new THREE.MeshStandardMaterial({ color: 0xe67e28, emissive: 0x6e2704, emissiveIntensity: 0.65, roughness: 0.22 })
    );
    soupSurface.position.y = 0.32;
    potGroup.add(soupSurface);

    const carrotMat = new THREE.MeshStandardMaterial({ color: 0xf57a1f, roughness: 0.6 });
    const stewMeatMat = new THREE.MeshStandardMaterial({ color: 0x6b321d, roughness: 0.78 });
    const radishCubeMat = new THREE.MeshStandardMaterial({ color: 0xf7eed8, roughness: 0.7 });
    const scallionMat = new THREE.MeshStandardMaterial({ color: 0x4ca649, roughness: 0.65 });

    for (const [cx, cz] of [[-0.09, 0.06], [0.08, -0.05], [-0.02, -0.11]]) {
      const cCoin = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.038, 0.024, 7), carrotMat);
      cCoin.position.set(cx, 0.34, cz);
      potGroup.add(cCoin);
    }
    for (const [mx, mz] of [[0.09, 0.08], [-0.11, -0.06]]) {
      const mChunk = new THREE.Mesh(new THREE.BoxGeometry(0.065, 0.045, 0.06), stewMeatMat);
      mChunk.position.set(mx, 0.34, mz);
      mChunk.rotation.y = mx * 6;
      potGroup.add(mChunk);
    }
    for (const [rx, rz] of [[0.0, 0.08], [-0.06, 0.0]]) {
      const rCube = new THREE.Mesh(new THREE.BoxGeometry(0.052, 0.038, 0.052), radishCubeMat);
      rCube.position.set(rx, 0.338, rz);
      rCube.rotation.y = 0.6;
      potGroup.add(rCube);
    }
    for (const [gx, gz] of [[0.04, 0.02], [-0.05, 0.12], [0.13, 0.0], [-0.12, 0.02]]) {
      const sc = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.015, 0.026), scallionMat);
      sc.position.set(gx, 0.344, gz);
      potGroup.add(sc);
    }

    // Animated simmering broth bubbles!
    const bubMat = new THREE.MeshBasicMaterial({ color: 0xffcf7a, transparent: true, opacity: 0.85 });
    for (let b = 0; b < 3; b++) {
      const bub = new THREE.Mesh(new THREE.SphereGeometry(0.024, 6, 5), bubMat.clone());
      bub.position.set((b - 1) * 0.075, 0.345, (b % 2 === 0 ? 0.05 : -0.04));
      potGroup.add(bub);
      this.soupBubbles.push({ mesh: bub, phase: b * 2.1 });
    }

    // Cast-iron lid with gleaming brass knob resting slightly ajar on the back rim!
    const potLid = new THREE.Group();
    potLid.position.set(0.02, 0.365, -0.11);
    potLid.rotation.x = -0.34;
    potLid.rotation.z = 0.08;
    const lidDisc = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.27, 0.045, 14), potRimMat);
    const lidDome = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 6, 0, Math.PI * 2, 0, Math.PI * 0.38), potIronMat);
    lidDome.scale.set(1, 0.45, 1);
    lidDome.position.y = 0.01;
    const lidKnob = new THREE.Mesh(new THREE.SphereGeometry(0.042, 7, 6), brassMat);
    lidKnob.position.y = 0.1;
    potLid.add(lidDisc, lidDome, lidKnob);
    potGroup.add(potLid);

    // Wooden cooking ladle resting diagonally inside pot
    const ladleHandle = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.02, 0.46, 6), plankMat);
    ladleHandle.position.set(0.14, 0.44, 0.14);
    ladleHandle.rotation.z = -0.58;
    ladleHandle.rotation.x = 0.42;
    potGroup.add(ladleHandle);

    kitchen.add(potGroup);

    // Detailed Hammered Copper Teakettle with Curved Spout, Arched Handle & Knobbed Lid!
    const kettleGroup = new THREE.Group();
    kettleGroup.position.set(0.25, 1.0, 0.12);
    const kBase = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.17, 0.05, 12), copperMat);
    kBase.position.y = 0.025;
    const kBody = new THREE.Mesh(new THREE.SphereGeometry(0.155, 12, 9), copperMat);
    kBody.scale.set(1.05, 0.82, 1.05);
    kBody.position.y = 0.13;
    kBody.castShadow = true;
    const kLid = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.03, 10), brassMat);
    kLid.position.y = 0.25;
    const kKnob = new THREE.Mesh(new THREE.SphereGeometry(0.028, 6, 5), darkWood);
    kKnob.position.y = 0.285;
    const kSpout = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.038, 0.18, 7), copperMat);
    kSpout.position.set(0.15, 0.17, 0.04);
    kSpout.rotation.z = -0.78;
    const kArch = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.015, 5, 12, Math.PI), ironMat);
    kArch.position.set(0, 0.22, 0);
    const kGrip = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.1, 6), darkWood);
    kGrip.rotation.z = Math.PI / 2;
    kGrip.position.set(0, 0.36, 0);
    kettleGroup.add(kBase, kBody, kLid, kKnob, kSpout, kArch, kGrip);
    kitchen.add(kettleGroup);

    // 1c. Thick Butcher-Block Cutting Board with Fresh Carrots, Marbled Meat & Embedded Kitchen Cleaver (zero coplanar faces!)
    const boardGroup = new THREE.Group();
    boardGroup.position.set(-0.96, 1.0, 0.08);

    const boardWoodMat = new THREE.MeshStandardMaterial({ color: 0xdca972, roughness: 0.84 });
    const boardEdgeMat = new THREE.MeshStandardMaterial({ color: 0x9c6434, roughness: 0.88 });
    const boardMain = new THREE.Mesh(new THREE.BoxGeometry(0.64, 0.068, 0.58), boardWoodMat);
    boardMain.position.y = 0.034;
    boardMain.castShadow = true;
    boardMain.receiveShadow = true;
    boardGroup.add(boardMain);
    // Clean non-overlapping end-grain side strips flush beside boardMain (x: ±0.32..±0.37)
    for (const bx of [-0.346, 0.346]) {
      const strip = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.068, 0.58), boardEdgeMat);
      strip.position.set(bx, 0.034, 0);
      boardGroup.add(strip);
    }

    // (i) Fresh Whole Carrot + Feathery Green Tops + 4 Sliced Orange Carrot Coins on left of board!
    const leafGreenMat = new THREE.MeshStandardMaterial({ color: 0x3f8f42, roughness: 0.8 });
    const wholeCarrot = new THREE.Group();
    wholeCarrot.position.set(-0.18, 0.095, -0.1);
    wholeCarrot.rotation.y = 0.35;
    const wcRoot = new THREE.Mesh(new THREE.ConeGeometry(0.048, 0.26, 7), carrotMat);
    wcRoot.rotation.z = -Math.PI / 2;
    wcRoot.castShadow = true;
    wholeCarrot.add(wcRoot);
    for (let f = -1; f <= 1; f++) {
      const frond = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.025, 0.032), leafGreenMat);
      frond.position.set(-0.16, 0.008, f * 0.028);
      frond.rotation.y = f * 0.32;
      wholeCarrot.add(frond);
    }
    boardGroup.add(wholeCarrot);

    // 4 neat sliced carrot coins scattered right in front of the carrot
    const coinSpots = [[-0.02, -0.05], [0.05, -0.11], [-0.07, 0.04], [0.01, 0.07]];
    for (const [sx, sz] of coinSpots) {
      const coin = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.036, 0.022, 8), carrotMat);
      coin.position.set(sx, 0.079, sz);
      boardGroup.add(coin);
    }

    // (ii) Marbled Raw Stew Meat Cut (clean non-overlapping stacked fat & meat layers — ZERO Z-fighting!)
    const rawMeatMat = new THREE.MeshStandardMaterial({ color: 0xb52b2b, roughness: 0.62 });
    const rawMeatDark = new THREE.MeshStandardMaterial({ color: 0x8f1f22, roughness: 0.68 });
    const fatMarbleMat = new THREE.MeshStandardMaterial({ color: 0xfae8d8, roughness: 0.55 });

    const meatCut = new THREE.Group();
    meatCut.position.set(-0.16, 0.07, 0.15);
    meatCut.rotation.y = -0.22;
    const mBase = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.036, 0.16), rawMeatMat);
    mBase.position.y = 0.018;
    mBase.castShadow = true;
    const mFatBand = new THREE.Mesh(new THREE.BoxGeometry(0.252, 0.022, 0.172), fatMarbleMat);
    mFatBand.position.y = 0.047;
    const mTop = new THREE.Mesh(new THREE.BoxGeometry(0.225, 0.028, 0.148), rawMeatDark);
    mTop.position.y = 0.072;
    // White bone ring & marrow dot protruding cleanly above mTop (y = 0.098 / 0.104)
    const mBone = new THREE.Mesh(new THREE.CylinderGeometry(0.034, 0.034, 0.022, 8), fatMarbleMat);
    mBone.position.set(-0.058, 0.092, 0.015);
    const mMarrow = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.01, 6), rawMeatMat);
    mMarrow.position.set(-0.058, 0.105, 0.015);
    meatCut.add(mBase, mFatBand, mTop, mBone, mMarrow);
    boardGroup.add(meatCut);

    // 2 freshly chopped meat cubes beside the slab
    for (const [dx, dz] of [[0.02, 0.18], [0.1, 0.2]]) {
      const cube = new THREE.Mesh(new THREE.BoxGeometry(0.062, 0.055, 0.058), rawMeatMat);
      cube.position.set(dx, 0.096, dz);
      cube.rotation.y = dx * 8;
      boardGroup.add(cube);
    }

    // (iii) Polished Steel Chinese Kitchen Cleaver CHOPPED FIRMLY INTO the Cutting Board (菜刀砍进案板里)!
    const cleaver = new THREE.Group();
    cleaver.position.set(0.15, 0.058, 0.03);
    cleaver.rotation.y = -0.35;
    cleaver.rotation.z = -0.24;

    const steelMat = new THREE.MeshStandardMaterial({ color: 0xdce6f0, metalness: 0.82, roughness: 0.18 });
    const edgeMat = new THREE.MeshStandardMaterial({ color: 0xf4f9ff, metalness: 0.88, roughness: 0.12 });
    const handleWoodMat = new THREE.MeshStandardMaterial({ color: 0x5c3218, roughness: 0.78 });

    // Upper blade body + cleanly non-overlapping sharpened bottom edge
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.132, 0.018), steelMat);
    blade.position.set(0, 0.09, 0);
    blade.castShadow = true;
    cleaver.add(blade);
    const sharpEdge = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.024, 0.014), edgeMat);
    sharpEdge.position.set(0, 0.012, 0);
    cleaver.add(sharpEdge);
    const hole = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.026, 8), new THREE.MeshBasicMaterial({ color: 0x3b2c22 }));
    hole.rotation.x = Math.PI / 2;
    hole.position.set(-0.095, 0.125, 0);
    cleaver.add(hole);
    const bolster = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.035, 8), edgeMat);
    bolster.rotation.z = Math.PI / 2;
    bolster.position.set(0.155, 0.118, 0);
    const kHandle = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.028, 0.17, 8), handleWoodMat);
    kHandle.rotation.z = Math.PI / 2;
    kHandle.position.set(0.25, 0.118, 0);
    kHandle.castShadow = true;
    cleaver.add(bolster, kHandle);

    const cutMark = new THREE.Mesh(new THREE.BoxGeometry(0.29, 0.008, 0.028), new THREE.MeshBasicMaterial({ color: 0x5c361a }));
    cutMark.position.set(0.15, 0.072, 0.03);
    cutMark.rotation.y = -0.35;
    boardGroup.add(cutMark, cleaver);

    kitchen.add(boardGroup);

    // 1d. Cozy Right-Counter Prep Details (Stacked Ceramic Bowls + Utensil Crock + Bread Loaf!)
    for (let b = 0; b < 3; b++) {
      const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.1, 0.06, 9), linenMat);
      bowl.position.set(0.84, 1.03 + b * 0.055, -0.14);
      kitchen.add(bowl);
    }
    const crock = new THREE.Mesh(
      new THREE.CylinderGeometry(0.09, 0.08, 0.22, 8),
      new THREE.MeshStandardMaterial({ color: 0x5c80a6, roughness: 0.4 })
    );
    crock.position.set(1.14, 1.11, -0.16);
    kitchen.add(crock);
    for (const [ux, rz] of [[-0.02, 0.15], [0.025, -0.18]]) {
      const sp = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.34, 5), plankMat);
      sp.position.set(1.14 + ux, 1.24, -0.16);
      sp.rotation.z = rz;
      kitchen.add(sp);
    }
    const loaf = new THREE.Mesh(
      new THREE.BoxGeometry(0.28, 0.15, 0.19),
      new THREE.MeshStandardMaterial({ color: 0xc9823c, roughness: 0.9 })
    );
    loaf.position.set(0.95, 1.075, 0.18);
    loaf.rotation.y = -0.2;
    kitchen.add(loaf);

    // Open Wooden Wall Shelves with Colorful Jam Jars, Bowls & Hanging Copper Skillet!
    for (const sy of [2.15, 2.75]) {
      const sh = new THREE.Mesh(new THREE.BoxGeometry(2.55, 0.08, 0.34), darkWood);
      sh.position.set(0, sy, -0.34);
      kitchen.add(sh);
    }
    const jarColors = [0xd64545, 0xe8a838, 0x4e8c57, 0x6e8cb8, 0xf2d99b, 0xb85272];
    for (let j = 0; j < 6; j++) {
      const jar = new THREE.Mesh(
        new THREE.CylinderGeometry(0.08, 0.08, 0.22, 7),
        new THREE.MeshStandardMaterial({ color: jarColors[j], roughness: 0.35 })
      );
      const row = j < 3 ? 2.3 : 2.9;
      jar.position.set(-0.95 + (j % 3) * 0.32 + (j >= 3 ? 1.1 : 0), row, -0.32);
      kitchen.add(jar);
    }
    // Copper hanging skillet
    const skillet = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.16, 0.05, 8), copperMat);
    skillet.rotation.x = Math.PI / 2;
    skillet.position.set(0.92, 1.72, -0.4);
    kitchen.add(skillet);

    this.group.add(kitchen);
    this._addBoxCollider(5.05, -2.55, 2.86, 1.12);

    // Rising simmering soup steam wisps!
    for (let i = 0; i < 4; i++) {
      const wisp = new THREE.Mesh(
        new THREE.BoxGeometry(0.1, 0.1, 0.1),
        new THREE.MeshBasicMaterial({ color: 0xfff9ee, transparent: true, opacity: 0.42 })
      );
      this.group.add(wisp);
      this.steamWisps.push({
        mesh: wisp,
        baseX: 4.79 + (i - 1.5) * 0.08,
        baseY: 1.4,
        baseZ: -2.54,
        phase: i * 1.55,
        height: 0.85,
      });
    }

    // 2. Country Dining Table & 3 Chairs right beside the LARGE EAST WINDOW!
    const dining = new THREE.Group();
    dining.position.set(4.55, 0, 0.92);

    const tTop = new THREE.Mesh(new THREE.BoxGeometry(1.92, 0.12, 1.24), plankMat);
    tTop.position.y = 0.8;
    tTop.castShadow = true;
    tTop.receiveShadow = true;
    dining.add(tTop);

    // Red-and-cream gingham table runner draped across table
    const runner = new THREE.Mesh(new THREE.BoxGeometry(1.96, 0.03, 0.48), runnerMat);
    runner.position.y = 0.875;
    dining.add(runner);

    for (const lx of [-0.8, 0.8]) {
      for (const lz of [-0.48, 0.48]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.8, 0.12), darkWood);
        leg.position.set(lx, 0.4, lz);
        dining.add(leg);
      }
    }

    // Centerpiece: two-tier birthday cake with blow-out-able candles (replaces the old candelabra)
    this._buildBirthdayCake(dining);
    for (const [px, pz] of [[-0.58, 0.34], [0.58, 0.34], [-0.58, -0.34]]) {
      const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.1, 0.08, 8), linenMat);
      bowl.position.set(px, 0.9, pz);
      dining.add(bowl);
    }

    // 3 Wooden Dining Chairs arranged warmly around table
    const ch1 = this._makeWoodenChair(plankMat, darkWood);
    ch1.position.set(-0.55, 0, -0.82);
    const ch2 = this._makeWoodenChair(plankMat, darkWood);
    ch2.position.set(0.55, 0, -0.82);
    const ch3 = this._makeWoodenChair(plankMat, darkWood);
    ch3.position.set(-1.18, 0, 0.05);
    ch3.rotation.y = Math.PI / 2;
    dining.add(ch1, ch2, ch3);

    this.group.add(dining);
    this._addBoxCollider(4.55, 0.82, 2.35, 1.85);

    // 3. Terracotta Potted Indoor Winter Fern by Kitchen Corner
    {
      const pg = new THREE.Group();
      pg.position.set(3.35, 0, -2.75);
      const pot = new THREE.Mesh(
        new THREE.CylinderGeometry(0.24, 0.17, 0.42, 8),
        new THREE.MeshStandardMaterial({ color: 0xb85e38, roughness: 0.85 })
      );
      pot.position.y = 0.21;
      pot.castShadow = true;
      pg.add(pot);
      for (let k = 0; k < 5; k++) {
        const a = (k / 5) * Math.PI * 2;
        const frond = new THREE.Mesh(
          new THREE.BoxGeometry(0.16, 0.44, 0.12),
          new THREE.MeshStandardMaterial({ color: k % 2 ? 0x3b7d48 : 0x2c6138, roughness: 0.88 })
        );
        frond.position.set(Math.cos(a) * 0.14, 0.56, Math.sin(a) * 0.14);
        frond.rotation.z = Math.cos(a) * 0.45;
        frond.rotation.x = Math.sin(a) * 0.45;
        pg.add(frond);
      }
      this.group.add(pg);
    }
  }

  _createGiftBox({ w, h, d, boxColor, ribbonColor, usePolka = false, animatedLid = false, giftIndex = 0 }) {
    const g = new THREE.Group();
    const boxMat = new THREE.MeshStandardMaterial({
      color: boxColor,
      map: usePolka ? this.textures.giftWrapPolka : null,
      roughness: 0.72,
    });
    const ribMat = new THREE.MeshStandardMaterial({
      color: ribbonColor,
      roughness: 0.42,
      metalness: 0.18,
    });

    const bodyH = h * 0.78;
    const lidH = h * 0.26;

    const body = new THREE.Mesh(new THREE.BoxGeometry(w, bodyH, d), boxMat);
    body.position.y = bodyH / 2;
    body.castShadow = true;
    body.receiveShadow = true;
    body.userData.isGift = true;
    body.userData.giftIndex = giftIndex;
    g.add(body);
    this.giftHitMeshes.push(body);

    // Side cross ribbons wrapped cleanly around body (distinct heights so crossing ribbons never Z-fight!)
    const ribW = Math.min(w, d) * 0.18;
    const rb1 = new THREE.Mesh(new THREE.BoxGeometry(ribW, bodyH - 0.004, d + 0.026), ribMat);
    rb1.position.y = bodyH / 2;
    const rb2 = new THREE.Mesh(new THREE.BoxGeometry(w + 0.026, bodyH - 0.012, ribW), ribMat);
    rb2.position.y = bodyH / 2;
    g.add(rb1, rb2);

    // Lid pivot (hinged on back edge for the centerpiece hero gift box!)
    const lidPivot = new THREE.Group();
    lidPivot.position.set(0, bodyH, -d / 2);

    const lid = new THREE.Mesh(new THREE.BoxGeometry(w + 0.055, lidH, d + 0.055), boxMat);
    lid.position.set(0, lidH / 2, d / 2);
    lid.castShadow = true;
    lid.userData.isGift = true;
    lid.userData.giftIndex = giftIndex;
    lidPivot.add(lid);
    this.giftHitMeshes.push(lid);

    // Top cross ribbons on lid (lr2 slightly taller than lr1 so top cross intersection never flickers!)
    const lr1 = new THREE.Mesh(new THREE.BoxGeometry(ribW + 0.01, lidH + 0.016, d + 0.078), ribMat);
    lr1.position.set(0, lidH / 2, d / 2);
    const lr2 = new THREE.Mesh(new THREE.BoxGeometry(w + 0.078, lidH + 0.024, ribW + 0.01), ribMat);
    lr2.position.set(0, lidH / 2, d / 2);
    lidPivot.add(lr1, lr2);

    // Sculpted 4-loop satin bow + center knot + tiny cream paper gift tag!
    const bowY = lidH + 0.055;
    const knot = new THREE.Mesh(new THREE.DodecahedronGeometry(ribW * 0.55, 0), ribMat);
    knot.position.set(0, bowY, d / 2);
    lidPivot.add(knot);
    for (let k = 0; k < 4; k++) {
      const ang = (k / 4) * Math.PI * 2 + Math.PI / 4;
      const loop = new THREE.Mesh(new THREE.TorusGeometry(ribW * 0.72, ribW * 0.24, 5, 8), ribMat);
      loop.position.set(Math.cos(ang) * ribW * 0.82, bowY + 0.03, d / 2 + Math.sin(ang) * ribW * 0.82);
      loop.rotation.y = -ang;
      loop.rotation.x = 0.55;
      lidPivot.add(loop);
    }
    const tag = new THREE.Mesh(
      new THREE.BoxGeometry(0.11, 0.015, 0.07),
      new THREE.MeshStandardMaterial({ color: 0xfbf2dc, roughness: 0.9 })
    );
    tag.position.set(w * 0.22, lidH + 0.015, d / 2 + d * 0.22);
    tag.rotation.y = 0.4;
    lidPivot.add(tag);

    g.add(lidPivot);
    if (animatedLid) {
      this.heroGiftLid = lidPivot;
    }
    return g;
  }

  _buildEntranceGiftPiles() {
    // Abundant Festive Multi-Tier Pile of Clickable Wrapped Gift Boxes nestled right underneath the Grand Right Panoramic Window (x: 0.55..3.0, z: -2.85..-1.9)!
    const windowGifts = [
      // Back row tucked cleanly right under the right window sill (y < 1.0)
      { x: 0.92, y: 0, z: -2.68, rot: 0.16, w: 0.64, h: 0.5, d: 0.58, boxColor: 0x336947, ribbonColor: 0xf5c852, giftIndex: 2 },
      { x: 1.68, y: 0, z: -2.72, rot: -0.08, w: 0.72, h: 0.56, d: 0.62, boxColor: 0x2f5f8f, ribbonColor: 0xf2f4f8, usePolka: true, giftIndex: 1 },
      { x: 2.48, y: 0, z: -2.66, rot: 0.22, w: 0.62, h: 0.48, d: 0.58, boxColor: 0xb8596c, ribbonColor: 0xfff1d6, usePolka: true, giftIndex: 4 },
      { x: 2.96, y: 0, z: -2.28, rot: -0.35, w: 0.44, h: 0.58, d: 0.42, boxColor: 0x456b96, ribbonColor: 0xffe285, giftIndex: 0 },
      // Front row facing the living room with the hero crimson-gold animated-lid box!
      { x: 1.82, y: 0, z: -2.12, rot: -0.18, w: 0.74, h: 0.52, d: 0.64, boxColor: 0xc93832, ribbonColor: 0xf5c852, animatedLid: true, giftIndex: 0 },
      { x: 1.08, y: 0, z: -2.08, rot: 0.34, w: 0.5, h: 0.38, d: 0.48, boxColor: 0xe6a83c, ribbonColor: 0xa62c2c, giftIndex: 3 },
      { x: 2.52, y: 0, z: -2.08, rot: -0.28, w: 0.48, h: 0.38, d: 0.46, boxColor: 0x35704c, ribbonColor: 0xf7e7c4, giftIndex: 2 },
      { x: 0.56, y: 0, z: -2.32, rot: -0.24, w: 0.44, h: 0.34, d: 0.42, boxColor: 0xc9423a, ribbonColor: 0xfaf0d7, usePolka: true, giftIndex: 4 },
      // Second-tier stacked boxes creating an abundant festive mound!
      { x: 1.66, y: 0.56, z: -2.72, rot: 0.28, w: 0.42, h: 0.32, d: 0.4, boxColor: 0xf2dfc0, ribbonColor: 0xc93832, giftIndex: 1 },
      { x: 0.94, y: 0.5, z: -2.66, rot: -0.35, w: 0.36, h: 0.28, d: 0.36, boxColor: 0xd97336, ribbonColor: 0xffe485, giftIndex: 3 },
      { x: 2.46, y: 0.48, z: -2.64, rot: 0.42, w: 0.36, h: 0.28, d: 0.34, boxColor: 0xc93832, ribbonColor: 0xfff0b8, giftIndex: 4 },
    ];

    for (const spec of windowGifts) {
      const box = this._createGiftBox(spec);
      box.position.set(spec.x, spec.y, spec.z);
      box.rotation.y = spec.rot;
      this.group.add(box);
    }

    // Floating warm golden invitation sparkles hovering gently above the right-window gift mound!
    const spCoords = [
      [1.82, 0.96, -2.12],
      [1.06, 1.02, -2.55],
      [2.52, 0.98, -2.48],
    ];
    for (let i = 0; i < spCoords.length; i++) {
      const [sx, sy, sz] = spCoords[i];
      const sp = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.085, 0),
        new THREE.MeshBasicMaterial({ color: 0xfff08a })
      );
      sp.position.set(sx, sy, sz);
      this.group.add(sp);
      this.giftSparkles.push({ mesh: sp, baseY: sy, phase: i * 1.9 });
    }

    // Single neat collider covering the gift mound beneath the right panoramic window
    this._addBoxCollider(1.8, -2.42, 2.75, 1.15);
  }

  _buildFestiveDecor() {
    const darkWood = new THREE.MeshStandardMaterial({ color: 0x4c2914, roughness: 0.9 });
    const brassMat = new THREE.MeshStandardMaterial({ color: 0xe3b84c, metalness: 0.65, roughness: 0.32 });
    const leafMat = new THREE.MeshStandardMaterial({ map: this.textures.pineLeaves, roughness: 0.88 });
    const barkMat = new THREE.MeshStandardMaterial({ map: this.textures.bark, roughness: 0.92 });

    // 1. Decorated Twinkling Indoor Winter Pine Tree in South-East Corner (5.72, 2.48)!
    const tree = new THREE.Group();
    tree.position.set(5.72, 0, 2.48);

    const skirt = new THREE.Mesh(
      new THREE.CylinderGeometry(0.74, 0.82, 0.05, 12),
      new THREE.MeshStandardMaterial({ color: 0xa62e2a, roughness: 0.94 })
    );
    skirt.position.y = 0.025;
    tree.add(skirt);

    const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.24, 0.36, 8), darkWood);
    stand.position.y = 0.18;
    tree.add(stand);

    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.13, 0.6, 6), barkMat);
    trunk.position.y = 0.42;
    tree.add(trunk);

    const tiers = [
      { r: 0.82, h: 0.72, y: 0.88 },
      { r: 0.66, h: 0.66, y: 1.38 },
      { r: 0.5, h: 0.58, y: 1.84 },
      { r: 0.34, h: 0.5, y: 2.24 },
      { r: 0.19, h: 0.4, y: 2.58 },
    ];
    const orbColors = [0xe03a32, 0xf5c84c, 0xf7f2e4, 0x4f89c4];
    tiers.forEach((t, ti) => {
      const bough = new THREE.Mesh(new THREE.ConeGeometry(t.r, t.h, 8), leafMat);
      bough.position.y = t.y;
      bough.rotation.y = ti * 0.45;
      bough.castShadow = true;
      tree.add(bough);

      // Tiny glossy ornaments & warm twinkling fairy bulbs around each tier!
      const count = Math.max(3, 6 - ti);
      for (let k = 0; k < count; k++) {
        const ang = (k / count) * Math.PI * 2 + ti * 0.6;
        const dist = t.r * 0.82;
        if (k % 2 === 0) {
          const orb = new THREE.Mesh(
            new THREE.SphereGeometry(0.058, 6, 5),
            new THREE.MeshStandardMaterial({ color: orbColors[(ti + k) % orbColors.length], metalness: 0.35, roughness: 0.28 })
          );
          orb.position.set(Math.cos(ang) * dist, t.y - t.h * 0.22, Math.sin(ang) * dist);
          tree.add(orb);
        } else {
          const lMat = new THREE.MeshStandardMaterial({
            color: 0xfff3b8,
            emissive: new THREE.Color(k % 3 === 1 ? 0xffc647 : 0xff7040),
            emissiveIntensity: 1.4,
          });
          this.treeLightMats.push({ mat: lMat, phase: ti * 1.3 + k * 0.9 });
          const bulb = new THREE.Mesh(new THREE.OctahedronGeometry(0.045, 0), lMat);
          bulb.position.set(Math.cos(ang) * dist, t.y - t.h * 0.18, Math.sin(ang) * dist);
          tree.add(bulb);
        }
      }
    });

    // Glowing Golden Star Topper
    const star = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.15, 0),
      new THREE.MeshStandardMaterial({ color: 0xffe478, emissive: 0xffb830, emissiveIntensity: 1.4, roughness: 0.25 })
    );
    star.position.y = 2.88;
    tree.add(star);

    const treeGlow = new THREE.PointLight(0xffcb66, 1.35, 5.5, 1.5);
    treeGlow.position.set(-0.3, 1.8, -0.2);
    tree.add(treeGlow);

    this.group.add(tree);
    this._addBoxCollider(5.72, 2.48, 1.15, 1.15);

    // 2. Antique Ticking Pendulum Wall Clock mounted beside Kitchen (x = 3.74, y = 2.55, z = -3.08)
    const clock = new THREE.Group();
    clock.position.set(3.74, 2.55, -3.08);
    const cCase = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.78, 0.16), darkWood);
    clock.add(cCase);
    const cFace = new THREE.Mesh(
      new THREE.CylinderGeometry(0.15, 0.15, 0.03, 10),
      new THREE.MeshStandardMaterial({ color: 0xfbf4e2 })
    );
    cFace.rotation.x = Math.PI / 2;
    cFace.position.set(0, 0.16, 0.085);
    clock.add(cFace);
    const hand1 = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.11, 0.02), new THREE.MeshBasicMaterial({ color: 0x22160e }));
    hand1.position.set(0, 0.19, 0.105);
    const hand2 = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.02, 0.02), new THREE.MeshBasicMaterial({ color: 0x22160e }));
    hand2.position.set(0.03, 0.16, 0.105);
    clock.add(hand1, hand2);

    this.clockPendulum = new THREE.Group();
    this.clockPendulum.position.set(0, -0.02, 0.09);
    const pRod = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.28, 0.02), brassMat);
    pRod.position.y = -0.14;
    const pBob = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.025, 8), brassMat);
    pBob.rotation.x = Math.PI / 2;
    pBob.position.y = -0.28;
    this.clockPendulum.add(pRod, pBob);
    clock.add(this.clockPendulum);
    this.group.add(clock);

    // 3. Entryway Timber Coat Rack with Hanging Burgundy Scarf & Brass Lantern (-3.55, 2.82)!
    const rack = new THREE.Group();
    rack.position.set(-3.55, 0, 2.82);
    const rBase = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.3, 0.08, 8), darkWood);
    rBase.position.y = 0.04;
    const rPole = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.06, 1.72, 6), darkWood);
    rPole.position.y = 0.88;
    rPole.castShadow = true;
    rack.add(rBase, rPole);
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2;
      const peg = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.04, 0.04), darkWood);
      peg.position.set(Math.cos(a) * 0.1, 1.62, Math.sin(a) * 0.1);
      peg.rotation.y = -a;
      peg.rotation.z = 0.45;
      rack.add(peg);
    }
    const hungScarf = new THREE.Mesh(
      new THREE.BoxGeometry(0.14, 0.56, 0.12),
      new THREE.MeshStandardMaterial({ color: 0xa63238, roughness: 0.88 })
    );
    hungScarf.position.set(0.14, 1.32, 0.06);
    const hungHat = new THREE.Mesh(
      new THREE.DodecahedronGeometry(0.15, 0),
      new THREE.MeshStandardMaterial({ color: 0xf6efe0, roughness: 0.9 })
    );
    hungHat.position.set(0, 1.78, 0);
    rack.add(hungScarf, hungHat);
    this.group.add(rack);
    this._addBoxCollider(-3.55, 2.82, 0.56, 0.56);
  }

  _buildCeilingBeamsAndLighting() {
    const darkWood = new THREE.MeshStandardMaterial({ color: 0x482612, roughness: 0.9 });
    const ironMat = new THREE.MeshStandardMaterial({ color: 0x2a2e35, metalness: 0.6, roughness: 0.45 });
    const glowBulb = new THREE.MeshStandardMaterial({
      color: 0xfff0be,
      emissive: 0xffb84a,
      emissiveIntensity: 1.55,
      roughness: 0.3,
    });

    // High exposed timber beams framing the northern ceiling edge (unobtrusive for 3/4 view!)
    const ridgeBeam = new THREE.Mesh(new THREE.BoxGeometry(13.6, 0.24, 0.28), darkWood);
    ridgeBeam.position.set(0, 3.74, -2.55);
    this.group.add(ridgeBeam);

    // Twin Wrought-Iron Pendant Lanterns hanging cleanly over Living & Dining zones
    for (const lx of [-2.4, 3.6]) {
      const pend = new THREE.Group();
      pend.position.set(lx, 3.7, -1.65);
      const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.72, 5), ironMat);
      rod.position.y = -0.36;
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.035, 5, 10), ironMat);
      ring.rotation.x = Math.PI / 2;
      ring.position.y = -0.74;
      pend.add(rod, ring);
      for (let k = 0; k < 4; k++) {
        const a = (k / 4) * Math.PI * 2;
        const b = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.16, 0.11), glowBulb);
        b.position.set(Math.cos(a) * 0.32, -0.66, Math.sin(a) * 0.32);
        pend.add(b);
      }
      // Soft dreamy warm glow halo around each wrought-iron pendant chandelier
      const pHalo = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: this.textures.fireGlowSoft,
          color: 0xffd280,
          transparent: true,
          opacity: 0.44,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
      );
      pHalo.position.set(0, -0.68, 0);
      pHalo.scale.set(1.55, 1.25, 1);
      pend.add(pHalo);
      this.group.add(pend);
    }

    // Balanced warm interior bounce fills
    this.roomFillWest = new THREE.PointLight(0xffcf8f, 1.55, 15, 1.35);
    this.roomFillWest.position.set(-3.4, 3.3, 0.4);
    this.group.add(this.roomFillWest);

    this.roomFillEast = new THREE.PointLight(0xffcf94, 1.65, 15, 1.35);
    this.roomFillEast.position.set(3.8, 3.3, 0.4);
    this.group.add(this.roomFillEast);
  }

  _buildOutdoorVista() {
    // REAL 3D WINTER WORLD RENDERED OUTSIDE THE ENLARGED NORTH, WEST & EAST WINDOWS!
    const rnd = createMulberry(3045);
    const vista = new THREE.Group();

    const snowGroundMat = new THREE.MeshStandardMaterial({ map: this.textures.snowGround, roughness: 0.92 });
    const snowMat = new THREE.MeshStandardMaterial({ map: this.textures.snowCap, roughness: 0.9 });
    const barkMat = new THREE.MeshStandardMaterial({ map: this.textures.bark, roughness: 0.94 });
    const leafMat = new THREE.MeshStandardMaterial({ map: this.textures.pineLeaves, roughness: 0.9 });
    const leafDarkMat = new THREE.MeshStandardMaterial({ map: this.textures.pineLeaves, color: 0xbfd6ca, roughness: 0.92 });
    const woodMat = new THREE.MeshStandardMaterial({ map: this.textures.woodPlank, roughness: 0.88 });
    const darkWood = new THREE.MeshStandardMaterial({ color: 0x4b2a15, roughness: 0.9 });
    const stoneMat = new THREE.MeshStandardMaterial({ map: this.textures.stoneWall, roughness: 0.94 });
    const cobbleMat = new THREE.MeshStandardMaterial({ map: this.textures.cobblePath, roughness: 0.88 });
    const ironMat = new THREE.MeshStandardMaterial({ color: 0x2d313a, roughness: 0.55, metalness: 0.55 });
    const berryMat = new THREE.MeshStandardMaterial({ color: 0xd93832, roughness: 0.5 });

    // 1. Non-overlapping snow ground sheets surrounding ALL 4 sides (zero coplanar snow-plane Z-fighting!)
    const northSnow = new THREE.Mesh(new THREE.PlaneGeometry(92, 46), snowGroundMat);
    northSnow.rotation.x = -Math.PI / 2;
    northSnow.position.set(0, -0.04, -26.5);
    northSnow.receiveShadow = true;
    vista.add(northSnow);

    const westSnow = new THREE.Mesh(new THREE.PlaneGeometry(39.2, 7.2), snowGroundMat);
    westSnow.rotation.x = -Math.PI / 2;
    westSnow.position.set(-26.4, -0.04, 0.1);
    vista.add(westSnow);

    const eastSnow = new THREE.Mesh(new THREE.PlaneGeometry(39.2, 7.2), snowGroundMat);
    eastSnow.rotation.x = -Math.PI / 2;
    eastSnow.position.set(26.4, -0.04, 0.1);
    vista.add(eastSnow);

    // Continuous snowy front yard & cozy diorama stone plinth along the South cutaway edge (eliminates raw sky band at bottom!)
    const southSnow = new THREE.Mesh(new THREE.PlaneGeometry(92, 34), snowGroundMat);
    southSnow.rotation.x = -Math.PI / 2;
    southSnow.position.set(0, -0.34, 20.6);
    southSnow.receiveShadow = true;
    vista.add(southSnow);

    const southPlinth = new THREE.Mesh(new THREE.BoxGeometry(14.1, 0.42, 0.36), stoneMat);
    southPlinth.position.set(0, -0.18, 3.68);
    vista.add(southPlinth);

    // Matching warm beveled ashlar stone pavers outside BOTH the south doorway & north panoramic window!
    const vistaPaverMats = [0xb7aa9a, 0xaa9e8f, 0xa0a5aa, 0xc1b5a5].map(
      (hex) => new THREE.MeshStandardMaterial({ map: this.textures.flagstonePaver, color: hex, roughness: 0.88 })
    );
    const makeVistaPaverGeo = (w, d) => {
      const r = 0.045;
      const hw = w / 2;
      const hd = d / 2;
      const sh = new THREE.Shape();
      sh.moveTo(-hw + r, -hd);
      sh.lineTo(hw - r, -hd);
      sh.quadraticCurveTo(hw, -hd, hw, -hd + r);
      sh.lineTo(hw, hd - r);
      sh.quadraticCurveTo(hw, hd, hw - r, hd);
      sh.lineTo(-hw + r, hd);
      sh.quadraticCurveTo(-hw, hd, -hw, hd - r);
      sh.lineTo(-hw, -hd + r);
      sh.quadraticCurveTo(-hw, -hd, -hw + r, -hd);
      const g = new THREE.ExtrudeGeometry(sh, { depth: 0.022, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.014, bevelSegments: 2 });
      g.rotateX(-Math.PI / 2);
      return g;
    };
    const vPaverH = makeVistaPaverGeo(0.62, 0.42);
    const vPaverV = makeVistaPaverGeo(0.46, 0.58);

    // Tidy warm stone walkway leading south outside the cutaway cabin doorway
    for (let row = 0; row < 4; row++) {
      const pz = 4.25 + row * 0.48;
      for (let col = -1; col <= 1; col++) {
        const px = col * 0.68 + (row % 2 === 1 ? 0.24 : -0.1);
        const st = new THREE.Mesh(vPaverH, vistaPaverMats[Math.abs(row * 3 + col) % vistaPaverMats.length]);
        st.position.set(px, -0.328, pz);
        st.receiveShadow = true;
        vista.add(st);
      }
    }

    // Rolling foreground snowdrifts right outside the windows
    const drifts = [
      [-4.2, -5.8, 4.8, 0.55, 2.8],
      [2.0, -7.2, 6.2, 0.52, 3.4],
      [8.2, -5.0, 5.2, 0.65, 3.6],
      [-9.5, -2.5, 4.8, 0.62, 4.5],
      [10.2, 1.5, 4.8, 0.62, 4.5],
    ];
    const driftTex = this.textures.snowGround.clone();
    driftTex.repeat.set(0.7, 0.7);
    driftTex.needsUpdate = true;
    const driftMat = new THREE.MeshStandardMaterial({ map: driftTex, color: 0xfbfdff, roughness: 0.88 });
    drifts.forEach(([dx, dz, sx, sy, sz], i) => {
      const m = new THREE.Mesh(makeSnowDriftGeometry(i * 2.3 + 1.1), driftMat);
      m.scale.set(sx * 0.55, sy * 1.3, sz * 0.55);
      m.position.set(dx, -0.02, dz);
      m.rotation.y = i * 1.3;
      m.receiveShadow = true;
      vista.add(m);
    });

    // 2. Curving Matching Ashlar Stone Garden Path & Rustic Fence visible through the North Panoramic Window!
    for (let i = 0; i < 14; i++) {
      const pz = -4.4 - i * 0.66;
      const px = 1.65 + Math.sin(i * 0.35) * 0.65;
      for (const side of [-0.26, 0.26]) {
        const slab = new THREE.Mesh(vPaverV, vistaPaverMats[(i + (side > 0 ? 1 : 0)) % vistaPaverMats.length]);
        slab.position.set(px + side, -0.025, pz + (side > 0 ? 0.16 : 0));
        slab.rotation.y = Math.cos(i * 0.35) * 0.18;
        slab.receiveShadow = true;
        vista.add(slab);
      }
    }

    // Rustic snowy fence running across the backyard clearing outside North & East windows
    for (let i = -8; i <= 9; i++) {
      if (i === 1 || i === 2) continue; // charming garden path opening!
      const fx = i * 1.45;
      const fz = -6.8;
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.88, 0.16), darkWood);
      post.position.set(fx, 0.44, fz);
      const cap = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.08, 0.19), snowMat);
      cap.position.set(fx, 0.91, fz);
      vista.add(post, cap);
      if (i < 9 && i !== 0 && i !== 1) {
        for (const ry of [0.3, 0.62]) {
          const rail = new THREE.Mesh(new THREE.BoxGeometry(1.48, 0.09, 0.09), woodMat);
          rail.position.set(fx + 0.72, ry, fz);
          vista.add(rail);
        }
      }
    }

    // 3. Glowing Outdoor Garden Lamp Posts right outside North Panoramic & East Dining Windows!
    const vistaLampCoords = [
      [3.15, -6.4],
      [9.4, 0.85],
    ];
    for (const [lx, lz] of vistaLampCoords) {
      const lg = new THREE.Group();
      lg.position.set(lx, 0, lz);
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.16, 2.35, 0.16), darkWood);
      post.position.y = 1.175;
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.09, 0.09), ironMat);
      arm.position.set(-0.22, 2.24, 0);
      const cap = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.08, 0.22), snowMat);
      cap.position.set(0, 2.38, 0);
      const lMat = new THREE.MeshStandardMaterial({
        color: 0xffe49e,
        emissive: new THREE.Color(0xffb444),
        emissiveIntensity: 1.4,
        roughness: 0.3,
      });
      this.vistaLampMats.push(lMat);
      const globe = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.3, 0.24), lMat);
      globe.position.set(-0.42, 1.98, 0);
      lg.add(post, arm, cap, globe);
      vista.add(lg);

      const pt = new THREE.PointLight(0xffb44c, 2.6, 11.5, 1.5);
      pt.position.set(lx - 0.42, 2.0, lz);
      vista.add(pt);
      this.vistaLampLights.push({ light: pt, baseIntensity: 3.0 });
    }

    // 4. Cute Wooden Birdhouse on Post right outside the North-West Study Window!
    const bh = new THREE.Group();
    bh.position.set(-4.25, 0, -5.65);
    const bhPost = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.75, 0.12), darkWood);
    bhPost.position.y = 0.875;
    const bhBox = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.44, 0.38), woodMat);
    bhBox.position.y = 1.95;
    const bhHole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.04, 7), new THREE.MeshBasicMaterial({ color: 0x1d120a }));
    bhHole.rotation.x = Math.PI / 2;
    bhHole.position.set(0, 1.96, 0.19);
    const bhRoof = new THREE.Mesh(new THREE.ConeGeometry(0.38, 0.28, 4), new THREE.MeshStandardMaterial({ color: 0x993e32 }));
    bhRoof.rotation.y = Math.PI / 4;
    bhRoof.position.y = 2.3;
    const bhSnow = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.18, 4), snowMat);
    bhSnow.rotation.y = Math.PI / 4;
    bhSnow.position.y = 2.39;
    bh.add(bhPost, bhBox, bhHole, bhRoof, bhSnow);
    vista.add(bh);

    // Winterberry bushes & snow-capped boulders outside the windows
    for (const [bx, bz] of [[-2.6, -5.8], [0.4, -6.2], [4.5, -5.9], [9.2, -0.8], [-9.2, 0.9]]) {
      const b = new THREE.Group();
      b.position.set(bx, 0, bz);
      const body = new THREE.Mesh(new THREE.DodecahedronGeometry(0.46, 0), new THREE.MeshStandardMaterial({ color: 0x26543b }));
      body.position.y = 0.34;
      const cap = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.12, 0.62), snowMat);
      cap.position.y = 0.64;
      b.add(body, cap);
      for (let k = 0; k < 5; k++) {
        const dot = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.09, 0.09), berryMat);
        dot.position.set((k - 2) * 0.14, 0.34 + (k % 2) * 0.12, 0.4);
        b.add(dot);
      }
      vista.add(b);
    }

    // 5. Layered 3D Snowy Pine Forest Outside ALL 4 Windows (Near, Mid & Far Depth for Real Parallax!)
    const treeSpecs = [
      // Near & Mid pines directly visible through NW Study & NE Panoramic Windows
      [-6.8, -6.4, 1.12], [-5.2, -9.2, 1.24], [-2.2, -8.8, 1.18], [0.5, -10.5, 1.32],
      [3.9, -9.0, 1.16], [6.4, -7.8, 1.22], [8.8, -9.8, 1.28], [-9.2, -8.2, 1.26],
      [-7.4, -14.2, 1.48], [-3.2, -15.4, 1.52], [1.6, -16.2, 1.58], [5.8, -14.8, 1.45],
      [10.2, -15.6, 1.55], [-11.8, -14.0, 1.52], [-15.5, -10.2, 1.4], [14.5, -10.8, 1.45],
      // Deep horizon forest silhouette
      [-10.5, -22.0, 1.85], [-4.5, -23.5, 1.9], [2.4, -22.8, 1.95], [8.5, -23.0, 1.85], [15.0, -21.5, 1.8],
      // Pines right outside the WEST Bedroom Window
      [-9.8, -2.2, 1.15], [-11.5, 1.4, 1.28], [-9.6, 3.8, 1.08], [-14.2, -0.5, 1.45], [-14.8, 4.2, 1.4],
      // Pines right outside the EAST Dining Window
      [10.2, -2.4, 1.15], [11.8, 1.6, 1.28], [10.0, 4.1, 1.1], [14.6, -0.4, 1.42], [15.2, 3.8, 1.45],
    ];

    for (const [tx, tz, scale] of treeSpecs) {
      const tree = new THREE.Group();
      tree.position.set(tx, 0, tz);
      tree.rotation.y = rnd() * Math.PI * 2;
      const s = scale * (0.94 + rnd() * 0.14);

      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.18 * s, 0.26 * s, 1.35 * s, 6), barkMat);
      trunk.position.y = 0.65 * s;
      tree.add(trunk);

      const tiers = [
        { r: 1.28, h: 1.02, y: 1.4 },
        { r: 1.0, h: 0.94, y: 2.18 },
        { r: 0.72, h: 0.84, y: 2.86 },
        { r: 0.44, h: 0.72, y: 3.44 },
      ];
      tiers.forEach((t, ti) => {
        const fol = new THREE.Mesh(
          new THREE.ConeGeometry(t.r * s, t.h * s, 7),
          ti % 2 === 0 ? leafMat : leafDarkMat
        );
        fol.position.y = t.y * s;
        fol.rotation.y = ti * 0.45;
        tree.add(fol);
        const cap = new THREE.Mesh(new THREE.ConeGeometry(t.r * 0.82 * s, t.h * 0.52 * s, 7), snowMat);
        cap.position.y = (t.y + t.h * 0.28) * s;
        cap.rotation.y = ti * 0.45;
        tree.add(cap);
      });
      vista.add(tree);
      this.vistaTrees.push({ mesh: tree, phase: tx * 0.4 + tz * 0.2 });
    }

    // 6. Majestic Snowy Mountain Peaks along the Far Horizon!
    const peakMat = new THREE.MeshStandardMaterial({ color: 0x7e94b0, roughness: 0.95 });
    const peakSpecs = [
      [-18, -35, 9.5, 11.5],
      [-6, -37, 11.0, 14.5],
      [7, -36, 10.5, 13.5],
      [20, -34, 9.8, 12.0],
      [-28, -14, 8.5, 10.5],
      [28, -14, 8.5, 10.5],
    ];
    for (const [mx, mz, mr, mh] of peakSpecs) {
      const peak = new THREE.Mesh(new THREE.ConeGeometry(mr, mh, 6), peakMat);
      peak.position.set(mx, mh * 0.48, mz);
      vista.add(peak);
      const cap = new THREE.Mesh(new THREE.ConeGeometry(mr * 0.52, mh * 0.5, 6), snowMat);
      cap.position.set(mx, mh * 0.74, mz);
      vista.add(cap);
    }

    // 7. Playful Animated Snow Rabbit visible hopping outside the big North Panoramic Window!
    const rab = new THREE.Group();
    const furMat = new THREE.MeshStandardMaterial({ color: 0xfbfdff, roughness: 0.9 });
    const pinkMat = new THREE.MeshStandardMaterial({ color: 0xf4a8b8, roughness: 0.85 });
    const rBody = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.26, 0.42), furMat);
    rBody.position.y = 0.16;
    const rHead = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.24, 0.26), furMat);
    rHead.position.set(0, 0.32, 0.18);
    for (const ex of [-0.07, 0.07]) {
      const ear = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.22, 0.06), furMat);
      ear.position.set(ex, 0.52, 0.14);
      rab.add(ear);
    }
    const rNose = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.05, 0.04), pinkMat);
    rNose.position.set(0, 0.29, 0.32);
    rab.add(rBody, rHead, rNose);
    rab.position.set(1.5, 0, -8.2);
    vista.add(rab);
    this.vistaRabbit = rab;

    // 8. Live 3D Outdoor Falling Snow Particles Strictly Outside the Cabin Windows!
    const snowCount = 460;
    const positions = new Float32Array(snowCount * 3);
    this.vistaSnowVel = [];
    for (let i = 0; i < snowCount; i++) {
      // Distribute across North vista (70%), West vista (15%), East vista (15%)
      let sx, sz;
      if (i < snowCount * 0.7) {
        sx = (Math.random() - 0.5) * 26;
        sz = -4.1 - Math.random() * 14.0;
      } else if (i < snowCount * 0.85) {
        sx = -7.3 - Math.random() * 8.5;
        sz = -5.0 + Math.random() * 11.0;
      } else {
        sx = 7.3 + Math.random() * 8.5;
        sz = -5.0 + Math.random() * 11.0;
      }
      positions[i * 3] = sx;
      positions[i * 3 + 1] = Math.random() * 10.5;
      positions[i * 3 + 2] = sz;
      this.vistaSnowVel.push({
        speed: 1.05 + Math.random() * 0.85,
        phase: Math.random() * Math.PI * 2,
        drift: 0.25 + Math.random() * 0.3,
      });
    }
    const snowGeo = new THREE.BufferGeometry();
    snowGeo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const snowPtMat = new THREE.PointsMaterial({
      map: this.textures.snowflake,
      size: 0.26,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      color: 0xffffff,
    });
    this.vistaSnowPoints = new THREE.Points(snowGeo, snowPtMat);
    vista.add(this.vistaSnowPoints);

    // Subtle stone foundation sill wrapping the outside base of the room
    const extStone = new THREE.Mesh(new THREE.BoxGeometry(13.8, 0.35, 0.4), stoneMat);
    extStone.position.set(0, 0.14, -3.55);
    vista.add(extStone);

    this.group.add(vista);
  }

  stokeFireplace() {
    this.fireBoost = Math.min(2.0, this.fireBoost + 0.55);
  }

  petCat() {
    this.catHappyTimer = 1.6;
  }

  setGiftHovered(hovered) {
    this.giftHovered = hovered;
  }

  setLetterHovered(hovered) {
    this.letterHovered = hovered;
  }

  setCakeHovered(hovered) {
    this.cakeHovered = hovered;
  }

  // ================= 🎂 Birthday cake =================

  _buildBirthdayCake(parent) {
    const cake = new THREE.Group();
    cake.position.set(0, 0.89, 0);
    parent.add(cake);
    this.cakeGroup = cake;

    const plateMat = new THREE.MeshStandardMaterial({ color: 0xf7f1e6, roughness: 0.35, metalness: 0.05 });
    const spongeMat = new THREE.MeshStandardMaterial({ color: 0xfff3e0, roughness: 0.75 });
    const frostMat = new THREE.MeshStandardMaterial({ color: 0xf7b7c4, roughness: 0.55 });
    const creamMat = new THREE.MeshStandardMaterial({ color: 0xfffaf2, roughness: 0.6 });
    const berryMat = new THREE.MeshStandardMaterial({ color: 0xd8333f, roughness: 0.45 });
    const leafMat = new THREE.MeshStandardMaterial({ color: 0x4e8c45, roughness: 0.7 });
    const candleColors = [0x8fd3ff, 0xffe169, 0xff9fb0, 0xb4f08a, 0xd6a8ff];

    // Cake stand
    const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.31, 0.31, 0.025, 14), plateMat);
    stand.position.y = 0.06;
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.1, 0.05, 8), plateMat);
    stem.position.y = 0.025;
    cake.add(stand, stem);

    // Bottom tier + pink drip frosting band
    const t1 = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.18, 12), spongeMat);
    t1.position.y = 0.165;
    t1.castShadow = true;
    const t1Frost = new THREE.Mesh(new THREE.CylinderGeometry(0.256, 0.256, 0.05, 12), frostMat);
    t1Frost.position.y = 0.235;
    cake.add(t1, t1Frost);
    // Little voxel drips hanging off the frosting
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2 + 0.13;
      const drip = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.04 + (i % 3) * 0.02, 0.03), frostMat);
      drip.position.set(Math.cos(a) * 0.252, 0.2 - (i % 3) * 0.01, Math.sin(a) * 0.252);
      drip.rotation.y = -a;
      cake.add(drip);
    }
    // Strawberries & cream dollops ringing the bottom tier
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const isBerry = i % 2 === 0;
      const dollop = new THREE.Mesh(
        isBerry ? new THREE.BoxGeometry(0.06, 0.06, 0.06) : new THREE.BoxGeometry(0.05, 0.04, 0.05),
        isBerry ? berryMat : creamMat
      );
      dollop.position.set(Math.cos(a) * 0.205, 0.285, Math.sin(a) * 0.205);
      dollop.rotation.y = a;
      cake.add(dollop);
      if (isBerry) {
        const lf = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.012, 0.04), leafMat);
        lf.position.set(Math.cos(a) * 0.205, 0.32, Math.sin(a) * 0.205);
        cake.add(lf);
      }
    }

    // Top tier
    const t2 = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.13, 12), spongeMat);
    t2.position.y = 0.325;
    t2.castShadow = true;
    const t2Frost = new THREE.Mesh(new THREE.CylinderGeometry(0.164, 0.164, 0.035, 12), frostMat);
    t2Frost.position.y = 0.38;
    cake.add(t2, t2Frost);

    // Candles
    const n = this.cakeCandleCount;
    const flameMat = new THREE.MeshBasicMaterial({ color: 0xffd75e });
    const flameCoreMat = new THREE.MeshBasicMaterial({ color: 0xfff6d0 });
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + 0.4;
      const r = n === 1 ? 0 : n <= 4 ? 0.08 : 0.105;
      const cx = Math.cos(a) * r;
      const cz = Math.sin(a) * r;
      const candle = new THREE.Mesh(
        new THREE.BoxGeometry(0.026, 0.12, 0.026),
        new THREE.MeshStandardMaterial({ color: candleColors[i % candleColors.length], roughness: 0.5 })
      );
      candle.position.set(cx, 0.457, cz);
      cake.add(candle);
      const wick = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.02, 0.008), new THREE.MeshBasicMaterial({ color: 0x2a1a10 }));
      wick.position.set(cx, 0.527, cz);
      cake.add(wick);
      const fl = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.055, 0.03), flameMat);
      fl.position.set(cx, 0.565, cz);
      const core = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.025, 0.014), flameCoreMat);
      core.position.y = -0.008;
      fl.add(core);
      cake.add(fl);
      this.cakeFlames.push({ mesh: fl, baseY: 0.565, phase: i * 1.7, wickX: cx, wickZ: cz });
    }

    // Warm candle glow
    this.cakeLight = new THREE.PointLight(0xffc46b, 1.1, 2.6, 1.6);
    this.cakeLight.position.set(0, 0.78, 0);
    cake.add(this.cakeLight);

    // Floating golden "interact" sparkle like the gifts & letter have
    const sp = new THREE.Mesh(new THREE.OctahedronGeometry(0.07, 0), new THREE.MeshBasicMaterial({ color: 0xffe882 }));
    sp.position.set(0, 0.82, 0);
    cake.add(sp);
    this.cakeSparkle = sp;

    // Generous invisible click volume
    const hit = new THREE.Mesh(
      new THREE.BoxGeometry(0.72, 0.75, 0.72),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })
    );
    hit.position.y = 0.36;
    cake.add(hit);
    this.cakeHitMeshes.push(hit);
  }

  blowOutCake(silent = false) {
    if (!this.cakeLit) return false;
    this.cakeLit = false;
    for (const f of this.cakeFlames) f.mesh.visible = false;
    if (silent) return true;
    // Thin grey smoke curls rising from every wick
    const smokeGeo = new THREE.BoxGeometry(0.035, 0.035, 0.035);
    for (const f of this.cakeFlames) {
      for (let k = 0; k < 4; k++) {
        const m = new THREE.Mesh(smokeGeo, new THREE.MeshBasicMaterial({ color: 0xd9d4cc, transparent: true, opacity: 0 }));
        this.cakeGroup.add(m);
        this.cakeSmoke.push({ mesh: m, x: f.wickX, z: f.wickZ, delay: k * 0.35 + Math.random() * 0.2, age: 0, life: 2.4, phase: Math.random() * 6 });
      }
    }
    // Confetti burst from the cake (reuses the gift confetti system)
    const world = new THREE.Vector3();
    this.cakeGroup.getWorldPosition(world);
    this._spawnConfettiAt(world.x, world.y + 0.55, world.z, 34);
    return true;
  }

  relightCake() {
    this.cakeLit = true;
    for (const f of this.cakeFlames) f.mesh.visible = true;
  }

  _spawnConfettiAt(x, y, z, count) {
    const colors = [0xffe066, 0xff6b6b, 0xfff5d6, 0x70c4ff, 0xf5a623, 0xb4f08a, 0xd6a8ff];
    const geo = new THREE.BoxGeometry(0.07, 0.07, 0.07);
    for (let i = 0; i < count; i++) {
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: colors[i % colors.length] }));
      m.position.set(x + (Math.random() - 0.5) * 0.3, y, z + (Math.random() - 0.5) * 0.3);
      this.group.add(m);
      const ang = Math.random() * Math.PI * 2;
      const spd = 0.7 + Math.random() * 1.6;
      this.giftConfetti.push({
        mesh: m,
        vx: Math.cos(ang) * spd,
        vy: 2.4 + Math.random() * 2.0,
        vz: Math.sin(ang) * spd,
        age: 0,
        life: 1.1 + Math.random() * 0.6,
        floorY: 0.05,
      });
    }
  }

  _updateCake(dt, elapsed) {
    if (!this.cakeGroup) return;
    for (const f of this.cakeFlames) {
      if (!f.mesh.visible) continue;
      const s = 0.82 + 0.24 * Math.sin(elapsed * 14 + f.phase) + 0.08 * Math.sin(elapsed * 23 + f.phase * 2);
      f.mesh.scale.set(1, s, 1);
      f.mesh.position.y = f.baseY + (s - 1) * 0.02;
      f.mesh.rotation.z = Math.sin(elapsed * 6 + f.phase) * 0.12;
    }
    if (this.cakeLight) {
      const target = this.cakeLit ? 1.1 * (0.9 + 0.1 * Math.sin(elapsed * 12)) : 0;
      this.cakeLight.intensity = THREE.MathUtils.lerp(this.cakeLight.intensity, target, Math.min(1, dt * 6));
    }
    if (this.cakeSparkle) {
      this.cakeSparkle.visible = this.cakeLit;
      this.cakeSparkle.position.y = 0.82 + Math.sin(elapsed * 3.9) * 0.06;
      this.cakeSparkle.rotation.y = elapsed * 2.7;
      this.cakeSparkle.scale.setScalar((this.cakeHovered ? 1.38 : 0.92) + 0.22 * Math.sin(elapsed * 5.3));
    }
    for (let i = this.cakeSmoke.length - 1; i >= 0; i--) {
      const p = this.cakeSmoke[i];
      p.age += dt;
      const t = (p.age - p.delay) / p.life;
      if (t < 0) continue;
      if (t >= 1) {
        this.cakeGroup.remove(p.mesh);
        p.mesh.material.dispose();
        this.cakeSmoke.splice(i, 1);
        continue;
      }
      p.mesh.position.set(
        p.x + Math.sin(t * 7 + p.phase) * 0.05 * t,
        0.54 + t * 0.6,
        p.z + Math.cos(t * 5 + p.phase) * 0.04 * t
      );
      p.mesh.scale.setScalar(0.6 + t * 1.6);
      p.mesh.material.opacity = Math.sin(t * Math.PI) * 0.5;
    }
  }

  openGiftPile() {
    this.giftOpened = true;
    // Festive 3D golden & crimson confetti burst from the hero gift box!
    const colors = [0xffe066, 0xff6b6b, 0xfff5d6, 0x70c4ff, 0xf5a623];
    const geo = new THREE.BoxGeometry(0.08, 0.08, 0.08);
    for (let i = 0; i < 24; i++) {
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: colors[i % colors.length] }));
      m.position.set(
        this.giftPilePos.x + (Math.random() - 0.5) * 0.5,
        0.65,
        this.giftPilePos.z + (Math.random() - 0.5) * 0.5
      );
      this.group.add(m);
      const ang = Math.random() * Math.PI * 2;
      const spd = 0.9 + Math.random() * 1.9;
      this.giftConfetti.push({
        mesh: m,
        vx: Math.cos(ang) * spd,
        vy: 2.2 + Math.random() * 2.2,
        vz: Math.sin(ang) * spd,
        age: 0,
        life: 0.95 + Math.random() * 0.45,
      });
    }
  }

  update(dt, elapsed, skySample, snowLevel) {
    if (!this.group.visible) return;
    this.fireBoost = Math.max(1.0, this.fireBoost - dt * 0.02);
    this._updateCake(dt, elapsed);

    // 1. Organic Sculpted Hearth Fire, Pulsing Embers, Soft Fire Halo & Rising Chimney Sparks!
    const flick = 0.89 + 0.09 * Math.sin(elapsed * 11.2) + 0.06 * Math.cos(elapsed * 17.6);
    const boostSqrt = Math.sqrt(this.fireBoost);
    this.hearthLight.intensity = 4.35 * this.fireBoost * flick;

    for (const f of this.hearthFlames) {
      const wave1 = Math.sin(elapsed * f.speed + f.phase);
      const wave2 = Math.cos(elapsed * (f.speed * 1.47) + f.phase * 1.7);
      const scaleY = (0.86 + 0.26 * wave1 + 0.1 * wave2) * boostSqrt;
      const scaleXZ = (0.92 + 0.12 * wave2) * Math.pow(this.fireBoost, 0.3);
      f.mesh.scale.set(scaleXZ, scaleY, scaleXZ);
      f.mesh.rotation.z = f.tilt + wave1 * 0.14 + wave2 * 0.06;
      f.mesh.rotation.x = wave2 * 0.08;
    }

    for (const em of this.emberChunks) {
      em.mat.emissiveIntensity = (1.1 + 0.55 * Math.sin(elapsed * 3.8 + em.phase)) * boostSqrt;
    }

    if (this.hearthGlowSprite) {
      const gs = (0.94 + 0.1 * Math.sin(elapsed * 9.5)) * boostSqrt;
      this.hearthGlowSprite.scale.set(gs, gs, 1);
      this.hearthGlowSprite.material.opacity = 0.62 + 0.15 * flick;
    }

    for (const sp of this.hearthSparks) {
      const t = ((elapsed * sp.speed + sp.phase) % 1 + 1) % 1;
      sp.mesh.position.set(
        sp.xOff + Math.sin(elapsed * 5.2 + sp.phase) * 0.1,
        0.38 + t * 0.86 * boostSqrt,
        0.42 + Math.cos(elapsed * 4.0 + sp.phase) * 0.04
      );
      sp.mesh.scale.setScalar((1 - t * 0.78) * 1.05);
      sp.mesh.material.opacity = Math.sin(t * Math.PI) * 0.95;
    }

    // 1b. Gift Pile Interactive Lid, Hover Sparkles & Festive Confetti!
    if (this.heroGiftLid) {
      const targetLidRot = this.giftOpened ? -0.95 : this.giftHovered ? -0.22 + Math.sin(elapsed * 9) * 0.06 : 0;
      this.heroGiftLid.rotation.x = THREE.MathUtils.lerp(this.heroGiftLid.rotation.x, targetLidRot, Math.min(1, dt * 8));
    }
    for (const sp of this.giftSparkles) {
      sp.mesh.position.y = sp.baseY + Math.sin(elapsed * 3.8 + sp.phase) * 0.09;
      sp.mesh.rotation.y = elapsed * 2.8;
      const sc = (this.giftHovered ? 1.35 : 0.95) + 0.25 * Math.sin(elapsed * 5.2 + sp.phase);
      sp.mesh.scale.setScalar(sc);
    }
    if (this.letterSparkle) {
      this.letterSparkle.position.y = 0.28 + Math.sin(elapsed * 4.1) * 0.06;
      this.letterSparkle.rotation.y = elapsed * 2.6;
      const lsc = (this.letterHovered ? 1.38 : 0.92) + 0.22 * Math.sin(elapsed * 5.0);
      this.letterSparkle.scale.setScalar(lsc);
    }
    for (let i = this.giftConfetti.length - 1; i >= 0; i--) {
      const p = this.giftConfetti[i];
      p.age += dt;
      if (p.age >= p.life) {
        this.group.remove(p.mesh);
        this.giftConfetti.splice(i, 1);
        continue;
      }
      p.vy -= 6.5 * dt;
      p.mesh.position.x += p.vx * dt;
      p.mesh.position.y = Math.max(0.05, p.mesh.position.y + p.vy * dt);
      p.mesh.position.z += p.vz * dt;
      p.mesh.rotation.x += dt * 7;
      p.mesh.rotation.y += dt * 5;
      p.mesh.scale.setScalar(1 - p.age / p.life);
    }

    // 1c. Swinging Clock Pendulum & Twinkling Indoor Winter Pine Tree Bulbs!
    if (this.clockPendulum) {
      this.clockPendulum.rotation.z = Math.sin(elapsed * 3.14) * 0.24;
    }
    for (const tl of this.treeLightMats) {
      tl.mat.emissiveIntensity = 0.85 + 0.85 * (0.5 + 0.5 * Math.sin(elapsed * 3.6 + tl.phase));
    }

    // 2. Flickering Candles (Mantel, Desk & Dining Table)
    for (const c of this.candleFlames) {
      const s = 0.85 + 0.2 * Math.sin(elapsed * 13 + c.phase);
      c.mesh.scale.set(1, s, 1);
      c.mesh.position.y = c.baseY + (s - 1) * 0.03;
    }

    // 3. Simmering Soup & Hot Cocoa Steam Wisps + Broth Bubbles!
    for (const w of this.steamWisps) {
      const t = ((elapsed * 0.55 + w.phase) % 1 + 1) % 1;
      w.mesh.position.set(
        w.baseX + Math.sin(elapsed * 2.2 + w.phase) * 0.06,
        w.baseY + t * w.height,
        w.baseZ + Math.cos(elapsed * 1.8 + w.phase) * 0.05
      );
      w.mesh.scale.setScalar(0.55 + t * 0.75);
      w.mesh.material.opacity = Math.sin(t * Math.PI) * 0.38;
    }
    for (const b of this.soupBubbles) {
      const t = ((elapsed * 1.35 + b.phase) % 1 + 1) % 1;
      const sc = Math.sin(t * Math.PI);
      b.mesh.scale.setScalar(0.35 + sc * 0.95);
      b.mesh.position.y = 0.34 + sc * 0.025;
      b.mesh.material.opacity = sc * 0.85;
    }

    // 4. Sleeping Tabby Cat gentle breathing & happy purr wiggle (stays cleanly above fleece pad y = 0.115!)
    if (this.catHappyTimer > 0) {
      this.catHappyTimer = Math.max(0, this.catHappyTimer - dt);
      this.catBody.position.y = 0.115 + Math.abs(Math.sin(this.catHappyTimer * 12)) * 0.055;
      this.catTail.rotation.y = Math.sin(elapsed * 12) * 0.15;
    } else {
      const breath = 1 + Math.sin(elapsed * 2.2) * 0.032;
      this.catBody.scale.set(1, breath, 1);
      this.catBody.position.y = 0.115;
      this.catTail.rotation.y = Math.sin(elapsed * 1.8) * 0.075;
    }

    // 5. Soft Window Sun/Moon Light Shafts & Floor Glow Pools synced live to Outdoor Sky!
    // Gentle cool silver moonlight at night, warm amber at dawn/dusk, crisp sunlight at noon
    const shaftColor = skySample.night > 0.75
      ? new THREE.Color(0x9ec0f0)
      : skySample.sun.clone().lerp(skySample.hor, 0.32);
    const dayStrength = Math.max(0, 1 - skySample.night * 0.92);
    for (const mat of this.sunShaftMaterials) {
      mat.color.copy(shaftColor);
      mat.opacity = 0.03 + dayStrength * 0.14;
    }
    for (const mat of this.floorGlowMaterials) {
      mat.color.copy(shaftColor);
      mat.opacity = 0.05 + dayStrength * 0.2;
    }

    // 6. Outdoor Vista Lamp Posts glow warmly at dusk/night!
    const lampGlow = THREE.MathUtils.clamp((skySample.night - 0.14) / 0.55, 0, 1);
    for (const m of this.vistaLampMats) {
      m.emissiveIntensity = 0.3 + lampGlow * 1.65;
    }
    for (const l of this.vistaLampLights) {
      l.light.intensity = l.baseIntensity * lampGlow * (0.94 + 0.06 * Math.sin(elapsed * 7));
    }

    // 7. Gentle breeze swaying pine trees outside all 4 windows!
    for (const t of this.vistaTrees) {
      t.mesh.rotation.z = Math.sin(elapsed * 1.05 + t.phase) * 0.022;
    }

    // 8. Playful outdoor rabbit hopping across the snowfield outside the big North window!
    if (this.vistaRabbit) {
      const ang = elapsed * 0.32;
      const rx = 1.6 + Math.sin(ang) * 2.1;
      const rz = -8.4 + Math.cos(ang * 0.7) * 0.9;
      const dx = rx - this.vistaRabbit.position.x;
      const dz = rz - this.vistaRabbit.position.z;
      this.vistaRabbit.position.x = rx;
      this.vistaRabbit.position.z = rz;
      this.vistaRabbit.position.y = Math.abs(Math.sin(elapsed * 6.5)) * 0.22;
      this.vistaRabbit.rotation.y = Math.atan2(dx, dz);
    }

    // 9. Live 3D Outdoor Falling Snow outside the windows!
    this.vistaSnowPoints.visible = snowLevel > 0;
    if (snowLevel > 0) {
      const mult = snowLevel === 2 ? 1.85 : 1.0;
      const posAttr = this.vistaSnowPoints.geometry.getAttribute("position");
      const arr = posAttr.array;
      for (let i = 0; i < this.vistaSnowVel.length; i++) {
        const v = this.vistaSnowVel[i];
        arr[i * 3] += Math.sin(elapsed * 1.1 + v.phase) * v.drift * mult * dt;
        arr[i * 3 + 1] -= v.speed * mult * dt;
        if (arr[i * 3 + 1] < 0) {
          arr[i * 3 + 1] = 10.5;
        }
      }
      posAttr.needsUpdate = true;
    }
  }
}
