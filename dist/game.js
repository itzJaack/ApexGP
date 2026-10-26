import {mountSocialUI} from './social-ui.js';
import {mountAccounts} from './accounts.js';
import {MotorAudio} from './audio.js';
import {prepareModelAssets,modelAssetInfo} from './models.js';
import {MultiplayerClient} from './cloud-multiplayer.js';
import {ONLINE_CONFIG} from './online-config.js';
import {OverviewRenderer} from './overview.js';
import {Career,normalizeProfile,UPGRADES,LIVERIES} from './progression.js';
import {FLAGS} from './race-control.js';
import {BIKES,TRACKS,Circuit,RaceModel,clamp,lerp,mod,formatTime,wrapAngle} from './simulation.js';
import {Renderer,buildWorld,buildBike,bikeParts,modelMatrix} from './engine.js';
import {DrivingControls,bindTouchControls} from './controls.js';
import {mountMobileUI} from './mobile.js';

let accountUI=null,applyingSnapshot=false;
const $=id=>document.getElementById(id),show=(id,on=true)=>$(id).classList.toggle('hidden',!on);
const safeRead=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key))||fallback;}catch{return fallback;}};
const safeWrite=(key,value)=>{if(applyingSnapshot)return;if(accountUI?.active&&['apexgp.career.v1','apexgp.records.v4'].includes(key)){accountUI.change();return;}try{localStorage.setItem(key,JSON.stringify(value));}catch{/* The game remains playable in private browsing. */}};
const clock=t=>t<=0?'00:00.000':formatTime(t);
const stored=safeRead('apexgp.settings.v1',{});
const settings={line:true,assist:true,tcs:true,audio:true,volume:45,quality:'low',touch:'auto',track:0,bike:0,mode:'race',weather:'sunset',laps:3,difficulty:'sport',...stored};
if(!['high','low'].includes(settings.quality))settings.quality='low';
if(!['auto','on','off'].includes(settings.touch))settings.touch='auto';
settings.track=clamp(Math.trunc(Number(settings.track)||0),0,TRACKS.length-1);settings.bike=clamp(Math.trunc(Number(settings.bike)||0),0,BIKES.length-1);
if(!['sunset','day','rain'].includes(settings.weather))settings.weather='sunset';
if(!['race','time'].includes(settings.mode))settings.mode='race';
if(!['rookie','sport','pro'].includes(settings.difficulty))settings.difficulty='sport';
if(![2,3,5].includes(Number(settings.laps)))settings.laps=3;
const records=safeRead('apexgp.records.v4',{}),controls=new DrivingControls(),input=controls.state;
let touchInput=null,mobileUI=null;
let renderer,world,track,playerBike,botBikes=[],ghostBike,race=null,page='race',cameraMode=0,lastFrame=0,accumulator=0,hudAt=0,menuTime=0,messageUntil=0,frameId=0,lastCountdown=-1,camera=null,ghostRecord=null,telemetryAt=0;
const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)').matches;

const sound=new MotorAudio({enabled:settings.audio,volume:settings.volume/100});
const career=new Career(safeRead('apexgp.career.v1',{}),p=>safeWrite('apexgp.career.v1',p));
let socialUI=null,lastSocialPresence='';
let localPause=false,lanLatest=null,lastLanRender=0;const peerBikes=new Map();
const lan=new MultiplayerClient({onNetworkStats:stats=>{const text=`DATI ↑ ${(stats.tx/1024).toFixed(1)} · ↓ ${(stats.rx/1024).toFixed(1)} KB/s`;$('lan-traffic').textContent=text;$('hud-network').textContent=text;},onState:receiveLanState,onStart:startLanRace,onResult:finishLanRace,onError:m=>{$('lan-status').textContent=m;},onDisconnect:()=>{if(race?.options.mode==='lan'){backToMenu();setPage('lan');}$('lan-status').textContent='Connessione chiusa. Ricollegati al server per rientrare.';show('lan-room',false);},onReset:m=>{if(race?.options.mode==='lan'){Object.assign(race.player,{x:m.pose.x,z:m.pose.z,heading:m.pose.heading,progress:m.progress,speed:m.pose.speed,y:m.pose.y||0});}},onPenalty:m=>{message(`PENALITÀ ${m.reason} · +${m.seconds} SECONDI`);}});
const saveSettings=()=>{if(applyingSnapshot)return;safeWrite('apexgp.settings.v1',settings);accountUI?.change();};
const recordKey=()=>`${track.config.id}:${settings.weather}`;
const readRecord=()=>{const r=records[recordKey()];return r&&Number.isFinite(r.time)&&r.time>0&&Array.isArray(r.samples)?r:null;};

const sharedSettings=['line','assist','tcs','track','bike','mode','weather','laps','difficulty'];
function snapshot(){const sharedRecords=structuredClone(records);for(const r of Object.values(sharedRecords))while(r.samples?.length>800)r.samples=r.samples.filter((_,i)=>i%2===0);return{version:1,career:structuredClone(career.profile),records:sharedRecords,settings:Object.fromEntries(sharedSettings.map(k=>[k,settings[k]]))};}
function applySnapshot(value){
 if(!value||typeof value!=='object')return;
 applyingSnapshot=true;
 try{
  career.profile=normalizeProfile(value.career);
  for(const key of Object.keys(records))delete records[key];
  for(const[key,r]of Object.entries(value.records||{})){
   if(!/^(toscana|adriatica|dune|alpine|sakura|marina|azzurra|nordland|canyon|atlas):(day|rain|sunset)$/.test(key)||!Number.isFinite(r?.time)||r.time<=0||!Array.isArray(r.samples))continue;
   records[key]={...r,samples:r.samples.slice(0,2000).filter(p=>p&&['t','s','x','a','l'].every(k=>Number.isFinite(p[k]??0)))};
  }
  const prefs=value.settings||{};
  for(const key of['line','assist','tcs'])if(typeof prefs[key]==='boolean')settings[key]=prefs[key];
  if(Number.isInteger(prefs.track))settings.track=clamp(prefs.track,0,TRACKS.length-1);
  if(Number.isInteger(prefs.bike))settings.bike=clamp(prefs.bike,0,BIKES.length-1);
  if(['race','time'].includes(prefs.mode))settings.mode=prefs.mode;
  if(['day','sunset','rain'].includes(prefs.weather))settings.weather=prefs.weather;
  if([2,3,5].includes(prefs.laps))settings.laps=prefs.laps;
  if(['rookie','sport','pro'].includes(prefs.difficulty))settings.difficulty=prefs.difficulty;
  for(const[id,key]of[['line-toggle','line'],['assist-toggle','assist'],['tcs-toggle','tcs']])$(id).checked=settings[key];
  $('laps-select').value=settings.laps;$('weather-select').value=settings.weather;$('difficulty-select').value=settings.difficulty;
  $('lan-name').value=career.profile.name;
  renderGarage();selectTrack(settings.track);selectBike(settings.bike);setMode(settings.mode);
 }finally{applyingSnapshot=false;}
}

function freeWorld(){if(!world)return;renderer.destroy(world.mesh);renderer.destroy(world.line);for(const b of world.boards)renderer.destroy(b.mesh);for(const mesh of Object.values(world.flagMeshes||{}))renderer.destroy(mesh);for(const texture of world.textures)renderer.gl.deleteTexture(texture);}
function freeBike(bike){if(bike){for(const mesh of new Set(bikeParts(bike,modelMatrix()).map(p=>p.mesh)))renderer.destroy(mesh);renderer.destroy(bike.shadow);for(const t of bike.textures||[])renderer.gl.deleteTexture(t);}}
function selectTrack(index){
  settings.track=mod(index,TRACKS.length);saveSettings();track=new Circuit(TRACKS[settings.track]);renderer.weather=settings.weather;freeWorld();world=buildWorld(renderer,track);camera=null;
  $('track-name').textContent=track.config.name;$('track-country').textContent=track.config.country;$('track-spec').textContent=`${(track.length/1000).toFixed(2).replace('.',',')} km · ${track.config.turns} curve`;$('track-index').textContent=`${String(settings.track+1).padStart(2,'0')} / ${String(TRACKS.length).padStart(2,'0')}`;
  const b=track.bounds,scale=Math.min(142/(b.maxX-b.minX),88/(b.maxZ-b.minZ)),map=p=>[9+(p.x-b.minX)*scale,8+(p.z-b.minZ)*scale];
  const points=track.nodes.filter((_,i)=>i%4===0).map(p=>map(p).join(',')).join(' '),start=map(track.sample(0));
  $('track-preview').innerHTML=`<polyline points="${points} ${map(track.nodes[0]).join(',')}" stroke-linejoin="round" stroke-linecap="round"/><circle cx="${start[0]}" cy="${start[1]}" r="3" fill="#f3f3ef" stroke="none"/>`;
  $('hud-track').textContent=track.config.name.toUpperCase();$('track-select').value=String(settings.track);$('track-character').textContent=track.config.character;show('track-new',!!track.config.isNew);
}
function selectBike(index){
  settings.bike=mod(index,BIKES.length);index=settings.bike;saveSettings();freeBike(playerBike);freeBike(ghostBike);ghostBike=null;playerBike=buildBike(renderer,BIKES[index].rgb,27,1,BIKES[index].style,career.profile.liveries[BIKES[index].id]);
  $('hero-displacement').textContent=`${BIKES[index].cc} cc · PROTOTYPE`;$('garage-character').textContent=`${BIKES[index].name} · ${BIKES[index].character.toUpperCase()} · ${BIKES[index].power} CV`;$('hero-power').textContent=effectiveBike().power;$('hero-top').textContent=effectiveBike().top;$('hero-bike').textContent=BIKES[index].caption;
  document.querySelectorAll('.bike-card').forEach((el,i)=>el.classList.toggle('active',i===index));refreshCareer();
}
function setPage(value){page=value;$('menu').dataset.page=value;for(const p of['race','garage','workshop','lan','settings'])show(`${p}-panel`,p===value);document.querySelectorAll('.nav-link').forEach(b=>b.classList.toggle('active',b.dataset.page===value));$('menu').scrollTop=0;}
function setMode(value){settings.mode=value;saveSettings();document.querySelectorAll('.mode').forEach(b=>b.classList.toggle('active',b.dataset.mode===value));$('difficulty-select').disabled=value==='time';$('difficulty-select').style.opacity=value==='time'?.4:1;}
function updateInputDisplay(){document.querySelectorAll('[data-control]').forEach(el=>{el.classList.toggle('pressed',input[el.dataset.control]);el.setAttribute('aria-pressed',String(input[el.dataset.control]));});}
function clearInput(){touchInput?.reset();controls.clear();updateInputDisplay();}
function message(text,duration=2.5){$('race-message').textContent=text;messageUntil=performance.now()+duration*1000;$('race-message').classList.add('show');}
function startRace(networkConfig=null){
  if(accountUI?.isSwitching()){message('CARICAMENTO DEL PROFILO…');return;}
  lastFrame=performance.now();
  if(!networkConfig?.roundId&&settings.mode==='lan'){returnLanLobby();return;}
  const lanRound=networkConfig?.roundId?networkConfig:null;if(!lanRound&&!career.owns(BIKES[settings.bike].id)){setPage('workshop');return;}localPause=false;
  clearInput();if(!lanRound){settings.laps=Number($('laps-select').value);settings.difficulty=$('difficulty-select').value;settings.weather=$('weather-select').value;saveSettings();}
  renderer.weather=settings.weather;renderer.quality=settings.quality;
  race=new RaceModel(track,{mode:settings.mode,laps:settings.laps,difficulty:settings.difficulty,weather:settings.weather,assist:settings.assist,tcs:settings.tcs,bike:effectiveBike()});
  race.player.name=career.profile.name;
  if(lanRound){const mine=lanRound.players.find(p=>p.id===lan.id);race.countdown=Math.max(.02,(lanRound.startAt-lan.now())/1000);race.player.progress=mine.progress;race.player.offset=mine.slot%2?1.85:-1.85;race.placePlayer();race.networkRound=lanRound.roundId;race.runId=lanRound.roundId+':'+lan.id;}
  ghostRecord=settings.mode==='time'?readRecord():null;ghostBike=ghostBike||buildBike(renderer,[.37,.80,.93],0,.65,BIKES[settings.bike].style);
  for(const b of botBikes)freeBike(b);botBikes=race.bots.map((b,i)=>buildBike(renderer,b.color,b.number,.45,BIKES[i%BIKES.length].style));
  show('menu',false);show('pause-overlay',false);show('result-overlay',false);show('hud');show('countdown');lastCountdown=-1;camera=null;cameraMode=0;accumulator=0;messageUntil=0;$('race-message').classList.remove('show');
  $('surface-label').textContent=settings.weather==='rain'?'BAGNATO · GRIP RIDOTTO':'ASCIUTTO';$('position-total').textContent=settings.mode==='lan'?`/ ${lanRound.players.length+(lanRound.bots?.length||0)}`:settings.mode==='race'?'/ 8':'SOLO';$('position').textContent=settings.mode==='race'?'8':'1';
  sound.start();$('world').focus({preventScroll:true});lastFrame=performance.now();if(lanRound)race.countdown=Math.max(.02,(lanRound.startAt-lan.now())/1000);updateHUD();
}
function backToMenu(){const wasLan=race?.options.mode==='lan';if(wasLan)lan.leave();for(const b of peerBikes.values())freeBike(b);peerBikes.clear();lanLatest=null;localPause=false;race=null;clearInput();sound.tick(null);show('hud',false);show('pause-overlay',false);show('result-overlay',false);show('menu');camera=null;if(wasLan)setMode('race');setPage('race');refreshCareer();$('start-button').focus({preventScroll:true});lastSocialPresence='';socialUI?.presenceChanged();}
function pause(on=true){
  if(!race||race.state==='finished')return;
  const network=race.options.mode==='lan';$('pause-description').textContent=network?'La gara multiplayer continua: gli altri piloti restano in pista. Riprendi per tornare ai comandi.':'Il cronometro si è fermato. La pista ti aspetta.';$('restart-button').disabled=network;$('restart-button').classList.toggle('hidden',network);
  if(network){localPause=on;clearInput();show('pause-overlay',on);if(!on)$('world').focus({preventScroll:true});return;}
  if(on&&race.state!=='paused'){race.beforePause=race.state;race.state='paused';clearInput();show('pause-overlay');$('resume-button').focus({preventScroll:true});}
  else if(!on&&race.state==='paused'){race.state=race.beforePause||'running';accumulator=0;lastFrame=performance.now();show('pause-overlay',false);sound.start();$('world').focus({preventScroll:true});}
}
function handleEvents(){
  for(const event of race.events.splice(0)){
    sound.event(event);
    if(event.type==='start'){message(mobileUI?.isTouch?'◀ ▶ STERZA · GAS · FRENO · ↑ MOTO IMPENNA':'A/D: PIEGA · S: FRENO · SHIFT: IMPENNATA +BOOST',4);sound.beep(780,.18);}
    if(event.type==='offtrack')message('FUORI PISTA · RALLENTA E RIENTRA');
    if(event.type==='contact')message('CONTATTO · LASCIA SPAZIO',1.5);
    if(event.type==='crash'){message(event.kind==='wheelie'?'CADUTA · TROPPO STERZO IN IMPENNATA':'CADUTA · IMPATTO AD ALTA VELOCITÀ',3);if(settings.mode==='lan')lan.send({type:'incident',severity:event.severity||1});}
    if(event.type==='reset'){message('RIENTRO IN PISTA · +2 SECONDI',2);if(settings.mode==='lan')lan.send({type:'reset'});}
    if(event.type==='penalty')message(`PENALITÀ ${event.reason==='vsc'?'VSC':'BANDIERA GIALLA'} · +${event.seconds} SECONDI`,3);
    if(event.type==='restart')message('PISTA LIBERA · RIPARTENZA',3);
    if(event.type==='lap'&&settings.mode!=='lan'){
      const old=readRecord();if(!old||event.time<old.time){let samples=event.recording;while(samples.length>2000)samples=samples.filter((_,i)=>i%2===0);records[recordKey()]={time:event.time,samples,bike:BIKES[settings.bike].name,date:new Date().toISOString()};safeWrite('apexgp.records.v4',records);message(`NUOVO RECORD · ${formatTime(event.time)}`,3.5);}
      else message(`GIRO ${race.lapTimes.length} · ${formatTime(event.time)}`,2.5);
    }
    if(event.type==='finish'){if(settings.mode==='lan')message('ARRIVO · ATTENDI GLI ALTRI PILOTI',10);else finishRace();}
  }
}
function finishRace(){
  const pos=race.networkResult?.position||race.position;const prize=career.reward({id:race.runId,position:pos,laps:settings.laps,mode:settings.mode,time:race.player.finishTime||race.time,clean:!race.crashes&&!race.contacts&&!race.offtrackEvents&&!race.penalties,finished:race.networkResult?.finished!==false});$('result-credits').textContent=prize?`+${prize.toLocaleString('it-IT')} CR · PREMIO GARA`:'SESSIONE COMPLETATA';refreshCareer();$('result-eyebrow').textContent=settings.mode==='race'?'BANDIERA A SCACCHI':'SESSIONE COMPLETATA';$('result-title').textContent=settings.mode==='time'?'Ogni millesimo conta.':pos===1?'Il gradino più alto.':pos<=3?'Un posto sul podio.':'La prossima è tua.';
  $('result-subtitle').textContent=`${track.config.name} · ${settings.laps} giri · ${BIKES[settings.bike].name}`;
  $('result-position').textContent=settings.mode==='time'?'TT':`${pos}°`;$('result-best').textContent=formatTime(race.bestLap);$('result-total').textContent=formatTime(race.player.finishTime);
  if(settings.mode==='race'||settings.mode==='lan')$('result-table').innerHTML=race.order.map((r,i)=>leaderRow(r,i,r.dnf?'RITIRATO':r.finishTime===null?'IN PISTA':formatTime(r.finishTime))).join('');
  else $('result-table').innerHTML=race.lapTimes.map((t,i)=>`<div class="leader-row ${t===race.bestLap?'me':''}"><span class="rank">${i+1}</span><span class="rider-name">GIRO ${i+1}${t===race.bestLap?' · MIGLIORE':''}</span><span>${formatTime(t)}</span></div>`).join('');
  show('countdown',false);show('result-overlay');clearInput();$('race-again').focus({preventScroll:true});
}
function colorCSS(rgb){return`rgb(${rgb.map(v=>Math.round(v*255)).join(',')})`;}
function leaderRow(r,index,gap){return`<div class="leader-row ${r.isPlayer?'me':''}"><span class="rank">${index+1}</span><span class="rider-dot" style="background:${r.isPlayer?'#1a1b1d':colorCSS(r.color)}"></span><span class="rider-name">${r.name}</span><span class="gap">${gap}</span></div>`;}
function ghostAt(t){
  const samples=ghostRecord?.samples;if(!samples||samples.length<2)return null;let lo=0,hi=samples.length-1;
  if(t>ghostRecord.time)return null;
  while(hi-lo>1){const m=(hi+lo)>>1;if(samples[m].t<=t)lo=m;else hi=m;}
  const a=samples[lo],b=samples[hi],f=clamp((t-a.t)/Math.max(.001,b.t-a.t),0,1);return{s:lerp(a.s,b.s,f),x:lerp(a.x,b.x,f),a:lerp(a.a||0,b.a||0,f),l:lerp(a.l||0,b.l||0,f),wx:Number.isFinite(a.wx)&&Number.isFinite(b.wx)?lerp(a.wx,b.wx,f):null,wz:Number.isFinite(a.wz)&&Number.isFinite(b.wz)?lerp(a.wz,b.wz,f):null,h:Number.isFinite(a.h)&&Number.isFinite(b.h)?a.h+wrapAngle(b.h-a.h)*f:null};
}
function updateHUD(){
  if(!race)return;const p=race.player,rec=readRecord();$('position').textContent=race.position;$('lap').innerHTML=`${race.lap} <small>/ ${settings.laps}</small>`;$('lap-time').textContent=clock(race.currentLapTime);$('best-time').textContent=rec?`BEST ${formatTime(rec.time)}`:'BEST —';$('speed').textContent=String(Math.round(p.speed*3.6)).padStart(3,'0');$('gear').textContent=p.gear;$('lean-value').textContent=`${Math.round(Math.abs(p.lean)*180/Math.PI)}°`;$('grip-value').textContent=`${Math.round(p.grip*100)}%`;show('slipstream',p.slipstream);show('wheelie-status',p.wheelie>.08);show('tcs-status',p.tcs);const flag=race.control.info(race);$('flag-label').textContent=flag.label;$('flag-text').textContent=flag.text;$('flag-icon').style.color=flag.color;$('flag-panel').style.borderLeftColor=flag.color;const canvas=$('world');canvas.dataset.heading=String(p.heading);canvas.dataset.progress=String(p.progress);canvas.dataset.speed=String(p.speed);canvas.dataset.wheelie=String(p.wheelie);canvas.dataset.raceState=race.state;canvas.dataset.audioState=sound.enabled?(sound.context?.state||'unavailable'):'muted';
  const rpm=mod(p.speed*3.6,52)/52;document.querySelectorAll('#rpm-bars i').forEach((b,i)=>b.classList.toggle('on',i/18<.25+rpm*.75));
  $('steering-value').textContent=input.left&&!input.right?'←':input.right&&!input.left?'→':'—';$('steering-value').style.color=input.left!==input.right?'#ff6033':'#f3f3ef';
  if(settings.mode==='race'||settings.mode==='lan'){
    const order=race.order,leader=order[0];$('leaderboard').innerHTML=order.map((r,i)=>leaderRow(r,i,i===0?'LEADER':r.finishTime!==null?'FINISH':`+${Math.max(0,(leader.progress-r.progress)/Math.max(20,r.speed)).toFixed(1)}`)).join('');
  }else $('leaderboard').innerHTML=`<div class="leader-row me"><span class="rank">TT</span><span class="rider-name">${escapeText(career.profile.name)}</span><span class="gap">TIME ATTACK</span></div><div class="leader-row"><span class="rider-name">${ghostRecord?'GHOST PERSONALE':'IL TUO PRIMO RECORD'}</span><span class="gap">${ghostRecord?formatTime(ghostRecord.time):'—'}</span></div>`;
  const upcoming=track.targetSpeed(p.progress,settings.weather==='rain'?.74:1),corner=track.sample(p.progress+30).k;
  $('corner-hint').textContent=Math.abs(p.offset)>track.halfWidth?(mobileUI?.isTouch?'FUORI PISTA · TOCCA RIENTRA ↗':'FUORI PISTA · R PER RIENTRARE'):p.speed>upcoming+5?'STACCATA · FRENA':Math.abs(corner)>.003?`CURVA ${corner>0?'SINISTRA':'DESTRA'} · ${Math.round(track.cornerSpeed(p.progress+30,settings.weather==='rain'?.74:1)*3.6)} KM/H`:'RETTILINEO · GAS APERTO';$('corner-hint').style.color=p.speed>upcoming+5?'#ff8055':'#f3f3ef';
  const ghost=ghostAt(race.currentLapTime);if(ghost){const delta=(mod(p.progress,track.length)-ghost.s)/Math.max(20,p.speed);$('delta-label').textContent=`${delta>=0?'−':'+'}${Math.abs(delta).toFixed(2)} s`;$('delta-label').style.color=delta>=0?'#a2da97':'#ff8055';}else{$('delta-label').textContent='—';}
  drawMap();
}
function drawMap(){
  const canvas=$('minimap'),c=canvas.getContext('2d'),b=track.bounds,w=canvas.width,h=canvas.height,scale=Math.min((w-34)/(b.maxX-b.minX),(h-24)/(b.maxZ-b.minZ));
  const left=(w-(b.maxX-b.minX)*scale)/2,top=(h-(b.maxZ-b.minZ)*scale)/2,project=p=>[left+(p.x-b.minX)*scale,top+(p.z-b.minZ)*scale];
  c.clearRect(0,0,w,h);c.beginPath();track.nodes.forEach((p,i)=>{const [x,y]=project(p);if(i===0)c.moveTo(x,y);else c.lineTo(x,y);});c.closePath();c.lineJoin='round';c.lineWidth=5;c.strokeStyle='rgba(0,0,0,.4)';c.stroke();c.lineWidth=2;c.strokeStyle='rgba(229,237,237,.65)';c.stroke();
  const start=project(track.sample(0));c.fillStyle='#eee';c.fillRect(start[0]-3,start[1]-2,6,4);
  if(!race)return;for(const r of race.riders){const [x,y]=project(riderPoint(r));c.beginPath();c.arc(x,y,r.isPlayer?4.4:2.6,0,Math.PI*2);c.fillStyle=r.isPlayer?'#ff6033':colorCSS(r.color);c.fill();if(r.isPlayer){c.strokeStyle='#fff';c.lineWidth=1.3;c.stroke();}}
}

const rainCanvas=document.createElement('canvas');rainCanvas.style.cssText='position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:1;opacity:.4';document.body.insertBefore(rainCanvas,$('menu'));const rainContext=rainCanvas.getContext('2d');
function drawRain(time){
  const active=settings.weather==='rain';rainCanvas.style.display=active?'block':'none';if(!active)return;
  const w=innerWidth,h=innerHeight;if(rainCanvas.width!==w||rainCanvas.height!==h){rainCanvas.width=w;rainCanvas.height=h;}rainContext.clearRect(0,0,w,h);rainContext.strokeStyle='rgba(221,238,247,.48)';rainContext.lineWidth=1;rainContext.beginPath();
  const count=settings.quality==='low'?55:120;for(let i=0;i<count;i++){const x=mod(i*137.17-time*.14,w+200)-100,y=mod(i*87.71+time*.75,h+60)-30;rainContext.moveTo(x,y);rainContext.lineTo(x-6,y+19);}rainContext.stroke();
}
function localPosition(point,x,y,z){return[point.x+Math.cos(point.yaw)*x+Math.sin(point.yaw)*z,y+(point.y||0),point.z-Math.sin(point.yaw)*x+Math.cos(point.yaw)*z];}
function riderPoint(r){const q=track.sample(r.progress,r.offset);if(r.isPlayer||r.isRemote){q.x=r.x;q.z=r.z;}return q;}
function drawRaceFlags(){if(!world.flagMeshes)return;for(const post of world.flagPosts){let flag=race?.control.flag||'green';if(flag==='green'&&race?.control.info(race).flag==='blue')flag='blue';if(flag==='yellow'&&!race.control.applies({progress:post.progress},track))flag='green';renderer.draw(world.flagMeshes[flag]||world.flagMeshes.green,post.matrix);}}
function drawParts(parts,alpha=1){for(const p of parts)renderer.draw(p.mesh,p.matrix,(p.alpha??1)*alpha,p.texture||null,p.lean||0,!!p.rider);}
function bikeFor(r){return r.isPlayer?playerBike:r.isRemote?peerBikes.get(r.id):botBikes[race.bots.indexOf(r)];}
function riderParts(r,bike){const q=riderPoint(r),pitch=(r.isPlayer||r.isRemote?r.pitch||0:0)-Math.atan((q.grade||0)*Math.cos(r.angle||0)),height=(q.y||0)+.025+Math.abs(Math.sin(pitch))*.745;return bikeParts(bike,modelMatrix([q.x,height,q.z],r.isPlayer||r.isRemote?r.heading:q.yaw,r.crash>0?-(r.fallSign||1)*1.28:-r.lean,pitch),r.isPlayer?r.wheelTravel:r.travel??r.progress,r.turnRate||q.k*r.speed,r.speed,r.lean,r.crash||0,r.fallSign||1);}
function renderMenu(dt){
  menuTime+=dt;const p=track.sample(-14),mobile=innerWidth<650,orbit=reducedMotion?0:Math.sin(menuTime*.12)*.16;
  const eye=localPosition(p,mobile?-4.9:-4.7,mobile?2.0:1.85,mobile?6.8:5.65),target=localPosition(p,mobile?-.8:-2.2,mobile?1.1:1.0,0);eye[0]+=orbit;
  const parts=bikeParts(playerBike,modelMatrix([p.x,p.y||0,p.z],p.yaw,0,0,1.50));
  renderer.shadowPass(world.mesh,parts.filter(p=>!p.alpha&&p.shadow!==false),[p.x,p.y||0,p.z],18);
  renderer.begin(eye,target,mobile?1.15:.93,0,mobile?.35:.42);renderer.draw(world.mesh);for(const b of world.boards)renderer.draw(b.mesh,b.matrix,1,b.texture);
  renderer.draw(playerBike.shadow,modelMatrix([p.x,p.y||0,p.z],p.yaw,0,0,1.5),.16);drawParts(parts);drawRaceFlags();renderer.finish();
}
function renderRace(dt){
  const p=race.player,point=riderPoint(p),yaw=p.heading;
  const front={...point,yaw},speedRatio=clamp(p.speed/88,0,1);let eye,target,fov,roll=0;
  if(cameraMode===0){
    const desired=localPosition(front,0,2.3+speedRatio*.65,-5.5-speedRatio*1.3),look=localPosition(front,0,1.00,7+speedRatio*5);
    if(!camera)camera={eye:desired,target:look,heading:yaw};camera.heading+=wrapAngle(yaw-camera.heading)*(1-Math.exp(-dt*4.8));const follow={...point,yaw:camera.heading};const followEye=localPosition(follow,0,2.3+speedRatio*.65,-5.5-speedRatio*1.3);desired.splice(0,3,...followEye);const t=race.state==='paused'?0:Math.min(1,dt*9);camera.eye=camera.eye.map((v,i)=>lerp(v,desired[i],t));camera.target=camera.target.map((v,i)=>lerp(v,look[i],t));eye=camera.eye;target=camera.target;fov=.97+speedRatio*.13;roll=reducedMotion?0:-p.lean*.07;
  }else{eye=localPosition(front,.10*Math.sin(p.lean),1.28,.25);target=localPosition(front,0,1.24,25);fov=1.18;roll=reducedMotion?0:-p.lean*.28;}
  const nearby=race.riders.filter(r=>{const q=riderPoint(r);return !r.dnf&&Math.hypot(q.x-eye[0],q.z-eye[2])<(settings.quality==='low'?240:650);});
  const parts=nearby.map(r=>({r,parts:riderParts(r,bikeFor(r))}));
  const casters=parts.flatMap(o=>o.parts.filter(p=>!p.alpha&&p.shadow!==false));
  renderer.shadowPass(world.mesh,casters,[point.x,point.y||0,point.z],80);
  renderer.begin(eye,target,fov,roll);renderer.draw(world.mesh);if(settings.line)renderer.draw(world.line);for(const b of world.boards)renderer.draw(b.mesh,b.matrix,1,b.texture);
  for(const r of nearby){if(r.isPlayer&&cameraMode===1)continue;const q=riderPoint(r),bike=bikeFor(r);renderer.draw(bike.shadow,modelMatrix([q.x,q.y||0,q.z],q.yaw+(r.angle||0)),.17);}
  for(const o of parts){drawParts(o.r.isPlayer&&cameraMode===1?o.parts.filter(p=>!p.rider):o.parts);}
  const ghost=ghostAt(race.currentLapTime);if(ghost&&ghostBike){const q=track.sample(ghost.s,ghost.x);drawParts(bikeParts(ghostBike,modelMatrix([ghost.wx??q.x,.035,ghost.wz??q.z],ghost.h??q.yaw+ghost.a,-ghost.l),ghost.s),.28);}
  drawRaceFlags();renderer.finish();
}
function frame(now){
  const dt=Math.min(.5,lastFrame?Math.max(0,(now-lastFrame)/1000):1/60);lastFrame=now;
  try{
    if(settings.quality==='low')renderer.governor?.update(dt);
    renderer.scene={track,race};updateLanFrame(now,dt);lan.tick(now,race?.options.mode==='lan'?race.player:null);
    if(race){
      if(race.state!=='paused'&&race.state!=='finished'){
        accumulator+=dt;while(accumulator>=1/120){race.update(1/120,input);accumulator-=1/120;}handleEvents();
      }
      if(race.state==='countdown'){
        const n=Math.ceil(race.countdown-.6),text=n>0?String(n):'GO';$('countdown').firstElementChild.textContent=text;$('countdown').firstElementChild.style.color=n>0?'#f3f3ef':'#ff6033';$('countdown').lastElementChild.textContent=n>0?'TIENI PRONTO IL GAS':'RIDE THE LIMIT';if(n!==lastCountdown){sound.beep(n>0?360:750,n>0?.07:.18);lastCountdown=n;}
      }else show('countdown',false);
      renderRace(dt);if(now-hudAt>80){updateHUD();hudAt=now;}sound.tick(localPause?null:race,input);
    }else renderMenu(dt);
    drawRain(now);if(now>messageUntil)$('race-message').classList.remove('show');if(now-telemetryAt>1000){telemetryAt=now;const c=$('world');c.dataset.renderTriangles=renderer.stats?.triangles||0;c.dataset.renderDraws=renderer.stats?.draws||0;c.dataset.frameMs=(renderer.governor?.average*1000||dt*1000).toFixed(1);}frameId=requestAnimationFrame(frame);
  }catch(error){fatal(error);}
}
function fatal(error){cancelAnimationFrame(frameId);show('loading',false);show('error-overlay');$('error-text').textContent=error?.message||'Il renderer non è riuscito a inizializzarsi. Prova a ricaricare il gioco.';console.error(error);sound.tick(null);}

function setupUI(){
  renderGarage();
  $('track-select').innerHTML=TRACKS.map((t,i)=>`<option value="${i}">${t.isNew?'NEW · ':''}${t.name}</option>`).join('');
  $('track-select').addEventListener('change',()=>selectTrack(Number($('track-select').value)));
  $('rpm-bars').innerHTML=Array.from({length:18},(_,i)=>`<i class="${i>13?'red':''}"></i>`).join('');
  $('laps-select').value=settings.laps;$('difficulty-select').value=settings.difficulty;$('weather-select').value=settings.weather;$('quality-select').value=settings.quality;$('line-toggle').checked=settings.line;$('assist-toggle').checked=settings.assist;$('tcs-toggle').checked=settings.tcs;$('audio-toggle').checked=settings.audio;$('volume-range').value=settings.volume;
  $('compat-button').addEventListener('click',()=>{const u=new URL(location.href);u.searchParams.set('view','top');location.href=u.href;});
  $('world').tabIndex=0;$('world').style.outline='none';
  touchInput=bindTouchControls({root:$('touch-controls'),controls,isEnabled:()=>!!race&&!localPause&&['running','countdown'].includes(race.state),onChange:updateInputDisplay,onEngage:()=>sound.start()});
  mobileUI=mountMobileUI({mode:settings.touch,onClearInput:clearInput});
  $('touch-select').value=settings.touch;
  $('touch-select').addEventListener('change',()=>{settings.touch=$('touch-select').value;mobileUI.setMode(settings.touch);saveSettings();});
  document.querySelectorAll('[data-fullscreen]').forEach(el=>el.addEventListener('click',()=>mobileUI.toggleFullscreen().catch(()=>message('SCHERMO INTERO NON DISPONIBILE IN QUESTO BROWSER',2))));
  $('reset-button').addEventListener('click',()=>{if(race?.state==='running'&&!localPause){clearInput();race.resetPlayer();}});
  document.querySelectorAll('[data-page]').forEach(el=>el.addEventListener('click',()=>setPage(el.dataset.page)));
  document.querySelectorAll('[data-mode]').forEach(el=>el.addEventListener('click',()=>setMode(el.dataset.mode)));
  $('prev-track').addEventListener('click',()=>selectTrack(settings.track-1));$('next-track').addEventListener('click',()=>selectTrack(settings.track+1));$('weather-select').addEventListener('change',()=>{settings.weather=$('weather-select').value;selectTrack(settings.track);});
  for(const id of['laps','difficulty'])$(id+'-select').addEventListener('change',()=>{settings[id]=id==='laps'?Number($(id+'-select').value):$(id+'-select').value;saveSettings();});
  for(const [id,key] of[['line-toggle','line'],['assist-toggle','assist'],['tcs-toggle','tcs'],['audio-toggle','audio']])$(id).addEventListener('change',()=>{settings[key]=$(id).checked;sound.enabled=settings.audio;saveSettings();updateSoundButton();if(settings.audio)sound.start();});
  $('volume-range').addEventListener('input',()=>{settings.volume=Number($('volume-range').value);sound.volume=settings.volume/100;saveSettings();});$('quality-select').addEventListener('change',async()=>{const value=$('quality-select').value;$('quality-select').disabled=true;try{if(!renderer.compat)await prepareModelAssets({quality:value});settings.quality=value;renderer.quality=value;document.body.classList.toggle('performance-mode',value==='low');selectTrack(settings.track);selectBike(settings.bike);saveSettings();}catch(error){$('quality-select').value=settings.quality;$('performance-note').textContent=error.message;}finally{$('quality-select').disabled=false;}});
  $('start-button').addEventListener('click',startRace);$('restart-button').addEventListener('click',startRace);$('race-again').addEventListener('click',startRace);$('menu-button').addEventListener('click',backToMenu);$('result-menu').addEventListener('click',backToMenu);$('pause-button').addEventListener('click',()=>pause(true));$('resume-button').addEventListener('click',()=>pause(false));$('camera-button').addEventListener('click',changeCamera);$('sound-button').addEventListener('click',toggleSound);
  $('show-controls').addEventListener('click',()=>{show('controls-overlay');$('close-controls').focus();});$('close-controls').addEventListener('click',()=>{show('controls-overlay',false);$('show-controls').focus();});
  document.querySelector('.brand').addEventListener('click',e=>{e.preventDefault();setPage('race');});
  document.addEventListener('keydown',e=>{
    const command=e.code&&e.code!=='Unidentified'?e.code:({escape:'Escape',p:'KeyP',c:'KeyC',m:'KeyM',r:'KeyR',f:'KeyF'})[String(e.key||'').toLowerCase()];
    if(accountUI?.isOpen()){if(command==='Escape'){e.preventDefault();accountUI.close();}return;}
    if(socialUI?.isOpen()){if(command==='Escape'){e.preventDefault();socialUI.close();}return;}
    if(/^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName||'')&&command!=='Escape')return;
    if(command==='Escape'&&!$('controls-overlay').classList.contains('hidden')){show('controls-overlay',false);return;}
    if(!race)return;if(localPause){if(command==='Escape'||command==='KeyP'){e.preventDefault();pause(false);}return;}if(controls.actionFor(e)){e.preventDefault();if(race.state==='running'||race.state==='countdown'){controls.keyDown(e);updateInputDisplay();}return;}
    if(e.repeat)return;
    if(command==='Escape'||command==='KeyP'){e.preventDefault();pause(race.options.mode==='lan'?!localPause:race.state!=='paused');}
    if(command==='KeyC')changeCamera();if(command==='KeyM')toggleSound();if(command==='KeyR'&&race.state==='running')race.resetPlayer();if(command==='KeyF')mobileUI.toggleFullscreen().catch(()=>{});
  });
  document.addEventListener('keyup',e=>{if(controls.keyUp(e))updateInputDisplay();});
  window.addEventListener('blur',()=>{clearInput();if(race&&race.state!=='finished')pause(true);});document.addEventListener('visibilitychange',()=>{if(document.hidden){clearInput();pause(true);}});
  $('world').addEventListener('webglcontextlost',e=>{e.preventDefault();fatal(new Error('Il browser ha sospeso la grafica 3D. Ricarica per tornare in pista; i tuoi record sono già salvati.'));});
  setupCareerAndLan();socialUI=mountSocialUI({config:ONLINE_CONFIG,lan,getName:()=>career.profile.name,getRace:()=>race,isPaused:()=>localPause||race?.state==='paused',pause,onJoin:joinFromFriend});setMode(settings.mode);updateSoundButton();
  accountUI=mountAccounts({getSnapshot:snapshot,applySnapshot,freshSnapshot:()=>({version:1,career:normalizeProfile(),records:{},settings:{}}),social:socialUI,canSwitch:()=>!race&&!lan.state,onOpen:()=>{clearInput();if(race)pause(true);}});
}
function changeCamera(){if(!race)return;cameraMode=1-cameraMode;camera=null;message(cameraMode?'VISUALE CASCO':'VISUALE CHASE',1.2);}
function updateSoundButton(){$('sound-button').classList.toggle('sound-off',!settings.audio);$('sound-button').setAttribute('aria-pressed',String(settings.audio));}
function toggleSound(){settings.audio=!settings.audio;sound.enabled=settings.audio;$('audio-toggle').checked=settings.audio;saveSettings();updateSoundButton();if(settings.audio)sound.start();}

function returnLanLobby(){localPause=false;sound.tick(null);clearInput();race=null;settings.mode='race';show('result-overlay',false);show('pause-overlay',false);show('hud',false);show('menu');setPage('lan');if(lan.state?.hostId===lan.id)lan.send({type:'lobby'});receiveLanState(lan.state);}
function effectiveBike(){return career.bike(BIKES[settings.bike].id,{stock:settings.mode==='lan'});}
function renderGarage(){
 $('bike-list').innerHTML=BIKES.map((b,i)=>`<button class="bike-card ${i===settings.bike?'active':''} ${career.owns(b.id)?'':'locked'}" data-bike="${i}"><i class="bike-color" style="background:${b.color}"></i><span><strong>${b.name}${b.price?'<em class="new-bike">NEW</em>':''}</strong><small>${b.description}</small><span class="bike-owned">${career.owns(b.id)?'NEL GARAGE':b.price.toLocaleString('it-IT')+' CR'}</span></span><span class="bike-metrics"><span><b>${career.bike(b.id).power}</b>CV</span><span><b>${career.bike(b.id).top}</b>KM/H</span></span></button>`).join('');
 document.querySelectorAll('[data-bike]').forEach(el=>el.addEventListener('click',()=>selectBike(Number(el.dataset.bike))));
}
function refreshCareer(){
 const b=BIKES[settings.bike],owned=career.owns(b.id),profile=career.profile,credits=profile.credits.toLocaleString('it-IT')+' CR';
 $('wallet').textContent=credits;$('workshop-wallet').textContent=credits;$('profile-name').textContent=profile.name;$('workshop-bike').value=String(settings.bike);$('livery-select').value=profile.liveries[b.id];$('livery-select').disabled=!owned;
 const stats=career.bike(b.id);$('workshop-summary').textContent=`${b.name} · ${stats.power} CV · ${stats.top} km/h · ${owned?'NEL GARAGE':b.price.toLocaleString('it-IT')+' CR'}`;
 show('buy-bike',!owned);$('buy-bike').textContent=`ACQUISTA · ${(b.price||0).toLocaleString('it-IT')} CR`;$('buy-bike').disabled=owned||profile.credits<(b.price||0);
 $('upgrade-list').innerHTML=Object.entries(UPGRADES).map(([key,spec])=>{const level=profile.upgrades[b.id][key],price=spec.cost[level];return`<div class="upgrade-row"><span><b>${spec.name}</b><small>${spec.detail}</small><small class="upgrade-level">LIVELLO ${level} / 3</small></span><button data-upgrade="${key}" ${!owned||level===3||profile.credits<price?'disabled':''}>${level===3?'MAX':price.toLocaleString('it-IT')+' CR'}</button></div>`;}).join('');
 document.querySelectorAll('[data-upgrade]').forEach(el=>el.addEventListener('click',()=>{const result=career.upgrade(b.id,el.dataset.upgrade);$('shop-status').textContent=result.message;if(result.ok){renderGarage();selectBike(settings.bike);}}));
 $('start-button').disabled=!owned;$('start-button').firstElementChild.textContent=owned?'SCENDI IN PISTA':'ACQUISTA LA MOTO IN OFFICINA';
}
function setupCareerAndLan(){
 $('workshop-bike').innerHTML=BIKES.map((b,i)=>`<option value="${i}">${b.name}${career.owns(b.id)?'':' · DA ACQUISTARE'}</option>`).join('');
 $('workshop-bike').addEventListener('change',()=>selectBike(Number($('workshop-bike').value)));
 $('buy-bike').addEventListener('click',()=>{const r=career.buy(BIKES[settings.bike].id);$('shop-status').textContent=r.message;renderGarage();selectBike(settings.bike);});
 $('livery-select').addEventListener('change',()=>{if(career.livery(BIKES[settings.bike].id,$('livery-select').value))selectBike(settings.bike);});
  $('backup-export').addEventListener('click',()=>{const a=document.createElement('a'),url=URL.createObjectURL(new Blob([JSON.stringify({format:'apexgp-save',version:2,snapshot:snapshot()},null,2)],{type:'application/json'}));a.href=url;a.download='ApexGP-salvataggio.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),2000);});
  $('backup-import').addEventListener('click',()=>$('backup-file').click());$('backup-file').addEventListener('change',async()=>{try{const f=$('backup-file').files?.[0];if(!f)return;if(f.size>8e6)throw Error('File troppo grande');const raw=JSON.parse(await f.text());if(raw.format==='apexgp-save'&&raw.version===2&&Array.isArray(raw.snapshot?.career?.owned)){applySnapshot(raw.snapshot);safeWrite('apexgp.career.v1',career.profile);safeWrite('apexgp.records.v4',records);saveSettings();}else if(raw.version===1&&Array.isArray(raw.owned))career.import(raw);else throw Error('Salvataggio non riconosciuto');renderGarage();selectBike(settings.bike);$('shop-status').textContent='Salvataggio importato.';$('backup-file').value='';}catch{$('shop-status').textContent='Impossibile importare questo salvataggio.'}});
 const cloud=safeRead('apexgp.online.v2',ONLINE_CONFIG);$('cloud-url').value=cloud.url||'';$('cloud-key').value=cloud.publishableKey||'';$('net-backend').value='supabase';updateNetworkFields();$('net-backend').addEventListener('change',updateNetworkFields);$('copy-invite').addEventListener('click',copyCloudInvite);
 $('lan-server').value=location.protocol==='http:'||location.protocol==='https:'?location.origin:'';$('lan-name').value=career.profile.name;
 $('lan-connect').addEventListener('click',connectLan);
 $('lan-create').addEventListener('click',async()=>{if(!lan.id&&!await connectLan())return;savePilot();lan.create(career.profile.name,BIKES[settings.bike].id,career.profile.liveries[BIKES[settings.bike].id],{trackId:TRACKS[settings.track].id,weather:settings.weather,laps:Number($('laps-select').value)});});
 $('lan-join').addEventListener('click',async()=>{let code=$('lan-code').value.trim();if(code.startsWith('APEX32.')){try{const invite=JSON.parse(atob(code.slice(7)));if(typeof invite.url!=='string'||typeof invite.publishableKey!=='string'||typeof invite.code!=='string')throw Error('invite');$('net-backend').value='supabase';updateNetworkFields();lan.cloud.disconnect(false);$('cloud-url').value=invite.url;$('cloud-key').value=invite.publishableKey;code=invite.code;}catch{$('lan-status').textContent='Invito non valido.';return;}}if(!lan.id&&!await connectLan())return;savePilot();lan.join(code,career.profile.name,BIKES[settings.bike].id,career.profile.liveries[BIKES[settings.bike].id]);});
 $('lobby-bike').innerHTML=BIKES.map(b=>`<option value="${b.id}">${b.name}</option>`).join('');$('lobby-track').innerHTML=TRACKS.map(t=>`<option value="${t.id}">${t.name}</option>`).join('');
 $('lobby-bike').addEventListener('change',()=>{const id=$('lobby-bike').value;lan.setBike(id,career.profile.liveries[id]||'factory');});$('lobby-track').addEventListener('change',()=>lan.setOptions({trackId:$('lobby-track').value}));$('lobby-bots').addEventListener('change',()=>lan.setOptions({bots:$('lobby-bots').checked}));
 $('lan-ready').addEventListener('click',()=>lan.ready());$('lan-start').addEventListener('click',()=>lan.start());$('lan-leave').addEventListener('click',()=>{lan.leave();show('lan-room',false);$('lan-status').textContent='Stanza lasciata.';lastSocialPresence='';socialUI?.presenceChanged();});refreshCareer();
}
function savePilot(){career.profile.name=String($('lan-name').value).trim().slice(0,16)||'JACK';career.commit();}
function updateNetworkFields(){const cloud=$('net-backend').value==='supabase';lan.setBackend(cloud?'supabase':'lan');show('cloud-config',cloud);show('local-config',!cloud);$('network-help').textContent=cloud?'Server online ApexGP pronto. Crea una stanza e condividi il codice con il tuo amico: ciascuno apre il sito ApexGP.':'Apri il gioco dall’indirizzo del server LAN o del tunnel.';}
function copyCloudInvite(){if(lan.backend!=='supabase'||!lan.state)return;const config=lan.cloud.config,token='APEX32.'+btoa(JSON.stringify({...config,code:lan.state.code}));$('cloud-invite').value=token;show('invite-output');if(navigator.clipboard?.writeText)navigator.clipboard.writeText(token).then(()=>{$('lan-status').textContent='Invito copiato. Invialo al tuo amico, che lo incolla nel campo codice.';}).catch(()=>{$('cloud-invite').focus();$('cloud-invite').select();});}
async function connectLan(){if(lan.backend==='lan'&&location.protocol==='file:'){$('lan-status').textContent='Per la modalità LAN apri il gioco dal server locale.';return false;}$('lan-status').textContent='Collegamento…';try{if(lan.backend==='supabase'){const config={url:$('cloud-url').value.trim(),publishableKey:$('cloud-key').value.trim()};lan.configure(config);await lan.connect();safeWrite('apexgp.online.v2',config);}else await lan.connect($('lan-server').value||location.host);$('lan-status').textContent='Collegato. Crea una stanza o inserisci il codice/invito.';return true;}catch(e){$('lan-status').textContent=e.message;return false;}}

function receiveLanState(state){
 if(!state)return;lanLatest=state;const presenceKey=[state.code,state.status,state.options.trackId].join(':');if(presenceKey!==lastSocialPresence){lastSocialPresence=presenceKey;socialUI?.presenceChanged();}if(!race||race.options.mode!=='lan'){
  show('lan-room',true);$('lan-room-code').textContent=state.code;show('copy-invite',lan.backend==='supabase');$('lan-latency').textContent=`${Math.round(lan.latency)} ms`;
  const config=TRACKS.find(t=>t.id===state.options.trackId);$('lan-options').textContent=`${config?.name||''} · ${state.options.laps} giri · ${state.options.weather==='rain'?'Pioggia':state.options.weather==='day'?'Sereno':'Tramonto'} · Moto di serie`;
  const bots=state.bots||lan.botRiders();$('lan-players').innerHTML=[...state.players,...bots].map(p=>`<div class="lan-player ${p.isBot?'bot':''}"><b>${escapeText(p.name)}</b><span>${BIKES.find(b=>b.id===p.bikeId)?.name||''}</span><span>${p.isBot?'BOT':p.ready?'PRONTO':'IN ATTESA'}${p.id===state.hostId?' · HOST':''}</span></div>`).join('');
  const mine=state.players.find(p=>p.id===lan.id),editable=state.status==='lobby',host=state.hostId===lan.id;$('lobby-bike').value=mine?.bikeId||BIKES[settings.bike].id;$('lobby-bike').disabled=!editable;$('lobby-track').value=state.options.trackId;$('lobby-track').disabled=!editable||!host;$('lobby-bots').checked=!!state.options.bots;$('lobby-bots').disabled=!editable||!host;$('lobby-bot-count').textContent=state.options.bots?`${bots.length} bot · ${state.players.length} giocatori · griglia da ${state.players.length+bots.length}`:'Riempi la griglia fino a 8 piloti.';$('lobby-edit-note').textContent=editable?(host?'Cambia le scelte senza uscire. Dopo ogni modifica tutti riconfermano Pronto.':'Scegli la tua moto. Circuito e bot vengono gestiti dal creatore. Dopo ogni modifica riconferma Pronto.'):'Le scelte si riaprono nella lobby dopo la gara.';if(editable&&mine){const i=BIKES.findIndex(b=>b.id===mine.bikeId);if(i>=0&&i!==settings.bike)selectBike(i);}$('lan-ready').textContent=mine?.ready?'ANNULLA PRONTO':'PRONTO';$('lan-ready').disabled=state.status!=='lobby';$('lan-start').disabled=state.status!=='lobby'||state.hostId!==lan.id||state.players.length<2&&!state.options.bots||!state.players.every(p=>p.ready);$('lan-status').textContent=state.status==='lobby'?'Condividi questo codice, oppure copia l’invito per i tuoi amici.':'Gara in corso.';
 }
 if(race?.options.mode==='lan'&&state.roundId===race.networkRound){if(race.state!=='finished')race.control.set(state.flag,state.flagRemaining,state.flagZone);const mine=state.players.find(p=>p.id===lan.id);if(mine?.finishTime!==null&&mine?.finishTime!==undefined)race.player.finishTime=mine.finishTime;if(mine&&race.state!=='countdown'&&state.elapsed>0){race.time=state.elapsed+mine.penalties;race.penalties=mine.penalties;}}
}
function escapeText(text){return String(text).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function startLanRace(state){
 settings.mode='lan';settings.track=TRACKS.findIndex(t=>t.id===state.options.trackId);settings.weather=state.options.weather;settings.laps=state.options.laps;const me=state.players.find(p=>p.id===lan.id);settings.bike=Math.max(0,BIKES.findIndex(b=>b.id===me.bikeId));$('laps-select').value=String(settings.laps);$('weather-select').value=settings.weather;selectTrack(settings.track);selectBike(settings.bike);
 for(const b of peerBikes.values())freeBike(b);peerBikes.clear();for(const p of [...state.players,...(state.bots||lan.botRiders())])if(p.id!==lan.id){const b=BIKES.find(b=>b.id===p.bikeId)||BIKES[0];peerBikes.set(p.id,buildBike(renderer,b.rgb,p.number||27+p.slot,.55,b.style,p.livery));}
 startRace(state);lanLatest=state;updateLanFrame(performance.now(),0);
}
async function joinFromFriend(code){
 if(race&&race.state!=='finished')throw Error('Completa la gara prima di entrare in un’altra lobby.');if(race)backToMenu();$('net-backend').value='supabase';updateNetworkFields();if(lan.cloud.config?.url!==ONLINE_CONFIG.url){lan.cloud.disconnect(false);$('cloud-url').value=ONLINE_CONFIG.url;$('cloud-key').value=ONLINE_CONFIG.publishableKey;}setPage('lan');show('menu');if(!lan.id&&!await connectLan())return false;savePilot();return await lan.join(code,career.profile.name,BIKES[settings.bike].id,career.profile.liveries[BIKES[settings.bike].id]||'factory');
}
function updateLanFrame(now,dt){
 if(!race||race.options.mode!=='lan'||!lanLatest)return;const others=[];
 for(const p of [...lanLatest.players,...lan.botRiders()]){if(p.id===lan.id)continue;const pose=p.isBot?p.pose:lan.sample(p.id)||p.pose;if(!pose)continue;const b=BIKES.find(b=>b.id===p.bikeId)||BIKES[0],q=track.sample(p.progress);others.push({...pose,id:p.id,name:p.name,bikeId:b.id,color:b.rgb,progress:pose.progress??p.progress,offset:(pose.x-q.x)*q.tz-(pose.z-q.z)*q.tx,heading:pose.heading,lean:pose.lean||0,speed:pose.speed||0,isRemote:true,isBot:!!p.isBot,isPlayer:false,finishTime:p.finishTime??null,dnf:p.dnf,angle:wrapAngle(pose.heading-q.yaw),wheelTravel:pose.travel||0});}
 race.riders=[race.player,...others];
 if(race.state==='running'&&race.collisionCooldown<=0)for(const r of others){if(r.dnf||r.finishTime!==null||r.crash>0||Math.hypot(r.x-race.player.x,r.z-race.player.z)>1.4)continue;const p=race.player,relative=Math.hypot(Math.sin(p.heading)*p.speed-Math.sin(r.heading)*r.speed,Math.cos(p.heading)*p.speed-Math.cos(r.heading)*r.speed);race.collisionCooldown=1.1;race.contacts++;if(relative>10||p.wheelie>.12&&relative>5)race.crashPlayer('contact',relative>22?2:1);else{p.speed*=.90;race.emit('contact');}}
}
function finishLanRace(state){if(!race||race.networkRound!==state.roundId)return;const mine=state.players.find(p=>p.id===lan.id),position=state.order.indexOf(lan.id)+1;race.player.finishTime=mine.finishTime||state.elapsed+mine.penalties;race.networkResult={position,finished:!mine.dnf};race.player.dnf=mine.dnf;race.state='finished';race.control.set('chequered',1e9);updateLanFrame(performance.now(),0);finishRace();}

async function boot(){try{
  renderer=new (new URLSearchParams(location.search).get('view')==='top'?OverviewRenderer:Renderer)($('world'));renderer.quality=settings.quality;document.body.classList.toggle('performance-mode',settings.quality==='low');if(!renderer.compat)await prepareModelAssets({quality:settings.quality,onProgress:(n,total)=>{$('loading').lastElementChild.textContent=`IMPORTIAMO I MODELLI 3D · ${n} / ${total}`;}});if(renderer.compat)document.body.classList.add('compat-view');setupUI();selectTrack(settings.track);selectBike(settings.bike);show('loading',false);show('menu');requestAnimationFrame(frame);
}catch(error){fatal(error);}

}
const bootReady=boot();
