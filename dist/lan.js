import {clamp,lerp,wrapAngle} from './simulation.js';
import {networkBots} from './race-bots.js';
export class LanClient{
 constructor(handlers={}){this.handlers=handlers;this.socket=null;this.id=null;this.state=null;this.offset=0;this.latency=0;this.history=new Map();this.lastSend=0;this.lastPing=0;this.roundKey=null;this.results=new Set();this.heartbeat=null;}
 disconnect(){clearInterval(this.heartbeat);this.heartbeat=null;if(this.socket){this.socket.onclose=null;this.socket.close();}this.socket=null;this.id=null;this.state=null;this.history.clear();}
 now(){return Date.now()+this.offset;}
 connect(address){
  clearInterval(this.heartbeat);if(this.socket){this.socket.onclose=null;this.socket.close();}this.id=null;this.state=null;this.roundKey=null;this.history.clear();
  let url;try{url=new URL(address.includes('://')?address:`${globalThis.location?.protocol==='https:'?'https':'http'}://${address}`);if(!['http:','https:','ws:','wss:'].includes(url.protocol))throw Error('protocol');url.protocol=['https:','wss:'].includes(url.protocol)?'wss:':'ws:';url.pathname='/ws';url.search='';url.hash='';}catch{return Promise.reject(new Error('Inserisci l’indirizzo mostrato sul PC che ospita la partita.'));}
  return new Promise((resolve,reject)=>{const ws=this.socket=new WebSocket(url.href);let settled=false;const timeout=setTimeout(()=>{if(!settled){settled=true;ws.close();reject(new Error('Il server non risponde. Controlla indirizzo e rete locale.'));}},7500);
   ws.onmessage=e=>{let m;try{m=JSON.parse(e.data);}catch{return;}if(m.type==='welcome'){this.id=m.id;this.offset=m.now-Date.now();clearTimeout(timeout);this.heartbeat=setInterval(()=>this.send({type:'ping',at:Date.now()}),3000);settled=true;resolve(this);}
    if(m.type==='pong'){this.latency=Math.max(0,Date.now()-m.echo);this.offset=lerp(this.offset,m.now+this.latency*.5-Date.now(),.2);}
    if(m.type==='error')this.handlers.onError?.(m.message);
    if(m.type==='reset')this.handlers.onReset?.(m);
    if(m.type==='penalty')this.handlers.onPenalty?.(m);
    if(m.type==='room')this.receive(m);
   };
   ws.onerror=()=>{if(!settled){clearTimeout(timeout);settled=true;reject(new Error('Connessione non riuscita. Apri il gioco dall’indirizzo del server LAN.'));}};
   ws.onclose=()=>{clearTimeout(timeout);clearInterval(this.heartbeat);this.heartbeat=null;this.id=null;this.state=null;this.handlers.onDisconnect?.();};
  });
 }
 send(data){if(this.socket?.readyState!==1)return false;this.socket.send(JSON.stringify(data));return true;}
 create(name,bikeId,livery,options){return this.send({type:'create',name,bikeId,livery,options});}
 join(code,name,bikeId,livery){return this.send({type:'join',code,name,bikeId,livery});}
 ready(){const mine=this.state?.players.find(p=>p.id===this.id);this.send({type:'ready',ready:!mine?.ready});}
 start(){this.send({type:'start'});}
 setBike(bikeId,livery){return this.send({type:'bike',bikeId,livery});}
 setOptions(options){return this.send({type:'settings',options});}
 botRiders(){return networkBots(this);}
 leave(){this.send({type:'leave'});this.state=null;this.roundKey=null;this.history.clear();}
 receive(m){
  this.state=m;
  for(const p of m.players){if(!p.pose)continue;const h=this.history.get(p.id)||[];h.push({at:m.now,...p.pose,progress:p.progress,finishTime:p.finishTime});if(h.length>8)h.shift();this.history.set(p.id,h);}
  if(m.status==='race'&&m.roundId&&this.roundKey!==m.roundId){this.roundKey=m.roundId;this.history.clear();this.handlers.onStart?.(m);}
  this.handlers.onState?.(m);
  if(m.status==='finished'&&!this.results.has(m.roundId)){this.results.add(m.roundId);this.handlers.onResult?.(m);}
 }
 sample(id){const h=this.history.get(id);if(!h?.length)return null;const at=this.now()-90;let a=h[0],b=h.at(-1);for(let i=1;i<h.length;i++)if(h[i].at>=at){a=h[i-1];b=h[i];break;}const t=clamp((at-a.at)/Math.max(1,b.at-a.at),0,1),out={...b};for(const k of ['x','z','y','speed','lean','pitch','wheelie','travel','progress','crash'])out[k]=lerp(a[k]||0,b[k]||0,t);out.heading=a.heading+wrapAngle(b.heading-a.heading)*t;return out;}
 tick(now,player=null){
  if(!this.id)return;if(now-this.lastPing>2000){this.lastPing=now;this.send({type:'ping',at:Date.now()});}
  if(this.state?.status==='race'&&this.state.hostId===this.id)for(const b of this.botRiders())if(b.finishTime!==null&&!this.botFinishSent.has(b.id)&&!this.state.bots?.find(q=>q.id===b.id)?.finishTime){if(this.send({type:'bot_finish',id:b.id,time:b.finishTime}))this.botFinishSent.add(b.id);}
  if(player&&this.state?.status==='race'&&now-this.lastSend>=45){this.lastSend=now;this.send({type:'pose',pose:{x:player.x,z:player.z,heading:player.heading,speed:player.speed,lean:player.lean,pitch:player.pitch,wheelie:player.wheelie||0,travel:player.wheelTravel||0,crash:player.crash||0}});}
 }
}
