// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 oudia-second-web contributors
//
// Based on OuDiaSecond (Copyright (C) 2017-2026 diagram_mania)
// and OuDia (Copyright (C) 2006-2017 take-okm)

/**
 * 列車線ヒットテスト(原典 CCalcCentDedDgrRessyasenOfPoint + CLineFunc。
 * design/06_rendering §2.1)。ビュー座標(px)で線分と点の距離を判定する。
 */

/** ヒットテストのマージン(CSS px)。マウス 4 / タッチ・ペン 12。 */
export const HIT_MARGIN_MOUSE = 4;
export const HIT_MARGIN_TOUCH = 12;

/** ビュー座標の点。 */
export interface ViewPoint {
  readonly x: number;
  readonly y: number;
}

/**
 * 点 p から線分 (a, b) への最短距離(ビュー px)。
 * 垂直/水平線・零長線分も安全に扱う(サイズ 0 → 点との距離)。
 */
export function distancePointToSegment(p: ViewPoint, a: ViewPoint, b: ViewPoint): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) {
    // 零長 → 端点との距離。
    return Math.hypot(p.x - a.x, p.y - a.y);
  }
  // 線分上への射影パラメータ t を [0, 1] にクランプ。
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
  if (t < 0) t = 0;
  else if (t > 1) t = 1;
  const projX = a.x + t * dx;
  const projY = a.y + t * dy;
  return Math.hypot(p.x - projX, p.y - projY);
}

/**
 * 点がマージン内で線分に命中するか。まずバウンディングボックス(マージン膨張)で
 * 早期棄却してから距離判定する(原典 2 段判定)。
 */
export function segmentHit(p: ViewPoint, a: ViewPoint, b: ViewPoint, margin: number): boolean {
  const minX = Math.min(a.x, b.x) - margin;
  const maxX = Math.max(a.x, b.x) + margin;
  const minY = Math.min(a.y, b.y) - margin;
  const maxY = Math.max(a.y, b.y) + margin;
  if (p.x < minX || p.x > maxX || p.y < minY || p.y > maxY) return false;
  return distancePointToSegment(p, a, b) <= margin;
}
