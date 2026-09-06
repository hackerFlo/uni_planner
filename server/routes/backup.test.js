const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// Must be set before db.js is required -- it opens the file at module load.
process.env.DATABASE_PATH = path.join(
  fs.mkdtempSync(path.join(os.tmpdir(), 'uni-planner-backup-')), 'planner.db'
);
process.env.JWT_SECRET = 'test-secret-long-enough-for-the-check';
process.env.LOG_LEVEL = 'error';
// crypto.js reads this at call time; the value only has to be 64 hex chars.
process.env.NOTIFICATION_ENCRYPT_KEY = 'a'.repeat(64);
process.env.DISABLE_RATE_LIMIT = 'true';
// The limiters live in index.js, not in these routers, so this app never mounts one.
delete process.env.NODE_ENV;

const express = require('express');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const db = require('../db');
const { createSession } = require('../sessions');
const { encryptEmail, decryptEmail } = require('../crypto');
const backupRoutes = require('./backup');

function makeUser(email) {
  const id = db.prepare('INSERT INTO users (email, password_hash) VALUES (?, ?)').run(email, 'x').lastInsertRowid;
  // requireAuth needs a live session row, not just a signed token.
  return { id, token: jwt.sign({ id, email, tv: 0, sid: createSession(id) }, process.env.JWT_SECRET) };
}

const alice = makeUser('alice@example.com');
const bob = makeUser('bob@example.com');
const carol = makeUser('carol@example.com');

// Every colour client/src/constants/listPalette.js offers. backup.js keeps its
// own allowlist, and the day it fell behind, exported lists came back grey.
const CLIENT_PALETTE = ['indigo', 'emerald', 'teal', 'amber', 'rose', 'sky', 'violet', 'pink', 'slate'];

const NOTIFY = { time: '07:30', email: 'alerts@example.com', tz: 'Europe/Berlin' };
db.prepare(
  'UPDATE users SET notify_enabled = 1, notify_time = ?, notify_email_enc = ?, notify_tz = ? WHERE id = ?'
).run(NOTIFY.time, encryptEmail(NOTIFY.email), NOTIFY.tz, alice.id);

const TEMPLATE_CREATED_AT = '2026-08-01T10:00:00.000Z';
const listId = db.prepare('INSERT INTO lists (user_id, name, color, sort_order) VALUES (?, ?, ?, ?)')
  .run(alice.id, 'University', 'indigo', 0).lastInsertRowid;
const templateId = db.prepare(
  'INSERT INTO todos (user_id, list_id, title, day_assigned, recurrence_pattern, created_at) VALUES (?, ?, ?, ?, ?, ?)'
).run(alice.id, listId, 'Lecture', '2026-08-03', 'weekdays', TEMPLATE_CREATED_AT).lastInsertRowid;
db.prepare(
  'INSERT INTO todos (user_id, list_id, title, day_assigned, recurrence_parent_id, created_at) VALUES (?, ?, ?, ?, ?, ?)'
).run(alice.id, listId, 'Lecture', '2026-08-04', templateId, '2026-08-04T00:00:00.000Z');
db.prepare('INSERT INTO day_notes (user_id, date, note) VALUES (?, ?, ?)')
  .run(alice.id, '2026-08-05', 'Reading week');

// AR-15: dividers are user data too. Two on one day, at non-adjacent slots,
// because todos and dividers share one dense sequence per day -- the export has
// to carry the position, not merely the count.
const DIVIDER_DATE = '2026-08-06';
const DIVIDER_SLOTS = [1, 4];
for (const slot of DIVIDER_SLOTS) {
  db.prepare('INSERT INTO day_dividers (user_id, date, planner_order) VALUES (?, ?, ?)')
    .run(alice.id, DIVIDER_DATE, slot);
}

const app = express();
app.use(cookieParser());
app.use('/api/backup', backupRoutes);
const server = app.listen(0);
const base = `http://127.0.0.1:${server.address().port}`;
test.after(() => server.close());

const exportAs = async (user) =>
  (await fetch(`${base}/api/backup`, { headers: { Cookie: `token=${user.token}` } })).json();

const restoreAs = async (user, payload) =>
  (await fetch(`${base}/api/backup/restore`, {
    method: 'POST',
    headers: { Cookie: `token=${user.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })).json();

let backup;

test.describe('backup export', () => {
  test('includes day notes, which earlier versions dropped entirely', async () => {
    backup = await exportAs(alice);
    assert.deepEqual(backup.day_notes, [
      { date: '2026-08-05', note: 'Reading week', updated_at: backup.day_notes[0].updated_at },
    ]);
  });

  test('includes day dividers with the day and the slot they occupy', () => {
    assert.deepEqual(
      backup.day_dividers.map(d => ({ date: d.date, planner_order: d.planner_order })),
      DIVIDER_SLOTS.map(planner_order => ({ date: DIVIDER_DATE, planner_order })),
    );
  });

  test('carries the recurrence rule on the template', () => {
    const template = backup.todos.find(t => t.created_at === TEMPLATE_CREATED_AT);
    assert.equal(template.recurrence_pattern, 'weekdays');
  });

  test('identifies each instance by its template, not by a local row id', () => {
    const instance = backup.todos.find(t => t.day_assigned === '2026-08-04');
    assert.deepEqual(
      { title: instance.recurrence_parent_title, created: instance.recurrence_parent_created_at },
      { title: 'Lecture', created: TEMPLATE_CREATED_AT },
    );
  });

  // AR-15: settings are user data, and a restore that drops them stops the
  // daily mail without a single error to show for it.
  test('carries the notification settings, which earlier versions left out', () => {
    assert.deepEqual(backup.settings, {
      notify_enabled: true,
      notify_time: NOTIFY.time,
      notify_email: NOTIFY.email,
      notify_tz: NOTIFY.tz,
    });
  });

  test('never hands one account another\'s notification address (AR-2)', async () => {
    const { settings } = await exportAs(bob);
    assert.equal(settings.notify_email, '');
  });

  test('exports only the requesting user (AR-2)', async () => {
    const { lists, todos, exams, day_notes: dayNotes } = await exportAs(bob);
    assert.deepEqual({ lists, todos, exams, dayNotes }, { lists: [], todos: [], exams: [], dayNotes: [] });
  });
});

test.describe('backup restore', () => {
  let firstRestore;

  test('brings day notes back into a fresh account', async () => {
    firstRestore = await restoreAs(bob, backup);
    assert.equal(firstRestore.notesImported, 1);
  });

  test('reports the dividers it imported', () => {
    assert.equal(firstRestore.dividersImported, DIVIDER_SLOTS.length);
  });

  test('brings each divider back on its own day, in its own slot', () => {
    const rows = db.prepare(
      'SELECT date, planner_order FROM day_dividers WHERE user_id = ? ORDER BY planner_order ASC'
    ).all(bob.id);
    assert.deepEqual(rows, DIVIDER_SLOTS.map(planner_order => ({ date: DIVIDER_DATE, planner_order })));
  });

  test('restores the recurrence rule, not just a one-off todo', () => {
    const template = db.prepare(
      'SELECT recurrence_pattern FROM todos WHERE user_id = ? AND created_at = ?'
    ).get(bob.id, TEMPLATE_CREATED_AT);
    assert.equal(template.recurrence_pattern, 'weekdays');
  });

  // Without the relink the scheduler cannot see the restored instance and
  // materialises a duplicate for a day that is already filled.
  test('relinks each instance to the template'
    + ' under its new row id', () => {
    const rows = db.prepare(
      'SELECT id, day_assigned, recurrence_pattern, recurrence_parent_id FROM todos WHERE user_id = ?'
    ).all(bob.id);
    const template = rows.find(r => r.recurrence_pattern === 'weekdays');
    const instance = rows.find(r => r.day_assigned === '2026-08-04');
    assert.equal(instance.recurrence_parent_id, template.id);
  });

  test('is idempotent: restoring the same file again imports nothing', async () => {
    const again = await restoreAs(bob, backup);
    assert.deepEqual(
      {
        todos: again.imported, notes: again.notesImported,
        exams: again.examsImported, dividers: again.dividersImported,
      },
      { todos: 0, notes: 0, exams: 0, dividers: 0 },
    );
  });

  test('rejects a payload with no todos array', async () => {
    const res = await fetch(`${base}/api/backup/restore`, {
      method: 'POST',
      headers: { Cookie: `token=${bob.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ todos: 'nope' }),
    });
    assert.equal(res.status, 400);
  });

  test('leaves the exporting account untouched', () => {
    const count = db.prepare('SELECT COUNT(*) AS n FROM todos WHERE user_id = ?').get(alice.id).n;
    assert.equal(count, 2);
  });

  test('brings the notification schedule into the new account', () => {
    const row = db.prepare(
      'SELECT notify_enabled, notify_time, notify_tz FROM users WHERE id = ?'
    ).get(bob.id);
    assert.deepEqual(row, { notify_enabled: 1, notify_time: NOTIFY.time, notify_tz: NOTIFY.tz });
  });

  // The ciphertext is bound to NOTIFICATION_ENCRYPT_KEY, so copying it verbatim
  // would restore an address this machine could never read back.
  test('re-encrypts the notification address with the local key', () => {
    const { notify_email_enc: enc } = db.prepare(
      'SELECT notify_email_enc FROM users WHERE id = ?'
    ).get(bob.id);
    assert.equal(decryptEmail(enc), NOTIFY.email);
  });
});

// AR-15 for the quote library: an uploaded quote and a hidden quote are both
// user data, and both used to have no way of surviving a rebuild.
test.describe('quotes in the backup', () => {
  const db2 = require('../db');
  const quotes = require('../quotes');

  test('carries quotes the user uploaded, but not the built-ins', async () => {
    const dave = makeUser('dave-quotes@example.com');
    quotes.importCsv(dave.id, 'ID,Quote,Author,Characters,Wikipedia,Source\nQ1,Dave uploaded this one.,Dave,24,,');
    const out = await exportAs(dave);
    assert.deepEqual(out.quotes.map(q => q.text), ['Dave uploaded this one.']);
  });

  test('carries hidden quotes by text, since row ids do not survive', async () => {
    const erin = makeUser('erin-quotes@example.com');
    const target = db2.prepare('SELECT id, text FROM quotes WHERE user_id IS NULL LIMIT 1').get();
    quotes.setDisliked(erin.id, target.id, true);
    const out = await exportAs(erin);
    assert.deepEqual(out.quote_dislikes, [target.text]);
  });

  test('a dislike survives export and restore onto another account', async () => {
    const frank = makeUser('frank-quotes@example.com');
    const grace = makeUser('grace-quotes@example.com');
    const target = db2.prepare('SELECT id, text FROM quotes WHERE user_id IS NULL LIMIT 1').get();
    quotes.setDisliked(frank.id, target.id, true);
    const out = await exportAs(frank);

    const result = await restoreAs(grace, out);
    assert.equal(result.dislikesImported, 1);
    assert.equal(quotes.stats(grace.id).disliked, 1);
  });

  test('an uploaded quote survives a restore and belongs to the restorer', async () => {
    const heidi = makeUser('heidi-quotes@example.com');
    const ivan = makeUser('ivan-quotes@example.com');
    quotes.importCsv(heidi.id, 'ID,Quote,Author,Characters,Wikipedia,Source\nQ1,Heidi wrote this down.,Heidi,23,,');
    const out = await exportAs(heidi);

    const result = await restoreAs(ivan, out);
    assert.equal(result.quotesImported, 1);
    assert.equal(quotes.stats(ivan.id).uploaded, 1);
  });

  test('restoring the same file twice does not duplicate quotes', async () => {
    const judy = makeUser('judy-quotes@example.com');
    const ken = makeUser('ken-quotes@example.com');
    quotes.importCsv(judy.id, 'ID,Quote,Author,Characters,Wikipedia,Source\nQ1,Judy said something.,Judy,21,,');
    const out = await exportAs(judy);
    await restoreAs(ken, out);
    const second = await restoreAs(ken, out);
    assert.equal(second.quotesImported, 0);
    assert.equal(quotes.stats(ken.id).uploaded, 1);
  });

  // The URL becomes an href in the quote bar, so a hand-edited backup must not
  // be able to smuggle a javascript: scheme past the restore.
  test('drops a javascript: URL from a restored quote', async () => {
    const mallory = makeUser('mallory-quotes@example.com');
    await restoreAs(mallory, {
      todos: [],
      quotes: [{ text: 'Looks innocent.', author: 'Mallory', wikipedia: 'javascript:alert(1)' }],
    });
    const row = db2.prepare('SELECT wikipedia FROM quotes WHERE user_id = ?').get(mallory.id);
    assert.equal(row.wikipedia, null);
  });

  test('bumped the export version so an older reader can tell', async () => {
    const out = await exportAs(alice);
    assert.equal(out.version, 7);
  });
});

test.describe('restoring untrusted fields', () => {
  test('keeps every colour the client palette offers', async () => {
    await restoreAs(carol, {
      todos: [],
      lists: CLIENT_PALETTE.map(color => ({ name: 'list-' + color, color })),
    });
    const rows = db.prepare('SELECT name, color FROM lists WHERE user_id = ?').all(carol.id);
    const lost = CLIENT_PALETTE.filter(c => !rows.some(r => r.name === 'list-' + c && r.color === c));
    assert.deepEqual(lost, []);
  });

  test('falls back to slate for a colour no palette knows', async () => {
    await restoreAs(carol, { todos: [], lists: [{ name: 'list-chartreuse', color: 'chartreuse' }] });
    const row = db.prepare('SELECT color FROM lists WHERE user_id = ? AND name = ?').get(carol.id, 'list-chartreuse');
    assert.equal(row.color, 'slate');
  });

  test('ignores a malformed notification time rather than storing it', async () => {
    await restoreAs(carol, { todos: [], settings: { notify_time: '25:61', notify_tz: NOTIFY.tz } });
    assert.equal(db.prepare('SELECT notify_time FROM users WHERE id = ?').get(carol.id).notify_time, '22:00');
  });

  test('still applies the valid fields alongside the rejected one', () => {
    assert.equal(db.prepare('SELECT notify_tz FROM users WHERE id = ?').get(carol.id).notify_tz, NOTIFY.tz);
  });

  test('refuses a timezone no runtime knows', async () => {
    await restoreAs(carol, { todos: [], settings: { notify_tz: 'Mars/Olympus_Mons' } });
    assert.equal(db.prepare('SELECT notify_tz FROM users WHERE id = ?').get(carol.id).notify_tz, NOTIFY.tz);
  });

  // A CR or LF in a recipient ends the To: header and lets the rest become
  // headers of the file author's choosing.
  test('refuses an address that could inject a mail header', async () => {
    await restoreAs(carol, { todos: [], settings: { notify_email: 'a@b.com\nBcc: victim@example.com' } });
    const row = db.prepare('SELECT notify_email_enc FROM users WHERE id = ?').get(carol.id);
    assert.equal(row.notify_email_enc, null);
  });

  test('reports that a file predating settings restored none', async () => {
    const result = await restoreAs(carol, { todos: [] });
    assert.equal(result.settingsRestored, false);
  });

  test('leaves the account\'s own settings alone when the file carries none', () => {
    assert.equal(db.prepare('SELECT notify_tz FROM users WHERE id = ?').get(carol.id).notify_tz, NOTIFY.tz);
  });
});

// AR-15 for dividers: they are the only record of where a day was cut in two,
// and a restore that drops them rebuilds the column in the wrong order.
test.describe('day dividers in a restored file', () => {
  // Kept equal to MAX_DIVIDERS_PER_DAY in routes/dayDividers.js and backup.js.
  const MAX_DIVIDERS_PER_DAY = 20;
  const OVERSIZED_DATE = '2026-10-01';

  test('restores a version 6 file, which has no day_dividers key at all', async () => {
    const nina = makeUser('nina-dividers@example.com');
    const result = await restoreAs(nina, {
      version: 6,
      todos: [],
      day_notes: [{ date: '2026-08-07', note: 'Written before dividers existed' }],
    });
    assert.deepEqual(
      { notes: result.notesImported, dividers: result.dividersImported },
      { notes: 1, dividers: 0 },
    );
  });

  test('skips a divider whose date the calendar does not have', async () => {
    const oscar = makeUser('oscar-dividers@example.com');
    const result = await restoreAs(oscar, {
      todos: [],
      day_dividers: [{ date: '2026-02-30', planner_order: 0 }],
    });
    assert.deepEqual(
      { imported: result.dividersImported, skipped: result.dividersSkipped },
      { imported: 0, skipped: 1 },
    );
  });

  test('skips a divider with no slot rather than inventing one', async () => {
    const peggy = makeUser('peggy-dividers@example.com');
    await restoreAs(peggy, { todos: [], day_dividers: [{ date: OVERSIZED_DATE, planner_order: 'first' }] });
    const { n } = db.prepare('SELECT COUNT(*) AS n FROM day_dividers WHERE user_id = ?').get(peggy.id);
    assert.equal(n, 0);
  });

  // A hand-edited file is untrusted input (AR-1) and must not be a way past a
  // cap the live endpoint enforces.
  test('holds a hand-edited file to the same per-day cap the API applies', async () => {
    const quentin = makeUser('quentin-dividers@example.com');
    const overflow = 5;
    const result = await restoreAs(quentin, {
      todos: [],
      day_dividers: Array.from({ length: MAX_DIVIDERS_PER_DAY + overflow }, (_, planner_order) =>
        ({ date: OVERSIZED_DATE, planner_order })),
    });
    assert.deepEqual(
      { imported: result.dividersImported, skipped: result.dividersSkipped },
      { imported: MAX_DIVIDERS_PER_DAY, skipped: overflow },
    );
  });
});
