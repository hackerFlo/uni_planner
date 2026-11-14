import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { reportOwnWrite, subscribeOwnWrites } from './ownWrites.js';
import { PlannerResource } from '../hooks/plannerResource.js';

const epoch = 'a'.repeat(32);
const key = '12345678-1234-4234-8234-123456789abc';
const collect = () => {
  const seen = [];
  return { seen, off: subscribeOwnWrites((expected, version) => seen.push(version)) };
};

describe('reportOwnWrite', () => {
  it('announces a write that advanced the revision by exactly one', () => {
    const { seen, off } = collect();
    reportOwnWrite({ epoch, revision: 4 }, { epoch, revision: 5 });
    off();
    assert.deepEqual(seen, [{ epoch, revision: 5 }]);
  });

  it('stays silent when the revision jumped further', () => {
    const { seen, off } = collect();
    reportOwnWrite({ epoch, revision: 4 }, { epoch, revision: 6 });
    off();
    assert.deepEqual(seen, []);
  });

  it('stays silent when the epoch changed', () => {
    const { seen, off } = collect();
    reportOwnWrite({ epoch, revision: 4 }, { epoch: 'b'.repeat(32), revision: 5 });
    off();
    assert.deepEqual(seen, []);
  });

  it('stays silent after unsubscribing', () => {
    const { seen, off } = collect();
    off();
    reportOwnWrite({ epoch, revision: 4 }, { epoch, revision: 5 });
    assert.deepEqual(seen, []);
  });
});

describe('PlannerResource.mutate', () => {
  it('reports its own write against the version it sent', async () => {
    const { seen, off } = collect();
    const resource = new PlannerResource({ read: async () => ({ rows: [], version: { epoch, revision: 1 } }), select: x => x.rows });
    await resource.refresh();
    const next = { epoch, revision: 2 };
    await resource.mutate(async () => ({ resultVersion: next, currentVersion: next }), { idempotencyKey: key });
    off();
    assert.deepEqual(seen, [next]);
  });
});
