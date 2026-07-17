// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 oudia-second-web contributors
// @vitest-environment happy-dom

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react';
import { App } from './App.js';
import { useDocStore } from './store/docStore.js';
import { parseBytes } from './file/openFile.js';

const here = dirname(fileURLToPath(import.meta.url));
function loadSampleIntoStore(): void {
  const bytes = new Uint8Array(
    readFileSync(
      join(here, '..', '..', '..', 'packages', 'format', 'fixtures', 'current', 'sample2.oud2'),
    ),
  );
  const r = parseBytes(bytes, 'sample2.oud2');
  useDocStore.getState().loadData(r.data, r.fileName, r.warningCount);
}

describe('App(シェル end-to-end。sample2 を開いて各ビューを描画)', () => {
  beforeEach(() => {
    // canvas getContext は happy-dom で未実装なのでスタブ化。
    (HTMLCanvasElement.prototype as unknown as { getContext: () => unknown }).getContext = () =>
      null;
  });
  afterEach(() => {
    cleanup();
    useDocStore.setState({ data: null, fileName: null, tabs: [], activeKey: null });
  });

  it('未読込時は案内メッセージが出る', () => {
    render(<App />);
    expect(screen.getByText(/ドロップ/)).toBeTruthy();
  });

  it('読込後は路線ツリー(ダイヤ名)が出る', () => {
    loadSampleIntoStore();
    render(<App />);
    expect(screen.getByText(/平日ダイヤ/)).toBeTruthy();
  });

  it('ツリーから時刻表を開くとタブが 1 つできる', () => {
    loadSampleIntoStore();
    render(<App />);
    const tree = screen.getByLabelText('路線ツリー');
    const btn = within(tree).getAllByText('下り時刻表')[0]!;
    fireEvent.click(btn);
    expect(useDocStore.getState().tabs.length).toBe(1);
    // タブバーにラベルが出る。
    expect(screen.getAllByText(/下り時刻表/).length).toBeGreaterThan(0);
  });

  it('ダイヤグラム・時刻表・駅時刻表を開いてもクラッシュしない', () => {
    loadSampleIntoStore();
    render(<App />);
    const tree = screen.getByLabelText('路線ツリー');
    fireEvent.click(within(tree).getAllByText('ダイヤグラム')[0]!);
    fireEvent.click(within(tree).getAllByText('上り時刻表')[0]!);
    // 駅時刻表を展開して駅を開く。
    fireEvent.click(within(tree).getAllByText(/駅時刻表/)[0]!);
    const ekiBtns = within(tree).getAllByRole('button');
    // 最初の駅ボタン(展開後に現れる駅名)をクリック。
    const ekiBtn = ekiBtns.find((b) => b.textContent === '田角');
    if (ekiBtn) fireEvent.click(ekiBtn);
    expect(useDocStore.getState().tabs.length).toBeGreaterThanOrEqual(2);
  });
});
