// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 up-tri

import { describe, expect, it } from 'vitest';
import { asSeconds } from '../model/basic.js';
import type { JikokuConvOptions } from './jikokuConv.js';
import { encodeJikokuCsv } from './jikokuConv.js';

const hms = (h: number, m: number, s: number) => asSeconds(h * 3600 + m * 60 + s);

const base: JikokuConvOptions = {
  noColon: false,
  outputSecond: false,
  secondRoundChaku: 0,
  secondRoundHatsu: 0,
  display2400: false,
};

describe('encodeJikokuCsv(原典 CdDedJikoku::CConv::encode)', () => {
  it('null は空文字列', () => {
    expect(encodeJikokuCsv(null, true, null, base)).toBe('');
  });

  it('時は %2d(0〜9 は先頭スペース)、分は %02d、コロンあり', () => {
    expect(encodeJikokuCsv(hms(5, 30, 0), false, null, base)).toBe(' 5:30');
    expect(encodeJikokuCsv(hms(13, 5, 0), false, null, base)).toBe('13:05');
  });

  it('コロンなし', () => {
    expect(encodeJikokuCsv(hms(5, 30, 0), false, null, { ...base, noColon: true })).toBe(' 530');
  });

  it('秒出力あり(元の秒をそのまま)', () => {
    expect(encodeJikokuCsv(hms(5, 30, 45), false, null, { ...base, outputSecond: true })).toBe(
      ' 5:30:45',
    );
    expect(
      encodeJikokuCsv(hms(5, 30, 45), false, null, {
        ...base,
        outputSecond: true,
        noColon: true,
      }),
    ).toBe(' 53045');
  });

  it('秒非表示・切上(RoundUp)は +59 秒して時分を得る', () => {
    // 5:30:01 → +59s = 5:31:00 → "5:31"
    expect(encodeJikokuCsv(hms(5, 30, 1), false, null, { ...base, secondRoundHatsu: 2 })).toBe(
      ' 5:31',
    );
  });

  it('秒非表示・丸め(Round)は +30 秒', () => {
    // 5:30:30 → +30s = 5:31:00
    expect(encodeJikokuCsv(hms(5, 30, 30), false, null, { ...base, secondRoundHatsu: 1 })).toBe(
      ' 5:31',
    );
    // 5:30:29 → +30s = 5:30:59 → "5:30"
    expect(encodeJikokuCsv(hms(5, 30, 29), false, null, { ...base, secondRoundHatsu: 1 })).toBe(
      ' 5:30',
    );
  });

  it('秒非表示・切捨(RoundDown)はそのまま', () => {
    expect(encodeJikokuCsv(hms(5, 30, 59), false, null, base)).toBe(' 5:30');
  });

  it('着の切上で 23:59:30 → 24:00 繰り上がり(2400 表示なしなら 0:00)', () => {
    // 23:59:30 +59s = 0:00:29 → 時0分0 → 2400 OFF → " 0:00"
    expect(encodeJikokuCsv(hms(23, 59, 30), true, null, { ...base, secondRoundChaku: 2 })).toBe(
      ' 0:00',
    );
    // 2400 ON かつ着 → "24:00"
    expect(
      encodeJikokuCsv(hms(23, 59, 30), true, null, {
        ...base,
        secondRoundChaku: 2,
        display2400: true,
      }),
    ).toBe('24:00');
  });

  it('2400 表示は着かつ 0:00 のときのみ(発は対象外)', () => {
    expect(encodeJikokuCsv(hms(0, 0, 0), true, null, { ...base, display2400: true })).toBe('24:00');
    expect(encodeJikokuCsv(hms(0, 0, 0), false, null, { ...base, display2400: true })).toBe(
      ' 0:00',
    );
  });

  it('anti-swap: 着切上 / 発切捨で着発とも 1-29 秒 → 着は切捨(逆転回避)', () => {
    // 着 5:30:10(切上)、発 5:30:20(切捨)が参照。着発同分・ともに 1-29 秒。
    // 通常なら着は +59 だが逆転回避で着は切捨 → " 5:30"
    const opt: JikokuConvOptions = { ...base, secondRoundChaku: 2, secondRoundHatsu: 0 };
    expect(encodeJikokuCsv(hms(5, 30, 10), true, hms(5, 30, 20), opt)).toBe(' 5:30');
  });

  it('anti-swap: 着丸め / 発切捨で着発とも 30-59 秒 → 発を切上(順序維持)', () => {
    // 発 5:30:40(切捨)、参照は着 5:30:35。ともに 30-59 秒 → 発を +59 → " 5:31"
    const opt: JikokuConvOptions = { ...base, secondRoundChaku: 1, secondRoundHatsu: 0 };
    expect(encodeJikokuCsv(hms(5, 30, 40), false, hms(5, 30, 35), opt)).toBe(' 5:31');
  });
});
