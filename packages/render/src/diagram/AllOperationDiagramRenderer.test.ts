// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 up-tri

/**
 * 運用一覧図レンダラの単体テスト。M7e。
 * 座標変換(px/秒 = 表示範囲を幅にフィット)・行高・ラベルの重なり回避を検証する。
 */

import type { OperationDiagramRow } from '@oudia-web/derive';
import { asColorref } from '@oudia-web/format';
import { describe, expect, it } from 'vitest';
import { MockCtx } from '../testMockCtx.js';
import type {
  AllOperationDiagramTheme,
  AllOperationDiagramView,
} from './AllOperationDiagramRenderer.js';
import {
  drawAllOperationDiagram,
  layoutAllOperationDiagram,
  rowOfY,
  xOfSec,
  yOfRow,
} from './AllOperationDiagramRenderer.js';

const THEME: AllOperationDiagramTheme = {
  gridColor: '#ccc',
  jikuColor: '#ddd',
  stringColor: '#000',
  headerBackColor: '#eee',
  backColor: '#fff',
  font: '12px sans-serif',
  jikokuFont: '11px sans-serif',
};

const VIEW: AllOperationDiagramView = {
  viewStartSec: 4 * 3600,
  viewRangeSec: 86400,
  firstRow: 0,
  vlineMode: 3,
  displayEkimeiJikoku: true,
  viewW: 1000,
  viewH: 400,
  kitenJikoku: 4 * 3600,
};

function texts(ctx: MockCtx): string[] {
  return ctx.calls.filter((c) => c.op === 'fillText').map((c) => String(c.args[0]));
}

describe('layoutAllOperationDiagram', () => {
  it('px/秒 は「表示範囲を図領域の幅にフィット」で決まる(倍率ではない)', () => {
    const ctx = new MockCtx();
    const a = layoutAllOperationDiagram(ctx, VIEW, THEME, 5);
    const b = layoutAllOperationDiagram(ctx, { ...VIEW, viewRangeSec: 43200 }, THEME, 5);
    // 表示範囲を半分にすると px/秒 は倍になる。
    expect(b.pxPerSec).toBeCloseTo(a.pxPerSec * 2, 6);
    // 図領域の幅を広げても px/秒 が変わる(ウィンドウ依存)。
    const c = layoutAllOperationDiagram(ctx, { ...VIEW, viewW: 2000 }, THEME, 5);
    expect(c.pxPerSec).toBeGreaterThan(a.pxPerSec);
  });

  it('行高は文字高 × 2 + 4', () => {
    const ctx = new MockCtx();
    const layout = layoutAllOperationDiagram(ctx, VIEW, THEME, 5);
    // 12px フォント → 文字高 15 → 行高 34。
    expect(layout.rowH).toBe(15 * 2 + 4);
  });

  it('左右パネルを消すと図領域が広がる', () => {
    const ctx = new MockCtx();
    const on = layoutAllOperationDiagram(ctx, VIEW, THEME, 5);
    const off = layoutAllOperationDiagram(ctx, { ...VIEW, displayEkimeiJikoku: false }, THEME, 5);
    expect(off.graphW).toBeGreaterThan(on.graphW);
  });
});

describe('座標変換', () => {
  it('表示開始秒が図領域の左端 + マージンに載る', () => {
    const ctx = new MockCtx();
    const layout = layoutAllOperationDiagram(ctx, VIEW, THEME, 5);
    expect(xOfSec(layout, VIEW, VIEW.viewStartSec)).toBeCloseTo(layout.graphX + 2, 6);
  });

  it('Y ↔ 行 index が往復する', () => {
    const ctx = new MockCtx();
    const layout = layoutAllOperationDiagram(ctx, VIEW, THEME, 5);
    for (const row of [0, 1, 5]) {
      expect(rowOfY(layout, VIEW, yOfRow(layout, VIEW, row))).toBe(row);
    }
  });
});

describe('drawAllOperationDiagram', () => {
  const row = (over: Partial<OperationDiagramRow> = {}): OperationDiagramRow => ({
    operationNumber: '1',
    segments: [
      {
        fromSec: 6 * 3600,
        toSec: 8 * 3600,
        senColor: asColorref(0),
        senStyle: 'jissen',
        lineWidth: 2,
        info: '1M 普通',
      },
    ],
    ekimeiLabels: [
      { sec: 6 * 3600, text: 'A', sameAsPrev: false },
      { sec: 8 * 3600, text: 'B', sameAsPrev: false },
    ],
    minuteLabels: [],
    ...over,
  });

  const panel = [
    {
      operationNumber: '1',
      outEkimei: '甲駅',
      outJikokuText: ' 6:00',
      inEkimei: '乙駅',
      inJikokuText: ' 8:00',
    },
  ];

  it('運用番号・出入区駅名・列車情報・駅名略称を描く', () => {
    const ctx = new MockCtx();
    const layout = layoutAllOperationDiagram(ctx, VIEW, THEME, 5);
    drawAllOperationDiagram(ctx, layout, VIEW, THEME, [row()], panel);
    const t = texts(ctx);
    expect(t).toContain('1M 普通');
    expect(t).toContain('甲駅');
    expect(t).toContain('乙駅');
    expect(t).toContain('A');
    expect(t).toContain('B');
    // 行番号は 1 始まり。
    expect(t).toContain('1');
  });

  it('★同一駅のラベルが近ければ 1 個に統合する(原典 :986-1010)', () => {
    const ctx = new MockCtx();
    const layout = layoutAllOperationDiagram(ctx, VIEW, THEME, 5);
    // 終着 8:00 と次の始発 8:01 が同一駅 → 統合されて 1 個になる。
    const r = row({
      ekimeiLabels: [
        { sec: 6 * 3600, text: 'A', sameAsPrev: false },
        { sec: 8 * 3600, text: 'B', sameAsPrev: false },
        { sec: 8 * 3600 + 60, text: 'B', sameAsPrev: true },
      ],
    });
    drawAllOperationDiagram(ctx, layout, VIEW, THEME, [r], panel);
    expect(texts(ctx).filter((x) => x === 'B')).toHaveLength(1);
  });

  it('同一駅でも十分離れていれば 2 個とも描く', () => {
    const ctx = new MockCtx();
    const layout = layoutAllOperationDiagram(ctx, VIEW, THEME, 5);
    const r = row({
      ekimeiLabels: [
        { sec: 8 * 3600, text: 'B', sameAsPrev: false },
        { sec: 20 * 3600, text: 'B', sameAsPrev: true },
      ],
    });
    drawAllOperationDiagram(ctx, layout, VIEW, THEME, [r], panel);
    expect(texts(ctx).filter((x) => x === 'B')).toHaveLength(2);
  });

  it('別駅で重なるときは左右へ押し広げて両方描く(原典 :1012-1078)', () => {
    const ctx = new MockCtx();
    const layout = layoutAllOperationDiagram(ctx, VIEW, THEME, 5);
    const r = row({
      ekimeiLabels: [
        { sec: 8 * 3600, text: 'B', sameAsPrev: false },
        { sec: 8 * 3600 + 30, text: 'C', sameAsPrev: false },
      ],
    });
    drawAllOperationDiagram(ctx, layout, VIEW, THEME, [r], panel);
    const t = texts(ctx);
    expect(t).toContain('B');
    expect(t).toContain('C');
    const xB = ctx.calls.find((c) => c.op === 'fillText' && c.args[0] === 'B')?.args[1] as number;
    const xC = ctx.calls.find((c) => c.op === 'fillText' && c.args[0] === 'C')?.args[1] as number;
    // 押し広げた結果、B は左・C は右になる。
    expect(xB).toBeLessThan(xC);
  });

  it('時目盛のラベルを出す(起点 4 時なら 5,6,7… )', () => {
    const ctx = new MockCtx();
    const layout = layoutAllOperationDiagram(ctx, VIEW, THEME, 5);
    drawAllOperationDiagram(ctx, layout, VIEW, THEME, [row()], panel);
    const t = texts(ctx);
    expect(t).toContain('5');
    expect(t).toContain('23');
    expect(t).toContain('0');
  });
});
