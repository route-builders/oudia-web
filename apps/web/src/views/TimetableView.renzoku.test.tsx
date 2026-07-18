// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 up-tri
// @vitest-environment happy-dom

// 連続入力モード(Alt+T)のビュー統合検証: 入場条件・分 2 桁入力・自動前進・BackSpace 2 段階・
// Esc/終着自動終了・モード中の許可コマンド・列変更での自動退場(原典 CWjkState_Renzoku)。

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildTimetableGrid, defaultTimetableGridOptions } from '@oudia-web/derive';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { parseBytes } from '../file/openFile.js';
import { useDocStore } from '../store/docStore.js';
import { TimetableView } from './TimetableView.js';

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
const train0 = () => data().rosen.diaCont[0]!.ressyaCont[0][0]!;

function gridRows() {
  const built = buildTimetableGrid(data(), 0, defaultTimetableGridOptions(data(), 0));
  if (!built.ok) throw new Error('grid');
  return built.grid.rows;
}

function clickCell(scroller: Element, row: number, trainIndex: number): void {
  fireEvent.click(scroller, {
    clientX: EKIMEI_W + COL_W + trainIndex * COL_W + 5,
    clientY: row * ROW_H + 5,
  });
}

const indicator = () => screen.queryByText('連続入力モード');

describe('TimetableView(連続入力モード)', () => {
  beforeEach(() => {
    (HTMLCanvasElement.prototype as unknown as { getContext: () => unknown }).getContext = () =>
      null;
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

  /** 駅 6 の発行(前に駅 4 発 780 = 0:13 がある)へフォーカスして返す。 */
  function focusHatsu6(): { root: Element; scroller: Element; row: number } {
    const rows = gridRows();
    const row = rows.findIndex((r) => r.type === 'hatsu' && r.ekiOrder === 6);
    const v = renderView();
    clickCell(v.scroller, row, 0);
    return { ...v, row };
  }

  it('Alt+T で入場しインジケータが出る。Esc で退場', () => {
    const { root } = focusHatsu6();
    fireEvent.keyDown(root, { key: 't', altKey: true });
    expect(indicator()).not.toBeNull();
    fireEvent.keyDown(root, { key: 'Escape' });
    expect(indicator()).toBeNull();
  });

  it('列車番号行では入場できない', () => {
    const { root, scroller } = renderView();
    clickCell(scroller, 0, 0);
    fireEvent.keyDown(root, { key: 't', altKey: true });
    expect(indicator()).toBeNull();
  });

  it('前に時刻がない先頭セルでは入場できない(canEnter -3)', () => {
    const rows = gridRows();
    const firstHatsu0 = rows.findIndex((r) => r.type === 'hatsu' && r.ekiOrder === 0);
    const { root, scroller } = renderView();
    clickCell(scroller, firstHatsu0, 0);
    fireEvent.keyDown(root, { key: 't', altKey: true });
    expect(indicator()).toBeNull();
  });

  it('分 2 桁で時刻が入り、次の駅時刻セルへ自動前進して連続入力できる', () => {
    const { root } = focusHatsu6();
    fireEvent.keyDown(root, { key: 't', altKey: true });
    // 駅 6 の発: 基準 780(0:13)→ "25" = 0:25。
    fireEvent.keyDown(root, { key: '2' });
    fireEvent.keyDown(root, { key: '5' });
    expect(train0().ekiJikokuCont[6]!.hatsuJikoku).toBe(25 * 60);
    expect(train0().ekiJikokuCont[6]!.ekiatsukai).toBe('teisya');
    // フォーカスは次の駅時刻セル(駅 7 の発行)へ。続けて "30" = 0:30。
    fireEvent.keyDown(root, { key: '3' });
    fireEvent.keyDown(root, { key: '0' });
    expect(train0().ekiJikokuCont[7]!.hatsuJikoku).toBe(30 * 60);
    expect(train0().ekiJikokuCont[7]!.ekiatsukai).toBe('teisya'); // 通過 → 停車化
    expect(indicator()).not.toBeNull(); // モード継続
  });

  it('1 文字目 6-9 は不受理(何も起きない)。ダイアログも開かない', () => {
    const { root } = focusHatsu6();
    fireEvent.keyDown(root, { key: 't', altKey: true });
    fireEvent.keyDown(root, { key: '7' });
    expect(document.querySelector('dialog')).toBeNull();
    expect(train0().ekiJikokuCont[6]!.hatsuJikoku).toBe(1020); // 既存値のまま(不受理)
    // 続けて '2','5' は通常どおり受理される。
    fireEvent.keyDown(root, { key: '2' });
    fireEvent.keyDown(root, { key: '5' });
    expect(train0().ekiJikokuCont[6]!.hatsuJikoku).toBe(25 * 60);
  });

  it('BackSpace: 入力途中は 1 文字訂正、未入力なら前の駅時刻セルへ戻る', () => {
    const { root } = focusHatsu6();
    fireEvent.keyDown(root, { key: 't', altKey: true });
    // '2' 入力 → BS で訂正 → '3','0' で 0:30 が入る(訂正が効いている)。
    fireEvent.keyDown(root, { key: '2' });
    fireEvent.keyDown(root, { key: 'Backspace' });
    fireEvent.keyDown(root, { key: '3' });
    fireEvent.keyDown(root, { key: '0' });
    expect(train0().ekiJikokuCont[6]!.hatsuJikoku).toBe(30 * 60);
    // 前進した駅 7 で BS(未入力)→ 駅 6 の発行へ戻る。モデル非破壊。
    fireEvent.keyDown(root, { key: 'Backspace' });
    expect(train0().ekiJikokuCont[6]!.hatsuJikoku).toBe(30 * 60); // 残っている
    expect(indicator()).not.toBeNull();
    // 戻った駅 6 に再入力すると上書きされる。
    fireEvent.keyDown(root, { key: '3' });
    fireEvent.keyDown(root, { key: '5' });
    expect(train0().ekiJikokuCont[6]!.hatsuJikoku).toBe(35 * 60);
  });

  it('最終の駅時刻行で入力が確定すると自動終了する', () => {
    const rows = gridRows();
    // 最後の時刻行(着/発)を探す。
    let lastRow = -1;
    rows.forEach((r, i) => {
      if (r.type === 'chaku' || r.type === 'hatsu') lastRow = i;
    });
    const { root, scroller } = renderView();
    clickCell(scroller, lastRow, 0);
    fireEvent.keyDown(root, { key: 't', altKey: true });
    expect(indicator()).not.toBeNull(); // 最下段でも入場できる(canEnter に最下段条件なし)
    fireEvent.keyDown(root, { key: '5' });
    fireEvent.keyDown(root, { key: '9' });
    expect(indicator()).toBeNull(); // 次セルなし → 自動終了
  });

  it('モード中の[通過](テンキー-)は実行後フォーカスが進みモード継続', () => {
    const { root } = focusHatsu6();
    fireEvent.keyDown(root, { key: 't', altKey: true });
    fireEvent.keyDown(root, { key: '-', code: 'NumpadSubtract' });
    expect(train0().ekiJikokuCont[6]!.ekiatsukai).toBe('tsuuka');
    expect(indicator()).not.toBeNull();
    // 前進しているので次の入力は駅 7 に入る。
    fireEvent.keyDown(root, { key: '2' });
    fireEvent.keyDown(root, { key: '5' });
    expect(train0().ekiJikokuCont[7]!.hatsuJikoku).toBe(25 * 60);
  });

  it('モード中は Undo(Ctrl+Z)等の他コマンドが無効', () => {
    const { root } = focusHatsu6();
    fireEvent.keyDown(root, { key: 't', altKey: true });
    fireEvent.keyDown(root, { key: '2' });
    fireEvent.keyDown(root, { key: '5' });
    const after = train0().ekiJikokuCont[6]!.hatsuJikoku;
    fireEvent.keyDown(root, { key: 'z', ctrlKey: true });
    expect(train0().ekiJikokuCont[6]!.hatsuJikoku).toBe(after); // Undo されない
    expect(indicator()).not.toBeNull();
  });

  it('左右矢印で別列へ移動すると自動退場する(-4)', () => {
    const { root } = focusHatsu6();
    fireEvent.keyDown(root, { key: 't', altKey: true });
    expect(indicator()).not.toBeNull();
    fireEvent.keyDown(root, { key: 'ArrowRight' });
    expect(indicator()).toBeNull();
  });

  it('モード中は文字キーでダイアログが開かない', () => {
    const { root } = focusHatsu6();
    fireEvent.keyDown(root, { key: 't', altKey: true });
    fireEvent.keyDown(root, { key: 'a' });
    expect(document.querySelector('dialog')).toBeNull();
  });

  it('[運行なし]は発着表示駅の発時刻行では no-op + フォーカス前進(＜12.3＞例外)', () => {
    const rows = gridRows();
    // 駅 4 は着・発の両行を持つ発着表示駅。発行(hatsu:4)へフォーカスして入場。
    const hatsuRow = rows.findIndex((r) => r.type === 'hatsu' && r.ekiOrder === 4);
    const { root, scroller } = renderView();
    clickCell(scroller, hatsuRow, 0);
    fireEvent.keyDown(root, { key: 't', altKey: true });
    expect(indicator()).not.toBeNull();
    // 運行なし(テンキー /)→ 駅 4 は変更されず、フォーカスは前進しモード継続。
    fireEvent.keyDown(root, { key: '/', code: 'NumpadDivide' });
    expect(train0().ekiJikokuCont[4]!.ekiatsukai).toBe('teisya'); // no-op
    expect(train0().ekiJikokuCont[4]!.hatsuJikoku).toBe(780);
    expect(indicator()).not.toBeNull();
    // 前進している: 次の入力は駅 5(次の時刻行)に入る。
    fireEvent.keyDown(root, { key: '2' });
    fireEvent.keyDown(root, { key: '0' });
    expect(train0().ekiJikokuCont[5]!.hatsuJikoku).toBe(20 * 60);

    // 対照: 着行(発着表示駅の着)では例外に該当せず運行なし化が実行される。
    fireEvent.keyDown(root, { key: 'Escape' });
    const chakuRow = rows.findIndex((r) => r.type === 'chaku' && r.ekiOrder === 4);
    clickCell(scroller, chakuRow, 0);
    fireEvent.keyDown(root, { key: 't', altKey: true });
    fireEvent.keyDown(root, { key: '/', code: 'NumpadDivide' });
    expect(train0().ekiJikokuCont[4]!.ekiatsukai).toBe('none');
  });

  it('運行なし駅への入力は停車化 + 基準番線(主本線)適用', () => {
    const rows = gridRows();
    const row14 = rows.findIndex((r) => r.type === 'hatsu' && r.ekiOrder === 14);
    const { root, scroller } = renderView();
    clickCell(scroller, row14, 0);
    fireEvent.keyDown(root, { key: 't', altKey: true });
    expect(indicator()).not.toBeNull(); // 基準 = 駅 13 着 1980(遡り)
    fireEvent.keyDown(root, { key: '4' });
    fireEvent.keyDown(root, { key: '5' });
    const ej = train0().ekiJikokuCont[14]!;
    expect(ej.ekiatsukai).toBe('teisya');
    expect(ej.hatsuJikoku).toBe(45 * 60);
    expect(ej.ressyaTrackIndex).toBe(data().rosen.ekiCont[14]!.downMain);
  });
});
