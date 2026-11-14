import test from 'node:test';
import assert from 'node:assert/strict';

import { nextFadePhase, finishFade } from './fadePhase.js';

test.describe('nextFadePhase', () => {
  test('enters the skeleton phase when the skeleton first shows', () => {
    assert.equal(nextFadePhase('idle', true), 'skeleton');
  });

  test('stays idle for content that never had a skeleton', () => {
    assert.equal(nextFadePhase('idle', false), 'idle');
  });

  test('fades when the skeleton gives way to content', () => {
    assert.equal(nextFadePhase('skeleton', false), 'fading');
  });

  test('does not fade again on a later skeleton, such as a refetch', () => {
    assert.equal(nextFadePhase('done', true), 'done');
  });

  test('keeps fading while content stays', () => {
    assert.equal(nextFadePhase('fading', false), 'fading');
  });
});

test.describe('finishFade', () => {
  test('ends a running fade', () => {
    assert.equal(finishFade('fading'), 'done');
  });

  test('leaves other phases alone', () => {
    assert.equal(finishFade('skeleton'), 'skeleton');
  });
});
