const CODES={KeyW:'throttle',ArrowUp:'throttle',KeyS:'brake',ArrowDown:'brake',Space:'brake',KeyA:'left',ArrowLeft:'left',KeyD:'right',ArrowRight:'right',ShiftLeft:'wheelie',ShiftRight:'wheelie'};
const KEY_CODES={w:'KeyW',arrowup:'ArrowUp',s:'KeyS',arrowdown:'ArrowDown',' ':'Space',spacebar:'Space',a:'KeyA',arrowleft:'ArrowLeft',d:'KeyD',arrowright:'ArrowRight',shift:'ShiftLeft'};

export class DrivingControls{
  constructor(){this.state={throttle:false,brake:false,left:false,right:false,wheelie:false};this.keys=new Map();this.pointers=new Map();}
  codeFor(event){return CODES[event.code]?event.code:KEY_CODES[String(event.key||'').toLowerCase()]||null;}
  actionFor(event){return CODES[this.codeFor(event)]||null;}
  keyDown(event){const code=this.codeFor(event);if(!code)return false;this.keys.set(code,CODES[code]);this.sync();return true;}
  keyUp(event){const code=this.codeFor(event);if(!code)return false;this.keys.delete(code);this.sync();return true;}
  pointerDown(id,action){if(!(action in this.state))return;this.pointers.set(id,action);this.sync();}
  pointerUp(id){this.pointers.delete(id);this.sync();}
  sync(){for(const action of Object.keys(this.state))this.state[action]=[...this.keys.values(),...this.pointers.values()].includes(action);}
  clear(){this.keys.clear();this.pointers.clear();this.sync();}
}

// Each finger owns its input. Slides, interrupted gestures and lost capture
// release only that finger, without dropping another finger or a keyboard key.
export function bindTouchControls({root,controls,isEnabled,onChange=()=>{},onEngage=()=>{}}){
  const document=root.ownerDocument,active=new Set();
  const release=event=>{
    if(!active.delete(event.pointerId))return;
    controls.pointerUp(event.pointerId);onChange();
  };
  for(const button of root.querySelectorAll('[data-control]')){
    button.addEventListener('pointerdown',event=>{
      if(event.button>0||!isEnabled())return;
      event.preventDefault();active.add(event.pointerId);
      controls.pointerDown(event.pointerId,button.dataset.control);onChange();onEngage();
      try{button.setPointerCapture?.(event.pointerId);}catch{/* Document handlers also release the finger. */}
    });
    button.addEventListener('lostpointercapture',release);
    button.addEventListener('contextmenu',event=>event.preventDefault());
  }
  document.addEventListener('pointermove',event=>{
    if(!active.has(event.pointerId))return;
    if(!isEnabled()){release(event);return;}
    event.preventDefault();
    const button=document.elementFromPoint(event.clientX,event.clientY)?.closest('[data-control]');
    if(button&&root.contains(button))controls.pointerDown(event.pointerId,button.dataset.control);
    else controls.pointerUp(event.pointerId);
    onChange();
  },{passive:false});
  document.addEventListener('pointerup',release);
  document.addEventListener('pointercancel',release);
  return{reset(){for(const id of active)controls.pointerUp(id);active.clear();onChange();}};
}
