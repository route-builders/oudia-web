// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 oudia-second-web contributors

// 根拠: docs/analysis/03_file-format.md §6.3
// 原典: libs/DcDrawLib/DcdCd/DcDrawProp/CconvDcDrawProp.cpp

import { describe, it, expect } from 'vitest';
import { decodeColor, encodeColor, colorrefToRgb, rgbToColorref } from './color.js';
import { asColorref } from '../model/basic.js';

const WHITE = asColorref(0x00ffffff);

describe('color decode/encode', () => {
  it('白 00FFFFFF を往復する', () => {
    expect(encodeColor(decodeColor('00FFFFFF', WHITE))).toBe('00FFFFFF');
  });

  it('R=E2 G=EA B=FA は 00FAEAE2(下位から R,G,B)', () => {
    const c = decodeColor('00FAEAE2', WHITE);
    expect(colorrefToRgb(c)).toEqual({ r: 0xe2, g: 0xea, b: 0xfa });
    expect(encodeColor(c)).toBe('00FAEAE2');
  });

  it('読めない値は fallback', () => {
    expect(decodeColor('', WHITE)).toBe(WHITE);
    expect(decodeColor('zzzz', WHITE)).toBe(WHITE);
  });

  it('上位バイトは常に 00 に正規化', () => {
    expect(encodeColor(decodeColor('FF123456', WHITE))).toBe('00123456');
  });

  it('rgbToColorref ∘ colorrefToRgb は恒等', () => {
    const c = rgbToColorref(0x12, 0x34, 0x56);
    const rgb = colorrefToRgb(c);
    expect(rgbToColorref(rgb.r, rgb.g, rgb.b)).toBe(c);
  });
});
