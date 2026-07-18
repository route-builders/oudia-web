// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 up-tri

// 根拠: docs/design/03_data-model.md §4.2、docs/glossary.md §2
// 原典: entDed/CdDedJikoku.cpp(compare / subJikoku / adjustTotalSeconds)

import type { Seconds } from '@oudia-web/format';
import { describe, expect, it } from 'vitest';
import { addSeconds, compareJikoku, normalizeSeconds, subJikoku } from './jikoku.js';

const sec = (h: number, m: number, s = 0): Seconds => (h * 3600 + m * 60 + s) as Seconds;

describe('normalizeSeconds', () => {
  it('25:00 は 1:00 として保持する(mod 86400)', () => {
    expect(normalizeSeconds(25 * 3600)).toBe(1 * 3600);
  });

  it('-1 秒は 23:59:59 になる(負値補正)', () => {
    expect(normalizeSeconds(-1)).toBe(86399);
  });

  it('-86400 は 0', () => {
    expect(normalizeSeconds(-86400)).toBe(0);
  });
});

describe('compareJikoku(起点時刻基準の循環比較)', () => {
  it('起点 5:00 のとき 5:00 < 23:59 < 0:00 < 4:59 の順になる', () => {
    const kiten = sec(5, 0);
    // 5:00 < 23:59
    expect(compareJikoku(sec(5, 0), sec(23, 59), kiten)).toBe(-1);
    // 23:59 < 0:00
    expect(compareJikoku(sec(23, 59), sec(0, 0), kiten)).toBe(-1);
    // 0:00 < 4:59
    expect(compareJikoku(sec(0, 0), sec(4, 59), kiten)).toBe(-1);
    // 推移律: 5:00 < 4:59
    expect(compareJikoku(sec(5, 0), sec(4, 59), kiten)).toBe(-1);
  });

  it('等しい時刻は 0', () => {
    expect(compareJikoku(sec(9, 0), sec(9, 0), sec(0, 0))).toBe(0);
  });

  it('比較対象の null は常に最小', () => {
    expect(compareJikoku(null, sec(0, 0), sec(5, 0))).toBe(-1);
    expect(compareJikoku(sec(0, 0), null, sec(5, 0))).toBe(1);
    expect(compareJikoku(null, null, sec(5, 0))).toBe(0);
  });

  it('起点時刻 null は 0(00:00:00)相当', () => {
    // 起点 null(=0)なら通常の昇順。
    expect(compareJikoku(sec(1, 0), sec(2, 0), null)).toBe(-1);
  });
});

describe('subJikoku(絶対値 12 時間以下の側)', () => {
  it('1:00 - 23:00 = +2h', () => {
    expect(subJikoku(sec(1, 0), sec(23, 0))).toBe(2 * 3600);
  });

  it('23:00 - 1:00 = -2h', () => {
    expect(subJikoku(sec(23, 0), sec(1, 0))).toBe(-2 * 3600);
  });

  it('いずれかが null なら 0', () => {
    expect(subJikoku(null, sec(1, 0))).toBe(0);
    expect(subJikoku(sec(1, 0), null)).toBe(0);
  });
});

describe('addSeconds', () => {
  it('加算後に mod 正規化する', () => {
    expect(addSeconds(sec(23, 59), 120)).toBe(sec(0, 1));
  });

  it('null は null のまま', () => {
    expect(addSeconds(null, 60)).toBeNull();
  });
});
