// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 up-tri
//
// Based on OuDiaSecond (Copyright (C) 2017-2026 diagram_mania)
// and OuDia (Copyright (C) 2006-2017 take-okm)

/**
 * カスタマイズ時刻表の行(Y列)ディスクリプタ生成(原典 CdYColSpecCont::scan の
 * `bCustomizeDisplayMode == true` 経路、ViewJikokuhyou/JikokuhyouColSpec/CdYColSpecCont.cpp:192-540)。
 * follow-up #11。
 *
 * 通常時刻表(colSpec.ts)との差分:
 * - **消える**: 始発駅作業 / 終着駅作業 / 路線外始発・終着(トップレベル)/ 駅ごとの前後作業行
 * - **増える**: EkiPrev\*(その駅に到着してくる前列車の情報)/ EkiOuter_Shihatsu1,2 /
 *   入線時刻 / Eki\*(その駅から出て行く列車の情報)/ EkiOuter_Shuchaku1,2
 * - 始発駅名 / 終着駅名は `displayShihatsuShuchakuEkimei` のときだけ出る(通常は無条件)
 *
 * ★**述語が通常版と違う**。着発は駅の個別設定 `jikokuhyouJikokuDisplay{Kudari,Nobori}` を、
 * 番線は `jikokuhyouTrackDisplay{Kudari,Nobori}` **単独**を見る(通常版の
 * `getChakujikokuHyouji()`(駅時刻形式由来)や `!jikokuhyouTrackOmit` は使わない)。
 * 既存 `csv/ekiDisplay.ts` の関数をそのまま流用すると誤りになる。
 *
 * ★**1 駅ブロック内の順序**(原典 :296-523):
 * EkiPrev\*(番号 → 運番×n → 種別 → 列車名 → 号数 → 号)→ EkiOuter_Shihatsu1,2 →
 * **着 → 入線 → 番線** → Eki\*(同順)→ **発** → EkiOuter_Shuchaku1,2。
 * 入線行は着行の**後**。
 *
 * ★各行には `side` を持たせる。セル充填時の列車切替が
 * **着側は `駅Order > 現在列車の終着駅Order`、発側は `>=`** という非対称になっているため
 * (原典 CCellBuilderCustomize.cpp:4095 ほか vs :4396 ほか)。切替駅では駅ブロックの
 * **着半分を前列車・発半分を次列車**が担当する。番線は着側扱い。
 */

import type { Eki, Ressyahoukou } from '@oudia-web/format';

/** カスタマイズ時刻表の行種別。 */
export type CustomizeRowType =
  // ---- 列ヘッダ(駅に紐づかない。切替しない = 常にチェーン先頭列車)----
  | 'ressyabangou'
  | 'operationNumber'
  | 'ressyasyubetsu'
  | 'ressyamei'
  | 'gousuu'
  | 'gou'
  | 'shihatsuEkimei'
  | 'shuchakuEkimei'
  // ---- 駅ブロック(着側)----
  | 'ekiPrevRessyabangou'
  | 'ekiPrevOperationNumber'
  | 'ekiPrevRessyasyubetsu'
  | 'ekiPrevRessyamei'
  | 'ekiPrevGousuu'
  | 'ekiPrevGou'
  | 'ekiOuterShihatsu1'
  | 'ekiOuterShihatsu2'
  | 'chaku'
  | 'nyuusen'
  | 'track'
  // ---- 駅ブロック(発側)----
  | 'ekiRessyabangou'
  | 'ekiOperationNumber'
  | 'ekiRessyasyubetsu'
  | 'ekiRessyamei'
  | 'ekiGousuu'
  | 'ekiGou'
  | 'hatsu'
  | 'ekiOuterShuchaku1'
  | 'ekiOuterShuchaku2'
  // ---- 末尾 ----
  | 'bikou';

/**
 * セル充填時の列車切替の側。
 * - `'arrival'`: 駅Order **>** 現在列車の終着駅Order で次列車へ(切替駅は前列車が担当)
 * - `'departure'`: 駅Order **>=** で次列車へ(切替駅は次列車が担当)
 * - `null`: 切替しない(常にチェーン先頭列車。ヘッダ群と備考)
 */
export type CustomizeRowSide = 'arrival' | 'departure' | null;

export interface CustomizeRowSpec {
  readonly type: CustomizeRowType;
  /** 駅ブロックの行のみ駅Order。ヘッダ・備考は null。 */
  readonly ekiOrder: number | null;
  /** 運用番号の段 index(0..rows-1)。他は 0。 */
  readonly operationIndex: number;
  readonly side: CustomizeRowSide;
}

export interface CustomizeRowOptions {
  /** DispProp.displayRessyamei。 */
  readonly displayRessyamei: boolean;
  /** Rosen.enableOperation(0=無効 / 1=簡易 / 2=通常)。 */
  readonly enableOperation: number;
  /** DispProp.operationNumberRows(1..5)。列ヘッダの運番段数。 */
  readonly operationNumberRows: number;
  /** [始発駅名・終着駅名を表示](カスタマイズ時刻表のビュー設定)。 */
  readonly displayShihatsuShuchakuEkimei: boolean;
}

/** 方向別の着時刻表示(原典 getJikokuhyouChakuJikokuDisplay(houkou))。 */
function chakuDisplay(eki: Eki, houkou: Ressyahoukou): boolean {
  return houkou === 1
    ? eki.jikokuhyouJikokuDisplayNobori.chaku
    : eki.jikokuhyouJikokuDisplayKudari.chaku;
}
/** 方向別の発時刻表示。 */
function hatsuDisplay(eki: Eki, houkou: Ressyahoukou): boolean {
  return houkou === 1
    ? eki.jikokuhyouJikokuDisplayNobori.hatsu
    : eki.jikokuhyouJikokuDisplayKudari.hatsu;
}
/** 方向別の番線表示(★カスタマイズでは jikokuhyouTrackOmit を見ない)。 */
function trackDisplay(eki: Eki, houkou: Ressyahoukou): boolean {
  return houkou === 1 ? eki.jikokuhyouTrackDisplayNobori : eki.jikokuhyouTrackDisplayKudari;
}
/** 方向別の入線時刻表示。 */
function nyuusenDisplay(eki: Eki, houkou: Ressyahoukou): boolean {
  return houkou === 1
    ? eki.jikokuhyouNyuusenJikokuDisplayNobori
    : eki.jikokuhyouNyuusenJikokuDisplayKudari;
}
/** 方向別の路線外始発/終着欄表示。 */
function outerDisplay(eki: Eki, houkou: Ressyahoukou): { origin: boolean; terminal: boolean } {
  return houkou === 1 ? eki.jikokuhyouOuterDisplayNobori : eki.jikokuhyouOuterDisplayKudari;
}
/** 自列車の情報欄設定(原典 getJikokuhyou*Display)。 */
function ekiInfo(eki: Eki, houkou: Ressyahoukou) {
  return houkou === 1
    ? eki.jikokuhyouSyubetsuChangeDisplayNobori
    : eki.jikokuhyouSyubetsuChangeDisplayKudari;
}
/** 前列車の情報欄設定(原典 getJikokuhyouPrev*Display)。 */
function prevInfo(eki: Eki, houkou: Ressyahoukou) {
  return houkou === 1
    ? eki.jikokuhyouPrevSyubetsuChangeDisplayNobori
    : eki.jikokuhyouPrevSyubetsuChangeDisplayKudari;
}

/**
 * カスタマイズ時刻表の行スペックを構築する(原典 CdYColSpecCont::scan、:192-540)。
 */
export function buildCustomizeRowSpec(
  ekiCont: readonly Eki[],
  houkou: Ressyahoukou,
  opts: CustomizeRowOptions,
): CustomizeRowSpec[] {
  const rows: CustomizeRowSpec[] = [];
  const push = (
    type: CustomizeRowType,
    ekiOrder: number | null,
    side: CustomizeRowSide,
    operationIndex = 0,
  ): void => {
    rows.push({ type, ekiOrder, operationIndex, side });
  };
  const opRows = Math.min(5, Math.max(1, opts.operationNumberRows));

  // ---- 列ヘッダ(:208-260)。切替しない = 常にチェーン先頭列車 ----
  push('ressyabangou', null, null);
  for (let i = 0; i < opRows && opts.enableOperation > 1; i++) {
    push('operationNumber', null, null, i);
  }
  push('ressyasyubetsu', null, null);
  if (opts.displayRessyamei) {
    push('ressyamei', null, null);
    push('gousuu', null, null);
    push('gou', null, null);
  }
  // ★カスタマイズでは 始発/終着駅名は設定次第(通常時刻表は無条件)。
  if (opts.displayShihatsuShuchakuEkimei) push('shihatsuEkimei', null, null);
  if (opts.displayShihatsuShuchakuEkimei) push('shuchakuEkimei', null, null);

  // ---- 駅ブロック(:290-525)----
  const ekiCount = ekiCont.length;
  for (let ekiOrder = 0; ekiOrder < ekiCount; ekiOrder++) {
    const ekiIndex = houkou === 0 ? ekiOrder : ekiCount - 1 - ekiOrder;
    const eki = ekiCont[ekiIndex];
    if (eki === undefined) continue;

    // 前列車情報欄(★enableOperation > 1 のときだけ。:296-323)。
    if (opts.enableOperation > 1) {
      const prev = prevInfo(eki, houkou);
      if (prev.ressyabangou >= 1) push('ekiPrevRessyabangou', ekiOrder, 'arrival');
      for (let i = 0; i < prev.operationNumberRows && prev.operationNumber >= 1; i++) {
        push('ekiPrevOperationNumber', ekiOrder, 'arrival', i);
      }
      if (prev.syubetsu >= 1) push('ekiPrevRessyasyubetsu', ekiOrder, 'arrival');
      if (prev.ressyamei >= 1) {
        push('ekiPrevRessyamei', ekiOrder, 'arrival');
        push('ekiPrevGousuu', ekiOrder, 'arrival');
        push('ekiPrevGou', ekiOrder, 'arrival');
      }
    }
    // 路線外・前列車始発駅欄(:325-332)。
    if (outerDisplay(eki, houkou).origin) {
      push('ekiOuterShihatsu1', ekiOrder, 'arrival');
      push('ekiOuterShihatsu2', ekiOrder, 'arrival');
    }
    // 着時刻(★駅の個別設定。[全時刻を表示] は効かない。:334-352)。
    if (chakuDisplay(eki, houkou)) push('chaku', ekiOrder, 'arrival');
    // 入線時刻(★着行の**後**。enableOperation > 0。:354-362)。
    if (opts.enableOperation > 0 && nyuusenDisplay(eki, houkou)) {
      push('nyuusen', ekiOrder, 'arrival');
    }
    // 番線(★カスタマイズでは TrackDisplay 単独。:412-419)。
    if (trackDisplay(eki, houkou)) push('track', ekiOrder, 'arrival');

    // 自列車の情報欄(:470-497)。ここから発側。
    const info = ekiInfo(eki, houkou);
    if (info.ressyabangou >= 1) push('ekiRessyabangou', ekiOrder, 'departure');
    for (
      let i = 0;
      i < info.operationNumberRows && opts.enableOperation > 1 && info.operationNumber >= 1;
      i++
    ) {
      push('ekiOperationNumber', ekiOrder, 'departure', i);
    }
    if (info.syubetsu >= 1) push('ekiRessyasyubetsu', ekiOrder, 'departure');
    if (info.ressyamei >= 1) {
      push('ekiRessyamei', ekiOrder, 'departure');
      push('ekiGousuu', ekiOrder, 'departure');
      push('ekiGou', ekiOrder, 'departure');
    }
    // 発時刻(:499-517)。
    if (hatsuDisplay(eki, houkou)) push('hatsu', ekiOrder, 'departure');
    // 路線外・次列車終着駅欄(:518-523)。
    if (outerDisplay(eki, houkou).terminal) {
      push('ekiOuterShuchaku1', ekiOrder, 'departure');
      push('ekiOuterShuchaku2', ekiOrder, 'departure');
    }
  }

  push('bikou', null, null);
  return rows;
}
