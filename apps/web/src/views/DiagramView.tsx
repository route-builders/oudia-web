// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 oudia-second-web contributors

/**
 * ダイヤグラムビュー(読み取り専用)。derive の computeDiagramLayout + render の drawL1/L2/L3。
 * M1 はドラッグパン + ホイール縦スクロールの最小構成(ズームは M3 で拡充)。
 */

import { useMemo, useRef, useState } from 'react';
import type { RosenFileData } from '@oudia/format';
import { computeDiagramLayout } from '@oudia/derive';
import { createViewTransform, drawL1, drawL2, drawL3, DEFAULT_PX_PER_SEC } from '@oudia/render';
import type { DiagramTheme } from '@oudia/render';
import { useCanvas2d } from '../hooks/useCanvas2d.js';

const THEME: DiagramTheme = {
  axisColor: 'rgb(192,192,192)',
  ekiLineColor: 'rgb(0,0,0)',
  labelFont: { pointTextHeight: 9, facename: '', bold: false, italic: false },
  hourLabelColor: 'rgb(0,0,0)',
};

// 種別の線色(M1 簡略。種別 index → 固定パレット)。
const PALETTE = ['#000000', '#c02020', '#2060c0', '#208020', '#a06000', '#8020a0'];
function syubetsuStyle(i: number): { color: string; bold: boolean; dash: number[] } {
  return { color: PALETTE[i % PALETTE.length] ?? '#000000', bold: false, dash: [] };
}
function syubetsuLabelColor(i: number): string {
  return PALETTE[i % PALETTE.length] ?? '#000000';
}

export function DiagramView(props: { data: RosenFileData; diaIndex: number }): React.ReactElement {
  const { data, diaIndex } = props;
  const [content, setContent] = useState({ x: 0, y: 0 });
  const dragRef = useRef<{ startX: number; startY: number; cx: number; cy: number } | null>(null);

  const result = useMemo(() => computeDiagramLayout(data, diaIndex), [data, diaIndex]);

  const canvasRef = useCanvas2d(
    (ctx, size) => {
      if (!result.ok) return;
      const view = {
        transform: createViewTransform(content.x, content.y),
        viewW: size.w,
        viewH: size.h,
        vlineMode: 1,
        displayKudari: true,
        displayNobori: true,
        displayStopMark: false,
      };
      drawL1(ctx, result.layout, view, THEME);
      drawL2(ctx, result.layout, view, syubetsuStyle);
      drawL3(ctx, result.layout, view, THEME, syubetsuLabelColor);
    },
    [result, content],
  );

  if (!result.ok) {
    return <div className="view-error">ダイヤグラムを生成できませんでした。</div>;
  }

  return (
    <div className="diagram-root">
      <canvas
        ref={canvasRef}
        className="diagram-canvas"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          dragRef.current = { startX: e.clientX, startY: e.clientY, cx: content.x, cy: content.y };
        }}
        onPointerMove={(e) => {
          const d = dragRef.current;
          if (d === null) return;
          const dx = (e.clientX - d.startX) / DEFAULT_PX_PER_SEC;
          const dy = (e.clientY - d.startY) / DEFAULT_PX_PER_SEC;
          setContent({ x: d.cx - dx, y: d.cy - dy });
        }}
        onPointerUp={(e) => {
          e.currentTarget.releasePointerCapture(e.pointerId);
          dragRef.current = null;
        }}
        onWheel={(e) => {
          setContent((c) => ({ x: c.x, y: c.y + e.deltaY / DEFAULT_PX_PER_SEC }));
        }}
      />
    </div>
  );
}
