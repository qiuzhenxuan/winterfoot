import * as THREE from "three";
import { riverCenterX } from "./river.js";

export class PlayerCharacter {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.position = this.group.position;
    this.position.set(-0.8, 0, -2.35);
    this.facingAngle = 0; // 0 = facing +Z (south toward courtyard)
    this.walkPhase = 0;
    this.swingTimer = 0;
    this.stepAccum = 0;

    this.footprints = [];
    this.footprintGroup = new THREE.Group();
    this.scene.add(this.footprintGroup);

    this._buildMesh();
    this.scene.add(this.group);
  }

  _buildMesh() {
    // Refined Stylish Winter Outfit (NO green hat! Warm camel duffel coat, berry-burgundy knit scarf, cream knit beret!)
    const bootMat = new THREE.MeshStandardMaterial({ color: 0x6b3e24, roughness: 0.86 });
    const soleMat = new THREE.MeshStandardMaterial({ color: 0x2f1c12, roughness: 0.94 });
    const pantsMat = new THREE.MeshStandardMaterial({ color: 0x2f3b52, roughness: 0.9 });
    const coatMat = new THREE.MeshStandardMaterial({ color: 0xc9925c, roughness: 0.85 });
    const coatTrimMat = new THREE.MeshStandardMaterial({ color: 0xf7f0e2, roughness: 0.9 });
    const toggleMat = new THREE.MeshStandardMaterial({ color: 0x4d2a16, roughness: 0.86 });
    const scarfMat = new THREE.MeshStandardMaterial({ color: 0xa63238, roughness: 0.86 });
    const scarfStripeMat = new THREE.MeshStandardMaterial({ color: 0xf5e3c3, roughness: 0.88 });
    const skinMat = new THREE.MeshStandardMaterial({ color: 0xf9d5b2, roughness: 0.8 });
    const hairMat = new THREE.MeshStandardMaterial({ color: 0x5c3620, roughness: 0.88 });
    const hairHiMat = new THREE.MeshStandardMaterial({ color: 0x73462a, roughness: 0.86 });
    const hatCreamMat = new THREE.MeshStandardMaterial({ color: 0xf6efe0, roughness: 0.9 });
    const hatRibMat = new THREE.MeshStandardMaterial({ color: 0xa35c36, roughness: 0.88 });
    const packCanvasMat = new THREE.MeshStandardMaterial({ color: 0xe6d6bc, roughness: 0.88 });
    const packLeatherMat = new THREE.MeshStandardMaterial({ color: 0x7a4726, roughness: 0.84 });
    const buckleMat = new THREE.MeshStandardMaterial({ color: 0xe6bf55, metalness: 0.55, roughness: 0.35 });
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0x221510 });
    const eyeShineMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const blushMat = new THREE.MeshBasicMaterial({ color: 0xf2949a });

    // Legs, Corduroy Trousers & Chestnut Suede Boots with Wool Socks
    this.leftLeg = new THREE.Group();
    this.leftLeg.position.set(-0.135, 0.36, 0);
    const lLegM = new THREE.Mesh(new THREE.BoxGeometry(0.175, 0.34, 0.18), pantsMat);
    lLegM.position.y = -0.14;
    lLegM.castShadow = true;
    const lSock = new THREE.Mesh(new THREE.BoxGeometry(0.195, 0.065, 0.2), coatTrimMat);
    lSock.position.set(0, -0.2, 0.01);
    const lBoot = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.13, 0.25), bootMat);
    lBoot.position.set(0, -0.285, 0.03);
    lBoot.castShadow = true;
    const lSole = new THREE.Mesh(new THREE.BoxGeometry(0.21, 0.04, 0.26), soleMat);
    lSole.position.set(0, -0.34, 0.03);
    this.leftLeg.add(lLegM, lSock, lBoot, lSole);

    this.rightLeg = this.leftLeg.clone();
    this.rightLeg.position.set(0.135, 0.36, 0);

    // Body container (gentle stride bob)
    this.body = new THREE.Group();

    // Tailored Camel Wool Duffel Coat (slightly flared cozy silhouette)
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.54, 0.35), coatMat);
    torso.position.y = 0.65;
    torso.castShadow = true;
    this.body.add(torso);

    const coatSkirt = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.14, 0.39), coatMat);
    coatSkirt.position.y = 0.42;
    coatSkirt.castShadow = true;
    this.body.add(coatSkirt);

    // Plush ivory sherpa fleece coat hem & front lapel trim
    const trim = new THREE.Mesh(new THREE.BoxGeometry(0.57, 0.08, 0.41), coatTrimMat);
    trim.position.y = 0.36;
    this.body.add(trim);

    // Duffel coat leather toggle straps & buttons
    for (const by of [0.52, 0.65, 0.77]) {
      const strap = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.04, 0.035), toggleMat);
      strap.position.set(0, by, 0.18);
      const clasp = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.055, 0.045), buckleMat);
      clasp.position.set(0.06, by, 0.185);
      this.body.add(strap, clasp);
    }

    // Side coat pockets with sherpa edges
    for (const px of [-0.17, 0.17]) {
      const pocket = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.13, 0.04), toggleMat);
      pocket.position.set(px, 0.48, 0.185);
      const pEdge = new THREE.Mesh(new THREE.BoxGeometry(0.135, 0.03, 0.045), coatTrimMat);
      pEdge.position.set(px, 0.54, 0.188);
      this.body.add(pocket, pEdge);
    }

    // Vintage Canvas & Leather Satchel Backpack + Rolled Burgundy-Plaid Blanket on top!
    const pack = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.36, 0.18), packCanvasMat);
    pack.position.set(0, 0.64, -0.25);
    pack.castShadow = true;
    this.body.add(pack);
    const packFlap = new THREE.Mesh(new THREE.BoxGeometry(0.37, 0.14, 0.2), packLeatherMat);
    packFlap.position.set(0, 0.76, -0.25);
    this.body.add(packFlap);
    for (const bx of [-0.09, 0.09]) {
      const bStrap = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.32, 0.03), packLeatherMat);
      bStrap.position.set(bx, 0.64, -0.345);
      const bBuckle = new THREE.Mesh(new THREE.BoxGeometry(0.065, 0.055, 0.04), buckleMat);
      bBuckle.position.set(bx, 0.68, -0.35);
      this.body.add(bStrap, bBuckle);
    }
    const bedroll = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.42, 8), scarfMat);
    bedroll.rotation.z = Math.PI / 2;
    bedroll.position.set(0, 0.88, -0.24);
    bedroll.castShadow = true;
    this.body.add(bedroll);

    // Berry-Burgundy Knitted Scarf with Cream Stripes
    const scarf = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.14, 0.41), scarfMat);
    scarf.position.y = 0.91;
    scarf.castShadow = true;
    this.body.add(scarf);
    const scarfStripe = new THREE.Mesh(new THREE.BoxGeometry(0.568, 0.038, 0.428), scarfStripeMat);
    scarfStripe.position.y = 0.91;
    this.body.add(scarfStripe);

    this.scarfTail = new THREE.Group();
    this.scarfTail.position.set(0.14, 0.86, -0.2);
    const tailBody = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.32, 0.07), scarfMat);
    tailBody.position.set(0, -0.15, -0.02);
    const tailBar = new THREE.Mesh(new THREE.BoxGeometry(0.154, 0.045, 0.084), scarfStripeMat);
    tailBar.position.set(0, -0.25, -0.02);
    this.scarfTail.add(tailBody, tailBar);
    this.body.add(this.scarfTail);

    // Head + Layered Chestnut Hair + Warm Cream Knit Hat (zero coplanar/overlapping faces!)
    const headGroup = new THREE.Group();
    headGroup.position.y = 1.2;

    const head = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.43, 0.43), skinMat);
    head.castShadow = true;
    headGroup.add(head);

    // Layered Hair: tucked cleanly below hatBand (y <= 0.146) so hair NEVER Z-fights with the hat cuff!
    const hairBack = new THREE.Mesh(new THREE.BoxGeometry(0.49, 0.325, 0.27), hairMat);
    hairBack.position.set(0, -0.017, -0.11);
    hairBack.castShadow = true;
    headGroup.add(hairBack);

    // 0.47 wide (not 0.45): its side faces used to coincide with the head's and flickered
    const hairBackLower = new THREE.Mesh(new THREE.BoxGeometry(0.47, 0.14, 0.19), hairHiMat);
    hairBackLower.position.set(0, -0.18, -0.13);
    headGroup.add(hairBackLower);

    for (const sx of [-0.21, 0.21]) {
      const sideLock = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.3, 0.15), hairMat);
      sideLock.position.set(sx, -0.015, 0.105); // top 0.135, clear of the bangs' top face
      headGroup.add(sideLock);
    }

    const bangs = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.085, 0.085), hairMat);
    bangs.position.set(0, 0.102, 0.2);
    headGroup.add(bangs);
    const bangAccent = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.064, 0.092), hairHiMat);
    bangAccent.position.set(-0.08, 0.1, 0.208); // y 0.068..0.132, no shared planes with the bangs
    headGroup.add(bangAccent);

    // Sparkling Eyes & Rosy Cheeks
    for (const ex of [-0.11, 0.11]) {
      const eye = new THREE.Mesh(new THREE.BoxGeometry(0.065, 0.085, 0.04), eyeMat);
      eye.position.set(ex, 0.005, 0.215);
      headGroup.add(eye);
      const shine = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.025, 0.045), eyeShineMat);
      shine.position.set(ex + 0.014, 0.025, 0.22);
      headGroup.add(shine);

      const cheek = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.04, 0.03), blushMat);
      cheek.position.set(ex * 1.4, -0.07, 0.215);
      headGroup.add(cheek);
    }

    // Cozy Cream & Caramel-Cuffed Winter Knit Beret Hat (strictly non-coplanar stacked layers!)
    const hatBand = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.115, 0.52), hatRibMat);
    hatBand.position.set(0, 0.205, -0.005); // y: 0.1475..0.2625, z: -0.265..+0.255
    hatBand.castShadow = true;
    headGroup.add(hatBand);

    // Tilted beret crown & top sit snugly inset 3cm inside hatBand (zero shared back/side/top planes & zero gap!)
    const beretTopGroup = new THREE.Group();
    beretTopGroup.position.set(0, 0.248, -0.005);
    beretTopGroup.rotation.z = -0.055; // subtle jaunty beret tilt!

    const hatCrown = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.2, 0.46), hatCreamMat);
    hatCrown.position.set(0, 0.1, 0); // local y: 0.00..0.20, z inset 0.03m inside hatBand on both sides
    hatCrown.castShadow = true;
    beretTopGroup.add(hatCrown);

    const hatTop = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.08, 0.36), hatCreamMat);
    hatTop.position.set(0, 0.236, 0); // local y: 0.196..0.276 (non-coplanar with hatCrown top 0.20 & 5cm inset!)
    beretTopGroup.add(hatTop);

    const pom = new THREE.Mesh(new THREE.DodecahedronGeometry(0.105, 0), coatTrimMat);
    pom.position.set(0, 0.328, 0);
    pom.castShadow = true;
    beretTopGroup.add(pom);

    headGroup.add(beretTopGroup);

    this.body.add(headGroup);

    // Arms with Sherpa Cuffs & Berry-Red Knit Mittens
    this.leftArm = new THREE.Group();
    this.leftArm.position.set(-0.34, 0.83, 0);
    const armGeo = new THREE.BoxGeometry(0.155, 0.38, 0.16);
    const lArmM = new THREE.Mesh(armGeo, coatMat);
    lArmM.position.y = -0.15;
    lArmM.castShadow = true;
    const lCuff = new THREE.Mesh(new THREE.BoxGeometry(0.175, 0.075, 0.18), coatTrimMat);
    lCuff.position.y = -0.32;
    const lMitten = new THREE.Mesh(new THREE.BoxGeometry(0.145, 0.12, 0.15), scarfMat);
    lMitten.position.y = -0.4;
    this.leftArm.add(lArmM, lCuff, lMitten);

    this.rightArm = new THREE.Group();
    this.rightArm.position.set(0.34, 0.83, 0);
    const rArmM = new THREE.Mesh(armGeo, coatMat);
    rArmM.position.y = -0.15;
    rArmM.castShadow = true;
    const rCuff = new THREE.Mesh(new THREE.BoxGeometry(0.175, 0.075, 0.18), coatTrimMat);
    rCuff.position.y = -0.32;
    const rMitten = new THREE.Mesh(new THREE.BoxGeometry(0.145, 0.12, 0.15), scarfMat);
    rMitten.position.y = -0.4;
    this.rightArm.add(rArmM, rCuff, rMitten);

    this.toolAnchor = new THREE.Group();
    this.toolAnchor.position.set(0, -0.4, 0.14);
    this.rightArm.add(this.toolAnchor);

    this._buildHeldProps();
    this.setHeldItem("hoe");

    this.body.add(this.leftArm, this.rightArm);
    this.group.add(this.leftLeg, this.rightLeg, this.body);
  }

  _buildHeldProps() {
    this.props = {};

    const hoe = new THREE.Group();
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.032, 0.66, 6), new THREE.MeshStandardMaterial({ color: 0x8c552b }));
    handle.rotation.x = Math.PI / 2;
    handle.position.z = 0.25;
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.14, 0.06), new THREE.MeshStandardMaterial({ color: 0xb6c4d1, metalness: 0.45, roughness: 0.35 }));
    blade.position.set(0, -0.05, 0.56);
    hoe.add(handle, blade);
    this.props.hoe = hoe;

    const can = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 0.22, 8), new THREE.MeshStandardMaterial({ color: 0x569bd6, roughness: 0.38, metalness: 0.25 }));
    body.position.set(0, -0.04, 0.16);
    const spout = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 0.24, 6), new THREE.MeshStandardMaterial({ color: 0x86c0f0 }));
    spout.position.set(0, 0.03, 0.33);
    spout.rotation.x = Math.PI / 2 - 0.45;
    can.add(body, spout);
    this.props.watering_can = can;

    const pouch = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.22, 0.1), new THREE.MeshStandardMaterial({ color: 0xe6c38d }));
    pouch.position.set(0, 0, 0.12);
    this.props.seeds = pouch;

    const carrot = new THREE.Group();
    const cRoot = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.34, 6), new THREE.MeshStandardMaterial({ color: 0xf27922 }));
    cRoot.rotation.x = Math.PI / 2;
    cRoot.position.z = 0.2;
    const cLeaf = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, 0.12), new THREE.MeshStandardMaterial({ color: 0x45a349 }));
    cLeaf.position.z = 0.02;
    carrot.add(cRoot, cLeaf);
    this.props.carrot = carrot;

    const wood = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.36, 6), new THREE.MeshStandardMaterial({ color: 0x7d4c2a }));
    wood.rotation.z = Math.PI / 2;
    wood.position.set(0, 0, 0.15);
    this.props.firewood = wood;

    for (const p of Object.values(this.props)) {
      p.visible = false;
      this.toolAnchor.add(p);
    }
  }

  setHeldItem(slotType) {
    for (const p of Object.values(this.props)) p.visible = false;
    if (slotType === "hoe") this.props.hoe.visible = true;
    else if (slotType === "watering_can") this.props.watering_can.visible = true;
    else if (slotType.startsWith("seed_")) this.props.seeds.visible = true;
    else if (slotType === "carrot") this.props.carrot.visible = true;
    else if (slotType === "firewood") this.props.firewood.visible = true;
  }

  triggerSwing() {
    this.swingTimer = 0.26;
  }

  getFrontPoint(dist = 1.05) {
    return new THREE.Vector3(
      this.position.x + Math.sin(this.facingAngle) * dist,
      0,
      this.position.z + Math.cos(this.facingAngle) * dist
    );
  }

  _dropFootprint() {
    const mat = new THREE.MeshBasicMaterial({
      color: 0xb9cce0,
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
    });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.24), mat);
    m.rotation.x = -Math.PI / 2;
    m.rotation.z = -this.facingAngle;
    const side = (this.footprints.length % 2 === 0 ? 1 : -1) * 0.14;
    m.position.set(
      this.position.x + Math.cos(this.facingAngle) * side,
      0.015,
      this.position.z - Math.sin(this.facingAngle) * side
    );
    this.footprintGroup.add(m);
    this.footprints.push({ mesh: m, age: 0, life: this.footprintLife || 7.5 });
  }

  clearFootprints() {
    for (const f of this.footprints) this.footprintGroup.remove(f.mesh);
    this.footprints.length = 0;
  }

  update(dt, elapsed, isMoving, speedRatio, isIndoor, onFootstep, surfaceType = "snow", slopePitch = 0) {
    let diff = this.facingAngle - this.group.rotation.y;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    this.group.rotation.y += diff * Math.min(1, dt * 14);

    // Subtle physical body lean matching the bridge arch slope as the player climbs up & down!
    this.body.rotation.x = THREE.MathUtils.lerp(this.body.rotation.x, slopePitch, Math.min(1, dt * 10));

    if (isMoving) {
      const freq = 9.5 * speedRatio;
      this.walkPhase += dt * freq;
      this.stepAccum += dt * freq;
      if (this.stepAccum >= Math.PI) {
        this.stepAccum -= Math.PI;
        const onSnow = !isIndoor && surfaceType === "snow";
        if (onSnow) this._dropFootprint();
        if (onFootstep) onFootstep(isIndoor || surfaceType === "wood");
      }

      const swing = Math.sin(this.walkPhase) * 0.58;
      this.leftLeg.rotation.x = swing;
      this.rightLeg.rotation.x = -swing;
      this.leftArm.rotation.x = -swing * 0.62;
      if (this.swingTimer <= 0) {
        this.rightArm.rotation.x = swing * 0.62;
      }
      this.body.position.y = Math.abs(Math.sin(this.walkPhase)) * 0.05;
      this.scarfTail.rotation.x = 0.24 + Math.sin(this.walkPhase * 1.3) * 0.14;
    } else {
      this.leftLeg.rotation.x = THREE.MathUtils.lerp(this.leftLeg.rotation.x, 0, dt * 10);
      this.rightLeg.rotation.x = THREE.MathUtils.lerp(this.rightLeg.rotation.x, 0, dt * 10);
      this.leftArm.rotation.x = THREE.MathUtils.lerp(this.leftArm.rotation.x, 0, dt * 10);
      if (this.swingTimer <= 0) {
        this.rightArm.rotation.x = THREE.MathUtils.lerp(this.rightArm.rotation.x, -0.1, dt * 10);
      }
      this.body.position.y = Math.sin(elapsed * 2.4) * 0.012;
      this.scarfTail.rotation.x = 0.06 + Math.sin(elapsed * 2.0) * 0.04;
    }

    if (this.swingTimer > 0) {
      this.swingTimer = Math.max(0, this.swingTimer - dt);
      const p = 1 - this.swingTimer / 0.26;
      this.rightArm.rotation.x = -Math.sin(p * Math.PI) * 1.55 - 0.15;
    }

    for (let i = this.footprints.length - 1; i >= 0; i--) {
      const f = this.footprints[i];
      f.age += dt;
      if (f.age >= f.life) {
        this.footprintGroup.remove(f.mesh);
        this.footprints.splice(i, 1);
      } else {
        f.mesh.material.opacity = 0.42 * (1 - f.age / f.life);
      }
    }
  }
}

export class WildlifeSystem {
  constructor(scene, world) {
    this.scene = scene;
    this.world = world;
    this.group = new THREE.Group();
    this.scene.add(this.group);

    this.rabbits = [];
    this.farmAnimals = [];
    this.coopEggs = 2;
    this.emotes = null; // set by main (EmoteSystem)
    this._lastPlayer = null;
    this.playerSpeed = 0;

    this._spawnRabbits();
    this._spawnFarmAnimals();
    this.world.setCoopEggCount(this.coopEggs);
  }

  _createReadySparkle(yHeight) {
    const sp = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.1, 0),
      new THREE.MeshBasicMaterial({ color: 0xffe978 })
    );
    sp.position.y = yHeight;
    return sp;
  }

  // Collision & path clearance helper — prevents animals from EVER walking into fences, barn, troughs, or trees!
  _isPointClear(x, z, radius, paddockOnly = false) {
    if (paddockOnly) {
      const pb = this.world.paddockBounds;
      if (x < pb.minX + radius || x > pb.maxX - radius || z < pb.minZ + radius || z > pb.maxZ - radius) {
        return false;
      }
    } else {
      const wb = this.world.bounds;
      if (x < wb.minX + 0.8 || x > wb.maxX - 0.8 || z < wb.minZ + 0.8 || z > wb.maxZ - 0.8) {
        return false;
      }
      // Avoid frozen brook
      const brookCenter = riverCenterX(z);
      if (Math.abs(x - brookCenter) < 1.55 + radius) return false;
    }

    for (const c of this.world.colliders) {
      if (c.type === "box") {
        if (x > c.minX - radius && x < c.maxX + radius && z > c.minZ - radius && z < c.maxZ + radius) {
          return false;
        }
      } else {
        if (Math.hypot(x - c.x, z - c.z) < c.r + radius) {
          return false;
        }
      }
    }
    return true;
  }

  _hasClearPath(x1, z1, x2, z2, radius, paddockOnly = false) {
    const steps = 6;
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const sx = THREE.MathUtils.lerp(x1, x2, t);
      const sz = THREE.MathUtils.lerp(z1, z2, t);
      if (!this._isPointClear(sx, sz, radius, paddockOnly)) return false;
    }
    return true;
  }

  _createRabbitMesh(tint = 0xfafcff) {
    const g = new THREE.Group();
    const furMat = new THREE.MeshStandardMaterial({ color: tint, roughness: 0.9 });
    const pinkMat = new THREE.MeshStandardMaterial({ color: 0xf4a8b8, roughness: 0.85 });
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0x1e1818 });

    const body = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.28, 0.44), furMat);
    body.position.set(0, 0.17, 0);
    body.castShadow = true;
    g.add(body);

    const head = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.25, 0.28), furMat);
    head.position.set(0, 0.34, 0.19);
    head.castShadow = true;
    g.add(head);

    const nose = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.06, 0.05), pinkMat);
    nose.position.set(0, 0.31, 0.34);
    g.add(nose);

    for (const ex of [-0.09, 0.09]) {
      const eye = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.06, 0.04), eyeMat);
      eye.position.set(ex, 0.37, 0.32);
      g.add(eye);
    }

    const ears = new THREE.Group();
    ears.position.set(0, 0.46, 0.15);
    for (const sx of [-0.08, 0.08]) {
      const ear = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.24, 0.07), furMat);
      ear.position.set(sx, 0.11, 0);
      ear.rotation.z = sx * -1.2;
      ear.castShadow = true;
      ears.add(ear);
      const inner = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.16, 0.03), pinkMat);
      inner.position.set(sx, 0.11, 0.03);
      inner.rotation.z = sx * -1.2;
      ears.add(inner);
    }
    g.add(ears);

    const tail = new THREE.Mesh(new THREE.DodecahedronGeometry(0.09, 0), furMat);
    tail.position.set(0, 0.19, -0.25);
    g.add(tail);

    return { group: g, ears };
  }

  _createSheepMesh(woolHex = 0xfaf4e8) {
    const g = new THREE.Group();
    const woolMat = new THREE.MeshStandardMaterial({ color: woolHex, roughness: 0.94 });
    const faceMat = new THREE.MeshStandardMaterial({ color: 0x3b3532, roughness: 0.88 });
    const hoofMat = new THREE.MeshStandardMaterial({ color: 0x26201d, roughness: 0.9 });
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const pupilMat = new THREE.MeshBasicMaterial({ color: 0x181515 });
    const blushMat = new THREE.MeshBasicMaterial({ color: 0xf0a3ab });

    const legs = [];
    for (const [lx, lz] of [[-0.21, 0.24], [0.21, 0.24], [-0.21, -0.24], [0.21, -0.24]]) {
      const leg = new THREE.Group();
      leg.position.set(lx, 0.32, lz);
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.115, 0.34, 0.115), faceMat);
      m.position.y = -0.15;
      m.castShadow = true;
      const hoof = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.08, 0.14), hoofMat);
      hoof.position.y = -0.3;
      leg.add(m, hoof);
      g.add(leg);
      legs.push(leg);
    }

    // Soft sculpted rounded-cloud wool fleece!
    const fleeceGroup = new THREE.Group();
    const core = new THREE.Mesh(new THREE.BoxGeometry(0.64, 0.52, 0.82), woolMat);
    core.position.y = 0.56;
    core.castShadow = true;
    fleeceGroup.add(core);
    const puffSpheres = [
      [0, 0.64, 0.18, 0.42],
      [0, 0.62, -0.2, 0.4],
      [-0.22, 0.58, 0, 0.32],
      [0.22, 0.58, 0, 0.32],
      [0, 0.78, -0.02, 0.3],
    ];
    for (const [px, py, pz, r] of puffSpheres) {
      const puff = new THREE.Mesh(new THREE.DodecahedronGeometry(r, 0), woolMat);
      puff.position.set(px, py, pz);
      puff.castShadow = true;
      fleeceGroup.add(puff);
    }
    const tail = new THREE.Mesh(new THREE.DodecahedronGeometry(0.13, 0), woolMat);
    tail.position.set(0, 0.56, -0.5);
    fleeceGroup.add(tail);
    g.add(fleeceGroup);

    const head = new THREE.Group();
    head.position.set(0, 0.66, 0.46);
    const skull = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.33, 0.38), faceMat);
    skull.castShadow = true;
    head.add(skull);
    const crownWool = new THREE.Mesh(new THREE.DodecahedronGeometry(0.21, 0), woolMat);
    crownWool.scale.set(1.1, 0.72, 1.0);
    crownWool.position.set(0, 0.19, -0.02);
    head.add(crownWool);
    for (const sx of [-0.22, 0.22]) {
      const ear = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.095, 0.095), faceMat);
      ear.position.set(sx, 0.04, -0.04);
      ear.rotation.z = sx > 0 ? -0.45 : 0.45;
      head.add(ear);
    }
    for (const ex of [-0.105, 0.105]) {
      const ew = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 0.03), eyeMat);
      ew.position.set(ex, 0.04, 0.19);
      const ep = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.05, 0.03), pupilMat);
      ep.position.set(ex, 0.04, 0.2);
      const bl = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.03, 0.025), blushMat);
      bl.position.set(ex * 1.25, -0.04, 0.192);
      head.add(ew, ep, bl);
    }
    g.add(head);

    const sparkle = this._createReadySparkle(1.24);
    g.add(sparkle);
    return { group: g, legs, head, fleeceGroup, tail: null, sparkle };
  }

  _createCowMesh() {
    const g = new THREE.Group();
    const whiteMat = new THREE.MeshStandardMaterial({ color: 0xf7f5ef, roughness: 0.88 });
    const spotMat = new THREE.MeshStandardMaterial({ color: 0x2c282a, roughness: 0.9 });
    const snoutMat = new THREE.MeshStandardMaterial({ color: 0xf0b2b8, roughness: 0.82 });
    const hornMat = new THREE.MeshStandardMaterial({ color: 0xdec495, roughness: 0.78 });
    const bellMat = new THREE.MeshStandardMaterial({ color: 0xf2c64d, metalness: 0.6, roughness: 0.32 });
    const collarMat = new THREE.MeshStandardMaterial({ color: 0xb83830, roughness: 0.85 });

    const legs = [];
    for (const [lx, lz] of [[-0.27, 0.36], [0.27, 0.36], [-0.27, -0.36], [0.27, -0.36]]) {
      const leg = new THREE.Group();
      leg.position.set(lx, 0.44, lz);
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.155, 0.44, 0.155), whiteMat);
      m.position.y = -0.2;
      m.castShadow = true;
      const hoof = new THREE.Mesh(new THREE.BoxGeometry(0.165, 0.1, 0.18), spotMat);
      hoof.position.y = -0.4;
      leg.add(m, hoof);
      g.add(leg);
      legs.push(leg);
    }

    const body = new THREE.Mesh(new THREE.BoxGeometry(0.74, 0.64, 1.14), whiteMat);
    body.position.y = 0.74;
    body.castShadow = true;
    g.add(body);

    const spot1 = new THREE.Mesh(new THREE.BoxGeometry(0.77, 0.33, 0.42), spotMat);
    spot1.position.set(0, 0.84, 0.12);
    g.add(spot1);
    const spot2 = new THREE.Mesh(new THREE.BoxGeometry(0.77, 0.28, 0.32), spotMat);
    spot2.position.set(0, 0.66, -0.36);
    g.add(spot2);
    const udder = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.17, 0.32), snoutMat);
    udder.position.set(0, 0.38, -0.22);
    g.add(udder);

    const collar = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.13, 0.14), collarMat);
    collar.position.set(0, 0.82, 0.54);
    g.add(collar);
    const bell = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.08, 0.14, 6), bellMat);
    bell.position.set(0, 0.68, 0.59);
    g.add(bell);

    const tail = new THREE.Group();
    tail.position.set(0, 0.84, -0.58);
    const tStem = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.44, 0.06), whiteMat);
    tStem.position.y = -0.2;
    const tTuft = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.14, 0.11), spotMat);
    tTuft.position.y = -0.44;
    tail.add(tStem, tTuft);
    g.add(tail);

    const head = new THREE.Group();
    head.position.set(0, 0.94, 0.68);
    const skull = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.43, 0.45), whiteMat);
    skull.castShadow = true;
    head.add(skull);
    const eyeSpot = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.22, 0.22), spotMat);
    eyeSpot.position.set(-0.14, 0.06, 0.14);
    head.add(eyeSpot);
    const snout = new THREE.Mesh(new THREE.BoxGeometry(0.41, 0.21, 0.2), snoutMat);
    snout.position.set(0, -0.1, 0.26);
    head.add(snout);
    for (const sx of [-0.18, 0.18]) {
      const horn = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.18, 5), hornMat);
      horn.position.set(sx, 0.28, -0.04);
      horn.rotation.z = sx > 0 ? -0.35 : 0.35;
      head.add(horn);
      const ear = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.1, 0.08), spotMat);
      ear.position.set(sx * 1.65, 0.12, -0.05);
      head.add(ear);
      const eye = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.07, 0.04), new THREE.MeshBasicMaterial({ color: 0x151212 }));
      eye.position.set(sx * 0.85, 0.06, 0.24);
      head.add(eye);
    }
    g.add(head);

    const sparkle = this._createReadySparkle(1.52);
    g.add(sparkle);
    return { group: g, legs, head, fleeceGroup: null, tail, sparkle };
  }

  _createChickenMesh(bodyHex = 0xfaf7ee, isChick = false) {
    const g = new THREE.Group();
    const s = isChick ? 0.68 : 1.0;
    const featherMat = new THREE.MeshStandardMaterial({ color: bodyHex, roughness: 0.88 });
    const combMat = new THREE.MeshStandardMaterial({ color: 0xd9362e, roughness: 0.72 });
    const beakMat = new THREE.MeshStandardMaterial({ color: 0xf2a930, roughness: 0.7 });
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0x1c1512 });

    const body = new THREE.Mesh(new THREE.BoxGeometry(0.32 * s, 0.26 * s, 0.4 * s), featherMat);
    body.position.y = 0.24 * s;
    body.castShadow = true;
    g.add(body);

    const wingL = new THREE.Mesh(new THREE.BoxGeometry(0.07 * s, 0.18 * s, 0.28 * s), featherMat);
    wingL.position.set(-0.18 * s, 0.24 * s, 0);
    const wingR = wingL.clone();
    wingR.position.x = 0.18 * s;
    g.add(wingL, wingR);

    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.2 * s, 0.22 * s, 0.14 * s), featherMat);
    tail.position.set(0, 0.34 * s, -0.22 * s);
    tail.rotation.x = -0.35;
    g.add(tail);

    const head = new THREE.Group();
    head.position.set(0, 0.38 * s, 0.18 * s);
    const skull = new THREE.Mesh(new THREE.BoxGeometry(0.22 * s, 0.22 * s, 0.22 * s), featherMat);
    skull.castShadow = true;
    head.add(skull);
    const beak = new THREE.Mesh(new THREE.ConeGeometry(0.05 * s, 0.12 * s, 4), beakMat);
    beak.rotation.x = Math.PI / 2;
    beak.position.set(0, -0.02 * s, 0.15 * s);
    head.add(beak);
    if (!isChick) {
      const comb = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.1, 0.14), combMat);
      comb.position.set(0, 0.14, 0.02);
      head.add(comb);
      const wattle = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.08, 0.06), combMat);
      wattle.position.set(0, -0.09, 0.11);
      head.add(wattle);
    }
    for (const ex of [-0.08 * s, 0.08 * s]) {
      const eye = new THREE.Mesh(new THREE.BoxGeometry(0.035 * s, 0.04 * s, 0.03 * s), eyeMat);
      eye.position.set(ex, 0.03 * s, 0.1 * s);
      head.add(eye);
    }
    g.add(head);

    const legs = [];
    for (const lx of [-0.08 * s, 0.08 * s]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.04 * s, 0.14 * s, 0.06 * s), beakMat);
      leg.position.set(lx, 0.07 * s, 0);
      g.add(leg);
      legs.push(leg);
    }

    const sparkle = this._createReadySparkle(0.75);
    sparkle.visible = false;
    g.add(sparkle);
    return { group: g, legs, head, wingL, wingR, tail: null, sparkle };
  }

  _spawnRabbits() {
    const specs = [
      { name: "雪球小兔", x: -10.4, z: -2.2, homeX: -10.8, homeZ: -1.8, tint: 0xfbfdff },
      { name: "绒尾小兔", x: 5.2, z: 7.8, homeX: 5.4, homeZ: 7.8, tint: 0xf5efe8 },
      { name: "松林小兔", x: 16.0, z: -0.2, homeX: 16.2, homeZ: 0.2, tint: 0xf8fbff },
    ];
    for (const s of specs) {
      const { group, ears } = this._createRabbitMesh(s.tint);
      group.position.set(s.x, 0, s.z);
      this.group.add(group);
      this.rabbits.push({
        name: s.name,
        mesh: group,
        ears,
        homeX: s.homeX,
        homeZ: s.homeZ,
        targetX: s.x,
        targetZ: s.z,
        pauseTimer: 1.5 + Math.random() * 2.8,
        hopPhase: Math.random() * Math.PI * 2,
        happyTimer: 0,
        followTimer: 0,
        fedCount: 0,
        stuckTime: 0,
        moveTimer: 0,
      });
    }
  }

  _spawnFarmAnimals() {
    const specs = [
      { kind: "cow", name: "小奶牛·奶糖", product: "milk", productName: "新鲜温牛奶", emoji: "🥛", x: 6.1, z: 4.2, radius: 0.56, hasProduct: true },
      { kind: "sheep", name: "绵羊·棉团", product: "wool", productName: "蓬松冬羊毛", emoji: "🧶", x: 3.65, z: 3.4, radius: 0.44, woolHex: 0xfaf4e8, hasProduct: true },
      { kind: "sheep", name: "绵羊·云朵", product: "wool", productName: "蓬松冬羊毛", emoji: "🧶", x: 5.1, z: 4.9, radius: 0.44, woolHex: 0xede0cc, hasProduct: false },
      { kind: "chicken", name: "母鸡·咯咯", product: "egg", productName: "农家土鸡蛋", emoji: "🥚", x: 2.75, z: 2.8, radius: 0.28, bodyHex: 0xfaf7ee, isChick: false, hasProduct: false },
      { kind: "chicken", name: "母鸡·花羽", product: "egg", productName: "农家土鸡蛋", emoji: "🥚", x: 4.95, z: 3.45, radius: 0.28, bodyHex: 0xc97b3c, isChick: false, hasProduct: false },
      { kind: "chicken", name: "绒球小鸡·金豆", product: "egg", productName: "农家土鸡蛋", emoji: "🥚", x: 3.9, z: 4.5, radius: 0.22, bodyHex: 0xffe066, isChick: true, hasProduct: false },
    ];

    specs.forEach((s, idx) => {
      let rig;
      if (s.kind === "cow") rig = this._createCowMesh();
      else if (s.kind === "sheep") rig = this._createSheepMesh(s.woolHex);
      else rig = this._createChickenMesh(s.bodyHex, s.isChick);

      rig.group.position.set(s.x, 0, s.z);
      rig.group.rotation.y = (idx * 1.15) % (Math.PI * 2);
      if (rig.sparkle) rig.sparkle.visible = !!s.hasProduct;
      this.group.add(rig.group);

      this.farmAnimals.push({
        ...s,
        mesh: rig.group,
        rig,
        state: idx % 2 === 0 ? "idle" : "graze",
        stateTimer: 1.4 + idx * 0.75 + Math.random() * 1.8,
        targetX: s.x,
        targetZ: s.z,
        walkPhase: idx * 2.1,
        lookYaw: 0,
        happyTimer: 0,
        reactionDelay: 0,
        pendingTroughTarget: null,
        fedToday: false,
        stuckTime: 0,
        moveTimer: 0,
      });
    });
  }

  _pickClearPaddockWaypoint(animal) {
    const pb = this.world.paddockBounds;
    const ax = animal.mesh.position.x;
    const az = animal.mesh.position.z;
    const rad = animal.radius + 0.14;

    for (let attempt = 0; attempt < 16; attempt++) {
      // Favor realistic short-to-medium stroll distances (1.2..3.6 units) so animals meander calmly instead of marching across walls
      const ang = Math.random() * Math.PI * 2;
      const dist = 1.15 + Math.random() * 2.4;
      const tx = THREE.MathUtils.clamp(ax + Math.cos(ang) * dist, pb.minX + rad, pb.maxX - rad);
      const tz = THREE.MathUtils.clamp(az + Math.sin(ang) * dist, pb.minZ + rad, pb.maxZ - rad);

      if (Math.hypot(tx - ax, tz - az) < 0.75) continue;
      if (!this._hasClearPath(ax, az, tx, tz, rad, true)) continue;

      // Avoid picking a spot right on top of another animal
      let crowded = false;
      for (const other of this.farmAnimals) {
        if (other === animal) continue;
        if (Math.hypot(tx - other.mesh.position.x, tz - other.mesh.position.z) < animal.radius + other.radius + 0.45) {
          crowded = true;
          break;
        }
      }
      if (!crowded) return { x: tx, z: tz };
    }
    return null;
  }

  // Fireworks overhead: nearby animals stop, look up toward the burst, and now and then
  // pop a bubble. The first shell startles them; later ones are mostly wonder.
  reactToFirework(burst, playerPos, first = false) {
    const near = [];
    for (const a of this.farmAnimals) {
      if (Math.hypot(a.mesh.position.x - playerPos.x, a.mesh.position.z - playerPos.z) < 30) near.push(a);
    }
    for (const a of near) {
      if (a.state === "walk" || a.state === "graze") {
        a.state = "idle";
        a.stateTimer = 3 + Math.random() * 2;
      }
      if (a.state !== "idle") continue;
      let rel = Math.atan2(burst.x - a.mesh.position.x, burst.z - a.mesh.position.z) - a.mesh.rotation.y;
      while (rel > Math.PI) rel -= Math.PI * 2;
      while (rel < -Math.PI) rel += Math.PI * 2;
      a.lookYaw = THREE.MathUtils.clamp(rel, -0.9, 0.9);
      a.skyGaze = 2.6 + Math.random() * 1.2;
      a.stateTimer = Math.max(a.stateTimer, 2.5);
    }
    const pool = near.concat(
      this.rabbits.filter((r) => Math.hypot(r.mesh.position.x - playerPos.x, r.mesh.position.z - playerPos.z) < 22)
    );
    if (!pool.length) return;
    const count = first ? Math.min(3, pool.length) : Math.random() < 0.35 ? 1 : 0;
    for (let i = 0; i < count; i++) {
      const a = pool.splice(Math.floor(Math.random() * pool.length), 1)[0];
      const isRabbit = !a.kind;
      const type = first ? "exclaim" : ["heart", "sparkle", "note", "exclaim"][Math.floor(Math.random() * 4)];
      const h = isRabbit ? 0.88 : this._emoteHeight(a);
      setTimeout(() => this._emote(a.mesh, type, h), 150 + i * 260);
    }
  }

  _emote(target, type, height) {
    if (this.emotes) this.emotes.show(target, type, height);
  }

  _emoteHeight(a) {
    if (a.kind === "cow") return 1.62;
    if (a.kind === "sheep") return 1.3;
    return a.isChick ? 0.78 : 1.02;
  }

  interactRabbit(rabbit, hasCarrot) {
    rabbit.happyTimer = 0.85;
    rabbit.alertTimer = 0;
    rabbit.fleeTimer = 0;
    this._emote(rabbit.mesh, hasCarrot ? "heart" : "note", 0.88);
    if (hasCarrot) {
      rabbit.fedCount += 1;
      rabbit.followTimer = 35;
      this.world.spawnBurst(rabbit.mesh.position.x, 0.65, rabbit.mesh.position.z, 0xff5a7a, 10, 2.0);
      return { fed: true };
    }
    this.world.spawnBurst(rabbit.mesh.position.x, 0.55, rabbit.mesh.position.z, 0xffc6d3, 6, 1.4);
    return { fed: false };
  }

  interactFarmAnimal(animal, hasCarrot) {
    // Only THIS single animal shows a brief happy reaction (species-specific, turns to face the player)
    animal.happyTimer = 0.9;
    animal.happyTotal = 0.9;
    animal.state = "idle";
    animal.stateTimer = 2.8;
    animal.noticeCooldown = 12;
    const p = animal.mesh.position;
    const h = this._emoteHeight(animal);

    if (animal.hasProduct && animal.product !== "egg") {
      animal.hasProduct = false;
      if (animal.rig.sparkle) animal.rig.sparkle.visible = false;
      if (animal.kind === "sheep" && animal.rig.fleeceGroup) {
        animal.rig.fleeceGroup.scale.set(0.86, 0.88, 0.9);
      }
      this.world.spawnBurst(p.x, 0.95, p.z, 0xfff0a3, 8, 2.0);
      this._emote(animal.mesh, "sparkle", h);
      return { action: "harvest", product: animal.product, productName: animal.productName, emoji: animal.emoji };
    }

    if (hasCarrot && !animal.fedToday) {
      animal.fedToday = true;
      animal.pettedToday = true;
      this.world.spawnBurst(p.x, 0.85, p.z, 0xff6b8b, 6, 1.6);
      this._emote(animal.mesh, "heart", h);
      return { action: "fed" };
    }

    // Petting: first pet of the day earns a heart, after that a contented little tune
    this._emote(animal.mesh, animal.pettedToday ? "note" : "heart", h);
    animal.pettedToday = true;
    return { action: "pet" };
  }

  feedAllAnimalsViaTrough() {
    this.world.setTroughFilled(true);
    let fed = 0;
    // Spread distinct reachable spots across the clear open apron south of the hay trough (zero barn collisions!)
    const spots = [
      { x: 2.35, z: 2.3 },
      { x: 3.1, z: 2.37 },
      { x: 3.65, z: 2.9 },
      { x: 2.5, z: 3.2 },
      { x: 3.25, z: 3.6 },
      { x: 4.1, z: 3.7 },
    ];
    this.farmAnimals.forEach((a, i) => {
      if (!a.fedToday) {
        a.fedToday = true;
        fed++;
      }
      // Stagger reaction times naturally so animals NEVER jump/dance in sync!
      a.reactionDelay = 0.15 + i * 0.22 + Math.random() * 0.25;
      a.pendingTroughTarget = spots[i % spots.length];
      a.troughCheer = true;
    });
    this.world.spawnBurst(this.world.hayTroughPos.x, 0.75, this.world.hayTroughPos.z, 0xf2cf66, 14, 2.0);
    return fed;
  }

  // ---- Save / load ----
  getState() {
    return {
      coopEggs: this.coopEggs,
      animals: this.farmAnimals.map((a) => [
        a.hasProduct ? 1 : 0,
        a.fedToday ? 1 : 0,
        a.pettedToday ? 1 : 0,
        a.rig.fleeceGroup && a.rig.fleeceGroup.scale.x < 0.95 ? 1 : 0, // freshly shorn sheep
      ]),
    };
  }

  restoreState(state) {
    if (!state) return;
    if (typeof state.coopEggs === "number") {
      this.coopEggs = Math.max(0, Math.min(3, state.coopEggs | 0));
      this.world.setCoopEggCount(this.coopEggs);
    }
    if (Array.isArray(state.animals)) {
      this.farmAnimals.forEach((a, i) => {
        const s = state.animals[i];
        if (!s) return;
        a.hasProduct = !!s[0] && a.product !== "egg";
        a.fedToday = !!s[1];
        a.pettedToday = !!s[2];
        if (a.rig.sparkle) a.rig.sparkle.visible = a.hasProduct;
        if (a.kind === "sheep" && a.rig.fleeceGroup) {
          if (s[3]) a.rig.fleeceGroup.scale.set(0.86, 0.88, 0.9);
          else a.rig.fleeceGroup.scale.set(1, 1, 1);
        }
      });
    }
  }

  collectCoopEggs() {
    const count = this.coopEggs;
    if (count <= 0) return 0;
    this.coopEggs = 0;
    this.world.setCoopEggCount(0);
    this.world.spawnBurst(this.world.coopNestPos.x, 0.85, this.world.coopNestPos.z, 0xfff5c2, 12, 2.0);
    return count;
  }

  advanceNewDay() {
    let produced = 0;
    for (const a of this.farmAnimals) {
      const wellCared = a.fedToday || this.world.troughFilled;
      if (a.kind === "cow" && wellCared) {
        a.hasProduct = true;
        produced++;
      } else if (a.kind === "sheep" && wellCared) {
        a.hasProduct = true;
        if (a.rig.fleeceGroup) a.rig.fleeceGroup.scale.set(1, 1, 1);
        produced++;
      }
      if (a.rig.sparkle) a.rig.sparkle.visible = !!a.hasProduct;
      a.fedToday = false;
      a.pettedToday = false;
    }
    const laid = this.world.troughFilled ? 3 : 2;
    this.coopEggs = Math.min(3, this.coopEggs + laid);
    this.world.setCoopEggCount(this.coopEggs);
    this.world.setTroughFilled(false);
    return { produced, coopEggs: this.coopEggs };
  }

  update(dt, elapsed, playerPos) {
    if (this._lastPlayer && dt > 0) {
      const sp = Math.hypot(playerPos.x - this._lastPlayer.x, playerPos.z - this._lastPlayer.z) / dt;
      this.playerSpeed = THREE.MathUtils.lerp(this.playerSpeed, Math.min(sp, 12), Math.min(1, dt * 10));
      this._lastPlayer.x = playerPos.x;
      this._lastPlayer.z = playerPos.z;
    } else {
      this._lastPlayer = { x: playerPos.x, z: playerPos.z };
    }
    const playerRunning = this.playerSpeed > 5.4;
    // 1. Update wild snow rabbits (with clear-path waypoint selection & stuck protection — zero wall pushing or spinning!)
    for (const r of this.rabbits) {
      const rdx = playerPos.x - r.mesh.position.x;
      const rdz = playerPos.z - r.mesh.position.z;
      const rDist = Math.hypot(rdx, rdz);
      r.alertCooldown = Math.max(0, (r.alertCooldown || 0) - dt);

      // Wild (not yet befriended) rabbits: freeze and perk up when you creep close, bolt if you run at them
      if (r.followTimer <= 0 && r.happyTimer <= 0 && !(r.fleeTimer > 0)) {
        if (rDist < 2.6 && playerRunning) {
          r.fleeTimer = 1.1;
          r.alertTimer = 0;
          // Bolt directly away; if a tree/fence is in the way, veer off to the side instead
          const away = Math.atan2(-rdx, -rdz);
          let tx = r.homeX;
          let tz = r.homeZ;
          for (const off of [0, 0.6, -0.6, 1.2, -1.2, 1.7, -1.7]) {
            const ang = away + off + (Math.random() - 0.5) * 0.3;
            const cx = r.mesh.position.x + Math.sin(ang) * 3.2;
            const cz = r.mesh.position.z + Math.cos(ang) * 3.2;
            if (this._hasClearPath(r.mesh.position.x, r.mesh.position.z, cx, cz, 0.3, false)) {
              tx = cx;
              tz = cz;
              break;
            }
          }
          r.targetX = tx;
          r.targetZ = tz;
          r.pauseTimer = 0;
          r.moveTimer = 0;
          if (r.alertCooldown <= 0) {
            this._emote(r.mesh, "exclaim", 0.88);
            r.alertCooldown = 4;
          }
        } else if (rDist < 2.4) {
          if (!(r.alertTimer > 0) && r.alertCooldown <= 0) {
            this._emote(r.mesh, "question", 0.88);
            r.alertCooldown = 9;
          }
          r.alertTimer = 0.6;
        }
      }

      if (r.alertTimer > 0) {
        // Frozen in place, ears straight up, nose turned toward the player
        r.alertTimer = Math.max(0, r.alertTimer - dt);
        r.ears.rotation.x = THREE.MathUtils.lerp(r.ears.rotation.x, -0.32, Math.min(1, dt * 12));
        const want = Math.atan2(rdx, rdz);
        let d = want - r.mesh.rotation.y;
        while (d > Math.PI) d -= Math.PI * 2;
        while (d < -Math.PI) d += Math.PI * 2;
        r.mesh.rotation.y += d * Math.min(1, dt * 6);
        r.mesh.position.y = THREE.MathUtils.lerp(r.mesh.position.y, 0, dt * 12);
        r.mesh.scale.y = 1 + Math.sin(elapsed * 22) * 0.012; // tiny nose twitch
        continue;
      }
      r.mesh.scale.y = 1;
      r.ears.rotation.x = Math.sin(elapsed * 4.5 + r.homeX) * 0.12;
      if (r.fleeTimer > 0) r.fleeTimer = Math.max(0, r.fleeTimer - dt);

      if (r.happyTimer > 0) {
        r.happyTimer = Math.max(0, r.happyTimer - dt);
        const baseY = this.world.getSurfaceInfo ? this.world.getSurfaceInfo(r.mesh.position.x, r.mesh.position.z).y : 0;
        r.mesh.position.y = baseY + Math.abs(Math.sin(r.happyTimer * Math.PI * 2.4)) * 0.24;
        continue;
      }

      if (r.followTimer > 0) {
        r.followTimer = Math.max(0, r.followTimer - dt);
        if (r.alertCooldown <= 0 && Math.random() < dt * 0.12) {
          this._emote(r.mesh, "note", 0.88);
          r.alertCooldown = 6;
        }
        const dx = playerPos.x - r.mesh.position.x;
        const dz = playerPos.z - r.mesh.position.z;
        const dist = Math.hypot(dx, dz);
        if (dist > 1.8 && dist < 13) {
          r.targetX = playerPos.x - (dx / dist) * 1.35;
          r.targetZ = playerPos.z - (dz / dist) * 1.35;
          r.pauseTimer = 0;
        } else {
          r.pauseTimer = 0.7;
        }
      }

      if (r.pauseTimer > 0) {
        r.pauseTimer -= dt;
        const baseY = this.world.getSurfaceInfo ? this.world.getSurfaceInfo(r.mesh.position.x, r.mesh.position.z).y : 0;
        r.mesh.position.y = THREE.MathUtils.lerp(r.mesh.position.y, baseY, dt * 12);
        if (r.pauseTimer <= 0 && r.followTimer <= 0) {
          let picked = false;
          for (let tries = 0; tries < 10; tries++) {
            const ang = Math.random() * Math.PI * 2;
            const rad = 1.0 + Math.random() * 2.2;
            const tx = r.homeX + Math.cos(ang) * rad;
            const tz = r.homeZ + Math.sin(ang) * rad;
            if (this._hasClearPath(r.mesh.position.x, r.mesh.position.z, tx, tz, 0.35, false)) {
              r.targetX = tx;
              r.targetZ = tz;
              r.stuckTime = 0;
              r.moveTimer = 0;
              picked = true;
              break;
            }
          }
          if (!picked) r.pauseTimer = 2.0;
        }
        continue;
      }

      const dx = r.targetX - r.mesh.position.x;
      const dz = r.targetZ - r.mesh.position.z;
      const dist = Math.hypot(dx, dz);
      r.moveTimer += dt;
      if (dist < 0.22 || r.moveTimer > 4.0) {
        r.pauseTimer = 1.8 + Math.random() * 3.0;
        r.mesh.position.y = 0;
        r.moveTimer = 0;
        r.stuckTime = 0;
        continue;
      }

      const prevX = r.mesh.position.x;
      const prevZ = r.mesh.position.z;
      const spd = r.fleeTimer > 0 ? 4.2 : r.followTimer > 0 ? 2.4 : 1.35;
      const step = spd * dt;
      const safe = this.world.resolveMovement(prevX + (dx / dist) * step, prevZ + (dz / dist) * step, 0.28);
      r.mesh.position.x = safe.x;
      r.mesh.position.z = safe.z;

      const moved = Math.hypot(safe.x - prevX, safe.z - prevZ);
      if (moved < step * 0.35) {
        r.stuckTime += dt;
        if (r.stuckTime > 0.25) {
          r.pauseTimer = 1.5 + Math.random() * 1.5;
          r.mesh.position.y = 0;
          r.stuckTime = 0;
          continue;
        }
      } else {
        r.stuckTime = Math.max(0, r.stuckTime - dt);
      }

      const wantRot = Math.atan2(dx, dz);
      let dRot = wantRot - r.mesh.rotation.y;
      while (dRot > Math.PI) dRot -= Math.PI * 2;
      while (dRot < -Math.PI) dRot += Math.PI * 2;
      r.mesh.rotation.y += dRot * Math.min(1, dt * 8);

      r.hopPhase += dt * (r.fleeTimer > 0 ? 15 : r.followTimer > 0 ? 11 : 8.2);
      const baseY = this.world.getSurfaceInfo ? this.world.getSurfaceInfo(r.mesh.position.x, r.mesh.position.z).y : 0;
      r.mesh.position.y = baseY + Math.abs(Math.sin(r.hopPhase)) * 0.16;
    }

    // 2. Update paddock farm animals with independent natural state machine (idle / graze / calm walk — NO wall pushing, NO group dancing!)
    const pb = this.world.paddockBounds;
    for (const a of this.farmAnimals) {
      if (a.rig.sparkle && a.rig.sparkle.visible) {
        a.rig.sparkle.rotation.y = elapsed * 2.2;
        const baseY = a.kind === "cow" ? 1.52 : 1.24;
        a.rig.sparkle.position.y = baseY + Math.sin(elapsed * 3.4 + a.walkPhase) * 0.06;
      }
      if (a.rig.tail) {
        a.rig.tail.rotation.z = Math.sin(elapsed * 2.6 + a.walkPhase) * 0.2;
      }

      // Staggered reaction to hay trough refill (each animal casually walks over at its own pace!)
      if (a.pendingTroughTarget && a.reactionDelay > 0) {
        a.reactionDelay -= dt;
        if (a.reactionDelay <= 0) {
          const tgt = a.pendingTroughTarget;
          a.pendingTroughTarget = null;
          if (this._hasClearPath(a.mesh.position.x, a.mesh.position.z, tgt.x, tgt.z, a.radius + 0.08, true)) {
            a.targetX = tgt.x;
            a.targetZ = tgt.z;
            a.state = "walk";
            a.moveTimer = 0;
            a.stuckTime = 0;
          } else {
            // If barn/coop is between animal and trough, stroll to open middle first
            a.targetX = 4.2;
            a.targetZ = 4.0;
            a.state = "walk";
            a.moveTimer = 0;
            a.stuckTime = 0;
          }
        }
      }

      const adx = playerPos.x - a.mesh.position.x;
      const adz = playerPos.z - a.mesh.position.z;
      const aDist = Math.hypot(adx, adz);
      let toPlayer = Math.atan2(adx, adz) - a.mesh.rotation.y;
      while (toPlayer > Math.PI) toPlayer -= Math.PI * 2;
      while (toPlayer < -Math.PI) toPlayer += Math.PI * 2;
      a.noticeCooldown = Math.max(0, (a.noticeCooldown || 0) - dt);

      // Arrived at the refilled hay trough: a happy little tune
      if (a.troughCheer && !a.pendingTroughTarget && a.state !== "walk") {
        a.troughCheer = false;
        if (Math.random() < 0.7) this._emote(a.mesh, "note", this._emoteHeight(a));
      }

      // Individual happy reaction when petted / fed / milked / sheared, each species its own way
      if (a.happyTimer > 0) {
        const total = a.happyTotal || 0.9;
        a.happyTimer = Math.max(0, a.happyTimer - dt);
        const p = 1 - a.happyTimer / total;
        const bell = Math.sin(p * Math.PI);
        a.mesh.rotation.y += toPlayer * Math.min(1, dt * 7); // turn to face the player
        if (a.kind === "cow") {
          // slow contented nod + fast tail swish
          a.mesh.position.y = bell * 0.05;
          a.rig.head.rotation.x = Math.sin(p * Math.PI * 2) * 0.22;
          a.rig.head.rotation.y = THREE.MathUtils.lerp(a.rig.head.rotation.y, 0, dt * 8);
          if (a.rig.tail) a.rig.tail.rotation.z = Math.sin(elapsed * 16) * 0.55 * bell;
        } else if (a.kind === "sheep") {
          // happy full-body wiggle
          a.mesh.position.y = Math.abs(Math.sin(p * Math.PI * 2)) * 0.1;
          a.mesh.rotation.z = Math.sin(p * Math.PI * 6) * 0.1 * bell;
          a.rig.head.rotation.x = -bell * 0.25;
        } else {
          // chickens: flap and hop
          a.mesh.position.y = Math.abs(Math.sin(p * Math.PI * 2)) * 0.16;
          a.rig.head.rotation.x = -bell * 0.3;
          if (a.rig.wingL && a.rig.wingR) {
            const fl = Math.abs(Math.sin(p * Math.PI * 5)) * 0.75 * bell;
            a.rig.wingL.rotation.z = fl;
            a.rig.wingR.rotation.z = -fl;
          }
        }
        continue;
      }
      a.happyTotal = 0.9;
      a.mesh.rotation.z = THREE.MathUtils.lerp(a.mesh.rotation.z, 0, dt * 8);

      // Notice the player: stop, lift the head and look at them (only when standing nearby)
      const near = aDist < 2.7 && !a.pendingTroughTarget;
      if (near && (a.state === "idle" || a.state === "graze")) {
        if (a.state === "graze") a.state = "idle";
        a.stateTimer = Math.max(a.stateTimer, 1.2);
        if (!a.noticing && a.noticeCooldown <= 0) {
          const type = a.kind === "chicken" ? (playerRunning ? "exclaim" : "dots") : a.pettedToday ? "note" : "question";
          if (playerRunning || Math.random() < 0.55) this._emote(a.mesh, type, this._emoteHeight(a));
          a.noticeCooldown = 14;
          if (a.kind === "chicken" && playerRunning) {
            a.happyTimer = 0.5; // startled flap
            a.happyTotal = 0.5;
          }
        }
        a.noticing = true;
        const look = THREE.MathUtils.clamp(toPlayer, -0.95, 0.95);
        a.rig.head.rotation.y = THREE.MathUtils.lerp(a.rig.head.rotation.y, look, Math.min(1, dt * 6));
        a.rig.head.rotation.x = THREE.MathUtils.lerp(a.rig.head.rotation.x, -0.08, Math.min(1, dt * 6));
        // if the player is behind it, slowly turn the body too
        if (Math.abs(toPlayer) > 1.1) a.mesh.rotation.y += Math.sign(toPlayer) * dt * 1.2;
        a.mesh.position.y = THREE.MathUtils.lerp(a.mesh.position.y, 0, dt * 10);
        for (const l of a.rig.legs) l.rotation.x = THREE.MathUtils.lerp(l.rotation.x, 0, dt * 8);
        continue;
      }
      a.noticing = false;

      // Calm wing rest for chickens
      if (a.rig.wingL && a.rig.wingR) {
        a.rig.wingL.rotation.z = THREE.MathUtils.lerp(a.rig.wingL.rotation.z, 0, dt * 8);
        a.rig.wingR.rotation.z = THREE.MathUtils.lerp(a.rig.wingR.rotation.z, 0, dt * 8);
      }

      if (a.state === "idle" || a.state === "graze") {
        a.mesh.position.y = THREE.MathUtils.lerp(a.mesh.position.y, 0, dt * 10);
        for (const l of a.rig.legs) l.rotation.x = THREE.MathUtils.lerp(l.rotation.x, 0, dt * 8);

        if (a.state === "graze") {
          // Head calmly lowered toward straw/ground with tiny natural nibble
          const targetPitch = a.kind === "chicken" ? 0.62 : 0.48;
          const nibble = a.kind === "chicken"
            ? Math.max(0, Math.sin(elapsed * 5.0 + a.walkPhase)) * 0.18
            : Math.sin(elapsed * 3.2 + a.walkPhase) * 0.05;
          a.rig.head.rotation.x = THREE.MathUtils.lerp(a.rig.head.rotation.x, targetPitch + nibble, dt * 6);
          a.rig.head.rotation.y = THREE.MathUtils.lerp(a.rig.head.rotation.y, 0, dt * 5);
        } else {
          // Calm standing & occasional gentle look around (or gazing up at fireworks)
          a.skyGaze = Math.max(0, (a.skyGaze || 0) - dt);
          a.rig.head.rotation.x = THREE.MathUtils.lerp(a.rig.head.rotation.x, a.skyGaze > 0 ? -0.42 : 0, dt * 5);
          a.rig.head.rotation.y = THREE.MathUtils.lerp(a.rig.head.rotation.y, a.lookYaw, dt * 3);
        }

        a.stateTimer -= dt;
        if (a.stateTimer <= 0) {
          const roll = Math.random();
          if (roll < 0.48) {
            // Try picking an unobstructed stroll waypoint
            const wp = this._pickClearPaddockWaypoint(a);
            if (wp) {
              a.targetX = wp.x;
              a.targetZ = wp.z;
              a.state = "walk";
              a.moveTimer = 0;
              a.stuckTime = 0;
            } else {
              a.state = "idle";
              a.stateTimer = 2.0 + Math.random() * 2.0;
            }
          } else if (roll < 0.8) {
            a.state = "graze";
            a.stateTimer = 2.6 + Math.random() * 3.4;
          } else {
            a.state = "idle";
            a.lookYaw = (Math.random() - 0.5) * 0.65;
            a.stateTimer = 2.2 + Math.random() * 2.8;
          }
        }
        continue;
      }

      // STATE === "walk": calm stroll with real obstacle & peer separation + instant stuck recovery!
      const dx = a.targetX - a.mesh.position.x;
      const dz = a.targetZ - a.mesh.position.z;
      const dist = Math.hypot(dx, dz);
      a.moveTimer += dt;

      if (dist < 0.24 || a.moveTimer > 4.2) {
        a.state = Math.random() < 0.55 ? "graze" : "idle";
        a.stateTimer = 2.5 + Math.random() * 3.8;
        a.lookYaw = (Math.random() - 0.5) * 0.5;
        a.stuckTime = 0;
        a.moveTimer = 0;
        continue;
      }

      const prevX = a.mesh.position.x;
      const prevZ = a.mesh.position.z;
      const spd = a.kind === "chicken" ? 0.98 : a.kind === "sheep" ? 0.72 : 0.58;
      const step = spd * dt;

      // Gentle personal-space repulsion from other paddock animals so they don't stack
      let sepX = 0;
      let sepZ = 0;
      for (const other of this.farmAnimals) {
        if (other === a) continue;
        const odx = prevX - other.mesh.position.x;
        const odz = prevZ - other.mesh.position.z;
        const od = Math.hypot(odx, odz);
        const minGap = a.radius + other.radius + 0.22;
        if (od < minGap && od > 0.001) {
          sepX += (odx / od) * 0.45;
          sepZ += (odz / od) * 0.45;
        }
      }

      const vx = dx / dist + sepX;
      const vz = dz / dist + sepZ;
      const vLen = Math.hypot(vx, vz) || 1;
      const nextX = THREE.MathUtils.clamp(prevX + (vx / vLen) * step, pb.minX + a.radius, pb.maxX - a.radius);
      const nextZ = THREE.MathUtils.clamp(prevZ + (vz / vLen) * step, pb.minZ + a.radius, pb.maxZ - a.radius);
      const safe = this.world.resolveMovement(nextX, nextZ, a.radius);
      const clampedX = THREE.MathUtils.clamp(safe.x, pb.minX + a.radius, pb.maxX - a.radius);
      const clampedZ = THREE.MathUtils.clamp(safe.z, pb.minZ + a.radius, pb.maxZ - a.radius);

      a.mesh.position.x = clampedX;
      a.mesh.position.z = clampedZ;

      // Stuck detector: if blocked by wall/fence/barn/peer, stop calmly immediately — NEVER push against wall!
      const moved = Math.hypot(clampedX - prevX, clampedZ - prevZ);
      if (moved < step * 0.38) {
        a.stuckTime += dt;
        if (a.stuckTime > 0.22) {
          a.state = "idle";
          a.stateTimer = 1.6 + Math.random() * 2.2;
          a.lookYaw = (Math.random() - 0.5) * 0.6;
          a.stuckTime = 0;
          continue;
        }
      } else {
        a.stuckTime = Math.max(0, a.stuckTime - dt * 1.5);
      }

      const wantRot = Math.atan2(clampedX - prevX, clampedZ - prevZ);
      let dRot = wantRot - a.mesh.rotation.y;
      while (dRot > Math.PI) dRot -= Math.PI * 2;
      while (dRot < -Math.PI) dRot += Math.PI * 2;
      a.mesh.rotation.y += dRot * Math.min(1, dt * 6);

      a.walkPhase += dt * (a.kind === "chicken" ? 9.5 : 5.8);
      a.rig.head.rotation.x = THREE.MathUtils.lerp(a.rig.head.rotation.x, 0, dt * 6);
      a.rig.head.rotation.y = THREE.MathUtils.lerp(a.rig.head.rotation.y, 0, dt * 6);

      if (a.kind === "chicken") {
        // Subtle natural chicken stride (no bouncing!)
        a.mesh.position.y = Math.abs(Math.sin(a.walkPhase)) * 0.025;
        a.rig.legs[0].rotation.x = Math.sin(a.walkPhase) * 0.42;
        a.rig.legs[1].rotation.x = -Math.sin(a.walkPhase) * 0.42;
      } else {
        // Smooth grounded quadruped walk (feet stay grounded, zero vertical hopping!)
        a.mesh.position.y = 0;
        const sw = Math.sin(a.walkPhase) * 0.34;
        a.rig.legs[0].rotation.x = sw;
        a.rig.legs[3].rotation.x = sw;
        a.rig.legs[1].rotation.x = -sw;
        a.rig.legs[2].rotation.x = -sw;
      }
    }
  }
}
