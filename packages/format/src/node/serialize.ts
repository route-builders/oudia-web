// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 oudia-second-web contributors
//
// Based on OuDiaSecond (Copyright (C) 2017-2026 diagram_mania)
// and OuDia (Copyright (C) 2006-2017 take-okm)

import { escapePropertyValue } from './escape.js';
import type { PtDirectory, PtNode } from './types.js';

/**
 * シリアライザ: ノードツリー → OuPropertiesText 文字列。
 *
 * 原典 CConvNodeContainer::encode の忠実移植(file-io §3.3、§4.2)。
 *   プロパティ: `名前=エスケープ済み値`
 *   ディレクトリ: `名前.` + 子の再帰 + `.`
 *   各ノード行の末尾に改行を付ける。
 *
 * 出力は **CRLF 区切り**とする(原典はテキストモード書き出しで LF→CRLF になる。
 * .oud2 の実バイト列は CRLF。file-io §4.1)。最終行も CRLF で終端する。
 *
 * ルート(name='')自身は行を出力せず、その children のみを出力する。
 */

const CRLF = '\r\n';

function encodeNode(node: PtNode, out: string[]): void {
  if (node.kind === 'property') {
    out.push(node.name + '=' + escapePropertyValue(node.value) + CRLF);
    return;
  }
  // directory
  out.push(node.name + '.' + CRLF);
  for (const child of node.children) {
    encodeNode(child, out);
  }
  out.push('.' + CRLF);
}

export function serializePropertiesText(root: PtDirectory): string {
  // 文字列連結は配列 push + 単一 join(数 MB 級での GC スパイク回避。file-io §10)。
  const out: string[] = [];
  for (const child of root.children) {
    encodeNode(child, out);
  }
  return out.join('');
}
