// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 oudia-second-web contributors
//
// Based on OuDiaSecond (Copyright (C) 2017-2026 diagram_mania)
// and OuDia (Copyright (C) 2006-2017 take-okm)

/**
 * 通常時刻表グリッドの出力型(原典 CdXColSpecCont / CdYColSpecCont + CCellBuilder。
 * analysis §04)。列 = 列車、行 = メタ項目/駅時刻。セルはテキスト + 種別 + スタイルヒント
 * (解決済みピクセルではなくデータ)。色・フォントの解決は render 層の責務。
 */

import type { Colorref } from '@oudia/format';
import type { JikokuhyouRowSpec } from './colSpec.js';

/** 1 セルの意味づけ。テキスト自体は kind とは独立(マークも時刻も string)。 */
export type CellKind =
  | 'label' // 左ラベル/駅名/固定ヘッダ見出し
  | 'jikoku' // 時刻(停車・通過の実時刻)
  | 'mark' // ﾚ / || / ・・ / ---- / ○ のいずれか
  | 'track' // 番線略称
  | 'text' // 列車番号・列車名・号数・備考・始終着駅名
  | 'empty' // 空セル(番線 None など)
  | 'operationSpacer'; // 始発/終着駅作業の空きセル

/** マーク種(byte-verified シンボル。glyph は MARK_GLYPH で解決)。 */
export type MarkKind =
  | 'tsuuka' // " ﾚ"  (半角 space + 半角 ﾚ U+FF9A)
  | 'keiyunasi' // "||"
  | 'unkounasiIppan' // "・・"
  | 'unkounasiSyuyou' // "----"
  | 'teisyaMaru'; // "○"

/** マーク種 → glyph(原典 STRINGTABLE 3366-3373 で照合済み)。 */
export const MARK_GLYPH: Record<MarkKind, string> = {
  tsuuka: ' ﾚ',
  keiyunasi: '||',
  unkounasiIppan: '・・',
  unkounasiSyuyou: '----',
  teisyaMaru: '○',
};

/** スタイルヒント。ピクセルではなく index/色/フラグ。 */
export interface CellStyle {
  /** 種別 index(色/フォントの解決キー)。無関係なら null。 */
  readonly syubetsuIndex: number | null;
  /** 文字色。通過時刻セルは灰(128,128,128)で上書き。それ以外は種別文字色 or null(既定黒)。 */
  readonly mojiColor: Colorref | null;
  /** フォント index(0–7)。停車/通過の時刻セルのみ。 */
  readonly fontIndex: number | null;
  /** 背景色。セル固有の明示値のみ(運休の灰など)。ダイヤ縞は render 解決 → null。 */
  readonly backColor: Colorref | null;
  /** 縦書き(JikokuhyouVFont)。M1 は既定 false で固定(枠のみ)。 */
  readonly tategaki: boolean;
}

export interface CellSpec {
  readonly text: string;
  readonly kind: CellKind;
  /** kind === 'mark' のときのみ非 null。 */
  readonly mark: MarkKind | null;
  readonly style: CellStyle;
}

/** X列(列)ディスクリプタ。 */
export type GridColumn =
  | { readonly type: 'ekimei' } // X=0
  | { readonly type: 'chakuhatsu' } // X=1
  | { readonly type: 'ressya'; readonly ressyaIndex: number }; // X>=2

export interface TimetableGridSpec {
  readonly houkou: number;
  readonly columns: readonly GridColumn[];
  readonly rows: readonly JikokuhyouRowSpec[];
  /** cells[rowIndex][colIndex]。rows.length × columns.length の密行列。 */
  readonly cells: readonly (readonly CellSpec[])[];
  /** スクロール駅行の範囲 [begin, end)。左右 2 列 + 上部ヘッダは固定。 */
  readonly ekijikokuRowRange: { readonly begin: number; readonly end: number };
}

/** スタイルなしのプレーンセル(ラベル・空など)を作るヘルパ。 */
export function plainStyle(): CellStyle {
  return {
    syubetsuIndex: null,
    mojiColor: null,
    fontIndex: null,
    backColor: null,
    tategaki: false,
  };
}
