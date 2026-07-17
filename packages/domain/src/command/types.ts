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
import type { Ressya, Ressyahoukou } from '@oudia/format';

/** 路線コメントを設定する(原典 CRfEditCmd_Comment。改行は LF 正規化)。 */
export interface CommentSetCommand {
  type: 'comment/set';
  /** 新しいコメント文字列(呼出し側で LF 正規化済みでなくてよい。レデューサが正規化)。 */
  comment: string;
}

// ---- 列車配列(ressya)----

/**
 * 列車配列の範囲 [index, index+count) を trains で置換する(原典 CRfEditCmd_Ressya::execute)。
 * 純 splice: 挿入 = count 0 / 削除 = trains []  / 置換 = 両方 > 0。末尾追加は index = cont.length。
 * 4 生成モード(NewItem/Focus/Select/All)は呼出側が (index, count, trains) に落とす。
 */
export interface RessyaReplaceRangeCommand {
  type: 'ressya/replaceRange';
  diaIndex: number;
  houkou: Ressyahoukou;
  index: number;
  count: number;
  /** 投入する完成済み列車(レデューサが deep copy する)。 */
  trains: Ressya[];
}

/**
 * A ブロック([indexA, indexA+sizeA))と単一 B(indexB)を並べ替える(原典 CRfEditCmd_RessyaSwap)。
 * [左へ] = swap(idx, size, idx-1) / [右へ] = swap(idx, size, idx+size)。
 */
export interface RessyaSwapCommand {
  type: 'ressya/swap';
  diaIndex: number;
  houkou: Ressyahoukou;
  indexA: number;
  sizeA: number;
  /** ブロック外の単一列車 index。indexA <= indexB < indexA+sizeA は不正。 */
  indexB: number;
}

/** 列車の単一プロパティ設定(種別/番号/名前/号数/備考)。 */
export interface RessyaSetPropCommand {
  type: 'ressya/setProp';
  diaIndex: number;
  houkou: Ressyahoukou;
  ressyaIndex: number;
  prop:
    | { key: 'syubetsuIndex'; value: number }
    | { key: 'ressyabangou'; value: string }
    | { key: 'ressyamei'; value: string }
    | { key: 'gousuu'; value: string }
    | { key: 'bikou'; value: string };
}

/** 運休設定(原典 OnJikokuhyouCanceled → setIsCanceled)。反転結果を呼出側で計算して渡す。 */
export interface RessyaSetCanceledCommand {
  type: 'ressya/setCanceled';
  diaIndex: number;
  houkou: Ressyahoukou;
  ressyaIndices: number[];
  canceled: boolean;
}

/** 当駅始発(原典 CentDedRessya::setSihatsuEki)。前方駅を全 None 化 + 発ありなら着消去。 */
export interface RessyaSetSihatsuEkiCommand {
  type: 'ressya/setSihatsuEki';
  diaIndex: number;
  houkou: Ressyahoukou;
  ressyaIndices: number[];
  ekiOrder: number;
}

/** 当駅止り(原典 CentDedRessya::setSyuuchakuEki)。着ありなら発消去 + 後方駅を全 None 化。 */
export interface RessyaSetSyuuchakuEkiCommand {
  type: 'ressya/setSyuuchakuEki';
  diaIndex: number;
  houkou: Ressyahoukou;
  ressyaIndices: number[];
  ekiOrder: number;
}

// ---- 駅時刻(ekiJikoku)----

/**
 * 着時刻設定(グリッド入力/ダイアログ)。原典 setChakujikoku 経由(none→teisya 自動昇格)。
 * input は生文字列。レデューサが decode + 時補完。空文字 = クリア。
 */
export interface EkiJikokuSetChakuCommand {
  type: 'ekiJikoku/setChaku';
  diaIndex: number;
  houkou: Ressyahoukou;
  ressyaIndex: number;
  ekiOrder: number;
  input: string;
  /** 繰上げ繰下げ(発以後へ delta 伝播)。既定 false = 当該駅のみ。 */
  modify?: boolean;
}

/** 発時刻設定。原典 setHatsujikoku 経由(none→teisya 自動昇格)。 */
export interface EkiJikokuSetHatsuCommand {
  type: 'ekiJikoku/setHatsu';
  diaIndex: number;
  houkou: Ressyahoukou;
  ressyaIndex: number;
  ekiOrder: number;
  input: string;
  modify?: boolean;
}

/** 番線設定(原典 setRessyaTrackIndex)。null = 未設定。 */
export interface EkiJikokuSetTrackCommand {
  type: 'ekiJikoku/setTrack';
  diaIndex: number;
  houkou: Ressyahoukou;
  ressyaIndex: number;
  ekiOrder: number;
  ressyaTrackIndex: number | null;
}

/** 時刻消去(原典 OnJikokuhyouJikokuSakujo)。target 列のみ null 化 + 両 null なら None 化。 */
export interface EkiJikokuClearCommand {
  type: 'ekiJikoku/clear';
  diaIndex: number;
  houkou: Ressyahoukou;
  ressyaIndices: number[];
  ekiOrder: number;
  target: 'chaku' | 'hatsu';
}

/** 通過(原典 OnJikokuhyouTsuuka)。ekiatsukai=tsuuka + 両時刻 null(破壊的)。 */
export interface EkiJikokuToggleTsuukaCommand {
  type: 'ekiJikoku/toggleTsuuka';
  diaIndex: number;
  houkou: Ressyahoukou;
  ressyaIndices: number[];
  ekiOrder: number;
}

/** 経由なし(原典 OnJikokuhyouKeiyunasi → setEkiatsukai(None))。全消去して None。 */
export interface EkiJikokuSetKeiyunasiCommand {
  type: 'ekiJikoku/setKeiyunasi';
  diaIndex: number;
  houkou: Ressyahoukou;
  ressyaIndices: number[];
  ekiOrder: number;
}

/** 編集コマンド(判別可能ユニオン)。 */
export type EditCommand =
  | CommentSetCommand
  | RessyaReplaceRangeCommand
  | RessyaSwapCommand
  | RessyaSetPropCommand
  | RessyaSetCanceledCommand
  | RessyaSetSihatsuEkiCommand
  | RessyaSetSyuuchakuEkiCommand
  | EkiJikokuSetChakuCommand
  | EkiJikokuSetHatsuCommand
  | EkiJikokuSetTrackCommand
  | EkiJikokuClearCommand
  | EkiJikokuToggleTsuukaCommand
  | EkiJikokuSetKeiyunasiCommand;

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
