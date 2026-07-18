// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 up-tri

/**
 * `@oudia-web/format` 公開 API。
 *
 * この段階(スパイク S1)はノードツリー ↔ バイト列の可逆性のみを提供する。
 * ドメイン型(RosenFileData)への変換 = 世代別リーダーは M1 で追加する。
 */

import type { GrammarErrorReason, ReadWarning } from './errors.js';
import { parsePropertiesText } from './node/parse.js';
import { serializePropertiesText } from './node/serialize.js';
import type { PtDirectory } from './node/types.js';
import type { OudEncoding } from './text/decodeOudText.js';
import { decodeOudText } from './text/decodeOudText.js';
import { encodeOudTextUtf8 } from './text/encodeOudText.js';

export type { CsvCell, CsvDocument, CsvEncodeOptions, CsvRow } from './csv/document.js';
// ---- CSV 直列化・時刻整形(時刻表 CSV / 駅時刻表 CSV の低レベル基盤)----
export { encodeCsvCell, encodeCsvDocument } from './csv/document.js';
export type { JikokuConvOptions } from './csv/jikokuConv.js';
export { encodeJikokuCsv } from './csv/jikokuConv.js';
export type { ErrorDetail, GrammarErrorReason, ReadWarning } from './errors.js';
export { ErrorCode } from './errors.js';
// ---- ファイル同型モデル(型宣言。domain が re-export)----
export * from './model/index.js';
export { escapePropertyValue, unescapePropertyValue } from './node/escape.js';
export type { ParseTreeResult } from './node/parse.js';
export { parsePropertiesText } from './node/parse.js';
export { serializePropertiesText } from './node/serialize.js';
export type { PtDirectory, PtNode, PtProperty } from './node/types.js';
export { isDirectory, isProperty } from './node/types.js';
export type { FileTypeGroup, ReadRosenFileResult } from './reader/index.js';
// ---- 現行世代リーダー(ノードツリー → RosenFileData)----
export {
  fileTypeGroup,
  ReadContext,
  ReadError,
  ReaderErrorCode,
  readRosenFile,
} from './reader/index.js';
export type {
  DecodeTextErr,
  DecodeTextOk,
  DecodeTextResult,
  OudEncoding,
} from './text/decodeOudText.js';
export { decodeOudText } from './text/decodeOudText.js';
export { encodeOudTextUtf8 } from './text/encodeOudText.js';
// ---- 値ミニフォーマットのスキャナ ----
export { colorrefToRgb, decodeColor, encodeColor, rgbToColorref } from './value/color.js';
export type { DecodedEkiJikoku } from './value/ekiJikoku.js';
export { decodeEkiJikoku, encodeEkiJikoku, splitEkiJikokuList } from './value/ekiJikoku.js';
export { decodeFont, encodeFont, makeFontProp } from './value/font.js';
export type { JikokuDecodeError } from './value/jikoku.js';
export { decodeJikoku, encodeJikoku, isJikokuDecodeError } from './value/jikoku.js';
export { decodeBool, decodeInt, encodeBool, encodeInt } from './value/number.js';
export type { OperationEntry, OperationKeyStore } from './value/operation.js';
export {
  decodeAfterOperationCont,
  decodeBeforeOperationCont,
  encodeAfterOperationCont,
  encodeBeforeOperationCont,
} from './value/operation.js';
// ---- 現行世代ライター(RosenFileData → ノードツリー → bytes)----
export { WriteError, writeOud2, writeRosenFile } from './writer/index.js';

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
