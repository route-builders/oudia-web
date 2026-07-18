// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 up-tri

/**
 * ダイヤグラムビュー(読み取り専用)。derive の computeDiagramLayout + render の drawL1/L2/L3。
 * M1 はドラッグパン + ホイール縦スクロールの最小構成(ズームは M3 で拡充)。
 */

import { computeDiagramLayout } from '@oudia-web/derive';
import type { RosenFileData } from '@oudia-web/format';
import type { DiagramTheme } from '@oudia-web/render';
import { createViewTransform, DEFAULT_PX_PER_SEC, drawL1, drawL2, drawL3 } from '@oudia-web/render';
import { useMemo, useRef, useState } from 'react';
import { useCanvas2d } from '../hooks/useCanvas2d.js';
import { dominantPinchAxis, pinchToStep, touchDistance } from '../input/pinch.js';

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

/** 離散ズーム段階(√2 倍ずつ)。 */
const ZOOM_FACTOR = Math.SQRT2;

export function DiagramView(props: { data: RosenFileData; diaIndex: number }): React.ReactElement {
  const { data, diaIndex } = props;
  const [content, setContent] = useState({ x: 0, y: 0 });
  const [scale, setScale] = useState({ x: 1, y: 1 });
  const dragRef = useRef<{ startX: number; startY: number; cx: number; cy: number } | null>(null);
  const pinchRef = useRef<{ dist: number } | null>(null);

  const result = useMemo(() => computeDiagramLayout(data, diaIndex), [data, diaIndex]);

  const canvasRef = useCanvas2d(
    (ctx, size) => {
      if (!result.ok) return;
      const view = {
        transform: createViewTransform(
          content.x,
          content.y,
          DEFAULT_PX_PER_SEC * scale.x,
          DEFAULT_PX_PER_SEC * scale.y,
        ),
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
    [result, content, scale],
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
          const dx = (e.clientX - d.startX) / (DEFAULT_PX_PER_SEC * scale.x);
          const dy = (e.clientY - d.startY) / (DEFAULT_PX_PER_SEC * scale.y);
          setContent({ x: d.cx - dx, y: d.cy - dy });
        }}
        onPointerUp={(e) => {
          e.currentTarget.releasePointerCapture(e.pointerId);
          dragRef.current = null;
        }}
        onWheel={(e) => {
          setContent((c) => ({ x: c.x, y: c.y + e.deltaY / (DEFAULT_PX_PER_SEC * scale.y) }));
        }}
        onTouchStart={(e) => {
          const a = e.touches[0];
          const b = e.touches[1];
          if (a !== undefined && b !== undefined) {
            pinchRef.current = { dist: touchDistance(a, b) };
          }
        }}
        onTouchMove={(e) => {
          const p = pinchRef.current;
          const a = e.touches[0];
          const b = e.touches[1];
          if (p === null || a === undefined || b === undefined) return;
          const dist = touchDistance(a, b);
          const step = pinchToStep(
            dist / p.dist,
            dominantPinchAxis(b.clientX - a.clientX, b.clientY - a.clientY),
          );
          if (step.dir !== 'none') {
            const f = step.dir === 'in' ? ZOOM_FACTOR : 1 / ZOOM_FACTOR;
            setScale((s) => (step.axis === 'x' ? { x: s.x * f, y: s.y } : { x: s.x, y: s.y * f }));
            pinchRef.current = { dist };
          }
        }}
        onTouchEnd={() => {
          pinchRef.current = null;
        }}
      />
    </div>
  );
}
