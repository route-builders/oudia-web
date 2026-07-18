// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 oudia-second-web contributors
//
// Based on OuDiaSecond (Copyright (C) 2017-2026 diagram_mania)
// and OuDia (Copyright (C) 2006-2017 take-okm)

/**
 * 列車の運行範囲導出(原典 CentDedRessya の getSihatsuEki 系メソッドの移植。
 * CentDedRessya.cpp:358-640)。すべて駅Order(方向基準)で扱う。
 */

import type { EkiJikoku, Ressya } from '@oudia/format';

/**
 * 駅Order の駅時刻を取得する(原典 getCentDedEkiJikoku。CentDedRessya.cpp:236)。
 * 範囲外(このライブラリのリーダーは末尾 None を切り詰めるため起こり得る)は
 * 既定値 = 運行なし(None・時刻 null・番線なし)を返す。
 */
export function getEkiJikoku(ressya: Ressya, iEkiOrder: number): EkiJikoku {
  const ej = ressya.ekiJikokuCont[iEkiOrder];
  if (ej !== undefined) return ej;
  return {
    ekiatsukai: 'none',
    chakuJikoku: null,
    hatsuJikoku: null,
    ressyaTrackIndex: null,
    beforeOperationCont: [],
    afterOperationCont: [],
  };
}

/** 始発駅Order = atsukai != none の最小駅Order。なければ -1(原典 getSihatsuEki)。 */
export function getSihatsuEki(ressya: Ressya): number {
  const cont = ressya.ekiJikokuCont;
  for (let i = 0; i < cont.length; i++) {
    if (getEkiJikoku(ressya, i).ekiatsukai !== 'none') return i;
  }
  return -1;
}

/** 終着駅Order = atsukai != none の最大駅Order。なければ -1(原典 getSyuuchakuEki)。 */
export function getSyuuchakuEki(ressya: Ressya): number {
  const cont = ressya.ekiJikokuCont;
  for (let i = cont.length - 1; i >= 0; i--) {
    if (getEkiJikoku(ressya, i).ekiatsukai !== 'none') return i;
  }
  return -1;
}

/**
 * 有効始発駅Order(原典 getValidSihatsuEki。CentDedRessya.cpp:558-580)。
 *   atsukai != none かつ発時刻が非 null かつ次駅が停車/通過、の最小駅Order。なければ -1。
 */
export function getValidSihatsuEki(ressya: Ressya): number {
  const cont = ressya.ekiJikokuCont;
  for (let i = 0; i < cont.length - 1; i++) {
    const ej = getEkiJikoku(ressya, i);
    if (ej.ekiatsukai === 'none') continue;
    if (ej.hatsuJikoku === null) continue;
    const next = getEkiJikoku(ressya, i + 1).ekiatsukai;
    if (next === 'teisya' || next === 'tsuuka') return i;
  }
  return -1;
}

/**
 * 有効終着駅Order(原典 getValidSyuuchakuEki。CentDedRessya.cpp:582-604)。
 *   atsukai != none かつ着時刻が非 null かつ前駅が停車/通過、の最大駅Order。なければ -1。
 */
export function getValidSyuuchakuEki(ressya: Ressya): number {
  const cont = ressya.ekiJikokuCont;
  for (let i = cont.length - 1; i > 0; i--) {
    const ej = getEkiJikoku(ressya, i);
    if (ej.ekiatsukai === 'none') continue;
    if (ej.chakuJikoku === null) continue;
    const prev = getEkiJikoku(ressya, i - 1).ekiatsukai;
    if (prev === 'teisya' || prev === 'tsuuka') return i;
  }
  return -1;
}

/**
 * (ekiOrder, item) の直前から着⇄発を交互に遡り、最初の非 null 時刻を返す
 * (原典 findrevJikoku(decJikokuOrder(order))。CentDedRessya.cpp:638-670, 1008-1024)。
 * 発 → 同駅の着 → 前駅の発 → … の順。駅扱・表示有無は見ない(時刻値の非 null のみ)。
 * 連続入力モードの入場判定・時合成の基準(ダイアログの時補完基準 referJikokuFor とは別物)。
 */
export function findRevJikokuItem(
  ressya: Ressya,
  ekiOrder: number,
  item: 'chaku' | 'hatsu',
): EkiJikoku['hatsuJikoku'] {
  let o = ekiOrder;
  let it = item;
  for (;;) {
    if (it === 'hatsu') {
      it = 'chaku'; // 発 → 同駅の着
    } else {
      o -= 1; // 着 → 前駅の発
      it = 'hatsu';
    }
    if (o < 0) return null;
    const ej = getEkiJikoku(ressya, o);
    const v = it === 'chaku' ? ej.chakuJikoku : ej.hatsuJikoku;
    if (v !== null) return v;
  }
}

/**
 * iEkiOrder と次駅の間が運行ありか(原典 isRunBetweenNextEki。CentDedRessya.cpp:486-508)。
 *   両駅とも停車または通過なら true。
 */
export function isRunBetweenNextEki(ressya: Ressya, iEkiOrder: number): boolean {
  const cont = ressya.ekiJikokuCont;
  if (!(iEkiOrder >= 0 && iEkiOrder < cont.length - 1)) return false;
  const a = getEkiJikoku(ressya, iEkiOrder).ekiatsukai;
  const b = getEkiJikoku(ressya, iEkiOrder + 1).ekiatsukai;
  return (a === 'teisya' || a === 'tsuuka') && (b === 'teisya' || b === 'tsuuka');
}
