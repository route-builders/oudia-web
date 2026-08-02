// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 up-tri
//
// Based on OuDiaSecond (Copyright (C) 2017-2026 diagram_mania)
// and OuDia (Copyright (C) 2006-2017 take-okm)

/**
 * ダイヤグラム在線表の描画(原典 CRessyaDraw::RessyaTrackLineDraw。M6・単独駅前提)。
 * L1(背景)と L2(スジ)の間に挿入する「L1.5」レイヤ。
 *
 * 描く要素:
 * - 番線レーンの薄い横罫線(在線表表示駅ごと・全番線)= 帯の下地
 * - 列車の在線占有(Zaisen)= 番線色の太い横線(着 X 〜 発 X)
 * - 着発の縦コネクタ = 駅線から占有番線レーンへの縦線
 *
 * 出区○/入区△/路線外斜線は**単独駅ぶんのみ**描く(M7e)。転線(shunt)縦線・
 * 補助列車線(chaku/hatsuOperation の -2/-4)は分岐環状の在線表と同時に実装する。
 */

import type { DiagramLayout, OperationMarkInput, RessyaOccupancy } from '@oudia-web/derive';
import { deriveOperationMarks } from '@oudia-web/derive';
import { strokeLine } from '../core/primitives.js';
import type { RenderContext2D } from '../core/RenderTarget.js';
import { xDgrToView, yDgrToView } from '../core/ViewTransform.js';
import { enumShiftSeconds } from './culling.js';
import type { DiagramViewState } from './DiagramRenderer.js';
import { drawOperationMarks, type OperationMarkTheme } from './OperationMarkRenderer.js';

/** 在線表描画の入力(occupancy は deriveOccupancy の出力)。 */
export interface OccupancyDrawInput {
  readonly kudari: readonly RessyaOccupancy[];
  readonly nobori: readonly RessyaOccupancy[];
}

/** 駅Index → 番線 index → レーン Y(Dgr 秒)の索引を作る。 */
function laneIndex(layout: DiagramLayout): Map<number, Map<number, number>> {
  const m = new Map<number, Map<number, number>>();
  for (const eki of layout.frame.ekiLayouts) {
    if (eki.trackLanes === undefined) continue;
    const inner = new Map<number, number>();
    for (const lane of eki.trackLanes) inner.set(lane.trackIndex, lane.dgrY);
    m.set(eki.ekiIndex, inner);
  }
  return m;
}

/**
 * 駅Index → 駅線 Y の組(Org = 帯の上 / Ter = 帯の下)。
 * 着コネクタは Org 側、発コネクタは Ter 側から引く(原典 CRessyaDraw.cpp:1275-1288 /
 * :1710-1724 の bIsOrigin。在線表なしの駅では両者が同値)。
 */
function stationYIndex(layout: DiagramLayout): Map<number, { org: number; ter: number }> {
  const m = new Map<number, { org: number; ter: number }>();
  for (const eki of layout.frame.ekiLayouts) {
    m.set(eki.ekiIndex, { org: eki.dgrYOrg, ter: eki.dgrYTer });
  }
  return m;
}

/**
 * L1.5: 在線表を描く。occupancy が空(在線表駅なし)なら何もしない。
 * @param syubetsuColor 種別 index → 線色(スジと同じ色を使う)
 */
export function drawOccupancy(
  ctx: RenderContext2D,
  layout: DiagramLayout,
  view: DiagramViewState,
  occupancy: OccupancyDrawInput,
  syubetsuColor: (syubetsuIndex: number) => string,
  laneLineColor: string,
  /** 運用記号(出区○/入区△/路線外斜線)を描くための追加情報。省略すると描かない。 */
  marks?: {
    /** D = DiagramDgrYZahyouKyoriDefault(既定 60 Dgr 秒)。 */
    readonly dgrYSizeEkikanDefault: number;
    /** 路線外発着駅名の引き当て(駅Index, outer index)。 */
    readonly outerEkimei: (ekiIndex: number, outerIndex: number) => string;
    readonly theme: Omit<OperationMarkTheme, 'senColor'>;
  },
): void {
  const t = view.transform;
  const lanes = laneIndex(layout);
  if (lanes.size === 0) return;
  const stationY = stationYIndex(layout);
  const xBegin = t.contentX;
  const xEnd = t.contentX + view.viewW / t.pxPerSecX;

  // (1) 番線レーンの下地横罫線(在線表駅ごと・全レーン)。
  ctx.strokeStyle = laneLineColor;
  ctx.lineWidth = 1;
  ctx.setLineDash([2, 2]);
  for (const eki of layout.frame.ekiLayouts) {
    if (eki.trackLanes === undefined) continue;
    for (const lane of eki.trackLanes) {
      const y = yDgrToView(t, lane.dgrY);
      if (y < -2 || y > view.viewH + 2) continue;
      strokeLine(ctx, 0, y, view.viewW, y);
    }
  }
  ctx.setLineDash([]);

  // (2)(3) 列車の在線占有 + 着発縦コネクタ(方向別・shiftSeconds 繰り返し)。
  const drawDir = (list: readonly RessyaOccupancy[], show: boolean): void => {
    if (!show) return;
    for (const occ of list) {
      const color = syubetsuColor(occ.syubetsuIndex);
      for (const line of occ.trackLines) {
        const laneMap = lanes.get(line.ekiIndex);
        const staY = stationY.get(line.ekiIndex);
        if (staY === undefined) continue;
        // 着は起点側の駅線(Org)、発は終点側の駅線(Ter)から引く。
        // 上り列車は Org/Ter の意味が入れ替わる(原典 YDgrToDcd の bIsOrigin)。
        const yChakuStation = occ.houkou === 0 ? staY.org : staY.ter;
        const yHatsuStation = occ.houkou === 0 ? staY.ter : staY.org;

        // 補助列車線(分岐環状で他駅へ複製された行の -2 / -4)。在線表の表示・非表示に
        // かかわらず描く(原典 CRessyaDraw.cpp:1301-1327 / :1732-1760、非表示駅は :2109-2245)。
        drawAuxTrackLines(ctx, t, line, occ.houkou, yChakuStation, yHatsuStation, color, [
          xBegin,
          xEnd,
        ]);
        // 在線表を持たない駅の行はここまで(横線・コネクタ・記号は描かない)。
        if (!line.isTrackDisplay || laneMap === undefined) continue;

        for (const [zi, z] of line.zaisenCont.entries()) {
          const laneY = laneMap.get(z.trackIndex);
          if (laneY === undefined) continue; // 省略番線 → 描かない
          const isFirst = zi === 0;
          const isLast = zi === line.zaisenCont.length - 1;
          // ★次列車接続(5)の番線の横線は**次列車に委任**して描かない(原典 :970-975)。
          if (isLast && line.hatsuOperation === 5) continue;
          // dgrX の全体 Zone(この Zaisen 単体)。日跨ぎ繰り返しでビュー内へ。
          const zone: readonly [number, number] = [
            Math.min(z.dgrXChaku, z.dgrXHatsu),
            Math.max(z.dgrXChaku, z.dgrXHatsu),
          ];
          for (const shift of enumShiftSeconds(zone, xBegin, xEnd)) {
            const xC = xDgrToView(t, z.dgrXChaku + shift);
            const xH = xDgrToView(t, z.dgrXHatsu + shift);
            const yLane = yDgrToView(t, laneY);
            const yChaku = yDgrToView(t, yChakuStation);
            const yHatsu = yDgrToView(t, yHatsuStation);
            // 横太線(占有)。停車 = 太線、通過 = 細線(通過は在線時間ほぼ 0)。
            ctx.strokeStyle = color;
            ctx.lineWidth = line.ekiatsukai === 'teisya' ? 3 : 1;
            strokeLine(ctx, xC, yLane, xH, yLane);
            // 着発の縦コネクタ(駅線 ↔ レーン)。
            // ★**作業コードが負のとき(= 列車線がこの駅に接続するとき)だけ**引く
            // (原典 CRessyaDraw.cpp:1253 `if (getChakuOperation() < 0)` / :1685)。
            // 出区・入区・路線外・前後列車接続では列車線が来ないので縦線も出ない。
            ctx.lineWidth = 1;
            if (isFirst && line.chakuOperation < 0) strokeLine(ctx, xC, yChaku, xC, yLane);
            if (isLast && line.hatsuOperation < 0) strokeLine(ctx, xH, yLane, xH, yHatsu);

            // 運用記号(出区○ / 入区△ / 路線外斜線)。基準 Y は在線表表示駅なのでレーン Y。
            if (marks !== undefined) {
              const input: OperationMarkInput = {
                houkou: occ.houkou,
                trackDisplay: true,
                chakuOperation: line.chakuOperation,
                hatsuOperation: line.hatsuOperation,
                zaisen: [
                  {
                    trackIndex: z.trackIndex,
                    dgrXChaku: z.dgrXChaku + shift,
                    dgrXHatsu: z.dgrXHatsu + shift,
                    operationNumber: line.operationNumber,
                  },
                ],
                outerEkimeiSihatsu:
                  line.outerEkiIndex === null
                    ? ''
                    : marks.outerEkimei(line.ekiIndex, line.outerEkiIndex),
                outerEkimeiSyuuchaku:
                  line.outerEkiIndex === null
                    ? ''
                    : marks.outerEkimei(line.ekiIndex, line.outerEkiIndex),
                dgrYSizeEkikanDefault: marks.dgrYSizeEkikanDefault,
              };
              const list = deriveOperationMarks(input);
              if (list.length > 0) {
                drawOperationMarks(
                  ctx,
                  list,
                  {
                    xOf: (dgr) => xDgrToView(t, dgr),
                    baseY: yLane,
                    markSize: marks.dgrYSizeEkikanDefault * t.pxPerSecY,
                  },
                  { ...marks.theme, senColor: color },
                );
                // マーク描画で ctx の状態が変わるので在線線用に戻す。
                ctx.strokeStyle = color;
                ctx.lineWidth = 1;
              }
            }
          }
        }
      }
    }
  };

  drawDir(occupancy.kudari, view.displayKudari);
  drawDir(occupancy.nobori, view.displayNobori);
  ctx.lineWidth = 1;
}

/** 補助列車線の長さ(原典 30 Dgr 秒 + m_iYDcd30SecondLength = 30 * DcdPerDgrY)。 */
const AUX_LINE_DGR_SECONDS = 30;

/**
 * 補助列車線を描く(原典 CRessyaDraw.cpp:1301-1327 着側 / :1732-1760 発側)。
 *
 * 作業コードが **-2 か -4 のときだけ**描く短い斜線。
 * - 着側: 着 X から 30 Dgr 秒**手前**へ。Y は (下り && -2) || (上り && -4) なら上、他は下。
 * - 発側: 発 X から 30 Dgr 秒**先**へ。Y は着側と逆符号。
 * - アンカーの駅線は **-4 のとき反対側**になる(-4 = 起点方へ発車 / 到着)。
 */
function drawAuxTrackLines(
  ctx: RenderContext2D,
  t: DiagramViewState['transform'],
  line: RessyaOccupancy['trackLines'][number],
  houkou: 0 | 1,
  yChakuStation: number,
  yHatsuStation: number,
  color: string,
  xRange: readonly [number, number],
): void {
  const first = line.zaisenCont[0];
  const last = line.zaisenCont[line.zaisenCont.length - 1];
  if (first === undefined || last === undefined) return;
  const dy = AUX_LINE_DGR_SECONDS * t.pxPerSecY;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;

  const chakuOp = line.chakuOperation;
  if (chakuOp === -2 || chakuOp === -4) {
    // -4 は「発側から到着」= 反対側の駅線にアンカーする。
    const anchor = chakuOp === -4 ? yHatsuStation : yChakuStation;
    const up = (houkou === 0 && chakuOp === -2) || (houkou === 1 && chakuOp === -4);
    for (const shift of enumShiftSeconds(
      [first.dgrXChaku - AUX_LINE_DGR_SECONDS, first.dgrXChaku],
      xRange[0],
      xRange[1],
    )) {
      const x0 = xDgrToView(t, first.dgrXChaku + shift);
      const x1 = xDgrToView(t, first.dgrXChaku - AUX_LINE_DGR_SECONDS + shift);
      const y0 = yDgrToView(t, anchor);
      strokeLine(ctx, x0, y0, x1, y0 + (up ? -dy : dy));
    }
  }

  const hatsuOp = line.hatsuOperation;
  if (hatsuOp === -2 || hatsuOp === -4) {
    const anchor = hatsuOp === -4 ? yChakuStation : yHatsuStation;
    const down = (houkou === 0 && hatsuOp === -2) || (houkou === 1 && hatsuOp === -4);
    for (const shift of enumShiftSeconds(
      [last.dgrXHatsu, last.dgrXHatsu + AUX_LINE_DGR_SECONDS],
      xRange[0],
      xRange[1],
    )) {
      const x0 = xDgrToView(t, last.dgrXHatsu + shift);
      const x1 = xDgrToView(t, last.dgrXHatsu + AUX_LINE_DGR_SECONDS + shift);
      const y0 = yDgrToView(t, anchor);
      strokeLine(ctx, x0, y0, x1, y0 + (down ? dy : -dy));
    }
  }
  ctx.restore();
}
