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
import type { Ekiatsukai, Ressya, Ressyahoukou } from '@oudia/format';

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

/** 運休設定(setIsCanceled の直接指定形。UI の運休トグルは ressya/toggleCanceled を使う)。 */
export interface RessyaSetCanceledCommand {
  type: 'ressya/setCanceled';
  diaIndex: number;
  houkou: Ressyahoukou;
  ressyaIndices: number[];
  canceled: boolean;
}

/**
 * 運休トグル(原典 OnJikokuhyouCanceled、CWjkState_Ressyahensyu.cpp 9942-9997)。
 * 各列車を独立に反転する(setIsCanceled(!isCanceled())。代表値方式ではない)。
 */
export interface RessyaToggleCanceledCommand {
  type: 'ressya/toggleCanceled';
  diaIndex: number;
  houkou: Ressyahoukou;
  ressyaIndices: number[];
}

/**
 * 種別を前/次へ(原典 ChangeRessyasyubetsuPrev/Next、CWjkState_Ressyahensyu.cpp 14585-14621)。
 * 各列車の syubetsuIndex を step 分進め、端でラップする。
 */
export interface RessyaStepSyubetsuCommand {
  type: 'ressya/stepSyubetsu';
  diaIndex: number;
  houkou: Ressyahoukou;
  ressyaIndices: number[];
  step: 1 | -1;
}

/**
 * 列車番号/号数の末尾連続数字への加算(原典 modifyRessyaBangou/modifyGou、
 * CentDedRessya.cpp 822-1010)。数字なしは no-op、負は 0 クランプ、列車番号は元桁数 0 詰め。
 */
export interface RessyaModifyBangouCommand {
  type: 'ressya/modifyBangou';
  diaIndex: number;
  houkou: Ressyahoukou;
  ressyaIndices: number[];
  target: 'ressyabangou' | 'gousuu';
  delta: number;
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
 * 着時刻設定(グリッド入力/連続入力)。原典 setChakujikoku 経由(none→teisya 自動昇格)。
 * input は生文字列。レデューサが decode + 時補完。空文字 = クリア。
 */
export interface EkiJikokuSetChakuCommand {
  type: 'ekiJikoku/setChaku';
  diaIndex: number;
  houkou: Ressyahoukou;
  ressyaIndex: number;
  ekiOrder: number;
  input: string;
}

/** 発時刻設定。原典 setHatsujikoku 経由(none→teisya 自動昇格)。 */
export interface EkiJikokuSetHatsuCommand {
  type: 'ekiJikoku/setHatsu';
  diaIndex: number;
  houkou: Ressyahoukou;
  ressyaIndex: number;
  ekiOrder: number;
  input: string;
}

/**
 * 着・発の一括書込(駅時刻ダイアログの確定経路)。
 * modify=true は原典 CentDedRessya::modifyCentDedEkiJikoku(CentDedRessya.cpp 284-356)の
 * 繰上げ・繰下げ: 発が前後とも非 null なら発差分を次駅の着以後へ、そうでなく着が前後とも
 * 非 null なら着差分を当該駅の発以後へ伝播する(発優先。他は伝播なし)。
 * modify=false は setCentDedEkiJikoku 相当(置換のみ)。
 */
export interface EkiJikokuWriteJikokuCommand {
  type: 'ekiJikoku/writeJikoku';
  diaIndex: number;
  houkou: Ressyahoukou;
  ressyaIndex: number;
  ekiOrder: number;
  /** 生入力(decode + 時補完はレデューサ)。空文字 = クリア。 */
  chakuInput: string;
  hatsuInput: string;
  /** 繰上げ・繰下げ(ダイアログのチェック。原典既定 ON)。 */
  modify: boolean;
}

/**
 * 駅時刻の連続シフト(原典 CentDedRessya::modifyRessyaJikoku / modifyRessyaJikokuRev、
 * CentDedRessya.cpp 717-821)。基準 (ekiOrder, item) 自身を含み、rev=false は末尾方向
 * (着→発→次駅着…)、rev=true は起点方向(発→着→前駅発…)の全非 null 時刻へ
 * deltaSeconds を加算する(24h wrap)。駅扱は見ない。null はスキップして走査続行。
 */
export interface EkiJikokuShiftJikokuCommand {
  type: 'ekiJikoku/shiftJikoku';
  diaIndex: number;
  houkou: Ressyahoukou;
  ressyaIndices: number[];
  ekiOrder: number;
  item: 'chaku' | 'hatsu';
  deltaSeconds: number;
  /** true = Rev 系(フォーカス以前へ伝播)。既定 false。 */
  rev?: boolean;
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
  /**
   * 連続入力モード版(CWjkState_Renzoku.cpp 1118-1138): 消去前に駅扱をいったん停車にする。
   * 通過駅の片側消去で駅扱が停車へ変わる点が通常版と異なる。既定 false。
   */
  teisyaFirst?: boolean;
}

/**
 * 駅時刻変更の操作内容(原典 CentDedRessya_EkijikokuModifyOperation2)。
 * ビュー単位で記憶され、[再実行](Ctrl+'.')で別セルへ連続適用される。
 * seconds は秒単位(Ver2.00.05 で分→秒化)。
 */
export interface EkijikokuModifyOperation2 {
  /** [駅扱] 変更する。 */
  setEkiatsukai: boolean;
  /** 変更後の駅扱(setEkiatsukai=true のとき有効)。 */
  ekiatsukai: Ekiatsukai;
  /** [駅時刻] nop=変更しない / modify=繰下げ(負で繰上げ) / copy=他駅からコピー / toNull=設定なし化。 */
  operation: 'nop' | 'modify' | 'copy' | 'toNull';
  /** シフト秒数(modify)/ コピー元への加算秒数(copy)。 */
  seconds: number;
  /** コピー元の時刻 Order(copy のとき)。記憶時は絶対(適用先が変わっても固定)。 */
  copySrc: { ekiOrder: number; item: 'chaku' | 'hatsu' } | null;
}

/** NULL 状態(未実行 or「変更しない」で OK)。再実行は無効。 */
export function isNullModifyOperation2(op: EkijikokuModifyOperation2): boolean {
  return !op.setEkiatsukai && op.operation === 'nop';
}

/**
 * 駅時刻変更の適用(原典 CentDedRessya_EkijikokuModifyOperation2::execute +
 * execCdModifyEkijikokuCmd)。①駅扱変更 → ②時刻変更(modify のみフォーカス以後へ伝播、
 * copy/toNull は片側のみ・伝播なし)の順。選択全列車へ同じ時刻 Order で適用し 1 Undo 単位。
 */
export interface EkiJikokuModifyOperation2Command {
  type: 'ekiJikoku/modifyOperation2';
  diaIndex: number;
  houkou: Ressyahoukou;
  ressyaIndices: number[];
  ekiOrder: number;
  /** 適用先の着/発(その時のフォーカスセルに従う)。 */
  item: 'chaku' | 'hatsu';
  op: EkijikokuModifyOperation2;
}

/**
 * 連続入力モードの分 2 桁確定(原典 CWjkState_Renzoku::OnChar 919-1028)。
 * 時 = findrevJikoku(直前の非 null 時刻)の「時」、分 = minutes、秒 = 0。直前より前に
 * なるなら +1 時間(24h wrap)。運行なし駅は停車化 + 基準番線(主本線)適用、
 * 停車/通過駅は明示停車化(番線不変)。書込先はフォーカス行(item)。
 */
export interface EkiJikokuRenzokuInputCommand {
  type: 'ekiJikoku/renzokuInput';
  diaIndex: number;
  houkou: Ressyahoukou;
  ressyaIndex: number;
  ekiOrder: number;
  item: 'chaku' | 'hatsu';
  /** 入力された分(0-59)。 */
  minutes: number;
}

/** 通過(原典 OnJikokuhyouTsuuka)。ekiatsukai=tsuuka + 両時刻 null(破壊的)。 */
export interface EkiJikokuToggleTsuukaCommand {
  type: 'ekiJikoku/toggleTsuuka';
  diaIndex: number;
  houkou: Ressyahoukou;
  ressyaIndices: number[];
  ekiOrder: number;
}

/**
 * 通過-停車トグル(原典 OnJikokuhyouTsuukateisya、CWjkState_Ressyahensyu.cpp 4919-5042)。
 * 各列車が自身の駅扱で独立に 3 分岐: 通過→停車 / 停車→通過(いずれも時刻・番線維持)/
 * 運行なし→通過(基準番線=主本線を設定)。代表値方式ではない。
 */
export interface EkiJikokuToggleTsuukaTeisyaCommand {
  type: 'ekiJikoku/toggleTsuukaTeisya';
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

/**
 * 駅扱の直接設定(原典 CentDedEkiJikoku::setEkiatsukai。駅時刻ダイアログの駅扱ラジオ)。
 * none = 全消去(経由なし化)/ tsuuka = 通過化(時刻クリア)/ teisya = 停車化(時刻保持)。
 */
export interface EkiJikokuSetEkiatsukaiCommand {
  type: 'ekiJikoku/setEkiatsukai';
  diaIndex: number;
  houkou: Ressyahoukou;
  ressyaIndices: number[];
  ekiOrder: number;
  ekiatsukai: Ekiatsukai;
}

/** 編集コマンド(判別可能ユニオン)。 */
export type EditCommand =
  | CommentSetCommand
  | RessyaReplaceRangeCommand
  | RessyaSwapCommand
  | RessyaSetPropCommand
  | RessyaSetCanceledCommand
  | RessyaToggleCanceledCommand
  | RessyaStepSyubetsuCommand
  | RessyaModifyBangouCommand
  | RessyaSetSihatsuEkiCommand
  | RessyaSetSyuuchakuEkiCommand
  | EkiJikokuSetChakuCommand
  | EkiJikokuSetHatsuCommand
  | EkiJikokuWriteJikokuCommand
  | EkiJikokuShiftJikokuCommand
  | EkiJikokuSetTrackCommand
  | EkiJikokuClearCommand
  | EkiJikokuRenzokuInputCommand
  | EkiJikokuModifyOperation2Command
  | EkiJikokuToggleTsuukaCommand
  | EkiJikokuToggleTsuukaTeisyaCommand
  | EkiJikokuSetKeiyunasiCommand
  | EkiJikokuSetEkiatsukaiCommand;

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
