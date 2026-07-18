// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 up-tri

/**
 * 時刻表グリッドの選択状態フック。selection.ts の純ロジックを React state で包む。
 * resetKey(ダイヤ/方向)が変わったら初期選択へリセットし、同一 resetKey でグリッドだけが
 * 変わった(= 編集による再構築)ときはフォーカス位置を保って範囲内へクランプする。
 */

import type { TimetableGridSpec } from '@oudia-web/derive';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { CellPos, SelectionState } from './selection.js';
import {
    clampSelection,
    extendBox,
    initialSelection,
    moveFocus,
    moveFocusCellToNext,
    moveFocusCellToPrev,
    setFocus,
    toggleRandom,
} from './selection.js';

export interface GridSelectionApi {
  selection: SelectionState;
  /** クリック: Shift=箱型・Ctrl/Meta=ランダム・素=単一。 */
  clickCell: (pos: CellPos, mods: { shift: boolean; ctrl: boolean }) => void;
  /** 矢印移動: extend=Shift 押下で箱型選択を伸ばす。 */
  arrow: (dRow: number, dCol: number, extend: boolean) => void;
  /** 明示的にフォーカスを設定(検索ヒット・Undo 後のフォーカス移動等)。 */
  focusCell: (pos: CellPos) => void;
  /** 編集後・Ctrl+K の次セル移動(原典 moveFocusCellToNext。moveRight はビュー設定)。 */
  moveNext: (moveRight: boolean, nextEkiOrder: boolean) => void;
  /** Ctrl+Shift+K の前セル移動。 */
  movePrev: (moveRight: boolean) => void;
}

export function useGridSelection(grid: TimetableGridSpec, resetKey = ''): GridSelectionApi {
  const [selection, setSelection] = useState<SelectionState>(() => initialSelection(grid));
  const prevResetKey = useRef(resetKey);

  useEffect(() => {
    if (prevResetKey.current !== resetKey) {
      // ダイヤ/方向の切替 → 初期選択へ。
      prevResetKey.current = resetKey;
      setSelection(initialSelection(grid));
    } else {
      // 編集によるグリッド再構築 → フォーカス位置を保って範囲内へクランプ。
      setSelection((s) => clampSelection(s, grid));
    }
  }, [grid, resetKey]);

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

  const moveNext = useCallback(
    (moveRight: boolean, nextEkiOrder: boolean) => {
      setSelection((s) => moveFocusCellToNext(s, grid, moveRight, nextEkiOrder));
    },
    [grid],
  );

  const movePrev = useCallback(
    (moveRight: boolean) => {
      setSelection((s) => moveFocusCellToPrev(s, grid, moveRight));
    },
    [grid],
  );

  return { selection, clickCell, arrow, focusCell, moveNext, movePrev };
}
