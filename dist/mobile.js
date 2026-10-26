export function useTouchControls(mode,{maxTouchPoints=0,coarsePointer=false,touched=false}={}){
  if(mode==='on')return true;
  if(mode==='off')return false;
  return maxTouchPoints>0||coarsePointer||touched;
}

export function mountMobileUI({mode='auto',onClearInput=()=>{}}={}){
  const root=document.documentElement,body=document.body,coarse=matchMedia('(any-pointer: coarse)');
  let touched=false,touch=false,resizeFrame=0;
  const apply=()=>{
    const next=useTouchControls(mode,{maxTouchPoints:navigator.maxTouchPoints,coarsePointer:coarse.matches,touched});
    body.classList.toggle('touch-mode',next);
    if(next!==touch){touch=next;onClearInput();}
  };
  const viewport=()=>{
    resizeFrame=0;
    root.style.setProperty('--app-height',`${window.visualViewport?.height||innerHeight}px`);
    root.style.setProperty('--viewport-top',`${window.visualViewport?.offsetTop||0}px`);
  };
  const resize=()=>{if(!resizeFrame)resizeFrame=requestAnimationFrame(viewport);};
  coarse.addEventListener('change',apply);
  document.addEventListener('pointerdown',event=>{
    if(event.pointerType==='touch'&&!touched){touched=true;apply();}
  },{passive:true});
  window.addEventListener('resize',resize);
  window.visualViewport?.addEventListener('resize',resize);
  window.visualViewport?.addEventListener('scroll',resize);
  window.addEventListener('orientationchange',()=>{onClearInput();resize();});

  const supported=!!(root.requestFullscreen||root.webkitRequestFullscreen);
  const fullscreenButtons=[...document.querySelectorAll('[data-fullscreen]')];
  const syncFullscreen=()=>{
    const active=!!(document.fullscreenElement||document.webkitFullscreenElement);
    for(const button of fullscreenButtons){
      button.classList.toggle('hidden',!supported);
      button.setAttribute('aria-pressed',String(active));
      button.setAttribute('aria-label',active?'Esci dallo schermo intero':'Schermo intero');
    }
    onClearInput();resize();
  };
  document.addEventListener('fullscreenchange',syncFullscreen);
  document.addEventListener('webkitfullscreenchange',syncFullscreen);
  apply();viewport();syncFullscreen();
  return{
    get isTouch(){return touch;},
    setMode(value){mode=value;apply();},
    async toggleFullscreen(){
      if(!supported)return;
      onClearInput();
      if(document.fullscreenElement||document.webkitFullscreenElement){
        await (document.exitFullscreen||document.webkitExitFullscreen).call(document);
      }else{
        await (root.requestFullscreen||root.webkitRequestFullscreen).call(root);
        if(touch){try{await window.screen.orientation?.lock?.('landscape');}catch{/* Rotation stays optional on unsupported browsers. */}}
      }
    }
  };
}
