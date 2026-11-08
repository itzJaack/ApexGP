const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
function timeAt(profile,position){
 const {positions,times}=profile;if(position<=positions[0])return 0;if(position>=positions.at(-1))return times.at(-1);
 let lo=0,hi=positions.length-1;
 while(hi-lo>1){const mid=(lo+hi)>>1;if(positions[mid]<=position)lo=mid;else hi=mid;}
 return times[lo]+(times[hi]-times[lo])*(position-positions[lo])/(positions[hi]-positions[lo]);
}
function rangesFor(profile,event,length){
 const ranges=[],zone=event.zone,finish=profile.positions.at(-1);
 for(let lap=-1;lap<=Math.ceil(finish/length);lap++){
  const start=zone.start+lap*length,end=zone.end+lap*length+(zone.end<zone.start?length:0);
  if(end<=profile.positions[0]||start>=finish)continue;
  ranges.push({start:timeAt(profile,start),end:timeAt(profile,end),rate:zone.flag==='doubleyellow'?.60:.80});
 }
 return ranges;
}

// Exact piecewise integration in the bot's driving clock. Only riders
// physically reaching a live marshal zone slow; other sectors keep racing.
// Replaying the same history produces identical positions on every client.
export function sectorClock(profile,clock,events,length){
 if(!events?.length)return{time:clock,rate:1};
 profile.cautionRanges??=new WeakMap();
 let compiled=profile.cautionRanges.get(events);
 if(!compiled){compiled=events.map(event=>({...event,ranges:rangesFor(profile,event,length)}));profile.cautionRanges.set(events,compiled);}
 const boundaries=[0,...compiled.flatMap(e=>[e.start,e.end]).filter(t=>t>0&&t<clock),clock].sort((a,b)=>a-b);
 let at=0,time=0;
 for(let i=1;i<boundaries.length;i++){
  const end=boundaries[i],mid=(at+end)/2;
  const ranges=compiled.filter(e=>mid>=e.start&&mid<e.end).flatMap(e=>e.ranges);
  let remaining=end-at;
  while(remaining>1e-8){
   const active=ranges.filter(r=>time>=r.start-1e-8&&time<r.end-1e-8),rate=Math.min(1,...active.map(r=>r.rate));
   const next=Math.min(Infinity,...ranges.flatMap(r=>[r.start,r.end]).filter(t=>t>time+1e-8));
   const step=Math.min(remaining,(next-time)/rate);
   time+=step*rate;remaining-=step;
  }
  at=end;
 }
 const active=compiled.filter(e=>clock>=e.start&&clock<e.end).flatMap(e=>e.ranges).filter(r=>time>=r.start&&time<r.end);
 return{time:clamp(time,0,clock),rate:Math.min(1,...active.map(r=>r.rate))};
}
