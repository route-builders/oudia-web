// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 up-tri

/**
 * Playwright E2E 設定(design/testing-guidelines・roadmap §M3「Playwright キーボード回帰の骨格」)。
 * M3 では Chromium・タブ表示モード(display-mode: browser)のみを対象とする。
 * PWA standalone の原典 Ctrl バインド検証は v0.4 の本格整備で追加する。
 *
 * webServer は Vite dev サーバを起動する(ビルド不要でフローを検証)。テストは e2e/ 配下の
 * *.spec.ts のみ(vitest の src/**\/*.test.ts とは実行系が分離)。
 */

import { defineConfig, devices } from '@playwright/test';

const PORT = 5273;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [['github'], ['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${String(PORT)}`,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: `pnpm exec vite --port ${String(PORT)} --strictPort`,
    url: `http://localhost:${String(PORT)}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
