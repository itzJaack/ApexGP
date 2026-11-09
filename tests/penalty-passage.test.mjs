import test from 'node:test';
import assert from 'node:assert/strict';
import {Circuit,TRACKS,RaceModel} from '../dist/simulation.js';
import {penaltyRoutes} from '../dist/penalty-routes.js';
import {observePenaltyPassage} from '../dist/penalty-passage.js';

function passage(route,{stop=0,hold=0,interrupt=null}={}){
 let check=null,time=0,result,held=false;
 for(let at=route.serviceStart;at<=route.serviceEnd+.8;at+=.5){
  const q=route.sample(Math.min(at,route.serviceEnd));time+=.05;
  if(hold&&!held&&at>=route.stopDistance){
   held=true;
   for(let t=0;t<hold-1e-6;t+=.05){time+=.05;result=observePenaltyPassage(route,check,{...route.sample(route.stopDistance),speed:0},time,{stopSeconds:stop});check=result.check;}
  }
  const pose={...q,speed:10};if(interrupt&&at>route.length*.5){interrupt(pose);interrupt=null;}
  result=observePenaltyPassage(route,check,pose,time,{stopSeconds:stop});check=result.check;
  if(result.event==='served')return result;
 }
 return result;
}
test('all 22 circuits expose only a documented pit lane and accept a complete manual ride-through',()=>{
 for(const config of TRACKS){const routes=penaltyRoutes(new Circuit(config));assert.deepEqual(Object.keys(routes),['pit']);
  assert(routes.pit.sourceIds.length,config.id);assert.equal(passage(routes.pit).event,'served',config.id);
 }
});
test('a shortcut, overspeed, reversal, fall or red flag cannot serve a pit penalty',()=>{
 const route=penaltyRoutes(new Circuit(TRACKS[0])).pit;
 for(const invalid of ['teleport','overspeed','reverse','outside','red','fall']){
  let check=observePenaltyPassage(route,null,{...route.sample(route.serviceStart),speed:10},0).check;
  const pose={...route.sample(route.serviceStart+1),speed:10};let options={};
  if(invalid==='teleport')Object.assign(pose,route.sample(route.serviceEnd));
  if(invalid==='overspeed')pose.speed=25;
  if(invalid==='reverse')pose.heading+=Math.PI;
  if(invalid==='outside')pose.x+=10;
  if(invalid==='red')options.neutralized=true;
  if(invalid==='fall')options.fallen=true;
  assert.equal(observePenaltyPassage(route,check,pose,.1,options).event,'invalid',invalid);
 }
});
test('stop-and-go requires five consecutive stationary seconds in the box, also on tight pit lanes',()=>{
 for(const config of TRACKS){const route=penaltyRoutes(new Circuit(config)).pit;
  assert.notEqual(passage(route,{stop:5,hold:4.8}).event,'served',config.id);
  assert.equal(passage(route,{stop:5,hold:5.2}).event,'served',config.id);
 }
});
test('requesting the pit route never takes steering, throttle or braking away from the player',()=>{
 const race=new RaceModel(new Circuit(TRACKS[0]));race.state='running';race.time=3;
 race.stewards.issue(race.player,'rideThrough');assert(race.stewards.request());
 const input={throttle:true,brake:false,steering:-.36};
 race.stewards.prepare(race.player);assert.equal(race.player.serviceGuide,null);assert.equal(race.player.service,undefined);
 assert.equal(race.stewards.assistedInput(race.player,input),input);
});
