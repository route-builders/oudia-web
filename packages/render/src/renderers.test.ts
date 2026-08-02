// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 up-tri

// レンダラのスモークテスト(実 fixture → derive → render をモック ctx で記録)。
// 描画コマンドが発行され、テキスト・線が破綻なく出ることを確認する(ピクセル比較はしない)。

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { RessyaTrackLine } from '@oudia-web/derive';
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
import { chamferLeft, chamferRight, drawOccupancy } from './diagram/OccupancyRenderer.js';
import { drawOperationMarks } from './diagram/OperationMarkRenderer.js';
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

describe('drawOperationMarks(運用記号)', () => {
  const theme = {
    senColor: '#000',
    mojiColor: '#333',
    outerLabelColor: '#666',
    font: '10px sans-serif',
  };
  const geom = { xOf: (x: number) => x, baseY: 100, markSize: 12 };
  const ops = (ctx: MockCtx): string[] => ctx.calls.map((c) => c.op);
  const texts = (ctx: MockCtx): string[] =>
    ctx.calls.filter((c) => c.op === 'fillText').map((c) => String(c.args[0]));

  it('出区 ○ は中抜きの円 + 運番ラベル', () => {
    const ctx = new MockCtx();
    drawOperationMarks(
      ctx,
      [{ kind: 'outCircle', dgrX: 50, yShift: -1, operationNumber: '5' }],
      geom,
      theme,
    );
    expect(ops(ctx)).toContain('arc');
    expect(ops(ctx)).not.toContain('fill'); // 中抜き(NULLBRUSH)
    expect(texts(ctx)).toContain('5');
  });

  it('入区 △ は 3 点を閉じた折れ線(塗らない)', () => {
    const ctx = new MockCtx();
    drawOperationMarks(
      ctx,
      [{ kind: 'inTriangle', dgrX: 80, yShift: 1, operationNumber: '' }],
      geom,
      theme,
    );
    expect(ops(ctx).filter((o) => o === 'lineTo')).toHaveLength(2);
    expect(ops(ctx)).toContain('closePath');
    expect(ops(ctx)).not.toContain('fill');
    expect(texts(ctx)).toHaveLength(0); // 空運番はラベルを出さない
  });

  it('前列車接続は 3 次ベジェで描く', () => {
    const ctx = new MockCtx();
    drawOperationMarks(
      ctx,
      [{ kind: 'prevJunctionArc', dgrXLeft: 10, dgrXRight: 90, leftShape: 0, rightShape: 1 }],
      geom,
      theme,
    );
    expect(ops(ctx)).toContain('bezierCurveTo');
  });

  it('路線外斜線は 1 本の線 + 駅名ラベル', () => {
    const ctx = new MockCtx();
    drawOperationMarks(
      ctx,
      [
        {
          kind: 'outerSlash',
          dgrXInner: 100,
          dgrXOuter: 58,
          yShift: -1,
          isSihatsu: true,
          label: '車庫 5',
        },
      ],
      geom,
      theme,
    );
    expect(ops(ctx).filter((o) => o === 'lineTo')).toHaveLength(1);
    expect(texts(ctx)).toContain('車庫 5');
  });
});

describe('drawOccupancy(補助列車線)', () => {
  /** 最小の在線行 1 本を持つダミー layout。 */
  function fakeLayout(dgrYOrg: number, dgrYTer: number, laneY: number) {
    return {
      frame: {
        ekiLayouts: [
          {
            ekiIndex: 0,
            ekimei: 'A',
            isSyuyou: true,
            dgrYOrg,
            dgrYTer,
            trackLanes: [{ trackIndex: 0, dgrY: laneY }],
          },
        ],
        dgrXPosMin: 0,
        dgrXSize: 86400,
        dgrYSize: 2000,
      },
      ressyaLayouts: [[], []],
    } as unknown as Parameters<typeof drawOccupancy>[1];
  }

  const view = {
    // contentX=0 / contentY=0、X は 1000px で 10000 秒ぶん、Y は等倍。
    transform: createViewTransform(0, 0, 0.1, 1),
    viewW: 1000,
    viewH: 800,
    displayKudari: true,
    displayNobori: true,
    displayStopMark: false,
  } as unknown as Parameters<typeof drawOccupancy>[2];

  function line(over: Partial<RessyaTrackLine> = {}): RessyaTrackLine {
    return {
      ekiIndex: 0,
      ekiOrder: 0,
      isTrackDisplay: true,
      ekiatsukai: 'teisya' as const,
      zaisenCont: [{ trackIndex: 0, dgrXChaku: 3600, dgrXHatsu: 3660 }],
      chakuOperation: -1,
      hatsuOperation: -1,
      outerEkiIndex: null,
      prevRessyahoukou: null,
      operationNumber: '',
      ...over,
    };
  }

  function strokeCount(ctx: MockCtx): number {
    return ctx.calls.filter((c) => c.op === 'stroke').length;
  }

  it('★在線横線の面取り: 左端は着作業コード、右端は発作業コードで決まる(符号が逆)', () => {
    // -1/-2/-3/4 → 左 -1 / 右 +1、-4/-5 → 左 +1 / 右 -1、0/3 → 0。
    for (const c of [-1, -2, -3, 4] as const) {
      expect(chamferLeft(line({ chakuOperation: c }), 0)).toBe(-1);
    }
    for (const c of [-4, -5] as const) {
      expect(chamferLeft(line({ chakuOperation: c }), 0)).toBe(1);
    }
    for (const c of [0, 2, 3] as const) {
      expect(chamferLeft(line({ chakuOperation: c }), 0)).toBe(0);
    }
    for (const h of [-1, -2, -3, 4] as const) {
      expect(chamferRight(line({ hatsuOperation: h }), 0)).toBe(1);
    }
    for (const h of [-4, -5] as const) {
      expect(chamferRight(line({ hatsuOperation: h }), 0)).toBe(-1);
    }
    for (const h of [0, 1, 3] as const) {
      expect(chamferRight(line({ hatsuOperation: h }), 0)).toBe(0);
    }
  });

  it('★着作業コード 5(前列車接続)の左端面取りは前列車の方向', () => {
    expect(chamferLeft(line({ chakuOperation: 5, prevRessyahoukou: -1 }), 0)).toBe(-1);
    expect(chamferLeft(line({ chakuOperation: 5, prevRessyahoukou: 1 }), 0)).toBe(1);
    // 未解決(探索前)は 0。
    expect(chamferLeft(line({ chakuOperation: 5, prevRessyahoukou: null }), 0)).toBe(0);
  });

  it('★2 個目以降の在線は隣の番線との前後で面取りが決まる', () => {
    const l = line({
      zaisenCont: [
        { trackIndex: 0, dgrXChaku: 3600, dgrXHatsu: 3620 },
        { trackIndex: 2, dgrXChaku: 3620, dgrXHatsu: 3660 },
      ],
    });
    // 2 個目の左端: 自分(2)> 前(0)→ -1。
    expect(chamferLeft(l, 1)).toBe(-1);
    // 1 個目の右端: 次(2)の方が大きい → neighborChamfer は +1、右端はその符号反転で -1。
    expect(chamferRight(l, 0)).toBe(-1);
  });

  it('作業コードが -1 のときは補助列車線を描かない', () => {
    const base = new MockCtx();
    drawOccupancy(
      base,
      fakeLayout(100, 200, 150),
      view,
      { kudari: [{ houkou: 0, syubetsuIndex: 0, trackLines: [line({})] }], nobori: [] },
      () => '#000',
      '#ccc',
    );
    const aux = new MockCtx();
    drawOccupancy(
      aux,
      fakeLayout(100, 200, 150),
      view,
      {
        kudari: [{ houkou: 0, syubetsuIndex: 0, trackLines: [line({ hatsuOperation: -2 })] }],
        nobori: [],
      },
      () => '#000',
      '#ccc',
    );
    // -2 のぶんだけストロークが増える。
    expect(strokeCount(aux)).toBeGreaterThan(strokeCount(base));
  });

  it('★在線表を持たない駅の行でも補助列車線だけは描く', () => {
    const ctx = new MockCtx();
    drawOccupancy(
      ctx,
      fakeLayout(100, 200, 150),
      view,
      {
        kudari: [
          {
            houkou: 0,
            syubetsuIndex: 0,
            trackLines: [line({ isTrackDisplay: false, hatsuOperation: -4 })],
          },
        ],
        nobori: [],
      },
      () => '#000',
      '#ccc',
    );
    // 横線・コネクタは出ないが補助列車線は出る。
    expect(strokeCount(ctx)).toBeGreaterThan(0);
  });

  it('★着発コネクタは作業コードが負のときだけ引く(原典 :1253 / :1685)', () => {
    // chaku=0(出区でも中間でもない)/ hatsu=0 → 縦線なし。
    const none = new MockCtx();
    drawOccupancy(
      none,
      fakeLayout(100, 200, 150),
      view,
      {
        kudari: [
          {
            houkou: 0,
            syubetsuIndex: 0,
            trackLines: [line({ chakuOperation: 0, hatsuOperation: 0 })],
          },
        ],
        nobori: [],
      },
      () => '#000',
      '#ccc',
    );
    // chaku=-1 / hatsu=-1 → 縦線 2 本ぶん増える。
    const both = new MockCtx();
    drawOccupancy(
      both,
      fakeLayout(100, 200, 150),
      view,
      { kudari: [{ houkou: 0, syubetsuIndex: 0, trackLines: [line({})] }], nobori: [] },
      () => '#000',
      '#ccc',
    );
    expect(strokeCount(both)).toBe(strokeCount(none) + 2);
  });

  it('★次列車接続(hatsuOperation=5)の横線は描かない(次列車に委任)', () => {
    const ctx = new MockCtx();
    drawOccupancy(
      ctx,
      fakeLayout(100, 200, 150),
      view,
      {
        kudari: [
          {
            houkou: 0,
            syubetsuIndex: 0,
            trackLines: [line({ chakuOperation: 0, hatsuOperation: 5 })],
          },
        ],
        nobori: [],
      },
      () => '#000',
      '#ccc',
    );
    // 唯一の Zaisen が最後でもあるので在線の横線も縦線も出ない
    // (残る 1 本は番線レーンの下地罫線)。
    expect(strokeCount(ctx)).toBe(1);
  });
});
