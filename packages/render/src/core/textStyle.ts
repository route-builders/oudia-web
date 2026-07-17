// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 oudia-second-web contributors
//
// Based on OuDiaSecond (Copyright (C) 2017-2026 diagram_mania)
// and OuDia (Copyright (C) 2006-2017 take-okm)

/**
 * フォント仕様 → ctx.font 文字列(原典 CdFontProp → GDI HFONT。design/06_rendering §6.2)。
 * 変換結果は Map キャッシュする(CGdiCache 相当の代替)。COLORREF ⇔ CSS rgb 変換も提供する。
 */

/** 既定フォントスタック(Windows Meiryo UI に近い代替。フォント同梱はしない)。 */
export const DEFAULT_FONT_STACK = '"Meiryo UI", Meiryo, "Hiragino Sans", sans-serif';

export interface FontSpec {
  /** ポイント数(pt)。px = pt × 96/72。 */
  readonly pointTextHeight: number;
  readonly facename: string;
  readonly bold: boolean;
  readonly italic: boolean;
}

const fontCache = new Map<string, string>();

/** pt → px(96/72)。 */
export function ptToPx(pt: number): number {
  return (pt * 96) / 72;
}

/** FontSpec → ctx.font 文字列(キャッシュつき)。 */
export function fontString(spec: FontSpec): string {
  const key = `${String(spec.pointTextHeight)}|${spec.facename}|${spec.bold ? 'b' : ''}|${spec.italic ? 'i' : ''}`;
  const cached = fontCache.get(key);
  if (cached !== undefined) return cached;
  const px = ptToPx(spec.pointTextHeight);
  const family =
    spec.facename === '' ? DEFAULT_FONT_STACK : `"${spec.facename}", ${DEFAULT_FONT_STACK}`;
  const parts: string[] = [];
  if (spec.italic) parts.push('italic');
  if (spec.bold) parts.push('bold');
  parts.push(`${String(px)}px`);
  parts.push(family);
  const font = parts.join(' ');
  fontCache.set(key, font);
  return font;
}

/**
 * COLORREF(0x00BBGGRR)→ CSS rgb 文字列。format の Colorref はこの並び。
 */
export function colorrefToCss(colorref: number): string {
  const r = colorref & 0xff;
  const g = (colorref >> 8) & 0xff;
  const b = (colorref >> 16) & 0xff;
  return `rgb(${String(r)}, ${String(g)}, ${String(b)})`;
}
