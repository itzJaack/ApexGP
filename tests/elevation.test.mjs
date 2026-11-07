import test from 'node:test';
import assert from 'node:assert/strict';
import {terrainElevation} from '../dist/elevation.js';
import {terrainSampler} from '../dist/engine.js';
import {TRACKS,Circuit} from '../dist/simulation.js';

test('terrain interpolation preserves sampled heights and a continuous surface between cells',()=>{
 const config={terrainGrid:{x:0,z:0,step:10,width:2,depth:2,elevations:[10,20,30,40],baseElevation:15}};
 assert.equal(terrainElevation(config,0,0),-5);assert.equal(terrainElevation(config,5,5),10);assert.equal(terrainElevation(config,10,10),25);
 assert.equal(terrainElevation(config,-50,0),-5);assert.equal(terrainElevation(config,100,100),25);
});
test('every circuit and its surrounding scenery use a complete offline elevation grid',()=>{
 for(const config of TRACKS){
  const grid=config.terrainGrid;assert(grid,config.id+' offline height grid');assert.equal(grid.elevations.length,grid.width*grid.depth);assert(grid.elevations.every(Number.isFinite));
  const track=new Circuit(config);assert(Math.abs(track.sample(0).y)<.01);
  for(let s=0;s<track.length;s+=21){const p=track.sample(s);assert(Number.isFinite(p.y)&&Number.isFinite(p.grade));assert(Math.abs(p.grade)<=.181);assert(Math.abs(p.y-(terrainElevation(config,p.x,p.z)-track.elevationOffset))<4.5,'Road fit stays close to the source grid');}
 }
});
test('the former Mugello height discontinuity no longer makes a cliff beside the track',()=>{
 const track=new Circuit(TRACKS[0]),ground=terrainSampler(track);
 const high=ground(-216,576),low=ground(-204,588);
 assert(Math.abs(high-low)<8,'Adjacent terrain samples must not jump twenty metres');
 for(let s=0;s<track.length;s+=30){const p=track.sample(s);assert(ground(p.x,p.z)<p.y+.5,'Terrain must stay below the asphalt');}
});
