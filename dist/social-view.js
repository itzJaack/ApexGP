import {BIKES} from './simulation.js';
import {cleanLobbyIdentity} from './social.js';
export const socialEscape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function relationshipFor(data,playerId,selfId){
 if(playerId===selfId)return{kind:'self'};
 for(const [list,kind]of[['friends','friend'],['incoming','incoming'],['outgoing','outgoing']]){const row=data?.[list]?.find(p=>p.id===playerId);if(row)return{kind,id:row.relationshipId};}
 return{kind:'none'};
}
export function friendAction(relation){
 return relation.kind==='friend'?{label:'Già amici',disabled:true}:relation.kind==='outgoing'?{label:'Richiesta inviata',disabled:true}:relation.kind==='incoming'?{label:'Accetta amicizia',action:'accept',id:relation.id}:{label:'Aggiungi amico',action:'request'};
}
export function lobbyPlayersHTML(players,{selfId,hostId,data,profileId,connected,busy=false}={}){
 return players.map(p=>{
  const social=cleanLobbyIdentity(p.social),mine=p.id===selfId,relation=relationshipFor(data,social?.playerId,profileId),action=friendAction(relation);
  const profileButton=social?`<button type="button" data-lobby-action="profile" data-peer-id="${socialEscape(p.id)}" ${busy?'disabled':''}>Vedi profilo</button>`:mine?'<button type="button" data-lobby-action="connect">Collega profilo</button>':'';
  const requestButton=social&&!mine&&relation.kind!=='self'?`<button type="button" class="lobby-add-friend" data-lobby-action="request" data-peer-id="${socialEscape(p.id)}" ${busy||action.disabled||connected&&!data?'disabled':''}>${action.label}</button>`:'';
  return`<div class="lan-player lobby-player ${p.isBot?'bot':''}"><div class="lobby-player-info"><b>${socialEscape(p.name)}${mine?' <em>TU</em>':''}</b><small>${p.isBot?'Pilota controllato dal gioco':social?'@'+socialEscape(social.username):'Profilo non collegato'}</small><span>${socialEscape(BIKES.find(b=>b.id===p.bikeId)?.name||'')}</span></div><div class="lobby-player-state"><span class="ready-chip ${p.ready?'is-ready':''}">${p.isBot?'BOT':p.ready?'Pronto':'Non pronto'}</span>${p.id===hostId?'<small>CREATORE LOBBY</small>':''}</div>${p.isBot?'':`<div class="lobby-social-actions">${profileButton}${requestButton}</div>`}</div>`;
 }).join('');
}
