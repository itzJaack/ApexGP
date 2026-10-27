const SOURCE=Symbol('tilt-steering'),RAD=Math.PI/180;
const limit=(v,a,b)=>Math.max(a,Math.min(b,v));
const fail=(code,message)=>Object.assign(new Error(message),{code});
export const tiltMode=value=>value==='tilt'?'tilt':'buttons';
export const screenAngle=value=>Number.isFinite(value)?((Math.round(value/90)*90)%360+360)%360:0;

// Project gravity into the horizontal screen axis. Unlike using gamma alone,
// this also works when the screen is held upright or turned to landscape.
// DeviceOrientation uses intrinsic Z-X'-Y'' rotations (W3C Orientation Events).
export function tiltAngle(reading,angle=0){
  const {beta,gamma}=reading||{};
  if(!Number.isFinite(beta)||!Number.isFinite(gamma)||Math.abs(beta)>180||Math.abs(gamma)>90)return null;
  const b=beta*RAD,g=gamma*RAD,a=screenAngle(angle)*RAD;
  const x=-Math.cos(b)*Math.sin(g),y=Math.sin(b);
  return Math.asin(limit(x*Math.cos(a)+y*Math.sin(a),-1,1))/RAD;
}

export function validTiltCalibration(c){
  if(!c||c.version!==1||![0,90,180,270].includes(c.angle)||!['center','left','right'].every(k=>Number.isFinite(c[k])&&Math.abs(c[k])<=90))return false;
  const l=c.left-c.center,r=c.right-c.center;
  return l*r<0&&Math.abs(l)>=8&&Math.abs(r)>=8&&Math.abs(l)<=75&&Math.abs(r)<=75;
}
export function calibratedSteering(value,c,inverted=false){
  if(!Number.isFinite(value)||!validTiltCalibration(c))return 0;
  const d=value-c.center,left=c.left-c.center,right=c.right-c.center;
  const sign=d*left>0?1:-1,range=Math.abs(sign>0?left:right),dead=1.8;
  return (inverted?-1:1)*sign*Math.pow(limit((Math.abs(d)-dead)/(range-dead),0,1),1.15);
}

// Apply the reported direction correction to existing calibrations once.
// Fresh calibrations learn left/right and start without an extra inversion.
export const tiltDirectionInverted=(value,calibration)=>typeof value==='boolean'?value:validTiltCalibration(calibration);

export class TiltSteering{
  constructor({controls,inverted=false,target=globalThis.window,eventType=globalThis.DeviceOrientationEvent,secure=globalThis.isSecureContext===true,getAngle=()=>globalThis.screen?.orientation?.angle??globalThis.window?.orientation??0,now=()=>performance.now(),setTimer=(fn,ms)=>globalThis.setTimeout(fn,ms),clearTimer=id=>globalThis.clearTimeout(id),isDriving=()=>false,onLost=()=>{}}={}){
    Object.assign(this,{controls,target,eventType,secure,getAngle,now,setTimer,clearTimer,isDriving,onLost});
    this.inverted=!!inverted;this.generation=0;this.running=false;this.latest=null;this.calibration=null;this.filtered=0;this.sample=null;this.waiter=null;this.lost=false;
    this.receive=event=>this.read(event);
  }
  get angle(){return screenAngle(this.getAngle());}
  get fresh(){return !!this.latest&&this.latest.angle===this.angle&&this.now()-this.latest.at<=1500;}
  get ready(){return this.running&&this.fresh&&validTiltCalibration(this.calibration)&&this.calibration.angle===this.angle;}
  get samplingProgress(){return this.sample?limit((this.now()-this.sample.started)/1000,0,1):0;}
  setCalibration(value){this.calibration=validTiltCalibration(value)?{...value}:null;this.release();}
  setInverted(value){this.inverted=!!value;this.release();}
  release(){this.filtered=0;this.controls.pointerUp(SOURCE);}
  disable(){
    this.generation++;this.running=false;this.latest=null;this.lost=false;
    this.target?.removeEventListener('deviceorientation',this.receive);
    this.rejectSample(fail('canceled','Calibrazione annullata.'));
    if(this.waiter){this.clearTimer(this.waiter.timer);this.waiter.reject(fail('canceled','Attivazione annullata.'));this.waiter=null;}
    this.release();
  }
  async enable({requestPermission=true}={}){
    if(this.running&&this.fresh)return;
    this.disable();const generation=this.generation;
    if(!this.secure)throw fail('insecure','Per usare il giroscopio apri il gioco tramite HTTPS. Puoi continuare con i pulsanti.');
    if(!this.eventType||!this.target)throw fail('unsupported','Il browser non supporta i sensori di orientamento. Usa i pulsanti.');
    if(typeof this.eventType.requestPermission==='function'){
      if(!requestPermission)throw fail('permission-required','Premi Attiva sensori per consentire l’uso del giroscopio.');
      let permission;
      try{permission=await this.eventType.requestPermission();}catch{throw fail('denied','Accesso ai sensori non consentito. Riprova oppure usa i pulsanti.');}
      if(generation!==this.generation)throw fail('canceled','Attivazione annullata.');
      if(permission!=='granted')throw fail('denied','Permesso per il giroscopio negato. Puoi continuare con i pulsanti.');
    }
    if(generation!==this.generation)throw fail('canceled','Attivazione annullata.');
    this.running=true;this.target.addEventListener('deviceorientation',this.receive);
    return new Promise((resolve,reject)=>{
      const timer=this.setTimer(()=>{
        if(!this.waiter)return;
        this.waiter=null;this.running=false;this.target.removeEventListener('deviceorientation',this.receive);this.release();
        reject(fail('no-data','Nessun dato dal giroscopio. Controlla i permessi dei sensori nel browser oppure usa i pulsanti.'));
      },5000);
      this.waiter={resolve,reject,timer};
    });
  }
  read(event){
    if(!this.running)return;
    const angle=this.angle,value=tiltAngle(event,angle);if(value===null)return;
    if(this.latest&&this.latest.angle!==angle){this.rejectSample(fail('rotated','Orientamento cambiato: ricomincia la calibrazione in questa posizione.'));this.release();this.onLost('rotated');}
    this.latest={value,angle,at:this.now()};this.lost=false;
    if(this.waiter){const {resolve,timer}=this.waiter;this.waiter=null;this.clearTimer(timer);resolve();}
    if(this.sample){
      if(this.sample.angle!==angle)this.rejectSample(fail('rotated','Orientamento cambiato: ricomincia la calibrazione.'));
      else this.sample.points.push(value);
    }
  }
  rejectSample(error){if(this.sample){const {reject,timer}=this.sample;this.sample=null;this.clearTimer(timer);reject(error);}}
  capture(){
    if(!this.running||!this.fresh)return Promise.reject(fail('no-data','Attendi i dati del sensore prima di memorizzare la posizione.'));
    this.rejectSample(fail('canceled','Campionamento sostituito.'));
    return new Promise((resolve,reject)=>{
      const sample={angle:this.angle,started:this.now(),points:[this.latest.value],resolve,reject,timer:null};
      sample.timer=this.setTimer(()=>{
        if(this.sample!==sample)return;this.sample=null;
        if(sample.angle!==this.angle)return reject(fail('rotated','Orientamento cambiato: ricomincia la calibrazione.'));
        if(!this.fresh)return reject(fail('no-data','Segnale del giroscopio interrotto. Riprova.'));
        if(Math.max(...sample.points)-Math.min(...sample.points)>4)return reject(fail('moving','Tieni fermo il telefono durante il secondo di acquisizione, poi riprova.'));
        resolve(sample.points.reduce((a,b)=>a+b,0)/sample.points.length);
      },1000);
      this.sample=sample;
    });
  }
  tick(dt){
    if(this.running&&this.latest&&!this.fresh&&!this.lost){
      this.lost=true;this.release();this.rejectSample(fail('no-data','Segnale del giroscopio interrotto. Riprova.'));this.onLost(this.latest.angle!==this.angle?'rotated':'stale');
    }
    if(!this.ready||!this.isDriving()){this.release();return 0;}
    const desired=calibratedSteering(this.latest.value,this.calibration,this.inverted);
    this.filtered+=(desired-this.filtered)*(1-Math.exp(-limit(dt,0,.1)*12));
    this.controls.pointerAxis(SOURCE,this.filtered);return this.filtered;
  }
}
