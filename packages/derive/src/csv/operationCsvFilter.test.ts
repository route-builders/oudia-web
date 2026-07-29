// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 up-tri

/**
 * 運用表 CSV エクスポートの抽出条件(operationCsvFilter.ts)の単体テスト。M7e。
 * 原典 CDlgOperationTableCsvExport::CheckSatisfyConditions の分岐を網羅する。
 */

import { createDefaultEki, getEkiIndexBrunchLoop } from '@oudia-web/domain';
import { describe, expect, it } from 'vitest';
import type { OperationTableEntry } from '../operationFull/types.js';
import {
  filterOperationTableForCsv,
  matchOperationNumber,
  matchOperationStation,
  type OperationCsvExportTarget,
} from './operationCsvFilter.js';

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

describe('matchOperationNumber', () => {
  it('キーワードが空なら常に不一致(原典 :527-530)', () => {
    for (const mode of ['substring', 'exact', 'prefix', 'suffix'] as const) {
      expect(matchOperationNumber('12', '', mode)).toBe(false);
    }
  });

  it('運番よりキーワードが長ければ不一致(原典 :533-535)', () => {
    expect(matchOperationNumber('12', '123', 'substring')).toBe(false);
    expect(matchOperationNumber('12', '123', 'exact')).toBe(false);
  });

  it('★原典どおり index0="と一致する" は部分一致・index1="を含む" は完全一致', () => {
    // ラベルと実装が入れ替わっている原典バグを忠実に移植している。
    expect(matchOperationNumber('A12B', '12', 'substring')).toBe(true);
    expect(matchOperationNumber('A12B', '12', 'exact')).toBe(false);
    expect(matchOperationNumber('12', '12', 'exact')).toBe(true);
  });

  it('前方一致・後方一致', () => {
    expect(matchOperationNumber('12B', '12', 'prefix')).toBe(true);
    expect(matchOperationNumber('A12', '12', 'prefix')).toBe(false);
    expect(matchOperationNumber('A12', '12', 'suffix')).toBe(true);
    expect(matchOperationNumber('12B', '12', 'suffix')).toBe(false);
  });

  it('大小文字は区別する(正規表現・ワイルドカードなし)', () => {
    expect(matchOperationNumber('A12', 'a', 'substring')).toBe(false);
    expect(matchOperationNumber('A*2', '*', 'substring')).toBe(true);
  });
});

describe('matchOperationStation', () => {
  const GROUP = [1];

  it('出区 = 先頭エントリの始発駅、入区 = 末尾エントリの終着駅', () => {
    const entries = [
      entry({ sihatsuEkiOrder: 1, syuuchakuEkiOrder: 2 }),
      entry({ sihatsuEkiOrder: 2, syuuchakuEkiOrder: 0 }),
    ];
    expect(matchOperationStation(entries, GROUP, 'out', true, 3)).toBe(true);
    expect(matchOperationStation(entries, GROUP, 'in', true, 3)).toBe(false);
    expect(matchOperationStation(entries, [0], 'in', true, 3)).toBe(true);
  });

  it('上り列車は EkiIndexOfEkiOrder で駅 index へ正規化する', () => {
    // 上り(houkou=1)・3 駅なら order 0 → index 2。
    const entries = [
      entry({ ressyaProperty: { houkou: 1, ressyaIndex: 0, jikoku: null }, sihatsuEkiOrder: 0 }),
    ];
    expect(matchOperationStation(entries, [2], 'out', true, 3)).toBe(true);
    expect(matchOperationStation(entries, [0], 'out', true, 3)).toBe(false);
  });

  it('[路線外発着を含む] OFF なら路線外発着の運用を落とす(原典 :566-573)', () => {
    const entries = [entry({ sihatsuEkiOrder: 1, outerSihatsuEkiIndex: 0 })];
    expect(matchOperationStation(entries, GROUP, 'out', true, 3)).toBe(true);
    expect(matchOperationStation(entries, GROUP, 'out', false, 3)).toBe(false);
  });

  it('空の運用は該当なし(原典は front()/back() で UB)', () => {
    expect(matchOperationStation([], GROUP, 'out', true, 3)).toBe(false);
  });
});

describe('filterOperationTableForCsv', () => {
  const table = new Map<string, OperationTableEntry[]>([
    ['1', [entry({ sihatsuEkiOrder: 0 })]],
    ['12', [entry({ sihatsuEkiOrder: 1 })]],
    ['A12', [entry({ sihatsuEkiOrder: 2 })]],
  ]);
  const ctx = { ekiIndexGroup: [1], ekiCount: 3 };

  it('全運用を出力', () => {
    const t: OperationCsvExportTarget = { kind: 'all' };
    expect([...filterOperationTableForCsv(table, t, ctx).keys()]).toEqual(['1', '12', 'A12']);
  });

  it('運番マッチ(部分一致)', () => {
    const t: OperationCsvExportTarget = {
      kind: 'operationNumber',
      keyword: '12',
      mode: 'substring',
    };
    expect([...filterOperationTableForCsv(table, t, ctx).keys()]).toEqual(['12', 'A12']);
  });

  it('出区駅指定', () => {
    const t: OperationCsvExportTarget = {
      kind: 'station',
      ekiIndex: 1,
      inOrOut: 'out',
      includeOuterTerminal: true,
    };
    expect([...filterOperationTableForCsv(table, t, ctx).keys()]).toEqual(['12']);
  });

  it('0 件でも例外にせず空 Map を返す(原典も無言でダイヤ名 1 行の CSV を書く)', () => {
    const t: OperationCsvExportTarget = {
      kind: 'operationNumber',
      keyword: 'ZZZ',
      mode: 'substring',
    };
    expect(filterOperationTableForCsv(table, t, ctx).size).toBe(0);
  });
});

describe('getEkiIndexBrunchLoop(駅グループ)', () => {
  it('分岐設定のない駅は自駅のみ', () => {
    const ekiCont = [0, 1, 2].map((i) => createDefaultEki(i, `E${String(i)}`));
    expect(getEkiIndexBrunchLoop(ekiCont, 1)).toEqual([1]);
  });

  it('分岐駅は基幹駅と同じグループになる(原典 :1345-1382 / :1383-1410)', () => {
    const ekiCont = [0, 1, 2, 3].map((i) => createDefaultEki(i, `E${String(i)}`));
    // 駅 3 が駅 1 を基幹駅とする「上方への派生駅」。
    const eki3 = ekiCont[3];
    if (eki3 === undefined) throw new Error('no eki');
    eki3.brunchCoreEkiIndex = 1;
    expect(getEkiIndexBrunchLoop(ekiCont, 3).sort()).toEqual([1, 3]);
    // 基幹駅側から引いても同じ群になる。
    expect(getEkiIndexBrunchLoop(ekiCont, 1).sort()).toEqual([1, 3]);
  });
});
