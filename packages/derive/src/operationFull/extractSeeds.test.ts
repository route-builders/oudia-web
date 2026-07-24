// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 up-tri

/**
 * Full 用 seed 収集(extract.ts の outOuterSeeds/beforeJunctionSeeds)の単体テスト(M7c PR-A)。
 * Light 呼出側では無視される追加 seed が、正しく分類収集されることを確認する。
 */

import type { BeforeOperation } from '@oudia-web/format';
import { asSeconds } from '@oudia-web/format';
import { describe, expect, it } from 'vitest';
import {
  type ExpandContext,
  searchBeforeOperationElementLight,
} from '../operationLight/extract.js';

const J = (h: number, m = 0) => asSeconds(h * 3600 + m * 60);
const ctx: ExpandContext = { houkou: 0, ressyaIndex: 0, ekiOrder: 0, ekiIndexOfExist: 0 };

describe('extract Full seed 収集', () => {
  it('出区始発は outOuterSeeds に 1 件・beforeJunctionSeeds は空', () => {
    const cont: BeforeOperation[] = [
      { kind: 'out', outJikoku: J(8), inOutLinkCode: '', operationNumbers: ['1'] },
    ];
    const r = searchBeforeOperationElementLight(cont, null, [], 0, ctx);
    expect(r.outOuterSeeds).toHaveLength(1);
    expect(r.beforeJunctionSeeds).toHaveLength(0);
    // outOuter は占有登録しない(existInserts 空)。
    expect(r.existInserts).toHaveLength(0);
  });

  it('路線外始発も outOuterSeeds', () => {
    const cont: BeforeOperation[] = [
      {
        kind: 'outer',
        outerTerminalIndex: 0,
        outerHatsuJikoku: J(7),
        chakuJikoku: J(8),
        inOutLinkCode: '',
        operationNumbers: [],
      },
    ];
    const r = searchBeforeOperationElementLight(cont, null, [], 0, ctx);
    expect(r.outOuterSeeds).toHaveLength(1);
  });

  it('前列車接続始発は beforeJunctionSeeds に 1 件・outOuterSeeds は空・占有登録あり', () => {
    const cont: BeforeOperation[] = [
      { kind: 'junction', kitenJikoku: J(8), kariOperationNumbers: [] },
    ];
    const r = searchBeforeOperationElementLight(cont, null, [], 0, ctx);
    expect(r.beforeJunctionSeeds).toHaveLength(1);
    expect(r.outOuterSeeds).toHaveLength(0);
    // 前列車接続は占有登録する(受け側)。
    expect(r.existInserts).toHaveLength(1);
  });

  it('増解結の子展開でも seed は入れ子から伝播する', () => {
    // 前列車接続 + 増結(子に出区)。
    const cont: BeforeOperation[] = [
      { kind: 'junction', kitenJikoku: J(8), kariOperationNumbers: [] },
      {
        kind: 'connect',
        connectToFront: false,
        connectJikoku: J(8, 10),
        formationBeforeOperationCont: [
          { kind: 'out', outJikoku: J(8, 5), inOutLinkCode: '', operationNumbers: ['9'] },
        ],
      },
    ];
    const r = searchBeforeOperationElementLight(cont, null, [], 0, ctx);
    // トップの前列車接続 + 子の出区。
    expect(r.beforeJunctionSeeds).toHaveLength(1); // トップ junction
    expect(r.outOuterSeeds).toHaveLength(1); // 子の out
  });
});
