import test from 'node:test';
import assert from 'node:assert/strict';
import {RaceModel,Circuit,TRACKS} from '../dist/simulation.js';
import {BotGrid,appendBotPhase,botClock} from '../dist/race-bots.js';
import {StartLights,startLightState,redBrakingSeconds,START_LIGHT_SECONDS} from '../dist/race-signals.js';

test('red flag brakes the full field progressively, freezes results and waits for a stationary restart',()=>{
 for(const weather of ['day','rain']){
  const race=new RaceModel(new Circuit(TRACKS[0]),{weather,botSeed:27});race.state='running';
  race.player.progress=-500;race.player.offset=0;race.player.speed=70;race.player.throttle=1;race.placePlayer();
  for(const [i,bot] of race.bots.entries()){
   bot.progress=150-i*15;bot.speed=70-i*.4;const q=race.track.sample(bot.progress,bot.offset);
   Object.assign(bot,{x:q.x,z:q.z,y:q.y,heading:q.yaw});
  }
  race.control.set('red',.1);const before=race.riders.map(r=>({speed:r.speed,progress:r.progress}));
  race.update(1/120,{throttle:true,wheelie:true});
  for(const [i,rider] of race.riders.entries()){
   assert(rider.speed>before[i].speed-.5,'No speed reset on the first red frame');
   assert(rider.progress>before[i].progress,'Momentum still moves the bike');
  }
  const order=race.order.map(r=>r.id);let elapsed=0;
  while(race.state==='running'&&elapsed<35){
   const moving=!race.redReady;race.update(.025,{throttle:true});elapsed+=.025;
   if(moving)assert.equal(race.state,'running','Restart waits for all bikes and falls');
   assert.equal(race.time,0);assert.equal(race.lapTimes.length,0);
  }
  assert.equal(race.state,'countdown');assert(elapsed>6);
  assert(race.riders.every(r=>r.speed===0&&!r.fall));
  assert.equal(race.countdown,START_LIGHT_SECONDS);
  assert.deepEqual(race.order.map(r=>r.id),order,'Neutralization preserves the classified order');
  for(let i=0;i<100;i++)race.update(.025,{throttle:true});
  assert(race.riders.every(r=>r.speed===0),'Throttle cannot launch a rider before lights out');
 }
});

test('an ongoing fall keeps moving under red and recovery does not add penalty time',()=>{
 const race=new RaceModel(new Circuit(TRACKS[0]),{mode:'time',weather:'day'});race.state='running';
 race.player.speed=35;race.crashPlayer('highside',1);race.control.set('red',.1);
 const fall=race.player.fall,x=fall.bike.x,z=fall.bike.z;
 race.update(.025,{});assert.equal(race.player.fall,fall);assert(fall.age>0);
 assert(Math.hypot(fall.bike.x-x,fall.bike.z-z)>.01);assert(race.player.speed>1);
 for(let i=0;i<1600&&race.state==='running';i++)race.update(.025,{});
 assert.equal(race.state,'countdown');assert.equal(race.time,0);assert.equal(race.penalties,0);
});

test('network bots coast smoothly under the frozen clock and keep their stopped positions at restart',()=>{
 const grid=new BotGrid(new Circuit(TRACKS[0]),{bots:true,laps:3,weather:'day'},1),phases=[{at:0,rate:1}];
 const before=grid.sample(20,phases),duration=redBrakingSeconds(Math.max(...before.map(b=>b.pose.speed)));
 appendBotPhase(phases,20,'red',duration);
 const entry=grid.sample(20,phases,false,0),middle=grid.sample(20,phases,false,duration/2),stopped=grid.sample(20,phases,false,duration);
 for(let i=0;i<before.length;i++){
  assert(Math.abs(entry[i].pose.speed-before[i].pose.speed)<1e-7);
  assert(middle[i].pose.speed>0);assert(middle[i].progress>entry[i].progress);
  assert.equal(stopped[i].pose.speed,0);assert.equal(stopped[i].finishTime,null);
 }
 assert.deepEqual(grid.sample(20,phases,false,duration+5),stopped);
 const clock=botClock(20,phases,duration);appendBotPhase(phases,20,'green');
 assert.equal(botClock(20,phases).time,clock.time);
 const restart=grid.sample(20,phases);assert.deepEqual(restart.map(b=>b.progress),stopped.map(b=>b.progress));
 assert(restart.every(b=>b.pose.speed===0));assert(grid.sample(21,phases).every(b=>b.pose.speed>0));
});

function signalsFixture(){
 const element=()=>({dataset:{},textContent:'',attributes:{},classes:new Set(),setAttribute(k,v){this.attributes[k]=v;},classList:{add(){},remove(){},toggle(){}}});
 const panel=element(),lamps=Array.from({length:5},()=>{const el=element();el.classList.toggle=(key,on)=>on?el.classes.add(key):el.classes.delete(key);return el;}),title=element(),caption=element(),events=[];
 for(const el of [panel,...lamps]){el.classList.add=key=>el.classes.add(key);el.classList.remove=key=>el.classes.delete(key);}
 panel.querySelectorAll=()=>lamps;panel.querySelector=selector=>selector==='[data-start-title]'?title:caption;
 return{panel,lamps,title,events,lights:new StartLights(panel,(...args)=>events.push(args))};
}

test('five red lights progress with the actual countdown and go dark only when racing starts',()=>{
 const f=signalsFixture();
 for(const [remaining,lit] of [[3.6,1],[2.9,2],[2.3,3],[1.7,4],[1.1,5],[.05,5]]){
  assert.equal(startLightState(remaining).lit,lit);
  f.lights.update({counting:true,remaining});assert.equal(f.lamps.filter(l=>l.classes.has('is-lit')).length,lit);
 }
 const sounds=f.events.length;f.lights.update({counting:true,remaining:.05,paused:true});assert.equal(f.events.length,sounds);
 assert.equal(f.panel.dataset.phase,'red');f.lights.update({counting:false},.01);
 assert.equal(f.panel.dataset.phase,'go');assert(f.lamps.every(l=>!l.classes.has('is-lit')));assert.equal(f.title.textContent,'VIA!');
 f.lights.reset();f.lights.update({counting:true,remaining:3.6,restart:true});assert.equal(f.title.textContent,'RIPARTENZA');
 assert.equal(f.lamps.filter(l=>l.classes.has('is-lit')).length,1);
});
