import js from '@eslint/js';
import ts from 'typescript-eslint';
import vue from 'eslint-plugin-vue';
import prettier from 'eslint-config-prettier';
export default ts.config(
  {
    ignores: [
      'dist/**',
      'dist-auth-tests/**',
      'dist-shell-tests/**',
      'node_modules/**',
      'supabase/functions/**',
      'playwright-report/**',
      'test-results/**',
      'test-results-auth/**',
    ],
  },
  js.configs.recommended,
  ...ts.configs.recommended,
  ...vue.configs['flat/recommended'],
  {
    files: ['**/*.vue'],
    languageOptions: {
      globals: { document: 'readonly' },
      parserOptions: { parser: ts.parser },
    },
    rules: { 'vue/multi-word-component-names': 'off', 'no-undef': 'off' },
  },
  prettier,
);
