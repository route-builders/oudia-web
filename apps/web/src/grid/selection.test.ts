// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 oudia-second-web contributors

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parseNodeTree, readRosenFile } from '@oudia/format';
import type { TimetableGridSpec } from '@oudia/derive';
import { buildTimetableGrid, defaultTimetableGridOptions } from '@oudia/derive';
import {
  initialSelection,
  setFocus,
  moveFocus,
  extendBox,
  toggleRandom,
  getSelectedRessyaIndices,
  getEffectiveRessyaIndices,
  focusRessyaIndex,
  hasMultiSelection,
} from './selection.js';

const here = dirname(fileURLToPath(import.meta.url));
const fixtures = join(here, '..', '..', '..', '..', 'packages', 'format', 'fixtures');

function loadGrid(): TimetableGridSpec {
  const bytes = new Uint8Array(readFileSync(join(fixtures, 'current', 'sample2.oud2')));
  const parsed = parseNodeTree(bytes);
  if (!parsed.ok) throw new Error('parse');
  const data = readRosenFile(parsed.root).data;
  const built = buildTimetableGrid(data, 0, defaultTimetableGridOptions(data, 0));
  if (!built.ok) throw new Error('grid build failed');
  return built.grid;
}

describe('選択モデル', () => {
  const grid = loadGrid();
  // 列車列の colIndex を 2 つ拾う。
  const ressyaCols = grid.columns
    .map((c, i) => (c.type === 'ressya' ? i : -1))
    .filter((i) => i !== -1);

  it('初期選択は最初の列車列・列車番号行にフォーカス', () => {
    const sel = initialSelection(grid);
    expect(grid.columns[sel.focus.col]!.type).toBe('ressya');
    expect(grid.rows[sel.focus.row]!.type).toBe('ressyabangou');
    // 明示選択は空、実効対象はフォーカスの 1 列車。
    expect(getSelectedRessyaIndices(sel, grid)).toEqual([]);
    expect(getEffectiveRessyaIndices(sel, grid)).toEqual([0]);
  });

  it('setFocus は明示選択なし・実効対象はフォーカスの 1 列車', () => {
    const sel = setFocus({ row: 3, col: ressyaCols[1]! });
    expect(getSelectedRessyaIndices(sel, grid)).toEqual([]);
    expect(getEffectiveRessyaIndices(sel, grid)).toEqual([1]);
    expect(hasMultiSelection(sel, grid)).toBe(false);
  });

  it('extendBox(Shift)は列範囲を選択', () => {
    let sel = setFocus({ row: 0, col: ressyaCols[0]! });
    sel = extendBox(sel, { row: 0, col: ressyaCols[2]! });
    // ressyaCols[0..2] にまたがる列車 index が選ばれる。
    const idx = getSelectedRessyaIndices(sel, grid);
    expect(idx).toContain(0);
    expect(idx).toContain(1);
    expect(idx).toContain(2);
    expect(hasMultiSelection(sel, grid)).toBe(true);
  });

  it('toggleRandom(Ctrl)は列を加除する', () => {
    let sel = setFocus({ row: 0, col: ressyaCols[0]! });
    sel = toggleRandom(sel, { row: 0, col: ressyaCols[2]! });
    // 列 2 が randomCols に入る(明示選択に列 2)。
    expect(getSelectedRessyaIndices(sel, grid)).toContain(2);
    // 同じ列 2 を再トグルすると randomCols から外れる。
    sel = toggleRandom(sel, { row: 0, col: ressyaCols[2]! });
    expect(getSelectedRessyaIndices(sel, grid)).not.toContain(2);
  });

  it('moveFocus は範囲内でクランプ(端で止まる)', () => {
    let sel = setFocus({ row: 0, col: 0 });
    sel = moveFocus(sel, grid, -1, -1, false); // 左上端を超えない
    expect(sel.focus).toEqual({ row: 0, col: 0 });
    sel = moveFocus(sel, grid, 9999, 9999, false); // 右下端
    expect(sel.focus.row).toBe(grid.rows.length - 1);
    expect(sel.focus.col).toBe(grid.columns.length - 1);
  });

  it('moveFocus(extend)は Shift 箱型選択を伸ばす', () => {
    let sel = setFocus({ row: 0, col: ressyaCols[0]! });
    sel = moveFocus(sel, grid, 0, 1, true);
    sel = moveFocus(sel, grid, 0, 1, true);
    expect(getSelectedRessyaIndices(sel, grid).length).toBeGreaterThan(1);
  });

  it('focusRessyaIndex は列車列でのみ index、他列は null', () => {
    const onRessya = setFocus({ row: 0, col: ressyaCols[0]! });
    expect(focusRessyaIndex(onRessya, grid)).toBe(0);
    const ekimeiCol = grid.columns.findIndex((c) => c.type === 'ekimei');
    const onEkimei = setFocus({ row: 0, col: ekimeiCol });
    expect(focusRessyaIndex(onEkimei, grid)).toBeNull();
  });

  it('駅名/着発列は選択列車に含まれない', () => {
    const ekimeiCol = grid.columns.findIndex((c) => c.type === 'ekimei');
    const chakuhatsuCol = grid.columns.findIndex((c) => c.type === 'chakuhatsu');
    let sel = setFocus({ row: 0, col: ekimeiCol });
    sel = extendBox(sel, { row: 0, col: chakuhatsuCol });
    expect(getSelectedRessyaIndices(sel, grid)).toEqual([]);
  });
});
