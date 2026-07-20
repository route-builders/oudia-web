// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 up-tri
//
// Based on OuDiaSecond (Copyright (C) 2017-2026 diagram_mania)
// and OuDia (Copyright (C) 2006-2017 take-okm)

/**
 * 駅時刻形式(ekijikokukeisiki)変更に伴う列車時刻の詰め替え(原典
 * CentDedRosen::adjustByEkijikokukeisiki → CentDedDia → CentDedRessyaCont → CentDedRessya →
 * CentDedEkiJikoku::adjustByEkijikokukeisiki、CentDedEkiJikoku.cpp:406 の直訳)。
 * data-model §8.2 rule 3。
 *
 * 形式に無い側の時刻をもう一方へコピーして null 化する。着/発の「表示あり」判定は
 * 駅時刻形式 × 方向で決まる(原典 CentDedEkiCont.cpp:231-238 = 下り / 380-388 = 上り)。
 */

import type { EkiJikoku, Ekijikokukeisiki, Ressya, RosenFileData } from '@oudia-web/format';
import { RESSYAHOUKOU_KUDARI, type Ressyahoukou } from '@oudia-web/format';
import { ekiOrderOfEkiIndex } from '../ekiOrder.js';
import { getSihatsuEki, getSyuuchakuEki } from '../runRange.js';

/** 下り時刻表で着時刻を表示するか(原典 CentDedEkiCont.cpp:231-233)。 */
function chakuHyoujiKudari(k: Ekijikokukeisiki): boolean {
  return k === 'hatsuchaku' || k === 'kudariChaku' || k === 'kudariHatsuchaku';
}
/** 下り時刻表で発時刻を表示するか(原典 CentDedEkiCont.cpp:234-238)。 */
function hatsuHyoujiKudari(k: Ekijikokukeisiki): boolean {
  return (
    k === 'hatsuchaku' ||
    k === 'hatsu' ||
    k === 'noboriChaku' ||
    k === 'kudariHatsuchaku' ||
    k === 'noboriHatsuchaku'
  );
}
/** 上り時刻表で着時刻を表示するか(原典 CentDedEkiCont.cpp:380-382 = 下りの Kudari↔Nobori 反転)。 */
function chakuHyoujiNobori(k: Ekijikokukeisiki): boolean {
  return k === 'hatsuchaku' || k === 'noboriChaku' || k === 'noboriHatsuchaku';
}
/** 上り時刻表で発時刻を表示するか。 */
function hatsuHyoujiNobori(k: Ekijikokukeisiki): boolean {
  return (
    k === 'hatsuchaku' ||
    k === 'hatsu' ||
    k === 'kudariChaku' ||
    k === 'kudariHatsuchaku' ||
    k === 'noboriHatsuchaku'
  );
}

function chakuHyouji(k: Ekijikokukeisiki, houkou: Ressyahoukou): boolean {
  return houkou === RESSYAHOUKOU_KUDARI ? chakuHyoujiKudari(k) : chakuHyoujiNobori(k);
}
function hatsuHyouji(k: Ekijikokukeisiki, houkou: Ressyahoukou): boolean {
  return houkou === RESSYAHOUKOU_KUDARI ? hatsuHyoujiKudari(k) : hatsuHyoujiNobori(k);
}

/**
 * 1 スロットの詰め替え(原典 CentDedEkiJikoku::adjustByEkijikokukeisiki の 4 ルール直訳)。
 */
function adjustSlot(
  slot: EkiJikoku,
  chakuShown: boolean,
  hatsuShown: boolean,
  isSihatsu: boolean,
  isSyuuchaku: boolean,
): void {
  const chakuNull = slot.chakuJikoku === null;
  const hatsuNull = slot.hatsuJikoku === null;
  if (chakuShown && !hatsuShown && chakuNull && !hatsuNull) {
    // 着あり形式・発なし形式で、着 null・発非 null → 着へ発をコピー・発 null
    slot.chakuJikoku = slot.hatsuJikoku;
    slot.hatsuJikoku = null;
  } else if (!chakuShown && hatsuShown && !chakuNull && hatsuNull) {
    slot.hatsuJikoku = slot.chakuJikoku;
    slot.chakuJikoku = null;
  } else if (isSihatsu && chakuShown && hatsuShown && !chakuNull && hatsuNull) {
    // 始発駅・発着形式・着のみ → 発へ着をコピー・着 null
    slot.hatsuJikoku = slot.chakuJikoku;
    slot.chakuJikoku = null;
  } else if (isSyuuchaku && chakuShown && hatsuShown && chakuNull && !hatsuNull) {
    // 終着駅・発着形式・発のみ → 着へ発をコピー・発 null
    slot.chakuJikoku = slot.hatsuJikoku;
    slot.hatsuJikoku = null;
  }
}

/** 1 列車の駅Order 位置を詰め替える(原典 CentDedRessya::adjustByEkijikokukeisiki)。 */
function adjustRessyaAt(
  ressya: Ressya,
  ekiOrder: number,
  chakuShown: boolean,
  hatsuShown: boolean,
): void {
  if (ressya.isNull) return;
  const slot = ressya.ekiJikokuCont[ekiOrder];
  if (slot === undefined) return;
  const isSihatsu = getSihatsuEki(ressya) === ekiOrder;
  const isSyuuchaku = getSyuuchakuEki(ressya) === ekiOrder;
  adjustSlot(slot, chakuShown, hatsuShown, isSihatsu, isSyuuchaku);
}

/**
 * 指定駅(駅Index)の駅時刻形式に合わせて、全ダイヤ全方向全列車の当該駅時刻を詰め替える
 * (原典 CentDedRosen::adjustByEkijikokukeisiki、CentDedRosen.cpp:1699)。
 */
export function adjustByEkijikokukeisiki(draft: RosenFileData, iEkiIndex: number): void {
  const ekiCont = draft.rosen.ekiCont;
  const eki = ekiCont[iEkiIndex];
  if (eki === undefined) return;
  const keisiki = eki.ekijikokukeisiki;
  const ekiCount = ekiCont.length;
  for (const dia of draft.rosen.diaCont) {
    for (let houkou = 0; houkou < 2; houkou++) {
      const list = dia.ressyaCont[houkou];
      if (list === undefined) continue;
      const h = houkou as Ressyahoukou;
      const ekiOrder = ekiOrderOfEkiIndex(iEkiIndex, ekiCount, h);
      const chakuShown = chakuHyouji(keisiki, h);
      const hatsuShown = hatsuHyouji(keisiki, h);
      for (const ressya of list) {
        adjustRessyaAt(ressya, ekiOrder, chakuShown, hatsuShown);
      }
    }
  }
}
