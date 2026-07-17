// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 oudia-second-web contributors
//
// Based on OuDiaSecond (Copyright (C) 2017-2026 diagram_mania)
// and OuDia (Copyright (C) 2006-2017 take-okm)

/**
 * 列車エンティティの構築ヘルパ。原典 CentDedRessya のコンストラクタ相当。
 */

import type { Ressya, Ressyahoukou } from '@oudia/format';

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
