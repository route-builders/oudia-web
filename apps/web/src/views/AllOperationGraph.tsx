// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 up-tri
//
// Based on OuDiaSecond (Copyright (C) 2017-2026 diagram_mania)
// and OuDia (Copyright (C) 2006-2017 take-okm)

/**
 * 運用一覧図(Canvas レンダラ)。原典 ViewAllOperationTable2。M7e。
 *
 * ★横軸ズームは倍率ではなく「表示する時間範囲(秒)」の増減で、単位は 30 分。
 * ただし図全体(24h)が画面内に収まっているときだけ単位が 12 時間になる
 * (原典 CDedAllOperationTable2View.cpp:755-780 の反直感な分岐)。
 * ★縦スクロールは必ず行境界にスナップする(原典 YPosNormalization)。
 */

import type { AllOperationTableRow, OperationDiagramRow } from '@oudia-web/derive';
import { OPERATION_VLINE_PITCHES } from '@oudia-web/derive';
import type { DispProp } from '@oudia-web/format';
import type { AllOperationDiagramTheme } from '@oudia-web/render';
import {
  colorrefToCss,
  drawAllOperationDiagram,
  layoutAllOperationDiagram,
  rowOfY,
} from '@oudia-web/render';
import { useRef, useState } from 'react';
import { useCanvas2d } from '../hooks/useCanvas2d.js';

/** 横軸ズームの単位(原典 iUnit = 30*60。全体が収まっているときだけ 12 時間)。 */
function zoomUnit(viewRangeSec: number): number {
  return viewRangeSec >= 86400 ? 43200 : 1800;
}

export function AllOperationGraph(props: {
  rows: readonly AllOperationTableRow[];
  diagramRows: readonly OperationDiagramRow[];
  dispProp: DispProp;
  kitenJikoku: number;
  onOpen: (operationNumber: string) => void;
}): React.ReactElement {
  const { rows, diagramRows, dispProp, kitenJikoku, onOpen } = props;
  const [viewRangeSec, setViewRangeSec] = useState(86400);
  const [viewStartSec, setViewStartSec] = useState(kitenJikoku);
  const [firstRow, setFirstRow] = useState(0);
  const [vlineMode, setVlineMode] = useState(3);
  const [displayEkimeiJikoku, setDisplayEkimeiJikoku] = useState(true);
  const sizeRef = useRef({ w: 1, h: 1 });

  const theme: AllOperationDiagramTheme = {
    gridColor: colorrefToCss(dispProp.operationGridColor),
    jikuColor: colorrefToCss(dispProp.diaJikuColor),
    stringColor: colorrefToCss(dispProp.operationStringColor),
    headerBackColor: '#f0f0f0',
    backColor: '#ffffff',
    font: '12px "Meiryo UI", Meiryo, sans-serif',
    jikokuFont: '11px "Meiryo UI", Meiryo, sans-serif',
  };

  const panel = rows.map((r) => ({
    operationNumber: r.operationNumber,
    outEkimei: r.outEkimei,
    outJikokuText: r.outJikokuText,
    inEkimei: r.inEkimei,
    inJikokuText: r.inJikokuText,
  }));

  const canvasRef = useCanvas2d(
    (ctx, size) => {
      sizeRef.current = size;
      const view = {
        viewStartSec,
        viewRangeSec,
        firstRow,
        vlineMode,
        displayEkimeiJikoku,
        viewW: size.w,
        viewH: size.h,
        kitenJikoku,
      };
      const layout = layoutAllOperationDiagram(ctx, view, theme, dispProp.jikokuhyouRessyaWidth);
      drawAllOperationDiagram(ctx, layout, view, theme, diagramRows, panel);
    },
    [
      diagramRows,
      panel,
      viewStartSec,
      viewRangeSec,
      firstRow,
      vlineMode,
      displayEkimeiJikoku,
      kitenJikoku,
      theme.gridColor,
      theme.jikuColor,
      theme.stringColor,
    ],
  );

  const clampStart = (start: number, range: number): number =>
    Math.min(Math.max(start, kitenJikoku), kitenJikoku + 86400 - range);

  const zoom = (sign: 1 | -1): void => {
    const u = zoomUnit(viewRangeSec);
    const next = Math.min(86400, Math.max(u, viewRangeSec + sign * u));
    setViewRangeSec(next);
    setViewStartSec((s) => clampStart(s, next));
  };

  return (
    <div className="all-operation-graph-root">
      <div className="view-toolbar graph-toolbar">
        <button
          type="button"
          onClick={() => {
            zoom(-1);
          }}
        >
          横軸を拡大
        </button>
        <button
          type="button"
          onClick={() => {
            zoom(1);
          }}
        >
          横軸を縮小
        </button>
        <button
          type="button"
          onClick={() => {
            setViewRangeSec(86400);
            setViewStartSec(kitenJikoku);
          }}
        >
          全体表示
        </button>
        <label>
          時間目盛
          <select
            value={vlineMode}
            onChange={(e) => {
              setVlineMode(Number(e.target.value));
            }}
          >
            {OPERATION_VLINE_PITCHES.map((p, i) => (
              <option key={p.label} value={i}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          <input
            type="checkbox"
            checked={displayEkimeiJikoku}
            onChange={(e) => {
              setDisplayEkimeiJikoku(e.target.checked);
            }}
          />
          出入区駅名・時刻を表示
        </label>
        <span className="graph-range">
          表示範囲 {Math.round(viewRangeSec / 60)} 分 / 開始{' '}
          {String(Math.floor((viewStartSec % 86400) / 3600)).padStart(2, '0')}:
          {String(Math.floor((viewStartSec % 3600) / 60)).padStart(2, '0')}
        </span>
      </div>
      <div className="all-operation-graph-canvas">
        <canvas
          ref={canvasRef}
          onWheel={(e) => {
            // 縦は 1 行単位、横は Shift 併用で目盛ピッチ単位(原典のスクロール単位)。
            if (e.shiftKey) {
              const pitch = OPERATION_VLINE_PITCHES[vlineMode]?.dot ?? 600;
              setViewStartSec((s) => clampStart(s + (e.deltaY > 0 ? pitch : -pitch), viewRangeSec));
            } else {
              setFirstRow((r) =>
                Math.min(Math.max(0, r + (e.deltaY > 0 ? 1 : -1)), Math.max(0, rows.length - 1)),
              );
            }
          }}
          onDoubleClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const ctx = e.currentTarget.getContext('2d');
            if (ctx === null) return;
            const view = {
              viewStartSec,
              viewRangeSec,
              firstRow,
              vlineMode,
              displayEkimeiJikoku,
              viewW: sizeRef.current.w,
              viewH: sizeRef.current.h,
              kitenJikoku,
            };
            const layout = layoutAllOperationDiagram(
              ctx,
              view,
              theme,
              dispProp.jikokuhyouRessyaWidth,
            );
            const row = rowOfY(layout, view, e.clientY - rect.top);
            const target = rows[row];
            if (target !== undefined) onOpen(target.operationNumber);
          }}
        />
      </div>
    </div>
  );
}
