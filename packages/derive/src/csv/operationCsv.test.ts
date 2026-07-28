// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 up-tri

/**
 * 運用表 CSV / 運用一覧表 CSV(operationCsv.ts)の単体テスト。M7d。
 * ブロック構造・項目名行・UTF-8 BOM + CRLF を検証する。
 */

import {
  createDefaultDia,
  createDefaultEki,
  createNewRosen,
  createNullRessya,
  deriveBrunchLoopMap,
} from '@oudia-web/domain';
import type { Dia, Ressya, Rosen } from '@oudia-web/format';
import { asSeconds } from '@oudia-web/format';
import { describe, expect, it } from 'vitest';
import type { OperationTableEntry } from '../operationFull/types.js';
import { deriveAllOperationTable } from '../operationView/allOperationTable.js';
import type { OperationTableViewOptions } from '../operationView/operationTableView.js';
import { buildAllOperationTableCsv, buildOperationTableCsv } from './operationCsv.js';

const J = (h: number, m = 0) => asSeconds(h * 3600 + m * 60);
const CONV = {
  noColon: false,
  outputSecond: false,
  secondRoundChaku: 0,
  secondRoundHatsu: 0,
  display2400: false,
} as const;

const VIEW_OPTS: OperationTableViewOptions = {
  displayRessyamei: false,
  displayTrackName: false,
  displayParentSyubetsu: false,
  displayNoboriLeftToRight: false,
  conv: CONV,
};

function makeRessya(bangou: string): Ressya {
  const r = createNullRessya(3, 0);
  r.isNull = false;
  r.ressyabangou = bangou;
  for (let o = 0; o < 3; o++) {
    const s = r.ekiJikokuCont[o];
    if (s === undefined) continue;
    s.ekiatsukai = 'teisya';
    s.chakuJikoku = J(8, o * 30);
    s.hatsuJikoku = J(8, o * 30 + 5);
  }
  return r;
}

function setup(): { dia: Dia; rosen: Rosen } {
  const rosen = createNewRosen().rosen;
  rosen.ekiCont = [0, 1, 2].map((i) => createDefaultEki(i, `E${String(i)}`));
  const dia = createDefaultDia('ダイヤA');
  dia.ressyaCont[0].push(makeRessya('1M'));
  rosen.diaCont = [dia];
  return { dia, rosen };
}

function entry(over: Partial<OperationTableEntry> = {}): OperationTableEntry {
  return {
    ressyaProperty: { houkou: 0, ressyaIndex: 0, jikoku: null },
    sihatsuEkiOrder: 0,
    beforeType: 'outIn',
    outerSihatsuEkiIndex: null,
    outerSihatsuJikoku: null,
    chakuJikoku: null,
    syuuchakuEkiOrder: 2,
    afterType: 'outIn',
    outerSyuuchakuEkiIndex: null,
    hatsuJikoku: null,
    outerSyuuchakuJikoku: null,
    afterOperation: null,
    ...over,
  };
}

describe('buildOperationTableCsv', () => {
  it('1 行目はダイヤ名、以降は 空行/運番/項目名/データ の繰り返し', () => {
    const { dia, rosen } = setup();
    const table = new Map<string, OperationTableEntry[]>([['5', [entry()]]]);
    const csv = buildOperationTableCsv({
      rosen,
      dia,
      operationNumbers: ['5'],
      operationTable: table,
      options: VIEW_OPTS,
    });
    // BOM + CRLF(原典 stringToFile と同じ)。
    expect(csv.startsWith('﻿')).toBe(true);
    expect(csv).toContain('\r\n');
    const lines = csv.replace(/^﻿/, '').split('\r\n');
    expect(lines[0]).toBe('ダイヤA');
    expect(lines[1]).toBe(''); // 空行
    expect(lines[2]).toBe('5');
    expect(lines[3]).toBe('列車番号,列車種別,駅名,駅時刻,,駅名,駅時刻');
    expect(lines[4]).toContain('1M');
    expect(lines[4]).toContain('E0');
    expect(lines[4]).toContain('E2');
  });

  it('番線表示で項目名行に番線列が入る', () => {
    const { dia, rosen } = setup();
    const table = new Map<string, OperationTableEntry[]>([['5', [entry()]]]);
    const csv = buildOperationTableCsv({
      rosen,
      dia,
      operationNumbers: ['5'],
      operationTable: table,
      options: { ...VIEW_OPTS, displayTrackName: true },
    });
    const lines = csv.replace(/^﻿/, '').split('\r\n');
    expect(lines[3]).toBe('列車番号,列車種別,駅名,番線,駅時刻,,駅名,番線,駅時刻');
  });

  it('エントリがない運用番号は出力しない', () => {
    const { dia, rosen } = setup();
    const csv = buildOperationTableCsv({
      rosen,
      dia,
      operationNumbers: ['9'],
      operationTable: new Map(),
      options: VIEW_OPTS,
    });
    expect(csv.replace(/^﻿/, '')).toBe('ダイヤA\r\n');
  });
});

describe('buildAllOperationTableCsv', () => {
  it('FileType 行 → ダイヤ名 → 空行 → 項目名行 → データ行', () => {
    const { dia, rosen } = setup();
    const table = new Map<string, OperationTableEntry[]>([['5', [entry()]]]);
    const vm = deriveAllOperationTable(
      dia,
      rosen,
      table,
      {
        displayRessyamei: false,
        displayAllRessya: false,
        displayParentSyubetsu: false,
        sort: 'operationNumber',
        compareBottom: false,
        kitenJikoku: null,
        conv: CONV,
      },
      deriveBrunchLoopMap(rosen.ekiCont),
    );
    const csv = buildAllOperationTableCsv({
      dia,
      viewModel: vm,
      displayRessyamei: false,
      displayAllRessya: false,
    });
    const lines = csv.replace(/^﻿/, '').split('\r\n');
    expect(lines[0]).toBe('FileType,OuDiaSecond.AllOperationTableCsv.1');
    expect(lines[1]).toBe('ダイヤA');
    expect(lines[2]).toBe('');
    expect(lines[3]?.startsWith(',運用番号,出区駅名,発時刻,,入区駅名,着時刻')).toBe(true);
    expect(lines[4]?.startsWith('1,5,E0,')).toBe(true);
  });
});
