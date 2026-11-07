import test from 'node:test';
import assert from 'node:assert/strict';
import {RiderAI,RIDER_CHARACTERS,mistakeProbability} from '../dist/rider-ai.js';

const track={length:5000,halfWidth:9,sample:(s,x=0)=>({x,z:s,y:0,yaw:0,k:.007,tx:0,tz:1}),targetSpeed:s=>70-s*.05};
const control={flag:'green',applies:()=>false};
function setup(index=0){const ai=new RiderAI(track,{difficulty:'sport',weather:'day',laps:3},27),b={id:'test',progress:300,offset:0,speed:35,finishTime:null};ai.attach(b,index);return{ai,b};}
test('drivers keep distinct braking styles and courteous riders yield while assertive riders hold their lane',()=>{
 const cautious=setup(1),assertive=setup(5),other={id:'other',progress:300,offset:.5,speed:35,finishTime:null,crash:0};
 cautious.ai.decide(cautious.b,[cautious.b,other],10,false);assertive.ai.decide(assertive.b,[assertive.b,other],10,false);
 assert.equal(cautious.b.intent,'yield');assert.equal(assertive.b.intent,'hold');assert(cautious.b.ai.targetSpeed<assertive.b.ai.targetSpeed);
 assert(new Set(RIDER_CHARACTERS.map(c=>c.brakeBias)).size>=6);
});
test('an overtake is committed when there is space and abandoned when both lanes are blocked',()=>{
 const {ai,b}=setup(1);b.speed=45;const ahead={id:'ahead',progress:309,offset:0,speed:25,finishTime:null,crash:0};
 ai.decide(b,[b,ahead],10,false);assert.equal(b.intent,'pass');assert(Math.abs(b.ai.desiredOffset)>1);
 const blockers=[-1.8,1.8].map((offset,i)=>({...ahead,id:'block'+i,offset,progress:308}));
 ai.decide(b,[b,ahead,...blockers],11,false);assert.notEqual(b.intent,'pass');assert(b.ai.targetSpeed<30);
});
test('higher skill reduces errors strongly, while pressure and rain increase the risk',()=>{
 for(const c of RIDER_CHARACTERS){assert(mistakeProbability('pro',c)<mistakeProbability('sport',c)/5);assert(mistakeProbability('sport',c)<mistakeProbability('rookie',c));assert(mistakeProbability('sport',c,1,true)>mistakeProbability('sport',c,0,false));}
});
test('a physical traction mistake can drop an AI rider and is suppressed under caution',()=>{
 for(const caution of [false,true]){const {ai,b}=setup();b.speed=25;b.ai.mistake='traction';b.ai.mistakeAt=8;b.ai.mistakeUntil=12;b.ai.decisionAt=12;b.ai.targetSpeed=25;let falls=0;
  ai.update(b,[b],1/120,10,{...control,flag:caution?'vsc':'green'},()=>falls++);assert.equal(falls,caution?0:1);}
});
