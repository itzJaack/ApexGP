// Offline vertex clustering retains object/material boundaries, UVs and normals.
// Wheels and steering keep their original pivots; no geometry is built at runtime.
import fs from 'node:fs/promises';
import {gzipSync, gunzipSync} from 'node:zlib';
import {parseOBJ} from '../dist/models.js';
const root = new URL('../dist/assets/models/', import.meta.url);
const manifest = JSON.parse(await fs.readFile(new URL('manifest.json', root), 'utf8'));
function simplify(model, cell) {
  const lines = ['# ApexGP low detail model; metres, Y up, +Z forward'];
  let offset = 1, triangles = 0, vertices = 0;
  for (const group of model.groups) {
    const clusters = new Map(), refs = [], data = group.data;
    for (let i = 0; i < data.length; i += 8) {
      const key = [0, 1, 2].map(k => Math.round(data[i + k] / cell)).join(',');
      let vertex = clusters.get(key);
      if (!vertex) { vertex = {index: clusters.size, sum: Array(8).fill(0), count: 0}; clusters.set(key, vertex); }
      for (let k = 0; k < 8; k++) vertex.sum[k] += data[i + k];
      vertex.count++;
      refs.push(vertex.index);
    }
    const faces = [], seen = new Set();
    for (let i = 0; i < refs.length; i += 3) {
      const face = refs.slice(i, i + 3);
      if (new Set(face).size < 3) continue;
      const key = [...face].sort((a, b) => a - b).join(',');
      if (!seen.has(key)) { seen.add(key); faces.push(face); }
    }
    lines.push('o ' + group.object, 'usemtl ' + group.material);
    for (const vertex of clusters.values()) {
      const v = vertex.sum.map(n => n / vertex.count), length = Math.hypot(...v.slice(3, 6)) || 1;
      lines.push('v ' + v.slice(0, 3).map(n => n.toFixed(5)).join(' '));
      lines.push('vn ' + v.slice(3, 6).map(n => (n / length).toFixed(5)).join(' '));
      lines.push('vt ' + v.slice(6, 8).map(n => n.toFixed(5)).join(' '));
    }
    for (const face of faces) lines.push('f ' + face.map(i => `${i + offset}/${i + offset}/${i + offset}`).join(' '));
    offset += clusters.size; vertices += clusters.size; triangles += faces.length;
  }
  return {text: lines.join('\n'), vertices, triangles};
}
for (const spec of [...Object.values(manifest.bikes), {...manifest.rider, id: 'gp-rider'}]) {
  const model = parseOBJ(gunzipSync(await fs.readFile(new URL(spec.race, root))).toString());
  for (const [lod, cell] of [['low', .032], ['distant', .055]]) {
    const result = simplify(model, cell);
    const filename = spec.id + '-' + lod + '.obj.gz';
    await fs.writeFile(new URL(filename, root), gzipSync(result.text, {level: 9}));
    (spec.id === 'gp-rider' ? manifest.rider : spec)[lod] = filename;
    manifest.stats[spec.id + '-' + lod] = {vertices: result.vertices, triangles: result.triangles};
    console.log(spec.id, lod, result.triangles);
  }
}
manifest.version = '4.1';
await fs.writeFile(new URL('manifest.json', root), JSON.stringify(manifest));

