// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 up-tri

// 原典 moveFocusCellToNext/Prev(CWndJikokuhyou.cpp 1787-2077)の純関数検証。
// 合成グリッド: 行 = [列車番号, 種別, 着0, 番線0, 発0, 発1, 着2, 発2, 備考]、列車 2 本。

import type { JikokuhyouRowSpec, TimetableGridSpec } from '@oudia-web/derive';
import { describe, expect, it } from 'vitest';
import type { SelectionState } from './selection.js';
import { moveFocusCellToNext, moveFocusCellToPrev } from './selection.js';

function r(type: JikokuhyouRowSpec['type'], ekiOrder: number | null = null): JikokuhyouRowSpec {
  return { type, ekiOrder, isContinuation: false, operationIndex: 0, bottomBorder: 'narrow' };
}

const GRID: TimetableGridSpec = {
  houkou: 0,
  columns: [
    { type: 'ekimei' },
    { type: 'chakuhatsu' },
    { type: 'ressya', ressyaIndex: 0 },
    { type: 'ressya', ressyaIndex: 1 },
  ],
  rows: [
    r('ressyabangou'), // 0
    r('ressyasyubetsu'), // 1
    r('chaku', 0), // 2
    r('track', 0), // 3
    r('hatsu', 0), // 4
    r('hatsu', 1), // 5
    r('chaku', 2), // 6
    r('hatsu', 2), // 7
    r('bikou'), // 8
  ],
  cells: [],
  ekijikokuRowRange: { begin: 2, end: 8 },
};

const at = (row: number, col: number): SelectionState => ({
  focus: { row, col },
  anchor: null,
  randomCols: new Set(),
});

describe('moveFocusCellToNext(下移動モード)', () => {
  it('駅時刻ブロックより上からは最初の駅時刻行へ(列は維持)', () => {
    const s = moveFocusCellToNext(at(0, 2), GRID, false, false);
    expect(s.focus).toEqual({ row: 2, col: 2 });
  });

  it('ブロック内では 1 行下へ、番線行だけスキップ(着0 → 発0)', () => {
    const s = moveFocusCellToNext(at(2, 2), GRID, false, false);
    expect(s.focus).toEqual({ row: 4, col: 2 });
  });

  it('ブロック末尾からは備考行へ着地', () => {
    const s = moveFocusCellToNext(at(7, 2), GRID, false, false);
    expect(s.focus).toEqual({ row: 8, col: 2 });
  });

  it('ブロック後(備考)からは次列車の先頭行へ。右端列車では動かない', () => {
    expect(moveFocusCellToNext(at(8, 2), GRID, false, false).focus).toEqual({ row: 0, col: 3 });
    const stay = at(8, 3);
    expect(moveFocusCellToNext(stay, GRID, false, false)).toBe(stay);
  });

  it('nextEkiOrder=true は次駅の時刻行へ(同駅の発をスキップ)', () => {
    // 着0(row 2)→ 駅1 の発(row 5)。同駅の発0(row 4)は飛ばす。
    const s = moveFocusCellToNext(at(2, 2), GRID, false, true);
    expect(s.focus).toEqual({ row: 5, col: 2 });
  });

  it('nextEkiOrder=true で最終駅からはブロック直後の行へ', () => {
    const s = moveFocusCellToNext(at(7, 2), GRID, false, true);
    expect(s.focus).toEqual({ row: 8, col: 2 });
  });

  it('番線行 + nextEkiOrder=true ではフォーカス不動(原典: JikokuOrder null。1828-1831)', () => {
    const stay = at(3, 2); // 番線行
    expect(moveFocusCellToNext(stay, GRID, false, true)).toBe(stay);
  });

  it('移動中は列車選択を保持する(箱型選択は randomCols へ畳む)', () => {
    const withBox: SelectionState = {
      focus: { row: 2, col: 3 },
      anchor: { row: 2, col: 2 },
      randomCols: new Set(),
    };
    const s = moveFocusCellToNext(withBox, GRID, false, false);
    expect(s.focus).toEqual({ row: 4, col: 3 });
    expect([...s.randomCols].sort()).toEqual([2, 3]); // 選択列車を保持
  });
});

describe('moveFocusCellToNext(右移動モード)', () => {
  it('同一行のまま 1 列車右へ移動し、選択を解除する', () => {
    const withBox: SelectionState = {
      focus: { row: 4, col: 2 },
      anchor: { row: 4, col: 2 },
      randomCols: new Set([2]),
    };
    const s = moveFocusCellToNext(withBox, GRID, true, false);
    expect(s.focus).toEqual({ row: 4, col: 3 });
    expect(s.anchor).toBeNull();
    expect(s.randomCols.size).toBe(0);
  });

  it('右端では動かない', () => {
    const stay = at(4, 3);
    expect(moveFocusCellToNext(stay, GRID, true, false)).toBe(stay);
  });
});

describe('moveFocusCellToPrev(下移動モード)', () => {
  it('ブロック内では 1 行上へ、番線行だけスキップ(発0 → 着0)', () => {
    const s = moveFocusCellToPrev(at(4, 2), GRID, false);
    expect(s.focus).toEqual({ row: 2, col: 2 });
  });

  it('ブロック先頭からは上部行(種別)へ着地', () => {
    const s = moveFocusCellToPrev(at(2, 2), GRID, false);
    expect(s.focus).toEqual({ row: 1, col: 2 });
  });

  it('上部からは前列車の備考行へ。先頭列車では動かない', () => {
    expect(moveFocusCellToPrev(at(0, 3), GRID, false).focus).toEqual({ row: 8, col: 2 });
    const stay = at(0, 2);
    expect(moveFocusCellToPrev(stay, GRID, false)).toBe(stay);
  });

  it('ブロック後(備考)からは最終の駅時刻行へ', () => {
    const s = moveFocusCellToPrev(at(8, 2), GRID, false);
    expect(s.focus).toEqual({ row: 7, col: 2 });
  });

  it('右移動モードでは 1 列車左へ + 選択解除', () => {
    const withSel: SelectionState = {
      focus: { row: 4, col: 3 },
      anchor: null,
      randomCols: new Set([3]),
    };
    const s = moveFocusCellToPrev(withSel, GRID, true);
    expect(s.focus).toEqual({ row: 4, col: 2 });
    expect(s.randomCols.size).toBe(0);
  });
});
