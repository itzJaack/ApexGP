// These are the game's three flag sectors. Use one definition for the badges,
// circuit preview and minimap, so every separator marks the same boundary.
export const SECTOR_COUNT=3;
export function sectorRanges(length){
 return Array.from({length:SECTOR_COUNT},(_,index)=>({index:index+1,start:index*length/SECTOR_COUNT,end:(index+1)*length/SECTOR_COUNT}));
}

export function sectorDividers(track,project,size=10){
 return sectorRanges(track.length).map(({index,start})=>{
  const centre=project(track.sample(start));
  const before=project(track.sample(start-2)),after=project(track.sample(start+2));
  const dx=after[0]-before[0],dy=after[1]-before[1],length=Math.hypot(dx,dy)||1;
  const nx=-dy/length,ny=dx/length,half=(index===1?size+2:size)/2;
  return{index,progress:start,centre,a:[centre[0]-nx*half,centre[1]-ny*half],b:[centre[0]+nx*half,centre[1]+ny*half]};
 });
}

export function sectorDividerSVG(track,project,size=10){
 return sectorDividers(track,project,size).map(({index,a,b})=>`<g class="sector-divider"><title>${index===1?'Traguardo / inizio settore 1':'Inizio settore '+index}</title><path d="M${a.join(' ')}L${b.join(' ')}" stroke="#10171c" stroke-width="4"/><path d="M${a.join(' ')}L${b.join(' ')}" stroke="#f5f5ed" stroke-width="2"/></g>`).join('');
}

export function drawSectorDividers(context,track,project,size=10){
 context.save();context.lineCap='butt';
 for(const {a,b} of sectorDividers(track,project,size)){
  context.beginPath();context.moveTo(...a);context.lineTo(...b);
  context.strokeStyle='#10171c';context.lineWidth=4;context.stroke();
  context.strokeStyle='#f5f5ed';context.lineWidth=2;context.stroke();
 }
 context.restore();
}
