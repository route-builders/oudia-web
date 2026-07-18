// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 up-tri
//
// Based on OuDiaSecond (Copyright (C) 2017-2026 diagram_mania)
// and OuDia (Copyright (C) 2006-2017 take-okm)

/**
 * 寛容な数値 / bool のパース(file-io §3.5/§3.6)。
 * 原典の `_ttoi` / `stoi` 相当の寛容さ(非数 → 0 / 既定値)を再現する。
 */

/**
 * 寛容 int(原典 _ttoi 相当)。非数・空は fallback。
 * 先頭からの数値部分を読む(_ttoi は先頭の数字列を解釈し、途中の非数字で止まる)。
 */
export function decodeInt(value: string, fallback = 0): number {
  if (value === '') return fallback;
  // parseInt は先頭の符号 + 数字列を読み、途中の非数字で止まる(_ttoi と同挙動)。
  const n = Number.parseInt(value, 10);
  return Number.isNaN(n) ? fallback : n;
}

/** bool(既定は `=="1"` 判定)。原典の多くの bool キーがこの規則。 */
export function decodeBool(value: string): boolean {
  return value === '1';
}

/** int → 10 進文字列(先頭ゼロなし)。 */
export function encodeInt(n: number): string {
  return String(n);
}

/** bool → '1' / '0'。 */
export function encodeBool(b: boolean): string {
  return b ? '1' : '0';
}
