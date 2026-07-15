// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 oudia-second-web contributors
//
// Based on OuDiaSecond (Copyright (C) 2017-2026 diagram_mania)
// and OuDia (Copyright (C) 2006-2017 take-okm)

/**
 * プロパティ値のエスケープ / エスケープ解除。
 * 原典 CConvNodeContainer の
 *   encodePropertyString_escapePropertyValue /
 *   decodePropertyString_unescapePropertyValue
 * の忠実移植(file-io §3.3、analysis §2)。**正規表現は使わない**。
 */

/**
 * エスケープ解除(読込)。先読み 1 文字の逐次スキャン。
 *   `\n` → LF、`\\` → `\`、`\.` → `\.`(2 文字保持)、
 *   その他の `\x` → `\x`(2 文字保持)、行末の孤立 `\` → `\`(保持)。
 */
export function unescapePropertyValue(value: string): string {
  let out = '';
  const len = value.length;
  let i = 0;
  while (i < len) {
    const ch = value.charAt(i);
    // 原典: `ite + 1 != end && *ite == '\\'`。次文字がある `\` のみ処理。
    if (ch === '\\' && i + 1 < len) {
      const next = value.charAt(i + 1);
      i += 2;
      if (next === '.') {
        // '.' はエスケープ対象外。`\.` を 2 文字のまま保持する。
        out += '\\.';
      } else if (next === 'n') {
        out += '\n';
      } else if (next === '\\') {
        out += '\\';
      } else {
        // 未知の `\x` は 2 文字ともそのまま保持(先読みで消費済み)。
        out += '\\' + next;
      }
    } else {
      out += ch;
      i += 1;
    }
  }
  return out;
}

/**
 * エスケープ(書出)。
 *   `.` → `.`(エスケープしない)、LF → `\n`、`\` → `\\`、その他はそのまま。
 */
export function escapePropertyValue(value: string): string {
  let out = '';
  for (const ch of value) {
    if (ch === '\n') {
      out += '\\n';
    } else if (ch === '\\') {
      out += '\\\\';
    } else {
      // '.' を含むその他の文字はそのまま。
      out += ch;
    }
  }
  return out;
}
