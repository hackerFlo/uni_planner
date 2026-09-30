const { z } = require('zod');
const { idSchema, dateSchema, parse } = require('../domain/schemas');
const { DomainError } = require('../domain/errors');
const { sanitizeTitle } = require('../middleware/validate');

const fields = { title: z.string().transform(sanitizeTitle).refine(Boolean), exam_date: dateSchema };
const examSchemas = {
  create: z.strictObject(fields),
  update: z.strictObject({ id: idSchema, title: fields.title.optional(), exam_date: fields.exam_date.optional() })
    .refine(value => value.title !== undefined || value.exam_date !== undefined),
  remove: z.strictObject({ id: idSchema }),
};

function ownedExam(db, userId, id) {
  const exam = db.prepare('SELECT id, title, exam_date FROM exams WHERE id = ? AND user_id = ?').get(id, userId);
  if (!exam) throw new DomainError('NOT_FOUND', 'Exam not found', 404);
  return exam;
}

function createExam(db, userId, { title, exam_date }) {
  return db.transaction(() => {
    const result = db.prepare('INSERT INTO exams (user_id, title, exam_date) VALUES (?, ?, ?)').run(userId, title, exam_date);
    return ownedExam(db, userId, result.lastInsertRowid);
  })();
}

function updateExam(db, userId, { id, ...updates }) {
  return db.transaction(() => {
    const before = ownedExam(db, userId, id);
    db.prepare(`UPDATE exams SET title = ?, exam_date = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
      WHERE id = ? AND user_id = ?`).run(updates.title ?? before.title, updates.exam_date ?? before.exam_date, id, userId);
    return ownedExam(db, userId, id);
  })();
}

function removeExam(db, userId, { id }) {
  const result = db.prepare('DELETE FROM exams WHERE id = ? AND user_id = ?').run(id, userId);
  if (!result.changes) throw new DomainError('NOT_FOUND', 'Exam not found', 404);
  return { ok: true };
}

function createExamService(db) {
  return {
    list: ({ userId }) => db.prepare('SELECT id, title, exam_date FROM exams WHERE user_id = ? ORDER BY exam_date ASC, id ASC').all(userId),
    create: ({ userId }, args) => createExam(db, userId, parse(examSchemas.create, args)),
    update: ({ userId }, args) => updateExam(db, userId, parse(examSchemas.update, args)),
    remove: ({ userId }, args) => removeExam(db, userId, parse(examSchemas.remove, args)),
  };
}

module.exports = { createExamService, examSchemas };
