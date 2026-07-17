// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 oudia-second-web contributors
//
// Based on OuDiaSecond (Copyright (C) 2017-2026 diagram_mania)
// and OuDia (Copyright (C) 2006-2017 take-okm)

/**
 * 通常時刻表ビュー(編集対応。design §05 3.1)。derive の buildTimetableGrid + render の
 * drawGrid に、フォーカス枠・選択ハイライトのオーバーレイと対話(クリック/キーボード/キー転送
 * ダイアログ)を重ねる。状態変更は store.dispatch(EditCommand)経由(architecture §4.3)。
 */

import { useMemo, useRef, useState, useCallback } from 'react';
import type { RosenFileData } from '@oudia/format';
import { buildTimetableGrid, defaultTimetableGridOptions } from '@oudia/derive';
import { GridGeometry, drawGrid } from '@oudia/render';
import type { GridTheme } from '@oudia/render';
import { useCanvas2d } from '../hooks/useCanvas2d.js';
import { useDocStore } from '../store/docStore.js';
import { useGridSelection } from '../grid/useGridSelection.js';
import { hitTestCell, cellViewRect } from '../grid/hitTest.js';
import { resolveCellTarget } from '../grid/cellSemantics.js';
import { getSelectedRessyaIndices } from '../grid/selection.js';
import { referJikokuFor } from '../grid/referJikoku.js';
import { EkiJikokuDialog } from '../dialog/EkiJikokuDialog.js';
import type { EkiJikokuDialogTarget } from '../dialog/EkiJikokuDialog.js';
import { RessyaPropDialog } from '../dialog/RessyaPropDialog.js';
import type { RessyaPropDialogTarget } from '../dialog/RessyaPropDialog.js';

const THEME: GridTheme = {
  cellFont: { pointTextHeight: 9, facename: '', bold: false, italic: false },
  gridLineColor: 'rgb(200,200,200)',
  headerBgColor: 'rgb(240,240,240)',
  defaultTextColor: 'rgb(0,0,0)',
  cellPadding: 3,
};

const ROW_H = 20;
const COL_W = 64;
const EKIMEI_W = 96;
const FIXED_ROWS = 0; // ヘッダ固定は M1 では簡略(全行スクロール)。
const FIXED_COLS = 2;

/** 開いているダイアログの状態(initial は常に指定・キー転送でなければ undefined)。 */
type ActiveDialog =
  | { kind: 'ekiJikoku'; target: EkiJikokuDialogTarget; initial: string | undefined }
  | { kind: 'ressyaProp'; target: RessyaPropDialogTarget; initial: string | undefined };

export function TimetableView(props: {
  data: RosenFileData;
  diaIndex: number;
  houkou: 0 | 1;
}): React.ReactElement {
  const { data, diaIndex, houkou } = props;
  const dispatch = useDocStore((s) => s.dispatch);
  const [scroll, setScroll] = useState({ x: 0, y: 0 });
  const scrollerRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const [dialog, setDialog] = useState<ActiveDialog | null>(null);

  const built = useMemo(
    () => buildTimetableGrid(data, diaIndex, defaultTimetableGridOptions(data, houkou)),
    [data, diaIndex, houkou],
  );
  const grid = built.ok ? built.grid : null;

  const geom = useMemo(() => {
    if (grid === null) return null;
    const cols = grid.columns.map((c) => (c.type === 'ekimei' ? EKIMEI_W : COL_W));
    const rows = grid.rows.map(() => ROW_H);
    return new GridGeometry(cols, rows);
  }, [grid]);

  // 選択状態(grid が null のときは空グリッドで代用してフック順序を保つ)。
  const emptyGrid = useMemo(
    () => ({ houkou, columns: [], rows: [], cells: [], ekijikokuRowRange: { begin: 0, end: 0 } }),
    [houkou],
  );
  const sel = useGridSelection(grid ?? emptyGrid);
  const view = useMemo(
    () => ({ scrollX: scroll.x, scrollY: scroll.y, fixedCols: FIXED_COLS, fixedRows: FIXED_ROWS }),
    [scroll.x, scroll.y],
  );

  // ダイアログを開く(セル target → 具体的ダイアログ)。
  const openDialogForCell = useCallback(
    (row: number, col: number, initial?: string): void => {
      if (grid === null) return;
      const target = resolveCellTarget(grid, row, col);
      if (target === null) return;
      const dia = data.rosen.diaCont[diaIndex];
      if (dia === undefined) return;
      const list = dia.ressyaCont[houkou];

      if (target.kind === 'ekiJikoku') {
        const ressya = list[target.ressyaIndex];
        if (ressya === undefined) return;
        const ej = ressya.ekiJikokuCont[target.ekiOrder];
        if (ej === undefined) return;
        const eki = data.rosen.ekiCont[target.ekiOrder];
        setDialog({
          kind: 'ekiJikoku',
          initial,
          target: {
            diaIndex,
            houkou,
            ressyaIndex: target.ressyaIndex,
            ekiOrder: target.ekiOrder,
            ekiJikoku: ej,
            ekimei: eki?.ekimei ?? '',
            ressyabangou: ressya.ressyabangou,
            referJikoku: referJikokuFor(ressya, target.ekiOrder),
          },
        });
      } else if (target.kind === 'ressyaProp') {
        const ressya = list[target.ressyaIndex];
        if (ressya === undefined) return;
        setDialog({
          kind: 'ressyaProp',
          initial,
          target: {
            diaIndex,
            houkou,
            ressyaIndex: target.ressyaIndex,
            ressya,
            syubetsuCont: data.rosen.ressyasyubetsuCont,
          },
        });
      }
      // ekimei / track / operation / newRessya は本 M3 のダイアログ対象外(v0.5-0.7)。
    },
    [grid, data, diaIndex, houkou],
  );

  const onCanvasClick = useCallback(
    (e: React.MouseEvent): void => {
      if (geom === null || grid === null) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const hit = hitTestCell(geom, view, e.clientX - rect.left, e.clientY - rect.top);
      if (hit === null) return;
      sel.clickCell(hit, { shift: e.shiftKey, ctrl: e.ctrlKey || e.metaKey });
      rootRef.current?.focus();
    },
    [geom, grid, view, sel],
  );

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent): void => {
      if (grid === null) return;
      switch (e.key) {
        case 'ArrowUp':
          e.preventDefault();
          sel.arrow(-1, 0, e.shiftKey);
          return;
        case 'ArrowDown':
          e.preventDefault();
          sel.arrow(1, 0, e.shiftKey);
          return;
        case 'ArrowLeft':
          e.preventDefault();
          sel.arrow(0, -1, e.shiftKey);
          return;
        case 'ArrowRight':
        case 'Tab':
          e.preventDefault();
          sel.arrow(0, e.shiftKey && e.key === 'Tab' ? -1 : 1, false);
          return;
        case 'Enter':
          e.preventDefault();
          openDialogForCell(sel.selection.focus.row, sel.selection.focus.col);
          return;
        default:
          break;
      }
      // printable キー(1 文字・修飾なし)→ キー転送ダイアログ。
      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        openDialogForCell(sel.selection.focus.row, sel.selection.focus.col, e.key);
      }
    },
    [grid, sel, openDialogForCell],
  );

  const selectedRessya = useMemo(
    () =>
      grid === null ? new Set<number>() : new Set(getSelectedRessyaIndices(sel.selection, grid)),
    [grid, sel.selection],
  );

  const canvasRef = useCanvas2d(
    (ctx, size) => {
      if (grid === null || geom === null) return;
      drawGrid(
        ctx,
        grid,
        geom,
        {
          scrollX: scroll.x,
          scrollY: scroll.y,
          viewW: size.w,
          viewH: size.h,
          fixedCols: FIXED_COLS,
          fixedRows: FIXED_ROWS,
        },
        THEME,
      );
      drawSelectionOverlay(ctx, grid, geom, view, sel.selection.focus, selectedRessya);
    },
    [grid, geom, scroll, sel.selection, selectedRessya],
  );

  if (grid === null || geom === null) {
    return <div className="view-error">時刻表を生成できませんでした。</div>;
  }

  return (
    <div className="grid-root" ref={rootRef} tabIndex={0} onKeyDown={onKeyDown}>
      <canvas ref={canvasRef} className="grid-content" />
      <div
        ref={scrollerRef}
        className="grid-scroller"
        onScroll={(e) => {
          const el = e.currentTarget;
          setScroll({ x: el.scrollLeft, y: el.scrollTop });
        }}
        onClick={onCanvasClick}
      >
        <div className="grid-spacer" style={{ width: geom.totalWidth, height: geom.totalHeight }} />
      </div>

      {dialog?.kind === 'ekiJikoku' && (
        <EkiJikokuDialog
          target={dialog.target}
          {...(dialog.initial !== undefined ? { initialKeyString: dialog.initial } : {})}
          dispatch={dispatch}
          onClose={() => {
            setDialog(null);
            rootRef.current?.focus();
          }}
        />
      )}
      {dialog?.kind === 'ressyaProp' && (
        <RessyaPropDialog
          target={dialog.target}
          {...(dialog.initial !== undefined ? { initialKeyString: dialog.initial } : {})}
          dispatch={dispatch}
          onClose={() => {
            setDialog(null);
            rootRef.current?.focus();
          }}
        />
      )}
    </div>
  );
}

/** フォーカス枠(点線)+ 選択列ハイライトを Canvas に重ね描き(design §6.1)。 */
function drawSelectionOverlay(
  ctx: CanvasRenderingContext2D,
  grid: import('@oudia/derive').TimetableGridSpec,
  geom: GridGeometry,
  view: { scrollX: number; scrollY: number; fixedCols: number; fixedRows: number },
  focus: { row: number; col: number },
  selectedRessya: ReadonlySet<number>,
): void {
  // 選択列(列車)のハイライト(半透明)。
  if (selectedRessya.size > 0) {
    ctx.fillStyle = 'rgba(29,95,176,0.15)';
    for (let c = 0; c < grid.columns.length; c++) {
      const col = grid.columns[c];
      if (col?.type !== 'ressya' || !selectedRessya.has(col.ressyaIndex)) continue;
      const r = cellViewRect(geom, view, 0, c);
      ctx.fillRect(r.x, 0, r.w, geom.totalHeight);
    }
  }
  // フォーカス枠(点線)。
  const fr = cellViewRect(geom, view, focus.row, focus.col);
  ctx.save();
  ctx.strokeStyle = 'rgb(29,95,176)';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([3, 2]);
  ctx.strokeRect(fr.x + 0.5, fr.y + 0.5, fr.w - 1, fr.h - 1);
  ctx.restore();
}
