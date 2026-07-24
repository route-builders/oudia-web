// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 up-tri

/**
 * 作業整合 adjustOperation(M7a)のテスト。原典 3 層 + 入れ子再帰の各挙動を合成データで検証。
 * 実機一致は実機フィクスチャ入手時に確認する(ここでは移植ロジックの単体検証)。
 */

import type { AfterOperation, BeforeOperation, Ressya, Rosen } from '@oudia-web/format';
import { asSeconds } from '@oudia-web/format';
import { describe, expect, it } from 'vitest';
import { createDefaultEki, createNewRosen } from '../factory.js';
import { createNullRessya } from '../ressya.js';
import { adjustRessyaOperation } from './adjustOperation.js';

/** N 駅の単線路線(全駅 hatsuchaku 形式で作業を置きやすく)。 */
function rosenN(n: number): Rosen {
  const data = createNewRosen();
  for (let i = 0; i < n; i++) {
    const e = createDefaultEki(i, `E${String(i)}`);
    e.ekijikokukeisiki = 'hatsuchaku'; // 着発両方表示 → 中間駅で作業を保持可能に
    data.rosen.ekiCont.push(e);
  }
  return data.rosen;
}

/** 全駅停車の下り列車(着発時刻あり)。 */
function fullRessya(n: number): Ressya {
  const r = createNullRessya(n, 0);
  r.isNull = false;
  for (let o = 0; o < n; o++) {
    const s = r.ekiJikokuCont[o];
    if (s === undefined) continue;
    s.ekiatsukai = 'teisya';
    if (o > 0) s.chakuJikoku = asSeconds(3600 + o * 300 - 30);
    if (o < n - 1) s.hatsuJikoku = asSeconds(3600 + o * 300);
    s.ressyaTrackIndex = 0;
  }
  return r;
}

const junctionBefore: BeforeOperation = {
  kind: 'junction',
  kitenJikoku: null,
  kariOperationNumbers: [],
};
const outBefore: BeforeOperation = {
  kind: 'out',
  outJikoku: asSeconds(3540),
  inOutLinkCode: '',
  operationNumbers: ['1'],
};
const inAfter: AfterOperation = { kind: 'in', inJikoku: asSeconds(6000), inOutLinkCode: '' };

describe('adjustRessyaOperation — 有効始発/終着の先端終端作業', () => {
  it('有効始発駅に先端作業が無ければ junction を補填、終着駅に終端作業を補填', () => {
    const rosen = rosenN(3);
    const r = fullRessya(3);
    // 作業は何も設定しない → 有効始発(0)前作業に junction、有効終着(2)後作業に junction が入る。
    adjustRessyaOperation(rosen, r);
    expect(r.ekiJikokuCont[0]?.beforeOperationCont[0]?.kind).toBe('junction');
    expect(r.ekiJikokuCont[2]?.afterOperationCont.at(-1)?.kind).toBe('junction');
  });

  it('有効始発駅に out(出区)があればそのまま先端作業として保持', () => {
    const rosen = rosenN(3);
    const r = fullRessya(3);
    const s0 = r.ekiJikokuCont[0];
    if (s0 !== undefined) s0.beforeOperationCont = [structuredClone(outBefore)];
    adjustRessyaOperation(rosen, r);
    expect(r.ekiJikokuCont[0]?.beforeOperationCont[0]?.kind).toBe('out');
    // junction は補填されない(既に先端作業がある)。
    expect(r.ekiJikokuCont[0]?.beforeOperationCont).toHaveLength(1);
  });

  it('有効始発駅の前作業先頭が非先端作業(shunt)なら junction を先頭に補填', () => {
    const rosen = rosenN(3);
    const r = fullRessya(3);
    const s0 = r.ekiJikokuCont[0];
    if (s0 !== undefined) {
      s0.beforeOperationCont = [
        {
          kind: 'shunt',
          shuntTrackIndex: 1,
          shuntHatsuJikoku: asSeconds(3500),
          shuntChakuJikoku: null,
          displayJikoku: false,
        },
      ];
    }
    adjustRessyaOperation(rosen, r);
    expect(r.ekiJikokuCont[0]?.beforeOperationCont[0]?.kind).toBe('junction');
    expect(r.ekiJikokuCont[0]?.beforeOperationCont[1]?.kind).toBe('shunt');
  });
});

describe('adjustRessyaOperation — 範囲外・中間駅の削除', () => {
  it('有効範囲外の駅の作業は全削除', () => {
    const rosen = rosenN(4);
    const r = createNullRessya(4, 0);
    r.isNull = false;
    // 駅1,2 のみ走行(0,3 は運行なし)。
    for (const o of [1, 2]) {
      const s = r.ekiJikokuCont[o];
      if (s === undefined) continue;
      s.ekiatsukai = 'teisya';
      s.chakuJikoku = o > 1 ? asSeconds(3600 + o * 300 - 30) : null;
      s.hatsuJikoku = o < 2 ? asSeconds(3600 + o * 300) : null;
    }
    // 運行なし駅0 に作業を置く → 削除されるべき。
    const s0 = r.ekiJikokuCont[0];
    if (s0 !== undefined) s0.beforeOperationCont = [structuredClone(junctionBefore)];
    adjustRessyaOperation(rosen, r);
    expect(r.ekiJikokuCont[0]?.beforeOperationCont).toHaveLength(0);
  });

  it('中間駅の余剰な先端/終端作業は削除される', () => {
    const rosen = rosenN(3);
    const r = fullRessya(3);
    // 中間駅1 に junction(先端作業) + in(終端作業)を置く → 中間駅では削除。
    const s1 = r.ekiJikokuCont[1];
    if (s1 !== undefined) {
      s1.beforeOperationCont = [structuredClone(junctionBefore)];
      s1.afterOperationCont = [structuredClone(inAfter)];
    }
    adjustRessyaOperation(rosen, r);
    expect(r.ekiJikokuCont[1]?.beforeOperationCont).toHaveLength(0);
    expect(r.ekiJikokuCont[1]?.afterOperationCont).toHaveLength(0);
  });
});

describe('adjustRessyaOperation — 増解結の入れ子再帰', () => {
  it('増結の子編成作業列の先頭に junction が補填される', () => {
    const rosen = rosenN(3);
    const r = fullRessya(3);
    // 有効始発駅0 の前作業に out + connect(子は shunt のみ = 先端作業なし)。
    const s0 = r.ekiJikokuCont[0];
    if (s0 !== undefined) {
      s0.beforeOperationCont = [
        structuredClone(outBefore),
        {
          kind: 'connect',
          connectToFront: false,
          connectJikoku: asSeconds(3550),
          formationBeforeOperationCont: [
            {
              kind: 'shunt',
              shuntTrackIndex: 1,
              shuntHatsuJikoku: asSeconds(3540),
              shuntChakuJikoku: null,
              displayJikoku: false,
            },
          ],
        },
      ];
    }
    adjustRessyaOperation(rosen, r);
    const connect = r.ekiJikokuCont[0]?.beforeOperationCont.find((o) => o.kind === 'connect');
    expect(connect?.kind).toBe('connect');
    if (connect?.kind === 'connect') {
      // 子編成の先頭に junction が補填されている。
      expect(connect.formationBeforeOperationCont[0]?.kind).toBe('junction');
    }
  });
});

describe('adjustRessyaOperation — 無効列車は不変', () => {
  it('有効始発/終着が無い列車は何も変更しない', () => {
    const rosen = rosenN(3);
    const r = createNullRessya(3, 0); // 全 none = 走行なし
    r.isNull = false;
    const s0 = r.ekiJikokuCont[0];
    if (s0 !== undefined) s0.beforeOperationCont = [structuredClone(junctionBefore)];
    const before = JSON.stringify(r);
    adjustRessyaOperation(rosen, r);
    expect(JSON.stringify(r)).toBe(before); // sihatsu==-1 で return
  });
});
