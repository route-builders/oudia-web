// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 up-tri

// 根拠: docs/analysis/03_file-format.md §2(値のエスケープ)
// 原典: libs/OuLib/Str/OuPropertiesText/CConvNodeContainer.cpp
//        (encodePropertyString_escapePropertyValue / decode..._unescapePropertyValue)

import { describe, expect, it } from 'vitest';
import { escapePropertyValue, unescapePropertyValue } from './escape.js';

describe('escapePropertyValue', () => {
  it('LF を \\n に、バックスラッシュを \\\\ に変換する', () => {
    expect(escapePropertyValue('a\nb')).toBe('a\\nb');
    expect(escapePropertyValue('a\\b')).toBe('a\\\\b');
  });

  it('. はエスケープしない', () => {
    expect(escapePropertyValue('a.b.c')).toBe('a.b.c');
  });

  it('その他の文字はそのまま', () => {
    expect(escapePropertyValue('駅A=1;2$3')).toBe('駅A=1;2$3');
  });

  it('空文字列は空文字列', () => {
    expect(escapePropertyValue('')).toBe('');
  });
});

describe('unescapePropertyValue', () => {
  it('\\n を LF に、\\\\ をバックスラッシュに戻す', () => {
    expect(unescapePropertyValue('a\\nb')).toBe('a\nb');
    expect(unescapePropertyValue('a\\\\b')).toBe('a\\b');
  });

  it('\\. は 2 文字のまま保持する(. はエスケープ対象外のため)', () => {
    expect(unescapePropertyValue('a\\.b')).toBe('a\\.b');
  });

  it('未知の \\x は 2 文字ともそのまま保持する(先読みで消費)', () => {
    expect(unescapePropertyValue('a\\xb')).toBe('a\\xb');
    expect(unescapePropertyValue('a\\tb')).toBe('a\\tb');
  });

  it('行末の孤立したバックスラッシュはそのまま保持する', () => {
    expect(unescapePropertyValue('abc\\')).toBe('abc\\');
  });

  it('連続エスケープ: \\\\n は バックスラッシュ + n(\\\\ を消費後 n はリテラル)', () => {
    // `\\` → `\`、続く `n` はリテラル n。
    expect(unescapePropertyValue('\\\\n')).toBe('\\n');
  });
});

describe('escape/unescape の正規形ラウンドトリップ', () => {
  it('LF・バックスラッシュを含む値は escape→unescape で復元する', () => {
    const values = ['', 'plain', '1行目\n2行目', 'back\\slash', '混在\n\\end', '.dot.'];
    for (const v of values) {
      expect(unescapePropertyValue(escapePropertyValue(v))).toBe(v);
    }
  });
});
