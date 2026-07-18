// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 up-tri
//
// Based on OuDiaSecond (Copyright (C) 2017-2026 diagram_mania)
// and OuDia (Copyright (C) 2006-2017 take-okm)

/**
 * 駅時刻入力の時補完(原典 CPropEditUI_Ekijikoku.cpp getJikokuFromUI の bBefore=false 分岐)。
 * decodeJikoku(Layer 1)の上に載る Layer 2。分 2 桁だけの入力を、参照時刻(直前駅の時刻)の
 * 「時」を引き継いで絶対時刻へ補完する(常に参照以後になるよう繰り上げる)。
 */

import type { Jikoku, Seconds } from '@oudia-web/format';
import { asSeconds, decodeJikoku, isJikokuDecodeError } from '@oudia-web/format';

const SEC_DAY = 86400;
const SEC_HALFDAY = 43200;

/** 24h 循環の (−12h, +12h] 差を秒で返す(原典 CdDedJikoku::subJikoku)。a,b は [0,86400)。 */
export function subJikokuWrapped(a: Seconds, b: Seconds): number {
  let d = (a as number) - (b as number);
  if (d > SEC_HALFDAY) d -= SEC_DAY;
  else if (d < -SEC_HALFDAY) d += SEC_DAY;
  return d;
}

/** 0..86399 へ正規化。 */
function mod86400(n: number): number {
  return ((n % SEC_DAY) + SEC_DAY) % SEC_DAY;
}

/**
 * 生入力を絶対時刻へ decode する(時補完つき)。
 *   1. decodeJikoku で通常解釈。成功(null=クリア含む)ならそれを返す。
 *   2. 失敗が code=-1(項目数不足)かつ 2 桁数字かつ参照時刻ありのとき、参照の「時」を
 *      引き継いで分 2 桁を合成し、参照より前になるなら +1 時間する。
 *   3. それ以外の不正入力は 'invalid'(原典は無視。UI 側で弾く)。
 *
 * @param input     生入力文字列(全角→半角化・trim は入力層/ここで処理)
 * @param jikokuRev 参照時刻(直前駅の発、なければ着。始発駅では null)
 */
export function decodeJikokuWithHourCompletion(
  input: string,
  jikokuRev: Jikoku,
): Jikoku | 'invalid' {
  const trimmed = input.trim();
  const r = decodeJikoku(trimmed);
  if (!isJikokuDecodeError(r)) return r; // 成功(null=クリア含む)

  // 補完トリガ: code===-1、2 桁数字、参照時刻あり。
  if (
    r.code === -1 &&
    jikokuRev !== null &&
    trimmed.length === 2 &&
    trimmed.charCodeAt(0) >= 0x30 &&
    trimmed.charCodeAt(0) <= 0x39 &&
    trimmed.charCodeAt(1) >= 0x30 &&
    trimmed.charCodeAt(1) <= 0x39
  ) {
    const min = Number(trimmed);
    if (min >= 0 && min < 60) {
      // 参照の「時」を引き継ぎ、秒は 0。
      const hour = Math.floor((jikokuRev as number) / 3600);
      let sec = mod86400(hour * 3600 + min * 60);
      // 参照より前(subJikoku < 0)なら +1 時間して常に参照以後にする。
      if (subJikokuWrapped(asSeconds(sec), jikokuRev) < 0) sec = mod86400(sec + 3600);
      return asSeconds(sec);
    }
  }
  return 'invalid';
}
