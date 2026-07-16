// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 oudia-second-web contributors
//
// Based on OuDiaSecond (Copyright (C) 2017-2026 diagram_mania)
// and OuDia (Copyright (C) 2006-2017 take-okm)

/**
 * CSV ドキュメントの直列化(原典 OuLib::Str::CsvDocument::CConvCsvDocument::encode /
 * encodeCell の忠実移植。origin/libs/OuLib/Str/CsvDocument/CConvCsvDocument.cpp)。
 *
 * OuDia 固有の癖をバイト単位で再現する:
 * - **セルの引用は改行 `\n` またはダブルクォート `"` を含む場合のみ**(カンマは引用しない)。
 *   → 値にカンマが含まれると CSV が壊れるが、原典に忠実に再現する。
 * - 引用時、内側の `"` はすべて `""` に二重化する。
 * - 行はカンマ区切り。**すべての行**(末尾行含む)を行終端子で終端する。
 * - 既定は LF 終端・BOM なし(時刻表 CSV)。駅時刻表 CSV は CRLF + UTF-8 BOM を使う
 *   ため options で切り替える。
 */

export type CsvCell = string;
export type CsvRow = readonly CsvCell[];
export type CsvDocument = readonly CsvRow[];

/** 行終端・BOM の出力オプション。 */
export interface CsvEncodeOptions {
  /** 行終端子。既定 '\n'(時刻表 CSV)。駅時刻表 CSV は '\r\n'。 */
  readonly lineEnding?: '\n' | '\r\n';
  /** UTF-8 BOM(U+FEFF)を先頭に付けるか。既定 false。駅時刻表 CSV は true。 */
  readonly bom?: boolean;
}

/**
 * 1 セルを CSV エンコードする(原典 encodeCell)。
 *   改行 `\n` かダブルクォート `"` を含むときだけ全体を `"` で囲む。
 *   囲むときは内側の `"` を `""` に二重化する。**カンマは引用の対象にしない。**
 */
export function encodeCsvCell(cell: CsvCell): string {
  let needsQuote = false;
  let out = '';
  for (const ch of cell) {
    if (ch === '\n') {
      needsQuote = true;
      out += ch;
    } else if (ch === '"') {
      needsQuote = true;
      out += '""';
    } else {
      out += ch;
    }
  }
  return needsQuote ? `"${out}"` : out;
}

/**
 * CSV ドキュメント(行の配列)を文字列へ直列化する(原典 encode)。
 *   各行をカンマ区切りにし、**すべての行を行終端子で終端する**(末尾行も含む)。
 *   空行(セル 0 個)は終端子のみの行になる。
 */
export function encodeCsvDocument(rows: CsvDocument, options?: CsvEncodeOptions): string {
  const lineEnding = options?.lineEnding ?? '\n';
  let out = options?.bom ? '﻿' : '';
  for (const row of rows) {
    out += row.map(encodeCsvCell).join(',');
    out += lineEnding;
  }
  return out;
}
