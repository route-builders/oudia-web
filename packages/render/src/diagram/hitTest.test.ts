// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 oudia-second-web contributors

import { describe, it, expect } from 'vitest';
import { distancePointToSegment, segmentHit } from './hitTest.js';

describe('distancePointToSegment', () => {
  it('線分上の点は距離 0', () => {
    expect(distancePointToSegment({ x: 5, y: 0 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBeCloseTo(0);
  });

  it('線分から垂直距離', () => {
    expect(distancePointToSegment({ x: 5, y: 3 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBeCloseTo(3);
  });

  it('端点の外側は端点との距離', () => {
    expect(distancePointToSegment({ x: -4, y: 0 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBeCloseTo(4);
  });

  it('零長線分は端点距離', () => {
    expect(distancePointToSegment({ x: 3, y: 4 }, { x: 0, y: 0 }, { x: 0, y: 0 })).toBeCloseTo(5);
  });
});

describe('segmentHit', () => {
  it('マージン内は命中、外は非命中', () => {
    const a = { x: 0, y: 0 };
    const b = { x: 100, y: 100 };
    expect(segmentHit({ x: 50, y: 52 }, a, b, 4)).toBe(true);
    expect(segmentHit({ x: 50, y: 60 }, a, b, 4)).toBe(false);
  });

  it('バウンディングボックス外は早期棄却', () => {
    expect(segmentHit({ x: 200, y: 200 }, { x: 0, y: 0 }, { x: 10, y: 10 }, 4)).toBe(false);
  });
});
