// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 up-tri

/** 時刻補完(completeMinuteInput / completeFlat* / completeUiData)のテスト(PR-2)。 */

import { asSeconds } from '@oudia-web/format';
import { describe, expect, it } from 'vitest';
import { type FlatOp, OP_CONNECT, OP_OUT_IN, OP_RELEASE, OP_SHUNT } from './editModel.js';
import {
  completeFlatAfter,
  completeFlatBefore,
  completeMinuteInput,
  completeUiData,
} from './operationComplete.js';

const HH = (h: number, m = 0, s = 0) => asSeconds(h * 3600 + m * 60 + s);

describe('completeMinuteInput(分のみ入力の時補完 + ±1h)', () => {
  it('基準 8:00・分 30・bBefore=false → 8:30(基準以後)', () => {
    expect(completeMinuteInput('30', HH(8), false)).toBe(HH(8, 30));
  });

  it('基準 8:10・分 05・bBefore=false → 補完 8:05 は基準より前 → +1h → 9:05', () => {
    expect(completeMinuteInput('05', HH(8, 10), false)).toBe(HH(9, 5));
  });

  it('基準 8:10・分 30・bBefore=true → 補完 8:30 は基準より後 → -1h → 7:30', () => {
    expect(completeMinuteInput('30', HH(8, 10), true)).toBe(HH(7, 30));
  });

  it('基準 8:30・分 30・bBefore=true → 同時刻は補正なし → 8:30', () => {
    expect(completeMinuteInput('30', HH(8, 30), true)).toBe(HH(8, 30));
  });

  it('基準 null は補完しない', () => {
    expect(completeMinuteInput('30', null, false)).toBe(null);
  });

  it('2 桁でない入力は補完しない', () => {
    expect(completeMinuteInput('5', HH(8), false)).toBe(null);
    expect(completeMinuteInput('130', HH(8), false)).toBe(null);
  });
});

describe('completeFlat(前方 +60 / 後方 -60)', () => {
  it('入換発 null は前方で base+60、着があれば発=着', () => {
    const flat: FlatOp[] = [
      { ...blank(), kind: OP_SHUNT, level: [0], editData1: null, editData2: null },
    ];
    completeFlatAfter(flat, HH(8), true, { isTeisya: true });
    expect(flat[0]?.editData1).toBe(HH(8, 0, 60)); // 8:01:00
  });

  it('出区は後方で base-60', () => {
    const flat: FlatOp[] = [{ ...blank(), kind: OP_OUT_IN, level: [0], editData1: null }];
    completeFlatBefore(flat, HH(8), false, { isTeisya: true });
    expect(flat[0]?.editData1).toBe(HH(7, 59)); // 8:00 − 60s
  });

  it('入区は前方で base+60', () => {
    const flat: FlatOp[] = [{ ...blank(), kind: OP_OUT_IN, level: [0], editData1: null }];
    completeFlatAfter(flat, HH(8), true, { isTeisya: true });
    expect(flat[0]?.editData1).toBe(HH(8, 1)); // 8:00 + 60s
  });

  it('増結時刻 null は base のまま(±0)', () => {
    const flat: FlatOp[] = [{ ...blank(), kind: OP_CONNECT, level: [0], editData1: null }];
    completeFlatBefore(flat, HH(8), false, { isTeisya: true });
    expect(flat[0]?.editData1).toBe(HH(8)); // ±0
  });

  it('解結の editData1(編成数)は不正なら 1 に補正、時刻は base', () => {
    const flat: FlatOp[] = [
      { ...blank(), kind: OP_RELEASE, level: [0], editData2: null, releaseCount: 0 },
    ];
    completeFlatAfter(flat, HH(8), true, { isTeisya: true });
    expect(flat[0]?.editData2).toBe(HH(8)); // 解結時刻 = base(±0)
    expect(flat[0]?.releaseCount).toBe(1);
  });
});

describe('completeUiData(駅種別で方向切替)', () => {
  it('通常駅: 前作業=着基準・後作業=発基準', () => {
    const before: FlatOp[] = [{ ...blank(), kind: OP_OUT_IN, level: [0], editData1: null }];
    const after: FlatOp[] = [{ ...blank(), kind: OP_OUT_IN, level: [0], editData1: null }];
    completeUiData(before, after, HH(8), HH(8, 5), { isTeisya: true });
    // 前作業(出区)= 着基準・前方 +60 → 8:01
    expect(before[0]?.editData1).toBe(HH(8, 1));
    // 後作業(入区)= 発基準・後方 -60 → 8:04
    expect(after[0]?.editData1).toBe(HH(8, 4));
  });

  it('始発駅(着 null): 後作業 then 前作業とも発基準・後方', () => {
    const before: FlatOp[] = [{ ...blank(), kind: OP_OUT_IN, level: [0], editData1: null }];
    const after: FlatOp[] = [];
    completeUiData(before, after, null, HH(8), { isTeisya: true });
    expect(before[0]?.editData1).toBe(HH(7, 59)); // 発基準・後方 -60
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
