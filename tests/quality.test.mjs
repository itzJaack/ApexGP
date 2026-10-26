import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {ResolutionGovernor} from '../dist/quality.js';
import {scenerySite} from '../dist/scenery.js';
import {Circuit, TRACKS} from '../dist/simulation.js';
test('performance models use under one eighth of the cinema triangles including the rider', () => {
  const m = JSON.parse(fs.readFileSync(new URL('../dist/assets/models/manifest.json', import.meta.url)));
  for (const spec of Object.values(m.bikes)) {
    const low = m.stats[spec.id + '-low'].triangles + m.stats['gp-rider-low'].triangles;
    const high = m.stats[spec.id + '-high'].triangles + m.stats['rider-high'].triangles;
    assert(low < high / 8); assert(low < 22000);
    assert(m.stats[spec.id + '-distant'].triangles + m.stats['gp-rider-distant'].triangles < 10000);
  }
});
test('adaptive resolution recovers without dropping below its readable minimum or reacting to pauses', () => {
  const governor = new ResolutionGovernor();
  for (let i = 0; i < 600; i++) governor.update(1 / 20);
  assert.equal(governor.scale, .6);
  governor.update(15); assert.equal(governor.scale, .6);
  for (let i = 0; i < 1800; i++) governor.update(1 / 60);
  assert.equal(governor.scale, 1);
});
test('pit buildings and stands have clearance from every branch of all catalogued circuits', () => {
  for (const config of TRACKS) {
    const track = new Circuit(config);
    for (const [station, offset, width, depth] of [[95, -38, 19, 150], [170, 42, 28, 72], [track.length * .44, 42, 28, 72]]) {
      const p = scenerySite(track, station, offset, width, depth);
      assert(p, config.name);
      for (const x of [-width / 2, 0, width / 2]) for (let j = 0; j <= 8; j++) {
        const z = (j / 8 - .5) * depth;
        const distance = track.nearestDistance(p.x + x * Math.cos(p.yaw) + z * Math.sin(p.yaw), p.z - x * Math.sin(p.yaw) + z * Math.cos(p.yaw));
        assert(distance >= track.halfWidth + 17, config.name);
      }
    }
  }
});
