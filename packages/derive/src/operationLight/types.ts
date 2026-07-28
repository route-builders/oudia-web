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

import type { Jikoku } from '@oudia-web/format';

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
 * カスタマイズ時刻表チェーン列(原典 CustomizeJikokuhyouContent の第一段、CentDedDia.h:347-423)。
 * 縦に積む列車 index 列と、増結/解結の描写駅Order。#11 チェーングリッドへ供給する。
 */
export interface CustomizeChainColumn {
  ressyaIndexCont: number[];
  connectEkiOrder: number;
  releaseEkiOrder: number;
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
