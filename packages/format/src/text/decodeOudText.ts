// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 up-tri
//
// Based on OuDiaSecond (Copyright (C) 2017-2026 diagram_mania)
// and OuDia (Copyright (C) 2006-2017 take-okm)

import type { ReadWarning } from '../errors.js';
import { ErrorCode } from '../errors.js';

/**
 * 物理層のデコード。bytes → 文字列(LF 区切り)。
 *
 * 原典 `stringFromFile`(libs/OuLib/Str/vectorToFile.cpp)の手順を bytes 上で
 * 忠実に再現する(file-io §8.1、analysis §1)。
 *   1. `\0` 検査 → -3
 *   2. BOM 判定(EF BB BF なら UTF-8、それ以外は Shift_JIS)。拡張子では判定しない
 *   3. TextDecoder でデコード(不正シーケンスは置換、警告に積む)
 *   4. 0x5C 救済ハック(SJIS 経路のみ)
 *   5. CR 除去(パーサは LF のみを行区切りとするため必須)
 */

/**
 * 0x5C 救済ハックの対象文字集合。
 * Shift_JIS で 2 バイト目が 0x5C の文字群(壊れた旧ファイル対策)。
 *
 * 原典 vectorToFile.cpp:340 の `Moji5c` 定数をそのまま定数化する。
 * 「CP932 で 2 バイト目が 0x5C の文字を機械生成」はしない — 原典と集合がずれる
 * 余地を残さないため(file-io §8.1)。
 */
const MOJI_5C = '―ソЫⅨ噂浬欺圭構蚕十申曾箪貼能表暴予禄兔喀媾彌拿杤歃濬畚秉綵臀藹觸軆鐔饅鷭偆砡纊犾';

const BOM_0 = 0xef;
const BOM_1 = 0xbb;
const BOM_2 = 0xbf;

export type OudEncoding = 'utf-8' | 'shift_jis';

export interface DecodeTextOk {
  readonly ok: true;
  /** LF 区切り(CR 除去済み)・BOM 除去済みのテキスト。 */
  readonly text: string;
  readonly encoding: OudEncoding;
  /** UTF-8 BOM が存在したか。書き出しでは常に BOM を付けるため復元には使わないが、記録する。 */
  readonly hadBom: boolean;
  readonly warnings: readonly ReadWarning[];
}

export interface DecodeTextErr {
  readonly ok: false;
  readonly code: typeof ErrorCode.BinaryNul;
}

export type DecodeTextResult = DecodeTextOk | DecodeTextErr;

/** U+FFFD(置換文字)の出現数を数える。fatal:false のデコード時の警告用。 */
function countReplacementChars(s: string): number {
  let count = 0;
  for (let i = 0; i < s.length; i++) {
    if (s.charCodeAt(i) === 0xfffd) count++;
  }
  return count;
}

/**
 * 0x5C 救済ハック。原典 vectorToFile.cpp:346-360 の忠実移植。
 *
 * idx=1 から走査し、`s[idx] === '\\'` かつ `s[idx-1]` が Moji5c に含まれるとき
 * その `\` を 1 文字削除する。**削除後、直後の文字は再検査しない**
 * (原典の `erase(idx,1)` 後に for の idx++ が進む挙動: `十\\` → `十\` になり
 *  2 個目は残る)。
 */
function applyMoji5cHack(input: string): { text: string; removed: number } {
  // 原典は文字列を破壊的に erase するが、ここでは 1 パスで新文字列を構築する。
  // 「削除位置の直後を再検査しない」挙動を再現するため、直前に採用した出力文字
  // ではなく「元入力の直前文字」を判定に使う。
  const chars: string[] = [];
  let removed = 0;
  const len = input.length;
  for (let idx = 0; idx < len; idx++) {
    const ch = input.charAt(idx);
    // charAt は範囲外で '' を返すが、idx>=1 のガードにより input.charAt(idx-1) は実文字。
    if (idx >= 1 && ch === '\\' && MOJI_5C.includes(input.charAt(idx - 1))) {
      // この `\` を出力しない(= erase 相当)。次の反復へ進む(直後は再検査しない)。
      removed++;
      continue;
    }
    chars.push(ch);
  }
  return { text: chars.join(''), removed };
}

export function decodeOudText(bytes: Uint8Array): DecodeTextResult {
  // 1. `\0` 検査(原典: バイナリファイルとみなしエラー -3)。
  if (bytes.includes(0x00)) {
    return { ok: false, code: ErrorCode.BinaryNul };
  }

  // 2. BOM 判定。先頭 3 バイトが EF BB BF なら UTF-8、それ以外は Shift_JIS。
  const hadBom =
    bytes.length >= 3 && bytes[0] === BOM_0 && bytes[1] === BOM_1 && bytes[2] === BOM_2;
  const encoding: OudEncoding = hadBom ? 'utf-8' : 'shift_jis';

  const warnings: ReadWarning[] = [];
  let text: string;

  if (encoding === 'utf-8') {
    // TextDecoder('utf-8') は既定で先頭 BOM を除去する。fatal:false(置換は警告に積む)。
    const decoded = new TextDecoder('utf-8').decode(bytes);
    const rep = countReplacementChars(decoded);
    if (rep > 0) warnings.push({ kind: 'utf8ReplacementChar', count: rep });
    text = decoded;
  } else {
    // WHATWG shift_jis(≒ CP932)。fatal:false。
    const decoded = new TextDecoder('shift_jis').decode(bytes);
    const rep = countReplacementChars(decoded);
    if (rep > 0) warnings.push({ kind: 'sjisReplacementChar', count: rep });

    // 4. 0x5C 救済ハック(SJIS 経路のみ)。
    const hacked = applyMoji5cHack(decoded);
    if (hacked.removed > 0) {
      warnings.push({ kind: 'sjis0x5cHackApplied', count: hacked.removed });
    }
    text = hacked.text;
  }

  // 5. CR 除去(全 `\r` を削除。パーサは LF のみを行区切りとする)。
  if (text.includes('\r')) {
    text = text.replaceAll('\r', '');
  }

  return { ok: true, text, encoding, hadBom, warnings };
}
