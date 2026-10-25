// Trusted social API. Device access keys are random 256-bit secrets; only hashes reach Postgres.
// All tables reject direct browser access. Never send the service key to the client.
export class SocialError extends Error {constructor(status,message){super(message);this.status=status;}}
export const socialUsername=value=>String(value||'').trim().replace(/^@/,'').toLowerCase();
const uuidPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const roomPattern=/^[A-HJ-NP-Z2-9]{12}$/;
const trackIds=new Set(['toscana','adriatica','dune','alpine','sakura','marina','azzurra','nordland','canyon','atlas']);
const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, apikey, content-type, x-apex-session, x-client-info','Access-Control-Allow-Methods':'POST, OPTIONS','Cache-Control':'no-store','Content-Type':'application/json; charset=utf-8'};
const pickProfile=p=>({id:p.id,username:p.username,displayName:p.display_name});
const id=value=>{if(!uuidPattern.test(String(value||'')))throw new SocialError(400,'Richiesta non valida.');return value;};
export function createSocialHandler({url,serviceKey,fetcher=fetch,now=Date.now,cryptoImpl=crypto}){
 const fail=(status,text)=>{throw new SocialError(status,text);},iso=()=>new Date(now()).toISOString(),hash=async text=>Array.from(new Uint8Array(await cryptoImpl.subtle.digest('SHA-256',new TextEncoder().encode(text))),v=>v.toString(16).padStart(2,'0')).join('');
 const randomToken=()=>Array.from(cryptoImpl.getRandomValues(new Uint8Array(32)),v=>v.toString(16).padStart(2,'0')).join('');
 async function db(table,params={},method='GET',body=null,prefer='return=representation'){
  const endpoint=new URL('/rest/v1/'+table,url);for(const[k,v]of Object.entries(params))endpoint.searchParams.set(k,String(v));
  const r=await fetcher(endpoint,{method,headers:{apikey:serviceKey,Authorization:'Bearer '+serviceKey,'Content-Type':'application/json',Prefer:prefer},body:body===null?undefined:JSON.stringify(body),signal:AbortSignal.timeout(12000)});const text=await r.text();let data;try{data=text?JSON.parse(text):null;}catch{data=null;}
  if(!r.ok){if(data?.code==='23505')fail(409,'Nome già usato oppure richiesta già presente.');console.error('social database error',r.status,data?.code||'');fail(503,'Servizio amici temporaneamente non disponibile. Riprova.');}return data;
 }
 async function limit(bucket,period,maximum){const ok=await db('rpc/apex_social_allow',{},'POST',{p_bucket:bucket,p_window:new Date(Math.floor(now()/period)*period).toISOString(),p_limit:maximum});if(ok!==true)fail(429,'Troppe richieste. Attendi un minuto e riprova.');}
 async function authUser(req){
  const token=(req.headers.get('authorization')||'').replace(/^Bearer /i,'');
  if(!token||token.length>8192)fail(401,'Accedi al tuo account.');
  const response=await fetcher(url+'/auth/v1/user',{headers:{apikey:serviceKey,Authorization:'Bearer '+token},signal:AbortSignal.timeout(12000)});
  if(!response.ok)fail(401,'Sessione scaduta. Accedi nuovamente.');
  const user=await response.json();
  if(!uuidPattern.test(user.id)||user.is_anonymous)fail(401,'Accedi con email e password.');
  return user;
 }
 async function auth(req){
  const session=(req.headers.get('authorization')||'').replace(/^Bearer /i,'')||req.headers.get('x-apex-session')||'';
  let params;
  if(session.split('.').length===3){const user=await authUser(req);params={auth_user_id:'eq.'+user.id};}
  else {const match=session.match(/^([0-9a-f-]{36})\.([0-9a-f]{64})$/);if(!match||!uuidPattern.test(match[1]))fail(401,'Ripristina l’accesso al tuo profilo.');params={id:'eq.'+match[1],token_hash:'eq.'+await hash(match[2]),auth_user_id:'is.null'};}
  const rows=await db('apex_players',{select:'id,username,display_name,last_seen,activity,lobby_code,track_id',...params,limit:1});
  if(!rows?.length)fail(401,'Accedi al tuo account o importa il file del vecchio profilo.');return rows[0];
 }
 async function accountProfile(req,body){
  const user=await authUser(req);
  await limit('account:'+user.id,60000,30);
  let rows=await db('apex_players',{auth_user_id:'eq.'+user.id,limit:1});
  if(rows.length)return{profile:pickProfile(rows[0])};
  const legacy=String(body.legacySession||'').match(/^([0-9a-f-]{36})\.([0-9a-f]{64})$/);
  if(legacy&&uuidPattern.test(legacy[1])){
   rows=await db('apex_players',{id:'eq.'+legacy[1],token_hash:'eq.'+await hash(legacy[2]),auth_user_id:'is.null',limit:1});
   if(rows.length){rows=await db('apex_players',{id:'eq.'+rows[0].id,auth_user_id:'is.null'},'PATCH',{auth_user_id:user.id,token_hash:await hash(randomToken())});if(rows.length)return{profile:pickProfile(rows[0])};}
  }
  let username=socialUsername(body.username);
  if(!/^[a-z0-9_]{3,20}$/.test(username))username='pilota_'+user.id.slice(0,8);
  if((await db('apex_players',{select:'id',username:'eq.'+username,limit:1})).length)username=username.slice(0,10)+'_'+user.id.slice(0,8);
  rows=await db('apex_players',{},'POST',{auth_user_id:user.id,username,display_name:String(body.displayName||username).replace(/[\u0000-\u001f<>]/g,'').slice(0,20)||username,token_hash:await hash(randomToken())});
  return{profile:pickProfile(rows[0])};
 }
 async function accountAction(req,body){
  const username=socialUsername(body.username),password=String(body.password||'');
  const ip=req.headers.get('x-forwarded-for')?.split(',')[0]||req.headers.get('x-real-ip')||'shared';
  if(body.action==='rotate_recovery'){
   const user=await authUser(req);await limit('recovery-rotate:'+user.id,60000,5);
   const rows=await db('apex_account_recovery',{user_id:'eq.'+user.id,select:'username',limit:1});
   if(!rows.length)fail(404,'Account non disponibile.');const code=randomToken();
   await db('apex_account_recovery',{user_id:'eq.'+user.id},'PATCH',{token_hash:await hash(code)});
   return{username:rows[0].username,recoveryCode:code};
  }
  if(!/^[a-z0-9_]{3,20}$/.test(username))fail(400,'Usa 3–20 lettere, numeri o underscore.');
  if(password.length<8||password.length>128)fail(400,'La password deve contenere da 8 a 128 caratteri.');
  const registering=body.action==='register_account';
  await limit((registering?'account-create:':'account-reset:')+await hash(ip+serviceKey),3600000,registering?12:12);
  await limit('account-name:'+username,3600000,12);
  const rows=await db('apex_account_recovery',{username:'eq.'+username,limit:1});
  if(registering){
   if(rows.length)fail(409,'Nome utente già registrato. Accedi oppure scegli un altro nome.');
   const response=await fetcher(url+'/auth/v1/admin/users',{method:'POST',headers:{apikey:serviceKey,Authorization:'Bearer '+serviceKey,'Content-Type':'application/json'},body:JSON.stringify({email:username+'@accounts.apexgp.invalid',password,email_confirm:true,user_metadata:{username,display_name:username}}),signal:AbortSignal.timeout(12000)});
   const user=await response.json();if(!response.ok||!user.id)fail(409,'Registrazione non riuscita. Il nome potrebbe essere già usato.');
   const code=randomToken();await db('apex_account_recovery',{},'POST',{user_id:user.id,username,token_hash:await hash(code)});
   return{username,recoveryCode:code};
  }
  const code=String(body.recoveryCode||'').replace(/[\s-]/g,'').toLowerCase();
  if(!/^[0-9a-f]{64}$/.test(code)||!rows.length||await hash(code)!==rows[0].token_hash)fail(403,'Nome utente o codice di recupero non valido.');
  const response=await fetcher(url+'/auth/v1/admin/users/'+rows[0].user_id,{method:'PUT',headers:{apikey:serviceKey,Authorization:'Bearer '+serviceKey,'Content-Type':'application/json'},body:JSON.stringify({password}),signal:AbortSignal.timeout(12000)});
  if(!response.ok)fail(503,'Recupero non riuscito. Riprova ad accedere prima di ripetere il recupero.');
  // A recovery key stays valid until the signed-in owner explicitly regenerates it.
  return{username};
 }
 const relation=(a,b)=>({or:`(and(requester_id.eq.${a},addressee_id.eq.${b}),and(requester_id.eq.${b},addressee_id.eq.${a}))`});
 async function friends(a,b){const rows=await db('apex_friendships',{select:'id',...relation(a,b),status:'eq.accepted',limit:1});return rows.length>0;}
 async function sync(p,presence){
  if(presence&&typeof presence==='object'){const activity=['available','lobby','race','away'].includes(presence.activity)?presence.activity:'available',room=['lobby','race'].includes(activity)&&roomPattern.test(presence.lobbyCode||'')?presence.lobbyCode:null,track=room&&trackIds.has(presence.trackId)?presence.trackId:null;if(now()-Date.parse(p.last_seen)>30000||p.activity!==activity||p.lobby_code!==room||p.track_id!==track)await db('apex_players',{id:'eq.'+p.id},'PATCH',{last_seen:iso(),activity,lobby_code:room,track_id:track});}
  const[edges,invites]=await Promise.all([db('apex_friendships',{select:'id,requester_id,addressee_id,status,created_at',or:`(requester_id.eq.${p.id},addressee_id.eq.${p.id})`,order:'created_at.desc',limit:256}),db('apex_invites',{select:'id,sender_id,track_id,expires_at',recipient_id:'eq.'+p.id,expires_at:'gt.'+iso(),order:'created_at.desc',limit:100})]);
  const ids=[...new Set([...edges.flatMap(e=>[e.requester_id,e.addressee_id]),...invites.map(i=>i.sender_id)].filter(i=>i!==p.id))];const profiles=ids.length?await db('apex_players',{select:'id,username,display_name,last_seen,activity',id:'in.('+ids.join(',')+')',limit:384}):[];const map=new Map(profiles.map(q=>[q.id,q])),accepted=[],incoming=[],outgoing=[];
  for(const edge of edges){const q=map.get(edge.requester_id===p.id?edge.addressee_id:edge.requester_id);if(!q)continue;const view={...pickProfile(q),relationshipId:edge.id};if(edge.status==='accepted')accepted.push({...view,online:q.activity!=='away'&&now()-Date.parse(q.last_seen)<95000,activity:q.activity});else(edge.addressee_id===p.id?incoming:outgoing).push(view);}
  accepted.sort((a,b)=>Number(b.online)-Number(a.online)||a.username.localeCompare(b.username));const friendIds=new Set(accepted.map(q=>q.id));return{profile:pickProfile(p),friends:accepted,incoming,outgoing,invites:invites.filter(i=>friendIds.has(i.sender_id)&&map.has(i.sender_id)).map(i=>({id:i.id,from:pickProfile(map.get(i.sender_id)),trackId:i.track_id,expiresAt:i.expires_at})),serverTime:iso()};
 }
 return async req=>{
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers:cors});
  try{
   if(req.method!=='POST')fail(405,'Usa una richiesta POST.');if(!url||!serviceKey)fail(503,'Servizio amici non configurato.');if(Number(req.headers.get('content-length')||0)>4096)fail(413,'Richiesta troppo grande.');const text=await req.text();if(text.length>4096)fail(413,'Richiesta troppo grande.');let body;try{body=JSON.parse(text);}catch{fail(400,'Richiesta non valida.');}if(!body||typeof body!=='object'||Array.isArray(body))fail(400,'Richiesta non valida.');const action=body.action;let result;
   if(['register_account','reset_account','rotate_recovery'].includes(action))result=await accountAction(req,body);
   else if(action==='account_profile')result=await accountProfile(req,body);
   else if(action==='register'){
    const username=socialUsername(body.username),displayName=String(body.displayName||username).trim().replace(/[\u0000-\u001f<>]/g,'').slice(0,20)||username;if(!/^[a-z0-9_]{3,20}$/.test(username))fail(400,'Usa 3–20 lettere, numeri o trattini bassi per il nome univoco.');const ip=req.headers.get('x-forwarded-for')?.split(',')[0]||req.headers.get('x-real-ip')||'shared';await limit('register:'+await hash(ip+serviceKey),3600000,20);const secret=randomToken(),rows=await db('apex_players',{},'POST',{username,display_name:displayName,token_hash:await hash(secret)});result={session:rows[0].id+'.'+secret,profile:pickProfile(rows[0])};
   }else{
    const p=await auth(req);await limit('user:'+p.id,60000,90);
    if(action==='sync')result=await sync(p,body.presence);
    else if(action==='request'){
     const name=socialUsername(body.username);if(!/^[a-z0-9_]{3,20}$/.test(name))fail(400,'Inserisci il nome univoco del tuo amico.');const rows=await db('apex_players',{select:'id',username:'eq.'+name,limit:1});if(!rows.length)fail(404,'Nessun pilota con questo nome.');const target=rows[0].id;if(target===p.id)fail(400,'Questo è il tuo profilo.');const existing=await db('apex_friendships',{select:'id,status,requester_id',...relation(p.id,target),limit:1});if(existing.length){const e=existing[0];if(e.status==='accepted')fail(409,'Siete già amici.');if(e.requester_id===p.id)fail(409,'Richiesta già inviata.');await db('apex_friendships',{id:'eq.'+e.id,status:'eq.pending',addressee_id:'eq.'+p.id},'PATCH',{status:'accepted'});result={message:'Ora siete amici.'};}else{const pending=await db('apex_friendships',{select:'id',requester_id:'eq.'+p.id,status:'eq.pending',limit:30});if(pending.length>=30)fail(429,'Hai già 30 richieste in attesa.');await db('apex_friendships',{},'POST',{requester_id:p.id,addressee_id:target});result={message:'Richiesta inviata a @'+name+'.'};}
    }else if(action==='respond'){
     const edgeId=id(body.id),rows=await db('apex_friendships',{select:'id',id:'eq.'+edgeId,addressee_id:'eq.'+p.id,status:'eq.pending',limit:1});if(!rows.length)fail(404,'Richiesta non più disponibile.');if(body.accept===true)await db('apex_friendships',{id:'eq.'+edgeId,addressee_id:'eq.'+p.id,status:'eq.pending'},'PATCH',{status:'accepted'});else await db('apex_friendships',{id:'eq.'+edgeId,addressee_id:'eq.'+p.id,status:'eq.pending'},'DELETE');result={message:body.accept?'Amicizia accettata.':'Richiesta rifiutata.'};
    }else if(action==='remove'){
     const other=id(body.playerId);await db('apex_friendships',relation(p.id,other),'DELETE');await db('apex_invites',{or:`(and(sender_id.eq.${p.id},recipient_id.eq.${other}),and(sender_id.eq.${other},recipient_id.eq.${p.id}))`},'DELETE');result={message:'Amicizia o richiesta rimossa.'};
    }else if(action==='invite'){
     const other=id(body.playerId),room=String(body.roomCode||'');if(!roomPattern.test(room)||!trackIds.has(body.trackId))fail(400,'Crea prima una lobby online.');if(!await friends(p.id,other))fail(403,'Puoi invitare soltanto i tuoi amici.');const prior=await db('apex_invites',{select:'created_at',sender_id:'eq.'+p.id,recipient_id:'eq.'+other,limit:1});if(prior.length&&now()-Date.parse(prior[0].created_at)<10000)fail(429,'Invito già inviato. Attendi qualche secondo.');await db('apex_invites',{on_conflict:'sender_id,recipient_id'},'POST',{sender_id:p.id,recipient_id:other,room_code:room,track_id:body.trackId,created_at:iso(),expires_at:new Date(now()+360000).toISOString()},'resolution=merge-duplicates,return=minimal');result={message:'Invito inviato. Il tuo amico potrà entrare con un clic.'};
    }else if(action==='accept_invite'){
     const inviteId=id(body.id),rows=await db('apex_invites',{select:'sender_id,room_code',id:'eq.'+inviteId,recipient_id:'eq.'+p.id,expires_at:'gt.'+iso(),limit:1});if(!rows.length)fail(404,'Invito scaduto o non più disponibile.');if(!await friends(p.id,rows[0].sender_id))fail(403,'Questa amicizia non è più attiva.');result={roomCode:rows[0].room_code};
    }else if(action==='dismiss_invite'){
     await db('apex_invites',{id:'eq.'+id(body.id),recipient_id:'eq.'+p.id},'DELETE');result={message:'Invito chiuso.'};
    }else if(action==='offline'){
     await db('apex_players',{id:'eq.'+p.id},'PATCH',{activity:'away',lobby_code:null,track_id:null,last_seen:iso()});result={ok:true};
    }else fail(400,'Azione non riconosciuta.');
   }
   // Bounded maintenance, no content or access keys are ever logged.
   if(cryptoImpl.getRandomValues(new Uint8Array(1))[0]===0)await Promise.allSettled([db('apex_invites',{expires_at:'lt.'+new Date(now()-86400000).toISOString()},'DELETE'),db('apex_social_limits',{window_start:'lt.'+new Date(now()-172800000).toISOString()},'DELETE')]);
   return Response.json(result,{headers:cors});
  }catch(error){if(!(error instanceof SocialError))console.error('social request failed',error?.name||'Error');return Response.json({error:error instanceof SocialError?error.message:'Connessione al servizio amici non riuscita. Riprova.'},{status:error instanceof SocialError?error.status:503,headers:cors});}
 };
}
