// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 oudia-second-web contributors
//
// Based on OuDiaSecond (Copyright (C) 2017-2026 diagram_mania)
// and OuDia (Copyright (C) 2006-2017 take-okm)

import { ErrorCode } from '../errors.js';
import type { GrammarErrorReason } from '../errors.js';
import { unescapePropertyValue } from './escape.js';
import type { PtDirectory, PtNode } from './types.js';

/**
 * 文法パーサ: OuPropertiesText 文字列 → ノードツリー。
 *
 * 原典 CConvNodeContainer::decode / decodeNodeContainer の忠実移植
 * (file-io §3.3、analysis §2)。入力は decodeOudText の出力(LF 区切り・CR 除去済み)。
 * **正規表現は使わない**(挙動一致の検証しやすさと大入力での性能安定のため)。
 */

export type ParseTreeResult =
  | { readonly ok: true; readonly root: PtDirectory }
  | {
      readonly ok: false;
      readonly code: typeof ErrorCode.GrammarInvalid;
      readonly reason: GrammarErrorReason;
      /** 問題の行のテキスト(原典 ERRPROP_Text 相当のデバッグ情報)。 */
      readonly line: string;
    };

/**
 * 行分割。原典 getLine と同一のセマンティクス。
 * `\n` で区切り、各要素は改行を含まない。原典の「末尾に改行がない最終行も 1 行」を
 * 再現するため、末尾 `\n` の後に空要素は作らない。
 *
 * 例: `"a\nb\n"` → `["a", "b"]`、`"a\nb"` → `["a", "b"]`、`""` → `[]`。
 */
function splitLines(content: string): string[] {
  if (content === '') return [];
  const lines: string[] = [];
  let start = 0;
  for (let i = 0; i < content.length; i++) {
    if (content.charAt(i) === '\n') {
      lines.push(content.slice(start, i));
      start = i + 1;
    }
  }
  // 末尾 `\n` の直後(start === length)には行を追加しない(getLine が 0 を返す位置)。
  if (start < content.length) {
    lines.push(content.slice(start));
  }
  return lines;
}

type ContainerResult =
  | { readonly ok: true; readonly endPos: number; readonly notClosed: boolean }
  | { readonly ok: false; readonly reason: GrammarErrorReason; readonly line: string };

/**
 * 1 コンテナ分を解釈する。原典 decodeNodeContainer に対応。
 *
 * @returns
 *   - `notClosed: true` … 開始位置が既に末尾(呼び出し元がディレクトリなら NotClosed)。
 *   - `endPos` … 消費完了後の行 index。`.`(終端)行 or 末尾を指す。
 */
function decodeContainer(
  lines: readonly string[],
  posBegin: number,
  out: PtNode[],
): ContainerResult {
  // 原典: iPosBegin が既にコンテンツ末尾なら 0(= NotClosed の起点)。
  if (posBegin >= lines.length) {
    return { ok: true, endPos: posBegin, notClosed: true };
  }

  let pos = posBegin;
  while (pos < lines.length) {
    const line = lines.at(pos) ?? '';

    if (line === '') {
      pos++;
      continue;
    }
    if (line === '.') {
      // ディレクトリ終端。この `.` 行を指す index を返す。
      return { ok: true, endPos: pos, notClosed: false };
    }

    // ディレクトリ開始判定: '=' を含まず、末尾が '.'。
    if (!line.includes('=') && line.endsWith('.')) {
      const name = line.slice(0, line.length - 1);
      const children: PtNode[] = [];
      const child = decodeContainer(lines, pos + 1, children);
      if (!child.ok) return child;
      if (child.notClosed) {
        // 子コンテナが「開始位置が既に末尾」= ディレクトリが閉じていません。
        return { ok: false, reason: 'containerNotClosed', line };
      }
      out.push({ kind: 'directory', name, children });
      // child.endPos は `.`(終端)行 or 末尾。終端行なら次へ、末尾ならそのまま。
      const closedByDot = child.endPos < lines.length && lines.at(child.endPos) === '.';
      pos = closedByDot ? child.endPos + 1 : child.endPos;
      continue;
    }

    // プロパティ。最初の '=' で名前/値に分割。'=' が無ければ名前のみ・値 ''。
    const eq = line.indexOf('=');
    if (eq === -1) {
      out.push({ kind: 'property', name: line, value: '' });
    } else {
      out.push({
        kind: 'property',
        name: line.slice(0, eq),
        value: unescapePropertyValue(line.slice(eq + 1)),
      });
    }
    pos++;
  }
  // EOF 到達。閉じ忘れディレクトリはここまでを子として受理する(原典挙動)。
  return { ok: true, endPos: pos, notClosed: false };
}

export function parsePropertiesText(text: string): ParseTreeResult {
  const lines = splitLines(text);
  const rootChildren: PtNode[] = [];

  const result = decodeContainer(lines, 0, rootChildren);

  if (!result.ok) {
    return {
      ok: false,
      code: ErrorCode.GrammarInvalid,
      reason: result.reason,
      line: result.line,
    };
  }

  // 原典 decode: トップレベルのコンテナ解釈後にまだ行が残る場合(= トップレベルに
  // `.` が現れて途中で閉じた)は Aborted。root ループが EOF より前で返るのは
  // `.` 行に当たったときのみなので、残余は必ず `.` 行を指す。
  if (!result.notClosed && result.endPos < lines.length) {
    return {
      ok: false,
      code: ErrorCode.GrammarInvalid,
      reason: 'containerAborted',
      line: lines.at(result.endPos) ?? '.',
    };
  }

  return { ok: true, root: { kind: 'directory', name: '', children: rootChildren } };
}
