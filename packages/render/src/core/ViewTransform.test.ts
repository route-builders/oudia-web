// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 oudia-second-web contributors

import { describe, it, expect } from 'vitest';
import {
  createViewTransform,
  viewTransformFromZone,
  xDgrToView,
  yDgrToView,
  xViewToDgr,
  yViewToDgr,
  DEFAULT_PX_PER_SEC,
  PX_PER_SEC_MAX,
} from './ViewTransform.js';

describe('ViewTransform', () => {
  it('既定倍率は 0.05 px/秒', () => {
    const t = createViewTransform(0, 0);
    expect(t.pxPerSecX).toBe(DEFAULT_PX_PER_SEC);
    expect(xDgrToView(t, 1200)).toBeCloseTo(60); // 20 分 = 60px
  });

  it('順変換と逆変換が往復一致する', () => {
    const t = createViewTransform(3600, 100, 0.05, 0.1);
    for (const dgr of [0, 3600, 7200, 90000]) {
      expect(xViewToDgr(t, xDgrToView(t, dgr))).toBeCloseTo(dgr);
    }
    for (const dgr of [0, 100, 500, 8160]) {
      expect(yViewToDgr(t, yDgrToView(t, dgr))).toBeCloseTo(dgr);
    }
  });

  it('倍率はクランプされる', () => {
    const t = createViewTransform(0, 0, 999, 999);
    expect(t.pxPerSecX).toBe(PX_PER_SEC_MAX);
  });

  it('viewTransformFromZone は表示範囲をビューポートへ割り付ける(右下マージン控除)', () => {
    // 86400 秒を 862px(864 - マージン 2)に割り付け → ~0.00998 px/秒。
    const t = viewTransformFromZone([0, 86400], [0, 8160], 864, 400);
    expect(t.contentX).toBe(0);
    expect(t.pxPerSecX).toBeCloseTo((864 - 2) / 86400, 6);
    expect(t.pxPerSecY).toBeCloseTo((400 - 2) / 8160, 6);
  });
});
