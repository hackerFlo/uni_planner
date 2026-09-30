import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { PreferencesSync } from './preferencesSync.js';
import { DEFAULT_PREFERENCES, PREFS_KEY, loadPreferenceProfile } from './preferences.js';

const id = 'ca550c52-a935-478d-99f1-d9e90772b9f8';
const version = { epoch: 'a'.repeat(32), revision: 1 };
const store = () => { const map = new Map(); return { getItem: key => map.get(key) ?? null, setItem: (key, value) => map.set(key, value) }; };
const reply = settings => ({ profile: { id, settings: { ...DEFAULT_PREFERENCES, ...settings } }, version });
function fixture(accountId, api, storage = store()) {
  const states = []; const errors = [];
  const sync = new PreferencesSync({ accountId, api, storage, uuid: () => id,
    onState: state => states.push(state), onError: error => errors.push(error) });
  return { sync, states, errors, storage };
}

describe('device preference synchronization', () => {
  it('migrates local values only on initial creation and then loads remote edits on repeated login', async () => {
    const storage = store(); storage.setItem(PREFS_KEY, JSON.stringify({ theme: 'dark' }));
    let remote = null; let creates = 0;
    const api = { get: async path => {
      if (path.endsWith('/version')) return { version };
      if (!remote) throw Object.assign(new Error('Missing'), { status: 404 });
      return remote;
    }, post: async (_path, body) => { creates++; remote = reply(body.settings); return remote; } };
    const first = fixture(1001, api, storage); await first.sync.load(); first.sync.close();
    remote = reply({ theme: 'light' });
    const second = fixture(1001, api, storage); await second.sync.load();
    assert.equal(creates, 1);
    assert.equal(second.states.at(-1).preferences.theme, 'light');
    assert.equal(JSON.parse(storage.getItem(PREFS_KEY)).theme, 'dark');
  });

  it('keeps cached profile namespaces isolated between accounts', async () => {
    const storage = store();
    const first = fixture(1002, { get: async () => reply({ theme: 'dark' }) }, storage);
    const second = fixture(1003, { get: async () => reply({ theme: 'light' }) }, storage);
    await first.sync.load(); await second.sync.load();
    assert.equal(loadPreferenceProfile(1002, storage).settings.theme, 'dark');
    assert.equal(loadPreferenceProfile(1003, storage).settings.theme, 'light');
    assert.equal(storage.getItem(PREFS_KEY), null);
  });

  it('syncs the selected robot agent activity icon through the account profile', async () => {
    let remote = reply({ agentActivityIcon: 'fuzzy' });
    let savedBody;
    const f = fixture(1010, { get: async () => remote,
      patch: async (_path, body) => { savedBody = body; remote = reply(body); return remote; } });
    await f.sync.load();
    await f.sync.update({ agentActivityIcon: 'robot' });
    assert.deepEqual(savedBody, { agentActivityIcon: 'robot' });
    assert.equal(f.states.at(-1).preferences.agentActivityIcon, 'robot');
  });

  it('does not apply a late account response after logout', async () => {
    let resolve;
    const f = fixture(1004, { get: () => new Promise(done => { resolve = done; }) });
    const pending = f.sync.load(); const count = f.states.length;
    f.sync.close(); resolve(reply({ theme: 'dark' })); await pending;
    assert.equal(f.states.length, count);
  });

  it('does not overwrite server edits or retry a mutation with a newer version after conflict', async () => {
    const calls = []; let remote = reply({ theme: 'light' });
    const f = fixture(1005, { get: async () => remote,
      patch: async (_path, _body, options) => {
        calls.push(options); remote = reply({ theme: 'dark' });
        throw Object.assign(new Error('Conflict'), { status: 409 });
      } });
    await f.sync.load(); assert.equal(await f.sync.update({ theme: 'system' }), false);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].headers['X-Planner-Revision'], '1');
    assert.equal(f.states.at(-1).preferences.theme, 'dark');
    assert.equal(f.errors.length, 1);
  });

  it('keeps the same in-memory profile when local cache writes fail', async () => {
    const storage = { getItem: () => null, setItem: () => { throw new Error('quota'); } };
    const f = fixture(1006, { get: async () => reply({ density: 'compact' }) }, storage);
    await f.sync.load();
    assert.equal(loadPreferenceProfile(1006, storage).id, id);
    assert.equal(f.states.at(-1).preferences.density, 'compact');
  });

  it('resets only this profile and does not rewrite an old snooze date to today', async () => {
    const paths = [];
    const f = fixture(1007, { get: async () => reply({ quotesSnoozedOn: '2026-09-01' }),
      post: async path => { paths.push(path); return reply({}); } });
    await f.sync.load();
    assert.equal(f.states.at(-1).preferences.quotesSnoozedOn, '2026-09-01');
    await f.sync.reset();
    assert.deepEqual(paths, [`/api/preferences/profiles/${id}/reset`]);
    assert.deepEqual(f.states.at(-1).preferences, DEFAULT_PREFERENCES);
  });

  it('does not recreate an initialized but missing remote profile from stale local preferences', async () => {
    const storage = store();
    const first = fixture(1008, { get: async () => reply({ theme: 'dark' }) }, storage);
    await first.sync.load(); first.sync.close();
    const next = fixture(1008, { get: async () => { throw Object.assign(new Error('Missing'), { status: 404 }); },
      post: () => assert.fail('Never remigrate a known remote profile') }, storage);
    assert.equal(await next.sync.load(), false);
    assert.equal(next.states.at(-1).ready, false);
  });

  it('prevents an overlapping reload or edit from racing an in-flight preference save', async () => {
    let resolve; let reads = 0; let writes = 0;
    const f = fixture(1009, { get: async () => { reads++; return reply({}); },
      patch: () => { writes++; return new Promise(done => { resolve = done; }); } });
    await f.sync.load();
    const saving = f.sync.update({ theme: 'dark' });
    assert.equal(await f.sync.load(), false);
    assert.equal(await f.sync.update({ theme: 'light' }), false);
    resolve(reply({ theme: 'dark' })); await saving;
    assert.equal(reads, 1); assert.equal(writes, 1);
    assert.equal(f.states.at(-1).preferences.theme, 'dark');
  });
});
