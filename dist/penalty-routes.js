import {SCENERY_DATA} from './scenery-data.js';
import {terrainSampler} from './track-terrain.js';
import {PIT_TRACES,PIT_GARAGE_FOOTPRINTS} from './pit-traces.js';
import {PIT_PROFILES} from './pit-profiles.js';
import {ROAD_COLOR,ROAD_MATERIAL} from './road-surface.js';
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const mod=(v,n)=>(v%n+n)%n;
const cache=new WeakMap();
// Unnamed OSM pit roads, cross-checked against the circuit venue maps. Keep
// their mapped geometry instead of inventing a parallel lane at the finish.
const PIT_WAYS={buriram:['w677379784'],brno:['w184267642'],balaton:['w1259458777'],
 azzurra:['w257057570','w849478718','w354149765','w777192900','w777192901','w354149773']};

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
  if(kind!=='pit')throw Error('Unsupported penalty route: '+kind);
  this.kind='pit';this.width=5;this.limit=60/3.6;
  this.sourceIds=sourceIds;this.approximate=!sourceIds.length;this.track=track;
  this.ground=terrainSampler(track,24);
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
   const y=off<track.halfWidth+.2?road.y:this.ground(x,z)+.04;
   this.points.push({x,z,y,s:length,progress:near});
  }
  this.length=length;
  this.points[0].progress=this.entry;this.points.at(-1).progress=this.exit;
  const clear=[];
  for(let s=0;s<=this.length;s+=2){const p=this.sample(s);if(Math.abs(projectAnywhere(track,p.x,p.z).offset)>track.halfWidth+.5)clear.push(s);}
  this.serviceStart=clear[0]??Math.min(30,this.length*.15);
  this.serviceEnd=clear.at(-1)??this.length-30;
  const timing=PIT_PROFILES[track.config.id]?.timing,geo=track.config.geo;
  if(timing&&geo){
   const at=([lat,lon])=>this.project({x:((lon-geo.origin[1])*Math.cos(geo.origin[0]*Math.PI/180)*111195-geo.shift[0])*geo.scale,z:(-(lat-geo.origin[0])*111195-geo.shift[1])*geo.scale}).at;
   this.serviceStart=at(timing.entry);this.serviceEnd=at(timing.exit);
  }
  this.stopDistance=(this.serviceStart+this.serviceEnd)/2;
  const garageIds=PIT_PROFILES[track.config.id]?.ids||[];
  const garageRings=(SCENERY_DATA[track.config.id]?.features||[]).filter(f=>garageIds.includes(f.id)).flatMap(f=>f.rings);
  if(PIT_GARAGE_FOOTPRINTS[track.config.id])garageRings.push(PIT_GARAGE_FOOTPRINTS[track.config.id]);
  garageRings.sort((a,b)=>{const span=r=>Math.hypot(Math.max(...r.map(p=>p[0]))-Math.min(...r.map(p=>p[0])),Math.max(...r.map(p=>p[1]))-Math.min(...r.map(p=>p[1])));return span(b)-span(a);});
  if(garageRings.length){const ring=garageRings[0],centre={x:(Math.min(...ring.map(p=>p[0]))+Math.max(...ring.map(p=>p[0])))/2,z:(Math.min(...ring.map(p=>p[1]))+Math.max(...ring.map(p=>p[1])))/2};this.stopDistance=clamp(this.project(centre).at,this.serviceStart+15,this.serviceEnd-15);}
  const stopTarget=this.stopDistance;
  let bend=Infinity;
  for(let s=Math.max(this.serviceStart+15,stopTarget-30);s<Math.min(this.serviceEnd-15,stopTarget+30);s+=3){
   const a=this.sample(s-5),b=this.sample(s),c=this.sample(s+5),angle=Math.abs(Math.atan2(Math.sin(c.heading-a.heading),Math.cos(c.heading-a.heading)));
   const score=angle+Math.abs(s-stopTarget)*.0001;
   if(score<bend){bend=score;this.stopDistance=s;}
  }
  const gates=Math.max(2,Math.ceil((this.serviceEnd-this.serviceStart)/5));
  this.gates=Array.from({length:gates+1},(_,i)=>{const at=this.serviceStart+i/gates*(this.serviceEnd-this.serviceStart);return{at,...this.sample(at)};});
 }
 sample(distance,lap=0){
  const at=clamp(distance,0,this.length);let lo=0,hi=this.points.length-1;
  while(hi-lo>1){const mid=(lo+hi)>>1;if(this.points[mid].s<=at)lo=mid;else hi=mid;}
  const a=this.points[lo],b=this.points[hi],u=clamp((at-a.s)/(b.s-a.s||1),0,1);
  const x=a.x+(b.x-a.x)*u,z=a.z+(b.z-a.z)*u,progress=a.progress+(b.progress-a.progress)*u+lap*this.track.length;
  const projection=this.track.project(x,z,progress),road=this.track.sample(projection.progress);
  const y=Math.abs(projection.offset)<this.track.halfWidth?road.y+.06:this.ground(x,z)+.13;
  return{x,z,y,heading:Math.atan2(b.x-a.x,b.z-a.z),progress};
 }
 speedAt(distance){
  const a=this.sample(distance),b=this.sample(distance+5),c=this.sample(distance+10);
  const ab=Math.hypot(b.x-a.x,b.z-a.z),bc=Math.hypot(c.x-b.x,c.z-b.z),ac=Math.hypot(c.x-a.x,c.z-a.z);
  const curvature=2*Math.abs((b.x-a.x)*(c.z-a.z)-(b.z-a.z)*(c.x-a.x))/Math.max(.1,ab*bc*ac);
  return Math.min(this.limit,Math.sqrt(10/Math.max(.0001,curvature)));
 }
 project(pose){
  let nearest={distance:Infinity,at:0,heading:0};
  for(let i=1;i<this.points.length;i++){
   const a=this.points[i-1],b=this.points[i],dx=b.x-a.x,dz=b.z-a.z;
   const u=clamp(((pose.x-a.x)*dx+(pose.z-a.z)*dz)/(dx*dx+dz*dz||1),0,1),distance=Math.hypot(pose.x-a.x-dx*u,pose.z-a.z-dz*u);
   if(distance<nearest.distance)nearest={distance,at:a.s+(b.s-a.s)*u,heading:Math.atan2(dx,dz)};
  }
  return nearest;
 }
 contains(pose,margin=0){const q=this.project(pose);return q.at>=this.serviceStart-5&&q.at<=this.serviceEnd+5&&q.distance<=this.width/2+margin;}
}

export function penaltyRoutes(track){
 if(cache.has(track))return cache.get(track);
 const roads=(SCENERY_DATA[track.config.id]?.features||[]).filter(f=>f.kind==='road'&&(f.tags.highway==='raceway'||PIT_WAYS[track.config.id]?.includes(f.id)));
 const pits=roads.filter(f=>PIT_WAYS[track.config.id]?PIT_WAYS[track.config.id].includes(f.id):/pit(?!ch)|boxen|boxengasse|corsia.*box/i.test(f.tags.name||'')&&!/long.?lap|pit straight|safety|stowe|maison blanche|supercars/i.test(f.tags.name||''));
 const origin=track.sample(0),mains=pits.filter(f=>PIT_WAYS[track.config.id]?.includes(f.id)||/^(pit ?lane|boxenstra.e|boxengasse|national pit lane|international pit lane)$/i.test(f.tags.name||''));
 mains.sort((a,b)=>Math.min(...a.line.map(p=>Math.hypot(p[0]-origin.x,p[1]-origin.z)))-Math.min(...b.line.map(p=>Math.hypot(p[0]-origin.x,p[1]-origin.z))));
 let pitPoints,pitIds=[];
 if(PIT_TRACES[track.config.id]){pitPoints=PIT_TRACES[track.config.id];pitIds=['aerial-trace:'+track.config.id];}
 else if(mains.length){const joined=joinConnected(mains[0],pits);pitPoints=joined.points;pitIds=joined.ids;}
 else{
  const side=track.config.pitSide||-1;
  pitPoints=Array.from({length:41},(_,i)=>{const s=-150+i*12,t=i/40,offset=side*(track.halfWidth+9)*Math.sin(Math.PI*clamp(t*2,0,1)/2)*Math.sin(Math.PI*clamp((1-t)*2,0,1)/2),p=track.sample(s,offset);return[p.x,p.z];});
 }
 const routes={pit:new PenaltyRoute(track,'pit',pitPoints,pitIds)};
 cache.set(track,routes);return routes;
}

// Drawn by the normal world renderer and followed by the same service
// controller for both humans and bots. OSM routes retain their source IDs;
// a missing mapped route is an explicitly approximate gameplay connection.
export function drawPenaltyRoutes(g,track,terrain=terrainSampler(track)){
 for(const route of Object.values(penaltyRoutes(track))){
  route.ground=terrain;
  const steps=Math.ceil(route.length/3),half=route.width/2;
  const point=(s,offset,lift)=>{
   const q=route.sample(s),a=route.sample(s-2),b=route.sample(s+2),heading=Math.atan2(b.x-a.x,b.z-a.z);
   const x=q.x+Math.cos(heading)*offset,z=q.z-Math.sin(heading)*offset,p=projectAnywhere(track,x,z),road=track.sample(p.progress);
   // Join just above the racing surface, rather than laying a raised strip
   // across it. Preserve paint offsets and the off-track pit riding height.
   const y=Math.abs(p.offset)<=track.halfWidth?road.y+.028+(lift-.12):terrain(x,z)+lift;
   return[x,y,z];
  };
  for(let i=0;i<steps;i++){
   const a=i/steps*route.length,b=(i+1)/steps*route.length;
   g.quad(point(a,-half,.12),point(b,-half,.12),point(b,half,.12),point(a,half,.12),ROAD_COLOR,ROAD_MATERIAL);
   if(b<route.serviceStart||a>route.serviceEnd)continue;
   for(const side of[-1,1])g.quad(point(a,side*(half-.12),.145),point(b,side*(half-.12),.145),point(b,side*half,.145),point(a,side*half,.145),[.94,.94,.85]);
   const mid=route.sample((a+b)/2),near=projectAnywhere(track,mid.x,mid.z),road=track.sample(near.progress);
   const wallSide=Math.sign((road.x-mid.x)*Math.cos(mid.heading)-(road.z-mid.z)*Math.sin(mid.heading));
   if(Math.abs(near.offset)>track.halfWidth+half+2&&Math.abs(near.offset)<65){
    const pa=point(a,wallSide*(half+.65),.16),pb=point(b,wallSide*(half+.65),.16);
    g.cylinder(pa,pb,.32,[.63,.65,.63],4);
    g.quad(pa,pb,[pb[0],pb[1]+.95,pb[2]],[pa[0],pa[1]+.95,pa[2]],[.71,.73,.70]);
    if(i%4===0){
     g.cylinder([pa[0],pa[1]+.9,pa[2]],[pa[0],pa[1]+2.2,pa[2]],.04,[.39,.44,.43],4);
    }
    g.cylinder([pa[0],pa[1]+1.75,pa[2]],[pb[0],pb[1]+1.75,pb[2]],.025,[.50,.54,.52],4);
   }
  }
  for(const [at,colour]of[[route.serviceStart,[.82,.14,.12]],[route.serviceEnd,[.12,.74,.28]]]){
   const p=point(at,half+1.1,.16),yaw=route.sample(at).heading;
   g.cylinder(p,[p[0],p[1]+2.7,p[2]],.065,[.60,.63,.62],6);
   g.box([p[0],p[1]+2.4,p[2]],[.55,.95,.30],[.08,.10,.11],yaw);
   const front=[p[0]+Math.sin(yaw)*.18,p[1]+2.45,p[2]+Math.cos(yaw)*.18];g.sphere(front,[.16,.16,.12],colour,8,4);
   g.quad(point(at-.10,-half,.155),point(at+.10,-half,.155),point(at+.10,half,.155),point(at-.10,half,.155),[.94,.95,.88]);
  }
  const s=route.stopDistance;
  for(const d of[-3,3])g.quad(point(s+d-.08,-half+.3,.16),point(s+d+.08,-half+.3,.16),point(s+d+.08,half-.3,.16),point(s+d-.08,half-.3,.16),[1,.68,.08]);
  for(const side of[-1,1])g.quad(point(s-3,side*(half-.48),.16),point(s+3,side*(half-.48),.16),point(s+3,side*(half-.3),.16),point(s-3,side*(half-.3),.16),[1,.68,.08]);
 }
}
