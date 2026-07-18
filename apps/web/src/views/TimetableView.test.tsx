// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 up-tri
// @vitest-environment happy-dom

// 対話グリッド UI の統合検証: sample2 を store に読み込み、TimetableView を描画して
// キーボード操作(Enter / 文字キー)でダイアログが開き、コミットで store.dispatch → data 更新
// されることを確認する。Canvas は happy-dom 未実装のためスタブ。

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { TimetableGridSpec } from '@oudia-web/derive';
import { buildTimetableGrid, defaultTimetableGridOptions } from '@oudia-web/derive';
import { getEkiJikoku } from '@oudia-web/domain';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { parseBytes } from '../file/openFile.js';
import { useDocStore } from '../store/docStore.js';
import { TimetableView } from './TimetableView.js';

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

  /** 実アプリ同様に store を購読して data を渡すハーネス(編集で再レンダーされる)。 */
  function Harness(): React.ReactElement {
    const data = useDocStore((s) => s.data);
    if (data === null) return <div />;
    return <TimetableView data={data} diaIndex={0} houkou={0} />;
  }

  function renderView(): void {
    render(<Harness />);
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
    const input = screen.getByLabelText<HTMLInputElement>('列車番号');
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
    fireEvent.change(screen.getByLabelText<HTMLInputElement>('列車番号'), {
      target: { value: 'X' },
    });
    fireEvent.click(screen.getByText('キャンセル'));
    expect(screen.queryByText('列車のプロパティ')).toBeNull();
    expect(useDocStore.getState().data!.rosen.diaCont[0]!.ressyaCont[0][0]!.ressyabangou).toBe(
      before,
    );
  });

  // ---- バグ修正の回帰(dblclick / フォーカス復帰 / 運行なし時刻入力 / 着発振り分け)----

  /** 表示中グリッドを再構築して座標探索に使う。 */
  function grid0(): TimetableGridSpec {
    const data = useDocStore.getState().data!;
    const built = buildTimetableGrid(data, 0, defaultTimetableGridOptions(data, 0));
    if (!built.ok) throw new Error('grid');
    return built.grid;
  }

  /** 初期フォーカス(列車番号行 × 先頭列車列)から (row, col) まで矢印キーで移動する。 */
  function navigateTo(root: Element, grid: TimetableGridSpec, row: number, col: number): void {
    const startRow = grid.rows.findIndex((r) => r.type === 'ressyabangou');
    const startCol = grid.columns.findIndex((c) => c.type === 'ressya');
    for (let i = 0; i < row - startRow; i++) fireEvent.keyDown(root, { key: 'ArrowDown' });
    for (let i = 0; i < col - startCol; i++) fireEvent.keyDown(root, { key: 'ArrowRight' });
  }

  it('ダブルクリックで編集ダイアログが開く', () => {
    renderView();
    const scroller = document.querySelector('.grid-scroller')!;
    // 列 2(先頭列車)× 行 0(列車番号)。EKIMEI_W 96 + COL_W 64 = 160 が列 2 の左端。
    fireEvent.doubleClick(scroller, { clientX: 170, clientY: 10 });
    expect(screen.getByText('列車のプロパティ')).toBeTruthy();
  });

  it('OK でダイアログを閉じるとフォーカスがグリッドへ戻る', () => {
    renderView();
    const root = document.querySelector('.grid-root')!;
    fireEvent.keyDown(root, { key: 'Enter' });
    fireEvent.click(screen.getByText('OK'));
    expect(document.activeElement?.classList.contains('grid-root')).toBe(true);
  });

  it('キャンセルで閉じてもフォーカスがグリッドへ戻る', () => {
    renderView();
    const root = document.querySelector('.grid-root')!;
    fireEvent.keyDown(root, { key: 'Enter' });
    fireEvent.click(screen.getByText('キャンセル'));
    expect(document.activeElement?.classList.contains('grid-root')).toBe(true);
  });

  it('編集後もフォーカスセルは維持される(選択が初期化されない)', () => {
    renderView();
    const root = document.querySelector('.grid-root')!;
    // 隣の列車(列 3)へ移動して番号を編集 → 再度 Enter で同じ列車が開く。
    fireEvent.keyDown(root, { key: 'ArrowRight' });
    fireEvent.keyDown(root, { key: 'Enter' });
    fireEvent.change(screen.getByLabelText<HTMLInputElement>('列車番号'), {
      target: { value: 'KEEP1' },
    });
    fireEvent.click(screen.getByText('OK'));
    fireEvent.keyDown(root, { key: 'Enter' });
    expect(screen.getByLabelText<HTMLInputElement>('列車番号').value).toBe('KEEP1');
  });

  it('運行なしセルへ数字キー → 停車へ昇格して続けて入力でき、OK で停車 + 時刻になる', () => {
    renderView();
    const root = document.querySelector('.grid-root')!;
    const grid = grid0();
    const list = useDocStore.getState().data!.rosen.diaCont[0]!.ressyaCont[0];

    // 運行なしの駅時刻セル(着/発行 × 列車列)を探す。
    let hit: { row: number; col: number; ekiOrder: number; ressyaIndex: number } | null = null;
    outer: for (let r = 0; r < grid.rows.length; r++) {
      const row = grid.rows[r]!;
      if ((row.type !== 'chaku' && row.type !== 'hatsu') || row.ekiOrder === null) continue;
      for (let c = 0; c < grid.columns.length; c++) {
        const col = grid.columns[c]!;
        if (col.type !== 'ressya') continue;
        const train = list[col.ressyaIndex];
        if (train === undefined) continue;
        if (getEkiJikoku(train, row.ekiOrder).ekiatsukai === 'none') {
          hit = { row: r, col: c, ekiOrder: row.ekiOrder, ressyaIndex: col.ressyaIndex };
          break outer;
        }
      }
    }
    expect(hit).not.toBeNull(); // sample2 には運行なしセルがあるはず

    navigateTo(root, grid, hit!.row, hit!.col);
    fireEvent.keyDown(root, { key: '6' });

    // ダイアログ: 停車へ昇格・時刻欄が有効・'6' 入力済みで続きが打てる。
    expect(screen.getByLabelText<HTMLInputElement>('停車').checked).toBe(true);
    const rowType = grid.rows[hit!.row]!.type;
    const field = screen.getByLabelText<HTMLInputElement>(
      rowType === 'hatsu' ? '発時刻' : '着時刻',
    );
    expect(field.disabled).toBe(false);
    expect(field.value).toBe('6');
    fireEvent.change(field, { target: { value: '605' } });
    fireEvent.click(screen.getByText('OK'));

    // 停車 + 6:05 になっている。
    const after = useDocStore.getState().data!.rosen.diaCont[0]!.ressyaCont[0][hit!.ressyaIndex]!;
    const ej = getEkiJikoku(after, hit!.ekiOrder);
    expect(ej.ekiatsukai).toBe('teisya');
    const jikoku = rowType === 'hatsu' ? ej.hatsuJikoku : ej.chakuJikoku;
    expect(jikoku).toBe(6 * 3600 + 5 * 60);
  });

  it('発時刻行で数字キー → 発時刻欄に入力される(着時刻欄ではない)', () => {
    renderView();
    const root = document.querySelector('.grid-root')!;
    const grid = grid0();
    const hatsuRow = grid.rows.findIndex((r) => r.type === 'hatsu');
    expect(hatsuRow).toBeGreaterThan(-1);

    navigateTo(
      root,
      grid,
      hatsuRow,
      grid.columns.findIndex((c) => c.type === 'ressya'),
    );
    fireEvent.keyDown(root, { key: '7' });

    const hatsu = screen.getByLabelText<HTMLInputElement>('発時刻');
    expect(hatsu.value).toBe('7');
    expect(document.activeElement).toBe(hatsu);
  });

  it('BackSpace で駅時刻セルが運行なし化され時刻が消える(Undo で復元)', () => {
    renderView();
    const root = document.querySelector('.grid-root')!;
    const grid = grid0();
    const list = useDocStore.getState().data!.rosen.diaCont[0]!.ressyaCont[0];

    // 停車(時刻あり)の駅時刻セルを探す。
    let hit: { row: number; col: number; ekiOrder: number; ressyaIndex: number } | null = null;
    outer: for (let r = 0; r < grid.rows.length; r++) {
      const row = grid.rows[r]!;
      if ((row.type !== 'chaku' && row.type !== 'hatsu') || row.ekiOrder === null) continue;
      for (let c = 0; c < grid.columns.length; c++) {
        const col = grid.columns[c]!;
        if (col.type !== 'ressya') continue;
        const train = list[col.ressyaIndex];
        if (train === undefined) continue;
        const ej = getEkiJikoku(train, row.ekiOrder);
        if (ej.ekiatsukai === 'teisya' && (ej.chakuJikoku !== null || ej.hatsuJikoku !== null)) {
          hit = { row: r, col: c, ekiOrder: row.ekiOrder, ressyaIndex: col.ressyaIndex };
          break outer;
        }
      }
    }
    expect(hit).not.toBeNull();

    navigateTo(root, grid, hit!.row, hit!.col);
    fireEvent.keyDown(root, { key: 'Backspace' });

    // 運行なし化 + 時刻・番線削除。
    const after = useDocStore.getState().data!.rosen.diaCont[0]!.ressyaCont[0][hit!.ressyaIndex]!;
    const ej = getEkiJikoku(after, hit!.ekiOrder);
    expect(ej.ekiatsukai).toBe('none');
    expect(ej.chakuJikoku).toBeNull();
    expect(ej.hatsuJikoku).toBeNull();
    expect(ej.ressyaTrackIndex).toBeNull();

    // Undo(Ctrl+Z)で元へ戻る(1 コマンド = 1 Undo 単位)。
    fireEvent.keyDown(root, { key: 'z', ctrlKey: true });
    const restored = getEkiJikoku(
      useDocStore.getState().data!.rosen.diaCont[0]!.ressyaCont[0][hit!.ressyaIndex]!,
      hit!.ekiOrder,
    );
    expect(restored.ekiatsukai).toBe('teisya');
  });

  it('BackSpace で列車番号セルが空文字化される(ダイアログは開かない)', () => {
    renderView();
    const root = document.querySelector('.grid-root')!;
    // 初期フォーカス = 列車番号行 × 先頭列車。
    expect(useDocStore.getState().data!.rosen.diaCont[0]!.ressyaCont[0][0]!.ressyabangou).not.toBe(
      '',
    );
    fireEvent.keyDown(root, { key: 'Backspace' });
    expect(useDocStore.getState().data!.rosen.diaCont[0]!.ressyaCont[0][0]!.ressyabangou).toBe('');
    // キー転送ダイアログは開いていない(BackSpace は printable 扱いされない)。
    expect(document.querySelector('dialog.prop-dialog')).toBeNull();
  });
});
