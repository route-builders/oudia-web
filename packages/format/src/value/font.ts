// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 oudia-second-web contributors
//
// Based on OuDiaSecond (Copyright (C) 2017-2026 diagram_mania)
// and OuDia (Copyright (C) 2006-2017 take-okm)

/**
 * フォント文字列のスキャナ(file-io §3.5、analysis §03 §6.5)。
 * `CdConnectedString2` 形式 = `項目=値` を `;` で連結。
 * 原典 CconvDcDrawProp::CdFontProp_to/from_CdConnectedString2。
 *
 * 出力順(原典実装順): PointTextHeight → LogicalunitTextHeight → LogicalunitCellHeight →
 * Facename → Bold → Itaric(綴りは原文ママ)→ Underline → StrikeOut → Escapement。
 * 数値項目は 0 なら省略、bool 項目は true のときのみ `1` を出力、Facename は常に出力。
 */

import type { FontProp } from '../model/basic.js';

const NAME_POINT_TEXT_HEIGHT = 'PointTextHeight';
const NAME_LOGICALUNIT_TEXT_HEIGHT = 'LogicalunitTextHeight';
const NAME_LOGICALUNIT_CELL_HEIGHT = 'LogicalunitCellHeight';
const NAME_FACENAME = 'Facename';
const NAME_BOLD = 'Bold';
const NAME_ITARIC = 'Itaric'; // [sic] 原典綴り
const NAME_UNDERLINE = 'Underline';
const NAME_STRIKE_OUT = 'StrikeOut';
const NAME_ESCAPEMENT = 'Escapement';

/** CdConnectedString2(`;` 区切り `key=value`)を decode して Map にする。 */
function parseConnectedString(value: string): Map<string, string> {
  const map = new Map<string, string>();
  if (value === '') return map;
  for (const item of value.split(';')) {
    const eq = item.indexOf('=');
    if (eq === -1) {
      map.set(item, '');
    } else {
      map.set(item.slice(0, eq), item.slice(eq + 1));
    }
  }
  return map;
}

/** 既定 FontProp を生成する(呼出し側が既定フォントを渡すためのヘルパ)。 */
export function makeFontProp(pointTextHeight: number, facename: string): FontProp {
  return {
    pointTextHeight,
    logicalunitTextHeight: null,
    logicalunitCellHeight: null,
    facename,
    bold: false,
    italic: false,
    underline: false,
    strikeOut: false,
    escapement: 0,
  };
}

function intItem(map: Map<string, string>, name: string): number {
  const v = map.get(name);
  if (v === undefined || v === '') return 0;
  const n = Number.parseInt(v, 10);
  return Number.isNaN(n) ? 0 : n;
}

/** フォント文字列 → FontProp。欠落項目は 0 / false / 空(原典の既定構築)。 */
export function decodeFont(value: string): FontProp {
  const map = parseConnectedString(value);
  const luText = intItem(map, NAME_LOGICALUNIT_TEXT_HEIGHT);
  const luCell = intItem(map, NAME_LOGICALUNIT_CELL_HEIGHT);
  return {
    pointTextHeight: intItem(map, NAME_POINT_TEXT_HEIGHT),
    logicalunitTextHeight: luText === 0 ? null : luText,
    logicalunitCellHeight: luCell === 0 ? null : luCell,
    facename: map.get(NAME_FACENAME) ?? '',
    bold: map.get(NAME_BOLD) === '1',
    italic: map.get(NAME_ITARIC) === '1',
    underline: map.get(NAME_UNDERLINE) === '1',
    strikeOut: map.get(NAME_STRIKE_OUT) === '1',
    escapement: intItem(map, NAME_ESCAPEMENT),
  };
}

/**
 * FontProp → フォント文字列(原典実装順・省略規則を忠実再現)。
 * 数値項目は 0 で省略、bool は true のみ `1`、Facename は常に出力。
 */
export function encodeFont(font: FontProp): string {
  const items: string[] = [];

  const pushInt = (name: string, v: number | null): void => {
    if (v !== null && v !== 0) items.push(`${name}=${String(v)}`);
  };
  const pushBool = (name: string, v: boolean): void => {
    if (v) items.push(`${name}=1`);
  };

  pushInt(NAME_POINT_TEXT_HEIGHT, font.pointTextHeight);
  pushInt(NAME_LOGICALUNIT_TEXT_HEIGHT, font.logicalunitTextHeight);
  pushInt(NAME_LOGICALUNIT_CELL_HEIGHT, font.logicalunitCellHeight);
  // Facename は常に出力(値が空なら name のみ = CdConnectedString2 の bEncodeNoValue=true 挙動)。
  if (font.facename === '') {
    items.push(NAME_FACENAME);
  } else {
    items.push(`${NAME_FACENAME}=${font.facename}`);
  }
  pushBool(NAME_BOLD, font.bold);
  pushBool(NAME_ITARIC, font.italic);
  pushBool(NAME_UNDERLINE, font.underline);
  pushBool(NAME_STRIKE_OUT, font.strikeOut);
  pushInt(NAME_ESCAPEMENT, font.escapement);

  return items.join(';');
}
