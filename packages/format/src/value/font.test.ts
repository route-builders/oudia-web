// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 up-tri

// 根拠: docs/analysis/03_file-format.md §6.5
// 原典: libs/DcDrawLib/DcdCd/DcDrawProp/CconvDcDrawProp.cpp / OuLib/Str/CdConnectedString2.cpp

import { describe, expect, it } from 'vitest';
import { decodeFont, encodeFont } from './font.js';

describe('font decode/encode', () => {
  it('PointTextHeight/Facename/Bold/Itaric を読む', () => {
    const f = decodeFont('PointTextHeight=10;Facename=Meiryo UI;Bold=1;Itaric=1');
    expect(f.pointTextHeight).toBe(10);
    expect(f.facename).toBe('Meiryo UI');
    expect(f.bold).toBe(true);
    expect(f.italic).toBe(true);
    expect(f.underline).toBe(false);
  });

  it('encode は実装順で bool/0 を省略する', () => {
    const f = decodeFont('PointTextHeight=9;Facename=Meiryo UI');
    expect(encodeFont(f)).toBe('PointTextHeight=9;Facename=Meiryo UI');
  });

  it('Bold のみ true は末尾に Bold=1', () => {
    const f = decodeFont('PointTextHeight=9;Facename=Meiryo UI;Bold=1');
    expect(encodeFont(f)).toBe('PointTextHeight=9;Facename=Meiryo UI;Bold=1');
  });

  it('往復: 代表的な DispProp フォント文字列', () => {
    const cases = [
      'PointTextHeight=9;Facename=Meiryo UI',
      'PointTextHeight=9;Facename=@メイリオ',
      'PointTextHeight=10;Facename=Meiryo UI;Bold=1;Itaric=1',
      'PointTextHeight=8;Facename=Meiryo UI',
    ];
    for (const s of cases) {
      expect(encodeFont(decodeFont(s))).toBe(s);
    }
  });
});
