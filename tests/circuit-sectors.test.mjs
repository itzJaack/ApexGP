import test from 'node:test';
import assert from 'node:assert/strict';
import {Circuit,TRACKS} from '../dist/simulation.js';
import {sectorDividers,sectorRanges} from '../dist/circuit-sectors.js';
import {flagSectors,makeFlagZone} from '../dist/sector-flags.js';

test('every circuit has three transverse separators matching the flag-sector boundaries',()=>{
 for(const config of TRACKS){
  const track=new Circuit(config),project=p=>[p.x*.06+100,p.z*.06+80],dividers=sectorDividers(track,project);
  assert.equal(dividers.length,3);
  for(const divider of dividers){
   const range=sectorRanges(track.length)[divider.index-1];assert.equal(divider.progress,range.start);
   const q=project(track.sample(divider.progress));assert.deepEqual(divider.centre,q);
   const before=project(track.sample(divider.progress-2)),after=project(track.sample(divider.progress+2));
   const tangent=[after[0]-before[0],after[1]-before[1]],line=[divider.b[0]-divider.a[0],divider.b[1]-divider.a[1]];
   assert(Math.abs(tangent[0]*line[0]+tangent[1]*line[1])<1e-8,config.id);
   assert(Math.abs(Math.hypot(...line)-(divider.index===1?12:10))<1e-8);
   const zone=makeFlagZone((range.start+range.end)/2,true,track.length);
   assert.equal(flagSectors([zone],track.length)[divider.index-1].flag,'doubleyellow');
  }
 }
});

test('separator direction follows the displayed map after rotation and reflection',()=>{
 const track=new Circuit(TRACKS[0]);
 for(const angle of [0,.8,2.5])for(const sign of [-1,1]){
  const project=p=>[sign*(Math.cos(angle)*p.x-Math.sin(angle)*p.z),Math.sin(angle)*p.x+Math.cos(angle)*p.z];
  for(const divider of sectorDividers(track,project)){
   const a=project(track.sample(divider.progress-2)),b=project(track.sample(divider.progress+2));
   const dot=(b[0]-a[0])*(divider.b[0]-divider.a[0])+(b[1]-a[1])*(divider.b[1]-divider.a[1]);
   assert(Math.abs(dot)<1e-8);
  }
 }
});
