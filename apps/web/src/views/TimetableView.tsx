// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 oudia-second-web contributors

/**
 * 通常時刻表ビュー(読み取り専用)。derive の buildTimetableGrid + render の drawGrid。
 * ネイティブスクロール(spacer div)で可視域を再描画する(design §4.1)。
 */

import { useMemo, useRef, useState } from 'react';
import type { RosenFileData } from '@oudia/format';
import { buildTimetableGrid, defaultTimetableGridOptions } from '@oudia/derive';
import { GridGeometry, drawGrid } from '@oudia/render';
import type { GridTheme } from '@oudia/render';
import { useCanvas2d } from '../hooks/useCanvas2d.js';

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

export function TimetableView(props: {
  data: RosenFileData;
  diaIndex: number;
  houkou: 0 | 1;
}): React.ReactElement {
  const { data, diaIndex, houkou } = props;
  const [scroll, setScroll] = useState({ x: 0, y: 0 });
  const scrollerRef = useRef<HTMLDivElement>(null);

  const built = useMemo(
    () => buildTimetableGrid(data, diaIndex, defaultTimetableGridOptions(data, houkou)),
    [data, diaIndex, houkou],
  );

  const geom = useMemo(() => {
    if (!built.ok) return null;
    const cols = built.grid.columns.map((c) => (c.type === 'ekimei' ? EKIMEI_W : COL_W));
    const rows = built.grid.rows.map(() => ROW_H);
    return new GridGeometry(cols, rows);
  }, [built]);

  const canvasRef = useCanvas2d(
    (ctx, size) => {
      if (!built.ok || geom === null) return;
      drawGrid(
        ctx,
        built.grid,
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
    },
    [built, geom, scroll],
  );

  if (!built.ok || geom === null) {
    return <div className="view-error">時刻表を生成できませんでした。</div>;
  }

  return (
    <div className="grid-root">
      <canvas ref={canvasRef} className="grid-content" />
      <div
        ref={scrollerRef}
        className="grid-scroller"
        onScroll={(e) => {
          const el = e.currentTarget;
          setScroll({ x: el.scrollLeft, y: el.scrollTop });
        }}
      >
        <div className="grid-spacer" style={{ width: geom.totalWidth, height: geom.totalHeight }} />
      </div>
    </div>
  );
}
