import test from 'node:test';
import assert from 'node:assert/strict';
import {DrivingControls,bindTouchControls,touchSteeringAt} from '../dist/controls.js';
import {useTouchControls} from '../dist/mobile.js';

const send=(target,type,props={})=>{
  const event=new Event(type,{cancelable:true});
  Object.assign(event,{pointerId:1,button:0,clientX:0,clientY:0,...props});
  target.dispatchEvent(event);return event;
};
function fixture({largeSteering=false}={}){
  const document=new EventTarget(),controls=new DrivingControls();
  const buttons=['left','right','wheelie','brake','throttle'].map(action=>{
    const button=new EventTarget();button.dataset={control:action};button.closest=()=>button;button.setPointerCapture=()=>{};return button;
  });
  document.elementFromPoint=(x,y)=>y<0?null:buttons[x]||null;
  const pad=new EventTarget();pad.getBoundingClientRect=()=>({left:0,right:160,top:0,bottom:80,width:160,height:80});pad.setPointerCapture=()=>{};
  const steeringArea={getBoundingClientRect:()=>({left:20,right:180,top:20,bottom:124,width:160,height:104})};
  const root={ownerDocument:document,querySelector:selector=>selector==='[data-steer-pad]'?pad:largeSteering?steeringArea:null,querySelectorAll:()=>buttons,contains:button=>buttons.includes(button)};
  let enabled=true;
  const binding=bindTouchControls({root,controls,isEnabled:()=>enabled,onInterrupt:()=>controls.setAutoThrottle(false)});
  return{document,controls,buttons,pad,binding,setEnabled:value=>{enabled=value;}};
}

test('two thumbs can steer and slide from gas to brake without releasing a keyboard input',()=>{
  const {document,controls,buttons}=fixture();
  assert(send(buttons[0],'pointerdown',{pointerId:1}).defaultPrevented);
  send(buttons[4],'pointerdown',{pointerId:2});
  controls.keyDown({code:'ShiftLeft'});
  assert(controls.state.left&&controls.state.throttle&&controls.state.wheelie);
  send(document,'pointermove',{pointerId:2,clientX:3});
  assert(!controls.state.throttle&&controls.state.brake&&controls.state.left&&controls.state.wheelie);
  send(document,'pointercancel',{pointerId:2});
  assert(!controls.state.brake&&controls.state.left&&controls.state.wheelie);
  send(buttons[0],'lostpointercapture',{pointerId:1});
  assert(!controls.state.left&&controls.state.wheelie);
});

test('sliding outside releases the control and sliding back reuses the same finger',()=>{
  const {document,controls,buttons}=fixture();
  send(buttons[0],'pointerdown');
  send(document,'pointermove',{clientX:1});
  assert(!controls.state.left&&controls.state.right);
  send(document,'pointermove',{clientY:-1});
  assert(Object.values(controls.state).every(value=>!value));
  send(document,'pointermove',{clientX:0});assert(controls.state.left);
  send(document,'pointerup');
  send(document,'pointermove',{clientX:1});
  assert(Object.values(controls.state).every(value=>!value));
});

test('pause and orientation reset cannot revive stale fingers after resuming',()=>{
  const {document,controls,buttons,binding,setEnabled}=fixture();
  send(buttons[4],'pointerdown');binding.reset();
  send(document,'pointermove',{clientX:4});assert(!controls.state.throttle);
  setEnabled(false);send(buttons[4],'pointerdown');assert(!controls.state.throttle);
  setEnabled(true);send(buttons[4],'pointerdown');assert(controls.state.throttle);
  setEnabled(false);send(document,'pointermove',{clientX:4});assert(!controls.state.throttle);
  setEnabled(true);send(document,'pointermove',{clientX:4});assert(!controls.state.throttle);
  send(buttons[4],'pointerdown',{button:2});assert(!controls.state.throttle);
});

test('tablet, hybrid and first-touch detection respect the local manual override',()=>{
  assert(!useTouchControls('auto'));
  for(const device of [{maxTouchPoints:5},{coarsePointer:true},{touched:true}]){
    assert(useTouchControls('auto',device));
    assert(!useTouchControls('off',device));
  }
  assert(useTouchControls('on'));
});

test('progressive steering has a neutral zone, small corrections and full lock at both ends',()=>{
  const rect={left:0,width:160};
  for(const x of [75,80,85])assert.equal(Math.abs(touchSteeringAt(x,rect)),0);
  assert(touchSteeringAt(65,rect)>0&&touchSteeringAt(65,rect)<.15);
  assert(touchSteeringAt(40,rect)>touchSteeringAt(65,rect));
  assert.equal(touchSteeringAt(0,rect),1);assert.equal(touchSteeringAt(160,rect),-1);
  assert.equal(touchSteeringAt(40,rect),-touchSteeringAt(120,rect));
  assert.equal(touchSteeringAt(0,{left:0,width:0}),0);
});

test('steering pad keeps one thumb while the other brakes and cannot turn into a pedal',()=>{
  const {document,controls,buttons,pad}=fixture();
  send(pad,'pointerdown',{clientX:40,clientY:40});const turn=controls.state.steering;assert(turn>0&&turn<1);
  send(pad,'pointerdown',{pointerId:3,clientX:160,clientY:40});assert.equal(controls.state.steering,turn);
  send(buttons[3],'pointerdown',{pointerId:2});assert(controls.state.brake);assert.equal(controls.state.steering,turn);
  send(document,'pointermove',{clientX:120,clientY:40});assert(controls.state.steering<0&&controls.state.brake);
  send(document,'pointermove',{clientX:120,clientY:180});assert.equal(controls.state.steering,0);assert(controls.state.brake&&!controls.state.throttle);
  send(document,'pointermove',{clientX:40,clientY:40});assert(controls.state.steering>0);
  send(document,'pointerup',{pointerId:2});assert(!controls.state.brake&&controls.state.steering>0);
  send(document,'pointercancel');assert(Object.values(controls.state).every(v=>!v));
});

test('keyboard steering remains available while the touch pad is held; reset forgets old touches',()=>{
  const {document,controls,pad,binding}=fixture();
  send(pad,'pointerdown',{clientX:40,clientY:40});const turn=controls.state.steering;
  controls.keyDown({code:'KeyD'});assert.equal(controls.state.steering,-1);
  controls.keyUp({code:'KeyD'});assert.equal(controls.state.steering,turn);
  binding.reset();assert.equal(controls.state.steering,0);
  send(document,'pointermove',{clientX:40,clientY:40});assert.equal(controls.state.steering,0);
});

test('automatic gas yields to the brake and is disarmed by a canceled gesture or lost capture',()=>{
  for(const interruption of ['pointercancel','lostpointercapture']){
    const {document,controls,buttons,pad}=fixture();
    send(pad,'pointerdown',{clientX:80,clientY:40});controls.setAutoThrottle(true);assert(controls.state.throttle);
    send(buttons[3],'pointerdown',{pointerId:2});assert(controls.state.brake&&!controls.state.throttle);
    send(document,'pointerup',{pointerId:2});assert(!controls.state.brake&&controls.state.throttle);
    send(interruption==='lostpointercapture'?pad:document,interruption);assert(!controls.state.throttle&&controls.state.steering===0);
    controls.pointerAxis(3,.3);assert(!controls.state.throttle,'Touching a control alone does not silently rearm automatic gas');
  }
});

test('large steering buttons keep their input through edge drift and slide directly between directions',()=>{
  const {document,controls,buttons}=fixture({largeSteering:true});
  send(buttons[0],'pointerdown',{clientX:45,clientY:60});
  send(buttons[3],'pointerdown',{pointerId:2});
  send(document,'pointermove',{clientX:10,clientY:5});assert(controls.state.left&&controls.state.brake);
  send(document,'pointermove',{clientX:150,clientY:10});assert(controls.state.right&&!controls.state.left&&controls.state.brake);
  send(document,'pointermove',{clientX:205,clientY:130});assert(controls.state.right&&controls.state.brake);
  send(document,'pointermove',{clientX:250,clientY:140});assert(!controls.state.right&&!controls.state.left&&controls.state.brake&&!controls.state.throttle);
  send(document,'pointermove',{clientX:50,clientY:50});assert(controls.state.left&&controls.state.brake);
  send(document,'pointerup');assert(!controls.state.left&&controls.state.brake);
  send(document,'pointermove',{clientX:150,clientY:50});assert(!controls.state.right);
});

test('large steering buttons release on interruption and reset without dropping independent keys',()=>{
  const {document,controls,buttons,binding}=fixture({largeSteering:true});
  controls.keyDown({code:'KeyW'});send(buttons[0],'pointerdown');send(document,'pointercancel');
  assert(!controls.state.left&&controls.state.throttle);
  send(buttons[1],'pointerdown');binding.reset();send(document,'pointermove',{clientX:150,clientY:50});
  assert(!controls.state.right&&controls.state.throttle);
});
