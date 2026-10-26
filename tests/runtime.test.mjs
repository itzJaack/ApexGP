import test from 'node:test';
import assert from 'node:assert/strict';
import {disposeBike,disposeWorld,allocateScene,AssetTransition} from '../dist/runtime.js';
import {Renderer,bikeParts,modelMatrix} from '../dist/engine.js';
import {decodePose,decodeBroadcast} from '../dist/net-codec.js';

test('all bike and world resources are released once, including rider decals and shared textures',()=>{
 const destroyed=[],textures=[],renderer={destroy:m=>destroyed.push(m),gl:{deleteTexture:t=>textures.push(t)}};
 const meshes=Array.from({length:9},()=>({})),texture={};
 const bike={mesh:meshes[0],rider:meshes[1],steering:meshes[2],glass:meshes[3],shadow:meshes[4],wheels:[{mesh:meshes[5]},{mesh:meshes[6]}],decals:[{mesh:meshes[7]}],riderDecals:[{mesh:meshes[8]}],textures:[texture,texture]};
 disposeBike(renderer,bike);disposeBike(renderer,bike);assert.equal(destroyed.length,9);assert.deepEqual(textures,[texture]);
 const world={mesh:{},line:{},boards:[{mesh:{}}],flagMeshes:{green:{}},textures:[texture]};
 disposeWorld(renderer,world);disposeWorld(renderer,world);assert.equal(destroyed.length,13);assert.equal(textures.length,2);
 assert.doesNotThrow(()=>disposeBike(renderer,null));assert.deepEqual(bikeParts(null,modelMatrix()),[]);
});

test('a failed scene build immediately frees every partial GPU allocation',()=>{
 const allocated=[],released=[],textures=[],deleted=[];
 const renderer={mesh(){const m={};allocated.push(m);return m;},texture(){const t={};textures.push(t);return t;},destroy:m=>released.push(m),gl:{deleteTexture:t=>deleted.push(t)}};
 assert.throws(()=>allocateScene(renderer,scope=>{scope.texture({});scope.mesh({});scope.mesh({});throw Error('GPU exhausted');}),/GPU exhausted/);
 assert.deepEqual(released,allocated);assert.deepEqual(deleted,textures);
 const result=allocateScene(renderer,scope=>({mesh:scope.mesh({})}));assert(result.mesh);assert.equal(released.length,2);
});

test('mesh upload keeps typed geometry without copying and releases the buffer on GPU exhaustion',()=>{
 const source=new Float32Array(36),buffer={},deleted=[];let sent;
 const gl={createBuffer:()=>buffer,bindBuffer(){},bufferData:(target,data)=>sent=data,getError:()=>0,deleteBuffer:b=>deleted.push(b),OUT_OF_MEMORY:1285};
 const renderer={gl,meshes:[]};Renderer.prototype.mesh.call(renderer,{data:source});assert.equal(sent,source);assert.equal(renderer.meshes.length,1);
 gl.getError=()=>1285;assert.throws(()=>Renderer.prototype.mesh.call(renderer,{data:source}),/Memoria grafica/);assert.deepEqual(deleted,[buffer]);assert.equal(renderer.meshes.length,1);
});

test('quality transition coalesces repeated starts and releases the gate after both failure and success',async()=>{
 const events=[],gate=new AssetTransition(busy=>events.push(busy));let release,calls=0;
 const first=gate.run(()=>{calls++;return new Promise(resolve=>release=resolve);});
 const duplicate=gate.run(()=>{calls++;});assert.equal(first,duplicate);assert(gate.busy);
 await Promise.resolve();release();await first;assert.equal(calls,1);assert(!gate.busy);
 await assert.rejects(gate.run(()=>{throw Error('Asset unavailable');}));assert(!gate.busy);
 await gate.run(()=>{});assert.deepEqual(events,[true,false,true,false,true,false]);
});

test('malformed network payloads never allocate from untrusted lengths or throw during decoding',()=>{
 for(const input of[null,undefined,{},'9999999999999',44,{length:1e12},[1,2,3]]){assert.equal(decodePose(input),null);assert.equal(decodeBroadcast(input),null);}
 const view=new DataView(new ArrayBuffer(4));assert.equal(decodePose(view),null);assert.equal(decodeBroadcast(view),null);
});
