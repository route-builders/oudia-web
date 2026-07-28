// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 up-tri
//
// Based on OuDiaSecond (Copyright (C) 2017-2026 diagram_mania)
// and OuDia (Copyright (C) 2006-2017 take-okm)

/**
 * 通常時刻表グリッドの行(Y列)ディスクリプタ生成(原典 CdYColSpecCont::scan の
 * プレーン分岐、:213-275)。固定ヘッダ行 → 駅ブロック(着→番線→発)→ 備考。
 * 駅ブロックは CSV 移植の buildColSpec を verbatim 再利用する(述語・順序が完全一致)。
 *
 * M7d: 運用番号行(列車番号の直後に iOperationNumberRows 本、iEnableOperation>1 のみ)と、
 * 始発駅作業/終着駅作業の拡張行(運番・入出区連携コード)を追加した。
 *
 * ★行数の分岐条件は `enableOperation > 1`(>=1 ではない)。始発側と終着側で非対称:
 * - 始発駅作業 = 2 → (>1) 3 → (>1 && displayInOutLinkCode) 4
 * - 終着駅作業 = 2 → (>1 && displayInOutLinkCode) 3  ※4 行目は存在しない
 */

import type { Eki, Ressyahoukou } from '@oudia-web/format';
import { buildColSpec } from '../csv/colSpec.js';

export type JikokuhyouRowType =
  | 'ressyabangou'
  | 'operationNumber' // 運用番号(iEnableOperation>1。段数 = OperationNumberRows)
  | 'ressyasyubetsu'
  | 'ressyamei'
  | 'gousuu'
  | 'gou'
  | 'shihatsuEkimei'
  | 'operationShihatsu' // 始発駅作業(2〜4 行)
  | 'shuchakuEkimei'
  | 'operationShuchaku' // 終着駅作業(2〜3 行)
  | 'chaku'
  | 'track'
  | 'hatsu' // 駅ブロック(buildColSpec 由来)
  | 'bikou';

export interface JikokuhyouRowSpec {
  readonly type: JikokuhyouRowType;
  /** 'chaku' | 'track' | 'hatsu' のみ有効(駅Order)。他は null。 */
  readonly ekiOrder: number | null;
  /**
   * 原典 CdYColSpec::m_iOperationIndex(作業表示 index または 運用番号段数 index)。
   * operationNumber = 段 index(0..rows-1)、operationShihatsu/Shuchaku = 行 index(0..3)。
   */
  readonly operationIndex: number;
  /** 始/終着駅作業・運用番号ブロックの 2 行目以降(= operationIndex > 0)。 */
  readonly isContinuation: boolean;
  /**
   * 行の下の横罫線(原典 getCdPenPropNullLine / NarrowLine)。
   * ブロック内部は 'none'、ブロック末尾のみ 'narrow'(原典 :927-936 / :1483-1567)。
   */
  readonly bottomBorder: 'none' | 'narrow';
}

export interface JikokuhyouRowOptions {
  /** DispProp.displayRessyamei(既定 true)。 */
  readonly displayRessyamei: boolean;
  /** [全時刻を表示](m_bDisplayAllEkiJikoku): 全駅に着・発の両行を生成。既定 false。 */
  readonly displayAllEkiJikoku?: boolean;
  /** Rosen.enableOperation(0=無効/1=簡易/2=通常)。既定 0。 */
  readonly enableOperation?: number;
  /** DispProp.operationNumberRows(1..5)。既定 1。 */
  readonly operationNumberRows?: number;
  /** DispProp.displayInOutLinkCode。既定 false。 */
  readonly displayInOutLinkCode?: boolean;
}

/** 始発駅作業ブロックの行数(原典 :236-260)。 */
export function shihatsuOperationRowCount(
  enableOperation: number,
  displayInOutLinkCode: boolean,
): number {
  if (enableOperation <= 1) return 2;
  return displayInOutLinkCode ? 4 : 3;
}

/** 終着駅作業ブロックの行数(原典 :261-275)。★4 行目は存在しない。 */
export function shuchakuOperationRowCount(
  enableOperation: number,
  displayInOutLinkCode: boolean,
): number {
  return enableOperation > 1 && displayInOutLinkCode ? 3 : 2;
}

/** 通常時刻表の行スペックを構築する。 */
export function buildJikokuhyouRowSpec(
  ekiCont: readonly Eki[],
  houkou: Ressyahoukou,
  opts: JikokuhyouRowOptions,
): JikokuhyouRowSpec[] {
  const rows: JikokuhyouRowSpec[] = [];
  const push = (
    type: JikokuhyouRowType,
    operationIndex = 0,
    bottomBorder: 'none' | 'narrow' = 'narrow',
  ): void => {
    rows.push({
      type,
      ekiOrder: null,
      operationIndex,
      isContinuation: operationIndex > 0,
      bottomBorder,
    });
  };
  /** ブロック(N 行)を積む。内部は罫線なし、末尾のみ細線。 */
  const pushBlock = (type: JikokuhyouRowType, count: number): void => {
    for (let i = 0; i < count; i++) push(type, i, i === count - 1 ? 'narrow' : 'none');
  };

  const enableOperation = opts.enableOperation ?? 0;
  const displayInOutLinkCode = opts.displayInOutLinkCode ?? false;
  // 1..5 にクランプ(原典 setOperationNumberRows)。
  const operationNumberRows = Math.min(5, Math.max(1, opts.operationNumberRows ?? 1));

  push('ressyabangou');
  // 運用番号行は列車番号の直後・種別の直前(原典 :213-217)。条件は enableOperation > 1 のみ。
  if (enableOperation > 1) pushBlock('operationNumber', operationNumberRows);
  push('ressyasyubetsu');
  if (opts.displayRessyamei) {
    push('ressyamei');
    push('gousuu');
    push('gou');
  }
  push('shihatsuEkimei');
  pushBlock('operationShihatsu', shihatsuOperationRowCount(enableOperation, displayInOutLinkCode));
  push('shuchakuEkimei');
  pushBlock('operationShuchaku', shuchakuOperationRowCount(enableOperation, displayInOutLinkCode));

  for (const c of buildColSpec(ekiCont, houkou, opts.displayAllEkiJikoku ?? false)) {
    rows.push({
      type: c.type,
      ekiOrder: c.ekiOrder,
      operationIndex: 0,
      isContinuation: false,
      bottomBorder: 'narrow',
    });
  }

  push('bikou');
  return rows;
}
