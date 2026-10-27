// Playable compatibility view. It uses the same simulation and controls as 3D.
import {renderResolution} from './quality.js';
export class OverviewRenderer{
 constructor(canvas){this.canvas=canvas;this.c=canvas.getContext('2d');this.compat=true;this.quality='low';this.weather='day';this.history=[];this.gl={deleteTexture(){}};}
 mesh(){return{};}texture(){return null;}destroy(){}shadowPass(){}begin(){}draw(){}
 finish(){const c=this.c,w=this.canvas.clientWidth||1280,h=this.canvas.clientHeight||720,size=this.quality==='high'?renderResolution(w,h,{pixelRatio:globalThis.devicePixelRatio||1}):{width:w,height:h};if(this.canvas.width!==size.width||this.canvas.height!==size.height){this.canvas.width=size.width;this.canvas.height=size.height;}c.setTransform(size.width/w,0,0,size.height/h,0,0);
 const {track,race}=this.scene||{};if(!track)return;const p=race?.player,scale=p?Math.min(w,h)/180:Math.min(w/(track.bounds.maxX-track.bounds.minX+100),h/(track.bounds.maxZ-track.bounds.minZ+140)),cx=p?p.x:(track.bounds.minX+track.bounds.maxX)/2,cz=p?p.z:(track.bounds.minZ+track.bounds.maxZ)/2,yaw=p?p.heading:0;
 const point=(x,z)=>[w*.5-((x-cx)*Math.cos(yaw)-(z-cz)*Math.sin(yaw))*scale,h*(p?.61:.50)-((x-cx)*Math.sin(yaw)+(z-cz)*Math.cos(yaw))*scale];
 c.fillStyle=this.weather==='rain'?'#14262a':'#243d31';c.fillRect(0,0,w,h);
 const path=()=>{c.beginPath();track.nodes.forEach((q,i)=>{const v=point(q.x,q.z);if(i)c.lineTo(...v);else c.moveTo(...v);});c.closePath();};
 c.lineJoin='round';path();c.strokeStyle='#7d7966';c.lineWidth=(track.halfWidth*2+18)*scale;c.stroke();path();c.strokeStyle='#edede2';c.lineWidth=(track.halfWidth*2+1)*scale;c.stroke();path();c.strokeStyle='#30383d';c.lineWidth=track.halfWidth*2*scale;c.stroke();
 path();c.setLineDash([8,10]);c.lineWidth=1.2;c.strokeStyle='#ffffff40';c.stroke();c.setLineDash([]);
 if(p&&this.scene.lineVisible){
   for(const marker of this.scene.racingLine?.markers||[]){
     const v=point(marker.x,marker.z),angle=marker.yaw-yaw;
     c.save();c.translate(...v);c.rotate(-angle);c.globalAlpha=marker.alpha*.94;
     c.beginPath();c.moveTo(-.78*scale,1.02*scale);c.lineTo(0,-1.04*scale);c.lineTo(.78*scale,1.02*scale);
     c.lineJoin='miter';c.lineWidth=.92*scale;c.strokeStyle='#091015';c.stroke();
     c.lineWidth=.43*scale;c.strokeStyle=`rgb(${marker.color.map(v=>Math.round(v*255)).join(',')})`;c.stroke();c.restore();
   }
 }
 if(p){if(!this.lastRun||this.lastRun!==race.runId){this.history=[];this.lastRun=race.runId;}const last=this.history.at(-1);if(!last||Math.hypot(last.x-p.x,last.z-p.z)>1){this.history.push({x:p.x,z:p.z});if(this.history.length>900)this.history.shift();}c.beginPath();this.history.forEach((q,i)=>{const v=point(q.x,q.z);if(i)c.lineTo(...v);else c.moveTo(...v);});c.strokeStyle='#f9a05b';c.lineWidth=2.5;c.stroke();}
 for(const r of race?.riders||[]){const q=track.sample(r.progress,r.offset),v=point(Number.isFinite(r.x)?r.x:q.x,Number.isFinite(r.z)?r.z:q.z),angle=(r.heading??q.yaw)-yaw;c.save();c.translate(...v);c.rotate(-angle);const s=Math.max(2,scale*.85);c.fillStyle='#0b0c0d';c.fillRect(-s*.6,-s*1.6,s*1.2,s*3.2);c.fillStyle=r.isPlayer?'#ff7040':r.color?`rgb(${r.color.map(v=>v*255).join(',')})`:'#90b9db';c.beginPath();c.moveTo(0,-s*1.5);c.lineTo(s*.8,s);c.lineTo(0,s*.6);c.lineTo(-s*.8,s);c.closePath();c.fill();c.fillStyle='#ecefe9';c.beginPath();c.arc(0,-s*.1,s*.43,0,Math.PI*2);c.fill();if(r.wheelie>.1){c.strokeStyle='#ffd779';c.lineWidth=2;c.strokeRect(-s,-s*1.9,s*2,s*3.7);}c.restore();}
 c.fillStyle='#e9f0dfbb';c.font='11px Arial';c.fillText('VISTA DALL’ALTO · STESSA FISICA E STESSI COMANDI',18,h-18);
 }
}
