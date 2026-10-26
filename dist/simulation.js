import {RaceControl} from './race-control.js';
import {BIKE_IDENTITIES,TRACK_IDENTITIES} from './catalog.js';
import {CIRCUIT_LAYOUTS} from './circuit-layouts.js';
export const clamp = (v,a,b)=>Math.max(a,Math.min(b,v));
export const lerp = (a,b,t)=>a+(b-a)*t;
export const mod = (a,b)=>(a%b+b)%b;
export const wrapAngle = a=>Math.atan2(Math.sin(a),Math.cos(a));
export const gearSpeedStep = bike=>Math.min(52,(bike.top||312)/6);
export const formatTime = t=>!Number.isFinite(t)||t<=0?'—':`${String(Math.floor(t/60)).padStart(2,'0')}:${String(Math.floor(t%60)).padStart(2,'0')}.${String(Math.floor((t%1)*1000)).padStart(3,'0')}`;

// Preserve catalog order: saved garage selections use these stable IDs/indexes.
export const BIKES = Object.entries(BIKE_IDENTITIES).map(([id, spec]) => ({
  id, grip: 1.1, accel: 1, handling: 1, mass: 230, aeroDrag:spec.category==='MotoGP'?.00078:.00090, ...spec,
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
  }
  sample(s,offset=0){
    const f=mod(s,this.length)/this.step,i=Math.floor(f),t=f-i,a=this.nodes[i],b=this.nodes[(i+1)%this.count];
    const yaw=a.yaw+wrapAngle(b.yaw-a.yaw)*t,tx=Math.sin(yaw),tz=Math.cos(yaw);
    const fraction=mod(s,this.length)/this.length,profile=this.config.elevationProfile;
    let y=0,grade=0;
    if(profile){
      const end=profile.findIndex(p=>p[0]>fraction),a=profile[Math.max(0,end-1)],b=profile[end<0?profile.length-1:end];
      const span=b[0]-a[0],u=span?(fraction-a[0])/span:0;
      y=lerp(a[1],b[1],u*u*(3-2*u));grade=span?(b[1]-a[1])*6*u*(1-u)/(span*this.length):0;
    }
    return {x:lerp(a.x,b.x,t)+tz*offset,z:lerp(a.z,b.z,t)-tx*offset,y,grade,tx,tz,yaw,k:lerp(a.k,b.k,t)};
  }
  cornerSpeed(s,grip=1){const f=mod(s,this.length)/this.step,i=Math.floor(f),k=lerp(this.nodes[i].k,this.nodes[(i+1)%this.count].k,f-i);return clamp(Math.sqrt(9.81*grip*1.43/Math.max(.001,Math.abs(k))),12,95);}
  targetSpeed(s,grip=1,pace=1){
    let result=95;
    for(let d=0;d<=180;d+=15){const v=this.cornerSpeed(s+d,grip)*pace;result=Math.min(result,Math.sqrt(v*v+2*12*d));}
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
const botNames=['L. ROSSI','M. SERRA','A. TORRES','D. COSTA','N. MARTIN','E. MORETTI','S. HAYES'];
const botColors=[[.12,.48,.96],[.82,.06,.12],[.85,.82,.18],[.15,.72,.52],[.73,.2,.65],[.88,.88,.84],[.1,.63,.8]];
export class RaceModel{
  constructor(circuit,options={}){
    this.control=new RaceControl();this.crashes=0;this.contacts=0;this.offtrackEvents=0;this.track=circuit;this.options={mode:'race',laps:3,difficulty:'sport',weather:'sunset',assist:true,tcs:true,bike:BIKES[0],...options};
    this.state='countdown';this.countdown=3.6;this.time=0;this.penalties=0;this.events=[];this.lapTimes=[];this.lapStart=0;this.nextLap=circuit.length;this.recording=[];this.lastRecord=-1;this.bestLap=Infinity;this.bestRecording=null;this.messageCooldown=0;
    this.player={name:'JACK',color:this.options.bike.rgb,progress:this.options.mode==='race'?-48:-10,offset:this.options.mode==='race'?1.65:0,speed:0,angle:0,lean:0,rollRate:0,turnRate:0,wheelie:0,wheelieRate:0,brakeHeat:0,tcs:false,wheelTravel:0,steer:0,throttle:0,brake:0,acceleration:0,pitch:0,shiftTimer:0,grip:1,risk:0,crash:0,finishTime:null,isPlayer:true,gear:1,slipstream:false};
    this.placePlayer();
    this.bots=this.options.mode==='race'?botNames.map((name,i)=>({name,color:botColors[i],progress:-i*6.6,offset:(i%2===0?-1.65:1.65),speed:0,lean:0,phase:i*2.37,pace:1-i*.014,finishTime:null,number:[46,63,89,23,12,21,41][i],isPlayer:false})):[];
    this.runId=`${Date.now()}-${Math.random().toString(36).slice(2)}`;this.riders=[this.player,...this.bots];this.collisionCooldown=0;this.ghost=null;
  }
  get lap(){return clamp(Math.floor(Math.max(0,this.player.progress)/this.track.length)+1,1,this.options.laps);}
  get currentLapTime(){return this.time-this.lapStart;}
  get order(){return [...this.riders].sort((a,b)=>{if(!!a.dnf!==!!b.dnf)return Number(!!a.dnf)-Number(!!b.dnf);if(a.finishTime!==null&&b.finishTime!==null)return a.finishTime-b.finishTime;if(a.finishTime!==null)return-1;if(b.finishTime!==null)return 1;return b.progress-a.progress;});}
  get position(){return this.order.indexOf(this.player)+1;}
  emit(type,data={}){this.events.push({type,...data});}
  placePlayer(){const p=this.player,q=this.track.sample(p.progress,p.offset);p.x=q.x;p.z=q.z;p.heading=wrapAngle(q.yaw+p.angle);p.y=q.y||0;}
  resetPlayer(){const p=this.player;p.offset=0;p.angle=0;p.speed=Math.min(p.speed,18);p.crash=0;p.risk=0;p.lean=0;p.rollRate=0;p.turnRate=0;p.steer=0;p.acceleration=0;p.pitch=0;p.wheelie=0;p.wheelieRate=0;this.placePlayer();this.time+=2;this.penalties+=2;this.emit('reset');}
  crashPlayer(kind='wheelie',severity=1){const p=this.player;if(p.crash>0)return false;p.crash=2.5;p.fallSign=Math.sign(p.lean)||1;p.speed*=.80;p.wheelie=0;p.wheelieRate=0;this.crashes++;this.control.incident(p.progress,severity);this.emit('crash',{kind,severity});return true;}
  update(dt,input={}){
    dt=clamp(dt,0,.05);if(dt<=0||this.state==='paused'||this.state==='finished')return;
    if(this.state==='countdown'){this.countdown-=dt;if(this.countdown<=0){this.state='running';this.emit('start');}return;}
    const flagEvent=this.options.mode==='lan'?null:this.control.tick(dt,this);if(flagEvent?.restart){this.state='countdown';this.countdown=3.6;this.emit('restart');return;}if(this.control.flag==='red'){this.player.speed=0;this.player.wheelie=0;return;}
    const previousPosition=['yellow','vsc'].includes(this.control.flag)?this.position:0,prevTime=this.time;this.time+=dt;this.messageCooldown-=dt;this.collisionCooldown-=dt;
    const p=this.player,tr=this.track,bike=this.options.bike;
    const weatherGrip=this.options.weather==='rain'?.74:1,grip=weatherGrip*bike.grip;
    const oldProgress=p.progress;
    if(p.crash>0){p.crash-=dt;p.speed=Math.max(0,p.speed-18*dt);p.x+=Math.sin(p.heading)*p.speed*dt;p.z+=Math.cos(p.heading)*p.speed*dt;const projected=tr.project(p.x,p.z,p.progress);p.progress=projected.progress;p.offset=projected.offset;p.angle=wrapAngle(p.heading-tr.sample(p.progress).yaw);p.lean=lerp(p.lean,1.2,dt*8);if(p.crash<=0){this.resetPlayer();this.emit('recovered');}}
    else{
      // A/D control roll; world heading comes only from tyre force, never the track tangent.
      const throttle=input.throttle?1:0,brake=input.brake?1:0,steer=(input.left?1:0)-(input.right?1:0);
      p.steer=lerp(p.steer,steer,1-Math.exp(-dt*(this.options.assist?13:17)));
      p.throttle=lerp(p.throttle,brake?0:throttle,1-Math.exp(-dt*(brake?24:10)));
      p.brake=lerp(p.brake,brake,1-Math.exp(-dt*(brake?28:22)));
      p.slipstream=this.bots.some(b=>b.progress-p.progress>3&&b.progress-p.progress<30&&Math.abs(b.offset-p.offset)<1.8);
      const off=Math.max(0,Math.abs(p.offset)-tr.halfWidth),surface=lerp(1,.43,clamp(off/3,0,1)),mu=grip*surface*2.12;
      const wheelbase=bike.wheelbase??1.49,traction=9.81*mu,maxLean=(this.options.weather==='rain'?.92:1.12)*Math.pow(bike.grip,.075);
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
      const canLift=!!input.wheelie&&p.throttle>.25&&p.speed>4&&p.speed<65&&off<.5;
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
      p.x+=(Math.sin(mid)*p.speed+Math.cos(mid)*drift)*dt;p.z+=(Math.cos(mid)*p.speed-Math.sin(mid)*drift)*dt;
      p.heading=wrapAngle(p.heading+turn*dt);p.wheelTravel+=p.speed*dt;
      const projected=tr.project(p.x,p.z,p.progress);p.progress=projected.progress;p.offset=projected.offset;
      const ground=tr.sample(p.progress);p.y=ground.y||0;p.angle=wrapAngle(p.heading-ground.yaw);
      p.risk=lerp(p.risk,clamp(excess*.45+off*.045,0,1),dt*2);p.grip=clamp(surface*(1-p.risk*.25),.25,1);
      if(p.wheelie>.16&&Math.abs(p.lean)>.46&&p.speed>10)this.crashPlayer('wheelie',1);
      if(off>1&&this.messageCooldown<=0){this.offtrackEvents++;this.messageCooldown=3;this.emit('offtrack');}
      const kph=p.speed*3.6,gearStep=gearSpeedStep(bike);if(p.gear<6&&kph>p.gear*gearStep+2){p.gear++;p.shiftTimer=.10;}else if(p.gear>1&&kph<(p.gear-1)*gearStep-7)p.gear--;
    }

    const pace={rookie:.79,sport:.94,pro:1.045}[this.options.difficulty]??.94;
    for(const b of this.bots){
      if(b.finishTime!==null)continue;
      const previous=b.progress,underFlag=this.control.flag==='vsc'||this.control.flag==='yellow'&&this.control.applies(b,tr),target=Math.min(underFlag?25:95,tr.targetSpeed(b.progress,weatherGrip*1.03,pace*b.pace));
      const top=(300-b.phase*1.4)/3.6;
      if(b.speed<Math.min(target,top))b.speed=Math.min(target,top,b.speed+(8.5-3.8*b.speed/top)*dt);
      else b.speed=Math.max(target,b.speed-15*dt);
      b.progress+=b.speed*dt;
      const near=p.progress-b.progress;
      const avoid=near>-4&&near<15?Math.sign(b.offset-p.offset||1)*1.3:0;
      const wanted=clamp(Math.sin(b.progress*.005+b.phase)*2.2+Math.sign(tr.sample(b.progress+25).k)*1.5+avoid,-6,6);
      b.offset=lerp(b.offset,wanted,dt*1.1);b.lean=lerp(b.lean,clamp(Math.atan(b.speed*b.speed*tr.sample(b.progress).k/9.81),-1.04,1.04),dt*5);
      if(Math.abs(b.progress-p.progress)<2.2&&Math.abs(b.offset-p.offset)<.8&&this.collisionCooldown<=0&&p.crash<=0){
        const relative=Math.abs(p.speed-b.speed)+Math.abs(wrapAngle(p.heading-tr.sample(b.progress).yaw))*p.speed*.25;this.contacts++;if(relative>10||p.wheelie>.12&&relative>5)this.crashPlayer('contact',relative>22?2:1);
        p.speed*=.87;b.speed*=.93;const bump=Math.sign(p.offset-b.offset||1)*.8,q=tr.sample(p.progress);p.offset+=bump;p.x+=q.tz*bump;p.z-=q.tx*bump;this.collisionCooldown=1.1;this.emit('contact');
      }
      const finish=tr.length*this.options.laps;
      if(b.progress>=finish){b.finishTime=prevTime+(finish-previous)/Math.max(.001,b.progress-previous)*dt;b.progress=finish;}
    }
    let penalty=this.options.mode==='lan'?0:this.control.speedPenalty(this,dt);if(previousPosition&&this.options.mode!=='lan'&&this.position<previousPosition&&this.control.applies(p,tr)&&['yellow','vsc'].includes(this.control.flag)&&this.control.cooldown<=0){penalty+=3;this.control.cooldown=5;}if(penalty){this.time+=penalty;this.penalties+=penalty;this.emit('penalty',{seconds:penalty,reason:this.control.flag==='vsc'?'VSC':'yellow'});}
    if(this.time-this.lastRecord>=.08&&p.progress<this.nextLap){this.recording.push({t:this.currentLapTime,s:clamp(p.progress-(this.nextLap-tr.length),0,tr.length),x:p.offset,v:p.speed,a:p.angle,l:p.lean,wx:p.x,wz:p.z,h:p.heading});this.lastRecord=this.time;}
    if(p.progress>=this.nextLap){
      const fraction=clamp((this.nextLap-oldProgress)/Math.max(.001,p.progress-oldProgress),0,1);
      const crossingTime=prevTime+fraction*dt,lapTime=crossingTime-this.lapStart;
      this.lapTimes.push(lapTime);
      const finishSample={t:lapTime,s:tr.length,x:p.offset,v:p.speed,a:p.angle,l:p.lean,wx:p.x,wz:p.z,h:p.heading};
      if(lapTime<this.bestLap){this.bestLap=lapTime;this.bestRecording=[...this.recording,finishSample];}
      this.emit('lap',{time:lapTime,recording:[...this.recording,finishSample]});
      this.lapStart=crossingTime;this.nextLap+=tr.length;this.recording=[{t:0,s:0,x:p.offset,v:p.speed,a:p.angle,l:p.lean}];this.lastRecord=this.time;
      if(this.lapTimes.length>=this.options.laps){p.finishTime=crossingTime;this.state='finished';this.control.set('chequered',1e9);this.emit('finish');}
    }
  }
}
