import test from 'node:test';
import assert from 'node:assert/strict';
import {SaveSync} from '../dist/save-sync.js';

function setup() {
  const rows = new Map(), values = new Map();
  const storage = {getItem: key => values.get(key), setItem: (key, value) => values.set(key, value)};
  let offline = false, writes = 0;
  const client = {from() {
    let operation = 'read', body, filters = {};
    const chain = {
      select: () => chain, eq(key, value) { filters[key] = value; return chain; },
      update(value) { operation = 'update'; body = value; return chain; },
      insert(value) { operation = 'insert'; body = value; return chain; },
      maybeSingle: () => execute(), then: (resolve, reject) => execute().then(resolve, reject),
    };
    async function execute() {
      if (offline) return {error: {message: 'offline'}};
      const id = filters.user_id || body?.user_id, old = rows.get(id);
      if (operation === 'read') return {data: structuredClone(old || null)};
      writes++;
      if (operation === 'insert' && old) return {error: {code: '23505'}};
      if (operation === 'update' && old?.revision !== filters.revision) return {data: []};
      const next = {...old, ...structuredClone(body)};
      rows.set(id, next);
      return {data: [{revision: next.revision}]};
    }
    return chain;
  }};
  return {client, storage, rows, values, offline: value => offline = value, writes: () => writes};
}
test('cloud progress survives a second device and remains isolated from other accounts', async () => {
  const env = setup(), first = new SaveSync(env), second = new SaveSync(env);
  await first.load('alice', {credits: 12000}); first.change({credits: 9000, bike: 'r27'}); await first.flush();
  assert.deepEqual(await second.load('alice', {}), {credits: 9000, bike: 'r27'});
  assert.deepEqual(await second.load('bob', {credits: 12000}), {credits: 12000});
  second.change({credits: 11000}); await second.flush();
  assert.equal(env.rows.get('alice').payload.credits, 9000);
  assert.equal(env.rows.get('bob').payload.credits, 11000);
});
test('stale concurrent device cannot overwrite a newer save, explicit cloud resolution keeps it', async () => {
  const env = setup(), first = new SaveSync(env), second = new SaveSync(env);
  await first.load('alice', {}); first.change({credits: 12000}); await first.flush();
  await second.load('alice', {});
  first.change({credits: 5000}); await first.flush();
  second.change({credits: 10000}); assert.equal(await second.flush(), false);
  assert(second.conflict); assert.equal(env.rows.get('alice').payload.credits, 5000);
  const restored=new SaveSync(env);assert.deepEqual(await restored.load('alice',{}),{credits:10000});assert(restored.conflict);
  assert.deepEqual(await second.resolve(false), {credits: 5000});
  assert.equal(second.pending, null);
});
test('offline pending changes remain scoped to the account after reload and reconnect', async () => {
  const env = setup(), first = new SaveSync(env);
  await first.load('alice', {}); first.change({credits: 100}); await first.flush();
  env.offline(true); first.change({credits: 50}); await first.flush(); first.detach();
  const restored = new SaveSync(env);
  assert.deepEqual(await restored.load('alice', {}), {credits: 50});
  assert.deepEqual(await restored.load('bob', {credits: 12000}), {credits: 12000});
  assert(!restored.ready); assert.equal(await restored.flush(), false);
  await restored.load('alice', {}); env.offline(false); await restored.flush();
  assert.equal(env.rows.get('alice').payload.credits, 50);
});
test('account change discards late read responses and never writes them into the new account cache', async () => {
  const env = setup(); let release;
  const client = {from: () => ({select() {return this;}, eq() {return this;}, maybeSingle: () => new Promise(resolve => release = resolve)})};
  const sync = new SaveSync({...env, client});
  const loading = sync.load('alice', {}); sync.detach();
  release({data: {revision: 3, payload: {credits: 7}}});
  assert.equal(await loading, null); assert.equal(env.values.size, 0);
});
