// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 oudia-second-web contributors

/**
 * `@oudia/render` 公開 API。
 *
 * Canvas 2D プリミティブ・座標変換・グリッド基盤・各レンダラを提供する。
 * ストアへは直接依存せず、描画入力はすべて引数で受ける(coding-standards §3)。
 */

// ---- core(座標変換・描画対象・プリミティブ)----
export {
  createViewTransform,
  viewTransformFromZone,
  xDgrToView,
  yDgrToView,
  xViewToDgr,
  yViewToDgr,
  DEFAULT_PX_PER_SEC,
  PX_PER_SEC_MIN,
  PX_PER_SEC_MAX,
  DIAGRAM_SIZE_MARGIN,
} from './core/ViewTransform.js';
export type { ViewTransform } from './core/ViewTransform.js';
export { RenderTarget } from './core/RenderTarget.js';
export type { RenderContext2D, Zone } from './core/RenderTarget.js';
export { fontString, colorrefToCss, ptToPx, DEFAULT_FONT_STACK } from './core/textStyle.js';
export type { FontSpec } from './core/textStyle.js';
export {
  strokePolyline,
  strokeLine,
  drawRotatedText,
  drawVerticalText,
  drawStopMark,
  ressyaLabelDeg,
  DASH_PATTERN,
} from './core/primitives.js';
export type { SenStyle } from './core/primitives.js';

// ---- diagram(ダイヤグラム描画補助)----
export { VLINE_TABLE, DEFAULT_VLINE_MODE, vlineStyleAt, enumVlines } from './diagram/vlineTable.js';
export type { VlinePitch, VlineStyle } from './diagram/vlineTable.js';
export { displayEkiRange, xZoneIntersects, enumShiftSeconds } from './diagram/culling.js';
export {
  distancePointToSegment,
  segmentHit,
  HIT_MARGIN_MOUSE,
  HIT_MARGIN_TOUCH,
} from './diagram/hitTest.js';
export type { ViewPoint } from './diagram/hitTest.js';

export { drawL1, drawL2, drawL3, colorref } from './diagram/DiagramRenderer.js';
export type { DiagramTheme, DiagramViewState } from './diagram/DiagramRenderer.js';

// ---- grid(時刻表グリッド基盤)----
export { GridGeometry } from './grid/GridGeometry.js';
export { drawGrid, cellText } from './grid/GridRenderer.js';
export type { GridTheme, GridViewState } from './grid/GridRenderer.js';
