import {validateCloudConfig} from './realtime.js';
export const SOCIAL_STORAGE_KEY='apexgp.friends.access.v1';
export function normalizeUsername(value){return String(value||'').trim().replace(/^@/,'').toLowerCase();}
export function validSocialAccess(data,project){return !!data&&data.version===1&&data.project===project&&typeof data.session==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.[0-9a-f]{64}$/.test(data.session);}
export function cleanLobbyIdentity(value){return value&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value.playerId||'')&&/^[a-z0-9_]{3,20}$/.test(value.username||'')&&new RegExp('^'+value.playerId+'\\.\\d{13}\\.[0-9a-f]{64}$').test(value.proof||'')?{playerId:value.playerId,username:value.username,proof:value.proof}:null;}
function syncData(data){
 const profile=p=>p&&typeof p.id==='string'&&typeof p.username==='string';
 if(!data||!profile(data.profile)||!['friends','incoming','outgoing'].every(k=>Array.isArray(data[k])&&data[k].every(profile))||!Array.isArray(data.invites)||!data.invites.every(v=>v&&typeof v.id==='string'&&typeof v.from?.username==='string'))throw Error('Risposta del servizio amici incompleta. Riprova ad aggiornare le liste.');
 return data;
}
export class SocialClient{
 constructor(config,{storage,fetcher=(...args)=>globalThis.fetch(...args),onUpdate=()=>{},onInvite=()=>{},getPresence=()=>({activity:'available'}),hidden=()=>globalThis.document?.hidden||false}={}){
  this.config=validateCloudConfig(config);try{this.storage=storage===undefined?globalThis.localStorage:storage;}catch{this.storage=null;}this.fetcher=fetcher;this.onUpdate=onUpdate;this.onInvite=onInvite;this.getPresence=getPresence;this.hidden=hidden;this.access=null;this.data=null;this.error='';this.message='';this.timer=null;this.pollEpoch=0;this.syncing=null;this.epoch=0;this.seen=new Set();this.saved=true;
  try{const stored=JSON.parse(this.storage?.getItem(SOCIAL_STORAGE_KEY)||'null');if(validSocialAccess(stored,this.config.url))this.access=stored;}catch{/* A profile can still be created and exported when browser storage is unavailable. */}
 }
  get profile(){return this.data?.profile||this.accountProfile||this.access?.profile||null;}
  get connected(){return !!this.accountToken||!!this.access;}
  setAccount(getToken,profile=null){this.stop();this.epoch++;this.syncing=null;this.data=null;this.seen.clear();this.accountToken=getToken;this.accountProfile=profile;this.error='';this.message='';this.notify();this.start();}
 save(){try{this.storage.setItem(SOCIAL_STORAGE_KEY,JSON.stringify(this.access));this.saved=true;}catch{this.saved=false;}}
 async call(action,body={},session=this.access?.session){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),18000);
   try{if(this.accountToken){session=await this.accountToken();if(!session)throw Error('Sessione account terminata.');}const headers={'Content-Type':'application/json',apikey:this.config.publishableKey};if(session)headers.Authorization='Bearer '+session;const response=await this.fetcher(this.config.url+'/functions/v1/apexgp-social',{method:'POST',headers,body:JSON.stringify({action,...body}),signal:controller.signal});let data;try{data=await response.json();}catch{data=null;}if(!response.ok){const e=Error(data?.error||'Servizio amici non disponibile. Riprova.');e.status=response.status;throw e;}if(!data||typeof data!=='object')throw Error('Risposta del servizio amici non valida.');return data;
  }catch(e){if(e.name==='AbortError')throw Error('Il servizio amici non risponde. Riprova.');throw e;}finally{clearTimeout(timer);}
 }
 async register(username,displayName){const name=normalizeUsername(username);if(!/^[a-z0-9_]{3,20}$/.test(name))throw Error('Usa 3–20 lettere, numeri o trattini bassi.');const result=await this.call('register',{username:name,displayName});const access={version:1,project:this.config.url,session:result.session,profile:result.profile};if(!validSocialAccess(access,this.config.url))throw Error('Creazione del profilo non riuscita.');this.stop();this.epoch++;this.syncing=null;this.access=access;this.data=null;this.error='';this.message='Profilo creato. Aggiungi il tuo amico con il suo nome univoco.';this.seen.clear();this.save();await this.refresh();this.start();return this.profile;}
 async restore(raw){const access=typeof raw==='string'?JSON.parse(raw):raw;if(!validSocialAccess(access,this.config.url))throw Error('Questo file di accesso non è valido per ApexGP.');const data=syncData(await this.call('sync',{presence:this.getPresence()},access.session));this.stop();this.epoch++;this.syncing=null;this.access={...access,profile:data.profile};this.data=data;this.error='';this.message='Accesso al profilo ripristinato.';this.seen.clear();this.save();this.notify();this.start();return this.profile;}
  exportAccess(){if(this.accountToken)throw Error('Questo profilo è collegato al tuo account: accedi con nome utente e password sugli altri dispositivi.');if(!this.access)throw Error('Crea prima un profilo.');return JSON.stringify({...this.access,profile:this.profile},null,2);}
 reset(){this.stop();this.epoch++;this.syncing=null;this.access=null;this.data=null;this.error='';this.message='Scegli un altro profilo oppure importa il tuo accesso.';this.seen.clear();try{this.storage?.removeItem(SOCIAL_STORAGE_KEY);}catch{}this.notify();}
 notify(){this.onUpdate(this.data,this);for(const invite of this.data?.invites||[]){const key=invite.id+':'+invite.expiresAt;if(!this.seen.has(key)){this.seen.add(key);this.onInvite(invite);}}if(this.seen.size>200)this.seen=new Set([...this.seen].slice(-100));}
 async refresh(){
   if(!this.connected)return null;if(this.syncing)return this.syncing;const epoch=this.epoch;
   const task=(async()=>{try{const data=await this.call('sync',{presence:this.getPresence()});if(epoch!==this.epoch)return null;syncData(data);this.data=data;this.error='';if(this.accountToken)this.accountProfile=data.profile;else this.access.profile=data.profile;this.notify();return data;}catch(e){if(epoch===this.epoch){this.error=e.message;this.notify();}throw e;}finally{if(this.syncing===task)this.syncing=null;}})();this.syncing=task;return task;
 }
 async mutate(action,body){const epoch=this.epoch,result=await this.call(action,body);if(epoch!==this.epoch)return null;this.message=result.message||'';this.error='';if(this.syncing)try{await this.syncing;}catch{}if(epoch!==this.epoch)return null;await this.refresh();return result;}
 request(username){return this.mutate('request',{username:normalizeUsername(username)});}
 requestId(playerId){return this.mutate('request',{playerId});}
 async viewProfile(target){const epoch=this.epoch,result=await this.call('profile',target);if(epoch!==this.epoch)throw Error('Il profilo attivo è cambiato. Riapri la scheda del pilota.');if(!result.profile||typeof result.profile.id!=='string'||typeof result.profile.username!=='string')throw Error('Profilo non disponibile. Riprova.');return result;}
 lobbyIdentity(roomCode,peerId){return this.call('lobby_identity',{roomCode,peerId});}
 respond(id,accept){return this.mutate('respond',{id,accept:!!accept});}
 remove(playerId){return this.mutate('remove',{playerId});}
 invite(playerId,roomCode,trackId){return this.mutate('invite',{playerId,roomCode,trackId});}
 acceptInvite(id){return this.call('accept_invite',{id});}
 dismissInvite(id){return this.mutate('dismiss_invite',{id});}
  start(){this.stop();if(!this.connected)return;const pollEpoch=this.pollEpoch;const poll=async()=>{if(!this.connected||pollEpoch!==this.pollEpoch)return;try{await this.refresh();}catch{}if(this.connected&&pollEpoch===this.pollEpoch){this.timer=setTimeout(poll,this.hidden()?25000:6000);this.timer.unref?.();}};this.timer=setTimeout(poll,150);this.timer.unref?.();}
 stop(){this.pollEpoch++;clearTimeout(this.timer);this.timer=null;}
}
