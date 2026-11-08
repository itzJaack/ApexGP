import {sectorRanges} from './circuit-sectors.js';
const wrap=(value,length)=>(value%length+length)%length;
export function makeFlagZone(progress,blocked=false,length=6000,remaining=12){
 const count=Math.ceil(length/180),step=length/count,centre=wrap(progress,length),post=Math.floor(centre/step);
 return{id:post,progress:centre,start:wrap((post-1)*step,length),end:wrap((post+1)*step,length),
   flag:blocked?'doubleyellow':'yellow',remaining};
}
export function zoneContains(zone,progress,length){
 const p=wrap(progress,length),start=wrap(zone.start,length),end=wrap(zone.end,length);
 return start<=end?p>=start&&p<end:p>=start||p<end;
}
export function zoneFlagAt(zones,progress,length){
 let flag='green';
 for(const zone of zones||[])if(zone.remaining>0&&zoneContains(zone,progress,length)){
  if(zone.flag==='doubleyellow')return 'doubleyellow';flag='yellow';
 }
 return flag;
}
export function flagSectors(zones,length){
 return sectorRanges(length).map(({index,start,end})=>{
  const active=(zones||[]).filter(z=>z.remaining>0&&(zoneContains(z,start,length)||zoneContains(z,end-.01,length)||wrap(z.progress,length)>=start&&wrap(z.progress,length)<end));
  return{index,flag:active.some(z=>z.flag==='doubleyellow')?'doubleyellow':active.length?'yellow':'green',zones:active.length};
 });
}
export function mergeFlagZone(zones,zone){
 const previous=zones.find(item=>item.id===zone.id);
 if(previous){previous.remaining=Math.max(previous.remaining,zone.remaining);if(zone.flag==='doubleyellow')previous.flag=zone.flag;previous.riderIds=[...new Set([...(previous.riderIds||[]),...(zone.riderIds||[])])];return previous;}
 zones.push(zone);return zone;
}

// A frequent stream of separate falls does not justify stopping the race.
// A red is reserved for a sustained pile-up actually spanning the asphalt.
export function blockedTrack(riders,track){
 const fallen=riders.filter(r=>r.fall&&Math.abs(r.offset)<track.halfWidth+.3);
 for(const centre of fallen){
  const group=fallen.filter(r=>Math.abs(r.progress-centre.progress)<55);
  if(group.length<5)continue;
  const width=Math.max(...group.map(r=>r.offset))-Math.min(...group.map(r=>r.offset))+1.4;
  if(width>track.halfWidth*1.45)return{progress:centre.progress,count:group.length};
 }
 return null;
}
