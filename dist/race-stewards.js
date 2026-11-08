import {penaltyRoutes} from './penalty-routes.js';
import {tyreGrip} from './tyre-grip.js';
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const wrap=v=>Math.atan2(Math.sin(v),Math.cos(v));
const mod=(v,n)=>(v%n+n)%n;
export const PENALTY_LABELS={warning:'AVVERTIMENTO',giveBack:'RESTITUISCI LA POSIZIONE',longlap:'LONG LAP',doubleLonglap:'DOPPIO LONG LAP',rideThrough:'RIDE-THROUGH',time:'PENALITÀ DI TEMPO',position:'PERDITA DI POSIZIONI',dsq:'SQUALIFICA'};
const lapsAllowed={longlap:3,doubleLonglap:5,rideThrough:3};

export class RaceStewards{
 constructor(race){this.race=race;this.track=race.track;this.nextId=1;this.state=new Map();this.pairs=new Map();}
 get routes(){return this._routes??=penaltyRoutes(this.track);}
 record(rider){
  if(!rider.sanctions)rider.sanctions=[];
  if(!this.state.has(rider.id))this.state.set(rider.id,{trackLimits:0,outside:null,lastContact:-100,lastLap:Math.floor(Math.max(0,rider.progress)/this.track.length),caution:null});
  return this.state.get(rider.id);
 }
 active(rider){return(rider.sanctions||[]).find(p=>p.status==='pending')||null;}
 issue(rider,type,details={}){
  if(rider.dsq)return null;
  this.record(rider);
  if(type==='giveBack'&&rider.sanctions.some(p=>p.status==='pending'&&p.type==='giveBack'&&p.targetId===details.targetId))return null;
  const penalty={id:this.nextId++,type,label:PENALTY_LABELS[type],status:'pending',reason:details.reason||'',issuedAt:this.race.time,
   notifiedLap:Math.floor(Math.max(0,rider.progress)/this.track.length),...details};
  if(lapsAllowed[type])penalty.deadlineProgress=(penalty.notifiedLap+1+lapsAllowed[type])*this.track.length;
  if(type==='longlap'||type==='doubleLonglap')penalty.remaining=type==='doubleLonglap'?2:1;
  if(type==='giveBack')penalty.deadline=this.race.time+12;
  if(type==='warning')penalty.status='served';
  if(type==='time'){rider.timePenalty=(rider.timePenalty||0)+Math.max(0,penalty.seconds||3);penalty.status='applied';}
  if(type==='position'){rider.positionPenalty=(rider.positionPenalty||0)+Math.max(1,penalty.places||1);penalty.status='applied';}
  if(type==='dsq'){
   rider.dsq=true;rider.dnf=true;rider.finishTime=null;rider.service=null;rider.serviceGuide=null;penalty.status='applied';
   if(rider.isPlayer){this.race.state='finished';this.race.emit('finish');}
  }
  rider.sanctions.push(penalty);
  this.race.emit('sanction',{riderId:rider.id,name:rider.name,isPlayer:!!rider.isPlayer,penalty:{...penalty}});
  return penalty;
 }
 served(rider,penalty){penalty.status='served';penalty.servedAt=this.race.time;rider.serviceRequested=false;rider.serviceGuide=null;this.race.emit('penaltyServed',{riderId:rider.id,name:rider.name,isPlayer:!!rider.isPlayer,label:penalty.label});}
 request(rider=this.race.player){
  const p=this.active(rider);if(!p||!lapsAllowed[p.type])return false;
  if(!rider.service)rider.serviceRequested=!rider.serviceRequested;
  return rider.serviceRequested;
 }
 unsafeContact(a,b,impact){
  if(impact.closingSpeed<8||this.race.time<5||this.race.control.flag==='red')return;
  const behind=a.progress<b.progress?a:b,ahead=behind===a?b:a;
  // Penalise a clear rear-end impact; a small side touch alone does not
  // establish fault. Victims never receive a penalty simply for falling.
  if(ahead.progress-behind.progress>10||Math.abs(behind.angle||0)>.75||!ahead.fall)return;
  const state=this.record(behind);if(this.race.time-state.lastContact<5)return;
  state.lastContact=this.race.time;state.dangerous=(state.dangerous||0)+1;
  this.issue(behind,state.dangerous>=4?'dsq':state.dangerous>=3?'rideThrough':'longlap',{reason:'Tamponamento pericoloso con caduta causata'});
 }
 prepare(rider){
  this.record(rider);rider.serviceGuide=null;
  const penalty=this.active(rider);if(!penalty||rider.dnf||rider.fall)return;
  if(penalty.type==='giveBack'){
   const target=this.race.riders.find(r=>r.id===penalty.targetId);
   if(target&&!rider.isPlayer)rider.serviceGuide={speed:Math.max(0,target.speed-4),offset:rider.offset};
   return;
  }
  if(!lapsAllowed[penalty.type])return;
  // Professional and careful riders comply earlier. An especially reckless
  // rider may ignore an instruction and receives the same escalation as a human.
  if(!rider.isPlayer&&rider.ai){
   penalty.complies??=rider.character.courtesy>.16||rider.ai.random()<(this.race.options.difficulty==='pro'?.98:.90);
   if(penalty.complies&&this.race.time-penalty.issuedAt>1)rider.serviceRequested=true;
  }
  if(!rider.serviceRequested||rider.service)return;
  const route=this.routes[penalty.type==='rideThrough'?'pit':'longlap'];
  if(this.race.control.applies({progress:route.entry},this.track))return;
  const delta=mod(route.entry-rider.progress,this.track.length);if(delta>210)return;
  const lap=Math.round((rider.progress+delta-route.entry)/this.track.length),entry=route.sample(0,lap);
  const maxBrake=this.race.options.weather==='rain'?6:9;
  const speed=Math.sqrt(route.limit**2+2*maxBrake*Math.max(0,delta-18));
  rider.serviceGuide={speed,offset:0,point:delta<45?entry:null,route:route.kind,distance:delta};
  if(Math.hypot(rider.x-entry.x,rider.z-entry.z)<4&&rider.speed<route.limit+.5&&Math.abs(wrap(rider.heading-entry.heading))<.9){
   rider.service={kind:route.kind,distance:0,lap,penaltyId:penalty.id,stopped:0,invalid:false};rider.serviceGuide=null;
  }
 }
 assistedInput(rider,input){
  const guide=rider.serviceGuide;if(!guide||!rider.serviceRequested)return input;
  const look=Math.max(12,Math.min(35,rider.speed*.8)),aim=guide.point||this.track.sample(rider.progress+look,guide.offset||0);
  const error=wrap(Math.atan2(aim.x-rider.x,aim.z-rider.z)-rider.heading),curve=this.track.sample(rider.progress+look/2).k;
  const lean=Math.atan(rider.speed*rider.speed*curve/9.81)+error*1.45;
  return{throttle:rider.speed<guide.speed-.8,brake:rider.speed>guide.speed+.5,steering:clamp(lean/tyreGrip(this.race.options.bike,this.race.options.weather).maxLean,-1,1)};
 }
 driveService(rider,dt,red=false){
  const service=rider.service;if(!service)return false;
  const route=this.routes[service.kind],penalty=(rider.sanctions||[]).find(p=>p.id===service.penaltyId);
  if(!penalty||penalty.status!=='pending'){rider.service=null;return false;}
  if(service.kind==='longlap'&&this.race.control.applies({progress:route.entry},this.track)&&!red)service.invalid=true;
  const target=red?0:Math.min(route.speedAt(service.distance),route.speedAt(service.distance+18));
  const before=rider.speed,brake=red?Math.min(8,(service.redBrake||0)+dt*6):8;
  if(red)service.redBrake=brake;
  rider.speed+=clamp(target-rider.speed,-brake*dt,4*dt);
  service.distance=Math.min(route.length,service.distance+(before+rider.speed)*.5*dt);
  const q=route.sample(service.distance,service.lap),next=route.sample(service.distance+5,service.lap);
  rider.acceleration=(rider.speed-before)/dt;rider.brake=rider.acceleration<0?Math.min(1,-rider.acceleration/10):0;rider.throttle=rider.acceleration>0?1:0;
  Object.assign(rider,{x:q.x,z:q.z,y:q.y,heading:q.heading,progress:q.progress,
   offset:this.track.project(q.x,q.z,q.progress).offset,angle:wrap(q.heading-this.track.sample(q.progress).yaw),
   lean:clamp(Math.atan(rider.speed*rider.speed*wrap(next.heading-q.heading)/5/9.81),-.8,.8),pitch:clamp(-rider.acceleration*.0045,-.05,.06)});
  if(rider.isPlayer)rider.wheelTravel=(rider.wheelTravel||0)+rider.speed*dt;else rider.travel=(rider.travel||0)+rider.speed*dt;
  if(service.distance>=route.length&&!red){
   rider.service=null;rider.invulnerable=.8;
   if(service.invalid){penalty.deadlineProgress+=this.track.length;this.race.emit('serviceInvalid',{isPlayer:!!rider.isPlayer,name:rider.name,reason:'Long lap neutralizzato: ripeti quando la zona torna verde'});}
   else if(this.race.options.mode==='lan'){penalty.awaitingConfirmation=true;rider.serviceRequested=false;}
   else if(penalty.remaining>1){penalty.remaining--;rider.serviceRequested=true;}
   else this.served(rider,penalty);
   if(rider.ai){this.race.botAI.restart(rider,this.race.time);rider.ai.intent='rejoin';}
  }
  return true;
 }
 retire(rider,dt){
  const before=rider.speed;rider.speed=Math.max(0,rider.speed-6*dt);
  rider.x+=Math.sin(rider.heading)*(before+rider.speed)*.5*dt;rider.z+=Math.cos(rider.heading)*(before+rider.speed)*.5*dt;
  const q=this.track.project(rider.x,rider.z,rider.progress);rider.progress=q.progress;rider.offset=q.offset;rider.brake=.6;rider.lean*=Math.exp(-dt*3);
 }
 conduct(rider,state,dt){
  // A sustained violation is required, so projection noise or briefly touching
  // the pit boundary does not produce an instant penalty.
  if(this.track.config&&Math.abs(rider.offset)>this.track.halfWidth+.3&&!rider.fall){
   const route=this.routes.pit;let distance=Infinity,at=0;
   for(let i=1;i<route.points.length;i++){
    const a=route.points[i-1],b=route.points[i],dx=b.x-a.x,dz=b.z-a.z,u=clamp(((rider.x-a.x)*dx+(rider.z-a.z)*dz)/(dx*dx+dz*dz||1),0,1);
    const d=Math.hypot(rider.x-a.x-dx*u,rider.z-a.z-dz*u);if(d<distance){distance=d;at=a.s+(b.s-a.s)*u;}
   }
   const speeding=distance<route.width/2&&at>30&&at<route.length-25&&rider.speed>route.limit+1;
   state.pitSpeeding=speeding?(state.pitSpeeding||0)+dt:0;
   if(state.pitSpeeding>.65&&this.race.time-(state.pitPenaltyAt??-100)>10){state.pitPenaltyAt=this.race.time;state.pitSpeeding=0;this.issue(rider,'rideThrough',{reason:'Velocità eccessiva in corsia box · limite 60 km/h'});}
  }else state.pitSpeeding=0;
  const leader=this.race.riders.find(other=>other!==rider&&!other.dnf&&!other.fall&&other.finishTime===null&&other.progress-rider.progress>this.track.length-25&&other.progress-rider.progress<this.track.length-2&&Math.abs(other.offset-rider.offset)<1.6&&other.speed>rider.speed-.5);
  state.blueBlocking=leader&&!rider.fall&&!rider.service&&rider.speed>5?(state.blueBlocking||0)+dt:0;
  if(state.blueBlocking>8){
   state.blueBlocking=0;state.blueWarnings=(state.blueWarnings||0)+1;
   this.issue(rider,state.blueWarnings>1?'longlap':'warning',{reason:state.blueWarnings>1?'Bandiere blu ripetutamente ignorate':'Bandiera blu · lascia spazio al pilota che ti doppia'});
  }
 }
 observe(dt){
  const race=this.race,riders=race.riders.filter(r=>!r.isRemote),neutral=race.control.flag==='red';
  for(const rider of riders){
   const state=this.record(rider);if(rider.dsq)continue;
   if(rider.finishTime!==null){this.finalize(rider);continue;}
   if(neutral)continue;
   this.conduct(rider,state,dt);
   const lap=Math.floor(Math.max(0,rider.progress)/this.track.length);
   for(const penalty of rider.sanctions.filter(p=>p.status==='pending')){
    if(penalty.type==='giveBack'){
     const target=riders.find(r=>r.id===penalty.targetId);
     if(!target||target.dnf||target.progress>rider.progress+2)this.served(rider,penalty);
     else if(race.time>penalty.deadline){penalty.status='escalated';this.issue(rider,'longlap',{reason:'Posizione non restituita sotto gialla'});}
    }else if(lapsAllowed[penalty.type]){
     if(lap>state.lastLap&&penalty.type!=='rideThrough'&&race.control.applies({progress:this.routes.longlap.entry},this.track))penalty.deadlineProgress+=this.track.length;
     if(rider.progress>=penalty.deadlineProgress){penalty.status='escalated';this.issue(rider,penalty.type==='longlap'?'doubleLonglap':penalty.type==='doubleLonglap'?'rideThrough':'dsq',{reason:'Penalità non scontata entro i giri concessi'});}
    }
   }
   state.lastLap=lap;
   if(rider.fall||rider.service){state.outside=null;continue;}
   const off=Math.abs(rider.offset)>this.track.halfWidth+1;
   if(off&&!state.outside)state.outside={at:race.time,progress:rider.progress,travel:(rider.isPlayer?rider.wheelTravel:rider.travel)||0,speed:rider.speed};
   if(!off&&state.outside){
    const excursion=state.outside;state.outside=null;
    const distance=((rider.isPlayer?rider.wheelTravel:rider.travel)||0)-excursion.travel,shortcut=rider.progress-excursion.progress>distance*1.12+4;
    if(race.time-excursion.at>.18&&rider.speed>excursion.speed*.8){
     state.trackLimits++;
     if(shortcut||state.trackLimits%5===0)this.issue(rider,'longlap',{reason:shortcut?'Vantaggio ottenuto tagliando il percorso':'Ripetuti track limits'});
     else if(state.trackLimits%5===3)this.issue(rider,'warning',{reason:'Track limits · prossime infrazioni: long lap'});
    }
   }
  }
  if(neutral)return;
  for(let i=0;i<riders.length;i++)for(let j=i+1;j<riders.length;j++){
   const a=riders[i],b=riders[j],key=a.id+':'+b.id,delta=a.progress-b.progress;
   const pair=this.pairs.get(key)||{delta,pending:null};this.pairs.set(key,pair);
   const invalid=a.dnf||b.dnf||a.fall||b.fall||a.finishTime!==null||b.finishTime!==null||a.speed<5||b.speed<5||a.service||b.service;
   if(!invalid&&pair.delta*delta<0&&Math.abs(delta)<8){const offender=delta>0?a:b;pair.pending={id:offender.id,at:race.time,yellow:race.control.applies(offender,this.track)};}
   pair.delta=delta;
   if(invalid){pair.pending=null;continue;}
   const pass=pair.pending;if(!pass)continue;
   const offender=delta>0?a:b,target=delta>0?b:a;
   if(offender.id!==pass.id){pair.pending=null;continue;}
   if(Math.abs(delta)<2.5||race.time-pass.at<.2)continue;
   pair.pending=null;
   // Returning an illegally gained position is authorised. Penalising the
   // rider receiving it back would create an endless chain of sanctions.
   const restitution=(target.sanctions||[]).some(p=>p.type==='giveBack'&&p.targetId===offender.id&&(p.status==='pending'||p.status==='served'&&race.time-p.servedAt<2));
   if(pass.yellow&&!restitution)this.issue(offender,'giveBack',{targetId:target.id,reason:`Sorpasso in zona gialla · lascia passare ${target.name}`});
  }
 }
 finalize(rider){
  if(rider.penaltiesFinalized)return;rider.penaltiesFinalized=true;
  for(const penalty of rider.sanctions||[])if(penalty.status==='pending'){
   penalty.status='converted';
   if(penalty.type==='giveBack')this.issue(rider,'position',{places:1,reason:'Posizione non restituita prima del traguardo'});
   else if(lapsAllowed[penalty.type]){
    const seconds=penalty.type==='rideThrough'?Math.max(15,Math.round(this.routes.pit.length/(60/3.6)-(this.routes.pit.exit-this.routes.pit.entry)/50)):3*(penalty.remaining||1);
    this.issue(rider,'time',{seconds,reason:'Penalità non scontata prima del traguardo'});
   }
  }
  if(rider.finishTime!==null)rider.finishTime+=(rider.timePenalty||0);
  if(rider.isPlayer)this.race.penalties+=(rider.timePenalty||0);
 }
}
