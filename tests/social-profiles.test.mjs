import test from 'node:test';
import assert from 'node:assert/strict';
import {createSocialHandler} from '../supabase/functions/apexgp-social/social.mjs';
import {SocialClient,cleanLobbyIdentity} from '../dist/social.js';
import {lobbyPlayersHTML} from '../dist/social-view.js';
const ids=['11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222'],edgeId='33333333-3333-4333-8333-333333333333';
const config={url:'https://socialtest.supabase.co',publishableKey:'sb_publishable_abcdefghijklmnopqrstuv'};
function fixture(){
 let time=1793000000000;const calls=[],edges=[];
 const players=ids.map((id,i)=>({id,username:i?'peer':'jack',display_name:i?'Pilota amico':'Jack',created_at:new Date(time-86400000).toISOString(),last_seen:new Date(time).toISOString(),activity:'lobby',auth_user_id:'account-'+i,token_hash:'private-hash',email:'private-email'}));
 const fetcher=async(input,options={})=>{
  const url=new URL(input),table=url.pathname.split('/').at(-1),method=options.method||'GET';calls.push({table,method,select:url.searchParams.get('select')});
  if(table==='apex_social_allow')return Response.json(true);
  if(table==='apex_players'){
   let rows=players;
   for(const column of['id','username']){const value=url.searchParams.get(column);if(value?.startsWith('eq.'))rows=rows.filter(p=>p[column]===value.slice(3));if(value?.startsWith('in.'))rows=rows.filter(p=>value.includes(p[column]));}
   return Response.json(rows);
  }
  if(table==='apex_saves')return Response.json([{stats:{races:12,wins:4,earned:900000},owned:['r27','v4','v4'],payload:'private-save',recoveryCode:'private-recovery',credits:900000}]);
  if(table==='apex_invites')return Response.json([]);
  if(table==='apex_friendships'){
   if(method==='POST'){const body=JSON.parse(options.body);edges.push({...body,id:edgeId,status:'pending',created_at:new Date(time).toISOString()});return Response.json([edges.at(-1)]);}
   let rows=edges;
   for(const column of['id','status','requester_id','addressee_id']){const value=url.searchParams.get(column);if(value?.startsWith('eq.'))rows=rows.filter(p=>p[column]===value.slice(3));}
   if(method==='PATCH'){for(const row of rows)Object.assign(row,JSON.parse(options.body));}
   return Response.json(rows);
  }
  throw Error('Unexpected table '+table);
 };
 const handler=createSocialHandler({url:config.url,serviceKey:'test-private-service-key',fetcher,now:()=>time,cryptoImpl:{subtle:crypto.subtle,getRandomValues:a=>{a.fill(1);return a;}}});
 const call=async(body,player=0)=>{
  const response=await handler(new Request('https://example.test/social',{method:'POST',headers:{Authorization:'Bearer '+ids[player]+'.'+'a'.repeat(64)},body:JSON.stringify(body)}));
  return{status:response.status,data:await response.json()};
 };
 return{call,calls,edges,players,advance:ms=>time+=ms};
}

test('profiles return only public game counters and relationship status',async()=>{
 const f=fixture(),result=await f.call({action:'profile',username:'@PEER'});
 assert.equal(result.status,200);assert.equal(result.data.profile.username,'peer');
 assert.deepEqual(result.data.profile.stats,{races:12,wins:4,bikes:2});assert.equal(result.data.relationship,'none');
 const serialized=JSON.stringify(result.data);for(const secret of['private','auth_user_id','token_hash','credits','earned','recovery','payload','email'])assert(!serialized.includes(secret),secret);
 assert.equal(f.calls.find(c=>c.table==='apex_saves').select,'stats:payload->career->stats,owned:payload->career->owned');
 assert.equal((await f.call({action:'profile',username:'<script>'})).status,400);
 assert.equal((await f.call({action:'profile',playerId:'not-a-uuid'})).status,400);
});

test('lobby identity binds a real profile to its peer, username, room and expiration',async()=>{
 const f=fixture(),roomCode='ABCDEFGHJKLM',peerId='aabbccdd';
 const issued=await f.call({action:'lobby_identity',roomCode,peerId},1);assert.equal(issued.status,200);const identity=issued.data;assert(cleanLobbyIdentity(identity));
 const target={action:'profile',playerId:ids[1],lobby:{roomCode,peerId,identity}};
 assert.equal((await f.call(target)).status,200);
 assert.equal((await f.call({...target,lobby:{...target.lobby,peerId:'11223344'}})).status,403);
 assert.equal((await f.call({...target,lobby:{...target.lobby,roomCode:'MMMMMMMMMMMM'}})).status,403);
 assert.equal((await f.call({...target,lobby:{...target.lobby,identity:{...identity,username:'forged'}}})).status,403);
 f.advance(12*3600000+1);assert.equal((await f.call(target)).status,403);
 assert(!cleanLobbyIdentity({...identity,playerId:'x',proof:'x'}));
});

test('friend request by verified profile ID appears in both lists and can be accepted',async()=>{
 const f=fixture();const request=await f.call({action:'request',playerId:ids[1]});assert.equal(request.status,200);assert.match(request.data.message,/@peer/);
 const first=(await f.call({action:'sync'})).data,second=(await f.call({action:'sync'},1)).data;
 assert.equal(first.outgoing[0].id,ids[1]);assert.equal(second.incoming[0].id,ids[0]);
 assert.equal((await f.call({action:'respond',id:edgeId,accept:true},1)).status,200);
 assert.equal((await f.call({action:'profile',playerId:ids[1]})).data.relationship,'friend');
 assert.equal((await f.call({action:'request',playerId:ids[1]})).status,409);
 assert.equal((await f.call({action:'request',playerId:ids[0]})).status,400);
});

test('mutation waits for the previous sync and fetches fresh relationships afterwards',async()=>{
 const profile={id:ids[0],username:'jack'},state={profile,friends:[],incoming:[],outgoing:[],invites:[]};let releaseOld,requestSent,syncs=0;
 const sent=new Promise(resolve=>requestSent=resolve);
 const client=new SocialClient(config,{storage:{getItem:()=>JSON.stringify({version:1,project:config.url,session:ids[0]+'.'+'a'.repeat(64),profile})},fetcher:async(url,opts)=>{
  const body=JSON.parse(opts.body);
  if(body.action==='sync'){syncs++;if(syncs===1)return new Promise(resolve=>releaseOld=()=>resolve(Response.json(state)));return Response.json({...state,outgoing:[{id:ids[1],username:'peer'}]});}
  requestSent();return Response.json({message:'Richiesta inviata.'});
 }});
 const pending=client.refresh(),mutation=client.requestId(ids[1]);await sent;releaseOld();await Promise.all([pending,mutation]);
 assert.equal(syncs,2);assert.equal(client.data.outgoing[0].username,'peer');
});

test('lobby markup makes humans, bots and request states clear and escapes names',()=>{
 const identity={playerId:ids[1],username:'peer',proof:ids[1]+'.1793043200000.'+'a'.repeat(64)};
 const players=[{id:'aabbccdd',name:'<img onerror=evil>',bikeId:'r27',social:identity},{id:'bot1',name:'BOT',bikeId:'v4',isBot:true}];
 let html=lobbyPlayersHTML(players,{selfId:'other',hostId:'other',data:{friends:[],incoming:[],outgoing:[]},profileId:ids[0],connected:true});
 assert(!html.includes('<img'));assert(html.includes('&lt;img'));assert(html.includes('Vedi profilo'));assert(html.includes('Aggiungi amico'));
 assert(!html.split('Pilota controllato dal gioco')[1].includes('data-lobby-action'));
 html=lobbyPlayersHTML(players,{profileId:ids[0],connected:true,data:{outgoing:[{id:ids[1]}]}});assert(html.includes('disabled>Richiesta inviata'));
 html=lobbyPlayersHTML(players,{profileId:ids[0],connected:true,data:{incoming:[{id:ids[1],relationshipId:edgeId}]}});assert(html.includes('Accetta amicizia'));
});
