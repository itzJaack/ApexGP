import test from 'node:test';
import assert from 'node:assert/strict';
import {RearViews,rearviewCamera} from '../dist/mirrors.js';

test('both mirrors and the central view look behind the rider through turns and elevation',()=>{
 for(const heading of[0,.8,2.8,-2.1])for(const side of['left','right','center']){
  const camera=rearviewCamera({x:40,z:-30,y:12,heading},side),d=camera.target.map((v,i)=>v-camera.eye[i]);
  assert(d.every(Number.isFinite));assert(d[0]*Math.sin(heading)+d[2]*Math.cos(heading)<-29);
  assert(camera.eye[1]>13);const lateral=d[0]*Math.cos(heading)-d[2]*Math.sin(heading);assert(side==='center'?Math.abs(lateral)<1e-8:Math.sign(lateral)===(side==='left'?-1:1));
 }
});

test('the panoramic mirror covers the combined horizontal view of the two side mirrors',()=>{
 const player={x:0,z:0,heading:0},side=rearviewCamera(player,'right'),central=rearviewCamera(player,'center');
 const sideHalf=Math.atan(Math.tan(side.fov/2)*2.75),turn=Math.atan2(side.target[0]-side.eye[0],side.eye[2]-side.target[2]);
 const centralHalf=Math.atan(Math.tan(central.fov/2)*4.3);assert(centralHalf>=sideHalf+turn);
});
test('mirror modes allocate only active views, resize targets and release resources when disabled',()=>{
 const freed=[],draws=[],renders=[],rect={left:100,right:420,top:80,bottom:200,width:320,height:120};
 const container={hidden:true,dataset:{},innerHTML:'',querySelector:()=>({getBoundingClientRect:()=>rect})};
 const renderer={quality:'low',canvas:{width:1280,height:720,getBoundingClientRect:()=>({left:0,top:0,bottom:720,width:1280,height:720})},
  target:(width,height)=>({width,height,complete:true}),freeTarget:t=>{if(t)freed.push(t);},begin:(...args)=>renders.push(args),drawRearview:(...args)=>draws.push(args)};
 const mirrors=new RearViews(renderer,container,'both');mirrors.render({x:0,z:0,heading:0},()=>{});mirrors.composite();
 assert.equal(renders.length,2);assert.equal(draws.length,2);assert.equal(mirrors.targets.size,2);assert(draws.every(d=>d[1].width===320&&d[1].height===120));
 mirrors.setMode('center');assert.equal(freed.length,2);mirrors.render({x:0,z:0,heading:0},()=>{});assert.equal(mirrors.targets.size,1);
 renderer.quality='high';mirrors.nextUpdate=0;mirrors.render({x:0,z:0,heading:0},()=>{});assert.equal(freed.length,3);
 mirrors.setMode('off');assert.equal(freed.length,4);mirrors.render({},()=>assert.fail('disabled views must not render'));assert(container.hidden);assert.equal(mirrors.targets.size,0);
 mirrors.dispose();assert.equal(freed.length,4);
});
