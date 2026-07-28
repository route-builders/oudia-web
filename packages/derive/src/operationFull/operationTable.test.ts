// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 up-tri

/**
 * 運用表エントリの生成・時刻順挿入(operationTable.ts)の単体テスト。M7c-2 PR-1。
 * `;n` 接尾辞の付与/除去、同一駅区間の破棄、検索キー後作業による位置決め、時刻順挿入を検証する。
 */

import { createNullRessya } from '@oudia-web/domain';
import { asSeconds, type Ressya } from '@oudia-web/format';
import { describe, expect, it } from 'vitest';
import type { OpRef } from '../operationLight/types.js';
import {
  addOperationTableContent,
  createOperationTableContext,
  insertOperationTableContentToBuffer,
} from './operationTable.js';
import type { OperationTableEntry, RessyaPropertyRef } from './types.js';

const J = (h: number, m = 0) => asSeconds(h * 3600 + m * 60);

/** E0〜E2 を全駅停車する 3 駅の列車(全区間が運行あり)。 */
function makeRessya(): Ressya {
  const r = createNullRessya(3, 0);
  r.isNull = false;
  for (let o = 0; o < 3; o++) {
    const s = r.ekiJikokuCont[o];
    if (s === undefined) continue;
    s.ekiatsukai = 'teisya';
    s.chakuJikoku = J(8, o * 30);
    s.hatsuJikoku = J(8, o * 30 + 5);
  }
  return r;
}

const prop = (jikoku: ReturnType<typeof J> | null = J(7, 50)): RessyaPropertyRef => ({
  houkou: 0,
  ressyaIndex: 0,
  jikoku,
});

/** 運用表 Map から運番のエントリ列を引く。 */
function tableOf(
  ctx: ReturnType<typeof createOperationTableContext>,
  key: string,
): OperationTableEntry[] {
  return ctx.table.get(key) ?? [];
}

const ref = (ekiOrder: number, iLevel: number[] = [0]): OpRef => ({
  houkou: 0,
  ressyaIndex: 0,
  ekiOrder,
  opKind: 'after',
  iLevel,
});

describe('insertOperationTableContentToBuffer', () => {
  it('出区は beforeType=outIn で開始側を積む', () => {
    const ctx = createOperationTableContext([1, 0], null);
    const nums = ['5'];
    insertOperationTableContentToBuffer(
      ctx,
      prop(),
      nums,
      0,
      { kind: 'out', outJikoku: J(7, 50), inOutLinkCode: '', operationNumbers: ['5'] },
      null,
      'outIn',
    );
    const entry = ctx.buffer[0]?.[0]?.get('5');
    expect(entry?.beforeType).toBe('outIn');
    expect(entry?.sihatsuEkiOrder).toBe(0);
    expect(nums).toEqual(['5']); // 衝突なし → 接尾辞なし
  });

  it('路線外始発は outer 情報を写す', () => {
    const ctx = createOperationTableContext([1, 0], null);
    insertOperationTableContentToBuffer(
      ctx,
      prop(J(7, 30)),
      ['5'],
      0,
      {
        kind: 'outer',
        outerTerminalIndex: 2,
        outerHatsuJikoku: J(7, 30),
        chakuJikoku: J(7, 55),
        inOutLinkCode: '',
        operationNumbers: ['5'],
      },
      null,
      'outer',
    );
    const entry = ctx.buffer[0]?.[0]?.get('5');
    expect(entry?.beforeType).toBe('outer');
    expect(entry?.outerSihatsuEkiIndex).toBe(2);
    expect(entry?.outerSihatsuJikoku).toBe(J(7, 30));
    expect(entry?.chakuJikoku).toBe(J(7, 55));
  });

  it('同一列車で運番が衝突すると `;0` 接尾辞を付けて運番配列を書き換える', () => {
    const ctx = createOperationTableContext([1, 0], null);
    const first = ['5'];
    const second = ['5'];
    insertOperationTableContentToBuffer(ctx, prop(), first, 0, null, null, 'unrelated');
    insertOperationTableContentToBuffer(ctx, prop(), second, 1, null, null, 'unrelated');
    expect(first).toEqual(['5']);
    expect(second).toEqual(['5;0']); // ★破壊的に改名され、下流の再帰へ伝播する
    expect(ctx.buffer[0]?.[0]?.has('5')).toBe(true);
    expect(ctx.buffer[0]?.[0]?.has('5;0')).toBe(true);
  });

  it('空運番は運用表に載せない', () => {
    const ctx = createOperationTableContext([1, 0], null);
    insertOperationTableContentToBuffer(ctx, prop(), [''], 0, null, null, 'unrelated');
    expect(ctx.buffer[0]?.[0]?.size).toBe(0);
  });
});

describe('addOperationTableContent', () => {
  it('開始側がバッファにあれば終了側を埋めて運用表 Map に載せる', () => {
    const ctx = createOperationTableContext([1, 0], null);
    const ressya = makeRessya();
    const nums = ['5'];
    insertOperationTableContentToBuffer(
      ctx,
      prop(),
      nums,
      0,
      { kind: 'out', outJikoku: J(7, 50), inOutLinkCode: '', operationNumbers: ['5'] },
      null,
      'outIn',
    );
    addOperationTableContent(ctx, ressya, prop(), nums, 2, null, ref(2), 'unrelated');

    const list = tableOf(ctx, '5');
    expect(list).toHaveLength(1);
    expect(list[0]?.sihatsuEkiOrder).toBe(0);
    expect(list[0]?.syuuchakuEkiOrder).toBe(2);
    expect(list[0]?.beforeType).toBe('outIn');
    expect(list[0]?.afterType).toBe('unrelated');
  });

  it('開始側がなければ何もしない(この運番の運用ではない)', () => {
    const ctx = createOperationTableContext([1, 0], null);
    addOperationTableContent(ctx, makeRessya(), prop(), ['9'], 2, null, null, 'unrelated');
    expect(ctx.table.size).toBe(0);
  });

  it('始発駅と終着駅が同じなら区間なしとして捨てる', () => {
    const ctx = createOperationTableContext([1, 0], null);
    const nums = ['5'];
    insertOperationTableContentToBuffer(ctx, prop(), nums, 1, null, null, 'unrelated');
    addOperationTableContent(ctx, makeRessya(), prop(), nums, 1, null, null, 'unrelated');
    expect(ctx.table.size).toBe(0);
  });

  it('路線外終着は outer 情報を写す', () => {
    const ctx = createOperationTableContext([1, 0], null);
    const nums = ['5'];
    insertOperationTableContentToBuffer(ctx, prop(), nums, 0, null, null, 'unrelated');
    addOperationTableContent(
      ctx,
      makeRessya(),
      prop(),
      nums,
      2,
      {
        kind: 'outer',
        outerTerminalIndex: 3,
        hatsuJikoku: J(9, 10),
        outerChakuJikoku: J(9, 40),
        inOutLinkCode: '',
      },
      ref(2),
      'outer',
    );
    const e = tableOf(ctx, '5')[0];
    expect(e?.outerSyuuchakuEkiIndex).toBe(3);
    expect(e?.hatsuJikoku).toBe(J(9, 10));
    expect(e?.outerSyuuchakuJikoku).toBe(J(9, 40));
  });

  it('`;n` 接尾辞は運用表 Map のキーから外れ、運番配列も素の値へ戻る', () => {
    const ctx = createOperationTableContext([1, 0], null);
    const first = ['5'];
    const second = ['5'];
    insertOperationTableContentToBuffer(ctx, prop(J(7, 50)), first, 0, null, null, 'unrelated');
    insertOperationTableContentToBuffer(ctx, prop(J(9, 50)), second, 1, null, null, 'unrelated');
    expect(second).toEqual(['5;0']);

    const ressya = makeRessya();
    addOperationTableContent(ctx, ressya, prop(J(7, 50)), first, 2, null, null, 'unrelated');
    addOperationTableContent(ctx, ressya, prop(J(9, 50)), second, 2, null, null, 'unrelated');

    expect(second).toEqual(['5']); // 接尾辞は除去されて返る
    expect([...ctx.table.keys()]).toEqual(['5']);
    expect(tableOf(ctx, '5')).toHaveLength(2);
  });

  it('検索キー後作業に一致する要素の直後へ挿入し、時刻を落とす', () => {
    const ctx = createOperationTableContext([1, 0], null);
    const ressya = makeRessya();
    // 1 件目: 出区 → 次列車接続(afterRef = A)。
    const a = ['5'];
    insertOperationTableContentToBuffer(ctx, prop(J(7, 50)), a, 0, null, null, 'unrelated');
    addOperationTableContent(ctx, ressya, prop(J(7, 50)), a, 2, null, ref(2, [0]), 'propertySame');
    // 2 件目: 前列車接続(検索キー = A)から始まり入区で閉じる。
    const b = ['5'];
    insertOperationTableContentToBuffer(ctx, prop(J(10)), b, 0, null, ref(2, [0]), 'propertySame');
    addOperationTableContent(ctx, ressya, prop(J(10)), b, 2, null, null, 'outIn');

    const list = tableOf(ctx, '5');
    expect(list).toHaveLength(2);
    // 検索キー一致で「直後」に入り、時刻は null 化される(原典 :8207)。
    expect(list[1]?.ressyaProperty.jikoku).toBeNull();
    expect(list[1]?.afterType).toBe('outIn');
  });

  it('検索キーがなく時刻もない要素は運用表に載せない', () => {
    const ctx = createOperationTableContext([1, 0], null);
    const nums = ['5'];
    insertOperationTableContentToBuffer(ctx, prop(null), nums, 0, null, null, 'unrelated');
    addOperationTableContent(ctx, makeRessya(), prop(null), nums, 2, null, null, 'unrelated');
    // 原典 :8189 は operator[] でキーを先に作るので空リストは残る(忠実)。中身が空であることを見る。
    expect(tableOf(ctx, '5')).toEqual([]);
  });

  it('時刻順に並ぶ(後から来た早い時刻が前へ入る)', () => {
    const ctx = createOperationTableContext([2, 0], null);
    const ressya = makeRessya();
    const late = ['5'];
    const early = ['5'];
    // 同一運番だが別列車 → バッファが列車ごとなので接尾辞は付かない。
    const p0: RessyaPropertyRef = { houkou: 0, ressyaIndex: 0, jikoku: J(20) };
    const p1: RessyaPropertyRef = { houkou: 0, ressyaIndex: 1, jikoku: J(6) };
    insertOperationTableContentToBuffer(ctx, p0, late, 0, null, null, 'unrelated');
    insertOperationTableContentToBuffer(ctx, p1, early, 0, null, null, 'unrelated');
    addOperationTableContent(ctx, ressya, p0, late, 2, null, null, 'unrelated');
    addOperationTableContent(ctx, ressya, p1, early, 2, null, null, 'unrelated');

    const list = tableOf(ctx, '5');
    expect(list.map((e) => e.ressyaProperty.ressyaIndex)).toEqual([1, 0]);
  });
});
