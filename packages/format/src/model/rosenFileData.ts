// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 oudia-second-web contributors
//
// Based on OuDiaSecond (Copyright (C) 2017-2026 diagram_mania)
// and OuDia (Copyright (C) 2006-2017 take-okm)

import type { RawEntry, UnknownEntry } from './basic.js';
import type { DispProp, Rosen } from './entities.js';

/**
 * ファイル 1 個ぶんの全体(原典 CDedRosenFileData 相当)。data-model §2.2。
 *
 * FileType と FileTypeAppComment はルートの unknownEntries に含めず、読込時に専用フィールドへ
 * 取り込む。いずれも読込元の文字列を保持し、書き出し時にそのまま書き戻す
 * (バイト一致 T1 の要件。原典アプリは FileTypeAppComment を実行時に再生成するが、
 * Web 版は決定論的に往復させるため読込値を保持する)。
 */
export interface RosenFileData {
  /**
   * 読込元の FileType 文字列(例 "OuDiaSecond.1.17"、"OuDia.1.02")。
   * 書き出しはこの値をそのまま書き戻す(1.17 固定ではない。旧世代を読んだ場合の
   * バイト一致のため)。現行世代ライターの対象は現状 1.10〜1.17。
   */
  sourceFileType: string;
  rosen: Rosen; // Rosen. ノード
  dispProp: DispProp; // DispProp. ノード
  /**
   * WindowPlacement. ノード(1.12〜、任意)。Web 版では解釈せず透過保持し、
   * 書き出し時に同内容を書き戻す(architecture §4.5)。
   */
  windowPlacement: RawEntry[] | null;
  /**
   * 読込元の FileTypeAppComment 値(ルート最終行。例 "OuDiaSecondV2 Ver. 2.06.21")。
   * キー欠落時は null。書き出し時、非 null ならルート最終プロパティとして書き戻す。
   */
  sourceFileTypeAppComment: string | null;
  /** ルート直下の未知キー・未知ノード(FileType / FileTypeAppComment は含めない)。 */
  unknownEntries?: UnknownEntry[];
}
