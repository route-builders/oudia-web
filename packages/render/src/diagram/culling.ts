// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 up-tri
//
// Based on OuDiaSecond (Copyright (C) 2017-2026 diagram_mania)
// and OuDia (Copyright (C) 2006-2017 take-okm)

/**
 * ビューポートカリング(原典 CEnumRessyasen の事前カリング。design/06_rendering §3.2)。
 * 表示駅Order 範囲の二分探索と、列車 xZone × 表示 X 範囲の交差判定。
 */

/**
 * 昇順の駅 Y 配列(dgrYTer 相当)に対し、表示 Y 範囲 [yBegin, yEnd] と交差する
 * 駅Index の [begin, end) 範囲を二分探索で求める(design §3.2)。
 *
 * @param ekiY   駅Index 昇順の Y 座標(秒)
 * @returns [begin, end)。範囲外は [0, 0]。
 */
export function displayEkiRange(
  ekiY: readonly number[],
  yBegin: number,
  yEnd: number,
): { begin: number; end: number } {
  const n = ekiY.length;
  if (n === 0) return { begin: 0, end: 0 };
  // 最初に yBegin 以上になる位置(1 つ手前も交差し得るので 1 引く)。
  const lower = lowerBound(ekiY, yBegin);
  const upper = upperBound(ekiY, yEnd);
  const begin = Math.max(0, lower - 1);
  const end = Math.min(n, upper + 1);
  return { begin, end };
}

/** ekiY[i] >= v となる最小 i。 */
function lowerBound(ekiY: readonly number[], v: number): number {
  let lo = 0;
  let hi = ekiY.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if ((ekiY[mid] ?? Infinity) < v) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** ekiY[i] > v となる最小 i。 */
function upperBound(ekiY: readonly number[], v: number): number {
  let lo = 0;
  let hi = ekiY.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if ((ekiY[mid] ?? Infinity) <= v) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/**
 * 列車 xZone [min, max](+ shiftSecond)が表示 X 範囲 [xBegin, xEnd] と交差するか。
 */
export function xZoneIntersects(
  xZone: readonly [number, number],
  shiftSecond: number,
  xBegin: number,
  xEnd: number,
): boolean {
  const min = xZone[0] + shiftSecond;
  const max = xZone[1] + shiftSecond;
  return max >= xBegin && min <= xEnd;
}

/**
 * 列車の日跨ぎ繰り返し描画用の shiftSecond 列を列挙する(原典 CRessyaDraw::execute)。
 * 列車 xZone を表示域左端より左へ 86400 ずつずらしてから、右端を超えるまで 86400 ずつ加算。
 */
export function enumShiftSeconds(
  xZone: readonly [number, number],
  xBegin: number,
  xEnd: number,
): number[] {
  const SECONDS_PER_DAY = 86400;
  const out: number[] = [];
  let shift = 0;
  // 左端より左に来るまで減算。
  while (xZone[1] + shift >= xBegin) shift -= SECONDS_PER_DAY;
  // そこから右端を超えるまで加算しながら、交差するものを収集。
  shift += SECONDS_PER_DAY;
  while (xZone[0] + shift <= xEnd) {
    if (xZoneIntersects(xZone, shift, xBegin, xEnd)) out.push(shift);
    shift += SECONDS_PER_DAY;
  }
  return out;
}
