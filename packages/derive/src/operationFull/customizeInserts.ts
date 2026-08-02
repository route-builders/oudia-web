// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 up-tri
//
// Based on OuDiaSecond (Copyright (C) 2017-2026 diagram_mania)
// and OuDia (Copyright (C) 2006-2017 take-okm)

/**
 * カスタマイズ時刻表の「路線外始発/終着だけの疑似列」の生成と差し込み。
 * 原典 CDedOperationConnecter.cpp の ☆1(:5136-5200)/ ☆2(:6905-6975)/
 * ☆3(:7088-7148)/ ☆4(:7238-7305)で列を作り、
 * completeCustomizeJikokuhyouContent のブロック(3)(:8925-8948)と
 * (6)(:9450-9473)で差し込む。follow-up #11。
 *
 * ★列は `ressyaIndexCont` が**空**(= 列車 NULL の疑似列)。カスタマイズ時刻表の
 * セル充填はこの列を早期 return せず、「||」「↳」「↴」と路線外欄を描く。
 *
 * ★差し込み位置は**最初に一致した列**の直左(併合)/ 直右(分割)。1 件につき 1 回だけ。
 * ★増解結の入れ子でしか発生しない(iLevel の深さが 1 のときは不発)。
 *
 * すべて oud2 非永続の派生表示情報 = 黄金テスト非該当。
 */

import type { AfterOperation, BeforeOperation, Dia, EkiJikoku, Ressya } from '@oudia-web/format';
import type { CustomizeChainColumn } from '../operationLight/types.js';
import { createCustomizeChainColumn } from '../operationLight/types.js';
import { resolveOperation } from './operationRef.js';
import type { RessyaOperationTree } from './types.js';

/** 差し込み待ちの 1 件(原典 unordered_multimap<列車Index, Content> の 1 要素)。 */
export interface OuterInsertEntry {
  /** 挿入位置の基準になる列車 index(原典 pair::first)。 */
  readonly ressyaIndex: number;
  readonly column: CustomizeChainColumn;
}

/**
 * 方向 × 駅Order ごとの差し込み待ち一覧
 * (原典 m_contOuterConnectInsertList / m_contOuterReleaseInsertList)。
 * ★原典は unordered_multimap なので反復順が処理系依存。TS は**登録順**で確定させる。
 */
export type OuterInsertList = Map<string, OuterInsertEntry[]>;

/** 一覧のキー。 */
function key(houkou: number, ekiOrder: number): string {
  return `${String(houkou)}:${String(ekiOrder)}`;
}

export function createOuterInsertList(): OuterInsertList {
  return new Map();
}

/** 差し込み待ちを積む。 */
export function addOuterInsert(
  list: OuterInsertList,
  houkou: number,
  ekiOrder: number,
  entry: OuterInsertEntry,
): void {
  const k = key(houkou, ekiOrder);
  const arr = list.get(k);
  if (arr === undefined) list.set(k, [entry]);
  else arr.push(entry);
}

/** その方向・駅Order の差し込み待ち。 */
export function outerInsertsAt(
  list: OuterInsertList,
  houkou: number,
  ekiOrder: number,
): readonly OuterInsertEntry[] {
  return list.get(key(houkou, ekiOrder)) ?? [];
}

/**
 * 「主編成に増結している(増結の繰り返しは可)」か(原典 bConnectValid、:5141-5175)。
 *
 * ★深さ 1(= 主編成そのもの)は**常に false**。親を 1 段ずつ遡り、途中に**解結**の
 * 作業があれば false。増結だけで繋がっていれば true。
 */
export function isConnectValid(
  dia: Dia,
  tree: RessyaOperationTree,
  treeLevel: readonly number[],
): boolean {
  return isValidChain(dia, tree, treeLevel, 'release');
}

/**
 * 「主編成から解結されている(解結の繰り返しは可)」か(原典 bReleaseValid、:7095-7120)。
 * ★途中に**増結**があれば false。
 */
export function isReleaseValid(
  dia: Dia,
  tree: RessyaOperationTree,
  treeLevel: readonly number[],
): boolean {
  return isValidChain(dia, tree, treeLevel, 'connect');
}

/** 親作業を遡り、`stopper` 種別の作業に当たったら false。 */
function isValidChain(
  dia: Dia,
  tree: RessyaOperationTree,
  treeLevel: readonly number[],
  stopper: 'connect' | 'release',
): boolean {
  if (treeLevel.length <= 1) return false;
  const parent = [...treeLevel];
  while (parent.length > 1) {
    parent.pop();
    for (const node of tree.nodes) {
      if (!sameLevel(node.treeLevel, parent)) continue;
      // ★原典は前作業・後作業のどちらでも stopper 種別なら打ち切る(:5163-5171)。
      if (resolveOperation(dia, node.el.op)?.kind === stopper) return false;
    }
  }
  return true;
}

function sameLevel(a: readonly number[], b: readonly number[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((v, i) => v === b[i]);
}

/**
 * 路線外始発の増結列(☆1/☆2/☆4)を作る(原典 :5183-5199)。
 *
 * ★`bIsPrev = true` のコンストラクタ(CentDedDia.h:547-557)なので、
 * 列車情報は**前列車側のフィールドだけ**に入る(非 Prev 側は -1 / 空のまま)。
 * ★着時刻が null のときは**同駅の発時刻**で代替する(:5187-5191)。
 */
export function createOuterConnectColumn(
  ressya: Ressya,
  ekiOrder: number,
  op: BeforeOperation & { kind: 'outer' },
  slot: EkiJikoku | undefined,
  operationNumbers: readonly string[],
): CustomizeChainColumn {
  const col = createCustomizeChainColumn([]);
  col.connectEkiOrder = ekiOrder;
  col.chakuJikoku = op.chakuJikoku ?? slot?.hatsuJikoku ?? null;
  col.outerSihatsuJikoku = op.outerHatsuJikoku;
  col.sihatsuEkiOrder = ekiOrder;
  col.outerSihatsuEkiIndex = op.outerTerminalIndex;
  col.prevEkiatsukai = slot?.ekiatsukai ?? 'teisya';
  col.prevRessyaTrackIndex = slot?.ressyaTrackIndex ?? 0;
  col.prevOperationNumber = [...operationNumbers];
  col.beforeType = 'outer';
  // bIsPrev = true の列車情報。
  col.prevRessyasyubetsuIndex = ressya.syubetsuIndex;
  col.prevRessyabangou = ressya.ressyabangou;
  col.prevRessyamei = ressya.ressyamei;
  col.prevGousuu = ressya.gousuu;
  return col;
}

/**
 * 路線外終着の解結列(☆3)を作る(原典 :7127-7146)。
 *
 * ★`bIsPrev = false` なので列車情報は**非 Prev 側**に入る。
 * ★発時刻が null のときは**同駅の着時刻**で代替する(:7134-7138)。始発側と逆。
 */
export function createOuterReleaseColumn(
  ressya: Ressya,
  ekiOrder: number,
  op: AfterOperation & { kind: 'outer' },
  slot: EkiJikoku | undefined,
  operationNumbers: readonly string[],
): CustomizeChainColumn {
  const col = createCustomizeChainColumn([]);
  col.releaseEkiOrder = ekiOrder;
  col.hatsuJikoku = op.hatsuJikoku ?? slot?.chakuJikoku ?? null;
  col.outerSyuuchakuJikoku = op.outerChakuJikoku;
  col.syuuchakuEkiOrder = ekiOrder;
  col.outerSyuuchakuEkiIndex = op.outerTerminalIndex;
  col.ekiatsukai = slot?.ekiatsukai ?? 'teisya';
  col.ressyaTrackIndex = slot?.ressyaTrackIndex ?? 0;
  col.operationNumber = [...operationNumbers];
  col.afterType = 'outer';
  // bIsPrev = false の列車情報。
  col.ressyasyubetsuIndex = ressya.syubetsuIndex;
  col.ressyabangou = ressya.ressyabangou;
  col.ressyamei = ressya.ressyamei;
  col.gousuu = ressya.gousuu;
  return col;
}

/**
 * ブロック(3): 併合列を基準列の**直左**へ差し込む(原典 :8925-8948)。
 * ★探索は「最初に一致した列」で打ち切る(bInserted)。見つからなければ何もしない。
 */
export function applyOuterConnectInsertsAt(
  chains: CustomizeChainColumn[],
  entries: readonly OuterInsertEntry[],
): void {
  for (const entry of entries) {
    const idx = firstChainIndexOf(chains, entry.ressyaIndex);
    if (idx < 0) continue;
    chains.splice(idx, 0, entry.column);
  }
}

/**
 * ブロック(6): 分割列を基準列の**直右**へ差し込む(原典 :9450-9473)。
 * (3) との違いはオフセット +1 だけ。
 */
export function applyOuterReleaseInsertsAt(
  chains: CustomizeChainColumn[],
  entries: readonly OuterInsertEntry[],
): void {
  for (const entry of entries) {
    const idx = firstChainIndexOf(chains, entry.ressyaIndex);
    if (idx < 0) continue;
    chains.splice(idx + 1, 0, entry.column);
  }
}

/** 列車 index を含む**最初の**列(原典の bInserted 打ち切りに対応)。 */
function firstChainIndexOf(chains: readonly CustomizeChainColumn[], ressyaIndex: number): number {
  for (let i = 0; i < chains.length; i++) {
    if (chains[i]?.ressyaIndexCont.includes(ressyaIndex) === true) return i;
  }
  return -1;
}
