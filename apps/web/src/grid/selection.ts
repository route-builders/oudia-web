// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 oudia-second-web contributors
//
// Based on OuDiaSecond (Copyright (C) 2017-2026 diagram_mania)
// and OuDia (Copyright (C) 2006-2017 take-okm)

/**
 * 時刻表グリッドのフォーカス・選択モデル(原典 CWndDcdGrid の CaMuiSelect + フォーカスセル。
 * design §05 3.1 §257 / roadmap §M3「箱型選択(Shift)・ランダム選択(Ctrl)」)。
 *
 * 純ロジック(React 非依存)。編集単位は列(列車)であり、選択は「選ばれた列車 index の集合」に
 * 帰着する(getSelectedRessyaIndices)。フォーカスセルは (row, col) の 1 点で、キー入力・
 * ダイアログ起動の起点になる。
 */

import type { TimetableGridSpec } from '@oudia/derive';

/** グリッド上の 1 セル位置。 */
export interface CellPos {
  readonly row: number;
  readonly col: number;
}

/**
 * 選択状態。
 * - focus: 現在のフォーカスセル(常に存在)。キー入力・ダイアログ起点。
 * - anchor: 箱型選択(Shift)の基準セル。null = 単一セル選択。
 * - randomCols: ランダム選択(Ctrl)で個別に選ばれた列集合(箱型選択とは独立に和をとる)。
 */
export interface SelectionState {
  readonly focus: CellPos;
  readonly anchor: CellPos | null;
  readonly randomCols: ReadonlySet<number>;
}

/** 初期選択(左上の列車列にフォーカス)。列車列が無ければ col=0。 */
export function initialSelection(grid: TimetableGridSpec): SelectionState {
  const col = firstRessyaCol(grid);
  return { focus: { row: firstEditableRow(grid), col }, anchor: null, randomCols: new Set() };
}

/** 最初の列車列(ressya)の colIndex。無ければ 0。 */
function firstRessyaCol(grid: TimetableGridSpec): number {
  const i = grid.columns.findIndex((c) => c.type === 'ressya');
  return i === -1 ? 0 : i;
}

/** 最初の編集対象行(列車番号行)。 */
function firstEditableRow(grid: TimetableGridSpec): number {
  const i = grid.rows.findIndex((r) => r.type === 'ressyabangou');
  return i === -1 ? 0 : i;
}

/** 単一セルへフォーカス(選択リセット)。クリック相当。 */
export function setFocus(pos: CellPos): SelectionState {
  return { focus: pos, anchor: null, randomCols: new Set() };
}

/** Shift+クリック: focus から pos までの箱型選択(anchor は既存 focus/anchor を基準に)。 */
export function extendBox(state: SelectionState, pos: CellPos): SelectionState {
  const anchor = state.anchor ?? state.focus;
  return { focus: pos, anchor, randomCols: state.randomCols };
}

/**
 * Ctrl+クリック: pos の列をランダム選択にトグル。フォーカスも pos へ移す(原典 CaMuiSelect の
 * 反転)。既存の箱型選択(anchor)は畳んで randomCols に取り込み、非連続選択を維持する。
 */
export function toggleRandom(state: SelectionState, pos: CellPos): SelectionState {
  const next = new Set(state.randomCols);
  // 既存の箱型選択列を randomCols に畳み込んでから、pos 列をトグルする。
  if (state.anchor !== null) {
    const min = Math.min(state.anchor.col, state.focus.col);
    const max = Math.max(state.anchor.col, state.focus.col);
    for (let c = min; c <= max; c++) next.add(c);
  }
  if (next.has(pos.col)) next.delete(pos.col);
  else next.add(pos.col);
  return { focus: pos, anchor: null, randomCols: next };
}

/** キーボード/クリックの移動先を範囲内へクランプ。 */
function clampPos(grid: TimetableGridSpec, row: number, col: number): CellPos {
  const r = Math.max(0, Math.min(row, grid.rows.length - 1));
  const c = Math.max(0, Math.min(col, grid.columns.length - 1));
  return { row: r, col: c };
}

/**
 * フォーカスを相対移動する(矢印キー)。extend=true なら Shift 押下で箱型選択を伸ばす。
 * 範囲外はクランプ(端で止まる)。
 */
export function moveFocus(
  state: SelectionState,
  grid: TimetableGridSpec,
  dRow: number,
  dCol: number,
  extend: boolean,
): SelectionState {
  const pos = clampPos(grid, state.focus.row + dRow, state.focus.col + dCol);
  if (extend) return extendBox(state, pos);
  return setFocus(pos);
}

/** 明示選択の列集合。箱型選択(anchor あり)の列範囲 ∪ ランダム選択列。anchor 無しなら random のみ。 */
function explicitCols(state: SelectionState): Set<number> {
  const cols = new Set<number>(state.randomCols);
  if (state.anchor !== null) {
    const min = Math.min(state.anchor.col, state.focus.col);
    const max = Math.max(state.anchor.col, state.focus.col);
    for (let c = min; c <= max; c++) cols.add(c);
  }
  return cols;
}

/** 列集合 → 列車 index の昇順配列(列車列でない列は除外)。 */
function colsToRessyaIndices(cols: Iterable<number>, grid: TimetableGridSpec): number[] {
  const ressyaIndices = new Set<number>();
  for (const c of cols) {
    const col = grid.columns[c];
    if (col?.type === 'ressya') ressyaIndices.add(col.ressyaIndex);
  }
  return [...ressyaIndices].sort((a, b) => a - b);
}

/**
 * 明示的に選択された列車 index の集合(昇順)。箱型選択 ∪ ランダム選択のみ。
 * フォーカス単独(明示選択なし)のときは空配列を返す(原典 CaMuiSelect の内容に相当)。
 */
export function getSelectedRessyaIndices(state: SelectionState, grid: TimetableGridSpec): number[] {
  return colsToRessyaIndices(explicitCols(state), grid);
}

/**
 * コマンドの実効対象となる列車 index(昇順)。原典 ECreateCmd_Select/Focus の解決:
 * 明示選択があればそれを、無ければフォーカスセルの 1 列車を対象とする。
 * フォーカスが列車列でなく明示選択も無ければ空。
 */
export function getEffectiveRessyaIndices(
  state: SelectionState,
  grid: TimetableGridSpec,
): number[] {
  const selected = getSelectedRessyaIndices(state, grid);
  if (selected.length > 0) return selected;
  const fi = focusRessyaIndex(state, grid);
  return fi === null ? [] : [fi];
}

/** フォーカスセルの列車 index(列車列でなければ null)。 */
export function focusRessyaIndex(state: SelectionState, grid: TimetableGridSpec): number | null {
  const col = grid.columns[state.focus.col];
  return col?.type === 'ressya' ? col.ressyaIndex : null;
}

/** 複数列車が明示選択されているか。原典「複数選択中は不可(新規列車挿入等)」判定用。 */
export function hasMultiSelection(state: SelectionState, grid: TimetableGridSpec): boolean {
  return getSelectedRessyaIndices(state, grid).length > 1;
}

/** 明示選択(箱型 ∪ ランダム)を randomCols に畳み、フォーカスだけを pos へ移す(選択保持)。 */
function moveFocusKeepSelection(state: SelectionState, pos: CellPos): SelectionState {
  return { focus: pos, anchor: null, randomCols: explicitCols(state) };
}

/**
 * 編集コマンド後・Ctrl+K のフォーカス移動(原典 CWndJikokuhyou::moveFocusCellToNext、
 * CWndJikokuhyou.cpp 1787-1930)。
 *
 * 下移動モード(moveRight=false):
 * - 駅時刻ブロックより上 → 最初の駅時刻行へ(番線行はスキップ)。列は維持。
 * - ブロック内:
 *   - nextEkiOrder=false → 1 行下へ、番線行だけスキップ(同駅の発・次駅の着どちらもあり得る)。
 *   - nextEkiOrder=true → 次駅の着行(なければ発行)へ。次駅がなければブロック後の行へ。
 * - ブロックより後(備考等)→ 次の列車の先頭行(行 0)へ。右端なら動かない。
 * - 移動中は列車選択を保持する(原典 1799-1801)。
 *
 * 右移動モード(moveRight=true): 同一行のまま 1 列車右へ移動し、選択を解除(1911-1925)。
 */
export function moveFocusCellToNext(
  state: SelectionState,
  grid: TimetableGridSpec,
  moveRight: boolean,
  nextEkiOrder: boolean,
): SelectionState {
  const { begin, end } = grid.ekijikokuRowRange;
  const { row, col } = state.focus;

  if (moveRight) {
    const next = nextRessyaCol(grid, col, 1);
    return next === null ? state : setFocus({ row, col: next });
  }

  if (row < begin) {
    // 上部(列車プロパティ行)→ 最初の非番線の駅時刻行へ。
    const target = scanRow(grid, begin, 1, end);
    return target === null ? state : moveFocusKeepSelection(state, { row: target, col });
  }
  if (row < end) {
    if (nextEkiOrder) {
      // 次駅の着行(なければ同駅より後の最初の時刻行)へ。current の駅Order より大きい
      // 最初の chaku/hatsu 行。無ければブロック直後の行へ。
      const curOrder = grid.rows[row]?.ekiOrder ?? null;
      for (let r = row + 1; r < end; r++) {
        const spec = grid.rows[r];
        if (spec === undefined || spec.type === 'track') continue;
        if (curOrder === null || (spec.ekiOrder ?? -1) > curOrder) {
          return moveFocusKeepSelection(state, { row: r, col });
        }
      }
      if (end < grid.rows.length) return moveFocusKeepSelection(state, { row: end, col });
      return state;
    }
    // 1 行下へ(番線行スキップ)。ブロックを出たら備考等にそのまま着地。
    const target = scanRow(grid, row + 1, 1, grid.rows.length);
    return target === null ? state : moveFocusKeepSelection(state, { row: target, col });
  }
  // ブロック後(備考等)→ 次の列車の行 0 へ。
  const next = nextRessyaCol(grid, col, 1);
  return next === null ? state : moveFocusKeepSelection(state, { row: 0, col: next });
}

/** moveFocusCellToNext の逆方向(原典 moveFocusCellToPrev、CWndJikokuhyou.cpp 1934-2077)。 */
export function moveFocusCellToPrev(
  state: SelectionState,
  grid: TimetableGridSpec,
  moveRight: boolean,
): SelectionState {
  const { begin, end } = grid.ekijikokuRowRange;
  const { row, col } = state.focus;

  if (moveRight) {
    const prev = nextRessyaCol(grid, col, -1);
    return prev === null ? state : setFocus({ row, col: prev });
  }

  if (row < begin) {
    // 上部 → 前列車の最終行(備考)へ。
    const prev = nextRessyaCol(grid, col, -1);
    return prev === null
      ? state
      : moveFocusKeepSelection(state, { row: grid.rows.length - 1, col: prev });
  }
  if (row < end) {
    // 1 行上へ(番線行スキップ)。ブロックの上に出たら上部行にそのまま着地。
    const target = scanRow(grid, row - 1, -1, -1);
    return target === null ? state : moveFocusKeepSelection(state, { row: target, col });
  }
  // ブロック後 → 最終の非番線駅時刻行へ。
  const target = scanRow(grid, end - 1, -1, begin - 1);
  return target === null ? state : moveFocusKeepSelection(state, { row: target, col });
}

/** from から step 方向へ走査し、until(排他)の手前までで最初の非番線行を返す。 */
function scanRow(
  grid: TimetableGridSpec,
  from: number,
  step: 1 | -1,
  until: number,
): number | null {
  for (let r = from; r !== until; r += step) {
    if (r < 0 || r >= grid.rows.length) return null;
    if (grid.rows[r]?.type !== 'track') return r;
  }
  return null;
}

/** col から step 方向で次の列車列。無ければ null。駅名/着発列からは最初の列車列へ。 */
function nextRessyaCol(grid: TimetableGridSpec, col: number, step: 1 | -1): number | null {
  const cur = grid.columns[col];
  if (cur?.type !== 'ressya') {
    // 駅名列側からは先頭列車へ(原典 1887-1895)。
    const first = grid.columns.findIndex((c) => c.type === 'ressya');
    return first === -1 ? null : first;
  }
  for (let c = col + step; c >= 0 && c < grid.columns.length; c += step) {
    if (grid.columns[c]?.type === 'ressya') return c;
  }
  return null;
}

/**
 * 選択をグリッド範囲内へクランプする(編集によるグリッド再構築後もフォーカス位置を保つ)。
 * 範囲内で変化がなければ同一参照を返す(React の再レンダ抑止)。
 */
export function clampSelection(state: SelectionState, grid: TimetableGridSpec): SelectionState {
  if (grid.rows.length === 0 || grid.columns.length === 0) return initialSelection(grid);
  const clamp = (p: CellPos): CellPos => ({
    row: Math.max(0, Math.min(p.row, grid.rows.length - 1)),
    col: Math.max(0, Math.min(p.col, grid.columns.length - 1)),
  });
  const focus = clamp(state.focus);
  const anchor = state.anchor === null ? null : clamp(state.anchor);
  const randomCols = [...state.randomCols].filter((c) => c < grid.columns.length);

  const focusSame = focus.row === state.focus.row && focus.col === state.focus.col;
  const anchorSame =
    (anchor === null && state.anchor === null) ||
    (anchor !== null &&
      state.anchor !== null &&
      anchor.row === state.anchor.row &&
      anchor.col === state.anchor.col);
  if (focusSame && anchorSame && randomCols.length === state.randomCols.size) return state;
  return { focus, anchor, randomCols: new Set(randomCols) };
}
