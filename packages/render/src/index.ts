// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 up-tri

/**
 * `@oudia-web/render` 公開 API。
 *
 * Canvas 2D プリミティブ・座標変換・グリッド基盤・各レンダラを提供する。
 * ストアへは直接依存せず、描画入力はすべて引数で受ける(coding-standards §3)。
 */

export type { SenStyle } from './core/primitives.js';
// ---- core(座標変換・描画対象・プリミティブ)----
export {
  DASH_PATTERN,
  drawRotatedText,
  drawStopMark,
  drawVerticalText,
  ressyaLabelDeg,
  strokeLine,
  strokePolyline,
} from './core/primitives.js';
export type { RenderContext2D, Zone } from './core/RenderTarget.js';
export { RenderTarget } from './core/RenderTarget.js';
export type { FontSpec } from './core/textStyle.js';
export { colorrefToCss, DEFAULT_FONT_STACK, fontString, ptToPx } from './core/textStyle.js';
export type { ViewTransform } from './core/ViewTransform.js';
export {
  createViewTransform,
  DEFAULT_PX_PER_SEC,
  DIAGRAM_SIZE_MARGIN,
  PX_PER_SEC_MAX,
  PX_PER_SEC_MIN,
  viewTransformFromZone,
  xDgrToView,
  xViewToDgr,
  yDgrToView,
  yViewToDgr,
} from './core/ViewTransform.js';
// ---- 運用一覧図(M7e)----
export type {
  AllOperationDiagramLayout,
  AllOperationDiagramPanelRow,
  AllOperationDiagramTheme,
  AllOperationDiagramView,
} from './diagram/AllOperationDiagramRenderer.js';
export {
  drawAllOperationDiagram,
  layoutAllOperationDiagram,
  OPERATION_DIAGRAM_MARGIN,
  rowOfY,
  xOfSec,
  yOfRow,
} from './diagram/AllOperationDiagramRenderer.js';
// ---- diagram(ダイヤグラム描画補助)----
export { displayEkiRange, enumShiftSeconds, xZoneIntersects } from './diagram/culling.js';
export type { DiagramTheme, DiagramViewState } from './diagram/DiagramRenderer.js';
export { colorref, drawL1, drawL2, drawL3 } from './diagram/DiagramRenderer.js';
export type { ViewPoint } from './diagram/hitTest.js';
export {
  distancePointToSegment,
  HIT_MARGIN_MOUSE,
  HIT_MARGIN_TOUCH,
  segmentHit,
} from './diagram/hitTest.js';
export type { OccupancyDrawInput } from './diagram/OccupancyRenderer.js';
export { drawOccupancy } from './diagram/OccupancyRenderer.js';
// ---- 運用記号の描画(M7d)----
export type {
  OperationMarkGeometry,
  OperationMarkTheme,
} from './diagram/OperationMarkRenderer.js';
export {
  drawOperationMarks,
  drawOperationNumberLabels,
} from './diagram/OperationMarkRenderer.js';
export type { VlinePitch, VlineStyle } from './diagram/vlineTable.js';
export { DEFAULT_VLINE_MODE, enumVlines, VLINE_TABLE, vlineStyleAt } from './diagram/vlineTable.js';

// ---- grid(時刻表グリッド基盤)----
export { GridGeometry } from './grid/GridGeometry.js';
export type { GridTheme, GridViewState } from './grid/GridRenderer.js';
export { cellText, drawGrid } from './grid/GridRenderer.js';
