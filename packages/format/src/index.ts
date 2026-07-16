// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 oudia-second-web contributors

/**
 * `@oudia/format` 公開 API。
 *
 * この段階(スパイク S1)はノードツリー ↔ バイト列の可逆性のみを提供する。
 * ドメイン型(RosenFileData)への変換 = 世代別リーダーは M1 で追加する。
 */

import { decodeOudText } from './text/decodeOudText.js';
import type { OudEncoding } from './text/decodeOudText.js';
import { encodeOudTextUtf8 } from './text/encodeOudText.js';
import { parsePropertiesText } from './node/parse.js';
import { serializePropertiesText } from './node/serialize.js';
import type { PtDirectory } from './node/types.js';
import type { GrammarErrorReason, ReadWarning } from './errors.js';

export { decodeOudText } from './text/decodeOudText.js';
export type {
  DecodeTextResult,
  DecodeTextOk,
  DecodeTextErr,
  OudEncoding,
} from './text/decodeOudText.js';
export { encodeOudTextUtf8 } from './text/encodeOudText.js';

export { parsePropertiesText } from './node/parse.js';
export type { ParseTreeResult } from './node/parse.js';
export { serializePropertiesText } from './node/serialize.js';
export { escapePropertyValue, unescapePropertyValue } from './node/escape.js';
export { isProperty, isDirectory } from './node/types.js';
export type { PtNode, PtProperty, PtDirectory } from './node/types.js';

export { ErrorCode } from './errors.js';
export type { ErrorDetail, ReadWarning, GrammarErrorReason } from './errors.js';

// ---- ファイル同型モデル(型宣言。domain が re-export)----
export * from './model/index.js';

// ---- 値ミニフォーマットのスキャナ ----
export { decodeJikoku, encodeJikoku, isJikokuDecodeError } from './value/jikoku.js';
export type { JikokuDecodeError } from './value/jikoku.js';
export { decodeColor, encodeColor, colorrefToRgb, rgbToColorref } from './value/color.js';
export { decodeFont, encodeFont, makeFontProp } from './value/font.js';
export { decodeInt, decodeBool, encodeInt, encodeBool } from './value/number.js';
export { decodeEkiJikoku, encodeEkiJikoku, splitEkiJikokuList } from './value/ekiJikoku.js';
export type { DecodedEkiJikoku } from './value/ekiJikoku.js';
export {
  decodeBeforeOperationCont,
  decodeAfterOperationCont,
  encodeBeforeOperationCont,
  encodeAfterOperationCont,
} from './value/operation.js';
export type { OperationKeyStore, OperationEntry } from './value/operation.js';

// ---- 現行世代リーダー(ノードツリー → RosenFileData)----
export { readRosenFile, ReaderErrorCode } from './reader/index.js';
export type { ReadRosenFileResult } from './reader/index.js';
export { fileTypeGroup, ReadContext, ReadError } from './reader/index.js';
export type { FileTypeGroup } from './reader/index.js';

// ---- 現行世代ライター(RosenFileData → ノードツリー → bytes)----
export { writeRosenFile, writeOud2, WriteError } from './writer/index.js';

/** bytes → ノードツリー(decode + parse)。デコード情報も返す。 */
export type ParseNodeTreeResult =
  | {
      readonly ok: true;
      readonly root: PtDirectory;
      readonly encoding: OudEncoding;
      readonly hadBom: boolean;
      readonly warnings: readonly ReadWarning[];
    }
  | { readonly ok: false; readonly code: number; readonly reason?: GrammarErrorReason };

/** bytes → ノードツリー(decode + parse)を合成する。 */
export function parseNodeTree(bytes: Uint8Array): ParseNodeTreeResult {
  const decoded = decodeOudText(bytes);
  if (!decoded.ok) {
    return { ok: false, code: decoded.code };
  }
  const parsed = parsePropertiesText(decoded.text);
  if (!parsed.ok) {
    return { ok: false, code: parsed.code, reason: parsed.reason };
  }
  return {
    ok: true,
    root: parsed.root,
    encoding: decoded.encoding,
    hadBom: decoded.hadBom,
    warnings: decoded.warnings,
  };
}

export type RoundtripResult =
  | { readonly ok: true; readonly bytes: Uint8Array }
  | { readonly ok: false; readonly code: number; readonly reason?: GrammarErrorReason };

/**
 * 恒等ラウンドトリップ(黄金テスト T1 の基盤)。
 * bytes → decode → parse → serialize → encode → bytes。
 *
 * 無編集で往復したとき、正しい実装なら元バイト列と完全一致する
 * (BOM・CRLF 含む。file-io §5.2 T1)。UTF-8 入力のみを対象とする
 * (この段階の書き出しは UTF-8+BOM 固定)。
 */
export function roundtripOud2(bytes: Uint8Array): RoundtripResult {
  const decoded = decodeOudText(bytes);
  if (!decoded.ok) {
    return { ok: false, code: decoded.code };
  }
  const parsed = parsePropertiesText(decoded.text);
  if (!parsed.ok) {
    return { ok: false, code: parsed.code, reason: parsed.reason };
  }
  const text = serializePropertiesText(parsed.root);
  return { ok: true, bytes: encodeOudTextUtf8(text) };
}
