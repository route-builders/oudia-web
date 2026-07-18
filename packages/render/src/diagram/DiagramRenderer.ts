// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 up-tri
//
// Based on OuDiaSecond (Copyright (C) 2017-2026 diagram_mania)
// and OuDia (Copyright (C) 2006-2017 take-okm)

/**
 * ダイヤグラム描画本体(原典 CDcdDiagram::DcDraw + CRessyaDraw。design/06_rendering §1.2)。
 * derive の DiagramLayout + ViewTransform を受け、罫線・スジ・ラベル・停車記号を描く。
 * ストア非依存・入力は全部引数。L1/L2/L3 を個別に描けるようメソッドを分ける。
 */

import type { DiagramLayout, RessyaLayout } from '@oudia-web/derive';
import type { RenderContext2D } from '../core/RenderTarget.js';
import type { ViewTransform } from '../core/ViewTransform.js';
import { xDgrToView, yDgrToView } from '../core/ViewTransform.js';
import { drawRotatedText, ressyaLabelDeg, strokeLine } from '../core/primitives.js';
import type { FontSpec } from '../core/textStyle.js';
import { colorrefToCss, fontString } from '../core/textStyle.js';
import { enumShiftSeconds } from './culling.js';
import { DEFAULT_VLINE_MODE, enumVlines, VLINE_TABLE } from './vlineTable.js';

/** ダイヤグラム描画の見た目設定(色・フォント。render 独立)。 */
export interface DiagramTheme {
  /** 縦横軸色(罫線)。CSS 文字列。 */
  readonly axisColor: string;
  /** 主要駅横罫線色。 */
  readonly ekiLineColor: string;
  readonly labelFont: FontSpec;
  readonly hourLabelColor: string;
}

export interface DiagramViewState {
  readonly transform: ViewTransform;
  /** ビューポート(グラフ領域)サイズ(CSS px)。 */
  readonly viewW: number;
  readonly viewH: number;
  /** 縦罫線モード(0..7)。既定 1。 */
  readonly vlineMode: number;
  /** 下り/上り表示。 */
  readonly displayKudari: boolean;
  readonly displayNobori: boolean;
  /** 停車駅明示(○)。 */
  readonly displayStopMark: boolean;
}

const HOUR = 3600;
const DAY = 86400;

/** L1: 背景・縦罫線・横罫線・時ラベル。 */
export function drawL1(
  ctx: RenderContext2D,
  layout: DiagramLayout,
  view: DiagramViewState,
  theme: DiagramTheme,
): void {
  const t = view.transform;
  const xBegin = t.contentX;
  const xEnd = t.contentX + view.viewW / t.pxPerSecX;

  // 縦罫線。
  const mode = VLINE_TABLE[view.vlineMode] ?? VLINE_TABLE[DEFAULT_VLINE_MODE] ?? VLINE_TABLE[0];
  if (mode === undefined) return;
  ctx.strokeStyle = theme.axisColor;
  for (const v of enumVlines(mode, xBegin, xEnd)) {
    const x = xDgrToView(t, v.seconds);
    if (v.style === 'bold') {
      ctx.lineWidth = 2;
      ctx.setLineDash([]);
    } else if (v.style === 'solid') {
      ctx.lineWidth = 1;
      ctx.setLineDash([]);
    } else {
      ctx.lineWidth = 1;
      ctx.setLineDash([1, 2]);
    }
    strokeLine(ctx, x, 0, x, view.viewH);
  }
  ctx.setLineDash([]);

  // 横罫線(駅)。主要駅 = 太線。
  for (const eki of layout.frame.ekiLayouts) {
    const y = yDgrToView(t, eki.dgrYTer);
    if (y < -2 || y > view.viewH + 2) continue;
    ctx.strokeStyle = theme.ekiLineColor;
    ctx.lineWidth = eki.isSyuyou ? 2 : 1;
    strokeLine(ctx, 0, y, view.viewW, y);
  }

  // 時ラベル(毎正時)。
  ctx.fillStyle = theme.hourLabelColor;
  ctx.font = fontString(theme.labelFont);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  const firstHour = Math.ceil(xBegin / HOUR) * HOUR;
  for (let s = firstHour; s <= xEnd; s += HOUR) {
    const x = xDgrToView(t, s);
    ctx.fillText(String(Math.floor((((s % DAY) + DAY) % DAY) / HOUR)), x, 0);
  }
}

/** L2: スジ(列車線)。方向 × 列車 × shiftSecond の繰り返しで描く。 */
export function drawL2(
  ctx: RenderContext2D,
  layout: DiagramLayout,
  view: DiagramViewState,
  syubetsuColor: (syubetsuIndex: number) => { color: string; bold: boolean; dash: number[] },
): void {
  const t = view.transform;
  const xBegin = t.contentX;
  const xEnd = t.contentX + view.viewW / t.pxPerSecX;
  const drawDir = (list: readonly RessyaLayout[], houkou: 0 | 1): void => {
    for (const ressya of list) {
      if (ressya.dgrXZone === null || ressya.ressyasenCont.length === 0) continue;
      const style = syubetsuColor(ressya.syubetsuIndex);
      ctx.strokeStyle = style.color;
      ctx.lineWidth = style.bold ? 2 : 1;
      ctx.setLineDash(style.dash);
      for (const shift of enumShiftSeconds(ressya.dgrXZone, xBegin, xEnd)) {
        for (const sen of ressya.ressyasenCont) {
          const y1 = yDgrToView(t, ekiYAtOrder(layout, sen.kitenEkiOrder, houkou));
          const y2 = yDgrToView(t, ekiYAtOrder(layout, sen.syuutenEkiOrder, houkou));
          const x1 = xDgrToView(t, sen.kitenDgrX + shift);
          const x2 = xDgrToView(t, sen.syuutenDgrX + shift);
          strokeLine(ctx, x1, y1, x2, y2);
        }
      }
    }
    ctx.setLineDash([]);
  };

  if (view.displayKudari) drawDir(layout.ressyaLayouts[0], 0);
  if (view.displayNobori) drawDir(layout.ressyaLayouts[1], 1);
}

/** L3: 列車ラベル(回転)+ 停車記号。 */
export function drawL3(
  ctx: RenderContext2D,
  layout: DiagramLayout,
  view: DiagramViewState,
  theme: DiagramTheme,
  syubetsuLabelColor: (syubetsuIndex: number) => string,
): void {
  const t = view.transform;
  const xBegin = t.contentX;
  const xEnd = t.contentX + view.viewW / t.pxPerSecX;
  ctx.font = fontString(theme.labelFont);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';

  const drawDir = (list: readonly RessyaLayout[], houkou: 0 | 1): void => {
    for (const ressya of list) {
      if (ressya.dgrXZone === null || ressya.ressyasenCont.length === 0) continue;
      const first = ressya.ressyasenCont[0];
      if (first === undefined) continue;
      ctx.fillStyle = syubetsuLabelColor(ressya.syubetsuIndex);
      const label = labelText(ressya);
      if (label === '') continue;
      for (const shift of enumShiftSeconds(ressya.dgrXZone, xBegin, xEnd)) {
        const y1 = yDgrToView(t, ekiYAtOrder(layout, first.kitenEkiOrder, houkou));
        const y2 = yDgrToView(t, ekiYAtOrder(layout, first.syuutenEkiOrder, houkou));
        const x1 = xDgrToView(t, first.kitenDgrX + shift);
        const x2 = xDgrToView(t, first.syuutenDgrX + shift);
        const deg = ressyaLabelDeg(x2 - x1, y2 - y1, houkou);
        drawRotatedText(ctx, label, x1, y1, deg, 2);
      }
    }
  };

  if (view.displayKudari) drawDir(layout.ressyaLayouts[0], 0);
  if (view.displayNobori) drawDir(layout.ressyaLayouts[1], 1);
  // 停車記号(○)は在線表・停車秒判定を伴うため M3+ で追加する(design §1.5)。
}

function labelText(ressya: RessyaLayout): string {
  const parts: string[] = [];
  if (ressya.ressyabangou !== '') parts.push(ressya.ressyabangou);
  if (ressya.ressyamei !== '') parts.push(ressya.ressyamei);
  if (ressya.gousuu !== '') parts.push(`${ressya.gousuu}号`);
  return parts.join(' ');
}

/** 駅Order の Y 座標(方向基準。上りは Index 反転)。 */
function ekiYAtOrder(layout: DiagramLayout, ekiOrder: number, houkou: 0 | 1): number {
  const n = layout.frame.ekiLayouts.length;
  const idx = houkou === 0 ? ekiOrder : n - 1 - ekiOrder;
  return layout.frame.ekiLayouts[idx]?.dgrYTer ?? 0;
}

/** COLORREF → CSS(theme 構築の補助)。 */
export function colorref(c: number): string {
  return colorrefToCss(c);
}
