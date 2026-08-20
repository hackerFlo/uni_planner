// Flat config (ESLint 9). Deliberately NOT a style linter -- Prettier is not
// wired up and reformatting the whole tree would bury every real diff. The one
// job here is the class of bug that actually shipped: a JSX component used but
// never imported, which `vite build` accepts silently and which crashes at
// runtime the first time that branch renders.
import js from '@eslint/js';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

export default [
  { ignores: ['dist/**', 'node_modules/**', 'dev-dist/**', 'src/data/emojis.js'] },
  js.configs.recommended,
  {
    files: ['**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.browser, __APP_VERSION__: 'readonly', __APP_COMMIT__: 'readonly' },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    settings: { react: { version: 'detect' } },
    plugins: { react, 'react-hooks': reactHooks },
    rules: {
      // The rule this whole setup exists for.
      'react/jsx-no-undef': 'error',
      'no-undef': 'error',
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      'react/jsx-uses-react': 'off',
      'react/react-in-jsx-scope': 'off',
      'react/jsx-uses-vars': 'error',
      'no-empty': ['error', { allowEmptyCatch: false }], // EL-1
    },
  },
  {
    files: ['**/*.test.js'],
    languageOptions: { globals: { ...globals.node } },
  },
  {
    // Build tooling and scripts run in Node, not the browser.
    files: ['vite.config.js', 'tailwind.config.js', 'postcss.config.js', 'scripts/**/*.{js,mjs}', 'eslint.config.mjs'],
    languageOptions: { sourceType: 'module', globals: { ...globals.node } },
  },
];
