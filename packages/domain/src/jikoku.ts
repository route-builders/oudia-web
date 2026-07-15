// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 oudia-second-web contributors
//
// Based on OuDiaSecond (Copyright (C) 2017-2026 diagram_mania)
// and OuDia (Copyright (C) 2006-2017 take-okm)

/**
 * 時刻演算の純関数。原典 CdDedJikoku(entDed/CdDedJikoku.cpp)の忠実移植。
 * data-model §4.2。24 時間サイクリック・日付概念なし。
 *
 * すべての循環比較はこの compareJikoku を経由する(独自比較を書かない — data-model §4.2)。
 */

import type { Jikoku, Jikan, Seconds } from '@oudia/format';
import { asJikan, asSeconds } from '@oudia/format';

/** 1 日の秒数(原典 TOTALSECONDS_A_DAY / iSecondsOfADay)。 */
export const SECONDS_PER_DAY = 86400;

/**
 * 秒数を 0..86399 に正規化する(原典 adjustTotalSeconds)。
 *   s %= 86400; if (s < 0) s += 86400;
 * -1 秒 → 23:59:59(86399)になる。
 */
export function normalizeSeconds(totalSeconds: number): Seconds {
  let s = totalSeconds % SECONDS_PER_DAY;
  if (s < 0) s += SECONDS_PER_DAY;
  // JS の `%` は -86400 % 86400 = -0 を返し得る。原典は 0 なので +0 に正規化する。
  return asSeconds(s + 0);
}

/** 時分秒から Seconds を構築(mod 正規化つき)。原典 setTime。 */
export function secondsOfHms(hour: number, minute: number, second: number): Seconds {
  return normalizeSeconds(hour * 3600 + minute * 60 + second);
}

/** 時刻に秒を加減算(mod 正規化)。null なら null のまま(原典 addSeconds)。 */
export function addSeconds(jikoku: Jikoku, seconds: number): Jikoku {
  if (jikoku === null) return null;
  return normalizeSeconds(jikoku + seconds);
}

/**
 * 起点時刻基準の循環比較(原典 CdDedJikoku::compare(value, kitenJikoku))。
 * 戻り値: a > b → 1、a < b → -1、等しい → 0。
 *
 * 各値が kitenJikoku より小さければ +1 日してから比較する(起点時刻を最小とみなす)。
 * 例: 起点 5:00 なら 5:00 < 23:59 < 0:00 < 4:59(data-model §4.2)。
 *
 * null の扱い(data-model §4.2 / I5):
 * - kitenJikoku が null → 0(00:00:00)相当。
 * - 比較対象 a / b の null は**常に最小**とする(原典 INT_MIN が最小にソートされる挙動)。
 */
export function compareJikoku(a: Jikoku, b: Jikoku, kitenJikoku: Jikoku): number {
  // null は常に最小。両方 null なら等しい。
  if (a === null && b === null) return 0;
  if (a === null) return -1;
  if (b === null) return 1;

  const kiten = kitenJikoku ?? 0;
  let av: number = a;
  let bv: number = b;
  if (av < kiten) av += SECONDS_PER_DAY;
  if (bv < kiten) bv += SECONDS_PER_DAY;

  if (av > bv) return 1;
  if (av < bv) return -1;
  return 0;
}

/**
 * 2 時刻の差を「絶対値 12 時間以下の側」の Jikan で返す(原典 subJikoku)。
 * 例: 1:00 − 23:00 = +2h。いずれかが null なら 0。
 */
export function subJikoku(a: Jikoku, b: Jikoku): Jikan {
  if (a === null || b === null) return asJikan(0);
  let diff = a - b;
  if (diff > 12 * 3600) {
    diff -= SECONDS_PER_DAY;
  } else if (diff < -12 * 3600) {
    diff += SECONDS_PER_DAY;
  }
  return asJikan(diff);
}
