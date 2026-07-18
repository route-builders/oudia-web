// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 oudia-second-web contributors
//
// Based on OuDiaSecond (Copyright (C) 2017-2026 diagram_mania)
// and OuDia (Copyright (C) 2006-2017 take-okm)

/**
 * 時刻表 CSV の駅時刻列スペック(原典 CdYColSpecCont::scan のプレーン分岐の移植。
 * CdYColSpecCont.cpp:335,346,413,511)。運用(Operation)列は M2 対象外なので生成しない。
 *
 * 駅Order 0..N-1 を走査し、各駅について着 → 番線 → 発 の順で、表示フラグが立つものを
 * 追加する。ヘッダー行・各列車のセル埋めで同一のスペック列を使うため整合が自動で取れる。
 */

import type { Eki, Ressyahoukou } from '@oudia/format';
import { ekiIndexOfEkiOrder } from '@oudia/domain';
import { getChakujikokuHyouji, getHatsujikokuHyouji, getTrackDisplay } from './ekiDisplay.js';

export type CsvColumnType = 'chaku' | 'track' | 'hatsu';

export interface CsvColumnSpec {
  /** 駅Order(方向基準)。 */
  readonly ekiOrder: number;
  readonly type: CsvColumnType;
}

/**
 * 駅時刻列スペックを構築する。ekiCont は路線基準(駅Index 順)。houkou で駅Order へ写像する。
 *
 * @param displayAllJikoku [全時刻を表示](原典 bDisplayAllJikoku): 駅時刻形式に関わらず
 *        全駅に着・発の両行を生成する(CdYColSpecCont.cpp 346-351, 511-516)。既定 false。
 */
export function buildColSpec(
  ekiCont: readonly Eki[],
  houkou: Ressyahoukou,
  displayAllJikoku = false,
): CsvColumnSpec[] {
  const ekiCount = ekiCont.length;
  const specs: CsvColumnSpec[] = [];
  for (let ekiOrder = 0; ekiOrder < ekiCount; ekiOrder++) {
    const eki = ekiCont[ekiIndexOfEkiOrder(ekiOrder, ekiCount, houkou)];
    if (eki === undefined) continue;
    if (getChakujikokuHyouji(eki.ekijikokukeisiki, houkou) || displayAllJikoku) {
      specs.push({ ekiOrder, type: 'chaku' });
    }
    if (getTrackDisplay(eki, houkou)) {
      specs.push({ ekiOrder, type: 'track' });
    }
    if (getHatsujikokuHyouji(eki.ekijikokukeisiki, houkou) || displayAllJikoku) {
      specs.push({ ekiOrder, type: 'hatsu' });
    }
  }
  return specs;
}
