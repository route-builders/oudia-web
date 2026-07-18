// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 up-tri

/**
 * Service Worker 登録(vite-plugin-pwa)。更新は prompt(強制リロードしない)。
 * `virtual:pwa-register` は Vite ビルド時のみ解決される仮想モジュールなので、
 * 動的 import + フォールバックで型・テストの安全性を保つ。
 */

export interface SwUpdate {
  /** 更新が利用可能になったときに呼ばれる(reload コールバックを渡す)。 */
  onNeedRefresh: (reload: () => void) => void;
  /** オフライン利用可能になったとき。 */
  onOfflineReady: () => void;
}

/**
 * SW を登録する。開発環境や未対応環境では何もしない(no-op)。
 */
export async function registerServiceWorker(handlers: SwUpdate): Promise<void> {
  if (!('serviceWorker' in navigator)) return;
  try {
    // 仮想モジュール(vite-plugin-pwa がビルド時に提供)。dev / テストでは解決できないため
    // 動的 import + catch でフォールバックする。
    const mod = await import('virtual:pwa-register');
    const updateSW = mod.registerSW({
      onNeedRefresh: () => {
        handlers.onNeedRefresh(() => {
          void updateSW(true);
        });
      },
      onOfflineReady: () => {
        handlers.onOfflineReady();
      },
    });
  } catch {
    // 仮想モジュール未解決(dev / テスト)。オフライン機能なしで続行。
  }
}
