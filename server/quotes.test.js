const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

process.env.DATABASE_PATH = path.join(
  fs.mkdtempSync(path.join(os.tmpdir(), 'uni-planner-quotes-')), 'planner.db'
);
process.env.JWT_SECRET = 'test-secret-long-enough-for-the-check';
process.env.LOG_LEVEL = 'error';

const db = require('./db');
const q = require('./quotes');

const makeUser = (email) =>
  db.prepare('INSERT INTO users (email, password_hash) VALUES (?, ?)').run(email, 'x').lastInsertRowid;

// The seeded 191 make rotation assertions unreadable; most tests want a library
// small enough to exhaust by hand.
function shrinkLibraryTo(n) {
  db.prepare('DELETE FROM quote_day').run();
  db.prepare('DELETE FROM quote_state').run();
  db.prepare('DELETE FROM quotes').run();
  for (let i = 1; i <= n; i++) {
    db.prepare('INSERT INTO quotes (user_id, text, author) VALUES (NULL, ?, ?)').run(`Quote ${i}`, `Author ${i}`);
  }
}

test.describe('quoteForDay', () => {
  test('returns a quote', () => {
    shrinkLibraryTo(3);
    const user = makeUser('one@example.com');
    assert.ok(q.quoteForDay(user, '2026-08-20')?.text);
  });

  // The whole point of quote_day: a refresh must not reroll the day.
  test('is stable across repeated reads of the same day', () => {
    shrinkLibraryTo(20);
    const user = makeUser('stable@example.com');
    const first = q.quoteForDay(user, '2026-08-20');
    for (let i = 0; i < 5; i++) {
      assert.equal(q.quoteForDay(user, '2026-08-20').id, first.id);
    }
  });

  // "A quote that has been displayed before can only be displayed again after
  // all other quotes have been displayed."
  test('shows every quote once before repeating any', () => {
    const N = 12;
    shrinkLibraryTo(N);
    const user = makeUser('cycle@example.com');
    const seen = [];
    for (let d = 1; d <= N; d++) {
      seen.push(q.quoteForDay(user, `2026-09-${String(d).padStart(2, '0')}`).id);
    }
    assert.equal(new Set(seen).size, N, 'a quote repeated before the pass ended');
  });

  test('starts a fresh pass once every quote has been shown', () => {
    const N = 5;
    shrinkLibraryTo(N);
    const user = makeUser('wrap@example.com');
    const ids = [];
    for (let d = 1; d <= N * 2; d++) {
      ids.push(q.quoteForDay(user, `2026-10-${String(d).padStart(2, '0')}`).id);
    }
    assert.equal(ids.length, N * 2, 'ran out of quotes instead of starting a new pass');
    assert.equal(new Set(ids.slice(0, N)).size, N);
    assert.equal(new Set(ids.slice(N)).size, N, 'second pass repeated within itself');
  });

  test('returns null when the library is empty', () => {
    shrinkLibraryTo(0);
    assert.equal(q.quoteForDay(makeUser('empty@example.com'), '2026-08-20'), null);
  });

  test('returns null once every quote is disliked, rather than looping', () => {
    shrinkLibraryTo(3);
    const user = makeUser('alldisliked@example.com');
    for (const row of db.prepare('SELECT id FROM quotes').all()) q.setDisliked(user, row.id, true);
    assert.equal(q.quoteForDay(user, '2026-08-20'), null);
  });

  test('two users rotate independently', () => {
    shrinkLibraryTo(4);
    const a = makeUser('rota@example.com');
    const b = makeUser('rotb@example.com');
    q.quoteForDay(a, '2026-08-20');
    q.quoteForDay(a, '2026-08-21');
    // b has seen nothing, so all four are still unseen for b
    const bSeen = new Set();
    for (let d = 20; d <= 23; d++) bSeen.add(q.quoteForDay(b, `2026-08-${d}`).id);
    assert.equal(bSeen.size, 4);
  });
});

test.describe('setDisliked', () => {
  test('a disliked quote is never picked again', () => {
    shrinkLibraryTo(2);
    const user = makeUser('dislike@example.com');
    const first = q.quoteForDay(user, '2026-08-20');
    q.setDisliked(user, first.id, true);
    q.clearDay(user, '2026-08-20');
    for (let d = 20; d <= 26; d++) {
      const got = q.quoteForDay(user, `2026-08-${d}`);
      assert.notEqual(got?.id, first.id, 'the disliked quote came back');
    }
  });

  test('dislike then clearDay yields a different quote for the same day', () => {
    shrinkLibraryTo(6);
    const user = makeUser('replace@example.com');
    const first = q.quoteForDay(user, '2026-08-20');
    q.setDisliked(user, first.id, true);
    q.clearDay(user, '2026-08-20');
    const second = q.quoteForDay(user, '2026-08-20');
    assert.notEqual(second.id, first.id);
  });

  test('restoring makes it eligible again', () => {
    shrinkLibraryTo(1);
    const user = makeUser('restore@example.com');
    const only = q.quoteForDay(user, '2026-08-20');
    q.setDisliked(user, only.id, true);
    q.clearDay(user, '2026-08-20');
    assert.equal(q.quoteForDay(user, '2026-08-20'), null);
    q.setDisliked(user, only.id, false);
    assert.equal(q.quoteForDay(user, '2026-08-20').id, only.id);
  });

  // AR-2: another user's uploaded quote is not a row you may touch.
  test('refuses a quote the user cannot see', () => {
    shrinkLibraryTo(1);
    const owner = makeUser('owner@example.com');
    const other = makeUser('other@example.com');
    const mine = db.prepare('INSERT INTO quotes (user_id, text, author) VALUES (?, ?, ?)')
      .run(owner, 'Private thought.', 'Owner').lastInsertRowid;
    assert.equal(q.setDisliked(other, mine, true), false);
    assert.equal(q.setDisliked(owner, mine, true), true);
  });

  test('restoreAll clears every dislike for that user only', () => {
    shrinkLibraryTo(4);
    const a = makeUser('ra@example.com');
    const b = makeUser('rb@example.com');
    const ids = db.prepare('SELECT id FROM quotes').all().map(r => r.id);
    for (const id of ids) { q.setDisliked(a, id, true); q.setDisliked(b, id, true); }
    assert.equal(q.restoreAll(a), 4);
    assert.equal(q.stats(a).disliked, 0);
    assert.equal(q.stats(b).disliked, 4, "another user's dislikes were cleared");
  });
});

test.describe('importCsv', () => {
  const header = 'ID,Quote,Author,Characters,Wikipedia,Source';

  test('adds new quotes and reports the count', () => {
    shrinkLibraryTo(1);
    const user = makeUser('imp1@example.com');
    const res = q.importCsv(user, `${header}\nQ1,Brand new thought.,Someone,20,,`);
    assert.deepEqual({ added: res.added, skipped: res.skipped }, { added: 1, skipped: 0 });
  });

  test('re-importing the same file adds nothing', () => {
    shrinkLibraryTo(1);
    const user = makeUser('imp2@example.com');
    const csv = `${header}\nQ1,Repeatable thought.,Someone,20,,`;
    q.importCsv(user, csv);
    const second = q.importCsv(user, csv);
    assert.deepEqual({ added: second.added, skipped: second.skipped }, { added: 0, skipped: 1 });
  });

  test('skips a quote that already exists as a built-in', () => {
    shrinkLibraryTo(2);
    const user = makeUser('imp3@example.com');
    const res = q.importCsv(user, `${header}\nQ1,Quote 1,Author 1,10,,`);
    assert.deepEqual({ added: res.added, skipped: res.skipped }, { added: 0, skipped: 1 });
  });

  test('an uploaded quote is invisible to another user', () => {
    shrinkLibraryTo(0);
    const owner = makeUser('imp4@example.com');
    const other = makeUser('imp5@example.com');
    q.importCsv(owner, `${header}\nQ1,Only mine.,Someone,10,,`);
    assert.equal(q.stats(owner).total, 1);
    assert.equal(q.stats(other).total, 0);
    assert.equal(q.quoteForDay(other, '2026-08-20'), null);
  });

  test('reports errors for unusable rows without losing the good ones', () => {
    shrinkLibraryTo(0);
    const user = makeUser('imp6@example.com');
    const res = q.importCsv(user, `${header}\nQ1,Good one.,Someone,10,,\nQ2,,NoText,0,,`);
    assert.equal(res.added, 1);
    assert.equal(res.errors.length, 1);
  });

  test('rejects a file with the wrong columns', () => {
    const user = makeUser('imp7@example.com');
    const res = q.importCsv(user, 'Foo,Bar\n1,2');
    assert.equal(res.added, 0);
    assert.ok(res.errors.length > 0);
  });
});
