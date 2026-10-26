import {SocialClient,normalizeUsername} from './social.js';
import {TRACKS} from './simulation.js';
import {socialEscape as esc,relationshipFor,friendAction} from './social-view.js';

export function mountSocialUI({config,lan,getName,getRace,isPaused,pause,onJoin,onLobbyChange=()=>{},clientOptions={}}){
 const el=id=>document.getElementById(id),visible=(id,on)=>el(id).classList.toggle('hidden',!on),overlay=el('social-overlay');
 let busy=false,resumeRace=false,noticeTimer=null,tab='friends',card=null,cardTarget=null,cardLoading=false,cardGeneration=0,ownerId='',removeConfirmation=false,identityKey='',identityPending='',identityExpires=0,identityRetryAt=0;
 const html=(id,value)=>{if(el(id).innerHTML!==value)el(id).innerHTML=value;};
 const presence=()=>{const state=lan.backend==='supabase'?lan.state:null;return{activity:document.hidden?'away':state?.status==='lobby'?'lobby':state?.status==='race'?'race':getRace()?'race':'available',lobbyCode:state?.code||null,trackId:state?.options.trackId||null};};
 const inRace=()=>!!getRace()&&getRace().state!=='finished';
 const canInvite=()=>lan.backend==='supabase'&&lan.state?.status==='lobby'&&lan.cloud.config?.url===config.url;
 const client=new SocialClient(config,{...clientOptions,onUpdate:render,onInvite:invite=>{el('social-notice-text').textContent=`@${invite.from.username} ti invita a giocare`;visible('social-notice',true);clearTimeout(noticeTimer);noticeTimer=setTimeout(()=>visible('social-notice',false),12000);noticeTimer.unref?.();},getPresence:presence});
 const button=(action,id,label,disabled=false,extra='')=>`<button type="button" class="social-action ${extra}" data-social-action="${action}" data-id="${esc(id)}" ${disabled?'disabled':''}>${label}</button>`;
 const name=(f,detail)=>`<div class="social-person-name"><b>@${esc(f.username)}</b><small>${esc(detail)}</small></div>`;
 const empty=text=>`<p class="social-empty">${text}</p>`;
 const status=p=>!p.online?'Offline':p.activity==='lobby'?'In lobby':p.activity==='race'?'In gara':'Online';
 function syncIdentity(){
  const room=lan.backend==='supabase'&&lan.cloud.config?.url===config.url?lan.state:null;
  const key=client.connected&&client.profile&&room&&lan.id?[client.profile.id,lan.id,room.code].join(':'):'';
  if(!key){identityKey='';identityPending='';identityExpires=0;lan.cloud?.setSocialIdentity(null);return;}
  if(key===identityPending||key===identityKey&&(identityExpires>Date.now()+300000||identityRetryAt>Date.now()))return;
  identityKey=key;identityPending=key;identityRetryAt=0;const epoch=client.epoch,roomCode=room.code,peerId=lan.id;
  client.lobbyIdentity(roomCode,peerId).then(identity=>{
   if(identityKey!==key||epoch!==client.epoch||lan.id!==peerId||lan.state?.code!==roomCode)return;
   identityExpires=Number(identity.proof?.split('.')[1])||0;lan.cloud.setSocialIdentity(identity);onLobbyChange();
  }).catch(()=>{if(identityKey===key){identityExpires=0;identityRetryAt=Date.now()+30000;}}).finally(()=>{if(identityPending===key)identityPending='';});
 }
 function render(){
  const profile=client.profile,data=client.data,nextOwner=profile?.id||'';
  if(nextOwner!==ownerId){ownerId=nextOwner;card=null;cardTarget=null;cardLoading=false;cardGeneration++;removeConfirmation=false;}
  const requests=(data?.incoming?.length||0),invites=(data?.invites?.length||0),count=requests+invites;
  el('social-nav').textContent=count?`AMICI · ${count}`:'AMICI';el('social-hud').setAttribute('aria-label',count?`Amici, ${count} novità`:'Apri amici');el('social-badge').textContent=count||'';visible('social-badge',count>0);
  visible('social-register',!client.connected);visible('social-content',client.connected);
  el('social-profile').textContent=profile?'Il tuo profilo · @'+profile.username:'IL TUO PROFILO PILOTA';el('social-profile').disabled=!client.connected||busy;
  el('social-status').textContent=busy?'Operazione in corso…':client.error||client.message||(client.connected?(data?'Amici e inviti aggiornati.':'Caricamento dei tuoi amici…'):'Accedi per aggiungere piloti e ricevere inviti.');
  el('social-status').classList.toggle('is-error',!!client.error);el('lan-social-status').textContent=client.error||client.message||'';
  el('social-save-note').textContent=client.accountToken?'Amicizie e inviti seguono il tuo account su tutti i dispositivi.':client.saved?'Il tuo vecchio profilo è salvato in questo browser. Puoi esportarne una copia.':'Salva l’accesso al profilo prima di chiudere questo browser.';
  visible('social-export',!client.accountToken&&client.connected);visible('social-import',!client.accountToken);
  for(const id of['social-export','social-refresh','social-add-button','social-create-button','social-friend-name','social-username','social-import'])el(id).disabled=busy;
  el('social-export').disabled=!client.connected||busy;el('social-refresh').disabled=!client.connected||busy;
  for(const name of['friends','requests','invites']){
   const b=overlay.querySelector(`[data-social-tab="${name}"]`),n=name==='friends'?(data?.friends?.length||0):name==='requests'?requests+(data?.outgoing?.length||0):invites;
   b.textContent=({friends:'Amici',requests:'Richieste',invites:'Inviti'})[name]+` (${n})`;b.setAttribute('aria-selected',String(tab===name));visible('social-tab-'+name,tab===name);
  }
  el('social-invite-hint').textContent=canInvite()?'La lobby è pronta: usa “Invita in lobby” accanto a un amico.':inRace()?'Gli inviti restano qui: potrai entrare in un’altra lobby dopo la gara.':'Per invitare qualcuno a giocare, crea prima una lobby in Multiplayer.';
  el('social-friend-count').textContent=String(data?.friends?.length||0);
  // Clear every section when the active account changes or its first sync fails.
  if(!data){for(const id of['social-friends','social-requests','social-outgoing','social-invites'])html(id,empty(client.connected?'Caricamento…':'Accedi per vedere questa lista.'));}
  else{
   html('social-friends',data.friends.length?data.friends.map(f=>`<div class="social-person"><span class="social-dot ${f.online?'online':''}"></span>${name(f,status(f))}<div class="social-actions">${button('profile',f.id,'Vedi profilo',busy)}${button('invite',f.id,'Invita in lobby',busy||!canInvite(),'social-primary')}</div></div>`).join(''):empty('Non hai ancora amici. Cerca un nome utente qui sopra oppure aggiungi un pilota dalla lobby.'));
   html('social-requests',data.incoming.length?data.incoming.map(f=>`<div class="social-person">${name(f,'Ti ha inviato una richiesta di amicizia')}<div class="social-actions">${button('profile',f.id,'Vedi profilo',busy)}${button('accept',f.relationshipId,'Accetta amicizia',busy,'social-primary')}${button('reject',f.relationshipId,'Rifiuta richiesta',busy)}</div></div>`).join(''):empty('Nessuna richiesta ricevuta.'));
   html('social-outgoing',data.outgoing.length?data.outgoing.map(f=>`<div class="social-person">${name(f,'Richiesta inviata · in attesa di risposta')}<div class="social-actions">${button('profile',f.id,'Vedi profilo',busy)}${button('cancel',f.id,'Annulla richiesta',busy)}</div></div>`).join(''):empty('Nessuna richiesta in attesa.'));
   html('social-invites',data.invites.length?data.invites.map(invite=>`<div class="social-invite"><span class="eyebrow">INVITO A GIOCARE</span><b>@${esc(invite.from.username)}</b><p>${esc(TRACKS.find(t=>t.id===invite.trackId)?.name||'Gran Premio')} · valido per pochi minuti</p><div class="social-actions">${button('profile',invite.from.id,'Vedi profilo',busy)}${button('join',invite.id,inRace()?'Disponibile dopo la gara':'Entra in lobby',busy||inRace(),'social-primary')}${button('dismiss',invite.id,'Ignora invito',busy)}</div></div>`).join(''):empty('Non hai inviti a giocare. Quando arrivano, potrai entrare nella lobby da qui.'));
  }
  visible('social-home',!cardTarget);visible('social-player-view',!!cardTarget);
  if(cardTarget)renderCard();syncIdentity();onLobbyChange();
 }
 function renderCard(){
  if(cardLoading){html('social-player-card',empty('Caricamento del profilo…'));return;}
  if(!card){html('social-player-card',empty('Il profilo non è disponibile. Torna agli amici e riprova.'));return;}
  const p=card.profile,r=client.data?relationshipFor(client.data,p.id,client.profile?.id):{kind:card.relationship,id:card.relationshipId},a=friendAction(r);
  const labels={self:'Il tuo profilo',friend:'Siete amici',outgoing:'Richiesta inviata · in attesa',incoming:'Ti ha inviato una richiesta di amicizia',none:'Non siete ancora amici'};
  let actions='';
  if(r.kind==='self')actions='<p class="muted">Gli altri piloti vedono questa scheda. Crediti, salvataggi e dati di accesso restano personali.</p>';
  else if(r.kind==='friend')actions=button('invite',p.id,'Invita in lobby',busy||!canInvite(),'social-primary')+button('remove-check',p.id,'Rimuovi dagli amici',busy,'social-danger');
  else if(r.kind==='outgoing')actions=button('cancel',p.id,'Annulla richiesta',busy);
  else actions=button(a.action,a.id||p.id,a.label,busy,'social-primary')+(r.kind==='incoming'?button('reject',r.id,'Rifiuta richiesta',busy):'');
  if(removeConfirmation&&r.kind==='friend')actions='<p class="social-confirm">Vuoi rimuovere @'+esc(p.username)+' dagli amici?</p>'+button('remove',p.id,'Conferma rimozione',busy,'social-danger')+button('remove-keep',p.id,'Mantieni amicizia',busy);
  const joined=p.joinedAt?new Date(p.joinedAt).toLocaleDateString('it-IT',{day:'numeric',month:'long',year:'numeric'}):'';
  html('social-player-card',`<div class="player-card-heading"><span class="player-avatar" aria-hidden="true">${esc(p.username.slice(0,2).toUpperCase())}</span><div><h3>${esc(p.displayName||p.username)}</h3><b>@${esc(p.username)}</b><small><i class="social-dot ${p.online?'online':''}"></i>${status(p)}</small></div></div><p class="player-relationship">${labels[r.kind]}</p>${joined?`<p class="muted">In ApexGP dal ${esc(joined)}</p>`:''}${p.stats?`<div class="player-stats"><div><b>${esc(p.stats.races)}</b><span>GARE</span></div><div><b>${esc(p.stats.wins)}</b><span>VITTORIE</span></div><div><b>${esc(p.stats.bikes)}</b><span>MOTO</span></div></div><p class="muted">Statistiche dell’ultima carriera salvata.</p>`:'<p class="muted">Nessuna statistica cloud disponibile per questo pilota.</p>'}<div class="player-card-actions">${actions}</div>`);
 }
 async function run(operation){
  if(busy)return;const epoch=client.epoch;busy=true;client.error='';render();
  try{await operation();}catch(e){if(epoch===client.epoch)client.error=e.message;}finally{busy=false;render();}
 }
 function open(){
  if(overlay.classList.contains('hidden')){const race=getRace();resumeRace=!!race&&race.state!=='finished'&&!isPaused();if(resumeRace)pause(true);}
  visible('social-overlay',true);visible('social-notice',false);render();el('social-close').focus();if(client.connected)client.refresh().catch(()=>{});
 }
 function close(resume=true){visible('social-overlay',false);cardGeneration++;card=null;cardTarget=null;cardLoading=false;removeConfirmation=false;if(resume&&resumeRace)pause(false);resumeRace=false;}
 async function loadCard(target){
  const generation=++cardGeneration;cardTarget=target;card=null;cardLoading=true;removeConfirmation=false;render();
  try{const result=await client.viewProfile(target);if(generation===cardGeneration){card=result;client.error='';}}
  catch(e){if(generation===cardGeneration)client.error=e.message;}
  finally{if(generation===cardGeneration){cardLoading=false;render();}}
 }
 function openProfile(target){open();if(!client.connected){client.message='Accedi o collega un profilo per vedere i piloti e aggiungerli agli amici.';render();return;}return loadCard(target);}
 function lobbyTarget(peerId){
  const state=lan.state,p=state?.players.find(p=>p.id===peerId);
  if(lan.backend!=='supabase'||!p?.social||lan.cloud.config?.url!==config.url)throw Error('Questo pilota non ha collegato un profilo alla lobby.');
  return{playerId:p.social.playerId,lobby:{peerId:p.id,roomCode:state.code,identity:p.social}};
 }
 async function handleLobbyAction(action,peerId){
  if(action==='connect'||!client.connected){open();return;}
  let target;try{target=lobbyTarget(peerId);}catch(e){client.error=e.message;render();return;}
  if(action==='profile')return openProfile(target);
  return run(async()=>{
   const result=await client.viewProfile(target),r=result.relationship;
   if(r==='incoming')await client.respond(result.relationshipId,true);
   else if(r==='none')await client.requestId(result.profile.id);
   else{client.message=r==='friend'?'Siete già amici.':r==='self'?'Questo è il tuo profilo.':'Richiesta già inviata.';await client.refresh();}
  });
 }
 overlay.querySelector('.social-tabs').addEventListener('keydown',event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();const tabs=[...overlay.querySelectorAll('[data-social-tab]')],at=tabs.findIndex(b=>b.dataset.socialTab===tab),next=event.key==='Home'?0:event.key==='End'?tabs.length-1:(at+(event.key==='ArrowRight'?1:tabs.length-1))%tabs.length;tab=tabs[next].dataset.socialTab;render();tabs[next].focus();});
 overlay.addEventListener('click',event=>{
  const switcher=event.target.closest('[data-social-tab]');if(switcher){tab=switcher.dataset.socialTab;render();return;}
  const b=event.target.closest('[data-social-action]');if(!b||b.disabled)return;
  const action=b.dataset.socialAction,id=b.dataset.id;
  if(action==='profile'){openProfile({playerId:id});return;}
  if(action==='remove-check'||action==='remove-keep'){removeConfirmation=action==='remove-check';render();return;}
  run(async()=>{
   if(action==='request')await client.requestId(id);
   if(action==='accept')await client.respond(id,true);
   if(action==='reject')await client.respond(id,false);
   if(action==='remove'||action==='cancel'){await client.remove(id);removeConfirmation=false;}
   if(action==='invite'){if(!canInvite())throw Error('Crea prima una lobby online in Multiplayer.');await client.invite(id,lan.state.code,lan.state.options.trackId);}
   if(action==='dismiss')await client.dismissInvite(id);
   if(action==='join'){
    if(inRace())throw Error('Completa la gara prima di entrare in un’altra lobby.');
    const {roomCode}=await client.acceptInvite(id),joined=await onJoin(roomCode);
    if(!joined)throw Error('Lobby non disponibile. Riprova o chiedi un nuovo invito.');
    await client.dismissInvite(id);close(false);
   }
  });
 });
 for(const id of['social-nav','social-hud','social-open','lobby-friends','social-notice-open'])el(id).addEventListener('click',()=>{if(id==='social-notice-open')tab='invites';open();});
 el('social-close').addEventListener('click',()=>close());el('social-refresh').addEventListener('click',()=>run(()=>client.refresh()));
 el('social-profile').addEventListener('click',()=>openProfile({playerId:client.profile.id}));
 el('social-profile-back').addEventListener('click',()=>{cardGeneration++;cardTarget=null;card=null;cardLoading=false;removeConfirmation=false;render();});
 el('social-login').addEventListener('click',()=>{close();el('account-nav').click();});
 el('social-create-form').addEventListener('submit',event=>{event.preventDefault();run(()=>client.register(el('social-username').value,getName()));});
 el('social-add-form').addEventListener('submit',event=>{event.preventDefault();loadCard({username:normalizeUsername(el('social-friend-name').value)});});
 el('social-export').addEventListener('click',()=>{try{const url=URL.createObjectURL(new Blob([client.exportAccess()],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='ApexGP-accesso-'+client.profile.username+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),2000);client.message='Accesso salvato. Conserva questo file per te.';render();}catch(e){client.error=e.message;render();}});
 el('social-import').addEventListener('click',()=>el('social-access-file').click());el('social-access-file').addEventListener('change',()=>run(async()=>{const file=el('social-access-file').files?.[0];if(!file)return;if(file.size>8192)throw Error('File di accesso non valido.');await client.restore(await file.text());el('social-access-file').value='';}));
 document.addEventListener('visibilitychange',()=>{if(client.connected)client.refresh().catch(()=>{});});
 render();client.start();
 return{get busy(){return busy;},client,open,close,openProfile,handleLobbyAction,refresh:()=>client.refresh(),isOpen:()=>!overlay.classList.contains('hidden'),presenceChanged:()=>{render();if(client.connected)client.refresh().catch(()=>{});}};
}
