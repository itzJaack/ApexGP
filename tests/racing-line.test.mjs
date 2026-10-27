import test from 'node:test';
import assert from 'node:assert/strict';
import {RacingLine,racingLineColor} from '../dist/racing-line.js';
import {BIKES,TRACKS,Circuit,RaceModel,mod,wrapAngle} from '../dist/simulation.js';
import {Renderer} from '../dist/engine.js';
import {disposeWorld} from '../dist/runtime.js';

function stadium(){
  const straight=500,radius=55,length=2*straight+2*Math.PI*radius;
  return{length,halfWidth:9.25,sample(s,offset=0){
    s=mod(s,length);let x,z,yaw,k=0;
    if(s<straight){x=-radius;z=-straight/2+s;yaw=0;}
    else if(s<straight+Math.PI*radius){yaw=(s-straight)/radius;x=-radius*Math.cos(yaw);z=straight/2+radius*Math.sin(yaw);k=1/radius;}
    else if(s<2*straight+Math.PI*radius){x=radius;z=straight/2-(s-straight-Math.PI*radius);yaw=Math.PI;}
    else{yaw=Math.PI+(s-2*straight-Math.PI*radius)/radius;x=-radius*Math.cos(yaw);z=-straight/2+radius*Math.sin(yaw);k=1/radius;}
    return{x:x+Math.cos(yaw)*offset,z:z-Math.sin(yaw)*offset,y:0,yaw,k,grade:0};
  }};
}
const track=stadium(),guide=new RacingLine(track);
function session({speed=60,progress=420,weather='day',bike=BIKES[0]}={}){
  const race=new RaceModel(track,{mode:'time',bike,weather});Object.assign(race.player,{speed,progress});return race;
}

test('the route opens the corner on entry, reaches the apex and opens again on exit',()=>{
  assert(guide.point(470).offset<-1);
  assert(guide.point(580).offset>3);
  assert(guide.point(690).offset<-1);
  const start=guide.point(0),end=guide.point(track.length);
  assert(Math.hypot(start.x-end.x,start.z-end.z)<1e-8);assert.equal(start.offset,end.offset);
});

test('all 14 circuits keep finite, continuous arrows inside the asphalt, including the lap seam',()=>{
  for(const config of TRACKS){
    const circuit=new Circuit(config),line=new RacingLine(circuit),race=new RaceModel(circuit,{mode:'time',weather:'rain',bike:BIKES[0]});
    for(let i=0;i<line.count;i++){
      const a=line.samples[i],b=line.samples[(i+1)%line.count];
      assert(Math.abs(a.offset)<=circuit.halfWidth-1.59,config.id);
      assert(Math.abs(a.offset-b.offset)<line.step*.6,config.id);
      assert(Math.abs(wrapAngle(a.yaw-b.yaw))<.5,config.id);
    }
    for(const progress of[-12,circuit.length-9,circuit.length+200]){
      race.player.progress=progress;race.player.speed=80;line.update(race);
      assert(line.geometry.data.every(Number.isFinite));assert(line.markers.length<=80);
      assert(line.markers.every(m=>m.s>progress&&m.distance<=440&&m.alpha>=0&&m.alpha<=1));
      for(const marker of line.markers){
        const projection=circuit.project(marker.x,marker.z,marker.s);
        assert(projection.distance<circuit.halfWidth-1.15,config.id);
      }
    }
  }
});

test('approaching the same bend slowly is green; excess speed makes the nearest arrows red',()=>{
  const race=session({speed:20});guide.update(race);
  assert.equal(guide.hint.action,'accelerate');assert.equal(guide.markers[0].urgency,0);
  race.player.speed=65;for(let i=0;i<10;i++)guide.update(race);
  assert.equal(guide.hint.action,'brake');assert(guide.markers[0].urgency>.9);
  race.player.speed=20;for(let i=0;i<24;i++)guide.update(race);
  assert.equal(guide.hint.action,'accelerate');assert(guide.markers[0].urgency<.03);
});

test('more speed moves the indicated braking point towards the rider and extends the view',()=>{
  const slow=session({speed:20}),fast=session({speed:40});
  guide.update(slow);const slowDistance=guide.markers.find(m=>m.urgency>.6).distance,slowHorizon=guide.markers.at(-1).distance;
  guide.update(fast);const fastDistance=guide.markers.find(m=>m.urgency>.6).distance;
  assert(fastDistance<slowDistance-15);assert(guide.markers.at(-1).distance>slowHorizon+70);
  fast.player.progress=730;guide.update(fast);assert.equal(guide.hint.action,'accelerate');assert.equal(guide.markers[0].urgency,0);
});

test('rain and weaker brakes bring braking forward; upgraded grip increases corner speed',()=>{
  const dry=session({progress:400}),wet=session({progress:400,weather:'rain'});
  guide.update(dry);const dryTarget=guide.hint.target,profile=guide.speeds;
  guide.update(dry);assert.equal(guide.speeds,profile,'Do not rebuild the lap during each frame');
  guide.update(wet);assert(guide.hint.target<dryTarget-3);
  guide.update(session({progress:400,bike:{...BIKES[0],braking:.7}}));const weak=guide.hint.target;
  guide.update(session({progress:400,bike:{...BIKES[0],braking:1.4}}));assert(guide.hint.target>weak+8);
  guide.update(session({progress:580,bike:{...BIKES[0],grip:1.3}}));const highGrip=guide.hint.target;
  guide.update(session({progress:580,bike:{...BIKES[0],grip:.9}}));assert(guide.hint.target<highGrip);
});

test('the braking envelope reaches across start/finish, respects gradients and the motorcycle top speed',()=>{
  const race=session();guide.update(race);
  for(let i=0;i<guide.count;i++){
    const next=(i+1)%guide.count,p=guide.samples[i],brake=Math.max(3,guide.braking+9.81*p.grade);
    assert(guide.speeds[i]**2<=guide.speeds[next]**2+2*brake*p.distance+1e-7);
    assert(guide.speeds[i]<=guide.limits[i]);assert(guide.limits[i]<=race.options.bike.top/3.6);
  }
  assert(Math.abs(guide.limitAt(-.01)-guide.limitAt(.01))<.1);
  const downhill=new RacingLine({...track,sample:(s,o)=>({...track.sample(s,o),grade:-.08})});
  downhill.update(race);assert(downhill.limitAt(400)<guide.limitAt(400));
});

test('yellow zones are local, VSC limits every arrow and a red flag never advises accelerating',()=>{
  const race=session({speed:40,progress:100});race.control.set('yellow',20,580);guide.update(race);
  assert.equal(guide.hint.flag,null);assert(guide.limitAt(100)>25);assert(guide.limitAt(500)<=25);
  race.player.progress=500;guide.update(race);assert.equal(guide.hint.flag,'yellow');
  race.control.set('vsc');guide.update(race);assert.equal(guide.hint.flag,'vsc');assert(guide.speeds.every(v=>v<=25));
  race.control.set('red');race.player.speed=0;guide.update(race);assert.equal(guide.hint.action,'stop');assert.equal(guide.hint.target,0);
  race.control.set('green');guide.update(race);assert(guide.limitAt(100)>25);assert.equal(guide.hint.action,'accelerate');
});

test('toggle off removes all arrows while preserving guidance, and a reset drops stale red colors',()=>{
  const race=session();guide.update(race);const backing=guide.geometry.data.buffer;assert(guide.markers[0].urgency>.9);
  guide.update(race,{visible:false});assert.equal(guide.markers.length,0);assert.equal(guide.geometry.data.length,0);assert.equal(guide.hint.action,'brake');
  race.player.progress=200;race.player.speed=5;guide.update(race);
  assert.equal(guide.markers[0].urgency,0);assert.equal(guide.geometry.data.buffer,backing);
  assert.equal(guide.geometry.data.length,guide.markers.length*288);
  const old=guide.smoothed.slice();guide.update(race,{dt:0});assert.deepEqual(guide.smoothed,old,'Pause must not animate the colors');
});

test('color transitions are continuous and progress from green to yellow, orange and red',()=>{
  const green=racingLineColor(0),yellow=racingLineColor(1/3),red=racingLineColor(1);
  assert(green[1]>green[0]);assert(yellow[0]>yellow[2]);assert(red[0]>red[1]*4);
  for(let u=0;u<1;u+=.01){const a=racingLineColor(u),b=racingLineColor(u+.001);assert(a.every((v,i)=>Math.abs(v-b[i])<.004));}
});

test('arrows follow a sloped road so their tips do not sink into the asphalt',()=>{
  const hill={...track,sample:(s,o)=>({...track.sample(s,o),y:s*.12,grade:.12})},line=new RacingLine(hill),race=session({progress:200,speed:20});
  line.update(race);const marker=line.markers[0],data=line.geometry.data;
  assert(Math.abs(marker.y-marker.s*.12)<1e-8);
  for(let i=0;i<288;i+=12){
    const z=(data[i]-marker.x)*Math.sin(marker.yaw)+(data[i+2]-marker.z)*Math.cos(marker.yaw);
    const height=data[i+1]-(marker.y+z*.12);
    assert(height>.07&&height<.085,'Every arrow vertex must stay above the road');
  }
});

test('dynamic geometry reuses one GPU buffer, handles a shorter range and is released with the world',()=>{
  const allocations=[],uploads=[],deleted=[],gl={ARRAY_BUFFER:1,DYNAMIC_DRAW:2,OUT_OF_MEMORY:1285,bindBuffer(){},bufferData:(...args)=>allocations.push(args),bufferSubData:(...args)=>uploads.push(args),getError:()=>0,deleteBuffer:b=>deleted.push(b)};
  const mesh={buffer:{},count:0},renderer={gl,meshes:[mesh],destroy:Renderer.prototype.destroy},vertices=new Float32Array(288*80);
  Renderer.prototype.updateMesh.call(renderer,mesh,{data:vertices.subarray(0,288*30)});
  Renderer.prototype.updateMesh.call(renderer,mesh,{data:vertices.subarray(0,288*60)});
  Renderer.prototype.updateMesh.call(renderer,mesh,{data:vertices.subarray(0,288*20)});
  assert.equal(allocations.length,1);assert.equal(allocations[0][1],vertices.byteLength);assert.equal(uploads.length,3);assert.equal(mesh.count,480);
  disposeWorld(renderer,{line:mesh});assert.deepEqual(deleted,[mesh.buffer]);assert.equal(renderer.meshes.length,0);
  gl.getError=()=>1285;assert.throws(()=>Renderer.prototype.updateMesh.call(renderer,{buffer:{}},{data:vertices}),/Memoria grafica/);
});
