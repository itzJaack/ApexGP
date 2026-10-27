import test from 'node:test';
import assert from 'node:assert/strict';
import {DrivingControls} from '../dist/controls.js';
import {TiltSteering,tiltAngle,screenAngle,tiltMode,validTiltCalibration,calibratedSteering,tiltDirectionInverted} from '../dist/tilt.js';

function fixture({permission='granted',secure=true,eventType}={}){
  let time=0,next=0,angle=0,driving=true,requests=0;const timers=new Map(),target=new EventTarget(),controls=new DrivingControls(),lost=[];
  const sensor=new TiltSteering({controls,target,secure,eventType:eventType??{async requestPermission(){requests++;return permission;}},getAngle:()=>angle,now:()=>time,setTimer:(fn,ms)=>{const id=++next;timers.set(id,{fn,at:time+ms});return id;},clearTimer:id=>timers.delete(id),isDriving:()=>driving,onLost:why=>lost.push(why)});
  const emit=(beta=0,gamma=0)=>{const e=new Event('deviceorientation');Object.assign(e,{beta,gamma});target.dispatchEvent(e);};
  const advance=ms=>{const end=time+ms;for(;;){const entry=[...timers].filter(([,v])=>v.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!entry)break;time=entry[1].at;timers.delete(entry[0]);entry[1].fn();}time=end;};
  return{sensor,controls,emit,advance,lost,get requests(){return requests;},get timerCount(){return timers.size;},rotate:a=>{angle=a;},drive:value=>{driving=value;},async enable(){const p=sensor.enable();await Promise.resolve();emit();await p;}};
}
const cal={version:1,angle:0,center:0,left:20,right:-20};

test('buttons are the default and tilt projection works in all screen rotations without a compass',()=>{
  for(const value of [undefined,null,'pad','buttons','bad'])assert.equal(tiltMode(value),'buttons');
  assert.equal(tiltMode('tilt'),'tilt');assert.equal(screenAngle(-90),270);
  assert(Math.abs(tiltAngle({beta:0,gamma:-20},0)-20)<1e-8);
  assert(Math.abs(tiltAngle({beta:20,gamma:0},90)-20)<1e-8);
  assert(Math.abs(tiltAngle({beta:0,gamma:20},180)-20)<1e-8);
  assert(Math.abs(tiltAngle({beta:-20,gamma:0},270)-20)<1e-8);
  assert.equal(tiltAngle({beta:null,gamma:0}),null);assert.equal(tiltAngle({beta:0,gamma:NaN}),null);assert.equal(tiltAngle({beta:200,gamma:0}),null);
});

test('calibration learns both directions, neutral dead zone and asymmetric comfortable tilt ranges',()=>{
  assert(validTiltCalibration(cal));assert.equal(Math.abs(calibratedSteering(1,cal)),0);
  assert.equal(calibratedSteering(20,cal),1);assert.equal(calibratedSteering(-20,cal),-1);
  assert(calibratedSteering(10,cal)>0&&calibratedSteering(10,cal)<.6);
  const reversed={version:1,angle:90,center:12,left:-8,right:42};
  assert(validTiltCalibration(reversed));assert.equal(calibratedSteering(-8,reversed),1);assert.equal(calibratedSteering(42,reversed),-1);
  for(const c of [{...cal,left:2},{...cal,right:15},{...cal,angle:45},{...cal,center:NaN},{...cal,version:2},null])assert(!validTiltCalibration(c));
});

test('saved calibrations receive the direction fix once while explicit choices and fresh calibrations are preserved',()=>{
  assert.equal(tiltDirectionInverted(undefined,cal),true);
  assert.equal(tiltDirectionInverted(undefined,null),false);
  assert.equal(tiltDirectionInverted(false,cal),false);
  assert.equal(tiltDirectionInverted(true,cal),true);
  assert.equal(calibratedSteering(20,cal,true),-1);
  assert.equal(calibratedSteering(-20,cal,true),1);
  assert.equal(Math.abs(calibratedSteering(1,cal,true)),0);
});

test('direction inversion releases old steering and applies to the sensor without reversing keyboard or brake controls',async()=>{
  const f=fixture();await f.enable();f.sensor.setCalibration(cal);f.emit(0,-20);
  for(let i=0;i<60;i++)f.sensor.tick(1/60);
  assert(f.controls.state.steering>.99);
  f.controls.pointerDown(7,'brake');f.sensor.setInverted(true);
  assert.equal(f.controls.state.steering,0);assert(f.controls.state.brake);
  for(let i=0;i<60;i++)f.sensor.tick(1/60);
  assert(f.controls.state.steering<-.99);assert(f.controls.state.brake);
  f.controls.keyDown({code:'KeyA'});f.sensor.tick(1/60);
  assert.equal(f.controls.state.steering,1);
  f.controls.keyUp({code:'KeyA'});f.sensor.setInverted(false);
  for(let i=0;i<60;i++)f.sensor.tick(1/60);
  assert(f.controls.state.steering>.99);
});

test('permission is requested only when explicitly enabled; denial and insecure pages keep controls neutral',async()=>{
  const f=fixture();assert.equal(f.requests,0);
  await assert.rejects(f.sensor.enable({requestPermission:false}),{code:'permission-required'});assert.equal(f.requests,0);
  const denied=fixture({permission:'denied'});await assert.rejects(denied.sensor.enable(),{code:'denied'});assert.equal(denied.requests,1);assert.equal(denied.controls.state.steering,0);
  const insecure=fixture({secure:false});await assert.rejects(insecure.sensor.enable(),{code:'insecure'});assert.equal(insecure.requests,0);
});

test('permission completion after cancellation cannot enable late sensor input; missing data times out',async()=>{
  let grant;const pending=fixture({eventType:{requestPermission:()=>new Promise(resolve=>{grant=resolve;})}});
  const p=pending.sensor.enable();pending.sensor.disable();grant('granted');await assert.rejects(p,{code:'canceled'});pending.emit(0,-20);assert.equal(pending.controls.state.steering,0);
  const noData=fixture();const wait=noData.sensor.enable();await Promise.resolve();noData.emit(null,null);noData.advance(5000);await assert.rejects(wait,{code:'no-data'});assert(!noData.sensor.running);assert.equal(noData.timerCount,0);
});

test('guided center, left and right captures average stable readings and reject movement or wrong direction',async()=>{
  const f=fixture();await f.enable();
  const center=f.sensor.capture();f.advance(1000);assert.equal(await center,0);
  f.emit(0,-20);const left=f.sensor.capture();f.advance(500);f.emit(0,-20.2);f.advance(500);const l=await left;assert(Math.abs(l-20.1)<.001);
  f.emit(0,25);const right=f.sensor.capture();f.advance(1000);const r=await right;
  assert(validTiltCalibration({version:1,angle:0,center:0,left:l,right:r}));
  f.emit(0,0);const moving=f.sensor.capture();f.advance(200);f.emit(0,12);f.advance(800);await assert.rejects(moving,{code:'moving'});
});

test('sensor steering is progressive, yields to keyboard and coexists with brake and automatic gas',async()=>{
  const f=fixture();await f.enable();f.sensor.setCalibration(cal);f.controls.setAutoThrottle(true);f.emit(0,-20);
  f.sensor.tick(1/60);assert(f.controls.state.steering>0&&f.controls.state.steering<.3);
  for(let i=0;i<60;i++)f.sensor.tick(1/60);assert(f.controls.state.steering>.99&&f.controls.state.throttle);
  f.controls.pointerDown(7,'brake');assert(f.controls.state.brake&&!f.controls.state.throttle&&f.controls.state.steering>.99);
  f.controls.keyDown({code:'KeyD'});f.sensor.tick(1/60);assert.equal(f.controls.state.steering,-1);f.controls.keyUp({code:'KeyD'});
  f.controls.pointerUp(7);assert(f.controls.state.throttle&&f.controls.state.steering>.99);
  f.drive(false);f.sensor.tick(1/60);assert.equal(f.controls.state.steering,0);
});

test('rotation or stale readings release steering, interrupt calibration and keep other inputs separate',async()=>{
  const f=fixture();await f.enable();f.sensor.setCalibration(cal);f.emit(0,-20);f.sensor.tick(.1);assert(f.controls.state.steering>0);
  const sample=f.sensor.capture();f.rotate(90);f.emit(20,0);await assert.rejects(sample,{code:'rotated'});f.sensor.tick(.1);assert(!f.sensor.ready);assert.equal(f.controls.state.steering,0);assert(f.lost.includes('rotated'));
  f.rotate(0);f.emit(0,-20);f.sensor.tick(.1);assert(f.controls.state.steering>0);f.controls.keyDown({code:'KeyW'});
  f.advance(1600);f.sensor.tick(.1);assert.equal(f.controls.state.steering,0);assert(f.controls.state.throttle);assert(f.lost.includes('stale'));
  f.sensor.disable();f.emit(0,-20);f.sensor.tick(.1);assert.equal(f.controls.state.steering,0);
});
