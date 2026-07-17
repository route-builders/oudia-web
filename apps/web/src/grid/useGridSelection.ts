// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 oudia-second-web contributors

/**
 * 時刻表グリッドの選択状態フック。selection.ts の純ロジックを React state で包む。
 * グリッドが変わったら初期選択へリセットする。
 */

import { useCallback, useEffect, useState } from 'react';
import type { TimetableGridSpec } from '@oudia/derive';
import type { CellPos, SelectionState } from './selection.js';
import { initialSelection, setFocus, extendBox, toggleRandom, moveFocus } from './selection.js';

export interface GridSelectionApi {
  selection: SelectionState;
  /** クリック: Shift=箱型・Ctrl/Meta=ランダム・素=単一。 */
  clickCell: (pos: CellPos, mods: { shift: boolean; ctrl: boolean }) => void;
  /** 矢印移動: extend=Shift 押下で箱型選択を伸ばす。 */
  arrow: (dRow: number, dCol: number, extend: boolean) => void;
  /** 明示的にフォーカスを設定(Undo 後のフォーカス移動等)。 */
  focusCell: (pos: CellPos) => void;
}

export function useGridSelection(grid: TimetableGridSpec): GridSelectionApi {
  const [selection, setSelection] = useState<SelectionState>(() => initialSelection(grid));

  // グリッド(ダイヤ/方向)が変わったら初期化。
  useEffect(() => {
    setSelection(initialSelection(grid));
  }, [grid]);

  const clickCell = useCallback((pos: CellPos, mods: { shift: boolean; ctrl: boolean }) => {
    setSelection((s) => {
      if (mods.ctrl) return toggleRandom(s, pos);
      if (mods.shift) return extendBox(s, pos);
      return setFocus(pos);
    });
  }, []);

  const arrow = useCallback(
    (dRow: number, dCol: number, extend: boolean) => {
      setSelection((s) => moveFocus(s, grid, dRow, dCol, extend));
    },
    [grid],
  );

  const focusCell = useCallback((pos: CellPos) => {
    setSelection(setFocus(pos));
  }, []);

  return { selection, clickCell, arrow, focusCell };
}
