// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 oudia-second-web contributors

import { describe, it, expect } from 'vitest';
import { displayEkiRange, xZoneIntersects, enumShiftSeconds } from './culling.js';

describe('displayEkiRange(駅Order 範囲の二分探索)', () => {
  const ekiY = [0, 100, 200, 300, 400, 500];

  it('表示 Y 範囲と交差する駅Index 範囲(1 つ余裕を持つ)', () => {
    // [150, 350] → 駅 1(100)〜駅 4(400)を含む(端に 1 つ余裕)。
    const r = displayEkiRange(ekiY, 150, 350);
    expect(r.begin).toBeLessThanOrEqual(1);
    expect(r.end).toBeGreaterThanOrEqual(4);
  });

  it('空配列は [0,0]', () => {
    expect(displayEkiRange([], 0, 100)).toEqual({ begin: 0, end: 0 });
  });
});

describe('xZoneIntersects', () => {
  it('shift 込みで交差判定', () => {
    expect(xZoneIntersects([0, 3600], 0, 1000, 5000)).toBe(true);
    expect(xZoneIntersects([0, 3600], 0, 4000, 5000)).toBe(false);
    expect(xZoneIntersects([0, 3600], 86400, 86400, 90000)).toBe(true);
  });
});

describe('enumShiftSeconds(日跨ぎ繰り返し)', () => {
  it('表示域内に来る 86400 シフトを列挙', () => {
    // xZone [82800, 90000](23:00→翌1:00)、表示域 [0, 7200](0:00〜2:00)。
    // shift -86400 で [-3600, 3600] が交差。
    const shifts = enumShiftSeconds([82800, 90000], 0, 7200);
    expect(shifts).toContain(-86400);
  });

  it('通常の列車(日内)は shift 0 のみ', () => {
    const shifts = enumShiftSeconds([18000, 21600], 0, 86400);
    expect(shifts).toEqual([0]);
  });
});
