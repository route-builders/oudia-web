// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 up-tri

/**
 * Full SETUP + STEP1(buildFullState)の単体テスト(M7c PR-B)。
 * 占有格子が Light(buildOccupancy)と一致すること・作業ツリーと seed が正しく収集されることを検証。
 */

import { createDefaultDia, createDefaultEki, createNullRessya } from '@oudia-web/domain';
import type { Dia, Eki } from '@oudia-web/format';
import { asSeconds } from '@oudia-web/format';
import { describe, expect, it } from 'vitest';
import { buildOccupancy } from '../operationLight/deriveOperationLight.js';
import type { RessyaElement } from '../operationLight/types.js';
import { buildFullState, deriveOperationFull } from './deriveOperationFull.js';

const J = (h: number, m = 0) => asSeconds(h * 3600 + m * 60);

const OPTS = {
  operationCrossKitenJikoku: false,
  disableHiddenSyubetsu: false,
  kitenJikoku: null,
  operationNumberReverse: false,
};

function makeEkiCont(): Eki[] {
  return [0, 1, 2].map((i) => createDefaultEki(i, `E${String(i)}`));
}

/** 占有格子を「(before/after 有無, jikoku)」列に正規化して比較可能にする。 */
function normalize(occ: RessyaElement[][][]): unknown {
  return occ.map((eki) =>
    eki.map((track) =>
      track.map((e) => ({ b: e.beforeOp !== null, a: e.afterOp !== null, j: e.jikoku })),
    ),
  );
}

describe('buildFullState(占有が Light と一致)', () => {
  it('A 終着 + B 始発の占有格子が buildOccupancy と構造一致', () => {
    const ekiCont = makeEkiCont();
    // A: E0→E1 終着(次列車接続)、B: E1→E2 始発(前列車接続)。同一番線 0。
    const a = createNullRessya(3, 0);
    a.isNull = false;
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
      a1.afterOperationCont = [
        { kind: 'junction', syuutenJikoku: J(8, 30), junctionType: 'unrelated' },
      ];
    }
    if (a2) a2.ekiatsukai = 'none';

    const b = createNullRessya(3, 0);
    b.isNull = false;
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

    const light = buildOccupancy(dia, ekiCont, OPTS);
    const full = buildFullState(dia, ekiCont, OPTS);
    expect(normalize(full.occupancy)).toEqual(normalize(light.occupancy));
    // junctionSeeds も一致件数。
    expect(full.junctionSeeds.length).toBe(light.junctionSeeds.length);
  });
});

describe('buildFullState(seed 収集)', () => {
  it('出区始発の列車で outOuterSeeds が全体に集約される', () => {
    const ekiCont = makeEkiCont();
    const a = createNullRessya(3, 0);
    a.isNull = false;
    for (let o = 0; o < 3; o++) {
      const s = a.ekiJikokuCont[o];
      if (s === undefined) continue;
      s.ekiatsukai = 'teisya';
      if (o > 0) s.chakuJikoku = J(8, o * 10);
      if (o < 2) s.hatsuJikoku = J(8, o * 10 + 1);
      s.ressyaTrackIndex = 0;
    }
    const a0 = a.ekiJikokuCont[0];
    if (a0)
      a0.beforeOperationCont = [
        { kind: 'out', outJikoku: J(7, 50), inOutLinkCode: '', operationNumbers: ['1'] },
      ];
    const dia: Dia = createDefaultDia('D');
    dia.ressyaCont[0].push(a);

    const full = buildFullState(dia, ekiCont, OPTS);
    expect(full.outOuterSeeds).toHaveLength(1);
    // tree も保存されている。
    expect(full.trees[0]?.[0]?.nodes.length).toBeGreaterThan(0);
  });

  it('NumberChange(非 reverse)が numberChangeSeeds に収集される', () => {
    const ekiCont = makeEkiCont();
    const a = createNullRessya(3, 0);
    a.isNull = false;
    for (let o = 0; o < 3; o++) {
      const s = a.ekiJikokuCont[o];
      if (s === undefined) continue;
      s.ekiatsukai = 'teisya';
      if (o > 0) s.chakuJikoku = J(8, o * 10);
      if (o < 2) s.hatsuJikoku = J(8, o * 10 + 1);
      s.ressyaTrackIndex = 0;
    }
    const a1 = a.ekiJikokuCont[1];
    if (a1) a1.afterOperationCont = [{ kind: 'numberChange', operationNumbers: ['99'] }];
    const dia: Dia = createDefaultDia('D');
    dia.ressyaCont[0].push(a);

    const full = buildFullState(dia, ekiCont, OPTS);
    expect(full.numberChangeSeeds).toHaveLength(1);
  });
});

describe('☆1 路線外始発の増結編成 → 疑似列が列の左に入る', () => {
  it('★増結の入れ子(iLevel の深さ 2)かつ元運番が非空のときだけ列が生まれる', () => {
    const ekiCont = makeEkiCont();
    // 主編成 A: E0 発 → E2 着。E0 で増結編成を connect し、その編成は路線外始発。
    const a = createNullRessya(3, 0);
    a.isNull = false;
    a.ressyabangou = '1M';
    const a0 = a.ekiJikokuCont[0];
    const a1 = a.ekiJikokuCont[1];
    const a2 = a.ekiJikokuCont[2];
    if (a0) {
      a0.ekiatsukai = 'teisya';
      a0.hatsuJikoku = J(8);
      a0.beforeOperationCont = [
        // 主編成自身の先頭作業(出区)。★増結は index 1 以降でないと展開されない。
        { kind: 'out', outJikoku: J(7, 40), inOutLinkCode: '', operationNumbers: ['M01'] },
        {
          kind: 'connect',
          connectToFront: false,
          connectJikoku: J(7, 55),
          formationBeforeOperationCont: [
            {
              kind: 'outer',
              outerTerminalIndex: 0,
              outerHatsuJikoku: J(7, 30),
              chakuJikoku: J(7, 50),
              inOutLinkCode: '',
              operationNumbers: ['A01'],
            },
          ],
        },
      ];
    }
    if (a1) {
      a1.ekiatsukai = 'teisya';
      a1.chakuJikoku = J(8, 20);
      a1.hatsuJikoku = J(8, 22);
    }
    if (a2) {
      a2.ekiatsukai = 'teisya';
      a2.chakuJikoku = J(8, 40);
      a2.afterOperationCont = [{ kind: 'in', inJikoku: J(8, 45), inOutLinkCode: '' }];
    }
    const dia = createDefaultDia('D');
    dia.ressyaCont[0].push(a);

    const full = deriveOperationFull(dia, ekiCont, OPTS);
    const chains = full.customizeRessyaIndexChains.kudari;
    // 疑似列(列車 index を持たない)が主編成の左に入る。
    expect(chains.map((c) => [...c.ressyaIndexCont])).toEqual([[], [0]]);
    const pseudo = chains[0];
    expect(pseudo?.connectEkiOrder).toBe(0);
    expect(pseudo?.sihatsuEkiOrder).toBe(0);
    expect(pseudo?.beforeType).toBe('outer');
    expect(pseudo?.prevOperationNumber).toEqual(['A01']);
    expect(pseudo?.prevRessyabangou).toBe('1M');
  });

  it('★元運番が空なら疑似列は生まれない(原典の分岐)', () => {
    const ekiCont = makeEkiCont();
    const a = createNullRessya(3, 0);
    a.isNull = false;
    const a0 = a.ekiJikokuCont[0];
    const a2 = a.ekiJikokuCont[2];
    if (a0) {
      a0.ekiatsukai = 'teisya';
      a0.hatsuJikoku = J(8);
      a0.beforeOperationCont = [
        // 主編成自身の先頭作業(出区)。★増結は index 1 以降でないと展開されない。
        { kind: 'out', outJikoku: J(7, 40), inOutLinkCode: '', operationNumbers: ['M01'] },
        {
          kind: 'connect',
          connectToFront: false,
          connectJikoku: J(7, 55),
          formationBeforeOperationCont: [
            {
              kind: 'outer',
              outerTerminalIndex: 0,
              outerHatsuJikoku: J(7, 30),
              chakuJikoku: J(7, 50),
              inOutLinkCode: '',
              operationNumbers: [],
            },
          ],
        },
      ];
    }
    const a1 = a.ekiJikokuCont[1];
    if (a1) {
      a1.ekiatsukai = 'teisya';
      a1.chakuJikoku = J(8, 20);
      a1.hatsuJikoku = J(8, 22);
    }
    if (a2) {
      a2.ekiatsukai = 'teisya';
      a2.chakuJikoku = J(8, 40);
    }
    const dia = createDefaultDia('D');
    dia.ressyaCont[0].push(a);

    const full = deriveOperationFull(dia, ekiCont, OPTS);
    expect(full.customizeRessyaIndexChains.kudari.map((c) => [...c.ressyaIndexCont])).toEqual([
      [0],
    ]);
  });
});
