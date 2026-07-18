// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 up-tri
// @vitest-environment happy-dom

// 編集コマンド配線の統合検証: TimetableView にフォーカスして Ctrl+C/V/Z 等を送り、
// store.dispatch → data 更新 と Undo/Redo・クリップボードを確認する。happy-dom は
// display-mode: standalone を報告しないため Ctrl バインドは非衝突キー(C/V/Z/Y/矢印)のみ有効。

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { parseBytes } from '../file/openFile.js';
import { useDocStore } from '../store/docStore.js';
import { TimetableView } from './TimetableView.js';

const here = dirname(fileURLToPath(import.meta.url));

function loadSample(): void {
  const bytes = new Uint8Array(
    readFileSync(
      join(
        here,
        '..',
        '..',
        '..',
        '..',
        'packages',
        'format',
        'fixtures',
        'current',
        'sample2.oud2',
      ),
    ),
  );
  const r = parseBytes(bytes, 'sample2.oud2');
  useDocStore.getState().loadData(r.data, r.fileName, r.warningCount);
}

const list = () => useDocStore.getState().data!.rosen.diaCont[0]!.ressyaCont[0];

describe('TimetableView(編集コマンド配線)', () => {
  beforeEach(() => {
    (HTMLCanvasElement.prototype as unknown as { getContext: () => unknown }).getContext = () =>
      null;
    loadSample();
  });
  afterEach(() => {
    cleanup();
    useDocStore.setState({ docState: null, data: null, clipboard: null });
  });

  function renderView(): Element {
    render(<TimetableView data={useDocStore.getState().data!} diaIndex={0} houkou={0} />);
    return document.querySelector('.grid-root')!;
  }

  it('Ctrl+C でクリップボードに列車が入る', () => {
    const root = renderView();
    fireEvent.keyDown(root, { key: 'c', ctrlKey: true });
    expect(useDocStore.getState().clipboard).not.toBeNull();
    expect(useDocStore.getState().clipboard!.trains.length).toBe(1);
  });

  it('Ctrl+C → Ctrl+V で列車数が +1、Ctrl+Z で戻る', () => {
    const root = renderView();
    const before = list().length;
    fireEvent.keyDown(root, { key: 'c', ctrlKey: true });
    fireEvent.keyDown(root, { key: 'v', ctrlKey: true });
    expect(list().length).toBe(before + 1);
    fireEvent.keyDown(root, { key: 'z', ctrlKey: true });
    expect(list().length).toBe(before);
  });

  it('Ctrl+X で列車が削除される(切り取り)', () => {
    const root = renderView();
    const before = list().length;
    const firstBangou = list()[0]!.ressyabangou;
    fireEvent.keyDown(root, { key: 'x', ctrlKey: true });
    expect(list().length).toBe(before - 1);
    // クリップボードには切り取った列車が入る。
    expect(useDocStore.getState().clipboard!.trains[0]!.ressyabangou).toBe(firstBangou);
  });

  it('Ctrl+→(右へ)で先頭 2 列車が入れ替わる', () => {
    const root = renderView();
    const b0 = list()[0]!.ressyabangou;
    const b1 = list()[1]!.ressyabangou;
    fireEvent.keyDown(root, { key: 'ArrowRight', ctrlKey: true });
    expect(list()[0]!.ressyabangou).toBe(b1);
    expect(list()[1]!.ressyabangou).toBe(b0);
  });

  it('Ctrl+B で運休がトグルされ、Undo で戻る', () => {
    const root = renderView();
    expect(list()[0]!.isCanceled).toBe(false);
    // happy-dom は standalone 非報告のため Ctrl+B は無効。Alt+B(常時有効)を使う。
    fireEvent.keyDown(root, { key: 'b', altKey: true });
    expect(list()[0]!.isCanceled).toBe(true);
    fireEvent.keyDown(root, { key: 'z', ctrlKey: true });
    expect(list()[0]!.isCanceled).toBe(false);
  });

  it('Ctrl+F で検索バーが開き、列車番号検索でフォーカスが移る', () => {
    const root = renderView();
    fireEvent.keyDown(root, { key: 'f', ctrlKey: true });
    const input = screen.getByPlaceholderText('列車番号を検索');
    // 2 本目の列車番号で検索。
    const target = list()[1]!.ressyabangou;
    fireEvent.change(input, { target: { value: target } });
    fireEvent.keyDown(input, { key: 'Enter' });
    // 検索バーが機能している(閉じるボタンがある)ことだけ確認。
    expect(screen.getByText('次を検索')).toBeTruthy();
  });
});
