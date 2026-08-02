// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 up-tri

/** カスタマイズ時刻表チェーン(init/remove/merge)の単体テスト(M7b Light PR4)。 */

import { describe, expect, it } from 'vitest';
import {
  addMove,
  applyConnectMoveList,
  applyReleaseMoveList,
  emptyMoveList,
  findChainIndex,
  findChainIndexLast,
  initChains,
  mergeChains,
  removeChainOf,
} from './chains.js';
import { createCustomizeChainColumn } from './types.js';

describe('initChains', () => {
  it('列車数ぶんの 1 要素チェーンを作る', () => {
    const chains = initChains(3);
    expect(chains.map((c) => c.ressyaIndexCont)).toEqual([[0], [1], [2]]);
    expect(chains.every((c) => c.connectEkiOrder === -1 && c.releaseEkiOrder === -1)).toBe(true);
  });
});

describe('findChainIndex / removeChainOf', () => {
  it('列車を含む列を見つけ、除去する', () => {
    const chains = initChains(3);
    expect(findChainIndex(chains, 1)).toBe(1);
    removeChainOf(chains, 1);
    expect(chains.map((c) => c.ressyaIndexCont)).toEqual([[0], [2]]);
    expect(findChainIndex(chains, 1)).toBe(-1);
  });
});

describe('mergeChains(一本化併合)', () => {
  it('次列車列を前列車列末尾へ吸収し次を除去', () => {
    const chains = initChains(3);
    // 列車 0 の後に列車 1 を接続 → [0,1] と [2] に。
    mergeChains(chains, 0, 1);
    expect(chains.map((c) => c.ressyaIndexCont)).toEqual([[0, 1], [2]]);
  });

  it('連鎖併合(0→1→2)で 1 列に', () => {
    const chains = initChains(3);
    mergeChains(chains, 0, 1); // [0,1],[2]
    mergeChains(chains, 1, 2); // 1 を含む列([0,1])末尾へ 2 を吸収 → [0,1,2]
    expect(chains.map((c) => c.ressyaIndexCont)).toEqual([[0, 1, 2]]);
  });

  it('connect/releaseEkiOrder を引き継ぐ', () => {
    const chains = initChains(2);
    const next = chains[1];
    if (next) {
      next.connectEkiOrder = 3;
      next.releaseEkiOrder = 5;
    }
    mergeChains(chains, 0, 1);
    expect(chains[0]?.connectEkiOrder).toBe(3);
    expect(chains[0]?.releaseEkiOrder).toBe(5);
  });

  it('同一列 or 存在しない列は無変更', () => {
    const chains = initChains(2);
    mergeChains(chains, 0, 0); // 同一
    expect(chains).toHaveLength(2);
    mergeChains(chains, 0, 9); // 存在しない
    expect(chains).toHaveLength(2);
  });
});

describe('move-list 適用', () => {
  it('増結 move: 併合列車を併合先の左へ移す + connectEkiOrder 設定', () => {
    // [0][1][2]。increase move [first=2(併合先), second=0(併合列車)] を駅Order 3 で登録。
    const chains = initChains(3);
    const con = emptyMoveList();
    addMove(con, 3, [2, 0]); // 併合列車 0 を 併合先 2 の左へ。
    applyConnectMoveList(chains, con, 5);
    // 0 が 2 の左(直前)へ。元 [0,1,2] → 0 を抜いて 2 の直前に → [1,0,2]。
    expect(chains.map((c) => c.ressyaIndexCont)).toEqual([[1], [0], [2]]);
    // 移動した列(0)に connectEkiOrder=3。
    expect(chains[1]?.connectEkiOrder).toBe(3);
  });

  it('解結 move: 分割列車を分割元の右へ移す + releaseEkiOrder 設定', () => {
    // [0][1][2]。release move [first=0(分割元), second=2(分割列車)] を駅Order 1 で登録。
    const chains = initChains(3);
    const rel = emptyMoveList();
    addMove(rel, 1, [0, 2]); // 分割列車 2 を 分割元 0 の右へ。
    applyReleaseMoveList(chains, rel, 5);
    // 2 を 0 の直後へ → [0,2,1]。
    expect(chains.map((c) => c.ressyaIndexCont)).toEqual([[0], [2], [1]]);
    expect(chains[1]?.releaseEkiOrder).toBe(1);
  });
});

describe('move-list の原典忠実性(完了条件)', () => {
  it('★同じ列に居ても connectEkiOrder は書く(移動だけしない。原典 :8455)', () => {
    // 併合済みで 2 列車が同じ列に積まれている状態。
    const chains = [createCustomizeChainColumn([0, 1])];
    const moves = emptyMoveList();
    addMove(moves, 3, [1, 0]); // first=併合先(次列車 1) / second=移動側(前列車 0)
    applyConnectMoveList(chains, moves, 5);
    expect(chains).toHaveLength(1);
    expect(chains[0]?.connectEkiOrder).toBe(3);
  });

  it('★同じ列に居ても releaseEkiOrder は書く(原典 :8990)', () => {
    const chains = [createCustomizeChainColumn([0, 1])];
    const moves = emptyMoveList();
    addMove(moves, 2, [0, 1]); // first=分割元(0) / second=分割列車(1)
    applyReleaseMoveList(chains, moves, 5);
    expect(chains).toHaveLength(1);
    expect(chains[0]?.releaseEkiOrder).toBe(2);
  });

  it('★列の探索は最後の一致(原典は break せず上書きし続ける)', () => {
    // 列車 0 が 2 つの列に現れる(併合編成)。移動対象は**後ろ**の列。
    const chains = [
      createCustomizeChainColumn([0]),
      createCustomizeChainColumn([9]),
      createCustomizeChainColumn([0, 5]),
    ];
    expect(findChainIndexLast(chains, 0)).toBe(2);
    const moves = emptyMoveList();
    addMove(moves, 1, [9, 0]); // 併合先=列車 9(index 1)/ 移動=列車 0(最後の一致 = index 2)
    applyConnectMoveList(chains, moves, 5);
    // index 2 の列が index 1 の左へ移る。
    expect(chains.map((c) => [...c.ressyaIndexCont])).toEqual([[0], [0, 5], [9]]);
    expect(chains[1]?.connectEkiOrder).toBe(1);
  });
});
