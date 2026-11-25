// =====================================================================
//  Map zones beyond the homestead yard.
//  Single source of truth for where the player may walk outside the yard rectangle,
//  where the hill terrain is flattened, and what the HUD calls each place.
//  world.js (movement), landscape.js (terrain + distant forest) and main.js (HUD) read from here.
//
//  Coordinates: +X east, -Z north (the cottage faces south toward +Z).
//  All zone ground sits flat at y = 0, same as the yard.
// =====================================================================

// The original yard (unchanged)
export const YARD_RECT = { minX: -17.0, maxX: 19.6, minZ: -13.6, maxZ: 14.2 };

// --- South: pine trail from the garden's south gate down to a frozen lake ---
export const SOUTH_TRAIL = {
  pts: [
    [-4.8, 11.5],
    [-5.4, 17.0],
    [-4.4, 23.0],
    [-6.2, 29.0],
    [-8.0, 34.5],
  ],
  halfW: 1.5,
};
// Frozen lake: the ice itself (walkable) …
export const LAKE = { cx: -9.0, cz: 42.0, rx: 9.0, rz: 6.5 };
// … and the walkable snowy shore around it
export const LAKE_SHORE = { cx: -9.0, cz: 42.0, rx: 12.5, rz: 10.0 };

// --- North: trail around the west side of the cottage up to a mountain-foot hot spring,
//     with a short spur west to a stargazing platform ---
export const NORTH_TRAIL = {
  pts: [
    [-8.0, -2.4],
    [-8.2, -9.0],
    [-7.8, -14.5],
    [-6.6, -21.0],
    [-5.6, -27.5],
    [-5.2, -31.0],
  ],
  halfW: 1.5,
};
export const HOT_SPRING_AREA = { cx: -5.0, cz: -39.5, r: 9.5 };
export const STARGAZE_SPUR = {
  pts: [
    [-12.0, -42.0],
    [-14.6, -44.6],
  ],
  halfW: 1.4,
};
export const STARGAZE_AREA = { cx: -18.0, cz: -46.0, r: 5.0 };

// ---------------------------------------------------------------------
//  Signed distance helpers (negative = inside)
// ---------------------------------------------------------------------
function sdSegment(px, pz, ax, az, bx, bz) {
  const dx = bx - ax;
  const dz = bz - az;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / (dx * dx + dz * dz)));
  return Math.hypot(px - (ax + dx * t), pz - (az + dz * t));
}

function sdPath(x, z, path) {
  let d = Infinity;
  const p = path.pts;
  for (let i = 0; i < p.length - 1; i++) {
    d = Math.min(d, sdSegment(x, z, p[i][0], p[i][1], p[i + 1][0], p[i + 1][1]));
  }
  return d - path.halfW;
}

// Cheap ellipse distance: exact on the axes, close enough elsewhere for movement & terrain
function sdEllipse(x, z, e) {
  const nx = (x - e.cx) / e.rx;
  const nz = (z - e.cz) / e.rz;
  const k = Math.hypot(nx, nz);
  return (k - 1) * Math.min(e.rx, e.rz);
}

function sdCircle(x, z, c) {
  return Math.hypot(x - c.cx, z - c.cz) - c.r;
}

function sdRect(x, z, r) {
  const dx = Math.max(r.minX - x, x - r.maxX);
  const dz = Math.max(r.minZ - z, z - r.maxZ);
  if (dx <= 0 && dz <= 0) return Math.max(dx, dz);
  return Math.hypot(Math.max(dx, 0), Math.max(dz, 0));
}

// Ordered most specific first: zoneNameAt returns the first zone whose shape contains the point
export const ZONES = [
  { id: "lake", name: "镜湖", sd: (x, z) => sdEllipse(x, z, LAKE_SHORE) },
  { id: "southTrail", name: "松林小径", sd: (x, z) => sdPath(x, z, SOUTH_TRAIL) },
  { id: "stargaze", name: "观星台", sd: (x, z) => Math.min(sdCircle(x, z, STARGAZE_AREA), sdPath(x, z, STARGAZE_SPUR)) },
  { id: "hotspring", name: "山脚温泉", sd: (x, z) => sdCircle(x, z, HOT_SPRING_AREA) },
  { id: "northTrail", name: "山脚小径", sd: (x, z) => sdPath(x, z, NORTH_TRAIL) },
];

// Signed distance to the union of everything outside the yard (negative = inside a zone)
export function zonesSd(x, z) {
  let d = Infinity;
  for (const zn of ZONES) d = Math.min(d, zn.sd(x, z));
  return d;
}

// Signed distance to the whole walkable area (yard + zones)
export function walkableSd(x, z) {
  return Math.min(sdRect(x, z, YARD_RECT), zonesSd(x, z));
}

export function isWalkable(x, z) {
  return walkableSd(x, z) <= 0;
}

// Pull a point that has stepped outside the walkable area back onto its edge (smooth sliding)
export function projectToWalkable(x, z) {
  let px = x;
  let pz = z;
  for (let i = 0; i < 3; i++) {
    const d = walkableSd(px, pz);
    if (d <= 0) break;
    const e = 0.02;
    let gx = walkableSd(px + e, pz) - walkableSd(px - e, pz);
    let gz = walkableSd(px, pz + e) - walkableSd(px, pz - e);
    const gl = Math.hypot(gx, gz) || 1;
    gx /= gl;
    gz /= gl;
    px -= gx * (d + 0.001);
    pz -= gz * (d + 0.001);
  }
  return { x: px, z: pz };
}

// 0..1: how strongly hill terrain should be flattened to y = 0 here.
// Fully flat a little beyond the walkable edge, easing back into the hills over ~7 m.
const FLAT_MARGIN = 2.5;
const FLAT_BLEND = 7.0;
export function zoneFlatWeight(x, z) {
  const d = zonesSd(x, z) - FLAT_MARGIN;
  if (d <= 0) return 1;
  if (d >= FLAT_BLEND) return 0;
  const t = 1 - d / FLAT_BLEND;
  return t * t * (3 - 2 * t);
}

export function zoneNameAt(x, z) {
  if (sdRect(x, z, YARD_RECT) <= 0) return "冬麓院子";
  for (const zn of ZONES) if (zn.sd(x, z) <= 0) return zn.name;
  return "冬麓院子";
}
