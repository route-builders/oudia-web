// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 up-tri

/**
 * 入出区連携コード一覧ビューモデル(inOutLinkCodeList.ts)の単体テスト。M7d。
 * 行数(max(入,出))・コードのグループ先頭表示・iStatus による矢印/運番の出し分けを検証する。
 */

import { createNewRosen } from '@oudia-web/domain';
import type { Rosen } from '@oudia-web/format';
import { describe, expect, it } from 'vitest';
import type { InOutLinkCodeEntry } from '../operationFull/types.js';
import { deriveInOutLinkCodeList, IN_OUT_LINK_CODE_LIST_COLUMNS } from './inOutLinkCodeList.js';

const RESSYA = [
  [
    { ressyabangou: '1M', syubetsuIndex: 0 },
    { ressyabangou: '3M', syubetsuIndex: 0 },
    { ressyabangou: '5M', syubetsuIndex: 0 },
  ],
  [{ ressyabangou: '2M', syubetsuIndex: 0 }],
];

function makeRosen(): Rosen {
  return createNewRosen().rosen;
}

function entry(over: Partial<InOutLinkCodeEntry> = {}): InOutLinkCodeEntry {
  return {
    inRessyaProperties: [],
    outRessyaProperties: [],
    status: 0,
    beforeOperation: null,
    operationNumbers: [],
    ...over,
  };
}

const prop = (ressyaIndex: number, houkou: 0 | 1 = 0) => ({
  houkou,
  ressyaIndex,
  jikoku: null,
});

describe('deriveInOutLinkCodeList', () => {
  it('列は常に固定 9 列', () => {
    const vm = deriveInOutLinkCodeList(makeRosen(), RESSYA, new Map());
    expect(vm.columns).toEqual(IN_OUT_LINK_CODE_LIST_COLUMNS);
    expect(vm.columns).toHaveLength(9);
  });

  it('ペア成立(status=2)は矢印と運用番号を出す(区切りは +)', () => {
    const map = new Map<string, InOutLinkCodeEntry>([
      [
        'X',
        entry({
          status: 2,
          inRessyaProperties: [prop(0)],
          outRessyaProperties: [prop(1)],
          operationNumbers: ['5', '6'],
        }),
      ],
    ]);
    const vm = deriveInOutLinkCodeList(makeRosen(), RESSYA, map);
    expect(vm.rows).toHaveLength(1);
    expect(vm.rows[0]?.code).toBe('X');
    expect(vm.rows[0]?.inSide.ressyabangou).toBe('1M');
    expect(vm.rows[0]?.outSide.ressyabangou).toBe('3M');
    expect(vm.rows[0]?.arrow).toBe('→');
    expect(vm.rows[0]?.operationNumber).toBe('5+6');
  });

  it('未成立(status!=2)は矢印も運番も空。列車情報は出る', () => {
    const map = new Map<string, InOutLinkCodeEntry>([
      ['X', entry({ status: 1, inRessyaProperties: [prop(0)], operationNumbers: ['5'] })],
    ]);
    const vm = deriveInOutLinkCodeList(makeRosen(), RESSYA, map);
    expect(vm.rows[0]?.arrow).toBe('');
    expect(vm.rows[0]?.operationNumber).toBe('');
    expect(vm.rows[0]?.inSide.ressyabangou).toBe('1M');
    // 相手側がない行は空セル。
    expect(vm.rows[0]?.outSide.ressyabangou).toBe('');
    expect(vm.rows[0]?.outSide.ressya).toBeNull();
  });

  it('重複(status=3)は max(入,出) 行ぶん縦に積み、コードは先頭行だけ', () => {
    const map = new Map<string, InOutLinkCodeEntry>([
      [
        'X',
        entry({
          status: 3,
          inRessyaProperties: [prop(0)],
          outRessyaProperties: [prop(1), prop(2)],
        }),
      ],
    ]);
    const vm = deriveInOutLinkCodeList(makeRosen(), RESSYA, map);
    expect(vm.rows).toHaveLength(2);
    expect(vm.rows[0]?.code).toBe('X');
    expect(vm.rows[1]?.code).toBe(''); // 2 行目はコード空
    expect(vm.rows[1]?.groupCode).toBe('X');
    expect(vm.rows[0]?.outSide.ressyabangou).toBe('3M');
    expect(vm.rows[1]?.outSide.ressyabangou).toBe('5M');
    expect(vm.rows[1]?.inSide.ressyabangou).toBe(''); // 入区側は 1 本しかない
  });

  it('行順は連携コードの昇順(登録順ではない)', () => {
    const map = new Map<string, InOutLinkCodeEntry>([
      ['B', entry({ status: 1, inRessyaProperties: [prop(0)] })],
      ['A', entry({ status: 1, inRessyaProperties: [prop(1)] })],
    ]);
    const vm = deriveInOutLinkCodeList(makeRosen(), RESSYA, map);
    expect(vm.rows.map((r) => r.groupCode)).toEqual(['A', 'B']);
  });

  it('方向ラベルはダイヤ別名があればそれを使う', () => {
    const rosen = makeRosen();
    rosen.kudariDiaAlias = '東行';
    const map = new Map<string, InOutLinkCodeEntry>([
      ['X', entry({ status: 1, inRessyaProperties: [prop(0)] })],
    ]);
    const vm = deriveInOutLinkCodeList(rosen, RESSYA, map);
    expect(vm.rows[0]?.inSide.houkouText).toBe('東行');
  });
});
