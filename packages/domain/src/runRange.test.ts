// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 up-tri

import type { EkiJikoku, Ressya } from '@oudia-web/format';
import { asSeconds, RESSYAHOUKOU_KUDARI } from '@oudia-web/format';
import { describe, expect, it } from 'vitest';
import {
  getEkiJikoku,
  getSihatsuEki,
  getSyuuchakuEki,
  getValidSihatsuEki,
  getValidSyuuchakuEki,
  isRunBetweenNextEki,
} from './runRange.js';

function ej(
  ekiatsukai: EkiJikoku['ekiatsukai'],
  chaku: number | null,
  hatsu: number | null,
): EkiJikoku {
  return {
    ekiatsukai,
    chakuJikoku: chaku === null ? null : asSeconds(chaku),
    hatsuJikoku: hatsu === null ? null : asSeconds(hatsu),
    ressyaTrackIndex: ekiatsukai === 'none' ? null : 0,
    beforeOperationCont: [],
    afterOperationCont: [],
  };
}

function ressyaOf(cont: EkiJikoku[]): Ressya {
  return {
    isNull: false,
    houkou: RESSYAHOUKOU_KUDARI,
    syubetsuIndex: 0,
    ressyabangou: '1',
    ressyamei: '',
    gousuu: '',
    bikou: '',
    isCanceled: false,
    ekiJikokuCont: cont,
  };
}

describe('run-range 導出(原典 CentDedRessya)', () => {
  it('getSihatsuEki / getSyuuchakuEki は非 none の最初/最後', () => {
    const r = ressyaOf([
      ej('none', null, null),
      ej('teisya', null, 5 * 3600),
      ej('tsuuka', 5 * 3600 + 60, 5 * 3600 + 60),
      ej('teisya', 5 * 3600 + 600, null),
      ej('none', null, null),
    ]);
    expect(getSihatsuEki(r)).toBe(1);
    expect(getSyuuchakuEki(r)).toBe(3);
  });

  it('全 none なら -1', () => {
    const r = ressyaOf([ej('none', null, null), ej('none', null, null)]);
    expect(getSihatsuEki(r)).toBe(-1);
    expect(getSyuuchakuEki(r)).toBe(-1);
  });

  it('getValidSihatsuEki は 発非 null かつ次駅が停車/通過の最初', () => {
    const r = ressyaOf([
      ej('teisya', null, 5 * 3600), // 発あり、次駅停車 → 有効始発
      ej('teisya', 5 * 3600 + 600, 5 * 3600 + 660),
      ej('teisya', 5 * 3600 + 1200, null),
    ]);
    expect(getValidSihatsuEki(r)).toBe(0);
  });

  it('getValidSyuuchakuEki は 着非 null かつ前駅が停車/通過の最後', () => {
    const r = ressyaOf([
      ej('teisya', null, 5 * 3600),
      ej('teisya', 5 * 3600 + 600, 5 * 3600 + 660),
      ej('teisya', 5 * 3600 + 1200, null), // 着あり、前駅停車 → 有効終着
    ]);
    expect(getValidSyuuchakuEki(r)).toBe(2);
  });

  it('isRunBetweenNextEki は両駅とも停車/通過', () => {
    const r = ressyaOf([
      ej('teisya', null, 5 * 3600),
      ej('none', null, null),
      ej('teisya', 5 * 3600 + 600, null),
    ]);
    expect(isRunBetweenNextEki(r, 0)).toBe(false); // 次駅 none
    const r2 = ressyaOf([ej('teisya', null, 5 * 3600), ej('tsuuka', 5 * 3600 + 60, 5 * 3600 + 60)]);
    expect(isRunBetweenNextEki(r2, 0)).toBe(true);
  });

  it('getEkiJikoku 範囲外は既定 none(末尾切り詰め対策)', () => {
    const r = ressyaOf([ej('teisya', null, 5 * 3600)]);
    const out = getEkiJikoku(r, 5);
    expect(out.ekiatsukai).toBe('none');
    expect(out.chakuJikoku).toBeNull();
    expect(out.hatsuJikoku).toBeNull();
    expect(out.ressyaTrackIndex).toBeNull();
  });
});
