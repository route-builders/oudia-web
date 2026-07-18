// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 up-tri
// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { App } from './App.js';
import { parseBytes } from './file/openFile.js';
import { useDocStore } from './store/docStore.js';

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

  it('ヘッダにアプリ名(oudia-web アルファ版)が出る', () => {
    render(<App />);
    expect(screen.getByText('oudia-web')).toBeTruthy();
    expect(screen.getByText('(アルファ版)')).toBeTruthy();
  });

  it('フッタにコピーライト・注意事項・免責事項のリンクが出る', () => {
    render(<App />);
    const copyright = screen.getByRole('link', { name: /© 2026 up-tri\./ });
    expect(copyright.getAttribute('href')).toBe('https://web.route.builders/');
    const notice = screen.getByRole('link', { name: '注意事項' });
    expect(notice.getAttribute('href')).toBe('https://web.route.builders/notice/');
    const disclaimer = screen.getByRole('link', { name: '免責事項・ライセンス情報' });
    expect(disclaimer.getAttribute('href')).toBe('https://web.route.builders/disclaimer/');
    // 外部リンクは別タブで開く。
    expect(copyright.getAttribute('target')).toBe('_blank');
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
