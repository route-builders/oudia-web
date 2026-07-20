// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 up-tri
//
// Based on OuDiaSecond (Copyright (C) 2017-2026 diagram_mania)
// and OuDia (Copyright (C) 2006-2017 take-okm)

/**
 * 駅ビュー表示設定モードの一括サイクル(原典 CWndDcdGridEki::OnEkiSettingNext/Prev_Process、
 * CWndDcdGridEki.cpp:3935/4735 の直訳)。M6。
 *
 * カスタマイズ時刻表の駅ごと表示設定(下り/上り各 16 項目)を、選択駅すべてに対して
 * 順送り/逆送りする。運用番号系(OperationNumberDisplay/Rows)は M7 で表示されるが
 * 設定自体は round-trip するため本コマンドでも操作対象に含める(原典どおり)。
 *
 * サイクル規則(原典):
 * - bool トグル(TrackDisplay / Nyuusen): !current
 * - HatsuJikokuDisplay: 着 → 着発 → 発 の 3 状態(chaku/hatsu の組で表現)
 * - 0..3 サイクル(Ressyabangou / RessyaSyubetsu / Ressyamei / Prev*): >=3 → 0 else +1
 * - 0..4 サイクル(OperationNumberDisplay / Prev): >=4 → 0 else +1
 * - Rows サイクル(1..5): OperationNumberDisplay>0 のときのみ、>=5 → 1 else +1
 */

import type { Eki, Ressyahoukou } from '@oudia-web/format';
import { RESSYAHOUKOU_KUDARI } from '@oudia-web/format';

/** 一括サイクルの対象設定(M6 で操作可能なもの)。 */
export type EkiDisplaySetting =
  | 'chakuHatsu' // 着/発表示(着 → 着発 → 発)
  | 'track' // 発着番線表示(bool)
  | 'nyuusen' // 入線時刻表示(bool)
  | 'ressyabangou' // 列車番号(0..3)
  | 'syubetsu' // 列車種別(0..3)
  | 'ressyamei' // 列車名(0..3)
  | 'operationNumber' // 運用番号(0..4。表示は M7)
  | 'operationNumberRows' // 運用番号段数(1..5。operationNumber>0 のとき)
  | 'outerOrigin' // 路線外始発欄(bool)
  | 'outerTerminal'; // 路線外終着欄(bool)

/** 0..max のサイクル(順送り +1・末端で 0、逆送り -1・0 で max)。 */
function cycleInt(value: number, max: number, forward: boolean): number {
  if (forward) return value >= max ? 0 : value + 1;
  return value <= 0 ? max : value - 1;
}

/** 1..max のサイクル(Rows 系。順送りで末端 → 1、逆送りで 1 → max)。 */
function cycleRows(value: number, max: number, forward: boolean): number {
  if (forward) return value >= max ? 1 : value + 1;
  return value <= 1 ? max : value - 1;
}

/** 着/発の 3 状態サイクル(着 → 着発 → 発 → 着)。順送り。 */
function cycleChakuHatsu(
  chaku: boolean,
  hatsu: boolean,
  forward: boolean,
): { chaku: boolean; hatsu: boolean } {
  // 状態: 着のみ(true,false) / 着発(true,true) / 発のみ(false,true)。
  // 順送り: 着 → 着発 → 発 → 着。逆送り: 着 → 発 → 着発 → 着。
  const state = chaku && !hatsu ? 0 : chaku && hatsu ? 1 : 2; // 0=着 1=着発 2=発
  const next = forward ? (state + 1) % 3 : (state + 2) % 3;
  if (next === 0) return { chaku: true, hatsu: false };
  if (next === 1) return { chaku: true, hatsu: true };
  return { chaku: false, hatsu: true };
}

/** 1 駅の 1 設定を 1 方向ぶんサイクルする(draft の Eki を破壊的更新)。 */
export function cycleEkiDisplaySetting(
  eki: Eki,
  setting: EkiDisplaySetting,
  houkou: Ressyahoukou,
  forward: boolean,
): void {
  const isKudari = houkou === RESSYAHOUKOU_KUDARI;
  switch (setting) {
    case 'chakuHatsu': {
      const jd = isKudari ? eki.jikokuhyouJikokuDisplayKudari : eki.jikokuhyouJikokuDisplayNobori;
      const next = cycleChakuHatsu(jd.chaku, jd.hatsu, forward);
      jd.chaku = next.chaku;
      jd.hatsu = next.hatsu;
      break;
    }
    case 'track':
      if (isKudari) eki.jikokuhyouTrackDisplayKudari = !eki.jikokuhyouTrackDisplayKudari;
      else eki.jikokuhyouTrackDisplayNobori = !eki.jikokuhyouTrackDisplayNobori;
      break;
    case 'nyuusen':
      if (isKudari)
        eki.jikokuhyouNyuusenJikokuDisplayKudari = !eki.jikokuhyouNyuusenJikokuDisplayKudari;
      else eki.jikokuhyouNyuusenJikokuDisplayNobori = !eki.jikokuhyouNyuusenJikokuDisplayNobori;
      break;
    case 'ressyabangou': {
      const sc = isKudari
        ? eki.jikokuhyouSyubetsuChangeDisplayKudari
        : eki.jikokuhyouSyubetsuChangeDisplayNobori;
      sc.ressyabangou = cycleInt(sc.ressyabangou, 3, forward) as 0 | 1 | 2 | 3;
      break;
    }
    case 'syubetsu': {
      const sc = isKudari
        ? eki.jikokuhyouSyubetsuChangeDisplayKudari
        : eki.jikokuhyouSyubetsuChangeDisplayNobori;
      sc.syubetsu = cycleInt(sc.syubetsu, 3, forward) as 0 | 1 | 2 | 3;
      break;
    }
    case 'ressyamei': {
      const sc = isKudari
        ? eki.jikokuhyouSyubetsuChangeDisplayKudari
        : eki.jikokuhyouSyubetsuChangeDisplayNobori;
      sc.ressyamei = cycleInt(sc.ressyamei, 3, forward) as 0 | 1 | 2 | 3;
      break;
    }
    case 'operationNumber': {
      const sc = isKudari
        ? eki.jikokuhyouSyubetsuChangeDisplayKudari
        : eki.jikokuhyouSyubetsuChangeDisplayNobori;
      sc.operationNumber = cycleInt(sc.operationNumber, 4, forward) as 0 | 1 | 2 | 3 | 4;
      break;
    }
    case 'operationNumberRows': {
      const sc = isKudari
        ? eki.jikokuhyouSyubetsuChangeDisplayKudari
        : eki.jikokuhyouSyubetsuChangeDisplayNobori;
      // 依存: operationNumber>0 のときのみ変更可(原典 4735 の Rows ガード)。
      if (sc.operationNumber > 0) {
        sc.operationNumberRows = cycleRows(sc.operationNumberRows, 5, forward) as 1 | 2 | 3 | 4 | 5;
      }
      break;
    }
    case 'outerOrigin': {
      const od = isKudari ? eki.jikokuhyouOuterDisplayKudari : eki.jikokuhyouOuterDisplayNobori;
      od.origin = !od.origin;
      break;
    }
    case 'outerTerminal': {
      const od = isKudari ? eki.jikokuhyouOuterDisplayKudari : eki.jikokuhyouOuterDisplayNobori;
      od.terminal = !od.terminal;
      break;
    }
  }
}
