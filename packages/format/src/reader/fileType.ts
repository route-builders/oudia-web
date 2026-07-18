// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 up-tri
//
// Based on OuDiaSecond (Copyright (C) 2017-2026 diagram_mania)
// and OuDia (Copyright (C) 2006-2017 take-okm)

/**
 * FileType 文字列 → 世代グループ判定(analysis §03 §3、原典
 * CconvCDedRosenFileData::isEncodeAbleFormat)。**完全一致**の固定集合で判定する
 * (プレフィックスや数値パースはしない)。
 *
 * この M1 段階では現行世代(グループ 5)のリーダーのみを実装する。旧世代
 * (1〜4)の変換リーダーは後続タスクで追加する(§3 のグループ境界変換)。
 */

/** 世代グループ番号(原典 isEncodeAbleFormat の戻り値)。 */
export type FileTypeGroup = 1 | 2 | 3 | 4 | 5;

/** グループ 5(現行、OuDiaSecond.1.10〜1.17)。CconvCentDed で読む。 */
const GROUP5 = new Set([
  'OuDiaSecond.1.10',
  'OuDiaSecond.1.11',
  'OuDiaSecond.1.12',
  'OuDiaSecond.1.13',
  'OuDiaSecond.1.14',
  'OuDiaSecond.1.15',
  'OuDiaSecond.1.16',
  'OuDiaSecond.1.17',
]);

/** グループ 4(OuDiaSecond.1.06〜1.09)。CconvCentDedS09 で読む。 */
const GROUP4 = new Set([
  'OuDiaSecond.1.06',
  'OuDiaSecond.1.07',
  'OuDiaSecond.1.08',
  'OuDiaSecond.1.09',
]);

/** グループ 3(OuDiaSecond.1.01〜1.05)。CconvCentDedS05 で読む。 */
const GROUP3 = new Set([
  'OuDiaSecond.1.01',
  'OuDiaSecond.1.02',
  'OuDiaSecond.1.03',
  'OuDiaSecond.1.04',
  'OuDiaSecond.1.05',
]);

/** FileType → グループ番号。未知は null(原典 -1 = FileType が正しくありません)。 */
export function fileTypeGroup(fileType: string): FileTypeGroup | null {
  if (GROUP5.has(fileType)) return 5;
  if (GROUP4.has(fileType)) return 4;
  if (GROUP3.has(fileType)) return 3;
  if (fileType === 'OuDiaSecond.1.00') return 2;
  if (fileType === 'OuDia.1.02') return 1;
  return null;
}
