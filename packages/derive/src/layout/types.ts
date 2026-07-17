// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 oudia-second-web contributors
//
// Based on OuDiaSecond (Copyright (C) 2017-2026 diagram_mania)
// and OuDia (Copyright (C) 2006-2017 take-okm)

/**
 * ダイヤグラム座標(Dgr 座標)の型(原典 entDgr 名前空間。analysis §05 §2)。
 *
 * Dgr 座標はデバイス非依存。X = 午前 0 時からの経過秒(86400 超・負も可)。
 * Y の単位も「秒」で、駅間の縦幅は実キロではなく「駅間最小所要秒数」を使う。
 * デバイス座標(ピクセル)への線形変換は render 層の責務。
 */

import type { Ressyahoukou } from '@oudia/format';

/** 駅 1 つの Y レイアウト(原典 CentDedDgrEki の Y 座標群。analysis §05 §2.2)。 */
export interface EkiLayout {
  /** 駅Index(下り基準。0 = 下り起点)。 */
  readonly ekiIndex: number;
  /** 駅名(表示用)。 */
  readonly ekimei: string;
  /** 主要駅か(横罫線を太線で描く。原典 m_bIsSyuyoueki)。 */
  readonly isSyuyou: boolean;
  /**
   * 起点側 Y 座標(原典 getDgrYPosOfEkiOrg)。在線表表示駅では駅表示空間の起点側、
   * なければ Ter と同値。列車線の**終点**(着)側で使う。
   */
  readonly dgrYOrg: number;
  /**
   * 終点側 Y 座標(原典 getDgrYPosOfEkiTer)。列車線の**起点**(発)側で使う。
   */
  readonly dgrYTer: number;
}

/** ダイヤ全体の Y レイアウトと全体 Zone。 */
export interface DiaLayoutFrame {
  /** 駅Index 順の駅レイアウト。 */
  readonly ekiLayouts: readonly EkiLayout[];
  /** X 軸左端 = ダイヤグラム起点時刻(秒)。原典 m_iDgrXPosMin。 */
  readonly dgrXPosMin: number;
  /** X 軸サイズ = 常に 86400 秒。 */
  readonly dgrXSize: number;
  /** Y 軸全体サイズ(上端 0 から終点駅 + 下余白まで)。原典 getZone の Y サイズ。 */
  readonly dgrYSize: number;
}

/** 列車線の 1 直線区間(原典 CentDedDgrRessyasen + 描画時端点座標。analysis §05 §4)。 */
export interface Ressyasen {
  /** 起点駅Order(方向基準)。 */
  readonly kitenEkiOrder: number;
  /** 終点駅Order(方向基準)。 */
  readonly syuutenEkiOrder: number;
  /** 起点 X(発 X。なければ着 X)。Dgr 秒。 */
  readonly kitenDgrX: number;
  /** 終点 X(着 X。なければ発 X)。Dgr 秒。 */
  readonly syuutenDgrX: number;
}

/** 1 列車ぶんのレイアウト(折れ線の列 + メタ)。 */
export interface RessyaLayout {
  readonly houkou: Ressyahoukou;
  readonly syubetsuIndex: number;
  readonly ressyabangou: string;
  readonly ressyamei: string;
  readonly gousuu: string;
  /** 0 本以上の直線区間(経由なし区間で切れる)。 */
  readonly ressyasenCont: readonly Ressyasen[];
  /** 全列車線を含む X 範囲 [min, max](Dgr 秒)。空なら null。 */
  readonly dgrXZone: readonly [number, number] | null;
  /** 各駅の列車情報ラベルを描くべきか(駅Order 添字。原典 m_bShouldRessyajouhouDraw)。 */
  readonly shouldRessyajouhouDraw: readonly boolean[];
}

/** ダイヤグラム全体のレイアウト結果。 */
export interface DiagramLayout {
  readonly frame: DiaLayoutFrame;
  /** [0] = 下り、[1] = 上り。 */
  readonly ressyaLayouts: readonly [readonly RessyaLayout[], readonly RessyaLayout[]];
}
