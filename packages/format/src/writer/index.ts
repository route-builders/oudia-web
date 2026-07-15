// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 oudia-second-web contributors
//
// Based on OuDiaSecond (Copyright (C) 2017-2026 diagram_mania)
// and OuDia (Copyright (C) 2006-2017 take-okm)

/**
 * ファイル書き出しの公開エントリ。RosenFileData → ノードツリー → バイト列。
 * 原典 CconvCDedRosenFileData::CDedRosenFileData_to_OuPropertiesText の忠実移植(file-io §4)。
 *
 * ルート書き出し順(原典): FileType → Rosen. → DispProp. → WindowPlacement.(任意)。
 * FileTypeAppComment は原典アプリ層がルート最終行に注入する。Web 版は読込値
 * (sourceFileTypeAppComment)を最終プロパティとして書き戻す(バイト一致 T1)。
 *
 * ルート未知ノードの index は、リーダーが FileType(idx0)・FileTypeAppComment を
 * 含む全子ノードの絶対位置で記録している(reader/index.ts)。そのため NodeBuilder の
 * 既知配列も FileType と FileTypeAppComment を既知ノードとして持たせ、index を 1:1 で
 * 一致させる(§B3)。
 */

import type { RosenFileData } from '../model/rosenFileData.js';
import { encodeOudTextUtf8 } from '../text/encodeOudText.js';
import { serializePropertiesText } from '../node/serialize.js';
import type { PtDirectory } from '../node/types.js';
import { NodeBuilder, nodeOfRaw } from './builder.js';
import { writeDispProp, writeRosen } from './current.js';

/** RosenFileData → ルート PtDirectory(name='')。 */
export function writeRosenFile(data: RosenFileData): PtDirectory {
  const b = new NodeBuilder();

  // FileType(idx 0)。sourceFileType をそのまま書き戻す(1.17 固定にしない)。
  b.prop('FileType', data.sourceFileType);

  // Rosen.(必須)
  b.node(writeRosen(data.rosen));

  // DispProp.(必須)
  b.node(writeDispProp(data.dispProp));

  // WindowPlacement.(非 null のときのみ)。透過保持した RawEntry を verbatim 復元。
  if (data.windowPlacement !== null) {
    b.dir(
      'WindowPlacement',
      data.windowPlacement.map((raw) => nodeOfRaw(raw)),
    );
  }

  // FileTypeAppComment(ルート最終行)。読込値を書き戻す。
  // 既知ノードとして push することで、以降に現れうるルート未知の index も整合する。
  if (data.sourceFileTypeAppComment !== null) {
    b.prop('FileTypeAppComment', data.sourceFileTypeAppComment);
  }

  return b.buildDir('', data.unknownEntries);
}

/** RosenFileData → .oud2 バイト列(UTF-8 + BOM、CRLF)。 */
export function writeOud2(data: RosenFileData): Uint8Array {
  const root = writeRosenFile(data);
  const text = serializePropertiesText(root);
  return encodeOudTextUtf8(text);
}

export { writeRosen, writeDispProp, WriteError } from './current.js';
export { NodeBuilder, nodeOfRaw, partitionUnknownByContainer } from './builder.js';
