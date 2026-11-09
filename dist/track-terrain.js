import {terrainElevation} from './elevation.js';
import {SCENERY_DATA} from './scenery-data.js';
import {PIT_PROFILES} from './pit-profiles.js';
import {PIT_GARAGE_FOOTPRINTS} from './pit-traces.js';
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const lerp=(a,b,t)=>a+(b-a)*t;

export function terrainSampler(track,cell=12){
 if(!track.config.elevation)return Object.assign(()=>0,{cellStep:cell});const cache=new Map();
 const pitIds=PIT_PROFILES[track.config.id]?.ids||[];
 const rings=(SCENERY_DATA[track.config.id]?.features||[]).filter(f=>pitIds.includes(f.id)).flatMap(f=>f.rings);
 if(PIT_GARAGE_FOOTPRINTS[track.config.id])rings.push(PIT_GARAGE_FOOTPRINTS[track.config.id]);
 const pitBounds=rings.map(ring=>({minX:Math.min(...ring.map(p=>p[0])),maxX:Math.max(...ring.map(p=>p[0])),minZ:Math.min(...ring.map(p=>p[1])),maxZ:Math.max(...ring.map(p=>p[1]))}));
 if(track.config.terrainGrid){
  const sample=(ix,iz)=>{
   const key=ix+','+iz;if(cache.has(key))return cache.get(key);
   const x=ix*cell,z=iz*cell;let best=Infinity,at=0;
   for(let i=0;i<track.count;i+=3){const p=track.nodes[i],d=(x-p.x)**2+(z-p.z)**2;if(d<best){best=d;at=i;}}
   const distance=Math.sqrt(best),raw=terrainElevation(track.config,x,z)-(track.elevationOffset||0);let height=raw;
   const apron=distance<120?Math.max(0,...pitBounds.map(b=>1-Math.max(0,b.minX-6-x,x-b.maxX-6,b.minZ-6-z,z-b.maxZ-6)/18)):0;
   if(distance<track.halfWidth+38||apron>0){
    const projected=track.project(x,z,at*track.step),road=track.sample(projected.progress);
    const blend=clamp(Math.max(apron,1-Math.max(0,distance-track.halfWidth-8)/30),0,1);
    height=lerp(raw,road.y-.08,blend);
   }
   cache.set(key,height);return height;
  };
  // Exactly the same diagonal as the terrain mesh. Surface polygons are clipped
  // to these triangles, so grass/asphalt overlays cannot sink into the hillside.
  return Object.assign((x,z)=>{const ix=Math.floor(x/cell),iz=Math.floor(z/cell),u=x/cell-ix,v=z/cell-iz,a=sample(ix,iz),c=sample(ix+1,iz+1);return u>v?a+(sample(ix+1,iz)-a)*u+(c-sample(ix+1,iz))*v:a+(c-sample(ix,iz+1))*u+(sample(ix,iz+1)-a)*v;},{cellStep:cell,bounds:{minX:track.bounds.minX-600,maxX:track.bounds.maxX+600,minZ:track.bounds.minZ-600,maxZ:track.bounds.maxZ+600}});
 }
 const sample=(ix,iz)=>{const key=ix+','+iz;if(cache.has(key))return cache.get(key);const x=ix*cell,z=iz*cell;let best=1e20,at=0;for(let i=0;i<track.count;i+=3){const p=track.nodes[i],d=(x-p.x)**2+(z-p.z)**2;if(d<best){best=d;at=i;}}const distance=Math.sqrt(best),fade=clamp(1-Math.max(0,distance-70)/360,0,1),height=track.sample(at*track.step).y*fade-1.1*clamp(1-distance/70,0,1);cache.set(key,height);return height;};
 return(x,z)=>{const b=track.bounds;if(x<b.minX-550||x>b.maxX+550||z<b.minZ-550||z>b.maxZ+550)return 0;const ix=Math.floor(x/cell),iz=Math.floor(z/cell),u=x/cell-ix,v=z/cell-iz;return lerp(lerp(sample(ix,iz),sample(ix+1,iz),u),lerp(sample(ix,iz+1),sample(ix+1,iz+1),u),v);};
}
