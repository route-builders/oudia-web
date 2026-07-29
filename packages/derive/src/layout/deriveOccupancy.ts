// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 up-tri
//
// Based on OuDiaSecond (Copyright (C) 2017-2026 diagram_mania)
// and OuDia (Copyright (C) 2006-2017 take-okm)

/**
 * ダイヤグラム在線表(RessyaTrackLine / Zaisen)の導出(原典 CentDedDgrRessya の
 * readCentDedRessya_11_updateRessyaTrackLineCont。M6・単独駅前提)。
 *
 * スコープ(ユーザー決定): 単独駅の在線表のみ。分岐環状の在線表・補助列車線・
 * 出区○/入区△ 運用記号は**単独駅ぶんのみ**対応した(M7e)。運用作業(shunt 等)が無い
 * enableOperation=0 の通常ケースでは、在線表駅での 1 列車 = 1 番線の横太線 + 着発の
 * 縦コネクタになる。
 *
 * ここでは列車の ekiJikoku から「在線表表示駅で当該列車が占有する番線と着発 X(Dgr 秒)」を
 * 取り出す。番線をまたぐ入換(shunt)は enableOperation=0 では発生しないため、1 駅 = 1 Zaisen。
 */

import {
  ekiIndexOfEkiOrder,
  getEkiJikoku,
  getValidSihatsuEki,
  getValidSyuuchakuEki,
} from '@oudia-web/domain';
import type { Ressya, Rosen } from '@oudia-web/format';
import type { ChakuOperationCode, HatsuOperationCode } from './operationMark.js';
import type { EkiLayout } from './types.js';

/** 在線表の 1 占有区間(1 番線を着 X から発 X まで占有)。原典 struct Zaisen。 */
export interface Zaisen {
  /** 当駅 ekiTrack2Cont への物理番線 index。 */
  readonly trackIndex: number;
  /** 占有開始 X(着時刻。なければ発時刻)。Dgr 秒。 */
  readonly dgrXChaku: number;
  /** 占有終了 X(発時刻。なければ着時刻)。Dgr 秒。 */
  readonly dgrXHatsu: number;
}

/** 1 列車 × 1 在線表駅の在線行(原典 CentDedDgrRessyaTrackLine)。 */
export interface RessyaTrackLine {
  /** 在線表駅の駅Index(下り基準)。 */
  readonly ekiIndex: number;
  /** 駅扱(停車/通過)。原典 m_iTsuukaTeisya。 */
  readonly ekiatsukai: 'teisya' | 'tsuuka';
  /** 占有区間(単独駅・非運用では 1 個)。 */
  readonly zaisenCont: readonly Zaisen[];
  /**
   * 着側作業コード(原典 m_iChakuOperation)。
   * 0=接続なし / 3=出区(○)/ 4=路線外始発(斜線)/ 5=前列車接続 / 負値=列車線が接続。
   * **単独駅のみ対応**。分岐環状の -2/-4(補助列車線)は未実装で常に -1(原典も単独駅は
   * -1 をハードコードする。CentDedDgrRessya.cpp:1741 / 2324 / 3708)。
   */
  readonly chakuOperation: ChakuOperationCode;
  /** 発側作業コード(原典 m_iHatsuOperation)。3=入区(△)/ 4=路線外終着 / 5=次列車接続。 */
  readonly hatsuOperation: HatsuOperationCode;
  /** 路線外発着駅 index(chaku/hatsuOperation === 4 のとき)。原典 m_iSubParameter。 */
  readonly outerEkiIndex: number | null;
  /** 前列車方向(chakuOperation === 5 のとき)。原典 m_iSubParameter。 */
  readonly prevRessyahoukou: number | null;
  /**
   * ○ / △ / 路線外斜線に添える運用番号。
   * ★ここでは**永続運番 #1**(ユーザーが作業ダイアログで入れた値)を使う。原典は運用探索が
   * 割り付けた #2/#3 を出すので、探索結果をダイヤグラムへ渡すまでは #1 で近似する。
   */
  readonly operationNumber: string;
}

/** 1 列車ぶんの在線行の集合(在線表表示駅ごと)。 */
export interface RessyaOccupancy {
  readonly houkou: 0 | 1;
  readonly syubetsuIndex: number;
  /** 在線表表示駅での在線行(駅Order 昇順)。 */
  readonly trackLines: readonly RessyaTrackLine[];
}

/** どの駅Index が在線表表示駅か(EkiLayout.trackLanes の有無で判定)。 */
function occupancyEkiIndexSet(ekiLayouts: readonly EkiLayout[]): Set<number> {
  const s = new Set<number>();
  for (const e of ekiLayouts) {
    if (e.trackLanes !== undefined && e.trackLanes.length > 0) s.add(e.ekiIndex);
  }
  return s;
}

/**
 * 1 列車の在線行を導出する。在線表駅かつ当該列車が停車/通過している駅について、
 * その番線の着発 X から Zaisen を 1 個作る。着/発が片方 null なら他方で代用(0 幅)。
 */
function deriveRessyaTrackLines(
  ressya: Ressya,
  rosen: Rosen,
  houkou: 0 | 1,
  occupancyIndices: ReadonlySet<number>,
  kitenJikoku: number,
  enableOperation: number,
): RessyaTrackLine[] {
  const ekiCount = rosen.ekiCont.length;
  const lines: RessyaTrackLine[] = [];
  const sihatsuOrder = getValidSihatsuEki(ressya);
  const syuuchakuOrder = getValidSyuuchakuEki(ressya);
  for (let ekiOrder = 0; ekiOrder < ekiCount; ekiOrder++) {
    const ekiIndex = ekiIndexOfEkiOrder(ekiOrder, ekiCount, houkou);
    if (!occupancyIndices.has(ekiIndex)) continue;
    const ej = getEkiJikoku(ressya, ekiOrder);
    if (ej.ekiatsukai !== 'teisya' && ej.ekiatsukai !== 'tsuuka') continue;
    const track = ej.ressyaTrackIndex;
    if (track === null) continue; // 番線未設定は在線を描けない
    const chaku = ej.chakuJikoku ?? ej.hatsuJikoku;
    const hatsu = ej.hatsuJikoku ?? ej.chakuJikoku;
    if (chaku === null || hatsu === null) continue;
    const op = operationCodesOf(ressya, ekiOrder, sihatsuOrder, syuuchakuOrder, enableOperation);
    lines.push({
      ekiIndex,
      ekiatsukai: ej.ekiatsukai,
      zaisenCont: [
        {
          trackIndex: track,
          dgrXChaku: toDgrX(chaku, kitenJikoku),
          dgrXHatsu: toDgrX(hatsu, kitenJikoku),
        },
      ],
      ...op,
    });
  }
  return lines;
}

/**
 * 時刻(0..86399 秒)を Dgr X(起点時刻相対、日跨ぎで +86400)へ変換する。
 * ダイヤグラムは起点時刻を左端とし、それより手前の時刻は翌日側(+86400)に置く。
 */
function toDgrX(seconds: number, kitenJikoku: number): number {
  return seconds >= kitenJikoku ? seconds : seconds + 86400;
}

/**
 * ダイヤ全体の在線表を導出する(方向別)。在線表表示駅が 1 つも無ければ空。
 * @param ekiLayouts computeDiagramLayout の frame.ekiLayouts(trackLanes 付き)
 */
export function deriveOccupancy(
  rosen: Rosen,
  kudari: readonly Ressya[],
  nobori: readonly Ressya[],
  ekiLayouts: readonly EkiLayout[],
): { kudari: RessyaOccupancy[]; nobori: RessyaOccupancy[] } {
  const occupancyIndices = occupancyEkiIndexSet(ekiLayouts);
  const kitenJikoku = rosen.kitenJikoku ?? 0;
  if (occupancyIndices.size === 0) return { kudari: [], nobori: [] };

  const build = (list: readonly Ressya[], houkou: 0 | 1): RessyaOccupancy[] =>
    list
      .filter((r) => !r.isNull)
      .map((r) => ({
        houkou,
        syubetsuIndex: r.syubetsuIndex,
        trackLines: deriveRessyaTrackLines(
          r,
          rosen,
          houkou,
          occupancyIndices,
          kitenJikoku,
          rosen.enableOperation,
        ),
      }))
      .filter((o) => o.trackLines.length > 0);

  return { kudari: build(kudari, 0), nobori: build(nobori, 1) };
}

/**
 * 単独駅の作業コードを決める(原典 CentDedDgrRessya::readCentDedRessya_11_* の単独駅経路)。
 *
 * - 始発駅: 着側 = 先頭の前作業(出区 3 / 路線外始発 4 / 前列車接続 5 / なし 0)、
 *   発側 = -1 ハードコード(:1741)
 * - 終着駅: 発側 = 末尾の後作業(入区 3 / 路線外終着 4 / 次列車接続 5 / なし 0)、
 *   着側 = -1 ハードコード(:3708)
 * - 中間駅: (-1, -1)(:2321-2326)
 *
 * ★分岐環状駅の -2 / -4(補助列車線)は未実装。原典でも単独駅は -1 なので、
 * 単独駅だけを在線表にしている現状ではこの近似で一致する。
 */
function operationCodesOf(
  ressya: Ressya,
  ekiOrder: number,
  sihatsuOrder: number,
  syuuchakuOrder: number,
  enableOperation: number,
): Pick<
  RessyaTrackLine,
  'chakuOperation' | 'hatsuOperation' | 'outerEkiIndex' | 'prevRessyahoukou' | 'operationNumber'
> {
  let chakuOperation: ChakuOperationCode = -1;
  let hatsuOperation: HatsuOperationCode = -1;
  let outerEkiIndex: number | null = null;
  let prevRessyahoukou: number | null = null;
  let operationNumber = '';

  if (ekiOrder === sihatsuOrder) {
    const first = ressya.ekiJikokuCont[ekiOrder]?.beforeOperationCont[0];
    chakuOperation = 0;
    if (first !== undefined && enableOperation > 0) {
      if (first.kind === 'out') {
        chakuOperation = 3;
        operationNumber = first.operationNumbers.join('+');
      } else if (first.kind === 'outer') {
        chakuOperation = 4;
        outerEkiIndex = first.outerTerminalIndex;
        operationNumber = first.operationNumbers.join('+');
      } else if (first.kind === 'junction') {
        chakuOperation = 5;
        prevRessyahoukou = 0; // 前列車方向は探索結果が要る。未解決のうちは 0(=向き反転なし)。
      }
    }
  }
  if (ekiOrder === syuuchakuOrder) {
    const cont = ressya.ekiJikokuCont[ekiOrder]?.afterOperationCont ?? [];
    const last = cont[cont.length - 1];
    hatsuOperation = 0;
    if (last !== undefined && enableOperation > 0) {
      if (last.kind === 'in') {
        hatsuOperation = 3;
        operationNumber = operationNumber === '' ? '' : operationNumber;
      } else if (last.kind === 'outer') {
        hatsuOperation = 4;
        outerEkiIndex = last.outerTerminalIndex;
      } else if (last.kind === 'junction') {
        hatsuOperation = 5;
      }
    }
  }
  return { chakuOperation, hatsuOperation, outerEkiIndex, prevRessyahoukou, operationNumber };
}
