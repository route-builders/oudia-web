// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 up-tri
//
// Based on OuDiaSecond (Copyright (C) 2017-2026 diagram_mania)
// and OuDia (Copyright (C) 2006-2017 take-okm)

/**
 * 物理層のエンコード。文字列 → bytes。
 *
 * .oud2 / .oud2backup は UTF-8 + BOM(EF BB BF)前置(file-io §8.2)。
 * 入力 text は既に CRLF 済み(serialize 側で行末を CRLF にしてある)。
 *
 * .oud / CSV の Shift_JIS 書き出し(encoding-japanese 経由)は v0.2 スコープであり、
 * この S1 段階では実装しない。
 */

const BOM = new Uint8Array([0xef, 0xbb, 0xbf]);

export function encodeOudTextUtf8(text: string): Uint8Array {
  const body = new TextEncoder().encode(text);
  const out = new Uint8Array(BOM.length + body.length);
  out.set(BOM, 0);
  out.set(body, BOM.length);
  return out;
}
