// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 oudia-second-web contributors

import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

export default [
  {
    // origin/ は原典ソース(読み取り専用)。ビルド対象外なので lint しない。
    ignores: ['origin/**', '**/dist/**', '**/coverage/**', '**/fixtures/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  {
    // 型情報つき lint は packages/apps の TS ソースにのみ適用する。
    files: ['packages/**/*.ts', 'apps/**/*.ts', 'apps/**/*.tsx'],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // コーディング規約 §1: any 禁止、enum 不使用等は TS 設定・レビューで担保。
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/switch-exhaustiveness-check': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  {
    // テストファイルは非 null アサーション等をやや緩める(可読性優先)。
    files: ['**/*.test.ts', '**/*.bench.ts'],
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },
  {
    // ルート直下のツール設定ファイル(型情報なしで軽く検査する)。
    files: ['*.config.ts', '*.config.js', 'eslint.config.js'],
    languageOptions: {
      globals: { ...globals.node },
    },
    ...tseslint.configs.disableTypeChecked,
  },
  {
    // CommonJS の設定ファイル。型情報なし + Node/CommonJS グローバル。
    files: ['**/*.cjs'],
    ...tseslint.configs.disableTypeChecked,
    languageOptions: {
      sourceType: 'commonjs',
      globals: { ...globals.node, module: 'readonly', require: 'readonly' },
    },
  },
  {
    // ビルド/CI 補助スクリプト(ESM の .mjs)。型情報なし + Node グローバル。
    files: ['scripts/**/*.mjs', 'scripts/**/*.js'],
    languageOptions: {
      globals: { ...globals.node },
    },
    rules: {
      ...tseslint.configs.disableTypeChecked.rules,
    },
  },
];
