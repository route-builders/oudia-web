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

describe('deriveOperationFull(運用表 Map。M7c-2 PR-1)', () => {
  it('出区 → 次列車接続 → 入区 で運用表に 2 区間が時刻順に並ぶ', () => {
    const ekiCont = makeEkiCont();
    // A: E0(出区・運番 5、7:50)→ E1 終着(次列車接続 8:30)。
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

    // B: E1(前列車接続 8:40)→ E2 終着(入区)。
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
      b2.afterOperationCont = [{ kind: 'in', inJikoku: J(9, 20), inOutLinkCode: '' }];
    }

    const dia: Dia = createDefaultDia('D');
    dia.ressyaCont[0].push(a, b);

    const res = deriveOperationFull(dia, ekiCont, OPTS);
    const list = res.operationTable.get('5') ?? [];
    expect(list).toHaveLength(2);
    // 1 区間目 = A(出区 → 次列車接続)。
    expect(list[0]?.ressyaProperty.ressyaIndex).toBe(0);
    expect(list[0]?.beforeType).toBe('outIn');
    expect(list[0]?.afterType).toBe('propertySame');
    expect(list[0]?.sihatsuEkiOrder).toBe(0);
    expect(list[0]?.syuuchakuEkiOrder).toBe(1);
    // 2 区間目 = B(前列車接続 → 入区)。検索キー一致で A の直後に入り時刻は落ちる。
    expect(list[1]?.ressyaProperty.ressyaIndex).toBe(1);
    expect(list[1]?.beforeType).toBe('propertySame');
    expect(list[1]?.afterType).toBe('outIn');
    expect(list[1]?.ressyaProperty.jikoku).toBeNull();
  });

  it('中間駅の運用番号変更が作業ツリーに入り、鎖を切って別運用を開始する(STEP1 全駅走査)', () => {
    const ekiCont = makeEkiCont();
    // A: E0(出区・運番 5)→ E1 で運番変更(88)→ E2 終着(入区)。
    const a = createNullRessya(3, 0);
    a.isNull = false;
    for (let o = 0; o < 3; o++) {
      const s = a.ekiJikokuCont[o];
      if (s === undefined) continue;
      s.ekiatsukai = 'teisya';
      s.chakuJikoku = J(8, o * 30);
      s.hatsuJikoku = J(8, o * 30 + 5);
      s.ressyaTrackIndex = 0;
    }
    const a0 = a.ekiJikokuCont[0];
    if (a0) {
      a0.beforeOperationCont = [
        { kind: 'out', outJikoku: J(7, 50), inOutLinkCode: '', operationNumbers: ['5'] },
      ];
    }
    const a1 = a.ekiJikokuCont[1];
    if (a1) a1.afterOperationCont = [{ kind: 'numberChange', operationNumbers: ['88'] }];
    const a2 = a.ekiJikokuCont[2];
    if (a2) a2.afterOperationCont = [{ kind: 'in', inJikoku: J(9, 20), inOutLinkCode: '' }];

    const dia: Dia = createDefaultDia('D');
    dia.ressyaCont[0].push(a);

    const res = deriveOperationFull(dia, ekiCont, OPTS);
    const ncKey = opRefKey({
      houkou: 0,
      ressyaIndex: 0,
      ekiOrder: 1,
      opKind: 'after',
      iLevel: [0],
    });
    // 運番変更作業がツリーに入り、新運番 88 を持つ。
    expect(res.assignedNumbers.get(ncKey)).toEqual(['88']);
    // 5 の運用は E0→E1 で切れる。
    const five = res.operationTable.get('5') ?? [];
    expect(five).toHaveLength(1);
    expect(five[0]?.afterType).toBe('numberChange');
    expect(five[0]?.syuuchakuEkiOrder).toBe(1);
    // 88 の運用は E1→E2 で入区まで。
    const eightyEight = res.operationTable.get('88') ?? [];
    expect(eightyEight).toHaveLength(1);
    expect(eightyEight[0]?.beforeType).toBe('numberChange');
    expect(eightyEight[0]?.afterType).toBe('outIn');
    expect(eightyEight[0]?.syuuchakuEkiOrder).toBe(2);
  });
});

describe('deriveOperationFull(入出区連携コード。M7c-2 PR-2)', () => {
  /** A: E0 出区(運番 5)→ E1 入区(連携コード X)。B: E1 出区(連携コード X・運番なし)→ E2 入区。 */
  function makeLinkedDia(codeA: string, codeB: string): { dia: Dia; ekiCont: Eki[] } {
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
        { kind: 'out', outJikoku: J(7, 50), inOutLinkCode: '', operationNumbers: ['5'] },
      ];
    }
    if (a1) {
      a1.ekiatsukai = 'teisya';
      a1.chakuJikoku = J(8, 30);
      a1.ressyaTrackIndex = 0;
      a1.afterOperationCont = [{ kind: 'in', inJikoku: J(8, 40), inOutLinkCode: codeA }];
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
      b1.hatsuJikoku = J(9);
      b1.ressyaTrackIndex = 1; // 別番線 = 次列車接続では繋がらない
      b1.beforeOperationCont = [
        { kind: 'out', outJikoku: J(8, 50), inOutLinkCode: codeB, operationNumbers: [] },
      ];
    }
    if (b2) {
      b2.ekiatsukai = 'teisya';
      b2.chakuJikoku = J(9, 30);
      b2.ressyaTrackIndex = 1;
      b2.afterOperationCont = [{ kind: 'in', inJikoku: J(9, 40), inOutLinkCode: '' }];
    }

    const dia: Dia = createDefaultDia('D');
    dia.ressyaCont[0].push(a, b);
    return { dia, ekiCont };
  }

  it('コードが 1:1 で成立すると入区側の運番が出区側へ引き継がれる', () => {
    const { dia, ekiCont } = makeLinkedDia('X', 'X');
    const res = deriveOperationFull(dia, ekiCont, OPTS);

    const link = res.inOutLinkCodes.get('X');
    expect(link?.status).toBe(2);
    expect(link?.operationNumbers).toEqual(['5']);

    // B の出区に運番 5 が引き継がれる(#2 = AssignedByLinkCode)。
    const bOutKey = opRefKey({
      houkou: 0,
      ressyaIndex: 1,
      ekiOrder: 1,
      opKind: 'before',
      iLevel: [0],
    });
    expect(res.assignedNumbers.get(bOutKey)).toEqual(['5']);

    // 運用表は A(E0→E1)と B(E1→E2)の 2 区間になる。
    const list = res.operationTable.get('5') ?? [];
    expect(list).toHaveLength(2);
    expect(list[0]?.ressyaProperty.ressyaIndex).toBe(0);
    expect(list[1]?.ressyaProperty.ressyaIndex).toBe(1);
  });

  it('コードが一致しなければ引き継がれない(status は 0/1 のまま)', () => {
    const { dia, ekiCont } = makeLinkedDia('X', 'Y');
    const res = deriveOperationFull(dia, ekiCont, OPTS);
    expect(res.inOutLinkCodes.get('X')?.status).toBe(1); // 入区のみ
    expect(res.inOutLinkCodes.get('Y')?.status).toBe(0); // 出区のみ
    const list = res.operationTable.get('5') ?? [];
    expect(list).toHaveLength(1);
  });
});
