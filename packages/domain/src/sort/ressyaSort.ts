// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 oudia-second-web contributors
//
// Based on OuDiaSecond (Copyright (C) 2017-2026 diagram_mania)
// and OuDia (Copyright (C) 2006-2017 take-okm)

/**
 * 列車の並べ替え(原典 CDedRessyaSoater 系の比較関数群。抽出レポート sort-min-idou)。
 *
 * すべて「ソート対象(選択列車を左から詰めた列)に対する安定な比較関数」。tie-break の
 * 「列車 Index」はソート用コンテナ内の位置なので、実装では明示 index 比較で決定性を保証する。
 * 文字列比較は UTF-16 コード単位の辞書順(原典 tstring::operator<)。
 */

import type { Jikoku, Ressya } from '@oudia/format';
import { getEkiJikoku } from '../runRange.js';

const SEC_DAY = 86400;

/**
 * 起点時刻基準の循環比較キー(原典 CdDedJikoku::compare(v, 起点時刻)。CdDedJikoku.cpp 495-518)。
 * 起点より前の時刻は +24h(例: 起点 5:00 なら 5:00 < 23:59 < 0:00 < 4:59)。
 */
export function kitenCompareKey(v: number, kiten: number): number {
  return v < kiten ? v + SEC_DAY : v;
}

/** 数字の塊/非数字の塊の交互列(原典 splitRessyabangou。CentDedRessya.cpp 1694-1787)。 */
export interface BangouElement {
  /** 数字塊の int 値。非数字塊は null(原典 INT_MIN)。 */
  num: number | null;
  /** 非数字塊の文字列。数字塊は ''。 */
  str: string;
}

/** 例: "AB012CD" → [(null,"AB"), (12,""), (null,"CD")]。空文字列は [(null,"")] 1 要素。 */
export function splitRessyabangou(s: string): BangouElement[] {
  if (s === '') return [{ num: null, str: '' }];
  const out: BangouElement[] = [];
  const isDigitCh = (c: string | undefined): boolean => c !== undefined && c >= '0' && c <= '9';
  let i = 0;
  while (i < s.length) {
    const isDigit = isDigitCh(s[i]);
    let j = i;
    while (j < s.length && isDigitCh(s[j]) === isDigit) j++;
    const tok = s.slice(i, j);
    out.push(isDigit ? { num: parseInt(tok, 10), str: '' } : { num: null, str: tok });
    i = j;
  }
  return out;
}

/** 要素同士の比較(数字先 / 非数字は短い方→辞書順 / 数字は値昇順)。 */
function compareBangouElement(a: BangouElement, b: BangouElement): number {
  const aNum = a.num !== null;
  const bNum = b.num !== null;
  if (aNum !== bNum) return aNum ? -1 : 1; // 数字 vs 非数字は数字が先
  if (a.num !== null && b.num !== null) return a.num - b.num;
  if (a.str.length !== b.str.length) return a.str.length - b.str.length; // 短い方が先
  return a.str < b.str ? -1 : a.str > b.str ? 1 : 0;
}

/**
 * 列車番号の分割比較(原典 CDedRessyaSoater_Ressyabangou 183-343)。
 * compareBottom=false は先頭から、true は末尾から要素比較。共通長で決着しなければ
 * 分割要素数の少ない方が先。
 */
export function compareRessyabangouSplit(a: string, b: string, compareBottom: boolean): number {
  const ea = splitRessyabangou(a);
  const eb = splitRessyabangou(b);
  const n = Math.min(ea.length, eb.length);
  for (let k = 0; k < n; k++) {
    const x = compareBottom ? ea[ea.length - 1 - k] : ea[k];
    const y = compareBottom ? eb[eb.length - 1 - k] : eb[k];
    if (x === undefined || y === undefined) break;
    const c = compareBangouElement(x, y);
    if (c !== 0) return c;
  }
  return ea.length - eb.length; // 要素数の少ない方が先
}

function compareLex(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** 号数比較(長さが短い方が先 → 辞書順)。 */
function compareGousuu(a: string, b: string): number {
  if (a.length !== b.length) return a.length - b.length;
  return compareLex(a, b);
}

/** 列車番号比較のフルチェーン(有無 → 分割比較)。 */
function compareBangouFull(a: string, b: string, compareBottom: boolean): number {
  const aHas = a !== '';
  const bHas = b !== '';
  if (aHas !== bHas) return aHas ? -1 : 1; // 番号ありが先
  if (!aHas) return 0;
  return compareRessyabangouSplit(a, b, compareBottom);
}

/** isNull 列車は後(全ソーター共通の第 1 キー)。 */
function compareIsNull(a: Ressya, b: Ressya): number {
  if (a.isNull !== b.isNull) return a.isNull ? 1 : -1;
  return 0;
}

export type SortMethod =
  | { kind: 'ekiatsukai'; ekiOrder: number; item: 'chaku' | 'hatsu'; kiten: number }
  | { kind: 'ressyabangou'; compareBottom: boolean }
  | { kind: 'ressyasyubetsu'; compareBottom: boolean }
  | { kind: 'ressyamei'; compareBottom: boolean }
  | { kind: 'bikou' }
  | { kind: 'track'; ekiOrder: number; kiten: number };

/** 駅扱ランク: 停車 0 → 通過 1 → 運行なし 2(原典 139-149)。 */
function atsukaiRank(a: Ressya, ekiOrder: number): number {
  const e = getEkiJikoku(a, ekiOrder).ekiatsukai;
  return e === 'teisya' ? 0 : e === 'tsuuka' ? 1 : 2;
}

/**
 * フォーカス項目の時刻(null なら他方で代替)と「着由来か」を返す(原典 203-224)。
 */
function jikokuOfItem(
  r: Ressya,
  ekiOrder: number,
  item: 'chaku' | 'hatsu',
): { v: Jikoku; isChaku: boolean } {
  const ej = getEkiJikoku(r, ekiOrder);
  const primary = item === 'chaku' ? ej.chakuJikoku : ej.hatsuJikoku;
  if (primary !== null) return { v: primary, isChaku: item === 'chaku' };
  const alt = item === 'chaku' ? ej.hatsuJikoku : ej.chakuJikoku;
  return { v: alt, isChaku: item !== 'chaku' };
}

/** 時刻比較の共通部: 非 null 先 → 起点基準昇順 → 同時刻は着が先。0 = 未決着。 */
function compareJikokuWithChakuTie(
  a: { v: Jikoku; isChaku: boolean },
  b: { v: Jikoku; isChaku: boolean },
  kiten: number,
): number {
  if ((a.v === null) !== (b.v === null)) return a.v === null ? 1 : -1; // 非 null 先
  if (a.v === null || b.v === null) return 0;
  const ka = kitenCompareKey(a.v, kiten);
  const kb = kitenCompareKey(b.v, kiten);
  if (ka !== kb) return ka - kb;
  if (a.isChaku !== b.isChaku) return a.isChaku ? -1 : 1; // 同時刻は着が先
  return 0;
}

/**
 * ソート方式ごとの比較関数を返す(index tie-break は sortRessyaOrder 側)。
 */
function comparatorOf(method: SortMethod): (a: Ressya, b: Ressya) => number {
  switch (method.kind) {
    case 'ekiatsukai':
      // 原典 CDedRessyaSoater_Ekiatsukai(167-280)。
      return (a, b) => {
        const rank = atsukaiRank(a, method.ekiOrder) - atsukaiRank(b, method.ekiOrder);
        if (rank !== 0) return rank;
        return compareJikokuWithChakuTie(
          jikokuOfItem(a, method.ekiOrder, method.item),
          jikokuOfItem(b, method.ekiOrder, method.item),
          method.kiten,
        );
      };
    case 'ressyabangou':
      // NULL 後 → 番号(有無 → 分割比較) → 種別 → 列車名 → 号数。
      return (a, b) =>
        compareIsNull(a, b) ||
        compareBangouFull(a.ressyabangou, b.ressyabangou, method.compareBottom) ||
        a.syubetsuIndex - b.syubetsuIndex ||
        compareLex(a.ressyamei, b.ressyamei) ||
        compareGousuu(a.gousuu, b.gousuu);
    case 'ressyasyubetsu':
      // NULL 後 → 種別 Index → 列車名 → 号数 → 番号。
      return (a, b) =>
        compareIsNull(a, b) ||
        a.syubetsuIndex - b.syubetsuIndex ||
        compareLex(a.ressyamei, b.ressyamei) ||
        compareGousuu(a.gousuu, b.gousuu) ||
        compareBangouFull(a.ressyabangou, b.ressyabangou, method.compareBottom);
    case 'ressyamei':
      // NULL 後 → 列車名 → 号数 → 種別 → 番号。
      return (a, b) =>
        compareIsNull(a, b) ||
        compareLex(a.ressyamei, b.ressyamei) ||
        compareGousuu(a.gousuu, b.gousuu) ||
        a.syubetsuIndex - b.syubetsuIndex ||
        compareBangouFull(a.ressyabangou, b.ressyabangou, method.compareBottom);
    case 'bikou':
      return (a, b) => compareIsNull(a, b) || compareLex(a.bikou, b.bikou);
    case 'track':
      // (停車・通過)=0 → 運行なし=1 → 番線 Index 昇順 → 発時刻(着代替)。
      return (a, b) => {
        const ra = atsukaiRank(a, method.ekiOrder) === 2 ? 1 : 0;
        const rb = atsukaiRank(b, method.ekiOrder) === 2 ? 1 : 0;
        if (ra !== rb) return ra - rb;
        const ta = getEkiJikoku(a, method.ekiOrder).ressyaTrackIndex ?? 0;
        const tb = getEkiJikoku(b, method.ekiOrder).ressyaTrackIndex ?? 0;
        if (ta !== tb) return ta - tb;
        return compareJikokuWithChakuTie(
          jikokuOfItem(a, method.ekiOrder, 'hatsu'),
          jikokuOfItem(b, method.ekiOrder, 'hatsu'),
          method.kiten,
        );
      };
  }
}

/**
 * ソート対象列(選択列車を左から詰めた列)の並べ替え結果を「位置の並べ替え(permutation)」で
 * 返す。order[k] = 位置 k に入るべき元位置。安定(同値は元順維持)。
 */
export function sortRessyaOrder(items: readonly Ressya[], method: SortMethod): number[] {
  const cmp = comparatorOf(method);
  const order = items.map((_, i) => i);
  order.sort((ia, ib) => {
    const a = items[ia];
    const b = items[ib];
    if (a === undefined || b === undefined) return ia - ib;
    const c = cmp(a, b);
    return c !== 0 ? c : ia - ib; // 原典 tie-break: コンテナ内 index 昇順
  });
  return order;
}

/**
 * 最小所要時間列車の検索(原典 CentDedRessyaCont::findEkikanSaisyouSecIndex、
 * CentDedRessyaCont.cpp 232-317)。駅 [ekiOrder] の発(着代替)と駅 [ekiOrder+1] の
 * 着(発代替)が両方非 null の列車から、所要秒(±12h 正規化)最小を探す。
 * 停車-停車ペアが 1 つでもあればそちらの最小を優先。見つからなければ null。
 */
export function findEkikanSaisyouSecIndex(
  list: readonly Ressya[],
  ekiOrder: number,
): number | null {
  let best = -1;
  let bestSec = Infinity;
  let bestTeisya = -1;
  let bestTeisyaSec = Infinity;
  for (let i = 0; i < list.length; i++) {
    const r = list[i];
    if (r === undefined) continue;
    const a = getEkiJikoku(r, ekiOrder);
    const b = getEkiJikoku(r, ekiOrder + 1);
    const hatsu = a.hatsuJikoku ?? a.chakuJikoku;
    const chaku = b.chakuJikoku ?? b.hatsuJikoku;
    if (hatsu === null || chaku === null) continue;
    let sec = (chaku as number) - (hatsu as number);
    if (sec > SEC_DAY / 2) sec -= SEC_DAY;
    else if (sec < -SEC_DAY / 2) sec += SEC_DAY;
    if (sec < bestSec) {
      bestSec = sec;
      best = i;
    }
    if (a.ekiatsukai === 'teisya' && b.ekiatsukai === 'teisya' && sec < bestTeisyaSec) {
      bestTeisyaSec = sec;
      bestTeisya = i;
    }
  }
  if (bestTeisya !== -1) return bestTeisya; // 停車ペア優先
  return best === -1 ? null : best;
}
