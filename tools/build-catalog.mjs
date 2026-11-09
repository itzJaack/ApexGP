import fs from 'node:fs/promises';
import {TRACKS, BIKES, Circuit} from '../dist/simulation.js';
const tracks = TRACKS.map(config => {
  const t = new Circuit(config);
  return {id: config.id, name: config.name, length: t.length, halfWidth: t.halfWidth,
    nodes: t.nodes.map((p, i) => ({...p, y: t.sample(i * t.step).y}))};
});
const {version}=JSON.parse(await fs.readFile('package.json','utf8'));
await fs.writeFile('data/race-data.json', JSON.stringify({version, tracks, bikes: BIKES}));

