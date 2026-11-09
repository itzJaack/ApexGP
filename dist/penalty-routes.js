import {SCENERY_DATA} from './scenery-data.js';
import {terrainElevation} from './elevation.js';
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const mod=(v,n)=>(v%n+n)%n;
const cache=new WeakMap();
// Unnamed OSM pit roads, cross-checked against the circuit venue maps. Keep
// their mapped geometry instead of inventing a parallel lane at the finish.
const PIT_WAYS={buriram:['w677379784'],brno:['w184267642'],balaton:['w1259458777']};

export function projectAnywhere(track,x,z){
 let best=Infinity,station=0;
 for(let i=0;i<track.count;i+=3){const q=track.nodes[i],d=(q.x-x)**2+(q.z-z)**2;if(d<best){best=d;station=i*track.step;}}
 return track.project(x,z,station);
}

function joinConnected(primary,features){
 const points=primary.line.map(p=>p.slice()),used=new Set([primary.id]);
 for(let pass=0;pass<features.length;pass++){
  let best=null;
  for(const f of features){
   if(used.has(f.id))continue;
   for(const front of [false,true])for(const reverse of [false,true]){
    const line=reverse?f.line.slice().reverse():f.line;
    const a=front?line.at(-1):line[0],b=front?points[0]:points.at(-1),distance=Math.hypot(a[0]-b[0],a[1]-b[1]);
    if(distance<2&&(!best||distance<best.distance))best={f,line,front,distance};
   }
  }
  if(!best)break;
  if(best.front)points.unshift(...best.line.slice(0,-1));else points.push(...best.line.slice(1));
  used.add(best.f.id);
 }
 return{points,ids:[...used]};
}

export class PenaltyRoute{
 constructor(track,kind,points,sourceIds=[]){
  this.kind=kind;this.width=kind==='pit'?5:3.2;this.limit=kind==='pit'?60/3.6:80/3.6;
  this.sourceIds=sourceIds;this.approximate=!sourceIds.length;this.track=track;
  let first=projectAnywhere(track,...points[0]),last=projectAnywhere(track,...points.at(-1));
  if(mod(last.progress-first.progress,track.length)>track.length/2){points=points.slice().reverse();[first,last]=[last,first];}
  this.entry=mod(first.progress,track.length);
  this.exit=this.entry+mod(last.progress-first.progress,track.length);
  if(this.exit-this.entry<12)this.exit=this.entry+80;
  const start=track.sample(this.entry-28),end=track.sample(this.exit+24);
  this.entry-=28;this.exit+=24;
  points=[[start.x,start.z],...points,[end.x,end.z]];
  this.points=[];let length=0,near=this.entry;
  for(const [x,z] of points){
   const previous=this.points.at(-1);if(previous)length+=Math.hypot(x-previous.x,z-previous.z);
   const projection=track.project(x,z,near);near=Math.max(near,projection.progress);
   const road=track.sample(near),off=Math.abs(projection.offset);
   const raw=terrainElevation(track.config,x,z)-(track.elevationOffset||0);
   const y=track.config.terrainGrid?raw:road.y||0;
   const blend=clamp((off-track.halfWidth-1)/12,0,1);
   this.points.push({x,z,y:(road.y||0)*(1-blend)+y*blend,s:length,progress:near});
  }
  this.length=length;
  this.points[0].progress=this.entry;this.points.at(-1).progress=this.exit;
 }
 sample(distance,lap=0){
  const at=clamp(distance,0,this.length);let lo=0,hi=this.points.length-1;
  while(hi-lo>1){const mid=(lo+hi)>>1;if(this.points[mid].s<=at)lo=mid;else hi=mid;}
  const a=this.points[lo],b=this.points[hi],u=clamp((at-a.s)/(b.s-a.s||1),0,1);
  return{x:a.x+(b.x-a.x)*u,z:a.z+(b.z-a.z)*u,y:a.y+(b.y-a.y)*u,
   heading:Math.atan2(b.x-a.x,b.z-a.z),progress:a.progress+(b.progress-a.progress)*u+lap*this.track.length};
 }
 speedAt(distance){
  const a=this.sample(distance),b=this.sample(distance+5),c=this.sample(distance+10);
  const ab=Math.hypot(b.x-a.x,b.z-a.z),bc=Math.hypot(c.x-b.x,c.z-b.z),ac=Math.hypot(c.x-a.x,c.z-a.z);
  const curvature=2*Math.abs((b.x-a.x)*(c.z-a.z)-(b.z-a.z)*(c.x-a.x))/Math.max(.1,ab*bc*ac);
  return Math.min(this.limit,Math.sqrt(10/Math.max(.0001,curvature)));
 }
}

export function penaltyRoutes(track){
 if(cache.has(track))return cache.get(track);
 const roads=(SCENERY_DATA[track.config.id]?.features||[]).filter(f=>f.kind==='road'&&(f.tags.highway==='raceway'||PIT_WAYS[track.config.id]?.includes(f.id)));
 const longLap=roads.find(f=>/long.?lap/i.test(f.tags.name||''));
 const pits=roads.filter(f=>PIT_WAYS[track.config.id]?.includes(f.id)||/pit(?!ch)|boxen|boxengasse|corsia.*box/i.test(f.tags.name||'')&&!/long.?lap|pit straight|safety|stowe|maison blanche|supercars/i.test(f.tags.name||''));
 const origin=track.sample(0),mains=pits.filter(f=>PIT_WAYS[track.config.id]?.includes(f.id)||/^(pit ?lane|boxenstra.e|boxengasse|national pit lane|international pit lane)$/i.test(f.tags.name||''));
 mains.sort((a,b)=>Math.min(...a.line.map(p=>Math.hypot(p[0]-origin.x,p[1]-origin.z)))-Math.min(...b.line.map(p=>Math.hypot(p[0]-origin.x,p[1]-origin.z))));
 let pitPoints,pitIds=[];
 if(mains.length){const joined=joinConnected(mains[0],pits);pitPoints=joined.points;pitIds=joined.ids;}
 else{
  const side=track.config.pitSide||-1;
  pitPoints=Array.from({length:41},(_,i)=>{const s=-150+i*12,t=i/40,offset=side*(track.halfWidth+9)*Math.sin(Math.PI*clamp(t*2,0,1)/2)*Math.sin(Math.PI*clamp((1-t)*2,0,1)/2),p=track.sample(s,offset);return[p.x,p.z];});
 }
 let longPoints=longLap?.line;
 if(!longPoints){
  let best=0;
  for(let s=track.length*.15;s<track.length*.85;s+=20)if(Math.abs(track.sample(s).k)>Math.abs(track.sample(best).k))best=s;
  const outside=-(Math.sign(track.sample(best).k)||1);
  longPoints=Array.from({length:37},(_,i)=>{const t=i/36,p=track.sample(best-50+t*140,outside*(track.halfWidth+8)*Math.sin(Math.PI*t)**2);return[p.x,p.z];});
 }
 const routes={pit:new PenaltyRoute(track,'pit',pitPoints,pitIds),longlap:new PenaltyRoute(track,'longlap',longPoints,longLap?[longLap.id]:[])};
 cache.set(track,routes);return routes;
}

// Drawn by the normal world renderer and followed by the same service
// controller for both humans and bots. OSM routes retain their source IDs;
// a missing mapped route is an explicitly approximate gameplay connection.
export function drawPenaltyRoutes(g,track){
 for(const route of Object.values(penaltyRoutes(track))){
  const steps=Math.ceil(route.length/5);
  for(let i=0;i<steps;i++){
   const a=route.sample(i/steps*route.length),b=route.sample((i+1)/steps*route.length),dx=b.x-a.x,dz=b.z-a.z,l=Math.hypot(dx,dz);if(l<.01)continue;
   const nx=dz/l*route.width/2,nz=-dx/l*route.width/2;
   const point=(p,t)=>[p.x+nx*t,p.y+.055,p.z+nz*t];
   g.quad(point(a,-1),point(b,-1),point(b,1),point(a,1),[.23,.25,.26],1);
   for(const side of [-1,1])g.quad(point(a,side*.92),point(b,side*.92),point(b,side),point(a,side),[.88,.90,.84]);
  }
 }
}
