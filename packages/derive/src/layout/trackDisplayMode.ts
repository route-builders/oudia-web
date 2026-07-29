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

/**
 * ダイヤグラム層の loopOpposite を導出する(原典 CentDedDgrDia.cpp:290-315)。
 *
 * 生の Eki.loopOpposite をそのまま使うのではなく、駅時刻形式で作り替える:
 * - 上り着駅: 終点方に「この駅を環状起点とする駅」があり、**その駅が発着型**なら
 *   その駅の loopOpposite を引き継ぐ。下り着型なら false。
 * - 下り着駅: 生の loopOpposite をそのまま使う。
 * - それ以外: 常に false(発着駅で終点駅かつ loopOpposite=true でもここでは false)。
 *
 * ★brunchOpposite の方は加工されず生の値がそのまま Dgr 層へ渡る(:400)。
 */
export function deriveLoopOpposite(ekiCont: readonly Eki[], ekiIndex: number): boolean {
  const eki = ekiCont[ekiIndex];
  if (eki === undefined) return false;
  if (eki.ekijikokukeisiki === 'noboriChaku') {
    for (let idx = ekiIndex + 1; idx < ekiCont.length; idx++) {
      const other = ekiCont[idx];
      if (other?.loopOriginEkiIndex !== ekiIndex) continue;
      return other.ekijikokukeisiki === 'hatsuchaku' ? other.loopOpposite : false;
    }
    return false;
  }
  if (eki.ekijikokukeisiki === 'kudariChaku') return eki.loopOpposite;
  return false;
}

/**
 * 分岐環状の在線行を複製するときの作業コード(原典 CentDedDgrRessya.cpp:1803-1813 /
 * :1898-1909 / :1993-2003)。
 *
 * 時刻元駅と表示駅が同じなら -1。違えば
 * 「(時刻元駅.brunchOpposite || 時刻元駅.loopOpposite) === 表示駅の反転フラグ」で
 * -2(終点方)/ -4(起点方へ発車)を決める。
 *
 * ★表示駅側に使うフラグが配列で違う: 起点側/終点側の分岐派生駅は **brunchOpposite**、
 * 環状チェーンは **loopOpposite**。この非対称は原典どおり。
 */
export function brunchOppositeOperationCode(
  ekiCont: readonly Eki[],
  srcEkiIndex: number,
  dispEkiIndex: number,
  kind: 'brunch' | 'loop',
): -1 | -2 | -4 {
  if (srcEkiIndex === dispEkiIndex) return -1;
  const src = ekiCont[srcEkiIndex];
  const disp = ekiCont[dispEkiIndex];
  if (src === undefined || disp === undefined) return -1;
  const s = src.brunchOpposite || deriveLoopOpposite(ekiCont, srcEkiIndex);
  const d = kind === 'loop' ? deriveLoopOpposite(ekiCont, dispEkiIndex) : disp.brunchOpposite;
  return s === d ? -2 : -4;
}
