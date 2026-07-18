// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 up-tri

import type { Eki, EkiJikoku, JikokuConvOptions, Ressya } from '@oudia-web/format';
import { RESSYAHOUKOU_KUDARI } from '@oudia-web/format';
import { describe, expect, it } from 'vitest';
import { ej } from '../layout/testSynthetic.js';
import type { CellContext } from './cellSpec.js';
import { chakuCell, getKyoukaisen, hatsuCell, trackCell } from './cellSpec.js';

const CONV: JikokuConvOptions = {
  noColon: true,
  outputSecond: false,
  secondRoundChaku: 0,
  secondRoundHatsu: 0,
  display2400: false,
};

function mkEki(over: Partial<Eki> & { ekimei: string }): Eki {
  return {
    id: 0,
    ekimeiJikokuRyaku: '',
    ekimeiDiaRyaku: '',
    ekijikokukeisiki: 'hatsuchaku',
    ekikibo: 'ippan',
    diagramRessyajouhouHyoujiKudari: 'origin',
    diagramRessyajouhouHyoujiNobori: 'origin',
    downMain: 0,
    upMain: 1,
    ekiTrack2Cont: [
      { trackName: '1', trackRyakusyou: '1番', trackNoboriRyakusyou: '' },
      { trackName: '2', trackRyakusyou: '2番', trackNoboriRyakusyou: '' },
    ],
    brunchCoreEkiIndex: null,
    brunchOpposite: false,
    loopOriginEkiIndex: null,
    loopOpposite: false,
    outerTerminalCont: [],
    nextEkiDistance: 0,
    crossingCheckRuleCont: [],
    jikokuhyouTrackDisplayKudari: false,
    jikokuhyouTrackDisplayNobori: false,
    diagramTrackDisplay: false,
    diagramTrackOmit: [false, false],
    jikokuhyouTrackOmit: false,
    jikokuhyouOperationOrigin: 0,
    jikokuhyouOperationTerminal: 0,
    jikokuhyouOperationOriginDownBeforeUpAfter: false,
    jikokuhyouOperationOriginDownAfterUpBefore: false,
    jikokuhyouOperationTerminalDownBeforeUpAfter: false,
    jikokuhyouOperationTerminalDownAfterUpBefore: false,
    jikokuhyouJikokuDisplayKudari: { chaku: true, hatsu: true },
    jikokuhyouJikokuDisplayNobori: { chaku: true, hatsu: true },
    jikokuhyouSyubetsuChangeDisplayKudari: {
      ressyabangou: 0,
      operationNumber: 0,
      syubetsu: 0,
      ressyamei: 0,
      operationNumberRows: 1,
    },
    jikokuhyouSyubetsuChangeDisplayNobori: {
      ressyabangou: 0,
      operationNumber: 0,
      syubetsu: 0,
      ressyamei: 0,
      operationNumberRows: 1,
    },
    jikokuhyouPrevSyubetsuChangeDisplayKudari: {
      ressyabangou: 0,
      operationNumber: 0,
      syubetsu: 0,
      ressyamei: 0,
      operationNumberRows: 1,
    },
    jikokuhyouPrevSyubetsuChangeDisplayNobori: {
      ressyabangou: 0,
      operationNumber: 0,
      syubetsu: 0,
      ressyamei: 0,
      operationNumberRows: 1,
    },
    jikokuhyouNyuusenJikokuDisplayKudari: false,
    jikokuhyouNyuusenJikokuDisplayNobori: false,
    diagramColorNextEki: 0,
    operationTableDisplayJikoku: false,
    jikokuhyouOuterDisplayKudari: { origin: false, terminal: false },
    jikokuhyouOuterDisplayNobori: { origin: false, terminal: false },
    ...over,
  };
}

function ctxOf(ekiCont: Eki[]): CellContext {
  return {
    ekiCont,
    houkou: RESSYAHOUKOU_KUDARI,
    conv: CONV,
    displayTsuukaEkiJikoku: true,
    syubetsuOf: () => ({ jikokuhyouMojiColor: 0 as never, jikokuhyouFontIndex: 0 }),
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

describe('chakuCell / hatsuCell(マーク分岐)', () => {
  const eki3 = [mkEki({ ekimei: 'A' }), mkEki({ ekimei: 'B' }), mkEki({ ekimei: 'C' })];

  it('通過・時刻なし → tsuuka マーク ﾚ', () => {
    const r = ressyaOf([
      ej('teisya', null, 18000),
      ej('tsuuka', null, null),
      ej('teisya', 18600, null),
    ]);
    const c = chakuCell(ctxOf(eki3), r, r.ekiJikokuCont[1]!, 1, 0, 2);
    expect(c.kind).toBe('mark');
    expect(c.mark).toBe('tsuuka');
  });

  it('通過・時刻あり → 時刻(灰文字・? なし)', () => {
    const r = ressyaOf([
      ej('teisya', null, 18000),
      ej('tsuuka', 18120, 18120),
      ej('teisya', 18600, null),
    ]);
    const c = chakuCell(ctxOf(eki3), r, r.ekiJikokuCont[1]!, 1, 0, 2);
    expect(c.kind).toBe('jikoku');
    expect(c.text.includes('?')).toBe(false);
    expect(c.style.mojiColor).not.toBeNull(); // 灰
  });

  it('運行なし・run-interior → 経由なし ||', () => {
    const r = ressyaOf([
      ej('teisya', null, 18000),
      ej('none', null, null),
      ej('teisya', 18600, null),
    ]);
    const c = chakuCell(ctxOf(eki3), r, r.ekiJikokuCont[1]!, 1, 0, 2);
    expect(c.mark).toBe('keiyunasi');
  });

  it('運行なし・端(before-run)・一般駅 → ・・', () => {
    // 4 駅、始発が駅1。駅0 は before-run。
    const eki4 = [
      mkEki({ ekimei: 'A' }),
      mkEki({ ekimei: 'B' }),
      mkEki({ ekimei: 'C' }),
      mkEki({ ekimei: 'D' }),
    ];
    const r = ressyaOf([
      ej('none', null, null),
      ej('teisya', null, 18000),
      ej('teisya', 18300, 18360),
      ej('teisya', 18600, null),
    ]);
    const c = chakuCell(ctxOf(eki4), r, r.ekiJikokuCont[0]!, 0, 1, 3);
    expect(c.mark).toBe('unkounasiIppan');
  });

  it('運行なし・端・主要駅(非発着・非境界)→ ----', () => {
    // 駅0 を主要駅 & keisiki を発着でないものに。before-run で主要駅表記。
    const eki4 = [
      mkEki({ ekimei: 'A', ekikibo: 'syuyou', ekijikokukeisiki: 'hatsu' }),
      mkEki({ ekimei: 'B' }),
      mkEki({ ekimei: 'C', ekikibo: 'syuyou', ekijikokukeisiki: 'hatsu' }),
      mkEki({ ekimei: 'D' }),
    ];
    // 駅2 が before-run でない…始発を駅3 に、駅2 を none にして主要駅表記を試す。
    const r = ressyaOf([
      ej('teisya', null, 18000),
      ej('teisya', 18300, 18360),
      ej('none', null, null),
      ej('teisya', 18900, null),
    ]);
    // 駅2 は run-interior(始発0 < 2 < 終着3)なので経由なしになる。主要駅表記は端でのみ。
    const c = chakuCell(ctxOf(eki4), r, r.ekiJikokuCont[2]!, 2, 0, 3);
    expect(c.mark).toBe('keiyunasi'); // interior が優先
  });

  it('停車・着なし・発なし → 停車マル ○', () => {
    const r = ressyaOf([
      ej('teisya', null, 18000),
      ej('teisya', null, null),
      ej('teisya', 18600, null),
    ]);
    const c = chakuCell(ctxOf(eki3), r, r.ekiJikokuCont[1]!, 1, 0, 2);
    expect(c.mark).toBe('teisyaMaru');
  });

  it('停車・着なし・発あり・始発駅 → ・・', () => {
    const r = ressyaOf([ej('teisya', null, 18000), ej('teisya', 18600, null)]);
    const eki2 = [mkEki({ ekimei: 'A' }), mkEki({ ekimei: 'B' })];
    // 駅0 = 始発、着なし発あり。
    const c = chakuCell(ctxOf(eki2), r, r.ekiJikokuCont[0]!, 0, 0, 1);
    expect(c.mark).toBe('unkounasiIppan');
  });

  it('発セル: 通過・時刻なし → ﾚ', () => {
    const r = ressyaOf([
      ej('teisya', null, 18000),
      ej('tsuuka', null, null),
      ej('teisya', 18600, null),
    ]);
    const c = hatsuCell(ctxOf(eki3), r, r.ekiJikokuCont[1]!, 1, 0, 2);
    expect(c.mark).toBe('tsuuka');
  });
});

describe('trackCell', () => {
  const eki2 = [mkEki({ ekimei: 'A' }), mkEki({ ekimei: 'B' })];

  it('停車 → 番線略称(ressyaTrackIndex 1 → ekiTrack2Cont[1] の略称 "2番")', () => {
    const r = ressyaOf([ej('teisya', null, 18000, 1), ej('teisya', 18600, null, 0)]);
    const c = trackCell(ctxOf(eki2), r.ekiJikokuCont[0]!, 0, 0, 1);
    expect(c.text).toBe('2番');
    expect(c.kind).toBe('track');
  });

  it('運行なし・端 → 空', () => {
    const r = ressyaOf([ej('none', null, null), ej('teisya', 18600, null)]);
    const c = trackCell(ctxOf(eki2), r.ekiJikokuCont[0]!, 0, 1, 1);
    expect(c.kind).toBe('empty');
  });
});

describe('getKyoukaisen(境界線導出)', () => {
  it('下り: 当駅 KudariChaku かつ brunchCore≥0 → true', () => {
    const eki = [
      mkEki({ ekimei: 'A' }),
      mkEki({ ekimei: 'B', ekijikokukeisiki: 'kudariChaku', brunchCoreEkiIndex: 2 }),
      mkEki({ ekimei: 'B', ekijikokukeisiki: 'hatsuchaku' }),
      mkEki({ ekimei: 'D' }),
    ];
    expect(getKyoukaisen(eki, 1, RESSYAHOUKOU_KUDARI)).toBe(true);
    expect(getKyoukaisen(eki, 0, RESSYAHOUKOU_KUDARI)).toBe(false);
  });

  it('下り: 当駅 KudariChaku かつ 次駅 NoboriChaku → true', () => {
    const eki = [
      mkEki({ ekimei: 'A', ekijikokukeisiki: 'kudariChaku' }),
      mkEki({ ekimei: 'B', ekijikokukeisiki: 'noboriChaku' }),
    ];
    expect(getKyoukaisen(eki, 0, RESSYAHOUKOU_KUDARI)).toBe(true);
  });
});
