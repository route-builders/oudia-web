// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 oudia-second-web contributors
//
// Based on OuDiaSecond (Copyright (C) 2017-2026 diagram_mania)
// and OuDia (Copyright (C) 2006-2017 take-okm)

/**
 * 時刻表グリッド描画(原典 CDcdGrid + CWndDcdGrid の描画部。design/06_rendering §4.3)。
 * derive の TimetableGridSpec + GridGeometry を受け、4 象限(固定コーナー/固定行/固定列/
 * 可動ボディ)に分けてセル + 罫線を描く。CellSpec が意味を持ち、レンダラは機械的に描く。
 */

import type { CellSpec, TimetableGridSpec } from '@oudia/derive';
import { MARK_GLYPH } from '@oudia/derive';
import type { RenderContext2D } from '../core/RenderTarget.js';
import { colorrefToCss, fontString } from '../core/textStyle.js';
import type { FontSpec } from '../core/textStyle.js';
import { drawVerticalText } from '../core/primitives.js';
import { GridGeometry } from './GridGeometry.js';

/** グリッド描画のテーマ(色・フォント)。 */
export interface GridTheme {
  readonly cellFont: FontSpec;
  readonly gridLineColor: string;
  readonly headerBgColor: string;
  readonly defaultTextColor: string;
  readonly cellPadding: number;
}

/** グリッドのスクロール状態。 */
export interface GridViewState {
  readonly scrollX: number;
  readonly scrollY: number;
  readonly viewW: number;
  readonly viewH: number;
  /** 固定列数(時刻表は 2 = 駅名 + 着発)。 */
  readonly fixedCols: number;
  /** 固定行数(ヘッダ)。 */
  readonly fixedRows: number;
}

/** セルの表示テキスト(マークは glyph 解決)。 */
export function cellText(cell: CellSpec): string {
  if (cell.kind === 'mark' && cell.mark !== null) {
    return MARK_GLYPH[cell.mark];
  }
  return cell.text;
}

/**
 * グリッド全体を描く(content レイヤ)。4 象限クリップで固定行列を実現する。
 */
export function drawGrid(
  ctx: RenderContext2D,
  grid: TimetableGridSpec,
  geom: GridGeometry,
  view: GridViewState,
  theme: GridTheme,
): void {
  ctx.font = fontString(theme.cellFont);
  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';

  const fixedW = geom.colLeft(view.fixedCols);
  const fixedH = geom.rowTop(view.fixedRows);

  // 4 象限を描く。各象限で可視セル範囲を求めて描画する。
  // ボディ: 固定行列を除いた可動域。X/Y 両方スクロール。
  drawQuadrant(ctx, grid, geom, view, theme, {
    clipX: fixedW,
    clipY: fixedH,
    clipW: view.viewW - fixedW,
    clipH: view.viewH - fixedH,
    offsetX: -view.scrollX,
    offsetY: -view.scrollY,
    colBegin: view.fixedCols,
    rowBegin: view.fixedRows,
  });
  // 固定行(上部ヘッダ): X のみスクロール。
  drawQuadrant(ctx, grid, geom, view, theme, {
    clipX: fixedW,
    clipY: 0,
    clipW: view.viewW - fixedW,
    clipH: fixedH,
    offsetX: -view.scrollX,
    offsetY: 0,
    colBegin: view.fixedCols,
    rowBegin: 0,
    rowEndFixed: view.fixedRows,
  });
  // 固定列(左): Y のみスクロール。
  drawQuadrant(ctx, grid, geom, view, theme, {
    clipX: 0,
    clipY: fixedH,
    clipW: fixedW,
    clipH: view.viewH - fixedH,
    offsetX: 0,
    offsetY: -view.scrollY,
    colBegin: 0,
    rowBegin: view.fixedRows,
    colEndFixed: view.fixedCols,
  });
  // 固定コーナー(左上): スクロールなし。
  drawQuadrant(ctx, grid, geom, view, theme, {
    clipX: 0,
    clipY: 0,
    clipW: fixedW,
    clipH: fixedH,
    offsetX: 0,
    offsetY: 0,
    colBegin: 0,
    rowBegin: 0,
    colEndFixed: view.fixedCols,
    rowEndFixed: view.fixedRows,
  });
}

interface QuadrantSpec {
  clipX: number;
  clipY: number;
  clipW: number;
  clipH: number;
  offsetX: number;
  offsetY: number;
  colBegin: number;
  rowBegin: number;
  colEndFixed?: number;
  rowEndFixed?: number;
}

function drawQuadrant(
  ctx: RenderContext2D,
  grid: TimetableGridSpec,
  geom: GridGeometry,
  view: GridViewState,
  theme: GridTheme,
  q: QuadrantSpec,
): void {
  if (q.clipW <= 0 || q.clipH <= 0) return;
  ctx.save();
  ctx.beginPath();
  ctx.rect(q.clipX, q.clipY, q.clipW, q.clipH);
  ctx.clip();
  ctx.translate(q.offsetX, q.offsetY);

  // 可視セル範囲(スクロール適用後の px を geom 座標へ戻す)。
  const visX0 = q.clipX - q.offsetX;
  const visY0 = q.clipY - q.offsetY;
  const cols = geom.visibleCols(visX0, visX0 + q.clipW);
  const rows = geom.visibleRows(visY0, visY0 + q.clipH);

  const colEnd = q.colEndFixed ?? cols.end;
  const rowEnd = q.rowEndFixed ?? rows.end;
  const colStart = Math.max(q.colBegin, cols.begin);
  const rowStart = Math.max(q.rowBegin, rows.begin);

  for (let r = rowStart; r < rowEnd; r++) {
    const rowCells = grid.cells[r];
    if (rowCells === undefined) continue;
    const y = geom.rowTop(r);
    const h = geom.rowHeight(r);
    for (let c = colStart; c < colEnd; c++) {
      const cell = rowCells[c];
      if (cell === undefined) continue;
      const x = geom.colLeft(c);
      const w = geom.colWidth(c);
      drawCell(ctx, cell, x, y, w, h, theme, r < view.fixedRows || c < view.fixedCols);
    }
  }

  // 罫線(可視域の格子)。
  ctx.strokeStyle = theme.gridLineColor;
  ctx.lineWidth = 1;
  for (let c = colStart; c <= colEnd; c++) {
    const x = geom.colLeft(c);
    ctx.beginPath();
    ctx.moveTo(x, geom.rowTop(rowStart));
    ctx.lineTo(x, geom.rowTop(rowEnd));
    ctx.stroke();
  }
  for (let r = rowStart; r <= rowEnd; r++) {
    const y = geom.rowTop(r);
    ctx.beginPath();
    ctx.moveTo(geom.colLeft(colStart), y);
    ctx.lineTo(geom.colLeft(colEnd), y);
    ctx.stroke();
  }

  ctx.restore();
}

function drawCell(
  ctx: RenderContext2D,
  cell: CellSpec,
  x: number,
  y: number,
  w: number,
  h: number,
  theme: GridTheme,
  isFixed: boolean,
): void {
  // 背景。
  const bg = cell.style.backColor;
  if (bg !== null) {
    ctx.fillStyle = colorrefToCss(bg);
    ctx.fillRect(x, y, w, h);
  } else if (isFixed) {
    ctx.fillStyle = theme.headerBgColor;
    ctx.fillRect(x, y, w, h);
  }

  const text = cellText(cell);
  if (text === '') return;
  ctx.fillStyle =
    cell.style.mojiColor !== null ? colorrefToCss(cell.style.mojiColor) : theme.defaultTextColor;
  const pad = theme.cellPadding;
  if (cell.style.tategaki) {
    drawVerticalText(ctx, text, x + pad, y + pad, ctx.measureText('あ').width);
  } else {
    ctx.fillText(text, x + pad, y + pad);
  }
}
