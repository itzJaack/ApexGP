import test from 'node:test';
import assert from 'node:assert/strict';
import {createWeekend,completeWeekendSession,sessionParticipants,qualifyingGrid,normalizeWeekend,QUALIFYING_RIDERS,SESSION_SECONDS,applyGridPenalties,careerRiderId} from '../dist/qualifying.js';
import {RaceModel,Circuit,TRACKS,BIKES} from '../dist/simulation.js';
import {Career,normalizeProfile} from '../dist/progression.js';
import {CALENDAR,LEGACY_CALENDAR} from '../dist/championship.js';
import {gridPlace} from '../dist/rider-roster.js';

const ticket={index:0,trackId:CALENDAR[0].trackId};
const complete=(weekend,phase,times={},penalties=[])=>completeWeekendSession(weekend,{phase,elapsed:300,times,penalties,lapCounts:{}});
function session(){return new RaceModel(new Circuit(TRACKS[0]),{mode:'qualifying',botSeed:'qualifying-tests',qualifying:{phase:'practice',participants:['player','bot0']},aiMistakes:false});}
function move(race,rider,progress,time,travel){
 rider.progress=progress;rider.speed=40;rider.offset=0;rider.wheelTravel=travel;rider.travel=travel;
 race.time=time;race.qualifying.observe(.05);
}
test('MotoGP Practice sends ten direct to Q2; Q1 sends two and leaves eight in positions 13–20',()=>{
 const w=createWeekend(ticket,'r1');
 const practice=Object.fromEntries(QUALIFYING_RIDERS.map((id,i)=>[id,90+i]));
 assert(complete(w,'practice',practice));assert.equal(w.phase,'q1');assert.equal(sessionParticipants(w).length,10);
 assert(!sessionParticipants(w).includes('player'));
 const q1=Object.fromEntries(sessionParticipants(w).map((id,i)=>[id,89+i]));
 assert(complete(w,'q1',q1));assert.equal(sessionParticipants(w).length,12);
 const q2=Object.fromEntries(sessionParticipants(w).map((id,i)=>[id,88+i]));assert(complete(w,'q2',q2));
 assert.equal(w.phase,'grid');assert.equal(new Set(w.grid.order).size,20);
 assert.deepEqual(w.grid.base.slice(12),Object.keys(q1).slice(2));
});
test('untimed riders do not displace a timed lap; an untimed player receives no free direct Q2 spot',()=>{
 const w=createWeekend(ticket,'r1');complete(w,'practice',{});
 assert(sessionParticipants(w).includes('player'));
 complete(w,'q1',{player:100});assert(sessionParticipants(w).includes('player'));
 complete(w,'q2',{player:99});assert.equal(w.grid.order[0],'player');
});
test('grid penalties apply to player and bots, including simultaneous penalties near the rear',()=>{
 const order=[...QUALIFYING_RIDERS];const grid=applyGridPenalties(order,{player:3,bot0:3,bot17:3,bot18:3});
 assert.equal(grid.indexOf('player'),3);assert.equal(grid.indexOf('bot0'),4);assert.equal(new Set(grid).size,20);
 assert(grid.indexOf('bot17')>=18&&grid.indexOf('bot18')>=18);
});
test('outlap does not count; a full physical lap crossing before the chequered flag produces a best time',()=>{
 const race=session(),p=race.player,L=race.track.length,s=race.qualifying.state(p);
 s.nextLine=L;s.lastProgress=L-1;s.lastTime=1;
 move(race,p,L+1,2,2);assert.equal(race.qualifying.times.player,undefined);assert(p.timedLap);
 move(race,p,2*L+1,122,L+3);assert(Math.abs(race.qualifying.times.player-120)<1);
 assert.equal(race.qualifying.lapCounts.player,1);
});
test('a hot lap already started at expiry may finish; a new hot lap cannot start after 5 minutes',()=>{
 const race=session(),p=race.player,L=race.track.length,s=race.qualifying.state(p);
 s.started=210;s.travel=0;s.nextLine=L;s.lastProgress=L-1;s.lastTime=299;p.timedLap=true;p.progress=L-1;p.speed=40;p.offset=0;
 race.time=300;race.qualifying.observe(.05);assert.equal(p.finishTime,null);
 move(race,p,L+1,330,L+1);assert(Number.isFinite(race.qualifying.times.player));assert.equal(p.finishTime,330);assert(!p.timedLap);
});
test('falls, track limits, reset, yellow and implausibly short travel invalidate laps',()=>{
 for(const invalid of ['fall','outside','reset','yellow','shortcut']){
  const race=session(),p=race.player,L=race.track.length,s=race.qualifying.state(p);
  s.started=1;s.nextLine=L;s.travel=0;s.lastProgress=L-2;s.lastTime=110;p.timedLap=true;
  if(invalid==='fall')p.fall={};if(invalid==='outside')p.offset=race.track.halfWidth+1;
  if(invalid==='reset')race.resetPlayer();if(invalid==='yellow')race.control.set('yellow',30,L);
  race.time=111;race.qualifying.observe(.05);p.progress=L+1;p.wheelTravel=invalid==='shortcut'?10:L+1;
  race.time=120;race.qualifying.observe(.05);assert.equal(race.qualifying.times.player,undefined,invalid);
 }
});
test('sustained impeding outside a hot lap costs three grid places for bots and human; two push laps do not',()=>{
 for(const offenderIsPlayer of [false,true]){
  const race=session(),p=race.player,b=race.bots[0],offender=offenderIsPlayer?p:b,victim=offenderIsPlayer?b:p;
  Object.assign(offender,{progress:110,offset:0,speed:12,timedLap:false});Object.assign(victim,{progress:100,offset:0,speed:25,timedLap:true});
  for(let i=0;i<27;i++){race.qualifying.elapsed=50+i*.05;race.qualifying.observeImpeding(.05);}
  assert.equal(race.qualifying.penalties[0].riderId,careerRiderId(offender));assert.equal(race.qualifying.penalties[0].places,3);
  offender.timedLap=true;race.qualifying.penalties=[];
  for(let i=0;i<30;i++){race.qualifying.elapsed=100+i*.05;race.qualifying.observeImpeding(.05);}assert.equal(race.qualifying.penalties.length,0);
 }
});
test('session checkpoints preserve elapsed time, best laps and penalties across profile reloads',()=>{
 let c=new Career();c.chooseStarter('r1');c.beginSeason();c.prepareWeekend('r1');
 const penalty={id:'practice:1',riderId:'player',victimId:'bot0',places:3,at:70};
 c.checkpointWeekend({phase:'practice',elapsed:110,times:{player:99},penalties:[penalty]});
 c=new Career(structuredClone(c.profile));assert.equal(c.profile.season.weekend.checkpoint.elapsed,110);
 c.checkpointWeekend({phase:'practice',elapsed:112,times:{player:105},penalties:[]});
 assert.equal(c.profile.season.weekend.checkpoint.times.player,99);assert.equal(c.profile.season.weekend.checkpoint.penalties.length,1);
 assert(!c.checkpointWeekend({phase:'practice',elapsed:1}));
 c.completeQualifying({phase:'practice',elapsed:300,times:{player:98},penalties:[]});
 assert.equal(c.profile.season.weekend.phase,'q1');assert.equal(c.profile.season.results.length,0);assert.equal(c.profile.stats.races,0);
 assert.equal(c.reward({id:'no-prize',mode:'qualifying',finished:true,time:300,position:1}),0);
});
test('normalization derives participants and grid from completed sessions and rejects a forged grid',()=>{
 const w=createWeekend(ticket,'r1');complete(w,'practice',{player:90});complete(w,'q1',{});complete(w,'q2',{player:89});
 w.grid.order=['player'];const normalized=normalizeWeekend(w,ticket);assert.equal(normalized.grid.order.length,20);
 assert.equal(normalizeWeekend(w,{index:1,trackId:ticket.trackId}),null);
});
test('a qualified career grid places each stable rider in the correct slot and both calendars use five laps',()=>{
 const order=[...QUALIFYING_RIDERS].reverse();const race=new RaceModel(new Circuit(TRACKS[0]),{gridOrder:order,laps:5});
 for(const r of race.riders)assert.equal(r.progress,gridPlace(order.indexOf(careerRiderId(r))).progress);
 assert(CALENDAR.every(r=>r.laps===5));assert(LEGACY_CALENDAR.every(r=>r.laps===5));
});
test('a physical five-minute qualifying session records measured bot laps and finishes',()=>{
 const race=session();race.qualifying.retire(race.player);let ticks=0;
 while(race.state!=='finished'&&ticks++<15000)race.update(.04);
 assert.equal(race.state,'finished');assert(race.time>=SESSION_SECONDS);assert(Object.values(race.qualifying.times).some(t=>t>25));
 assert.equal(race.lapTimes.length,0);assert(!race.events.some(e=>e.type==='finish'));
});
