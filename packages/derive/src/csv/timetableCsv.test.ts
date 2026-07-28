// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 up-tri

import type {
  Dia,
  DispProp,
  Eki,
  EkiJikoku,
  Ressya,
  Ressyasyubetsu,
  RosenFileData,
} from '@oudia-web/format';
import { asSeconds, RESSYAHOUKOU_KUDARI, RESSYAHOUKOU_NOBORI } from '@oudia-web/format';
import { describe, expect, it } from 'vitest';
import { loadFixture } from './testFixture.js';
import { buildTimetableCsv, defaultTimetableCsvOptions } from './timetableCsv.js';

describe('buildTimetableCsv(実ファイル sample2 スナップショット)', () => {
  it('下り・dia0(平日ダイヤ)', () => {
    const data = loadFixture('current/sample2.oud2');
    const r = buildTimetableCsv(data, {
      diaIndex: 0,
      houkou: RESSYAHOUKOU_KUDARI,
      options: defaultTimetableCsvOptions(data),
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.csv).toMatchSnapshot();
  });

  it('上り・dia0(平日ダイヤ)', () => {
    const data = loadFixture('current/sample2.oud2');
    const r = buildTimetableCsv(data, {
      diaIndex: 0,
      houkou: RESSYAHOUKOU_NOBORI,
      options: defaultTimetableCsvOptions(data),
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.csv).toMatchSnapshot();
  });

  it('下り・dia1(基準運転時分)', () => {
    const data = loadFixture('current/sample2.oud2');
    const r = buildTimetableCsv(data, {
      diaIndex: 1,
      houkou: RESSYAHOUKOU_KUDARI,
      options: defaultTimetableCsvOptions(data),
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.csv).toMatchSnapshot();
  });

  it('BOM 付き UTF-8 + CRLF で FileType 行から始まる(原典 stringToFile と同じ)', () => {
    const data = loadFixture('current/sample2.oud2');
    const r = buildTimetableCsv(data, {
      diaIndex: 0,
      houkou: RESSYAHOUKOU_KUDARI,
      options: defaultTimetableCsvOptions(data),
    });
    if (!r.ok) throw new Error('build failed');
    // 原典 vectorToFile.cpp:174-204 の stringToFile("w , ccs=UTF-8")が
    // UTF-8 BOM を出し、テキストモードが \n を CRLF に変換する。
    expect(r.csv.startsWith('﻿')).toBe(true);
    expect(r.csv.startsWith('﻿FileType,OuDiaSecond.JikokuhyouCsv.2\r\n')).toBe(true);
    expect(r.csv.endsWith('\r\n')).toBe(true);
  });

  it('不正な diaIndex は -1', () => {
    const data = loadFixture('current/sample2.oud2');
    const r = buildTimetableCsv(data, {
      diaIndex: 99,
      houkou: RESSYAHOUKOU_KUDARI,
      options: defaultTimetableCsvOptions(data),
    });
    expect(r).toEqual({ ok: false, code: -1 });
  });
});

// ---- 合成 RosenFileData による分岐カバレッジ(||・? マーク)----

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
      { trackName: '1', trackRyakusyou: '1', trackNoboriRyakusyou: '' },
      { trackName: '2', trackRyakusyou: '2', trackNoboriRyakusyou: '' },
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
    jikokuhyouTrackOmit: true,
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

function ej(
  ekiatsukai: EkiJikoku['ekiatsukai'],
  chaku: number | null,
  hatsu: number | null,
  track: number | null = 0,
): EkiJikoku {
  return {
    ekiatsukai,
    chakuJikoku: chaku === null ? null : asSeconds(chaku),
    hatsuJikoku: hatsu === null ? null : asSeconds(hatsu),
    ressyaTrackIndex: ekiatsukai === 'none' ? null : track,
    beforeOperationCont: [],
    afterOperationCont: [],
  };
}

function mkSyubetsu(name: string): Ressyasyubetsu {
  return {
    syubetsumei: name,
    ryakusyou: name,
    jikokuhyouMojiColor: 0 as never,
    jikokuhyouFontIndex: 0,
    jikokuhyouBackColor: 0 as never,
    diagramLineStyle: { senColor: 0 as never, senStyle: 'jissen', isBold: false },
    stopMarkDrawType: 'drawOnStop',
    parentSyubetsuIndex: null,
    hidden: false,
  };
}

function mkDispProp(): DispProp {
  // CSV に効くフィールドのみ現実的に。他はダミー。
  return {
    displayRessyamei: true,
    secondRoundChaku: 0,
    secondRoundHatsu: 0,
    display2400: false,
  } as unknown as DispProp;
}

function mkData(eki: Eki[], ressya: Ressya[]): RosenFileData {
  const dia: Dia = {
    name: 'テスト',
    mainBackColorIndex: 0,
    subBackColorIndex: 0,
    backPatternIndex: 0,
    patternDiagramPreviewEnable: false,
    patternDiagramPreviewCycleSecond: 600,
    ressyaCont: [ressya, []],
  };
  return {
    sourceFileType: 'OuDiaSecond.1.17',
    rosen: {
      rosenmei: 'テスト線',
      kudariDiaAlias: '',
      noboriDiaAlias: '',
      ekiCont: eki,
      ressyasyubetsuCont: [mkSyubetsu('普通')],
      diaCont: [dia],
      kitenJikoku: null,
      diagramDgrYZahyouKyoriDefault: 60,
      enableOperation: 0,
      operationNumberReverse: false,
      operationCrossKitenJikoku: false,
      kijunDiaIndex: 0,
      disableHiddenSyubetsu: false,
      comment: '',
    },
    dispProp: mkDispProp(),
    windowPlacement: null,
    sourceFileTypeAppComment: null,
  };
}

function ressyaOf(ekiJikokuCont: EkiJikoku[]): Ressya {
  return {
    isNull: false,
    houkou: RESSYAHOUKOU_KUDARI,
    syubetsuIndex: 0,
    ressyabangou: '1',
    ressyamei: '',
    gousuu: '',
    bikou: '',
    isCanceled: false,
    ekiJikokuCont,
  };
}

describe('buildTimetableCsv(合成データによる || / ? 分岐)', () => {
  it('運行範囲内側の None は経由なし ||、通過駅の時刻は ? つき', () => {
    // 3 駅: A(停車)→ B(運行なし)→ C(停車)。B は始発 < B < 終着 → ||。
    const eki = [mkEki({ ekimei: 'A' }), mkEki({ ekimei: 'B' }), mkEki({ ekimei: 'C' })];
    const train = ressyaOf([
      ej('teisya', null, 5 * 3600),
      ej('none', null, null),
      ej('teisya', 5 * 3600 + 600, null),
    ]);
    const data = mkData(eki, [train]);
    const r = buildTimetableCsv(data, {
      diaIndex: 0,
      houkou: RESSYAHOUKOU_KUDARI,
      options: { ...defaultTimetableCsvOptions(data), displayRessyamei: false },
    });
    if (!r.ok) throw new Error('build failed');
    // B の 着/発 セルは || になる(内側 None)。
    expect(r.csv).toContain('B,着,||');
    expect(r.csv).toContain('B,発,||');
  });

  it('通過駅で時刻ありは ? 付き、時刻なしは通過マーク ﾚ', () => {
    const eki = [mkEki({ ekimei: 'A' }), mkEki({ ekimei: 'B' }), mkEki({ ekimei: 'C' })];
    // B は通過・着発時刻あり → "?" 付き。
    const train = ressyaOf([
      ej('teisya', null, 5 * 3600),
      ej('tsuuka', 5 * 3600 + 120, 5 * 3600 + 120),
      ej('teisya', 5 * 3600 + 600, null),
    ]);
    const data = mkData(eki, [train]);
    const r = buildTimetableCsv(data, {
      diaIndex: 0,
      houkou: RESSYAHOUKOU_KUDARI,
      options: { ...defaultTimetableCsvOptions(data), displayRessyamei: false },
    });
    if (!r.ok) throw new Error('build failed');
    expect(r.csv).toContain('B,着, 502?');
    expect(r.csv).toContain('B,発, 502?');
  });

  it('通過駅・時刻なしは通過マーク ﾚ', () => {
    const eki = [mkEki({ ekimei: 'A' }), mkEki({ ekimei: 'B' }), mkEki({ ekimei: 'C' })];
    const train = ressyaOf([
      ej('teisya', null, 5 * 3600),
      ej('tsuuka', null, null),
      ej('teisya', 5 * 3600 + 600, null),
    ]);
    const data = mkData(eki, [train]);
    const r = buildTimetableCsv(data, {
      diaIndex: 0,
      houkou: RESSYAHOUKOU_KUDARI,
      options: { ...defaultTimetableCsvOptions(data), displayRessyamei: false },
    });
    if (!r.ok) throw new Error('build failed');
    expect(r.csv).toContain('B,着, ﾚ');
    expect(r.csv).toContain('B,発, ﾚ');
  });
});
