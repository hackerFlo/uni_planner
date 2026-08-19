const fs = require('node:fs');
const path = require('node:path');

// Single source of truth for where the database lives, so index.js can check the
// directory before db.js opens a handle in it.
const DB_PATH = process.env.DATABASE_PATH || path.join(__dirname, 'planner.db');

// better-sqlite3 reports an unwritable directory as an opaque SQLITE_CANTOPEN,
// and on a bind mount that almost always means the host folder is owned by the
// wrong uid -- the container runs as `node` (uid 1000). Checking first turns a
// crash loop into one line naming the fix.
function assertDataDirWritable(dir) {
  const probe = path.join(dir, `.write-probe-${process.pid}`);
  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(probe, '');
    fs.unlinkSync(probe);
  } catch (err) {
    const uid = process.getuid?.() ?? 'unknown';
    throw new Error(
      `${dir} is not writable by uid ${uid} (${err.code}). ` +
      `Fix on the host: chown -R 1000:1000 <the folder bind-mounted to ${dir}>`
    );
  }
}

module.exports = { DB_PATH, assertDataDirWritable };
