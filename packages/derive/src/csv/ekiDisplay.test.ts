// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 up-tri

import type { Ekijikokukeisiki } from '@oudia-web/format';
import { RESSYAHOUKOU_KUDARI, RESSYAHOUKOU_NOBORI } from '@oudia-web/format';
import { describe, expect, it } from 'vitest';
import {
    getChakujikokuHyouji,
    getEkimeiJikokuhyouRyaku,
    getHatsujikokuHyouji,
    getTrackRyakusyou,
    isHatsuChakuHyouji,
} from './ekiDisplay.js';

// 原典 CentDedEkiCont.cpp:229-238(下り)/ 424-431(上り)から導いた真理値表。
// 列: [下り着, 下り発, 上り着, 上り発]。
const TRUTH: Record<Ekijikokukeisiki, [boolean, boolean, boolean, boolean]> = {
  hatsu: [false, true, false, true],
  hatsuchaku: [true, true, true, true],
  kudariChaku: [true, false, false, true],
  noboriChaku: [false, true, true, false],
  kudariHatsuchaku: [true, true, false, true],
  noboriHatsuchaku: [false, true, true, true],
};

describe('着/発表示フラグの真理値表(原典 CdDedEki ビュー構築式)', () => {
  for (const keisiki of Object.keys(TRUTH) as Ekijikokukeisiki[]) {
    const [kc, kh, nc, nh] = TRUTH[keisiki];
    it(keisiki, () => {
      expect(getChakujikokuHyouji(keisiki, RESSYAHOUKOU_KUDARI)).toBe(kc);
      expect(getHatsujikokuHyouji(keisiki, RESSYAHOUKOU_KUDARI)).toBe(kh);
      expect(getChakujikokuHyouji(keisiki, RESSYAHOUKOU_NOBORI)).toBe(nc);
      expect(getHatsujikokuHyouji(keisiki, RESSYAHOUKOU_NOBORI)).toBe(nh);
    });
  }

  it('isHatsuChakuHyouji = 方向別 chaku && hatsu', () => {
    // hatsuchaku は両方向で着発表示。
    expect(isHatsuChakuHyouji('hatsuchaku', RESSYAHOUKOU_KUDARI)).toBe(true);
    expect(isHatsuChakuHyouji('hatsuchaku', RESSYAHOUKOU_NOBORI)).toBe(true);
    // kudariHatsuchaku は下りのみ着発表示。
    expect(isHatsuChakuHyouji('kudariHatsuchaku', RESSYAHOUKOU_KUDARI)).toBe(true);
    expect(isHatsuChakuHyouji('kudariHatsuchaku', RESSYAHOUKOU_NOBORI)).toBe(false);
    // hatsu は着表示なし → false。
    expect(isHatsuChakuHyouji('hatsu', RESSYAHOUKOU_KUDARI)).toBe(false);
  });
});

describe('getTrackRyakusyou(原典 CentDedEkiTrack2.h:150-161)', () => {
  it('下りは共通略称、上りは上り略称(空なら共通)', () => {
    const t = { trackRyakusyou: '1', trackNoboriRyakusyou: '上1' };
    expect(getTrackRyakusyou(t, RESSYAHOUKOU_KUDARI)).toBe('1');
    expect(getTrackRyakusyou(t, RESSYAHOUKOU_NOBORI)).toBe('上1');
    const t2 = { trackRyakusyou: '2', trackNoboriRyakusyou: '' };
    expect(getTrackRyakusyou(t2, RESSYAHOUKOU_NOBORI)).toBe('2');
  });
});

describe('getEkimeiJikokuhyouRyaku(原典 CentDedEki.cpp:510-517)', () => {
  it('略称が空なら駅名を返す', () => {
    const eki = { ekimei: '東京', ekimeiJikokuRyaku: '' } as never;
    expect(getEkimeiJikokuhyouRyaku(eki)).toBe('東京');
    const eki2 = { ekimei: '東京', ekimeiJikokuRyaku: '東' } as never;
    expect(getEkimeiJikokuhyouRyaku(eki2)).toBe('東');
  });
});
