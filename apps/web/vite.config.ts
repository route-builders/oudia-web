// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 oudia-second-web contributors

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// M1 ビューアの Vite 設定。vite-plugin-pwa で全アセット precache → 初回訪問後は完全オフライン。
// 更新は prompt(強制リロードしない。design §5.1 / roadmap M1 完了条件 #4)。
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest}'],
      },
      manifest: {
        name: 'OuDiaSecond Web ビューア',
        short_name: 'OuDia Web',
        description: 'OuDia / OuDiaSecond の時刻表・ダイヤグラムをブラウザで閲覧',
        lang: 'ja',
        start_url: '/',
        display: 'standalone',
        background_color: '#ffffff',
        theme_color: '#1d5fb0',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
    }),
  ],
  build: {
    target: 'es2022',
    outDir: 'dist',
  },
});
