// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 up-tri
//
// Based on OuDiaSecond (Copyright (C) 2017-2026 diagram_mania)
// and OuDia (Copyright (C) 2006-2017 take-okm)

/**
 * ダイヤグラム上の運用記号(出区 ○ / 入区 △ / 路線外発着の斜線 / 前列車接続の円弧 /
 * 運用番号ラベル)の**幾何導出**(原典 CRessyaDraw::RessyaTrackLineDraw、:844-2920)。M7d。
 *
 * 描画そのものは render 層の責務。ここは「何を・どこに・どの向きで描くか」を
 * Dgr 座標(秒 / 駅Order)と符号で返す純関数にする。
 *
 * ★寸法の単位は D = DiagramDgrYZahyouKyoriDefault(既定 60 Dgr 秒)。X 半径も D/2 なので、
 * X ズームに依らず円形を保つ(原典 :3724-3725)。
 *
 * ★在線表**表示駅**はレーン Y 基準、**非表示駅**は駅線 Y 基準で同じ形状を描く。
 * 前列車接続の円弧は**非表示駅のみ**(表示駅では在線横線の左端の面取りで表す)。
 *
 * ★増結 ● (HatsuOperation==1) / 解結 ▲ (ChakuOperation==2) は現行の原典で代入元がなく
 * 到達不能な死コードなので移植しない。
 */

import type { Ressyahoukou } from '@oudia-web/format';

/**
 * 着側作業コード(原典 CentDedDgrRessyaTrackLine::m_iChakuOperation、.h:165-204)。
 * 負値は分岐・補助線の都合で、記号描画に関わるのは 3/4/5。
 */
export type ChakuOperationCode = -5 | -4 | -3 | -2 | -1 | 0 | 1 | 2 | 3 | 4 | 5;
/** 発側作業コード(原典 m_iHatsuOperation、.h:205-243)。記号描画に関わるのは 3/4/5。 */
export type HatsuOperationCode = -5 | -4 | -3 | -2 | -1 | 0 | 1 | 2 | 3 | 4 | 5;

export const CHAKU_OP_OUT = 3; // 出区(○)
export const CHAKU_OP_OUTER = 4; // 路線外始発(斜線)
export const CHAKU_OP_PREV_JUNCTION = 5; // 前列車接続(円弧。非表示駅のみ)
export const HATSU_OP_IN = 3; // 入区(△)
export const HATSU_OP_OUTER = 4; // 路線外終着(斜線)
export const HATSU_OP_NEXT_JUNCTION = 5; // 次列車接続(最終番線の横線を描かない)

/** 記号 1 個の幾何(Dgr 座標 + 上下符号)。 */
export type OperationMark =
  | {
      /** 出区。中抜きの円。 */
      readonly kind: 'outCircle';
      /** 円の中心 X(Dgr 秒)。 */
      readonly dgrX: number;
      /** Y の基準(レーン or 駅線)からの向き。+1 = 下方向、-1 = 上方向。 */
      readonly yShift: 1 | -1;
      /** 運用番号ラベル(空なら出さない)。○ の左側に右寄せ。 */
      readonly operationNumber: string;
    }
  | {
      /** 入区。中抜きの三角。 */
      readonly kind: 'inTriangle';
      readonly dgrX: number;
      readonly yShift: 1 | -1;
      /** △ の右側に左寄せ。 */
      readonly operationNumber: string;
    }
  | {
      /** 路線外始発・終着の斜線 + 駅名(+運番)ラベル。 */
      readonly kind: 'outerSlash';
      /** 本線側の端 X(Dgr 秒)。 */
      readonly dgrXInner: number;
      /** 路線外側の端 X(Dgr 秒)= inner ∓ 0.7 * D。 */
      readonly dgrXOuter: number;
      /** 路線外側の端の Y 向き。 */
      readonly yShift: 1 | -1;
      /** 始発(左に伸ばす)か終着(右に伸ばす)か。 */
      readonly isSihatsu: boolean;
      /** 路線外駅名(+ 運番があれば " 運番")。 */
      readonly label: string;
    }
  | {
      /** 前列車接続の円弧(在線表非表示駅のみ)。前列車の着 → この列車の発を結ぶ。 */
      readonly kind: 'prevJunctionArc';
      readonly dgrXLeft: number;
      readonly dgrXRight: number;
      /** 左端の向き(原典 iPrevRessyahoukou)。 */
      readonly leftShape: number;
      /** 右端の向き。 */
      readonly rightShape: 1 | -1;
    };

/** 運用番号ラベル 1 個(在線横線の中央に出すもの)。 */
export interface OperationNumberLabel {
  readonly dgrX: number;
  readonly trackIndex: number;
  readonly yShift: 1 | -1;
  readonly text: string;
}

/** 1 駅ぶんの入力(在線区間 + 作業コード + 運番)。 */
export interface OperationMarkInput {
  readonly houkou: Ressyahoukou;
  /** 在線表を表示する駅か(原典 getIsTrackDisplay)。 */
  readonly trackDisplay: boolean;
  readonly chakuOperation: ChakuOperationCode;
  readonly hatsuOperation: HatsuOperationCode;
  /** 在線区間(先頭が着側、末尾が発側)。 */
  readonly zaisen: readonly {
    readonly trackIndex: number;
    readonly dgrXChaku: number;
    readonly dgrXHatsu: number;
    readonly operationNumber: string;
  }[];
  /** 路線外発着駅名(chaku/hatsuOperation === 4 のときのみ使う)。 */
  readonly outerEkimeiSihatsu?: string;
  readonly outerEkimeiSyuuchaku?: string;
  /** 前列車の方向(原典 getPrevRessyahoukou)。円弧の左端の向き。 */
  readonly prevRessyahoukou?: number;
  /** 斜線の長さの元(原典 getDgrYSizeEkikanDefault。既定 60 Dgr 秒)。 */
  readonly dgrYSizeEkikanDefault: number;
}

/** -4 / -5 は「分岐 + 逆方向」で上下が反転する(原典 :1347-1385 / :1888-1900)。 */
function isReversed(code: number): boolean {
  return code === -4 || code === -5;
}

/**
 * 出区 ○ の上下向き(原典 :1347-1385)。
 * 在線が 1 区間なら「発側作業が -4/-5 なら +1、そうでなければ -1」。
 * 複数区間なら「次に移動する番線と反対側」。
 */
function outCircleYShift(input: OperationMarkInput): 1 | -1 {
  const z0 = input.zaisen[0];
  const z1 = input.zaisen[1];
  if (input.zaisen.length === 1 || z0 === undefined || z1 === undefined) {
    return isReversed(input.hatsuOperation) ? 1 : -1;
  }
  const down = input.houkou === 0;
  if (z0.trackIndex > z1.trackIndex) return down ? 1 : -1;
  return down ? -1 : 1;
}

/** 入区 △ の上下向き(原典 :1888-1900)。出区と鏡像。 */
function inTriangleYShift(input: OperationMarkInput): 1 | -1 {
  const n = input.zaisen.length;
  const last = input.zaisen[n - 1];
  const prev = input.zaisen[n - 2];
  if (n === 1 || last === undefined || prev === undefined) {
    return isReversed(input.chakuOperation) ? -1 : 1;
  }
  const down = input.houkou === 0;
  if (prev.trackIndex > last.trackIndex) return down ? 1 : -1;
  return down ? -1 : 1;
}

/**
 * 1 駅ぶんの運用記号を導出する(原典 RessyaTrackLineDraw の記号分岐)。
 *
 * 在線区間がないときは何も出さない。表示駅/非表示駅で「Y の基準」が変わるだけで
 * 形状・寸法は同じなので、ここでは向き(yShift)だけを返し、基準 Y は render が決める。
 */
export function deriveOperationMarks(input: OperationMarkInput): OperationMark[] {
  const marks: OperationMark[] = [];
  const first = input.zaisen[0];
  const last = input.zaisen[input.zaisen.length - 1];
  if (first === undefined || last === undefined) return marks;
  const slashLen = input.dgrYSizeEkikanDefault * 0.7;

  // ---- 着側 ----
  if (input.chakuOperation === CHAKU_OP_OUT) {
    marks.push({
      kind: 'outCircle',
      dgrX: first.dgrXChaku,
      yShift: outCircleYShift(input),
      operationNumber: first.operationNumber,
    });
  } else if (input.chakuOperation === CHAKU_OP_OUTER) {
    // 路線外始発: 着 X から左へ 0.7D 伸ばす(原典 :1484-1578)。
    // 起点側の Y 向き。下り = 上方向(-1)、上り = 下方向(+1)。-4/-5 で反転する。
    const base: 1 | -1 = input.houkou === 0 ? -1 : 1;
    const yShift: 1 | -1 = isReversed(input.hatsuOperation) ? (base === 1 ? -1 : 1) : base;
    const num = first.operationNumber;
    marks.push({
      kind: 'outerSlash',
      dgrXInner: first.dgrXChaku,
      dgrXOuter: first.dgrXChaku - slashLen,
      yShift,
      isSihatsu: true,
      label: (input.outerEkimeiSihatsu ?? '') + (num === '' ? '' : ` ${num}`),
    });
  } else if (input.chakuOperation === CHAKU_OP_PREV_JUNCTION && !input.trackDisplay) {
    // 前列車接続の円弧は在線表**非表示駅のみ**(原典 :2248-2288)。
    marks.push({
      kind: 'prevJunctionArc',
      dgrXLeft: first.dgrXChaku,
      dgrXRight: first.dgrXHatsu,
      leftShape: input.prevRessyahoukou ?? 0,
      rightShape: isReversed(input.hatsuOperation) ? -1 : 1,
    });
  }

  // ---- 発側 ----
  if (input.hatsuOperation === HATSU_OP_IN) {
    marks.push({
      kind: 'inTriangle',
      dgrX: last.dgrXHatsu,
      yShift: inTriangleYShift(input),
      operationNumber: last.operationNumber,
    });
  } else if (input.hatsuOperation === HATSU_OP_OUTER) {
    // 路線外終着: 発 X から右へ 0.7D 伸ばす(原典 :1921-2009)。既定 +1、着側が -4/-5 なら -1。
    const num = last.operationNumber;
    marks.push({
      kind: 'outerSlash',
      dgrXInner: last.dgrXHatsu,
      dgrXOuter: last.dgrXHatsu + slashLen,
      yShift: isReversed(input.chakuOperation) ? -1 : 1,
      isSihatsu: false,
      label: (input.outerEkimeiSyuuchaku ?? '') + (num === '' ? '' : ` ${num}`),
    });
  }

  return marks;
}

/**
 * 在線横線の中央に出す運用番号ラベル(原典 :1000-1022)。
 * 出区/入区/路線外(3・4)のときはマーク側にラベルが付くのでここでは出さない。
 * 向きは常に線の外側(下り = -1 / 上り = +1)。
 */
export function deriveOperationNumberLabels(input: OperationMarkInput): OperationNumberLabel[] {
  const skipChaku = input.chakuOperation === 3 || input.chakuOperation === 4;
  const skipHatsu = input.hatsuOperation === 3 || input.hatsuOperation === 4;
  if (skipChaku || skipHatsu) return [];
  const yShift: 1 | -1 = input.houkou === 0 ? -1 : 1;
  return input.zaisen
    .filter((z) => z.operationNumber !== '')
    .map((z) => ({
      dgrX: (z.dgrXChaku + z.dgrXHatsu) / 2,
      trackIndex: z.trackIndex,
      yShift,
      text: z.operationNumber,
    }));
}
