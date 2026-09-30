const { z } = require('zod');
const { DomainError } = require('./errors');

const versionSchema = z.strictObject({ epoch: z.string().regex(/^[a-f0-9]{32}$/), revision: z.number().int().nonnegative().safe() });
const mutationControlSchema = z.strictObject({ expectedVersion: versionSchema, idempotencyKey: z.uuid() });
const idSchema = z.number().int().positive().safe();
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  if (value.startsWith('0000-')) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
});

function parse(schema, input) {
  const result = schema.safeParse(input);
  if (!result.success) throw new DomainError('VALIDATION_ERROR', 'Invalid input');
  return result.data;
}

module.exports = { versionSchema, mutationControlSchema, idSchema, dateSchema, parse };
