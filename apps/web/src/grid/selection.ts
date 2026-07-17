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
