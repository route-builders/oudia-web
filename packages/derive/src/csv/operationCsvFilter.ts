// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 up-tri
//
// Based on OuDiaSecond (Copyright (C) 2017-2026 diagram_mania)
// and OuDia (Copyright (C) 2006-2017 take-okm)

/**
 * 運用表 CSV エクスポートの抽出条件(原典 CDlgOperationTableCsvExport::CheckSatisfyConditions、
 * ViewAllOperationTable/CDlgOperationTableCsvExport.cpp:508-624 の直訳)。M7e。
 *
 * 抽出は 3 択:
 * 1. 全運用を出力
 * 2. 〈キーワード〉〈マッチ方法〉運用番号の運用を抽出する
 * 3. 〈駅〉駅を〈出区|入区〉する運用を抽出する
 *
 * ★原典の既知バグをそのまま移植している(下の OPERATION_MATCH_LABEL のコメント参照)。
 * ここを「直す」と Windows 版と抽出結果が変わるため、原典互換を優先する。
 *
 * ★抽出条件は oud2 にも INI にも保存されない(原典 :734-1030 はビューへ書き戻さない)ので
 * 黄金テスト非該当。
 */

import { ekiIndexOfEkiOrder } from '@oudia-web/domain';
import type { OperationTableEntry } from '../operationFull/types.js';

/**
 * 運用番号のマッチ方法(原典 COMBO_TypeOfSearch の index 0..3)。
 *
 * ★**原典ではラベルと実装が入れ替わっている**(:686-696 のラベル vs :536-543 の実装):
 * - index 0: ラベル「と一致する」/ 実装 `find(kw) != npos` = **部分一致**
 * - index 1: ラベル「を含む」  / 実装 `==`               = **完全一致**
 * - index 2: ラベル「が前方一致する」/ 実装 前方一致(一致)
 * - index 3: ラベル「が後方一致する」/ 実装 後方一致(一致)
 *
 * 本移植は**実装側に忠実**(= Windows 版と同じ抽出結果になる)。ラベルも原典どおり出す。
 */
export type OperationMatchMode = 'substring' | 'exact' | 'prefix' | 'suffix';

/** コンボの index 順(原典 :686-696)。 */
export const OPERATION_MATCH_MODES: readonly OperationMatchMode[] = [
  'substring',
  'exact',
  'prefix',
  'suffix',
];

/** コンボのラベル(原典 :686-696 の文言そのまま。実装との取り違えごと踏襲)。 */
export const OPERATION_MATCH_LABEL: Readonly<Record<OperationMatchMode, string>> = {
  substring: 'と一致する',
  exact: 'を含む',
  prefix: 'が前方一致する',
  suffix: 'が後方一致する',
};

/** 抽出対象の指定(原典 DDX_Radio の 3 択)。 */
export type OperationCsvExportTarget =
  | { readonly kind: 'all' }
  | {
      readonly kind: 'operationNumber';
      readonly keyword: string;
      readonly mode: OperationMatchMode;
    }
  | {
      readonly kind: 'station';
      /** 駅 index(コンボの選択)。 */
      readonly ekiIndex: number;
      readonly inOrOut: 'out' | 'in';
      /** [路線外発着を含む]。既定 true。**駅指定のときだけ効く**(原典 :566-573 / :594-601)。 */
      readonly includeOuterTerminal: boolean;
    };

/**
 * 運用番号のマッチ(原典 :521-559)。
 * 大小文字区別あり・正規表現なし・ワイルドカードなし・trim なし・全半角同一視なし。
 */
export function matchOperationNumber(
  operationNumber: string,
  keyword: string,
  mode: OperationMatchMode,
): boolean {
  if (keyword === '') return false; // :527-530 キーワード空は常に 0 件
  if (operationNumber.length < keyword.length) return false; // :533-535
  switch (mode) {
    case 'substring':
      return operationNumber.includes(keyword); // :536-539
    case 'exact':
      return operationNumber === keyword; // :540-543
    case 'prefix':
      return operationNumber.startsWith(keyword); // :544-551
    case 'suffix':
      return operationNumber.endsWith(keyword); // :552-558
  }
}

/**
 * 出区/入区駅のマッチ(原典 :561-620)。
 *
 * 出区 = 運用の**先頭**エントリの始発駅、入区 = **末尾**エントリの終着駅。
 * ★並べ替えキー算出(:823-834)と違い、**運行区間補正(isRunBetweenNextEki 等)を行わない**。
 * この非対称は原典どおり。
 *
 * @param ekiIndexGroup 指定駅と分岐・環状で連なる駅 index 群(getEkiIndexBrunchLoop の結果)
 */
export function matchOperationStation(
  entries: readonly OperationTableEntry[],
  ekiIndexGroup: readonly number[],
  inOrOut: 'out' | 'in',
  includeOuterTerminal: boolean,
  ekiCount: number,
): boolean {
  // 原典は front()/back() を無防備に呼ぶ。空運用は該当なしとする。
  const entry = inOrOut === 'out' ? entries[0] : entries[entries.length - 1];
  if (entry === undefined) return false;
  const outer = inOrOut === 'out' ? entry.outerSihatsuEkiIndex : entry.outerSyuuchakuEkiIndex;
  if (outer !== null && !includeOuterTerminal) return false;
  const order = inOrOut === 'out' ? entry.sihatsuEkiOrder : entry.syuuchakuEkiOrder;
  const idx = ekiIndexOfEkiOrder(order, ekiCount, entry.ressyaProperty.houkou);
  return ekiIndexGroup.includes(idx);
}

/** 抽出条件の判定(原典 CheckSatisfyConditions :508-624)。 */
export function satisfiesOperationCsvExportCondition(
  operationNumber: string,
  entries: readonly OperationTableEntry[],
  target: OperationCsvExportTarget,
  ctx: { readonly ekiIndexGroup: readonly number[]; readonly ekiCount: number },
): boolean {
  switch (target.kind) {
    case 'all':
      return true; // :514-520
    case 'operationNumber':
      return matchOperationNumber(operationNumber, target.keyword, target.mode);
    case 'station':
      return matchOperationStation(
        entries,
        ctx.ekiIndexGroup,
        target.inOrOut,
        target.includeOuterTerminal,
        ctx.ekiCount,
      );
  }
}

/**
 * 運用表 Map から抽出条件に合う運用番号だけを取り出す(原典 OnOK :734-936 の篩い部)。
 * 並べ替えは呼び出し側で sortOperationNumbers に渡す(原典も同じ挿入ソートを使う)。
 */
export function filterOperationTableForCsv(
  operationTable: ReadonlyMap<string, readonly OperationTableEntry[]>,
  target: OperationCsvExportTarget,
  ctx: { readonly ekiIndexGroup: readonly number[]; readonly ekiCount: number },
): Map<string, OperationTableEntry[]> {
  const out = new Map<string, OperationTableEntry[]>();
  for (const [num, entries] of operationTable) {
    if (satisfiesOperationCsvExportCondition(num, entries, target, ctx)) {
      out.set(num, [...entries]);
    }
  }
  return out;
}
