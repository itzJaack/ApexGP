import test from 'node:test';
import assert from 'node:assert/strict';
import {RaceModel,Circuit,TRACKS} from '../dist/simulation.js';

test('a full grid holds its starting lanes instead of all converging at launch',()=>{
 for(let seed=0;seed<8;seed++){
  const race=new RaceModel(new Circuit(TRACKS[0]),{laps:1,difficulty:'sport',weather:'day',botSeed:27+seed});race.state='running';
  race.player.offset=40;race.placePlayer();
  for(let i=0;i<170;i++){race.update(.025,{});race.events=[];}
  assert.equal(race.botCrashes,0,'A normal start must not create an automatic pileup');
  assert.notEqual(race.control.flag,'red');
 }
});

test('a twenty-rider physical race finishes with real overtakes by upright riders',()=>{
 const race=new RaceModel(new Circuit(TRACKS[0]),{laps:1,difficulty:'pro',weather:'day',botSeed:27});race.state='running';
 race.player.progress=-300;race.player.offset=40;race.placePlayer();
 assert.equal(race.riders.length,20);assert.equal(new Set(race.bots.map(b=>b.name)).size,19);
 const pairs=new Map(),healthy=new Map();let passes=0,wall=0;
 while(wall<600&&race.bots.some(b=>b.finishTime===null)){
  race.update(.025,{});race.events=[];wall+=.025;
  for(const bot of race.bots)if(bot.crash>0)healthy.set(bot.id,wall);
  for(let i=0;i<race.bots.length;i++)for(let j=i+1;j<race.bots.length;j++){
   const a=race.bots[i],b=race.bots[j],delta=a.progress-b.progress,key=i+':'+j,previous=pairs.get(key);
   if(previous*delta<0&&wall>8&&race.control.flag==='green'&&!a.crash&&!b.crash&&a.speed>12&&b.speed>12&&Math.abs(a.offset-b.offset)>.65&&wall-(healthy.get(a.id)||0)>3&&wall-(healthy.get(b.id)||0)>3)passes++;
   pairs.set(key,delta);
  }
 }
 assert(race.bots.every(b=>Number.isFinite(b.finishTime)&&b.finishTime>0));
 assert(passes>=10,'The running field must exchange positions without relying on falls');
});
