import test from 'node:test';
import assert from 'node:assert/strict';
import {TRACKS,BIKES,Circuit,RaceModel,formatTime,wrapAngle} from '../dist/simulation.js';
import {Geometry,lookAt,perspective,multiply,modelMatrix} from '../dist/engine.js';

// A test driver actually steers toward a point ahead; the game provides no
// circuit-following correction to the human rider.
function drive(race,pace=.88){
  const p=race.player,t=race.track,grip=(race.options.weather==='rain'?.74:1)*race.options.bike.grip;
  const ahead=t.sample(p.progress+Math.max(14,p.speed*.85));
  const wanted=Math.atan2(ahead.x-p.x,ahead.z-p.z),error=wrapAngle(wanted-p.heading);
  const target=t.targetSpeed(p.progress,grip,pace);
  return {throttle:p.speed<target,brake:p.speed>target+1.5,left:error>.025,right:error<-.025};
}

function straightTrack(){
  const t=new Circuit(TRACKS[0]);
  t.sample=(s,x=0)=>({x,z:s,tx:0,tz:1,yaw:0,k:0});
  t.project=(x,z)=>({progress:z,offset:x,distance:Math.abs(x)});
  return t;
}

test('all catalogued closed circuits have continuous tangents and finite geometry',()=>{
  for(const config of TRACKS){
    const circuit=new Circuit(config);
    assert(circuit.length>2000&&circuit.length<6000);
    const first=circuit.sample(0),last=circuit.sample(circuit.length);
    assert(Math.hypot(first.x-last.x,first.z-last.z)<.0001);
    for(let s=-500;s<circuit.length+500;s+=2.7){
      const p=circuit.sample(s,4);assert(Object.values(p).every(Number.isFinite));assert(Math.abs(Math.hypot(p.tx,p.tz)-1)<.00001);
      assert(circuit.cornerSpeed(s,.74)<=circuit.cornerSpeed(s,1)+.00001);
    }
  }
});

test('countdown and pause do not advance race time or position',()=>{
  const race=new RaceModel(new Circuit(TRACKS[0]));
  const start=race.player.progress;
  for(let i=0;i<200;i++)race.update(1/120,{throttle:true});
  assert.equal(race.time,0);assert.equal(race.player.progress,start);
  race.state='paused';race.update(.05,{throttle:true});assert.equal(race.time,0);
});

test('throttle, brake, reset penalty, rain and steering affect riding',()=>{
  const track=straightTrack(),dry=new RaceModel(track,{mode:'time',weather:'day'}),wet=new RaceModel(track,{mode:'time',weather:'rain'});
  dry.state='running';wet.state='running';
  for(let i=0;i<400;i++){dry.update(1/120,{throttle:true});wet.update(1/120,{throttle:true});}
  assert(dry.player.speed>18);const speed=dry.player.speed;
  for(let i=0;i<120;i++)dry.update(1/120,{brake:true,right:true});
  assert(dry.player.speed<speed);assert(dry.player.offset<0);
  const time=dry.time,progress=dry.player.progress;dry.resetPlayer();
  assert.equal(dry.time,time+2);assert.equal(dry.player.progress,progress);assert.equal(dry.player.offset,0);
  const curved=new Circuit(TRACKS[0]);assert(curved.targetSpeed(900,.74)<curved.targetSpeed(900,1));
});

test('left and right controls turn to their corresponding side on screen',()=>{
  const track=new Circuit(TRACKS[0]),start=track.sample(80);
  const eye=[start.x-start.tx*8,3,start.z-start.tz*8],target=[start.x+start.tx*10,1,start.z+start.tz*10];
  const vp=multiply(perspective(1,16/9),lookAt(eye,target));
  const screenX=p=>{const v=[p.x,1,p.z,1],out=[0,0,0,0];for(let row=0;row<4;row++)for(let c=0;c<4;c++)out[row]+=vp[c*4+row]*v[c];return out[0]/out[3];};
  for(const assist of [true,false]){
    const runs=['left','right','straight'].map(direction=>{const m=new RaceModel(track,{mode:'time',assist});m.state='running';m.player.progress=80;m.player.offset=0;m.player.speed=20;m.placePlayer();for(let i=0;i<80;i++)m.update(1/120,{throttle:true,[direction]:true});return m;});
    assert(screenX(runs[0].player)<screenX(runs[2].player),'Left must project to screen left');
    assert(screenX(runs[1].player)>screenX(runs[2].player),'Right must project to screen right');
    assert(runs[0].player.lean>0);assert(runs[1].player.lean<0);
  }
});

test('partial touch steering produces smaller corrections and can be combined with full braking',()=>{
  const results=[];
  for(const steering of [0,.2,.5,1]){
    const m=new RaceModel(straightTrack(),{mode:'time'});m.track.halfWidth=10000;m.state='running';m.player.speed=25;
    for(let i=0;i<60;i++)m.update(1/120,{steering,throttle:true});
    results.push(m.player.lean);assert(Number.isFinite(m.player.heading));
    const speed=m.player.speed;
    for(let i=0;i<90;i++)m.update(1/120,{steering,throttle:true,brake:true});
    assert(m.player.speed<speed-4,'Braking must retain authority with automatic gas and analog steering');
  }
  assert.equal(results[0],0);assert(results[1]>0&&results[1]<results[2]&&results[2]<results[3]);
  const invalid=new RaceModel(straightTrack(),{mode:'time'});invalid.state='running';invalid.update(.05,{steering:NaN,left:true});assert(invalid.player.steer>0);
});

test('without steering the world heading stays fixed through bends with either stabilization setting',()=>{
  for(const config of TRACKS){
    const track=new Circuit(config),curved=track.nodes.findIndex(p=>Math.abs(p.k)>.015);
    assert(curved>=0);
    for(const assist of [true,false]){
      const m=new RaceModel(track,{mode:'time',assist});m.state='running';m.player.progress=curved*track.step;m.player.speed=18;m.player.offset=0;m.placePlayer();
      const initialHeading=track.sample(m.player.progress).yaw,initialRoadHeading=initialHeading;
      for(let i=0;i<90;i++){
        m.update(1/120,{throttle:true});
        const heading=track.sample(m.player.progress).yaw+m.player.angle;
        assert(Math.abs(wrapAngle(heading-initialHeading))<1e-9,'A bend must not steer the bike');
        assert.equal(m.player.lean,0);
      }
      assert(Math.abs(wrapAngle(track.sample(m.player.progress).yaw-initialRoadHeading))>.08,'The reference road must actually bend');
    }
  }
});

test('acceleration ramps up, coasting slows down, brakes stop without reversing and rain increases stopping distance',()=>{
  const m=new RaceModel(straightTrack(),{mode:'time'});m.state='running';
  m.update(1/120,{throttle:true});const early=m.player.acceleration;
  for(let i=0;i<360;i++)m.update(1/120,{throttle:true});
  assert(m.player.speed>20&&m.player.speed<40);assert(m.player.acceleration>early);assert(m.player.pitch<0,'Acceleration shifts weight back');
  const before=m.player.speed;for(let i=0;i<240;i++)m.update(1/120,{});assert(m.player.speed<before);
  const stop=[];
  for(const weather of ['day','rain']){
    const race=new RaceModel(straightTrack(),{mode:'time',weather});race.state='running';race.player.speed=100/3.6;race.player.progress=100;race.placePlayer();
    let brakingPitch=0;for(let i=0;i<600&&race.player.speed>0;i++){race.update(1/120,{brake:true,throttle:true});brakingPitch=Math.max(brakingPitch,race.player.pitch);assert(race.player.speed>=0);}
    assert.equal(race.player.speed,0);assert(brakingPitch>0,'Braking shifts weight forward');stop.push(race.player.progress-100);
  }
  assert(stop[0]>15&&stop[0]<50);assert(stop[1]>stop[0]*1.15);
});

test('steering tightens at low speed; releasing the key stands the bike up; lean consumes braking grip',()=>{
  const headingChange=[];
  for(const speed of [15,55]){
    const m=new RaceModel(straightTrack(),{mode:'time'});m.state='running';m.player.speed=speed;
    for(let i=0;i<42;i++)m.update(1/120,{left:true});headingChange.push(Math.abs(m.player.heading));
    for(let i=0;i<240;i++)m.update(1/120,{});assert(Math.abs(m.player.lean)<.001);
  }
  assert(headingChange[0]>headingChange[1]*1.5);
  const braking=[];
  for(const corner of [false,true]){
    const m=new RaceModel(straightTrack(),{mode:'time'});m.state='running';m.player.speed=25;m.player.brake=1;m.player.steer=corner?1:0;m.player.lean=corner?1.065:0;
    m.update(1/120,{brake:true,left:corner});braking.push(25-m.player.speed);
  }
  assert(braking[1]>braking[0]*.70,'Trail braking must retain useful braking authority in a bend');
});

test('a stopped bike can accelerate and steer out of gravel without using reset',()=>{
  const t=new Circuit(TRACKS[0]),m=new RaceModel(t,{mode:'time'});m.state='running';m.player.progress=100;m.player.offset=14;m.placePlayer();
  const start={x:m.player.x,z:m.player.z,h:m.player.heading};
  let turned=0;for(let i=0;i<360;i++){const h=m.player.heading;m.update(1/120,{throttle:true,right:true});turned+=wrapAngle(m.player.heading-h);}
  assert(m.player.speed>2,'Gravel must not pin the bike at zero speed');
  assert(Math.hypot(m.player.x-start.x,m.player.z-start.z)>3);
  assert(turned<-.10,'Steering must change heading at low speed');
  assert.equal(m.penalties,0);
});

test('complete races on every circuit: laps, AI order, finish times and reusable ghost',()=>{
  for(const config of TRACKS){
    const track=new Circuit(config),race=new RaceModel(track,{laps:2});race.countdown=0;
    const lapEvents=[];
    for(let frame=0;frame<40000&&race.state!=='finished';frame++){
      const p=race.player;
      race.update(1/120,drive(race));
      for(const event of race.events.splice(0))if(event.type==='lap')lapEvents.push(event);
      assert(Object.entries(p).filter(([,v])=>typeof v==='number').every(([,v])=>Number.isFinite(v)));
    }
    assert.equal(race.state,'finished');assert.equal(race.lapTimes.length,2);assert.equal(lapEvents.length,2);
    assert(Math.abs(race.lapTimes.reduce((a,b)=>a+b)-race.player.finishTime)<.001);
    assert(race.position>=1&&race.position<=8);assert.equal(race.order.length,8);
    for(const event of lapEvents){assert(event.recording.length>500);assert.equal(event.recording.at(-1).s,track.length);for(let i=1;i<event.recording.length;i++){assert(event.recording[i].s>=0&&event.recording[i].s<=track.length);assert(event.recording[i].t>=event.recording[i-1].t);}}
  }
});

test('time trial contains no AI; wet races and alternative bikes can finish',()=>{
  const t=new Circuit(TRACKS[1]),race=new RaceModel(t,{laps:2,mode:'time',weather:'rain',bike:BIKES[2]});race.countdown=0;
  assert.equal(race.bots.length,0);
  for(let i=0;i<40000&&race.state!=='finished';i++){
    race.update(1/120,drive(race));race.events=[];
  }
  assert.equal(race.state,'finished');assert.equal(race.position,1);
});

test('camera matrices project in front of camera; generated primitives are finite',()=>{
  const vp=multiply(perspective(1,16/9),lookAt([0,2,-6],[0,1,0]));
  const q=[0,1,0,1],result=[0,0,0,0];for(let r=0;r<4;r++)for(let c=0;c<4;c++)result[r]+=vp[c*4+r]*q[c];
  assert(result[3]>0);assert(Math.abs(result[0]/result[3])<.001);assert(Math.abs(result[1]/result[3])<.001);
  const g=new Geometry().box([0,0,0],[1,2,3],[1,.4,.1]).sphere([0,1,0],[1,1,1],[.5,.5,.5]).cylinder([0,0,0],[1,2,3],.2,[1,1,1]).torusX([0,0,0],.4,.1,[0,0,0]).transform(modelMatrix([3,0,5],1,.7));
  assert(g.data.length>10000);assert.equal(g.data.length%36,0);assert(g.data.every(Number.isFinite));
  assert.equal(formatTime(75.1235),'01:15.123');
});

test('lean builds progressively and a direction change must pass through upright',()=>{
  const t=straightTrack();t.halfWidth=10000;
  const m=new RaceModel(t,{mode:'time',weather:'day'});m.state='running';m.player.speed=100/3.6;
  m.update(1/120,{left:true});assert(Math.abs(m.player.lean)<.01);assert(Math.abs(m.player.turnRate)<.005);
  for(let i=1;i<36;i++)m.update(1/120,{left:true});
  assert(m.player.lean>.25&&m.player.lean<1.05,'A key press must take time to establish lean');
  for(let i=0;i<144;i++)m.update(1/120,{left:true});
  const lean=m.player.lean;assert(lean>1&&lean<1.18);
  m.update(1/120,{right:true});assert(m.player.lean>lean-.02,'A reversal cannot snap the bike across');
  for(let i=0;i<180;i++)m.update(1/120,{right:true});
  assert(m.player.lean<-1&&m.player.turnRate<0);
  for(let i=0;i<300;i++)m.update(1/120,{});
  assert(Math.abs(m.player.lean)<.0001&&Math.abs(m.player.turnRate)<.0001);
});

test('racing-speed bends change world trajectory; speed and rain widen their radius',()=>{
  const runs=[];
  for(const [kph,weather] of [[100,'day'],[200,'day'],[100,'rain']]){
    const t=straightTrack();t.halfWidth=10000;
    const m=new RaceModel(t,{mode:'time',weather});m.state='running';m.player.speed=kph/3.6;m.player.progress=0;m.placePlayer();
    for(let i=0;i<240;i++)m.update(1/120,{left:true});
    assert(m.player.x>4,'The actual world position must move into the bend');
    assert(m.player.turnRate>.1&&m.player.heading>.15);
    assert(m.player.crash===0&&m.penalties===0);
    runs.push(m.player.speed/m.player.turnRate);
  }
  assert(runs[1]>runs[0]*3,'High speed needs a much wider corner');
  assert(runs[2]>runs[0]*1.3,'Wet tyres allow less lean and a wider corner');
});

test('new motorcycles finish new circuits with their own handling in dry and wet sessions',()=>{
  for(let i=3;i<BIKES.length;i++)for(const weather of ['day','rain']){
    const race=new RaceModel(new Circuit(TRACKS[i%TRACKS.length]),{mode:'time',laps:1,bike:BIKES[i],weather});race.countdown=0;let maxOffset=0;
    for(let f=0;f<24000&&race.state!=='finished';f++){race.update(1/120,drive(race,.82));race.events=[];maxOffset=Math.max(maxOffset,Math.abs(race.player.offset));}
    assert.equal(race.state,'finished',`${BIKES[i].name} on ${TRACKS[i%TRACKS.length].name} / ${weather}`);
    assert.equal(race.penalties,0);assert(maxOffset<8.5,'A clean lap must stay on the asphalt');
  }
});

test('the automatic gearbox passes its final upshift without hunting at its threshold',()=>{
  for(const bike of BIKES){const t=straightTrack();t.halfWidth=10000;const m=new RaceModel(t,{mode:'time',bike});m.state='running';for(let i=0;i<3600;i++)m.update(1/120,{throttle:true});assert.equal(m.player.gear,6);assert(m.player.speed*3.6>bike.top*.92,`${bike.name} must accelerate through its final shift`);}
});
