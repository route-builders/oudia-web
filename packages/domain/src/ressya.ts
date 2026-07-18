// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 oudia-second-web contributors
//
// Based on OuDiaSecond (Copyright (C) 2017-2026 diagram_mania)
// and OuDia (Copyright (C) 2006-2017 take-okm)

/**
 * 列車エンティティの構築ヘルパ。原典 CentDedRessya のコンストラクタ相当。
 */

import type { Ressya, Ressyahoukou } from '@oudia/format';
import { getEkiJikoku, getRunFirstEkiOrder, getRunLastEkiOrder } from './runRange.js';
import { subJikokuWrapped } from './command/jikokuCompletion.js';

/**
 * 空の列車を作る(原典 createNullRessya + 全長 all-none の駅時刻)。
 * isNull=true。ekiJikokuCont は駅数と同数(不変条件 entities.ts:211)。
 * ライターは isNull 列車を空 Ressya ディレクトリへ、全 none の駅時刻を空 EkiJikoku= へ
 * 直列化するため、新規列車として byte 一致する。
 *
 * @param ekiCount 路線の駅数
 * @param houkou   方向(0=下り / 1=上り)
 */
export function createNullRessya(ekiCount: number, houkou: Ressyahoukou): Ressya {
  return {
    isNull: true,
    houkou,
    syubetsuIndex: 0,
    ressyabangou: '',
    ressyamei: '',
    gousuu: '',
    bikou: '',
    isCanceled: false,
    ekiJikokuCont: Array.from({ length: ekiCount }, () => ({
      ekiatsukai: 'none' as const,
      chakuJikoku: null,
      hatsuJikoku: null,
      ressyaTrackIndex: null,
      beforeOperationCont: [],
      afterOperationCont: [],
    })),
  };
}

/**
 * 直通化の相手列車を探す(原典 CentDedRessyaCont::findTrainToDirect、
 * CentDedRessyaCont.cpp 320-365)。フォーカス列車(終着側)の右隣から昇順に走査し、
 * 「種別一致 + getRunFirstEkiOrder()==フォーカス駅Order + 時刻条件(終着側の
 * 運行最終駅の着(なければ発)と相手のフォーカス駅の発(なければ着)が両方非 null なら
 * 0 <= subJikoku(発-着)、どちらか null なら無条件)」を満たす最初の列車 index を返す。
 * 見つからなければ null。
 */
export function findTrainToDirect(
  list: readonly Ressya[],
  idxRessya: number,
  iEkiOrder: number,
): number | null {
  const base = list[idxRessya];
  if (base === undefined) return null;
  const terminalOrd = getRunLastEkiOrder(base);
  if (terminalOrd === -1) return null;
  const terminalSlot = getEkiJikoku(base, terminalOrd);
  const chakuJikoku = terminalSlot.chakuJikoku ?? terminalSlot.hatsuJikoku;

  for (let j = idxRessya + 1; j < list.length; j++) {
    const cand = list[j];
    if (cand === undefined) continue;
    if (cand.syubetsuIndex !== base.syubetsuIndex) continue;
    if (getRunFirstEkiOrder(cand) !== iEkiOrder) continue;
    const startSlot = getEkiJikoku(cand, iEkiOrder);
    const hatsuJikoku = startSlot.hatsuJikoku ?? startSlot.chakuJikoku;
    if (chakuJikoku !== null && hatsuJikoku !== null) {
      if (subJikokuWrapped(hatsuJikoku, chakuJikoku) < 0) continue;
    }
    return j;
  }
  return null;
}
