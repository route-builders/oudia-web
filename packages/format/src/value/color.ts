// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 oudia-second-web contributors
//
// Based on OuDiaSecond (Copyright (C) 2017-2026 diagram_mania)
// and OuDia (Copyright (C) 2006-2017 take-okm)

/**
 * 色文字列のスキャナ(file-io §3.5、analysis §03 §6.3)。
 * `%08X` の 8 桁大文字 16 進、COLORREF(0x00BBGGRR。下位から R,G,B)。
 * 原典 CconvDcDrawProp::CdColorProp_to_string。
 *
 * 内部型 Colorref は COLORREF 数値そのもの(上位バイト常に 00)。
 */

import type { Colorref } from '../model/basic.js';
import { asColorref } from '../model/basic.js';

/**
 * 色文字列 → Colorref。16 進として読めなければ既定値のまま(寛容)。
 * @param fallback 読めなかったときに返す既定色。
 */
export function decodeColor(value: string, fallback: Colorref): Colorref {
  if (value === '') return fallback;
  // 16 進 8 桁想定。parseInt(16) で読み、下位 24 ビット(0x00BBGGRR)を採用。
  const n = Number.parseInt(value, 16);
  if (Number.isNaN(n)) return fallback;
  // 上位バイトは常に 00 に正規化。
  return asColorref(n & 0x00ffffff);
}

/** Colorref → `%08X`(8 桁大文字 16 進)。上位バイト常に 00。 */
export function encodeColor(color: Colorref): string {
  const n = (color as number) & 0x00ffffff;
  return n.toString(16).toUpperCase().padStart(8, '0');
}

/** COLORREF から R/G/B を取り出す(render 層向けヘルパ)。 */
export function colorrefToRgb(color: Colorref): { r: number; g: number; b: number } {
  const n = color as number;
  return { r: n & 0xff, g: (n >> 8) & 0xff, b: (n >> 16) & 0xff };
}

/** R/G/B から COLORREF を構築(0x00BBGGRR)。 */
export function rgbToColorref(r: number, g: number, b: number): Colorref {
  return asColorref(((b & 0xff) << 16) | ((g & 0xff) << 8) | (r & 0xff));
}
