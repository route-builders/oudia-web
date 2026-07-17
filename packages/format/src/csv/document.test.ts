// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 oudia-second-web contributors

import { describe, it, expect } from 'vitest';
import { encodeCsvCell, encodeCsvDocument } from './document.js';

describe('encodeCsvCell(原典 CConvCsvDocument::encodeCell)', () => {
  it('通常セルは引用しない', () => {
    expect(encodeCsvCell('東京')).toBe('東京');
    expect(encodeCsvCell('')).toBe('');
  });

  it('カンマは引用の対象にしない(OuDia の癖)', () => {
    // カンマを含んでも囲まない → CSV が壊れるが原典に忠実。
    expect(encodeCsvCell('a,b')).toBe('a,b');
  });

  it('ダブルクォートを含むと引用し、内側は二重化する', () => {
    expect(encodeCsvCell('a"b')).toBe('"a""b"');
    expect(encodeCsvCell('"')).toBe('""""');
  });

  it('改行を含むと引用する(改行はそのまま)', () => {
    expect(encodeCsvCell('a\nb')).toBe('"a\nb"');
  });

  it('先頭末尾スペースは引用しない', () => {
    expect(encodeCsvCell(' ﾚ')).toBe(' ﾚ');
  });
});

describe('encodeCsvDocument(原典 CConvCsvDocument::encode)', () => {
  it('各行をカンマ区切り + LF 終端(末尾行も終端)', () => {
    expect(encodeCsvDocument([['FileType', 'OuDiaSecond.JikokuhyouCsv.2'], ['ダイヤ名'], []])).toBe(
      'FileType,OuDiaSecond.JikokuhyouCsv.2\nダイヤ名\n\n',
    );
  });

  it('空セルは空文字列として位置を占める(先頭のカンマ)', () => {
    expect(encodeCsvDocument([['', 'x']])).toBe(',x\n');
  });

  it('ragged 行(列数が異なる)をそのまま出す', () => {
    expect(encodeCsvDocument([['a', 'b', 'c'], ['x']])).toBe('a,b,c\nx\n');
  });

  it('CRLF + BOM オプション(駅時刻表 CSV モード)', () => {
    const out = encodeCsvDocument([['t'], []], { lineEnding: '\r\n', bom: true });
    expect(out).toBe('﻿t\r\n\r\n');
    expect(out.startsWith('﻿')).toBe(true);
    expect(out.includes('\r\n')).toBe(true);
  });
});
