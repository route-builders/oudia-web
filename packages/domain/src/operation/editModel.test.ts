// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 up-tri

/**
 * flat edit-model ⇔ 再帰 union の双方向変換テスト(PR-1)。
 *
 * 主軸はラウンドトリップ性質: union → toFlat → fromFlat → union が deep-equal に戻ること。
 * 増解結ネスト・全 7 種・空リスト番兵を網羅する。加えて原典 iLevel の代表例
 * (CPropEditUI_Operation.h:180 のツリー例)を golden として検証する。
 */

import type { AfterOperation, BeforeOperation, Jikoku } from '@oudia-web/format';
import { asSeconds } from '@oudia-web/format';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  type FlatOp,
  fromFlatAfter,
  fromFlatBefore,
  OP_CONNECT,
  OP_JUNCTION,
  OP_OUT_IN,
  OP_OUTER,
  OP_RELEASE,
  OP_SHUNT,
  placeholderFlat,
  toFlatAfter,
  toFlatBefore,
} from './editModel.js';

// ---- fast-check arbitraries(再帰 union、ネスト深さ制限)----

const jikoku = (): fc.Arbitrary<Jikoku> =>
  fc.option(
    fc.integer({ min: 0, max: 24 * 3600 - 1 }).map((n): Jikoku => asSeconds(n)),
    { nil: null },
  );

const opNumbers = (): fc.Arbitrary<string[]> =>
  fc.array(
    fc.string({ minLength: 1, maxLength: 3 }).filter((s) => !s.includes(';')),
    {
      maxLength: 3,
    },
  );

const linkCode = (): fc.Arbitrary<string> =>
  fc.string({ maxLength: 4 }).filter((s) => !/[,/$]/.test(s));

/** 末端(非入れ子)の前作業。 */
function beforeLeaf(): fc.Arbitrary<BeforeOperation> {
  return fc.oneof(
    fc.record({
      kind: fc.constant('shunt' as const),
      shuntTrackIndex: fc.nat({ max: 5 }),
      shuntHatsuJikoku: jikoku(),
      shuntChakuJikoku: jikoku(),
      displayJikoku: fc.boolean(),
    }),
    fc.record({
      kind: fc.constant('out' as const),
      outJikoku: jikoku(),
      inOutLinkCode: linkCode(),
      operationNumbers: opNumbers(),
    }),
    fc.record({
      kind: fc.constant('outer' as const),
      outerTerminalIndex: fc.nat({ max: 3 }),
      outerHatsuJikoku: jikoku(),
      chakuJikoku: jikoku(),
      inOutLinkCode: linkCode(),
      operationNumbers: opNumbers(),
    }),
    fc.record({
      kind: fc.constant('junction' as const),
      kitenJikoku: jikoku(),
      kariOperationNumbers: opNumbers(),
    }),
    // numberChange: 空配列 = 反転(check1 経由)。往復で空配列/非空配列を両方生成。
    fc.record({
      kind: fc.constant('numberChange' as const),
      operationNumbers: opNumbers(),
    }),
  );
}

/** 末端の後作業。 */
function afterLeaf(): fc.Arbitrary<AfterOperation> {
  return fc.oneof(
    fc.record({
      kind: fc.constant('shunt' as const),
      shuntTrackIndex: fc.nat({ max: 5 }),
      shuntHatsuJikoku: jikoku(),
      shuntChakuJikoku: jikoku(),
      displayJikoku: fc.boolean(),
    }),
    fc.record({
      kind: fc.constant('in' as const),
      inJikoku: jikoku(),
      inOutLinkCode: linkCode(),
    }),
    fc.record({
      kind: fc.constant('outer' as const),
      outerTerminalIndex: fc.nat({ max: 3 }),
      hatsuJikoku: jikoku(),
      outerChakuJikoku: jikoku(),
      inOutLinkCode: linkCode(),
    }),
    fc.record({
      kind: fc.constant('junction' as const),
      syuutenJikoku: jikoku(),
      junctionType: fc.constantFrom(
        'unrelated' as const,
        'classChange' as const,
        'propertyChange' as const,
        'propertySame' as const,
      ),
    }),
    fc.record({
      kind: fc.constant('numberChange' as const),
      operationNumbers: opNumbers(),
    }),
  );
}

/** 前作業列(connect の子=前作業列 / release の子=後作業列。深さ制限あり)。 */
function beforeCont(depth: number): fc.Arbitrary<BeforeOperation[]> {
  if (depth <= 0) return fc.array(beforeLeaf(), { maxLength: 3 });
  const node = fc.oneof(
    { weight: 3, arbitrary: beforeLeaf() },
    {
      weight: 1,
      arbitrary: fc.record({
        kind: fc.constant('connect' as const),
        connectToFront: fc.boolean(),
        connectJikoku: jikoku(),
        formationBeforeOperationCont: beforeCont(depth - 1),
      }),
    },
    {
      weight: 1,
      arbitrary: fc.record({
        kind: fc.constant('release' as const),
        releasePosition: fc.constantFrom(0 as const, 1 as const, 2 as const),
        releaseCount: fc.integer({ min: 1, max: 10 }),
        releaseJikoku: jikoku(),
        formationAfterOperationCont: afterCont(depth - 1),
      }),
    },
  );
  return fc.array(node, { maxLength: 3 });
}

/** 後作業列。 */
function afterCont(depth: number): fc.Arbitrary<AfterOperation[]> {
  if (depth <= 0) return fc.array(afterLeaf(), { maxLength: 3 });
  const node = fc.oneof(
    { weight: 3, arbitrary: afterLeaf() },
    {
      weight: 1,
      arbitrary: fc.record({
        kind: fc.constant('connect' as const),
        connectToFront: fc.boolean(),
        connectJikoku: jikoku(),
        formationBeforeOperationCont: beforeCont(depth - 1),
      }),
    },
    {
      weight: 1,
      arbitrary: fc.record({
        kind: fc.constant('release' as const),
        releasePosition: fc.constantFrom(0 as const, 1 as const, 2 as const),
        releaseCount: fc.integer({ min: 1, max: 10 }),
        releaseJikoku: jikoku(),
        formationAfterOperationCont: afterCont(depth - 1),
      }),
    },
  );
  return fc.array(node, { maxLength: 3 });
}

/**
 * numberChange の空配列は往復で check1 経由 → 空配列に戻る(等価だが、生成側で
 * 空配列と非空配列の両方を許容しているため、期待は「意味的等価」= 同じ配列)。
 * fromFlat は check1(空判定)で空配列を復元するので、numberChange の空配列は空配列のまま。
 * したがって単純な deep-equal で往復不変になる。
 */

describe('editModel ラウンドトリップ(前作業)', () => {
  it('union → toFlat → fromFlat → union が deep-equal(ネスト・全種)', () => {
    fc.assert(
      fc.property(beforeCont(3), (cont) => {
        const round = fromFlatBefore(toFlatBefore(cont));
        expect(round).toEqual(cont);
      }),
      { numRuns: 400 },
    );
  });
});

describe('editModel ラウンドトリップ(後作業)', () => {
  it('union → toFlat → fromFlat → union が deep-equal(ネスト・全種)', () => {
    fc.assert(
      fc.property(afterCont(3), (cont) => {
        const round = fromFlatAfter(toFlatAfter(cont));
        expect(round).toEqual(cont);
      }),
      { numRuns: 400 },
    );
  });
});

describe('editModel 空リスト番兵', () => {
  it('空 union → toFlat は空、placeholderFlat は fromFlat で空へ戻る', () => {
    expect(toFlatBefore([])).toEqual([]);
    expect(toFlatAfter([])).toEqual([]);
    // プレースホルダ(iOp=7)は fromFlat で捨てられる。
    expect(fromFlatBefore(placeholderFlat())).toEqual([]);
    expect(fromFlatAfter(placeholderFlat())).toEqual([]);
  });
});

describe('editModel iLevel golden(原典 h:180 のツリー例)', () => {
  // 原典例: EkiJikoku 直下[入換A, 解結A, 入換B, 入区A]、
  //   解結A の子(後作業)=[入換C, 増結A, 路線外終着A(=outer)]、
  //   増結A の子(前作業)=[出区A(=out), 入換D]。
  //   flat+iLevel: 0=入換A / 1=解結A / 1,0=入換C / 1,1,0=出区A / 1,1,1=入換D /
  //                1,1=増結A / 1,2=路線外終着A / 2=入換B / 3=入区A
  const cont: AfterOperation[] = [
    {
      kind: 'shunt',
      shuntTrackIndex: 0,
      shuntHatsuJikoku: null,
      shuntChakuJikoku: null,
      displayJikoku: false,
    }, // 入換A
    {
      kind: 'release', // 解結A
      releasePosition: 0,
      releaseCount: 1,
      releaseJikoku: null,
      formationAfterOperationCont: [
        {
          kind: 'shunt',
          shuntTrackIndex: 1,
          shuntHatsuJikoku: null,
          shuntChakuJikoku: null,
          displayJikoku: false,
        }, // 入換C
        {
          kind: 'connect', // 増結A(子=前作業列)
          connectToFront: false,
          connectJikoku: null,
          formationBeforeOperationCont: [
            { kind: 'out', outJikoku: null, inOutLinkCode: '', operationNumbers: [] }, // 出区A
            {
              kind: 'shunt',
              shuntTrackIndex: 2,
              shuntHatsuJikoku: null,
              shuntChakuJikoku: null,
              displayJikoku: false,
            }, // 入換D
          ],
        },
        {
          kind: 'outer',
          outerTerminalIndex: 0,
          hatsuJikoku: null,
          outerChakuJikoku: null,
          inOutLinkCode: '',
        }, // 路線外終着A
      ],
    },
    {
      kind: 'shunt',
      shuntTrackIndex: 3,
      shuntHatsuJikoku: null,
      shuntChakuJikoku: null,
      displayJikoku: false,
    }, // 入換B
    { kind: 'in', inJikoku: null, inOutLinkCode: '' }, // 入区A
  ];

  it('flat の順序と iLevel が原典例と一致する', () => {
    const flat = toFlatAfter(cont);
    const shape = flat.map((op) => ({ kind: op.kind, level: op.level }));
    // 原典の表示順: 入換A(0) / 解結A(1) / 入換C(1,0) / 出区A(1,1,0) / 入換D(1,1,1) /
    //              増結A(1,1) / 路線外終着A(1,2) / 入換B(2) / 入区A(3)
    expect(shape).toEqual([
      { kind: OP_SHUNT, level: [0] }, // 入換A
      { kind: OP_RELEASE, level: [1] }, // 解結A(自分が先)
      { kind: OP_SHUNT, level: [1, 0] }, // 入換C
      { kind: OP_OUT_IN, level: [1, 1, 0] }, // 出区A(増結の子=前作業、子が先)
      { kind: OP_SHUNT, level: [1, 1, 1] }, // 入換D
      { kind: OP_CONNECT, level: [1, 1] }, // 増結A(子の後に自分)
      { kind: OP_OUTER, level: [1, 2] }, // 路線外終着A
      { kind: OP_SHUNT, level: [2] }, // 入換B
      { kind: OP_OUT_IN, level: [3] }, // 入区A
    ]);
  });

  it('golden 例が往復で復元される', () => {
    expect(fromFlatAfter(toFlatAfter(cont))).toEqual(cont);
  });
});

describe('editModel before/after 非対称', () => {
  it('out(前)は運番+連携、in(後)は連携のみ(operationNumbers を持たない)', () => {
    const before: BeforeOperation[] = [
      {
        kind: 'out',
        outJikoku: asSeconds(3600),
        inOutLinkCode: 'AB',
        operationNumbers: ['1', '2'],
      },
    ];
    const after: AfterOperation[] = [
      { kind: 'in', inJikoku: asSeconds(3600), inOutLinkCode: 'CD' },
    ];
    const fb = toFlatBefore(before)[0] as FlatOp;
    const fa = toFlatAfter(after)[0] as FlatOp;
    expect(fb.kind).toBe(OP_OUT_IN);
    expect(fb.operationNumbers).toEqual(['1', '2']);
    expect(fa.kind).toBe(OP_OUT_IN);
    expect(fa.operationNumbers).toEqual([]); // 入区は運番なし
    // 往復で in には operationNumbers が生えない。
    expect(fromFlatAfter(toFlatAfter(after))).toEqual(after);
  });

  it('junction(前)=仮運番持ち、junction(後)=接続タイプ持ち・運番なし', () => {
    const before: BeforeOperation[] = [
      { kind: 'junction', kitenJikoku: null, kariOperationNumbers: ['A1'] },
    ];
    const after: AfterOperation[] = [
      { kind: 'junction', syuutenJikoku: null, junctionType: 'classChange' },
    ];
    const fb = toFlatBefore(before)[0] as FlatOp;
    const fa = toFlatAfter(after)[0] as FlatOp;
    expect(fb.kind).toBe(OP_JUNCTION);
    expect(fb.operationNumbers).toEqual(['A1']);
    expect(fa.kind).toBe(OP_JUNCTION);
    expect(fa.comboData1).toBe(1); // classChange
    expect(fromFlatBefore(toFlatBefore(before))).toEqual(before);
    expect(fromFlatAfter(toFlatAfter(after))).toEqual(after);
  });
});
