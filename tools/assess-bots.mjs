import {Circuit,TRACKS,RaceModel} from '../dist/simulation.js';

const reports=[];
const seedCount=Math.max(1,Math.min(50,Number(process.argv[2])||1));
for(const difficulty of ['rookie','sport','pro']){
 let crashes=0,contacts=0,totalFinish=0,completed=0;
 for(let seed=0;seed<seedCount;seed++){
 const race=new RaceModel(new Circuit(TRACKS[0]),{laps:1,weather:'day',difficulty,botSeed:27+seed});
 race.state='running';race.player.progress=-300;race.player.offset=40;race.placePlayer();
 let wall=0;
 while(wall<600&&race.bots.some(b=>b.finishTime===null)){
  race.update(.025,{});race.events=[];wall+=.025;
 }
 crashes+=race.botCrashes;contacts+=race.totalContacts;
 completed+=race.bots.filter(b=>b.finishTime!==null).length;totalFinish+=race.bots.reduce((sum,b)=>sum+(b.finishTime||0),0);
 }
 reports.push({difficulty,races:seedCount,completed,crashes,contacts,meanFinishSeconds:Number((totalFinish/Math.max(1,completed)).toFixed(2))});
}
console.log(JSON.stringify(reports,null,2));
