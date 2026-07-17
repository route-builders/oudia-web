// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 oudia-second-web contributors

import { describe, it, expect } from 'vitest';
import type { Ekijikokukeisiki } from '../model/enums.js';
import { deriveJikokuDisplayFromKeisiki, deriveJikokuhyouTrackOmit } from './keisiki.js';

// 原典 CconvCentDedS00.cpp:251-302 から導いた真理値表。
// [下り着, 下り発, 上り着, 上り発, trackOmit]
const TRUTH: Record<Ekijikokukeisiki, [boolean, boolean, boolean, boolean, boolean]> = {
  hatsu: [false, true, false, true, true],
  hatsuchaku: [true, true, true, true, false],
  kudariChaku: [true, false, false, true, false],
  noboriChaku: [false, true, true, false, false],
  kudariHatsuchaku: [true, true, false, true, true],
  noboriHatsuchaku: [false, true, true, true, true],
};

describe('keisiki からの表示フラグ導出(原典 S00/S05 の CdDedEki 派生)', () => {
  for (const keisiki of Object.keys(TRUTH) as Ekijikokukeisiki[]) {
    const [kc, kh, nc, nh, omit] = TRUTH[keisiki];
    it(keisiki, () => {
      const d = deriveJikokuDisplayFromKeisiki(keisiki);
      expect(d.kudari).toEqual({ chaku: kc, hatsu: kh });
      expect(d.nobori).toEqual({ chaku: nc, hatsu: nh });
      expect(deriveJikokuhyouTrackOmit(keisiki)).toBe(omit);
    });
  }
});
