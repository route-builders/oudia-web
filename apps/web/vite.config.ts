// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 oudia-second-web contributors

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// M1 ビューアの Vite 設定。PWA(vite-plugin-pwa)はパッケージ #7 で追加する。
export default defineConfig({
  plugins: [react()],
  build: {
    target: 'es2022',
    outDir: 'dist',
  },
});
