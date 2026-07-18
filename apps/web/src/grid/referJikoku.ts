// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 up-tri
//
// Based on OuDiaSecond (Copyright (C) 2017-2026 diagram_mania)

/**
 * 駅時刻ダイアログの時補完に使う参照時刻(前駅の発時刻優先、なければ着)。
 * 原典 getJikokuFromUI の参照解決に相当。始発(前方すべて none)は null → 補完なし。
 */

import { getEkiJikoku } from '@oudia-web/domain';
import type { Jikoku, Ressya } from '@oudia-web/format';

/** ekiOrder の 1 つ手前から後方へ、最初の非 none 駅の時刻(発優先、なければ着)。 */
export function referJikokuFor(ressya: Ressya, ekiOrder: number): Jikoku {
  for (let o = ekiOrder - 1; o >= 0; o--) {
    const ej = getEkiJikoku(ressya, o);
    if (ej.ekiatsukai === 'none') continue;
    if (ej.hatsuJikoku !== null) return ej.hatsuJikoku;
    if (ej.chakuJikoku !== null) return ej.chakuJikoku;
  }
  return null;
}
