import test from 'node:test';import assert from 'node:assert/strict';import {BotGrid,appendBotPhase,botClock,makeBotRoster} from '../dist/race-bots.js';import {Circuit,TRACKS,RaceModel} from '../dist/simulation.js';
test('bot grid fills eight places while leaving human participants separate',()=>{for(let n=1;n<=8;n++){const bots=makeBotRoster(n,true);assert.equal(bots.length,8-n);assert.equal(new Set(bots.map(b=>b.id)).size,bots.length);assert(bots.every(b=>b.slot>=n&&b.slot<8&&b.isBot));}assert.deepEqual(makeBotRoster(2,false),[]);});
test('deterministic bots stay on every circuit and reach the same poses regardless of frame count',()=>{for(const config of TRACKS){const tr=new Circuit(config),options={bots:true,laps:2,weather:config.id==='atlas'?'rain':'day'},a=new BotGrid(tr,options,2),b=new BotGrid(new Circuit(config),options,2);for(let t=0;t<45;t+=.25)a.sample(t);for(const time of[0,5,45,100,1000]){const poses=a.sample(time);assert.deepEqual(poses,b.sample(time));for(const r of poses){assert(Object.values(r.pose).every(Number.isFinite));assert(r.pose.speed<=300/3.6);assert(Math.abs(r.offset)<tr.halfWidth);const q=tr.sample(r.progress,r.offset);assert(Math.hypot(q.x-r.pose.x,q.z-r.pose.z)<.001);}}assert(a.sample(1000).every(r=>r.finishTime>0&&r.progress===tr.length*2));}});
test('bot caution timeline freezes red, caps VSC and preserves finish time across later flags',()=>{const phases=[{at:0,rate:1}],grid=new BotGrid(new Circuit(TRACKS[0]),{bots:true,laps:2,weather:'day'},1);appendBotPhase(phases,20,'vsc');assert.equal(botClock(30,phases).time,23);assert(grid.sample(30,phases).every(b=>b.pose.speed<=25));appendBotPhase(phases,30,'red');assert.deepEqual(grid.sample(30,phases),grid.sample(36,phases));appendBotPhase(phases,36,'green');assert.equal(botClock(40,phases).time,27);const f=grid.sample(1000,phases);appendBotPhase(phases,1100,'yellow');assert.deepEqual(grid.sample(1200,phases).map(b=>b.finishTime),f.map(b=>b.finishTime));});

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

test('local Pro races have a substantially faster and tighter field while all levels obey cautions',()=>{
 for(const config of [TRACKS[0],TRACKS[3],TRACKS[10],TRACKS[13]])for(const weather of ['day','rain']){
  const runs=['rookie','sport','pro'].map(difficulty=>{
   const race=new RaceModel(new Circuit(config),{laps:1,weather,difficulty});race.state='running';race.options.mode='lan';race.player.progress=-500;race.placePlayer();
   for(let f=0;f<8000&&race.bots.some(b=>b.finishTime===null);f++){race.update(.05,{});race.events=[];}
   assert(race.bots.every(b=>Number.isFinite(b.finishTime)&&b.finishTime>0&&Math.abs(b.offset)<race.track.halfWidth));
   return race;
  });
  assert(runs[1].bots[0].finishTime<runs[0].bots[0].finishTime*.94);
  assert(runs[2].bots[0].finishTime<runs[1].bots[0].finishTime*.92);
  const gap=r=>r.bots.at(-1).finishTime-r.bots[0].finishTime;assert(gap(runs[2])<gap(runs[1]));
  for(const race of runs){
   for(const b of race.bots){b.finishTime=null;b.speed=20;b.progress=0;}
   race.control.set('vsc',100);for(let i=0;i<200;i++)race.update(.05,{});assert(race.bots.every(b=>b.speed<=25));
   race.control.set('red',100);const progress=race.bots.map(b=>b.progress);for(let i=0;i<60;i++)race.update(.05,{});assert.deepEqual(race.bots.map(b=>b.progress),progress);
  }
 }
});
