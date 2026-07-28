// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 up-tri

/**
 * flat 編集操作(add/insert/childAdd/clear/種別変更)の iLevel 補正テスト(PR-2)。
 * 3 階層ネストで off-by-one を検査し、往復(fromFlat)で union が壊れないことを確認する。
 */

import type { AfterOperation } from '@oudia-web/format';
import { describe, expect, it } from 'vitest';
import {
  type FlatOp,
  fromFlatAfter,
  OP_JUNCTION,
  OP_PLACEHOLDER,
  OP_RELEASE,
  OP_SHUNT,
  toFlatAfter,
} from './editModel.js';
import {
  childOperationAdd,
  operationAdd,
  operationClear,
  operationInsert,
  setKind,
} from './editOps.js';

/** level だけ取り出して検査しやすくする。 */
function levels(flat: readonly FlatOp[]): number[][] {
  return flat.map((o) => o.level);
}

describe('operationAdd', () => {
  it('プレースホルダ選択で入換1件に置換', () => {
    const start: FlatOp[] = [{ ...blank(), kind: OP_PLACEHOLDER, level: [0] }];
    const r = operationAdd(start, 0);
    expect(r.flat).toHaveLength(1);
    expect(r.flat[0]?.kind).toBe(OP_SHUNT);
    expect(r.flat[0]?.level).toEqual([0]);
    expect(r.selected).toBe(0);
  });

  it('トップレベルで後ろに追加し後続 level を +1', () => {
    // [0:入換, 1:入換] の 0 を選択 → 1 に入換追加、旧 1 は 2 へ。
    const start: FlatOp[] = [
      { ...blank(), kind: OP_SHUNT, level: [0] },
      { ...blank(), kind: OP_SHUNT, level: [1] },
    ];
    const r = operationAdd(start, 0);
    expect(levels(r.flat)).toEqual([[0], [1], [2]]);
    expect(r.selected).toBe(1);
  });
});

describe('operationInsert', () => {
  it('トップレベルで前に挿入し当該以降 level を +1', () => {
    const start: FlatOp[] = [
      { ...blank(), kind: OP_SHUNT, level: [0] },
      { ...blank(), kind: OP_SHUNT, level: [1] },
    ];
    const r = operationInsert(start, 1); // 1 の前に挿入
    expect(levels(r.flat)).toEqual([[0], [1], [2]]);
    expect(r.selected).toBe(1);
  });
});

describe('childOperationAdd', () => {
  it('解結の子として後作業を追加すると level が [i,子] で入る', () => {
    // [0:解結, 0,0:次列車接続(子)] の解結を選択 → 子後作業を追加。
    const start: FlatOp[] = [
      { ...blank(), kind: OP_RELEASE, level: [0] },
      { ...blank(), kind: OP_JUNCTION, level: [0, 0] },
    ];
    const r = childOperationAdd(start, 0);
    // 選択+1 に新規、level は次行 [0,0] を継承、旧 [0,0] は [0,1] へ。
    expect(levels(r.flat)).toEqual([[0], [0, 0], [0, 1]]);
    expect(r.flat[1]?.kind).toBe(OP_SHUNT);
    expect(r.selected).toBe(1);
  });
});

describe('operationClear', () => {
  it('解結を削除すると子後作業群も消える', () => {
    const start: FlatOp[] = [
      { ...blank(), kind: OP_SHUNT, level: [0] },
      { ...blank(), kind: OP_RELEASE, level: [1] },
      { ...blank(), kind: OP_JUNCTION, level: [1, 0] },
      { ...blank(), kind: OP_SHUNT, level: [1, 1] },
      { ...blank(), kind: OP_SHUNT, level: [2] },
    ];
    const r = operationClear(start, 1); // 解結を削除
    // 解結 + 子2件が消え、末尾 [2] は [1] へ繰り上がる。
    expect(levels(r.flat)).toEqual([[0], [1]]);
    expect(r.flat[1]?.kind).toBe(OP_SHUNT);
  });

  it('全削除でプレースホルダに戻る', () => {
    const start: FlatOp[] = [{ ...blank(), kind: OP_SHUNT, level: [0] }];
    const r = operationClear(start, 0);
    expect(r.flat).toHaveLength(1);
    expect(r.flat[0]?.kind).toBe(OP_PLACEHOLDER);
  });
});

describe('setKind', () => {
  it('入換 → 解結で子(次列車接続)が1件生える', () => {
    const start: FlatOp[] = [{ ...blank(), kind: OP_SHUNT, level: [0] }];
    const r = setKind(start, 0, OP_RELEASE, true);
    expect(r.flat[0]?.kind).toBe(OP_RELEASE);
    expect(r.flat[1]?.kind).toBe(OP_JUNCTION);
    expect(r.flat[1]?.level).toEqual([0, 0]);
  });

  it('解結 → 入換で子群が消える', () => {
    const start: FlatOp[] = [
      { ...blank(), kind: OP_RELEASE, level: [0] },
      { ...blank(), kind: OP_JUNCTION, level: [0, 0] },
    ];
    const r = setKind(start, 0, OP_SHUNT, true);
    expect(r.flat).toHaveLength(1);
    expect(r.flat[0]?.kind).toBe(OP_SHUNT);
    expect(r.flat[0]?.level).toEqual([0]);
  });
});

describe('編集後も fromFlat で union が組める(整合性)', () => {
  it('解結の子追加 → union が入れ子を保つ', () => {
    const start: FlatOp[] = [
      { ...blank(), kind: OP_RELEASE, level: [0], releaseCount: 1 },
      { ...blank(), kind: OP_JUNCTION, level: [0, 0] },
    ];
    const r = childOperationAdd(start, 0);
    const union = fromFlatAfter(r.flat);
    expect(union).toHaveLength(1);
    const rel = union[0];
    expect(rel?.kind).toBe('release');
    if (rel?.kind === 'release') {
      expect(rel.formationAfterOperationCont).toHaveLength(2);
    }
  });

  it('3 階層ネスト(解結>増結>子)の add が往復で壊れない', () => {
    // 解結[0] > 子後作業に増結[0,0](その前作業に junction[0,0,0])
    const cont: AfterOperation[] = [
      {
        kind: 'release',
        releasePosition: 0,
        releaseCount: 1,
        releaseJikoku: null,
        formationAfterOperationCont: [
          {
            kind: 'connect',
            connectToFront: false,
            connectJikoku: null,
            formationBeforeOperationCont: [
              { kind: 'junction', kitenJikoku: null, kariOperationNumbers: [] },
            ],
          },
        ],
      },
    ];
    const flat = toFlatAfter(cont);
    // 一番外の解結(level [0])を選択して後ろに作業追加。
    const relIdx = flat.findIndex((o) => o.kind === OP_RELEASE && o.level.length === 1);
    const r = operationAdd(flat, relIdx);
    // 往復で union が組め、解結の入れ子が保たれる。
    const union = fromFlatAfter(r.flat);
    const rel = union.find((o) => o.kind === 'release');
    expect(rel?.kind).toBe('release');
    if (rel?.kind === 'release') {
      const inner = rel.formationAfterOperationCont[0];
      expect(inner?.kind).toBe('connect');
      if (inner?.kind === 'connect') {
        expect(inner.formationBeforeOperationCont[0]?.kind).toBe('junction');
      }
    }
  });
});

function blank(): FlatOp {
  return {
    kind: OP_SHUNT,
    comboData1: 0,
    editData1: null,
    editData2: null,
    releaseCount: 0,
    check1: false,
    operationNumbers: [],
    inOutLinkCode: '',
    level: [0],
  };
}
