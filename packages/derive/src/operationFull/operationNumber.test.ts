// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 up-tri

/** 運番状態機械(merge/split/trim + setter)の単体テスト(M7c PR-C)。 */

import { describe, expect, it } from 'vitest';
import {
  emptySlots,
  isEmptyOrBlank,
  mergeOperationNumber,
  reverseForRoute,
  setOperationNumberAssigned,
  setOperationNumberBefore,
  splitOperationNumber,
  trimSuffixOperationNumber,
} from './operationNumber.js';

describe('mergeOperationNumber(空スロットは [""] 化・dedup なし)', () => {
  it('通常結合 [Main, Sub]', () => {
    const s = emptySlots();
    s.n2 = ['A'];
    s.n3 = ['B'];
    mergeOperationNumber(s, false);
    expect(s.n1).toEqual(['A', 'B']);
  });

  it('反転結合 [Sub, Main]', () => {
    const s = emptySlots();
    s.n2 = ['A'];
    s.n3 = ['B'];
    mergeOperationNumber(s, true);
    expect(s.n1).toEqual(['B', 'A']);
  });

  it('空スロットは空文字列 1 個に置換され結果は必ず ≥2 要素', () => {
    const s = emptySlots();
    s.n2 = [];
    s.n3 = ['B'];
    mergeOperationNumber(s, false);
    expect(s.n1).toEqual(['', 'B']);
    const s2 = emptySlots();
    s2.n2 = ['A'];
    s2.n3 = [];
    mergeOperationNumber(s2, false);
    expect(s2.n1).toEqual(['A', '']);
    const s3 = emptySlots();
    mergeOperationNumber(s3, false);
    expect(s3.n1).toEqual(['', '']);
  });

  it('併結(複数要素)は単純連結・重複除去なし', () => {
    const s = emptySlots();
    s.n2 = ['A', 'A'];
    s.n3 = ['A'];
    mergeOperationNumber(s, false);
    expect(s.n1).toEqual(['A', 'A', 'A']); // dedup しない
  });
});

describe('splitOperationNumber(クランプで両者最低 1 要素)', () => {
  it('pos=0(末尾から count 解結): main=max(1,size-count)', () => {
    const s = emptySlots(['A', 'B', 'C']);
    splitOperationNumber(s, 0, 1);
    expect(s.n2).toEqual(['A', 'B']); // 主編成
    expect(s.n3).toEqual(['C']); // 解結編成
  });

  it('pos=0 で count が大きくても main は最低 1', () => {
    const s = emptySlots(['A', 'B']);
    splitOperationNumber(s, 0, 5);
    expect(s.n2).toEqual(['A']);
    expect(s.n3).toEqual(['B']);
  });

  it('pos=1(先頭から count 解結): sub=min(size-1,count)', () => {
    const s = emptySlots(['A', 'B', 'C']);
    splitOperationNumber(s, 1, 1);
    expect(s.n3).toEqual(['A']); // 解結編成(先頭)
    expect(s.n2).toEqual(['B', 'C']); // 主編成(末尾)
  });

  it('size==1 は主編成に全部・解結側は空文字列', () => {
    const s = emptySlots(['A']);
    splitOperationNumber(s, 0, 1);
    expect(s.n2).toEqual(['A']);
    expect(s.n3).toEqual(['']);
  });

  it('空 #1 は #2/#3 に空文字列 push', () => {
    const s = emptySlots([]);
    splitOperationNumber(s, 0, 1);
    expect(s.n2).toEqual(['']);
    expect(s.n3).toEqual(['']);
  });
});

describe('trimSuffixOperationNumber(; 以降除去・全スロット)', () => {
  it('最初の ; 以降を全スロットで除去', () => {
    const s = emptySlots(['A;0', 'B;1']);
    s.n2 = ['C;2'];
    s.n3 = ['D'];
    trimSuffixOperationNumber(s);
    expect(s.n1).toEqual(['A', 'B']);
    expect(s.n2).toEqual(['C']);
    expect(s.n3).toEqual(['D']);
  });
});

describe('setOperationNumberBefore(即 split)', () => {
  it('#1 セット後に split が走る', () => {
    const s = emptySlots();
    setOperationNumberBefore(s, ['A', 'B'], 0, 1);
    expect(s.n1).toEqual(['A', 'B']);
    expect(s.n2).toEqual(['A']);
    expect(s.n3).toEqual(['B']);
  });
});

describe('setOperationNumberAssigned(reverse で #3 反転)', () => {
  it('reverse=true で #3 = 反転(size>1)', () => {
    const s = emptySlots();
    setOperationNumberAssigned(s, ['A', 'B', 'C'], true);
    expect(s.n2).toEqual(['A', 'B', 'C']);
    expect(s.n3).toEqual(['C', 'B', 'A']);
  });
  it('reverse=false は #3 触れず', () => {
    const s = emptySlots();
    s.n3 = ['X'];
    setOperationNumberAssigned(s, ['A'], false);
    expect(s.n2).toEqual(['A']);
    expect(s.n3).toEqual(['X']);
  });
});

describe('reverseForRoute / isEmptyOrBlank', () => {
  it('路線反転は 方向差 && size>1 のときのみ', () => {
    expect(reverseForRoute(['A', 'B'], true, false)).toEqual(['B', 'A']);
    expect(reverseForRoute(['A', 'B'], true, true)).toEqual(['A', 'B']); // 同方向
    expect(reverseForRoute(['A'], true, false)).toEqual(['A']); // size<=1
    expect(reverseForRoute(['A', 'B'], false, false)).toEqual(['A', 'B']); // 反転設定なし
  });
  it('空 or 空白のみ判定', () => {
    expect(isEmptyOrBlank([])).toBe(true);
    expect(isEmptyOrBlank([''])).toBe(true);
    expect(isEmptyOrBlank(['A'])).toBe(false);
    expect(isEmptyOrBlank(['', ''])).toBe(false);
  });
});
