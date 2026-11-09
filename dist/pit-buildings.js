import earcut from 'earcut';
import {SCENERY_DATA} from './scenery-data.js';
import {penaltyRoutes} from './penalty-routes.js';
import {PIT_GARAGE_FOOTPRINTS} from './pit-traces.js';
import {groundPatch} from './terrain-patches.js';

// Building footprints and lane positions are mapped. Heights and facade colours
// are authored estimates from the aerial/venue references in art/references/pits.md.
import {PIT_PROFILES} from './pit-profiles.js';
export {PIT_PROFILES} from './pit-profiles.js';
export const isPitBuilding=(id,featureId)=>PIT_PROFILES[id]?.ids.includes(featureId)||false;

export function drawPitBuildings(g,track,terrain,low=true){
 const profile=PIT_PROFILES[track.config.id];if(!profile)return;
 const route=penaltyRoutes(track).pit;
 const pave=(corners,color,lift)=>{const p=corners.map(q=>[q[0],q[2]]);groundPatch(g,[p[0],p[1],p[2]],terrain,color,0,lift);groundPatch(g,[p[0],p[2],p[3]],terrain,color,0,lift);};
 const features=SCENERY_DATA[track.config.id].features.filter(f=>profile.ids.includes(f.id));
 if(PIT_GARAGE_FOOTPRINTS[track.config.id])features.push({id:'aerial-pit:'+track.config.id,rings:[PIT_GARAGE_FOOTPRINTS[track.config.id]],tags:{building:'garages'}});
 for(const feature of features)for(const ring of feature.rings){
  const height=profile.height;
  const centre=ring.reduce((p,q)=>[p[0]+q[0]/ring.length,p[1]+q[1]/ring.length],[0,0]);
  const floor=terrain(...centre);
  let longest=0,axis=[0,1];
  for(let i=1;i<ring.length;i++){const dx=ring[i][0]-ring[i-1][0],dz=ring[i][1]-ring[i-1][1],length=Math.hypot(dx,dz);if(length>longest){longest=length;axis=[dx/length,dz/length];}}
  const stations=ring.map(p=>p[0]*axis[0]+p[1]*axis[1]),minStation=Math.min(...stations),span=Math.max(...stations)-minStation;
  for(let i=1;i<ring.length;i++){
   const a=ring[i-1],b=ring[i],dx=b[0]-a[0],dz=b[1]-a[1],length=Math.hypot(dx,dz);if(length<.01)continue;
   const midpoint={x:(a[0]+b[0])/2,z:(a[1]+b[1])/2},near=route.project(midpoint),lane=route.sample(near.at);
   const dot=Math.abs(Math.sin(lane.heading)*dx/length+Math.cos(lane.heading)*dz/length);
   const facingLane=(lane.x-midpoint.x)*(midpoint.x-centre[0])+(lane.z-midpoint.z)*(midpoint.z-centre[1])>0;
   const front=facingLane&&near.distance<45&&dot>.84&&length>14;
   const side=Math.sign((lane.x-midpoint.x)*dz-(lane.z-midpoint.z)*dx)||1;
   const nx=dz/length*side,nz=-dx/length*side;
   const point=(d,y,offset=0)=>{const x=a[0]+dx*d/length,z=a[1]+dz*d/length;return[x+nx*offset,y+terrain(x,z)-floor,z+nz*offset];};
   const base=floor;
   if(!front){g.quad(point(0,base),point(length,base),point(length,floor+height),point(0,floor+height),[.61,.64,.63]);continue;}
   // Upper facade and piers leave actual open garage bays below, not dark
   // rectangles painted over a solid wall. Interior depth remains editable mesh.
   g.quad(point(0,floor+3.5),point(length,floor+3.5),point(length,floor+height),point(0,floor+height),[.68,.71,.70]);
   const count=Math.max(1,Math.round(length/8)),bay=length/count;
   for(let j=0;j<count;j++){
    const start=j*bay,end=(j+1)*bay,lo=start+.4,hi=end-.4;
    g.quad(point(start,base),point(lo,base),point(lo,floor+3.5),point(start,floor+3.5),[.63,.66,.65]);
    g.quad(point(hi,base),point(end,base),point(end,floor+3.5),point(hi,floor+3.5),[.63,.66,.65]);
    g.quad(point(lo,floor+.18,-4),point(hi,floor+.18,-4),point(hi,floor+3.4,-4),point(lo,floor+3.4,-4),[.065,.085,.095]);
    for(const d of[lo,hi])g.quad(point(d,floor),point(d,floor,-4),point(d,floor+3.5,-4),point(d,floor+3.5),[.27,.30,.31]);
    pave([point(lo,0),point(hi,0),point(hi,0,-4),point(lo,0,-4)],[.34,.36,.36],.20);
    g.quad(point(lo,floor+3.18,.03),point(hi,floor+3.18,.03),point(hi,floor+3.48,.03),point(lo,floor+3.48,.03),profile.accent);
    const glass=(height-4)/2;
    g.quad(point(lo,floor+4,.03),point(hi,floor+4,.03),point(hi,floor+4+glass,.03),point(lo,floor+4+glass,.03),[.15,.25,.29],9);
    if(!low||j%3===0){
     const p=point((lo+hi)/2,floor+.6,-2.4);g.box(p,[1.4,1.2,.7],[.14,.17,.19],Math.atan2(dx,dz));
     const lampA=point(lo+.3,floor+3.12,-.3),lampB=point(hi-.3,floor+3.12,-.3);g.cylinder(lampA,lampB,.035,[.92,.94,.86],4);
    }
   }
   // Existing footprint determines the working apron width. Stop short of the
   // five-metre fast lane, so a garage cannot close the rider's corridor.
   for(let d=0;d<length;d+=4){
    const end=Math.min(length,d+4),q=point((d+end)/2,0),r=route.project({x:q[0],z:q[2]});
    const width=Math.max(0,Math.min(18,r.distance-route.width/2));if(width<.5)continue;
    const corners=[point(d,0,.05),point(end,0,.05),point(end,0,width),point(d,0,width)].map(([x,y,z])=>[x,terrain(x,z)+.10,z]);
    pave(corners,[.43,.45,.44],.18);
    if(profile.blend){const corners=[point(d,0,width-.7),point(end,0,width-.7),point(end,0,width),point(d,0,width)];pave(corners,profile.blend,.22);}
   }
  }
  const flat=ring.flat(),indices=earcut(flat,null,2);
  const roofY=([x,z])=>{
   if(!profile.wing)return terrain(x,z)+height;
   const u=(x*axis[0]+z*axis[1]-minStation)/(span||1),folds=[[0,0],[.18,.4],[.40,2.5],[.52,0],[.72,4.5],[1,.5]];
   const i=Math.max(1,folds.findIndex(p=>p[0]>=u)),a=folds[i-1],b=folds[i];
   return terrain(x,z)+height+a[1]+(b[1]-a[1])*(u-a[0])/(b[0]-a[0]);
  };
  for(let i=0;i<indices.length;i+=3){const p=indices.slice(i,i+3).map(index=>{const q=ring[index];return[q[0],roofY(q),q[1]];});g.tri(p[2],p[1],p[0],profile.roof);}
 }
}
