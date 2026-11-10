// Test the whole footprint before placing a building beside any part of a loop.
// This avoids pit buildings and grandstands intersecting a nearby second bend.
import {footprintClearOfTrack,boxFootprint} from './track-clearance.js';
export function scenerySite(track, station, offset, width, depth) {
  const sign = Math.sign(offset) || 1;
  for (let extra = 0; extra <= 480; extra += 12) {
    const p = track.sample(station, offset + sign * extra);
    if (footprintClearOfTrack(track,[boxFootprint(p.x,p.z,width,depth,p.yaw)],[],17)) return p;
  }
  return null;
}

