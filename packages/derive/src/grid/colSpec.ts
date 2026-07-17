// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 oudia-second-web contributors
//
// Based on OuDiaSecond (Copyright (C) 2017-2026 diagram_mania)
// and OuDia (Copyright (C) 2006-2017 take-okm)

/**
 * 通常時刻表グリッドの行(Y列)ディスクリプタ生成(原典 CdYColSpecCont::scan の
 * プレーン分岐)。固定ヘッダ行 → 駅ブロック(着→番線→発)→ 備考。駅ブロックは CSV 移植の
 * buildColSpec を verbatim 再利用する(述語・順序が完全一致)。
 *
 * M1 パラメータ: bCustomize=false / bDisplayAllJikoku=false / iEnableOperation=0 /
 * displayRessyamei は DispProp 既定。始発駅作業/終着駅作業は無条件 2 行(空)を出す
 * (ユーザ決定: 原典忠実)。運用番号・路線外・カスタマイズ行は M1 対象外。
 */

import type { Eki, Ressyahoukou } from '@oudia/format';
import { buildColSpec } from '../csv/colSpec.js';

export type JikokuhyouRowType =
  | 'ressyabangou'
  | 'ressyasyubetsu'
  | 'ressyamei'
  | 'gousuu'
  | 'gou'
  | 'shihatsuEkimei'
  | 'operationShihatsu' // 始発駅作業(2 行)
  | 'shuchakuEkimei'
  | 'operationShuchaku' // 終着駅作業(2 行)
  | 'chaku'
  | 'track'
  | 'hatsu' // 駅ブロック(buildColSpec 由来)
  | 'bikou';

export interface JikokuhyouRowSpec {
  readonly type: JikokuhyouRowType;
  /** 'chaku' | 'track' | 'hatsu' のみ有効(駅Order)。他は null。 */
  readonly ekiOrder: number | null;
  /** 始/終着駅作業の 2 行目(空継続行)。ラベルは 1 行目のみ。 */
  readonly isContinuation: boolean;
}

export interface JikokuhyouRowOptions {
  /** DispProp.displayRessyamei(既定 true)。 */
  readonly displayRessyamei: boolean;
}

/** 通常時刻表の行スペックを構築する。 */
export function buildJikokuhyouRowSpec(
  ekiCont: readonly Eki[],
  houkou: Ressyahoukou,
  opts: JikokuhyouRowOptions,
): JikokuhyouRowSpec[] {
  const rows: JikokuhyouRowSpec[] = [];
  const push = (type: JikokuhyouRowType, cont = false): void => {
    rows.push({ type, ekiOrder: null, isContinuation: cont });
  };

  push('ressyabangou');
  push('ressyasyubetsu');
  if (opts.displayRessyamei) {
    push('ressyamei');
    push('gousuu');
    push('gou');
  }
  push('shihatsuEkimei');
  push('operationShihatsu');
  push('operationShihatsu', true); // 2 行・空
  push('shuchakuEkimei');
  push('operationShuchaku');
  push('operationShuchaku', true);

  for (const c of buildColSpec(ekiCont, houkou)) {
    rows.push({ type: c.type, ekiOrder: c.ekiOrder, isContinuation: false });
  }

  push('bikou');
  return rows;
}
