// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 up-tri
//
// Based on OuDiaSecond (Copyright (C) 2017-2026 diagram_mania)
// and OuDia (Copyright (C) 2006-2017 take-okm)

/**
 * 駅Index ⇄ 駅Order の変換(原典 EkiIndexOfEkiOrder / EkiOrderOfEkiIndex の直訳)。
 * data-model §6.4。
 *
 * - 駅Index: 路線基準(下り始発 = 0)。ekiCont の添字。
 * - 駅Order: 列車方向基準(始発 = 0)。ekiJikokuCont の添字。上りは駅数-1-index。
 *
 * 対合写像なので同一実装で双方向に使える。
 */

import type { Ressyahoukou } from '@oudia-web/format';
import { RESSYAHOUKOU_KUDARI } from '@oudia-web/format';

export function ekiIndexOfEkiOrder(
  ekiOrder: number,
  ekiCount: number,
  houkou: Ressyahoukou,
): number {
  return houkou === RESSYAHOUKOU_KUDARI ? ekiOrder : ekiCount - 1 - ekiOrder;
}

export function ekiOrderOfEkiIndex(
  ekiIndex: number,
  ekiCount: number,
  houkou: Ressyahoukou,
): number {
  return houkou === RESSYAHOUKOU_KUDARI ? ekiIndex : ekiCount - 1 - ekiIndex;
}

/** 時刻 Order = 駅Order * 2 + (着=0 / 発=1)。data-model §2.8。 */
export function jikokuOrderOf(ekiOrder: number, item: 'chaku' | 'hatsu'): number {
  return ekiOrder * 2 + (item === 'hatsu' ? 1 : 0);
}
