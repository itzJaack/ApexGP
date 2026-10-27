import {clamp,lerp,mod,wrapAngle} from './simulation.js';

const GREEN=[.22,.95,.58],YELLOW=[1,.81,.18],ORANGE=[1,.39,.08],RED=[1,.14,.22];
const MAX_MARKERS=80,FLOATS_PER_MARKER=288;
function bendCost(a,b,c){
  const ab=Math.hypot(b.x-a.x,b.z-a.z),bc=Math.hypot(c.x-b.x,c.z-b.z),ac=Math.hypot(c.x-a.x,c.z-a.z);
  const curvature=2*((b.x-a.x)*(c.z-a.z)-(b.z-a.z)*(c.x-a.x))/Math.max(.01,ab*bc*ac);
  return curvature*curvature*(ab+bc)*.5;
}
export function racingLineColor(urgency){
  const u=clamp(urgency,0,1),stops=[GREEN,YELLOW,ORANGE,RED],f=u*3,i=Math.min(2,Math.floor(f));
  return stops[i].map((v,k)=>lerp(v,stops[i+1][k],f-i));
}

// Cache the route and a closed-lap braking envelope. Only the short section
// ahead of the rider is forecast and uploaded while driving, in either view.
export class RacingLine{
  constructor(track){
    this.track=track;this.count=Math.ceil(track.length/5);this.step=track.length/this.count;
    this.spacing=track.length/Math.ceil(track.length/6);this.samples=[];this.markers=[];
    this.pool=Array.from({length:MAX_MARKERS},()=>({color:[0,0,0]}));
    this.vertices=new Float32Array(MAX_MARKERS*FLOATS_PER_MARKER);
    this.smoothed=new Float32Array(Math.ceil(track.length/6)).fill(-1);
    this.geometry={data:this.vertices.subarray(0,0)};this.profileKey='';this.runId=null;
    this.buildRoute();
  }
  buildRoute(){
    const n=this.count,turn=new Float64Array(n),offsets=new Float64Array(n),lane=Math.max(0,this.track.halfWidth-1.6);
    for(let i=0;i<n;i++){
      const s=i*this.step,k=(this.track.sample(s-8).k+2*this.track.sample(s).k+this.track.sample(s+8).k)/4;
      turn[i]=clamp(k*115,-1,1);
    }
    // The wider curvature window moves entry/exit to the outside while the
    // local peak brings the route towards the apex. Circular filtering keeps
    // chicanes and the start/finish seam continuous.
    const span=Math.ceil(75/this.step);
    for(let i=0;i<n;i++){
      let broad=0,weight=0;
      for(let j=-span;j<=span;j++){const w=1-Math.abs(j)/(span+1);broad+=turn[mod(i+j,n)]*w;weight+=w;}
      offsets[i]=clamp((2.3*turn[i]-1.4*broad/weight)*lane,-lane,lane);
    }
    for(let pass=0;pass<8;pass++){
      const next=offsets.slice();
      for(let i=0;i<n;i++)next[i]=(offsets[mod(i-1,n)]+2*offsets[i]+offsets[(i+1)%n])/4;
      offsets.set(next);
    }
    const centers=Array.from({length:n},(_,i)=>this.track.sample(i*this.step));
    const move=(i,offset)=>({...centers[i],x:centers[i].x+Math.cos(centers[i].yaw)*offset,z:centers[i].z-Math.sin(centers[i].yaw)*offset,offset});
    for(let i=0;i<n;i++)this.samples.push(move(i,offsets[i]));
    // Relax the seed against actual route curvature, rather than just moving
    // inside every bend. This opens the radius of tight apexes while every
    // candidate remains inside the road's safety margin. Done once per track.
    for(let pass=0;pass<90;pass++){
      const delta=pass<50?.22:pass<75?.12:.06;
      for(let j=0;j<n;j++){
        const i=pass%2?n-1-j:j,original=this.samples[i];
        const cost=()=>bendCost(this.samples[mod(i-2,n)],this.samples[mod(i-1,n)],this.samples[i])+bendCost(this.samples[mod(i-1,n)],this.samples[i],this.samples[(i+1)%n])+bendCost(this.samples[i],this.samples[(i+1)%n],this.samples[(i+2)%n]);
        let best=original,bestCost=cost();
        for(const direction of[-1,1]){
          const candidate=move(i,clamp(original.offset+direction*delta,-lane,lane));this.samples[i]=candidate;
          const value=cost();if(value<bestCost){best=candidate;bestCost=value;}
        }
        this.samples[i]=best;
      }
    }
    const point=s=>this.point(s);
    for(let i=0;i<n;i++){
      const p=this.samples[i],a=point(i*this.step-10),b=point(i*this.step+10),next=this.samples[(i+1)%n];
      p.yaw=Math.atan2(b.x-a.x,b.z-a.z);p.distance=Math.hypot(next.x-p.x,next.z-p.z);
    }
    for(let i=0;i<n;i++){
      const p=this.samples[i],a=this.samples[mod(i-2,n)],b=this.samples[(i+2)%n];
      const distance=Math.hypot(p.x-a.x,p.z-a.z)+Math.hypot(b.x-p.x,b.z-p.z);
      p.curvature=Math.max(Math.abs(wrapAngle(b.yaw-a.yaw))/Math.max(1,distance),Math.abs(p.k)*.82);
    }
  }
  point(s){
    const f=mod(s,this.track.length)/this.step,i=Math.floor(f),a=this.samples[i],b=this.samples[(i+1)%this.count],t=f-i;
    return{x:lerp(a.x,b.x,t),y:lerp(a.y||0,b.y||0,t),z:lerp(a.z,b.z,t),yaw:a.yaw+wrapAngle(b.yaw-a.yaw)*t,offset:lerp(a.offset,b.offset,t),grade:lerp(a.grade||0,b.grade||0,t)};
  }
  ensureProfile(race){
    const bike=race.options.bike,weather=race.options.weather,control=race.control;
    const key=[bike.grip,bike.braking??1,bike.top,weather,control?.flag,control?.zone].join('|');
    if(key===this.profileKey)return;
    this.profileKey=key;this.smoothed.fill(-1);
    const grip=bike.grip*(weather==='rain'?.74:1),lean=(weather==='rain'?.92:1.12)*Math.pow(bike.grip,.075);
    const lateral=9.81*Math.min(grip*1.43,Math.tan(lean)*.90);
    this.braking=14.6*(bike.braking??1)*grip*.80;this.top=bike.top/3.6;
    this.limits=new Float64Array(this.count);this.speeds=new Float64Array(this.count);
    for(let i=0;i<this.count;i++){
      const p=this.samples[i],s=i*this.step;
      let limit=Math.min(this.top,Math.sqrt(lateral/Math.max(.0001,p.curvature)));
      if(control?.flag==='red')limit=0;
      else if(control?.flag==='vsc'||control?.flag==='yellow'&&control.applies({progress:s},this.track))limit=Math.min(limit,25);
      this.speeds[i]=this.limits[i]=limit;
    }
    // Two backward laps propagate the slowest corner across the lap boundary.
    for(let j=this.count*2-1;j>=0;j--){
      const i=j%this.count,p=this.samples[i],brake=Math.max(3,this.braking+9.81*(p.grade||0));
      this.speeds[i]=Math.min(this.speeds[i],Math.sqrt(this.speeds[(i+1)%this.count]**2+2*brake*p.distance));
    }
  }
  limitAt(s){
    const f=mod(s,this.track.length)/this.step,i=Math.floor(f),t=f-i;
    // Interpolating squared speed preserves the braking-distance envelope.
    return Math.sqrt(lerp(this.speeds[i]**2,this.speeds[(i+1)%this.count]**2,t));
  }
  demand(speed,s,distance=6){
    const target=this.limitAt(s),next=this.limitAt(s+distance);
    const p=this.samples[Math.floor(mod(s,this.track.length)/this.step)],brake=Math.max(3,this.braking+9.81*(p.grade||0));
    const required=Math.max(0,(speed*speed-next*next)/(2*distance));
    const overspeed=clamp((speed-target-1)/Math.max(4,target*.13),0,1);
    const slowing=clamp((required/brake-.08)/.92,0,1);
    const holding=next<Math.min(this.top*.97,target+.3)&&speed>target*.94?.29:0;
    return{urgency:Math.max(overspeed,slowing,holding),target,brake};
  }
  acceleration(speed,bike){
    const drive=Math.min(11.2*bike.accel,bike.power*735.5*.86/((bike.mass??230)*Math.max(12,speed)));
    return Math.max(.25,drive-.18-(bike.aeroDrag??.001)*speed*speed);
  }
  update(race,{dt=1/60,visible=true}={}){
    this.ensureProfile(race);
    const p=race.player,s=p.progress,speed=Math.max(0,p.speed),bike=race.options.bike;
    if(this.runId!==race.runId||Math.abs(s-(this.lastProgress??s))>80){this.smoothed.fill(-1);this.runId=race.runId;}
    this.lastProgress=s;
    const current=this.demand(speed,s),soon=this.demand(speed,s+Math.max(12,speed*1.1));
    const red=race.control?.flag==='red',vsc=race.control?.flag==='vsc',yellow=race.control?.flag==='yellow'&&race.control.applies(p,this.track);
    const action=red?'stop':current.urgency>.52?'brake':current.urgency>.16?'hold':soon.urgency>.52?'prepare':'accelerate';
    this.hint={action,target:current.target,urgency:current.urgency,flag:red?'red':vsc?'vsc':yellow?'yellow':null};
    this.markers.length=0;
    if(!visible){this.geometry.data=this.vertices.subarray(0,0);return this;}
    const horizon=clamp(100+speed*4.2,120,440),first=Math.floor(s/this.spacing)+1;
    let forecast=speed,previous=s,at=0;
    for(let i=0;i<MAX_MARKERS;i++){
      const station=(first+i)*this.spacing,distance=station-s;if(distance>horizon)break;
      const travel=station-previous,limit=this.limitAt(station),grade=this.samples[Math.floor(mod(station,this.track.length)/this.step)].grade||0;
      const brake=Math.max(3,this.braking+9.81*grade),underGas=Math.sqrt(forecast*forecast+2*this.acceleration(forecast,bike)*travel);
      forecast=underGas<=limit?underGas:Math.max(limit,Math.sqrt(Math.max(0,forecast*forecast-2*brake*travel)));
      const demand=this.demand(forecast,station,this.spacing),slot=mod(first+i,this.smoothed.length),old=this.smoothed[slot];
      const urgency=old<0?demand.urgency:lerp(old,demand.urgency,1-Math.exp(-clamp(dt,0,.1)*(demand.urgency>old?18:10)));
      this.smoothed[slot]=urgency;
      const marker=this.pool[i],q=this.point(station),color=racingLineColor(urgency);
      Object.assign(marker,q,{s:station,distance,urgency,target:demand.target,alpha:clamp(distance/5,0,1)*clamp((horizon-distance)/35,0,1)});
      for(let k=0;k<3;k++)marker.color[k]=color[k];
      this.markers.push(marker);at=this.writeChevron(at,marker);
      previous=station;
    }
    this.geometry.data=this.vertices.subarray(0,at);return this;
  }
  writeChevron(at,p){
    const c=Math.cos(p.yaw),s=Math.sin(p.yaw),data=this.vertices;
    const vertex=(x,z,color,height)=>{
      data[at++]=p.x+x*c+z*s;data[at++]=p.y+height+z*p.grade;data[at++]=p.z-x*s+z*c;
      data[at++]=0;data[at++]=1;data[at++]=0;
      for(let k=0;k<3;k++)data[at++]=color[k];data[at++]=14;data[at++]=p.alpha;data[at++]=0;
    };
    for(const outline of[true,false]){
      const w=outline?1.03:.78,tip=outline?1.25:1.04,tail=outline?-1.17:-1.02,thickness=outline?.78:.43,color=outline?[.035,.055,.065]:p.color;
      for(const sign of[-1,1]){
        const points=[[0,tip],[sign*w,tail+thickness],[sign*w,tail],[0,tip-thickness]];
        for(const i of[0,1,2,0,2,3])vertex(...points[i],color,outline?.075:.079);
      }
    }
    return at;
  }
}
