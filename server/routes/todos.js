const express = require('express');
const db = require('../db');
const requireAuth = require('../middleware/auth');
const { sanitizeTitle, sanitizeDescription, validateDayAssigned, validateRecurrenceInterval, validateRecurrencePattern } = require('../middleware/validate');
const { materializeForTemplate, materializeWindowForUser } = require('../recurrence');

const router = express.Router();
router.use(requireAuth);

const NOW = () => new Date().toISOString();

// Columns for a todo with effective recurrence fields resolved via parent JOIN
const TODO_SELECT = `
  SELECT t.id, t.user_id, t.list_id, t.title, t.description, t.completed, t.archived,
         t.day_assigned, t.created_at, t.updated_at, t.planner_order, t.approx_time,
         t.completed_at, t.recurrence_parent_id,
         COALESCE(t.recurrence_interval_days, p.recurrence_interval_days) AS recurrence_interval_days,
         COALESCE(t.recurrence_pattern, p.recurrence_pattern) AS recurrence_pattern
  FROM todos t
  LEFT JOIN todos p ON p.id = t.recurrence_parent_id AND p.user_id = t.user_id`;

function getTodoById(id, userId) {
  return db.prepare(`${TODO_SELECT} WHERE t.id = ? AND t.user_id = ?`).get(id, userId);
}

function validateUserOwnsList(userId, listId) {
  const n = parseInt(listId, 10);
  if (!Number.isInteger(n) || n <= 0) return null;
  return db.prepare('SELECT id FROM lists WHERE id = ? AND user_id = ?').get(n, userId) ? n : null;
}

// Parses and validates PATCH body fields. Returns { error } or update buckets.
function parseTodoUpdates(body, existing, userId) {
  const seriesUpdates = {};
  const instanceUpdates = {};

  if (body.title !== undefined) {
    const t = sanitizeTitle(body.title);
    if (!t) return { error: 'Title is required (max 200 chars)' };
    seriesUpdates.title = t;
  }

  if (body.description !== undefined) {
    const d = sanitizeDescription(body.description);
    if (d === null) return { error: 'Description too long' };
    seriesUpdates.description = d;
  }

  if (body.list_id !== undefined) {
    const lid = validateUserOwnsList(userId, body.list_id);
    if (!lid) return { error: 'Invalid list_id' };
    seriesUpdates.list_id = lid;
  }

  if ('approx_time' in body) {
    seriesUpdates.approx_time = body.approx_time ? String(body.approx_time).trim().slice(0, 50) || null : null;
  }

  if (body.completed !== undefined) {
    instanceUpdates.completed = body.completed ? 1 : 0;
    if (instanceUpdates.completed === 1) {
      instanceUpdates.archived = 1;
      instanceUpdates.completed_at = NOW();
    }
  }

  if (body.archived !== undefined) {
    instanceUpdates.archived = body.archived ? 1 : 0;
    if (instanceUpdates.archived === 0) instanceUpdates.completed = 0;
  }

  if (body.planner_order !== undefined) {
    const po = Number(body.planner_order);
    if (!Number.isInteger(po)) return { error: 'Invalid planner_order' };
    instanceUpdates.planner_order = po;
  }

  if ('day_assigned' in body) {
    const d = validateDayAssigned(body.day_assigned);
    if (d === false) return { error: 'Invalid day_assigned value' };
    instanceUpdates.day_assigned = d;
  }

  const hasRecurrenceChange = 'recurrence_interval_days' in body || 'recurrence_pattern' in body;
  let recurrenceInterval = null;
  let recurrencePattern = null;

  if (hasRecurrenceChange) {
    recurrenceInterval = validateRecurrenceInterval(body.recurrence_interval_days);
    if (recurrenceInterval === false) return { error: 'recurrence_interval_days must be 1-7 or null' };
    recurrencePattern = validateRecurrencePattern(body.recurrence_pattern);
    if (recurrencePattern === false) return { error: 'recurrence_pattern must be weekdays, weekends, or null' };
    if (recurrenceInterval != null && recurrencePattern != null) {
      return { error: 'Cannot set both recurrence_interval_days and recurrence_pattern' };
    }
  }

  const totalChanges =
    Object.keys(instanceUpdates).length + Object.keys(seriesUpdates).length + (hasRecurrenceChange ? 1 : 0);
  if (totalChanges === 0) return { error: 'No valid fields to update' };

  return { seriesUpdates, instanceUpdates, hasRecurrenceChange, recurrenceInterval, recurrencePattern };
}

// Applies recurrence changes inside an open transaction. Also returns IDs detached from old series.
function applyRecurrenceChange(id, existing, templateId, isChildEdit, recurrenceInterval, recurrencePattern, isNewRecurring, now, userId) {
  const userRow = db.prepare('SELECT notify_tz FROM users WHERE id = ?').get(userId);
  const userTz = userRow?.notify_tz || 'UTC';
  const todayIso = new Intl.DateTimeFormat('en-CA', {
    timeZone: userTz, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());

  let willDetachIds = [];

  if (isChildEdit) {
    const childDate = existing.day_assigned;
    const earlierSiblings = db.prepare(
      'SELECT id FROM todos WHERE user_id = ? AND recurrence_parent_id = ? AND day_assigned IS NOT NULL AND day_assigned < ?'
    ).all(userId, templateId, childDate);
    willDetachIds = earlierSiblings.map(r => r.id);
    const oldTemplRow = db.prepare('SELECT day_assigned FROM todos WHERE id = ? AND user_id = ?').get(templateId, userId);
    if (oldTemplRow && (!oldTemplRow.day_assigned || oldTemplRow.day_assigned < childDate)) {
      willDetachIds.push(templateId);
    }

    db.prepare(
      `UPDATE todos SET recurrence_parent_id = NULL, updated_at = ?
       WHERE user_id = ? AND recurrence_parent_id = ?
         AND day_assigned IS NOT NULL AND day_assigned < ?`
    ).run(now, userId, templateId, childDate);

    if (willDetachIds.includes(templateId)) {
      db.prepare(
        `UPDATE todos SET recurrence_interval_days = NULL, recurrence_pattern = NULL, updated_at = ? WHERE id = ? AND user_id = ?`
      ).run(now, templateId, userId);
    }

    db.prepare(
      `DELETE FROM todos WHERE user_id = ? AND recurrence_parent_id = ?
       AND completed = 0 AND archived = 0 AND day_assigned >= ? AND id != ?`
    ).run(userId, templateId, childDate, id);

    if (isNewRecurring) {
      db.prepare(
        `UPDATE todos SET recurrence_parent_id = NULL, recurrence_interval_days = ?, recurrence_pattern = ?, updated_at = ?
         WHERE id = ? AND user_id = ?`
      ).run(recurrenceInterval, recurrencePattern, now, id, userId);
      materializeForTemplate(id, userTz, userId);
    } else {
      db.prepare(
        `UPDATE todos SET recurrence_parent_id = NULL, recurrence_interval_days = NULL, recurrence_pattern = NULL, updated_at = ?
         WHERE id = ? AND user_id = ?`
      ).run(now, id, userId);
    }
  } else {
    db.prepare(
      `DELETE FROM todos WHERE user_id = ? AND recurrence_parent_id = ? AND completed = 0 AND archived = 0 AND (day_assigned IS NULL OR day_assigned >= ?)`
    ).run(userId, templateId, todayIso);

    db.prepare(`UPDATE todos SET recurrence_interval_days = ?, recurrence_pattern = ?, updated_at = ? WHERE id = ? AND user_id = ?`)
      .run(recurrenceInterval, recurrencePattern, now, templateId, userId);

    if (isNewRecurring) {
      materializeForTemplate(templateId, userTz, userId);
    }
  }

  return { willDetachIds };
}

router.get('/', (req, res) => {
  const userRow = db.prepare('SELECT notify_tz FROM users WHERE id = ?').get(req.user.id);
  materializeWindowForUser(req.user.id, userRow?.notify_tz || 'UTC');
  const todos = db.prepare(
    `${TODO_SELECT} WHERE t.user_id = ? AND t.archived = 0 ORDER BY t.created_at DESC`
  ).all(req.user.id);
  res.json({ todos });
});

router.get('/archived', (req, res) => {
  const todos = db.prepare(
    `${TODO_SELECT} WHERE t.user_id = ? AND t.archived = 1 ORDER BY t.updated_at DESC`
  ).all(req.user.id);
  res.json({ todos });
});

// Completed work for a date range, so a day column can show what was actually
// done there. Deliberately range-bound rather than "all completed": the planner
// only ever asks about one visible week, and an unbounded archive query would
// grow without limit for no one's benefit. GET /archived remains the full view.
const MAX_COMPLETED_RANGE_DAYS = 62;

router.get('/completed', (req, res) => {
  const from = validateDayAssigned(req.query.from);
  const to = validateDayAssigned(req.query.to);
  if (!from || !to) return res.status(400).json({ error: 'from and to must be YYYY-MM-DD dates' });
  if (to < from) return res.status(400).json({ error: 'to must not precede from' });

  const spanDays = Math.round(
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000
  );
  if (!Number.isFinite(spanDays) || spanDays > MAX_COMPLETED_RANGE_DAYS) {
    return res.status(400).json({ error: 'Range too large' });
  }

  const todos = db.prepare(
    `${TODO_SELECT} WHERE t.user_id = ? AND t.completed = 1
       AND t.day_assigned IS NOT NULL AND t.day_assigned >= ? AND t.day_assigned <= ?
     ORDER BY t.day_assigned ASC, t.completed_at ASC`
  ).all(req.user.id, from, to);
  res.json({ todos });
});

router.post('/', (req, res) => {
  const { title, description, list_id, day_assigned, approx_time, recurrence_interval_days, recurrence_pattern } = req.body;

  const cleanTitle = sanitizeTitle(title);
  if (!cleanTitle) return res.status(400).json({ error: 'Title is required (max 200 chars)' });

  const cleanDesc = sanitizeDescription(description);
  if (cleanDesc === null) return res.status(400).json({ error: 'Description too long (max 5000 chars)' });

  const cleanListId = validateUserOwnsList(req.user.id, list_id);
  if (!cleanListId) return res.status(400).json({ error: 'Invalid list_id' });

  const cleanDay = validateDayAssigned(day_assigned);
  if (cleanDay === false) return res.status(400).json({ error: 'Invalid day_assigned value' });

  const cleanTime = approx_time ? String(approx_time).trim().slice(0, 50) || null : null;

  const recurrenceInterval = validateRecurrenceInterval(recurrence_interval_days);
  if (recurrenceInterval === false) return res.status(400).json({ error: 'recurrence_interval_days must be 1-7 or null' });

  const recurrencePattern = validateRecurrencePattern(recurrence_pattern);
  if (recurrencePattern === false) return res.status(400).json({ error: 'recurrence_pattern must be weekdays, weekends, or null' });
  if (recurrenceInterval != null && recurrencePattern != null) return res.status(400).json({ error: 'Cannot set both recurrence_interval_days and recurrence_pattern' });

  const isRecurringCreate = recurrenceInterval != null || recurrencePattern != null;
  if (isRecurringCreate && !cleanDay) return res.status(400).json({ error: 'A start day is required for recurring tasks' });

  const result = db.prepare(
    'INSERT INTO todos (user_id, list_id, title, description, day_assigned, approx_time, recurrence_interval_days, recurrence_pattern) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(req.user.id, cleanListId, cleanTitle, cleanDesc, cleanDay, cleanTime, recurrenceInterval, recurrencePattern);

  const materialized = [];
  if (isRecurringCreate && cleanDay) {
    const userRow = db.prepare('SELECT notify_tz FROM users WHERE id = ?').get(req.user.id);
    materializeForTemplate(result.lastInsertRowid, userRow?.notify_tz || 'UTC', req.user.id);
    const children = db.prepare(`${TODO_SELECT} WHERE t.recurrence_parent_id = ? AND t.user_id = ?`).all(result.lastInsertRowid, req.user.id);
    materialized.push(...children);
  }

  const todo = getTodoById(result.lastInsertRowid, req.user.id);
  res.status(201).json({ todo, materialized });
});

router.patch('/reorder', (req, res) => {
  const items = req.body.items;
  if (!Array.isArray(items)) return res.status(400).json({ error: 'items must be an array' });

  const stmt = db.prepare('UPDATE todos SET planner_order = ?, updated_at = ? WHERE id = ? AND user_id = ?');
  const now = NOW();

  const updateMany = db.transaction((rows) => {
    for (const { id, planner_order } of rows) {
      const numId = parseInt(id, 10);
      const numOrder = parseInt(planner_order, 10);
      if (!Number.isInteger(numId) || !Number.isInteger(numOrder)) continue;
      stmt.run(numOrder, now, numId, req.user.id);
    }
  });

  updateMany(items);
  res.json({ ok: true });
});

router.patch('/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid id' });

  const existing = db.prepare('SELECT * FROM todos WHERE id = ? AND user_id = ?').get(id, req.user.id);
  if (!existing) return res.status(404).json({ error: 'Todo not found' });

  const parsed = parseTodoUpdates(req.body, existing, req.user.id);
  if (parsed.error) return res.status(400).json({ error: parsed.error });

  const { seriesUpdates, instanceUpdates, hasRecurrenceChange, recurrenceInterval, recurrencePattern } = parsed;
  const isNewRecurring = recurrenceInterval != null || recurrencePattern != null;
  const templateId = existing.recurrence_parent_id ?? existing.id;
  const isRecurring = existing.recurrence_interval_days != null || existing.recurrence_pattern != null || existing.recurrence_parent_id != null;
  const isChildEdit = existing.recurrence_parent_id != null;

  const now = NOW();
  let willDetachIds = [];

  db.transaction(() => {
    if (Object.keys(seriesUpdates).length > 0) {
      seriesUpdates.updated_at = now;
      const setStr = Object.keys(seriesUpdates).map(k => `${k} = ?`).join(', ');
      if (isRecurring) {
        db.prepare(`UPDATE todos SET ${setStr} WHERE user_id = ? AND (id = ? OR recurrence_parent_id = ?)`)
          .run(...Object.values(seriesUpdates), req.user.id, templateId, templateId);
      } else {
        db.prepare(`UPDATE todos SET ${setStr} WHERE id = ? AND user_id = ?`)
          .run(...Object.values(seriesUpdates), id, req.user.id);
      }
    }

    if (Object.keys(instanceUpdates).length > 0) {
      instanceUpdates.updated_at = now;
      const setStr = Object.keys(instanceUpdates).map(k => `${k} = ?`).join(', ');
      db.prepare(`UPDATE todos SET ${setStr} WHERE id = ? AND user_id = ?`)
        .run(...Object.values(instanceUpdates), id, req.user.id);
    }

    if (hasRecurrenceChange) {
      const result = applyRecurrenceChange(
        id, existing, templateId, isChildEdit,
        recurrenceInterval, recurrencePattern, isNewRecurring,
        now, req.user.id
      );
      willDetachIds = result.willDetachIds;
    }
  })();

  const responseTodo = getTodoById(id, req.user.id);
  let materialized = [];

  if (hasRecurrenceChange) {
    if (isChildEdit) {
      const newChildren = db.prepare(`${TODO_SELECT} WHERE t.recurrence_parent_id = ? AND t.user_id = ?`).all(id, req.user.id);
      const detachedRows = willDetachIds.length > 0
        ? db.prepare(`${TODO_SELECT} WHERE t.id IN (${willDetachIds.map(() => '?').join(',')}) AND t.user_id = ?`).all(...willDetachIds, req.user.id)
        : [];
      materialized = [responseTodo, ...newChildren, ...detachedRows];
    } else {
      materialized = db.prepare(`${TODO_SELECT} WHERE t.recurrence_parent_id = ? AND t.user_id = ?`).all(templateId, req.user.id);
    }
  }

  res.json({ todo: responseTodo, materialized, removedIds: [] });
});

router.delete('/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid id' });

  const scope = req.query.scope ?? 'single';
  if (scope !== 'single' && scope !== 'all') return res.status(400).json({ error: 'scope must be single or all' });

  const existing = db.prepare('SELECT recurrence_interval_days, recurrence_pattern, recurrence_parent_id FROM todos WHERE id = ? AND user_id = ?').get(id, req.user.id);
  if (!existing) return res.status(404).json({ error: 'Todo not found' });

  if (scope === 'all') {
    const templateId = existing.recurrence_parent_id ?? id;
    db.prepare('DELETE FROM todos WHERE user_id = ? AND (id = ? OR recurrence_parent_id = ?)').run(req.user.id, templateId, templateId);
  } else {
    db.prepare('DELETE FROM todos WHERE id = ? AND user_id = ?').run(id, req.user.id);
  }

  res.json({ ok: true });
});

module.exports = router;
