// Local motorcycle impacts and an articulated, constrained rider. Metres,
// seconds and kilograms; world Y is up. The same rules apply to humans and AI.
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const length=v=>Math.hypot(...v);
const sub=(a,b)=>a.map((v,i)=>v-b[i]);
const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const unit=a=>{const l=length(a)||1;return a.map(v=>v/l);};
export const RIDER_JOINTS=[
  [0,.965,-.55],[0,1.195,.018],[0,1.278,.23],[0,1.36,.30],
  [-.187,1.195,.018],[-.318,1.035,.142],[-.313,.975,.354],
  [.187,1.195,.018],[.318,1.035,.142],[.313,.975,.354],
  [-.131,.965,-.53],[-.309,.648,-.025],[-.23,.402,-.406],
  [.131,.965,-.53],[.309,.648,-.025],[.23,.402,-.406],
];
export const RIDER_BONES=[[0,1],[1,2],[2,3],[1,4],[4,5],[5,6],[1,7],[7,8],[8,9],
  [0,10],[10,11],[11,12],[0,13],[13,14],[14,15]];
const BRACES=[[4,7],[10,13],[4,10],[7,13],[4,13],[7,10],[0,4],[0,7]];
const RADII=[.13,.14,.08,.15,.08,.065,.055,.08,.065,.055,.09,.075,.065,.09,.075,.065];
function bodyAxes(points){const x=unit(sub(points[7],points[4])),up=unit(sub(points[1],points[0])),z=unit(cross(x,up));return[x,unit(cross(z,x)),z];}
const REST_AXES=bodyAxes(RIDER_JOINTS);
const HINGES=[[4,5,6],[7,8,9],[10,11,12],[13,14,15]].map(([a,m,c])=>{
 const first=sub(RIDER_JOINTS[m],RIDER_JOINTS[a]),second=sub(RIDER_JOINTS[c],RIDER_JOINTS[m]),normal=unit(cross(first,second));
 return{a,m,c,l1:length(first),l2:length(second),normal:REST_AXES.map(axis=>dot(normal,axis))};
});

export function rotateVector(p,yaw=0,roll=0,pitch=0){
  const cp=Math.cos(pitch),sp=Math.sin(pitch),cr=Math.cos(roll),sr=Math.sin(roll),cy=Math.cos(yaw),sy=Math.sin(yaw);
  const x=p[0],y=p[1]*cp-p[2]*sp,z=p[1]*sp+p[2]*cp;
  return[(x*cr-y*sr)*cy+z*sy,x*sr+y*cr,-(x*cr-y*sr)*sy+z*cy];
}

function surface(track,x,z,progress){
  const projected=track.project(x,z,progress),q=track.sample(projected.progress);
  return{...q,progress:projected.progress,offset:projected.offset};
}
function groundHeight(road,x,z){return(road.y||0)+((x-road.x)*road.tx+(z-road.z)*road.tz)*(road.grade||0);}

export class RiderFall{
  constructor(rider,track,{kind='lowside',closingSpeed=0,normalX=0,normalZ=0,deltaV=0,spin=0,wet=false,velocity=null}={}){
    this.age=0;this.kind=kind;this.wet=wet;this.duration=clamp(4.2+Math.abs(rider.speed)*.045,4.5,8);
    const yaw=rider.heading||0,sign=Math.sign(rider.lean)||Math.sign(normalX*Math.cos(yaw)-normalZ*Math.sin(yaw))||1;
    const road=surface(track,rider.x,rider.z,rider.progress),vx=velocity?.[0]??Math.sin(yaw)*rider.speed+(rider.impactVX||0),vz=velocity?.[1]??Math.cos(yaw)*rider.speed+(rider.impactVZ||0);
    const launch=kind==='highside'||kind==='wheelie'?clamp(rider.speed*.10+deltaV*.22,1.6,6.5):closingSpeed>10?clamp((closingSpeed-10)*.16+deltaV*.12,0,5.2):0;
    const centre=rotateVector([0,.55,0],yaw,-(rider.lean||0),rider.pitch||0);
    this.bike={x:rider.x+centre[0],y:(road.y||0)+centre[1],z:rider.z+centre[2],vx,vy:launch*.42,vz,
      yaw,roll:-(rider.lean||sign*.10),pitch:rider.pitch||0,
      yawRate:clamp(spin,-4,4),rollRate:-sign*(1.6+Math.min(3,deltaV*.15)),pitchRate:launch>1?clamp(deltaV*.18+closingSpeed*.025,0,4):0};
    const pelvis=rotateVector(RIDER_JOINTS[0],yaw,-(rider.lean||0),rider.pitch||0);
    const rollSpin=rotateVector([0,0,-sign*(1.0+deltaV*.10)],yaw),pitchSpin=rotateVector([launch*.28+deltaV*.04,0,0],yaw);
    const omega=[rollSpin[0]+pitchSpin[0],spin*.55,rollSpin[2]+pitchSpin[2]];
    this.points=RIDER_JOINTS.map((rest,i)=>{
      const rotated=rotateVector(rest,yaw,-(rider.lean||0),rider.pitch||0);
      const rx=rotated[0]-pelvis[0],ry=rotated[1]-pelvis[1],rz=rotated[2]-pelvis[2];
      return{p:[rider.x+rotated[0],(road.y||0)+rotated[1],rider.z+rotated[2]],
        v:[vx+normalX*deltaV*.12+omega[1]*rz-omega[2]*ry,
          launch+(i===3?.25:0)+omega[2]*rx-omega[0]*rz,
          vz+normalZ*deltaV*.12+omega[0]*ry-omega[1]*rx],radius:RADII[i],weight:i===0?1/13:i===1?1/20:i===3?1/5:1/4};
    });
    this.links=[...RIDER_BONES,...BRACES].map(([a,b])=>({a,b,d:length(sub(RIDER_JOINTS[a],RIDER_JOINTS[b]))}));
    this.progress=rider.progress;this.offset=rider.offset;this.sign=sign;this.settled=false;
  }
  update(dt,track){
    this.age+=dt;const b=this.bike,road=surface(track,b.x,b.z,this.progress);
    this.progress=road.progress;this.offset=road.offset;
    b.vy-=9.81*dt;b.x+=b.vx*dt;b.y+=b.vy*dt;b.z+=b.vz*dt;
    b.yaw+=b.yawRate*dt;b.roll+=b.rollRate*dt;b.pitch+=b.pitchRate*dt;
    // Tyres are discs, not spheres or a large enclosing box. Body contacts
    // then take over as the motorcycle lands on a fairing or handlebar.
    let support=0;
    for(const z of [-.74,.74]){
      const centre=rotateVector([0,-.22,z],0,b.roll,b.pitch);
      support=Math.max(support,-centre[1]+.32*Math.abs(Math.cos(b.roll))+.065*Math.abs(Math.sin(b.roll)));
    }
    for(const [point,radius]of[[[.25,.10,.10],.08],[[-.25,.10,.10],.08],[[0,-.15,0],.23],[[0,.40,.55],.18],[[0,.42,-.55],.10]]){
      support=Math.max(support,radius-rotateVector(point,0,b.roll,b.pitch)[1]);
    }
    const ground=groundHeight(road,b.x,b.z)+support,off=Math.abs(road.offset)>track.halfWidth;
    if(b.y<ground){
      b.y=ground;if(b.vy<0)b.vy=Math.abs(b.vy)>1.2?-b.vy*.15:0;
      const speed=Math.hypot(b.vx,b.vz),friction=off?.78:this.wet?.30:.48,factor=Math.max(0,1-friction*9.81*dt/Math.max(.01,speed));
      b.vx*=factor;b.vz*=factor;b.yawRate*=Math.exp(-dt*2.3);
      b.rollRate=(b.rollRate+4.5*Math.sin(2*b.roll)*dt)*Math.exp(-dt*(speed<3?5:2.4));
      b.pitchRate=(b.pitchRate-3*Math.sin(2*b.pitch)*dt)*Math.exp(-dt*2.4);
    }else{b.vx*=Math.exp(-dt*.025);b.vz*=Math.exp(-dt*.025);}
    const previous=this.points.map(j=>j.p.slice());
    for(const j of this.points){j.v[1]-=9.81*dt;for(let k=0;k<3;k++)j.p[k]+=j.v[k]*dt;}
    // Keep torso dimensions and limb lengths; free elbows and knees articulate
    // under gravity and contact instead of playing a canned lateral offset.
    for(let iteration=0;iteration<7;iteration++){
      for(const link of this.links){
        const a=this.points[link.a],c=this.points[link.b],d=sub(c.p,a.p),l=length(d)||1,scale=(l-link.d)/l/(a.weight+c.weight);
        for(let k=0;k<3;k++){a.p[k]+=d[k]*scale*a.weight;c.p[k]-=d[k]*scale*c.weight;}
      }
      const axes=bodyAxes(this.points.map(j=>j.p));
      for(const hinge of HINGES){
        const p=this.points[hinge.a],middle=this.points[hinge.m],q=this.points[hinge.c],d=sub(q.p,p.p),l=length(d)||1,chord=d.map(v=>v/l);
        const min=Math.sqrt(hinge.l1**2+hinge.l2**2-2*hinge.l1*hinge.l2*Math.cos(.30)),max=(hinge.l1+hinge.l2)*.995;
        const distance=clamp(l,min,max);
        if(l!==distance)for(let k=0;k<3;k++){const correction=d[k]*(distance-l)/l*.5;p.p[k]-=correction;q.p[k]+=correction;}
        const normal=unit([0,1,2].map(k=>axes[0][k]*hinge.normal[0]+axes[1][k]*hinge.normal[1]+axes[2][k]*hinge.normal[2]));
        const bend=unit(cross(chord,normal)),along=(hinge.l1**2-hinge.l2**2+distance**2)/(2*distance),height=Math.sqrt(Math.max(0,hinge.l1**2-along**2));
        for(let k=0;k<3;k++)middle.p[k]+=(p.p[k]+chord[k]*along+bend[k]*height-middle.p[k])*.40;
      }
      for(const j of this.points)j.p[1]=Math.max(j.p[1],groundHeight(road,j.p[0],j.p[2])+j.radius);
    }
    let energy=0;
    for(let i=0;i<this.points.length;i++){
      const j=this.points[i],floor=groundHeight(road,j.p[0],j.p[2])+j.radius;
      for(let k=0;k<3;k++)j.v[k]=clamp((j.p[k]-previous[i][k])/dt,-110,110);
      if(j.p[1]<=floor+.004){
        if(j.v[1]<0)j.v[1]=0;
        const speed=Math.hypot(j.v[0],j.v[2]),friction=off?.95:this.wet?.42:.65,factor=Math.max(0,1-friction*9.81*dt/Math.max(.01,speed));
        j.v[0]*=factor;j.v[2]*=factor;
      }
      energy+=length(j.v);
    }
    this.settled=this.age>3&&energy/this.points.length<1.2&&Math.hypot(b.vx,b.vz)<1.5;
    return this.settled||this.age>=this.duration;
  }
  stop(){
    this.bike.vx=this.bike.vy=this.bike.vz=0;this.bike.yawRate=this.bike.rollRate=this.bike.pitchRate=0;
    for(const p of this.points)p.v.fill(0);
  }
}

function collider(r,index,before=false){
  const p=before?r.previousPose:r,heading=p?.heading??r.heading??0,at=[-.62,0,.62][index];
  const lean=r.fall?0:-Math.sin(p?.lean??r.lean??0)*.36;
  return{x:(p?.x??r.x)+Math.sin(heading)*at+Math.cos(heading)*lean,z:(p?.z??r.z)+Math.cos(heading)*at-Math.sin(heading)*lean};
}
export function sweptContact(a,b,dt){
  let best=null;const radius=(a.crash>0?.45:.34)+(b.crash>0?.45:.34);
  for(let i=0;i<3;i++)for(let j=0;j<3;j++){
    const ac=collider(a,i),bc=collider(b,j),ap=collider(a,i,true),bp=collider(b,j,true);
    const px=bp.x-ap.x,pz=bp.z-ap.z,vx=(bc.x-ac.x)-px,vz=(bc.z-ac.z)-pz;
    const qa=vx*vx+vz*vz,qb=2*(px*vx+pz*vz),qc=px*px+pz*pz-radius*radius;
    let time=qc<=0?0:Infinity;
    if(qc>0&&qa>1e-10){const d=qb*qb-4*qa*qc;if(d>=0)time=(-qb-Math.sqrt(d))/(2*qa);}
    if(time<0||time>1)continue;
    const dx=px+vx*time,dz=pz+vz*time,l=Math.hypot(dx,dz);
    const nx=l>1e-6?dx/l:Math.cos(a.heading||0),nz=l>1e-6?dz/l:-Math.sin(a.heading||0);
    const penetration=Math.max(0,radius-Math.hypot(bc.x-ac.x,bc.z-ac.z));
    const hit={time,nx,nz,penetration,x:ap.x+(ac.x-ap.x)*time+nx*radius*.5,z:ap.z+(ac.z-ap.z)*time+nz*radius*.5};
    if(!best||time<best.time||time===best.time&&penetration>best.penetration)best=hit;
  }
  return best;
}

export function riderVelocity(r){
  if(r.fall)return[r.fall.bike.vx,r.fall.bike.vz];
  const heading=r.heading||0,speed=r.reversing?-r.speed:r.speed;
  return[Math.sin(heading)*speed+(r.impactVX||0),Math.cos(heading)*speed+(r.impactVZ||0)];
}
function applyImpulse(r,dx,dz,spin){
  if(r.fall){r.fall.bike.vx+=dx;r.fall.bike.vz+=dz;r.fall.bike.yawRate+=spin;return;}
  const h=r.heading||0,forward=dx*Math.sin(h)+dz*Math.cos(h),side=dx*Math.cos(h)-dz*Math.sin(h);
  r.speed=Math.max(0,r.speed+forward);r.impactVX=(r.impactVX||0)+Math.cos(h)*side;r.impactVZ=(r.impactVZ||0)-Math.sin(h)*side;
  r.impactYaw=clamp((r.impactYaw||0)+spin,-4,4);
}

export class RiderContacts{
  constructor(){this.cooldowns=new Map();}
  update(riders,dt,time,track,onImpact){
    for(let i=0;i<riders.length;i++)for(let j=i+1;j<riders.length;j++){
      const a=riders[i],b=riders[j];if(a.finishTime!==null||b.finishTime!==null||a.dnf||b.dnf||a.invulnerable>0||b.invulnerable>0)continue;
      if(Math.hypot(a.x-b.x,a.z-b.z)>6+Math.max(a.speed,b.speed)*dt*2)continue;
      if(a.fall&&a.fall.bike.y-(a.y||0)>1.4||b.fall&&b.fall.bike.y-(b.y||0)>1.4)continue;
      const hit=sweptContact(a,b,dt);if(!hit)continue;
      const av=riderVelocity(a),bv=riderVelocity(b),relativeX=av[0]-bv[0],relativeZ=av[1]-bv[1];
      const closing=Math.max(0,relativeX*hit.nx+relativeZ*hit.nz),ma=a.mass||250,mb=b.mass||250;
      const impulse=closing*1.08/(1/ma+1/mb),ax=-hit.nx*impulse/ma,az=-hit.nz*impulse/ma,bx=hit.nx*impulse/mb,bz=hit.nz*impulse/mb;
      const inertiaA=ma*.42,inertiaB=mb*.42;
      const spinA=((hit.z-a.z)*ax-(hit.x-a.x)*az)*ma/inertiaA,spinB=((hit.z-b.z)*bx-(hit.x-b.x)*bz)*mb/inertiaB;
      applyImpulse(a,ax,az,spinA);applyImpulse(b,bx,bz,spinB);
      const push=Math.min(.40,hit.penetration*.65+.003),shareA=mb/(ma+mb),shareB=ma/(ma+mb);
      for(const [r,sign,share]of[[a,-1,shareA],[b,1,shareB]]){
        r.x+=hit.nx*push*sign*share;r.z+=hit.nz*push*sign*share;
        if(r.fall){r.fall.bike.x=r.x;r.fall.bike.z=r.z;}
        const projected=track.project(r.x,r.z,r.progress);r.progress=projected.progress;r.offset=projected.offset;
      }
      const key=i+':'+j,last=this.cooldowns.get(key)??-100;
      if(closing<.1&&hit.penetration<.04)continue;
      if(time-last<.65)continue;this.cooldowns.set(key,time);
      const common={kind:'contact',closingSpeed:closing,x:hit.x,z:hit.z};
      onImpact(a,b,{...common,deltaV:impulse/ma,normalX:-hit.nx,normalZ:-hit.nz,spin:spinA,velocity:[av[0]+ax,av[1]+az]},
        {...common,deltaV:impulse/mb,normalX:hit.nx,normalZ:hit.nz,spin:spinB,velocity:[bv[0]+bx,bv[1]+bz]});
    }
  }
}
