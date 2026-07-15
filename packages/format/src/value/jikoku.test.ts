// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 oudia-second-web contributors

// 根拠: docs/analysis/03_file-format.md §6.1、docs/design/04_file-io.md §3.5
// 原典: entDed/CdDedJikoku.cpp(decode / CConv::encode)

import { describe, it, expect } from 'vitest';
import { decodeJikoku, encodeJikoku, isJikokuDecodeError } from './jikoku.js';

describe('decodeJikoku', () => {
  it('空文字列は null', () => {
    expect(decodeJikoku('')).toBeNull();
  });

  it('コロンなしは末尾から 2 桁ずつ区切る', () => {
    expect(decodeJikoku('915')).toBe(9 * 3600 + 15 * 60); // 9:15
    expect(decodeJikoku('1315')).toBe(13 * 3600 + 15 * 60); // 13:15
    expect(decodeJikoku('131545')).toBe(13 * 3600 + 15 * 60 + 45); // 13:15:45
  });

  it('コロン付きも許容する', () => {
    expect(decodeJikoku('13:15:45')).toBe(13 * 3600 + 15 * 60 + 45);
    expect(decodeJikoku('9:15')).toBe(9 * 3600 + 15 * 60);
  });

  it('0:00 を 000 として読む', () => {
    expect(decodeJikoku('000')).toBe(0);
  });

  it('範囲外(時 >= 24)はエラー -2', () => {
    const r = decodeJikoku('2500');
    expect(isJikokuDecodeError(r) && r.code).toBe(-2);
  });

  it('分 >= 60 はエラー -2', () => {
    const r = decodeJikoku('1360');
    expect(isJikokuDecodeError(r) && r.code).toBe(-2);
  });
});

describe('encodeJikoku', () => {
  it('コロンなし・時先頭ゼロなし・秒 0 省略', () => {
    expect(encodeJikoku((4 * 3600 + 59 * 60) as never)).toBe('459');
    expect(encodeJikoku(0 as never)).toBe('000');
    expect(encodeJikoku((4 * 3600 + 59 * 60 + 30) as never)).toBe('45930');
    expect(encodeJikoku((13 * 3600 + 15 * 60) as never)).toBe('1315');
  });

  it('null は空文字列', () => {
    expect(encodeJikoku(null)).toBe('');
  });
});

describe('decode∘encode 正規形ラウンドトリップ', () => {
  it('正規形の時刻文字列は encode(decode(s)) === s', () => {
    // 正規形 = encode が生成しうる形(コロンなし・時先頭ゼロなし・秒 0 省略)。
    const canonical = ['', '000', '459', '1315', '45930', '2359', '235959', '100'];
    for (const s of canonical) {
      const d = decodeJikoku(s);
      expect(isJikokuDecodeError(d)).toBe(false);
      if (!isJikokuDecodeError(d)) expect(encodeJikoku(d)).toBe(s);
    }
  });
});
