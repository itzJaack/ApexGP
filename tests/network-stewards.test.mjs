import test from 'node:test';
import assert from 'node:assert/strict';
import {Circuit,TRACKS,BIKES} from '../dist/simulation.js';
import {BotGrid} from '../dist/race-bots.js';
import {NetworkStewards,validStewardLedger} from '../dist/network-stewards.js';
import {sectorClock} from '../dist/sector-clock.js';
import {tyreGrip} from '../dist/tyre-grip.js';

function room(){
 const state={roundId:'test-round',status:'race',flag:'green',flagRemaining:0,flagZones:[],options:{trackId:TRACKS[0].id,laps:5,weather:'day',bots:true,difficulty:'pro'},players:[{id:'human',name:'PLAYER',bikeId:BIKES[0].id,progress:-300,pose:{x:0,z:0,heading:0,speed:0},finishTime:null,penalties:0}]};
 const controller=new NetworkStewards(state),grid=new BotGrid(controller.track,state.options,1);
 return{state,controller,grid};
}
test('a marshal zone changes only the clock of riders entering that zone and expires continuously',()=>{
 const profile={positions:Float64Array.from([0,100,200,1000]),times:Float64Array.from([0,10,20,100])};
 const events=[{start:0,end:30,zone:{start:100,end:200,flag:'doubleyellow'}}];
 assert.deepEqual(sectorClock(profile,5,events,1000),{time:5,rate:1});
 assert(Math.abs(sectorClock(profile,15,events,1000).time-13)<1e-6);
 assert.equal(sectorClock(profile,15,events,1000).rate,.6);
 const before=sectorClock(profile,30-1e-5,events,1000),after=sectorClock(profile,30+1e-5,events,1000);
 assert(Math.abs(before.time-after.time)<.0001);assert.equal(after.rate,1);
 const other={positions:Float64Array.from([400,500,600,1400]),times:profile.times};
 assert.equal(sectorClock(other,15,events,1000).time,15);
});
test('multiplayer corner speeds use the stock bike tyre envelope at every difficulty',()=>{
 const track=new Circuit(TRACKS[0]);
 for(const difficulty of ['rookie','sport','pro']){
  const grid=new BotGrid(track,{bots:true,laps:2,weather:'day',difficulty},1);
  for(const [i,p] of grid.profiles.entries()){
   const budget=tyreGrip(BIKES.find(b=>b.id===grid.roster[i].bikeId));
   for(let j=0;j<p.positions.length;j++)assert(p.speeds[j]**2*Math.abs(track.sample(p.positions[j]).k)<=budget.lateral+1e-6);
  }
 }
});
test('network bots physically traverse a ride-through, preserve the past and share the same delayed finish',()=>{
 const{state,controller,grid}=room();let time=15,bots=grid.sample(time);
 controller.tick(state,bots,time);const rider=controller.actors.get('bot-0');controller.stewards.issue(rider,'rideThrough',{reason:'Condotta pericolosa'});
 let ledger=controller.tick(state,bots,time),plan=ledger.botPlans.find(p=>p.botId===rider.id);assert(plan);
 const unchanged=grid.sample(10)[0],planned=grid.sample(10,undefined,false,0,[],ledger)[0];
 assert.deepEqual(planned.pose,unchanged.pose);
 const peer=new BotGrid(new Circuit(TRACKS[0]),state.options,1);let usedPit=false,served=false,priorSpeed=null;
 for(;time<500;time+=.25){
  bots=grid.sample(time,undefined,false,0,[],ledger);const bot=bots[0];
  assert.deepEqual(bot,peer.sample(time,undefined,false,0,[],ledger)[0]);
  if(bot.serviceWindows.some(s=>bot.drivingTime>=s.start&&bot.drivingTime<s.end)){
   usedPit=true;assert(bot.pose.speed<=60/3.6+.001);assert(Math.abs(bot.offset)>controller.track.halfWidth*.5||bot.drivingTime<bot.serviceWindows[0].start+4||bot.drivingTime>bot.serviceWindows[0].end-4);
  }
  if(priorSpeed!==null)assert(bot.pose.speed-priorSpeed<3.5);priorSpeed=bot.pose.speed;
  ledger=controller.tick(state,bots,time);
  served=controller.actors.get('bot-0').sanctions.some(p=>p.type==='rideThrough'&&p.status==='served');
  if(served)break;
 }
 assert(usedPit&&served,JSON.stringify({time,plan,penalties:controller.actors.get('bot-0').sanctions}));
 const baseline=grid.sample(2000)[0],finish=grid.sample(2000,undefined,false,0,[],ledger)[0];assert(finish.finishTime>baseline.finishTime+3);
});
test('a human must follow the whole penalty route; a shortcut cannot mark it served',()=>{
 const{state,controller,grid}=room();controller.tick(state,grid.sample(0),0);
 const rider=controller.actors.get('human');controller.stewards.issue(rider,'longlap',{reason:'Track limits'});
 const route=controller.stewards.routes.longlap;
 function move(distance,time){const q=route.sample(distance);state.players[0]={...state.players[0],progress:q.progress,pose:{...q,speed:Math.min(route.speedAt(distance),10),travel:distance}};return controller.tick(state,grid.sample(time),time);}
 move(0,1);move(route.length,2);assert.equal(rider.sanctions[0].status,'pending');
 move(0,3);let time=3;
 for(let distance=0;distance<route.length;distance+=3){time+=.5;move(distance,time);}
 move(route.length,time+1);assert.equal(rider.sanctions[0].status,'served');
});

test('coasting through a bot penalty route during red does not mark it served after restart',()=>{
 const{state,controller,grid}=room();controller.tick(state,grid.sample(15),15);
 const rider=controller.actors.get('bot-0'),penalty=controller.stewards.issue(rider,'longlap',{reason:'Track limits'});
 let ledger=controller.tick(state,grid.sample(15),15);
 const window=grid.sample(15,undefined,false,0,[],ledger)[0].serviceWindows[0];assert(window);
 state.flag='red';ledger=controller.tick(state,grid.sample(window.start+.1,undefined,false,0,[],ledger),15);
 assert(ledger.botPlans[0].invalid);
 state.flag='green';const originalDeadline=penalty.deadlineProgress;
 ledger=controller.tick(state,grid.sample(window.end+.1,undefined,false,0,[],ledger),window.end+.1);
 assert.equal(penalty.status,'pending');assert(penalty.deadlineProgress>originalDeadline);assert(ledger.botPlans[0].completed);
});
test('pending sanctions survive host migration and an ignored bot ride-through ends in DSQ',()=>{
 const{state,controller,grid}=room();controller.tick(state,grid.sample(10),10);
 const rider=controller.actors.get('bot-0'),penalty=controller.stewards.issue(rider,'rideThrough',{reason:'Infrazioni ripetute'});
 const ledger=controller.ledger(),ids=new Set(['human',...grid.roster.map(b=>b.id)]);assert(validStewardLedger(ledger,ids));
 const migrated=new NetworkStewards(state,structuredClone(ledger));
 const bots=grid.sample(10);bots[0].progress=penalty.deadlineProgress+1;
 const q=migrated.track.sample(bots[0].progress);Object.assign(bots[0].pose,{x:q.x,z:q.z,heading:q.yaw});
 const next=migrated.tick(state,bots,20);assert(next.riders.find(r=>r.id==='bot-0').dsq);
 assert(!validStewardLedger({...next,botPlans:[{botId:'stranger',kind:'pit',anchor:1,entry:2,penaltyId:1}]},ids));
 assert(!validStewardLedger({...next,riders:[{...next.riders[0],timePenalty:NaN}]},ids));
});
