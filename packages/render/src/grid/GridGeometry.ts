// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 up-tri
//
// Based on OuDiaSecond (Copyright (C) 2017-2026 diagram_mania)
// and OuDia (Copyright (C) 2006-2017 take-okm)

/**
 * グリッドのジオメトリ(原典 CDcdGrid の行高・列幅管理。design/06_rendering §4.2)。
 * 行高・列幅の prefix-sum 配列を持ち、座標 ⇔ 行列番号を O(log n) / O(1) で変換する。
 */

export class GridGeometry {
  /** 列境界の prefix-sum(colEdge[i] = 列 0..i-1 の幅の和。colEdge[0]=0)。 */
  private readonly colEdge: Float64Array;
  /** 行境界の prefix-sum。 */
  private readonly rowEdge: Float64Array;

  constructor(colWidths: readonly number[], rowHeights: readonly number[]) {
    this.colEdge = prefixSum(colWidths);
    this.rowEdge = prefixSum(rowHeights);
  }

  get colCount(): number {
    return this.colEdge.length - 1;
  }
  get rowCount(): number {
    return this.rowEdge.length - 1;
  }
  /** グリッド全体の幅(px)。 */
  get totalWidth(): number {
    return this.colEdge[this.colEdge.length - 1] ?? 0;
  }
  /** グリッド全体の高さ(px)。 */
  get totalHeight(): number {
    return this.rowEdge[this.rowEdge.length - 1] ?? 0;
  }

  /** 列 col の左端 x(px)。 */
  colLeft(col: number): number {
    return this.colEdge[clampIndex(col, this.colCount)] ?? 0;
  }
  /** 列 col の幅(px)。 */
  colWidth(col: number): number {
    const i = clampIndex(col, this.colCount);
    return (this.colEdge[i + 1] ?? 0) - (this.colEdge[i] ?? 0);
  }
  /** 行 row の上端 y(px)。 */
  rowTop(row: number): number {
    return this.rowEdge[clampIndex(row, this.rowCount)] ?? 0;
  }
  /** 行 row の高さ(px)。 */
  rowHeight(row: number): number {
    const i = clampIndex(row, this.rowCount);
    return (this.rowEdge[i + 1] ?? 0) - (this.rowEdge[i] ?? 0);
  }

  /** x 座標(px)→ 列番号。範囲外は -1。 */
  colAt(x: number): number {
    return edgeSearch(this.colEdge, x);
  }
  /** y 座標(px)→ 行番号。範囲外は -1。 */
  rowAt(y: number): number {
    return edgeSearch(this.rowEdge, y);
  }

  /**
   * 表示範囲 [begin, end)(px)と交差する列番号の範囲 [beginCol, endCol) を返す。
   */
  visibleCols(xBegin: number, xEnd: number): { begin: number; end: number } {
    return visibleRange(this.colEdge, xBegin, xEnd);
  }
  /** 表示範囲と交差する行番号の範囲。 */
  visibleRows(yBegin: number, yEnd: number): { begin: number; end: number } {
    return visibleRange(this.rowEdge, yBegin, yEnd);
  }
}

function prefixSum(sizes: readonly number[]): Float64Array {
  const edge = new Float64Array(sizes.length + 1);
  let acc = 0;
  for (let i = 0; i < sizes.length; i++) {
    edge[i] = acc;
    acc += sizes[i] ?? 0;
  }
  edge[sizes.length] = acc;
  return edge;
}

function clampIndex(i: number, count: number): number {
  if (i < 0) return 0;
  if (i >= count) return Math.max(0, count - 1);
  return i;
}

/** edge[k] <= v < edge[k+1] となる k(セル番号)。範囲外 -1。 */
function edgeSearch(edge: Float64Array, v: number): number {
  const count = edge.length - 1;
  if (count <= 0) return -1;
  if (v < (edge[0] ?? 0) || v >= (edge[count] ?? 0)) return -1;
  let lo = 0;
  let hi = count;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if ((edge[mid + 1] ?? 0) <= v) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function visibleRange(
  edge: Float64Array,
  begin: number,
  end: number,
): { begin: number; end: number } {
  const count = edge.length - 1;
  if (count <= 0) return { begin: 0, end: 0 };
  // begin 以上になる最初のセル(1 つ手前も交差し得る)。
  let lo = 0;
  let hi = count;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if ((edge[mid + 1] ?? 0) <= begin) lo = mid + 1;
    else hi = mid;
  }
  const beginCol = Math.max(0, lo);
  // end を超える最初のセル境界。
  lo = 0;
  hi = count;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if ((edge[mid] ?? 0) < end) lo = mid + 1;
    else hi = mid;
  }
  const endCol = Math.min(count, lo);
  return { begin: beginCol, end: Math.max(beginCol, endCol) };
}
