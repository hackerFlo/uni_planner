const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { assertDataDirWritable } = require('./storage');

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'uni-planner-storage-'));
}

test.describe('assertDataDirWritable', () => {
  test('accepts a directory it can write to', () => {
    const dir = tempDir();
    assert.doesNotThrow(() => assertDataDirWritable(dir));
  });

  test('creates the directory when it does not exist yet', () => {
    const dir = path.join(tempDir(), 'data');
    assertDataDirWritable(dir);
    assert.equal(fs.existsSync(dir), true);
  });

  test('leaves nothing behind', () => {
    const dir = tempDir();
    assertDataDirWritable(dir);
    assert.deepEqual(fs.readdirSync(dir), []);
  });

  // A path whose parent is a regular file fails the same way for every uid,
  // so this case does not depend on who runs the tests.
  test('rejects a path that cannot be a directory', () => {
    const file = path.join(tempDir(), 'not-a-dir');
    fs.writeFileSync(file, '');
    assert.throws(() => assertDataDirWritable(path.join(file, 'data')), /not writable/);
  });

  test('names the offending path so the message is actionable', () => {
    const file = path.join(tempDir(), 'not-a-dir');
    fs.writeFileSync(file, '');
    const target = path.join(file, 'data');
    assert.throws(() => assertDataDirWritable(target), new RegExp(target.replace(/[/\\]/g, '.')));
  });

  // The whole point of the check: tell the operator the exact fix, because the
  // alternative is an opaque SQLITE_CANTOPEN from better-sqlite3.
  test('spells out the chown that fixes it', () => {
    const file = path.join(tempDir(), 'not-a-dir');
    fs.writeFileSync(file, '');
    assert.throws(() => assertDataDirWritable(path.join(file, 'data')), /chown -R 1000:1000/);
  });

  test('rejects a directory that exists but denies writes', { skip: process.getuid?.() === 0 }, () => {
    const dir = tempDir();
    fs.chmodSync(dir, 0o500);
    try {
      assert.throws(() => assertDataDirWritable(dir), /not writable/);
    } finally {
      fs.chmodSync(dir, 0o700);
    }
  });
});
