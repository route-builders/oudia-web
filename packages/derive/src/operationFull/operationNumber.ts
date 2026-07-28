// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 up-tri
//
// Based on OuDiaSecond (Copyright (C) 2017-2026 diagram_mania)
// and OuDia (Copyright (C) 2006-2017 take-okm)

/**
 * 運番状態機械(原典 CentDedBeforeOperation / CentDedAfterOperation の運番スロット操作の直訳)。
 * M7c PR-C。
 *
 * スロット: n1(#1 Original/Temp/Before)、n2(#2 Main/Assigned)、n3(#3 Sub/反転後)、
 * subAssigned(Connect の Sub 到着フラグ、原典 m_bBoolData2)。運番は string[](併結並列)。
 *
 * ★原典に dedup は存在しない(merge/split/trim いずれも重複除去しない)。trim は ; 以降の
 * suffix 除去のみ。;n dedup は導入しない(忠実移植)。
 *
 * get/set の Before/After 非対称:
 * - Before Junction は #2、それ以外 #1(get/set/clear すべて)。
 * - After In/Outer/Junction は #1(NumberChange&&reverse のみ #3)。
 */

import type { OperationNumberSlots } from './types.js';

/** 空のスロット。 */
export function emptySlots(original: string[] = []): OperationNumberSlots {
  return { n1: [...original], n2: [], n3: [], subAssigned: false };
}

/**
 * merge(原典 mergeOperationNumber、Connect のみ、cpp:314/303)。
 * 空スロットは [''](空文字列 1 個)に置換される → 結果は必ず ≥2 要素。dedup なし。
 * @param reverseJoin boolData1(反転結合)。true なら [n3, n2]、false なら [n2, n3]。
 */
export function mergeOperationNumber(slots: OperationNumberSlots, reverseJoin: boolean): void {
  const first = reverseJoin ? slots.n3 : slots.n2;
  const second = reverseJoin ? slots.n2 : slots.n3;
  const out: string[] = first.length === 0 ? [''] : [...first];
  if (second.length === 0) out.push('');
  else out.push(...second);
  slots.n1 = out;
}

/**
 * split(原典 splitOperationNumber、Release のみ、cpp:365/354)。
 * 主編成 = n2、解結編成 = n3。max/min クランプで両者最低 1 要素。
 * @param releasePos   releasePosition(0=末尾から count 解結 / 1=先頭から count 解結 / 他)
 * @param releaseCount 解結両数
 */
export function splitOperationNumber(
  slots: OperationNumberSlots,
  releasePos: number,
  releaseCount: number,
): void {
  const n1 = slots.n1;
  if (n1.length === 0) {
    slots.n2.push('');
    slots.n3.push('');
    return;
  }
  if (n1.length === 1) {
    slots.n2 = [...n1];
    slots.n3.push('');
    return;
  }
  if (releasePos === 0) {
    const mainSize = Math.max(1, n1.length - releaseCount);
    slots.n2 = n1.slice(0, mainSize);
    slots.n3 = n1.slice(mainSize);
  } else if (releasePos === 1) {
    const subSize = Math.min(n1.length - 1, releaseCount);
    slots.n3 = n1.slice(0, subSize);
    slots.n2 = n1.slice(subSize);
  } else {
    const mainSize = Math.min(n1.length - 1, releaseCount);
    slots.n2 = n1.slice(0, mainSize);
    slots.n3 = n1.slice(mainSize);
  }
}

/** ; 以降を除去(1 要素)。; なしは不変。 */
function trimOne(s: string): string {
  const pos = s.indexOf(';');
  return pos >= 0 ? s.slice(0, pos) : s;
}

/**
 * trim(原典 trimSuffixOperationNumber、Connect/Release のみ、cpp:484/510)。
 * #1/#2/#3 全スロット全要素で最初の ; 以降を除去する。
 */
export function trimSuffixOperationNumber(slots: OperationNumberSlots): void {
  slots.n1 = slots.n1.map(trimOne);
  slots.n2 = slots.n2.map(trimOne);
  slots.n3 = slots.n3.map(trimOne);
}

/**
 * setOperationNumberSub(#3 = value。Connect なら subAssigned=true、原典 h:878/848)。
 */
export function setOperationNumberSub(
  slots: OperationNumberSlots,
  value: string[],
  isConnect: boolean,
): void {
  slots.n3 = [...value];
  if (isConnect) slots.subAssigned = true;
}

/** setOperationNumberMain(#2 = value、原典 h:869/837)。 */
export function setOperationNumberMain(slots: OperationNumberSlots, value: string[]): void {
  slots.n2 = [...value];
}

/**
 * setOperationNumberBefore(#1 = value 後に split。Release のみ、原典 h:978/948)。
 */
export function setOperationNumberBefore(
  slots: OperationNumberSlots,
  value: string[],
  releasePos: number,
  releaseCount: number,
): void {
  slots.n1 = [...value];
  splitOperationNumber(slots, releasePos, releaseCount);
}

/**
 * setOperationNumberAssigned(#2 = value。reverse なら #3 = size>1 で reverse(value) / 他 value。
 * 原典 h:1356/1193)。
 */
export function setOperationNumberAssigned(
  slots: OperationNumberSlots,
  value: string[],
  reverse: boolean,
): void {
  slots.n2 = [...value];
  if (reverse) {
    slots.n3 = value.length > 1 ? [...value].reverse() : [...value];
  }
}

/**
 * 折返し反転(路線 m_bOperationNumberReverse。方向差 && size>1 のとき vector reverse。
 * 原典 :6886/7219/7960)。
 */
export function reverseForRoute(
  nums: string[],
  routeReverse: boolean,
  sameHoukou: boolean,
): string[] {
  if (routeReverse && !sameHoukou && nums.length > 1) return [...nums].reverse();
  return [...nums];
}

/** 空 or 空白のみ(size==1 && front=='')か。次列車 Temp 置換の判定。 */
export function isEmptyOrBlank(nums: readonly string[]): boolean {
  return nums.length === 0 || (nums.length === 1 && nums[0] === '');
}
