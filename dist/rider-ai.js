import {botDriving} from './bot-driving.js';

const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const approach=(a,b,step)=>a+clamp(b-a,-step,step);
const gap=(a,b,length)=>((a-b+length*.5)%length+length)%length-length*.5;
export const RIDER_CHARACTERS=[
  {name:'attaccante',aggression:.90,courtesy:.20,brakeBias:.62,consistency:.78},
  {name:'prudente',aggression:.24,courtesy:.94,brakeBias:-.65,consistency:.90},
  {name:'opportunista',aggression:.70,courtesy:.52,brakeBias:.30,consistency:.73},
  {name:'difensore',aggression:.76,courtesy:.30,brakeBias:.08,consistency:.87},
  {name:'regolare',aggression:.40,courtesy:.78,brakeBias:-.30,consistency:.96},
  {name:'irruento',aggression:.97,courtesy:.12,brakeBias:.82,consistency:.60},
  {name:'calcolatore',aggression:.59,courtesy:.70,brakeBias:-.10,consistency:.94},
];
const SKILL={rookie:{reaction:.43,error:.070,precision:.48},sport:{reaction:.27,error:.027,precision:.78},pro:{reaction:.14,error:.004,precision:.96}};
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
      lineVariation:(random()-.5)*.55,mistake:null,mistakeUntil:0,mistakeAt:-10,wasBraking:false,defendedAgainst:null,stuckTime:0,backingUntil:0};
    bot.lateralSpeed=0;bot.crash=0;bot.invulnerable=0;bot.travel=0;bot.brake=0;bot.pitch=0;
    const p=this.track.sample(bot.progress,bot.offset);Object.assign(bot,{x:p.x,z:p.z,y:p.y||0,heading:p.yaw,angle:0});
  }
  restart(bot,time){
    if(!bot.ai)return;
    Object.assign(bot.ai,{decisionAt:time,launchAt:time+.08+bot.ai.random()*this.skill.reaction,intent:'follow',intentUntil:time,
      targetId:null,mistake:null,mistakeUntil:0,desiredOffset:bot.offset,wasBraking:false,stuckTime:0,backingUntil:0});
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
    const ahead=visible.filter(o=>o.distance>0&&Math.abs(o.rider.offset-bot.offset)<1.5).sort((a,b)=>a.distance-b.distance)[0];
    const behind=visible.filter(o=>o.distance<0&&!o.rider.crash).sort((a,b)=>b.distance-a.distance)[0];
    ai.pressure=approach(ai.pressure,behind&&behind.distance>-20?1:ahead&&ahead.distance<15?.6:0,.10);
    ai.confidence=Math.min(1,ai.confidence+.004);
    let speedLimit=Infinity;
    if(ai.intentUntil<=time||underFlag||ai.intent==='rejoin')ai.intent='follow';
    if(ahead&&(ahead.rider.crash||ahead.rider.speed<1)&&ahead.distance<Math.max(35,bot.speed*(.8+this.skill.precision*1.1))){
      const side=Math.sign(bot.offset-ahead.rider.offset)||(bot.id<ahead.rider.id?-1:1);
      ai.intent='avoid';desired=clamp(ahead.rider.offset+side*2.0,-width,width);
      if(Math.abs(bot.offset-ahead.rider.offset)<1.55)speedLimit=Math.max(ahead.distance>2.6?1.2:0,Math.sqrt(2*this.driving.braking*Math.max(0,ahead.distance-5)));
    }
    else if(Math.abs(bot.offset)>tr.halfWidth-.25){ai.intent='rejoin';desired=clamp(bot.offset,-width+.7,width-.7);speedLimit=15;}
    else if(!underFlag&&ahead&&!ahead.rider.crash&&ahead.distance<Math.max(16,bot.speed*.9)&&bot.speed>ahead.rider.speed+.5){
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
    }else if(!underFlag&&behind&&behind.distance>-24&&behind.distance<-4&&Math.abs(entry)>.003&&c.aggression>.65&&ai.defendedAgainst!==behind.rider.id){
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
    const brakeShift=-c.brakeBias*bot.speed*.65+ai.brakeJitter;
    const pace=this.driving.pace*(1-ai.index*this.driving.spread)*(1-(1-ai.confidence)*.045);
    const wet=this.options.weather==='rain',grip=wet?.74:1;
    let target=tr.targetSpeed(bot.progress+brakeShift,grip*1.03,pace,this.driving.planningBrake,Math.max(180,bot.speed*7));
    const braking=bot.speed>target+1;
    if(braking&&!ai.wasBraking&&time>6&&time-ai.mistakeAt>6){
      ai.brakeJitter=(ai.random()-.5)*(1-this.skill.precision)*bot.speed*.8;
      ai.lineVariation=(ai.random()-.5)*(1-this.skill.precision)*1.1;
      if(!underFlag&&this.options.aiMistakes!==false&&ai.random()<mistakeProbability(this.options.difficulty,c,ai.pressure,wet)){
        const roll=ai.random();ai.mistake=roll<.57?'late':roll<.85?'hesitate':'traction';ai.mistakeAt=time;ai.mistakeUntil=time+1.1+ai.random()*1.5;
      }
    }
    ai.wasBraking=braking;
    if(time>ai.mistakeUntil)ai.mistake=null;
    if(ai.mistake==='late'){target=Math.min(this.driving.top/3.6,target+6+c.aggression*4);desired+=Math.sign(bend||entry)*(1+c.aggression)*-1;}
    if(ai.mistake==='hesitate')target*=.80;
    ai.desiredOffset=clamp(desired,-width,width);ai.targetSpeed=Math.min(target,speedLimit,underFlag?25:Infinity);
    ai.decisionAt=time+this.skill.reaction*(.8+ai.random()*.45);
    bot.intent=ai.intent;
  }
  update(bot,riders,dt,time,control,onFall){
    const ai=bot.ai,tr=this.track;if(!ai)return;
    if(bot.finishTime!==null||bot.crash>0)return;
    bot.invulnerable=Math.max(0,(bot.invulnerable||0)-dt);
    const underFlag=control.flag==='vsc'||control.flag==='yellow'&&control.applies(bot,tr);
    if(time>=ai.decisionAt)this.decide(bot,riders,time,underFlag);
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
    const top=(this.driving.top-ai.index*this.driving.topSpread)/3.6,target=Math.min(ai.targetSpeed,top,underFlag?25:Infinity);
    const oldSpeed=bot.speed;
    if(time<ai.launchAt&&bot.speed<.05)bot.speed=0;
    else if(bot.speed<target)bot.speed=Math.min(target,bot.speed+(this.driving.acceleration-3.8*bot.speed/top)*dt);
    else bot.speed=Math.max(target,bot.speed-this.driving.braking*(this.options.weather==='rain'?.78:1)*dt);
    bot.brake=clamp((oldSpeed-bot.speed)/dt/this.driving.braking,0,1);bot.pitch=approach(bot.pitch,clamp((oldSpeed-bot.speed)/dt*.004,-.04,.065),dt*.3);
    let desired=ai.desiredOffset;
    const lateralLimit=Math.min(3.2,bot.speed*(bot.speed<8?.75:.22)),wanted=clamp((desired-bot.offset)*(this.driving.response*.75),-lateralLimit,lateralLimit);
    bot.lateralSpeed=approach(bot.lateralSpeed,wanted,dt*(2.3+this.skill.precision*1.4));
    bot.offset+=bot.lateralSpeed*dt;
    const previous=bot.progress,road=tr.sample(bot.progress);
    bot.offset+=((bot.impactVX||0)*road.tz-(bot.impactVZ||0)*road.tx)*dt;
    bot.progress+=(bot.speed+(bot.impactVX||0)*road.tx+(bot.impactVZ||0)*road.tz)*dt;bot.travel+=bot.speed*dt;
    bot.yawKick=((bot.yawKick||0)+(bot.impactYaw||0)*dt)*Math.exp(-dt*3);
    bot.impactVX=(bot.impactVX||0)*Math.exp(-dt*3.5);bot.impactVZ=(bot.impactVZ||0)*Math.exp(-dt*3.5);bot.impactYaw=(bot.impactYaw||0)*Math.exp(-dt*5);
    const q=tr.sample(bot.progress,bot.offset);bot.x=q.x;bot.z=q.z;bot.y=q.y||0;
    bot.angle=Math.atan2(bot.lateralSpeed,Math.max(3,bot.speed))+(bot.yawKick||0);bot.heading=q.yaw+bot.angle;
    bot.turnRate=q.k*bot.speed;bot.lean=approach(bot.lean,clamp(Math.atan(bot.speed*bot.speed*q.k/9.81),-1.12,1.12),dt*4);
    if(ai.mistake==='traction'&&time-ai.mistakeAt>.6&&Math.abs(q.k)>.003&&bot.speed>14&&!underFlag){
      ai.mistake=null;ai.confidence=.65;onFall(bot,{kind:bot.brake>.3?'lowside':'highside',closingSpeed:0,deltaV:2+bot.speed*.04});
    }
    const finish=tr.length*this.options.laps;
    if(bot.progress>=finish&&bot.crash<=0){bot.finishTime=time-dt+clamp((finish-previous)/Math.max(.001,bot.progress-previous),0,1)*dt;bot.progress=finish;bot.speed=0;}
  }
}
