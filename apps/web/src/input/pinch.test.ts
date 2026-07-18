// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 up-tri

import { describe, expect, it } from 'vitest';
import { dominantPinchAxis, PINCH_STEP_RATIO, pinchToStep, touchDistance } from './pinch.js';

describe('pinchToStep(ピンチ → 離散ズーム)', () => {
  it('√2 を超えると拡大 1 段階、残スケールは基準へ戻る', () => {
    const s = pinchToStep(PINCH_STEP_RATIO * 1.1, 'x');
    expect(s.dir).toBe('in');
    expect(s.axis).toBe('x');
    expect(s.remainScale).toBeCloseTo(1.1);
  });

  it('1/√2 を下回ると縮小 1 段階', () => {
    const s = pinchToStep(1 / PINCH_STEP_RATIO / 1.1, 'y');
    expect(s.dir).toBe('out');
    expect(s.axis).toBe('y');
  });

  it('閾値内は発火しない', () => {
    const s = pinchToStep(1.2, 'x');
    expect(s.dir).toBe('none');
    expect(s.axis).toBe('none');
    expect(s.remainScale).toBe(1.2);
  });
});

describe('touchDistance / dominantPinchAxis', () => {
  it('2 点距離', () => {
    expect(touchDistance({ clientX: 0, clientY: 0 }, { clientX: 3, clientY: 4 })).toBe(5);
  });
  it('主方向', () => {
    expect(dominantPinchAxis(10, 3)).toBe('x');
    expect(dominantPinchAxis(3, 10)).toBe('y');
  });
});
