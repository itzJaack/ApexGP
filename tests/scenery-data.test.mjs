import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {Circuit,TRACKS} from '../dist/simulation.js';
import {SCENERY_DATA} from '../dist/scenery-data.js';
import {mappedSceneryPlan,insideFeature,buildMappedScenery,groundPatch} from '../dist/mapped-scenery.js';
import {landcoverAt} from '../dist/circuit-environment.js';
import {terrainSampler} from '../dist/engine.js';

test('all twenty-two circuits have attributable offline map extracts with real feature identities',()=>{
 assert.equal(Object.keys(SCENERY_DATA).length,22);
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

test('venue boundaries never become giant asphalt polygons or extra racing roads',()=>{
 for(const data of Object.values(SCENERY_DATA)){
  for(const f of data.features){
   assert(!(f.kind==='ground'&&f.tags.landuse==='raceway'&&!f.tags.surface&&!f.tags['area:highway']));
   assert(!(f.kind==='road'&&f.tags.area==='yes'));
  }
 }
 assert(!SCENERY_DATA.mandalika.features.some(f=>f.id==='w942267288'));
 assert(!SCENERY_DATA.buriram.features.some(f=>f.id==='w564769597'));
});
test('vegetation remains in mapped woodland, outside holes, buildings and the racing corridor in both quality modes',()=>{
 for(const config of TRACKS){
  const track=new Circuit(config),plan=mappedSceneryPlan(track),source=new Map(SCENERY_DATA[config.id].features.map(f=>[f.id,f]));
  assert(plan.buildings.length>10);assert(plan.trees.length>150);
  for(const tree of plan.trees){
   assert(track.nearestDistance(...tree.point)>=track.halfWidth+19);
   if(tree.source==='worldcover')assert.equal(landcoverAt(SCENERY_DATA[config.id].landcover,...tree.point),10);
   else{const f=source.get(tree.id);assert(f);if(f.kind==='wood')assert(insideFeature(tree.point,f));}
  }
 }
 const fakeTrack={config:{id:'fixture'},bounds:{minX:-100,maxX:100,minZ:-100,maxZ:100},halfWidth:6,nearestDistance:()=>100};
 const wood={id:'w1',kind:'wood',tags:{},rings:[[[-90,-90],[90,-90],[90,90],[-90,90],[-90,-90]]],holes:[[[-30,-30],[30,-30],[30,30],[-30,30],[-30,-30]]]};
 for(const quality of ['low','high']){const plan=mappedSceneryPlan(fakeTrack,quality,{features:[wood]});assert(plan.trees.length>50);assert(plan.trees.every(t=>insideFeature(t.point,wood)));}
});

test('runoff overlays follow the exact terrain triangles rather than cutting through slopes',()=>{
 const terrain=Object.assign((x,z)=>{
  const i=Math.floor(x/10),j=Math.floor(z/10),u=x/10-i,v=z/10-j;
  const h=(a,b)=>((a+b)%2?4:0),a=h(i,j),c=h(i+1,j+1);
  return u>v?a+(h(i+1,j)-a)*u+(c-h(i+1,j))*v:a+(c-h(i,j+1))*u+(h(i,j+1)-a)*v;
 },{cellStep:10});
 const triangles=[];
 groundPatch({tri:(a,b,c)=>triangles.push([a,b,c])},[[1,2],[38,4],[5,37]],terrain,[.5,.5,.5],3);
 assert(triangles.length>20);
 let area=0;
 for(const [a,b,c] of triangles){
  area+=Math.abs((b[0]-a[0])*(c[2]-a[2])-(b[2]-a[2])*(c[0]-a[0]))/2;
  const x=(a[0]+b[0]+c[0])/3,z=(a[2]+b[2]+c[2])/3;
  assert(Math.abs((a[1]+b[1]+c[1])/3-terrain(x,z)-.025)<1e-7);
 }
 assert(Math.abs(area-643.5)<1e-6,'Clipping must preserve the complete mapped surface');
});

test('Sepang retains its main grandstand and its reconstructed fan roof stays clear of the racing asphalt',()=>{
 const track=new Circuit(TRACKS.find(t=>t.id==='sepang')),plan=mappedSceneryPlan(track),roof=[];
 assert(plan.buildings.some(f=>f.id==='w144247993'));
 const geometry={tri(){},box(){},sphere(){},cylinder(){},quad(...args){if(args[4]?.every((v,i)=>v===[.83,.84,.79][i]))roof.push(...args.slice(0,4));}};
 buildMappedScenery(geometry,track,terrainSampler(track),'low');
 assert(roof.length>300,'Keep both wings of the recognisable canopy');
 for(const [x,y,z] of roof){assert([x,y,z].every(Number.isFinite));assert(track.nearestDistance(x,z)>track.halfWidth+3);}
});

test('mapped access roads follow short terrain sections and leave the racing asphalt clear',()=>{
 const track=new Circuit(TRACKS[0]),terrain=terrainSampler(track),roads=[];
 const geometry={tri(){},box(){},sphere(){},cylinder(){},quad(...args){if(args[4]?.every((v,i)=>v===[.25,.27,.26][i]))roads.push(args.slice(0,4));}};
 buildMappedScenery(geometry,track,terrain,'low');assert(roads.length>100);
 for(const quad of roads){assert(Math.hypot(quad[0][0]-quad[1][0],quad[0][2]-quad[1][2])<=10.01);assert(quad.flat().every(Number.isFinite));}
});
