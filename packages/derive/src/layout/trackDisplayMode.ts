// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 up-tri
//
// Based on OuDiaSecond (Copyright (C) 2017-2026 diagram_mania)
// and OuDia (Copyright (C) 2006-2017 take-okm)

/**
 * 在線表の表示モード導出(原典 CentDedDgrDia::readCentDedRosen_02_updateEkiCont の
 * iDiagramTrackDisplay、entDgr/CentDedDgrDia.cpp:228-286)。M7f。
 *
 * 原典 Ver2.06.18 で仕様が変わった箇所。**分岐環状グループに属する駅は、着時刻駅でも
 * 発着型(mode 1)へ昇格する**(:240-260)。これが分岐環状の在線表の入口。
 *
 * mode の意味(原典 CentDedDgrEkiCont.h:229-278):
 * - 0: 在線表なし
 * - 1: 発着時刻駅。駅横罫線が **2 本**(起点方 Org / 終点方 Ter)になり、在線表はその間
 * - 2: 着時刻駅。在線表は駅横線の**列車終点側**
 * - 3: 発時刻駅。在線表は**列車起点側**
 *
 * ★上り列車から見るときは 2 と 3 を入れ替える(原典 CentDedDgrEkiCont.cpp:180-197 の
 * ContNobori::get)。1 と 0 はそのまま。
 *
 * ★原典ヘッダの「分岐駅設定が有効ならこの設定(在線表)は無効」というコメントは stale。
 * 実装は分岐駅でも在線表を出す(CentDedEki.h:620-630 / CentDedDgrEkiCont.h:230-231)。
 */

import type { BrunchLoopMap } from '@oudia-web/domain';
import type { Eki } from '@oudia-web/format';

/** 在線表の表示モード。 */
export type DiagramTrackDisplayMode = 0 | 1 | 2 | 3;

/**
 * 駅の在線表表示モードを求める(下り基準)。
 *
 * @param brunchLoopStandalone その駅が単独駅か(= BrunchLoopPosition === -1 相当)
 */
export function diagramTrackDisplayMode(
  eki: Eki,
  brunchLoopStandalone: boolean,
): DiagramTrackDisplayMode {
  if (!eki.diagramTrackDisplay || eki.ekikibo !== 'syuyou') return 0;
  switch (eki.ekijikokukeisiki) {
    case 'hatsuchaku':
      return 1;
    case 'kudariChaku':
      // ★分岐環状グループなら発着型へ昇格(原典 :242-251)。
      return brunchLoopStandalone ? 2 : 1;
    case 'noboriChaku':
      return brunchLoopStandalone ? 3 : 1;
    default:
      // 発時刻のみ(Jikokukeisiki_Hatsu)は在線表を出さない。
      return 0;
  }
}

/** brunchLoopMap から「単独駅か」を引く。 */
export function isStandaloneEki(map: BrunchLoopMap, ekiIndex: number): boolean {
  return (map.positions[ekiIndex] ?? 'standalone') === 'standalone';
}

/** 上り列車から見たモード(2 と 3 を入れ替える。原典 ContNobori::get)。 */
export function trackDisplayModeForHoukou(
  mode: DiagramTrackDisplayMode,
  houkou: 0 | 1,
): DiagramTrackDisplayMode {
  if (houkou === 0) return mode;
  if (mode === 2) return 3;
  if (mode === 3) return 2;
  return mode;
}
