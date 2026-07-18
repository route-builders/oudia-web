// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 up-tri
//
// Based on OuDiaSecond (Copyright (C) 2017-2026 diagram_mania)
// and OuDia (Copyright (C) 2006-2017 take-okm)

/**
 * グリッドセルの意味解決(原典 CWndJikokuhyou のフォーカス行種別 → コマンド/ダイアログ分岐、
 * design §05 3.1「編集操作」§262)。セル (row, col) を「どのダイアログを開き・どの列車/駅/
 * 項目を編集するか」の意味づけに変換する純関数。
 */

import type {
    GridColumn,
    JikokuhyouRowSpec,
    JikokuhyouRowType,
    TimetableGridSpec,
} from '@oudia-web/derive';

/** セルの編集意味(フォーカス行種別 × 列種別の解決結果)。 */
export type CellTarget =
  | { kind: 'ekimei'; ekiOrder: number | null } // 駅名列 → 駅のプロパティ
  | { kind: 'chakuhatsu' } // 着発ラベル列(非編集)
  | { kind: 'newRessya' } // 最右「新規列車」列 → 末尾追加
  | {
      // 列車プロパティ行(種別/番号/名前/号数/備考/始終着駅名)→ 列車のプロパティ
      kind: 'ressyaProp';
      ressyaIndex: number;
      rowType: JikokuhyouRowType;
    }
  | {
      // 駅時刻行(着/発)→ 駅時刻のプロパティ
      kind: 'ekiJikoku';
      ressyaIndex: number;
      ekiOrder: number;
      target: 'chaku' | 'hatsu';
    }
  | {
      // 番線行 → 駅時刻のプロパティ(番線タブ)。表示/編集は v0.6〜だが解決はしておく。
      kind: 'track';
      ressyaIndex: number;
      ekiOrder: number;
    }
  | {
      // 始発/終着駅作業行 → 作業のプロパティ(M7)。解決のみ。
      kind: 'operation';
      ressyaIndex: number;
      rowType: JikokuhyouRowType;
    };

/** 列種別が列車列かどうか(ressyaIndex を持つ)。 */
export function columnRessyaIndex(col: GridColumn): number | null {
  return col.type === 'ressya' ? col.ressyaIndex : null;
}

/** 駅時刻行(着/発/番線)か。 */
export function isEkiJikokuRow(rowType: JikokuhyouRowType): boolean {
  return rowType === 'chaku' || rowType === 'hatsu' || rowType === 'track';
}

/**
 * セル (rowIndex, colIndex) の編集意味を解決する。範囲外は null。
 * 新規列車列(列種別 ressya かつ最右の余剰列)は buildTimetableGrid の列に含まれないため、
 * 呼出側が「最右 + 1 の仮想列」を newRessya として扱う(resolveNewRessya)。
 */
export function resolveCellTarget(
  grid: TimetableGridSpec,
  rowIndex: number,
  colIndex: number,
): CellTarget | null {
  const row = grid.rows[rowIndex];
  const col = grid.columns[colIndex];
  if (row === undefined || col === undefined) return null;

  // 駅名列 / 着発ラベル列。
  if (col.type === 'ekimei') return { kind: 'ekimei', ekiOrder: row.ekiOrder };
  if (col.type === 'chakuhatsu') return { kind: 'chakuhatsu' };

  // 以降は列車列。
  const ressyaIndex = col.ressyaIndex;
  return resolveRessyaCell(row, ressyaIndex);
}

/** 列車列のセルを行種別で解決する。 */
function resolveRessyaCell(row: JikokuhyouRowSpec, ressyaIndex: number): CellTarget {
  switch (row.type) {
    case 'chaku':
      return { kind: 'ekiJikoku', ressyaIndex, ekiOrder: row.ekiOrder ?? 0, target: 'chaku' };
    case 'hatsu':
      return { kind: 'ekiJikoku', ressyaIndex, ekiOrder: row.ekiOrder ?? 0, target: 'hatsu' };
    case 'track':
      return { kind: 'track', ressyaIndex, ekiOrder: row.ekiOrder ?? 0 };
    case 'operationShihatsu':
    case 'operationShuchaku':
      return { kind: 'operation', ressyaIndex, rowType: row.type };
    // 列車プロパティ行(種別/番号/名前/号数/号/始発駅名/終着駅名/備考)。
    case 'ressyabangou':
    case 'ressyasyubetsu':
    case 'ressyamei':
    case 'gousuu':
    case 'gou':
    case 'shihatsuEkimei':
    case 'shuchakuEkimei':
    case 'bikou':
      return { kind: 'ressyaProp', ressyaIndex, rowType: row.type };
  }
}
