// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 up-tri
//
// Based on OuDiaSecond (Copyright (C) 2017-2026 diagram_mania)
// and OuDia (Copyright (C) 2006-2017 take-okm)

/**
 * ダイヤグラム上の運用記号の描画(原典 CRessyaDraw::RessyaTrackLineDraw の記号部)。M7d。
 *
 * derive の deriveOperationMarks が返す幾何(Dgr 座標 + 上下符号)を、
 * 与えられた基準 Y(在線表表示駅ならレーン Y、非表示駅なら駅線 Y)から実座標へ落として描く。
 *
 * ★寸法 D = DiagramDgrYZahyouKyoriDefault(既定 60 Dgr 秒)× Y スケール。
 * X 半径も D/2 なので X ズームに依らず円形を保つ(原典 :3724-3725)。
 */

import type { OperationMark, OperationNumberLabel } from '@oudia-web/derive';
import type { RenderContext2D } from '../core/RenderTarget.js';

export interface OperationMarkTheme {
  /** 記号の線色(種別のダイヤグラム線色)。 */
  readonly senColor: string;
  /** 運用番号ラベルの色(原典 getDiaMojiColor)。 */
  readonly mojiColor: string;
  /** 路線外駅名ラベルの色(原典 getJikokuhyouMojiColor)。 */
  readonly outerLabelColor: string;
  readonly font: string;
}

export interface OperationMarkGeometry {
  /** Dgr 秒 → ビュー X。 */
  readonly xOf: (dgrSecond: number) => number;
  /** 記号の基準 Y(在線表表示駅はレーン Y、非表示駅は駅線 Y)。 */
  readonly baseY: number;
  /** マーク寸法 D(px)。円の高さ・三角の高さ・X 半径 D/2 の元。 */
  readonly markSize: number;
}

/** 運用記号を 1 駅ぶん描く。 */
export function drawOperationMarks(
  ctx: RenderContext2D,
  marks: readonly OperationMark[],
  geom: OperationMarkGeometry,
  theme: OperationMarkTheme,
): void {
  const d = geom.markSize;
  const r = d / 2;
  ctx.save();
  ctx.lineWidth = 1;
  ctx.strokeStyle = theme.senColor;
  ctx.font = theme.font;
  ctx.textBaseline = 'top';

  for (const mark of marks) {
    switch (mark.kind) {
      case 'outCircle': {
        // 中抜きの円(原典 Ellipse + NULLBRUSH、:1336-1482)。
        const cx = geom.xOf(mark.dgrX);
        const cy = geom.baseY + (mark.yShift * d) / 2;
        // ellipse は RenderContext2D に無いので translate + scale + arc で描く。
        // X 半径 = D/2、Y 半径 = D/2 なので実際は真円(原典も X 半径 D/2)。
        ctx.save();
        ctx.translate(cx, cy);
        ctx.scale(r / (d / 2), 1);
        ctx.beginPath();
        ctx.arc(0, 0, d / 2, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
        // ラベルは ○ の左側に右寄せ(原典 :1461-1478)。
        drawLabel(ctx, mark.operationNumber, cx - r, geom.baseY, -1, mark.yShift, theme.mojiColor);
        break;
      }
      case 'inTriangle': {
        // 頂点 = 基準 Y、底辺 = 基準 Y + yShift*D(原典 Polygon + NULLBRUSH、:1766-1915)。
        const cx = geom.xOf(mark.dgrX);
        const by = geom.baseY + mark.yShift * d;
        ctx.beginPath();
        ctx.moveTo(cx, geom.baseY);
        ctx.lineTo(cx - r, by);
        ctx.lineTo(cx + r, by);
        ctx.closePath();
        ctx.stroke();
        // ラベルは △ の右側に左寄せ(原典 :1903-1912)。
        drawLabel(ctx, mark.operationNumber, cx + r, geom.baseY, 1, mark.yShift, theme.mojiColor);
        break;
      }
      case 'outerSlash': {
        // 路線外発着の斜線(原典 :1484-1578 / :1921-2009)。
        const xi = geom.xOf(mark.dgrXInner);
        const xo = geom.xOf(mark.dgrXOuter);
        const yo = geom.baseY + mark.yShift * d * 0.7;
        ctx.beginPath();
        ctx.moveTo(xi, geom.baseY);
        ctx.lineTo(xo, yo);
        ctx.stroke();
        drawLabel(
          ctx,
          mark.label,
          xo,
          geom.baseY,
          mark.isSihatsu ? -1 : 1,
          mark.yShift,
          theme.outerLabelColor,
        );
        break;
      }
      case 'prevJunctionArc': {
        // 前列車の着 → この列車の発 を結ぶ円弧(原典 ConnectNextNoDisplayDraw、:2248-2288)。
        const x1 = geom.xOf(mark.dgrXLeft);
        const x2 = geom.xOf(mark.dgrXRight);
        const y = geom.baseY;
        // 制御点は両端の向き符号に応じて外側へ振る(原典 PolyBezier の近似)。
        const lift = d;
        ctx.beginPath();
        ctx.moveTo(x1, y);
        ctx.bezierCurveTo(
          x1 + (x2 - x1) / 3,
          y - (mark.leftShape >= 0 ? lift : -lift),
          x2 - (x2 - x1) / 3,
          y - mark.rightShape * lift,
          x2,
          y,
        );
        ctx.stroke();
        break;
      }
    }
  }
  ctx.restore();
}

/**
 * 運用番号ラベルのアンカー規則(原典 OperationNumberDraw、:3198-3302)。
 * X: xShift<0 → 右寄せ / >0 → 左寄せ / 0 → 中央。
 * Y: yShift<0 → 線の上、yShift>0 → 線の下、0 → 上。
 */
function drawLabel(
  ctx: RenderContext2D,
  text: string,
  x: number,
  lineY: number,
  xShift: number,
  yShift: number,
  color: string,
): void {
  if (text === '') return;
  const w = ctx.measureText(text).width;
  const h = Number.parseFloat(ctx.font) || 10;
  const px = xShift < 0 ? x - w : xShift > 0 ? x : x - w / 2;
  const py = yShift > 0 ? lineY : lineY - h;
  const prev = ctx.fillStyle;
  ctx.fillStyle = color;
  ctx.fillText(text, px, py);
  ctx.fillStyle = prev;
}

/** 在線横線の中央に出す運用番号ラベルを描く(原典 :1000-1022)。 */
export function drawOperationNumberLabels(
  ctx: RenderContext2D,
  labels: readonly OperationNumberLabel[],
  xOf: (dgrSecond: number) => number,
  laneYOf: (trackIndex: number) => number,
  theme: OperationMarkTheme,
): void {
  ctx.save();
  ctx.font = theme.font;
  ctx.textBaseline = 'top';
  for (const label of labels) {
    drawLabel(
      ctx,
      label.text,
      xOf(label.dgrX),
      laneYOf(label.trackIndex),
      0,
      label.yShift,
      theme.mojiColor,
    );
  }
  ctx.restore();
}
