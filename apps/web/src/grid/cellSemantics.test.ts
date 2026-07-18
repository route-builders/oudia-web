// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 up-tri

import type { TimetableGridSpec } from '@oudia-web/derive';
import { buildTimetableGrid, defaultTimetableGridOptions } from '@oudia-web/derive';
import { parseNodeTree, readRosenFile } from '@oudia-web/format';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { resolveCellTarget } from './cellSemantics.js';

const here = dirname(fileURLToPath(import.meta.url));
const fixtures = join(here, '..', '..', '..', '..', 'packages', 'format', 'fixtures');

function loadGrid(): TimetableGridSpec {
  const bytes = new Uint8Array(readFileSync(join(fixtures, 'current', 'sample2.oud2')));
  const parsed = parseNodeTree(bytes);
  if (!parsed.ok) throw new Error('parse');
  const data = readRosenFile(parsed.root).data;
  const built = buildTimetableGrid(data, 0, defaultTimetableGridOptions(data, 0));
  if (!built.ok) throw new Error('grid build failed');
  return built.grid;
}

describe('セル意味解決', () => {
  const grid = loadGrid();
  const findRow = (t: string): number => grid.rows.findIndex((r) => r.type === t);
  const ressyaCol = grid.columns.findIndex((c) => c.type === 'ressya');
  const ekimeiCol = grid.columns.findIndex((c) => c.type === 'ekimei');
  const chakuhatsuCol = grid.columns.findIndex((c) => c.type === 'chakuhatsu');

  it('駅名列 → ekimei', () => {
    const chakuRow = findRow('chaku');
    const t = resolveCellTarget(grid, chakuRow, ekimeiCol);
    expect(t?.kind).toBe('ekimei');
  });

  it('着発ラベル列 → chakuhatsu', () => {
    const t = resolveCellTarget(grid, 0, chakuhatsuCol);
    expect(t?.kind).toBe('chakuhatsu');
  });

  it('列車列 × 列車番号行 → ressyaProp', () => {
    const t = resolveCellTarget(grid, findRow('ressyabangou'), ressyaCol);
    expect(t).toMatchObject({ kind: 'ressyaProp', ressyaIndex: 0, rowType: 'ressyabangou' });
  });

  it('列車列 × 着行 → ekiJikoku(chaku, ekiOrder)', () => {
    const chakuRow = findRow('chaku');
    const ekiOrder = grid.rows[chakuRow]!.ekiOrder;
    const t = resolveCellTarget(grid, chakuRow, ressyaCol);
    expect(t).toMatchObject({ kind: 'ekiJikoku', ressyaIndex: 0, target: 'chaku', ekiOrder });
  });

  it('列車列 × 発行 → ekiJikoku(hatsu)', () => {
    const t = resolveCellTarget(grid, findRow('hatsu'), ressyaCol);
    expect(t).toMatchObject({ kind: 'ekiJikoku', target: 'hatsu' });
  });

  it('列車列 × 備考行 → ressyaProp(bikou)', () => {
    const t = resolveCellTarget(grid, findRow('bikou'), ressyaCol);
    expect(t).toMatchObject({ kind: 'ressyaProp', rowType: 'bikou' });
  });

  it('範囲外は null', () => {
    expect(resolveCellTarget(grid, 9999, 0)).toBeNull();
    expect(resolveCellTarget(grid, 0, 9999)).toBeNull();
  });
});
