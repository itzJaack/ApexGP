import test from 'node:test';
import assert from 'node:assert/strict';
import {RaceModel,Circuit,TRACKS,BIKES} from '../dist/simulation.js';
import {RaceControl} from '../dist/race-control.js';
import {penaltyRoutes} from '../dist/penalty-routes.js';
import {classifyRiders} from '../dist/race-results.js';
import {tyreGrip} from '../dist/tyre-grip.js';
import {seasonStandings,CHAMPIONSHIP_RIDERS} from '../dist/championship.js';

test('giving an illegal yellow pass back does not penalise the rider receiving their position',()=>{
 const race=new RaceModel(new Circuit(TRACKS[0]),{laps:5});race.state='running';
 const a=race.player,b=race.bots[0];race.riders=[a,b];race.control.set('yellow',60,110);
 Object.assign(a,{progress:110,speed:20});Object.assign(b,{progress:120,speed:20});race.time=10;race.stewards.observe(.1);
 a.progress=121;race.time=10.2;race.stewards.observe(.1);a.progress=124;race.time=10.5;race.stewards.observe(.1);
 assert.equal(race.stewards.active(a)?.type,'giveBack');
 b.progress=125;race.time=11;race.stewards.observe(.1);b.progress=129;race.time=11.4;race.stewards.observe(.1);
 assert.equal(a.sanctions[0].status,'served');assert.equal(b.sanctions.length,0);
});

test('separate accidents create independent local yellow zones without a global suspension',()=>{
 const track=new Circuit(TRACKS[0]),control=new RaceControl(track);
 for(let i=0;i<12;i++)control.incident(200+i*350,i%2?2:1);
 assert.equal(control.flag,'yellow');assert(control.zones.length>8);
 assert.equal(control.flagAt(200,track),'yellow');assert.equal(control.flagAt(550,track),'doubleyellow');
 const distant=new RaceControl(track);distant.incident(150,2);
 assert.equal(distant.flagAt(2500,track),'green');assert.equal(distant.sectors(track)[1].flag,'green');
 const first=distant.zones[0];assert.equal(distant.flagAt(first.end+.1,track),'green');
 distant.tick(13,{track,riders:[],state:'running'});assert.equal(distant.flag,'green');
});
test('only a sustained pile-up spanning the track automatically causes a red flag',()=>{
 const track=new Circuit(TRACKS[0]),control=new RaceControl(track);
 const riders=[-5,-2.5,0,2.5,5].map((offset,i)=>({id:'r'+i,progress:600+i,offset,fall:{}}));
 const race={track,riders,state:'running',redReady:false};
 for(let i=0;i<60;i++)control.tick(.025,race);assert.notEqual(control.flag,'red');
 for(let i=0;i<30;i++)control.tick(.025,race);assert.equal(control.flag,'red');
});
test('both humans and bots face a black flag for ignoring a ride-through deadline',()=>{
 for(const bot of [false,true]){
  const race=new RaceModel(new Circuit(TRACKS[0]),{laps:5,botSeed:27});race.state='running';
  const rider=bot?race.bots[0]:race.player;
  const penalty=race.stewards.issue(rider,'stopGo',{reason:'Ripetute infrazioni'});
  rider.progress=penalty.deadlineProgress+1;race.stewards.observe(.025);
  assert(rider.dsq&&rider.dnf);assert.equal(race.order.at(-1),rider);assert.equal(rider.finishTime,null);
  if(bot)assert.equal(race.state,'running');else assert.equal(race.state,'finished');
 }
});
test('legacy long laps migrate to pit penalties and ignored ride-through escalates to stop-and-go then DSQ',()=>{
 const race=new RaceModel(new Circuit(TRACKS[0]),{laps:20});race.state='running';
 for(const rider of [race.player,race.bots[0]]){
  race.stewards.issue(rider,'longlap',{reason:'Track limits'});
  for(const expected of ['stopGo','dsq']){
   const pending=race.stewards.active(rider);rider.progress=pending.deadlineProgress+1;
   race.stewards.observe(.025);assert.equal(rider.sanctions.at(-1).type,expected);
  }
 }
});
test('a bot follows the physical pit route and holds still for five seconds for stop-and-go',()=>{
 const race=new RaceModel(new Circuit(TRACKS[0]),{laps:5,weather:'day',botSeed:27});race.state='running';race.time=2;
 const rider=race.bots[0],route=race.stewards.routes.pit;
 const penalty=race.stewards.issue(rider,'stopGo',{reason:'Infrazione'});
 rider.service={kind:'pit',distance:0,lap:0,penaltyId:penalty.id,stopped:0};rider.speed=10;
 let travelled=0,stopped=0,previous=route.sample(0);Object.assign(rider,previous);
 for(let i=0;i<8000&&penalty.status==='pending';i++){
  race.time+=.025;race.stewards.driveService(rider,.025);
  travelled+=Math.hypot(rider.x-previous.x,rider.z-previous.z);previous={x:rider.x,z:rider.z};
  if(rider.speed===0&&Math.abs(route.project(rider).at-route.stopDistance)<.5)stopped+=.025;
  assert(rider.speed<=route.limit+.01);
 }
 assert.equal(penalty.status,'served');assert(travelled>route.length*.99);assert(stopped>=4.99);
});

test('a clear dangerous rear-end penalises the offender, not the fallen victim',()=>{
 const race=new RaceModel(new Circuit(TRACKS[0]));race.state='running';race.time=10;
 const offender=race.bots[0],victim=race.player;
 offender.progress=100;victim.progress=103;victim.fall={};
 race.stewards.unsafeContact(offender,victim,{closingSpeed:3});assert.equal(offender.sanctions,undefined);
 for(let i=0;i<4;i++){race.time=10+i*6;race.stewards.unsafeContact(offender,victim,{closingSpeed:15});}
 assert(offender.dsq);assert.equal(victim.sanctions?.length||0,0);
});
test('added time and dropped positions change classification, while disqualified bots score no championship points',()=>{
 const riders=[
  {id:'a',progress:100,finishTime:100},
  {id:'b',progress:100,finishTime:101,positionPenalty:1},
  {id:'c',progress:100,finishTime:102},
  {id:'d',progress:100,finishTime:90,dsq:true,dnf:true},
 ];
 assert.deepEqual(classifyRiders(riders).map(r=>r.id),['a','c','b','d']);
 const standings=seasonStandings({results:[{order:CHAMPIONSHIP_RIDERS,disqualified:['bot0']}]});
 assert.equal(standings.find(r=>r.id==='bot0').points,0);assert.equal(standings.find(r=>r.id==='player').points,25);
});
test('all tracks have a connected finite penalty path, with explicit provenance for mapped routes',()=>{
 let realPit=0;
 for(const config of TRACKS)for(const [kind,route] of Object.entries(penaltyRoutes(new Circuit(config)))){
  assert(route.length>50&&route.length<2500);assert(route.exit>route.entry);
  for(let s=0;s<=route.length;s+=5)assert(Object.values(route.sample(s)).every(Number.isFinite));
  assert.equal(route.approximate,route.sourceIds.length===0);assert(route.sourceIds.every(id=>/^(w\d+|aerial-trace:[a-z]+)$/.test(id)));
  if(!route.approximate&&kind==='pit')realPit++;
 }
 assert.equal(realPit,22);
});
test('AI lateral force obeys the same tyre budget and an overspeeding bot can run off the asphalt',()=>{
 const race=new RaceModel(new Circuit(TRACKS[0]),{mode:'race',difficulty:'pro',weather:'day',aiMistakes:false});race.state='running';
 const bot=race.bots[0];bot.bike=BIKES[0];
 let corner=0;for(let s=100;s<race.track.length;s+=10)if(Math.abs(race.track.sample(s).k)>Math.abs(race.track.sample(corner).k))corner=s;
 bot.progress=corner-10;bot.offset=0;bot.speed=90;const q=race.track.sample(bot.progress);Object.assign(bot,{x:q.x,z:q.z,heading:q.yaw});
 bot.ai.targetSpeed=90;bot.ai.decisionAt=1000;bot.ai.launchAt=0;
 let outside=false;
 for(let i=0;i<180;i++){
  race.botAI.update(bot,[bot],.025,10+i*.025,race.control,()=>{});
  assert(bot.usedLateralForce<=bot.availableLateralForce+1e-7);
  assert(bot.usedLateralForce<=tyreGrip(bot.bike,'day').lateral+1e-7);
  outside||=Math.abs(bot.offset)>race.track.halfWidth+1;
 }
 assert(outside,'Excess speed cannot be hidden by snapping the bot to the racing line');
});
