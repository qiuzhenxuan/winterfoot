import * as THREE from "three";

export const CROP_DEFS = {
  carrot: {
    id: "carrot",
    name: "胡萝卜",
    emoji: "🥕",
    price: 35,
    seedCost: 15,
    stages: 3, // 0=seed, 1=sprout, 2=growing, 3=mature
    color: 0xf27922,
  },
  radish: {
    id: "radish",
    name: "白萝卜",
    emoji: "🫜",
    price: 42,
    seedCost: 18,
    stages: 3,
    color: 0xe8e1df,
  },
  cabbage: {
    id: "cabbage",
    name: "雪球卷心菜",
    emoji: "🥬",
    price: 55,
    seedCost: 22,
    stages: 3,
    color: 0x8bd19c,
  },
  pumpkin: {
    id: "pumpkin",
    name: "冬日小南瓜",
    emoji: "🎃",
    price: 75,
    seedCost: 30,
    stages: 3,
    color: 0xe68422,
  },
};

export class FarmSystem {
  constructor(scene, textures, world) {
    this.scene = scene;
    this.textures = textures;
    this.world = world;

    this.cols = 6;
    this.rows = 4;
    this.tileSize = 1.18;
    this.centerX = -4.8;
    this.centerZ = 3.15;
    this.originX = this.centerX - ((this.cols - 1) * this.tileSize) / 2;
    this.originZ = this.centerZ - ((this.rows - 1) * this.tileSize) / 2;

    this.group = new THREE.Group();
    this.scene.add(this.group);

    this.matSnow = new THREE.MeshStandardMaterial({ map: textures.soilSnow, roughness: 0.94 });
    this.matDry = new THREE.MeshStandardMaterial({ map: textures.soilDry, roughness: 0.95 });
    this.matWet = new THREE.MeshStandardMaterial({ map: textures.soilWet, roughness: 0.65 });

    this.tiles = [];
    this.tileMeshes = [];
    this.hoveredTile = null;

    this._initCropAssets();
    this._buildTiles();
    this._buildSelectionReticle();
    this._seedStarterGarden();
  }

  _initCropAssets() {
    // Reusable sculpted Lathe profiles & leaf geometries for high-detail, fast-rendering winter vegetables!
    const carrotPts = [
      new THREE.Vector2(0.03, 0.0),
      new THREE.Vector2(0.085, 0.06),
      new THREE.Vector2(0.115, 0.13),
      new THREE.Vector2(0.128, 0.2),
      new THREE.Vector2(0.118, 0.255),
      new THREE.Vector2(0.072, 0.285),
      new THREE.Vector2(0.0, 0.29),
    ];
    this.geoCarrotRoot = new THREE.LatheGeometry(carrotPts, 10);

    const radishPts = [
      new THREE.Vector2(0.035, 0.0),
      new THREE.Vector2(0.115, 0.05),
      new THREE.Vector2(0.155, 0.12),
      new THREE.Vector2(0.15, 0.19),
      new THREE.Vector2(0.11, 0.245),
      new THREE.Vector2(0.0, 0.265),
    ];
    this.geoRadishBulb = new THREE.LatheGeometry(radishPts, 10);

    const radishCrownPts = [
      new THREE.Vector2(0.154, 0.16),
      new THREE.Vector2(0.145, 0.205),
      new THREE.Vector2(0.105, 0.25),
      new THREE.Vector2(0.0, 0.27),
    ];
    this.geoRadishCrown = new THREE.LatheGeometry(radishCrownPts, 10);

    this.geoSoilMound = new THREE.SphereGeometry(0.18, 8, 5, 0, Math.PI * 2, 0, Math.PI * 0.5);
    this.geoSoilMound.scale(1.0, 0.34, 1.0);

    this.geoBroadLeaf = new THREE.SphereGeometry(0.12, 8, 6);
    this.geoBroadLeaf.scale(1.35, 0.22, 0.78);

    this.geoCabbageCup = new THREE.SphereGeometry(0.24, 10, 7, 0, Math.PI * 2, 0, Math.PI * 0.62);
    this.geoPumpkinLobe = new THREE.SphereGeometry(0.21, 10, 9);
    this.geoPumpkinLobe.scale(0.68, 0.96, 1.05);

    this.cropMats = {
      soilMound: new THREE.MeshStandardMaterial({ color: 0x5c3a21, roughness: 0.96 }),
      seed: new THREE.MeshStandardMaterial({ color: 0xdfc486, roughness: 0.88 }),
      leafDark: new THREE.MeshStandardMaterial({ color: 0x2b7537, roughness: 0.82 }),
      leafMid: new THREE.MeshStandardMaterial({ color: 0x3e9647, roughness: 0.8 }),
      leafBright: new THREE.MeshStandardMaterial({ color: 0x5bbd5c, roughness: 0.78 }),
      leafRib: new THREE.MeshStandardMaterial({ color: 0x9bd68d, roughness: 0.82 }),
      carrot: new THREE.MeshStandardMaterial({ color: 0xf2701c, roughness: 0.62 }),
      carrotRing: new THREE.MeshStandardMaterial({ color: 0xd45610, roughness: 0.72 }),
      radishWhite: new THREE.MeshStandardMaterial({ color: 0xfaf5ef, roughness: 0.58 }),
      radishRose: new THREE.MeshStandardMaterial({ color: 0xd64578, roughness: 0.62 }),
      cabOuter: new THREE.MeshStandardMaterial({ color: 0x3f8a52, roughness: 0.82, side: THREE.DoubleSide }),
      cabMid: new THREE.MeshStandardMaterial({ color: 0x7ec992, roughness: 0.78, side: THREE.DoubleSide }),
      cabHeart: new THREE.MeshStandardMaterial({ color: 0xc2ebd0, roughness: 0.75 }),
      cabFrost: new THREE.MeshStandardMaterial({ color: 0xeef9f2, roughness: 0.72 }),
      pumpRipeA: new THREE.MeshStandardMaterial({ color: 0xeb761a, roughness: 0.65 }),
      pumpRipeB: new THREE.MeshStandardMaterial({ color: 0xd66212, roughness: 0.68 }),
      pumpGrowA: new THREE.MeshStandardMaterial({ color: 0xb89638, roughness: 0.72 }),
      pumpGrowB: new THREE.MeshStandardMaterial({ color: 0x9c822c, roughness: 0.75 }),
      stem: new THREE.MeshStandardMaterial({ color: 0x3f6928, roughness: 0.88 }),
      vine: new THREE.MeshStandardMaterial({ color: 0x337030, roughness: 0.85 }),
      sparkle: new THREE.MeshBasicMaterial({ color: 0xfff08a }),
    };
  }

  _buildTiles() {
    const tileGeo = new THREE.BoxGeometry(this.tileSize - 0.08, 0.1, this.tileSize - 0.08);
    // Detailed raised timber garden bed frame with corner posts & snowy trim
    const borderMat = new THREE.MeshStandardMaterial({ map: this.textures.woodPlank, roughness: 0.9 });
    const postMat = new THREE.MeshStandardMaterial({ color: 0x563218, roughness: 0.92 });
    const fullW = this.cols * this.tileSize + 0.24;
    const fullD = this.rows * this.tileSize + 0.24;
    const bedBase = new THREE.Mesh(new THREE.BoxGeometry(fullW, 0.08, fullD), borderMat);
    bedBase.position.set(this.centerX, 0.04, this.centerZ);
    bedBase.receiveShadow = true;
    this.group.add(bedBase);

    // Timber edging rails & corner stakes around the garden bed
    const railH = 0.14;
    for (const sz of [-fullD / 2, fullD / 2]) {
      const rH = new THREE.Mesh(new THREE.BoxGeometry(fullW + 0.06, railH, 0.1), borderMat);
      rH.position.set(this.centerX, railH / 2, this.centerZ + sz);
      rH.castShadow = true;
      this.group.add(rH);
    }
    for (const sx of [-fullW / 2, fullW / 2]) {
      const rV = new THREE.Mesh(new THREE.BoxGeometry(0.1, railH, fullD + 0.06), borderMat);
      rV.position.set(this.centerX + sx, railH / 2, this.centerZ);
      rV.castShadow = true;
      this.group.add(rV);
    }
    for (const sx of [-fullW / 2, fullW / 2]) {
      for (const sz of [-fullD / 2, fullD / 2]) {
        const stake = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.28, 0.16), postMat);
        stake.position.set(this.centerX + sx, 0.14, this.centerZ + sz);
        stake.castShadow = true;
        this.group.add(stake);
      }
    }

    // Little wooden row marker signposts at north edge of garden
    const markerColors = [0xf27922, 0xe8e1df, 0x8bd19c, 0xe68422];
    for (let i = 0; i < 4; i++) {
      const mx = this.originX + i * this.tileSize * 1.65;
      const mz = this.centerZ - fullD / 2 - 0.12;
      const st = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.36, 0.06), postMat);
      st.position.set(mx, 0.18, mz);
      const tag = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.16, 0.05), borderMat);
      tag.position.set(mx, 0.36, mz + 0.02);
      const dot = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.08, 0.06), new THREE.MeshStandardMaterial({ color: markerColors[i] }));
      dot.position.set(mx, 0.36, mz + 0.03);
      this.group.add(st, tag, dot);
    }

    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const x = this.originX + c * this.tileSize;
        const z = this.originZ + r * this.tileSize;
        const mesh = new THREE.Mesh(tileGeo, this.matSnow);
        mesh.position.set(x, 0.055, z);
        mesh.receiveShadow = true;
        this.group.add(mesh);

        const tile = {
          col: c,
          row: r,
          x,
          z,
          mesh,
          tilled: false,
          watered: false,
          crop: null, // { type, stage, mesh, swayPhase, sparkle }
        };
        mesh.userData.farmTile = tile;
        this.tiles.push(tile);
        this.tileMeshes.push(mesh);
      }
    }
  }

  _buildSelectionReticle() {
    const g = new THREE.Group();
    const s = this.tileSize * 0.49;
    const barMat = new THREE.MeshBasicMaterial({ color: 0xffe46b, transparent: true, opacity: 0.92 });
    const thickness = 0.07;
    const len = this.tileSize * 0.96;

    const north = new THREE.Mesh(new THREE.BoxGeometry(len, 0.04, thickness), barMat);
    north.position.set(0, 0.13, -s);
    const south = north.clone();
    south.position.set(0, 0.13, s);
    const east = new THREE.Mesh(new THREE.BoxGeometry(thickness, 0.04, len), barMat);
    east.position.set(s, 0.13, 0);
    const west = east.clone();
    west.position.set(-s, 0.13, 0);

    g.add(north, south, east, west);
    g.visible = false;
    this.reticle = g;
    this.group.add(g);
  }

  _seedStarterGarden() {
    // Make the doorstep vegetable garden look alive & abundant on the very first frame!
    const preset = [
      // Row 0 (closest to cottage door): iconic Carrots ready to pick & growing!
      { r: 0, c: 0, type: "carrot", stage: 3, watered: true },
      { r: 0, c: 1, type: "carrot", stage: 3, watered: true },
      { r: 0, c: 2, type: "carrot", stage: 2, watered: true },
      { r: 0, c: 3, type: "radish", stage: 3, watered: true },
      { r: 0, c: 4, type: "radish", stage: 2, watered: false },
      { r: 0, c: 5, type: "carrot", stage: 3, watered: true },
      // Row 1: mix of Carrots, Radishes & Snow Cabbages
      { r: 1, c: 0, type: "carrot", stage: 2, watered: true },
      { r: 1, c: 1, type: "carrot", stage: 3, watered: true },
      { r: 1, c: 2, type: "cabbage", stage: 3, watered: true },
      { r: 1, c: 3, type: "cabbage", stage: 2, watered: true },
      { r: 1, c: 4, type: "radish", stage: 3, watered: true },
      { r: 1, c: 5, type: "cabbage", stage: 1, watered: true },
      // Row 2: Winter Pumpkins & fresh tilled beds
      { r: 2, c: 0, type: "pumpkin", stage: 3, watered: true },
      { r: 2, c: 1, type: "pumpkin", stage: 2, watered: true },
      { r: 2, c: 2, type: "carrot", stage: 1, watered: false },
      { r: 2, c: 3, type: null, stage: 0, watered: false, tilledOnly: true },
      { r: 2, c: 4, type: "pumpkin", stage: 2, watered: true },
      { r: 2, c: 5, type: null, stage: 0, watered: false, tilledOnly: true },
      // Row 3: open tilled & snowy tiles inviting the player to till & plant right away!
      { r: 3, c: 0, type: null, stage: 0, watered: false, tilledOnly: true },
      { r: 3, c: 1, type: null, stage: 0, watered: false, tilledOnly: true },
    ];

    for (const p of preset) {
      const tile = this.getTileAt(p.c, p.r);
      if (!tile) continue;
      tile.tilled = true;
      tile.watered = !!p.watered;
      this._refreshTileMaterial(tile);
      if (p.type) {
        tile.crop = {
          type: p.type,
          stage: p.stage,
          mesh: null,
          swayPhase: (p.r * 3 + p.c) * 1.1,
          sparkle: null,
        };
        this._rebuildCropMesh(tile);
      }
    }
  }

  getTileAt(col, row) {
    if (col < 0 || col >= this.cols || row < 0 || row >= this.rows) return null;
    return this.tiles[row * this.cols + col];
  }

  getTileNearWorld(x, z, maxDist = 1.05) {
    let best = null;
    let bestD = maxDist;
    for (const t of this.tiles) {
      const d = Math.hypot(t.x - x, t.z - z);
      if (d < bestD) {
        bestD = d;
        best = t;
      }
    }
    return best;
  }

  _refreshTileMaterial(tile) {
    if (!tile.tilled) tile.mesh.material = this.matSnow;
    else if (tile.watered) tile.mesh.material = this.matWet;
    else tile.mesh.material = this.matDry;
  }

  _rebuildCropMesh(tile) {
    if (tile.crop && tile.crop.mesh) {
      this.group.remove(tile.crop.mesh);
      tile.crop.mesh = null;
      tile.crop.sparkle = null;
    }
    if (!tile.crop) return;

    const g = new THREE.Group();
    g.position.set(tile.x, 0.11, tile.z);
    const { type, stage } = tile.crop;
    const M = this.cropMats;

    if (stage === 0) {
      // Neat little loosened soil hillock with plump golden seeds nestled in!
      const mound = new THREE.Mesh(this.geoSoilMound, M.soilMound);
      mound.scale.set(1.6, 1.0, 1.6);
      g.add(mound);
      for (const [ox, oz] of [[-0.18, -0.14], [0.16, -0.1], [-0.06, 0.16], [0.18, 0.14], [0.02, -0.02]]) {
        const s = new THREE.Mesh(new THREE.SphereGeometry(0.048, 6, 5), M.seed);
        s.scale.set(1.2, 0.75, 0.85);
        s.position.set(ox, 0.04, oz);
        s.rotation.y = ox * 10;
        g.add(s);
      }
    } else if (stage === 1) {
      // Delicate twin baby sprouts with sculpted oval cotyledon leaves
      for (const [ox, oz, rot] of [[-0.17, -0.08, 0.3], [0.16, 0.11, -0.6]]) {
        const sg = new THREE.Group();
        sg.position.set(ox, 0, oz);
        sg.rotation.y = rot;
        const mound = new THREE.Mesh(this.geoSoilMound, M.soilMound);
        mound.scale.set(0.75, 0.8, 0.75);
        sg.add(mound);
        const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.032, 0.2, 6), M.leafDark);
        stem.position.y = 0.1;
        sg.add(stem);
        for (const sgn of [-1, 1]) {
          const leaf = new THREE.Mesh(this.geoBroadLeaf, M.leafBright);
          leaf.scale.set(0.68, 0.8, 0.68);
          leaf.position.set(sgn * 0.09, 0.2, 0);
          leaf.rotation.z = sgn * -0.42;
          sg.add(leaf);
        }
        g.add(sg);
      }
    } else if (type === "carrot") {
      // Sculpted Lathe Carrot Crowns peeking out of loose earth mounds with lush feathery fern-frond foliage!
      const offsets = stage === 2
        ? [[-0.19, -0.02, 0.2], [0.19, 0.08, -0.7]]
        : [[-0.22, -0.17, 0.4], [0.22, -0.11, -0.8], [-0.01, 0.22, 1.5]];
      const scale = stage === 2 ? 0.78 : 1.06;

      for (const [ox, oz, ry] of offsets) {
        const cg = new THREE.Group();
        cg.position.set(ox, 0, oz);
        cg.rotation.y = ry;
        cg.scale.setScalar(scale);

        // Soft soil collar around peeking carrot shoulder
        const mound = new THREE.Mesh(this.geoSoilMound, M.soilMound);
        mound.scale.set(0.95, 0.9, 0.95);
        cg.add(mound);

        // Smooth tapered orange carrot root peeking cleanly above soil
        const root = new THREE.Mesh(this.geoCarrotRoot, M.carrot);
        root.position.y = -0.02;
        root.castShadow = true;
        cg.add(root);

        // Subtle horizontal root growth ring accents
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.122, 0.009, 4, 10), M.carrotRing);
        ring.rotation.x = Math.PI / 2;
        ring.position.y = 0.16;
        cg.add(ring);

        // Bouquet of 5 arched slender feathery carrot stems with paired fern leaflets!
        const frondCount = stage === 2 ? 4 : 5;
        for (let k = 0; k < frondCount; k++) {
          const ang = (k / frondCount) * Math.PI * 2 + 0.25;
          const stalkGroup = new THREE.Group();
          stalkGroup.position.set(0, 0.25, 0);
          stalkGroup.rotation.y = ang;
          stalkGroup.rotation.z = 0.34 + (k % 2) * 0.12;

          const stalkLen = 0.34 + (k % 2) * 0.06;
          const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.022, stalkLen, 5), M.leafDark);
          stalk.position.y = stalkLen * 0.5;
          stalk.castShadow = true;
          stalkGroup.add(stalk);

          // Paired feathery leaflet tufts along each arched stalk
          for (let f = 0; f < 3; f++) {
            const fy = 0.14 + f * 0.09;
            const lScale = 0.58 - f * 0.1;
            const mat = f === 2 ? M.leafBright : k % 2 ? M.leafMid : M.leafDark;
            for (const sgn of [-1, 1]) {
              const blade = new THREE.Mesh(this.geoBroadLeaf, mat);
              blade.scale.set(lScale, 0.7, lScale * 0.65);
              blade.position.set(sgn * 0.065, fy, 0);
              blade.rotation.z = sgn * -0.45;
              stalkGroup.add(blade);
            }
          }
          // Crown tip leaflet
          const tip = new THREE.Mesh(this.geoBroadLeaf, M.leafBright);
          tip.scale.set(0.45, 0.7, 0.45);
          tip.position.y = stalkLen + 0.02;
          tip.rotation.z = Math.PI / 2;
          stalkGroup.add(tip);

          cg.add(stalkGroup);
        }
        g.add(cg);
      }
    } else if (type === "radish") {
      // Plump Sculpted White-and-Rose Winter Radish Bulbs with Broad Veined Rosette Leaves!
      const offsets = stage === 2
        ? [[-0.19, 0.04, 0.3], [0.19, -0.05, -0.9]]
        : [[-0.22, -0.14, 0.2], [0.22, -0.07, -1.1], [0.0, 0.22, 2.0]];
      const scale = stage === 2 ? 0.78 : 1.06;

      for (const [ox, oz, ry] of offsets) {
        const rg = new THREE.Group();
        rg.position.set(ox, 0, oz);
        rg.rotation.y = ry;
        rg.scale.setScalar(scale);

        const mound = new THREE.Mesh(this.geoSoilMound, M.soilMound);
        mound.scale.set(1.05, 0.85, 1.05);
        rg.add(mound);

        // Glossy pearl-white lower radish belly + vibrant rose-crimson upper crown!
        const bulb = new THREE.Mesh(this.geoRadishBulb, M.radishWhite);
        bulb.castShadow = true;
        rg.add(bulb);

        const crown = new THREE.Mesh(this.geoRadishCrown, M.radishRose);
        crown.scale.set(1.045, 1.03, 1.045);
        rg.add(crown);

        // 6 broad arched radish rosette leaves with pale central midrib stems!
        const leafCount = stage === 2 ? 4 : 6;
        for (let k = 0; k < leafCount; k++) {
          const ang = (k / leafCount) * Math.PI * 2;
          const lg = new THREE.Group();
          lg.position.set(0, 0.255, 0);
          lg.rotation.y = ang;

          const petiole = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.02, 0.14, 5), M.leafRib);
          petiole.position.set(0.055, 0.055, 0);
          petiole.rotation.z = -0.72;
          lg.add(petiole);

          const blade = new THREE.Mesh(this.geoBroadLeaf, k % 2 ? M.leafBright : M.leafMid);
          blade.scale.set(0.95, 0.85, 0.92);
          blade.position.set(0.165, 0.105, 0);
          blade.rotation.z = -0.32;
          blade.castShadow = true;
          lg.add(blade);

          rg.add(lg);
        }
        g.add(rg);
      }
    } else if (type === "cabbage") {
      // Sculpted Cupped Rosette Snow Cabbage with Overlapping Inner Wrapper Leaves & Frosted Heart!
      const scale = stage === 2 ? 0.72 : 1.06;
      const cg = new THREE.Group();
      cg.scale.setScalar(scale);

      const mound = new THREE.Mesh(this.geoSoilMound, M.soilMound);
      mound.scale.set(1.8, 0.9, 1.8);
      cg.add(mound);

      // 7 wide outer dark-emerald spreading rosette leaves cupped gently upward!
      for (let k = 0; k < 7; k++) {
        const a = (k / 7) * Math.PI * 2 + 0.25;
        const lg = new THREE.Group();
        lg.rotation.y = a;
        const leaf = new THREE.Mesh(this.geoBroadLeaf, k % 2 ? M.cabOuter : M.leafDark);
        leaf.scale.set(1.75, 1.15, 1.55);
        leaf.position.set(0.28, 0.14, 0);
        leaf.rotation.z = 0.34;
        leaf.castShadow = true;
        lg.add(leaf);
        // Pale cabbage leaf vein rib sitting cleanly atop each outer leaf
        const vein = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.02, 0.032), M.leafRib);
        vein.position.set(0.25, 0.176, 0);
        vein.rotation.z = 0.34;
        lg.add(vein);
        cg.add(lg);
      }

      // 5 overlapping mid-layer cupped celadon leaves hugging the round head
      for (let k = 0; k < 5; k++) {
        const a = (k / 5) * Math.PI * 2 + 0.6;
        const cup = new THREE.Mesh(this.geoCabbageCup, M.cabMid);
        cup.scale.set(0.95, 0.92, 0.82);
        cup.position.set(Math.cos(a) * 0.075, 0.24, Math.sin(a) * 0.075);
        cup.rotation.y = -a;
        cup.rotation.z = -0.45;
        cup.castShadow = true;
        cg.add(cup);
      }

      // Plump rounded pale-mint cabbage heart + frosty winter snow-dew crown!
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.245, 12, 10), M.cabHeart);
      head.scale.set(1.06, 0.9, 1.06);
      head.position.y = 0.25;
      head.castShadow = true;
      cg.add(head);

      const frostTop = new THREE.Mesh(new THREE.SphereGeometry(0.165, 10, 7, 0, Math.PI * 2, 0, Math.PI * 0.45), M.cabFrost);
      frostTop.position.y = 0.32;
      cg.add(frostTop);

      g.add(cg);
    } else if (type === "pumpkin") {
      // Sculpted 8-Ribbed Plump Winter Pumpkin + Crooked Woody Stem + Curling Vine & Heart Leaves!
      const scale = stage === 2 ? 0.68 : 1.06;
      const matA = stage === 2 ? M.pumpGrowA : M.pumpRipeA;
      const matB = stage === 2 ? M.pumpGrowB : M.pumpRipeB;

      const pg = new THREE.Group();
      pg.scale.setScalar(scale);

      // 8 plump rounded spherical ribs arranged radially (iconic deeply furrowed pumpkin silhouette!)
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2;
        const lobe = new THREE.Mesh(this.geoPumpkinLobe, k % 2 ? matA : matB);
        lobe.position.set(Math.cos(a) * 0.145, 0.22, Math.sin(a) * 0.145);
        lobe.rotation.y = -a + Math.PI / 2;
        lobe.castShadow = true;
        pg.add(lobe);
      }

      // Star-shaped calyx base + 2-segment crooked gnarly pumpkin stem!
      const calyx = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.115, 0.045, 5), M.stem);
      calyx.position.y = 0.41;
      pg.add(calyx);
      const stem1 = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.068, 0.14, 6), M.stem);
      stem1.position.set(0.015, 0.48, 0);
      stem1.rotation.z = -0.22;
      const stem2 = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.042, 0.11, 6), M.stem);
      stem2.position.set(0.055, 0.565, 0.01);
      stem2.rotation.z = -0.68;
      pg.add(stem1, stem2);

      // Winding trailing vine + curly tendril + broad squash leaves resting over the soil!
      const vineArc = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.02, 5, 10, Math.PI * 0.9), M.vine);
      vineArc.rotation.x = Math.PI / 2;
      vineArc.position.set(0.08, 0.04, 0.06);
      pg.add(vineArc);
      const tendril = new THREE.Mesh(new THREE.TorusGeometry(0.055, 0.012, 4, 8, Math.PI * 1.5), M.leafBright);
      tendril.rotation.x = Math.PI / 2;
      tendril.position.set(0.38, 0.06, -0.05);
      pg.add(tendril);

      for (const [lx, lz, sc, ry] of [[0.34, 0.24, 1.35, 0.5], [-0.34, -0.2, 1.15, -0.7], [-0.26, 0.28, 0.95, 1.8]]) {
        const vLeaf = new THREE.Mesh(this.geoBroadLeaf, sc > 1.2 ? M.leafDark : M.leafMid);
        vLeaf.scale.set(sc, 0.9, sc * 1.1);
        vLeaf.position.set(lx, 0.065, lz);
        vLeaf.rotation.y = ry;
        vLeaf.castShadow = true;
        pg.add(vLeaf);
      }

      g.add(pg);
    }

    // Delicate faceted golden star floating above mature crops so player knows immediately they're ready!
    if (stage >= 3) {
      const sp = new THREE.Mesh(new THREE.OctahedronGeometry(0.08, 0), M.sparkle);
      sp.position.set(0.22, 0.72, 0.1);
      g.add(sp);
      tile.crop.sparkle = sp;
    }

    tile.crop.mesh = g;
    this.group.add(g);
  }

  tillTile(tile) {
    if (tile.tilled) return { ok: false, reason: "已经翻过土啦" };
    tile.tilled = true;
    tile.watered = false;
    this._refreshTileMaterial(tile);
    this.world.spawnBurst(tile.x, 0.18, tile.z, 0x8a5a34, 10, 1.8);
    return { ok: true };
  }

  waterTile(tile) {
    if (!tile.tilled) return { ok: false, reason: "先用锄头翻开雪地再浇水哦" };
    tile.watered = true;
    this._refreshTileMaterial(tile);
    this.world.spawnBurst(tile.x, 0.25, tile.z, 0x70ccff, 12, 1.6);
    return { ok: true };
  }

  plantTile(tile, cropType) {
    if (!tile.tilled) return { ok: false, reason: "先用锄头（1键）翻开土地哦" };
    if (tile.crop) return { ok: false, reason: "这块地已经种了蔬菜啦" };
    tile.crop = {
      type: cropType,
      stage: 0,
      mesh: null,
      swayPhase: Math.random() * Math.PI * 2,
      sparkle: null,
    };
    this._rebuildCropMesh(tile);
    this.world.spawnBurst(tile.x, 0.2, tile.z, 0xe8d094, 7, 1.2);
    return { ok: true };
  }

  harvestTile(tile) {
    if (!tile.crop || tile.crop.stage < 3) return null;
    const def = CROP_DEFS[tile.crop.type];
    this.group.remove(tile.crop.mesh);
    tile.crop = null;
    this.world.spawnBurst(tile.x, 0.35, tile.z, def.color, 14, 2.5);
    return def;
  }

  advanceNewDay() {
    let grownCount = 0;
    for (const tile of this.tiles) {
      if (tile.crop && tile.watered && tile.crop.stage < 3) {
        tile.crop.stage += 1;
        this._rebuildCropMesh(tile);
        grownCount++;
      }
      // Morning snow gently dries soil for the new day
      tile.watered = false;
      this._refreshTileMaterial(tile);
    }
    return grownCount;
  }

  // ---- Save / load: compact per-tile state [tilled, watered, cropType|null, stage] ----
  getState() {
    return this.tiles.map((t) => [t.tilled ? 1 : 0, t.watered ? 1 : 0, t.crop ? t.crop.type : null, t.crop ? t.crop.stage : 0]);
  }

  restoreState(state) {
    if (!Array.isArray(state) || state.length !== this.tiles.length) return false;
    this.tiles.forEach((tile, i) => {
      const [tilled, watered, type, stage] = state[i] || [];
      if (tile.crop && tile.crop.mesh) this.group.remove(tile.crop.mesh);
      tile.crop = null;
      tile.tilled = !!tilled;
      tile.watered = !!watered && !!tilled;
      if (type && CROP_DEFS[type] && tile.tilled) {
        tile.crop = {
          type,
          stage: Math.max(0, Math.min(3, stage | 0)),
          mesh: null,
          swayPhase: Math.random() * Math.PI * 2,
          sparkle: null,
        };
      }
      this._refreshTileMaterial(tile);
      this._rebuildCropMesh(tile);
    });
    return true;
  }

  setHoveredTile(tile) {
    this.hoveredTile = tile;
    if (tile) {
      this.reticle.visible = true;
      this.reticle.position.set(tile.x, 0, tile.z);
    } else {
      this.reticle.visible = false;
    }
  }

  update(dt, elapsed) {
    if (this.reticle.visible) {
      const pulse = 0.98 + 0.03 * Math.sin(elapsed * 6.5);
      this.reticle.scale.set(pulse, 1, pulse);
    }

    for (const tile of this.tiles) {
      if (!tile.crop || !tile.crop.mesh) continue;
      // Gentle winter breeze sway
      const swayAmp = tile.crop.stage >= 2 ? 0.045 : 0.025;
      tile.crop.mesh.rotation.z = Math.sin(elapsed * 2.3 + tile.crop.swayPhase) * swayAmp;
      if (tile.crop.sparkle) {
        tile.crop.sparkle.position.y = 0.72 + Math.sin(elapsed * 4.0 + tile.crop.swayPhase) * 0.1;
        tile.crop.sparkle.rotation.y = elapsed * 3.0;
        const sc = 0.75 + 0.35 * Math.sin(elapsed * 5.2 + tile.crop.swayPhase);
        tile.crop.sparkle.scale.setScalar(sc);
      }
    }
  }
}
