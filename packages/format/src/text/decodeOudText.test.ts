// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 up-tri

// 根拠: docs/analysis/03_file-format.md §1、docs/design/04_file-io.md §8.1
// 原典: libs/OuLib/Str/vectorToFile.cpp (stringFromFile)

import { describe, expect, it } from 'vitest';
import { decodeOudText } from './decodeOudText.js';

const BOM = [0xef, 0xbb, 0xbf];

function bytesOf(...parts: (number[] | string)[]): Uint8Array {
  const arr: number[] = [];
  for (const p of parts) {
    if (typeof p === 'string') {
      arr.push(...new TextEncoder().encode(p));
    } else {
      arr.push(...p);
    }
  }
  return new Uint8Array(arr);
}

describe('decodeOudText: BOM 判定とデコード', () => {
  it('UTF-8 BOM 付きは UTF-8 として解釈し BOM を除去する', () => {
    const r = decodeOudText(bytesOf(BOM, 'FileType=OuDiaSecond.1.17'));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.encoding).toBe('utf-8');
      expect(r.hadBom).toBe(true);
      expect(r.text).toBe('FileType=OuDiaSecond.1.17');
    }
  });

  it('BOM 無しは Shift_JIS として解釈する', () => {
    // Shift_JIS で「駅」= 0x89 0x77。
    const r = decodeOudText(new Uint8Array([0x89, 0x77]));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.encoding).toBe('shift_jis');
      expect(r.hadBom).toBe(false);
      expect(r.text).toBe('駅');
    }
  });
});

describe('decodeOudText: 物理層エラー', () => {
  it('\\0 を含むバイト列はエラー -3(バイナリ)', () => {
    const r = decodeOudText(bytesOf(BOM, [0x41, 0x00, 0x42]));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe(-3);
  });
});

describe('decodeOudText: CR 除去', () => {
  it('CRLF の CR を除去し LF のみにする', () => {
    const r = decodeOudText(bytesOf(BOM, 'A=1\r\nB=2\r\n'));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.text).toBe('A=1\nB=2\n');
  });
});

describe('decodeOudText: 0x5C 救済ハック(SJIS 経路のみ)', () => {
  it('2 バイト目が 0x5C の文字(例: 十)の直後の \\ を 1 文字削除する', () => {
    // SJIS で「十」= 0x8F 0x5C。その直後に ASCII の '\'(0x5C)を置く。
    // → デコード後の文字列で「十\」となり、ハックが '\' を削除する。
    const r = decodeOudText(new Uint8Array([0x8f, 0x5c, 0x5c]));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.text).toBe('十');
      expect(r.warnings).toContainEqual({ kind: 'sjis0x5cHackApplied', count: 1 });
    }
  });

  it('削除後の直後文字は再検査しない(十\\\\ → 十\\ で 2 個目は残る)', () => {
    // SJIS「十」(0x8F 0x5C) + '\'(0x5C) + '\'(0x5C)。
    // 1 個目の '\' は削除、erase 後 idx++ で 2 個目は判定対象外 → 残る。
    const r = decodeOudText(new Uint8Array([0x8f, 0x5c, 0x5c, 0x5c]));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.text).toBe('十\\');
  });

  it('対象外文字の直後の \\ は削除しない', () => {
    // 「駅」(0x89 0x77)の 2 バイト目は 0x77 で対象外。直後の '\' は残す。
    const r = decodeOudText(new Uint8Array([0x89, 0x77, 0x5c]));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.text).toBe('駅\\');
  });
});
