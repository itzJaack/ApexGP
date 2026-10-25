import {createClient} from './vendor/supabase.js';
import {ONLINE_CONFIG} from './online-config.js';
import {SaveSync} from './save-sync.js';

export function mountAccounts({getSnapshot, applySnapshot, freshSnapshot, social, canSwitch, onOpen}) {
  const el = id => document.getElementById(id);
  const show = (id, on) => el(id).classList.toggle('hidden', !on);
  const client = createClient(ONLINE_CONFIG.url, ONLINE_CONFIG.publishableKey, {
    auth: {persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: 'apexgp.auth.v1'},
    global: {fetch: (url, options) => fetch(url, {...options, signal: options?.signal || AbortSignal.timeout(18000)})},
  });
  let activeId = null, guest = null, mode = 'login', busy = false, timer, switching = false, recoveryCode = '', deferredTimer;
  let status = 'Ospite · progressi salvati su questo dispositivo.';
  const sync = new SaveSync({client, storage: localStorage, onStatus: text => {
    status = text === 'CONFLICT' ? 'Un altro dispositivo ha un salvataggio più recente. Scegli quale usare.' : text;
    show('account-conflict', text === 'CONFLICT' || sync.conflict);
    render();
  }});
  function render() {
    el('account-status').textContent = status;
    el('account-nav').textContent = activeId ? 'PROFILO' : 'ACCEDI';
    el('account-name').textContent = activeId ? getSnapshot().career.name : 'La tua carriera. Ovunque.';
    show('account-guest', !activeId);
    show('account-signed', !!activeId);
    show('account-recovery-input-row', mode === 'reset');
    el('account-recovery-input').required = mode === 'reset';
    el('account-password').autocomplete = mode === 'login' ? 'current-password' : 'new-password';
    el('account-password-label').textContent = mode === 'reset' ? 'NUOVA PASSWORD' : 'PASSWORD';
    el('account-submit').textContent = mode === 'signup' ? 'CREA ACCOUNT' : mode === 'reset' ? 'REIMPOSTA PASSWORD' : 'ACCEDI';
    show('account-recovery-box',!!recoveryCode);
    el('account-recovery-value').value=recoveryCode;
    document.querySelectorAll('[data-auth-mode]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.authMode === mode)));
    el('account-submit').disabled = busy;
    el('account-signout').disabled = busy || switching;
    el('account-close').disabled = switching || !!activeId&&!sync.ready;
    const snapshot=getSnapshot();
    el('account-races').textContent=snapshot.career.stats.races;
    el('account-wins').textContent=snapshot.career.stats.wins;
    el('account-bikes').textContent=snapshot.career.owned.length;
  }
  function open() {
    onOpen();
    show('account-overlay', true);
    render();
    el(activeId ? 'account-close' : 'account-username').focus();
  }
  function close() { if(!switching&&(!activeId||sync.ready))show('account-overlay', false); }
  function change() {
    if (!activeId || !sync.ready) return;
    sync.change(getSnapshot());
    clearTimeout(timer);
    timer = setTimeout(() => sync.flush(), 900);
  }
  async function socialProfile(user) {
    const {data: {session}} = await client.auth.getSession();
    if (!session) return;
    const legacy = social.client.accountToken ? null : social.client.access?.session;
    const response = await fetch(ONLINE_CONFIG.url + '/functions/v1/apexgp-social', {
      method: 'POST', signal: AbortSignal.timeout(18000),
      headers: {'Content-Type': 'application/json', apikey: ONLINE_CONFIG.publishableKey, Authorization: 'Bearer ' + session.access_token},
      body: JSON.stringify({action: 'account_profile', legacySession: legacy, username: user.user_metadata?.username, displayName: getSnapshot().career.name}),
    });
    const data = await response.json();
    if (!response.ok) throw Error(data.error || 'Profilo amici non disponibile.');
    if(legacy&&data.profile.id===social.client.access?.profile?.id){social.client.access=null;try{localStorage.removeItem('apexgp.friends.access.v1');}catch{}}
    social.client.setAccount(async () => (await client.auth.getSession()).data.session?.access_token, data.profile);
    social.refresh().catch(() => {});
  }
  async function activate(session) {
    if (session?.user.id === activeId) return;
    if (switching) return;
    if(activeId&&!canSwitch()){
      status='La sessione è cambiata. Torna al menu e lascia la lobby per completare il cambio account.';
      clearTimeout(deferredTimer);deferredTimer=setTimeout(()=>activate(session).catch(()=>{}),1000);render();return;
    }
    switching = true;
    clearTimeout(timer);
    try {
      if (activeId) { await sync.flush(); sync.detach(); }
      if (!session) {
        activeId = null;
        social.client.setAccount(null);
        if (guest) applySnapshot(guest);
        guest = null;
        status = 'Sei uscito. I progressi del tuo account restano nel cloud.';
        return;
      }
      if (!guest) guest = structuredClone(getSnapshot());
      activeId = session.user.id;
      el('account-email-label').textContent = '@'+(session.user.user_metadata?.username||session.user.email.split('@')[0]);
      const fresh = freshSnapshot();
      fresh.career.name = session.user.user_metadata?.display_name || session.user.user_metadata?.username || 'PILOTA';
      const snapshot = await sync.load(activeId, fresh);
      if(!sync.ready){show('account-overlay',true);return;}
      if (snapshot) applySnapshot(snapshot);
      if(sync.ready&&!sync.revision&&!sync.pending&&!sync.conflict){sync.change(getSnapshot());await sync.flush();}
      try { await socialProfile(session.user); }
      catch (error) { status += ' Amici: ' + error.message; }
    } finally { switching = false; render(); }
  }
  async function run(operation) {
    if (busy) return;
    busy = true; render();
    try { await operation(); }
    catch (error) {
      const messages = {'Invalid login credentials': 'Nome utente o password non corretti.', 'Failed to fetch': 'Connessione assente. I progressi locali sono conservati.'};
      status = messages[error.message] || error.message;
    } finally { busy = false; render(); }
  }
  el('account-nav').addEventListener('click', open);
  el('account-close').addEventListener('click', close);
  el('account-overlay').addEventListener('keydown', event => { if (event.key === 'Escape') close(); });
  document.querySelectorAll('[data-auth-mode]').forEach(button => button.addEventListener('click', () => { mode = button.dataset.authMode; render(); }));
  el('account-form').addEventListener('submit', event => {
    event.preventDefault();
    run(async () => {
      if (!canSwitch()) throw Error('Torna al menu e lascia la lobby prima di cambiare account.');
      const username = el('account-username').value.trim().toLowerCase(), password = el('account-password').value;
      if (!/^[a-z0-9_]{3,20}$/.test(username)) throw Error('Usa 3–20 lettere, numeri o underscore per il nome utente.');
      if (mode === 'signup') {
        const data=await accountCall('register_account',{username,password});
        recoveryCode=data.recoveryCode;
        status='Account creato. Salva il tuo codice di recupero.';
      } else if (mode === 'reset') {
        await accountCall('reset_account',{username,password,recoveryCode:el('account-recovery-input').value});
        el('account-recovery-input').value='';
        status='Password aggiornata. Accesso in corso…';
      }
      const result=await client.auth.signInWithPassword({email:username+'@accounts.apexgp.invalid',password});
      el('account-password').value = '';
      if (result.error) throw result.error;
      if (result.data?.session) await activate(result.data.session);
    });
  });
  async function accountCall(action,body={}){
    const headers={'Content-Type':'application/json',apikey:ONLINE_CONFIG.publishableKey};
    if(action==='rotate_recovery'){const {data}=await client.auth.getSession();headers.Authorization='Bearer '+data.session?.access_token;}
    const response=await fetch(ONLINE_CONFIG.url+'/functions/v1/apexgp-social',{method:'POST',headers,body:JSON.stringify({action,...body}),signal:AbortSignal.timeout(18000)});
    const data=await response.json();if(!response.ok)throw Error(data.error||'Servizio account non disponibile.');return data;
  }
  el('account-rotate-code').addEventListener('click',()=>run(async()=>{const data=await accountCall('rotate_recovery');recoveryCode=data.recoveryCode;status='Nuovo codice creato: quello precedente non è più valido. Salvalo adesso.';}));
  el('account-download-code').addEventListener('click',()=>{
    const username=el('account-username').value||el('account-email-label').textContent.replace(/^@/,'');
    const text='ApexGP - accesso e recupero\nNome utente: '+username+'\nCodice di recupero: '+recoveryCode+'\n\nConserva questo file per te: il codice permette di reimpostare la password.\nhttps://itzjaack.github.io/ApexGP/\n';
    const url=URL.createObjectURL(new Blob([text],{type:'text/plain;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download='ApexGP-recupero-'+username+'.txt';a.click();setTimeout(()=>URL.revokeObjectURL(url),2000);
  });
  el('account-signout').addEventListener('click', () => run(async () => {
    if (!canSwitch()) throw Error('Torna al menu e lascia la lobby prima di uscire.');
    await sync.flush();
    const unsaved=!!sync.pending;
    const {error} = await client.auth.signOut({scope: 'local'});
    if (error) throw error;
    recoveryCode='';await activate(null);if(unsaved)status='Sei uscito. Le modifiche non inviate restano su questo dispositivo e ripartiranno al prossimo accesso.';
  }));
  el('account-retry').addEventListener('click', () => run(async () => {
    if (!sync.ready) {
      const {data} = await client.auth.getSession();
      activeId = null;
      await activate(data.session);
    } else {await sync.flush();if(activeId&&!social.client.accountToken){const {data}=await client.auth.getSession();if(data.session)await socialProfile(data.session.user);}}
  }));
  el('account-import-guest').addEventListener('click', () => run(async () => {
    if (!canSwitch()) throw Error('Torna al menu prima di importare i progressi.');
    if (!guest) return;
    // Keep the displaced save recoverable before the explicit replacement.
    localStorage.setItem('apexgp.account.backup.' + activeId, JSON.stringify(getSnapshot()));
    applySnapshot(guest);
    change();
    await sync.flush();
  }));
  for (const [id, local] of [['account-use-cloud', false], ['account-use-local', true]]) {
    el(id).addEventListener('click', () => run(async () => {
      if (!canSwitch()) throw Error('Torna al menu prima di risolvere il salvataggio.');
      const snapshot = await sync.resolve(local);
      if (snapshot) applySnapshot(snapshot);
      show('account-conflict', sync.conflict);
    }));
  }
  client.auth.onAuthStateChange((event, session) => {
    // Supabase auth callbacks must finish before invoking other async auth methods.
    setTimeout(() => {
      activate(session).catch(error => { status = error.message; render(); });
    }, 0);
  });
  window.addEventListener('online', () => sync.flush());
  document.addEventListener('visibilitychange', () => { if (document.hidden) sync.flush(); });
  // Refresh only in the menu, never replace an ongoing race's state.
  window.addEventListener('focus', () => { if (!switching && !sync.saving && !sync.pending && activeId && canSwitch()) run(async () => {
    const snapshot = await sync.load(activeId, getSnapshot());
    if (snapshot) applySnapshot(snapshot);
  }); });
  render();
  return {change, open, close, client, sync, isSwitching: () => switching, isOpen: () => !el('account-overlay').classList.contains('hidden'), get active() { return !!activeId; }};
}
