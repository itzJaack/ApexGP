import {BIKE_SPECS} from './bike-specs.js?v=4.5.0';
import {RaceControl} from './race-control.js';
import {BIKE_IDENTITIES,TRACK_IDENTITIES} from './catalog.js?v=4.5.0';
import {CIRCUIT_LAYOUTS} from './circuit-layouts.js';
import {RiderAI} from './rider-ai.js';
import {RiderContacts,RiderFall} from './rider-physics.js';
import {BOT_DRIVERS,BOT_COLORS,GRID_SIZE,gridPlace} from './rider-roster.js';
import {fitRoadElevations} from './elevation.js';
import {START_LIGHT_SECONDS} from './race-signals.js';
import {tyreGrip} from './tyre-grip.js';
import {RaceStewards} from './race-stewards.js';
import {classifyRiders} from './race-results.js';
import {QualifyingSession,careerRiderId,QUALIFYING_RIDERS} from './qualifying.js';
export const clamp = (v,a,b)=>Math.max(a,Math.min(b,v));
export const lerp = (a,b,t)=>a+(b-a)*t;
export const mod = (a,b)=>(a%b+b)%b;
export const wrapAngle = a=>Math.atan2(Math.sin(a),Math.cos(a));
export const gearSpeedStep = bike=>Math.min(52,(bike.top||312)/6);
export const formatTime = t=>!Number.isFinite(t)||t<=0?'—':`${String(Math.floor(t/60)).padStart(2,'0')}:${String(Math.floor(t%60)).padStart(2,'0')}.${String(Math.floor((t%1)*1000)).padStart(3,'0')}`;

// Preserve catalog order: saved garage selections use these stable IDs/indexes.
export const BIKES = Object.entries(BIKE_IDENTITIES).map(([id, spec]) => ({
  id, grip: 1.1, accel: 1, handling: 1, mass: 230, aeroDrag:spec.category==='MotoGP'?.00078:.00090, ...spec,
  ...(BIKE_SPECS[id]?.powerCv ? {power:BIKE_SPECS[id].powerCv} : {}),
  ...(BIKE_SPECS[id]?.weightKg ? {mass:BIKE_SPECS[id].weightKg+75+(BIKE_SPECS[id].noFuel?10:0)} : {}),
  ...(BIKE_SPECS[id]?.topKmh ? {top:BIKE_SPECS[id].topKmh} : {}),
}));
export const TRACKS = Object.entries(TRACK_IDENTITIES).map(([id, spec]) => ({
  id, ...spec, ...CIRCUIT_LAYOUTS[id],
}));

function catmull(p0,p1,p2,p3,t){
  return [0,1].map(i=>.5*((2*p1[i])+(-p0[i]+p2[i])*t+(2*p0[i]-5*p1[i]+4*p2[i]-p3[i])*t*t+(-p0[i]+3*p1[i]-3*p2[i]+p3[i])*t*t*t));
}
export class Circuit{
  constructor(config){
    this.config=config;this.halfWidth=(config.width||18.5)/2;
    const dense=[],pts=config.points;
    // Densely surveyed centre lines use linear interpolation. Catmull-Rom on
    // unevenly spaced OSM nodes bends straights and can overshoot hairpins.
    if(config.layoutVersion)dense.push(...pts);
    else for(let j=0;j<pts.length;j++)for(let n=0;n<100;n++)dense.push(catmull(pts[mod(j-1,pts.length)],pts[j],pts[(j+1)%pts.length],pts[(j+2)%pts.length],n/100));
    dense.push(dense[0]);let length=0;const distances=[0];
    for(let i=1;i<dense.length;i++){length+=Math.hypot(dense[i][0]-dense[i-1][0],dense[i][1]-dense[i-1][1]);distances.push(length);}
    this.length=length;this.count=Math.ceil(length/4);this.step=length/this.count;this.nodes=[];let at=0;
    for(let i=0;i<this.count;i++){
      const d=i*this.step;while(at<dense.length-2&&distances[at+1]<d)at++;
      const t=(d-distances[at])/(distances[at+1]-distances[at]);
      this.nodes.push({x:lerp(dense[at][0],dense[at+1][0],t),z:lerp(dense[at][1],dense[at+1][1],t)});
    }
    for(let i=0;i<this.count;i++){
      const prev=this.nodes[mod(i-1,this.count)],next=this.nodes[(i+1)%this.count],v=this.nodes[i];
      const l=Math.hypot(next.x-prev.x,next.z-prev.z);v.tx=(next.x-prev.x)/l;v.tz=(next.z-prev.z)/l;v.yaw=Math.atan2(v.tx,v.tz);
    }
    // Estimate tyre curvature over 20 metres instead of individual survey
    // segments, keeping AI braking and the racing line stable between nodes.
    const span=config.layoutVersion?Math.max(1,Math.round(10/this.step)):1;
    for(let i=0;i<this.count;i++)this.nodes[i].k=wrapAngle(this.nodes[mod(i+span,this.count)].yaw-this.nodes[mod(i-span,this.count)].yaw)/(this.step*span*2);
    this.bounds={minX:Math.min(...this.nodes.map(p=>p.x)),maxX:Math.max(...this.nodes.map(p=>p.x)),minZ:Math.min(...this.nodes.map(p=>p.z)),maxZ:Math.max(...this.nodes.map(p=>p.z))};
    if(config.terrainGrid){const fitted=fitRoadElevations(config,this.nodes,this.step);this.roadHeights=fitted.heights;this.elevationOffset=fitted.offset;}
  }
  sample(s,offset=0){
    const f=mod(s,this.length)/this.step,i=Math.floor(f),t=f-i,a=this.nodes[i],b=this.nodes[(i+1)%this.count];
    const yaw=a.yaw+wrapAngle(b.yaw-a.yaw)*t,tx=Math.sin(yaw),tz=Math.cos(yaw);
    const fraction=mod(s,this.length)/this.length,profile=this.config.elevationProfile;
    let y=0,grade=0;
    if(this.config.terrainGrid){
      y=lerp(this.roadHeights[i],this.roadHeights[(i+1)%this.count],t);
      grade=(this.roadHeights[(i+1)%this.count]-this.roadHeights[i])/this.step;
    }else if(profile){
      const end=profile.findIndex(p=>p[0]>fraction),a=profile[Math.max(0,end-1)],b=profile[end<0?profile.length-1:end];
      const span=b[0]-a[0],u=span?(fraction-a[0])/span:0;
      y=lerp(a[1],b[1],u*u*(3-2*u));grade=span?(b[1]-a[1])*6*u*(1-u)/(span*this.length):0;
    }
    return {x:lerp(a.x,b.x,t)+tz*offset,z:lerp(a.z,b.z,t)-tx*offset,y,grade,tx,tz,yaw,k:lerp(a.k,b.k,t)};
  }
  cornerSpeed(s,grip=1){const f=mod(s,this.length)/this.step,i=Math.floor(f),k=lerp(this.nodes[i].k,this.nodes[(i+1)%this.count].k,f-i);return clamp(Math.sqrt(9.81*grip*1.43/Math.max(.001,Math.abs(k))),12,95);}
  targetSpeed(s,grip=1,pace=1,braking=12,lookahead=180){
    let result=95;
    for(let d=0;d<=lookahead;d+=15){const v=this.cornerSpeed(s+d,grip)*pace;result=Math.min(result,Math.sqrt(v*v+2*braking*d));}
    return result;
  }
  project(x,z,nearS){
    // Locate the rider without constraining its actual world movement.
    const base=Math.floor(mod(nearS,this.length)/this.step);let best=Infinity,result=null;
    for(let j=-35;j<=35;j++){
      const i=mod(base+j,this.count),a=this.nodes[i],b=this.nodes[(i+1)%this.count],dx=b.x-a.x,dz=b.z-a.z;
      const f=clamp(((x-a.x)*dx+(z-a.z)*dz)/(dx*dx+dz*dz),0,1),px=a.x+dx*f,pz=a.z+dz*f;
      const distance=(x-px)**2+(z-pz)**2;
      if(distance<best){
        best=distance;const s=(i+f)*this.step,delta=mod(s-mod(nearS,this.length)+this.length*.5,this.length)-this.length*.5;
        const p=this.sample(s);result={progress:nearS+delta,offset:(x-px)*p.tz-(z-pz)*p.tx,distance:Math.sqrt(distance)};
      }
    }
    return result;
  }
  nearestDistance(x,z){let best=Infinity;for(let i=0;i<this.count;i+=4)best=Math.min(best,Math.hypot(this.nodes[i].x-x,this.nodes[i].z-z));return best;}
}
export class RaceModel{
  constructor(circuit,options={}){
    this.control=new RaceControl(circuit);this.crashes=0;this.contacts=0;this.offtrackEvents=0;this.track=circuit;this.options={mode:'race',laps:3,difficulty:'sport',weather:'sunset',assist:true,tcs:true,bike:BIKES[0],...options};
    this.state='countdown';this.countdown=START_LIGHT_SECONDS;this.countdownDuration=START_LIGHT_SECONDS;this.restartCount=0;this.physicsTime=0;this.time=0;this.penalties=0;this.events=[];this.lapTimes=[];this.lapStart=0;this.nextLap=circuit.length;this.recording=[];this.lastRecord=-1;this.bestLap=Infinity;this.bestRecording=null;this.messageCooldown=0;
    this.player={name:'JACK',color:this.options.bike.rgb,progress:this.options.mode==='race'?-48:-10,offset:this.options.mode==='race'?1.65:0,speed:0,angle:0,lean:0,rollRate:0,turnRate:0,wheelie:0,wheelieRate:0,brakeHeat:0,tcs:false,wheelTravel:0,steer:0,throttle:0,brake:0,acceleration:0,pitch:0,shiftTimer:0,grip:1,risk:0,crash:0,finishTime:null,isPlayer:true,gear:1,slipstream:false};
    if(this.options.mode==='race')Object.assign(this.player,gridPlace(GRID_SIZE-1));
    this.placePlayer();
    this.bots=['race','qualifying'].includes(this.options.mode)?BOT_DRIVERS.map((driver,i)=>({...driver,id:'bot-'+i,rosterIndex:i,color:BOT_COLORS[i%BOT_COLORS.length],...gridPlace(i),speed:0,lean:0,phase:i*2.37,finishTime:null,isPlayer:false})).filter(b=>this.options.mode!=='qualifying'||(options.qualifying.participants||QUALIFYING_RIDERS).includes(careerRiderId(b))):[];
    this.runId=`${Date.now()}-${Math.random().toString(36).slice(2)}`;this.riders=[this.player,...this.bots];this.collisionCooldown=0;this.ghost=null;
    this.botAI=new RiderAI(circuit,this.options,this.options.botSeed??this.runId);
    this.bots.forEach(b=>{const i=b.rosterIndex;b.bike=BIKES[i%BIKES.length];b.mass=b.bike.mass;this.botAI.attach(b,i);});
    this.player.mass=this.options.bike.mass;this.player.id='player';this.contactPhysics=new RiderContacts();this.botCrashes=0;this.totalContacts=0;this.redStopped=false;
    this.stewards=new RaceStewards(this);
    this.player.bike=this.options.bike;this.control.weather=this.options.weather;
    if(this.options.gridOrder?.length===GRID_SIZE){
      for(const rider of this.riders){Object.assign(rider,gridPlace(this.options.gridOrder.indexOf(careerRiderId(rider))));
        const q=circuit.sample(rider.progress,rider.offset);Object.assign(rider,{x:q.x,z:q.z,y:q.y,heading:q.yaw});}
    }
    if(this.options.mode==='qualifying'){
      this.options.laps=9999;this.state='running';this.time=this.options.qualifying.checkpoint?.elapsed||0;
      const pit=this.stewards.routes.pit,entry=pit.sample(pit.serviceEnd-8);
      Object.assign(this.player,{x:entry.x,z:entry.z,y:entry.y,progress:entry.progress,heading:entry.heading,offset:circuit.project(entry.x,entry.z,entry.progress).offset});
      this.bots.forEach((b,i)=>{b.progress=pit.exit+20+i*18;b.offset=i%2?2:-2;
        const q=circuit.sample(b.progress,b.offset);Object.assign(b,{x:q.x,z:q.z,y:q.y,heading:q.yaw});
        this.botAI.restart(b,this.time);b.ai.launchAt=this.time+i*1.4;
      });
      const participants=this.options.qualifying.participants||QUALIFYING_RIDERS;
      if(!participants.includes('player')){this.player.finishTime=0;this.riders=this.bots;}
      this.qualifying=new QualifyingSession(this,this.options.qualifying);
    }
  }
  get lap(){return clamp(Math.floor(Math.max(0,this.player.progress)/this.track.length)+1,1,this.options.laps);}
  get currentLapTime(){return this.qualifying?this.time-(this.qualifying.state(this.player)?.started??this.time):this.time-this.lapStart;}
  get order(){if(this.redStopped&&this.redOrder&&this.options.mode!=='lan')return [...this.redOrder];return classifyRiders(this.riders);}
  get redReady(){return this.riders.filter(r=>!r.isRemote&&r.finishTime===null).every(r=>r.speed<.08&&!r.fall);}
  get position(){return this.order.indexOf(this.player)+1;}
  emit(type,data={}){this.events.push({type,...data});}
  placePlayer(){const p=this.player,q=this.track.sample(p.progress,p.offset);p.x=q.x;p.z=q.z;p.heading=wrapAngle(q.yaw+p.angle);p.y=q.y||0;}
  resetPlayer(){const p=this.player;this.stewards.resetService(p);p.serviceRequested=false;p.offset=0;p.angle=0;p.speed=Math.min(p.speed,18);p.crash=0;p.fall=null;p.risk=0;p.lean=0;p.rollRate=0;p.turnRate=0;p.steer=0;p.acceleration=0;p.pitch=0;p.wheelie=0;p.wheelieRate=0;p.impactVX=p.impactVZ=p.impactYaw=0;p.invulnerable=1.5;this.placePlayer();if(this.qualifying)this.qualifying.invalidate(p,'Rientro in pista: giro annullato');else if(!this.redStopped&&this.control.flag!=='red'){this.time+=2;this.penalties+=2;this.emit('reset');}}
  crashPlayer(kind='wheelie',severity=1,impact={}){return this.crashRider(this.player,{...impact,kind},severity);}
  crashRider(rider,impact={},severity=1,reportIncident=true){
    if(rider.crash>0||rider.finishTime!==null)return false;
    rider.fall=new RiderFall(rider,this.track,{...impact,wet:this.options.weather==='rain'});rider.crash=rider.fall.duration;rider.fallSign=rider.fall.sign;rider.wheelie=0;rider.wheelieRate=0;
    if(rider.isPlayer){this.crashes++;this.emit('crash',{kind:impact.kind,severity});}
    else{this.botCrashes++;rider.ai.confidence=.60;this.emit('botCrash',{id:rider.id,name:rider.name,progress:rider.progress,kind:impact.kind,severity});}
    if(reportIncident&&this.control.flag!=='red')this.control.incident(rider.progress,severity,this.control.elapsed,{riderIds:[rider.id],onTrack:Math.abs(rider.offset)<this.track.halfWidth+.3});
    return true;
  }
  updateFall(rider,dt){
    const fall=rider.fall,done=fall.update(dt,this.track),b=fall.bike;
    Object.assign(rider,{x:b.x,z:b.z,y:this.track.sample(fall.progress).y||0,progress:fall.progress,offset:fall.offset,speed:Math.hypot(b.vx,b.vz),heading:b.yaw,lean:-b.roll,pitch:b.pitch,crash:Math.max(.01,fall.duration-fall.age)});
    if(!done)return;
    if(rider.isPlayer){this.resetPlayer();this.emit('recovered');}
    else{
      rider.fall=null;rider.crash=0;rider.speed=0;rider.lean=0;rider.pitch=0;rider.offset=clamp(rider.offset,-this.track.halfWidth+1.2,this.track.halfWidth-1.2);rider.invulnerable=1.8;
      this.botAI.restart(rider,this.time);rider.ai.intent='rejoin';rider.ai.intentUntil=this.time+2;
      const q=this.track.sample(rider.progress,rider.offset);Object.assign(rider,{x:q.x,z:q.z,heading:q.yaw,angle:0});
    }
  }
  beginRed(){
    if(this.redStopped)return;
    this.redOrder=[...this.order];this.redStopped=true;this.lapInvalidated=true;this.emit('redBraking');
    if(this.qualifying)for(const r of this.riders)this.qualifying.invalidate(r,'Bandiera rossa: giro annullato');
    for(const r of this.bots){r.redBrakeForce=0;r.ai.desiredOffset=r.offset;r.ai.mistake=null;r.ai.backingUntil=0;r.ai.stuckTime=0;}
  }
  haltForRestart(){
    for(const r of this.riders){r.speed=0;r.wheelie=0;r.wheelieRate=0;r.turnRate=0;r.lateralSpeed=0;r.acceleration=0;r.impactVX=r.impactVZ=r.impactYaw=0;r.fall?.stop();}
  }
  prepareRestart(){
    this.haltForRestart();this.redStopped=false;this.restartCount++;
    const placed=[];
    for(const r of this.redOrder||[...this.riders].sort((a,b)=>b.progress-a.progress)){
      if(r.finishTime!==null)continue;
      r.crash=0;r.fall=null;r.lean=0;r.pitch=0;r.angle=0;r.rollRate=0;r.steer=0;r.brake=0;r.throttle=0;r.invulnerable=1.2;
      r.service=null;r.serviceGuide=null;
      r.offset=clamp(r.offset,-this.track.halfWidth+1.0,this.track.halfWidth-1.0);
      for(const ahead of placed)if(ahead.progress-r.progress<5.0&&Math.abs(ahead.offset-r.offset)<1.0)r.progress=Math.min(r.progress,ahead.progress-5.5);
      placed.push(r);
      const q=this.track.sample(r.progress,r.offset);Object.assign(r,{x:q.x,z:q.z,y:q.y||0,heading:q.yaw});
      this.botAI.restart(r,this.time);
    }
    this.redOrder=null;this.contactPhysics.cooldowns.clear();
  }
  handleContact(a,b,impactA,impactB){
    this.totalContacts++;
    if(a.isPlayer||b.isPlayer){this.contacts++;this.collisionCooldown=.65;this.emit('contact');}
    let fallen=false;const severity=impactA.closingSpeed>24?2:1;
    for(const [r,impact]of[[a,impactA],[b,impactB]]){
      if(r.ai){r.ai.confidence=Math.max(.5,r.ai.confidence-.12);r.ai.decisionAt=this.time;}
      const side=Math.abs(impact.normalX*Math.cos(r.heading)-impact.normalZ*Math.sin(r.heading));
      const threshold=3.9-Math.min(.8,Math.abs(r.lean||0))*1.3-side*.65;
      if(impact.deltaV>threshold||r.wheelie>.12&&impact.deltaV>2.1)fallen=this.crashRider(r,impact,severity,false)||fallen;
    }
    // Two riders in the same collision are one incident for race control.
    if(fallen&&this.control.flag!=='red')this.control.incident((a.progress+b.progress)/2,severity,this.control.elapsed,{riderIds:[a,b].filter(r=>r.fall).map(r=>r.id),onTrack:[a,b].some(r=>r.fall&&Math.abs(r.offset)<this.track.halfWidth+.3)});
    if(fallen&&this.options.mode!=='lan'&&!this.qualifying)this.stewards.unsafeContact(a,b,impactA);
  }
  update(dt,input={}){
    dt=clamp(dt,0,.05);if(dt<=0||this.state==='paused'||this.state==='finished')return;
    if(this.state==='countdown'){this.countdown-=dt;if(this.countdown<=0){this.state='running';this.emit('start');}return;}
    if(this.control.flag==='red')this.beginRed();
    const flagEvent=this.options.mode==='lan'?null:this.control.tick(dt,this);
    if(flagEvent?.restart){this.prepareRestart();this.state='countdown';this.countdown=this.countdownDuration=START_LIGHT_SECONDS;this.emit('restart');return;}
    const underRed=this.control.flag==='red'||this.redStopped&&!this.redReady;
    if(this.redStopped&&!underRed)this.prepareRestart();
    const previousPosition=['yellow','vsc'].includes(this.control.flag)?this.position:0,prevTime=this.time;if(!underRed)this.time+=dt;this.physicsTime+=dt;this.messageCooldown-=dt;this.collisionCooldown-=dt;
    const p=this.player,tr=this.track,bike=this.options.bike;
    const weatherGrip=this.options.weather==='rain'?.74:1,grip=weatherGrip*bike.grip;
    const oldProgress=p.progress;
    for(const r of this.riders){
      r.previousPose={x:r.x,z:r.z,heading:r.heading,lean:r.lean};
      if(!r.isRemote)this.stewards.prepare(r);
    }
    p.invulnerable=Math.max(0,(p.invulnerable||0)-dt);
    if(p.finishTime!==null){}
    else if(p.crash>0&&p.fall)this.updateFall(p,dt);
    else if(p.service&&!p.service.manual)this.stewards.driveService(p,dt,underRed);
    else{
      input=this.stewards.assistedInput(p,input);
      // A/D control roll; world heading comes only from tyre force, never the track tangent.
      const throttle=!underRed&&input.throttle?1:0,brake=underRed?.68:input.brake?1:0,steer=Number.isFinite(input.steering)?clamp(input.steering,-1,1):(input.left?1:0)-(input.right?1:0);
      p.steer=lerp(p.steer,steer,1-Math.exp(-dt*(this.options.assist?13:17)));
      p.throttle=underRed?0:lerp(p.throttle,brake?0:throttle,1-Math.exp(-dt*(brake?24:10)));
      p.brake=lerp(p.brake,brake,1-Math.exp(-dt*(underRed?1.8:brake?28:22)));
      p.slipstream=this.bots.some(b=>b.progress-p.progress>3&&b.progress-p.progress<30&&Math.abs(b.offset-p.offset)<1.8);
      const paved=this.stewards.onPavedRoute(p),off=paved?0:Math.max(0,Math.abs(p.offset)-tr.halfWidth),surface=lerp(1,.43,clamp(off/3,0,1)),mu=grip*surface*2.12;
      const wheelbase=bike.wheelbase??1.49,budget=tyreGrip(bike,this.options.weather,surface),traction=budget.traction,maxLean=budget.maxLean;
      const parkingLean=Math.atan(p.speed*p.speed*Math.tan(p.steer*.48)/(9.81*wheelbase));
      // Trail braking reserves tyre force and stands the bike up gradually. It
      // must not lock the brakes to a tiny remainder of the previous lean.
      const desiredBraking=(14.6*(bike.braking??1)*grip*surface)*p.brake;
      const brakingReserve=Math.min(traction*.88,desiredBraking);
      const cornerBudget=Math.sqrt(Math.max(0,traction*traction-brakingReserve*brakingReserve));
      const gripLean=Math.atan(cornerBudget/9.81),brakeLeanLimit=Math.min(maxLean,gripLean);
      const targetLean=clamp(lerp(parkingLean,p.steer*maxLean,clamp((p.speed-3)/8,0,1)),-brakeLeanLimit,brakeLeanLimit);
      const rollFrequency=(10.8*(bike.handling??1))/(1+p.speed*.0025);
      p.rollRate+=((targetLean-p.lean)*rollFrequency*rollFrequency-2*rollFrequency*p.rollRate)*dt;
      p.lean=clamp(p.lean+p.rollRate*dt,-maxLean,maxLean);
      const lateralDemand=Math.abs(9.81*Math.tan(p.lean));
      const canLift=!underRed&&!!input.wheelie&&p.throttle>.25&&p.speed>4&&p.speed<65&&off<.5;
      const liftTarget=canLift?(1-clamp(Math.abs(p.lean)/.85,0,.75))*.43*(1-clamp((p.speed-35)/45,0,.65)):0;
      p.wheelieRate+=((liftTarget-p.wheelie)*70-(p.brake>0.1?24:17)*p.wheelieRate)*dt;
      p.wheelie=clamp(p.wheelie+p.wheelieRate*dt-p.brake*dt*.65,0,.50);
      const frontContact=1-clamp(p.wheelie/.43,0,1)*.76;
      const drive=Math.min(11.2*bike.accel,bike.power*735.5*.86/((bike.mass??230)*Math.max(12,p.speed)));
      const driveGrip=Math.sqrt(Math.max((traction*.18)**2,traction*traction-Math.min(lateralDemand,traction*.985)**2));
      const tcsLimit=this.options.tcs?1-clamp((Math.abs(p.lean)-.55)/.57,0,1)*.55:1;
      p.tcs=p.throttle>.6&&tcsLimit<.9;p.shiftTimer=Math.max(0,p.shiftTimer-dt);
      const wheelieBoost=p.wheelie>.07&&input.wheelie?1.075:1;
      const propulsion=Math.min(drive*p.throttle*tcsLimit*wheelieBoost,driveGrip)*(p.shiftTimer>0?.30:1);
      const braking=Math.min(traction*.91,desiredBraking)*(1-p.wheelie*.35);
      const drag=.18+(bike.aeroDrag??.001)*p.speed*p.speed*(p.slipstream?.80:1)+(p.throttle<.05?.55+.009*p.speed:0);
      const gravel=off>0?(.35+p.speed*.25+p.speed*p.speed*.017)*clamp(off/3,0,1):0;
      const road=tr.sample(p.progress),gravity=9.81*(road.grade||0)*Math.cos(p.angle);
      const before=p.speed;p.speed=clamp(p.speed+(propulsion-braking-drag-gravel-gravity)*dt,0,bike.top/3.6*(p.slipstream?1.035:1));
      p.acceleration=lerp(p.acceleration,(p.speed-before)/dt,1-Math.exp(-dt*10));p.brakeHeat=lerp(p.brakeHeat,p.brake*Math.min(1,p.speed/45),dt*2);
      p.pitch=clamp(-p.acceleration*.0045,-.048,.065)-p.wheelie;
      const availableLateral=Math.sqrt(Math.max(0,traction*traction-(propulsion-braking)**2));
      const lateralForce=Math.min(lateralDemand,availableLateral)*frontContact;
      const parkingTurn=p.speed*Math.tan(p.steer*.48)/wheelbase,blend=clamp((p.speed-3)/5,0,1);
      const turn=lerp(parkingTurn,Math.sign(p.lean)*lateralForce/Math.max(p.speed,3),blend)*frontContact;p.turnRate=turn;
      const excess=Math.max(0,lateralDemand/Math.max(1,availableLateral)-1);
      const drift=-Math.sign(turn)*Math.min(1,excess*excess)*p.speed*.018,mid=p.heading+turn*dt*.5;
      p.x+=(Math.sin(mid)*p.speed+Math.cos(mid)*drift+(p.impactVX||0))*dt;p.z+=(Math.cos(mid)*p.speed-Math.sin(mid)*drift+(p.impactVZ||0))*dt;
      p.heading=wrapAngle(p.heading+(turn+(p.impactYaw||0))*dt);p.wheelTravel+=p.speed*dt;
      p.impactVX=(p.impactVX||0)*Math.exp(-dt*3.5);p.impactVZ=(p.impactVZ||0)*Math.exp(-dt*3.5);p.impactYaw=(p.impactYaw||0)*Math.exp(-dt*5);
      const projected=tr.project(p.x,p.z,p.progress);p.progress=projected.progress;p.offset=projected.offset;
      const ground=tr.sample(p.progress);p.y=paved?this.stewards.routes.pit.sample(this.stewards.routes.pit.project(p).at).y:ground.y||0;p.angle=wrapAngle(p.heading-ground.yaw);
      p.risk=lerp(p.risk,clamp(excess*.45+off*.045,0,1),dt*2);p.grip=clamp(surface*(1-p.risk*.25),.25,1);
      if(p.wheelie>.16&&Math.abs(p.lean)>.46&&p.speed>10)this.crashPlayer('wheelie',1);
      if(!underRed&&off>1&&this.messageCooldown<=0){this.offtrackEvents++;this.messageCooldown=3;this.emit('offtrack');}
      const kph=p.speed*3.6,gearStep=gearSpeedStep(bike);if(p.gear<6&&kph>p.gear*gearStep+2){p.gear++;p.shiftTimer=.10;}else if(p.gear>1&&kph<(p.gear-1)*gearStep-7)p.gear--;
    }

    for(const b of this.bots){
      if(b.dnf)this.stewards.retire(b,dt);
      else if(b.fall)this.updateFall(b,dt);
      else if(b.service)this.stewards.driveService(b,dt,underRed);
      else this.botAI.update(b,this.riders,dt,this.time,this.control,(r,impact)=>this.crashRider(r,impact));
    }
    if(this.options.mode!=='lan')this.contactPhysics.update(this.riders,dt,this.physicsTime,tr,(...impact)=>this.handleContact(...impact));
    // Braking and falls continue under red. Official timing, records and
    // lap/finish crossings remain suspended until the standing restart.
    if(underRed)return;
    if(this.control.flag==='red'){this.beginRed();return;}
    if(this.qualifying){this.qualifying.observe(dt);return;}
    if(this.options.mode!=='lan')this.stewards.observe(dt);
    else this.stewards.observeManualService(p);
    if(this.state==='finished')return;
    let penalty=this.options.mode==='lan'?0:this.control.speedPenalty(this,dt);if(penalty){this.time+=penalty;this.penalties+=penalty;this.emit('penalty',{seconds:penalty,reason:'VSC'});}
    if(this.state==='classifying'){
      if(this.bots.every(b=>b.finishTime!==null||b.dnf)||this.time-this.classificationAt>60){
        for(const b of this.bots)if(b.finishTime===null&&!b.dsq)b.dnf=true;
        this.state='finished';this.control.set('chequered',1e9);this.emit('finish');
      }
      return;
    }
    if(this.control.applies(p,tr))this.lapInvalidated=true;
    if(this.time-this.lastRecord>=.08&&p.progress<this.nextLap){this.recording.push({t:this.currentLapTime,s:clamp(p.progress-(this.nextLap-tr.length),0,tr.length),x:p.offset,v:p.speed,a:p.angle,l:p.lean,wx:p.x,wz:p.z,h:p.heading});this.lastRecord=this.time;}
    if(p.progress>=this.nextLap){
      const fraction=clamp((this.nextLap-oldProgress)/Math.max(.001,p.progress-oldProgress),0,1);
      const crossingTime=prevTime+fraction*dt,lapTime=crossingTime-this.lapStart;
      this.lapTimes.push(lapTime);
      const finishSample={t:lapTime,s:tr.length,x:p.offset,v:p.speed,a:p.angle,l:p.lean,wx:p.x,wz:p.z,h:p.heading};
      if(!this.lapInvalidated&&lapTime<this.bestLap){this.bestLap=lapTime;this.bestRecording=[...this.recording,finishSample];}
      this.emit('lap',{time:lapTime,recording:[...this.recording,finishSample],invalidated:!!this.lapInvalidated});this.lapInvalidated=false;
      this.lapStart=crossingTime;this.nextLap+=tr.length;this.recording=[{t:0,s:0,x:p.offset,v:p.speed,a:p.angle,l:p.lean}];this.lastRecord=this.time;
      if(this.lapTimes.length>=this.options.laps){
        p.finishTime=crossingTime;this.stewards.finalize(p);p.speed=0;
        if(this.options.mode==='race'&&this.bots.some(b=>b.finishTime===null&&!b.dnf)){this.state='classifying';this.classificationAt=this.time;this.emit('playerFinish');}
        else{this.state='finished';this.control.set('chequered',1e9);this.emit('finish');}
      }
    }
  }
}
