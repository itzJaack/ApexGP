import {BIKES,Circuit,TRACKS} from './simulation.js';
import {RaceControl} from './race-control.js';
import {RaceStewards,PENALTY_LABELS,penaltyType} from './race-stewards.js';
import {tyreGrip} from './tyre-grip.js';
import {observePenaltyPassage} from './penalty-passage.js';
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const mod=(v,n)=>(v%n+n)%n;
const serviceTypes=['rideThrough','stopGo'];
const statuses=['pending','served','applied','converted','escalated'];

export function legalMetadata(ledger,id){
 const rider=ledger?.riders?.find(r=>r.id===id);
 return rider?{sanctions:(rider.sanctions||[]).map(p=>({...p,type:penaltyType(p.type),label:PENALTY_LABELS[penaltyType(p.type)]})),timePenalty:rider.timePenalty,positionPenalty:rider.positionPenalty,dsq:rider.dsq,retirement:rider.retirement}:{};
}
export function validStewardLedger(ledger,ids){
 if(ledger==null)return true;
 const safe=(v,depth=0)=>depth<10&&(v==null||typeof v==='boolean'||typeof v==='number'&&Number.isFinite(v)&&Math.abs(v)<1e8||typeof v==='string'&&v.length<500||Array.isArray(v)&&v.length<=200&&v.every(x=>safe(x,depth+1))||typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length<=40&&Object.values(v).every(x=>safe(x,depth+1)));
 if(!safe(ledger))return false;
 const number=v=>v===undefined||Number.isFinite(v)&&Math.abs(v)<1e8;
 if(!ledger||!Number.isInteger(ledger.revision)||ledger.revision<0||!Number.isInteger(ledger.nextId)||ledger.nextId<1||!Array.isArray(ledger.riders)||ledger.riders.length>20||!Array.isArray(ledger.botPlans)||ledger.botPlans.length>200)return false;
 if(new Set(ledger.riders.map(r=>r?.id)).size!==ledger.riders.length)return false;
 if(!ledger.riders.every(r=>r&&ids.has(r.id)&&typeof r.dsq==='boolean'&&[r.timePenalty,r.positionPenalty].every(v=>Number.isFinite(v)&&v>=0&&v<=3600)&&Array.isArray(r.sanctions)&&r.sanctions.length<=80&&r.sanctions.every(p=>p&&Number.isInteger(p.id)&&p.id>0&&Object.hasOwn(PENALTY_LABELS,penaltyType(p.type))&&statuses.includes(p.status)&&typeof p.reason==='string'&&p.reason.length<500&&['issuedAt','deadline','deadlineProgress','notifiedLap','remaining','seconds','places','stopSeconds'].every(k=>number(p[k]))&&(p.targetId===undefined||ids.has(p.targetId)))&&(!r.retirement||['at','progress','speed','x','z','heading'].every(k=>Number.isFinite(r.retirement[k])))))return false;
 return ledger.botPlans.every(p=>p&&ids.has(p.botId)&&/^bot-\d+$/.test(p.botId)&&['pit','longlap','yield'].includes(p.kind)&&Number.isInteger(p.penaltyId)&&['anchor','entry','exit','lap','limit','stopSeconds'].every(k=>number(p[k]))&&(p.stopSeconds===undefined||p.stopSeconds>=0&&p.stopSeconds<=30)&&Number.isFinite(p.anchor)&&Number.isFinite(p.entry)&&p.entry>p.anchor&&(p.kind==='yield'?Number.isFinite(p.exit)&&p.exit>p.entry&&Number.isFinite(p.limit)&&p.limit>0&&p.limit<60:Number.isInteger(p.lap)));
}
function closestOnRoute(route,pose){
 let nearest={distance:Infinity,at:0};
 for(let i=1;i<route.points.length;i++){
  const a=route.points[i-1],b=route.points[i],dx=b.x-a.x,dz=b.z-a.z,u=clamp(((pose.x-a.x)*dx+(pose.z-a.z)*dz)/(dx*dx+dz*dz||1),0,1);
  const distance=Math.hypot(pose.x-a.x-dx*u,pose.z-a.z-dz*u);
  if(distance<nearest.distance)nearest={distance,at:a.s+(b.s-a.s)*u};
 }
 return nearest;
}

// The room host runs the same steward rules for every participant. Only legal
// decisions and future bot route plans are broadcast; bot poses stay local.
// LAN uses this same controller, with its Python server accepting host reports.
export class NetworkStewards{
 constructor(state,ledger=null){
  this.roundId=state.roundId;this.track=new Circuit(TRACKS.find(t=>t.id===state.options.trackId));this.actors=new Map();this.revision=ledger?.revision||0;
  this.plans=structuredClone(ledger?.botPlans||[]).filter(p=>p.kind!=='longlap');this.saved=new Map((ledger?.riders||[]).map(r=>[r.id,structuredClone(r)]));
  this.race={track:this.track,options:{...state.options,difficulty:state.options.difficulty||'sport'},time:0,penalties:0,state:'running',riders:[],emit:()=>{this.dirty=true;}};
  this.race.control=new RaceControl(this.track);this.stewards=new RaceStewards(this.race);this.stewards.nextId=ledger?.nextId||1;
 }
 actor(meta){
  let rider=this.actors.get(meta.id);
  if(!rider){const saved=this.saved.get(meta.id)||{};rider={id:meta.id,sanctions:saved.sanctions||[],timePenalty:saved.timePenalty||0,positionPenalty:saved.positionPenalty||0,dsq:!!saved.dsq,retirement:saved.retirement,penaltiesFinalized:!!saved.finalized};this.actors.set(meta.id,rider);if(saved.record)this.stewards.state.set(meta.id,saved.record);}
  const pose=meta.pose||this.track.sample(meta.progress||0),q=this.track.project(pose.x,pose.z,meta.progress||0);
  const rawFinish=meta.rawFinishTime??(meta.finishTime==null?null:meta.finishTime-(meta.penalties||0));
  Object.assign(rider,pose,{name:meta.name,bike:BIKES.find(b=>b.id===meta.bikeId),isBot:!!meta.isBot,isPlayer:false,progress:meta.progress??q.progress,offset:q.offset,
   travel:pose.travel||0,fall:pose.crash>0?{network:true}:null,finishTime:rider.dsq?null:rawFinish,rawFinishTime:rawFinish,dnf:!!meta.dnf||rider.dsq,
   angle:Math.atan2(Math.sin((pose.heading||0)-this.track.sample(q.progress).yaw),Math.cos((pose.heading||0)-this.track.sample(q.progress).yaw))});
  return rider;
 }
 observeService(rider,time){
  const penalty=this.stewards.active(rider),record=this.stewards.record(rider);
  if(!penalty||!serviceTypes.includes(penalty.type)||rider.fall){record.serviceCheck=null;return;}
  const route=this.stewards.routes.pit,previous=record.serviceCheck;
  const check=previous?.penaltyId===penalty.id&&Number.isInteger(previous.nextGate)?previous:null;
  const result=observePenaltyPassage(route,check,rider,time,{stopSeconds:penalty.type==='stopGo'?5:0,fallen:!!rider.fall});
  record.serviceCheck=result.check?{...result.check,penaltyId:penalty.id}:null;
  rider.service=result.check?{kind:'pit',manual:true}:null;
  if(result.event==='served')this.stewards.served(rider,penalty);
  if(result.event==='served'||result.event==='invalid')this.changed=true;
 }
 planBot(rider){
  const penalty=this.stewards.active(rider);if(!penalty||rider.dnf)return;
  const existing=this.plans.findLast(p=>p.botId===rider.id&&p.penaltyId===penalty.id&&!p.completed);
  if(existing)return;
  if(penalty.type==='giveBack'){
   const target=this.race.riders.find(r=>r.id===penalty.targetId);if(!target)return;
   const speed=Math.max(3,Math.min(rider.speed,target.speed)-9),anchor=rider.progress+20,entry=anchor+Math.max(80,(rider.speed**2-speed**2)/14);
   this.plans.push({botId:rider.id,penaltyId:penalty.id,kind:'yield',anchor,entry,exit:entry+170,limit:speed});this.changed=true;return;
  }
  if(!serviceTypes.includes(penalty.type))return;
  const route=this.stewards.routes.pit;
  if(this.race.control.applies({progress:route.entry},this.track))return;
  const budget=tyreGrip(rider.bike,this.race.options.weather),braking=Math.min(9.5,budget.traction*.72);
  const approach=Math.max(180,((rider.bike.top/3.6)**2-route.limit**2)/(2*braking)+45);
  let lap=Math.ceil((rider.progress+approach+25-route.entry)/this.track.length),entry=route.entry+lap*this.track.length;
  if(entry>=this.track.length*this.race.options.laps-10)return;
  this.plans.push({botId:rider.id,penaltyId:penalty.id,kind:'pit',anchor:entry-approach,entry,lap,...(penalty.type==='stopGo'?{stopSeconds:5}:{})});this.changed=true;
 }
 tick(state,bots,time=state.elapsed){
  this.changed=false;this.race.time=Math.max(0,time);this.race.control.sync(state);this.race.options.weather=state.options.weather;
  this.race.riders=[...state.players,...bots].map(p=>this.actor(p));
  const red=state.flag==='red';
  for(const victim of this.race.riders){
   const record=this.stewards.record(victim);
   if(victim.fall&&!record.wasFallen&&!red)for(const other of this.race.riders){
    if(other===victim||Math.hypot(other.x-victim.x,other.z-victim.z)>3.5)continue;
    const closing=Math.hypot(Math.sin(other.heading)*other.speed-Math.sin(victim.heading)*victim.speed,Math.cos(other.heading)*other.speed-Math.cos(victim.heading)*victim.speed);
    this.stewards.unsafeContact(other,victim,{closingSpeed:closing});
   }
   record.wasFallen=!!victim.fall;
  }
  for(const rider of this.race.riders){
   const meta=bots.find(b=>b.id===rider.id),record=this.stewards.record(rider);
   if(red){
    record.serviceCheck=null;rider.service=null;
    // Coasting to the exit during a suspension cannot serve a penalty.
    // Keep the instruction pending and repeat the route after the restart.
    if(rider.isBot)for(const plan of this.plans.filter(p=>p.botId===rider.id&&!p.completed&&p.kind!=='yield')){
     const window=meta?.serviceWindows?.find(s=>s.penaltyId===plan.penaltyId);
     if(window&&meta.drivingTime>=window.start&&(rider.lastDrivingTime??0)<window.end&&!plan.invalid){plan.invalid=true;this.changed=true;}
    }
    rider.lastDrivingTime=meta?.drivingTime;continue;
   }
   if(rider.isBot){
    for(const plan of this.plans.filter(p=>p.botId===rider.id&&!p.completed&&p.kind!=='yield')){
     const service=meta?.serviceWindows?.find(s=>s.penaltyId===plan.penaltyId&&s.end>=(plan.windowEnd||0));
     const penalty=rider.sanctions.find(p=>p.id===plan.penaltyId);
     if(!service||!penalty||penalty.status!=='pending')continue;
     plan.windowEnd=service.end;
     if(meta.drivingTime>=service.start&&meta.drivingTime<service.end)rider.service={kind:'pit'};
     if(meta.drivingTime>=service.end){plan.completed=true;rider.service=null;if(plan.invalid)penalty.deadlineProgress+=this.track.length;else this.stewards.served(rider,penalty);this.changed=true;}
    }
   }else this.observeService(rider,time);
   rider.lastDrivingTime=meta?.drivingTime;
  }
  const before=this.fingerprint();this.stewards.observe(Math.min(.5,Math.max(0,time-(this.lastTime??time))));
  for(const rider of this.race.riders){
   if(rider.dsq&&!rider.retirement)rider.retirement={at:time,progress:rider.progress,speed:rider.speed,x:rider.x,z:rider.z,heading:rider.heading};
   if(rider.isBot&&!red)this.planBot(rider);
  }
  this.lastTime=time;
  if(this.dirty||before!==this.fingerprint())this.changed=true;
  this.dirty=false;
  if(this.changed)this.revision++;
  return this.ledger();
 }
 fingerprint(){return JSON.stringify([...this.actors.values()].map(r=>[r.id,r.sanctions,r.dsq,r.timePenalty,r.positionPenalty,r.penaltiesFinalized,this.stewards.state.get(r.id)]));}
 ledger(){return{revision:this.revision,nextId:this.stewards.nextId,botPlans:this.plans,riders:[...this.actors.values()].map(r=>({id:r.id,sanctions:r.sanctions,timePenalty:r.timePenalty||0,positionPenalty:r.positionPenalty||0,dsq:!!r.dsq,retirement:r.retirement,finalized:!!r.penaltiesFinalized,record:this.stewards.state.get(r.id)}))};}
}
