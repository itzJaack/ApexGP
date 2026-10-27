const CODES={KeyW:'throttle',ArrowUp:'throttle',KeyS:'brake',ArrowDown:'brake',Space:'brake',KeyA:'left',ArrowLeft:'left',KeyD:'right',ArrowRight:'right',ShiftLeft:'wheelie',ShiftRight:'wheelie'};
const KEY_CODES={w:'KeyW',arrowup:'ArrowUp',s:'KeyS',arrowdown:'ArrowDown',' ':'Space',spacebar:'Space',a:'KeyA',arrowleft:'ArrowLeft',d:'KeyD',arrowright:'ArrowRight',shift:'ShiftLeft'};

export class DrivingControls{
  constructor(){this.state={throttle:false,brake:false,left:false,right:false,wheelie:false,steering:0};this.keys=new Map();this.pointers=new Map();this.axes=new Map();this.autoThrottle=false;}
  codeFor(event){return CODES[event.code]?event.code:KEY_CODES[String(event.key||'').toLowerCase()]||null;}
  actionFor(event){return CODES[this.codeFor(event)]||null;}
  keyDown(event){const code=this.codeFor(event);if(!code)return false;this.keys.set(code,CODES[code]);this.sync();return true;}
  keyUp(event){const code=this.codeFor(event);if(!code)return false;this.keys.delete(code);this.sync();return true;}
  pointerDown(id,action){if(!Object.values(CODES).includes(action))return;this.pointers.set(id,action);this.sync();}
  pointerAxis(id,value){if(!Number.isFinite(value))return;this.axes.set(id,Math.max(-1,Math.min(1,value)));this.sync();}
  pointerUp(id){this.pointers.delete(id);this.axes.delete(id);this.sync();}
  setAutoThrottle(value){if(this.autoThrottle===!!value)return;this.autoThrottle=!!value;this.sync();}
  sync(){
    const held=[...this.keys.values(),...this.pointers.values()];
    for(const action of ['throttle','brake','left','right','wheelie'])this.state[action]=held.includes(action);
    this.state.steering=this.state.left||this.state.right?Number(this.state.left)-Number(this.state.right):[...this.axes.values()].at(-1)||0;
    if(this.autoThrottle&&!this.state.brake)this.state.throttle=true;
  }
  clear(){this.keys.clear();this.pointers.clear();this.axes.clear();this.autoThrottle=false;this.sync();}
}

// A wide neutral zone and a gentle response near the centre make small
// corrections possible without losing full lock at either end of the pad.
export function touchSteeringAt(clientX,rect){
  if(!Number.isFinite(clientX)||!Number.isFinite(rect?.width)||rect.width<=0)return 0;
  const raw=Math.max(-1,Math.min(1,(rect.left+rect.width/2-clientX)/Math.max(1,rect.width/2-20)));
  return Math.sign(raw)*Math.pow(Math.max(0,(Math.abs(raw)-.10)/.90),1.35);
}

// Each finger owns its input. Slides, interrupted gestures and lost capture
// release only that finger, without dropping another finger or a keyboard key.
export function bindTouchControls({root,controls,isEnabled,onChange=()=>{},onEngage=()=>{},onInterrupt=()=>{}}){
  const document=root.ownerDocument,active=new Set(),pad=root.querySelector?.('[data-steer-pad]');let steeringPointer=null;
  const release=event=>{
    if(!active.delete(event.pointerId))return;
    if(event.pointerId===steeringPointer)steeringPointer=null;
    controls.pointerUp(event.pointerId);onChange();
    if(event.type==='pointercancel'||event.type==='lostpointercapture')onInterrupt();
  };
  const capture=(target,event)=>{try{target.setPointerCapture?.(event.pointerId);}catch{/* Document handlers also release the finger. */}};
  pad?.addEventListener('pointerdown',event=>{
    if(event.button>0||!isEnabled()||steeringPointer!==null)return;
    event.preventDefault();steeringPointer=event.pointerId;active.add(event.pointerId);
    controls.pointerAxis(event.pointerId,touchSteeringAt(event.clientX,pad.getBoundingClientRect()));
    onEngage();onChange();capture(pad,event);
  });
  pad?.addEventListener('lostpointercapture',release);
  pad?.addEventListener('contextmenu',event=>event.preventDefault());
  for(const button of root.querySelectorAll('[data-control]')){
    button.addEventListener('pointerdown',event=>{
      if(event.button>0||!isEnabled())return;
      event.preventDefault();active.add(event.pointerId);
      controls.pointerDown(event.pointerId,button.dataset.control);onEngage();onChange();capture(button,event);
    });
    button.addEventListener('lostpointercapture',release);
    button.addEventListener('contextmenu',event=>event.preventDefault());
  }
  document.addEventListener('pointermove',event=>{
    if(!active.has(event.pointerId))return;
    if(!isEnabled()){release(event);return;}
    event.preventDefault();
    if(event.pointerId===steeringPointer){
      const rect=pad.getBoundingClientRect(),outside=event.clientX<rect.left-28||event.clientX>rect.right+28||event.clientY<rect.top-28||event.clientY>rect.bottom+28;
      controls.pointerAxis(event.pointerId,outside?0:touchSteeringAt(event.clientX,rect));onChange();return;
    }
    const button=document.elementFromPoint(event.clientX,event.clientY)?.closest('[data-control]');
    if(button&&root.contains(button))controls.pointerDown(event.pointerId,button.dataset.control);
    else controls.pointerUp(event.pointerId);
    onChange();
  },{passive:false});
  document.addEventListener('pointerup',release);
  document.addEventListener('pointercancel',release);
  return{reset(){for(const id of active)controls.pointerUp(id);active.clear();steeringPointer=null;onChange();}};
}
