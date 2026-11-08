import {RED_STOP_HOLD_SECONDS} from './race-signals.js';
import {makeFlagZone,zoneFlagAt,flagSectors,mergeFlagZone,blockedTrack} from './sector-flags.js';
export const FLAGS={doubleyellow:{label:'DOPPIA GIALLA',text:'Ostacolo in pista · niente sorpassi',color:'#f4cf52'},black:{label:'BANDIERA NERA',text:'Squalifica · rientra ai box',color:'#d9dfe6'},green:{label:'VERDE',text:'Pista libera',color:'#77d88b'},yellow:{label:'BANDIERA GIALLA',text:'Pericolo: rallenta, niente sorpassi nella zona',color:'#f4cf52'},blue:{label:'BANDIERA BLU',text:'Un pilota sta per doppiarti: lascia spazio',color:'#67a9ff'},red:{label:'BANDIERA ROSSA',text:'Frenata progressiva · gara sospesa',color:'#ff6469'},vsc:{label:'VSC · NEUTRALIZZAZIONE',text:'Massimo 90 km/h · niente sorpassi',color:'#f4cf52'},chequered:{label:'BANDIERA A SCACCHI',text:'Gara conclusa',color:'#eeeeed'}};
export class RaceControl{
 constructor(track=null){this.track=track;this.flag='green';this.remaining=4;this.zone=null;this.zones=[];this.incidents=[];this.violations=0;this.cooldown=0;this.lastOrder=[];this.elapsed=0;this.sequence=0;this.blockedFor=0;}
 incident(progress,severity=1,now=this.elapsed,context={}){
  if(this.flag==='red')return this.flag;
  this.incidents=this.incidents.filter(i=>now-i.time<18);this.incidents.push({time:now,progress,severity});
  if(severity>=3){this.set('red',7,progress);return this.flag;}
  const zone=makeFlagZone(progress,context.onTrack??severity>=2,this.track?.length||6000,12);
  zone.riderIds=context.riderIds||[];mergeFlagZone(this.zones,zone);
  this.flag='yellow';this.zone=progress;this.remaining=Math.max(...this.zones.map(z=>z.remaining));this.sequence++;
  return zone.flag;
 }
 set(flag,seconds=12,zone=null){
  if(!FLAGS[flag]&&flag!=='doubleyellow')return;
  this.flag=flag==='doubleyellow'?'yellow':flag;this.remaining=seconds;this.zone=zone;this.sequence++;
  this.zones=['yellow','doubleyellow'].includes(flag)?[makeFlagZone(zone??0,flag==='doubleyellow',this.track?.length||6000,seconds)]:[];
 }
 sync(state){this.set(state.flag,state.flagRemaining,state.flagZone);if(Array.isArray(state.flagZones))this.zones=state.flagZones.map(z=>({...z}));}
 flagAt(progress,track=this.track){if(['red','vsc','chequered'].includes(this.flag))return this.flag;return zoneFlagAt(this.zones,progress,track?.length||6000);}
 sectors(track=this.track){return flagSectors(this.zones,track?.length||6000);}
 applies(player,track){return ['yellow','doubleyellow','red','vsc'].includes(this.flagAt(player.progress,track));}
 cautionLimit(rider,track=this.track){
  const flag=this.flagAt(rider.progress,track);if(flag==='red')return 0;if(flag==='vsc')return 25;
  if(!['yellow','doubleyellow'].includes(flag))return Infinity;
  const grip=(rider.bike?.grip||1.1)*(this.weather==='rain'?.74:1);
  const normal=track.targetSpeed?.(rider.progress,grip,1,10,180)??Math.sqrt(9.81*grip/Math.max(.001,Math.abs(track.sample(rider.progress).k||0)));
  return Math.min(flag==='doubleyellow'?40:60,normal*(flag==='doubleyellow'?.60:.78));
 }
 tick(dt,race){
  this.elapsed+=dt;this.cooldown=Math.max(0,this.cooldown-dt);
  const live=new Map((race?.riders||[]).map(r=>[r.id,r]));
  if(this.flag!=='red')for(const rider of live.values())if(rider.fall){
   const moving=makeFlagZone(rider.progress,Math.abs(rider.offset)<race.track.halfWidth+.3,race.track.length,2);moving.riderIds=[rider.id];
   const previous=this.zones.find(z=>z.id===moving.id);if(!previous||previous.flag!==moving.flag)this.sequence++;
   mergeFlagZone(this.zones,moving);if(this.flag==='green')this.flag='yellow';
  }
  for(const zone of this.zones){zone.remaining-=dt;if(zone.riderIds?.some(id=>{const rider=live.get(id);return rider?.fall&&makeFlagZone(rider.progress,false,race.track.length).id===zone.id;}))zone.remaining=Math.max(zone.remaining,2);}
  const count=this.zones.length;this.zones=this.zones.filter(z=>z.remaining>0);if(count!==this.zones.length)this.sequence++;
  if(this.flag==='yellow'){
   this.remaining=Math.max(0,...this.zones.map(z=>z.remaining));
   if(!this.zones.length){this.flag='green';this.remaining=4;this.zone=null;}
  }else if(this.remaining>0){
   this.remaining-=dt;
   if(this.flag==='red'&&race&&!race.redReady)this.remaining=Math.max(this.remaining,RED_STOP_HOLD_SECONDS);
   if(this.remaining<=0&&this.flag!=='chequered'){const red=this.flag==='red';this.set('green',4);return{restart:red};}
  }
  const blocked=race?.riders&&race.track&&this.flag!=='red'?blockedTrack(race.riders,race.track):null;
  this.blockedFor=blocked?this.blockedFor+dt:0;
  if(this.blockedFor>2){this.incident(blocked.progress,3);this.blockedFor=0;}
  if(race?.state==='finished'&&this.flag!=='chequered')this.set('chequered',1e9);
  return null;
 }
 info(race){
  let flag=this.flagAt(race?.player?.progress??this.zone??0,race?.track||this.track);
  if(race?.player?.dsq)flag='black';
  if(flag==='green'&&race?.riders?.some(r=>!r.isPlayer&&!r.dnf&&r.progress-race.player.progress>race.track.length-18&&r.progress-race.player.progress<race.track.length+25))flag='blue';
  const info={flag,...FLAGS[flag],remaining:Math.max(0,this.remaining),zone:this.zone};
  if(['yellow','doubleyellow'].includes(flag))info.text=`${flag==='doubleyellow'?'Ostacolo in pista':'Pericolo a bordo pista'} · rallenta, niente sorpassi fino al verde`;
  if(flag==='red'&&race?.redReady)info.text='Gruppo fermo · preparati alla ripartenza';
  return info;
 }
 speedPenalty(race,dt){if(this.flag!=='vsc'||race.player.speed<90/3.6+2||this.cooldown>0)return 0;this.violations+=dt;if(this.violations<3)return 0;this.violations=0;this.cooldown=5;return 3;}
}
