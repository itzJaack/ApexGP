import test from 'node:test';
import assert from 'node:assert/strict';
import {TRACKS,Circuit} from '../dist/simulation.js';
import {Geometry} from '../dist/engine.js';
import {drawPitBuildings,PIT_PROFILES} from '../dist/pit-buildings.js';
import {drawPenaltyRoutes,penaltyRoutes,projectAnywhere} from '../dist/penalty-routes.js';
import {terrainSampler} from '../dist/track-terrain.js';
import {SCENERY_DATA} from '../dist/scenery-data.js';
import {PIT_GARAGE_FOOTPRINTS} from '../dist/pit-traces.js';

test('all 22 pit complexes use existing mapped footprints or an attributed aerial trace and produce bounded finite mesh',()=>{
 for(const config of TRACKS){
  const profile=PIT_PROFILES[config.id];assert(profile,config.id);
  for(const id of profile.ids)assert(SCENERY_DATA[config.id].features.some(f=>f.id===id)||PIT_GARAGE_FOOTPRINTS[config.id],id);
  const track=new Circuit(config),g=new Geometry;drawPitBuildings(g,track,terrainSampler(track,24),true);
  assert(g.data.length>1000&&g.data.length<1e6,config.id);assert(g.data.every(Number.isFinite),config.id);
 }
});
test('pit riding height follows the actual rendered terrain when graphic quality changes',()=>{
 for(const config of TRACKS){const track=new Circuit(config),route=penaltyRoutes(track).pit;
  for(const cell of[24,12,24]){
   const ground=terrainSampler(track,cell),g=new Geometry;drawPenaltyRoutes(g,track,ground);
   for(let at=route.serviceStart;at<route.serviceEnd;at+=25){
    const p=route.sample(at),near=projectAnywhere(track,p.x,p.z);
    if(Math.abs(near.offset)>track.halfWidth+.5)assert(Math.abs(p.y-ground(p.x,p.z)-.13)<1e-6,config.id);
   }
  }
 }
});
