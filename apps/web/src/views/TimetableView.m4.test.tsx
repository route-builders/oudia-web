// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 oudia-second-web contributors
// @vitest-environment happy-dom

// M4-1 配線の統合検証: Ctrl/Alt+J/K/L の多態(駅時刻シフト・列車番号±・種別±)、
// 通過-停車トグル、運休の独立反転、編集後のフォーカス移動(原典 moveFocusCellToNext)。
// happy-dom はタブ表示相当だが、傍受可能な Ctrl 系は常時有効(design §4.1)。

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { render, cleanup, fireEvent } from '@testing-library/react';
import { buildTimetableGrid, defaultTimetableGridOptions } from '@oudia/derive';
import { TimetableView } from './TimetableView.js';
import { useDocStore } from '../store/docStore.js';
import { useSettingsStore, DEFAULT_JIKOKUHYOU_SETTINGS } from '../store/settingsStore.js';
import { parseBytes } from '../file/openFile.js';

const here = dirname(fileURLToPath(import.meta.url));
const ROW_H = 20;
const EKIMEI_W = 96;
const COL_W = 64;

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

const data = () => useDocStore.getState().data!;
const train = (i: number) => data().rosen.diaCont[0]!.ressyaCont[0][i]!;

/** 現在データのグリッド行スペック(ビューと同一オプション)。 */
function gridRows() {
  const built = buildTimetableGrid(data(), 0, defaultTimetableGridOptions(data(), 0));
  if (!built.ok) throw new Error('grid');
  return built.grid.rows;
}

/** (row, 列車 colIndex=trainIndex+2) のセルをクリックしてフォーカスする。 */
function clickCell(scroller: Element, row: number, trainIndex: number): void {
  fireEvent.click(scroller, {
    clientX: EKIMEI_W + COL_W + trainIndex * COL_W + 5,
    clientY: row * ROW_H + 5,
  });
}

describe('TimetableView(M4-1: 連続 1 分修正・通過-停車・運休)', () => {
  beforeEach(() => {
    (HTMLCanvasElement.prototype as unknown as { getContext: () => unknown }).getContext = () =>
      null;
    localStorage.clear();
    useSettingsStore.setState({ jikokuhyou: DEFAULT_JIKOKUHYOU_SETTINGS });
    loadSample();
  });
  afterEach(() => {
    cleanup();
    useDocStore.setState({ docState: null, data: null, clipboard: null });
  });

  function renderView(): { root: Element; scroller: Element } {
    render(<TimetableView data={data()} diaIndex={0} houkou={0} />);
    return {
      root: document.querySelector('.grid-root')!,
      scroller: document.querySelector('.grid-scroller')!,
    };
  }

  it('駅時刻行で Ctrl+J → -60 秒シフト + フォーカスが次の行へ進む(2 回目は発行に効く)', () => {
    const rows = gridRows();
    // 着・発の両行が表示されている駅を選ぶ(列車 0 が時刻を持つ駅 4)。
    const chakuRow = rows.findIndex((r) => r.type === 'chaku' && r.ekiOrder === 4);
    const hatsuRow = rows.findIndex((r) => r.type === 'hatsu' && r.ekiOrder === 4);
    expect(chakuRow).toBeGreaterThan(-1);
    expect(hatsuRow).toBe(chakuRow + 2); // 駅 4 は 着 → 番線 → 発 の 3 行
    const { root, scroller } = renderView();
    clickCell(scroller, chakuRow, 0);

    // 1 回目: 着基準 → 駅 4 の着・発と以後が -60。フォーカスは番線行を飛ばして発行へ。
    fireEvent.keyDown(root, { key: 'j', ctrlKey: true });
    expect(train(0).ekiJikokuCont[4]!.chakuJikoku).toBe(720 - 60);
    expect(train(0).ekiJikokuCont[4]!.hatsuJikoku).toBe(780 - 60);
    expect(train(0).ekiJikokuCont[8]!.chakuJikoku).toBe(1320 - 60);

    // 2 回目: 発基準 → 着は動かず発以後のみ -60(フォーカス移動が効いている証明)。
    fireEvent.keyDown(root, { key: 'j', ctrlKey: true });
    expect(train(0).ekiJikokuCont[4]!.chakuJikoku).toBe(720 - 60); // 着は 1 回分のみ
    expect(train(0).ekiJikokuCont[4]!.hatsuJikoku).toBe(780 - 120);
    expect(train(0).ekiJikokuCont[8]!.chakuJikoku).toBe(1320 - 120);
  });

  it('Ctrl+Shift+L(+1分・移動なし)は同じセルに連続して効く', () => {
    const rows = gridRows();
    const hatsuRow = rows.findIndex((r) => r.type === 'hatsu' && r.ekiOrder === 4);
    const { root, scroller } = renderView();
    clickCell(scroller, hatsuRow, 0);
    fireEvent.keyDown(root, { key: 'l', ctrlKey: true, shiftKey: true });
    fireEvent.keyDown(root, { key: 'l', ctrlKey: true, shiftKey: true });
    expect(train(0).ekiJikokuCont[4]!.hatsuJikoku).toBe(780 + 120);
    expect(train(0).ekiJikokuCont[4]!.chakuJikoku).toBe(720); // 発基準なので着不変
  });

  it('Ctrl+Alt+J(Rev)はフォーカス以前へ伝播する', () => {
    const rows = gridRows();
    const hatsuRow = rows.findIndex((r) => r.type === 'hatsu' && r.ekiOrder === 4);
    const { root, scroller } = renderView();
    clickCell(scroller, hatsuRow, 0);
    fireEvent.keyDown(root, { key: 'j', ctrlKey: true, altKey: true });
    expect(train(0).ekiJikokuCont[4]!.hatsuJikoku).toBe(780 - 60);
    expect(train(0).ekiJikokuCont[4]!.chakuJikoku).toBe(720 - 60); // Rev は同駅の着も対象
    expect(train(0).ekiJikokuCont[0]!.hatsuJikoku).toBe(86400 - 60); // 0 秒 → ラップ
    expect(train(0).ekiJikokuCont[8]!.chakuJikoku).toBe(1320); // 末尾方向は不変
  });

  it('任意秒: Ctrl+; は DispProp.anySecondIncDec1(既定 5 秒)で減算', () => {
    const rows = gridRows();
    const hatsuRow = rows.findIndex((r) => r.type === 'hatsu' && r.ekiOrder === 4);
    const { root, scroller } = renderView();
    clickCell(scroller, hatsuRow, 0);
    fireEvent.keyDown(root, { key: ';', code: 'Semicolon', ctrlKey: true });
    expect(train(0).ekiJikokuCont[4]!.hatsuJikoku).toBe(780 - data().dispProp.anySecondIncDec1);
  });

  it('列車番号行では Ctrl+J/L が ±1(0 詰め維持)、Ctrl+Shift+J は -10', () => {
    const { root, scroller } = renderView();
    clickCell(scroller, 0, 0); // 列車番号行(row 0)
    fireEvent.keyDown(root, { key: 'l', ctrlKey: true });
    expect(train(0).ressyabangou).toBe('002');
    fireEvent.keyDown(root, { key: 'j', ctrlKey: true });
    expect(train(0).ressyabangou).toBe('001');
    fireEvent.keyDown(root, { key: 'j', ctrlKey: true, shiftKey: true });
    expect(train(0).ressyabangou).toBe('000'); // 1-10 → 負は 0 クランプ
  });

  it('種別行では Ctrl+L で次の種別へ(端でラップ)', () => {
    const rows = gridRows();
    const syubetsuRow = rows.findIndex((r) => r.type === 'ressyasyubetsu');
    const { root, scroller } = renderView();
    clickCell(scroller, syubetsuRow, 0);
    expect(train(0).syubetsuIndex).toBe(4);
    fireEvent.keyDown(root, { key: 'l', ctrlKey: true });
    expect(train(0).syubetsuIndex).toBe(5);
    fireEvent.keyDown(root, { key: 'j', ctrlKey: true });
    expect(train(0).syubetsuIndex).toBe(4);
  });

  it('Alt+-(通過-停車)は時刻を維持したまま駅扱をトグルし、フォーカスは次駅へ', () => {
    const rows = gridRows();
    const chakuRow = rows.findIndex((r) => r.type === 'chaku' && r.ekiOrder === 4);
    const { root, scroller } = renderView();
    clickCell(scroller, chakuRow, 0);
    fireEvent.keyDown(root, { key: '-', altKey: true });
    const ej = train(0).ekiJikokuCont[4]!;
    expect(ej.ekiatsukai).toBe('tsuuka');
    expect(ej.chakuJikoku).toBe(720); // 時刻維持(通過時刻)
    // フォーカスは次駅へ(bNextEkiOrder=true)→ 続けて Alt+- すると駅 5 に効く。
    // 駅 5 は元々「通過」(sample2)なので停車へ独立トグルされる。
    expect(train(0).ekiJikokuCont[5]!.ekiatsukai).toBe('tsuuka');
    fireEvent.keyDown(root, { key: '-', altKey: true });
    expect(train(0).ekiJikokuCont[4]!.ekiatsukai).toBe('tsuuka'); // 駅 4 は 1 回だけ
    expect(train(0).ekiJikokuCont[5]!.ekiatsukai).toBe('teisya'); // 通過 → 停車
  });

  it('Alt+B(運休)は各列車を独立に反転する(混在選択)', () => {
    const { root, scroller } = renderView();
    // 事前に列車 0 だけ運休化。
    useDocStore.getState().dispatch({
      type: 'ressya/setCanceled',
      diaIndex: 0,
      houkou: 0,
      ressyaIndices: [0],
      canceled: true,
    });
    // 列車 0-1 を箱型選択(クリック → Shift+クリック)。
    clickCell(scroller, 0, 0);
    fireEvent.click(scroller, {
      clientX: EKIMEI_W + COL_W + 1 * COL_W + 5,
      clientY: 5,
      shiftKey: true,
    });
    fireEvent.keyDown(root, { key: 'b', altKey: true });
    expect(train(0).isCanceled).toBe(false); // 運休 → 解除
    expect(train(1).isCanceled).toBe(true); // 非運休 → 運休
  });

  it('Ctrl+K / Ctrl+Shift+K はデータを変えずフォーカスだけ動かす', () => {
    const rows = gridRows();
    const chakuRow = rows.findIndex((r) => r.type === 'chaku' && r.ekiOrder === 4);
    const { root, scroller } = renderView();
    clickCell(scroller, chakuRow, 0);
    const before = data();
    fireEvent.keyDown(root, { key: 'k', ctrlKey: true });
    fireEvent.keyDown(root, { key: 'k', ctrlKey: true, shiftKey: true });
    expect(data()).toBe(before); // dispatch なし(参照同一)
    // K → Shift+K で元のセルへ戻っている: Ctrl+Shift+L が駅 4 の発に効くことで確認。
    fireEvent.keyDown(root, { key: 'j', ctrlKey: true, shiftKey: true });
    expect(train(0).ekiJikokuCont[4]!.chakuJikoku).toBe(720 - 60);
  });

  it('Ctrl+Del(時刻消去)後は同駅の発へフォーカスが進む(着 → 発の連続消去)', () => {
    const rows = gridRows();
    const chakuRow = rows.findIndex((r) => r.type === 'chaku' && r.ekiOrder === 4);
    const { root, scroller } = renderView();
    clickCell(scroller, chakuRow, 0);
    fireEvent.keyDown(root, { key: 'Delete', ctrlKey: true });
    expect(train(0).ekiJikokuCont[4]!.chakuJikoku).toBeNull();
    expect(train(0).ekiJikokuCont[4]!.ekiatsukai).toBe('teisya'); // 発が残るので停車のまま
    fireEvent.keyDown(root, { key: 'Delete', ctrlKey: true });
    expect(train(0).ekiJikokuCont[4]!.hatsuJikoku).toBeNull();
    expect(train(0).ekiJikokuCont[4]!.ekiatsukai).toBe('none'); // 両 null → 運行なし
  });
});
