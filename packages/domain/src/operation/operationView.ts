// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 up-tri
//
// Based on OuDiaSecond (Copyright (C) 2017-2026 diagram_mania)
// and OuDia (Copyright (C) 2006-2017 take-okm)

/**
 * 作業編集の表示層(純関数)。M7b PR-2。
 *
 * - `formatOperationLine`: リスト 1 行の表示文字列(原典 CreateOperationString、
 *   CDlgOperationProp.cpp:101-444)。iLevel ドット連結 + 種別ラベル + 時刻(秒付き・
 *   NULL は '--:--')+ 運番(';' 区切り)。
 * - `operationFieldSpec`: 選択行の (kind, isAfter) に応じたコントロール表示仕様
 *   (原典 UiDataToUi、CDlgOperationProp.cpp:446-1125)。ラジオ2群排他・コンボ5種排他・
 *   Edit1/2・運番・チェック・連携コードの visible/label。
 *
 * 時刻書式は原典の CConv(Colon=false, HourZeroToNone, Second_Output)= 時(0 埋めなし)
 * + 分(2 桁)+ 秒(2 桁)・コロンなし(CdDedJikoku.cpp:304-408)。
 */

import type { EkiTrack2, Jikoku, OuterTerminal } from '@oudia-web/format';
import { SECONDS_PER_DAY } from '../jikoku.js';
import {
  type FlatOp,
  OP_CONNECT,
  OP_JUNCTION,
  OP_NUMBER_CHANGE,
  OP_OUT_IN,
  OP_OUTER,
  OP_PLACEHOLDER,
  OP_RELEASE,
  OP_SHUNT,
} from './editModel.js';

const NULL_JIKOKU = '--:--';

/**
 * 作業表示用の時刻書式(原典 g_CdDedJikokuConv、Colon=false/HourZeroToNone/Second_Output)。
 * 時=0 埋めなし・分秒=2 桁・コロンなし。NULL は '--:--'(呼出側で分岐)。
 */
export function formatOperationJikoku(jikoku: Jikoku): string {
  if (jikoku === null) return NULL_JIKOKU;
  const total = (((jikoku as number) % SECONDS_PER_DAY) + SECONDS_PER_DAY) % SECONDS_PER_DAY;
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${String(h)}${String(m).padStart(2, '0')}${String(s).padStart(2, '0')}`;
}

/** 運用番号を ';' 区切りで連結(原典 joinc(';', ...))。 */
function joinNumbers(nums: readonly string[]): string {
  return nums.join(';');
}

/** iLevel をドット連結(原典 to_tstring(iLevel[0]) + '.' + ...)。 */
function levelPrefix(level: readonly number[]): string {
  return level.map(String).join('.');
}

/** 番線表示名(原典 EkiTrack2::getTrackName())。範囲外は空。 */
function trackName(tracks: readonly EkiTrack2[], idx: number): string {
  return tracks[idx]?.trackName ?? '';
}
/** 路線外発着駅名(原典 getOuterTerminalEkimei(idx))。範囲外は空。 */
function outerName(terminals: readonly OuterTerminal[], idx: number): string {
  return terminals[idx]?.ekimei ?? '';
}

/**
 * 行書式に必要な参照(当駅の番線・路線外発着駅)。
 */
export interface OperationFormatCtx {
  readonly tracks: readonly EkiTrack2[];
  readonly outerTerminals: readonly OuterTerminal[];
}

/**
 * flat 作業 1 件の表示文字列(原典 CreateOperationString、dlgop.cpp:101-444)。
 * @param op       flat 作業
 * @param isAfter  この作業が後作業扱いか(3/4/5 で意味・ラベルが分岐)
 * @param ctx      当駅の番線・路線外発着駅
 */
export function formatOperationLine(op: FlatOp, isAfter: boolean, ctx: OperationFormatCtx): string {
  // プレースホルダは全体差し替え。
  if (op.kind === OP_PLACEHOLDER) return '(作業を追加)';

  const jikoku1 = formatOperationJikoku(op.editData1);
  const jikoku2 = formatOperationJikoku(op.editData2);
  let s = levelPrefix(op.level);

  switch (op.kind) {
    case OP_SHUNT: {
      s += ' 入換 ';
      s += trackName(ctx.tracks, op.comboData1);
      s += isAfter ? 'へ ' : 'から ';
      // 原典は decode>=0(=常に成立)で発・着を出す。TS では常に表示。
      s += `${jikoku1} 発 `;
      s += `${jikoku2} 着 `;
      break;
    }
    case OP_CONNECT: {
      s += '┘ 増結 ';
      s += jikoku1;
      s += op.comboData1 === 0 ? ' 編成後方に増結' : ' 編成前方に増結';
      break;
    }
    case OP_RELEASE: {
      s += '┐ 解結 ';
      s += jikoku2;
      const count = String(op.releaseCount);
      if (op.comboData1 === 0) s += ` 後方の ${count} 編成を解結`;
      else if (op.comboData1 === 1) s += ` 前方の ${count} 編成を解結`;
      else s += ` 前方の ${count} 編成以外を解結`;
      break;
    }
    case OP_OUT_IN: {
      if (isAfter) {
        s += ' 入区 ';
        s += jikoku1;
        if (op.inOutLinkCode !== '') s += ` ${op.inOutLinkCode}`;
      } else {
        s += ' 出区 ';
        s += jikoku1;
        if (op.operationNumbers.length > 0) s += ` ${joinNumbers(op.operationNumbers)}`;
        if (op.inOutLinkCode !== '') s += ` ${op.inOutLinkCode}`;
      }
      break;
    }
    case OP_OUTER: {
      if (isAfter) {
        s += ' 路線外終着 ';
        s += `当駅 ${jikoku1} 発 `;
        s += `${outerName(ctx.outerTerminals, op.comboData1)}駅 ${jikoku2} 着`;
        if (op.inOutLinkCode !== '') s += ` ${op.inOutLinkCode}`;
      } else {
        s += ' 路線外始発 ';
        s += `${outerName(ctx.outerTerminals, op.comboData1)}駅 ${jikoku1} 発 `;
        s += `当駅 ${jikoku2} 着`;
        if (op.operationNumbers.length > 0) s += ` ${joinNumbers(op.operationNumbers)}`;
        if (op.inOutLinkCode !== '') s += ` ${op.inOutLinkCode}`;
      }
      break;
    }
    case OP_JUNCTION: {
      if (isAfter) {
        s += ' 次列車接続 ';
        s += jikoku1;
        s +=
          op.comboData1 === 0
            ? ' 別列車'
            : op.comboData1 === 1
              ? ' 種別変更'
              : op.comboData1 === 2
                ? ' 列車情報変更'
                : ' 同一列車扱い';
      } else {
        s += ' 前列車接続 ';
        s += jikoku1;
        s += ' ';
        if (op.operationNumbers.length > 0) s += joinNumbers(op.operationNumbers);
      }
      break;
    }
    case OP_NUMBER_CHANGE: {
      if (op.check1) {
        s += ' 運用番号順反転';
      } else {
        s += ' 運用番号変更 ';
        if (op.operationNumbers.length > 0) s += joinNumbers(op.operationNumbers);
      }
      break;
    }
  }
  return s;
}

// ---- field-visibility(原典 UiDataToUi、CDlgOperationProp.cpp:446-1125)----

/** 単一コントロールの表示仕様。 */
export interface ControlSpec {
  readonly visible: boolean;
  readonly label: string;
}

/** コンボ Data1 の表示仕様(項目種類 + ラベル)。 */
export interface ComboSpec extends ControlSpec {
  /** どの物理コンボか(項目の中身が異なる)。none = 非表示。 */
  readonly kind: 'none' | 'shuntTrack' | 'connectPos' | 'releasePos' | 'outerEki' | 'junctionType';
}

/** 作業種類ラジオ 7 個の有効・ラベル。 */
export interface RadioSpec {
  /** ラジオ index(1..7 が原典。ここでは 0..6 = kind 0..6)。 */
  readonly kind: number;
  readonly label: string;
  readonly enabled: boolean;
}

/** 選択行のコントロール表示仕様(原典 UiDataToUi の全出力)。 */
export interface OperationFieldSpec {
  readonly radios: readonly RadioSpec[];
  readonly combo1: ComboSpec;
  readonly edit1: ControlSpec & { readonly steppersEnabled: boolean };
  readonly edit2: ControlSpec & { readonly steppersEnabled: boolean };
  readonly operationNumbers: ControlSpec;
  readonly check1: ControlSpec;
  readonly inOutLinkCode: ControlSpec;
  readonly buttons: {
    readonly add: boolean;
    readonly insert: boolean;
    readonly childAdd: ControlSpec;
    readonly clear: boolean;
    readonly up: boolean;
    readonly down: boolean;
  };
}

/** 路線外始発/終着が使えるか(原典 m_bOuterHatsuChakuIsEnable。路線外発着駅が存在するか)。 */
export interface FieldSpecOptions {
  readonly outerEnable: boolean;
  /** iLevel の深さ(1 = トップ、>1 = 増解結の子)。入換の check1 は深さ 1 のみ有効。 */
  readonly levelDepth: number;
  /** この行が同階層の {0,1,2,6} 隣接兄弟を前/後に持つか(Up/Down 有効判定)。 */
  readonly hasPrevSibling: boolean;
  readonly hasNextSibling: boolean;
}

/** ラジオ 7 個のラベル(前作業/後作業で 4/5/6 が差し替わる)。原典 dlgop.cpp:460-531。 */
function radioLabels(isAfter: boolean): string[] {
  return [
    '入換', // kind 0
    '増結', // 1
    '解結', // 2
    isAfter ? '入区' : '出区', // 3
    isAfter ? '路線外終着' : '路線外始発', // 4
    isAfter ? '次列車接続' : '前列車接続', // 5
    '運用番号変更', // 6
  ];
}

const hiddenControl: ControlSpec = { visible: false, label: '' };

/**
 * 選択行の (kind, isAfter) に応じたコントロール表示仕様(原典 UiDataToUi、cpp:446-1125)。
 */
export function operationFieldSpec(
  kind: FlatOp['kind'],
  isAfter: boolean,
  opts: FieldSpecOptions,
): OperationFieldSpec {
  const labels = radioLabels(isAfter);

  // ラジオ有効(dlgop.cpp:532-562)。入換系 {0,1,2,6} と端点系 {3,4,5} で相互排他。
  // kind<=2 || ==6 → 入換系有効。kind 3..5 → 端点系有効(4=路線外は outerEnable 依存)。
  const isNumberKindGroup = kind <= 2 || kind === OP_NUMBER_CHANGE;
  const isEndpointGroup = kind >= OP_OUT_IN && kind <= OP_JUNCTION;
  const radios: RadioSpec[] = labels.map((label, i) => {
    let enabled = false;
    if (kind === OP_PLACEHOLDER) {
      enabled = false;
    } else if (isNumberKindGroup) {
      enabled = i <= OP_RELEASE || i === OP_NUMBER_CHANGE; // 0,1,2,6
    } else if (isEndpointGroup) {
      // 3,4,5 のうち 4(路線外)は outerEnable のとき有効。
      enabled = i === OP_OUT_IN || i === OP_JUNCTION || (i === OP_OUTER && opts.outerEnable);
    }
    return { kind: i, label, enabled };
  });

  // コンボ Data1(dlgop.cpp:830-933)。5 種排他。
  let combo1: ComboSpec = { ...hiddenControl, kind: 'none' };
  if (kind === OP_SHUNT) combo1 = { visible: true, label: '入換番線:', kind: 'shuntTrack' };
  else if (kind === OP_CONNECT) combo1 = { visible: true, label: '増結位置:', kind: 'connectPos' };
  else if (kind === OP_RELEASE) combo1 = { visible: true, label: '解結位置:', kind: 'releasePos' };
  else if (kind === OP_OUTER) {
    combo1 = {
      visible: true,
      label: isAfter ? '路線外終着駅名:' : '路線外始発駅名:',
      kind: 'outerEki',
    };
  } else if (kind === OP_JUNCTION && isAfter) {
    combo1 = { visible: true, label: '次列車接続タイプ:', kind: 'junctionType' };
  }

  // Edit1(strEditData1)(dlgop.cpp:935-1050)。
  let edit1: ControlSpec = hiddenControl;
  if (kind === OP_SHUNT) edit1 = { visible: true, label: '入換発時刻:' };
  else if (kind === OP_CONNECT) edit1 = { visible: true, label: '増結時刻:' };
  else if (kind === OP_RELEASE) edit1 = { visible: true, label: '編成数:' };
  else if (kind === OP_OUT_IN)
    edit1 = { visible: true, label: isAfter ? '入区時刻:' : '出区時刻:' };
  else if (kind === OP_OUTER) {
    edit1 = { visible: true, label: isAfter ? '当駅発時刻:' : '始発駅発時刻:' };
  } else if (kind === OP_JUNCTION) {
    edit1 = { visible: true, label: isAfter ? '終点時刻:' : '起点時刻:' };
  }

  // Edit2(strEditData2)(dlgop.cpp:1052-1090)。入換着 / 解結時刻 / 路線外の対時刻のみ。
  let edit2: ControlSpec = hiddenControl;
  if (kind === OP_SHUNT) edit2 = { visible: true, label: '入換着時刻:' };
  else if (kind === OP_RELEASE) edit2 = { visible: true, label: '解結時刻:' };
  else if (kind === OP_OUTER) {
    edit2 = { visible: true, label: isAfter ? '終着駅着時刻:' : '当駅着時刻:' };
  }

  // 運用番号(dlgop.cpp:1092-1108)。((3||4||5)&&前作業)||6 で有効。5 は仮運用番号。
  let operationNumbers: ControlSpec = hiddenControl;
  if (
    ((kind === OP_OUT_IN || kind === OP_OUTER || kind === OP_JUNCTION) && !isAfter) ||
    kind === OP_NUMBER_CHANGE
  ) {
    operationNumbers = { visible: true, label: kind === OP_JUNCTION ? '仮運用番号:' : '運用番号:' };
  }

  // チェック(dlgop.cpp:1110-1120)。入換 && 深さ 1 / 運番変更。
  let check1: ControlSpec = hiddenControl;
  if (kind === OP_SHUNT && opts.levelDepth === 1) {
    check1 = {
      visible: true,
      label: isAfter ? '入換発時刻を当駅発時刻にする' : '入換着時刻を当駅着時刻にする',
    };
  } else if (kind === OP_NUMBER_CHANGE) {
    check1 = { visible: true, label: '運用番号順を反転させる' };
  }

  // 入出区連携コード(dlgop.cpp:1122-1125)。出入区 || 路線外。
  const inOutLinkCode: ControlSpec =
    kind === OP_OUT_IN || kind === OP_OUTER
      ? { visible: true, label: '入出区連携コード:' }
      : hiddenControl;

  // 時刻増減ボタン(dlgop.cpp:716-811)。
  //   0||4 → edit1・edit2 とも有効。1||3||5 → edit1 のみ。2(解結)→ edit1 は限定(ここでは
  //   有効扱いに単純化)・edit2 有効。他は無効。
  const edit1Steppers =
    kind === OP_SHUNT ||
    kind === OP_OUTER ||
    kind === OP_CONNECT ||
    kind === OP_OUT_IN ||
    kind === OP_JUNCTION ||
    kind === OP_RELEASE;
  const edit2Steppers = kind === OP_SHUNT || kind === OP_OUTER || kind === OP_RELEASE;

  // ボタン(dlgop.cpp:584-709)。
  const isRenketsu = kind === OP_CONNECT || kind === OP_RELEASE;
  const childAdd: ControlSpec = isRenketsu
    ? {
        visible: true,
        label: kind === OP_CONNECT ? '増結編成の作業を挿入' : '解結編成の作業を追加',
      }
    : { visible: false, label: '' };
  const buttons = {
    add: kind !== OP_PLACEHOLDER ? true : true, // プレースホルダも Add のみ有効
    insert: kind !== OP_PLACEHOLDER,
    childAdd,
    clear: kind !== OP_PLACEHOLDER,
    // Up/Down は {0,1,2,6} かつ同階層隣接兄弟あり。
    up:
      (kind === OP_SHUNT ||
        kind === OP_CONNECT ||
        kind === OP_RELEASE ||
        kind === OP_NUMBER_CHANGE) &&
      opts.hasPrevSibling,
    down:
      (kind === OP_SHUNT ||
        kind === OP_CONNECT ||
        kind === OP_RELEASE ||
        kind === OP_NUMBER_CHANGE) &&
      opts.hasNextSibling,
  };

  return {
    radios,
    combo1,
    edit1: { ...edit1, steppersEnabled: edit1.visible && edit1Steppers },
    edit2: { ...edit2, steppersEnabled: edit2.visible && edit2Steppers },
    operationNumbers,
    check1,
    inOutLinkCode,
    buttons,
  };
}
