// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 up-tri

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.js';
import { registerServiceWorker } from './pwa/registerSW.js';
import { useDocStore } from './store/docStore.js';
import './styles.css';

const rootEl = document.getElementById('root');
if (rootEl === null) throw new Error('#root が見つかりません');
createRoot(rootEl).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// SW 登録。更新可能・オフライン準備をストアに反映する。
void registerServiceWorker({
  onNeedRefresh: (reload) => {
    useDocStore.getState().setSwUpdate(reload);
  },
  onOfflineReady: () => {
    useDocStore.getState().setOfflineReady();
  },
});
