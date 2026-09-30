const test = require('node:test');
const assert = require('node:assert/strict');
const { paginate, pageWindow } = require('./pagination');
const context = { userId: 1 };
const version = { epoch: 'a'.repeat(32), revision: 1 };

test('bounded query window and legacy array pagination share canonical cursor semantics', () => {
  const args = { limit: 2, filters: { to: '2026-10-01', from: '2026-09-01' } };
  const first = paginate([1, 2, 3], context, args, version);
  assert.deepEqual(first.items, [1, 2]);
  const reordered = { filters: { from: '2026-09-01', to: '2026-10-01' }, limit: 2, cursor: first.nextCursor };
  const page = pageWindow(context, reordered, version);
  assert.equal(page.offset, 2);
  assert.deepEqual(page.finish([3]), { items: [3], nextCursor: null });
  assert.deepEqual(paginate([1, 2, 3], context, reordered, version), { items: [3], nextCursor: null });
});
