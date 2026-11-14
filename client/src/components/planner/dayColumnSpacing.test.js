import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

// Tailwind's space-y writes margin-bottom: 0 on every non-first child with a
// specificity that beats the cards' own mb-2, leaving only the first card a gap.
const SPACE_Y = /space-y-\d/;

function listBodyOpeningTag(source) {
  const start = source.indexOf('onAnimationEnd={onFadeEnd}');
  return source.slice(source.lastIndexOf('<div', start), start);
}

describe('day column list body', () => {
  const source = readFileSync(new URL('./DayColumn.jsx', import.meta.url), 'utf8');

  it('does not apply space-y to the element holding the cards', () => {
    assert.doesNotMatch(listBodyOpeningTag(source), SPACE_Y);
  });

  it('keeps the bottom margin on each card variant', () => {
    const cards = ['AssignedCard.jsx', 'DividerCard.jsx'].map(f => readFileSync(new URL(`./${f}`, import.meta.url), 'utf8'));
    assert.ok(cards.every(c => c.includes('mb-2 !mt-0')));
  });
});
