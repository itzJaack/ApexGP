import test from 'node:test';
import assert from 'node:assert/strict';
import {footprintClearOfTrack,boxFootprint} from '../dist/track-clearance.js';
import {TRACKS,Circuit} from '../dist/simulation.js';
import {mappedSceneryPlan} from '../dist/mapped-scenery.js';

const track={halfWidth:6,nodes:[{x:-100,z:-100},{x:100,z:-100},{x:100,z:100},{x:-100,z:100}]};
const rectangle=(x,z,w,d)=>boxFootprint(x,z,w,d,0);

test('rejects a wall crossing the road even when every corner clears the asphalt',()=>{
  assert.equal(footprintClearOfTrack(track,[rectangle(0,100,40,40)]),false);
  assert.equal(footprintClearOfTrack(track,[rectangle(-100,0,40,40)]),false,'closing road segment');
  assert.equal(footprintClearOfTrack(track,[rectangle(0,0,20,20)]),true);
});

test('a roof containing the circuit is unsafe; a genuinely open courtyard can clear it',()=>{
  assert.equal(footprintClearOfTrack(track,[rectangle(0,0,300,300)]),false);
  assert.equal(footprintClearOfTrack(track,[rectangle(0,0,300,300)],[rectangle(0,0,222,222)]),true);
  assert.equal(footprintClearOfTrack(track,[rectangle(0,0,300,300)],[rectangle(0,0,210,210)]),false,'courtyard wall too close');
});

test('checks complete rotated footprints and the clearance margin between road samples',()=>{
  assert.equal(footprintClearOfTrack(track,[boxFootprint(0,100,140,8,Math.PI/4)]),false);
  assert.equal(footprintClearOfTrack(track,[rectangle(0,114,12,4)],[],3),true);
  assert.equal(footprintClearOfTrack(track,[rectangle(0,110,12,4)],[],3),false);
});

test('all retained solid mapped buildings on all 22 circuits clear the complete racing corridor',()=>{
  for(const config of TRACKS){
    const circuit=new Circuit(config),plan=mappedSceneryPlan(circuit);
    for(const building of plan.buildings.filter(f=>f.kind==='building'))
      assert(footprintClearOfTrack(circuit,building.rings,building.holes),config.id+':'+building.id);
    assert(plan.buildings.filter(f=>f.kind==='building').length>5,config.id+' keeps its valid buildings');
  }
});
