// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 oudia-second-web contributors

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.js';
import './styles.css';

const rootEl = document.getElementById('root');
if (rootEl === null) throw new Error('#root が見つかりません');
createRoot(rootEl).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
