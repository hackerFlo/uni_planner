const express = require('express');
const db = require('../db');
const requireAuth = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

const PALETTE = ['indigo', 'emerald', 'teal', 'amber', 'rose', 'sky', 'violet', 'pink', 'slate'];

function validateListId(id) {
  const n = parseInt(id, 10);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function validateName(str) {
  if (typeof str !== 'string') return null;
  const s = str.trim();
  return s.length >= 1 && s.length <= 40 ? s : null;
}

function validateColor(str) {
  return PALETTE.includes(str) ? str : null;
}

function ownsListId(userId, listId) {
  return db.prepare('SELECT id FROM lists WHERE id = ? AND user_id = ?').get(listId, userId);
}

router.get('/', (req, res) => {
  const lists = db.prepare(
    'SELECT id, name, color, sort_order FROM lists WHERE user_id = ? ORDER BY sort_order ASC, id ASC'
  ).all(req.user.id);
  res.json({ lists });
});

router.post('/', (req, res) => {
  const name = validateName(req.body.name);
  if (!name) return res.status(400).json({ error: 'Name is required (1–40 chars)' });

  const color = validateColor(req.body.color);
  if (!color) return res.status(400).json({ error: 'Invalid color' });

  const maxOrder = db.prepare('SELECT MAX(sort_order) AS m FROM lists WHERE user_id = ?').get(req.user.id);
  const sort_order = (maxOrder?.m ?? -1) + 1;

  const result = db.prepare(
    'INSERT INTO lists (user_id, name, color, sort_order) VALUES (?, ?, ?, ?)'
  ).run(req.user.id, name, color, sort_order);

  const list = db.prepare('SELECT id, name, color, sort_order FROM lists WHERE id = ? AND user_id = ?').get(result.lastInsertRowid, req.user.id);
  res.status(201).json({ list });
});

// PATCH /reorder must come before PATCH /:id so Express doesn't treat "reorder" as an id
router.patch('/reorder', (req, res) => {
  const order = req.body.order;
  if (!Array.isArray(order) || order.length === 0) {
    return res.status(400).json({ error: 'order must be a non-empty array of list ids' });
  }

  const userLists = db.prepare('SELECT id FROM lists WHERE user_id = ?').all(req.user.id);
  const userIds = new Set(userLists.map(l => l.id));

  if (order.length !== userIds.size) {
    return res.status(400).json({ error: 'order must contain exactly all of the user\'s list ids' });
  }
  for (const id of order) {
    const n = parseInt(id, 10);
    if (!Number.isInteger(n) || !userIds.has(n)) {
      return res.status(400).json({ error: `Invalid list id in order: ${id}` });
    }
  }

  const stmt = db.prepare('UPDATE lists SET sort_order = ? WHERE id = ? AND user_id = ?');
  db.transaction(() => {
    order.forEach((id, idx) => stmt.run(idx, parseInt(id, 10), req.user.id));
  })();

  res.json({ ok: true });
});

router.patch('/:id', (req, res) => {
  const listId = validateListId(req.params.id);
  if (!listId) return res.status(400).json({ error: 'Invalid id' });
  if (!ownsListId(req.user.id, listId)) return res.status(404).json({ error: 'List not found' });

  const updates = {};
  if (req.body.name !== undefined) {
    const name = validateName(req.body.name);
    if (!name) return res.status(400).json({ error: 'Name is required (1–40 chars)' });
    updates.name = name;
  }
  if (req.body.color !== undefined) {
    const color = validateColor(req.body.color);
    if (!color) return res.status(400).json({ error: 'Invalid color' });
    updates.color = color;
  }

  if (!Object.keys(updates).length) return res.status(400).json({ error: 'Nothing to update' });

  const set = Object.keys(updates).map(k => `${k} = ?`).join(', ');
  db.prepare(`UPDATE lists SET ${set} WHERE id = ? AND user_id = ?`).run(...Object.values(updates), listId, req.user.id);

  const list = db.prepare('SELECT id, name, color, sort_order FROM lists WHERE id = ? AND user_id = ?').get(listId, req.user.id);
  res.json({ list });
});

router.delete('/:id', (req, res) => {
  const listId = validateListId(req.params.id);
  if (!listId) return res.status(400).json({ error: 'Invalid id' });
  if (!ownsListId(req.user.id, listId)) return res.status(404).json({ error: 'List not found' });

  const userListCount = db.prepare('SELECT COUNT(*) AS c FROM lists WHERE user_id = ?').get(req.user.id).c;
  if (userListCount <= 1) {
    return res.status(400).json({ error: 'Cannot delete your only list' });
  }

  const todoCount = db.prepare('SELECT COUNT(*) AS c FROM todos WHERE list_id = ? AND user_id = ?').get(listId, req.user.id).c;
  if (todoCount > 0) {
    const moveToRaw = req.query.moveTo;
    if (!moveToRaw) {
      return res.status(400).json({ error: 'This list has todos. Provide moveTo=<listId> to move them first.', todoCount });
    }
    const moveToId = validateListId(moveToRaw);
    if (!moveToId || moveToId === listId) {
      return res.status(400).json({ error: 'Invalid moveTo list id' });
    }
    if (!ownsListId(req.user.id, moveToId)) {
      return res.status(400).json({ error: 'moveTo list not found' });
    }

    db.transaction(() => {
      db.prepare('UPDATE todos SET list_id = ? WHERE list_id = ? AND user_id = ?').run(moveToId, listId, req.user.id);
      db.prepare('DELETE FROM lists WHERE id = ? AND user_id = ?').run(listId, req.user.id);
    })();
  } else {
    db.prepare('DELETE FROM lists WHERE id = ? AND user_id = ?').run(listId, req.user.id);
  }

  res.json({ ok: true });
});

module.exports = router;
