// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 up-tri

/**
 * カスタマイズ時刻表 CSV(customizeTimetableCsv.ts)の単体テスト。follow-up #11 / ADR-0002。
 *
 * ★ADR-0002 で「原典の欠陥を修正して実装する」と決めた 3 件が再発しないことを固定する:
 * 全行のセル数が一致すること(= 列ズレしないこと)を主要な検証点にする。
 */

import {
  createDefaultDia,
  createDefaultEki,
  createNewRosen,
  createNullRessya,
} from '@oudia-web/domain';
import type { Dia, Rosen } from '@oudia-web/format';
import { asSeconds } from '@oudia-web/format';
import { describe, expect, it } from 'vitest';
import type { CustomizeRowOptions } from '../grid/customizeColSpec.js';
import { createCustomizeChainColumn } from '../operationLight/types.js';
import { buildCustomizeTimetableCsv } from './customizeTimetableCsv.js';

const J = (h: number, m: number) => asSeconds(h * 3600 + m * 60);
const GRID_OPTS = {
  conv: {
    noColon: false,
    outputSecond: false,
    secondRoundChaku: 0,
    secondRoundHatsu: 0,
    display2400: false,
  },
} as const;

function rowOpts(over: Partial<CustomizeRowOptions> = {}): CustomizeRowOptions {
  return {
    displayRessyamei: false,
    enableOperation: 0,
    operationNumberRows: 1,
    displayShihatsuShuchakuEkimei: true,
    ...over,
  };
}

function setup(): { dia: Dia; rosen: Rosen } {
  const rosen = createNewRosen().rosen;
  rosen.ekiCont = [0, 1, 2].map((i) => {
    const e = createDefaultEki(i, `E${String(i)}`);
    e.jikokuhyouJikokuDisplayKudari = { chaku: true, hatsu: true };
    e.jikokuhyouTrackDisplayKudari = true;
    return e;
  });
  const dia = createDefaultDia('ダイヤA');
  const r = createNullRessya(3, 0);
  r.isNull = false;
  r.ressyabangou = '1M';
  for (let o = 0; o < 3; o++) {
    const s = r.ekiJikokuCont[o];
    if (s === undefined) continue;
    s.ekiatsukai = 'teisya';
    s.chakuJikoku = J(8, o * 10);
    s.hatsuJikoku = J(8, o * 10 + 2);
  }
  dia.ressyaCont[0].push(r);
  rosen.diaCont = [dia];
  return { dia, rosen };
}

function lines(csv: string): string[] {
  return csv.replace(/^﻿/, '').split('\r\n');
}

describe('buildCustomizeTimetableCsv', () => {
  it('FileType は .3、3 行目は方向 + カスタマイズ、UTF-8 BOM + CRLF', () => {
    const { dia, rosen } = setup();
    const csv = buildCustomizeTimetableCsv({
      rosen,
      dia,
      houkou: 0,
      chains: [createCustomizeChainColumn([0])],
      rowOptions: rowOpts(),
      gridOptions: GRID_OPTS,
    });
    expect(csv.startsWith('﻿')).toBe(true);
    expect(csv).toContain('\r\n');
    const l = lines(csv);
    expect(l[0]).toBe('FileType,OuDiaSecond.JikokuhyouCsv.3');
    expect(l[1]).toBe('ダイヤA');
    expect(l[2]).toBe('下りカスタマイズ');
    expect(l[3]).toBe('');
  });

  it('上りは「上りカスタマイズ」', () => {
    const { dia, rosen } = setup();
    const csv = buildCustomizeTimetableCsv({
      rosen,
      dia,
      houkou: 1,
      chains: [],
      rowOptions: rowOpts(),
      gridOptions: GRID_OPTS,
    });
    expect(lines(csv)[2]).toBe('上りカスタマイズ');
  });

  it('着 / 発 / 番線 の行だけ駅名がラベルに入る', () => {
    const { dia, rosen } = setup();
    const csv = buildCustomizeTimetableCsv({
      rosen,
      dia,
      houkou: 0,
      chains: [createCustomizeChainColumn([0])],
      rowOptions: rowOpts(),
      gridOptions: GRID_OPTS,
    });
    const l = lines(csv);
    expect(l.some((x) => x.startsWith('E0,着,'))).toBe(true);
    expect(l.some((x) => x.startsWith('E0,発,'))).toBe(true);
    expect(l.some((x) => x.startsWith('E0,番線,'))).toBe(true);
    // 列車番号行は駅名を持たない。
    expect(l.some((x) => x.startsWith('列車番号,,'))).toBe(true);
  });

  it('★始発駅ラベルは "始発駅"(原典は "終着駅" と出るバグ。ADR-0002 で修正)', () => {
    const { dia, rosen } = setup();
    const csv = buildCustomizeTimetableCsv({
      rosen,
      dia,
      houkou: 0,
      chains: [createCustomizeChainColumn([0])],
      rowOptions: rowOpts(),
      gridOptions: GRID_OPTS,
    });
    const l = lines(csv);
    expect(l.filter((x) => x.startsWith('始発駅,,')).length).toBe(1);
    expect(l.filter((x) => x.startsWith('終着駅,,')).length).toBe(1);
  });

  it('★どの表示設定でも全データ行のセル数が一致する(原典の列ズレバグ 3 件の回帰ガード)', () => {
    const { dia, rosen } = setup();
    // 前の列車名・運用番号の多段・列車名 を全部有効にする(原典が壊れる組み合わせ)。
    for (const e of rosen.ekiCont) {
      e.jikokuhyouSyubetsuChangeDisplayKudari = {
        ressyabangou: 1,
        operationNumber: 1,
        syubetsu: 1,
        ressyamei: 1,
        operationNumberRows: 3,
      };
      e.jikokuhyouPrevSyubetsuChangeDisplayKudari = {
        ressyabangou: 1,
        operationNumber: 1,
        syubetsu: 1,
        ressyamei: 1,
        operationNumberRows: 3,
      };
      e.jikokuhyouOuterDisplayKudari = { origin: true, terminal: true };
      e.jikokuhyouNyuusenJikokuDisplayKudari = true;
    }
    const csv = buildCustomizeTimetableCsv({
      rosen,
      dia,
      houkou: 0,
      chains: [createCustomizeChainColumn([0]), createCustomizeChainColumn([])],
      rowOptions: rowOpts({
        enableOperation: 2,
        displayRessyamei: true,
        operationNumberRows: 3,
      }),
      gridOptions: GRID_OPTS,
    });
    // 4 行目までがヘッダ。以降のデータ行はすべて 2(ラベル)+ 2(列)= 4 セル。
    const dataLines = lines(csv)
      .slice(4)
      .filter((x) => x !== '');
    expect(dataLines.length).toBeGreaterThan(10);
    for (const line of dataLines) {
      expect(line.split(',').length).toBe(4);
    }
  });

  it('チェーン列が 0 本でもヘッダだけの CSV を返す', () => {
    const { dia, rosen } = setup();
    const csv = buildCustomizeTimetableCsv({
      rosen,
      dia,
      houkou: 0,
      chains: [],
      rowOptions: rowOpts(),
      gridOptions: GRID_OPTS,
    });
    const dataLines = lines(csv)
      .slice(4)
      .filter((x) => x !== '');
    // データ列が無いのでラベル 2 セルだけ。
    for (const line of dataLines) {
      expect(line.split(',').length).toBe(2);
    }
  });
});
