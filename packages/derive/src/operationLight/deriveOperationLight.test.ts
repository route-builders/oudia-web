// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 up-tri

/**
 * Light 作業抽出 + 占有構築(buildOccupancy)と中間駅入れ子展開の単体テスト(M7b Light PR2)。
 * 合成データで、接続点 Junction の占有登録・次列車接続 seed・iLevel/並び順を検証する。
 */

import { createDefaultDia, createDefaultEki, createNullRessya } from '@oudia-web/domain';
import type { AfterOperation, BeforeOperation, Dia, Eki, Ressya } from '@oudia-web/format';
import { asSeconds } from '@oudia-web/format';
import { describe, expect, it } from 'vitest';
import { buildOccupancy, deriveOperationLight } from './deriveOperationLight.js';
import {
  type ExpandContext,
  ROOT_LEVEL,
  searchAfterOperationElementLight,
  searchBeforeOperationElementLight,
} from './extract.js';
import { opRefKey } from './types.js';

const J = (h: number, m = 0) => asSeconds(h * 3600 + m * 60);

/** 3 駅・下り 1 本(全区間停車・番線 0)を作る。作業は後から差す。 */
function makeTrain(bangou: string): Ressya {
  const r = createNullRessya(3, 0);
  r.isNull = false;
  r.ressyabangou = bangou;
  for (let o = 0; o < 3; o++) {
    const s = r.ekiJikokuCont[o];
    if (s === undefined) continue;
    s.ekiatsukai = 'teisya';
    if (o > 0) s.chakuJikoku = asSeconds(3600 + o * 300 - 30);
    if (o < 2) s.hatsuJikoku = asSeconds(3600 + o * 300);
    s.ressyaTrackIndex = 0;
  }
  return r;
}

function makeEkiCont(): Eki[] {
  return [0, 1, 2].map((i) => createDefaultEki(i, `E${String(i)}`));
}

const OPTS = {
  operationCrossKitenJikoku: false,
  disableHiddenSyubetsu: false,
  kitenJikoku: null,
};

describe('buildOccupancy(接続点 Junction の占有登録)', () => {
  it('終着の次列車接続が占有登録 + seed 収集される', () => {
    const ekiCont = makeEkiCont();
    // 列車 A: 有効終着(E2, order 2)の後作業に次列車接続。
    const a = makeTrain('1M');
    const aSlot = a.ekiJikokuCont[2];
    if (aSlot) {
      aSlot.afterOperationCont = [
        { kind: 'junction', syuutenJikoku: J(9), junctionType: 'unrelated' },
      ] as AfterOperation[];
    }
    // 列車 B: 有効始発(E2, order 2)の前作業に前列車接続。ただし B は E2 始発 E... とはならないので
    //   簡単のため B も 3 駅走行だが E2 始発の前作業だけ差す(始発 order は 0)。ここでは
    //   同一番線占有の検証に集中し、A の終着 seed が登録されることを確認する。
    const dia: Dia = createDefaultDia('D');
    dia.ressyaCont[0].push(a);

    const build = buildOccupancy(dia, ekiCont, OPTS);
    // E2(index 2)番線 0 に A の終着(afterOp)が 1 件。
    const list = build.occupancy[2]?.[0] ?? [];
    expect(list.some((e) => e.afterOp !== null)).toBe(true);
    // seed が 1 件。
    expect(build.junctionSeeds).toHaveLength(1);
    expect(build.junctionSeeds[0]?.ekiIndexOfExist).toBe(2);
  });

  it('前列車接続(始発の前作業 junction)も同一駅に占有登録される', () => {
    const ekiCont = makeEkiCont();
    // 列車 A: 有効始発(E0, order 0)の前作業に前列車接続(起点 = 8:00)。
    const a = makeTrain('1M');
    const aSlot0 = a.ekiJikokuCont[0];
    if (aSlot0) {
      aSlot0.beforeOperationCont = [
        { kind: 'junction', kitenJikoku: J(8), kariOperationNumbers: [] },
      ] as BeforeOperation[];
    }
    const dia: Dia = createDefaultDia('D');
    dia.ressyaCont[0].push(a);

    const build = buildOccupancy(dia, ekiCont, OPTS);
    // E0(index 0)番線 0 に A の始発(beforeOp)が登録される。
    const list = build.occupancy[0]?.[0] ?? [];
    expect(list.some((e) => e.beforeOp !== null)).toBe(true);
    // 前列車接続は seed にはならない(Before 先頭 Junction は seed でない)。
    expect(build.junctionSeeds).toHaveLength(0);
  });
});

describe('searchBefore/AfterOperationElementLight(中間駅の入れ子展開)', () => {
  const ctx: ExpandContext = { houkou: 0, ressyaIndex: 0, ekiOrder: 1, ekiIndexOfExist: 1 };

  it('前作業の増結: 子が先・親が後、iLevel が [親, 子] で伸長', () => {
    // 前作業 [junction(先頭), connect{子: [junction, shunt]}]。
    // 子は増結編成の前作業列なので先頭に前列車接続が立つ(adjustOperation の先端作業不変条件)。
    const cont: BeforeOperation[] = [
      { kind: 'junction', kitenJikoku: null, kariOperationNumbers: [] },
      {
        kind: 'connect',
        connectToFront: false,
        connectJikoku: J(8),
        formationBeforeOperationCont: [
          { kind: 'junction', kitenJikoku: null, kariOperationNumbers: [] },
          {
            kind: 'shunt',
            shuntTrackIndex: 1,
            shuntHatsuJikoku: null,
            shuntChakuJikoku: null,
            displayJikoku: false,
          },
        ],
      },
    ];
    const r = searchBeforeOperationElementLight(cont, null, ROOT_LEVEL, 0, ctx);
    // elements: 先頭 junction([0])、子 junction([1,0])、親 connect([1]) の順(子先・親後)。
    const shape = r.elements.map((e) => e.iLevel);
    expect(shape).toContainEqual([0]);
    const connectIdx = shape.findIndex((l) => l.length === 1 && l[0] === 1);
    const childIdx = shape.findIndex((l) => l.length === 2);
    // 子が親より先。
    expect(childIdx).toBeGreaterThanOrEqual(0);
    expect(childIdx).toBeLessThan(connectIdx);
  });

  it('後作業の解結: 親が先・子が後', () => {
    const cont: AfterOperation[] = [
      {
        kind: 'release',
        releasePosition: 0,
        releaseCount: 1,
        releaseJikoku: J(8),
        formationAfterOperationCont: [
          {
            kind: 'shunt',
            shuntTrackIndex: 1,
            shuntHatsuJikoku: null,
            shuntChakuJikoku: null,
            displayJikoku: false,
          },
          { kind: 'junction', syuutenJikoku: null, junctionType: 'unrelated' },
        ],
      },
      { kind: 'junction', syuutenJikoku: J(9), junctionType: 'unrelated' },
    ];
    const r = searchAfterOperationElementLight(cont, null, ROOT_LEVEL, 0, ctx);
    const shape = r.elements.map((e) => e.iLevel);
    // 親 release [0] が子 [0,*] より先。
    const releaseIdx = shape.findIndex((l) => l.length === 1 && l[0] === 0);
    const childIdx = shape.findIndex((l) => l.length === 2);
    expect(releaseIdx).toBeLessThan(childIdx);
    // 末尾 junction が seed に(親 release の子 junction + トップ末尾 junction)。
    expect(r.junctionSeeds.length).toBeGreaterThanOrEqual(1);
  });
});

describe('deriveOperationLight(junction 解決 = 次列車接続)', () => {
  /** A: E0→E1 で終着(次列車接続)、B: E1→E2 で始発(前列車接続)。同一番線 0・E1 で接続。 */
  function makeConnectedDia(junctionType: 'unrelated' | 'classChange' | 'propertySame'): {
    dia: Dia;
    ekiCont: Eki[];
    aRef: () => string;
  } {
    const ekiCont = makeEkiCont();
    // A: E0(order0) 発 8:00 → E1(order1) 着 8:30 で終着。order2 は none。
    const a = createNullRessya(3, 0);
    a.isNull = false;
    a.ressyabangou = '1M';
    const a0 = a.ekiJikokuCont[0];
    const a1 = a.ekiJikokuCont[1];
    const a2 = a.ekiJikokuCont[2];
    if (a0) {
      a0.ekiatsukai = 'teisya';
      a0.hatsuJikoku = J(8);
      a0.ressyaTrackIndex = 0;
    }
    if (a1) {
      a1.ekiatsukai = 'teisya';
      a1.chakuJikoku = J(8, 30);
      a1.ressyaTrackIndex = 0;
      a1.afterOperationCont = [{ kind: 'junction', syuutenJikoku: J(8, 30), junctionType }];
    }
    if (a2) a2.ekiatsukai = 'none';

    // B: E1(order1) 発 8:40 → E2(order2) 着 9:10 で始発。order0 は none。
    const b = createNullRessya(3, 0);
    b.isNull = false;
    b.ressyabangou = '3M';
    const b0 = b.ekiJikokuCont[0];
    const b1 = b.ekiJikokuCont[1];
    const b2 = b.ekiJikokuCont[2];
    if (b0) b0.ekiatsukai = 'none';
    if (b1) {
      b1.ekiatsukai = 'teisya';
      b1.hatsuJikoku = J(8, 40);
      b1.ressyaTrackIndex = 0;
      b1.beforeOperationCont = [
        { kind: 'junction', kitenJikoku: J(8, 40), kariOperationNumbers: [] },
      ];
    }
    if (b2) {
      b2.ekiatsukai = 'teisya';
      b2.chakuJikoku = J(9, 10);
      b2.ressyaTrackIndex = 0;
    }

    const dia: Dia = createDefaultDia('D');
    dia.ressyaCont[0].push(a, b);
    // A の終着 junction OpRef のキー(ekiOrder 1・afterOp・iLevel [0])。
    const aRef = () =>
      opRefKey({ houkou: 0, ressyaIndex: 0, ekiOrder: 1, opKind: 'after', iLevel: [0] });
    return { dia, ekiCont, aRef };
  }

  it('着直後に発があれば junction 成立(unrelated でも成立)', () => {
    const { dia, ekiCont, aRef } = makeConnectedDia('unrelated');
    const res = deriveOperationLight(dia, ekiCont, OPTS);
    const j = res.junctionResult.get(aRef());
    expect(j).toBeDefined();
    expect(j?.junctionSucceed).toBe(true);
    expect(j?.beforeAfterType).toBe('unrelated');
    expect(j?.nextTrain?.ressyaIndex).toBe(1); // B
    // Unrelated(別列車)は一本化しない → 列は別のまま(原典 :1820 のガードは非 Unrelated 限定)。
    expect(res.customizeRessyaIndexChains.kudari.map((c) => c.ressyaIndexCont)).toEqual([[0], [1]]);
  });

  it('classChange(非 Unrelated・主編成)は表示チェーンを一本化併合する', () => {
    const { dia, ekiCont } = makeConnectedDia('classChange');
    const res = deriveOperationLight(dia, ekiCont, OPTS);
    // 種別変更は同一運用の継続 → [0,1] に一本化。
    expect(res.customizeRessyaIndexChains.kudari.map((c) => c.ressyaIndexCont)).toEqual([[0, 1]]);
  });

  it('junctionType=classChange は種別変更に分類', () => {
    const { dia, ekiCont, aRef } = makeConnectedDia('classChange');
    const res = deriveOperationLight(dia, ekiCont, OPTS);
    expect(res.junctionResult.get(aRef())?.beforeAfterType).toBe('classChange');
  });

  it('junctionType=propertySame は ressyajouhouOmit=true', () => {
    const { dia, ekiCont, aRef } = makeConnectedDia('propertySame');
    const res = deriveOperationLight(dia, ekiCont, OPTS);
    const j = res.junctionResult.get(aRef());
    expect(j?.beforeAfterType).toBe('propertySame');
    expect(j?.ressyajouhouOmit).toBe(true);
  });

  it('次列車が無ければ junction 未成立(Map に載らない)', () => {
    const { dia, ekiCont, aRef } = makeConnectedDia('unrelated');
    // B を削除 → A の着の後に発が無い。
    dia.ressyaCont[0].pop();
    const res = deriveOperationLight(dia, ekiCont, OPTS);
    expect(res.junctionResult.get(aRef())).toBeUndefined();
  });
});
