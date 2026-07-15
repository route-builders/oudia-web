// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 oudia-second-web contributors
//
// Based on OuDiaSecond (Copyright (C) 2017-2026 diagram_mania)
// and OuDia (Copyright (C) 2006-2017 take-okm)

/**
 * ファイル読込の公開エントリ。ルートノード → RosenFileData(file-io §3、原典
 * CconvCDedRosenFileData::CDedRosenFileData_From_OuPropertiesText)。
 *
 * 読込順(原典): FileType 判定 → Rosen.(必須)→ DispProp.(必須)→ WindowPlacement.(任意)。
 * FileType は sourceFileType として保持、FileTypeAppComment は読み捨てる(書き出しで再生成)。
 * WindowPlacement は解釈せず RawEntry[] で透過保持する(architecture §4.5)。
 */

import type { RawEntry, UnknownEntry } from '../model/basic.js';
import type { RosenFileData } from '../model/rosenFileData.js';
import { NodeCursor } from '../node/cursor.js';
import type { PtDirectory, PtNode } from '../node/types.js';
import { ReadContext, ReadError } from './context.js';
import { readDispProp, readRosen } from './current.js';
import { fileTypeGroup } from './fileType.js';

/** 読込エラーコード(原典の負コード体系。file-io §3.7)。 */
export const ReaderErrorCode = {
  FileTypeInvalid: -1, // FileType が正しくありません
  RosenNotFound: -2, // Rosen ディレクトリが見つかりません
  DispPropNotFound: -3, // DispProp ディレクトリが見つかりません
  UnsupportedGeneration: -1100, // 旧世代(M1 未対応)
} as const;

/** 読込結果(モデル + 蓄積した警告)。 */
export interface ReadRosenFileResult {
  data: RosenFileData;
  warnings: ReadContext['warnings'];
}

/** RawEntry サブツリーへ変換(WindowPlacement の透過保持用)。 */
function rawEntryOf(node: PtNode): RawEntry {
  if (node.kind === 'property') {
    return { name: node.name, value: node.value };
  }
  return { name: node.name, children: node.children.map((c) => rawEntryOf(c)) };
}

function rootUnknownEntryOf(index: number, node: PtNode): UnknownEntry {
  if (node.kind === 'property') {
    return { index, name: node.name, value: node.value };
  }
  return { index, name: node.name, children: node.children.map((c) => rawEntryOf(c)) };
}

/**
 * パース済みルートディレクトリ → RosenFileData。
 * @throws ReadError FileType 不正 / 旧世代 / Rosen・DispProp 欠落
 */
export function readRosenFile(root: PtDirectory): ReadRosenFileResult {
  const ctx = new ReadContext();
  const cur = new NodeCursor(root);

  // FileType(sourceFileType として保持、世代判定)。
  const fileType = cur.value('FileType');
  if (fileType === undefined) {
    throw new ReadError(ReaderErrorCode.FileTypeInvalid);
  }
  const group = fileTypeGroup(fileType);
  if (group === null) {
    throw new ReadError(ReaderErrorCode.FileTypeInvalid, {
      reason: 'fileTypeInvalid',
      entries: [{ key: 'FileType', value: fileType }],
    });
  }
  if (group !== 5) {
    // 旧世代リーダーは後続タスク。M1 は現行世代のみ。
    throw new ReadError(ReaderErrorCode.UnsupportedGeneration, {
      reason: 'unsupportedGeneration',
      entries: [{ key: 'FileType', value: fileType }],
    });
  }

  // FileTypeAppComment は読み捨てる(消費だけして破棄)。
  cur.value('FileTypeAppComment');

  // Rosen.(必須)
  const rosenDir = cur.directory('Rosen');
  if (rosenDir === undefined) {
    throw new ReadError(ReaderErrorCode.RosenNotFound);
  }
  const rosen = readRosen(rosenDir, ctx);

  // DispProp.(必須)
  const dispPropDir = cur.directory('DispProp');
  if (dispPropDir === undefined) {
    throw new ReadError(ReaderErrorCode.DispPropNotFound);
  }
  const dispProp = readDispProp(dispPropDir);

  // WindowPlacement.(任意)。透過保持。
  const windowPlacementDir = cur.directory('WindowPlacement');
  const windowPlacement: RawEntry[] | null =
    windowPlacementDir === undefined ? null : windowPlacementDir.children.map((c) => rawEntryOf(c));

  // ルート直下の未知ノード(FileType/FileTypeAppComment/Rosen/DispProp/WindowPlacement 以外)。
  const unknownEntries = cur.unconsumed().map(({ index, node }) => rootUnknownEntryOf(index, node));

  const data: RosenFileData = {
    sourceFileType: fileType,
    rosen,
    dispProp,
    windowPlacement,
    ...(unknownEntries.length > 0 ? { unknownEntries } : {}),
  };

  return { data, warnings: ctx.warnings };
}

export { readRosen, readDispProp } from './current.js';
export { fileTypeGroup } from './fileType.js';
export type { FileTypeGroup } from './fileType.js';
export { ReadContext, ReadError } from './context.js';
