// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 up-tri

/**
 * 運用一覧表 / 運用一覧図の共通ビューモデル(allOperationTable.ts)の単体テスト。M7d。
 * 列構成(全列車表示 ON/OFF)・maxRessyaCount・出入区の駅名時刻・同一列車扱いの一体化を検証する。
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
import {
  ALL_OPERATION_TABLE_FIX_COLUMN_COUNT,
  type AllOperationTableOptions,
  buildAllOperationTableColumns,
  columnIndexOf,
  countRessyaInOperation,
  deriveAllOperationTable,
} from './allOperationTable.js';

const J = (h: number, m = 0) => asSeconds(h * 3600 + m * 60);

const CONV = {
  noColon: false,
  outputSecond: false,
  secondRoundChaku: 0,
  secondRoundHatsu: 0,
  display2400: false,
} as const;

const OPTS: AllOperationTableOptions = {
  displayRessyamei: true,
  displayAllRessya: false,
  displayParentSyubetsu: false,
  sort: 'operationNumber',
  compareBottom: false,
  kitenJikoku: null,
  conv: CONV,
};

/** E0〜E2 を全区間走行する下り列車。 */
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

function makeRosen(): Rosen {
  const rosen = createNewRosen().rosen;
  rosen.ekiCont = [0, 1, 2].map((i) => createDefaultEki(i, `E${String(i)}`));
  return rosen;
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

describe('buildAllOperationTableColumns', () => {
  it('固定 7 列 + 全列車表示 OFF は列車 2 組固定', () => {
    const cols = buildAllOperationTableColumns(true, false, 5);
    expect(cols.slice(0, 7).map((c) => c.kind)).toEqual([
      'columnNumber',
      'operationNumber',
      'outEkimei',
      'outHatsujikoku',
      'arrow',
      'inEkimei',
      'inChakujikoku',
    ]);
    // 2 組 × (方向/列番/種別/列車名) + 間の矢印 1 本 = 9 列。
    expect(cols.length).toBe(ALL_OPERATION_TABLE_FIX_COLUMN_COUNT + 9);
    expect(cols.filter((c) => c.kind === 'ressyaArrow')).toHaveLength(1);
  });

  it('列車名を出さないと 1 組 3 列になる', () => {
    const cols = buildAllOperationTableColumns(false, false, 5);
    expect(cols.length).toBe(ALL_OPERATION_TABLE_FIX_COLUMN_COUNT + 7); // 3+1+3
  });

  it('全列車表示 ON では maxRessyaCount 組ぶん出て、最後の列車の後に矢印は出ない', () => {
    const cols = buildAllOperationTableColumns(true, true, 3);
    expect(cols.length).toBe(ALL_OPERATION_TABLE_FIX_COLUMN_COUNT + 3 * 4 + 2);
    expect(cols.filter((c) => c.kind === 'ressyaArrow').map((c) => c.ressyaIndex)).toEqual([0, 1]);
  });

  it('maxRessyaCount=0 なら固定 7 列だけ', () => {
    expect(buildAllOperationTableColumns(true, true, 0)).toHaveLength(7);
  });

  it('columnIndexOf は列車 index まで見て引く', () => {
    const cols = buildAllOperationTableColumns(true, true, 2);
    expect(columnIndexOf(cols, { kind: 'inChakujikoku' })).toBe(6);
    expect(columnIndexOf(cols, { kind: 'ressyabangou', ressyaIndex: 1 })).toBeGreaterThan(7);
    expect(columnIndexOf(cols, { kind: 'ressyabangou', ressyaIndex: 9 })).toBe(-1);
  });
});

describe('countRessyaInOperation', () => {
  it('同一列車扱いで連結された 2 件は 1 本に数える', () => {
    const entries = [entry({ afterType: 'propertySame' }), entry({ beforeType: 'propertySame' })];
    expect(countRessyaInOperation(entries)).toBe(1);
  });

  it('種別変更で繋がった 2 件は 2 本のまま', () => {
    const entries = [entry({ afterType: 'classChange' }), entry({ beforeType: 'classChange' })];
    expect(countRessyaInOperation(entries)).toBe(2);
  });
});

describe('deriveAllOperationTable', () => {
  function setup(): { dia: Dia; rosen: Rosen } {
    const rosen = makeRosen();
    const dia = createDefaultDia('D');
    dia.ressyaCont[0].push(makeRessya('1M'), makeRessya('3M'));
    rosen.diaCont = [dia];
    return { dia, rosen };
  }

  it('行 = 運用 1 件。出入区の駅名・時刻が入る', () => {
    const { dia, rosen } = setup();
    const table = new Map<string, OperationTableEntry[]>([
      ['5', [entry({ sihatsuEkiOrder: 0, syuuchakuEkiOrder: 2 })]],
    ]);
    const vm = deriveAllOperationTable(dia, rosen, table, OPTS, deriveBrunchLoopMap(rosen.ekiCont));
    expect(vm.rows).toHaveLength(1);
    const row = vm.rows[0];
    expect(row?.operationNumber).toBe('5');
    expect(row?.rowNumber).toBe(1);
    expect(row?.outEkimei).toBe('E0');
    expect(row?.outJikokuText).toBe(' 8:05'); // E0 の発時刻
    expect(row?.inEkimei).toBe('E2');
    expect(row?.inJikokuText).toBe(' 9:00'); // E2 の着時刻
  });

  it('路線外始発は境界駅の路線外駅名と路線外発時刻を出す', () => {
    const { dia, rosen } = setup();
    const e0 = rosen.ekiCont[0];
    if (e0) e0.outerTerminalCont = [{ ekimei: '車庫', jikokuRyaku: '', diaRyaku: '' }];
    const table = new Map<string, OperationTableEntry[]>([
      ['5', [entry({ outerSihatsuEkiIndex: 0, outerSihatsuJikoku: J(7, 30) })]],
    ]);
    const vm = deriveAllOperationTable(dia, rosen, table, OPTS, deriveBrunchLoopMap(rosen.ekiCont));
    expect(vm.rows[0]?.outEkimei).toBe('車庫');
    expect(vm.rows[0]?.outJikokuText).toBe(' 7:30');
  });

  it('全列車表示 OFF は 出区列車 / 入区列車 の 2 セル', () => {
    const { dia, rosen } = setup();
    const table = new Map<string, OperationTableEntry[]>([
      [
        '5',
        [
          entry({ afterType: 'classChange' }),
          entry({
            ressyaProperty: { houkou: 0, ressyaIndex: 1, jikoku: null },
            beforeType: 'classChange',
          }),
        ],
      ],
    ]);
    const vm = deriveAllOperationTable(dia, rosen, table, OPTS, deriveBrunchLoopMap(rosen.ekiCont));
    expect(vm.rows[0]?.ressya).toHaveLength(2);
    expect(vm.rows[0]?.ressya[0]?.ressyabangou).toBe('1M');
    expect(vm.rows[0]?.ressya[1]?.ressyabangou).toBe('3M');
    expect(vm.rows[0]?.ressya[0]?.arrowAfter).toBe(true);
    expect(vm.rows[0]?.ressya[1]?.arrowAfter).toBe(false);
  });

  it('全列車表示 ON では同一列車扱いの 2 件が 1 セルに潰れる', () => {
    const { dia, rosen } = setup();
    const table = new Map<string, OperationTableEntry[]>([
      [
        '5',
        [
          entry({ afterType: 'propertySame' }),
          entry({
            ressyaProperty: { houkou: 0, ressyaIndex: 1, jikoku: null },
            beforeType: 'propertySame',
          }),
        ],
      ],
    ]);
    const vm = deriveAllOperationTable(
      dia,
      rosen,
      table,
      { ...OPTS, displayAllRessya: true },
      deriveBrunchLoopMap(rosen.ekiCont),
    );
    expect(vm.maxRessyaCount).toBe(1);
    expect(vm.rows[0]?.ressya).toHaveLength(1);
    expect(vm.rows[0]?.ressya[0]?.ressyabangou).toBe('1M');
    expect(vm.rows[0]?.ressya[0]?.arrowAfter).toBe(false);
  });

  it('行順は並べ替え設定に従う(運用番号の自然順)', () => {
    const { dia, rosen } = setup();
    const table = new Map<string, OperationTableEntry[]>([
      ['10', [entry()]],
      ['2', [entry()]],
    ]);
    const vm = deriveAllOperationTable(dia, rosen, table, OPTS, deriveBrunchLoopMap(rosen.ekiCont));
    expect(vm.rows.map((r) => r.operationNumber)).toEqual(['2', '10']);
    expect(vm.rows.map((r) => r.rowNumber)).toEqual([1, 2]);
  });
});
