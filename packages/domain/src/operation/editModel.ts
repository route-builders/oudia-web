// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 up-tri
//
// Based on OuDiaSecond (Copyright (C) 2017-2026 diagram_mania)
// and OuDia (Copyright (C) 2006-2017 take-okm)

/**
 * 作業編集の flat edit-model と、再帰 union ⇔ flat の双方向変換(原典
 * CPropEditUI_Operation の Operation / BeforeOperationFromTarget / ToTarget の直訳)。M7b。
 *
 * 正準ドメイン表現は再帰 union(`BeforeOperation`/`AfterOperation`、増解結を
 * `formationBeforeOperationCont`/`formationAfterOperationCont` で入れ子)。編集 UI は
 * それを「時系列に flat 化した `FlatOp[]` + iLevel(木構造上のパス)」に写して扱う。
 * ダイアログ OK 時に fromFlat で 1 回だけ union へ畳み、`ekiJikoku/setOperations` へ渡す。
 *
 * 原典対応:
 * - `Operation` 構造体 = CPropEditUI_Operation.h:101(iOperation 0..7 の汎用スロット)
 * - `BeforeOperationFromTarget`(cpp:265)/ `AfterOperationFromTarget`(cpp:388)= toFlat
 * - `BeforeOperationToTarget`(cpp:3388)/ `AfterOperationToTarget`(cpp:3821)= fromFlat
 *
 * iLevel の意味(h:172): 最上層(EkiJikoku 直下 Cont)は要素数 1 で Cont 内 index。増解結の
 * 子作業は [親 index, 子 index, ...] と入れ子で伸長する。リスト表示順もこの flat 順で、
 * 行頭に '1.1.1 ' のドット連結が付く。
 *
 * flat 化の順序非対称(核心): connect は「子 Cont を先に push → 自分を後に push」
 * (増結=相手編成が時系列で先に来る)、release は「自分を先に push → 子 Cont を後に push」
 * (解結=切り離した編成の後作業が後に続く)。fromFlat はこの逆写像。
 */

import type { AfterJunctionType, AfterOperation, BeforeOperation, Jikoku } from '@oudia-web/format';

/**
 * 作業種類(原典 iOperation、CPropEditUI_Operation.h:101-114)。前後(isAfter)で 3/4/5 の
 * 意味が分岐する(3=出区(前)/入区(後)、4=路線外始発(前)/終着(後)、5=前列車接続(前)/次列車接続(後))。
 * 7 は「(作業を追加)」プレースホルダ(作業が 1 つもない空リストの番兵)。
 */
export const OP_SHUNT = 0;
export const OP_CONNECT = 1;
export const OP_RELEASE = 2;
export const OP_OUT_IN = 3;
export const OP_OUTER = 4;
export const OP_JUNCTION = 5;
export const OP_NUMBER_CHANGE = 6;
export const OP_PLACEHOLDER = 7;

export type OperationEditKind = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;

/**
 * flat edit-model の 1 要素(原典 struct Operation)。iOperation の値ごとに各フィールドの
 * 意味が変わる汎用スロット設計をそのまま写す。時刻は編集中の文字列(パース前)ではなく
 * ドメインの `Jikoku`(number|null)で持ち、UI 文字列との変換はダイアログ側(PR-2)が担う。
 */
export interface FlatOp {
  /** 作業種類 iOperation。 */
  kind: OperationEditKind;
  /**
   * 設定データ(int)1(原典 iComboData1)。
   *   入換=番線 index / 増結=増結位置(0 後方 1 前方)/ 解結=解結位置種類(0/1/2)/
   *   路線外=発着駅 index / 次列車接続=接続タイプ code(0..3)。
   */
  comboData1: number;
  /**
   * 設定データ(文字列)1(原典 strEditData1)。時刻値。
   *   入換=入換発時刻 / 増結=増結時刻 / 出入区時刻 /
   *   路線外=(前)始発駅発/(後)当駅発 / 接続=起点/終点時刻。
   * 解結は時刻ではなく編成数を持つため `editData1` は使わず `releaseCount` を使う。
   */
  editData1: Jikoku;
  /** 設定データ(文字列)2(原典 strEditData2)。入換着 / 解結時刻 / 路線外の対時刻。 */
  editData2: Jikoku;
  /** 解結の編成数(原典 strEditData1 を stoi。解結のみ有効)。 */
  releaseCount: number;
  /** 設定データ(bool)1(原典 bCheckData1)。入換=着/発を当駅時刻扱い / 運番変更=順反転。 */
  check1: boolean;
  /** 運用番号(原典 strOperationNumber)。出区・路線外始発・前列車接続・運番変更。 */
  operationNumbers: string[];
  /** 入出区連携コード(原典 strInOutLinkCode)。出入区・路線外。 */
  inOutLinkCode: string;
  /** 木構造上のパス(原典 iLevel)。最上層は [Cont 内 index]。増解結の子で伸長。 */
  level: number[];
}

/** AfterJunctionType(enum)→ code(0..3)。format の junctionTypeToCode と同一。 */
function junctionTypeToCode(t: AfterJunctionType): number {
  return t === 'classChange' ? 1 : t === 'propertyChange' ? 2 : t === 'propertySame' ? 3 : 0;
}
/** code(0..3)→ AfterJunctionType(enum)。 */
function codeToJunctionType(code: number): AfterJunctionType {
  return code === 1
    ? 'classChange'
    : code === 2
      ? 'propertyChange'
      : code === 3
        ? 'propertySame'
        : 'unrelated';
}

/** 既定の空 FlatOp(全フィールド初期値。原典 Operation() コンストラクタ)。 */
function emptyFlatOp(kind: OperationEditKind, level: number[]): FlatOp {
  return {
    kind,
    comboData1: 0,
    editData1: null,
    editData2: null,
    releaseCount: 0,
    check1: false,
    operationNumbers: [],
    inOutLinkCode: '',
    level,
  };
}

// ---- toFlat: 再帰 union → flat(原典 BeforeOperationFromTarget / AfterOperationFromTarget)----

/**
 * 前作業列を flat 化する(原典 BeforeOperationFromTarget、cpp:265-386)。
 * @param cont     前作業列(再帰 union)
 * @param baseLevel 呼び出し元 iLevel(トップは [])。各要素は baseLevel + [Cont 内 index]。
 */
export function toFlatBefore(cont: readonly BeforeOperation[], baseLevel: number[] = []): FlatOp[] {
  const out: FlatOp[] = [];
  cont.forEach((op, idx) => {
    const level = [...baseLevel, idx];
    switch (op.kind) {
      case 'shunt':
        out.push({
          ...emptyFlatOp(OP_SHUNT, level),
          comboData1: op.shuntTrackIndex,
          editData1: op.shuntHatsuJikoku,
          editData2: op.shuntChakuJikoku,
          check1: op.displayJikoku,
        });
        break;
      case 'connect': {
        // 増結: 子(前作業)を先に push → 自分を後に push。
        out.push(...toFlatBefore(op.formationBeforeOperationCont, level));
        out.push({
          ...emptyFlatOp(OP_CONNECT, level),
          comboData1: op.connectToFront ? 1 : 0,
          editData1: op.connectJikoku,
        });
        break;
      }
      case 'release': {
        // 解結: 自分を先に push → 子(後作業)を後に push。
        out.push({
          ...emptyFlatOp(OP_RELEASE, level),
          comboData1: op.releasePosition,
          releaseCount: op.releaseCount,
          editData2: op.releaseJikoku,
        });
        out.push(...toFlatAfter(op.formationAfterOperationCont, level));
        break;
      }
      case 'out':
        out.push({
          ...emptyFlatOp(OP_OUT_IN, level),
          editData1: op.outJikoku,
          operationNumbers: [...op.operationNumbers],
          inOutLinkCode: op.inOutLinkCode,
        });
        break;
      case 'outer':
        out.push({
          ...emptyFlatOp(OP_OUTER, level),
          comboData1: op.outerTerminalIndex,
          editData1: op.outerHatsuJikoku,
          editData2: op.chakuJikoku,
          operationNumbers: [...op.operationNumbers],
          inOutLinkCode: op.inOutLinkCode,
        });
        break;
      case 'junction':
        out.push({
          ...emptyFlatOp(OP_JUNCTION, level),
          editData1: op.kitenJikoku,
          operationNumbers: [...op.kariOperationNumbers],
        });
        break;
      case 'numberChange':
        out.push({
          ...emptyFlatOp(OP_NUMBER_CHANGE, level),
          operationNumbers: [...op.operationNumbers],
          check1: op.operationNumbers.length === 0, // 空配列 = 順反転(1.13〜)
        });
        break;
    }
  });
  return out;
}

/**
 * 後作業列を flat 化する(原典 AfterOperationFromTarget、cpp:388-505)。前作業との非対称:
 * shunt.check1=発時刻表示 / in=inOutLinkCode のみ / outer=発着の意味入替 /
 * junction=comboData1=接続タイプ・operationNumbers なし。
 */
export function toFlatAfter(cont: readonly AfterOperation[], baseLevel: number[] = []): FlatOp[] {
  const out: FlatOp[] = [];
  cont.forEach((op, idx) => {
    const level = [...baseLevel, idx];
    switch (op.kind) {
      case 'shunt':
        out.push({
          ...emptyFlatOp(OP_SHUNT, level),
          comboData1: op.shuntTrackIndex,
          editData1: op.shuntHatsuJikoku,
          editData2: op.shuntChakuJikoku,
          check1: op.displayJikoku,
        });
        break;
      case 'connect': {
        // 後作業の増結の子も前作業列(前作業と同じ非対称)。
        out.push(...toFlatBefore(op.formationBeforeOperationCont, level));
        out.push({
          ...emptyFlatOp(OP_CONNECT, level),
          comboData1: op.connectToFront ? 1 : 0,
          editData1: op.connectJikoku,
        });
        break;
      }
      case 'release': {
        out.push({
          ...emptyFlatOp(OP_RELEASE, level),
          comboData1: op.releasePosition,
          releaseCount: op.releaseCount,
          editData2: op.releaseJikoku,
        });
        out.push(...toFlatAfter(op.formationAfterOperationCont, level));
        break;
      }
      case 'in':
        out.push({
          ...emptyFlatOp(OP_OUT_IN, level),
          editData1: op.inJikoku,
          inOutLinkCode: op.inOutLinkCode,
        });
        break;
      case 'outer':
        out.push({
          ...emptyFlatOp(OP_OUTER, level),
          comboData1: op.outerTerminalIndex,
          editData1: op.hatsuJikoku,
          editData2: op.outerChakuJikoku,
          inOutLinkCode: op.inOutLinkCode,
        });
        break;
      case 'junction':
        out.push({
          ...emptyFlatOp(OP_JUNCTION, level),
          comboData1: junctionTypeToCode(op.junctionType),
          editData1: op.syuutenJikoku,
        });
        break;
      case 'numberChange':
        out.push({
          ...emptyFlatOp(OP_NUMBER_CHANGE, level),
          operationNumbers: [...op.operationNumbers],
          check1: op.operationNumbers.length === 0,
        });
        break;
    }
  });
  return out;
}

/**
 * 前後どちらも空のとき、プレースホルダ 1 件を返す(原典 UiDataFromTarget、cpp:507-567)。
 * iOperation=7, iLevel={0}。
 */
export function placeholderFlat(): FlatOp[] {
  return [emptyFlatOp(OP_PLACEHOLDER, [0])];
}

// ---- fromFlat: flat → 再帰 union(原典 BeforeOperationToTarget / AfterOperationToTarget)----

/**
 * トップレベル(level.length===1)の要素だけ抽出し、level[0](= Cont 内 index)昇順にソートする。
 * 原典は set/insert を level.front() で行い末尾余剰を erase して index を詰める(cpp:3388)。
 * TS では level.front() でソートし、それを Cont 順として使う。
 */
function topLevelSorted(flat: readonly FlatOp[]): FlatOp[] {
  return flat
    .filter((op) => op.level.length === 1)
    .sort((a, b) => (a.level[0] ?? 0) - (b.level[0] ?? 0));
}

/**
 * 親 op(level.length===parentDepth)の子群を抽出し、各行の level から先頭 1 桁を除いて
 * 1 段浅くする(原典: level.front() が親一致 かつ 自分以外を集め front を erase して再帰)。
 * @param flat        親と同じ列に並ぶ全 flat(親の level を prefix に持つ子を含む)
 * @param parentLevel 親の level(例 [1] や [1,1])
 */
function childrenOf(flat: readonly FlatOp[], parentLevel: number[]): FlatOp[] {
  const d = parentLevel.length;
  return flat
    .filter((op) => {
      if (op.level.length <= d) return false; // 親自身・兄弟は除外
      for (let i = 0; i < d; i++) {
        if (op.level[i] !== parentLevel[i]) return false;
      }
      return true;
    })
    .map((op) => ({ ...op, level: op.level.slice(1) }));
}

/** 前作業 flat → 再帰 union(原典 BeforeOperationToTarget、cpp:3388-3550)。 */
export function fromFlatBefore(flat: readonly FlatOp[]): BeforeOperation[] {
  const out: BeforeOperation[] = [];
  for (const op of topLevelSorted(flat)) {
    if (op.kind === OP_PLACEHOLDER) continue; // 番兵は捨てる
    const parentLevel = op.level; // トップは [idx]
    switch (op.kind) {
      case OP_SHUNT:
        out.push({
          kind: 'shunt',
          shuntTrackIndex: op.comboData1,
          shuntHatsuJikoku: op.editData1,
          shuntChakuJikoku: op.editData2,
          displayJikoku: op.check1,
        });
        break;
      case OP_CONNECT:
        out.push({
          kind: 'connect',
          connectToFront: op.comboData1 === 1,
          connectJikoku: op.editData1,
          // 増結の子は前作業列。level を 1 段浅くして再帰。
          formationBeforeOperationCont: fromFlatBefore(childrenOf(flat, parentLevel)),
        });
        break;
      case OP_RELEASE:
        out.push({
          kind: 'release',
          releasePosition: (op.comboData1 === 1 ? 1 : op.comboData1 === 2 ? 2 : 0) as 0 | 1 | 2,
          releaseCount: op.releaseCount,
          releaseJikoku: op.editData2,
          // 解結の子は後作業列。
          formationAfterOperationCont: fromFlatAfter(childrenOf(flat, parentLevel)),
        });
        break;
      case OP_OUT_IN:
        out.push({
          kind: 'out',
          outJikoku: op.editData1,
          inOutLinkCode: op.inOutLinkCode,
          operationNumbers: [...op.operationNumbers],
        });
        break;
      case OP_OUTER:
        out.push({
          kind: 'outer',
          outerTerminalIndex: op.comboData1,
          outerHatsuJikoku: op.editData1,
          chakuJikoku: op.editData2,
          inOutLinkCode: op.inOutLinkCode,
          operationNumbers: [...op.operationNumbers],
        });
        break;
      case OP_JUNCTION:
        out.push({
          kind: 'junction',
          kitenJikoku: op.editData1,
          kariOperationNumbers: [...op.operationNumbers],
        });
        break;
      case OP_NUMBER_CHANGE:
        out.push({
          kind: 'numberChange',
          // check1(反転)true なら運番を空配列に(原典 cpp:3388 の反転規則)。
          operationNumbers: op.check1 ? [] : [...op.operationNumbers],
        });
        break;
    }
  }
  return out;
}

/** 後作業 flat → 再帰 union(原典 AfterOperationToTarget、cpp:3821)。 */
export function fromFlatAfter(flat: readonly FlatOp[]): AfterOperation[] {
  const out: AfterOperation[] = [];
  for (const op of topLevelSorted(flat)) {
    if (op.kind === OP_PLACEHOLDER) continue;
    const parentLevel = op.level;
    switch (op.kind) {
      case OP_SHUNT:
        out.push({
          kind: 'shunt',
          shuntTrackIndex: op.comboData1,
          shuntHatsuJikoku: op.editData1,
          shuntChakuJikoku: op.editData2,
          displayJikoku: op.check1,
        });
        break;
      case OP_CONNECT:
        out.push({
          kind: 'connect',
          connectToFront: op.comboData1 === 1,
          connectJikoku: op.editData1,
          // 後作業の増結の子も前作業列。
          formationBeforeOperationCont: fromFlatBefore(childrenOf(flat, parentLevel)),
        });
        break;
      case OP_RELEASE:
        out.push({
          kind: 'release',
          releasePosition: (op.comboData1 === 1 ? 1 : op.comboData1 === 2 ? 2 : 0) as 0 | 1 | 2,
          releaseCount: op.releaseCount,
          releaseJikoku: op.editData2,
          formationAfterOperationCont: fromFlatAfter(childrenOf(flat, parentLevel)),
        });
        break;
      case OP_OUT_IN:
        out.push({
          kind: 'in',
          inJikoku: op.editData1,
          inOutLinkCode: op.inOutLinkCode,
        });
        break;
      case OP_OUTER:
        out.push({
          kind: 'outer',
          outerTerminalIndex: op.comboData1,
          hatsuJikoku: op.editData1,
          outerChakuJikoku: op.editData2,
          inOutLinkCode: op.inOutLinkCode,
        });
        break;
      case OP_JUNCTION:
        out.push({
          kind: 'junction',
          syuutenJikoku: op.editData1,
          junctionType: codeToJunctionType(op.comboData1),
        });
        break;
      case OP_NUMBER_CHANGE:
        out.push({
          kind: 'numberChange',
          operationNumbers: op.check1 ? [] : [...op.operationNumbers],
        });
        break;
    }
  }
  return out;
}
