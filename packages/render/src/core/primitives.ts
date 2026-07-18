// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 up-tri
//
// Based on OuDiaSecond (Copyright (C) 2017-2026 diagram_mania)
// and OuDia (Copyright (C) 2006-2017 take-okm)

/**
 * 描画プリミティブ(原典 CDcdLine/CDcdFreeLine/回転テキスト/縦書き/Ellipse の対応。
 * design/06_rendering §1.4/§1.5/§4.3/§6.2)。すべて RenderContext2D 上で動く純手続き。
 */

import type { RenderContext2D } from './RenderTarget.js';

/** 線種(原典 ESenStyle)。 */
export type SenStyle = 'jissen' | 'hasen' | 'tensen' | 'ittensasen';

/** 線種 → Canvas setLineDash パターン(design §1.4 の確定値)。 */
export const DASH_PATTERN: Record<SenStyle, number[]> = {
  jissen: [],
  hasen: [6, 3],
  tensen: [2, 2],
  ittensasen: [8, 3, 2, 3],
};

/** 折れ線を 1 ストロークで描く。 */
export function strokePolyline(
  ctx: RenderContext2D,
  points: readonly { x: number; y: number }[],
): void {
  const first = points[0];
  if (points.length < 2 || first === undefined) return;
  ctx.beginPath();
  ctx.moveTo(first.x, first.y);
  for (let i = 1; i < points.length; i++) {
    const p = points[i];
    if (p !== undefined) ctx.lineTo(p.x, p.y);
  }
  ctx.stroke();
}

/** 単一線分を描く。 */
export function strokeLine(
  ctx: RenderContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

/**
 * 回転テキスト(原典 GDI lfEscapement → ctx.rotate。design §1.5)。
 * deg は GDI 角度(反時計回り)。Canvas は時計回り正なので符号反転して適用する。
 * テキストは基準点から上方向に offsetY だけずらして描く。
 */
export function drawRotatedText(
  ctx: RenderContext2D,
  text: string,
  x: number,
  y: number,
  deg: number,
  offsetY: number,
): void {
  const rad = (-deg * Math.PI) / 180;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rad);
  ctx.fillText(text, 0, -offsetY);
  ctx.restore();
}

/**
 * 縦書きテキスト(原典 CDcdTextboxV3。design §4.3)。1 文字ずつ縦に積む。
 * @param lineHeight 文字送り(フォント行高)
 */
export function drawVerticalText(
  ctx: RenderContext2D,
  text: string,
  x: number,
  y: number,
  lineHeight: number,
): void {
  let cy = y;
  for (const ch of text) {
    ctx.fillText(ch, x, cy);
    cy += lineHeight;
  }
}

/** 停車記号 ○(白抜き。塗り = 背景色、縁 = スジ色。design §1.5)。 */
export function drawStopMark(
  ctx: RenderContext2D,
  x: number,
  y: number,
  radius: number,
  fillColor: string,
  strokeColor: string,
): void {
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  const prevFill = ctx.fillStyle;
  const prevStroke = ctx.strokeStyle;
  ctx.fillStyle = fillColor;
  ctx.fill();
  ctx.strokeStyle = strokeColor;
  ctx.stroke();
  ctx.fillStyle = prevFill;
  ctx.strokeStyle = prevStroke;
}

/**
 * 列車ラベルの回転角(度)を求める(原典式。design §1.5)。
 *   下り: 270 + atan(dxPx / dyPx)、上り: 90 - atan(dxPx / dyPx)。
 * @param houkou 0 = 下り / 1 = 上り
 */
export function ressyaLabelDeg(dxPx: number, dyPx: number, houkou: 0 | 1): number {
  const atan = (Math.atan2(dxPx, dyPx) * 180) / Math.PI;
  return houkou === 0 ? 270 + atan : 90 - atan;
}
