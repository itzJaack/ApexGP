import {botDriving} from './bot-driving.js';
import {paceRank} from './rider-roster.js';
import {tyreGrip,availableCornerForce} from './tyre-grip.js';

const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const approach=(a,b,step)=>a+clamp(b-a,-step,step);
const gap=(a,b,length)=>((a-b+length*.5)%length+length)%length-length*.5;
const wrapAngle=value=>Math.atan2(Math.sin(value),Math.cos(value));
const DEFAULT_BIKE={grip:1.1,braking:1,accel:1,handling:1,mass:230,power:200,top:312};
export const RIDER_CHARACTERS=[
  {name:'attaccante',aggression:.90,courtesy:.20,brakeBias:.62,consistency:.78},
  {name:'prudente',aggression:.24,courtesy:.94,brakeBias:-.65,consistency:.90},
  {name:'opportunista',aggression:.70,courtesy:.52,brakeBias:.30,consistency:.73},
  {name:'difensore',aggression:.76,courtesy:.30,brakeBias:.08,consistency:.87},
  {name:'regolare',aggression:.40,courtesy:.78,brakeBias:-.30,consistency:.96},
  {name:'irruento',aggression:.97,courtesy:.12,brakeBias:.82,consistency:.60},
  {name:'calcolatore',aggression:.59,courtesy:.70,brakeBias:-.10,consistency:.94},
];
const SKILL={rookie:{reaction:.43,error:.070,precision:.48},sport:{reaction:.23,error:.020,precision:.86},pro:{reaction:.14,error:.0025,precision:.96}};
export function seededRandom(seed){
  let s=2166136261;for(const c of String(seed))s=Math.imul(s^c.charCodeAt(0),16777619);
  return()=>{s+=0x6D2B79F5;let t=s;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296;};
}
export function mistakeProbability(level,character,pressure=0,wet=false){
  const skill=SKILL[level]||SKILL.sport;
  return skill.error*(1+(1-character.consistency)*1.7)*(1+pressure*.65)*(wet?1.6:1);
}

export class RiderAI{
  constructor(track,options,seed){this.track=track;this.options=options;this.seed=seed;this.skill=SKILL[options.difficulty]||SKILL.sport;this.driving=botDriving(options.difficulty);}
  attach(bot,index){
    const random=seededRandom(this.seed+':'+index),character={...RIDER_CHARACTERS[index%RIDER_CHARACTERS.length]};
    bot.character=character;bot.ai={index,random,decisionAt:0,launchAt:.08+random()*this.skill.reaction,confidence:1,pressure:0,
      intent:'follow',intentUntil:0,targetId:null,desiredOffset:bot.offset,targetSpeed:0,brakeJitter:0,
      lineVariation:(random()-.5)*.55,mistake:null,mistakeUntil:0,mistakeAt:-10,wasBraking:false,defendedAgainst:null,stuckTime:0,backingUntil:0,
      startLane:bot.offset,formationUntil:4.5,
      strengths:{corner:.94+random()*.12,drive:.92+random()*.16,top:.98+random()*.04,braking:.94+random()*.12},
      sectorPace:Array.from({length:12},()=>.96+random()*.08)};
    bot.lateralSpeed=0;bot.crash=0;bot.invulnerable=0;bot.travel=0;bot.brake=0;bot.pitch=0;bot.throttle=0;bot.acceleration=0;bot.offtrackEvents=0;
    const p=this.track.sample(bot.progress,bot.offset);Object.assign(bot,{x:p.x,z:p.z,y:p.y||0,heading:p.yaw,angle:0});
  }
  restart(bot,time){
    if(!bot.ai)return;
    Object.assign(bot.ai,{decisionAt:time,launchAt:time+.08+bot.ai.random()*this.skill.reaction,intent:'follow',intentUntil:time,
      targetId:null,mistake:null,mistakeUntil:0,desiredOffset:bot.offset,wasBraking:false,stuckTime:0,backingUntil:0,startLane:bot.offset,formationUntil:time+4.5});
    bot.reversing=false;bot.lateralSpeed=0;bot.impactVX=bot.impactVZ=bot.impactYaw=0;
  }
  perceive(bot,riders){
    const visible=[];
    for(const other of riders){
      if(other===bot||other.finishTime!==null||other.dnf)continue;
      const distance=gap(other.progress,bot.progress,this.track.length);
      if(distance>-35&&distance<Math.max(65,bot.speed*1.8))visible.push({rider:other,distance});
    }
    return visible;
  }
  decide(bot,riders,time,underFlag){
    const ai=bot.ai,c=bot.character,tr=this.track,visible=this.perceive(bot,riders),width=tr.halfWidth-.8;
    const bend=tr.sample(bot.progress+Math.max(12,bot.speed*.3)).k,entry=tr.sample(bot.progress+Math.max(50,bot.speed*1.3)).k;
    const apex=Math.tanh(bend*145),approachBend=Math.tanh(entry*155);
    let desired=clamp(apex*2.5-approachBend*1.6+ai.lineVariation,-width*.65,width*.65);
    const launching=time<ai.formationUntil;
    if(launching)desired=ai.startLane;
    const ahead=visible.filter(o=>o.distance>0&&Math.abs(o.rider.offset-bot.offset)<1.5).sort((a,b)=>a.distance-b.distance)[0];
    const behind=visible.filter(o=>o.distance<0&&!o.rider.crash).sort((a,b)=>b.distance-a.distance)[0];
    ai.pressure=approach(ai.pressure,behind&&behind.distance>-20?1:ahead&&ahead.distance<15?.6:0,.10);
    ai.confidence=Math.min(1,ai.confidence+.004);
    let speedLimit=Infinity;
    if(ai.intentUntil<=time||underFlag||ai.intent==='rejoin')ai.intent='follow';
    if(ahead&&(ahead.rider.crash||ahead.rider.speed<1)&&ahead.distance<Math.max(35,bot.speed*(.8+this.skill.precision*1.1))){
      const preferred=Math.sign(bot.offset-ahead.rider.offset)||(bot.id<ahead.rider.id?-1:1);
      const escape=[-1,1].map(side=>({side,offset:clamp(ahead.rider.offset+side*2.0,-width,width)}))
        .filter(p=>Math.abs(p.offset-ahead.rider.offset)>1.5)
        .map(p=>({...p,room:visible.reduce((room,o)=>Math.abs(o.distance-ahead.distance)<6?Math.min(room,Math.abs(o.rider.offset-p.offset)):room,20)}))
        .sort((a,b)=>(b.room+(b.side===preferred?.2:0))-(a.room+(a.side===preferred?.2:0)));
      ai.intent='avoid';desired=escape[0]?.offset??clamp(ahead.rider.offset-preferred*2.0,-width,width);
      if(Math.abs(bot.offset-ahead.rider.offset)<1.55)speedLimit=Math.max(ahead.distance>2.6?1.2:0,Math.sqrt(2*this.driving.braking*Math.max(0,ahead.distance-5)));
    }
    else if(Math.abs(bot.offset)>tr.halfWidth-.25){ai.intent='rejoin';desired=clamp(bot.offset,-width+.7,width-.7);speedLimit=15;}
    else if(!launching&&!underFlag&&ahead&&!ahead.rider.crash&&ahead.distance<Math.max(16,bot.speed*.9)&&bot.speed>ahead.rider.speed+.5){
      const passingRoom=1.15+c.courtesy*.65;
      const candidates=[ahead.rider.offset-passingRoom,ahead.rider.offset+passingRoom]
        .filter(x=>Math.abs(x)<width)
        .map(offset=>({offset,room:visible.reduce((score,o)=>Math.abs(o.distance)<11?Math.min(score,Math.abs(o.rider.offset-offset)):score,20)}))
        .filter(p=>p.room>.65+c.courtesy*.30);
      if(candidates.length){
        if(ai.intent!=='pass'||ai.targetId!==ahead.rider.id){
          candidates.sort((a,b)=>(b.room-Math.abs(b.offset-desired)*(.15+c.aggression*.10))-(a.room-Math.abs(a.offset-desired)*(.15+c.aggression*.10)));
          ai.passOffset=candidates[0].offset;ai.targetId=ahead.rider.id;ai.intentUntil=time+1.2+ai.random()*1.6;
        }
        ai.intent='pass';desired=ai.passOffset;
      }else{ai.intent='follow';speedLimit=Math.max(0,ahead.rider.speed+(ahead.distance-(3+c.courtesy*5))*.7);}
    }else if(ai.intent==='pass'&&ai.intentUntil>time){
      desired=ai.passOffset;
      const target=visible.find(o=>o.rider.id===ai.targetId);
      if(!target||target.distance<-6){ai.intent='follow';ai.intentUntil=time;}
    }else if(!launching&&!underFlag&&behind&&behind.distance>-24&&behind.distance<-4&&Math.abs(entry)>.003&&c.aggression>.65&&ai.defendedAgainst!==behind.rider.id){
      ai.intent='defend';ai.intentUntil=time+2.0;ai.defendOffset=clamp(Math.sign(entry)*(1+c.aggression),-width,width);ai.defendedAgainst=behind.rider.id;desired=ai.defendOffset;
    }else if(ai.intent==='defend'&&ai.intentUntil>time)desired=ai.defendOffset;
    if(!behind||behind.distance<-32)ai.defendedAgainst=null;

    if(ahead&&!ahead.rider.crash&&ahead.rider.speed>=1&&Math.abs(ahead.rider.offset-bot.offset)<1.0){
      // Passing is not complete just because a lane was selected. Until the
      // bike has moved clear, a precise rider keeps a real braking margin.
      const safety=2.2+this.skill.precision*1.5+c.courtesy;
      const cap=Math.sqrt(ahead.rider.speed**2+2*this.driving.braking*Math.max(0,ahead.distance-safety));
      speedLimit=Math.min(speedLimit,cap+(1-this.skill.precision)*3);
    }

    // Respect riders already alongside. Assertive riders hold their lane and
    // leave a smaller margin; courteous riders lift and actively open space.
    for(const other of visible){
      const predicted=other.distance+(other.rider.speed-bot.speed)*(.35+c.courtesy*.45);
      const lateral=other.rider.offset-bot.offset,margin=.80+c.courtesy*.75;
      if(this.skill.precision>.9&&Math.abs(other.distance)<4&&Math.abs(lateral)>.4&&
          (desired-bot.offset)*lateral>0&&Math.abs(desired-bot.offset)>Math.abs(lateral)-.75){
        desired=other.rider.offset-Math.sign(lateral)*1.0;
      }
      if(Math.abs(predicted)>3.2||Math.abs(lateral)>margin)continue;
      if(other.rider.crash){desired=clamp(other.rider.offset+(Math.sign(bot.offset-other.rider.offset)||1)*2,-width,width);speedLimit=Math.min(speedLimit,Math.max(5,bot.speed-10));ai.intent='avoid';}
      else if(c.courtesy>.55&&!(ai.intent==='avoid'&&other.rider.speed<1&&other.distance>0)){
        desired=clamp(other.rider.offset+(Math.sign(bot.offset-other.rider.offset)||(bot.id<other.rider.id?-1:1))*margin,-width,width);
        if(predicted>-.5)speedLimit=Math.min(speedLimit,Math.max(0,other.rider.speed-1.3));ai.intent='yield';
      }else if(c.courtesy<=.55&&Math.abs(other.distance)<2.5){desired=bot.offset;ai.intent='hold';}
    }
    if(underFlag&&ahead&&ahead.distance<12)speedLimit=Math.min(speedLimit,Math.max(0,ahead.rider.speed+(ahead.distance-4)*.8));
    // Reserve lateral space for riders whose longitudinal paths are about to
    // overlap. This prevents a large field from converging on the same apex;
    // a blocked pass becomes a lift, then another attempt when a gap opens.
    let laneMin=-width,laneMax=width;
    for(const other of visible){
      const horizon=.35+1.25*this.skill.precision**3,future=other.distance+((other.rider.reversing?-1:1)*other.rider.speed-bot.speed)*horizon;
      const closest=other.distance*future<=0?0:Math.min(Math.abs(other.distance),Math.abs(future));
      if(closest>3.5||other.rider.crash)continue;
      const crossingBehind=other.distance>4&&['pass','avoid'].includes(ai.intent)&&
        (desired-other.rider.offset)*(bot.offset-other.rider.offset)<0;
      if(crossingBehind)continue;
      const lateral=other.rider.offset-bot.offset,clearance=.92+c.courtesy*.22+Math.abs(bot.lean||0)*.12;
      const side=Math.sign(lateral)||(bot.id<other.rider.id?1:-1);
      if(side>0)laneMax=Math.min(laneMax,other.rider.offset-clearance);
      else laneMin=Math.max(laneMin,other.rider.offset+clearance);
    }
    if(laneMin<=laneMax)desired=clamp(desired,laneMin,laneMax);
    else{
      desired=bot.offset;
      const blockedAhead=visible.some(o=>o.distance>0&&o.distance<3.5&&Math.abs(o.rider.offset-bot.offset)<1.0);
      if(blockedAhead){speedLimit=Math.min(speedLimit,Math.max(0,bot.speed-3));ai.intent='yield';}
      else ai.intent='hold';
    }
    const brakeShift=-c.brakeBias*bot.speed*.65+ai.brakeJitter;
    const sector=Math.floor(((bot.progress%tr.length)+tr.length)%tr.length/tr.length*12);
    const pace=this.driving.pace*(1-paceRank(ai.index)*this.driving.spread)*(1-(1-ai.confidence)*.045)
      *ai.strengths.corner*ai.sectorPace[sector];
    const wet=this.options.weather==='rain',grip=wet?.74:1;
    let target=tr.targetSpeed(bot.progress+brakeShift,grip*1.03,pace,this.driving.planningBrake,Math.max(180,bot.speed*7));
    const bike=bot.bike||this.options.bike||DEFAULT_BIKE,budget=tyreGrip(bike,this.options.weather);
    const cornerMargin=this.options.difficulty==='pro'?.96:this.options.difficulty==='rookie'?.78:.89;
    const planningBrake=Math.min(this.driving.planningBrake,14.6*(bike.braking??1)*budget.grip*.82);
    const physicalTarget=tr.targetSpeed(bot.progress+Math.min(0,brakeShift*.22),budget.lateral*cornerMargin**2/(9.81*1.43),1,planningBrake,Math.max(180,bot.speed*7));
    target=Math.min(target,physicalTarget);
    const braking=bot.speed>target+1;
    if(braking&&!ai.wasBraking&&time>6&&time-ai.mistakeAt>6){
      ai.brakeJitter=(ai.random()-.5)*(1-this.skill.precision)*bot.speed*.8;
      ai.lineVariation=(ai.random()-.5)*(1-this.skill.precision)*1.1;
      if(!underFlag&&this.options.aiMistakes!==false&&ai.random()<mistakeProbability(this.options.difficulty,c,ai.pressure,wet)*(this.options.mode==='qualifying'?.2:1)){
        const roll=ai.random();ai.mistake=roll<.57?'late':roll<.85?'hesitate':'traction';ai.mistakeAt=time;ai.mistakeUntil=time+1.1+ai.random()*1.5;
      }
    }
    ai.wasBraking=braking;
    if(time>ai.mistakeUntil)ai.mistake=null;
    if(ai.mistake==='late'){target=Math.min(bike.top/3.6,target+3+c.aggression*4);desired+=Math.sign(bend||entry)*(1+c.aggression)*-1;}
    if(ai.mistake==='hesitate')target*=.80;
    const lapper=visible.find(o=>o.distance<0&&o.distance>-45&&o.rider.progress>bot.progress+tr.length*.75&&o.rider.speed>bot.speed+2);
    if(lapper&&!underFlag){ai.intent='blue-yield';desired=(bot.offset>=lapper.rider.offset?1:-1)*width*.72;target=Math.min(target,lapper.rider.speed*.80);}
    if(this.options.mode==='qualifying'&&!bot.timedLap){
      target*=.80;
      const fast=visible.filter(o=>o.distance<0&&o.distance>-50&&o.rider.timedLap).sort((a,b)=>b.distance-a.distance)[0];
      if(fast){desired=(fast.rider.offset>0?-1:1)*(width-.5);target=Math.min(target,Math.max(12,fast.rider.speed*.72));ai.intent='yield';}
    }
    ai.desiredOffset=clamp(desired,-width,width);ai.targetSpeed=Math.min(target,speedLimit,underFlag?(ai.cautionLimit??25):Infinity);
    ai.decisionAt=time+this.skill.reaction*(.8+ai.random()*.45);
    bot.intent=ai.intent;
  }
  update(bot,riders,dt,time,control,onFall){
    const ai=bot.ai,tr=this.track;if(!ai)return;
    if(bot.finishTime!==null||bot.crash>0||bot.dnf)return;
    bot.invulnerable=Math.max(0,(bot.invulnerable||0)-dt);
    const underRed=control.flag==='red',underFlag=underRed||control.flag==='vsc'||control.flag==='yellow'&&control.applies(bot,tr);
    ai.cautionLimit=control.cautionLimit?.(bot,tr)??(underFlag?25:Infinity);
    if(underRed){ai.intent='stop';ai.mistake=null;ai.stuckTime=0;ai.backingUntil=0;bot.intent='stop';}
    else if(time>=ai.decisionAt)this.decide(bot,riders,time,underFlag);
    ai.stuckTime=bot.speed<.3&&['yield','hold','avoid'].includes(ai.intent)?ai.stuckTime+dt:0;
    if(ai.stuckTime>1.5){
      const blockedBehind=this.perceive(bot,riders).some(o=>o.distance<0&&o.distance>-4&&Math.abs(o.rider.offset-bot.offset)<1.0);
      if(!blockedBehind)ai.backingUntil=time+1.6;
      ai.stuckTime=0;
    }
    if(time<ai.backingUntil){
      // At walking speed a trapped rider pushes back to make turning room.
      bot.reversing=true;bot.speed=.8;bot.progress-=bot.speed*dt;bot.travel-=bot.speed*dt;
      bot.offset+=clamp(ai.desiredOffset-bot.offset,-.30,.30)*dt;
      const q=tr.sample(bot.progress,bot.offset);Object.assign(bot,{x:q.x,z:q.z,y:q.y||0,heading:q.yaw,angle:0,lean:0,brake:0,pitch:0,intent:'backoff'});return;
    }
    bot.reversing=false;
    bot.slipstream=!underFlag&&this.perceive(bot,riders).some(o=>o.distance>3&&o.distance<32&&Math.abs(o.rider.offset-bot.offset)<1.6&&!o.rider.crash);
    const bike=bot.bike||this.options.bike||DEFAULT_BIKE;
    const off=Math.max(0,Math.abs(bot.offset)-tr.halfWidth),surface=1-.57*clamp(off/3,0,1);
    const budget=tyreGrip(bike,this.options.weather,surface);
    const top=Math.min(bike.top,this.driving.top-paceRank(ai.index)*this.driving.topSpread)/3.6*(bot.slipstream?1.035:1);
    let target=underRed?0:Math.min(ai.targetSpeed,top,underFlag?Math.max(0,ai.cautionLimit-.65):Infinity,off>1?Math.max(7,18-off*2):Infinity,bot.serviceGuide?.speed??Infinity);
    if(underFlag&&!underRed){
      const ahead=this.perceive(bot,riders).filter(o=>o.distance>0&&o.distance<55&&!o.rider.crash&&o.rider.speed>5).sort((a,b)=>a.distance-b.distance)[0];
      if(ahead)target=Math.min(target,Math.max(0,ahead.rider.speed+(ahead.distance-6)*.65));
    }
    const previous=bot.progress,oldSpeed=bot.speed;
    const physicalDrive=Math.min(11.2*(bike.accel??1),bike.power*735.5*.86/((bike.mass??230)*Math.max(12,bot.speed)));
    const brakeLimit=Math.min(budget.traction*.91,14.6*(bike.braking??1)*budget.grip*surface);
    let propulsion=0,braking=0;
    if(underRed){
      bot.redBrakeForce=approach(bot.redBrakeForce||0,Math.min(8,brakeLimit),dt*6);
      braking=bot.redBrakeForce;
    }else if(bot.speed>target+.3){
      bot.brake=approach(bot.brake,1,dt*4.5);braking=brakeLimit*bot.brake;
    }else if(time>=ai.launchAt){
      bot.brake=approach(bot.brake,0,dt*6);
      propulsion=Math.min(physicalDrive,(this.driving.acceleration-3.8*bot.speed/Math.max(1,top))*ai.strengths.drive)*(bot.slipstream?1.06:1);
      if(bot.speed>=target)propulsion=0;
    }
    if(underRed)bot.brake=braking/Math.max(1,brakeLimit);
    const road=tr.sample(bot.progress),drag=.18+(bike.aeroDrag??.001)*bot.speed**2*(bot.slipstream?.80:1)+(propulsion?0:.55+.009*bot.speed);
    const gravel=off>0?(.35+bot.speed*.25+bot.speed**2*.017)*clamp(off/3,0,1):0;
    bot.speed=clamp(bot.speed+(propulsion-braking-drag-gravel-9.81*(road.grade||0)*Math.cos(bot.angle||0))*dt,0,top);
    bot.acceleration=(bot.speed-oldSpeed)/dt;bot.pitch=approach(bot.pitch,clamp(-bot.acceleration*.0045,-.048,.065),dt*.3);
    bot.throttle=propulsion>0?1:0;
    const lookahead=Math.max(9,Math.min(55,bot.speed*.72));
    const aim=bot.serviceGuide?.point||tr.sample(bot.progress+lookahead,bot.serviceGuide?.offset??ai.desiredOffset);
    const error=wrapAngle(Math.atan2(aim.x-bot.x,aim.z-bot.z)-bot.heading);
    const requestedTurn=2*bot.speed*Math.sin(error)/lookahead;
    const available=availableCornerForce(budget,propulsion-braking);
    const turnLimit=available/Math.max(3,bot.speed),turn=clamp(requestedTurn,-turnLimit,turnLimit);
    const mid=bot.heading+turn*dt*.5;
    const vx=Math.sin(mid)*bot.speed+(bot.impactVX||0),vz=Math.cos(mid)*bot.speed+(bot.impactVZ||0);
    bot.x+=vx*dt;bot.z+=vz*dt;bot.heading=wrapAngle(bot.heading+(turn+(bot.impactYaw||0))*dt);
    const projected=tr.project?tr.project(bot.x,bot.z,previous):{progress:bot.z,offset:bot.x};
    bot.progress=projected.progress;bot.offset=projected.offset;bot.travel+=bot.speed*dt;
    const q=tr.sample(bot.progress);bot.y=q.y||0;bot.angle=wrapAngle(bot.heading-q.yaw);
    bot.lateralSpeed=bot.speed*Math.sin(bot.angle);bot.turnRate=turn;
    bot.lean=approach(bot.lean,Math.atan(turn*bot.speed/9.81),dt*4);
    bot.usedLateralForce=Math.abs(turn*bot.speed);bot.availableLateralForce=available;
    bot.impactVX=(bot.impactVX||0)*Math.exp(-dt*3.5);bot.impactVZ=(bot.impactVZ||0)*Math.exp(-dt*3.5);bot.impactYaw=(bot.impactYaw||0)*Math.exp(-dt*5);
    if(off>.7&&!bot.wasOfftrack){bot.offtrackEvents++;bot.wasOfftrack=true;}
    if(off<.2)bot.wasOfftrack=false;
    if(off>1){ai.intent='rejoin';bot.intent='rejoin';ai.desiredOffset=clamp(bot.offset,-tr.halfWidth*.55,tr.halfWidth*.55);}
    if(ai.mistake==='traction'&&time-ai.mistakeAt>.6&&Math.abs(q.k)>.003&&bot.speed>14&&!underFlag){
      ai.mistake=null;ai.confidence=.65;onFall(bot,{kind:bot.brake>.3?'lowside':'highside',closingSpeed:0,deltaV:2+bot.speed*.04});
    }
    const finish=tr.length*this.options.laps;
    if(!underRed&&bot.progress>=finish&&bot.crash<=0){bot.finishTime=time-dt+clamp((finish-previous)/Math.max(.001,bot.progress-previous),0,1)*dt;bot.progress=finish;bot.speed=0;}
  }
}
