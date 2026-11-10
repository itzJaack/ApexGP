// Exact two-dimensional footprint checks, indexed once per circuit. Checking
// only building corners misses long walls and roofs crossing another bend.
const indexes = new WeakMap();
const CELL = 64;

function roadIndex(track) {
  if (indexes.has(track)) return indexes.get(track);
  const cells = new Map(), nodes = track.nodes;
  for (let i = 0; i < nodes.length; i++) {
    const p = nodes[i], q = nodes[(i + 1) % nodes.length];
    const segment = [[p.x, p.z], [q.x, q.z]];
    for (let x = Math.floor(Math.min(p.x, q.x) / CELL); x <= Math.floor(Math.max(p.x, q.x) / CELL); x++)
      for (let z = Math.floor(Math.min(p.z, q.z) / CELL); z <= Math.floor(Math.max(p.z, q.z) / CELL); z++) {
        const key = x + ',' + z;
        if (!cells.has(key)) cells.set(key, []);
        cells.get(key).push(segment);
      }
  }
  indexes.set(track, cells);
  return cells;
}

function inRing([x, z], ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j];
    if ((a[1] > z) !== (b[1] > z) && x < (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}

function pointDistanceSquared(p, a, b) {
  const dx = b[0] - a[0], dz = b[1] - a[1];
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / (dx * dx + dz * dz || 1)));
  return (p[0] - a[0] - t * dx) ** 2 + (p[1] - a[1] - t * dz) ** 2;
}

function segmentsDistanceSquared(a, b, c, d) {
  const cross = (u, v, p) => (v[0] - u[0]) * (p[1] - u[1]) - (v[1] - u[1]) * (p[0] - u[0]);
  if (cross(a, b, c) * cross(a, b, d) < 0 && cross(c, d, a) * cross(c, d, b) < 0) return 0;
  return Math.min(pointDistanceSquared(a, c, d), pointDistanceSquared(b, c, d),
    pointDistanceSquared(c, a, b), pointDistanceSquared(d, a, b));
}

export function footprintClearOfTrack(track, rings, holes = [], margin = 3) {
  const vertices = rings.flat();
  if (!vertices.length) return true;
  const radius = track.halfWidth + margin;
  if (!track.nodes?.length) return vertices.every(p => track.nearestDistance(...p) > radius);
  const xs = vertices.map(p => p[0]), zs = vertices.map(p => p[1]);
  const cells = roadIndex(track), candidates = new Set();
  for (let x = Math.floor((Math.min(...xs) - radius) / CELL); x <= Math.floor((Math.max(...xs) + radius) / CELL); x++)
    for (let z = Math.floor((Math.min(...zs) - radius) / CELL); z <= Math.floor((Math.max(...zs) + radius) / CELL); z++)
      for (const segment of cells.get(x + ',' + z) || []) candidates.add(segment);
  const occupied = p => rings.some(r => inRing(p, r)) && !holes.some(r => inRing(p, r));
  for (const [a, b] of candidates) {
    if (occupied(a) || occupied(b)) return false;
    for (const ring of [...rings, ...holes]) for (let i = 0; i < ring.length; i++)
      if (segmentsDistanceSquared(a, b, ring[i], ring[(i + 1) % ring.length]) <= radius * radius) return false;
  }
  return true;
}

export function boxFootprint(x, z, width, depth, yaw) {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  return [[-1, -1], [-1, 1], [1, 1], [1, -1]].map(([u, v]) =>
    [x + u * width / 2 * c + v * depth / 2 * s, z - u * width / 2 * s + v * depth / 2 * c]);
}

// Pit outlines can be imperfect near a corner. Keep their valid architecture,
// trimming wall/roof triangles instead of discarding the entire complex.
export function clearStructureGeometry(target, track, margin = 1) {
  const clear = points => footprintClearOfTrack(track, [points.map(p => [p[0], p[2]])], [], margin);
  function triangle(a, b, c, color, material, depth = 0) {
    if (clear([a, b, c])) {target.tri(a, b, c, color, material); return;}
    const points = [a, b, c], lengths = points.map((p, i) => {
      const q = points[(i + 1) % 3];
      return Math.hypot(p[0] - q[0], p[2] - q[2]);
    });
    const edge = lengths.indexOf(Math.max(...lengths));
    if (lengths[edge] <= 2 || depth >= 14) return;
    const p = points[edge], q = points[(edge + 1) % 3], r = points[(edge + 2) % 3];
    const mid = p.map((value, i) => (value + q[i]) / 2);
    triangle(p, mid, r, color, material, depth + 1);
    triangle(mid, q, r, color, material, depth + 1);
  }
  return {
    tri: triangle,
    quad(a, b, c, d, color, material) {
      triangle(a, b, c, color, material); triangle(a, c, d, color, material);
    },
    box(point, size, color, yaw = 0) {
      if (footprintClearOfTrack(track, [boxFootprint(point[0], point[2], size[0], size[2], yaw)], [], margin))
        target.box(point, size, color, yaw);
    },
    cylinder(a, b, radius, ...rest) {
      const yaw = Math.atan2(b[0] - a[0], b[2] - a[2]);
      const footprint = boxFootprint((a[0] + b[0]) / 2, (a[2] + b[2]) / 2,
        radius * 2, Math.hypot(b[0] - a[0], b[2] - a[2]) + radius * 2, yaw);
      if (footprintClearOfTrack(track, [footprint], [], margin)) target.cylinder(a, b, radius, ...rest);
    },
  };
}
