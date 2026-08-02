// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 up-tri
//
// Based on OuDiaSecond (Copyright (C) 2017-2026 diagram_mania)
// and OuDia (Copyright (C) 2006-2017 take-okm)

/**
 * Light 運用探索のカスタマイズ時刻表チェーン(customizeRessyaIndexChains)構築(原典
 * operationConnectLight のチェーン処理、CDedOperationConnecter.cpp:635-2118)。M7b Light PR4。
 *
 * チェーン列 = カスタマイズ時刻表で「縦に積む列車」の並び。初期は全列車 1 本ずつの列で、
 * 探索で接続が判明するたびに列を併合・並べ替えする:
 * - 初期化(:635-660): 各方向 ressyaIndexCont=[列車index] を列車数分 seed。
 * - 除去(:698-762): isCanceled / 発着駅無効の列車を含む列を erase。
 * - 一本化併合(:1948-1991): 主編成×Unrelated の接続で次列車列を前列車列末尾へ吸収。
 * - 増結 move-list(:2011-2064、駅Order 降順): 前列車列を次列車列の左へ移動。
 * - 解結 move-list(:2067-2118、駅Order 昇順): 次列車列を前列車列の右へ移動。
 *
 * ★時刻等の充填(completeCustomizeJikokuhyouContent)は #11 カスタマイズ時刻表描画側の責務で、
 * ここでは列の並び(ressyaIndexCont + connect/releaseEkiOrder)までを構築する。
 */

import { getValidSihatsuEki, getValidSyuuchakuEki } from '@oudia-web/domain';
import type { Ressya, Ressyasyubetsu } from '@oudia-web/format';
import type { CustomizeChainColumn } from './types.js';
import { createCustomizeChainColumn } from './types.js';

/** チェーン列を全列車 1 本ずつで初期化する(原典 :635-647)。 */
export function initChains(ressyaCount: number): CustomizeChainColumn[] {
  const chains: CustomizeChainColumn[] = [];
  for (let idx = 0; idx < ressyaCount; idx++) {
    chains.push(createCustomizeChainColumn([idx]));
  }
  return chains;
}

/**
 * 指定列車 index を含む列を探して index を返す(原典の二重ループ探索、:706-716)。なければ -1。
 */
export function findChainIndex(
  chains: readonly CustomizeChainColumn[],
  ressyaIndex: number,
): number {
  for (let idx = 0; idx < chains.length; idx++) {
    const col = chains[idx];
    if (col === undefined) continue;
    if (col.ressyaIndexCont.includes(ressyaIndex)) return idx;
  }
  return -1;
}

/**
 * 列車 index を含む列を探す(★**最後の一致**を返す)。
 *
 * 原典 :8436-8451 / :8969-8984 の探索は break せず全列・全要素を舐めて index を上書きし続ける。
 * 同じ列車が複数の列に現れうる(併合編成)ため、先頭一致とは結果が変わる。
 * move-list の適用((1)(4))はこちらを使う。
 */
export function findChainIndexLast(
  chains: readonly CustomizeChainColumn[],
  ressyaIndex: number,
): number {
  let found = -1;
  for (let idx = 0; idx < chains.length; idx++) {
    const col = chains[idx];
    if (col === undefined) continue;
    if (col.ressyaIndexCont.includes(ressyaIndex)) found = idx;
  }
  return found;
}

/**
 * 指定列車 index を含む列を除去する(原典 :698-762 の erase)。isCanceled / 発着駅無効列車用。
 * 破壊的に chains を更新する。
 */
export function removeChainOf(chains: CustomizeChainColumn[], ressyaIndex: number): void {
  const idx = findChainIndex(chains, ressyaIndex);
  if (idx !== -1) chains.splice(idx, 1);
}

/**
 * 一本化併合(原典 :1948-1991)。主編成×Unrelated の接続で、次列車 nextRessyaIndex の列を
 * 前列車 prevRessyaIndex の列の末尾へ吸収し、次列車列を除去する。connectEkiOrder を引き継ぐ。
 * 破壊的に chains を更新する。
 *
 * @param prevRessyaIndex 前列車(接続元)の列車 index
 * @param nextRessyaIndex 次列車(接続先)の列車 index
 */
export function mergeChains(
  chains: CustomizeChainColumn[],
  prevRessyaIndex: number,
  nextRessyaIndex: number,
): void {
  const prevIdx = findChainIndex(chains, prevRessyaIndex);
  const nextIdx = findChainIndex(chains, nextRessyaIndex);
  if (prevIdx === -1 || nextIdx === -1 || prevIdx === nextIdx) return;
  const prev = chains[prevIdx];
  const next = chains[nextIdx];
  if (prev === undefined || next === undefined) return;
  // 次列車列を前列車列末尾へ吸収。
  prev.ressyaIndexCont.push(...next.ressyaIndexCont);
  if (next.connectEkiOrder !== -1) prev.connectEkiOrder = next.connectEkiOrder;
  if (next.releaseEkiOrder !== -1) prev.releaseEkiOrder = next.releaseEkiOrder;
  chains.splice(nextIdx, 1);
}

// ---- move-list(増結/解結の並べ替え。原典 m_contConnectMoveList / m_contReleaseMoveList)----

/** move-list エントリ [first, second]。意味は connect/release で異なる(下記参照)。 */
export type MoveEntry = readonly [first: number, second: number];
/** move-list[ekiOrder] = エントリ列。 */
export type MoveList = Map<number, MoveEntry[]>;

/** 空の move-list を作る。 */
export function emptyMoveList(): MoveList {
  return new Map();
}

/** move-list へ登録する(ekiOrder ごとに追加)。 */
export function addMove(list: MoveList, ekiOrder: number, entry: MoveEntry): void {
  const arr = list.get(ekiOrder);
  if (arr === undefined) list.set(ekiOrder, [entry]);
  else arr.push(entry);
}

/**
 * 増結 move-list を適用する(原典 :2005-2061、駅Order 降順)。
 * エントリ [first=併合先(前列車), second=併合列車]。併合列車(second)を併合先(first)の左へ移す。
 * ※原典命名: iCustomizeIndexPrev=second(移動列車)、iCustomizeIndexNext=first(併合先)。
 */
export function applyConnectMoveList(
  chains: CustomizeChainColumn[],
  moveList: MoveList,
  ekiCount: number,
): void {
  for (let ekiOrder = ekiCount - 1; ekiOrder >= 0; ekiOrder--) {
    const entries = moveList.get(ekiOrder);
    if (entries === undefined) continue;
    for (const [first, second] of entries) {
      const idxMove = findChainIndexLast(chains, second); // 移動する側(前列車)
      const idxTarget = findChainIndexLast(chains, first); // 併合先(次列車)
      if (idxMove === -1 || idxTarget === -1) continue;
      const moved = chains[idxMove];
      if (moved === undefined) continue;
      // ★connectEkiOrder は**両方見つかれば必ず書く**(原典 :8455)。同じ列に居る
      // (= 既に併合済み)ときは移動だけしない。ここを continue にすると
      // 併合駅の「↳」「路線外始発相当」が出なくなる。
      moved.connectEkiOrder = ekiOrder;
      if (idxMove === idxTarget) continue;
      // moved を idxTarget の位置(左)へ移す。
      chains.splice(idxMove, 1);
      const insertAt = idxMove < idxTarget ? idxTarget - 1 : idxTarget;
      chains.splice(insertAt, 0, moved);
    }
  }
}

/**
 * 解結 move-list を適用する(原典 :2063-2118、駅Order 昇順)。
 * エントリ [first=分割元(前列車), second=分割列車]。分割列車(second)を分割元(first)の右へ移す。
 */
export function applyReleaseMoveList(
  chains: CustomizeChainColumn[],
  moveList: MoveList,
  ekiCount: number,
): void {
  for (let ekiOrder = 0; ekiOrder < ekiCount; ekiOrder++) {
    const entries = moveList.get(ekiOrder);
    if (entries === undefined) continue;
    for (const [first, second] of entries) {
      const idxTarget = findChainIndexLast(chains, first); // 分割元(前列車)
      const idxMove = findChainIndexLast(chains, second); // 分割列車(移動する側)
      if (idxMove === -1 || idxTarget === -1) continue;
      const moved = chains[idxMove];
      if (moved === undefined) continue;
      // ★releaseEkiOrder も両方見つかれば必ず書く(原典 :8990)。
      moved.releaseEkiOrder = ekiOrder;
      if (idxMove === idxTarget) continue;
      // moved を分割元の直後(idxTarget+1)へ移す。
      chains.splice(idxMove, 1);
      const insertAt = idxMove < idxTarget ? idxTarget : idxTarget + 1;
      chains.splice(insertAt, 0, moved);
    }
  }
}

/**
 * 運用機能が無効(enableOperation === 0)のときのチェーン列を作る(原典
 * CentDedDia::omitInvalidRessyaFromCustomizeRessyaIndex、CentDedDia.cpp:412-482)。
 *
 * ★列の併合・分割・路線外相当表示は**一切行わない**。「1 列車 = 1 列」から
 * 表示できない列車の列を落とすだけ。
 * - `isNull` の列車は**残す**(空列としてレイアウトを保つ)
 * - `isCanceled`(運休)は落とす
 * - 隠し種別は `disableHiddenSyubetsu` が false のときだけ落とす
 * - 有効始発 / 有効終着が取れない列車は落とす
 */
export function buildCustomizeChainsWithoutOperation(
  ressyaList: readonly Ressya[],
  syubetsuCont: readonly Ressyasyubetsu[],
  disableHiddenSyubetsu: boolean,
): CustomizeChainColumn[] {
  const chains: CustomizeChainColumn[] = [];
  for (const [idx, r] of ressyaList.entries()) {
    if (r.isNull) {
      chains.push(createCustomizeChainColumn([idx]));
      continue;
    }
    if (r.isCanceled) continue;
    if (!disableHiddenSyubetsu && syubetsuCont[r.syubetsuIndex]?.hidden === true) continue;
    if (getValidSihatsuEki(r) < 0 || getValidSyuuchakuEki(r) < 0) continue;
    chains.push(createCustomizeChainColumn([idx]));
  }
  return chains;
}
