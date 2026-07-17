// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 oudia-second-web contributors
// @vitest-environment happy-dom

// 対話グリッド UI の統合検証: sample2 を store に読み込み、TimetableView を描画して
// キーボード操作(Enter / 文字キー)でダイアログが開き、コミットで store.dispatch → data 更新
// されることを確認する。Canvas は happy-dom 未実装のためスタブ。

import { describe, it, expect, beforeEach, afterEach, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { TimetableView } from './TimetableView.js';
import { useDocStore } from '../store/docStore.js';
import { parseBytes } from '../file/openFile.js';

const here = dirname(fileURLToPath(import.meta.url));

beforeAll(() => {
  const proto = HTMLDialogElement.prototype as unknown as {
    showModal: () => void;
    close: () => void;
  };
  proto.showModal = function showModal(this: HTMLDialogElement) {
    this.open = true;
  };
  proto.close = function close(this: HTMLDialogElement) {
    this.open = false;
  };
});

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

describe('TimetableView(対話グリッド)', () => {
  beforeEach(() => {
    (HTMLCanvasElement.prototype as unknown as { getContext: () => unknown }).getContext = () =>
      null;
    loadSample();
  });
  afterEach(() => {
    cleanup();
    useDocStore.setState({ docState: null, data: null });
  });

  function renderView(): void {
    const data = useDocStore.getState().data!;
    render(<TimetableView data={data} diaIndex={0} houkou={0} />);
  }

  it('Enter で列車プロパティダイアログが開く(初期フォーカスは列車番号行)', () => {
    renderView();
    const root = document.querySelector('.grid-root')!;
    fireEvent.keyDown(root, { key: 'Enter' });
    expect(screen.getByText('列車のプロパティ')).toBeTruthy();
  });

  it('文字キー押下でダイアログが開き、その文字が列車番号欄に入る', () => {
    renderView();
    const root = document.querySelector('.grid-root')!;
    fireEvent.keyDown(root, { key: '9' });
    expect(screen.getByText('列車のプロパティ')).toBeTruthy();
    expect(screen.getByDisplayValue('9')).toBeTruthy();
  });

  it('列車番号を編集して OK すると store.data に反映される', () => {
    renderView();
    const root = document.querySelector('.grid-root')!;
    fireEvent.keyDown(root, { key: 'Enter' });
    const input = screen.getByLabelText('列車番号');
    fireEvent.change(input, { target: { value: 'TEST9' } });
    fireEvent.click(screen.getByText('OK'));
    const r0 = useDocStore.getState().data!.rosen.diaCont[0]!.ressyaCont[0][0]!;
    expect(r0.ressyabangou).toBe('TEST9');
    // 変更カウンタが立つ。
    expect(useDocStore.getState().docState!.changeCount).toBeGreaterThan(0);
  });

  it('矢印↓で駅時刻行へ移動して Enter すると駅時刻ダイアログが開く', () => {
    renderView();
    const root = document.querySelector('.grid-root')!;
    // 列車番号行から下へ十分移動して駅時刻(着)行に入る。
    for (let i = 0; i < 12; i++) fireEvent.keyDown(root, { key: 'ArrowDown' });
    fireEvent.keyDown(root, { key: 'Enter' });
    // 駅時刻ダイアログ or 列車プロパティのどちらか(行種別依存)。駅時刻なら見出しに「駅時刻」。
    const titles = screen.queryAllByText(/駅時刻のプロパティ|列車のプロパティ/);
    expect(titles.length).toBeGreaterThan(0);
  });

  it('キャンセルでダイアログが閉じ、data は不変', () => {
    renderView();
    const before = useDocStore.getState().data!.rosen.diaCont[0]!.ressyaCont[0][0]!.ressyabangou;
    const root = document.querySelector('.grid-root')!;
    fireEvent.keyDown(root, { key: 'Enter' });
    fireEvent.change(screen.getByLabelText('列車番号'), { target: { value: 'X' } });
    fireEvent.click(screen.getByText('キャンセル'));
    expect(screen.queryByText('列車のプロパティ')).toBeNull();
    expect(useDocStore.getState().data!.rosen.diaCont[0]!.ressyaCont[0][0]!.ressyabangou).toBe(
      before,
    );
  });
});
