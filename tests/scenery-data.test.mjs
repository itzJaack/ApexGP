import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {Circuit,TRACKS} from '../dist/simulation.js';
import {SCENERY_DATA} from '../dist/scenery-data.js';
import {mappedSceneryPlan,insideFeature,buildMappedScenery} from '../dist/mapped-scenery.js';
import {terrainSampler} from '../dist/engine.js';

test('all fourteen circuits have attributable offline map extracts with real feature identities',()=>{
 assert.equal(Object.keys(SCENERY_DATA).length,14);
 for(const config of TRACKS){
  const data=SCENERY_DATA[config.id];assert(data.features.length>100);assert(data.date&&data.source.includes('openstreetmap'));
  const ids=new Set();
  for(const f of data.features){assert(/^[nwr]\d+$/.test(f.id));assert(!ids.has(f.id));ids.add(f.id);for(const p of [...(f.rings||[]).flat(),...(f.holes||[]).flat(),...(f.line||[]),...(f.point?[f.point]:[])])assert(p.length===2&&p.every(Number.isFinite));}
 }
});
test('a mapped Mugello grandstand uses the circuit projection, including the finish-line shift and scale',()=>{
 const raw=JSON.parse(fs.readFileSync(new URL('../art/references/scenery/toscana.json',import.meta.url)));
 const feature=SCENERY_DATA.toscana.features.find(f=>f.id==='w339812257'),osm=raw.elements.find(f=>f.id===339812257),geo=TRACKS[0].geo;
 assert.equal(feature.kind,'grandstand');
 const p=osm.geometry[0],expected=[((p.lon-geo.origin[1])*Math.cos(geo.origin[0]*Math.PI/180)*111195-geo.shift[0])*geo.scale,(-(p.lat-geo.origin[0])*111195-geo.shift[1])*geo.scale];
 assert(Math.hypot(feature.rings[0][0][0]-expected[0],feature.rings[0][0][1]-expected[1])<.015);
});
test('vegetation remains in mapped woodland, outside holes, buildings and the racing corridor in both quality modes',()=>{
 for(const config of TRACKS){
  const track=new Circuit(config),plan=mappedSceneryPlan(track),source=new Map(SCENERY_DATA[config.id].features.map(f=>[f.id,f]));
  assert(plan.buildings.length>10);assert(plan.trees.length>150);
  for(const tree of plan.trees){assert(track.nearestDistance(...tree.point)>=track.halfWidth+19);const f=source.get(tree.id);assert(f);if(f.kind==='wood')assert(insideFeature(tree.point,f));}
 }
 const fakeTrack={config:{id:'fixture'},bounds:{minX:-100,maxX:100,minZ:-100,maxZ:100},halfWidth:6,nearestDistance:()=>100};
 const wood={id:'w1',kind:'wood',tags:{},rings:[[[-90,-90],[90,-90],[90,90],[-90,90],[-90,-90]]],holes:[[[-30,-30],[30,-30],[30,30],[-30,30],[-30,-30]]]};
 for(const quality of ['low','high']){const plan=mappedSceneryPlan(fakeTrack,quality,{features:[wood]});assert(plan.trees.length>50);assert(plan.trees.every(t=>insideFeature(t.point,wood)));}
});

test('mapped access roads follow short terrain sections and leave the racing asphalt clear',()=>{
 const track=new Circuit(TRACKS[0]),terrain=terrainSampler(track),roads=[];
 const geometry={tri(){},box(){},sphere(){},cylinder(){},quad(...args){if(args[4]?.every((v,i)=>v===[.25,.27,.26][i]))roads.push(args.slice(0,4));}};
 buildMappedScenery(geometry,track,terrain,'low');assert(roads.length>100);
 for(const quad of roads){assert(Math.hypot(quad[0][0]-quad[1][0],quad[0][2]-quad[1][2])<=10.01);assert(quad.flat().every(Number.isFinite));}
});
