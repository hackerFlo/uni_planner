// Regenerate src/data/emojis.js from emojibase-data.
// Run with: npm run emojis:generate
// Re-run when you upgrade emojibase-data to pick up new Unicode emoji.

import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dir = dirname(fileURLToPath(import.meta.url));
const root = join(__dir, '..');

const compact = JSON.parse(readFileSync(join(root, 'node_modules/emojibase-data/en/compact.json'), 'utf8'));
const cldr = JSON.parse(readFileSync(join(root, 'node_modules/emojibase-data/en/shortcodes/cldr.json'), 'utf8'));

// Regional-indicator letters (A-Z) are building blocks, not standalone emoji.
// They only make sense as pairs (country flags). Skip them.
const REGIONAL_INDICATOR_RE = /^1F1[E-F][0-9A-F]$/i;

function toSnake(str) {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

const entries = [];

for (const item of compact) {
  const { hexcode, unicode, label, tags, group } = item;

  // Skip items that have no group (e.g. standalone regional-indicator letters)
  if (group === undefined) continue;
  if (REGIONAL_INDICATOR_RE.test(hexcode)) continue;

  const names = [];

  // 1. CLDR shortcode (most recognisable)
  const shortcode = cldr[hexcode];
  if (shortcode) {
    const codes = Array.isArray(shortcode) ? shortcode : [shortcode];
    for (const c of codes) names.push(c);
  }

  // 2. Label as snake_case (e.g. "grinning face" → "grinning_face")
  if (label) {
    const snake = toSnake(label);
    if (!names.includes(snake)) names.push(snake);
    // Also individual words from the label that are at least 3 chars
    for (const word of label.split(/\s+/)) {
      const w = toSnake(word);
      if (w.length >= 3 && !names.includes(w)) names.push(w);
    }
  }

  // 3. Tags (keep max 4 to limit file size)
  if (tags) {
    let added = 0;
    for (const tag of tags) {
      if (added >= 4) break;
      const t = toSnake(tag);
      if (t.length >= 2 && !names.includes(t)) { names.push(t); added++; }
    }
  }

  if (names.length === 0) continue;

  entries.push({ e: unicode, n: names });
}

const lines = entries.map(({ e, n }) => `  { e: ${JSON.stringify(e)}, n: ${JSON.stringify(n)} },`);

const output = `// AUTO-GENERATED — do not edit by hand.
// Run \`npm run emojis:generate\` (uses emojibase-data) to regenerate.
export const EMOJIS = [
${lines.join('\n')}
];
`;

const outPath = join(root, 'src/data/emojis.js');
writeFileSync(outPath, output, 'utf8');
console.log(`Wrote ${entries.length} emoji entries to ${outPath}`);
