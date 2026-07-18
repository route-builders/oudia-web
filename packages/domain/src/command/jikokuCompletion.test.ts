// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 up-tri

import { asSeconds } from '@oudia-web/format';
import { describe, expect, it } from 'vitest';
import { decodeJikokuWithHourCompletion, subJikokuWrapped } from './jikokuCompletion.js';

const hms = (h: number, m: number, s = 0) => asSeconds(h * 3600 + m * 60 + s);

describe('subJikokuWrapped(±12h 正規化差)', () => {
  it('通常の差', () => {
    expect(subJikokuWrapped(hms(8, 30), hms(8, 0))).toBe(1800);
    expect(subJikokuWrapped(hms(8, 0), hms(8, 30))).toBe(-1800);
  });
  it('12h 超は反対側へ折り返す', () => {
    // 23:00 − 1:00 = 22h → −2h(−7200)。
    expect(subJikokuWrapped(hms(23, 0), hms(1, 0))).toBe(-7200);
    // 1:00 − 23:00 = −22h → +2h(7200)。
    expect(subJikokuWrapped(hms(1, 0), hms(23, 0))).toBe(7200);
  });
});

describe('decodeJikokuWithHourCompletion(時補完)', () => {
  it('通常の完全な時刻はそのまま decode', () => {
    expect(decodeJikokuWithHourCompletion('830', null)).toBe(hms(8, 30));
    expect(decodeJikokuWithHourCompletion('1215', null)).toBe(hms(12, 15));
  });

  it('空文字列 → null(クリア)', () => {
    expect(decodeJikokuWithHourCompletion('', hms(8, 0))).toBeNull();
  });

  it('2 桁分 + 参照時刻 → 参照の時を引き継ぐ', () => {
    // '30' + 参照 8:00 → 8:30。
    expect(decodeJikokuWithHourCompletion('30', hms(8, 0))).toBe(hms(8, 30));
  });

  it('2 桁分が参照より前 → +1 時間', () => {
    // '30' + 参照 8:45 → 8:30 は参照より前なので 9:30。
    expect(decodeJikokuWithHourCompletion('30', hms(8, 45))).toBe(hms(9, 30));
  });

  it('23:xx で +1 時間すると 0:xx へ wrap', () => {
    // '00' + 参照 23:30 → 23:00 は前なので +1h = 0:00(翌日)。
    expect(decodeJikokuWithHourCompletion('00', hms(23, 30))).toBe(hms(0, 0));
  });

  it('参照時刻なし(始発駅)は 2 桁でも補完しない', () => {
    expect(decodeJikokuWithHourCompletion('30', null)).toBe('invalid');
  });

  it('1 桁・3 桁は補完しない(2 桁のみ)', () => {
    expect(decodeJikokuWithHourCompletion('3', hms(8, 0))).toBe('invalid');
    // '830' は 3 桁だが完全な時刻として decode 成功 → 8:30。
    expect(decodeJikokuWithHourCompletion('830', hms(8, 0))).toBe(hms(8, 30));
  });

  it('補完された時刻は秒 0', () => {
    const r = decodeJikokuWithHourCompletion('05', hms(8, 0));
    expect(r).toBe(hms(8, 5, 0));
  });
});
