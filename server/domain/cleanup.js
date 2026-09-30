function sweepEphemeral(db, now = Date.now()) {
  // Trusted system maintenance, deliberately across users. Each indexed batch
  // is bounded so cleanup cannot block planner requests for an unbounded scan.
  return db.transaction(() => {
    db.prepare(`UPDATE planner_operations SET inverse=NULL WHERE id IN
      (SELECT id FROM planner_operations WHERE expires_at<=? AND inverse IS NOT NULL LIMIT 500)`)
      .run(now);
    const removed = db.prepare(`DELETE FROM mutation_receipts WHERE rowid IN
      (SELECT rowid FROM mutation_receipts WHERE expires_at<=? LIMIT 500)`).run(now).changes;
    db.prepare(`DELETE FROM planner_operations WHERE id IN
      (SELECT id FROM planner_operations WHERE expires_at<=? LIMIT 500)`).run(now - 86400000);
    for (const table of ['notification_attempts', 'export_artifacts']) {
      if (db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(table)) {
        db.prepare(`DELETE FROM ${table} WHERE id IN
          (SELECT id FROM ${table} WHERE expires_at<=? LIMIT 500)`).run(now);
      }
    }
    return removed;
  })();
}

module.exports = { sweepEphemeral };
