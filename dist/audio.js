import {clamp,lerp} from './simulation.js';

// Original procedural audio. Four-stroke firing patterns, no remote samples.
export const ENGINE_VOICES={
 r27:{angles:[0,.12,.5,.62],body:126,rasp:980,idle:3300,redline:15500,seed:27},
 v4:{angles:[0,.19,.5,.69],body:118,rasp:870,idle:3200,redline:15000,seed:4},
 rs:{angles:[0,.25,.5,.75],body:145,rasp:1120,idle:3400,redline:15300,seed:63},
 v2c:{angles:[0,.375],body:92,rasp:780,idle:2600,redline:12800,seed:2},
 x4a:{angles:[0,.15,.46,.61],body:133,rasp:1280,idle:3600,redline:16000,seed:44},
 r9e:{angles:[0,.25,.5,.75],body:124,rasp:900,idle:3100,redline:14800,seed:9},
 s3:{angles:[0,1/3,2/3],body:166,rasp:1340,idle:3500,redline:16300,seed:3},
 t12:{angles:[0,.1,.45,.55],body:120,rasp:1160,idle:3400,redline:15800,seed:12},
 gtr:{angles:[0,.18,.5,.68],body:132,rasp:1060,idle:3300,redline:15400,seed:71},
 i4:{angles:[0,.25,.5,.75],body:152,rasp:1220,idle:3400,redline:15700,seed:14}
};
function seeded(seed){return()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296*2-1;};}
export function enginePCM(id,sampleRate=44100,loaded=true){
 const cfg=ENGINE_VOICES[id]||ENGINE_VOICES.r27,cycles=16,period=.02,n=Math.round(sampleRate*period*cycles),data=new Float32Array(n),random=seeded(cfg.seed+(loaded?103:0));
 for(let cycle=0;cycle<cycles;cycle++)for(const angle of cfg.angles){const at=Math.round((cycle+angle)*period*sampleRate),strength=.9+random()*.09;
  for(let i=0;i<sampleRate*.038;i++){const t=i/sampleRate,attack=1-Math.exp(-t*6500),body=Math.sin(2*Math.PI*cfg.body*t)*Math.exp(-t*155),mid=Math.sin(2*Math.PI*(cfg.body*2.83)*t+.2)*Math.exp(-t*230),blast=random()*Math.exp(-t*(loaded?820:1250)),rasp=Math.sin(2*Math.PI*cfg.rasp*t)*Math.exp(-t*430);data[(at+i)%n]+=strength*attack*(body*.63+mid*.20+blast*(loaded?.55:.13)+rasp*(loaded?.25:.06));}
 }
 let mean=0;for(const v of data)mean+=v;mean/=n;let peak=0;for(let i=0;i<n;i++){data[i]-=mean;peak=Math.max(peak,Math.abs(data[i]));}for(let i=0;i<n;i++)data[i]*=.86/Math.max(.001,peak);return data;
}
export function engineTelemetry(p,bike={id:'r27',top:320},time=0){
 const cfg=ENGINE_VOICES[bike.id]||ENGINE_VOICES.r27,kph=Math.max(0,p.speed||0)*3.6,gear=clamp(p.gear||Math.floor(kph/52)+1,1,6),ceiling=gear*52+4,rolling=kph/ceiling*cfg.redline,throttle=clamp(Number(p.throttle)||0,0,1),free=cfg.idle+throttle*(kph<12?6000:900),rpm=clamp(Math.max(rolling,free),cfg.idle,cfg.redline),off=Math.abs(p.offset||0)>(bike.halfWidth||9.25);
 return{rpm:rpm*(1+Math.sin(time*37)*.0025),gear,throttle,speed:kph,load:clamp(.17+throttle*.83+(p.acceleration||0)*.01,0,1),off};
}
const approach=(param,value,time,smooth=.035)=>param.setTargetAtTime(value,time,smooth);
export class MotorAudio{
 constructor({enabled=true,volume=.45,contextFactory}={}){this.context=null;this.enabled=enabled;this.volume=volume;this.contextFactory=contextFactory;this.buffers=new Map();this.voices=[];this.lastModel=null;this.previousThrottle=0;this.previousWheelie=0;this.lastPop=-10;this.previousGear=1;this.shiftEnd=0;this.blipEnd=0;this.lastTick=0;}
 start(){
  if(!this.enabled)return;
  if(this.context){this.context.resume().catch(()=>{});return;}
  try{
   const C=globalThis.AudioContext||globalThis.webkitAudioContext;if(!this.contextFactory&&!C)return;const c=this.context=this.contextFactory?this.contextFactory():new C({latencyHint:'interactive'});
   this.master=c.createGain();this.master.gain.value=0;this.compressor=c.createDynamicsCompressor();this.compressor.threshold.value=-14;this.compressor.knee.value=14;this.compressor.ratio.value=4;this.compressor.attack.value=.004;this.compressor.release.value=.16;this.master.connect(this.compressor);this.compressor.connect(c.destination);
   this.lowcut=c.createBiquadFilter();this.lowcut.type='highpass';this.lowcut.frequency.value=35;this.lowcut.connect(this.master);
   this.noise=c.createBuffer(1,c.sampleRate*2,c.sampleRate);const a=this.noise.getChannelData(0),random=seeded(1933);let brown=0;for(let i=0;i<a.length;i++){brown=(brown+random()*.03)/1.02;a[i]=brown*3.5;}
   this.wind=this.noiseLayer('highpass',380,.7);this.road=this.noiseLayer('bandpass',310,.6);this.tyre=this.noiseLayer('bandpass',2300,.9);this.rain=this.noiseLayer('highpass',2200,.5);this.scrape=this.noiseLayer('highpass',650,.8);
   this.brake=c.createOscillator();this.brake.type='sine';this.brake.frequency.value=1800;this.brakeGain=c.createGain();this.brakeGain.gain.value=0;this.brake.connect(this.brakeGain);this.brakeGain.connect(this.lowcut);this.brake.start();
   this.kerb=c.createOscillator();this.kerb.type='triangle';this.kerb.frequency.value=35;this.kerbFilter=c.createBiquadFilter();this.kerbFilter.type='lowpass';this.kerbFilter.frequency.value=500;this.kerbGain=c.createGain();this.kerbGain.gain.value=0;this.kerb.connect(this.kerbFilter);this.kerbFilter.connect(this.kerbGain);this.kerbGain.connect(this.lowcut);this.kerb.start();
   this.voices=Array.from({length:4},()=>this.createVoice());c.resume().catch(()=>{});
  }catch{this.context?.close?.().catch(()=>{});this.context=null;}
 }
 noiseLayer(type,frequency,q){const c=this.context,source=c.createBufferSource(),filter=c.createBiquadFilter(),gain=c.createGain();source.buffer=this.noise;source.loop=true;filter.type=type;filter.frequency.value=frequency;filter.Q.value=q;gain.gain.value=0;source.connect(filter);filter.connect(gain);gain.connect(this.lowcut);source.start();return{source,filter,gain};}
 createVoice(){const c=this.context,gain=c.createGain(),filter=c.createBiquadFilter(),pan=c.createStereoPanner();gain.gain.value=0;filter.type='lowpass';filter.frequency.value=2200;filter.Q.value=.55;filter.connect(gain);gain.connect(pan);pan.connect(this.lowcut);return{gain,filter,pan,sources:[],id:null};}
 assign(voice,id){if(voice.id===id)return;const c=this.context;for(const source of voice.sources){source.mix.gain.cancelScheduledValues(c.currentTime);source.mix.gain.setTargetAtTime(0,c.currentTime,.008);source.stop(c.currentTime+.04);source.onended=()=>{source.disconnect();source.mix.disconnect();};}voice.sources=[];voice.id=id;
  for(const loaded of[false,true]){const key=id+':'+loaded;let buffer=this.buffers.get(key);if(!buffer){const pcm=enginePCM(id,c.sampleRate,loaded);buffer=c.createBuffer(1,pcm.length,c.sampleRate);buffer.getChannelData(0).set(pcm);this.buffers.set(key,buffer);}const source=c.createBufferSource(),mix=c.createGain();source.buffer=buffer;source.loop=true;source.playbackRate.value=.55;mix.gain.value=0;source.connect(mix);mix.connect(voice.filter);source.start();source.mix=mix;voice.sources.push(source);}
 }
 voiceTick(voice,id,p,bike,level,pan=0,doppler=1,own=false){
  this.assign(voice,id);const c=this.context,t=c.currentTime,x=engineTelemetry(p,bike,t),cut=own&&t<this.shiftEnd?.23:1,blip=own&&t<this.blipEnd?1.11:1,rate=x.rpm/6000*doppler*blip;
  for(const src of voice.sources)approach(src.playbackRate,rate,t,own?.022:.065);approach(voice.sources[0].mix.gain,.15*(1-x.load*.4),t);approach(voice.sources[1].mix.gain,.10+x.load*.40,t);approach(voice.filter.frequency,(550+x.rpm*.17+x.load*2000)*(own?1:.7),t,.05);approach(voice.gain.gain,level*cut,t,.018);approach(voice.pan.pan,pan,t,.055);return x;
 }
 tick(model,inputs=null){
  const c=this.context;if(!c)return;const t=c.currentTime,active=!!model&&['running','countdown'].includes(model.state)&&this.enabled,volume=clamp(Number(this.volume)||0,0,1);approach(this.master.gain,active?volume*.85:0,t,.05);if(!active){this.lastModel=null;return;}if(t-this.lastTick<.015&&model===this.lastModel)return;this.lastTick=t;
  const original=model.player,p=model.state==='countdown'?{...original,throttle:inputs?.throttle?1:0}:original,bike=model.options.bike||{id:'r27'},tr=model.track,speed=Math.max(0,p.speed),throttle=Number(p.throttle)||0;
  if(model!==this.lastModel){this.previousGear=p.gear||1;this.previousThrottle=throttle;this.previousWheelie=p.wheelie||0;this.lifted=false;this.shiftEnd=0;this.blipEnd=0;this.lastModel=model;}
  if(p.gear!==this.previousGear){if(p.gear>this.previousGear){this.shiftEnd=t+.075;this.oneShot('shift',.28);}else{this.blipEnd=t+.10;this.oneShot('shift',.12);}this.previousGear=p.gear;}
  const telemetry=this.voiceTick(this.voices[0],bike.id,p,bike,p.crash>0?.16:.48,0,1,true);
  if(this.previousThrottle>.35&&throttle<.15&&telemetry.rpm>7500&&t-this.lastPop>.6){this.oneShot('pop',.35);this.lastPop=t;}this.previousThrottle=throttle;
  if((p.wheelie||0)>.12)this.lifted=true;if(this.lifted&&(p.wheelie||0)<.03){if(speed>5&&!p.crash)this.oneShot('landing',clamp(speed/60,.18,.55));this.lifted=false;}this.previousWheelie=p.wheelie||0;
  const half=tr.halfWidth,edge=Math.abs(p.offset||0),off=edge>half+.6,kerb=edge>half-.45&&edge<half+1.05&&speed>2,brake=clamp(Number(p.brake)||0,0,1),corner=Math.abs(p.lean||0)/1.04,skid=clamp((brake*.70+corner*.65-.67)*1.7,0,1)*clamp(speed/18,0,1),rain=model.options.weather==='rain';
  approach(this.wind.gain.gain,Math.pow(clamp(speed/90,0,1.3),1.8)*.38,t,.15);approach(this.wind.filter.frequency,lerp(150,1400,clamp(speed/95,0,1)),t,.15);approach(this.road.gain.gain,clamp(speed/55,0,1)*(off?.38:rain?.055:.02),t,.04);approach(this.road.filter.frequency,off?550:230,t,.06);approach(this.tyre.gain.gain,skid*(rain?.11:.23),t,.025);approach(this.tyre.filter.frequency,1600+speed*16,t,.035);approach(this.rain.gain.gain,rain?.07+speed*.0008:0,t,.2);approach(this.scrape.gain.gain,p.crash>0?clamp(speed/50,0,1)*.4:0,t,.025);
  approach(this.brake.frequency,1400+speed*14,t,.05);approach(this.brakeGain.gain,brake*brake*clamp(speed/20,0,1)*.006,t,.035);approach(this.kerb.frequency,clamp(speed/.45,12,180),t,.02);approach(this.kerbGain.gain,kerb?clamp(speed/50,0,1)*.14:0,t,.025);
  const others=(model.riders||[]).filter(r=>r!==original&&!r.dnf&&r.finishTime===null).map(r=>{const q=Number.isFinite(r.x)?r:tr.sample(r.progress,r.offset),dx=q.x-p.x,dz=q.z-p.z;return{r,q,dx,dz,d:Math.hypot(dx,dz)};}).filter(o=>o.d<95).sort((a,b)=>a.d-b.d).slice(0,3);
  for(let i=0;i<3;i++){const voice=this.voices[i+1],o=others[i];if(!o){approach(voice.gain.gain,0,t,.12);continue;}const heading=o.r.heading??o.q.yaw,d=Math.max(1,o.d),radial=((Math.sin(heading)*(o.r.speed||0)-Math.sin(p.heading)*speed)*o.dx+(Math.cos(heading)*(o.r.speed||0)-Math.cos(p.heading)*speed)*o.dz)/d,pan=clamp((o.dx*Math.cos(p.heading)-o.dz*Math.sin(p.heading))/d,-1,1),id=o.r.bikeId||['v4','rs','r27'][i],peer={...o.r,throttle:o.r.speed>3?.7:.12},level=.28/(1+(d/13)**2);this.voiceTick(voice,id,peer,{id},level,pan,clamp(343/(343+radial),.80,1.22));}
 }
 oneShot(kind,strength=1){
  if(!this.context||!this.enabled)return;const c=this.context,t=c.currentTime,length=kind==='crash'?.28:kind==='landing'?.10:kind==='pop'?.075:.035,source=c.createBufferSource(),filter=c.createBiquadFilter(),gain=c.createGain();source.buffer=this.noise;filter.type=kind==='shift'?'bandpass':'lowpass';filter.frequency.value=kind==='crash'?3800:kind==='pop'?1900:kind==='landing'?380:1400;gain.gain.setValueAtTime(Math.max(.001,strength*(kind==='crash'?.7:.30)),t);gain.gain.exponentialRampToValueAtTime(.0001,t+length);source.connect(filter);filter.connect(gain);gain.connect(this.lowcut);source.start(t,.3,length);source.onended=()=>{source.disconnect();filter.disconnect();gain.disconnect();};
  if(kind!=='shift'){const osc=c.createOscillator(),g=c.createGain();osc.frequency.setValueAtTime(kind==='crash'?110:kind==='pop'?165:75,t);osc.frequency.exponentialRampToValueAtTime(38,t+length);g.gain.setValueAtTime(Math.max(.001,strength*.12),t);g.gain.exponentialRampToValueAtTime(.0001,t+length);osc.connect(g);g.connect(this.lowcut);osc.start();osc.stop(t+length);osc.onended=()=>{osc.disconnect();g.disconnect();};}
 }
 event(e){if(e.type==='crash')this.oneShot('crash',e.severity>=2?1:.65);else if(e.type==='contact')this.oneShot('landing',.45);}
 beep(frequency=420,duration=.1){if(!this.context||!this.enabled)return;const c=this.context,t=c.currentTime,o=c.createOscillator(),g=c.createGain();o.frequency.value=frequency;o.type='sine';g.gain.setValueAtTime(.10,t);g.gain.exponentialRampToValueAtTime(.001,t+duration);o.connect(g);g.connect(this.master);o.start();o.stop(t+duration);o.onended=()=>{o.disconnect();g.disconnect();};}
}
