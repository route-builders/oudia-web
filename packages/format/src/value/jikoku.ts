// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 oudia-second-web contributors
//
// Based on OuDiaSecond (Copyright (C) 2017-2026 diagram_mania)
// and OuDia (Copyright (C) 2006-2017 take-okm)

/**
 * 時刻文字列のスキャナ(file-io §3.5、analysis §03 §6.1)。
 * 原典 CdDedJikoku::decode / CConv::encode(g_CdDedJikokuConv 設定)の忠実移植。
 * **逐次スキャン。正規表現は使わない。**
 */

import type { Jikoku, Seconds } from '../model/basic.js';
import { asSeconds } from '../model/basic.js';

/** 時刻 decode のエラー。原典の負コードに対応(呼出し元がキーごとの負コードに変換)。 */
export interface JikokuDecodeError {
  readonly error: true;
  /** -1 = 項目数不足、-2 = 時分秒の範囲/表記が不正。 */
  readonly code: -1 | -2;
}

const SECONDS_PER_DAY = 86400;

function normalize(totalSeconds: number): Seconds {
  let s = totalSeconds % SECONDS_PER_DAY;
  if (s < 0) s += SECONDS_PER_DAY;
  return asSeconds(s);
}

function isAllDigits(s: string): boolean {
  if (s.length === 0) return false;
  for (const ch of s) {
    if (ch < '0' || ch > '9') return false;
  }
  return true;
}

/**
 * 時刻文字列 → Jikoku。原典 CdDedJikoku::decode の忠実移植。
 *   空 → null。コロンなしは末尾から 2 桁ずつ区切る(`'915'`→9:15、`'131545'`→13:15:45)。
 *   秒省略は :00 補完、時 1 桁は 0 補完、先頭スペースは 0 扱い。
 *   範囲 0≤時<24 / 0≤分<60 / 0≤秒<60、範囲外はエラー(-2)。
 */
export function decodeJikoku(value: string): Jikoku | JikokuDecodeError {
  // 空文字列は Null 状態。
  if (value === '') return null;

  let s = value;

  // コロンがない場合は末尾から 2 桁区切りで挿入する。
  if (!s.includes(':')) {
    if (s.length > 2) {
      s = s.slice(0, s.length - 2) + ':' + s.slice(s.length - 2);
    }
    if (s.length > 5) {
      s = s.slice(0, s.length - 5) + ':' + s.slice(s.length - 5);
    }
  }
  // 秒がない場合は :00 補完。
  if (s.length <= 5) {
    s += ':00';
  }
  // 時の 10 の位がない場合は 0 補完。
  if (s.length <= 7) {
    s = '0' + s;
  }
  // 時の 10 の位がスペースなら 0 に変更。
  if (s.startsWith(' ')) {
    s = '0' + s.slice(1);
  }

  if (s.length !== 8) {
    return { error: true, code: -1 };
  }

  const hourStr = s.slice(0, 2);
  const minuteStr = s.slice(3, 5);
  const secondStr = s.slice(6, 8);
  const hour = isAllDigits(hourStr) ? Number(hourStr) : -1;
  const minute = isAllDigits(minuteStr) ? Number(minuteStr) : -1;
  const second = isAllDigits(secondStr) ? Number(secondStr) : -1;

  if (hour >= 0 && hour < 24 && minute >= 0 && minute < 60 && second >= 0 && second < 60) {
    return normalize(hour * 3600 + minute * 60 + second);
  }
  return { error: true, code: -2 };
}

export function isJikokuDecodeError(v: Jikoku | JikokuDecodeError): v is JikokuDecodeError {
  return v !== null && typeof v === 'object' && 'error' in v;
}

/**
 * Jikoku → 時刻文字列。原典 g_CdDedJikokuConv(NoColon, EHour_ZeroToNone, ESecond_NotIfZero)。
 *   時 = 先頭ゼロなし 1〜2 桁、分 = 2 桁、秒 = 0 なら省略・非 0 なら 2 桁。コロンなし。
 *   null → 空文字列。例: 4:59→`459`、0:00→`000`、4:59:30→`45930`。
 */
export function encodeJikoku(jikoku: Jikoku): string {
  if (jikoku === null) return '';
  const total = jikoku as number;
  const hour = Math.floor(total / 3600);
  const minute = Math.floor((total % 3600) / 60);
  const second = total % 60;

  let out = String(hour); // EHour_ZeroToNone: %d
  out += String(minute).padStart(2, '0'); // %02d
  if (second !== 0) {
    // ESecond_NotIfZero: 非 0 のときのみ 2 桁で出力。
    out += String(second).padStart(2, '0');
  }
  return out;
}
