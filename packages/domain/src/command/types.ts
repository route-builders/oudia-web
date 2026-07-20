// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 up-tri
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

import type {
  Dia,
  DispProp,
  Eki,
  Ekiatsukai,
  Ekijikokukeisiki,
  Ekikibo,
  EkiTrack2,
  Jikoku,
  Ressya,
  Ressyahoukou,
  Ressyasyubetsu,
} from '@oudia-web/format';
import type { Patch } from 'immer';
import type { EkiDisplaySetting } from './ekiDisplayCycle.js';

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

/**
 * 直通化(原典 OnJikokuhyouDirect + CentDedRessya::direct、CentDedRessya.cpp 1087-1241)。
 * 終着側(syuuchakuIndex)と始発側(sihatsuIndex)を 1 本に接続し、始発側を削除する。
 * 接続駅 = ekiOrder(呼出側が findTrainToDirect で相手を特定済み)。
 */
export interface RessyaDirectCommand {
  type: 'ressya/direct';
  diaIndex: number;
  houkou: Ressyahoukou;
  /** 終着側(フォーカス列車)。合成結果はこの位置に残る。 */
  syuuchakuIndex: number;
  /** 始発側(相手列車)。実行後に削除される。 */
  sihatsuIndex: number;
  /** 接続駅(フォーカス駅 Order)。 */
  ekiOrder: number;
}

/**
 * 分断(原典 OnJikokuhyouUndirect + CentDedRessya::undirect、CentDedRessya.cpp 1243-1302)。
 * フォーカス列車を ekiOrder で 2 本に分割する(前半 = 当駅止まり、後半 = 当駅始発を
 * 直後に挿入)。実行可否(始発 < ekiOrder < 終着・時刻あり)は呼出側の責務。
 */
export interface RessyaUndirectCommand {
  type: 'ressya/undirect';
  diaIndex: number;
  houkou: Ressyahoukou;
  ressyaIndex: number;
  ekiOrder: number;
}

/**
 * 時刻のみ貼り付け(原典 OnEditPasteEkiJikoku + CentDedRessya::pasteEkiJikoku、
 * CentDedRessya.cpp 1054-1085)。src の運行なし駅は維持、停車/通過駅は駅扱上書き +
 * 着/発は非 null のときだけ上書き + 番線・前後作業は常に上書き。列車情報は不変。
 * 貼り付け移動量の累積加算はない(通常貼り付けとの相違)。
 */
export interface RessyaPasteEkiJikokuCommand {
  type: 'ressya/pasteEkiJikoku';
  diaIndex: number;
  houkou: Ressyahoukou;
  ressyaIndex: number;
  /** クリップボード先頭列車(複数あっても先頭のみ使用。レデューサが deep copy)。 */
  src: Ressya;
}

/**
 * 列車番号で一本化(原典 OnJikokuhyouUnify + CRessyaContUnifier::unify、
 * CRessyaContUnifier.cpp 94-303)。番号非空一致 + 種別一致 + 有効始発終着ありのペアを
 * 連鎖併合する(インデクスの小さい方が生き残る)。時刻の整合チェックはない。
 */
export interface RessyaUnifyCommand {
  type: 'ressya/unify';
  diaIndex: number;
  houkou: Ressyahoukou;
  /** 対象列車(明示選択時)。null = 全列車。 */
  targetIndices: number[] | null;
}

/**
 * 選択スロット間の並べ替え適用(原典の並べ替えコマンド = CRfEditCmd_Ressya 範囲置換)。
 * 並べ替えの計算(比較・乗継配置)は呼出側(domain/sort・derive)で行い、結果の
 * permutation をここで適用する。targetIndices[k] の位置に、元の
 * targetIndices[order[k]] の列車が入る。非連続選択では選択位置だけが入れ替わり、
 * 間の非選択列車は絶対位置を維持する(原典 4479-4486)。
 */
export interface RessyaReorderCommand {
  type: 'ressya/reorder';
  diaIndex: number;
  houkou: Ressyahoukou;
  /** 並べ替え対象の実 index(昇順)。 */
  targetIndices: number[];
  /** targetIndices 内位置の permutation。 */
  order: number[];
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
  /**
   * 駅扱の同時変更(teisya/tsuuka)。原典 UiDataToTarget は駅扱 + 着発を 1 つの
   * EkiJikoku として書くため、ダイアログ OK 1 回 = Undo 1 単位になるようここで併走させる。
   * none 化は時刻書込がないため別コマンド(setEkiatsukai)のまま。
   */
  ekiatsukai?: 'teisya' | 'tsuuka';
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

// ---- 駅(eki)構造編集(M5)----

/**
 * 駅配列の範囲 [index, index+count) を eki で置換する(原典 CRfEditCmd_Eki::execute、
 * CRfEditCmd_Eki.cpp:167 の replace-region 直訳)。挿入 = count 0 / 削除 = eki [] /
 * 置換 = 両方 > 0 / 末尾追加 = index = ekiCont.length。レデューサが以下を 1 Undo 単位で行う:
 * (1) ekiCont erase→set→insert、(2) 全ダイヤ全方向全列車の ekiJikokuCont 増減(挿入時
 * Tsuuka-neighbor 規則・上り +1 Order)、(3) brunch/loop index 再マップ(挿入 >= かつ
 * +1<size で ++、削除 厳密 > で --、削除駅を指す参照は null)、(4) crossingCheckRule の
 * Origin/Terminal TrackContent index 再マップ、(5) ekijikokukeisiki 端点正規化(挿入のみ)、
 * (6) deriveBrunchLoopMap の整合(参照整合のみ・派生マップはストア外)、(7) adjustOperation。
 * 挿入する駅は draft 外由来のため deep copy される(id は呼出側で採番済みを前提)。
 */
export interface EkiReplaceRangeCommand {
  type: 'eki/replaceRange';
  index: number;
  count: number;
  /** 投入する完成済み駅(id 採番済み。レデューサが deep copy する)。 */
  eki: Eki[];
}

/**
 * 単一駅のプロパティ設定(駅名・略称・駅時刻形式・駅規模・次駅距離ほか)。
 * 駅時刻形式変更時は adjustByEkijikokukeisiki を全列車へ適用する(原典 CRfEditCmd_Eki の
 * 置換経路 + adjustByEkijikokukeisiki)。番線編集は M6 の別コマンド。
 */
export interface EkiSetPropCommand {
  type: 'eki/setProp';
  ekiIndex: number;
  prop:
    | { key: 'ekimei'; value: string }
    | { key: 'ekimeiJikokuRyaku'; value: string }
    | { key: 'ekimeiDiaRyaku'; value: string }
    | { key: 'ekijikokukeisiki'; value: Ekijikokukeisiki }
    | { key: 'ekikibo'; value: Ekikibo }
    | { key: 'nextEkiDistance'; value: number };
}

/**
 * 分岐駅設定(原典 adjustBrunchLoopByBrunchEdit を含む単一駅編集)。
 * core=null で解除。設定時、環状設定(loopOriginEkiIndex)は相互排他のため null 化する。
 * レデューサは設定後 deriveBrunchLoopMap 相当の整合のみ保つ(派生マップはストア外)。
 */
export interface EkiSetBrunchCommand {
  type: 'eki/setBrunch';
  ekiIndex: number;
  brunchCoreEkiIndex: number | null;
  brunchOpposite: boolean;
}

/**
 * 環状線設定(原典 adjustBrunchLoopByLoopEdit を含む単一駅編集)。
 * origin=null で解除。設定時、分岐設定(brunchCoreEkiIndex)は相互排他のため null 化する。
 */
export interface EkiSetLoopCommand {
  type: 'eki/setLoop';
  ekiIndex: number;
  loopOriginEkiIndex: number | null;
  loopOpposite: boolean;
}

// ---- 列車種別(syubetsu)構造編集(M5)----

/**
 * 種別配列の範囲 [index, index+count) を syubetsu で置換する(原典
 * CRfEditCmd_Ressyasyubetsu + CentDedRessyasyubetsuCont::insert/erase)。レデューサが:
 * (1) ressyasyubetsuCont の erase→set→insert、(2) 全ダイヤ全列車の syubetsuIndex 再マップ
 * (削除された種別を指す列車は 0=既定種別へ)、(3) parentSyubetsuIndex 再マップ(削除・自己・
 * 範囲外を指すものは null)。0 個になる削除は事前検証で拒否(I3)。
 */
export interface SyubetsuReplaceRangeCommand {
  type: 'syubetsu/replaceRange';
  index: number;
  count: number;
  syubetsu: Ressyasyubetsu[];
}

/**
 * 種別の入替(原典 CentDedRosen::swapRessyasyubetsu、CentDedRosen.cpp:2047)。
 * A ブロック [indexA, indexA+sizeA) と単一 B を入替え、全列車の syubetsuIndex と
 * parentSyubetsuIndex を同 permutation で再マップする。[上へ]=swap(i,1,i-1) / [下へ]=swap(i,1,i+1)。
 */
export interface SyubetsuSwapCommand {
  type: 'syubetsu/swap';
  indexA: number;
  sizeA: number;
  indexB: number;
}

/** 単一種別のプロパティ設定(名称/略称/色/フォント/線/停車駅明示/親種別/隠し)。 */
export interface SyubetsuSetPropCommand {
  type: 'syubetsu/setProp';
  syubetsuIndex: number;
  /** 差し替える種別値(name 空は事前検証で拒否。レデューサが deep copy)。 */
  value: Ressyasyubetsu;
}

// ---- ダイヤ(dia)構造編集(M5)----

/**
 * ダイヤ配列の範囲 [index, index+count) を dia で置換する(原典 CRfEditCmd_Dia。
 * new/copy/delete/reorder すべてこの 1 コマンドに落とす)。名前一意は事前検証(I2)。
 * kijunDiaIndex を旧→新対応で調整(削除時 0 へ・swap 時は端点入替)。挿入 dia は deep copy。
 * bIsSwap=true は純入替(sizeA==src.size)で kijunDiaIndex の端点入替規則を使う。
 */
export interface DiaReplaceRangeCommand {
  type: 'dia/replaceRange';
  index: number;
  count: number;
  dia: Dia[];
  /** 純入替(上下移動)フラグ。kijunDiaIndex 調整規則が変わる。 */
  isSwap?: boolean;
}

/**
 * 駅表示設定の一括サイクル(原典 CWndDcdGridEki OnEkiSettingNext/Prev。M6)。
 * カスタマイズ時刻表の駅ごと表示設定(下り/上り各項目)を選択駅すべてに順送り/逆送りする。
 */
export interface EkiCycleDisplaySettingCommand {
  type: 'eki/cycleDisplaySetting';
  ekiIndices: number[];
  setting: EkiDisplaySetting;
  houkou: Ressyahoukou;
  /** true = 順送り、false = 逆送り。 */
  forward: boolean;
}

// ---- 番線(ekiTrack2)編集(M6)----

/**
 * 1 駅の番線リストを丸ごと差し替える(原典 CDlgEkiProp の番線編集 + iEkiTrack2Map)。M6。
 * ダイアログが「編集後の番線リスト・主本線 index・省略フラグ・旧→新マップ」を構築して渡す。
 * レデューサは: (1) 削除ガード検証(最後/主本線/使用中は拒否 → 例外)、(2) eki の
 * ekiTrack2Cont/downMain/upMain/diagramTrackOmit を差し替え、(3) 全ダイヤ全列車の
 * ressyaTrackIndex と shunt 番線を旧→新マップで再マップ(teisya/tsuuka のみ)。
 *
 * oldToNew: 長さ=旧番線数、値 = 新 index または -1(削除)。新規番線はマップに現れない
 * (末尾に足された分は tracks に含まれるが oldToNew の対象外)。
 */
export interface EkiTrack2ReplaceCommand {
  type: 'ekiTrack2/replace';
  ekiIndex: number;
  /** 編集後の番線リスト(name/ryaku 非空。レデューサが deep copy)。 */
  tracks: EkiTrack2[];
  downMain: number;
  upMain: number;
  /** 編集後の番線数と同数の省略フラグ。 */
  diagramTrackOmit: boolean[];
  /** 旧→新 index マップ(長さ=旧番線数、-1=削除)。ressya 再マップに使う。 */
  oldToNew: number[];
}

/** ダイヤの背景色・パターン等のプロパティ設定(名前変更は一意性検証あり)。 */
export interface DiaSetPropCommand {
  type: 'dia/setProp';
  diaIndex: number;
  prop:
    | { key: 'name'; value: string }
    | { key: 'mainBackColorIndex'; value: number }
    | { key: 'subBackColorIndex'; value: number }
    | { key: 'backPatternIndex'; value: number };
}

// ---- 路線ファイル(rosen / dispProp)プロパティ(M5)----

/**
 * 路線プロパティの一括設定(路線プロパティダイアログ 4 タブの [路線]/[時刻表]/[ダイヤグラム]
 * 由来。原典 CDlgRosenFileProp)。指定フィールドのみ上書き(未指定は現状維持)。1 Undo 単位。
 */
export interface RosenSetPropCommand {
  type: 'rosen/setProp';
  patch: Partial<{
    rosenmei: string;
    kudariDiaAlias: string;
    noboriDiaAlias: string;
    kitenJikoku: Jikoku;
    diagramDgrYZahyouKyoriDefault: number;
    enableOperation: 0 | 1 | 2;
    operationNumberReverse: boolean;
    operationCrossKitenJikoku: boolean;
    kijunDiaIndex: number;
    disableHiddenSyubetsu: boolean;
  }>;
}

/**
 * 表示プロパティの一括設定(路線プロパティダイアログ [フォント・色]/[時刻表] タブの
 * DispProp 由来)。差し替える DispProp 全体を渡す(ダイアログが編集済みを構築)。
 */
export interface DispPropSetCommand {
  type: 'dispProp/set';
  /** 差し替える DispProp(レデューサが deep copy)。 */
  value: DispProp;
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
  | RessyaDirectCommand
  | RessyaUndirectCommand
  | RessyaPasteEkiJikokuCommand
  | RessyaUnifyCommand
  | RessyaReorderCommand
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
  | EkiJikokuSetEkiatsukaiCommand
  // ---- M5 構造編集 ----
  | EkiReplaceRangeCommand
  | EkiSetPropCommand
  | EkiSetBrunchCommand
  | EkiSetLoopCommand
  | SyubetsuReplaceRangeCommand
  | SyubetsuSwapCommand
  | SyubetsuSetPropCommand
  | DiaReplaceRangeCommand
  | DiaSetPropCommand
  | RosenSetPropCommand
  | DispPropSetCommand
  // ---- M6 番線編集 / 表示設定サイクル ----
  | EkiTrack2ReplaceCommand
  | EkiCycleDisplaySettingCommand;

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
