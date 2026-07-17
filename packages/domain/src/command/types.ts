// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 oudia-second-web contributors
//
// Based on OuDiaSecond (Copyright (C) 2017-2026 diagram_mania)
// and OuDia (Copyright (C) 2006-2017 take-okm)

/**
 * 編集コマンドの型と履歴エントリ(architecture §4.3–§4.4)。
 *
 * 原典の「getCDedRosenFileData() は const のみ返し、変更は必ず CRfEditCmd を
 * executeEditCmd() に渡す」規律を写像する。状態変更は必ず名前付きコマンド(型 +
 * パラメータ)を executeCommand に渡して行う。
 *
 * M2 では最小コマンド `comment/set` のみを実装し、コマンド基盤・patch Undo/Redo・
 * 変更カウンタを稼働させる。列車・駅・種別・ダイヤ編集は M3 以降で型を追加する。
 */

import type { Patch } from 'immer';

/** 路線コメントを設定する(原典 CRfEditCmd_Comment。改行は LF 正規化)。 */
export interface CommentSetCommand {
  type: 'comment/set';
  /** 新しいコメント文字列(呼出し側で LF 正規化済みでなくてよい。レデューサが正規化)。 */
  comment: string;
}

/** 編集コマンド(判別可能ユニオン)。M3 以降で ressya/eki/syubetsu/dia 系を追加。 */
export type EditCommand = CommentSetCommand;

/** コマンド型の文字列(ビュー差分更新のヒント。原典 pHint 相当)。 */
export type EditCommandType = EditCommand['type'];

/** 履歴エントリ(architecture §4.4)。patch 方式 Undo/Redo の単位。 */
export interface HistoryEntry {
  /** コマンド型 + パラメータ(ビュー更新ヒント・将来の操作ログ用)。 */
  command: EditCommand;
  /** 正パッチ(Redo = 適用)。 */
  patches: Patch[];
  /** 逆パッチ(Undo = 適用)。 */
  inversePatches: Patch[];
}
