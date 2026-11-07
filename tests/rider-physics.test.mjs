import test from 'node:test';
import assert from 'node:assert/strict';
import {RiderFall,RiderContacts,RIDER_JOINTS,RIDER_BONES,sweptContact} from '../dist/rider-physics.js';
import {bindRiderSkin,deformRiderSkin} from '../dist/rider-skin.js';
import {RaceModel,Circuit,TRACKS} from '../dist/simulation.js';

const flat={length:10000,halfWidth:10,sample:(s,offset=0)=>({x:offset,z:s,y:0,grade:0,tx:0,tz:1,yaw:0,k:0}),project:(x,z)=>({progress:z,offset:x})};
const rider=(x,z,speed=0)=>({x,z,y:0,progress:z,offset:x,heading:0,lean:0,pitch:0,speed,mass:250,finishTime:null,previousPose:{x,z,heading:0}});

test('swept motorcycle footprints catch crossings between steps and reject adjacent lanes',()=>{
 const a=rider(-2,0,50),b=rider(0,0,0);a.previousPose={x:-2,z:0,heading:0};a.x=2;
 assert(sweptContact(a,b,.05));a.x=3;a.previousPose.x=3;assert.equal(sweptContact(a,b,.05),null);
});
test('contact impulses conserve horizontal momentum and a gentle rub does not become an explosive bounce',()=>{
 const a=rider(0,0,20),b=rider(0,1.7,19),system=new RiderContacts();let impacts=0;
 const before=a.mass*a.speed+b.mass*b.speed;
 system.update([a,b],1/120,1,flat,()=>impacts++);
 assert.equal(impacts,1);assert(Math.abs(a.mass*a.speed+b.mass*b.speed-before)<1e-8);assert(a.speed>=19&&b.speed<=20.1);
});
test('both competitors can fall in a hard impact; a tap leaves both upright',()=>{
 for(const hard of [false,true]){
  const track=new Circuit(TRACKS[0]);Object.assign(track,flat);
  const race=new RaceModel(track,{botSeed:7,aiMistakes:false});race.state='running';race.bots=race.bots.slice(0,1);race.riders=[race.player,...race.bots];
  const p=race.player,b=race.bots[0];p.progress=100;p.offset=0;p.speed=hard?40:12;race.placePlayer();b.progress=101.4;b.offset=0;b.speed=hard?10:11.5;
  race.update(1/120,{});assert.equal(!!p.fall,hard);assert.equal(!!b.fall,hard);assert(race.contacts>0);
 }
});
test('lowsides slide while severe impacts launch and articulate the rider independently of the bike',()=>{
 const a=new RiderFall(rider(0,100,30),flat,{kind:'lowside'}),b=new RiderFall(rider(0,100,30),flat,{kind:'contact',closingSpeed:32,deltaV:15,normalX:1});
 let airborne=0,slidingHeight=0;
 for(let i=0;i<600;i++){
  a.update(1/120,flat);b.update(1/120,flat);
  airborne=Math.max(airborne,b.points[0].p[1]);slidingHeight=Math.max(slidingHeight,a.points[0].p[1]);
  for(const fall of [a,b])for(const point of fall.points){assert(point.p.every(Number.isFinite));assert(point.v.every(Number.isFinite));assert(point.p[1]>=point.radius-1e-8);}
 }
 assert(airborne>slidingHeight+.25);assert(Math.hypot(b.points[0].p[0]-b.bike.x,b.points[0].p[2]-b.bike.z)>1);
 assert(Math.hypot(a.bike.vx,a.bike.vz)<30);
 for(const [i,j]of RIDER_BONES){const current=Math.hypot(...b.points[i].p.map((v,k)=>v-b.points[j].p[k])),rest=Math.hypot(...RIDER_JOINTS[i].map((v,k)=>v-RIDER_JOINTS[j][k]));assert(Math.abs(current-rest)<.07);}
});
test('rider skin preserves rest geometry and textures, and follows the physical joints with finite normals',()=>{
 const rest=new Float32Array([-.318,1.035,.142,0,1,0,.2,.3,.4,6,.25,.75,0,1.36,.30,0,0,1,1,1,1,6,.5,.5]);
 const skin=bindRiderSkin(rest),same=deformRiderSkin(skin,RIDER_JOINTS);assert(same.every((v,i)=>Math.abs(v-rest[i])<1e-5));
 const pose=RIDER_JOINTS.map(p=>p.map((v,k)=>v+(k===0?10:k===1?2:-5)));
 const moved=deformRiderSkin(skin,pose);for(const index of [0,12]){assert(Math.abs(moved[index]-rest[index]-10)<1e-5);assert(Math.abs(Math.hypot(...moved.slice(index+3,index+6))-1)<1e-5);assert.equal(moved[index+10],rest[index+10]);}
});
test('red flag stops every bike and clears motion before the standing restart',()=>{
 const race=new RaceModel(new Circuit(TRACKS[0]),{botSeed:8});race.state='running';race.player.speed=45;race.bots.forEach((b,i)=>{b.speed=30+i;b.lateralSpeed=2;});
 race.control.set('red',.5);const start=race.riders.map(r=>r.progress);
 for(let i=0;i<35;i++)race.update(1/120,{throttle:true});
 assert(race.riders.every(r=>r.speed===0&&r.lateralSpeed===0));assert.deepEqual(race.riders.map(r=>r.progress),start);
 while(race.state==='running')race.update(1/120,{});
 assert.equal(race.state,'countdown');assert(race.riders.every(r=>r.speed===0));
 while(race.state==='countdown')race.update(1/120,{throttle:true});
 assert(race.riders.every(r=>r.speed===0));race.update(1/120,{throttle:true});assert(race.bots.every(b=>b.speed<.2));
});
