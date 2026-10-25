import test from 'node:test';
import assert from 'node:assert/strict';
import {DrivingControls} from '../dist/controls.js';

test('keyboard steering works with physical codes and key-only events',()=>{
  for(const event of [{code:'KeyA',key:'a'},{code:'',key:'a'},{key:'A'},{code:'Unidentified',key:'ArrowLeft'}]){
    const c=new DrivingControls();assert(c.keyDown(event));assert(c.state.left);assert(!c.state.right);c.keyUp(event);assert(!c.state.left);
  }
  for(const event of [{code:'KeyD',key:'d'},{code:'',key:'D'},{key:'ArrowRight'}]){
    const c=new DrivingControls();assert(c.keyDown(event));assert(c.state.right);assert(!c.state.left);c.keyUp(event);assert(!c.state.right);
  }
});

test('releasing one keyboard alias does not release another held steering key',()=>{
  const c=new DrivingControls();c.keyDown({code:'KeyA'});c.keyDown({key:'ArrowLeft'});c.keyUp({key:'a'});assert(c.state.left);c.keyUp({code:'ArrowLeft'});assert(!c.state.left);
});

test('multi-touch throttle and steering survive keyboard changes and cancellation',()=>{
  const c=new DrivingControls();c.pointerDown(1,'throttle');c.pointerDown(2,'left');c.keyDown({code:'KeyW'});c.keyUp({code:'KeyW'});assert(c.state.throttle&&c.state.left);
  c.pointerUp(1);assert(!c.state.throttle&&c.state.left);c.pointerUp(2);assert(!c.state.left);
  c.keyDown({code:'KeyD'});c.pointerDown(3,'right');c.pointerUp(3);assert(c.state.right);
  c.clear();assert(Object.values(c.state).every(v=>!v));
});
