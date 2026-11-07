export const MIRROR_MODES=['off','left','right','both','center'];
export const MIRROR_LABELS={off:'Spenti',left:'Solo sinistro',right:'Solo destro',both:'Sinistro e destro',center:'Centrale panoramico'};
export function rearviewCamera(player,side){
 const local=(x,y,z)=>[player.x+Math.cos(player.heading)*x+Math.sin(player.heading)*z,(player.y||0)+y,player.z-Math.sin(player.heading)*x+Math.cos(player.heading)*z];
 const sign=side==='left'?-1:side==='right'?1:0;
 return{eye:local(sign*.36,1.15,.15),target:local(sign*6,1.03,-30),fov:sign?.64:.62};
}

// Rear views use the current scene and real opponents. Small render targets
// update independently, leaving the main race at its normal frame rate.
export class RearViews{
 constructor(renderer,container,mode='both'){
  this.renderer=renderer;this.container=container;this.targets=new Map();this.nextUpdate=0;this.setMode(mode);
 }
 setMode(mode){
  this.mode=MIRROR_MODES.includes(mode)?mode:'both';this.nextUpdate=0;
  this.sides=this.mode==='both'?['left','right']:this.mode==='off'?[]:[this.mode];
  for(const [side,target]of this.targets)if(!this.sides.includes(side)){this.renderer.freeTarget?.(target);this.targets.delete(side);}
  if(this.container){
   this.container.dataset.mode=this.mode;
   this.container.innerHTML=this.sides.map(side=>`<div class="rearview" data-mirror="${side}" role="img" aria-label="Retrovisore ${MIRROR_LABELS[side].toLowerCase()}"><span>${side==='center'?'POSTERIORE · PANORAMICO':side==='left'?'SX':'DX'}</span></div>`).join('');
  }
 }
 hide(){if(this.container){this.container.hidden=true;const parent=this.container.parentElement;if(parent){delete parent.dataset.rearviews;parent.style.removeProperty('--rearview-bottom');}}}
 render(player,drawScene,active=true){
  if(!this.container)return;
  this.container.hidden=!active||!this.sides.length||!!this.renderer.compat;
  if(this.container.hidden){this.hide();return;}
  const r=this.renderer,now=performance.now();
  if(now<this.nextUpdate)return;
  this.nextUpdate=now+(r.quality==='low'?100:1000/24);
  let bottom=0;
  for(const side of this.sides){
   const element=this.container.querySelector(`[data-mirror="${side}"]`),rect=element.getBoundingClientRect();
   bottom=Math.max(bottom,rect.bottom);
   const width=r.quality==='low'?(side==='center'?480:320):(side==='center'?768:512),height=Math.max(64,Math.round(width*rect.height/Math.max(1,rect.width)));
   let target=this.targets.get(side);
   if(!target||target.width!==width||target.height!==height){r.freeTarget(target);target=r.target(width,height);this.targets.set(side,target);}
   if(!target.complete)continue;
   const camera=rearviewCamera(player,side);target.distance=r.quality==='low'?220:450;
   r.begin(camera.eye,camera.target,camera.fov,0,0,target);drawScene(side);
  }
  const parent=this.container.parentElement;if(parent){parent.dataset.rearviews='on';parent.style.setProperty('--rearview-bottom',Math.round(bottom+10)+'px');}
 }
 composite(){
  if(!this.container||this.container.hidden)return;
  const r=this.renderer,canvas=r.canvas,base=canvas.getBoundingClientRect(),sx=canvas.width/base.width,sy=canvas.height/base.height;
  for(const side of this.sides){
   const target=this.targets.get(side);if(!target?.complete)continue;
   const rect=this.container.querySelector(`[data-mirror="${side}"]`).getBoundingClientRect();
   r.drawRearview(target,{x:Math.round((rect.left-base.left)*sx),y:Math.round((base.bottom-rect.bottom)*sy),width:Math.round(rect.width*sx),height:Math.round(rect.height*sy)});
  }
 }
 dispose(){for(const target of this.targets.values())this.renderer.freeTarget(target);this.targets.clear();this.hide();}
}
