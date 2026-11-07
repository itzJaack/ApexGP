import {RIDER_JOINTS,RIDER_BONES} from './rider-physics.js';

const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const subtract=(a,b)=>a.map((v,i)=>v-b[i]);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const unit=a=>{const n=Math.hypot(...a)||1;return a.map(v=>v/n);};
function boneDistance(p,index){
  const [a,b]=RIDER_BONES[index].map(i=>RIDER_JOINTS[i]),d=subtract(b,a),t=Math.max(0,Math.min(1,dot(subtract(p,a),d)/dot(d,d)));
  return Math.hypot(...p.map((v,i)=>v-a[i]-t*d[i]));
}
function candidates(p){
  if(p[1]>1.26&&p[2]>.05)return[2]; // Keep helmet/visor rigid together.
  if(p[1]<.86&&Math.abs(p[0])>.10)return p[0]<0?[9,10,11]:[12,13,14];
  if(p[1]>.85&&Math.abs(p[0])>.18)return p[0]<0?[3,4,5]:[6,7,8];
  return[0,1,2,3,6,9,12];
}
export function bindRiderSkin(rest){
  const count=rest.length/12,bones=new Uint8Array(count*2),weights=new Float32Array(count),output=rest.slice();
  for(let i=0;i<count;i++){
    const p=[rest[i*12],rest[i*12+1],rest[i*12+2]],ordered=candidates(p).map(index=>({index,d:boneDistance(p,index)})).sort((a,b)=>a.d-b.d);
    const a=ordered[0],b=ordered[1]||a,wa=1/(a.d+.025)**3,wb=1/(b.d+.025)**3;
    bones[i*2]=a.index;bones[i*2+1]=b.index;weights[i]=a===b?1:wa/(wa+wb);
  }
  return{rest,output,bones,weights};
}
function rotationBetween(from,to){
  const a=unit(from),b=unit(to),c=Math.max(-1,Math.min(1,dot(a,b)));
  let axis=cross(a,b),s=Math.hypot(...axis);
  if(s<1e-7){if(c>0)return[1,0,0,0,1,0,0,0,1];axis=unit(cross(a,Math.abs(a[1])<.8?[0,1,0]:[1,0,0]));s=0;}
  else axis=axis.map(v=>v/s);
  const [x,y,z]=axis,t=1-c;
  return[t*x*x+c,t*x*y-s*z,t*x*z+s*y,t*x*y+s*z,t*y*y+c,t*y*z-s*x,t*x*z-s*y,t*y*z+s*x,t*z*z+c];
}
function rotate(m,p){return[m[0]*p[0]+m[1]*p[1]+m[2]*p[2],m[3]*p[0]+m[4]*p[1]+m[5]*p[2],m[6]*p[0]+m[7]*p[1]+m[8]*p[2]];}
export function deformRiderSkin(binding,joints){
  const transforms=RIDER_BONES.map(([a,b])=>({rest:RIDER_JOINTS[a],at:joints[a],rotation:rotationBetween(subtract(RIDER_JOINTS[b],RIDER_JOINTS[a]),subtract(joints[b],joints[a]))}));
  const {rest,output,bones,weights}=binding;
  for(let i=0;i<weights.length;i++){
    const offset=i*12,weight=weights[i],ta=transforms[bones[i*2]],tb=transforms[bones[i*2+1]],a=ta.rotation,b=tb.rotation;
    const ax=rest[offset]-ta.rest[0],ay=rest[offset+1]-ta.rest[1],az=rest[offset+2]-ta.rest[2];
    const bx=rest[offset]-tb.rest[0],by=rest[offset+1]-tb.rest[1],bz=rest[offset+2]-tb.rest[2],nx=rest[offset+3],ny=rest[offset+4],nz=rest[offset+5];
    for(let k=0;k<3;k++){
      const j=k*3;
      output[offset+k]=(a[j]*ax+a[j+1]*ay+a[j+2]*az+ta.at[k])*weight+(b[j]*bx+b[j+1]*by+b[j+2]*bz+tb.at[k])*(1-weight);
      output[offset+3+k]=(a[j]*nx+a[j+1]*ny+a[j+2]*nz)*weight+(b[j]*nx+b[j+1]*ny+b[j+2]*nz)*(1-weight);
    }
    const norm=Math.hypot(output[offset+3],output[offset+4],output[offset+5])||1;
    output[offset+3]/=norm;output[offset+4]/=norm;output[offset+5]/=norm;
  }
  return output;
}
export function animateFallenRider(renderer,bike,fall){
  if(!bike?.skinSources||!renderer.updateMesh)return;
  for(const source of bike.skinSources){
    if(!fall){if(source.active){renderer.updateMesh(source.mesh,{data:source.rest});source.active=false;}continue;}
    if(source.fall===fall&&fall.age-source.at<(renderer.quality==='low'?1/20:1/30))continue;
    source.binding??=bindRiderSkin(source.rest);
    renderer.updateMesh(source.mesh,{data:deformRiderSkin(source.binding,fall.points.map(j=>j.p))});
    source.active=true;source.fall=fall;source.at=fall.age;
  }
}
