// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 oudia-second-web contributors

/**
 * ピンチ → 離散ズームステップの量子化(design/06_rendering §2.2)。
 * ピンチの累積スケールが √2 を超えるたびに主方向の軸へ 1 段階のズームを適用する。
 * この純関数はテスト可能(タッチイベント配線は View 側)。
 */

/** √2 を超えたら 1 段階。 */
export const PINCH_STEP_RATIO = Math.SQRT2;

export type ZoomAxis = 'x' | 'y' | 'none';
export type ZoomDir = 'in' | 'out' | 'none';

export interface PinchStep {
  readonly axis: ZoomAxis;
  readonly dir: ZoomDir;
  /** 適用後に基準へ戻す残りスケール(次回のための累積係数)。 */
  readonly remainScale: number;
}

/**
 * 累積スケール(現在の 2 指間距離 / 直前ステップ時の距離)から、離散ズームを 1 段階
 * 発火すべきか判定する。dominantAxis は 2 指の移動が X 優勢か Y 優勢か。
 *
 * @param cumulativeScale 直前ステップ基準からの倍率(拡大 > 1 / 縮小 < 1)
 * @param dominantAxis    主方向('x' | 'y')
 */
export function pinchToStep(cumulativeScale: number, dominantAxis: 'x' | 'y'): PinchStep {
  if (cumulativeScale >= PINCH_STEP_RATIO) {
    return { axis: dominantAxis, dir: 'in', remainScale: cumulativeScale / PINCH_STEP_RATIO };
  }
  if (cumulativeScale <= 1 / PINCH_STEP_RATIO) {
    return { axis: dominantAxis, dir: 'out', remainScale: cumulativeScale * PINCH_STEP_RATIO };
  }
  return { axis: 'none', dir: 'none', remainScale: cumulativeScale };
}

/** 2 点間の距離(タッチ処理の補助)。 */
export function touchDistance(
  a: { clientX: number; clientY: number },
  b: { clientX: number; clientY: number },
): number {
  return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
}

/** 2 指の移動が X 優勢か Y 優勢か(絶対値の大きい軸)。 */
export function dominantPinchAxis(dx: number, dy: number): 'x' | 'y' {
  return Math.abs(dx) >= Math.abs(dy) ? 'x' : 'y';
}
