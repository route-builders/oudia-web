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
  type BrunchLoopMap,
  deriveBrunchLoopMap,
  ekiIndexOfEkiOrder,
  getEkiJikoku,
  getEkiOrderBrunchLoop,
  getValidSihatsuEki,
  getValidSyuuchakuEki,
} from '@oudia-web/domain';
import type { Ressya, Rosen } from '@oudia-web/format';
import type { JunctionResolution } from '../operationLight/types.js';
import type { ChakuOperationCode, HatsuOperationCode } from './operationMark.js';
import { brunchOppositeOperationCode } from './trackDisplayMode.js';
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
  /** 在線表駅の駅Order(この列車の方向基準)。分岐環状の展開はこの空間で行う。 */
  readonly ekiOrder: number;
  /**
   * この行が在線表(番線帯)を持つ駅のものか。false = 補助列車線・記号だけを描く行
   * (原典 CentDedDgrRessyaTrackLine の bIsTrackDisplay)。
   */
  readonly isTrackDisplay: boolean;
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
   * ★**探索が割り付けた #2/#3**(deriveOccupancy の operation 引数)を優先し、
   * 渡されなければ永続運番 #1 で近似する(原典 getOperationNumber、:1640)。
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
 * 運用探索の結果を在線表へ渡す入力(M7j 追加)。
 *
 * ★ダイヤグラムの運用記号(○ / △ / 路線外斜線)に添える運番は、原典では
 * `CentDedBeforeOperation::getOperationNumber()` = **探索が割り付けた #2/#3** を使う
 * (CentDedDgrRessya.cpp:1640)。永続運番 #1 だけでは出区・入区の記号に何も出ないことがある。
 * ★前列車接続の `prevRessyahoukou`(:1648)も探索結果でしか決まらない。面取り
 * (CRessyaDraw.cpp:928)がこの値を読む。
 *
 * 渡されなければ従来どおり永続運番 #1 で近似する。
 */
export interface OccupancyOperationInput {
  /** opRefKey → 割付運番。deriveOperationFull の assignedNumbers。 */
  readonly assignedNumbers?: ReadonlyMap<string, readonly string[]>;
  /** 次列車接続の解決結果。deriveOperationLight / Full の junctionResult。 */
  readonly junctionResult?: ReadonlyMap<string, JunctionResolution>;
}

/** 在線表から見た探索結果の索引(列車の作業単位で引けるように前処理したもの)。 */
interface OperationLookup {
  /** その作業(方向・列車・駅Order・before/after・作業 index)へ割り付いた運番。 */
  assigned(
    houkou: 0 | 1,
    ressyaIndex: number,
    ekiOrder: number,
    opKind: 'before' | 'after',
    index: number,
  ): string[];
  /** その列車の**前列車接続**(始発の前作業)の解決結果。 */
  junction(houkou: 0 | 1, ressyaIndex: number, ekiOrder: number): JunctionResolution | undefined;
}

/** 探索結果を在線表向けの索引にする。 */
function buildOperationLookup(input: OccupancyOperationInput | undefined): OperationLookup {
  const assignedMap = input?.assignedNumbers;
  // ★junctionResult は**前列車の後作業**をキーに持つので、次列車の前作業側へ引き直す
  // (原典は解決値を次列車の BeforeOperation へ複写する。CDedOperationConnecter.cpp:1661)。
  const byNext = new Map<string, JunctionResolution>();
  for (const res of input?.junctionResult?.values() ?? []) {
    const n = res.nextTrain;
    if (n === null) continue;
    byNext.set(`${String(n.houkou)}:${String(n.ressyaIndex)}:${String(n.ekiOrder)}`, res);
  }
  return {
    assigned(houkou, ressyaIndex, ekiOrder, opKind, index) {
      const key = `${String(houkou)}:${String(ressyaIndex)}:${String(ekiOrder)}:${opKind}:${String(index)}`;
      return [...(assignedMap?.get(key) ?? [])];
    },
    junction(houkou, ressyaIndex, ekiOrder) {
      return byNext.get(`${String(houkou)}:${String(ressyaIndex)}:${String(ekiOrder)}`);
    },
  };
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
  brunchLoop: BrunchLoopMap,
  lookup: OperationLookup,
  ressyaIndex: number,
): RessyaTrackLine[] {
  const ekiCount = rosen.ekiCont.length;
  const lines: RessyaTrackLine[] = [];
  const sihatsuOrder = getValidSihatsuEki(ressya);
  const syuuchakuOrder = getValidSyuuchakuEki(ressya);
  for (let ekiOrder = 0; ekiOrder < ekiCount; ekiOrder++) {
    const selfIndex = ekiIndexOfEkiOrder(ekiOrder, ekiCount, houkou);
    const ej = getEkiJikoku(ressya, ekiOrder);
    const ekiatsukai = ej.ekiatsukai;
    if (ekiatsukai !== 'teisya' && ekiatsukai !== 'tsuuka') continue;
    const track = ej.ressyaTrackIndex;
    if (track === null) continue; // 番線未設定は在線を描けない
    const chaku = ej.chakuJikoku ?? ej.hatsuJikoku;
    const hatsu = ej.hatsuJikoku ?? ej.chakuJikoku;
    if (chaku === null || hatsu === null) continue;
    const op = operationCodesOf(
      ressya,
      ekiOrder,
      sihatsuOrder,
      syuuchakuOrder,
      enableOperation,
      lookup,
      houkou,
      ressyaIndex,
    );
    const zaisenCont = [
      {
        trackIndex: track,
        dgrXChaku: toDgrX(chaku, kitenJikoku),
        dgrXHatsu: toDgrX(hatsu, kitenJikoku),
      },
    ];

    // ---- 分岐環状の駅群へ複製する(原典 CentDedDgrRessya.cpp:1788-2078 ほか)----
    // ★駅群で在線表を共有するのではなく、**同じ Zaisen を各駅へ複製して別々の行**を作る。
    // 違うのは (駅Order, chakuOperation, hatsuOperation, isTrackDisplay) だけ。
    const group = getEkiOrderBrunchLoop(brunchLoop, ekiCount, ekiOrder, houkou);
    if (group.position === 'standalone') {
      if (!occupancyIndices.has(selfIndex)) continue;
      lines.push({
        ekiIndex: selfIndex,
        ekiOrder,
        isTrackDisplay: true,
        ekiatsukai,
        zaisenCont,
        ...op,
      });
      continue;
    }

    const emit = (orders: readonly number[], kind: 'brunch' | 'loop'): void => {
      for (const dispOrder of orders) {
        const dispIndex = ekiIndexOfEkiOrder(dispOrder, ekiCount, houkou);
        // 自駅は元の作業コード。他駅は反転フラグ比較で -1 / -2 / -4。
        const isSelf = dispOrder === ekiOrder;
        const neg = isSelf
          ? -1
          : brunchOppositeOperationCode(rosen.ekiCont, selfIndex, dispIndex, kind);
        // 始発駅の作業(出区等)は駅群の全駅に同じ値で載る。負値側だけ駅ごとに決まる。
        const chakuOperation: ChakuOperationCode =
          isSelf || op.chakuOperation >= 0 ? op.chakuOperation : neg;
        const hatsuOperation: HatsuOperationCode =
          isSelf || op.hatsuOperation >= 0 ? op.hatsuOperation : neg;
        const display = occupancyIndices.has(dispIndex);
        // 在線表非表示駅は「補助列車線を描くべきとき」だけ行を出す(原典 :1947 ほか)。
        if (
          !display &&
          !(
            chakuOperation === -2 ||
            chakuOperation === -4 ||
            hatsuOperation === -2 ||
            hatsuOperation === -4
          )
        ) {
          continue;
        }
        lines.push({
          ekiIndex: dispIndex,
          ekiOrder: dispOrder,
          isTrackDisplay: display,
          ekiatsukai,
          zaisenCont,
          ...op,
          chakuOperation,
          hatsuOperation,
        });
      }
    };
    emit(group.originSide, 'brunch');
    emit(group.loop, 'loop');
    emit(group.terminalSide, 'brunch');
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
  /** 分岐環状マップ(省略時は駅から導出)。 */
  brunchLoop?: BrunchLoopMap,
  /** 運用探索の結果(省略時は永続運番 #1 で近似)。 */
  operation?: OccupancyOperationInput,
): { kudari: RessyaOccupancy[]; nobori: RessyaOccupancy[] } {
  const occupancyIndices = occupancyEkiIndexSet(ekiLayouts);
  const lookup = buildOperationLookup(operation);
  const brunchLoopMap = brunchLoop ?? deriveBrunchLoopMap(rosen.ekiCont);
  const kitenJikoku = rosen.kitenJikoku ?? 0;
  if (occupancyIndices.size === 0) return { kudari: [], nobori: [] };

  const build = (list: readonly Ressya[], houkou: 0 | 1): RessyaOccupancy[] =>
    list
      // ★列車 index は**元の配列の位置**。isNull を落とす前に控える(探索結果の索引キー)。
      .map((r, ressyaIndex) => ({ r, ressyaIndex }))
      .filter(({ r }) => !r.isNull)
      .map(({ r, ressyaIndex }) => ({
        houkou,
        syubetsuIndex: r.syubetsuIndex,
        trackLines: deriveRessyaTrackLines(
          r,
          rosen,
          houkou,
          occupancyIndices,
          kitenJikoku,
          rosen.enableOperation,
          brunchLoopMap,
          lookup,
          ressyaIndex,
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
  lookup: OperationLookup,
  houkou: 0 | 1,
  ressyaIndex: number,
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
      // ★探索が割り付けた運番があればそちらを使う(原典 getOperationNumber は #2/#3 を返す)。
      const assigned = lookup.assigned(houkou, ressyaIndex, ekiOrder, 'before', 0);
      if (first.kind === 'out') {
        chakuOperation = 3;
        operationNumber = (assigned.length > 0 ? assigned : first.operationNumbers).join('+');
      } else if (first.kind === 'outer') {
        chakuOperation = 4;
        outerEkiIndex = first.outerTerminalIndex;
        operationNumber = (assigned.length > 0 ? assigned : first.operationNumbers).join('+');
      } else if (first.kind === 'junction') {
        chakuOperation = 5;
        // ★前列車方向は探索結果でしか決まらない。未解決なら 0(= 向き反転なし)。
        prevRessyahoukou = lookup.junction(houkou, ressyaIndex, ekiOrder)?.prevRessyahoukou ?? 0;
        if (assigned.length > 0) operationNumber = assigned.join('+');
      }
    }
  }
  if (ekiOrder === syuuchakuOrder) {
    const cont = ressya.ekiJikokuCont[ekiOrder]?.afterOperationCont ?? [];
    const last = cont[cont.length - 1];
    hatsuOperation = 0;
    if (last !== undefined && enableOperation > 0) {
      const assigned = lookup.assigned(houkou, ressyaIndex, ekiOrder, 'after', cont.length - 1);
      if (assigned.length > 0) operationNumber = assigned.join('+');
      if (last.kind === 'in') {
        hatsuOperation = 3;
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
