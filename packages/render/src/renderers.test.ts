// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 up-tri

// レンダラのスモークテスト(実 fixture → derive → render をモック ctx で記録)。
// 描画コマンドが発行され、テキスト・線が破綻なく出ることを確認する(ピクセル比較はしない)。

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildTimetableGrid,
  computeDiagramLayout,
  defaultTimetableGridOptions,
} from '@oudia-web/derive';
import type { RosenFileData } from '@oudia-web/format';
import { parseNodeTree, readRosenFile } from '@oudia-web/format';
import { describe, expect, it } from 'vitest';
import { createViewTransform, viewTransformFromZone } from './core/ViewTransform.js';
import type { DiagramTheme, DiagramViewState } from './diagram/DiagramRenderer.js';
import { drawL1, drawL2, drawL3 } from './diagram/DiagramRenderer.js';
import { GridGeometry } from './grid/GridGeometry.js';
import { drawGrid } from './grid/GridRenderer.js';
import { MockCtx } from './testMockCtx.js';

const here = dirname(fileURLToPath(import.meta.url));
function loadSample(): RosenFileData {
  const p = join(here, '..', '..', 'format', 'fixtures', 'current', 'sample2.oud2');
  const parsed = parseNodeTree(new Uint8Array(readFileSync(p)));
  if (!parsed.ok) throw new Error('parse');
  return readRosenFile(parsed.root).data;
}

const THEME: DiagramTheme = {
  axisColor: 'rgb(192,192,192)',
  ekiLineColor: 'rgb(0,0,0)',
  labelFont: { pointTextHeight: 9, facename: '', bold: false, italic: false },
  hourLabelColor: 'rgb(0,0,0)',
};

const SYUBETSU_STYLE = () => ({ color: 'rgb(0,0,0)', bold: false, dash: [] as number[] });

describe('DiagramRenderer(sample2)', () => {
  it('L1 は縦罫線・横罫線・時ラベルを描く', () => {
    const data = loadSample();
    const r = computeDiagramLayout(data, 0);
    if (!r.ok) throw new Error('layout');
    const ctx = new MockCtx();
    const view: DiagramViewState = {
      transform: viewTransformFromZone([0, 86400], [0, r.layout.frame.dgrYSize], 1000, 600),
      viewW: 1000,
      viewH: 600,
      vlineMode: 1,
      displayKudari: true,
      displayNobori: true,
      displayStopMark: false,
    };
    drawL1(ctx, r.layout, view, THEME);
    expect(ctx.count('stroke')).toBeGreaterThan(0); // 罫線
    // 時ラベル(0〜23 のどれか)。
    expect(ctx.texts().some((t) => /^\d+$/.test(t))).toBe(true);
  });

  it('L2 はスジ(列車線)を描く', () => {
    const data = loadSample();
    const r = computeDiagramLayout(data, 0);
    if (!r.ok) throw new Error('layout');
    const ctx = new MockCtx();
    const view: DiagramViewState = {
      transform: createViewTransform(0, 0),
      viewW: 5000,
      viewH: 3000,
      vlineMode: 1,
      displayKudari: true,
      displayNobori: false,
      displayStopMark: false,
    };
    drawL2(ctx, r.layout, view, SYUBETSU_STYLE);
    // スジは moveTo/lineTo/stroke の連なり。
    expect(ctx.count('stroke')).toBeGreaterThan(10);
  });

  it('L3 は列車ラベルを回転描画する', () => {
    const data = loadSample();
    const r = computeDiagramLayout(data, 0);
    if (!r.ok) throw new Error('layout');
    const ctx = new MockCtx();
    const view: DiagramViewState = {
      transform: createViewTransform(0, 0),
      viewW: 5000,
      viewH: 3000,
      vlineMode: 1,
      displayKudari: true,
      displayNobori: false,
      displayStopMark: false,
    };
    drawL3(ctx, r.layout, view, THEME, () => 'rgb(0,0,0)');
    expect(ctx.has('rotate')).toBe(true);
    // 列車番号 001 等が描かれる。
    expect(ctx.texts().some((t) => t.includes('001'))).toBe(true);
  });
});

describe('GridRenderer(sample2)', () => {
  it('セルテキストと罫線を描く(固定行列クリップつき)', () => {
    const data = loadSample();
    const g = buildTimetableGrid(data, 0, defaultTimetableGridOptions(data, 0));
    if (!g.ok) throw new Error('grid');
    const cols = g.grid.columns.map(() => 60);
    const rows = g.grid.rows.map(() => 18);
    const geom = new GridGeometry(cols, rows);
    const ctx = new MockCtx();
    drawGrid(
      ctx,
      g.grid,
      geom,
      { scrollX: 0, scrollY: 0, viewW: 800, viewH: 500, fixedCols: 2, fixedRows: 8 },
      {
        cellFont: { pointTextHeight: 9, facename: '', bold: false, italic: false },
        gridLineColor: 'rgb(200,200,200)',
        headerBgColor: 'rgb(240,240,240)',
        defaultTextColor: 'rgb(0,0,0)',
        cellPadding: 2,
      },
    );
    // クリップ(4 象限)+ セルテキスト + 罫線。
    expect(ctx.has('clip')).toBe(true);
    expect(ctx.count('stroke')).toBeGreaterThan(0);
    expect(ctx.texts().some((t) => t.includes('列車番号'))).toBe(true);
    // 通過マーク ﾚ が glyph 解決されて描かれる。
    expect(ctx.texts().some((t) => t.includes('ﾚ'))).toBe(true);
  });
});
