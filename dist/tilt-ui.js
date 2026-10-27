import {TiltSteering,tiltMode,validTiltCalibration,calibratedSteering} from './tilt.js';

export function mountTiltUI({controls,mode='buttons',calibration=null,isDriving,onPause,onSave,onChange=()=>{},sensorOptions={}}){
  const $=id=>document.getElementById(id),overlay=$('tilt-overlay'),selector=$('touch-steering-select');
  let choice=tiltMode(mode),saved=validTiltCalibration(calibration)?{...calibration}:null,opened=false,step=0,draft={},busy=false,operation=0,previousFocus=null,lastReady=null,lastMeter=null,lastHud=null;
  const sensor=new TiltSteering({controls,isDriving:()=>choice==='tilt'&&!opened&&isDriving(),...sensorOptions,onLost:reason=>{
    onPause();
    if(opened&&reason==='rotated'){step=0;draft={};$('tilt-error').textContent='Orientamento cambiato. Mantieni questo orientamento e ricomincia dal centro.';renderStep();}
    status(reason==='rotated'?'Telefono ruotato: ricalibra il giroscopio in questo orientamento.':'Segnale del giroscopio interrotto. Per ora puoi usare i pulsanti.');
  }});
  sensor.setCalibration(saved);
  const instructions=[
    ['Posizione neutra','Tieni il telefono nella posizione comoda con cui giocherai. Scegli ora verticale o orizzontale e mantienilo fermo.','MEMORIZZA CENTRO'],
    ['Inclina a sinistra','Inclina il telefono verso sinistra quanto vuoi per ottenere lo sterzo massimo. Tienilo fermo e memorizza.','MEMORIZZA SINISTRA'],
    ['Inclina a destra','Inclina verso destra quanto vuoi per ottenere lo sterzo massimo. Tienilo fermo e memorizza.','MEMORIZZA DESTRA'],
    ['Prova lo sterzo','Torna al centro, poi inclina a sinistra e a destra: verifica che l’indicatore segua i movimenti.','USA QUESTO STERZO'],
  ];
  function status(text){$('tilt-status').textContent=text;$('tilt-status').classList.toggle('hidden',!text);}
  function refresh(){
    const active=choice==='tilt'&&sensor.ready;
    $('tilt-pause-calibrate').classList.toggle('hidden',choice!=='tilt');
    $('tilt-enable').classList.toggle('hidden',choice!=='tilt'||active||!saved||saved.angle!==sensor.angle);
    if(!opened&&selector.value!==choice)selector.value=choice;
    if(active!==lastReady){lastReady=active;$('touch-controls').classList.toggle('tilt-steering',active);$('tilt-hud').classList.toggle('hidden',!active);onChange();}
  }
  function save(next,config=saved){choice=tiltMode(next);saved=validTiltCalibration(config)?{...config}:null;sensor.setCalibration(saved);onSave(choice,saved);refresh();}
  function renderStep(){
    const [heading,text,button]=instructions[step];
    $('tilt-step').textContent=`PASSAGGIO ${step+1} DI 4`;$('tilt-step-title').textContent=heading;$('tilt-instructions').textContent=text;
    $('tilt-capture').textContent=busy?'TIENI FERMO IL TELEFONO…':button;$('tilt-capture').disabled=busy||!sensor.fresh;
    $('tilt-restart').classList.toggle('hidden',step===0);$('tilt-acquisition').classList.toggle('hidden',!busy);
    $('tilt-cancel').textContent=choice==='tilt'?'Annulla':'Annulla e usa i pulsanti';
  }
  function close(){
    operation++;opened=false;busy=false;sensor.rejectSample(Object.assign(new Error('Calibrazione annullata.'),{code:'canceled'}));overlay.classList.add('hidden');
    sensor.setCalibration(saved);refresh();
    const resume=$('resume-button');
    if(!$('pause-overlay').classList.contains('hidden'))resume.focus({preventScroll:true});
    else if(previousFocus?.isConnected)previousFocus.focus({preventScroll:true});
  }
  async function open(){
    if(opened)return;previousFocus=document.activeElement;onPause();opened=true;step=0;draft={};busy=false;lastMeter=null;
    const id=++operation;overlay.classList.remove('hidden');$('tilt-error').textContent='Attendi i sensori e consenti l’accesso se il browser lo richiede.';renderStep();$('tilt-cancel').focus();
    try{
      await sensor.enable();if(!opened||id!==operation)return;
      $('tilt-error').textContent='';renderStep();$('tilt-capture').focus();
    }catch(error){if(opened&&id===operation){$('tilt-error').textContent=error.message;status(error.message);renderStep();}}
  }
  async function activateSaved(){
    onPause();const id=++operation;$('tilt-enable').disabled=true;
    try{
      await sensor.enable();if(id!==operation)return;
      if(!saved||saved.angle!==sensor.angle){await open();return;}
      save('tilt',saved);status('Giroscopio attivo. Inclina il telefono per sterzare.');
    }catch(error){if(id===operation)status(error.message);}
    finally{$('tilt-enable').disabled=false;refresh();}
  }
  selector.value=choice;
  selector.addEventListener('change',()=>{
    if(selector.value==='buttons'){
      if(opened)close();operation++;sensor.disable();save('buttons');status('Sterzo a pulsanti attivo.');onChange();
    }else if(saved&&saved.angle===sensor.angle)activateSaved();
    else open();
  });
  $('tilt-calibrate').addEventListener('click',open);$('tilt-recalibrate').addEventListener('click',open);$('tilt-pause-calibrate').addEventListener('click',open);$('tilt-enable').addEventListener('click',activateSaved);
  $('tilt-cancel').addEventListener('click',()=>{close();if(choice==='buttons'){sensor.disable();status('Calibrazione annullata. Sterzo a pulsanti attivo.');}});
  $('tilt-restart').addEventListener('click',()=>{if(busy)return;step=0;draft={};$('tilt-error').textContent='';renderStep();$('tilt-capture').focus();});
  $('tilt-capture').addEventListener('click',async()=>{
    if(busy)return;
    if(step===3){save('tilt',draft);close();status('Giroscopio calibrato. Inclina il telefono per sterzare.');return;}
    const id=operation;busy=true;$('tilt-error').textContent='';renderStep();
    try{
      const value=await sensor.capture();if(!opened||id!==operation)return;
      if(step===0)draft={version:1,angle:sensor.angle,center:value};
      if(step===1){
        const delta=Math.abs(value-draft.center);if(delta<8||delta>75)throw new Error('Inclina di almeno 8° rispetto al centro, senza capovolgere il telefono.');
        draft.left=value;
      }
      if(step===2){
        const next={...draft,right:value};if(!validTiltCalibration(next))throw new Error('Inclina dalla parte opposta alla sinistra, di almeno 8° rispetto al centro.');
        draft=next;
      }
      step++;
    }catch(error){if(opened&&id===operation&&error.code!=='canceled')$('tilt-error').textContent=error.message;}
    finally{if(opened&&id===operation){busy=false;renderStep();$('tilt-capture').focus();}}
  });
  overlay.addEventListener('keydown',event=>{
    if(event.key==='Escape'){event.preventDefault();event.stopPropagation();$('tilt-cancel').click();return;}
    if(event.key!=='Tab')return;
    const focusable=[...overlay.querySelectorAll('button')].filter(el=>!el.disabled&&!el.classList.contains('hidden'));
    const first=focusable[0],last=focusable.at(-1);
    if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
    else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
  });
  refresh();
  if(choice==='tilt'){
    if(saved&&saved.angle===sensor.angle){
      sensor.enable({requestPermission:false}).then(()=>{refresh();status('Giroscopio attivo.');}).catch(error=>{status(error.message);refresh();});
    }else status('Calibra il giroscopio nell’orientamento attuale. Nel frattempo restano disponibili i pulsanti.');
  }
  return{
    isOpen:()=>opened,
    isReady:()=>choice==='tilt'&&sensor.ready,
    reset:()=>sensor.release(),
    tick(dt){
      const value=sensor.tick(dt);refresh();
      if(lastReady&&Math.abs(value-(lastHud??Infinity))>.002){lastHud=value;$('tilt-hud-marker').style.setProperty('--tilt',String(value));}
      if(opened){
        const raw=sensor.fresh?sensor.latest.value:0;
        const steer=step===3?calibratedSteering(raw,draft):Math.max(-1,Math.min(1,(raw-(draft.center??raw))/30));
        const percent=Math.round(steer*100);
        if(percent!==lastMeter){lastMeter=percent;$('tilt-preview').style.setProperty('--tilt',String(steer));$('tilt-preview').setAttribute('aria-valuenow',String(percent));$('tilt-preview').setAttribute('aria-valuetext',Math.abs(percent)<2?'Centro':`${percent>0?'Sinistra':'Destra'} ${Math.abs(percent)}%`);}
        $('tilt-acquisition-bar').style.width=`${Math.round(sensor.samplingProgress*100)}%`;
        if(!busy)$('tilt-capture').disabled=!sensor.fresh;
      }
    },
  };
}
