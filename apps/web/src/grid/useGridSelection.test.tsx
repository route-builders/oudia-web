// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 oudia-second-web contributors
// @vitest-environment happy-dom

// useGridSelection: resetKey(ダイヤ/方向)変更で初期化・同一キーのグリッド変化でクランプ維持。

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { renderHook, act } from '@testing-library/react';
import { parseNodeTree, readRosenFile } from '@oudia/format';
import type { TimetableGridSpec } from '@oudia/derive';
import { buildTimetableGrid, defaultTimetableGridOptions } from '@oudia/derive';
import { useGridSelection } from './useGridSelection.js';

const here = dirname(fileURLToPath(import.meta.url));
const fixtures = join(here, '..', '..', '..', '..', 'packages', 'format', 'fixtures');

function loadGrid(): TimetableGridSpec {
  const bytes = new Uint8Array(readFileSync(join(fixtures, 'current', 'sample2.oud2')));
  const parsed = parseNodeTree(bytes);
  if (!parsed.ok) throw new Error('parse');
  const data = readRosenFile(parsed.root).data;
  const built = buildTimetableGrid(data, 0, defaultTimetableGridOptions(data, 0));
  if (!built.ok) throw new Error('grid');
  return built.grid;
}

describe('useGridSelection(resetKey とクランプ)', () => {
  const grid = loadGrid();

  it('同一 resetKey でグリッドだけ変わった(編集)ときはフォーカス位置を維持する', () => {
    const { result, rerender } = renderHook(
      ({ g, k }: { g: TimetableGridSpec; k: string }) => useGridSelection(g, k),
      { initialProps: { g: grid, k: '0:0' } },
    );
    act(() => {
      result.current.focusCell({ row: 3, col: 4 });
    });
    // 編集によるグリッド再構築(新しいオブジェクト・同一形状)。
    const rebuilt: TimetableGridSpec = { ...grid };
    rerender({ g: rebuilt, k: '0:0' });
    expect(result.current.selection.focus).toEqual({ row: 3, col: 4 });
  });

  it('グリッドが縮んだときはフォーカスを範囲内へクランプする', () => {
    const { result, rerender } = renderHook(
      ({ g, k }: { g: TimetableGridSpec; k: string }) => useGridSelection(g, k),
      { initialProps: { g: grid, k: '0:0' } },
    );
    act(() => {
      result.current.focusCell({ row: 2, col: grid.columns.length - 1 });
    });
    const shrunk: TimetableGridSpec = { ...grid, columns: grid.columns.slice(0, 4) };
    rerender({ g: shrunk, k: '0:0' });
    expect(result.current.selection.focus).toEqual({ row: 2, col: 3 });
  });

  it('resetKey が変わった(ダイヤ/方向切替)ときは初期選択へリセットする', () => {
    const { result, rerender } = renderHook(
      ({ g, k }: { g: TimetableGridSpec; k: string }) => useGridSelection(g, k),
      { initialProps: { g: grid, k: '0:0' } },
    );
    act(() => {
      result.current.focusCell({ row: 3, col: 4 });
    });
    rerender({ g: grid, k: '0:1' }); // 方向切替
    const init = { row: grid.rows.findIndex((r) => r.type === 'ressyabangou'), col: 2 };
    expect(result.current.selection.focus).toEqual(init);
  });
});
