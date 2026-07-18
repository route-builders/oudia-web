// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 oudia-second-web contributors

/**
 * ビューポート座標(px)→ グリッドセル (row, col) のヒットテスト。
 * 固定列/固定行(左 fixedCols 列・上 fixedRows 行はスクロールしない)を考慮する
 * (design §04 固定 2 列 + 固定ヘッダ)。GridRenderer の描画配置と対称。
 */

import type { GridGeometry } from '@oudia/render';

export interface GridViewport {
  readonly scrollX: number;
  readonly scrollY: number;
  readonly fixedCols: number;
  readonly fixedRows: number;
}

/**
 * ビューポート内ピクセル (vx, vy) が指すセル。固定領域とスクロール領域で座標系が違う。
 * どのセルにも当たらなければ null。
 */
export function hitTestCell(
  geom: GridGeometry,
  view: GridViewport,
  vx: number,
  vy: number,
): { row: number; col: number } | null {
  const fixedW = geom.colLeft(view.fixedCols);
  const fixedH = geom.rowTop(view.fixedRows);

  // 列: 固定列内なら座標そのまま、スクロール域なら scrollX を足す。
  let col: number;
  if (vx < fixedW) {
    col = geom.colAt(vx);
  } else {
    col = geom.colAt(vx + view.scrollX);
    // スクロールで固定列の裏に隠れた列を拾わないよう、固定列域は上で処理済み。
    if (col !== -1 && col < view.fixedCols) return null;
  }

  let row: number;
  if (vy < fixedH) {
    row = geom.rowAt(vy);
  } else {
    row = geom.rowAt(vy + view.scrollY);
    if (row !== -1 && row < view.fixedRows) return null;
  }

  if (col === -1 || row === -1) return null;
  return { row, col };
}

/**
 * セル (row, col) の左上ビューポート座標(px)。固定領域は scroll を打ち消す。
 * フォーカス枠・IME オーバーレイの配置に使う。
 */
export function cellViewRect(
  geom: GridGeometry,
  view: GridViewport,
  row: number,
  col: number,
): { x: number; y: number; w: number; h: number } {
  const inFixedCol = col < view.fixedCols;
  const inFixedRow = row < view.fixedRows;
  const x = geom.colLeft(col) - (inFixedCol ? 0 : view.scrollX);
  const y = geom.rowTop(row) - (inFixedRow ? 0 : view.scrollY);
  return { x, y, w: geom.colWidth(col), h: geom.rowHeight(row) };
}
