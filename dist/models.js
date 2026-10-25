// Wavefront importer. The OBJ/MTL files in assets/models are the source of all bike/rider geometry.
const SOURCE_MODELS=new Map(),PARSED_MODELS=new Map(),MATERIAL_LIBRARIES=new Map(),MODEL_TEXTURES=new Map();
let modelManifest=null,assetBinary=null,assetsReady=false;
export function parseMTL(text){
 const materials={};let m=null;
 for(const line of text.split(/\r?\n/)){const a=line.trim().split(/\s+/),op=a.shift();if(op==='newmtl')m=materials[a.join(' ')]={color:[.7,.7,.7],surface:6,roughness:.5,metalness:0};else if(m){if(op==='Kd')m.color=a.slice(0,3).map(Number);if(op==='Pr')m.roughness=Number(a[0]);if(op==='Pm')m.metalness=Number(a[0]);if(op==='d')m.alpha=Number(a[0]);if(op==='map_Kd')m.map=a.join(' ');if(op==='#'&&a[0]==='apex_surface')m.surface=Number(a[1]);}}
 return materials;
}
export function parseOBJ(text){
 const positions=[],normals=[],uvs=[],groups=new Map();let object='body',material='Paint',triangles=0;
 const at=(token,length)=>{const n=Number(token);if(!Number.isInteger(n)||!n)throw Error('Indice OBJ non valido');return n<0?length+n:n-1;};
 for(const line of text.split(/\r?\n/)){
  const a=line.trim().split(/\s+/),op=a.shift();
  if(op==='v'||op==='vn'||op==='vt'){const n=op==='vt'?2:3,v=a.slice(0,n).map(Number);if(v.length!==n||!v.every(Number.isFinite))throw Error('Coordinate OBJ non valide');(op==='v'?positions:op==='vn'?normals:uvs).push(v);}
  else if(op==='o'||op==='g')object=a.join('_')||'body';else if(op==='usemtl')material=a.join(' ');
  else if(op==='f'){
   if(a.length<3)throw Error('Faccia OBJ non valida');const key=object+'|'+material;let group=groups.get(key);if(!group){group={object,material,data:[]};groups.set(key,group);}
   const refs=a.map(t=>{const p=t.split('/'),v=positions[at(p[0],positions.length)];if(!v)throw Error('Vertice OBJ mancante');const uv=p[1]?uvs[at(p[1],uvs.length)]:[0,0],n=p[2]?normals[at(p[2],normals.length)]:null;if(!uv||p[2]&&!n)throw Error('Normale o UV OBJ mancante');return{v,uv,n};});
   for(let i=1;i<refs.length-1;i++){const face=[refs[0],refs[i],refs[i+1]];let normal=face[0].n;if(!normal){const u=face[1].v.map((v,k)=>v-face[0].v[k]),v=face[2].v.map((v,k)=>v-face[0].v[k]);normal=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];const l=Math.hypot(...normal)||1;normal=normal.map(v=>v/l);}for(const r of face)group.data.push(...r.v,...(r.n||normal),...r.uv);triangles++;}
  }
 }
 if(!triangles)throw Error('Il file OBJ non contiene superfici');
 return{groups:[...groups.values()].map(g=>({...g,data:new Float32Array(g.data)})),triangles,vertices:positions.length};
}
async function decompress(bytes){if(typeof DecompressionStream!=='function')throw Error('Per importare i modelli 3D serve un browser aggiornato.');return new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).text();}
function base64bytes(s){return Uint8Array.from(atob(s),c=>c.charCodeAt(0));}
export async function prepareModelAssets({readAsset=null,readImage=null,onProgress=()=>{},quality='high'}={}){
 const tag=globalThis.document?.getElementById?.('apex-model-assets'),embedded=tag?JSON.parse(tag.textContent):null;
 const base='assets/models/';const binary=assetBinary||=async path=>{if(embedded?.files[path])return base64bytes(embedded.files[path]);if(readAsset)return new Uint8Array(await readAsset(path));const r=await fetch(base+path+'?v=4.0');if(!r.ok)throw Error('Modello 3D non disponibile: '+path);return new Uint8Array(await r.arrayBuffer());};
 const manifest=modelManifest||embedded?.manifest||JSON.parse(new TextDecoder().decode(await binary('manifest.json')));
 const levels=quality==='low'?['low','distant']:['high','race'];
 const names=[...new Set([...Object.values(manifest.bikes),manifest.rider].flatMap(b=>levels.map(l=>b[l]||b.race)))].filter(n=>!SOURCE_MODELS.has(n)&&!PARSED_MODELS.has(n));
 let done=0,next=0;const work=async()=>{while(next<names.length){const name=names[next++];SOURCE_MODELS.set(name,await decompress(await binary(name)));onProgress(++done,names.length);}};await Promise.all(Array.from({length:3},work));
 if(!assetsReady)for(const [id,path]of Object.entries(manifest.materials))MATERIAL_LIBRARIES.set(id,parseMTL(new TextDecoder().decode(await binary(path))));
 if(!assetsReady)for(const[id,path]of Object.entries(manifest.textures)){
  const data=await binary(path);let image;
  if(readImage)image=await readImage(path,data);else{const url=URL.createObjectURL(new Blob([data],{type:'image/png'}));try{image=await new Promise((resolve,reject)=>{const im=new Image();im.onload=()=>resolve(im);im.onerror=()=>reject(Error('Texture 3D non leggibile: '+path));im.src=url;});}finally{URL.revokeObjectURL(url);}}
  MODEL_TEXTURES.set(id,image);
 }
 modelManifest=manifest;assetsReady=true;return manifest;
}
function imported(path){let model=PARSED_MODELS.get(path);if(!model){const text=SOURCE_MODELS.get(path);if(!text)throw Error('Modelli OBJ non caricati');model=parseOBJ(text);PARSED_MODELS.set(path,model);SOURCE_MODELS.delete(path);}return model;}
const clampModel=(v,a,b)=>Math.max(a,Math.min(b,v));
function numberTexture(renderer,number,dark=false){const canvas=document.createElement('canvas');canvas.width=512;canvas.height=512;const c=canvas.getContext('2d');c.clearRect(0,0,512,512);c.textAlign='center';c.font='italic 900 330px Arial';c.lineJoin='round';c.lineWidth=14;c.strokeStyle=dark?'#f5f5ef':'#17222b';c.strokeText(String(number),256,380);c.fillStyle=dark?'#15202b':'#f6f6ef';c.fillText(String(number),256,380);return renderer.texture(canvas);}
export function createImportedBike(renderer,color,number,detail,style,livery='factory'){
 if(renderer.compat)return{mesh:{},rider:{},glass:{},wheels:[],shadow:{},decals:[],textures:[],imported:true};
 if(!modelManifest)throw Error('Importazione dei modelli OBJ non completata');
 const spec=modelManifest.bikes[style]||modelManifest.bikes.factory,lod=renderer.quality==='low'?(detail>=.8?'low':'distant'):(detail>=.8?'high':'race'),bike=imported(spec[lod]||spec.race),rider=imported(modelManifest.rider[lod]||modelManifest.rider.race),materials=MATERIAL_LIBRARIES.get(spec.id),riderMaterials=MATERIAL_LIBRARIES.get('rider');
 const dark=color[0]*.30+color[1]*.59+color[2]*.11>.65&&livery!=='stealth',variant=livery==='heritage'?'heritage':dark?'dark':'white';
 const decalsTexture=renderer.texture(MODEL_TEXTURES.get('apex_factory_'+variant)),numberTex=numberTexture(renderer,number,dark),suitTexture=renderer.texture(MODEL_TEXTURES.get('apex_suit')),suitNumber=numberTexture(renderer,number,false),parts=new Map();
 const append=(group,lib,source)=>{
  const mat=lib[group.material]||{color:[.5,.5,.5],surface:6};let rgb=mat.color;
  if(['Paint','LeatherAccent'].includes(group.material))rgb=livery==='stealth'&&group.material==='Paint'?[.09,.115,.14]:color;
  if(group.material==='Secondary'&&livery==='heritage')rgb=[.95,.88,.69];
  const name=source==='rider'&&group.object==='rider'?'rider':group.object;let target=parts.get(name);if(!target){target=[];parts.set(name,target);}
  for(let i=0;i<group.data.length;i+=8)target.push(group.data[i],group.data[i+1]-(group.object==='front_wheel'?spec.frontRadius:group.object==='rear_wheel'?spec.rearRadius:0),group.data[i+2]-(group.object==='front_wheel'?spec.wheelbase/2:group.object==='rear_wheel'?-spec.wheelbase/2:0),group.data[i+3],group.data[i+4],group.data[i+5],...rgb,mat.surface,group.data[i+6],group.data[i+7]);
 };
 bike.groups.forEach(g=>append(g,materials,'bike'));rider.groups.forEach(g=>append(g,riderMaterials,'rider'));
 const mesh=name=>parts.has(name)?renderer.mesh({data:new Float32Array(parts.get(name))}):null;
 const wheels=[{mesh:mesh('front_wheel'),z:spec.wheelbase/2,radius:spec.frontRadius,front:true},{mesh:mesh('rear_wheel'),z:-spec.wheelbase/2,radius:spec.rearRadius,front:false}];
 const shadow={data:[]};for(let i=0;i<40;i++){const a=i*Math.PI/20,b=(i+1)*Math.PI/20;for(const p of[[0,.018,0],[Math.cos(a)*.43,.018,Math.sin(a)*1.11],[Math.cos(b)*.43,.018,Math.sin(b)*1.11]])shadow.data.push(...p,0,1,0,.02,.024,.027,0,0,0);}
 return{mesh:mesh('body'),rider:mesh('rider'),glass:mesh('glass'),steering:mesh('steering'),steeringPivot:[0,.326,spec.wheelbase/2],wheels,shadow:renderer.mesh(shadow),wheelbase:spec.wheelbase,style,decals:[{mesh:mesh('livery'),texture:decalsTexture,shadow:false},{mesh:mesh('nose_number'),texture:numberTex,shadow:false}],riderDecals:[{mesh:mesh('suit_logo'),texture:suitTexture,shadow:false},{mesh:mesh('suit_number'),texture:suitNumber,shadow:false}],textures:[decalsTexture,numberTex,suitTexture,suitNumber],imported:true,sourceOBJ:spec[lod],riderOBJ:modelManifest.rider[lod],triangles:bike.triangles+rider.triangles};
}
export function modelAssetInfo(){return modelManifest?{version:modelManifest.version,bikes:Object.keys(modelManifest.bikes).length,stats:modelManifest.stats}:null;}
