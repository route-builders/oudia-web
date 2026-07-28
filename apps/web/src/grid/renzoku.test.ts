// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 up-tri

// 連続入力モード純ロジック(canEnter / calcCellToNext / 編集中マーク)の検証。

import type { JikokuhyouRowSpec, TimetableGridSpec } from '@oudia-web/derive';
import type { EkiJikoku, Ressya } from '@oudia-web/format';
import { asSeconds } from '@oudia-web/format';
import { describe, expect, it } from 'vitest';
import {
  calcJikokuRowToNext,
  canEnterRenzoku,
  isHatsuChakuHyouji,
  renzokuEditMark,
} from './renzoku.js';

function r(type: JikokuhyouRowSpec['type'], ekiOrder: number | null = null): JikokuhyouRowSpec {
  return { type, ekiOrder, isContinuation: false, operationIndex: 0, bottomBorder: 'narrow' };
}

// 行 = [列車番号, 着0, 番線0, 発0, 発1, 備考]、列車 1 本。
const GRID: TimetableGridSpec = {
  houkou: 0,
  columns: [{ type: 'ekimei' }, { type: 'chakuhatsu' }, { type: 'ressya', ressyaIndex: 0 }],
  rows: [r('ressyabangou'), r('chaku', 0), r('track', 0), r('hatsu', 0), r('hatsu', 1), r('bikou')],
  cells: [],
  ekijikokuRowRange: { begin: 1, end: 5 },
};

function ej(over: Partial<EkiJikoku> = {}): EkiJikoku {
  return {
    ekiatsukai: 'teisya',
    chakuJikoku: null,
    hatsuJikoku: null,
    ressyaTrackIndex: null,
    beforeOperationCont: [],
    afterOperationCont: [],
    ...over,
  };
}

function makeRessya(slots: EkiJikoku[]): Ressya {
  return {
    isNull: false,
    houkou: 0,
    syubetsuIndex: 0,
    ressyabangou: '1',
    ressyamei: '',
    gousuu: '',
    bikou: '',
    isCanceled: false,
    ekiJikokuCont: slots,
  };
}

describe('canEnterRenzoku', () => {
  const ressya = makeRessya([ej({ hatsuJikoku: asSeconds(33300) }), ej()]); // 駅0 発 9:15

  it('駅時刻セル + 前に時刻あり → 入場可(駅1 の発行)', () => {
    expect(canEnterRenzoku(GRID, { row: 4, col: 2 }, [ressya])).toBe(true);
  });

  it('前に時刻がない(駅0 の着行)→ 不可', () => {
    expect(canEnterRenzoku(GRID, { row: 1, col: 2 }, [ressya])).toBe(false);
  });

  it('駅時刻行以外(列車番号行・番線行)→ 不可', () => {
    expect(canEnterRenzoku(GRID, { row: 0, col: 2 }, [ressya])).toBe(false);
    expect(canEnterRenzoku(GRID, { row: 2, col: 2 }, [ressya])).toBe(false);
  });

  it('列車列以外(駅名列)→ 不可', () => {
    expect(canEnterRenzoku(GRID, { row: 4, col: 0 }, [ressya])).toBe(false);
  });
});

describe('calcJikokuRowToNext', () => {
  it('番線行をスキップして次の時刻行へ(着0 → 発0)', () => {
    expect(calcJikokuRowToNext(GRID, 1, 1)).toBe(3);
  });

  it('ブロック外に出たら null(最終時刻行 → 自動終了)', () => {
    expect(calcJikokuRowToNext(GRID, 4, 1)).toBeNull();
    expect(calcJikokuRowToNext(GRID, 1, -1)).toBeNull();
  });
});

describe('renzokuEditMark("%2d%-2s")', () => {
  it('時 9・分未入力 → " 9  "、分 "3" → " 93 "', () => {
    const ressya = makeRessya([ej({ hatsuJikoku: asSeconds(9 * 3600 + 15 * 60) }), ej()]);
    expect(renzokuEditMark(GRID, { row: 4, col: 2 }, [ressya], '')).toBe(' 9  ');
    expect(renzokuEditMark(GRID, { row: 4, col: 2 }, [ressya], '3')).toBe(' 93 ');
  });

  it('時 13 → "13  "。基準なしは null', () => {
    const ressya13 = makeRessya([ej({ hatsuJikoku: asSeconds(13 * 3600) }), ej()]);
    expect(renzokuEditMark(GRID, { row: 4, col: 2 }, [ressya13], '')).toBe('13  ');
    const noRev = makeRessya([ej(), ej()]);
    expect(renzokuEditMark(GRID, { row: 4, col: 2 }, [noRev], '')).toBeNull();
  });
});

describe('isHatsuChakuHyouji', () => {
  it('着行と発行の両方がある駅 0 は true、発のみの駅 1 は false', () => {
    expect(isHatsuChakuHyouji(GRID, 0)).toBe(true);
    expect(isHatsuChakuHyouji(GRID, 1)).toBe(false);
  });
});
