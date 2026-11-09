import {groundPatch} from './terrain-patches.js';
export {groundPatch} from './terrain-patches.js';
import earcut from 'earcut';
import {isPitBuilding,drawPitBuildings} from './pit-buildings.js';
import {SCENERY_DATA} from './scenery-data.js';
import {circuitEnvironment,mappedGroundMaterial,landcoverAt} from './circuit-environment.js';
export const hasMappedScenery=id=>!!SCENERY_DATA[id]?.features.length;

const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
function randomFor(id){let seed=2166136261;for(const c of id)seed=Math.imul(seed^c.charCodeAt(0),16777619);return()=>{seed=(Math.imul(seed,1664525)+1013904223)|0;return(seed>>>0)/4294967296;};}
export function inRing([x,z],ring){
 let inside=false;
 for(let i=0,j=ring.length-1;i<ring.length;j=i++){
  const a=ring[i],b=ring[j];
  if((a[1]>z)!==(b[1]>z)&&x<(b[0]-a[0])*(z-a[1])/(b[1]-a[1])+a[0])inside=!inside;
 }
 return inside;
}
export const insideFeature=(point,feature)=>feature.rings?.some(r=>inRing(point,r))&&!(feature.holes||[]).some(r=>inRing(point,r));
const bounds=ring=>({minX:Math.min(...ring.map(p=>p[0])),maxX:Math.max(...ring.map(p=>p[0])),minZ:Math.min(...ring.map(p=>p[1])),maxZ:Math.max(...ring.map(p=>p[1]))});
function segmentDistance(point,a,b){const dx=b[0]-a[0],dz=b[1]-a[1],u=clamp(((point[0]-a[0])*dx+(point[1]-a[1])*dz)/(dx*dx+dz*dz||1),0,1);return Math.hypot(point[0]-a[0]-u*dx,point[1]-a[1]-u*dz);}
const measure=(value,fallback)=>{const n=parseFloat(value);return Number.isFinite(n)&&n>0?clamp(n,1,180):fallback;};

export function mappedSceneryPlan(track,quality='low',data=SCENERY_DATA[track.config.id]){
 if(!data)return null;
 const features=data.features,buildings=features.filter(f=>['building','grandstand'].includes(f.kind));
 const blockers=features.filter(f=>['building','grandstand','water','parking'].includes(f.kind)||f.kind==='ground'&&mappedGroundMaterial(f)!=='grass');
 const roads=features.filter(f=>f.kind==='road'),trees=[],limit=quality==='low'?5500:12000;
 const cells=new Map(),cellKey=p=>Math.floor(p[0]/32)+','+Math.floor(p[1]/32);
 const index=(item,b)=>{for(let x=Math.floor(b.minX/32);x<=Math.floor(b.maxX/32);x++)for(let z=Math.floor(b.minZ/32);z<=Math.floor(b.maxZ/32);z++){const key=x+','+z;if(!cells.has(key))cells.set(key,[]);cells.get(key).push(item);}};
 for(const f of blockers)for(const ring of f.rings)index({feature:f},bounds(ring));
 for(const f of roads)for(let i=1;i<f.line.length;i++){
  const a=f.line[i-1],b=f.line[i],width=measure(f.tags.width,f.tags.highway==='path'?2:5)/2+2;
  index({a,b,width},{minX:Math.min(a[0],b[0])-width,maxX:Math.max(a[0],b[0])+width,minZ:Math.min(a[1],b[1])-width,maxZ:Math.max(a[1],b[1])+width});
 }
 const clearTree=point=>{
  if(track.nearestDistance(...point)<track.halfWidth+19)return false;
  return !(cells.get(cellKey(point))||[]).some(item=>item.feature?insideFeature(point,item.feature):segmentDistance(point,item.a,item.b)<item.width);
 };
 const treeType=f=>/elaeis|cocos|palm|phoenix/i.test([f.tags.genus,f.tags.species,f.tags.trees].join(' '))?'palm':f.tags.leaf_type||'broadleaved';
 for(const f of features.filter(f=>f.kind==='tree'))if(clearTree(f.point))trees.push({point:f.point,height:measure(f.tags.height,7),type:treeType(f),id:f.id});
 const forest=features.filter(f=>f.kind==='wood'),box=track.bounds,spacing=quality==='low'?13:9;
 // Round robin across mapped woodland patches. Large remote polygons cannot
 // consume the whole budget before small woods beside a later corner.
 const patches=[];
 for(const f of forest)for(const ring of f.rings){
  const b=bounds(ring);b.minX=Math.max(b.minX,box.minX-500);b.maxX=Math.min(b.maxX,box.maxX+500);b.minZ=Math.max(b.minZ,box.minZ-500);b.maxZ=Math.min(b.maxZ,box.maxZ+500);
  const rng=randomFor(f.id+':'+b.minX),points=[];
  for(let x=b.minX;x<b.maxX;x+=spacing)for(let z=b.minZ;z<b.maxZ;z+=spacing){
   const point=[x+(rng()-.5)*spacing*.85,z+(rng()-.5)*spacing*.85];
   if(inRing(point,ring)&&insideFeature(point,f))points.push({point,height:5+rng()*9,type:treeType(f),id:f.id});
  }
  // Keep the reduced tree budget spread over the whole mapped polygon.
  for(let i=points.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[points[i],points[j]]=[points[j],points[i]];}
  patches.push(points);
 }
 for(let i=0,remaining=true;remaining&&trees.length<limit;i++){
  remaining=false;
  for(const patch of patches){if(i>=patch.length)continue;remaining=true;const tree=patch[i];if(clearTree(tree.point))trees.push(tree);if(trees.length>=limit)break;}
 }
 for(const f of features.filter(f=>f.kind==='tree_row'))for(let i=1;i<f.line.length;i++){
  const a=f.line[i-1],b=f.line[i],steps=Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/7);
  for(let n=0;n<steps&&trees.length<limit;n++){const point=[a[0]+(b[0]-a[0])*n/steps,a[1]+(b[1]-a[1])*n/steps];if(clearTree(point))trees.push({point,height:7,type:f.tags.leaf_type||'broadleaved',id:f.id});}
 }
 // Satellite tree-cover cells fill gaps in the OSM woodland survey. Roads,
 // current buildings, runoff areas and mapped forest holes still take priority.
 const cover=data.landcover;
 if(cover&&trees.length<limit){
  const rng=randomFor(track.config.id+':worldcover'),candidates=[];
  const forestBounds=forest.flatMap(f=>f.rings.map(r=>({feature:f,box:bounds(r)})));
  for(let j=0;j<cover.depth;j++)for(let i=0;i<cover.width;i++){
   if(cover.classes[j*cover.width+i]!==10)continue;
   const point=[cover.x+i*cover.step+(rng()-.5)*cover.step*.7,cover.z+j*cover.step+(rng()-.5)*cover.step*.7];
   // Preserve mapped holes too: an older raster must not refill a newer clearing.
   if(forestBounds.some(({feature:f,box:b})=>point[0]>=b.minX&&point[0]<=b.maxX&&point[1]>=b.minZ&&point[1]<=b.maxZ&&f.rings.some(r=>inRing(point,r))))continue;
   if(clearTree(point))candidates.push({id:'worldcover',source:'worldcover',point,height:5+rng()*7,type:'broadleaved'});
  }
  for(let i=candidates.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[candidates[i],candidates[j]]=[candidates[j],candidates[i]];}
  trees.push(...candidates.slice(0,Math.max(0,limit-trees.length)));
 }
 const safeBuildings=buildings.filter(f=>{
  if(isPitBuilding(track.config.id,f.id))return false;
  const vertices=f.rings.flat(),clear=vertices.filter(p=>track.nearestDistance(...p)>track.halfWidth+3).length;
  // Stand roof outlines can slightly overhang an imperfect mapped road edge.
  // Preserve the rest of the structure and trim its rendered pieces below.
  return f.kind==='grandstand'?clear>=vertices.length*.8:clear===vertices.length;
 });
 return{features,buildings:safeBuildings,trees,source:data.source,date:data.date,
  stats:{mappedFeatures:features.length,buildings:safeBuildings.length,trees:trees.length,satelliteTrees:trees.filter(t=>t.source==='worldcover').length,woodlands:forest.length,roads:roads.length}};
}

function polygonTriangles(feature,callback){
 for(const ring of feature.rings||[]){
  const rings=[ring,...(feature.holes||[]).filter(h=>inRing(h[0],ring))];
  const flat=[],holes=[];for(let i=0;i<rings.length;i++){if(i)holes.push(flat.length/2);for(const p of rings[i])flat.push(...p);}
  const indices=earcut(flat,holes,2);
  for(let i=0;i<indices.length;i+=3)callback([0,1,2].map(k=>flat.slice(indices[i+k]*2,indices[i+k]*2+2)));
 }
}
function parseColor(value,fallback){
 if(/^#[0-9a-f]{6}$/i.test(value||''))return[1,3,5].map(i=>parseInt(value.slice(i,i+2),16)/255);
 return fallback;
}

function footprintAxes(feature){
 const ring=feature.rings[0];let longest=0,axis=[0,1];
 for(let i=1;i<ring.length;i++){const dx=ring[i][0]-ring[i-1][0],dz=ring[i][1]-ring[i-1][1],length=Math.hypot(dx,dz);if(length>longest){longest=length;axis=[dx/length,dz/length];}}
 const across=[axis[1],-axis[0]],project=p=>[p[0]*across[0]+p[1]*across[1],p[0]*axis[0]+p[1]*axis[1]],b=bounds(ring.map(project));
 return{...b,axis,across,yaw:Math.atan2(axis[0],axis[1]),point:(x,z)=>[across[0]*x+axis[0]*z,across[1]*x+axis[1]*z]};
}

function grandstand(g,feature,track,terrain,low){
 if(track.config.id==='sepang'&&feature.id==='w144247993')return sepangMainGrandstand(g,feature,track,terrain,low);
 const f=footprintAxes(feature),centre=f.point((f.minX+f.maxX)/2,(f.minZ+f.maxZ)/2),rng=randomFor(feature.id);
 let near=track.nodes[0],distance=Infinity;
 for(const node of track.nodes){const d=Math.hypot(node.x-centre[0],node.z-centre[1]);if(d<distance){distance=d;near=node;}}
 const front=Math.sign((near.x-centre[0])*f.across[0]+(near.z-centre[1])*f.across[1])||1;
 const rows=Math.min(20,Math.max(3,Math.floor((f.maxX-f.minX)/1.3))),height=measure(feature.tags.height,Math.max(8,rows*.5+3));
 const floor=terrain(...centre),color=parseColor(feature.tags['roof:colour'],[.68,.70,.67]);
 polygonTriangles(feature,tri=>{
  const draw=(tri,depth=0)=>{
   const lengths=tri.map((p,i)=>Math.hypot(p[0]-tri[(i+1)%3][0],p[1]-tri[(i+1)%3][1])),edge=lengths.indexOf(Math.max(...lengths));
   if(lengths[edge]>18&&depth<12){const a=tri[edge],b=tri[(edge+1)%3],c=tri[(edge+2)%3],m=[(a[0]+b[0])/2,(a[1]+b[1])/2];draw([a,m,c],depth+1);draw([m,b,c],depth+1);return;}
   if(tri.some(p=>track.nearestDistance(...p)<track.halfWidth+1))return;
   const p=tri.map(([x,z])=>[x,floor+height,z]);g.tri(p[2],p[1],p[0],color);
  };draw(tri);
 });
 for(let row=0;row<rows;row++){
  const x=front>0?f.maxX-(row+.5)*1.3:f.minX+(row+.5)*1.3,y=floor+.6+row*(height-3)/rows;
  for(let z=f.minZ+1.5;z<f.maxZ-1.5;z+=3){
   const p=f.point(x,z);if(!insideFeature(p,feature)||track.nearestDistance(...p)<track.halfWidth+3)continue;
   g.box([p[0],y-.20,p[1]],[1.28,.35,2.98],[.46,.49,.47],f.yaw);
   if(low&&row%2||rng()<.18)continue;
   const colours=[[.72,.14,.10],[.18,.35,.65],[.77,.76,.65],[.16,.19,.21],[.88,.64,.16]],c=colours[Math.floor(rng()*colours.length)];
   g.box([p[0],y+.4,p[1]],[.4,.65,.45],c,f.yaw);g.sphere([p[0],y+.83,p[1]],[.16,.18,.16],[.66,.48,.34],6,3);
  }
 }
 for(let z=f.minZ+3;z<f.maxZ;z+=14)for(const x of[f.minX+1,f.maxX-1]){
  const p=f.point(x,z);if(insideFeature(p,feature)&&track.nearestDistance(...p)>track.halfWidth+2)g.cylinder([p[0],terrain(...p),p[1]],[p[0],floor+height,p[1]],.13,[.52,.55,.53],5);
 }
}

// Sepang's two long wings and fan-shaped layered canopy follow the mapped
// Main Grandstand footprint. Architectural reference: Tilke's Sepang project,
// https://tilke.de/wp-content/uploads/2026/01/2026-Tilke-Portfolio-LQ-1.pdf
// Roof sections and heights are a game reconstruction, not a structural survey.
function sepangMainGrandstand(g,feature,track,terrain,low){
 const f=footprintAxes(feature),middle=(f.minX+f.maxX)/2,width=f.maxX-f.minX,rng=randomFor(feature.id);
 const safe=p=>insideFeature(p,feature)&&track.nearestDistance(...p)>track.halfWidth+3;
 for(const sign of[-1,1]){
  const front=middle+sign*(width/2-4),back=front-sign*34;
  for(let bay=f.minZ+32;bay<f.maxZ-20;bay+=34){
   const anchor=f.point(back,bay);if(!safe(anchor))continue;
   const base=terrain(...anchor),uSteps=low?4:8,vSteps=low?6:12;
   const roof=(u,v)=>{
    const p=f.point(back+(front-back)*u,bay+(v-.5)*(30+u*8));
    return[p[0],base+16+2.5*Math.sin(Math.PI*v)-3*u+3*Math.sin(Math.PI*u),p[1]];
   };
   for(let i=0;i<uSteps;i++)for(let j=0;j<vSteps;j++){
    const corners=[roof(i/uSteps,j/vSteps),roof((i+1)/uSteps,j/vSteps),roof((i+1)/uSteps,(j+1)/vSteps),roof(i/uSteps,(j+1)/vSteps)];
    if(!corners.every(p=>safe([p[0],p[2]])))continue;
    g.quad(...corners,[.83,.84,.79]);
    if(j===0||j===vSteps-1)g.cylinder(corners[0],corners[1],.07,[.59,.62,.59],4);
   }
   g.cylinder([anchor[0],base,anchor[1]],[anchor[0],base+16,anchor[1]],.22,[.84,.85,.80],6);
   for(const direction of[-1,1]){
    const tip=f.point(front-sign*4,bay+direction*11);
    if(safe(tip))g.cylinder([anchor[0],base+13,anchor[1]],[tip[0],base+14,tip[1]],.11,[.74,.76,.72],5);
   }
  }
  for(let row=0;row<19;row++)for(let z=f.minZ+26;z<f.maxZ-20;z+=low?4.5:3){
   const x=front-sign*(row+.5)*1.5,p=f.point(x,z);if(!safe(p))continue;
   const y=terrain(...p)+.6+row*.48;
   g.box([p[0],y,p[1]],[1.48,.35,low?4.45:2.95],[.51,.53,.50],f.yaw);
   if(low&&row%2||rng()<.35)continue;
   const colors=[[.20,.39,.63],[.80,.68,.18],[.72,.18,.13],[.78,.79,.74]],c=colors[Math.floor(rng()*colors.length)];
   g.box([p[0],y+.5,p[1]],[.42,.65,.42],c,f.yaw);
   g.sphere([p[0],y+.95,p[1]],[.16,.18,.16],[.67,.50,.36],6,3);
  }
 }
}

function coastalWater(g,grid,offset=0){
 const level=.5,waterY=level-grid.baseElevation-offset;
 const clip=triangle=>{
  const polygon=[];
  for(let i=0;i<triangle.length;i++){
   const a=triangle[(i+triangle.length-1)%triangle.length],b=triangle[i],insideA=a[2]<=level,insideB=b[2]<=level;
   if(insideA!==insideB){const t=(level-a[2])/(b[2]-a[2]);polygon.push([a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t]);}
   if(insideB)polygon.push(b.slice(0,2));
  }
  const point=p=>[p[0],waterY,p[1]];
  for(let i=1;i<polygon.length-1;i++)g.tri(point(polygon[i+1]),point(polygon[i]),point(polygon[0]),[.18,.38,.45],13);
 };
 for(let z=0;z<grid.depth-1;z++)for(let x=0;x<grid.width-1;x++){
  const point=(i,j)=>[grid.x+i*grid.step,grid.z+j*grid.step,grid.elevations[j*grid.width+i]];
  const a=point(x,z),b=point(x+1,z),c=point(x+1,z+1),d=point(x,z+1);clip([a,b,c]);clip([a,c,d]);
 }
}

export function buildMappedScenery(g,track,terrain,quality){
 const plan=mappedSceneryPlan(track,quality);if(!plan)return null;
 const low=quality==='low',style=circuitEnvironment(track.config.id);
 drawPitBuildings(g,track,terrain,low);
 if(track.config.terrainGrid&&plan.features.some(f=>f.kind==='coastline'))coastalWater(g,track.config.terrainGrid,track.elevationOffset||0);
 for(const feature of plan.features){
  // Woodland follows the terrain through individual trees. A single large
  // polygon interpolated between distant heights would form a sloping wall.
  if(!['ground','parking','water'].includes(feature.kind))continue;
  const material=mappedGroundMaterial(feature),water=feature.kind==='water',parking=feature.kind==='parking';
  const color=water?[.16,.36,.40]:parking?[.29,.31,.30]:material==='asphalt'?[.28,.29,.28]:material==='gravel'?[.66,.60,.47]:style.grass.map(v=>v*1.07);
  polygonTriangles(feature,tri=>groundPatch(g,tri,terrain,color,water?13:material==='gravel'?3:material==='asphalt'||parking?1:2,parking?.065:water?.045:material==='asphalt'?.04:.02));
 }
 for(const feature of plan.features.filter(f=>f.kind==='road'||f.kind==='fence')){
  if(/long.?lap/i.test(feature.tags.name||''))continue;
  const line=feature.line;if(!line)continue;
  for(let i=1;i<line.length;i++){
   const a=line[i-1],b=line[i],dx=b[0]-a[0],dz=b[1]-a[1],length=Math.hypot(dx,dz);if(length<.1)continue;
   if(feature.kind==='fence'){
    const solid=['wall','retaining_wall','jersey_barrier'].includes(feature.tags.barrier),rail=feature.tags.barrier==='guard_rail';
    const steps=Math.ceil(length/(low?12:8)),h=measure(feature.tags.height,solid?1.2:rail?1:2.4);
    for(let j=0;j<steps;j++){
     const x=a[0]+dx*j/steps,z=a[1]+dz*j/steps,y=terrain(x,z);
     if(track.nearestDistance(x,z)<track.halfWidth+2)continue;
     g.cylinder([x,y,z],[x,y+h,z],.055,[.46,.49,.46],4);
     const X=a[0]+dx*(j+1)/steps,Z=a[1]+dz*(j+1)/steps,Y=terrain(X,Z);
     if(solid){g.quad([x,y,z],[X,Y,Z],[X,Y+h,Z],[x,y+h,z],[.62,.63,.58]);continue;}
     for(const t of[.25,.65,1])g.cylinder([x,y+h*t,z],[X,Y+h*t,Z],.025,[.48,.51,.48],3);
     if(!low&&!rail){g.cylinder([x,y,z],[X,Y+h,Z],.012,[.39,.42,.40],3);g.cylinder([x,y+h,z],[X,Y,Z],.012,[.39,.42,.40],3);}
    }
   }else{
    const width=measure(feature.tags.width,['path','footway'].includes(feature.tags.highway)?1.8:feature.tags.highway==='service'?4:7),nx=dz/length*width/2,nz=-dx/length*width/2;
    const point=(p,x,z)=>[p[0]+x,terrain(p[0]+x,p[1]+z)+.024,p[1]+z];
    const steps=Math.ceil(length/10);
    for(let j=0;j<steps;j++){
     const A=[a[0]+dx*j/steps,a[1]+dz*j/steps],B=[a[0]+dx*(j+1)/steps,a[1]+dz*(j+1)/steps];
     if(track.nearestDistance((A[0]+B[0])/2,(A[1]+B[1])/2)<track.halfWidth+width/2+.4)continue;
     const unpaved=/gravel|unpaved|dirt|compacted|ground/.test(feature.tags.surface||'');
     g.quad(point(A,-nx,-nz),point(B,-nx,-nz),point(B,nx,nz),point(A,nx,nz),unpaved?[.52,.47,.36]:[.25,.27,.26],unpaved?3:1);
    }
   }
  }
 }
 for(const feature of plan.buildings){
  if(feature.kind==='grandstand'){grandstand(g,feature,track,terrain,low);continue;}
  const rng=randomFor(feature.id),color=parseColor(feature.tags['building:colour'],[.57+rng()*.15,.57+rng()*.14,.52+rng()*.13]);
  const height=measure(feature.tags.height,measure(feature.tags['building:levels'],feature.kind==='grandstand'?3:2)*3.2),roof=parseColor(feature.tags['roof:colour'],[.34,.36,.35]);
  const floor=Math.max(...feature.rings.flat().map(p=>terrain(...p)));
  for(const ring of [...feature.rings,...(feature.holes||[])])for(let i=1;i<ring.length;i++){
   const a=ring[i-1],b=ring[i],ya=terrain(...a),yb=terrain(...b),length=Math.hypot(b[0]-a[0],b[1]-a[1]);
   g.quad([a[0],ya,a[1]],[b[0],yb,b[1]],[b[0],floor+height,b[1]],[a[0],floor+height,a[1]],color);
   if(length<3)continue;
   const nx=(b[1]-a[1])/length*.025,nz=-(b[0]-a[0])/length*.025;
   for(let floor=2.1;floor<height-1;floor+=3.2)for(let x=1.6;x<length-1;x+=low?5:3.5){
    const t=x/length,u=(x+Math.min(1.4,length-x))/length,y=Math.max(ya,yb)+floor;
    g.quad([a[0]+(b[0]-a[0])*t+nx,y,a[1]+(b[1]-a[1])*t+nz],[a[0]+(b[0]-a[0])*u+nx,y,a[1]+(b[1]-a[1])*u+nz],
     [a[0]+(b[0]-a[0])*u+nx,y+1.1,a[1]+(b[1]-a[1])*u+nz],[a[0]+(b[0]-a[0])*t+nx,y+1.1,a[1]+(b[1]-a[1])*t+nz],[.19,.30,.35],9);
   }
   if(feature.tags.building==='garages')for(let x=1;x<length-6;x+=8){
    const point=(d,y)=>[a[0]+(b[0]-a[0])*d/length+nx,y,a[1]+(b[1]-a[1])*d/length+nz],floor=ya*(1-x/length)+yb*x/length;
    g.quad(point(x,floor+.05),point(x+5.8,floor+.05),point(x+5.8,floor+3.0),point(x,floor+3.0),[.10,.16,.19]);
    g.quad(point(x,floor+3.1),point(x+5.8,floor+3.1),point(x+5.8,floor+3.35),point(x,floor+3.35),[.76,.18,.12]);
   }
  }
  polygonTriangles(feature,tri=>{const p=tri.map(([x,z])=>[x,floor+height,z]);g.tri(p[2],p[1],p[0],roof);});
 }
 let cars=0;
 for(const feature of plan.features.filter(f=>f.kind==='parking')){
  const f=footprintAxes(feature),rng=randomFor(feature.id);
  for(let x=f.minX+3;x<f.maxX-3;x+=7)for(let z=f.minZ+3;z<f.maxZ-3;z+=3.3){
   if(cars>=(low?180:450))break;
   if(![-1,1].every(a=>[-1,1].every(b=>insideFeature(f.point(x+a*2.6,z+b*1.5),feature))))continue;
   const p=f.point(x,z),floor=terrain(...p)+.05;
   if(track.nearestDistance(...p)<track.halfWidth+8)continue;
   const corners=[f.point(x-2.6,z-1.5),f.point(x+2.6,z-1.5),f.point(x+2.6,z-1.4),f.point(x-2.6,z-1.4)];
   g.quad(...corners.map(([X,Z])=>[X,terrain(X,Z)+.035,Z]),[.79,.78,.67]);
   if(rng()<.35)continue;
   const colors=[[.68,.70,.68],[.15,.21,.29],[.60,.12,.10],[.73,.74,.69],[.24,.25,.26]],c=colors[Math.floor(rng()*colors.length)];
   g.box([p[0],floor+.55,p[1]],[4.1,.8,1.8],c,f.yaw);g.box([p[0],floor+1.15,p[1]],[2.1,.55,1.55],[.20,.28,.30],f.yaw);cars++;
  }
 }
 for(const tree of plan.trees){
  const [x,z]=tree.point,y=terrain(x,z),h=tree.height,rng=randomFor(tree.id+':'+x),c=[.12+rng()*.06,.24+rng()*.09,.10+rng()*.05];
  const detailed=!low&&track.nearestDistance(x,z)<160;
  g.cylinder([x,y,z],[x,y+h*.65,z],.14+h*.009,[.28,.22,.15],detailed?6:4);
  if(tree.type==='palm'){
   for(let i=0;i<(low?6:9);i++){
    const a=i*Math.PI*2/(low?6:9),dx=Math.cos(a),dz=Math.sin(a),crown=[x,y+h,z],tip=[x+dx*h*.47,y+h*.75,z+dz*h*.47];
    g.tri(crown,[x+dx*h*.30-dz*.45,y+h*.94,z+dz*h*.30+dx*.45],tip,c,5);
    g.tri(crown,tip,[x+dx*h*.30+dz*.45,y+h*.94,z+dz*h*.30-dx*.45],c,5);
   }
  }else if(tree.type==='needleleaved'){
   for(const [level,radius]of[[.38,.28],[.57,.24],[.76,.17]])g.cylinder([x,y+h*level,z],[x,y+h*(level+.24),z],h*radius,c,detailed?8:5,.02);
  }else{
   g.sphere([x,y+h*.77,z],[h*.28,h*.31,h*.27],c,detailed?10:6,detailed?6:3);
   if(detailed)g.sphere([x+h*.14,y+h*.92,z-h*.07],[h*.20,h*.21,h*.20],[c[0]+.025,c[1]+.02,c[2]],8,4);
  }
 }
 for(const feature of plan.features.filter(f=>f.kind==='lamp')){
  const [x,z]=feature.point,y=terrain(x,z);if(track.nearestDistance(x,z)<track.halfWidth+2)continue;
  g.cylinder([x,y,z],[x,y+8,z],.09,[.48,.51,.50],5);g.box([x+.5,y+8,z],[1.2,.18,.35],[.72,.74,.68]);
 }
 return{...plan.stats,parkedCars:cars};
}
