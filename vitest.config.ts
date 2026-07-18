// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 up-tri

import { defineConfig } from 'vitest/config';

// format / domain / derive は DOM 非依存で Node 実行する(architecture §3.2)。
// パッケージごとに環境が要る場合は各 package の vitest.config.ts で上書きする。
export default defineConfig({
  test: {
    environment: 'node',
    include: ['packages/*/src/**/*.test.ts', 'apps/*/src/**/*.test.ts', 'apps/*/src/**/*.test.tsx'],
    benchmark: {
      include: ['packages/*/src/**/*.bench.ts'],
    },
  },
});
