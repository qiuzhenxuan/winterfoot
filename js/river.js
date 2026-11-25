// Shared river course for the whole valley.
// The brook rises in the gap between the two northern horn peaks, runs south through
// the homestead (unchanged in the yard so the bridge & paths still line up), then
// meanders south-west out of the valley through a gorge in the southern ranges.
// world.js (yard ice, banks, collision) and landscape.js (carved valley, gorge,
// distant river ribbon, forest belt exclusion) both read from here.

const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export const RIVER = {
  zSource: -132, // where the stream emerges from the northern peaks
  zMouth: 178, // fades into the southern haze beyond the last range
  yardHalfWidth: 1.28, // half width of the ice inside the homestead
};

// River centreline X for a given Z (north is -Z)
export function riverCenterX(z) {
  // Original gentle meander through the yard — keep exactly as before near the bridge
  const yard = 11.8 + Math.sin(z * 0.22) * 0.65;
  if (z < 0) {
    // Upstream: drifts north-east into the valley between the two tallest horns
    const k = smooth(18, 115, -z);
    return yard + k * 12 + Math.sin(z * 0.047 + 0.6) * 4.2 * smooth(20, 55, -z);
  }
  // Downstream: wide lazy bends swinging south-west out of the valley
  const k = smooth(18, 150, z);
  return yard - k * 26 + Math.sin(z * 0.041 + 1.1) * 5.5 * smooth(22, 60, z);
}

// Ice surface height: flat through the clearing, climbing into the mountains
// upstream, gently falling away downstream (water always runs downhill to the south).
export function riverSurfaceY(z) {
  if (z < -26) {
    const d = -z - 26;
    return 0.06 + 0.045 * Math.pow(d, 1.12);
  }
  if (z > 26) {
    return 0.06 - 0.011 * (z - 26);
  }
  return 0.06;
}

// Half width of the ice ribbon: narrow mountain stream upstream, broader downstream
export function riverHalfWidth(z) {
  if (z < 0) return RIVER.yardHalfWidth - 0.45 * smooth(20, 120, -z);
  return RIVER.yardHalfWidth + 1.1 * smooth(20, 160, z);
}

// Half width of the flat valley floor carved into hills/mountains around the river
export function riverValleyFloorHalf(z) {
  return riverHalfWidth(z) + 2.6 + Math.abs(z) * 0.025;
}

// Approximate horizontal distance from a point to the river centreline.
// The course is a gentle function of z, so the x-offset (scaled by the local
// slope) is accurate enough for carving and tree placement.
export function riverDistance(x, z) {
  const cx = riverCenterX(z);
  const dz = 0.5;
  const slope = (riverCenterX(z + dz) - riverCenterX(z - dz)) / (2 * dz);
  return Math.abs(x - cx) / Math.sqrt(1 + slope * slope);
}

// How strongly the river valley is carved at this z (fades out at the source so
// the gorge closes into the mountainside instead of slicing through the peaks)
export function riverCarveStrength(z) {
  if (z < RIVER.zSource) return 0;
  return smooth(RIVER.zSource, RIVER.zSource + 22, z);
}
