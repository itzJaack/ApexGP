import {BIKES,Circuit,TRACKS,clamp} from './simulation.js';
import {botDriving} from './bot-driving.js';
import {BOT_DRIVERS,GRID_SIZE,paceRank} from './rider-roster.js';
import {redBrakeEnvelope} from './race-signals.js';
import {sectorClock} from './sector-clock.js';
import {tyreGrip} from './tyre-grip.js';
import {botDetours,profilePose,botOffset} from './bot-detours.js';
import {legalMetadata} from './network-stewards.js';
export {BOT_DRIVERS} from './rider-roster.js';
export function makeBotRoster(humans,enabled){return enabled?Array.from({length:Math.max(0,GRID_SIZE-humans)},(_,i)=>({id:'bot-'+i,...BOT_DRIVERS[i],bikeId:BIKES[(humans+i+2)%BIKES.length].id,livery:'factory',slot:humans+i,isBot:true,ready:true,finishTime:null,penalties:0,dnf:false})):[];}
export const botRate=flag=>flag==='red'?0:flag==='vsc'?.30:1;
export function appendBotPhase(phases,elapsed,flag,brakeSeconds=0){
 const rate=botRate(flag),last=phases.at(-1),at=Math.max(last?.at||0,Number(elapsed)||0),restart=last?.rate===0&&rate>0;
 // Race time is frozen under red: retain both phases even at the same time.
 const braking=rate===0&&brakeSeconds>0?{brakeSeconds:Math.max(3,Math.min(30,brakeSeconds))}:{};
 if(last&&Math.abs(last.at-at)<1e-7&&!restart){Object.assign(last,{rate},braking);return;}
 if(!last||last.rate!==rate)phases.push({at,rate,...braking,...(restart?{restart:true}:{})});
}
const restartArea=t=>t<=0?0:t<8?t*t/16:t-4;
const clockGain=(from,to,rate,restart)=>rate*(restart===null?Math.max(0,to-from):restartArea(to-restart)-restartArea(from-restart));
function advanceInverse(amount,at,rate,restart){
 if(!rate)return Infinity;if(restart===null)return at+amount/rate;
 const area=restartArea(at-restart)+amount/rate;return restart+(area<4?Math.sqrt(area*16):area+4);
}
export function botClock(elapsed,phases=[{at:0,rate:1}],redAge=0){
 let time=0,rate=1,at=0,restart=null,coast=null;
 for(const p of phases){
  if(p.at>elapsed)break;
  time+=coast?redBrakeEnvelope(coast.duration,coast.duration).area*coast.rate:clockGain(at,p.at,rate,restart);
  const incoming=rate*(restart===null?1:clamp((p.at-restart)/8,0,1));
  coast=p.rate===0&&p.brakeSeconds>0?{duration:p.brakeSeconds,rate:incoming}:null;
  if(p.restart||rate===0&&p.rate>0)restart=p.at;at=p.at;rate=p.rate;
 }
 if(coast){const envelope=redBrakeEnvelope(redAge,coast.duration);return{time:time+envelope.area*coast.rate,rate:envelope.rate*coast.rate,red:true};}
 time+=clockGain(at,elapsed,rate,restart);
 return{time,rate:rate*(restart===null?1:clamp((elapsed-restart)/8,0,1)),red:rate===0};
}
function clockInverse(target,phases){
 let time=0,at=0,rate=1,restart=null,coast=null;
 for(const p of phases){
  const next=time+(coast?redBrakeEnvelope(coast.duration,coast.duration).area*coast.rate:clockGain(at,p.at,rate,restart));
  if(coast&&target<=next)return p.at;
  if(rate>0&&target<=next)return advanceInverse(target-time,at,rate,restart);
  const incoming=rate*(restart===null?1:clamp((p.at-restart)/8,0,1));
  time=next;coast=p.rate===0&&p.brakeSeconds>0?{duration:p.brakeSeconds,rate:incoming}:null;
  if(p.restart||rate===0&&p.rate>0)restart=p.at;at=p.at;rate=p.rate;
 }
 if(coast)return Infinity;
 return advanceInverse(target-time,at,rate,restart);
}
export class BotGrid{
 constructor(track,options,humans){this.track=track;this.options=options;this.roster=makeBotRoster(humans,options.bots);this.profiles=this.roster.map((b,i)=>this.profile(b,i));}
 cautions(history,phases){
  const key=JSON.stringify(history)+':'+phases.length;
  if(key===this.cautionKey)return this.cautionEvents;
  this.cautionKey=key;
  this.cautionEvents=history.map(event=>({zone:event.zone,
    start:botClock(event.at,phases.slice(0,event.phaseCount||phases.length)).time,
    end:botClock(event.endAt??event.at+event.duration,phases.slice(0,event.endPhaseCount||event.phaseCount||phases.length)).time}));
  return this.cautionEvents;
 }
 finishAt(profile,elapsed,phases,events){
  if(!events.length)return clockInverse(profile.duration,phases);
  const signature=at=>JSON.stringify([phases.filter(p=>p.at<=at),events.filter(e=>e.start<=botClock(at,phases).time)]);
  if(profile.finishCache?.key===signature(profile.finishCache.time))return profile.finishCache.time;
  let low=0,high=elapsed;
  for(let i=0;i<36;i++){const mid=(low+high)/2,base=botClock(mid,phases);if(sectorClock(profile,base.time,events,this.track.length).time>=profile.duration&&!base.red)high=mid;else low=mid;}
  profile.finishCache={key:signature(high),time:high};return high;
 }
 profile(bot,index){
  const tr=this.track,bike=BIKES.find(b=>b.id===bot.bikeId),driving=botDriving(this.options.difficulty),budget=tyreGrip(bike,this.options.weather);
  const start=-10-bot.slot*7,finish=tr.length*this.options.laps,n=Math.ceil((finish-start)/5),step=(finish-start)/n;
  const positions=new Float64Array(n+1),speeds=new Float64Array(n+1),times=new Float64Array(n+1);
  const pace=Math.min(.97,driving.pace*.82)*(1-paceRank(index)*driving.spread),top=Math.min(bike.top,300,driving.top-paceRank(index)*driving.topSpread)/3.6;
  const braking=Math.min(driving.braking,budget.traction*.72);
  for(let i=0;i<=n;i++){
   positions[i]=start+i*step;
   const curvature=Math.max(.0001,Math.abs(tr.sample(positions[i]).k));
   speeds[i]=Math.min(top,Math.sqrt(budget.lateral/curvature)*pace);
  }
  for(let i=n-1;i>=0;i--)speeds[i]=Math.min(speeds[i],Math.sqrt(speeds[i+1]**2+2*braking*step));
  speeds[0]=0;
  for(let i=1;i<=n;i++){
   const motor=Math.max(2.5,(driving.acceleration-3.8*speeds[i-1]/top)*bike.accel);
   const lateral=speeds[i-1]**2*Math.abs(tr.sample(positions[i-1]).k),traction=Math.sqrt(Math.max(0,budget.traction**2-lateral**2));
   const accel=Math.min(motor,traction*.7);
   speeds[i]=Math.min(speeds[i],Math.sqrt(speeds[i-1]**2+2*accel*step));
   times[i]=times[i-1]+2*step/Math.max(.01,speeds[i-1]+speeds[i]);
  }
  return{positions,speeds,times,duration:times[n],finish};
 }
 sample(elapsed,phases=[{at:0,rate:1}],finished=false,redAge=0,zoneHistory=[],ledger=null){
  const clock=botClock(Math.max(0,elapsed),phases,redAge),tr=this.track,events=this.cautions(zoneHistory,phases);
  return this.roster.map((bot,index)=>{
   const base=this.profiles[index],plans=(ledger?.botPlans||[]).filter(p=>p.botId===bot.id),key=JSON.stringify(plans);
   if(base.detourKey!==key){base.detourKey=key;base.detourProfile=plans.length?botDetours(base,plans,tr,BIKES.find(b=>b.id===bot.bikeId),index,this.options.weather):base;}
   const p=base.detourProfile,caution=sectorClock(p,clock.time,events,tr.length),drivingTime=caution.time,reached=drivingTime>=p.duration,end=reached&&!clock.red;
   const q=profilePose(p,drivingTime,tr,index),legal=legalMetadata(ledger,bot.id);
   let s=reached?p.finish:q.progress,speed=reached?0:q.speed*clock.rate*caution.rate;
   const pose={x:q.x,z:q.z,y:q.y,heading:q.yaw,speed,lean:clamp(Math.atan(speed*speed*tr.sample(s).k/9.81),-1.04,1.04),pitch:-Math.atan(tr.sample(s).grade||0),wheelie:0,crash:0,travel:Math.max(0,s-(-10-bot.slot*7))};
   if(legal.dsq&&legal.retirement){
    const r=legal.retirement,age=Math.max(0,elapsed-r.at),duration=r.speed/6,coast=r.speed*Math.min(age,duration)-3*Math.min(age,duration)**2;
    s=r.progress+coast;Object.assign(pose,{x:r.x+Math.sin(r.heading)*coast,z:r.z+Math.cos(r.heading)*coast,heading:r.heading,speed:Math.max(0,r.speed-6*age),lean:0});
   }
   const rawFinishTime=end?this.finishAt(p,elapsed,phases,events):null,dnf=!!legal.dsq||finished&&!end;
   return{...bot,...legal,progress:s,offset:p.points||legal.dsq?tr.project(pose.x,pose.z,s).offset:botOffset(index,s,tr),rawFinishTime,finishTime:legal.dsq?null:rawFinishTime===null?null:rawFinishTime+(legal.timePenalty||0),penalties:legal.timePenalty||0,dnf,drivingTime,serviceWindows:p.services||[],pose:{...pose,speed:finished&&dnf?0:pose.speed}};
  });
 }
}
export function networkBots(client,s=client.state){if(!s?.options.bots)return[];if(s.status==='lobby')return makeBotRoster(s.players.length,true);const humans=s.gridHumans??s.players.length,key=[s.roundId,s.options.trackId,s.options.weather,s.options.laps,s.options.difficulty,humans].join(':');if(client.botGridKey!==key){client.botGridKey=key;client.botGrid=new BotGrid(new Circuit(TRACKS.find(t=>t.id===s.options.trackId)),s.options,humans);client.botFinishSent=new Set();}const elapsed=s.status==='finished'||s.flag==='red'?s.elapsed:s.elapsed+clamp((client.now()-s.now)/1000,0,2),redAge=s.flag==='red'?Math.max(0,(client.now()-(s.redStartedAt??s.pauseStart??client.now()))/1000):0;return client.botGrid.sample(elapsed,s.botPhases,s.status==='finished',redAge,s.zoneHistory||[],s.stewardLedger);}
