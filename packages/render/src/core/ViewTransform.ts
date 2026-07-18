// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 up-tri
//
// Based on OuDiaSecond (Copyright (C) 2017-2026 diagram_mania)
// and OuDia (Copyright (C) 2006-2017 take-okm)

/**
 * Dgr 座標(秒)⇔ ビュー座標(CSS px)の線形変換(原典 CconvContentPosToDcdTarget 相当。
 * design/06_rendering §1.1)。X / Y 独立。将来の描画バックエンド差し替え点。
 */

/** 既定倍率 = 0.05 px/秒(1 分 = 3px。原典 DEFAULT_DCD_PER_DGR)。 */
export const DEFAULT_PX_PER_SEC = 0.05;
/** 倍率クランプ範囲(原典 adjustProp)。 */
export const PX_PER_SEC_MIN = 0.0001;
export const PX_PER_SEC_MAX = 10;
/** 右下マージン(原典 DIAGRAM_SIZE_MARGIN_DCD)。終端の線が欠けないための余裕。 */
export const DIAGRAM_SIZE_MARGIN = 2;

export interface ViewTransform {
  /** ビュー左上に表示する DgrX(秒)。 */
  readonly contentX: number;
  /** ビュー左上に表示する DgrY(秒)。 */
  readonly contentY: number;
  /** DgrX 1 秒あたりの CSS px。 */
  readonly pxPerSecX: number;
  /** DgrY 1 秒あたりの CSS px。 */
  readonly pxPerSecY: number;
}

function clampPxPerSec(v: number): number {
  if (v < PX_PER_SEC_MIN) return PX_PER_SEC_MIN;
  if (v > PX_PER_SEC_MAX) return PX_PER_SEC_MAX;
  return v;
}

/** 既定倍率のビュー変換を作る(左上 = contentX/Y)。 */
export function createViewTransform(
  contentX: number,
  contentY: number,
  pxPerSecX = DEFAULT_PX_PER_SEC,
  pxPerSecY = DEFAULT_PX_PER_SEC,
): ViewTransform {
  return {
    contentX,
    contentY,
    pxPerSecX: clampPxPerSec(pxPerSecX),
    pxPerSecY: clampPxPerSec(pxPerSecY),
  };
}

/** DgrX → ビュー x(CSS px)。 */
export function xDgrToView(t: ViewTransform, dgrX: number): number {
  return (dgrX - t.contentX) * t.pxPerSecX;
}
/** DgrY → ビュー y(CSS px)。 */
export function yDgrToView(t: ViewTransform, dgrY: number): number {
  return (dgrY - t.contentY) * t.pxPerSecY;
}
/** ビュー x → DgrX(秒)。 */
export function xViewToDgr(t: ViewTransform, viewX: number): number {
  return viewX / t.pxPerSecX + t.contentX;
}
/** ビュー y → DgrY(秒)。 */
export function yViewToDgr(t: ViewTransform, viewY: number): number {
  return viewY / t.pxPerSecY + t.contentY;
}

/**
 * 表示 Dgr 範囲(zone)をビューポート px へ割り付けて倍率を逆算する
 * (ズーム = 範囲離散増減 → 倍率逆算。design §2.2)。右下マージンを控除する。
 *
 * @param zoneX     [左端 DgrX, 幅(秒)]
 * @param zoneY     [上端 DgrY, 高さ(秒)]
 * @param viewportW ビューポート幅(CSS px)
 * @param viewportH ビューポート高(CSS px)
 */
export function viewTransformFromZone(
  zoneX: readonly [number, number],
  zoneY: readonly [number, number],
  viewportW: number,
  viewportH: number,
): ViewTransform {
  const usableW = Math.max(1, viewportW - DIAGRAM_SIZE_MARGIN);
  const usableH = Math.max(1, viewportH - DIAGRAM_SIZE_MARGIN);
  const widthSec = Math.max(1, zoneX[1]);
  const heightSec = Math.max(1, zoneY[1]);
  return {
    contentX: zoneX[0],
    contentY: zoneY[0],
    pxPerSecX: clampPxPerSec(usableW / widthSec),
    pxPerSecY: clampPxPerSec(usableH / heightSec),
  };
}
