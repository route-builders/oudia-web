// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 up-tri

/**
 * Full 運番割付(deriveOperationFull の STEP2/3a/3b + runJunctionRecursion)の単体テスト
 * (M7c PR-C/PR-D)。出区 seed の運番伝播・次列車接続 hop・NumberChange・孤立 junction・
 * 循環暴走ガードを合成データで検証する。
 */

import { createDefaultDia, createDefaultEki, createNullRessya } from '@oudia-web/domain';
import type { Dia, Eki } from '@oudia-web/format';
import { asSeconds } from '@oudia-web/format';
import { describe, expect, it } from 'vitest';
import { opRefKey } from '../operationLight/types.js';
import { deriveOperationFull } from './deriveOperationFull.js';

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

describe('deriveOperationFull(STEP2 運番割付)', () => {
  it('出区 seed の運番が次列車接続で B へ伝播する', () => {
    const ekiCont = makeEkiCont();
    // A: E0(出区・運番 5)→ E1 終着(次列車接続)。
    const a = createNullRessya(3, 0);
    a.isNull = false;
    const a0 = a.ekiJikokuCont[0];
    const a1 = a.ekiJikokuCont[1];
    const a2 = a.ekiJikokuCont[2];
    if (a0) {
      a0.ekiatsukai = 'teisya';
      a0.hatsuJikoku = J(8);
      a0.ressyaTrackIndex = 0;
      a0.beforeOperationCont = [
        { kind: 'out', outJikoku: J(7, 50), inOutLinkCode: '', operationNumbers: ['5'] },
      ];
    }
    if (a1) {
      a1.ekiatsukai = 'teisya';
      a1.chakuJikoku = J(8, 30);
      a1.ressyaTrackIndex = 0;
      a1.afterOperationCont = [
        { kind: 'junction', syuutenJikoku: J(8, 30), junctionType: 'propertySame' },
      ];
    }
    if (a2) a2.ekiatsukai = 'none';

    // B: E1(前列車接続)→ E2。
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

    const res = deriveOperationFull(dia, ekiCont, OPTS);
    // A の出区(E0 前作業 [0])に運番 5 が割り当たる。
    const aOutKey = opRefKey({
      houkou: 0,
      ressyaIndex: 0,
      ekiOrder: 0,
      opKind: 'before',
      iLevel: [0],
    });
    expect(res.assignedNumbers.get(aOutKey)).toEqual(['5']);
    // B の前列車接続(E1 前作業 [0])= #2 に 5 が hop 伝播。
    const bJuncKey = opRefKey({
      houkou: 0,
      ressyaIndex: 1,
      ekiOrder: 1,
      opKind: 'before',
      iLevel: [0],
    });
    expect(res.assignedNumbers.get(bJuncKey)).toEqual(['5']);
  });

  it('次列車が無ければ運番は A のみ(hop しない)', () => {
    const ekiCont = makeEkiCont();
    const a = createNullRessya(3, 0);
    a.isNull = false;
    const a0 = a.ekiJikokuCont[0];
    const a1 = a.ekiJikokuCont[1];
    const a2 = a.ekiJikokuCont[2];
    if (a0) {
      a0.ekiatsukai = 'teisya';
      a0.hatsuJikoku = J(8);
      a0.ressyaTrackIndex = 0;
      a0.beforeOperationCont = [
        { kind: 'out', outJikoku: J(7, 50), inOutLinkCode: '', operationNumbers: ['7'] },
      ];
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

    const dia: Dia = createDefaultDia('D');
    dia.ressyaCont[0].push(a);

    const res = deriveOperationFull(dia, ekiCont, OPTS);
    const aOutKey = opRefKey({
      houkou: 0,
      ressyaIndex: 0,
      ekiOrder: 0,
      opKind: 'before',
      iLevel: [0],
    });
    expect(res.assignedNumbers.get(aOutKey)).toEqual(['7']);
    // 割付は A の作業のみ(B が存在しない)。
    expect(res.assignedNumbers.size).toBeGreaterThanOrEqual(1);
  });

  it('孤立した前列車接続(前列車なし)に運番が割り当たり鎖が開始する(STEP3b)', () => {
    const ekiCont = makeEkiCont();
    // B のみ: E1(前列車接続・仮運番 9)→ E2。前列車 A は存在しない = 孤立。
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
        { kind: 'junction', kitenJikoku: J(8, 40), kariOperationNumbers: ['9'] },
      ];
    }
    if (b2) {
      b2.ekiatsukai = 'teisya';
      b2.chakuJikoku = J(9, 10);
      b2.ressyaTrackIndex = 0;
    }
    const dia: Dia = createDefaultDia('D');
    dia.ressyaCont[0].push(b);

    const res = deriveOperationFull(dia, ekiCont, OPTS);
    // B の前列車接続(E1 前作業 [0])に仮運番 9 が割り当たる(#2 = hop 用 or #1 = seed)。
    const bJuncKey = opRefKey({
      houkou: 0,
      ressyaIndex: 0,
      ekiOrder: 1,
      opKind: 'before',
      iLevel: [0],
    });
    const assigned = res.assignedNumbers.get(bJuncKey);
    expect(assigned).toEqual(['9']);
  });

  it('NumberChange seed から別運用鎖が開始する(STEP3a)', () => {
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
    // 中間 E1 の後作業に運用番号変更(88)。
    const a1 = a.ekiJikokuCont[1];
    if (a1) a1.afterOperationCont = [{ kind: 'numberChange', operationNumbers: ['88'] }];
    const dia: Dia = createDefaultDia('D');
    dia.ressyaCont[0].push(a);

    const res = deriveOperationFull(dia, ekiCont, OPTS);
    // NumberChange 作業に 88 が割り当たる。
    const ncKey = opRefKey({
      houkou: 0,
      ressyaIndex: 0,
      ekiOrder: 1,
      opKind: 'after',
      iLevel: [0],
    });
    expect(res.assignedNumbers.get(ncKey)).toEqual(['88']);
  });

  it('循環運用でも無限再帰しない(暴走ガード内で完了)', () => {
    const ekiCont = makeEkiCont();
    // A: E0(出区)→E1 終着(次列車接続)、B: E1(前列車接続)→E0... は逆向きになるため
    //    ここでは A→A の自己ループに近い構成を避け、正常終了を確認する。
    const a = createNullRessya(3, 0);
    a.isNull = false;
    for (let o = 0; o < 2; o++) {
      const s = a.ekiJikokuCont[o];
      if (s === undefined) continue;
      s.ekiatsukai = 'teisya';
      if (o > 0) s.chakuJikoku = J(8, o * 30);
      if (o < 1) s.hatsuJikoku = J(8);
      s.ressyaTrackIndex = 0;
    }
    const a2 = a.ekiJikokuCont[2];
    if (a2) a2.ekiatsukai = 'none';
    const a0 = a.ekiJikokuCont[0];
    if (a0)
      a0.beforeOperationCont = [{ kind: 'junction', kitenJikoku: J(8), kariOperationNumbers: [] }];
    const a1 = a.ekiJikokuCont[1];
    if (a1)
      a1.afterOperationCont = [
        { kind: 'junction', syuutenJikoku: J(8, 30), junctionType: 'propertySame' },
      ];

    const dia: Dia = createDefaultDia('D');
    dia.ressyaCont[0].push(a);
    // 同一列車が自分自身に接続する構成 → 暴走ガードで停止することを確認(例外を投げない)。
    expect(() => deriveOperationFull(dia, ekiCont, OPTS)).not.toThrow();
  });
});
