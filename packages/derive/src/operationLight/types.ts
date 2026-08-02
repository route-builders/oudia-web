// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 up-tri
//
// Based on OuDiaSecond (Copyright (C) 2017-2026 diagram_mania)
// and OuDia (Copyright (C) 2006-2017 take-okm)

/**
 * Light 運用探索(deriveOperationLight)の型定義(原典 CDedOperationConnecter の
 * RessyaElement / OperationElement / EBeforeAfterType の直訳)。M7b Light。
 *
 * 原典は m_contRessyaExist / m_contJunctionList を破壊的に書くが、TS では純関数として
 * 占有リストを受け渡す。原典のポインタ同一性(BeforeOperation* / AfterOperation* の ==)は
 * `OpRef`(方向 + 列車 index + 駅Order + before/after + iLevel パス)の等値比較で置換する。
 * iLevel を含めることで、同一 EkiJikoku 内の増解結入れ子の各作業まで一意化する。
 *
 * Light 出力はすべて oud2 に永続化されない派生表示情報(§2.10。原典の setJunction* 等は
 * Data2/Data3 スロットで、oud2 作業列書式 `5/...` には現れない)。よって黄金テスト非該当。
 */

import type { Ekiatsukai, Jikoku } from '@oudia-web/format';

/** 方向(0=下り / 1=上り)。 */
export type Houkou = 0 | 1;

/**
 * 作業への安定参照(原典 BeforeOperation* / AfterOperation* のポインタ同一性を id 化)。
 * iLevel はツリーパス(トップレベル作業も [contIndex] で一意。空配列ではない)。
 */
export interface OpRef {
  readonly houkou: Houkou;
  /** dia.ressyaCont[houkou] への index。 */
  readonly ressyaIndex: number;
  /** 作業が属する EkiJikoku の駅Order。 */
  readonly ekiOrder: number;
  readonly opKind: 'before' | 'after';
  /** ツリーパス(親 iLevel + 桁)。 */
  readonly iLevel: readonly number[];
}

/** 2 つの OpRef が同一作業を指すか(原典のポインタ == に相当)。 */
export function opRefEquals(a: OpRef | null, b: OpRef | null): boolean {
  if (a === null || b === null) return a === b;
  return (
    a.houkou === b.houkou &&
    a.ressyaIndex === b.ressyaIndex &&
    a.ekiOrder === b.ekiOrder &&
    a.opKind === b.opKind &&
    a.iLevel.length === b.iLevel.length &&
    a.iLevel.every((v, i) => v === b.iLevel[i])
  );
}

/** OpRef を安定な文字列キーにする(junctionResult Map のキー用)。 */
export function opRefKey(ref: OpRef): string {
  return `${String(ref.houkou)}:${String(ref.ressyaIndex)}:${String(ref.ekiOrder)}:${ref.opKind}:${ref.iLevel.join('.')}`;
}

/**
 * 占有リスト要素(原典 RessyaElement、CDedOperationConnecter.h:158-188)。
 * 着端は afterOp が有効(発端 beforeOp=null)、発端は beforeOp が有効(afterOp=null)。
 * 同時刻着発ペアが潰されると afterOp / beforeOp が null 化される(原典と同じ)。
 * shiftSecond はパターンダイヤ専用で Light では常に 0 のため型から除外する。
 */
export interface RessyaElement {
  beforeOp: OpRef | null;
  afterOp: OpRef | null;
  /** 占有時刻(原典 sRessyaProperty.getJikoku())。 */
  readonly jikoku: Jikoku;
  readonly ressyahoukou: Houkou;
  readonly ressyaIndex: number;
}

/**
 * 占有リスト occupancy[ekiIndex][trackIndex] = 起点循環ソート済みの RessyaElement 列
 * (原典 m_contRessyaExist)。原典 list を配列で表現し、insert/erase は splice で直訳する。
 */
export type Occupancy = RessyaElement[][][];

/**
 * 簡略図ツリー要素(原典 OperationElement、CDedOperationConnecter.h:191-267)。
 * 中間駅の増解結入れ子を平坦化した各作業を、iLevel パスつきで保持する。
 */
export interface OperationElementLight {
  readonly op: OpRef;
  readonly iLevel: readonly number[];
  readonly ekiOrder: number;
  /** 占有アクセス用 eki index(iEkiOrderTable 経由で解決済み)。 */
  readonly ekiIndexOfExist: number;
  readonly ressyaTrackIndex: number;
}

/**
 * 次列車接続の分類(原典 EBeforeAfterType の junction 由来 4 種、CentDedDia.h:154-191)。
 * junctionType(永続ユーザーデータ)からの恒等マップ + 隠し種別跨ぎで unrelated 降格。
 */
export type BeforeAfterType = 'unrelated' | 'classChange' | 'propertyChange' | 'propertySame';

/**
 * 次列車接続の分類(原典 EBeforeAfterType 全 7 値、CentDedDia.h:154-191)。
 * Light の 4 値 + 出入区・路線外・運番変更。★カスタマイズ時刻表の列
 * (CustomizeChainColumn)の beforeType / afterType には **'outer' が入りうる**
 * (原典 CDedOperationConnecter.cpp:5198 / :7145 の ☆1〜☆3 挿入列)ので、
 * 列側は必ずこちらの型を使う。junctionResult は 4 値のまま。
 */
export type BeforeAfterTypeFull = BeforeAfterType | 'outIn' | 'outer' | 'numberChange';

/** junction 解決結果(原典 Light が次列車の BeforeJunction へ書き込む派生スロット群)。 */
export interface JunctionResolution {
  /** 次列車が見つかって接続成立したか(原典 setJunctionSucceed)。 */
  junctionSucceed: boolean;
  /** 接続の分類(unrelated でも成立する。表示が別列車になるだけ)。 */
  beforeAfterType: BeforeAfterType;
  /** 接続先の次列車(その始発 BeforeOperation を指す)。未成立は null。 */
  nextTrain: OpRef | null;
  /** 接続時刻(原典 junctionJikoku)。 */
  junctionJikoku: Jikoku | null;
  /** 前列車の方向(方向不一致で符号反転。原典 prevRessyahoukou)。 */
  prevRessyahoukou: number;
  /** 列車情報の繰り返しを省略するか(propertySame のみ true。原典 ressyajouhouOmit)。 */
  ressyajouhouOmit: boolean;
}

/**
 * 「通常表示」を表す駅Order(原典 INT_MIN)。
 * ★-1(環状)/ -2(環状線)は**意味のある値**なので null や -1 に潰してはいけない。
 */
export const CUSTOMIZE_EKI_ORDER_NORMAL = Number.MIN_SAFE_INTEGER;

/**
 * カスタマイズ時刻表の 1 列(原典 struct CustomizeJikokuhyouContent、CentDedDia.h:347-452)。
 *
 * vector の index がそのまま時刻表の X 列番号になる。列は「縦に積む列車 index 列」に加えて、
 * 両端を路線外始発/終着**状**に見せるための表示メタを持つ(スイッチバック・環状運転・
 * 増解結でチェーンが切れる箇所を、路線外発着と同じ見た目で表現するため)。
 *
 * ★`ressyaIndexCont` が**空の列も正当**で、「路線外始発/終着専用列」を意味する
 * (CentDedDia.h:390-392)。そのとき列車情報は下の ressyabangou 等から、駅扱い・番線は
 * releaseEkiOrder / connectEkiOrder 駅の描写に使う。
 *
 * ★時刻・路線外欄が埋まるのは **enableOperation === 2(Full)だけ**。
 * Light は列の移動と併合しかせず、原典も completeCustomizeJikokuhyouContent を呼ばない。
 *
 * ★oud2 には永続化されない(読込時に運用探索で derive し直す)= 黄金テスト非該当。
 */
export interface CustomizeChainColumn {
  /** この列に縦に積む列車 index の並び。空 = 路線外始発/終着専用列。 */
  ressyaIndexCont: number[];

  // ---- 起点側の表示メタ(原典 :351-368)----
  /**
   * 起点側を「路線外始発状」に見せるときの、実際の始発駅の駅Order。
   * 既定 CUSTOMIZE_EKI_ORDER_NORMAL(= 通常表示)。**-1 = 環状 / -2 = 環状線**。
   */
  sihatsuEkiOrder: number;
  /** その始発駅がさらに路線外始発のときの路線外始発駅 index。既定 -1。 */
  outerSihatsuEkiIndex: number;
  /** 路線外始発欄に出す発車時刻。 */
  outerSihatsuJikoku: Jikoku | null;
  /** この列の**最初に表示する列車の始発駅**の着時刻。 */
  chakuJikoku: Jikoku | null;

  // ---- 終点側の表示メタ(原典 :370-386。起点側と対称)----
  syuuchakuEkiOrder: number;
  outerSyuuchakuEkiIndex: number;
  /** 路線外終着欄に出す到着時刻。 */
  outerSyuuchakuJikoku: Jikoku | null;
  /** この列の**最後に表示する列車の終着駅**の発時刻。 */
  hatsuJikoku: Jikoku | null;

  // ---- 分割 / 併合(原典 :387-389)----
  /** この列が分割(解結)された駅Order。既定 -1。 */
  releaseEkiOrder: number;
  /** この列が併合(増結)した駅Order。既定 -1。 */
  connectEkiOrder: number;

  // ---- 列車情報(ressyaIndexCont が空のときに使う)----
  ressyasyubetsuIndex: number;
  ressyabangou: string;
  ressyamei: string;
  gousuu: string;
  /** ★1 列車に複数運番がありうるので配列。 */
  operationNumber: string[];
  ekiatsukai: Ekiatsukai;
  ressyaTrackIndex: number;
  afterType: BeforeAfterTypeFull;

  // ---- Prev 系(併合される前 = 左側の列車情報)----
  prevRessyasyubetsuIndex: number;
  prevRessyabangou: string;
  prevRessyamei: string;
  prevGousuu: string;
  prevOperationNumber: string[];
  prevEkiatsukai: Ekiatsukai;
  prevRessyaTrackIndex: number;
  beforeType: BeforeAfterTypeFull;

  /** パターンダイヤプレビューの秒シフト(元列車との差)。既定 0。 */
  shiftSecond: number;
}

/** 原典 CustomizeJikokuhyouContent の既定値(CentDedDia.h:424-452)で 1 列を作る。 */
export function createCustomizeChainColumn(ressyaIndexCont: number[] = []): CustomizeChainColumn {
  return {
    ressyaIndexCont,
    sihatsuEkiOrder: CUSTOMIZE_EKI_ORDER_NORMAL,
    outerSihatsuEkiIndex: -1,
    outerSihatsuJikoku: null,
    chakuJikoku: null,
    syuuchakuEkiOrder: CUSTOMIZE_EKI_ORDER_NORMAL,
    outerSyuuchakuEkiIndex: -1,
    outerSyuuchakuJikoku: null,
    hatsuJikoku: null,
    releaseEkiOrder: -1,
    connectEkiOrder: -1,
    ressyasyubetsuIndex: -1,
    ressyabangou: '',
    ressyamei: '',
    gousuu: '',
    operationNumber: [],
    ekiatsukai: 'teisya',
    ressyaTrackIndex: 0,
    afterType: 'unrelated',
    prevRessyasyubetsuIndex: -1,
    prevRessyabangou: '',
    prevRessyamei: '',
    prevGousuu: '',
    prevOperationNumber: [],
    prevEkiatsukai: 'teisya',
    prevRessyaTrackIndex: 0,
    beforeType: 'unrelated',
    shiftSecond: 0,
  };
}

/** deriveOperationLight の出力(すべて非永続=oud2 に書き出さない)。 */
export interface OperationLightResult {
  /** 次列車接続スロット(OpRef キー)→ 解決結果。 */
  junctionResult: Map<string, JunctionResolution>;
  customizeRessyaIndexChains: {
    kudari: CustomizeChainColumn[];
    nobori: CustomizeChainColumn[];
  };
}
