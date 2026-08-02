// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 up-tri

/**
 * 路線外始発 / 終着だけの疑似列(☆1〜☆4 / ブロック(3)(6))の単体テスト。follow-up #11。
 */

import type { AOperationOuter, BOperationOuter } from '@oudia-web/format';
import { asSeconds } from '@oudia-web/format';
import { describe, expect, it } from 'vitest';
import { createCustomizeChainColumn } from '../operationLight/types.js';
import {
  addOuterInsert,
  applyOuterConnectInsertsAt,
  applyOuterReleaseInsertsAt,
  createOuterConnectColumn,
  createOuterInsertList,
  createOuterReleaseColumn,
  outerInsertsAt,
} from './customizeInserts.js';

const J = (h: number, m: number) => asSeconds(h * 3600 + m * 60);

/** 最低限の列車(セル充填には使わないのでフィールドだけ埋める)。 */
function ressya(over: Record<string, unknown> = {}): never {
  return {
    isNull: false,
    isCanceled: false,
    syubetsuIndex: 2,
    ressyabangou: '1M',
    ressyamei: 'あさ',
    gousuu: '3',
    bikou: '',
    ekiJikokuCont: [],
    ...over,
  } as never;
}

const OUTER_BEFORE: BOperationOuter = {
  kind: 'outer',
  outerTerminalIndex: 4,
  outerHatsuJikoku: J(7, 0),
  chakuJikoku: null,
  inOutLinkCode: '',
  operationNumbers: [],
};

const OUTER_AFTER: AOperationOuter = {
  kind: 'outer',
  outerTerminalIndex: 5,
  hatsuJikoku: null,
  outerChakuJikoku: J(23, 30),
  inOutLinkCode: '',
};

const SLOT = {
  ekiatsukai: 'tsuuka',
  chakuJikoku: J(8, 10),
  hatsuJikoku: J(8, 12),
  ressyaTrackIndex: 3,
} as never;

describe('createOuterConnectColumn(☆1/☆2/☆4)', () => {
  it('列車 index を持たない疑似列を作り、列車情報は前列車側だけに入る', () => {
    const col = createOuterConnectColumn(ressya(), 2, OUTER_BEFORE, SLOT, ['A01']);
    expect(col.ressyaIndexCont).toEqual([]);
    expect(col.connectEkiOrder).toBe(2);
    expect(col.sihatsuEkiOrder).toBe(2);
    expect(col.outerSihatsuEkiIndex).toBe(4);
    expect(col.outerSihatsuJikoku).toBe(J(7, 0));
    expect(col.beforeType).toBe('outer');
    expect(col.prevOperationNumber).toEqual(['A01']);
    // ★bIsPrev = true。前列車側だけに入り、非 Prev 側は既定のまま。
    expect(col.prevRessyabangou).toBe('1M');
    expect(col.prevRessyamei).toBe('あさ');
    expect(col.prevGousuu).toBe('3');
    expect(col.prevRessyasyubetsuIndex).toBe(2);
    expect(col.ressyabangou).toBe('');
    expect(col.ressyasyubetsuIndex).toBe(-1);
    // 駅扱い・番線も前列車側。
    expect(col.prevEkiatsukai).toBe('tsuuka');
    expect(col.prevRessyaTrackIndex).toBe(3);
  });

  it('★着時刻が null なら同駅の発時刻で代替する(原典 :5187-5191)', () => {
    const col = createOuterConnectColumn(ressya(), 2, OUTER_BEFORE, SLOT, []);
    expect(col.chakuJikoku).toBe(J(8, 12));
  });
});

describe('createOuterReleaseColumn(☆3)', () => {
  it('列車情報は非 Prev 側に入る', () => {
    const col = createOuterReleaseColumn(ressya(), 3, OUTER_AFTER, SLOT, ['B02']);
    expect(col.ressyaIndexCont).toEqual([]);
    expect(col.releaseEkiOrder).toBe(3);
    expect(col.syuuchakuEkiOrder).toBe(3);
    expect(col.outerSyuuchakuEkiIndex).toBe(5);
    expect(col.outerSyuuchakuJikoku).toBe(J(23, 30));
    expect(col.afterType).toBe('outer');
    expect(col.operationNumber).toEqual(['B02']);
    expect(col.ressyabangou).toBe('1M');
    expect(col.ressyasyubetsuIndex).toBe(2);
    expect(col.prevRessyabangou).toBe('');
    expect(col.prevRessyasyubetsuIndex).toBe(-1);
    expect(col.ekiatsukai).toBe('tsuuka');
    expect(col.ressyaTrackIndex).toBe(3);
  });

  it('★発時刻が null なら同駅の着時刻で代替する(始発側と逆。原典 :7134-7138)', () => {
    const col = createOuterReleaseColumn(ressya(), 3, OUTER_AFTER, SLOT, []);
    expect(col.hatsuJikoku).toBe(J(8, 10));
  });
});

describe('ブロック(3)(6) の差し込み', () => {
  it('(3) は基準列の直左、(6) は直右', () => {
    const mk = (n: number) => {
      const c = createCustomizeChainColumn([]);
      c.connectEkiOrder = n;
      return c;
    };
    const chains = [
      createCustomizeChainColumn([0]),
      createCustomizeChainColumn([1]),
      createCustomizeChainColumn([2]),
    ];
    applyOuterConnectInsertsAt(chains, [{ ressyaIndex: 1, column: mk(11) }]);
    expect(chains.map((c) => [...c.ressyaIndexCont])).toEqual([[0], [], [1], [2]]);
    expect(chains[1]?.connectEkiOrder).toBe(11);

    applyOuterReleaseInsertsAt(chains, [{ ressyaIndex: 1, column: mk(22) }]);
    expect(chains.map((c) => [...c.ressyaIndexCont])).toEqual([[0], [], [1], [], [2]]);
    expect(chains[3]?.connectEkiOrder).toBe(22);
  });

  it('★基準の列車が見つからなければ何もしない', () => {
    const chains = [createCustomizeChainColumn([0])];
    applyOuterConnectInsertsAt(chains, [
      { ressyaIndex: 9, column: createCustomizeChainColumn([]) },
    ]);
    expect(chains).toHaveLength(1);
  });

  it('★探索は最初に一致した列で打ち切る(原典の bInserted)', () => {
    // 列車 1 が 2 つの列に現れる。差し込みは**手前**の列の左。
    const chains = [
      createCustomizeChainColumn([7]),
      createCustomizeChainColumn([1, 8]),
      createCustomizeChainColumn([1]),
    ];
    applyOuterConnectInsertsAt(chains, [
      { ressyaIndex: 1, column: createCustomizeChainColumn([]) },
    ]);
    expect(chains.map((c) => [...c.ressyaIndexCont])).toEqual([[7], [], [1, 8], [1]]);
  });

  it('差し込み待ちは方向 × 駅Order 別・登録順', () => {
    const list = createOuterInsertList();
    const a = createCustomizeChainColumn([]);
    const b = createCustomizeChainColumn([]);
    addOuterInsert(list, 0, 3, { ressyaIndex: 1, column: a });
    addOuterInsert(list, 0, 3, { ressyaIndex: 2, column: b });
    addOuterInsert(list, 1, 3, { ressyaIndex: 3, column: a });
    expect(outerInsertsAt(list, 0, 3).map((e) => e.ressyaIndex)).toEqual([1, 2]);
    expect(outerInsertsAt(list, 1, 3).map((e) => e.ressyaIndex)).toEqual([3]);
    expect(outerInsertsAt(list, 0, 4)).toEqual([]);
  });
});
