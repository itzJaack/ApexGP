import test from 'node:test';import assert from 'node:assert/strict';import {BotGrid,appendBotPhase,botClock,makeBotRoster} from '../dist/race-bots.js';import {Circuit,TRACKS,RaceModel} from '../dist/simulation.js';
test('bot grid fills twenty places while leaving human participants separate',()=>{for(let n=1;n<=8;n++){const bots=makeBotRoster(n,true);assert.equal(bots.length,20-n);assert.equal(new Set(bots.map(b=>b.id)).size,bots.length);assert(bots.every(b=>b.slot>=n&&b.slot<20&&b.isBot));}assert.deepEqual(makeBotRoster(2,false),[]);});
test('deterministic bots stay on every circuit and reach the same poses regardless of frame count',()=>{for(const config of TRACKS){const tr=new Circuit(config),options={bots:true,laps:2,weather:config.id==='atlas'?'rain':'day'},a=new BotGrid(tr,options,2),b=new BotGrid(new Circuit(config),options,2);for(let t=0;t<45;t+=.25)a.sample(t);for(const time of[0,5,45,100,1000]){const poses=a.sample(time);assert.deepEqual(poses,b.sample(time));for(const r of poses){assert(Object.values(r.pose).every(Number.isFinite));assert(r.pose.speed<=300/3.6);assert(Math.abs(r.offset)<tr.halfWidth);const q=tr.sample(r.progress,r.offset);assert(Math.hypot(q.x-r.pose.x,q.z-r.pose.z)<.001);}}assert(a.sample(1000).every(r=>r.finishTime>0&&r.progress===tr.length*2));}});
test('bot caution timeline freezes red, accelerates from rest and preserves finish time across later flags',()=>{const phases=[{at:0,rate:1}],grid=new BotGrid(new Circuit(TRACKS[0]),{bots:true,laps:2,weather:'day'},1);appendBotPhase(phases,20,'vsc');assert.equal(botClock(30,phases).time,23);assert(grid.sample(30,phases).every(b=>b.pose.speed<=25));appendBotPhase(phases,30,'red');assert.deepEqual(grid.sample(30,phases),grid.sample(36,phases));appendBotPhase(phases,36,'green');assert.equal(botClock(40,phases).time,24);assert(grid.sample(36,phases).every(b=>b.pose.speed===0));const f=grid.sample(1000,phases);appendBotPhase(phases,1100,'yellow');assert.deepEqual(grid.sample(1200,phases).map(b=>b.finishTime),f.map(b=>b.finishTime));});

test('a red/green transition at the same frozen race time retains a standing restart',()=>{
 const phases=[{at:0,rate:1}],grid=new BotGrid(new Circuit(TRACKS[0]),{bots:true,laps:2,weather:'day'},1);
 appendBotPhase(phases,20,'red');const stopped=grid.sample(20,phases);
 appendBotPhase(phases,20,'green');assert.equal(phases.at(-1).restart,true);
 const restart=grid.sample(20,phases);assert(restart.every(b=>b.pose.speed===0));assert.deepEqual(restart.map(b=>b.progress),stopped.map(b=>b.progress));
 const moving=grid.sample(20.1,phases);assert(moving.every(b=>b.pose.speed<1.2));
 appendBotPhase(phases,22,'red');appendBotPhase(phases,22,'green');assert(grid.sample(22,phases).every(b=>b.pose.speed===0));
});

test('higher levels finish faster on every circuit in dry and wet conditions without exceeding multiplayer speed caps',()=>{
 for(const config of TRACKS)for(const weather of ['day','rain']){
  const tr=new Circuit(config),grids=['rookie','sport','pro'].map(difficulty=>new BotGrid(tr,{bots:true,laps:2,weather,difficulty},2));
  for(let i=0;i<6;i++){
   assert(grids[1].profiles[i].duration<grids[0].profiles[i].duration*.94,`${config.id} ${weather}: Sport must beat Rookie`);
   assert(grids[2].profiles[i].duration<grids[1].profiles[i].duration*.94,`${config.id} ${weather}: Pro must beat Sport`);
  }
  for(const grid of grids){
   for(const b of grid.sample(60))assert(b.pose.speed<=300/3.6&&Math.abs(b.offset)<tr.halfWidth);
   const phases=[{at:0,rate:.30}];assert(grid.sample(60,phases).every(b=>b.pose.speed<=25));
  }
 }
});

test('local driving profiles get faster with skill and all levels obey cautions',()=>{
 for(const config of [TRACKS[0],TRACKS[3],TRACKS[10],TRACKS[13]])for(const weather of ['day','rain']){
  const runs=['rookie','sport','pro'].map(difficulty=>{
   // This isolates baseline pace from the separately tested incident model.
   const race=new RaceModel(new Circuit(config),{laps:1,weather,difficulty,aiMistakes:false,botSeed:27});race.state='running';race.options.mode='lan';race.botAI.perceive=()=>[];race.player.progress=-500;race.player.offset=40;race.placePlayer();
   for(let f=0;f<8000&&race.bots.some(b=>b.finishTime===null);f++){race.update(.05,{});race.events=[];}
   assert(race.bots.every(b=>Number.isFinite(b.finishTime)&&b.finishTime>0&&Math.abs(b.offset)<race.track.halfWidth),JSON.stringify({track:config.id,weather,difficulty,time:race.time,state:race.state,flag:race.control.flag,bots:race.bots.map(b=>({s:b.progress,v:b.speed,finish:b.finishTime,intent:b.intent}))}));
   return race;
  });
  const median=r=>r.bots.map(b=>b.finishTime).sort((a,b)=>a-b)[Math.floor(r.bots.length/2)];
  assert(median(runs[1])<median(runs[0])*.94,config.id+' '+weather+' Sport field pace');
  assert(median(runs[2])<median(runs[1])*.92,config.id+' '+weather+' Pro field pace');
  for(const race of runs){
   for(const b of race.bots){b.finishTime=null;b.speed=20;b.progress=0;}
   race.control.set('vsc',100);for(let i=0;i<200;i++)race.update(.05,{});assert(race.bots.every(b=>b.speed<=25));
   race.control.set('red',100);const progress=race.bots.map(b=>b.progress);for(let i=0;i<60;i++)race.update(.05,{});assert.deepEqual(race.bots.map(b=>b.progress),progress);
  }
 }
});
