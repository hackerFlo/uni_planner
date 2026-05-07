const express = require('express');
const db = require('../db');
const requireAuth = require('../middleware/auth');
const { sanitizeTitle, sanitizeDescription, validateListType, validateDayAssigned, validateRecurrenceInterval } = require('../middleware/validate');
const { materializeForTemplate } = require('../recurrence');

const router = express.Router();
router.use(requireAuth);

const NOW = () => new Date().toISOString();

// Columns for a todo with effective recurrence_interval_days resolved via parent JOIN
const TODO_SELECT = `
  SELECT t.id, t.user_id, t.list_type, t.title, t.description, t.completed, t.archived,
         t.day_assigned, t.created_at, t.updated_at, t.planner_order, t.approx_time,
         t.completed_at, t.recurrence_parent_id,
         COALESCE(t.recurrence_interval_days, p.recurrence_interval_days) AS recurrence_interval_days
  FROM todos t
  LEFT JOIN todos p ON p.id = t.recurrence_parent_id`;

function getTodoById(id) {
  return db.prepare(`${TODO_SELECT} WHERE t.id = ?`).get(id);
}

router.get('/', (req, res) => {
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

router.post('/', (req, res) => {
  const { title, description, list_type, day_assigned, approx_time, recurrence_interval_days } = req.body;

  const cleanTitle = sanitizeTitle(title);
  if (!cleanTitle) return res.status(400).json({ error: 'Title is required (max 200 chars)' });

  const cleanDesc = sanitizeDescription(description);
  if (cleanDesc === null) return res.status(400).json({ error: 'Description too long (max 5000 chars)' });

  const cleanListType = validateListType(list_type);
  if (!cleanListType) return res.status(400).json({ error: 'list_type must be university or private' });

  const cleanDay = validateDayAssigned(day_assigned);
  if (cleanDay === false) return res.status(400).json({ error: 'Invalid day_assigned value' });

  const cleanTime = approx_time ? String(approx_time).trim().slice(0, 50) || null : null;

  const recurrenceInterval = validateRecurrenceInterval(recurrence_interval_days);
  if (recurrenceInterval === false) return res.status(400).json({ error: 'recurrence_interval_days must be 1-7 or null' });
  if (recurrenceInterval != null && !cleanDay) return res.status(400).json({ error: 'A start day is required for recurring tasks' });

  const result = db.prepare(
    'INSERT INTO todos (user_id, list_type, title, description, day_assigned, approx_time, recurrence_interval_days) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(req.user.id, cleanListType, cleanTitle, cleanDesc, cleanDay, cleanTime, recurrenceInterval);

  const materialized = [];
  if (recurrenceInterval != null && cleanDay) {
    const userRow = db.prepare('SELECT notify_tz FROM users WHERE id = ?').get(req.user.id);
    materializeForTemplate(result.lastInsertRowid, userRow?.notify_tz || 'UTC');
    const children = db.prepare(`${TODO_SELECT} WHERE t.recurrence_parent_id = ?`).all(result.lastInsertRowid);
    materialized.push(...children);
  }

  const todo = getTodoById(result.lastInsertRowid);
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

  const templateId = existing.recurrence_parent_id ?? existing.id;
  const isRecurring = existing.recurrence_interval_days != null || existing.recurrence_parent_id != null;

  // Fields that propagate to the whole series
  const seriesUpdates = {};
  // Fields that apply only to this row
  const instanceUpdates = {};

  if (req.body.title !== undefined) {
    const t = sanitizeTitle(req.body.title);
    if (!t) return res.status(400).json({ error: 'Title is required (max 200 chars)' });
    seriesUpdates.title = t;
  }

  if (req.body.description !== undefined) {
    const d = sanitizeDescription(req.body.description);
    if (d === null) return res.status(400).json({ error: 'Description too long' });
    seriesUpdates.description = d;
  }

  if (req.body.list_type !== undefined) {
    const lt = validateListType(req.body.list_type);
    if (!lt) return res.status(400).json({ error: 'Invalid list_type' });
    seriesUpdates.list_type = lt;
  }

  if ('approx_time' in req.body) {
    seriesUpdates.approx_time = req.body.approx_time ? String(req.body.approx_time).trim().slice(0, 50) || null : null;
  }

  if (req.body.completed !== undefined) {
    instanceUpdates.completed = req.body.completed ? 1 : 0;
    if (instanceUpdates.completed === 1) {
      instanceUpdates.archived = 1;
      instanceUpdates.completed_at = NOW();
    }
  }

  if (req.body.archived !== undefined) {
    instanceUpdates.archived = req.body.archived ? 1 : 0;
    if (instanceUpdates.archived === 0) instanceUpdates.completed = 0;
  }

  if (req.body.planner_order !== undefined) {
    const po = Number(req.body.planner_order);
    if (!Number.isInteger(po)) return res.status(400).json({ error: 'Invalid planner_order' });
    instanceUpdates.planner_order = po;
  }

  if ('day_assigned' in req.body) {
    const d = validateDayAssigned(req.body.day_assigned);
    if (d === false) return res.status(400).json({ error: 'Invalid day_assigned value' });
    instanceUpdates.day_assigned = d;
  }

  const hasRecurrenceChange = 'recurrence_interval_days' in req.body;
  let recurrenceInterval;
  if (hasRecurrenceChange) {
    recurrenceInterval = validateRecurrenceInterval(req.body.recurrence_interval_days);
    if (recurrenceInterval === false) return res.status(400).json({ error: 'recurrence_interval_days must be 1-7 or null' });
  }

  const totalChanges = Object.keys(instanceUpdates).length + Object.keys(seriesUpdates).length + (hasRecurrenceChange ? 1 : 0);
  if (totalChanges === 0) return res.status(400).json({ error: 'No valid fields to update' });

  const isChildEdit = existing.recurrence_parent_id != null;

  // Pre-compute which IDs will be detached (child-edit path only) so we can re-select them after
  let willDetachIds = [];
  if (hasRecurrenceChange && isChildEdit) {
    const childDate = existing.day_assigned;
    const earlierSiblings = db.prepare(
      'SELECT id FROM todos WHERE user_id = ? AND recurrence_parent_id = ? AND day_assigned IS NOT NULL AND day_assigned < ?'
    ).all(req.user.id, templateId, childDate);
    willDetachIds = earlierSiblings.map(r => r.id);
    const oldTemplRow = db.prepare('SELECT day_assigned FROM todos WHERE id = ?').get(templateId);
    if (oldTemplRow && (!oldTemplRow.day_assigned || oldTemplRow.day_assigned < childDate)) {
      willDetachIds.push(templateId);
    }
  }

  const now = NOW();

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
      const userRow = db.prepare('SELECT notify_tz FROM users WHERE id = ?').get(req.user.id);
      const userTz = userRow?.notify_tz || 'UTC';
      const todayIso = new Intl.DateTimeFormat('en-CA', {
        timeZone: userTz, year: 'numeric', month: '2-digit', day: '2-digit',
      }).format(new Date());

      if (isChildEdit) {
        const childDate = existing.day_assigned;

        // Detach earlier siblings — they become standalone non-recurring todos
        db.prepare(
          `UPDATE todos SET recurrence_parent_id = NULL, updated_at = ?
           WHERE user_id = ? AND recurrence_parent_id = ?
             AND day_assigned IS NOT NULL AND day_assigned < ?`
        ).run(now, req.user.id, templateId, childDate);

        // Detach old template if its anchor is before the child's date
        if (willDetachIds.includes(templateId)) {
          db.prepare(
            `UPDATE todos SET recurrence_interval_days = NULL, updated_at = ? WHERE id = ? AND user_id = ?`
          ).run(now, templateId, req.user.id);
        }

        // Delete future siblings (>= child's date) — the edited child is promoted, not deleted
        db.prepare(
          `DELETE FROM todos WHERE user_id = ? AND recurrence_parent_id = ?
           AND completed = 0 AND archived = 0 AND day_assigned >= ? AND id != ?`
        ).run(req.user.id, templateId, childDate, id);

        // Promote the edited child to be the new template
        if (recurrenceInterval != null) {
          db.prepare(
            `UPDATE todos SET recurrence_parent_id = NULL, recurrence_interval_days = ?, updated_at = ?
             WHERE id = ? AND user_id = ?`
          ).run(recurrenceInterval, now, id, req.user.id);
          materializeForTemplate(id, userTz);
        } else {
          db.prepare(
            `UPDATE todos SET recurrence_parent_id = NULL, recurrence_interval_days = NULL, updated_at = ?
             WHERE id = ? AND user_id = ?`
          ).run(now, id, req.user.id);
        }
      } else {
        // Template-edit: today-based cutoff, re-materialize from existing anchor
        db.prepare(
          `DELETE FROM todos WHERE user_id = ? AND recurrence_parent_id = ? AND completed = 0 AND archived = 0 AND (day_assigned IS NULL OR day_assigned >= ?)`
        ).run(req.user.id, templateId, todayIso);

        db.prepare(`UPDATE todos SET recurrence_interval_days = ?, updated_at = ? WHERE id = ?`)
          .run(recurrenceInterval, now, templateId);

        if (recurrenceInterval != null) {
          materializeForTemplate(templateId, userTz);
        }
      }
    }
  })();

  const removedIds = [];
  const responseTodo = getTodoById(id);

  let materialized = [];
  if (hasRecurrenceChange) {
    if (isChildEdit) {
      // Promoted child's new children + the detached rows (so client updates their recurrence fields)
      const newChildren = db.prepare(`${TODO_SELECT} WHERE t.recurrence_parent_id = ?`).all(id);
      const detachedRows = willDetachIds.length > 0
        ? db.prepare(`${TODO_SELECT} WHERE t.id IN (${willDetachIds.map(() => '?').join(',')})`).all(...willDetachIds)
        : [];
      materialized = [responseTodo, ...newChildren, ...detachedRows];
    } else {
      materialized = db.prepare(`${TODO_SELECT} WHERE t.recurrence_parent_id = ?`).all(templateId);
    }
  }

  res.json({ todo: responseTodo, materialized, removedIds });
});

router.delete('/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid id' });

  const existing = db.prepare('SELECT recurrence_interval_days, recurrence_parent_id FROM todos WHERE id = ? AND user_id = ?').get(id, req.user.id);
  if (!existing) return res.status(404).json({ error: 'Todo not found' });

  const isTemplate = existing.recurrence_parent_id == null && existing.recurrence_interval_days != null;
  if (isTemplate) {
    db.prepare('DELETE FROM todos WHERE user_id = ? AND (id = ? OR recurrence_parent_id = ?)').run(req.user.id, id, id);
  } else {
    db.prepare('DELETE FROM todos WHERE id = ? AND user_id = ?').run(id, req.user.id);
  }

  res.json({ ok: true });
});

module.exports = router;
