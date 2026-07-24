// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 up-tri
//
// Based on OuDiaSecond (Copyright (C) 2017-2026 diagram_mania)
// and OuDia (Copyright (C) 2006-2017 take-okm)

/**
 * Full 運用探索(deriveOperationFull)の型定義(原典 operationConnect の運番割付・運用表・
 * 入出区連携の直訳)。M7c。
 *
 * Light の型(OpRef / RessyaElement / Occupancy / OperationElementLight / CustomizeChainColumn /
 * JunctionResolution)を共有し、Full 専用に運番スロット・運用表・入出区連携を追加する。
 *
 * ★Full 出力(割付済み運番・運用表・入出区連携一覧)はすべて oud2 に永続化されない派生表示情報。
 * oud2 に書かれる運番は #1(getOperationNumberOriginal = ユーザー編集の永続運番)のみで、
 * Full が計算する #2/#3(Main/Sub/Assigned)や運用表 Map は毎探索で作り直される(§2.10)。
 * よって Full 出力は黄金テスト(バイト一致)非該当。#1 は seed の入力として消費するだけで書き戻さない。
 */

import type { Jikoku } from '@oudia-web/format';
import type {
  CustomizeChainColumn,
  Houkou,
  JunctionResolution,
  OperationElementLight,
  OpRef,
} from '../operationLight/types.js';

/**
 * 運番スロット(原典 CentDedBeforeOperation の m_strOperationNumber1/2/3 + m_bBoolData2)。
 * OpRef / RessyaElement には足さず、opRefKey → slots の別 Map で持つ(占有格子は Light と共有)。
 */
export interface OperationNumberSlots {
  /** #1 Original(ユーザー入力の永続運番 = seed の種。書き戻さない)。 */
  n1: string[];
  /** #2 Main / AssignedByLinkCode / Junction / NumberChange 割付(派生)。 */
  n2: string[];
  /** #3 Sub / 折返し反転済み(派生)。 */
  n3: string[];
  /** 原典 m_bBoolData2。増結の Sub 到着同期フラグ(WaitList 収束に使う)。 */
  subAssigned: boolean;
}

/** opRefKey → 運番スロット。 */
export type OperationNumberMap = Map<string, OperationNumberSlots>;

/**
 * 次列車接続の分類(原典 EBeforeAfterType 全 7 値、CentDedDia.h:154-191)。
 * Light の 4 値(unrelated/classChange/propertyChange/propertySame)+ 出入区・路線外・運番変更。
 */
export type BeforeAfterTypeFull =
  | 'unrelated'
  | 'classChange'
  | 'propertyChange'
  | 'propertySame'
  | 'outIn'
  | 'outer'
  | 'numberChange';

/** 列車プロパティ参照(原典 CdDedRessyaProperty。方向 + 列車 index + 出区/始発着時刻)。 */
export interface RessyaPropertyRef {
  readonly houkou: Houkou;
  readonly ressyaIndex: number;
  /** 出区/始発着時刻(isEqualTo(...,false) では無視される)。 */
  readonly jikoku: Jikoku | null;
}

/** 運用表エントリ(原典 OperationTableContent、CentDedDia.h:218-346)。 */
export interface OperationTableEntry {
  ressyaProperty: RessyaPropertyRef;
  sihatsuEkiOrder: number;
  beforeType: BeforeAfterTypeFull;
  /** INT_MIN → null。 */
  outerSihatsuEkiIndex: number | null;
  outerSihatsuJikoku: Jikoku | null;
  chakuJikoku: Jikoku | null;
  syuuchakuEkiOrder: number;
  afterType: BeforeAfterTypeFull;
  outerSyuuchakuEkiIndex: number | null;
  hatsuJikoku: Jikoku | null;
  outerSyuuchakuJikoku: Jikoku | null;
  /** 挿入位置決定に使う後作業参照(原典 const CentDedAfterOperation*)。 */
  afterOperation: OpRef | null;
}

/** 入出区連携一覧エントリ(原典 InOutLinkCodeContent、CentDedDia.h:595-634)。 */
export interface InOutLinkCodeEntry {
  inRessyaProperties: RessyaPropertyRef[];
  outRessyaProperties: RessyaPropertyRef[];
  /** iStatus(0/1/2/3)。有効ペアは 2 のみ。 */
  status: 0 | 1 | 2 | 3;
  /** 出区 1 本時の後作業参照。status!=2 で null 化されるケースあり。 */
  beforeOperation: OpRef | null;
  operationNumbers: string[];
}

/**
 * 増結の Sub 未着で待避するキュー要素(原典 m_contConnectWaitList の RessyaElement 相当)。
 * WaitList retry(収束ループ)で再試行する。
 */
export interface ConnectWaitItem {
  /** 待避対象の増結作業。 */
  readonly ref: OpRef;
  readonly ressyaProperty: RessyaPropertyRef;
  /** その列車の作業列(再帰対象)。 */
  readonly contElements: readonly OperationElementLight[];
  readonly iLevelSearch: number[];
  readonly strOperationNumber: string[];
}

/** deriveOperationFull の出力(すべて非永続 = 黄金テスト非該当)。 */
export interface OperationFullResult {
  /** 次列車接続の表示解決(Light と同型)。 */
  junctionResult: Map<string, JunctionResolution>;
  customizeRessyaIndexChains: { kudari: CustomizeChainColumn[]; nobori: CustomizeChainColumn[] };
  /** 運用表(原典 m_contOperationTableContent)。key = 運番 / 値 = 時刻順エントリ列。 */
  operationTable: Map<string, OperationTableEntry[]>;
  /** opRefKey → 各作業の最終割付運番(#2/#3)。 */
  assignedNumbers: Map<string, string[]>;
  /** 入出区連携一覧(key = 連携コード)。 */
  inOutLinkCodes: Map<string, InOutLinkCodeEntry>;
}
