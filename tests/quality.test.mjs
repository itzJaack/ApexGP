import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {ResolutionGovernor,renderResolution} from '../dist/quality.js';
import {Renderer} from '../dist/engine.js';
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

test('Cinema uses every display pixel on high-density phones, landscape screens and 4K monitors',()=>{
  assert.deepEqual(renderResolution(412,915,{pixelRatio:3.5}),{width:1442,height:3203});
  assert.deepEqual(renderResolution(915,412,{pixelRatio:3.5}),{width:3203,height:1442});
  assert.deepEqual(renderResolution(1920,1080,{pixelRatio:2}),{width:3840,height:2160});
  assert.deepEqual(renderResolution(390,844,{pixelRatio:3,scale:.6}),{width:1170,height:2532});
  assert.deepEqual(renderResolution(1920,1080,{quality:'low',pixelRatio:4,scale:1}),{width:1280,height:720});
  assert.deepEqual(renderResolution(1920,1080,{quality:'low',pixelRatio:4,scale:.6}),{width:768,height:432});
});

test('native resolution scales proportionally only when a real GPU texture, buffer or viewport limit requires it',()=>{
  const result=renderResolution(915,412,{pixelRatio:3.5,maxWidth:2048,maxHeight:2048});assert.equal(result.width,2048);assert(Math.abs(result.width/result.height-915/412)<.003);
  const gl={MAX_TEXTURE_SIZE:1,MAX_RENDERBUFFER_SIZE:2,MAX_VIEWPORT_DIMS:3,getParameter:p=>({1:8192,2:4096,3:[3072,2048]})[p]};
  const renderer={gl,canvas:{clientWidth:4000,clientHeight:2000,width:0,height:0},quality:'high',governor:{scale:1}};
  Renderer.prototype.resize.call(renderer);assert.equal(renderer.canvas.width,3072);assert.equal(renderer.canvas.height,1536);assert.equal(renderer.aspect,2);
  assert.deepEqual(renderResolution(0,0,{pixelRatio:NaN}),{width:1,height:1});
});

test('the actual renderer uses the phone pixel ratio in Cinema and follows a viewport rotation',()=>{
  const previous=Object.getOwnPropertyDescriptor(globalThis,'devicePixelRatio');
  try{
    Object.defineProperty(globalThis,'devicePixelRatio',{configurable:true,value:3.5});
    const gl={MAX_TEXTURE_SIZE:1,MAX_RENDERBUFFER_SIZE:2,MAX_VIEWPORT_DIMS:3,getParameter:p=>p===3?[8192,8192]:8192};
    const renderer={gl,canvas:{clientWidth:412,clientHeight:915,width:0,height:0},quality:'high',governor:{scale:.6}};
    Renderer.prototype.resize.call(renderer);assert.equal(renderer.canvas.width,1442);assert.equal(renderer.canvas.height,3203);
    renderer.canvas.clientWidth=915;renderer.canvas.clientHeight=412;Renderer.prototype.resize.call(renderer);assert.equal(renderer.canvas.width,3203);assert.equal(renderer.canvas.height,1442);
    renderer.quality='low';Renderer.prototype.resize.call(renderer);assert.equal(renderer.canvas.width,549);assert.equal(renderer.canvas.height,247);
  }finally{if(previous)Object.defineProperty(globalThis,'devicePixelRatio',previous);else delete globalThis.devicePixelRatio;}
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
