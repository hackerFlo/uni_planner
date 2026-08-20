// Flat config (ESLint 9) for the CommonJS server. Same intent as the client
// config: catch real defects, not formatting.
import js from '@eslint/js';
import globals from 'globals';

export default [
  { ignores: ['node_modules/**', 'planner.db*'] },
  js.configs.recommended,
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'commonjs',
      globals: { ...globals.node },
    },
    rules: {
      'no-undef': 'error',
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', ignoreRestSiblings: true }],
      // EL-1: an empty catch is banned outright in this project.
      'no-empty': ['error', { allowEmptyCatch: false }],
      // console.* is banned in shipped server code; index.js has two
      // documented exceptions that run before the logger exists.
      'no-console': 'error',
      'require-atomic-updates': 'warn',
    },
  },
  {
    // Sequential `process.env` writes around an await are the normal shape of a
    // test that swaps an env var and puts it back; the rule cannot tell that
    // apart from a real interleaving hazard.
    files: ['**/*.test.js'],
    rules: { 'require-atomic-updates': 'off' },
  },
];
