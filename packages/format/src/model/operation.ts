// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 up-tri
//
// Based on OuDiaSecond (Copyright (C) 2017-2026 diagram_mania)
// and OuDia (Copyright (C) 2006-2017 take-okm)

/**
 * 前作業・後作業(判別可能ユニオン)。data-model §2.7。
 *
 * 原典の汎用スロット設計(m_bBoolData1/2, m_iIntData1/2/3, m_JikokuData1/2/3,
 * m_strOperationNumber1/2/3, m_strInOutLinkCode の意味が作業種類で変わる)を
 * 判別可能ユニオンに正規化する。フィールドは**ファイル形式(analysis §03 §6.4)に
 * 書かれるパラメータのみ**とし、運用探索が書き込む導出スロットは含めない(§2.10)。
 */

import type { Jikoku } from './basic.js';
import type { AfterJunctionType } from './enums.js';

// ---- 前作業(原典 CentDedBeforeOperation、EBOperation で種別分け)----

/**
 * 入換(EBOperation::BOperation_Shunt = 0)。
 * ファイル書式: 0/入換元番線idx$入換発時刻/[入換着時刻]$着時刻表示(0|1)
 */
export interface BOperationShunt {
  kind: 'shunt';
  shuntTrackIndex: number; // m_iIntData1: 入換元番線(当駅 ekiTrack2Cont への index)
  shuntHatsuJikoku: Jikoku; // m_JikokuData1: 入換発時刻
  shuntChakuJikoku: Jikoku; // m_JikokuData2: 入換着時刻(null = 発と同時)
  displayJikoku: boolean; // m_bBoolData1: 入換着時刻を当駅着時刻とみなして表示
}

/**
 * 増結(BOperation_Connect = 1)。相手編成の前作業列を入れ子で保持。
 * ファイル書式: 1/前方に連結(0|1)$連結時刻 + 子キー "{親パス}.{作業idx}B"
 */
export interface BOperationConnect {
  kind: 'connect';
  connectToFront: boolean; // m_bBoolData1: 増結編成を親編成の前方に連結するか
  connectJikoku: Jikoku; // m_JikokuData1: 増結時刻(null = 着時刻等から補完)
  formationBeforeOperationCont: BeforeOperation[]; // 入れ子・再帰
}

/**
 * 解結(BOperation_Release = 2)。解結編成の後作業列を入れ子で保持。
 * ファイル書式: 2/解結位置$解結両数/解結時刻 + 子キー "{親パス}.{作業idx}A"
 */
export interface BOperationRelease {
  kind: 'release';
  releasePosition: 0 | 1 | 2; // m_iIntData1: 0=後方 / 1=前方 / 2=前方以外
  releaseCount: number; // m_iIntData2: 解結編成数
  releaseJikoku: Jikoku; // m_JikokuData1: 解結時刻
  formationAfterOperationCont: AfterOperation[]; // 入れ子・再帰
}

/**
 * 出区(BOperation_Out = 3)。有効始発駅の前作業先頭のみ。
 * ファイル書式: 3/出区時刻$入出区連携コード/元運用番号(;連結)
 */
export interface BOperationOut {
  kind: 'out';
  outJikoku: Jikoku; // m_JikokuData1: 出区時刻(ダイヤグラム丸印位置)
  inOutLinkCode: string; // m_strInOutLinkCode(1.10〜。空 = 連携なし)
  operationNumbers: string[]; // m_strOperationNumber1: 連結編成 1 本につき運番 1 個
}

/**
 * 路線外始発(BOperation_Outer = 4)。
 * ファイル書式: 4/路線外始発駅idx$始発時刻/当駅着時刻$入出区連携コード/元運用番号(;連結)
 */
export interface BOperationOuter {
  kind: 'outer';
  outerTerminalIndex: number; // m_iIntData1: 当駅 outerTerminalCont への index
  outerHatsuJikoku: Jikoku; // m_JikokuData1: 路線外駅の発車時刻
  chakuJikoku: Jikoku; // m_JikokuData2: 当駅の着時刻
  inOutLinkCode: string; // m_strInOutLinkCode
  operationNumbers: string[]; // m_strOperationNumber1
}

/**
 * 前列車接続(BOperation_Junction = 5)。出区・路線外以外の先頭作業はすべてこれ。
 * ファイル書式: 5/起点時刻$仮運用番号(;連結)
 */
export interface BOperationJunction {
  kind: 'junction';
  kitenJikoku: Jikoku; // m_JikokuData1: 探索起点時刻
  kariOperationNumbers: string[]; // 仮運用番号(運用番号スロット)
}

/**
 * 運用番号変更(BOperation_NumberChange = 6)。
 * ファイル書式: 6/運用番号(;連結)。空配列 = 運用番号順反転(1.13〜)
 */
export interface BOperationNumberChange {
  kind: 'numberChange';
  operationNumbers: string[];
}

export type BeforeOperation =
  | BOperationShunt
  | BOperationConnect
  | BOperationRelease
  | BOperationOut
  | BOperationOuter
  | BOperationJunction
  | BOperationNumberChange;

// ---- 後作業(原典 CentDedAfterOperation、EAOperation)。前作業とほぼ対称 ----

/**
 * 入換(AOperation_Shunt = 0)。
 * ファイル書式: 0/入換先番線idx$入換発時刻/[入換着時刻]$発時刻表示(0|1)
 */
export interface AOperationShunt {
  kind: 'shunt';
  shuntTrackIndex: number; // m_iIntData1: 入換先番線
  shuntHatsuJikoku: Jikoku; // m_JikokuData1
  shuntChakuJikoku: Jikoku; // m_JikokuData2
  displayJikoku: boolean; // m_bBoolData1: 入換発時刻を当駅発時刻とみなして表示
}

/** 増結(AOperation_Connect = 1)。子は相手編成の前作業列(前作業の増結と同じ)。 */
export interface AOperationConnect {
  kind: 'connect';
  connectToFront: boolean;
  connectJikoku: Jikoku;
  formationBeforeOperationCont: BeforeOperation[];
}

/** 解結(AOperation_Release = 2)。 */
export interface AOperationRelease {
  kind: 'release';
  releasePosition: 0 | 1 | 2;
  releaseCount: number;
  releaseJikoku: Jikoku;
  formationAfterOperationCont: AfterOperation[];
}

/** 入区(AOperation_In = 3)。ファイル書式: 3/入区時刻$入出区連携コード */
export interface AOperationIn {
  kind: 'in';
  inJikoku: Jikoku; // m_JikokuData1: 入区時刻
  inOutLinkCode: string; // m_strInOutLinkCode
}

/**
 * 路線外終着(AOperation_Outer = 4)。
 * ファイル書式: 4/路線外終着駅idx$当駅発時刻/終着時刻$入出区連携コード
 */
export interface AOperationOuter {
  kind: 'outer';
  outerTerminalIndex: number; // m_iIntData1
  hatsuJikoku: Jikoku; // 当駅の発時刻
  outerChakuJikoku: Jikoku; // 路線外駅への終着時刻
  inOutLinkCode: string;
}

/** 次列車接続(AOperation_Junction = 5)。ファイル書式: 5/終点時刻$次列車接続タイプ(0-3) */
export interface AOperationJunction {
  kind: 'junction';
  syuutenJikoku: Jikoku; // m_JikokuData1: 探索終点時刻
  junctionType: AfterJunctionType; // m_iIntData1: 次列車接続タイプ(§5.8)
}

/** 運用番号変更(AOperation_NumberChange = 6)。空配列 = 順反転 */
export interface AOperationNumberChange {
  kind: 'numberChange';
  operationNumbers: string[];
}

export type AfterOperation =
  | AOperationShunt
  | AOperationConnect
  | AOperationRelease
  | AOperationIn
  | AOperationOuter
  | AOperationJunction
  | AOperationNumberChange;
