const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const Database = require('better-sqlite3');
const { migratePreferences } = require('../domain/preferencesMigration');
const { createPreferenceService, DEFAULT_PREFERENCES } = require('./preferences');

function fixture(t) {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  db.exec('CREATE TABLE users(id INTEGER PRIMARY KEY); INSERT INTO users VALUES(1),(2)');
  migratePreferences(db); migratePreferences(db);
  t.after(() => db.close());
  return { db, service: createPreferenceService(db), alice: { userId: 1 }, bob: { userId: 2 } };
}
const profile = (settings = {}) => ({ id: randomUUID(), label: 'This browser', settings });

describe('preference profiles', () => {
  it('migrates only when creating a profile and never overwrites remote edits on repeat creation', t => {
    const { service, alice } = fixture(t);
    const input = profile({ theme: 'dark', holidaySubdivision: '' });
    const first = service.create(alice, input);
    assert.deepEqual(first.settings, { ...DEFAULT_PREFERENCES, theme: 'dark', holidaySubdivision: null });
    service.update(alice, { id: first.id, patch: { theme: 'light' } });
    assert.equal(service.create(alice, input).settings.theme, 'light');
    assert.equal(service.list(alice).profiles.length, 1);
  });

  it('isolates profiles and patches by account and device', t => {
    const { service, alice, bob } = fixture(t);
    const laptop = service.create(alice, profile({ density: 'compact' }));
    const phone = service.create(alice, profile({ theme: 'dark' }));
    const other = service.create(bob, profile({ showQuotes: false }));
    service.update(alice, { id: laptop.id, patch: { theme: 'light' } });
    assert.equal(service.get(alice, { id: phone.id }).settings.theme, 'dark');
    for (const action of [() => service.get(alice, { id: other.id }),
      () => service.update(alice, { id: other.id, patch: { theme: 'light' } }),
      () => service.reset(alice, { id: other.id })]) assert.throws(action, { code: 'NOT_FOUND' });
    assert.throws(() => service.create(alice, { ...profile(), id: other.id }), { code: 'CONFLICT' });
    assert.deepEqual(service.list(bob).profiles.map(value => value.id), [other.id]);
  });

  it('rejects unknown fields, wrong types and nonexistent calendar snooze dates without writes', t => {
    const { service, alice } = fixture(t);
    const current = service.create(alice, profile());
    for (const patch of [{ mystery: true }, { theme: 'solarized' }, { showQuotes: 'true' },
      { quotesSnoozedOn: '2026-02-30' }, { holidayCountry: 'Germany' }, { user_id: 2 }, {}]) {
      assert.throws(() => service.update(alice, { id: current.id, patch }), { code: 'VALIDATION_ERROR' });
    }
    assert.deepEqual(service.get(alice, { id: current.id }), current);
  });

  it('resets only the selected profile and preserves a valid snoozed-on day without extending it', t => {
    const { service, alice } = fixture(t);
    const first = service.create(alice, profile({ quotesSnoozedOn: '2028-02-29', showQuotes: false }));
    const second = service.create(alice, profile({ theme: 'dark' }));
    assert.equal(service.get(alice, { id: first.id }).settings.quotesSnoozedOn, '2028-02-29');
    assert.deepEqual(service.reset(alice, { id: first.id }).settings, DEFAULT_PREFERENCES);
    assert.equal(service.get(alice, { id: second.id }).settings.theme, 'dark');
  });

  it('persists the selected agent badge icon per profile and resets to fuzzy', t => {
    const { service, alice } = fixture(t);
    const first = service.create(alice, profile({ agentActivityIcon: 'ring' }));
    const second = service.create(alice, profile({ agentActivityIcon: 'robot' }));
    assert.equal(service.get(alice, { id: first.id }).settings.agentActivityIcon, 'ring');
    assert.equal(service.get(alice, { id: second.id }).settings.agentActivityIcon, 'robot');
    assert.equal(service.reset(alice, { id: first.id }).settings.agentActivityIcon, 'fuzzy');
  });

  it('rejects invalid badge icons without changing saved preferences', t => {
    const { service, alice } = fixture(t);
    const current = service.create(alice, profile());
    for (const icon of ['circle', '', null, 1]) {
      assert.throws(() => service.update(alice, { id: current.id, patch: { agentActivityIcon: icon } }),
        { code: 'VALIDATION_ERROR' });
    }
    assert.deepEqual(service.get(alice, { id: current.id }), current);
  });

  it('rejects foreign cursors and bounds profile counts', t => {
    const { service, alice, bob } = fixture(t);
    for (let i = 0; i < 50; i++) service.create(alice, profile());
    assert.throws(() => service.create(alice, profile()), { code: 'RATE_LIMITED' });
    const page = service.list(alice, { limit: 1 });
    assert.equal(page.profiles.length, 1);
    assert.throws(() => service.list(bob, { limit: 1, cursor: page.nextCursor }), { code: 'CONFLICT' });
  });

  it('rejects malformed profile metadata and cascades account deletion', t => {
    const { db, service, alice } = fixture(t);
    for (const input of [{ ...profile(), label: ' ' }, { ...profile(), label: 'x'.repeat(81) },
      { ...profile(), id: 'bad-id' }, { ...profile(), user_id: 2 }, { ...profile(), label: 'Profile\nname' }]) {
      assert.throws(() => service.create(alice, input), { code: 'VALIDATION_ERROR' });
    }
    service.create(alice, profile());
    db.prepare('DELETE FROM users WHERE id=?').run(1);
    assert.equal(db.prepare('SELECT count(*) AS n FROM preference_profiles').get().n, 0);
  });
});
