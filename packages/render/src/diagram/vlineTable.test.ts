// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 up-tri

import { describe, expect, it } from 'vitest';
import { DEFAULT_VLINE_MODE, enumVlines, VLINE_TABLE, vlineStyleAt } from './vlineTable.js';

describe('VLINE_TABLE', () => {
  it('8 択、既定は mode 1(2 分/10 分/60 分)', () => {
    expect(VLINE_TABLE.length).toBe(8);
    expect(DEFAULT_VLINE_MODE).toBe(1);
    expect(VLINE_TABLE[1]).toEqual({ pitch: 120, middlePitch: 600, boldPitch: 3600 });
  });

  it('vlineStyleAt: 正時=太、10 分=実線、2 分=点', () => {
    const m = VLINE_TABLE[1]!;
    expect(vlineStyleAt(m, 3600)).toBe('bold'); // 1:00
    expect(vlineStyleAt(m, 600)).toBe('solid'); // 0:10
    expect(vlineStyleAt(m, 120)).toBe('dot'); // 0:02
  });

  it('enumVlines: 範囲内の pitch 倍数を列挙', () => {
    const m = VLINE_TABLE[1]!;
    const lines = enumVlines(m, 0, 600);
    // 0, 120, 240, 360, 480, 600。
    expect(lines.map((l) => l.seconds)).toEqual([0, 120, 240, 360, 480, 600]);
    expect(lines[0]!.style).toBe('bold'); // 0 は全周期の倍数 → bold
    expect(lines[5]!.style).toBe('solid'); // 600 = 10 分
  });
});
