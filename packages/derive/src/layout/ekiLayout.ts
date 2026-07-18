// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 up-tri
//
// Based on OuDiaSecond (Copyright (C) 2017-2026 diagram_mania)
// and OuDia (Copyright (C) 2006-2017 take-okm)

/**
 * ダイヤグラム Y 軸(駅軸)レイアウト(原典 CentDedDgrDia::readCentDedRosen_02_updateEkiCont
 * + CentDedDgrEki の Y 座標決定。analysis §05 §2.2)。
 *
 * 駅間の縦幅は実キロではなく「駅間最小所要秒数」(その駅間を走る全列車の最短所要時間)。
 * これによりダイヤの傾きが最大 45 度相当で揃う。
 *
 * M1 スコープ: 基本の駅間幅累積 + 主要駅フラグ。在線表(在線表示)スペースと
 * 運用機能の上下余白は M1 では表示しない(roadmap: 運用作業データは読込・保持のみ)ため、
 * 上下余白 = 既定駅間幅 ×1 の最小構成で計算する。
 */

import { ekiOrderOfEkiIndex, getEkiJikoku, subJikoku } from '@oudia-web/domain';
import type { Ressya, Rosen } from '@oudia-web/format';
import { RESSYAHOUKOU_NOBORI } from '@oudia-web/format';
import type { DiaLayoutFrame, EkiLayout } from './types.js';

/**
 * 駅間 iEkiOrder→iEkiOrder+1 の最小所要秒数(原典 findEkikanSaisyouSec。
 * CentDedRessyaCont.cpp:232)。全列車を走査し、hatsu(i) と chaku(i+1) が両方非 null の
 * 所要秒の最小を取る。**停車-停車の最小があればそれを優先**し、なければ全体最小。
 * 該当なしは 0。
 */
export function findEkikanSaisyouSec(ressyaList: readonly Ressya[], iEkiOrder: number): number {
  let saisyou = -1;
  let saisyouTeisya = -1;
  for (const ressya of ressyaList) {
    const curr = getEkiJikoku(ressya, iEkiOrder);
    const next = getEkiJikoku(ressya, iEkiOrder + 1);
    // getHatsujikoku(true) / getChakujikoku(true) 相当: 片方 null なら他方で代用。
    const hatsu = curr.hatsuJikoku ?? curr.chakuJikoku;
    const chaku = next.chakuJikoku ?? next.hatsuJikoku;
    if (hatsu === null || chaku === null) continue;
    const sec = subJikoku(chaku, hatsu);
    if (saisyou === -1 || saisyou > sec) saisyou = sec;
    if (curr.ekiatsukai === 'teisya' && next.ekiatsukai === 'teisya') {
      if (saisyouTeisya === -1 || saisyouTeisya > sec) saisyouTeisya = sec;
    }
  }
  if (saisyouTeisya >= 0) return saisyouTeisya;
  return saisyou < 0 ? 0 : saisyou;
}

/**
 * ダイヤの Y 軸フレームを構築する。
 *
 * @param rosen      路線(駅・起点時刻・既定駅間幅)
 * @param kudari     下り列車リスト(方向別最小秒の走査に使う)
 * @param nobori     上り列車リスト
 */
export function buildDiaLayoutFrame(
  rosen: Rosen,
  kudari: readonly Ressya[],
  nobori: readonly Ressya[],
): DiaLayoutFrame {
  const ekiCont = rosen.ekiCont;
  const ekiCount = ekiCont.length;
  const defaultSize =
    rosen.diagramDgrYZahyouKyoriDefault > 0 ? rosen.diagramDgrYZahyouKyoriDefault : 60;

  // 各駅間(iEkiIndex → iEkiIndex+1)の幅を求める。駅間は駅Index 基準。
  // 方向別の最小秒は駅Order 基準で走査するため、駅Index→駅Order 変換して集約する。
  const gapWidths: number[] = [];
  for (let ekiIndex = 0; ekiIndex < ekiCount - 1; ekiIndex++) {
    const eki = ekiCont[ekiIndex];
    // 手動設定(nextEkiDistance > 0)なら両方向にその値。
    if (eki !== undefined && eki.nextEkiDistance > 0) {
      gapWidths.push(eki.nextEkiDistance);
      continue;
    }
    // 下り: 駅Index i の駅間は駅Order i(下りは Index=Order)。
    const kudariSec = findEkikanSaisyouSec(kudari, ekiIndex);
    // 上り: 駅Index i→i+1 は上り駅Order では (ekiCount-1-(i+1)) → (ekiCount-1-i)。
    // すなわち上り駅Order = ekiOrderOfEkiIndex(i+1) が起点側。
    const noboriKitenOrder = ekiOrderOfEkiIndex(ekiIndex + 1, ekiCount, RESSYAHOUKOU_NOBORI);
    const noboriSec = findEkikanSaisyouSec(nobori, noboriKitenOrder);
    gapWidths.push(resolveGapWidth(kudariSec, noboriSec, defaultSize));
  }

  // Y 座標を累積。上余白 = 既定駅間幅 ×1(M1 最小)。
  const originExtra = defaultSize;
  const ekiLayouts: EkiLayout[] = [];
  let y = originExtra;
  for (let ekiIndex = 0; ekiIndex < ekiCount; ekiIndex++) {
    const eki = ekiCont[ekiIndex];
    ekiLayouts.push({
      ekiIndex,
      ekimei: eki?.ekimei ?? '',
      isSyuyou: eki?.ekikibo === 'syuyou',
      dgrYOrg: y,
      dgrYTer: y,
    });
    const gap = gapWidths[ekiIndex];
    if (gap !== undefined) y += gap;
  }
  // 下余白 = 既定駅間幅 ×1。
  const dgrYSize = y + defaultSize;

  return {
    ekiLayouts,
    dgrXPosMin: rosen.kitenJikoku ?? 0,
    dgrXSize: 86400,
    dgrYSize,
  };
}

/**
 * 方向別最小秒から駅間幅を決める(原典 CentDedDgrEki::getDgrYZahyouKyori)。
 *   両方 >0 → 小さい方。片方だけ >0 → その値。両方 0 → 既定幅。
 */
function resolveGapWidth(kudariSec: number, noboriSec: number, defaultSize: number): number {
  if (kudariSec > 0 && noboriSec > 0) return Math.min(kudariSec, noboriSec);
  if (kudariSec > 0) return kudariSec;
  if (noboriSec > 0) return noboriSec;
  return defaultSize;
}
