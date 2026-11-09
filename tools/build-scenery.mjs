// Convert the cached, attributable OSM extract with the SAME projection as
// the circuit. No guessed building coordinates or repeated scenery template.
import fs from 'node:fs/promises';
import {CIRCUIT_LAYOUTS} from '../dist/circuit-layouts.js';

function joinRings(members){
 const chains=members.filter(m=>m.type==='way'&&m.geometry?.length>2).map(m=>m.geometry.slice());
 const rings=[];
 const equal=(a,b)=>a.lat===b.lat&&a.lon===b.lon;
 while(chains.length){
  let chain=chains.pop(),found=true;
  while(!equal(chain[0],chain.at(-1))&&found){
   found=false;
   for(let i=0;i<chains.length;i++){
    let next=chains[i];
    if(equal(chain.at(-1),next.at(-1)))next=next.slice().reverse();
    if(equal(chain.at(-1),next[0])){chain.push(...next.slice(1));chains.splice(i,1);found=true;break;}
    if(equal(chain[0],next[0]))next=next.slice().reverse();
    if(equal(chain[0],next.at(-1))){chain=[...next.slice(0,-1),...chain];chains.splice(i,1);found=true;break;}
   }
  }
  if(equal(chain[0],chain.at(-1)))rings.push(chain);
 }
 return rings;
}
const all={};
for(const [id,layout] of Object.entries(CIRCUIT_LAYOUTS)){
 const raw=JSON.parse(await fs.readFile(new URL('../art/references/scenery/'+id+'.json',import.meta.url),'utf8'));
 const {origin,shift,scale}=layout.geo;
 const project=p=>[
  +(((p.lon-origin[1])*Math.cos(origin[0]*Math.PI/180)*111195-shift[0])*scale).toFixed(2),
  +((-(p.lat-origin[0])*111195-shift[1])*scale).toFixed(2),
 ];
 const features=[],members=new Set(raw.elements.filter(e=>e.type==='relation').flatMap(e=>(e.members||[]).map(m=>m.ref)));
 for(const e of raw.elements){
  const tags=e.tags||{};
  if(e.type==='way'&&members.has(e.id))continue;
  const closed=e.type==='relation'||e.geometry?.length>3&&e.geometry[0].lat===e.geometry.at(-1).lat&&e.geometry[0].lon===e.geometry.at(-1).lon;
  const surface=tags.surface||tags['area:highway']||tags.landcover||tags.landuse;
  let kind=tags.building==='grandstand'||tags.leisure==='grandstand'?'grandstand':tags.building&&tags.building!=='no'?'building':
   ['wood','scrub','tree_group'].includes(tags.natural)||tags.landcover==='trees'||['forest','orchard'].includes(tags.landuse)||tags.leisure==='park'?'wood':
   tags.natural==='water'?'water':tags.amenity==='parking'?'parking':tags.natural==='tree'?'tree':
   tags.natural==='coastline'?'coastline':tags.natural==='tree_row'?'tree_row':tags.highway==='street_lamp'?'lamp':tags.barrier?'fence':
   closed&&(['gravel','fine_gravel','sand','grass','meadow','asphalt','concrete'].includes(surface)||tags['area:highway']==='raceway')&&(!tags.highway||tags.area==='yes')?'ground':
   tags.highway&&e.type!=='node'?'road':null;
  if(!kind)continue;
  // A motorsport venue boundary is an area, not an extra closed racing road.
  if(kind==='road'&&tags.area==='yes')continue;
  const keep=['name','height','building:levels','min_height','building:colour','roof:colour','roof:shape','leaf_type','width','highway','surface','building','barrier','landuse','landcover','area:highway','genus','species','natural','material','fence_type','sport','area','trees'];
  const item={id:e.type[0]+e.id,kind,tags:Object.fromEntries(keep.filter(k=>tags[k]).map(k=>[k,tags[k]]))};
  if(e.type==='node')item.point=project(e);
  else if(e.type==='relation'){
   item.rings=joinRings((e.members||[]).filter(m=>m.role!=='inner')).map(r=>r.map(project));
   item.holes=joinRings((e.members||[]).filter(m=>m.role==='inner')).map(r=>r.map(project));
  }else if(e.geometry){
   const points=e.geometry.filter(p=>Number.isFinite(p.lat)&&Number.isFinite(p.lon)).map(project);
   if(['road','fence','tree_row','coastline'].includes(kind))item.line=points;
   else if(points.length>3&&Math.hypot(points[0][0]-points.at(-1)[0],points[0][1]-points.at(-1)[1])<.1)item.rings=[points];
  }
  const valid=['tree','lamp'].includes(kind)?item.point:
   ['road','fence','tree_row','coastline'].includes(kind)?item.line?.length>1:item.rings?.length;
  if(valid)features.push(item);
 }
 all[id]={source:'https://www.openstreetmap.org/copyright',date:raw.osm3s?.timestamp_osm_base||raw.apexgpSource.downloadedAt,
  bbox:raw.apexgpSource.bbox,features};
 const cover=JSON.parse(await fs.readFile(new URL('../art/references/landcover/'+id+'.json',import.meta.url),'utf8'));
 if(cover.classes.length!==cover.width*cover.depth||JSON.stringify(cover.geo)!==JSON.stringify(layout.geo))throw Error(id+': incomplete or misaligned land cover grid');
 const {x,z,step,width,depth,classes}=cover;
 all[id].landcover={x,z,step,width,depth,classes,source:cover.source,year:2021};
 console.log(id+': '+features.length+' mapped scenery features');
}
await fs.writeFile(new URL('../dist/scenery-data.js',import.meta.url),
 '// Generated from art/references/scenery/*.json and landcover/*.json.\n'+
 '// OSM features: © OpenStreetMap contributors, ODbL 1.0.\n'+
 '// Land cover: © ESA WorldCover project 2021 / Contains modified Copernicus Sentinel data (2021) processed by ESA WorldCover consortium, CC BY 4.0.\n'+
 'export const SCENERY_DATA='+JSON.stringify(all)+';\n');
