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
