function addDays(iso, n) {
  const date = new Date(`${iso}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + n);
  return date.toISOString().slice(0, 10);
}

function getWindowBounds(userTz) {
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: userTz, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
  const dayOfWeek = new Date(`${today}T12:00:00Z`).getUTCDay();
  const windowStart = addDays(today, dayOfWeek === 0 ? -6 : 1 - dayOfWeek);
  return { windowStart, windowEnd: addDays(windowStart, 13) };
}

function isPatternMatch(isoDate, pattern) {
  const dayOfWeek = new Date(`${isoDate}T12:00:00Z`).getUTCDay();
  return pattern === 'weekdays' ? dayOfWeek >= 1 && dayOfWeek <= 5
    : pattern === 'weekends' && (dayOfWeek === 0 || dayOfWeek === 6);
}

function candidateDays(template, tz) {
  const { windowStart, windowEnd } = getWindowBounds(tz);
  if (template.day_assigned >= windowEnd) return [];
  const interval = template.recurrence_interval_days;
  const pattern = template.recurrence_pattern;
  const dates = [];
  const afterTemplate = addDays(template.day_assigned, 1);
  for (let day = windowStart > afterTemplate ? windowStart : afterTemplate; day <= windowEnd; day = addDays(day, 1)) {
    const diff = (Date.parse(day) - Date.parse(template.day_assigned)) / 86400000;
    const matches = pattern !== null ? isPatternMatch(day, pattern) : interval > 0 && diff % interval === 0;
    if (matches) dates.push(day);
  }
  return dates;
}

function materializeForTemplate(db, templateId, userTz, userId) {
  const template = db.prepare('SELECT * FROM todos WHERE id=? AND recurrence_parent_id IS NULL AND user_id=?')
    .get(templateId, userId);
  if (!template?.day_assigned || (template.recurrence_interval_days === null && template.recurrence_pattern === null)) return 0;
  const existing = db.prepare('SELECT day_assigned FROM todos WHERE recurrence_parent_id=? AND user_id=?').all(templateId, userId);
  const existingDays = new Set(existing.map(row => row.day_assigned));
  const insert = db.prepare(`INSERT INTO todos(user_id,list_id,title,description,day_assigned,approx_time,
    recurrence_parent_id,completed,archived) VALUES(?,?,?,?,?,?,?,0,0)`);
  let count = 0;
  for (const day of candidateDays(template, userTz || 'UTC')) {
    if (existingDays.has(day)) continue;
    insert.run(userId, template.list_id, template.title, template.description, day, template.approx_time, templateId);
    count += 1;
  }
  return count;
}

function materializeWindowForUser(db, userId, userTz) {
  // The template is the first occurrence; completing it must not end its series.
  const templates = db.prepare(`SELECT id FROM todos WHERE user_id=? AND recurrence_parent_id IS NULL
    AND (recurrence_interval_days IS NOT NULL OR recurrence_pattern IS NOT NULL)`).all(userId);
  return db.transaction(() => templates.reduce((total, row) =>
    total + materializeForTemplate(db, row.id, userTz || 'UTC', userId), 0))();
}

function listRecurringUsers(db) {
  return db.prepare(`SELECT DISTINCT u.id,u.notify_tz FROM users u INNER JOIN todos t ON t.user_id=u.id
    WHERE t.recurrence_parent_id IS NULL
    AND (t.recurrence_interval_days IS NOT NULL OR t.recurrence_pattern IS NOT NULL)`).all();
}

function createRecurrenceService(db) {
  return {
    materializeForTemplate: (id, tz, userId) => materializeForTemplate(db, id, tz, userId),
    materializeWindowForUser: (userId, tz) => materializeWindowForUser(db, userId, tz),
    listRecurringUsers: () => listRecurringUsers(db),
  };
}

// Existing callers retain their API; injected services never open another database.
module.exports = { createRecurrenceService, getWindowBounds, addDays,
  materializeForTemplate: (...args) => materializeForTemplate(require('./db'), ...args),
  materializeWindowForUser: (...args) => materializeWindowForUser(require('./db'), ...args),
  listRecurringUsers: () => listRecurringUsers(require('./db')),
};
