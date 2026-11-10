import test from 'node:test';
import assert from 'node:assert/strict';
import {TRACKS,Circuit} from '../dist/simulation.js';
import {Geometry} from '../dist/engine.js';
import {drawPitBuildings,PIT_PROFILES} from '../dist/pit-buildings.js';
import {drawPenaltyRoutes,penaltyRoutes,projectAnywhere} from '../dist/penalty-routes.js';
import {terrainSampler} from '../dist/track-terrain.js';
import {SCENERY_DATA} from '../dist/scenery-data.js';
import {PIT_GARAGE_FOOTPRINTS} from '../dist/pit-traces.js';
import {ROAD_COLOR,ROAD_MATERIAL} from '../dist/road-surface.js';
import {footprintClearOfTrack,boxFootprint} from '../dist/track-clearance.js';

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

test('trimmed pit roofs, walls and garage objects leave the racing corridor clear on every circuit',()=>{
 for(const config of TRACKS){
  const track=new Circuit(config);let structures=0;
  const check=footprint=>{assert(footprintClearOfTrack(track,[footprint],[],1),config.id+' pit obstruction');structures++;};
  const geometry={
   tri(a,b,c,color,material){if(material!==0)check([a,b,c].map(p=>[p[0],p[2]]));},
   box(p,size,color,yaw){check(boxFootprint(p[0],p[2],size[0],size[2],yaw));},
   cylinder(a,b,radius){assert(footprintClearOfTrack(track,[[[a[0],a[2]],[b[0],b[2]]]],[],1),config.id);structures++;}
  };
  drawPitBuildings(geometry,track,terrainSampler(track,24));
  assert(structures>10,config.id+' preserves the valid pit complex');
 }
});

test('pit driving asphalt shares the racing tint and joins its height without a raised overlay',()=>{
 for(const config of TRACKS){
  const track=new Circuit(config),asphalt=[];
  const geometry={quad(...args){if(args[5]===ROAD_MATERIAL)asphalt.push(args);},cylinder(){},box(){},sphere(){}};
  drawPenaltyRoutes(geometry,track,terrainSampler(track,24));
  assert(asphalt.length>10,config.id);
  let joins=0;
  for(const quad of asphalt){
   assert.deepEqual(quad[4],ROAD_COLOR,config.id+' shared road material');
   for(const [x,y,z] of quad.slice(0,4)){
    const near=projectAnywhere(track,x,z);
    if(Math.abs(near.offset)<track.halfWidth-.5){
     assert(Math.abs(y-track.sample(near.progress).y-.028)<.008,config.id+' flush asphalt join');joins++;
    }
   }
  }
  assert(joins>0,config.id+' tests a track/pit connection');
 }
});
