import {Circuit,TRACKS,RaceModel} from '../dist/simulation.js';

const reports=[];
const seedCount=Math.max(1,Math.min(50,Number(process.argv[2])||1));
for(const difficulty of ['rookie','sport','pro']){
 let crashes=0,contacts=0,totalFinish=0,completed=0,cleanOvertakes=0;
 for(let seed=0;seed<seedCount;seed++){
 const race=new RaceModel(new Circuit(TRACKS[0]),{laps:1,weather:'day',difficulty,botSeed:27+seed});
 race.state='running';race.player.progress=-300;race.player.offset=40;race.placePlayer();
 let wall=0;const pairs=new Map(),healthy=new Map();
 while(wall<600&&race.bots.some(b=>b.finishTime===null)){
  race.update(.025,{});race.events=[];wall+=.025;
  for(const b of race.bots)if(b.crash>0)healthy.set(b.id,wall);
  for(let i=0;i<race.bots.length;i++)for(let j=i+1;j<race.bots.length;j++){
   const a=race.bots[i],b=race.bots[j],key=i+':'+j,delta=a.progress-b.progress,prior=pairs.get(key);
   if(prior&&prior.delta*delta<0&&wall-prior.at>4&&wall>8&&race.control.flag==='green'&&
      !a.crash&&!b.crash&&a.speed>12&&b.speed>12&&Math.abs(a.offset-b.offset)>.65&&
      wall-(healthy.get(a.id)||0)>3&&wall-(healthy.get(b.id)||0)>3){cleanOvertakes++;prior.at=wall;}
   pairs.set(key,{delta,at:prior?.at??-100});
  }
 }
 crashes+=race.botCrashes;contacts+=race.totalContacts;
 completed+=race.bots.filter(b=>b.finishTime!==null).length;totalFinish+=race.bots.reduce((sum,b)=>sum+(b.finishTime||0),0);
 }
 reports.push({difficulty,races:seedCount,completed,crashes,contacts,cleanOvertakes,meanFinishSeconds:Number((totalFinish/Math.max(1,completed)).toFixed(2))});
}
console.log(JSON.stringify(reports,null,2));
