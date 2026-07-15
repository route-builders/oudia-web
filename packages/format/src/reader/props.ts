// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 oudia-second-web contributors
//
// Based on OuDiaSecond (Copyright (C) 2017-2026 diagram_mania)
// and OuDia (Copyright (C) 2006-2017 take-okm)

/**
 * NodeCursor から型付き値を読む薄いヘルパ群(file-io §3.5)。
 * 原典の getValue(name) は「キー欠落 = 空文字列」なので、undefined と '' を
 * 同一に扱う(= 既定値)。数値は _ttoi / stoi の寛容さ(非数 → 既定)に合わせる。
 */

import type { Colorref, FontProp, Jikoku } from '../model/basic.js';
import type { NodeCursor } from '../node/cursor.js';
import { decodeColor } from '../value/color.js';
import { decodeFont } from '../value/font.js';
import { decodeJikoku, isJikokuDecodeError } from '../value/jikoku.js';
import { decodeInt } from '../value/number.js';

/** 文字列プロパティ(欠落 → 既定 '')。 */
export function readStr(cur: NodeCursor, name: string, fallback = ''): string {
  return cur.value(name) ?? fallback;
}

/** bool プロパティ(原典 `== "1"` 判定。欠落 → false)。 */
export function readBool(cur: NodeCursor, name: string): boolean {
  return cur.value(name) === '1';
}

/** int プロパティ(欠落・空 → fallback、非数 → fallback。原典 _ttoi/intOf 相当)。 */
export function readInt(cur: NodeCursor, name: string, fallback = 0): number {
  const v = cur.value(name);
  if (v === undefined || v === '') return fallback;
  return decodeInt(v, fallback);
}

/** 色プロパティ(欠落・空・非 16 進 → fallback)。 */
export function readColor(cur: NodeCursor, name: string, fallback: Colorref): Colorref {
  const v = cur.value(name);
  if (v === undefined || v === '') return fallback;
  return decodeColor(v, fallback);
}

/** フォントプロパティ(欠落 → fallback、あれば decodeFont)。 */
export function readFont(cur: NodeCursor, name: string, fallback: FontProp): FontProp {
  const v = cur.value(name);
  if (v === undefined || v === '') return fallback;
  return decodeFont(v);
}

/**
 * -1 センチネル int(欠落・空 → null、それ以外は数値。負値も保持しないのは
 * 呼出し側の責務)。原典の BrunchCoreEkiIndex / LoopOriginEkiIndex / ParentSyubetsuIndex。
 */
export function readIndexOrNull(cur: NodeCursor, name: string): number | null {
  const v = cur.value(name);
  if (v === undefined || v === '') return null;
  const n = decodeInt(v, -1);
  return n < 0 ? null : n;
}

/**
 * 時刻プロパティ(欠落・空 → null、decode 失敗 → null)。
 * 原典は空 KitenJikoku 等で Null 時刻を保持する(data-model §2.3)。
 */
export function readJikokuProp(cur: NodeCursor, name: string): Jikoku {
  const v = cur.value(name);
  if (v === undefined || v === '') return null;
  const r = decodeJikoku(v);
  return isJikokuDecodeError(r) ? null : r;
}
