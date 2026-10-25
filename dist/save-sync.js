// Account-specific caches also retain unsent changes after a network interruption.
// The server's revision is a compare-and-swap guard against concurrent devices.
export class SaveSync {
  constructor({client, storage, onStatus = () => {}}) {
    this.client = client;
    this.storage = storage;
    this.onStatus = onStatus;
    this.userId = null;
    this.generation = 0;
    this.revision = 0;
    this.pending = null;
    this.saving = null;
    this.conflict = false;
    this.ready = false;
  }

  key() { return 'apexgp.account.save.v1.' + this.userId; }
  cache(payload, pending) {
    try { this.storage?.setItem(this.key(), JSON.stringify({revision: this.revision, payload, pending})); }
    catch { this.onStatus('Spazio locale esaurito. Mantieni la pagina aperta fino al salvataggio online.'); }
  }
  async load(userId, initial) {
    this.detach();
    this.userId = userId;
    const generation = this.generation;
    let cached;
    try { cached = JSON.parse(this.storage?.getItem(this.key()) || 'null'); } catch {}
    const {data, error} = await this.client.from('apex_saves').select('*').eq('user_id', userId).maybeSingle();
    if (generation !== this.generation) return null;
    if (error) {
      this.revision = cached?.revision || 0;
      this.pending = cached?.pending ? cached.payload : null;
      this.ready = true;
      this.onStatus(cached ? 'Offline · progressi conservati su questo dispositivo.' : 'Cloud non raggiungibile. Puoi riprovare dal profilo.');
      // Do not create a new save while an existing account cannot be read.
      this.ready = !!cached;
      return cached?.payload || initial;
    }
    this.revision = data?.revision || 0;
    this.ready = true;
    if (cached?.pending) {
      this.pending = cached.payload;
      this.conflict = cached.revision !== this.revision;
      this.onStatus(this.conflict ? 'CONFLICT' : 'Modifiche locali in attesa di sincronizzazione.');
      return cached.payload;
    }
    const payload = data?.payload || initial;
    this.cache(payload, false);
    this.onStatus(data ? 'Progressi sincronizzati.' : 'Account pronto · salvataggio automatico attivo.');
    return payload;
  }
  change(payload) {
    if (!this.userId || !this.ready) return;
    this.pending = structuredClone(payload);
    this.cache(this.pending, true);
    if (!this.conflict) this.onStatus('Salvataggio in attesa…');
  }
  async flush() {
    if (this.saving) return this.saving;
    if (!this.pending || !this.ready || this.conflict) return false;
    const generation = this.generation, userId = this.userId;
    const work = async () => {
      while (this.pending && !this.conflict && generation === this.generation) {
        const payload = this.pending, revision = this.revision;
        this.onStatus('Sincronizzazione…');
        const table = this.client.from('apex_saves');
        const query = revision
          ? table.update({payload, revision: revision + 1}).eq('user_id', userId).eq('revision', revision).select('revision')
          : table.insert({user_id: userId, payload, revision: 1}).select('revision');
        const {data, error} = await query;
        if (generation !== this.generation) return false;
        if (error?.code === '23505' || !error && !data?.length) {
          this.conflict = true;
          this.cache(this.pending, true);
          this.onStatus('CONFLICT');
          return false;
        }
        if (error) {
          this.onStatus('Offline o salvataggio non disponibile · modifiche conservate. Premi Riprova.');
          return false;
        }
        this.revision = data[0].revision;
        if (this.pending === payload) this.pending = null;
        this.cache(this.pending || payload, !!this.pending);
      }
      this.onStatus('Progressi sincronizzati.');
      return true;
    };
    const task = work();
    this.saving = task;
    try { return await task; } finally { if (this.saving === task) this.saving = null; }
  }
  async resolve(useLocal) {
    const generation = this.generation;
    const {data, error} = await this.client.from('apex_saves').select('*').eq('user_id', this.userId).maybeSingle();
    if (generation !== this.generation) return null;
    if (error) throw error;
    this.revision = data?.revision || 0;
    this.conflict = false;
    if (useLocal) { await this.flush(); return null; }
    this.pending = null;
    this.cache(data.payload, false);
    this.onStatus('Progressi caricati dal cloud.');
    return data.payload;
  }
  detach() {
    this.generation++;
    this.userId = null;
    this.ready = false;
    this.pending = null;
    this.revision = 0;
    this.saving = null;
    this.conflict = false;
  }
}

