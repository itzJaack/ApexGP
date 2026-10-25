// Test the whole footprint before placing a building beside any part of a loop.
// This avoids pit buildings and grandstands intersecting a nearby second bend.
export function scenerySite(track, station, offset, width, depth) {
  const sign = Math.sign(offset) || 1;
  for (let extra = 0; extra <= 480; extra += 12) {
    const p = track.sample(station, offset + sign * extra), c = Math.cos(p.yaw), s = Math.sin(p.yaw);
    let safe = true;
    for (const x of [-width / 2, 0, width / 2]) for (let j = 0; j <= 8; j++) {
      const z = (j / 8 - .5) * depth;
      if (track.nearestDistance(p.x + x * c + z * s, p.z - x * s + z * c) < track.halfWidth + 17) safe = false;
    }
    if (safe) return p;
  }
  return null;
}

