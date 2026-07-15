import js from '@eslint/js';
import globals from 'globals';
import html from '@html-eslint/eslint-plugin';
import htmlParser from '@html-eslint/parser';

export default [
  { ignores: ['node_modules/**'] },

  // Node test harness + specs (CommonJS)
  {
    files: ['test/**/*.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'commonjs',
      globals: { ...globals.node },
    },
    rules: {
      ...js.configs.recommended.rules,
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-empty': ['error', { allowEmptyCatch: true }],
    },
  },

  // ESM tooling config files
  {
    files: ['**/*.mjs'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.node },
    },
    rules: { ...js.configs.recommended.rules },
  },

  // HTML documents: correctness only. Formatting (indentation, attribute
  // wrapping, etc.) is owned by Prettier, so we deliberately do NOT pull in
  // @html-eslint's stylistic rules - that avoids the two tools fighting.
  {
    files: ['**/*.html'],
    plugins: { '@html-eslint': html },
    languageOptions: { parser: htmlParser },
    rules: {
      '@html-eslint/no-duplicate-id': 'error',
      '@html-eslint/no-duplicate-attrs': 'error',
      '@html-eslint/no-obsolete-tags': 'error',
      '@html-eslint/require-doctype': 'error',
      '@html-eslint/require-lang': 'error',
      '@html-eslint/require-title': 'error',
      '@html-eslint/no-multiple-h1': 'error',
      '@html-eslint/require-img-alt': 'warn',
    },
  },
];
