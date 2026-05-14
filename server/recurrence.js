const db = require('./db');

function addDays(iso, n) {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + n);
  const ry = date.getUTCFullYear();
  const rm = String(date.getUTCMonth() + 1).padStart(2, '0');
  const rd = String(date.getUTCDate()).padStart(2, '0');
  return `${ry}-${rm}-${rd}`;
}

function getWindowBounds(userTz) {
  const now = new Date();
  const todayIso = new Intl.DateTimeFormat('en-CA', {
    timeZone: userTz, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now);

  const [ty, tm, td] = todayIso.split('-').map(Number);
  const todayUTC = new Date(Date.UTC(ty, tm - 1, td));
  const dow = todayUTC.getUTCDay(); // 0=Sun
  const diffToMonday = dow === 0 ? -6 : 1 - dow;
  const thisMonday = new Date(todayUTC);
  thisMonday.setUTCDate(todayUTC.getUTCDate() + diffToMonday);

  const windowStartY = thisMonday.getUTCFullYear();
  const windowStartM = String(thisMonday.getUTCMonth() + 1).padStart(2, '0');
  const windowStartD = String(thisMonday.getUTCDate()).padStart(2, '0');
  const windowStart = `${windowStartY}-${windowStartM}-${windowStartD}`;

  // Next Sunday = thisMonday + 13 days
  const nextSunday = new Date(thisMonday);
  nextSunday.setUTCDate(thisMonday.getUTCDate() + 13);
  const windowEndY = nextSunday.getUTCFullYear();
  const windowEndM = String(nextSunday.getUTCMonth() + 1).padStart(2, '0');
  const windowEndD = String(nextSunday.getUTCDate()).padStart(2, '0');
  const windowEnd = `${windowEndY}-${windowEndM}-${windowEndD}`;

  return { windowStart, windowEnd };
}

function isPatternMatch(isoDate, pattern) {
  const [y, m, d] = isoDate.split('-').map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0=Sun, 6=Sat
  if (pattern === 'weekdays') return dow >= 1 && dow <= 5;
  if (pattern === 'weekends') return dow === 0 || dow === 6;
  return false;
}

function materializeForTemplate(templateId, userTz) {
  const tz = userTz || 'UTC';
  const template = db.prepare(
    'SELECT * FROM todos WHERE id = ? AND recurrence_parent_id IS NULL'
  ).get(templateId);

  if (!template || !template.day_assigned) return 0;

  const interval = template.recurrence_interval_days;
  const pattern = template.recurrence_pattern;
  if (interval == null && pattern == null) return 0;

  const { windowStart, windowEnd } = getWindowBounds(tz);

  const existsStmt = db.prepare(
    'SELECT id FROM todos WHERE recurrence_parent_id = ? AND day_assigned = ?'
  );
  const insertStmt = db.prepare(
    `INSERT INTO todos (user_id, list_id, title, description, day_assigned, approx_time, recurrence_parent_id, completed, archived)
     VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0)`
  );

  let count = 0;

  if (pattern != null) {
    // Iterate every day in the window and insert matching days
    let current = windowStart > template.day_assigned ? windowStart : addDays(template.day_assigned, 1);
    while (current <= windowEnd) {
      if (isPatternMatch(current, pattern) && !existsStmt.get(templateId, current)) {
        insertStmt.run(
          template.user_id, template.list_id, template.title,
          template.description, current, template.approx_time, templateId,
        );
        count++;
      }
      current = addDays(current, 1);
    }
  } else {
    // Interval-based: fast-forward to the window
    const [ty, tm, td] = template.day_assigned.split('-').map(Number);
    const [wy, wm, wd] = windowStart.split('-').map(Number);
    const diffMs = Date.UTC(wy, wm - 1, wd) - Date.UTC(ty, tm - 1, td);
    const diffDays = Math.floor(diffMs / 86400000);

    let current;
    if (diffDays <= 0) {
      current = addDays(template.day_assigned, interval);
    } else {
      const steps = Math.floor(diffDays / interval);
      current = addDays(template.day_assigned, steps * interval);
      if (current < windowStart) current = addDays(current, interval);
    }

    while (current <= windowEnd) {
      if (current !== template.day_assigned && !existsStmt.get(templateId, current)) {
        insertStmt.run(
          template.user_id, template.list_id, template.title,
          template.description, current, template.approx_time, templateId,
        );
        count++;
      }
      current = addDays(current, interval);
    }
  }

  return count;
}

module.exports = { materializeForTemplate, getWindowBounds, addDays };
