export function classifyRiders(riders){
 const result=[...riders].sort((a,b)=>{
  if(!!a.dsq!==!!b.dsq)return Number(!!a.dsq)-Number(!!b.dsq);
  if(!!a.dnf!==!!b.dnf)return Number(!!a.dnf)-Number(!!b.dnf);
  if(a.finishTime!==null&&b.finishTime!==null)return a.finishTime-b.finishTime;
  if(a.finishTime!==null)return -1;if(b.finishTime!==null)return 1;
  return b.progress-a.progress;
 });
 const finishers=result.filter(r=>r.finishTime!==null&&!r.dnf&&!r.dsq);
 for(const rider of [...finishers].filter(r=>r.positionPenalty>0)){
  const from=finishers.indexOf(rider),to=Math.min(finishers.length-1,from+rider.positionPenalty);
  finishers.splice(from,1);finishers.splice(to,0,rider);
 }
 return [...finishers,...result.filter(r=>!finishers.includes(r))];
}
