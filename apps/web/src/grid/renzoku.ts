// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 oudia-second-web contributors
//
// Based on OuDiaSecond (Copyright (C) 2017-2026 diagram_mania)

/**
 * 連続入力モードの純ロジック(原典 CWjkState_Renzoku、design §05 4.4)。
 * モード状態は「編集中列 colIndex」+「入力途中の分 minutes(0-2 文字)」のみ。
 * React 依存なし。ビュー(TimetableView)がキーイベントとフォーカス移動を配線する。
 */

import type { Ressya } from '@oudia/format';
import type { TimetableGridSpec } from '@oudia/derive';
import { findRevJikokuItem } from '@oudia/domain';
import { resolveCellTarget } from './cellSemantics.js';

/** 連続入力モードの状態(null = 非アクティブ)。 */
export interface RenzokuState {
  /** 編集中の列(原典 m_iXColumnNumberFocus)。別列への移動で自動退場。 */
  readonly colIndex: number;
  /** 入力途中の分文字列(原典 m_strMinutes。0-2 文字)。 */
  readonly minutes: string;
}

/**
 * 入場判定(原典 canEnter、CWjkState_Renzoku.cpp 464-513)。3 条件:
 * (1) フォーカスが既存列車列 (2) 着/発時刻行 (3) 直前(着⇄発を遡る)に非 null 時刻がある。
 * ヘッダ doc の「最下段セル」条件はコードに存在しない(最下段でも入場可)。
 */
export function canEnterRenzoku(
  grid: TimetableGridSpec,
  focus: { row: number; col: number },
  ressyaList: readonly Ressya[],
): boolean {
  const target = resolveCellTarget(grid, focus.row, focus.col);
  if (target?.kind !== 'ekiJikoku') return false;
  const ressya = ressyaList[target.ressyaIndex];
  if (ressya === undefined) return false;
  return findRevJikokuItem(ressya, target.ekiOrder, target.target) !== null;
}

/**
 * 次/前の駅時刻セル(原典 calcCellToNext、CWjkState_Renzoku.cpp 368-409)。
 * 同一列のまま行を走査し、駅時刻ブロック外に出たら null(= 自動終了)、
 * 時刻 Order を持たない行(番線行等)はスキップ。
 */
export function calcJikokuRowToNext(
  grid: TimetableGridSpec,
  fromRow: number,
  sign: 1 | -1,
): number | null {
  const { begin, end } = grid.ekijikokuRowRange;
  for (let r = fromRow + sign; ; r += sign) {
    if (r < begin || r >= end) return null;
    const t = grid.rows[r]?.type;
    if (t === 'chaku' || t === 'hatsu') return r;
  }
}

/**
 * 編集中セルの表示文字列(原典 "%2d%-2s": 直前非 null 時刻の「時」+ 入力途中の分)。
 * 例: 時 9・分未入力 → " 9  "、分 "3" → " 93 "。基準が無ければ null(描画しない)。
 */
export function renzokuEditMark(
  grid: TimetableGridSpec,
  focus: { row: number; col: number },
  ressyaList: readonly Ressya[],
  minutes: string,
): string | null {
  const target = resolveCellTarget(grid, focus.row, focus.col);
  if (target?.kind !== 'ekiJikoku') return null;
  const ressya = ressyaList[target.ressyaIndex];
  if (ressya === undefined) return null;
  const rev = findRevJikokuItem(ressya, target.ekiOrder, target.target);
  if (rev === null) return null;
  const hour = Math.floor((rev as number) / 3600);
  return String(hour).padStart(2, ' ') + minutes.padEnd(2, ' ');
}

/**
 * 発着表示駅か(原典 isHatsuChakuHyouji: 着行と発行の両方が表示されている駅)。
 * 連続入力モードの[運行なし]は、発着表示駅の発時刻行では no-op + フォーカス前進(＜12.3＞例外)。
 */
export function isHatsuChakuHyouji(grid: TimetableGridSpec, ekiOrder: number): boolean {
  let hasChaku = false;
  let hasHatsu = false;
  for (const row of grid.rows) {
    if (row.ekiOrder !== ekiOrder) continue;
    if (row.type === 'chaku') hasChaku = true;
    else if (row.type === 'hatsu') hasHatsu = true;
  }
  return hasChaku && hasHatsu;
}
