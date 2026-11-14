import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { shareStructure } from './shareStructure.js';
import { PlannerResource } from './plannerResource.js';

const rows = () => [{ id: 1, text: 'a', tags: ['x'] }, { id: 2, text: 'b', tags: [] }];

describe('shareStructure', () => {
  it('keeps the array identity when nothing changed', () => {
    const previous = rows();
    assert.equal(shareStructure(previous, rows()), previous);
  });

  it('reuses unchanged rows and replaces the changed one', () => {
    const previous = rows();
    const next = rows();
    next[1].text = 'changed';
    const shared = shareStructure(previous, next);
    assert.deepEqual([shared[0] === previous[0], shared[1] !== previous[1], shared[1].text], [true, true, 'changed']);
  });

  it('matches rows by id when the order changes', () => {
    const previous = rows();
    const shared = shareStructure(previous, rows().reverse());
    assert.deepEqual([shared[0] === previous[1], shared[1] === previous[0]], [true, true]);
  });

  it('reuses unchanged nested values inside a changed row', () => {
    const previous = rows();
    const next = rows();
    next[0].text = 'changed';
    assert.equal(shareStructure(previous, next)[0].tags, previous[0].tags);
  });

  it('returns a new array when a row was removed', () => {
    const previous = rows();
    const shared = shareStructure(previous, previous.slice(0, 1));
    assert.deepEqual([shared.length, shared[0] === previous[0]], [1, true]);
  });

  it('returns the new value when a field was added', () => {
    const previous = { a: 1 };
    assert.deepEqual(shareStructure(previous, { a: 1, b: 2 }), { a: 1, b: 2 });
  });

  it('does not treat null and an object as equal', () => {
    assert.deepEqual(shareStructure({ a: null }, { a: { b: 1 } }), { a: { b: 1 } });
  });

  it('accepts the first load with no previous value', () => {
    const next = rows();
    assert.equal(shareStructure(null, next), next);
  });
});

describe('PlannerResource structural sharing', () => {
  const version = n => ({ epoch: 'a'.repeat(32), revision: n });
  it('keeps the data identity across an identical refetch', async () => {
    let revision = 0;
    const resource = new PlannerResource({ read: async () => ({ rows: rows(), version: version(revision++) }), select: x => x.rows });
    await resource.refresh();
    const first = resource.state.data;
    await resource.refresh();
    assert.equal(resource.state.data, first);
  });
});
