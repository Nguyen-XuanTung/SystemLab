import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';

export default tseslint.config(
  {
    ignores: ['dist', 'coverage', 'node_modules', 'playwright-report', 'test-results'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.flat.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  {
    // Strict purity rules for the simulation engine: zero React, DOM, timers, or Math.random
    files: ['src/engine/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['react', 'react-dom', '@xyflow/*', 'zustand', 'dexie', 'recharts'],
              message: 'src/engine/ must remain framework- and UI-independent pure TypeScript.',
            },
          ],
        },
      ],
      'no-restricted-globals': [
        'error',
        { name: 'window', message: 'src/engine/ must not access window.' },
        { name: 'document', message: 'src/engine/ must not access document.' },
        { name: 'localStorage', message: 'src/engine/ must not access localStorage.' },
        { name: 'indexedDB', message: 'src/engine/ must not access indexedDB.' },
        { name: 'setTimeout', message: 'Use VirtualClock and MinHeap instead of setTimeout.' },
        { name: 'setInterval', message: 'Use VirtualClock and MinHeap instead of setInterval.' },
      ],
      'no-restricted-properties': [
        'error',
        {
          object: 'Math',
          property: 'random',
          message: 'Use SeededRng from src/engine/random/prng.ts instead of Math.random().',
        },
      ],
    },
  },
);
