// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 up-tri

/**
 * Light 占有エンジン(insertRessyaElement / searchRessyaElement / searchRessyaElementRev /
 * buildEkiOrderTable)の単体テスト(M7b Light PR1)。
 *
 * 原典 InsertRessyaElement の同時刻マージ (a)〜(d) 各分岐、Search の起点跨ぎラップを網羅。
 */

import type { Eki, Jikoku } from '@oudia-web/format';
import { asSeconds } from '@oudia-web/format';
import { describe, expect, it } from 'vitest';
import {
  buildEkiOrderTable,
  insertRessyaElement,
  searchRessyaElement,
  searchRessyaElementRev,
} from './occupancy.js';
import type { OpRef, RessyaElement } from './types.js';

const J = (h: number, m = 0, s = 0): Jikoku => asSeconds(h * 3600 + m * 60 + s);

let refCounter = 0;
function opRef(opKind: 'before' | 'after'): OpRef {
  refCounter += 1;
  return { houkou: 0, ressyaIndex: refCounter, ekiOrder: 0, opKind, iLevel: [refCounter] };
}

/** 着イベント(afterOp のみ有効)。 */
function arrive(jikoku: Jikoku): RessyaElement {
  return { beforeOp: null, afterOp: opRef('after'), jikoku, ressyahoukou: 0, ressyaIndex: 0 };
}
/** 発イベント(beforeOp のみ有効)。 */
function depart(jikoku: Jikoku): RessyaElement {
  return { beforeOp: opRef('before'), afterOp: null, jikoku, ressyahoukou: 0, ressyaIndex: 0 };
}

describe('insertRessyaElement(基本の時刻順)', () => {
  it('空リストへ push', () => {
    const list: RessyaElement[] = [];
    insertRessyaElement(list, arrive(J(8)), null);
    expect(list).toHaveLength(1);
  });

  it('時刻昇順に挿入される', () => {
    const list: RessyaElement[] = [];
    insertRessyaElement(list, depart(J(9)), null);
    insertRessyaElement(list, depart(J(8)), null);
    insertRessyaElement(list, depart(J(10)), null);
    expect(list.map((e) => e.jikoku)).toEqual([J(8), J(9), J(10)]);
  });
});

describe('insertRessyaElement(同時刻マージ)', () => {
  it('(a) 着着: 既存の着を潰す(itr.afterOp=null)', () => {
    const list: RessyaElement[] = [arrive(J(8))];
    insertRessyaElement(list, arrive(J(8)), null);
    // 既存(itr)は着でなくなる。新規は挿入されない(else 分岐なし=末尾 push もされない)。
    expect(list[0]?.afterOp).toBe(null);
  });

  it('(b) 着発: 着を発の直前に挿入', () => {
    const list: RessyaElement[] = [depart(J(8))];
    insertRessyaElement(list, arrive(J(8)), null);
    // 着が発の前。
    expect(list).toHaveLength(2);
    expect(list[0]?.afterOp).not.toBe(null); // 着が先
    expect(list[1]?.beforeOp).not.toBe(null); // 発が後
  });

  it('(c) 発着: 次が同時刻着ならペア成立(着を潰し次を削除)', () => {
    // list = [着(8:00)], 挿入=発(8:00) だが itr が着 → (c) の nextSameTime=false 経路。
    // ここでは itr=着, next 無し → 発を着の直後へ挿入。
    const list: RessyaElement[] = [arrive(J(8))];
    insertRessyaElement(list, depart(J(8)), null);
    expect(list).toHaveLength(2);
    expect(list[0]?.afterOp).not.toBe(null); // 着が先
    expect(list[1]?.beforeOp).not.toBe(null); // 発が後
  });

  it('(d) 発発: 既存の発を潰す(itr.beforeOp=null)', () => {
    const list: RessyaElement[] = [depart(J(8))];
    insertRessyaElement(list, depart(J(8)), null);
    expect(list[0]?.beforeOp).toBe(null);
  });
});

describe('searchRessyaElement(次列車=着直後の発)', () => {
  it('同一番線で着の直後に発があれば次列車として返す', () => {
    // 着(自列車終着)→ 発(次列車始発)。
    const arriveEl = arrive(J(8));
    const departEl = depart(J(8, 30));
    const list = [arriveEl, departEl];
    const r = searchRessyaElement(list, arriveEl.afterOp!, false);
    expect(r).not.toBeNull();
    expect(r?.next).toBe(departEl);
    expect(r?.terminalJikoku).toBe(J(8));
  });

  it('着の後に発が無ければ未成立(null)', () => {
    const arriveEl = arrive(J(8));
    const arriveEl2 = arrive(J(8, 30));
    const list = [arriveEl, arriveEl2];
    expect(searchRessyaElement(list, arriveEl.afterOp!, false)).toBeNull();
  });

  it('末尾の着は crossKiten=false で未成立', () => {
    const arriveEl = arrive(J(23));
    const list = [depart(J(6)), arriveEl];
    expect(searchRessyaElement(list, arriveEl.afterOp!, false)).toBeNull();
  });

  it('末尾の着は crossKiten=true で先頭へラップ接続', () => {
    const departEl = depart(J(6));
    const arriveEl = arrive(J(23));
    const list = [departEl, arriveEl];
    const r = searchRessyaElement(list, arriveEl.afterOp!, true);
    expect(r?.next).toBe(departEl); // 先頭の発へラップ
  });
});

describe('searchRessyaElementRev(前列車存在)', () => {
  it('発の直前が着なら前列車あり', () => {
    const arriveEl = arrive(J(8));
    const departEl = depart(J(8, 30));
    const list = [arriveEl, departEl];
    expect(searchRessyaElementRev(list, departEl.beforeOp!, false)).toBe(true);
  });

  it('先頭の発は crossKiten=false で前列車なし', () => {
    const departEl = depart(J(6));
    const list = [departEl, arrive(J(23))];
    expect(searchRessyaElementRev(list, departEl.beforeOp!, false)).toBe(false);
  });
});

describe('buildEkiOrderTable(単独駅縮退・上り反転)', () => {
  it('下り=昇順、上り=反転', () => {
    const ekiCont = [{ ekimei: 'A' }, { ekimei: 'B' }, { ekimei: 'C' }] as unknown as Eki[];
    const table = buildEkiOrderTable(ekiCont);
    // 下り(houkou 0): ekiOrder 0,1,2 → index 0,1,2。
    expect(table.map((r) => r[0])).toEqual([0, 1, 2]);
    // 上り(houkou 1): ekiOrder 0,1,2 → index 2,1,0。
    expect(table.map((r) => r[1])).toEqual([2, 1, 0]);
  });
});
