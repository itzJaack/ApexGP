import test from 'node:test';
import assert from 'node:assert/strict';
import {DrivingControls,bindTouchControls} from '../dist/controls.js';
import {useTouchControls} from '../dist/mobile.js';

const send=(target,type,props={})=>{
  const event=new Event(type,{cancelable:true});
  Object.assign(event,{pointerId:1,button:0,clientX:0,clientY:0,...props});
  target.dispatchEvent(event);return event;
};
function fixture(){
  const document=new EventTarget(),controls=new DrivingControls();
  const buttons=['left','right','wheelie','brake','throttle'].map(action=>{
    const button=new EventTarget();button.dataset={control:action};button.closest=()=>button;button.setPointerCapture=()=>{};return button;
  });
  document.elementFromPoint=(x,y)=>y<0?null:buttons[x]||null;
  const root={ownerDocument:document,querySelectorAll:()=>buttons,contains:button=>buttons.includes(button)};
  let enabled=true;
  const binding=bindTouchControls({root,controls,isEnabled:()=>enabled});
  return{document,controls,buttons,binding,setEnabled:value=>{enabled=value;}};
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
