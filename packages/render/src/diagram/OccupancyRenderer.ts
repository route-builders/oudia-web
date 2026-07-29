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

/** 駅Index → 駅線 Y(dgrYTer)。 */
function stationYIndex(layout: DiagramLayout): Map<number, number> {
  const m = new Map<number, number>();
  for (const eki of layout.frame.ekiLayouts) m.set(eki.ekiIndex, eki.dgrYTer);
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
        if (laneMap === undefined || staY === undefined) continue;
        for (const z of line.zaisenCont) {
          const laneY = laneMap.get(z.trackIndex);
          if (laneY === undefined) continue; // 省略番線 → 描かない
          // dgrX の全体 Zone(この Zaisen 単体)。日跨ぎ繰り返しでビュー内へ。
          const zone: readonly [number, number] = [
            Math.min(z.dgrXChaku, z.dgrXHatsu),
            Math.max(z.dgrXChaku, z.dgrXHatsu),
          ];
          for (const shift of enumShiftSeconds(zone, xBegin, xEnd)) {
            const xC = xDgrToView(t, z.dgrXChaku + shift);
            const xH = xDgrToView(t, z.dgrXHatsu + shift);
            const yLane = yDgrToView(t, laneY);
            const yStation = yDgrToView(t, staY);
            // 横太線(占有)。停車 = 太線、通過 = 細線(通過は在線時間ほぼ 0)。
            ctx.strokeStyle = color;
            ctx.lineWidth = line.ekiatsukai === 'teisya' ? 3 : 1;
            strokeLine(ctx, xC, yLane, xH, yLane);
            // 着コネクタ(駅線 → レーン)+ 発コネクタ(レーン → 駅線)。
            ctx.lineWidth = 1;
            strokeLine(ctx, xC, yStation, xC, yLane);
            strokeLine(ctx, xH, yLane, xH, yStation);

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
