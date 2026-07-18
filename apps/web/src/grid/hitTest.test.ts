// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 up-tri

import { GridGeometry } from '@oudia-web/render';
import { describe, expect, it } from 'vitest';
import { cellViewRect, hitTestCell } from './hitTest.js';

// 列幅 [40, 40, 60, 60](固定 2 列)、行高 [20, 20, 20, 20](固定 1 行)。
const geom = new GridGeometry([40, 40, 60, 60], [20, 20, 20, 20]);
const view = { scrollX: 0, scrollY: 0, fixedCols: 2, fixedRows: 1 };

describe('hitTestCell', () => {
  it('固定列・固定行はスクロール無視でそのまま', () => {
    expect(hitTestCell(geom, view, 10, 10)).toEqual({ row: 0, col: 0 });
    expect(hitTestCell(geom, view, 50, 10)).toEqual({ row: 0, col: 1 });
  });

  it('スクロール域は scroll を加味する', () => {
    // 固定列幅 = 80。スクロール 0 なら vx=90 → colAt(90) = 列 2。
    expect(hitTestCell(geom, { ...view, scrollX: 0 }, 90, 30)).toEqual({ row: 1, col: 2 });
    // scrollX=60 で vx=90 → colAt(150) = 列 3。
    expect(hitTestCell(geom, { ...view, scrollX: 60 }, 90, 30)).toEqual({ row: 1, col: 3 });
  });

  it('範囲外は null', () => {
    expect(hitTestCell(geom, view, 9999, 9999)).toBeNull();
  });
});

describe('cellViewRect', () => {
  it('固定列は scroll を打ち消す', () => {
    const r = cellViewRect(geom, { ...view, scrollX: 100 }, 0, 0);
    expect(r).toEqual({ x: 0, y: 0, w: 40, h: 20 });
  });

  it('スクロール列は scrollX を引く', () => {
    // 列 2 の左端 = 80。scrollX=30 → x = 50。
    const r = cellViewRect(geom, { ...view, scrollX: 30 }, 1, 2);
    expect(r.x).toBe(50);
    expect(r.w).toBe(60);
  });
});
