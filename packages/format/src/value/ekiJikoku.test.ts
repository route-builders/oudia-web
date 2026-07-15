// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 oudia-second-web contributors

// 根拠: docs/analysis/03_file-format.md §6.2、docs/design/04_file-io.md §3.5
// 原典: entDed/CconvCentDed.cpp(CentDedEkiJikoku_From_string / _To_string)

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { decodeEkiJikoku, encodeEkiJikoku, splitEkiJikokuList } from './ekiJikoku.js';

describe('decodeEkiJikoku', () => {
  it('停車 着発 番線(sample2 の 1;012/013$2)', () => {
    const d = decodeEkiJikoku('1;012/013$2', 4, 0);
    expect(d.ekiatsukai).toBe('teisya');
    expect(d.chakuJikoku).toBe(0 * 3600 + 12 * 60);
    expect(d.hatsuJikoku).toBe(0 * 3600 + 13 * 60);
    expect(d.ressyaTrackIndex).toBe(2);
  });

  it('通過 番線のみ(2$0)', () => {
    const d = decodeEkiJikoku('2$0', 4, 0);
    expect(d.ekiatsukai).toBe('tsuuka');
    expect(d.chakuJikoku).toBeNull();
    expect(d.hatsuJikoku).toBeNull();
    expect(d.ressyaTrackIndex).toBe(0);
  });

  it('着のみ(1;033/$3)', () => {
    const d = decodeEkiJikoku('1;033/$3', 4, 0);
    expect(d.ekiatsukai).toBe('teisya');
    expect(d.chakuJikoku).toBe(0 * 3600 + 33 * 60);
    expect(d.hatsuJikoku).toBeNull();
    expect(d.ressyaTrackIndex).toBe(3);
  });

  it('空要素は運行なし(none)', () => {
    const d = decodeEkiJikoku('', 4, 0);
    expect(d.ekiatsukai).toBe('none');
  });

  it('旧駅扱 3(経由なし)は none に落とす', () => {
    const d = decodeEkiJikoku('3$1', 4, 0);
    expect(d.ekiatsukai).toBe('none');
  });

  it('範囲外番線は主本線に補正する', () => {
    const d = decodeEkiJikoku('1;100/$9', 4, 2); // 番線 9 は範囲外(番線数 4)→ 主本線 2
    expect(d.ressyaTrackIndex).toBe(2);
  });
});

describe('encodeEkiJikoku', () => {
  it('運行なしは空文字列', () => {
    expect(
      encodeEkiJikoku({
        ekiatsukai: 'none',
        chakuJikoku: null,
        hatsuJikoku: null,
        ressyaTrackIndex: 0,
      }),
    ).toBe('');
  });

  it('着のみは 1;着/$番線 の形', () => {
    expect(
      encodeEkiJikoku({
        ekiatsukai: 'teisya',
        chakuJikoku: (0 * 3600 + 33 * 60) as never,
        hatsuJikoku: null,
        ressyaTrackIndex: 3,
      }),
    ).toBe('1;033/$3');
  });

  it('発のみは 1;発$番線 の形', () => {
    expect(
      encodeEkiJikoku({
        ekiatsukai: 'teisya',
        chakuJikoku: null,
        hatsuJikoku: (0 * 3600 + 35 * 60) as never,
        ressyaTrackIndex: 1,
      }),
    ).toBe('1;035$1');
  });
});

describe('decode∘encode ラウンドトリップ(番線が範囲内)', () => {
  it('sample2 由来の要素はバイト一致で往復する', () => {
    const cases = ['1;012/013$2', '2$0', '1;033/$3', '1;035$1', ''];
    for (const s of cases) {
      const d = decodeEkiJikoku(s, 4, 0);
      expect(encodeEkiJikoku(d)).toBe(s);
    }
  });

  it('プロパティ: 有効域の要素は decode → encode で復元する', () => {
    fc.assert(
      fc.property(
        fc.constantFrom<'none' | 'teisya' | 'tsuuka'>('none', 'teisya', 'tsuuka'),
        fc.option(fc.integer({ min: 0, max: 86399 }), { nil: null }),
        fc.option(fc.integer({ min: 0, max: 86399 }), { nil: null }),
        fc.integer({ min: 0, max: 3 }),
        (ekiatsukai, chaku, hatsu, track) => {
          const original = {
            ekiatsukai,
            chakuJikoku: (ekiatsukai === 'none' ? null : chaku) as never,
            hatsuJikoku: (ekiatsukai === 'none' ? null : hatsu) as never,
            ressyaTrackIndex: ekiatsukai === 'none' ? 0 : track,
          };
          const s = encodeEkiJikoku(original);
          const back = decodeEkiJikoku(s, 4, 0);
          expect(back.ekiatsukai).toBe(original.ekiatsukai);
          if (ekiatsukai !== 'none') {
            expect(back.chakuJikoku).toBe(original.chakuJikoku);
            expect(back.hatsuJikoku).toBe(original.hatsuJikoku);
            expect(back.ressyaTrackIndex).toBe(original.ressyaTrackIndex);
          }
        },
      ),
    );
  });
});

describe('splitEkiJikokuList', () => {
  it('カンマ連結を空要素も含めて分割する', () => {
    expect(splitEkiJikokuList('1;012$0,,2$1')).toEqual(['1;012$0', '', '2$1']);
    expect(splitEkiJikokuList('')).toEqual([]);
  });
});
