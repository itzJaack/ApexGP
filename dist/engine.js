import {allocateScene} from './runtime.js';
import {createImportedBike} from './models.js';
import {clamp,lerp,mod} from './simulation.js';
import {ResolutionGovernor} from './quality.js';
import {scenerySite} from './scenery.js';

const V={sub:(a,b)=>a.map((v,i)=>v-b[i]),dot:(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0),cross:(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],norm:a=>{const l=Math.hypot(...a)||1;return a.map(v=>v/l);}};
export const identity=()=>new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]);
export function multiply(a,b){const o=new Float32Array(16);for(let c=0;c<4;c++)for(let r=0;r<4;r++)for(let k=0;k<4;k++)o[c*4+r]+=a[k*4+r]*b[c*4+k];return o;}
export function modelMatrix(position=[0,0,0],yaw=0,lean=0,pitch=0,scale=1){
  const cy=Math.cos(yaw),sy=Math.sin(yaw),cl=Math.cos(lean),sl=Math.sin(lean),cp=Math.cos(pitch),sp=Math.sin(pitch);
  const t=identity();t[12]=position[0];t[13]=position[1];t[14]=position[2];
  const ry=new Float32Array([cy,0,-sy,0,0,1,0,0,sy,0,cy,0,0,0,0,1]);
  const rz=new Float32Array([cl,sl,0,0,-sl,cl,0,0,0,0,1,0,0,0,0,1]);
  const rx=new Float32Array([scale,0,0,0,0,cp*scale,sp*scale,0,0,-sp*scale,cp*scale,0,0,0,0,1]);
  return multiply(multiply(multiply(t,ry),rz),rx);
}
export function perspective(fov,aspect,near=.15,far=2500){const f=1/Math.tan(fov/2),nf=1/(near-far);return new Float32Array([f/aspect,0,0,0,0,f,0,0,0,0,(far+near)*nf,-1,0,0,2*far*near*nf,0]);}
export function lookAt(eye,target,up=[0,1,0]){const z=V.norm(V.sub(eye,target)),x=V.norm(V.cross(up,z)),y=V.cross(z,x);return new Float32Array([x[0],y[0],z[0],0,x[1],y[1],z[1],0,x[2],y[2],z[2],0,-V.dot(x,eye),-V.dot(y,eye),-V.dot(z,eye),1]);}

export class Geometry{
  constructor(){this.data=[];this.detail=Geometry.detail??1;}
  tri(a,b,c,color,surface=0,uvs=null,normals=null){
    const n=V.norm(V.cross(V.sub(b,a),V.sub(c,a)));
    [a,b,c].forEach((p,i)=>this.data.push(...p,...(normals?normals[i]:n),...color,surface,...(uvs?uvs[i]:[0,0])));return this;
  }
  quad(a,b,c,d,color,surface=0,uvs=null,normals=null){this.tri(a,b,c,color,surface,uvs?[uvs[0],uvs[1],uvs[2]]:null,normals?[normals[0],normals[1],normals[2]]:null);this.tri(a,c,d,color,surface,uvs?[uvs[0],uvs[2],uvs[3]]:null,normals?[normals[0],normals[2],normals[3]]:null);return this;}
  box(center,size,color,yaw=0){
    const [x,y,z]=center,[w,h,d]=size.map(v=>v/2),cy=Math.cos(yaw),sy=Math.sin(yaw);
    const p=[[-w,-h,-d],[w,-h,-d],[w,h,-d],[-w,h,-d],[-w,-h,d],[w,-h,d],[w,h,d],[-w,h,d]].map(([a,b,c])=>[x+a*cy+c*sy,y+b,z-a*sy+c*cy]);
    [[0,3,2,1],[4,5,6,7],[0,4,7,3],[1,2,6,5],[3,7,6,2],[0,1,5,4]].forEach(f=>this.quad(...f.map(i=>p[i]),color));return this;
  }
  cylinder(a,b,r,color,sides=10,r2=r){
    sides=Math.max(4,Math.round(sides*this.detail));
    const axis=V.norm(V.sub(b,a)),side=V.norm(V.cross(Math.abs(axis[1])>.9?[1,0,0]:[0,1,0],axis)),up=V.cross(axis,side);
    const ring=(center,radius,i)=>{const t=i/sides*Math.PI*2;return center.map((v,k)=>v+radius*(side[k]*Math.cos(t)+up[k]*Math.sin(t)));};
    for(let i=0;i<sides;i++){const a1=ring(a,r,i),a2=ring(a,r,i+1),b1=ring(b,r2,i),b2=ring(b,r2,i+1),n1=V.norm(V.sub(a1,a)),n2=V.norm(V.sub(a2,a));this.quad(a1,a2,b2,b1,color,0,null,[n1,n2,n2,n1]);this.tri(a,a2,a1,color);this.tri(b,b1,b2,color);}return this;
  }
  sphere(center,radius,color,segments=16,rings=8,pitch=0){
    segments=Math.max(6,Math.round(segments*this.detail));rings=Math.max(3,Math.round(rings*this.detail));
    const point=(i,j)=>{const u=i/segments*Math.PI*2,v=j/rings*Math.PI,a=Math.sin(v)*Math.cos(u)*radius[0],b=Math.cos(v)*radius[1],c=Math.sin(v)*Math.sin(u)*radius[2];return[center[0]+a,center[1]+b*Math.cos(pitch)-c*Math.sin(pitch),center[2]+b*Math.sin(pitch)+c*Math.cos(pitch)];};
    const normal=(i,j)=>{const u=i/segments*Math.PI*2,v=j/rings*Math.PI,x=Math.sin(v)*Math.cos(u)/radius[0],y=Math.cos(v)/radius[1],z=Math.sin(v)*Math.sin(u)/radius[2];return V.norm([x,y*Math.cos(pitch)-z*Math.sin(pitch),y*Math.sin(pitch)+z*Math.cos(pitch)]);};
    for(let j=0;j<rings;j++)for(let i=0;i<segments;i++){const a=point(i,j),b=point(i+1,j),c=point(i+1,j+1),d=point(i,j+1),na=normal(i,j),nb=normal(i+1,j),nc=normal(i+1,j+1),nd=normal(i,j+1);if(j>0)this.tri(a,b,d,color,0,null,[na,nb,nd]);if(j<rings-1)this.tri(b,c,d,color,0,null,[nb,nc,nd]);}return this;
  }
  torusX(center,major,minor,color,segments=24,rings=8){
    segments=Math.max(6,Math.round(segments*this.detail));rings=Math.max(3,Math.round(rings*this.detail));
    const point=(i,j)=>{const t=i/segments*Math.PI*2,p=j/rings*Math.PI*2;return[center[0]+Math.sin(p)*minor,center[1]+Math.cos(t)*(major+Math.cos(p)*minor),center[2]+Math.sin(t)*(major+Math.cos(p)*minor)];};
    const normal=(i,j)=>{const t=i/segments*Math.PI*2,p=j/rings*Math.PI*2;return[Math.sin(p),Math.cos(t)*Math.cos(p),Math.sin(t)*Math.cos(p)];};
    for(let i=0;i<segments;i++)for(let j=0;j<rings;j++)this.quad(point(i,j),point(i+1,j),point(i+1,j+1),point(i,j+1),color,0,null,[normal(i,j),normal(i+1,j),normal(i+1,j+1),normal(i,j+1)]);return this;
  }
  transform(matrix){for(let i=0;i<this.data.length;i+=12){const[x,y,z,nx,ny,nz]=this.data.slice(i,i+6);this.data[i]=matrix[0]*x+matrix[4]*y+matrix[8]*z+matrix[12];this.data[i+1]=matrix[1]*x+matrix[5]*y+matrix[9]*z+matrix[13];this.data[i+2]=matrix[2]*x+matrix[6]*y+matrix[10]*z+matrix[14];this.data[i+3]=matrix[0]*nx+matrix[4]*ny+matrix[8]*nz;this.data[i+4]=matrix[1]*nx+matrix[5]*ny+matrix[9]*nz;this.data[i+5]=matrix[2]*nx+matrix[6]*ny+matrix[10]*nz;}return this;}
  merge(g){for(const v of g.data)this.data.push(v);return this;}
}

const VS=`
attribute vec3 aPosition;attribute vec3 aNormal;attribute vec3 aColor;attribute float aSurface;attribute vec2 aUV;
uniform mat4 uModel;uniform mat4 uVP;uniform mat4 uLightVP;uniform float uTime;uniform float uHang;uniform float uRider;
varying vec3 vColor;varying vec3 vNormal;varying vec3 vWorld;varying float vSurface;varying vec2 vUV;varying vec4 vShadow;
void main(){vec3 local=aPosition;if(uRider>.5){float upper=smoothstep(.45,1.16,local.y)*clamp((.40-local.z)/.75,0.0,1.0);local.x+=sin(uHang)*.12*upper;float knee=exp(-pow((local.y-.68)*10.0,2.0)-pow((local.z+.02)*7.0,2.0));if(local.x*uHang>0.0)local.x+=sign(uHang)*abs(sin(uHang))*.075*knee;}vec4 p=uModel*vec4(local,1.0);if(aSurface>4.5&&aSurface<5.5)p.x+=sin(uTime*1.7+p.x*.3+p.z*.2)*aPosition.y*.12;vWorld=p.xyz;vNormal=mat3(uModel)*aNormal;vColor=aColor;vSurface=aSurface;vUV=aUV;vShadow=uLightVP*p;gl_Position=uVP*p;}`;
const FS=`
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform float uTime;uniform vec3 uEye;uniform vec3 uFog;uniform vec3 uSun;uniform vec3 uSunColor;uniform float uSunIntensity;uniform float uRain;uniform float uAlpha;uniform float uTextureOn;uniform float uExposure;uniform float uShadows;uniform float uShadowTexel;uniform sampler2D uTexture;uniform sampler2D uShadowMap;
varying vec3 vColor;varying vec3 vNormal;varying vec3 vWorld;varying float vSurface;varying vec2 vUV;varying vec4 vShadow;
const float PI=3.14159265;
float hash(vec2 p){return fract(sin(dot(mod(p,64.0),vec2(12.9898,78.233)))*1317.129);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
vec3 tone(vec3 x){x*=uExposure;return pow(clamp((x*(2.51*x+.03))/(x*(2.43*x+.59)+.14),0.0,1.0),vec3(1.0/2.2));}
float depthAt(vec2 uv){return dot(texture2D(uShadowMap,uv).rg,vec2(1.0,1.0/255.0));}
float shadow(float nl){if(uShadows<.5)return 1.0;vec3 q=vShadow.xyz/vShadow.w*.5+.5;if(q.x<.003||q.x>.997||q.y<.003||q.y>.997||q.z<0.0||q.z>1.0)return 1.0;float z=q.z-(.00060+.00030*(1.0-nl)),t=uShadowTexel*1.25;float s=step(z,depthAt(q.xy));s+=step(z,depthAt(q.xy+vec2(t,t)));s+=step(z,depthAt(q.xy+vec2(-t,t)));s+=step(z,depthAt(q.xy+vec2(t,-t)));s+=step(z,depthAt(q.xy-vec2(t,t)));return .18+.82*s*.2;}
vec3 environment(vec3 d){vec3 c=mix(uFog*.62,vec3(.19,.33,.51),smoothstep(0.0,.8,d.y));if(d.y<0.0)c=mix(uFog*.32,vec3(.055,.065,.045),clamp(-d.y*2.0,0.0,1.0));float sun=pow(max(dot(d,normalize(uSun)),0.0),180.0);return c+uSunColor*sun*uSunIntensity*.55;}
void main(){
 vec3 n=normalize(vNormal),view=normalize(uEye-vWorld),light=normalize(uSun),halfway=normalize(view+light);
 vec3 base=pow(max(vColor,vec3(.001)),vec3(2.2));float roughness=.83,metalness=0.0,coat=0.0;
 if(vSurface>.5&&vSurface<1.5){base*=.96+hash(vWorld.xz*86.0)*.075;roughness=mix(.78,.075,uRain);base*=mix(1.0,.50,uRain);n=normalize(n+vec3(hash(vWorld.xz*67.0)-.5,0.0,hash(vWorld.xz*111.0)-.5)*.07*(1.0-uRain*.85));}
 if(vSurface>1.5&&vSurface<2.5){base*=.87+noise(vWorld.xz*.4)*.26;roughness=.98;}
 if(vSurface>2.5&&vSurface<3.5){base*=.86+hash(vWorld.xz*27.0)*.25;roughness=.95;}
 if(vSurface>5.5&&vSurface<6.5){roughness=.22;metalness=.17;coat=.8;}
 if(vSurface>6.5&&vSurface<7.5){roughness=.17;metalness=.88;}
 if(vSurface>7.5&&vSurface<8.5){roughness=.75;base*=.85;}
 if(vSurface>8.5&&vSurface<9.5){roughness=.075;coat=1.0;metalness=.12;}
 if(vSurface>9.5&&vSurface<10.5){roughness=.34;metalness=.35;float weave=mod(floor(vUV.x*110.0)+floor(vUV.y*80.0),2.0);base*=.94+weave*.09;}
 if(vSurface>10.5&&vSurface<11.5){roughness=.51;base*=.91+hash(vUV*200.0)*.13;}
 if(vSurface>11.5&&vSurface<12.5){roughness=.15;coat=.8;}
 if(vSurface>12.5&&vSurface<13.5){roughness=.13;metalness=.18;n=normalize(n+vec3(sin(vWorld.x*.23+uTime*.6),0.0,cos(vWorld.z*.31+uTime*.5))*.06);}
 float textureAlpha=1.0;if(uTextureOn>.5){vec4 decal=texture2D(uTexture,vec2(gl_FrontFacing?vUV.x:1.0-vUV.x,vUV.y));textureAlpha=decal.a;if(textureAlpha<.03)discard;base*=pow(decal.rgb,vec3(2.2));}
 float nl=max(dot(n,light),0.0),nv=max(dot(n,view),.002),nh=max(dot(n,halfway),0.0),vh=max(dot(view,halfway),0.0);
 vec3 f0=mix(vec3(.04+uRain*.025),base,metalness),fresnel=f0+(1.0-f0)*pow(1.0-vh,5.0);
 float a=roughness*roughness,a2=a*a,denom=nh*nh*(a2-1.0)+1.0,D=a2/max(PI*denom*denom,.00004),k=(roughness+1.0)*(roughness+1.0)/8.0;
 float G=(nl/(nl*(1.0-k)+k))*(nv/(nv*(1.0-k)+k));
 vec3 spec=fresnel*(D*G/max(4.0*nl*nv,.002)),diffuse=(1.0-fresnel)*(1.0-metalness)*base/PI;
 float contact=clamp(.82+vWorld.y*.10,.82,1.0),visibility=shadow(nl);
 vec3 color=(diffuse+spec)*uSunColor*uSunIntensity*nl*visibility;
 vec3 ambient=mix(vec3(.065,.075,.063),uFog*.52,clamp(n.y*.5+.5,0.0,1.0));color+=base*ambient*(1.0-metalness)*contact;
 vec3 reflected=environment(reflect(-view,n)),envF=f0+(1.0-f0)*pow(1.0-nv,5.0);
 color+=reflected*envF*(1.0-roughness*.72)*(.55+coat*.45)*contact;
 color+=uSunColor*pow(max(dot(reflect(-light,n),view),0.0),100.0)*coat*.35*visibility;
 if(vSurface>4.5&&vSurface<5.5)color+=base*.07;
 if(vSurface>11.5&&vSurface<12.5)color+=base*1.8;
 float fog=1.0-exp(-pow(length(vWorld-uEye)/(uRain>.5?670.0:1200.0),1.55));color=mix(color,uFog*.64,clamp(fog,0.0,.98));
 gl_FragColor=vec4(tone(color),uAlpha*textureAlpha);
}`;
const SKYVS=`attribute vec2 aPosition;varying vec2 vUV;void main(){vUV=aPosition*.5+.5;gl_Position=vec4(aPosition,.999,1.0);}`;
const SKYFS=`
precision highp float;varying vec2 vUV;uniform float uMode;uniform float uAspect;uniform float uFov;uniform float uShift;uniform vec3 uForward;uniform vec3 uRight;uniform vec3 uUp;uniform vec3 uSun;
float h(vec2 p){return fract(sin(dot(mod(p,64.0),vec2(12.9898,78.233)))*1317.129);}
float n(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x),f.y);}
void main(){vec2 p=vUV*2.0-1.0;p.y-=uShift;vec3 ray=normalize(uForward+(uRight*p.x*uAspect+uUp*p.y)*uFov);float y=clamp(ray.y,0.0,1.0);vec3 horizon=vec3(.69,.74,.77),zenith=vec3(.13,.29,.51);if(uMode>.5&&uMode<1.5){horizon=vec3(.92,.57,.29);zenith=vec3(.16,.27,.43);}if(uMode>1.5){horizon=vec3(.45,.51,.57);zenith=vec3(.15,.21,.28);}vec3 color=mix(horizon,zenith,pow(y,.38));vec2 uv=ray.xz/max(.08,ray.y)*.30;float clouds=n(uv)*.57+n(uv*2.1)*.28+n(uv*4.2)*.15;float cloud=smoothstep(.46,.73,clouds)*smoothstep(.015,.18,ray.y);color=mix(color,vec3(.72,.76,.78)*(uMode>1.5?.65:1.0),cloud*.66);float sun=max(dot(ray,normalize(uSun)),0.0);if(uMode<1.5){color+=vec3(1.0,.68,.32)*pow(sun,18.0)*.25;color+=vec3(1.0,.85,.55)*pow(sun,900.0)*2.5;}color*=1.05;color=clamp((color*(2.51*color+.03))/(color*(2.43*color+.59)+.14),0.0,1.0);gl_FragColor=vec4(pow(color,vec3(1.0/2.2)),1.0);}`;
const SHADOWVS=`attribute vec3 aPosition;attribute float aSurface;uniform mat4 uModel;uniform mat4 uLightVP;uniform float uTime;uniform float uHang;uniform float uRider;void main(){vec3 local=aPosition;if(uRider>.5){float upper=smoothstep(.45,1.16,local.y)*clamp((.40-local.z)/.75,0.0,1.0);local.x+=sin(uHang)*.12*upper;float knee=exp(-pow((local.y-.68)*10.0,2.0)-pow((local.z+.02)*7.0,2.0));if(local.x*uHang>0.0)local.x+=sign(uHang)*abs(sin(uHang))*.075*knee;}vec4 p=uModel*vec4(local,1.0);if(aSurface>4.5&&aSurface<5.5)p.x+=sin(uTime*1.7+p.x*.3+p.z*.2)*aPosition.y*.12;gl_Position=uLightVP*p;}`;
const SHADOWFS=`precision highp float;void main(){vec2 e=fract(vec2(1.0,255.0)*min(gl_FragCoord.z,.99999));e.x-=e.y/255.0;gl_FragColor=vec4(e,0.0,1.0);}`;
const POSTFS=`precision mediump float;varying vec2 vUV;uniform sampler2D uScene;uniform vec2 uTexel;uniform float uBloom;void main(){vec3 c=texture2D(uScene,vUV).rgb,u=texture2D(uScene,vUV+vec2(0.0,uTexel.y)).rgb,d=texture2D(uScene,vUV-vec2(0.0,uTexel.y)).rgb,l=texture2D(uScene,vUV-vec2(uTexel.x,0.0)).rgb,r=texture2D(uScene,vUV+vec2(uTexel.x,0.0)).rgb;float edge=length(u-d)+length(l-r);c=mix(c,(u+d+l+r+c*4.0)/8.0,smoothstep(.12,.5,edge)*.7);vec3 bloom=max(texture2D(uScene,vUV+uTexel*vec2(6,0)).rgb-.78,0.0)+max(texture2D(uScene,vUV-uTexel*vec2(6,0)).rgb-.78,0.0)+max(texture2D(uScene,vUV+uTexel*vec2(0,6)).rgb-.78,0.0)+max(texture2D(uScene,vUV-uTexel*vec2(0,6)).rgb-.78,0.0);c+=bloom*uBloom*.10;float vignette=1.0-dot(vUV-.5,vUV-.5)*.19;c*=vignette;gl_FragColor=vec4(c,1.0);}`;

// Dedicated lighting for integrated GPUs: no procedural noise, PBR, shadow
// sampling, reflection or full-screen post-processing in the performance path.
const LITEFS=`precision mediump float;
uniform vec3 uEye;uniform vec3 uFog;uniform vec3 uSun;uniform float uRain;
uniform float uAlpha;uniform float uTextureOn;uniform sampler2D uTexture;
varying vec3 vColor;varying vec3 vNormal;varying vec3 vWorld;
varying float vSurface;varying vec2 vUV;
void main(){
 vec3 n=normalize(vNormal);float diffuse=max(dot(n,normalize(uSun)),0.0);
 vec4 decal=vec4(1.0);if(uTextureOn>.5){decal=texture2D(uTexture,vec2(gl_FrontFacing?vUV.x:1.0-vUV.x,vUV.y));if(decal.a<.03)discard;}
 vec3 color=vColor*decal.rgb*(.54+diffuse*.61);
 if(vSurface>5.5&&vSurface<7.5){vec3 view=normalize(uEye-vWorld);color+=vec3(.15)*pow(max(dot(reflect(-normalize(uSun),n),view),0.0),12.0);}
 if(vSurface>11.5&&vSurface<12.5)color+=vColor*.3;
 color*=1.0-uRain*.15;
 float distanceFog=clamp(length(vWorld-uEye)/600.0,0.0,1.0);
 color=mix(color,uFog,distanceFog*distanceFog*.9);
 gl_FragColor=vec4(color,uAlpha*decal.a);
}`;

function orthographic(size,near=.1,far=420){return new Float32Array([1/size,0,0,0,0,1/size,0,0,0,0,-2/(far-near),0,0,0,-(far+near)/(far-near),1]);}
export class Renderer{
 constructor(canvas){
  this.canvas=canvas;this.gl=canvas.getContext('webgl',{antialias:false,alpha:false,powerPreference:'high-performance'});if(!this.gl)throw new Error('WebGL non è disponibile. Attiva l’accelerazione hardware del browser per giocare.');
  const gl=this.gl;this.program=this.programFrom(VS,FS);this.skyProgram=this.programFrom(SKYVS,SKYFS);this.shadowProgram=this.programFrom(SHADOWVS,SHADOWFS);this.postProgram=this.programFrom(SKYVS,POSTFS);
  this.locations={};for(const name of ['uModel','uVP','uLightVP','uEye','uFog','uSun','uSunColor','uSunIntensity','uRain','uAlpha','uTextureOn','uTexture','uTime','uExposure','uShadows','uShadowTexel','uShadowMap','uHang','uRider'])this.locations[name]=gl.getUniformLocation(this.program,name);
  this.attributes=['aPosition','aNormal','aColor','aSurface','aUV'].map(name=>gl.getAttribLocation(this.program,name));
  this.cinema={program:this.program,locations:this.locations,attributes:this.attributes};
  const liteProgram=this.programFrom(VS,LITEFS),liteLocations={};for(const name of Object.keys(this.locations))liteLocations[name]=gl.getUniformLocation(liteProgram,name);
  this.lite={program:liteProgram,locations:liteLocations,attributes:['aPosition','aNormal','aColor','aSurface','aUV'].map(name=>gl.getAttribLocation(liteProgram,name))};
  this.governor=new ResolutionGovernor();this.stats={triangles:0,draws:0};
  this.skyLocations={};for(const name of ['uMode','uAspect','uFov','uShift','uForward','uRight','uUp','uSun'])this.skyLocations[name]=gl.getUniformLocation(this.skyProgram,name);
  this.shadowLocations={};for(const name of ['uModel','uLightVP','uTime','uHang','uRider'])this.shadowLocations[name]=gl.getUniformLocation(this.shadowProgram,name);
  this.shadowAttributes=[gl.getAttribLocation(this.shadowProgram,'aPosition'),gl.getAttribLocation(this.shadowProgram,'aSurface')];
  this.postLocations={scene:gl.getUniformLocation(this.postProgram,'uScene'),texel:gl.getUniformLocation(this.postProgram,'uTexel'),bloom:gl.getUniformLocation(this.postProgram,'uBloom')};
  this.skyBuffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,this.skyBuffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),gl.STATIC_DRAW);
  this.quality='high';this.weather='sunset';this.meshes=[];this.eye=[0,4,0];this.vp=identity();this.lightVP=identity();this.time=0;this.shadowValid=false;this.shadowTarget=null;this.sceneTarget=null;
  this.whiteTexture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,this.whiteTexture);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,1,1,0,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array([255,255,255,255]));gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
  gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);this.resize();
 }
 programFrom(v,f){const gl=this.gl,compile=(type,source)=>{const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(s));return s;};const p=gl.createProgram(),vs=compile(gl.VERTEX_SHADER,v),fs=compile(gl.FRAGMENT_SHADER,f);gl.attachShader(p,vs);gl.attachShader(p,fs);gl.linkProgram(p);gl.deleteShader(vs);gl.deleteShader(fs);if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(p));return p;}
 resize(){const gl=this.gl,max=gl.getParameter(gl.MAX_TEXTURE_SIZE)||4096,dpr=this.quality==='low'?Math.min(1,1280/this.canvas.clientWidth,720/this.canvas.clientHeight)*this.governor.scale:Math.min(globalThis.devicePixelRatio||1,1.65,max/Math.max(this.canvas.clientWidth,this.canvas.clientHeight));const w=Math.max(1,Math.floor(this.canvas.clientWidth*dpr)),h=Math.max(1,Math.floor(this.canvas.clientHeight*dpr));if(this.canvas.width!==w||this.canvas.height!==h){this.canvas.width=w;this.canvas.height=h;}this.aspect=w/h;}
 mesh(g){const gl=this.gl,buffer=gl.createBuffer();if(!buffer)throw Error('Memoria grafica insufficiente. Riprova con la grafica Prestazioni.');gl.bindBuffer(gl.ARRAY_BUFFER,buffer);try{const data=g.data instanceof Float32Array?g.data:new Float32Array(g.data);gl.bufferData(gl.ARRAY_BUFFER,data,gl.STATIC_DRAW);if(gl.getError()===gl.OUT_OF_MEMORY)throw Error('Memoria grafica insufficiente. Riprova con la grafica Prestazioni.');}catch(error){gl.deleteBuffer(buffer);throw error;}const m={buffer,count:g.data.length/12};this.meshes.push(m);return m;}
 destroy(mesh){if(!mesh)return;if(mesh.chunks){for(const chunk of mesh.chunks)this.destroy(chunk);return;}this.gl.deleteBuffer(mesh.buffer);const i=this.meshes.indexOf(mesh);if(i>=0)this.meshes.splice(i,1);}
 spatialMesh(g){
  const cells=new Map(),size=100;
  for(let i=0;i<g.data.length;i+=36){const x=(g.data[i]+g.data[i+12]+g.data[i+24])/3,z=(g.data[i+2]+g.data[i+14]+g.data[i+26])/3,key=Math.floor(x/size)+','+Math.floor(z/size);let cell=cells.get(key);if(!cell){cell=[];cells.set(key,cell);}for(let k=0;k<36;k++)cell.push(g.data[i+k]);}
  const chunks=[];
  for(const data of cells.values()){
   let minX=Infinity,minY=Infinity,minZ=Infinity,maxX=-Infinity,maxY=-Infinity,maxZ=-Infinity;
   for(let i=0;i<data.length;i+=12){minX=Math.min(minX,data[i]);maxX=Math.max(maxX,data[i]);minY=Math.min(minY,data[i+1]);maxY=Math.max(maxY,data[i+1]);minZ=Math.min(minZ,data[i+2]);maxZ=Math.max(maxZ,data[i+2]);}
   chunks.push(Object.assign(this.mesh({data}),{center:[(minX+maxX)/2,(minY+maxY)/2,(minZ+maxZ)/2],radius:Math.hypot(maxX-minX,maxY-minY,maxZ-minZ)/2}));
  }
  return{chunks,count:g.data.length/12};
 }
 visible(mesh){
  const c=mesh.center,r=mesh.radius,m=this.vp;
  if(Math.hypot(c[0]-this.eye[0],c[2]-this.eye[2])>r+(this.quality==='low'?480:1400))return false;
  for(const axis of[0,1,2])for(const sign of[-1,1]){const a=m[3]+sign*m[axis],b=m[7]+sign*m[4+axis],d=m[11]+sign*m[8+axis],e=m[15]+sign*m[12+axis];if(a*c[0]+b*c[1]+d*c[2]+e < -r*Math.hypot(a,b,d))return false;}
  return true;
 }
 texture(canvas){if(this.quality==='low'&&Math.max(canvas.width,canvas.height)>256){const source=canvas,scale=256/Math.max(source.width,source.height);canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(source.width*scale));canvas.height=Math.max(1,Math.round(source.height*scale));canvas.getContext('2d').drawImage(source,0,0,canvas.width,canvas.height);}const gl=this.gl,t=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,t);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,canvas);this.textureParameters();return t;}
 textureParameters(){const gl=this.gl;gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);}
 target(width,height){const gl=this.gl,framebuffer=gl.createFramebuffer(),texture=gl.createTexture(),depth=gl.createRenderbuffer();gl.bindTexture(gl.TEXTURE_2D,texture);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,width,height,0,gl.RGBA,gl.UNSIGNED_BYTE,null);this.textureParameters();gl.bindFramebuffer(gl.FRAMEBUFFER,framebuffer);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,texture,0);gl.bindRenderbuffer(gl.RENDERBUFFER,depth);gl.renderbufferStorage(gl.RENDERBUFFER,gl.DEPTH_COMPONENT16,width,height);gl.framebufferRenderbuffer(gl.FRAMEBUFFER,gl.DEPTH_ATTACHMENT,gl.RENDERBUFFER,depth);const complete=gl.checkFramebufferStatus(gl.FRAMEBUFFER)===gl.FRAMEBUFFER_COMPLETE;gl.bindFramebuffer(gl.FRAMEBUFFER,null);return{framebuffer,texture,depth,width,height,complete};}
 freeTarget(target){if(!target)return;const gl=this.gl;gl.deleteFramebuffer(target.framebuffer);gl.deleteTexture(target.texture);gl.deleteRenderbuffer(target.depth);}
 sun(){return this.weather==='sunset'?[-.40,.50,.75]:[-.35,.85,-.30];}
 disableAttributes(){const gl=this.gl;for(const a of new Set([...this.attributes,...this.shadowAttributes]))if(a>=0)gl.disableVertexAttribArray(a);}
 quad(program){const gl=this.gl;this.disableAttributes();gl.bindBuffer(gl.ARRAY_BUFFER,this.skyBuffer);const a=gl.getAttribLocation(program,'aPosition');gl.enableVertexAttribArray(a);gl.vertexAttribPointer(a,2,gl.FLOAT,false,0,0);}
 shadowPass(world,objects,center,radius=80){
  this.time=(globalThis.performance?.now()||0)/1000;this.shadowValid=false;if(this.quality==='low'){if(this.shadowTarget){this.freeTarget(this.shadowTarget);this.shadowTarget=null;}return;}if(this.weather==='rain')return;
  const gl=this.gl,size=Math.min(2048,this.gl.getParameter(this.gl.MAX_TEXTURE_SIZE)||2048);if(!this.shadowTarget||this.shadowTarget.width!==size){this.freeTarget(this.shadowTarget);this.shadowTarget=this.target(size,size);}if(!this.shadowTarget.complete)return;gl.bindTexture(gl.TEXTURE_2D,this.shadowTarget.texture);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);
  const sun=V.norm(this.sun()),texel=radius*2/size,focus=[Math.round(center[0]/texel)*texel,center[1],Math.round(center[2]/texel)*texel],eye=focus.map((v,i)=>v+sun[i]*190);
  this.lightVP=multiply(orthographic(radius),lookAt(eye,focus));gl.bindFramebuffer(gl.FRAMEBUFFER,this.shadowTarget.framebuffer);gl.viewport(0,0,size,size);gl.clearColor(1,1,1,1);gl.depthMask(true);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);gl.enable(gl.DEPTH_TEST);gl.disable(gl.BLEND);gl.disable(gl.DITHER);gl.useProgram(this.shadowProgram);this.disableAttributes();gl.uniformMatrix4fv(this.shadowLocations.uLightVP,false,this.lightVP);gl.uniform1f(this.shadowLocations.uTime,this.time);
  const draw=(mesh,matrix,hang=0,rider=false)=>{gl.uniform1f(this.shadowLocations.uHang,hang);gl.uniform1f(this.shadowLocations.uRider,rider?1:0);gl.bindBuffer(gl.ARRAY_BUFFER,mesh.buffer);gl.enableVertexAttribArray(this.shadowAttributes[0]);gl.vertexAttribPointer(this.shadowAttributes[0],3,gl.FLOAT,false,48,0);gl.enableVertexAttribArray(this.shadowAttributes[1]);gl.vertexAttribPointer(this.shadowAttributes[1],1,gl.FLOAT,false,48,36);gl.uniformMatrix4fv(this.shadowLocations.uModel,false,matrix);gl.drawArrays(gl.TRIANGLES,0,mesh.count);};
  for(const mesh of world.chunks||[world])if(!mesh.center||Math.hypot(mesh.center[0]-center[0],mesh.center[2]-center[2])<mesh.radius+radius*1.5)draw(mesh,identity());for(const o of objects)if(!o.texture)draw(o.mesh,o.matrix,o.lean||0,!!o.rider);gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.enable(gl.BLEND);gl.enable(gl.DITHER);this.shadowValid=true;
 }
 begin(eye,target,fov=1.04,roll=0,shiftY=0){
  const variant=this.quality==='low'?this.lite:this.cinema;this.program=variant.program;this.locations=variant.locations;this.attributes=variant.attributes;this.stats={triangles:0,draws:0};
  this.resize();const gl=this.gl;this.eye=eye;const projection=perspective(fov,this.aspect);projection[9]=-shiftY;const up=[Math.sin(roll),Math.cos(roll),0];this.vp=multiply(projection,lookAt(eye,target,up));
  if(this.quality==='low'){if(this.sceneTarget){this.freeTarget(this.sceneTarget);this.sceneTarget=null;}gl.bindFramebuffer(gl.FRAMEBUFFER,null);}else{if(!this.sceneTarget||this.sceneTarget.width!==this.canvas.width||this.sceneTarget.height!==this.canvas.height){this.freeTarget(this.sceneTarget);this.sceneTarget=this.target(this.canvas.width,this.canvas.height);}gl.bindFramebuffer(gl.FRAMEBUFFER,this.sceneTarget.complete?this.sceneTarget.framebuffer:null);}gl.viewport(0,0,this.canvas.width,this.canvas.height);gl.clearColor(.1,.12,.15,1);gl.depthMask(true);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
  gl.disable(gl.DEPTH_TEST);gl.disable(gl.BLEND);gl.useProgram(this.skyProgram);this.quad(this.skyProgram);const forward=V.norm(V.sub(target,eye)),right=V.norm(V.cross(forward,up)),skyUp=V.cross(right,forward);
  gl.uniform1f(this.skyLocations.uMode,{day:0,sunset:1,rain:2}[this.weather]);gl.uniform1f(this.skyLocations.uAspect,this.aspect);gl.uniform1f(this.skyLocations.uFov,Math.tan(fov/2));gl.uniform1f(this.skyLocations.uShift,shiftY);gl.uniform3fv(this.skyLocations.uForward,forward);gl.uniform3fv(this.skyLocations.uRight,right);gl.uniform3fv(this.skyLocations.uUp,skyUp);gl.uniform3fv(this.skyLocations.uSun,this.sun());gl.drawArrays(gl.TRIANGLES,0,6);gl.enable(gl.DEPTH_TEST);gl.enable(gl.BLEND);gl.useProgram(this.program);
  gl.uniformMatrix4fv(this.locations.uVP,false,this.vp);gl.uniformMatrix4fv(this.locations.uLightVP,false,this.lightVP);gl.uniform3fv(this.locations.uEye,eye);gl.uniform3fv(this.locations.uFog,this.weather==='rain'?[.48,.54,.61]:this.weather==='day'?[.67,.79,.92]:[.80,.59,.41]);gl.uniform3fv(this.locations.uSun,this.sun());gl.uniform3fv(this.locations.uSunColor,this.weather==='sunset'?[1,.80,.61]:[1,.97,.90]);gl.uniform1f(this.locations.uSunIntensity,this.weather==='rain'?.7:this.weather==='sunset'?3.4:3.1);gl.uniform1f(this.locations.uExposure,this.weather==='rain'?1.5:1.18);gl.uniform1f(this.locations.uRain,this.weather==='rain'?1:0);gl.uniform1f(this.locations.uTime,this.time);gl.uniform1f(this.locations.uShadows,this.shadowValid?1:0);gl.uniform1f(this.locations.uShadowTexel,this.shadowTarget?1/this.shadowTarget.width:1/1536);gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,this.shadowValid?this.shadowTarget.texture:this.whiteTexture);gl.uniform1i(this.locations.uShadowMap,1);gl.activeTexture(gl.TEXTURE0);
 }
 draw(mesh,matrix=identity(),alpha=1,texture=null,hang=0,rider=false){if(!mesh)return;if(mesh.chunks){for(const chunk of mesh.chunks)if(this.visible(chunk))this.draw(chunk,matrix,alpha,texture,hang,rider);return;}this.stats.triangles+=mesh.count/3;this.stats.draws++;const gl=this.gl;gl.bindBuffer(gl.ARRAY_BUFFER,mesh.buffer);const sizes=[3,3,3,1,2],offsets=[0,12,24,36,40];this.attributes.forEach((a,i)=>{if(a>=0){gl.enableVertexAttribArray(a);gl.vertexAttribPointer(a,sizes[i],gl.FLOAT,false,48,offsets[i]);}});gl.uniformMatrix4fv(this.locations.uModel,false,matrix);gl.uniform1f(this.locations.uAlpha,alpha);gl.uniform1f(this.locations.uHang,hang);gl.uniform1f(this.locations.uRider,rider?1:0);gl.uniform1f(this.locations.uTextureOn,texture?1:0);gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,texture||this.whiteTexture);gl.uniform1i(this.locations.uTexture,0);if(alpha<1)gl.depthMask(false);gl.drawArrays(gl.TRIANGLES,0,mesh.count);if(alpha<1)gl.depthMask(true);}
 finish(){if(!this.sceneTarget?.complete)return;const gl=this.gl;gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.viewport(0,0,this.canvas.width,this.canvas.height);gl.disable(gl.DEPTH_TEST);gl.disable(gl.BLEND);gl.useProgram(this.postProgram);this.quad(this.postProgram);gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,this.sceneTarget.texture);gl.uniform1i(this.postLocations.scene,0);gl.uniform2f(this.postLocations.texel,1/this.canvas.width,1/this.canvas.height);gl.uniform1f(this.postLocations.bloom,this.quality==='low'?.35:1);gl.drawArrays(gl.TRIANGLES,0,6);gl.enable(gl.DEPTH_TEST);gl.enable(gl.BLEND);}
}

function seeded(seed=27){let s=seed;return()=>{s=(Math.imul(s,1664525)+1013904223)|0;return(s>>>0)/4294967296;};}
function strip(g,track,s1,s2,w1,w2,y,color,surface=0){const a=track.sample(s1,w1),b=track.sample(s2,w1),c=track.sample(s2,w2),d=track.sample(s1,w2),p=q=>[q.x,y+(q.y||0),q.z];if(w2>w1)g.quad(p(a),p(b),p(c),p(d),color,surface);else g.quad(p(d),p(c),p(b),p(a),color,surface);}

function markTexture(renderer,text){const canvas=document.createElement('canvas');canvas.width=512;canvas.height=128;const c=canvas.getContext('2d');c.fillStyle='#14191d';c.fillRect(0,0,512,128);c.fillStyle='#ff6033';c.fillRect(0,0,9,128);let size=65;c.font='italic bold '+size+'px Arial';while(c.measureText(text).width>470&&size>16)c.font='italic bold '+(--size)+'px Arial';c.textAlign='center';c.fillStyle='#eeeeea';c.fillText(text,260,86);c.fillStyle='#ff6033';c.fillRect(432,18,10,12);return renderer.texture(canvas);}


function mountain(g,x,z,r,h,rng,red=false){
 const phase=rng()*6.28;
 const fn=(u,v)=>{const a=v*Math.PI*2,edge=.89+.06*Math.sin(a*5+phase)+.035*Math.cos(a*9-phase),ridge=1+.14*Math.pow(u,.35)*Math.sin(a*4+phase)*Math.cos(u*7)+.05*Math.sin(a*11+u*9)*Math.sin(u*Math.PI);return[x+Math.cos(a)*r*u*edge+(1-u)*r*.12,h*Math.pow(1-u,1.35)*ridge-15,z+Math.sin(a)*r*u*edge];};
 panel(g,fn,24,56,(u,v)=>{const y=fn(u,v)[1],grain=.97+.04*Math.sin(v*180+u*90);return(red?(y>h*.57?[.67,.38,.23]:y>h*.29?[.56,.26,.15]:[.40,.24,.16]):y>h*.57?[.79,.83,.84]:y>h*.29?[.35,.39,.39]:[.24,.32,.28]).map(v=>v*grain);},2,true);
}

function pine(g,p,h,rng){
  g.cylinder([p.x,0,p.z],[p.x,h*.94,p.z],.19,[.24,.18,.12],8,.045);
  for(let tier=0;tier<8;tier++){
    const y=h*(.20+tier*.094),r=h*(.24-tier*.022),top=y+h*.30;
    for(let i=0;i<13;i++){
      const a=i/13*Math.PI*2,b=(i+1)/13*Math.PI*2,R=r*(.84+rng()*.28),col=[.08+rng()*.025,.20+rng()*.045,.14+rng()*.025];
      g.tri([p.x+Math.cos(a)*R,y,p.z+Math.sin(a)*R],[p.x,h*.01+top,p.z],[p.x+Math.cos(b)*R,y,p.z+Math.sin(b)*R],col);
      if(tier<5&&i%3===0)g.cylinder([p.x,y+.3,p.z],[p.x+Math.cos(a)*R*.85,y,p.z+Math.sin(a)*R*.85],.032,[.26,.20,.13],5,.012);
    }
  }
}
function blossom(g,p,h,rng){
  const bark=[.28,.20,.20];g.cylinder([p.x,0,p.z],[p.x+.25,h*.64,p.z],.22,bark,9,.11);
  for(let j=0;j<6;j++){
    const a=j*Math.PI/3+rng()*.5,x=p.x+Math.cos(a)*h*.25,z=p.z+Math.sin(a)*h*.25,y=h*(.70+rng()*.20);
    g.cylinder([p.x,h*.39,p.z],[x,y-.35,z],.09,bark,7,.035);
    const cluster=new Geometry().sphere([x,y,z],[h*.23,h*.17,h*.22],[.84+rng()*.12,.52+rng()*.16,.65+rng()*.13],14,8);
    // Irregular crowns keep the blossoms from reading as perfect spheres.
    for(let k=0;k<cluster.data.length;k+=12){const X=cluster.data[k]-x,Y=cluster.data[k+1]-y,Z=cluster.data[k+2]-z,q=1+.065*Math.sin(X*5+Z*7)*Math.cos(Y*6);cluster.data[k]=x+X*q;cluster.data[k+1]=y+Y*q;cluster.data[k+2]=z+Z*q;}
    g.merge(cluster);
  }
}
function pavilion(g,p){
  const q=new Geometry(),wood=[.39,.12,.085],roof=[.16,.20,.22];
  q.box([0,.3,0],[12,.6,10],[.58,.57,.51]);
  for(const x of [-4.8,4.8])for(const z of[-3.8,3.8])q.cylinder([x,.6,z],[x,5.8,z],.20,wood,10);
  for(const z of [-3.9,3.9])q.box([0,1.1,z],[10,.12,.12],wood);
  for(let tier=0;tier<2;tier++){
    const y=5+tier*2.5,w=7-tier*1.8,d=5.8-tier*1.6;
    for(const sign of[-1,1])panel(q,(u,v)=>{const z=lerp(-d,d,u),x=sign*v*w;return[x,y+1.7*(1-v)*(1-v)+.3*Math.pow(Math.abs(z/d),4)*v,z];},20,10,roof,7);
    q.cylinder([0,y+1.75,-d],[0,y+1.75,d],.07,[.50,.39,.19],8);
  }
  g.merge(q.transform(modelMatrix([p.x,0,p.z],p.yaw)));
}
function harbor(g,track,rng){
  const east=track.bounds.maxX+100;
  g.quad([east,-.04,-1900],[east,-.04,1900],[2100,-.04,1900],[2100,-.04,-1900],[.16,.38,.45],13);
  g.box([east-7,.38,0],[14,.8,2100],[.50,.52,.51]);
  for(let j=0;j<6;j++){
    const z=-750+j*250,x=east-12,q=new Geometry();
    q.box([0,15,0],[2,30,2],[.83,.34,.16]);q.box([8,31,0],[56,1.4,1.8],[.88,.42,.18]);
    for(const side of [-1,1])q.cylinder([0,28,side*.7],[34,31,side*.7],.1,[.7,.74,.74],6);
    q.cylinder([28,31,0],[28,15,0],.045,[.25,.28,.29],6);q.box([28,14.8,0],[1.5,.7,1.2],[.86,.66,.2]);
    for(let k=0;k<12;k++)q.cylinder([-19+k*4,30.5,-.8],[-15+k*4,31.6,.8],.10,[.63,.27,.15],5);
    g.merge(q.transform(modelMatrix([x,0,z])));
  }
  for(let j=0;j<6;j++){
    const boat=new Geometry();loft(boat,[[-12,.5,.02,.05],[-9,.8,2.1,.75],[3,.8,2.5,.85],[10,.9,1.8,.65],[14,1,.02,.02]],[.85,.87,.86],6,32,18);
    boat.box([0,1.6,-1],[3.9,1.5,13],[.89,.90,.87]);boat.box([0,2.9,-2],[2.8,1.2,6],[.79,.83,.83]);boat.box([0,2.8,.9],[2.7,.6,.10],[.11,.27,.33]);
    boat.cylinder([0,3.5,-4],[0,7.5,-4],.06,[.65,.7,.71],8);g.merge(boat.transform(modelMatrix([east+26+(j%2)*18,0,-500+j*180],.15)));
  }
  // City blocks are placed beyond the runoff, clear of every part of the loop.
  for(let i=0;i<46;i++){
    const p=track.sample(i/46*track.length,(i%2?1:-1)*(95+rng()*90));if(track.nearestDistance(p.x,p.z)<60||p.x>east-25)continue;
    const q=new Geometry(),w=14+rng()*16,d=13+rng()*15,h=22+rng()*80,col=[.34+rng()*.12,.40+rng()*.12,.45+rng()*.12];q.box([0,h/2,0],[w,h,d],col);q.box([0,h+.4,0],[w+1,.8,d+1],[.20,.24,.27]);
    for(let row=0;row<Math.floor(h/4.8);row++)for(let c=0;c<4;c++){
      const x=(c-1.5)*w/4,y=3+row*4.8,window=rng()>.8?[.64,.59,.40]:[.22,.35,.44];
      q.quad([x-w*.075,y,-d/2-.02],[x+w*.075,y,-d/2-.02],[x+w*.075,y+2.6,-d/2-.02],[x-w*.075,y+2.6,-d/2-.02],window,9);
      q.quad([x+w*.075,y,d/2+.02],[x-w*.075,y,d/2+.02],[x-w*.075,y+2.6,d/2+.02],[x+w*.075,y+2.6,d/2+.02],window,9);
    }
    g.merge(q.transform(modelMatrix([p.x,0,p.z],p.yaw)));
  }
}
function terrainSampler(track){
 if(!track.config.elevation)return()=>0;const cache=new Map(),cell=10;
 const sample=(ix,iz)=>{const key=ix+','+iz;if(cache.has(key))return cache.get(key);const x=ix*cell,z=iz*cell;let best=1e20,at=0;for(let i=0;i<track.count;i+=3){const p=track.nodes[i],d=(x-p.x)**2+(z-p.z)**2;if(d<best){best=d;at=i;}}const distance=Math.sqrt(best),fade=clamp(1-Math.max(0,distance-70)/360,0,1),height=track.sample(at*track.step).y*fade-1.1*clamp(1-distance/70,0,1);cache.set(key,height);return height;};
 return(x,z)=>{const b=track.bounds;if(x<b.minX-550||x>b.maxX+550||z<b.minZ-550||z>b.maxZ+550)return 0;const ix=Math.floor(x/cell),iz=Math.floor(z/cell),u=x/cell-ix,v=z/cell-iz;return lerp(lerp(sample(ix,iz),sample(ix+1,iz),u),lerp(sample(ix,iz+1),sample(ix+1,iz+1),u),v);};
}
function buildTerrain(g,track,height,color){
 const b=track.bounds,axis=(min,max)=>{const arr=[Math.min(-3000,min-1000)];for(let x=Math.floor((min-180)/12)*12;x<=max+180;x+=12)arr.push(x);arr.push(Math.max(3000,max+1000));return arr;},xs=axis(b.minX,b.maxX),zs=axis(b.minZ,b.maxZ);
 for(let i=0;i<xs.length-1;i++)for(let j=0;j<zs.length-1;j++){const x=xs[i],X=xs[i+1],z=zs[j],Z=zs[j+1],point=(x,z)=>[x,height(x,z)-.10,z];g.quad(point(x,z),point(x,Z),point(X,Z),point(X,z),color,2);}
}
export function buildWorld(renderer,track){return allocateScene(renderer,scope=>createWorld(scope,track));}
function createWorld(renderer,track){
  if(renderer.compat)return{mesh:{},line:{},boards:[],textures:[],flags:[]};
  const low=renderer.quality==='low';Geometry.detail=low?.35:1;
  const g=new Geometry(),line=new Geometry(),rng=seeded(track.config.id.split('').reduce((n,c)=>n+c.charCodeAt(0)*129,0)),desert=['desert','canyon'].includes(track.config.theme),coast=track.config.theme==='coast',alpine=track.config.theme==='alpine',forest=track.config.theme==='forest',sakura=track.config.theme==='sakura',marina=track.config.theme==='marina';
  const grass=desert?[.57,.43,.29]:alpine?[.21,.34,.25]:sakura?[.30,.38,.27]:marina?[.35,.39,.37]:coast?[.27,.38,.22]:[.29,.36,.20],gravel=desert?[.68,.53,.34]:[.65,.59,.45],road=[.20,.22,.23];
  const terrain=terrainSampler(track);if(track.config.elevation)buildTerrain(g,track,terrain,grass);else g.quad([-2200,-.07,-2200],[-2200,-.07,2200],[2200,-.07,2200],[2200,-.07,-2200],grass,2);
  const w=track.halfWidth,pitSide=track.config.pitSide||-1;
  for(let i=0;i<track.count;i++){
    const s=i*track.step,e=(i+1)*track.step;
    strip(g,track,s,e,-w,w,.025,road,1);
    for(const sign of[-1,1]){strip(g,track,s,e,sign*w,sign*(w+.8),.047,Math.floor(i/2)%2===0?(alpine?[.13,.38,.67]:marina?[.08,.53,.54]:[.86,.11,.09]):[.91,.89,.81]);strip(g,track,s,e,sign*(w+.8),sign*(w+3.2),.012,desert?[.27,.38,.33]:[.20,.40,.27]);strip(g,track,s,e,sign*(w+3.2),sign*(w+15),.005,gravel,3);strip(g,track,s,e,sign*(w-.15),sign*(w-.3),.032,[.77,.78,.73]);}
    if(i%3!==0){const p=track.sample(s),apex=clamp(p.k*220,-3.7,3.7),speed=track.targetSpeed(s,renderer.weather==='rain'?.74:1),color=speed<43?[1,.29,.075]:[.39,.87,.43];strip(line,track,s,e,apex-.10,apex+.10,.048,color);}
  }
  for(let j=0;j<24;j++)for(let r=0;r<2;r++)strip(g,track,r*.75,(r+1)*.75,-w+j*w*2/24,-w+(j+1)*w*2/24,.035,(j+r)%2?[.035,.04,.045]:[.94,.94,.89]);
  for(let i=0;i<8;i++){const s=-i*7-5,side=i%2?-1.65:1.65;strip(g,track,s,s+.13,side-.8,side+.8,.035,[.72,.74,.72]);strip(g,track,s,s+2,side-.8,side-.70,.035,[.72,.74,.72]);strip(g,track,s,s+2,side+.70,side+.8,.035,[.72,.74,.72]);}
  for(let s=50;s<track.length;s+=32)if(Math.abs(track.sample(s).k)>.011){for(const side of[-.14,.14])strip(g,track,s-20,s+6,side-.06,side+.06,.031,[.12,.135,.14],1);}
  // Extra detail with a small geometry cost in both graphics modes.
  // Dedicated pit access, painted speed-limit line and individual garage bays.
  for(let s=-45;s<210;s+=5){
   strip(g,track,s,s+5,pitSide*(w+11),pitSide*(w+6),.035,[.25,.27,.28],1);
   if(Math.floor(s/5)%2===0)strip(g,track,s,s+3,pitSide*(w+6.2),pitSide*(w+6),.045,[1,.84,.18]);
  }
  for(let s=100;s<track.length;s+=95){
   const curve=track.sample(s).k;if(Math.abs(curve)<.007)continue;
   const sign=curve>0?-1:1;
   for(let j=0;j<4;j++)strip(g,track,s-8,s+8,sign*(w+3.5+j*1.25),sign*(w+4.75+j*1.25),.019,j%2?[.77,.17,.17]:[.12,.36,.64]);
  }
  const staticStart=g.data.length;
  for(let s=0;s<track.length;s+=19){for(const sign of[-1,1]){
    const a=track.sample(s,sign*(w+16.3)),b=track.sample(s+19,sign*(w+16.3));
    g.cylinder([a.x,.05,a.z],[a.x,1.75,a.z],.065,[.34,.36,.35],4);
    for(const y of[.35,.8,1.25])g.cylinder([a.x,y,a.z],[b.x,y,b.z],.045,[.54,.56,.52],4);
    if(Math.floor(s/19)%7===0)g.box([a.x,2,a.z],[.7,.38,.6],[.98,.72,.18],a.yaw);
  }}
  // Pit garages, a paddock tower, and the start gantry.
  const pit=scenerySite(track,95,pitSide*38,19,150)||track.sample(95,pitSide*130),local=new Geometry();
  local.box([0,4.8,0],[15,9.6,132],[.69,.71,.68]);local.box([0,10.1,0],[16,1,137],[.25,.28,.28]);
  for(let i=-5;i<=5;i++){local.box([7.56,3,i*11],[.05,4.5,7.8],[.12,.16,.18]);local.box([7.61,6.6,i*11],[.10,1.8,8.8],[.25,.40,.45]);local.box([7.68,8.1,i*11],[.12,.35,9.8],[1,.235,.085]);}
  local.box([0,9.2,0],[15.3,.35,130],[.89,.88,.79]);local.box([-4,17,57],[9,14,12],[.48,.53,.51]);local.box([-4,24.2,57],[11,.4,13],[.22,.25,.27]);local.box([.55,20,57],[.2,4,9],[.23,.40,.43]);g.merge(local.transform(modelMatrix([pit.x,0,pit.z],pit.yaw)));
  const gantry=track.sample(3);const gate=new Geometry();gate.box([-11,5.3,0],[.4,10.6,.4],[.27,.29,.3]);gate.box([11,5.3,0],[.4,10.6,.4],[.27,.29,.3]);gate.box([0,10.5,0],[22,1.4,.5],[.11,.15,.18]);for(let i=-2;i<=2;i++)gate.sphere([i*.65,10.5,-.29],[.20,.20,.1],[.59,.03,.03],8,4);g.merge(gate.transform(modelMatrix([gantry.x,0,gantry.z],gantry.yaw)));
  // Grandstands and individual crowd colors, combined in one static mesh.
  for(const station of[170,track.length*.44,track.length*.7]){
    const p=scenerySite(track,station,42,28,72);if(!p)continue;const stand=new Geometry();
    for(let row=0;row<6;row++){
      stand.box([row*1.65,row*.7+.7,0],[2,.8,62],[.45,.48,.46]);
      for(let j=-23;j<=23;j++)if(rng()>.11){const colors=[[.80,.12,.06],[.23,.41,.75],[.77,.76,.7],[.15,.18,.19],[.92,.7,.18]];stand.box([row*1.65,row*.7+1.4,j*1.2],[.5,.62,.4],colors[Math.floor(rng()*5)]);stand.sphere([row*1.65,row*.7+1.91,j*1.2],[.19,.2,.18],[.72,.54,.4],5,3);}
    }
    stand.box([4.5,8.6,0],[14,.28,65],[.73,.74,.71]);stand.box([4.5,8.65,-33],[14,.6,.5],[1,.235,.085]);for(const z of[-30,0,30])stand.cylinder([9.5,0,z],[9.5,8.6,z],.14,[.32,.34,.35],6);g.merge(stand.transform(modelMatrix([p.x,0,p.z],p.yaw)));
  }
  // Landscape sits beyond the surveyed circuit envelope. The former 900 m
  // ring of hills intersected the larger, real-world circuit footprints.
  const landscapeX=(track.bounds.minX+track.bounds.maxX)/2,landscapeZ=(track.bounds.minZ+track.bounds.maxZ)/2;
  const landscapeRadius=Math.hypot((track.bounds.maxX-track.bounds.minX)/2,(track.bounds.maxZ-track.bounds.minZ)/2)+650;
  for(let i=0;i<(alpine?18:marina?0:22);i++){
    const angle=i/22*Math.PI*2,x=landscapeX+Math.cos(angle)*(landscapeRadius+rng()*480),z=landscapeZ+Math.sin(angle)*(landscapeRadius+rng()*480),h=desert?65+rng()*65:forest?18+rng()*18:60+rng()*90;
    if(alpine||track.config.theme==='canyon'){mountain(g,x,z,180+rng()*250,200+rng()*320,rng,track.config.theme==='canyon');continue;}
    g.sphere([x,-30,z],[140+rng()*180,h,150+rng()*170],desert?[.50+rng()*.12,.38+rng()*.05,.26]:[.23+rng()*.05,.33+rng()*.04,.19],26,12);
  }
  for(let i=0;i<(low?48:110);i++){
    const s=rng()*track.length,p=track.sample(s,(rng()>.5?1:-1)*(38+rng()*55));if(track.nearestDistance(p.x,p.z)<25)continue;
    if(alpine||forest){pine(g,p,8+rng()*8,rng);continue;}
    if(sakura){blossom(g,p,5+rng()*3,rng);continue;}
    if(marina&&i>26)continue;
    if(!desert){const h=4+rng()*6;g.cylinder([p.x,0,p.z],[p.x,h*.65,p.z],coast?.18:.28,[.29,.22,.13],5);
      if(coast||marina){for(let a=0;a<6;a++){const th=a/6*Math.PI*2;g.tri([p.x,h,p.z],[p.x+Math.cos(th)*4,h-.5,p.z+Math.sin(th)*4],[p.x+Math.cos(th+.4)*2.4,h-1.1,p.z+Math.sin(th+.4)*2.4],[.19,.32,.16]);}}
      else{g.sphere([p.x,h*.85,p.z],[2.6,h*.35,2.3],[.17+rng()*.08,.29+rng()*.07,.12],20,10);g.sphere([p.x+.6,h*1.05,p.z-.4],[1.7,h*.25,1.6],[.19,.31,.12],16,8);}
    }else{g.box([p.x,.6,p.z],[.9,1.2,.9],[.43,.34,.23]);if(i%5===0)g.cylinder([p.x,0,p.z],[p.x,22,p.z],.2,[.6,.62,.6],6);}
  }
  if(!desert)for(let i=0;i<(low?70:420);i++){
    const p=track.sample(rng()*track.length,(rng()>.5?1:-1)*(25+rng()*24));if(track.nearestDistance(p.x,p.z)<23)continue;
    for(let j=0;j<3;j++){const x=p.x+(rng()-.5)*.5,z=p.z+(rng()-.5)*.5,h=.20+rng()*.45;g.tri([x-.045,0,z],[x+.045,0,z],[x+(rng()-.5)*.2,h,z+.04],[.20+rng()*.07,.34+rng()*.12,.10],5);}
  }
  if(coast){g.quad([550,-.04,-1800],[550,-.04,1800],[2000,-.04,1800],[2000,-.04,-1800],[.22,.44,.48],13);for(let i=0;i<12;i++)g.box([560,1.6,-560+i*75],[2,3.2,2],[.85,.83,.7]);}
  if(marina)harbor(g,track,rng);
  if(sakura){
    for(const station of [-25,track.length*.32,track.length*.68])pavilion(g,track.sample(station,-66));
    const p=track.sample(-55,52),q=new Geometry();
    for(const x of[-4,4])q.cylinder([x,0,0],[x,6.4,0],.20,[.65,.10,.07],12,.16);
    q.box([0,5.3,0],[10,.28,.35],[.68,.12,.08]);q.box([0,6.25,0],[11,.36,.65],[.18,.13,.12]);q.box([0,5.7,0],[.25,1,.25],[.65,.10,.07]);g.merge(q.transform(modelMatrix([p.x,0,p.z],p.yaw)));
  }
  for(let i=0;i<15;i++){const p=track.sample(i*track.length/15,-28);g.cylinder([p.x,0,p.z],[p.x,17,p.z],.15,[.57,.59,.56],6);g.box([p.x,17,p.z],[4,.3,.9],[.8,.82,.78]);}
  for(let station=0;station<track.length;station+=115){
    const p=track.sample(station,(station%230?-1:1)*(w+18)),q=new Geometry();
    q.box([0,.25,0],[3.2,.5,2.4],[.42,.45,.43]);q.cylinder([0,.5,0],[0,4.1,0],.04,[.61,.64,.64],8);
    // Marshals in safety clothing, with articulated limbs, gloves and helmets.
    for(const sign of[-1,1]){q.cylinder([sign*.11,.28,0],[sign*.11,.92,.02],.075,[.12,.15,.18],9);q.sphere([sign*.11,.29,.06],[.08,.06,.14],[.05,.06,.07],12,7);q.cylinder([sign*.16,1.40,0],[sign*.31,1.03,.09],.055,[.84,.25,.045],10);q.sphere([sign*.31,1.03,.09],[.045,.05,.045],[.13,.15,.16],10,6);}
    q.sphere([0,1.16,0],[.20,.29,.13],[.95,.36,.06],16,12);q.sphere([0,1.57,0],[.10,.13,.11],[.65,.46,.33],16,10);q.sphere([0,1.66,0],[.12,.07,.13],[.91,.92,.87],18,10);q.box([0,1.23,-.14],[.28,.07,.005],[.88,.92,.82]);g.merge(q.transform(modelMatrix([p.x,0,p.z],p.yaw)));
  }
  for(let station=80;station<track.length;station+=95)if(Math.abs(track.sample(station).k)>.009){const p=track.sample(station,(track.sample(station).k>0?1:-1)*(w+16.4));for(let row=0;row<3;row++)for(let j=0;j<4;j++)g.torusX([p.x+Math.cos(p.yaw)*(j-1.5)*.48,.36+row*.52,p.z-Math.sin(p.yaw)*(j-1.5)*.48],.25,.10,[.10,.13,.14],16,8);}
  for(let s=100;s<track.length;s+=95){
   const curve=track.sample(s).k;if(Math.abs(curve)<.007)continue;const sign=curve>0?-1:1;
   const p=track.sample(s,sign*(w+18)),q=new Geometry();
   q.box([0,.8,0],[2.4,1.6,.65],[.18,.29,.29]);q.box([0,1.7,0],[2.6,.2,.85],[.77,.81,.75]);
   g.merge(q.transform(modelMatrix([p.x,0,p.z],p.yaw)));
  }
  // Paddock transporters are placed using the same clearance check as buildings.
  for(let i=0;i<(low?4:8);i++){
   const p=scenerySite(track,25+i*18,pitSide*70,7,15);if(!p)continue;const q=new Geometry();
   q.box([0,1.7,0],[3.1,3.4,12],[.87,.89,.88]);q.box([0,1.5,7],[3,3,3],[.72,.12,.09]);q.box([0,2.1,8.55],[2.5,1,.04],[.16,.25,.30]);
   g.merge(q.transform(modelMatrix([p.x,0,p.z],p.yaw)));
  }
  if(track.config.elevation)for(let i=staticStart;i<g.data.length;i+=12)if(g.data[i+9]!==13)g.data[i+1]+=terrain(g.data[i],g.data[i+2]);
  const boards=[];const textures=['APEX GP','RIDE THE LIMIT','FULL THROTTLE'].map(text=>markTexture(renderer,text));
  for(const corner of track.config.corners||[]){
    const p=track.sample(corner.s-35,-w-5),board=new Geometry();
    board.quad([-2.7,1.4,0],[2.7,1.4,0],[2.7,2.5,0],[-2.7,2.5,0],[1,1,1],0,[[0,0],[1,0],[1,1],[0,1]]);
    const texture=markTexture(renderer,`${corner.number} · ${corner.name.toUpperCase()}`);textures.push(texture);
    boards.push({mesh:renderer.mesh(board),matrix:modelMatrix([p.x,p.y,p.z],p.yaw),texture});
  }
  for(let i=0;i<15;i++){const side=i%2?-1:1,p=track.sample(i*track.length/15,side*19.8);const b=new Geometry();b.quad([-4.5,1.3,0],[4.5,1.3,0],[4.5,3.3,0],[-4.5,3.3,0],[1,1,1],0,[[0,0],[1,0],[1,1],[0,1]]);boards.push({mesh:renderer.mesh(b),matrix:modelMatrix([p.x,p.y||0,p.z],p.yaw+side*Math.PI/2),texture:textures[i%3]});}
  const banner=new Geometry().quad([-5,9.8,-.28],[5,9.8,-.28],[5,11.0,-.28],[-5,11.0,-.28],[1,1,1],0,[[0,0],[1,0],[1,1],[0,1]]);boards.push({mesh:renderer.mesh(banner),matrix:modelMatrix([gantry.x,gantry.y||0,gantry.z],gantry.yaw),texture:textures[0]});
  const distanceTextures=[150,100,50].map(n=>markTexture(renderer,String(n)));
  textures.push(...distanceTextures);
  for(let station=150;station<track.length;station+=160)if(Math.abs(track.sample(station+20).k)>.006){for(let j=0;j<3;j++){const p=track.sample(station-150+j*50,-w-4),board=new Geometry();board.quad([-.65,.6,0],[.65,.6,0],[.65,1.55,0],[-.65,1.55,0],[1,1,1],0,[[0,0],[1,0],[1,1],[0,1]]);boards.push({mesh:renderer.mesh(board),matrix:modelMatrix([p.x,p.y||0,p.z],p.yaw),texture:distanceTextures[j]});}}
  const sectorTextures=['S1','S2','S3',track.config.name.toUpperCase()].map(text=>markTexture(renderer,text));textures.push(...sectorTextures);
  for(let sector=0;sector<3;sector++){
   const p=track.sample(track.length*sector/3,w+3),board=new Geometry();
   board.quad([-1,1,0],[1,1,0],[1,2.3,0],[-1,2.3,0],[1,1,1],0,[[0,0],[1,0],[1,1],[0,1]]);
   boards.push({mesh:renderer.mesh(board),matrix:modelMatrix([p.x,p.y,p.z],p.yaw),texture:sectorTextures[sector]});
  }
  const circuitBoard=new Geometry().quad([-7,7.8,0],[7,7.8,0],[7,9.6,0],[-7,9.6,0],[1,1,1],0,[[0,0],[1,0],[1,1],[0,1]]);
  boards.push({mesh:renderer.mesh(circuitBoard),matrix:modelMatrix([gantry.x,gantry.y,gantry.z-.3],gantry.yaw),texture:sectorTextures[3]});
  const flagMeshes={},flagColors={green:[.15,.72,.27],yellow:[1,.77,.08],blue:[.15,.39,.88],red:[.95,.08,.08],vsc:[1,.77,.08],chequered:[1,1,1]};
  for(const [name,col] of Object.entries(flagColors)){const mesh=new Geometry();for(let i=0;i<8;i++)for(let j=0;j<5;j++)mesh.quad([i*.13,j*.13,0],[(i+1)*.13,j*.13,0],[(i+1)*.13,(j+1)*.13,0],[i*.13,(j+1)*.13,0],name==='chequered'&&(i+j)%2?[.025,.03,.035]:col,5);flagMeshes[name]=renderer.mesh(mesh);}
  const flagPosts=[];for(let station=0;station<track.length;station+=115){const p=track.sample(station,(station%230?-1:1)*(w+18));flagPosts.push({progress:station,matrix:modelMatrix([p.x,terrain(p.x,p.z)+2.9,p.z],p.yaw)});}
  Geometry.detail=1;
  return{mesh:renderer.spatialMesh(g),line:renderer.spatialMesh(line),boards,textures,flagMeshes,flagPosts};
}


// Smooth parametric panels. Normals come from the actual curved surface, rather
// than the triangles, so silhouettes and reflections stay smooth at close range.
function panel(g,fn,nu,nv,color,surface=6,flip=false){
  nu=Math.max(4,Math.round(nu*(g.detail??1)));nv=Math.max(3,Math.round(nv*(g.detail??1)));
  const point=(u,v)=>fn(clamp(u,0,1),clamp(v,0,1));
  const normal=(u,v)=>V.norm(V.cross(V.sub(point(u+.0001,v),point(u-.0001,v)),V.sub(point(u,v+.0001),point(u,v-.0001)))).map(x=>x*(flip?-1:1));
  for(let i=0;i<nu;i++)for(let j=0;j<nv;j++){
    const u=i/nu,v=j/nv,U=(i+1)/nu,W=(j+1)/nv;
    const c=typeof color==='function'?color((u+U)*.5,(v+W)*.5):color;
    g.quad(point(u,v),point(U,v),point(U,W),point(u,W),c,surface,[[u,v],[U,v],[U,W],[u,W]],[normal(u,v),normal(U,v),normal(U,W),normal(u,W)]);
  }return g;
}
function profile(stations,t){
  const f=clamp(t,0,1)*(stations.length-1),i=Math.min(stations.length-2,Math.floor(f)),u=f-i;
  return stations[i].map((_,k)=>{
    const a=stations[Math.max(0,i-1)][k],b=stations[i][k],c=stations[i+1][k],d=stations[Math.min(stations.length-1,i+2)][k];
    return .5*((2*b)+(-a+c)*u+(2*a-5*b+4*c-d)*u*u+(-a+3*b-3*c+d)*u*u*u);
  });
}
function loft(g,stations,color,surface=6,steps=64,sides=40){
  // Sections: z, centre y, half width, half height.
  return panel(g,(u,v)=>{const [z,y,w,h]=profile(stations,u),a=v*Math.PI*2;return[w*Math.cos(a),y+h*Math.sin(a),z];},steps,sides,color,surface,true);
}
function material(g,surface,draw){const start=g.data.length;draw(g);for(let i=start;i<g.data.length;i+=12)g.data[i+9]=surface;}
function tube(g,points,radii,color,surface=7,sides=12){
  return panel(g,(u,v)=>{const p=profile(points,u),r=profile(radii.map(x=>Array.isArray(x)?x:[x,x]),u),a=v*Math.PI*2;
    const tangent=V.norm(V.sub(profile(points,Math.min(1,u+.001)),profile(points,Math.max(0,u-.001))));
    const side=V.norm(V.cross(Math.abs(tangent[0])<.8?[1,0,0]:[0,1,0],tangent)),up=V.cross(tangent,side);
    return p.map((x,k)=>x+side[k]*Math.cos(a)*r[0]+up[k]*Math.sin(a)*r[1]);
  },Math.max(12,points.length*9),sides,color,surface,true);
}


export function buildBike(renderer,color=[1,.235,.085],number=27,detail=1,style='factory',livery='factory'){return allocateScene(renderer,scope=>createImportedBike(scope,color,number,detail,style,livery));}
export function bikeParts(bike,matrix,travel=0,turn=0,speed=0,lean=0,crash=0,fallSign=1){
  if(!bike)return [];
  const fall=crash>0?multiply(matrix,modelMatrix([fallSign*Math.min(1.5,(2.5-crash)*.8),-.02,-.3],0,fallSign*.7,0)):matrix;
  const steeringAngle=clamp(Math.atan(turn*(bike.wheelbase??1.49)/Math.max(1,speed)),-.38,.38),pivot=bike.steeringPivot||[0,.326,.745],steeringMatrix=multiply(matrix,multiply(modelMatrix(pivot,steeringAngle),modelMatrix(pivot.map(v=>-v))));
  return[{mesh:bike.mesh,matrix},...(bike.steering?[{mesh:bike.steering,matrix:steeringMatrix}]:[]),...(bike.rider?[{mesh:bike.rider,matrix:fall,rider:true,lean}]:[]),...bike.wheels.map(w=>({mesh:w.mesh,matrix:multiply(matrix,modelMatrix([0,w.radius,w.z],w.front?clamp(Math.atan(turn*(bike.wheelbase??1.49)/Math.max(1,speed)),-.38,.38):0,0,travel/w.radius))})),...(bike.decals||[]).map(d=>({...d,matrix})),...(bike.riderDecals||[]).map(d=>({...d,matrix:fall,rider:true,lean})),{mesh:bike.glass,matrix,alpha:.34}];
}
