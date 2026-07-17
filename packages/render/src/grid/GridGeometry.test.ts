// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 oudia-second-web contributors

import { describe, it, expect } from 'vitest';
import { GridGeometry } from './GridGeometry.js';

describe('GridGeometry', () => {
  const g = new GridGeometry([50, 30, 30, 30], [20, 16, 16, 16, 16]);

  it('総サイズ・列幅・行高', () => {
    expect(g.colCount).toBe(4);
    expect(g.rowCount).toBe(5);
    expect(g.totalWidth).toBe(140);
    expect(g.totalHeight).toBe(84);
    expect(g.colLeft(2)).toBe(80);
    expect(g.colWidth(1)).toBe(30);
    expect(g.rowTop(2)).toBe(36);
    expect(g.rowHeight(0)).toBe(20);
  });

  it('座標 → 行列番号', () => {
    expect(g.colAt(0)).toBe(0);
    expect(g.colAt(55)).toBe(1);
    expect(g.colAt(139)).toBe(3);
    expect(g.colAt(140)).toBe(-1); // 範囲外
    expect(g.rowAt(20)).toBe(1);
    expect(g.rowAt(-1)).toBe(-1);
  });

  it('可視列/行範囲', () => {
    const cols = g.visibleCols(55, 85);
    expect(cols.begin).toBeLessThanOrEqual(1);
    expect(cols.end).toBeGreaterThanOrEqual(3);
    const rows = g.visibleRows(0, 20);
    expect(rows.begin).toBe(0);
    expect(rows.end).toBeGreaterThanOrEqual(1);
  });

  it('往復: colLeft(colAt(x)) <= x < colLeft+colWidth', () => {
    for (const x of [0, 49, 50, 79, 80, 139]) {
      const c = g.colAt(x);
      expect(g.colLeft(c)).toBeLessThanOrEqual(x);
      expect(x).toBeLessThan(g.colLeft(c) + g.colWidth(c));
    }
  });
});
