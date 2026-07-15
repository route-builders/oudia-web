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
 * FileType と FileTypeAppComment はルートの unknownEntries に含めず、読込時に消費する。
 * FileType は sourceFileType として保持し、FileTypeAppComment は破棄する
 * (書き出し時にライターが再生成する)。
 */
export interface RosenFileData {
  /**
   * 読込元の FileType 文字列(例 "OuDiaSecond.1.17"、"OuDia.1.02")。表示・診断用。
   * 書き出しは常に "OuDiaSecond.1.17" 固定で、この値は使わない。
   */
  sourceFileType: string;
  rosen: Rosen; // Rosen. ノード
  dispProp: DispProp; // DispProp. ノード
  /**
   * WindowPlacement. ノード(1.12〜、任意)。Web 版では解釈せず透過保持し、
   * 書き出し時に同内容を書き戻す(architecture §4.5)。
   */
  windowPlacement: RawEntry[] | null;
  /** ルート直下の未知キー・未知ノード(FileType / FileTypeAppComment は含めない)。 */
  unknownEntries?: UnknownEntry[];
}
