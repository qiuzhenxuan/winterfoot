import * as THREE from "three";

// Static batching: many small meshes that never move are merged into a few big meshes
// (one per material + shadow flags + map cell), so the GPU gets a few hundred draw calls
// instead of thousands. The picture is identical: each merged mesh keeps the original
// material object, so anything that tweaks a material at runtime (lamp glow, window
// light, snow tint...) still works.
//
// Never merged:
//  - anything in `protectedSet` (objects the game keeps a reference to: it may move,
//    hide, swap or raycast them), together with everything inside them
//  - instanced / skinned / morphing meshes, sprites, points, lines
//  - transparent materials (they need per-object depth sorting)
//  - multi-material meshes and meshes flagged userData.noBatch

const CELL = 16; // metres; keeps merged meshes local so frustum culling still helps

function attributeSignature(geo) {
  return Object.keys(geo.attributes)
    .sort()
    .map((k) => `${k}:${geo.attributes[k].itemSize}`)
    .join(",");
}

function canBatch(o) {
  if (!o.isMesh || o.isInstancedMesh || o.isSkinnedMesh || o.isBatchedMesh) return false;
  if (Array.isArray(o.material) || !o.material) return false;
  const m = o.material;
  if (m.transparent || m.opacity < 1) return false;
  if (o.userData && o.userData.noBatch) return false;
  if (o.onBeforeRender !== THREE.Object3D.prototype.onBeforeRender) return false;
  const g = o.geometry;
  if (!g || !g.attributes.position) return false;
  if (g.morphAttributes && Object.keys(g.morphAttributes).length) return false;
  // a single material draws the whole geometry (groups are ignored), but a partial
  // draw range would not survive the merge
  if (g.drawRange.start !== 0 || g.drawRange.count !== Infinity) return false;
  return true;
}

// Everything the game holds a reference to (walking its own fields, arrays, maps and
// plain objects), so those objects and their children are left alone.
export function collectReferencedObjects(owners, skipKeys = []) {
  const skip = new Set(skipKeys);
  const found = new Set();
  const foundMaterials = new Set();
  const seen = new Set();
  const walk = (v, depth) => {
    if (!v || typeof v !== "object" || seen.has(v)) return;
    seen.add(v);
    if (v.isObject3D) {
      found.add(v);
      return;
    }
    if (v.isMaterial) {
      foundMaterials.add(v);
      return;
    }
    if (v.isTexture || v.isBufferGeometry || v.isColor || v.isVector3 || v.isMatrix4) return;
    if (ArrayBuffer.isView(v)) return;
    if (depth > 6) return;
    if (Array.isArray(v)) {
      for (const x of v) walk(x, depth + 1);
    } else if (v instanceof Map || v instanceof Set) {
      for (const x of v.values()) walk(x, depth + 1);
    } else {
      for (const k of Object.keys(v)) {
        if (depth === 0 && skip.has(k)) continue;
        walk(v[k], depth + 1);
      }
    }
  };
  for (const owner of owners) {
    seen.add(owner);
    for (const k of Object.keys(owner)) {
      if (skip.has(k)) continue;
      walk(owner[k], 1);
    }
  }
  found.materials = foundMaterials;
  return found;
}

// Many props build their own material instance with identical settings. Those are folded
// into one shared material so they can share a draw call. Materials the game keeps a handle
// on (it animates them) and materials with custom shader hooks keep their own identity.
const MAT_KEYS = [
  "type", "side", "transparent", "opacity", "alphaTest", "vertexColors", "flatShading", "fog", "toneMapped",
  "depthWrite", "depthTest", "wireframe", "roughness", "metalness", "emissiveIntensity", "envMapIntensity",
  "aoMapIntensity", "lightMapIntensity", "bumpScale", "displacementScale", "blending", "colorWrite", "dithering",
  "polygonOffset", "polygonOffsetFactor", "polygonOffsetUnits", "shadowSide", "alphaToCoverage", "premultipliedAlpha",
  "visible", "normalMapType", "displacementBias", "stencilWrite", "forceSinglePass",
];
const PLAIN_TYPES = new Set(["MeshStandardMaterial", "MeshBasicMaterial", "MeshLambertMaterial"]);
const MAP_KEYS = ["map", "emissiveMap", "normalMap", "roughnessMap", "metalnessMap", "aoMap", "alphaMap", "bumpMap", "lightMap", "envMap", "displacementMap"];
function materialSignature(m) {
  if (m.onBeforeCompile !== THREE.Material.prototype.onBeforeCompile) return null;
  if (!PLAIN_TYPES.has(m.type)) return null;
  if (m.clippingPlanes && m.clippingPlanes.length) return null;
  if (m.userData && Object.keys(m.userData).length) return null;
  const parts = [m.constructor.name];
  for (const k of MAT_KEYS) parts.push(m[k]);
  for (const k of ["color", "emissive", "specular", "sheenColor"]) parts.push(m[k] && m[k].isColor ? m[k].getHexString() : "");
  for (const k of MAP_KEYS) parts.push(m[k] ? m[k].uuid : "");
  if (m.normalScale) parts.push(m.normalScale.x, m.normalScale.y);
  return parts.join("|");
}

export function batchStaticMeshes(root, referenced, { name = "static-batch", lockedMaterials = new Set(), nested = true } = {}) {
  root.updateMatrixWorld(true);

  // Expand references to every descendant; also guard against anything sitting under a
  // referenced ancestor (it moves with it).
  const locked = new Set();
  for (const r of referenced) r.traverse((o) => locked.add(o));

  // Materials used by anything we leave alone, or that the game references, stay unique
  const keepMats = new Set(lockedMaterials);
  root.traverse((o) => {
    if (o.material && locked.has(o)) [].concat(o.material).forEach((m) => keepMats.add(m));
  });
  const canonical = new Map();
  const canon = (m) => {
    if (keepMats.has(m)) return m;
    const sig = materialSignature(m);
    if (!sig) return m;
    let c = canonical.get(sig);
    if (!c) canonical.set(sig, (c = m));
    return c;
  };

  const stats = { removed: 0, added: 0 };
  // 1) everything outside the referenced objects, merged in world-map cells
  mergeUnder(root, (o) => locked.has(o), CELL, canon, name, stats);

  // 2) inside each referenced group (a tree that shakes, a sign that swings...), the parts
  // that the game never touches on their own are merged in that group's own space, so the
  // group still moves, hides and scales as one piece exactly as before.
  if (nested) {
    const inRoot = (o) => {
      for (let p = o; p; p = p.parent) if (p === root) return true;
      return false;
    };
    for (const r of referenced) {
      if (r === root || !inRoot(r)) continue;
      let topLevel = true;
      for (let p = r.parent; p && p !== root; p = p.parent) if (referenced.has(p)) topLevel = false;
      if (!topLevel) continue;
      const inner = new Set();
      r.traverse((o) => {
        if (o !== r && referenced.has(o)) o.traverse((d) => inner.add(d));
      });
      mergeUnder(r, (o) => o === r || inner.has(o), Infinity, canon, name, stats);
    }
  }
  return stats;
}

function mergeUnder(root, isLocked, cellSize, canon, name, stats) {
  const rootInv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const buckets = new Map();
  const rel = new THREE.Matrix4();
  const centre = new THREE.Vector3();
  root.traverse((o) => {
    if (isLocked(o) || !canBatch(o) || !o.visible) return;
    // every ancestor up to root must be visible (hidden subtrees stay as they are)
    for (let p = o.parent; p && p !== root; p = p.parent) {
      if (!p.visible || isLocked(p)) return;
    }
    rel.multiplyMatrices(rootInv, o.matrixWorld);
    if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere();
    centre.copy(o.geometry.boundingSphere.center).applyMatrix4(rel);
    const cell = cellSize === Infinity ? "all" : `${Math.floor(centre.x / cellSize)},${Math.floor(centre.z / cellSize)}`;
    const m = canon(o.material);
    const key = [m.uuid, o.castShadow ? 1 : 0, o.receiveShadow ? 1 : 0, o.renderOrder, o.frustumCulled ? 1 : 0, attributeSignature(o.geometry), cell].join("|");
    let b = buckets.get(key);
    if (!b) buckets.set(key, (b = { material: m, castShadow: o.castShadow, receiveShadow: o.receiveShadow, renderOrder: o.renderOrder, items: [] }));
    b.items.push({ mesh: o, matrix: rel.clone() });
  });

  const nrm = new THREE.Matrix3();
  for (const b of buckets.values()) {
    if (b.items.length < 2) continue;
    const names = Object.keys(b.items[0].mesh.geometry.attributes);
    let total = 0;
    const parts = b.items.map(({ mesh, matrix }) => {
      const g = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry;
      total += g.attributes.position.count;
      return { g, temp: !!mesh.geometry.index, matrix, flip: matrix.determinant() < 0 };
    });
    const out = {};
    for (const n of names) {
      const src = b.items[0].mesh.geometry.attributes[n];
      out[n] = new THREE.BufferAttribute(new Float32Array(total * src.itemSize), src.itemSize, false);
    }
    let off = 0;
    const v = new THREE.Vector3();
    for (const { g, matrix, flip } of parts) {
      const count = g.attributes.position.count;
      nrm.getNormalMatrix(matrix);
      for (const n of names) {
        const a = g.attributes[n];
        const dst = out[n];
        const size = a.itemSize;
        for (let i = 0; i < count; i++) {
          // mirrored parts: swap two corners of every triangle to keep the winding right
          const si = flip && i % 3 === 1 ? i + 1 : flip && i % 3 === 2 ? i - 1 : i;
          const di = off + i;
          if (n === "position") {
            v.fromBufferAttribute(a, si).applyMatrix4(matrix);
            dst.setXYZ(di, v.x, v.y, v.z);
          } else if (n === "normal") {
            v.fromBufferAttribute(a, si).applyMatrix3(nrm).normalize();
            dst.setXYZ(di, v.x, v.y, v.z);
          } else if (n === "tangent" && size === 4) {
            v.fromBufferAttribute(a, si).transformDirection(matrix);
            dst.setXYZW(di, v.x, v.y, v.z, a.getW(si) * (flip ? -1 : 1));
          } else {
            for (let c = 0; c < size; c++) dst.array[di * size + c] = a.getComponent(si, c);
          }
        }
      }
      off += count;
    }
    const geo = new THREE.BufferGeometry();
    for (const n of names) geo.setAttribute(n, out[n]);
    geo.computeBoundingSphere();
    geo.computeBoundingBox();
    const merged = new THREE.Mesh(geo, b.material);
    merged.name = name;
    merged.castShadow = b.castShadow;
    merged.receiveShadow = b.receiveShadow;
    merged.renderOrder = b.renderOrder;
    merged.matrixAutoUpdate = false;
    root.add(merged);
    merged.updateMatrix();
    stats.added++;
    for (const { mesh } of b.items) {
      mesh.parent.remove(mesh);
      stats.removed++;
    }
    for (const { g, temp } of parts) if (temp) g.dispose();
  }
}

// Snow caps that thicken in heavy snow (their scale.y follows the snow depth) are merged
// too. A cap's vertex at depth c sits at  rel * (x, c*y, z)  =  A + c*B, and its normal at
// normalize(U + V/c), so the merged mesh is redrawn exactly like the separate caps were by
// recomputing those two lines whenever the depth changes. Returns the caps it took plus
// one handle per merged mesh with setScale(c).
const CAP_ATTRS = new Set(["position", "normal", "uv", "uv1", "color"]);
export function batchScalableCaps(root, caps, lockedObjects, { name = "snow-cap-batch", minScale = 0.6, maxScale = 1.75 } = {}) {
  root.updateMatrixWorld(true);
  const rootInv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const locked = new Set();
  for (const r of lockedObjects) r.traverse((o) => locked.add(o));
  const buckets = new Map();
  const taken = new Set();
  const centre = new THREE.Vector3();
  for (const cap of caps) {
    const o = cap.mesh;
    if (locked.has(o) || o.children.length || !canBatch(o) || !o.visible) continue;
    if (!o.geometry.attributes.normal || Object.keys(o.geometry.attributes).some((k) => !CAP_ATTRS.has(k))) continue;
    if (Math.abs(o.scale.y - cap.baseY) > 1e-6) continue;
    let ok = o.parent;
    for (let p = o.parent; p && p !== root; p = p.parent) if (locked.has(p) || !p.visible) ok = null;
    for (let p = o.parent; p !== root; p = p && p.parent) if (!p) ok = null;
    if (!ok) continue;
    const rel = new THREE.Matrix4().multiplyMatrices(rootInv, o.matrixWorld);
    if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere();
    centre.copy(o.geometry.boundingSphere.center).applyMatrix4(rel);
    const cell = `${Math.floor(centre.x / CELL)},${Math.floor(centre.z / CELL)}`;
    const key = [o.material.uuid, o.castShadow ? 1 : 0, o.receiveShadow ? 1 : 0, o.renderOrder, o.frustumCulled ? 1 : 0, attributeSignature(o.geometry), cell].join("|");
    let b = buckets.get(key);
    if (!b) buckets.set(key, (b = { material: o.material, castShadow: o.castShadow, receiveShadow: o.receiveShadow, renderOrder: o.renderOrder, items: [] }));
    b.items.push({ cap, mesh: o, rel });
  }

  const handles = [];
  const v = new THREE.Vector3();
  const lin = new THREE.Matrix3();
  const nrm = new THREE.Matrix3();
  for (const b of buckets.values()) {
    if (b.items.length < 2) continue;
    const names = Object.keys(b.items[0].mesh.geometry.attributes);
    let total = 0;
    const parts = b.items.map((it) => {
      const g = it.mesh.geometry.index ? it.mesh.geometry.toNonIndexed() : it.mesh.geometry;
      total += g.attributes.position.count;
      return { ...it, g, temp: !!it.mesh.geometry.index, flip: it.rel.determinant() < 0 };
    });
    const A = new Float32Array(total * 3);
    const B = new Float32Array(total * 3);
    const U = new Float32Array(total * 3);
    const V = new Float32Array(total * 3);
    const out = {};
    for (const n of names) {
      const src = b.items[0].mesh.geometry.attributes[n];
      out[n] = new THREE.BufferAttribute(new Float32Array(total * src.itemSize), src.itemSize, false);
    }
    let off = 0;
    for (const { g, rel, flip } of parts) {
      const count = g.attributes.position.count;
      lin.setFromMatrix4(rel);
      nrm.getNormalMatrix(rel);
      const pa = g.attributes.position;
      const na = g.attributes.normal;
      for (let i = 0; i < count; i++) {
        const si = flip && i % 3 === 1 ? i + 1 : flip && i % 3 === 2 ? i - 1 : i;
        const d = (off + i) * 3;
        v.set(pa.getX(si), 0, pa.getZ(si)).applyMatrix4(rel);
        A[d] = v.x; A[d + 1] = v.y; A[d + 2] = v.z;
        v.set(0, pa.getY(si), 0).applyMatrix3(lin);
        B[d] = v.x; B[d + 1] = v.y; B[d + 2] = v.z;
        v.set(na.getX(si), 0, na.getZ(si)).applyMatrix3(nrm);
        U[d] = v.x; U[d + 1] = v.y; U[d + 2] = v.z;
        v.set(0, na.getY(si), 0).applyMatrix3(nrm);
        V[d] = v.x; V[d + 1] = v.y; V[d + 2] = v.z;
        for (const n of names) {
          if (n === "position" || n === "normal") continue;
          const a = g.attributes[n];
          for (let c = 0; c < a.itemSize; c++) out[n].array[(off + i) * a.itemSize + c] = a.getComponent(si, c);
        }
      }
      off += count;
    }
    const geo = new THREE.BufferGeometry();
    for (const n of names) geo.setAttribute(n, out[n]);
    const pos = out.position.array;
    const nor = out.normal.array;
    const setScale = (c) => {
      const ic = 1 / c;
      for (let d = 0; d < pos.length; d += 3) {
        pos[d] = A[d] + c * B[d];
        pos[d + 1] = A[d + 1] + c * B[d + 1];
        pos[d + 2] = A[d + 2] + c * B[d + 2];
        const x = U[d] + ic * V[d];
        const y = U[d + 1] + ic * V[d + 1];
        const z = U[d + 2] + ic * V[d + 2];
        const l = Math.hypot(x, y, z) || 1;
        nor[d] = x / l;
        nor[d + 1] = y / l;
        nor[d + 2] = z / l;
      }
      out.position.needsUpdate = true;
      out.normal.needsUpdate = true;
    };
    // bounds that hold at every depth, so culling never clips a thick cap
    setScale(maxScale);
    geo.computeBoundingBox();
    const box = geo.boundingBox.clone();
    setScale(minScale);
    geo.computeBoundingBox();
    geo.boundingBox.union(box);
    geo.boundingSphere = geo.boundingBox.getBoundingSphere(new THREE.Sphere());
    setScale(1);
    const merged = new THREE.Mesh(geo, b.material);
    merged.name = name;
    merged.castShadow = b.castShadow;
    merged.receiveShadow = b.receiveShadow;
    merged.renderOrder = b.renderOrder;
    merged.matrixAutoUpdate = false;
    root.add(merged);
    merged.updateMatrix();
    for (const { cap, mesh } of b.items) {
      mesh.parent.remove(mesh);
      taken.add(cap);
    }
    for (const p of parts) if (p.temp) p.g.dispose();
    handles.push({ mesh: merged, setScale });
  }
  return { taken, handles };
}
