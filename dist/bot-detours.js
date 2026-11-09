import {penaltyRoutes} from './penalty-routes.js';
import {tyreGrip} from './tyre-grip.js';
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const wrap=v=>Math.atan2(Math.sin(v),Math.cos(v));

export function botOffset(index,s,track){
 return clamp(Math.sin(s*.005+index*2.37)*1.9+Math.tanh(track.sample(s+25).k*160)*1.4,-track.halfWidth+1.2,track.halfWidth-1.2);
}
function indexAt(values,value){let lo=0,hi=values.length-1;while(hi-lo>1){const mid=(lo+hi)>>1;if(values[mid]<=value)lo=mid;else hi=mid;}return lo;}
export function profilePose(profile,time,track,index){
 if(profile.previous&&time<=profile.anchorTime)return profilePose(profile.previous,time,track,index);
 const lo=indexAt(profile.times,Math.min(time,profile.duration)),hi=lo+1;
 const dt=clamp(time-profile.times[lo],0,profile.times[hi]-profile.times[lo]);
 const acceleration=(profile.speeds[hi]-profile.speeds[lo])/Math.max(.001,profile.times[hi]-profile.times[lo]);
 const distance=profile.speeds[lo]*dt+.5*acceleration*dt*dt;
 const total=profile.distances?profile.distances[hi]-profile.distances[lo]:profile.positions[hi]-profile.positions[lo];
 const u=clamp(distance/Math.max(.001,total),0,1),progress=profile.positions[lo]+(profile.positions[hi]-profile.positions[lo])*u;
 let q;
 if(profile.points){const a=profile.points[lo],b=profile.points[hi];q={x:a.x+(b.x-a.x)*u,z:a.z+(b.z-a.z)*u,y:a.y+(b.y-a.y)*u,yaw:a.yaw+wrap(b.yaw-a.yaw)*u};}
 else q=track.sample(progress,botOffset(index,progress,track));
 return{...q,progress,speed:Math.max(0,profile.speeds[lo]+acceleration*dt),service:profile.services?.find(s=>time>=s.start&&time<s.end)||null};
}
function speedAtPosition(profile,s){const i=indexAt(profile.positions,s),u=clamp((s-profile.positions[i])/(profile.positions[i+1]-profile.positions[i]||1),0,1);return profile.speeds[i]+(profile.speeds[i+1]-profile.speeds[i])*u;}

// A penalty changes only the future suffix of a bot's route. Every peer builds
// the same braking approach, physical detour and rejoin from a compact plan;
// the already travelled trajectory and its timestamps are preserved.
export function botDetours(base,plans,track,bike,index,weather){
 let profile=base;
 const grip=tyreGrip(bike,weather),braking=Math.min(9.5,grip.traction*.72);
 for(const plan of plans){
  if(plan.kind==='longlap')continue; // Obsolete plans from a pre-update host.
  const anchorIndex=profile.positions.findIndex(s=>s>=plan.anchor);
  if(anchorIndex<1||anchorIndex>=profile.positions.length-2)continue;
  const route=plan.kind==='yield'?null:penaltyRoutes(track)[plan.kind];
  const anchor=profile.positions[anchorIndex],exit=route?route.exit+plan.lap*track.length:plan.exit;
  const records=[];
  for(let i=0;i<=anchorIndex;i++){
   const s=profile.positions[i],q=profile.points?.[i]||track.sample(s,botOffset(index,s,track));
   records.push({...q,progress:s,cap:profile.speeds[i],time:profile.times[i]});
  }
  const add=(q,progress,cap,service=false)=>{const last=records.at(-1);if(Math.hypot(q.x-last.x,q.z-last.z)>.01)records.push({...q,progress,cap,service});};
  const entry=route?route.entry+plan.lap*track.length:plan.entry;
  for(let s=anchor+5;s<entry;s+=5){
   const blend=clamp((entry-s)/50,0,1),offset=botOffset(index,s,track)*(route?blend:1);
   add(track.sample(s,offset),s,speedAtPosition(base,s));
  }
  if(route){
   const steps=Math.ceil(route.length/4);
   const distances=[...Array.from({length:steps+1},(_,i)=>i/steps*route.length),...(plan.stopSeconds?[route.stopDistance]:[])].sort((a,b)=>a-b);
   for(const d of [...new Set(distances)]){
    const q=route.sample(d,plan.lap),stop=plan.stopSeconds&&Math.abs(d-route.stopDistance)<.001;
    add({...q,yaw:q.heading},q.progress,stop?0:route.speedAt(d),true);
    if(stop)records.push({...records.at(-1),cap:0,holdSeconds:plan.stopSeconds});
   }
  }else{
   for(let s=entry;s<=exit;s+=5)add(track.sample(s,botOffset(index,s,track)),s,plan.limit);
  }
  for(let s=exit+5;s<base.finish;s+=5){
   const blend=route?clamp((s-exit)/45,0,1):1;
   add(track.sample(s,botOffset(index,s,track)*blend),s,speedAtPosition(base,s));
  }
  add(track.sample(base.finish,botOffset(index,base.finish,track)),base.finish,base.speeds.at(-1));
  const n=records.length,positions=new Float64Array(n),speeds=new Float64Array(n),times=new Float64Array(n),distances=new Float64Array(n);
  for(let i=0;i<n;i++){const q=records[i];positions[i]=q.progress;speeds[i]=q.cap;if(i)distances[i]=distances[i-1]+Math.hypot(q.x-records[i-1].x,q.z-records[i-1].z);}
  for(let i=n-2;i>anchorIndex;i--)speeds[i]=Math.min(speeds[i],Math.sqrt(speeds[i+1]**2+2*braking*(distances[i+1]-distances[i])));
  for(let i=0;i<=anchorIndex;i++)times[i]=profile.times[i];
  for(let i=anchorIndex+1;i<n;i++){
   const distance=distances[i]-distances[i-1],acceleration=Math.min(grip.traction*.55,Math.max(2.5,(bike.accel||1)*7-3*speeds[i-1]/85));
   speeds[i]=Math.min(speeds[i],Math.sqrt(speeds[i-1]**2+2*acceleration*distance));
   times[i]=times[i-1]+(records[i].holdSeconds||2*distance/Math.max(.1,speeds[i-1]+speeds[i]));
  }
  const serviceStart=records.findIndex((q,i)=>i>anchorIndex&&q.service),serviceEnd=records.findIndex((q,i)=>i>serviceStart&&serviceStart>=0&&!q.service);
  const services=[...(profile.services||[])];
  if(serviceStart>=0)services.push({penaltyId:plan.penaltyId,kind:plan.kind,start:times[serviceStart],end:times[serviceEnd<0?n-1:serviceEnd-1]});
  profile={positions,speeds,times,distances,points:records,duration:times[n-1],finish:base.finish,services,previous:profile,anchorTime:profile.times[anchorIndex]};
 }
 return profile;
}
