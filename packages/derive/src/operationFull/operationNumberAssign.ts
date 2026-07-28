// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 up-tri
//
// Based on OuDiaSecond (Copyright (C) 2017-2026 diagram_mania)
// and OuDia (Copyright (C) 2006-2017 take-okm)

/**
 * 運番割付の再帰エンジン(原典 junctionOperationElement、CDedOperationConnecter.cpp:6467-8003)。
 * M7c PR-C。
 *
 * 列車の作業要素ツリー(iLevel パス)を DFS で辿り、各作業種別に応じて運番を割り付ける。
 * 増結(Connect)は Main→Sub 到着で merge、解結(Release)は split して 2 方向、次列車接続(Junction)は
 * SearchRessyaElement で次列車へ hop。運番は別 Map(OperationNumberMap)に格納する(union 非改変)。
 *
 * 循環運用の停止は原典忠実(明示 visited なし)。SearchRessyaElement の一方向性 + 起点跨ぎ 1 周制限に
 * 依存する。無限再帰しないことは合成フィクスチャで実測する(出たら ADR で visited 導入を検討)。
 */

import type { AfterOperation, BeforeOperation, Dia } from '@oudia-web/format';
import { searchRessyaElement } from '../operationLight/occupancy.js';
import type { Houkou, OpRef } from '../operationLight/types.js';
import { opRefKey } from '../operationLight/types.js';
import {
  emptySlots,
  isEmptyOrBlank,
  mergeOperationNumber,
  reverseForRoute,
  setOperationNumberAssigned,
  setOperationNumberBefore,
  setOperationNumberMain,
  setOperationNumberSub,
  trimSuffixOperationNumber,
} from './operationNumber.js';
import type {
  ConnectWaitItem,
  FullState,
  OperationNumberMap,
  OperationNumberSlots,
  RessyaOperationTree,
  TreeNode,
} from './types.js';

/** 割付の可変コンテキスト(運番 Map + WaitList + オプション)。 */
export interface AssignContext {
  readonly dia: Dia;
  readonly state: FullState;
  readonly numbers: OperationNumberMap;
  readonly waitList: ConnectWaitItem[];
  readonly operationCrossKitenJikoku: boolean;
  readonly operationNumberReverse: boolean;
  /** 再帰の暴走ガード(実測用。原典にはない安全弁。閾値超過で打ち切り)。 */
  readonly guard: { count: number; readonly limit: number };
}

/** OpRef が指す union 作業を辿る(iLevel パス。before/after 両対応)。 */
export function resolveOperation(
  dia: Dia,
  ref: OpRef,
): BeforeOperation | AfterOperation | undefined {
  const ressya = dia.ressyaCont[ref.houkou][ref.ressyaIndex];
  const slot = ressya?.ekiJikokuCont[ref.ekiOrder];
  if (slot === undefined) return undefined;
  // iLevel[0] はトップ Cont index。以降は connect/release の子。
  let beforeCont: readonly BeforeOperation[] = slot.beforeOperationCont;
  let afterCont: readonly AfterOperation[] = slot.afterOperationCont;
  let inBefore = ref.opKind === 'before';
  for (let d = 0; d < ref.iLevel.length; d++) {
    const idx = ref.iLevel[d] ?? 0;
    const cont = inBefore ? beforeCont : afterCont;
    const op = cont[idx];
    if (op === undefined) return undefined;
    if (d === ref.iLevel.length - 1) return op;
    // 子へ潜る: connect の子は前作業列、release の子は後作業列。
    if (op.kind === 'connect') {
      beforeCont = op.formationBeforeOperationCont;
      inBefore = true;
    } else if (op.kind === 'release') {
      afterCont = op.formationAfterOperationCont;
      inBefore = false;
    } else {
      return undefined;
    }
  }
  return undefined;
}

/** ツリーから treeLevel 完全一致のノードを線形探索する(原典 :6480 の iLevel 一致)。 */
function findByLevel(
  tree: RessyaOperationTree,
  treeLevel: readonly number[],
): TreeNode | undefined {
  for (const node of tree.nodes) {
    if (
      node.treeLevel.length === treeLevel.length &&
      node.treeLevel.every((v, i) => v === treeLevel[i])
    ) {
      return node;
    }
  }
  return undefined;
}

/** 運番 Map からスロットを取得(なければ空を作る)。 */
function slotsOf(ctx: AssignContext, ref: OpRef, original: string[] = []): OperationNumberSlots {
  const key = opRefKey(ref);
  let s = ctx.numbers.get(key);
  if (s === undefined) {
    s = emptySlots(original);
    ctx.numbers.set(key, s);
  }
  return s;
}

/** その作業列車のツリーを引く。 */
function treeOf(
  ctx: AssignContext,
  houkou: Houkou,
  ressyaIndex: number,
): RessyaOperationTree | undefined {
  return ctx.state.trees[houkou]?.[ressyaIndex];
}

/**
 * 運番割付の再帰(原典 junctionOperationElement、cpp:6467-8003)。
 * @param tree             現在辿っている列車の作業ツリー
 * @param iLevelSearch     探索する iLevel パス
 * @param operationNumber  親から渡された運番 vector
 */
export function runJunctionRecursion(
  ctx: AssignContext,
  tree: RessyaOperationTree,
  iLevelSearch: number[],
  operationNumber: string[],
): void {
  // 暴走ガード(実測用。原典依存の停止が効かない循環運用の安全弁)。
  ctx.guard.count += 1;
  if (ctx.guard.count > ctx.guard.limit) return;

  const found = findByLevel(tree, iLevelSearch);
  if (found === undefined) {
    // 未発見: 親(treeLevel.pop_back)が Connect なら Sub を供給して return(原典 :6495)。
    const parentLevel = iLevelSearch.slice(0, -1);
    if (parentLevel.length === 0) return;
    const parent = findByLevel(tree, parentLevel);
    if (parent === undefined) return;
    const parentOp = resolveOperation(ctx.dia, parent.el.op);
    if (parentOp?.kind === 'connect') {
      const ps = slotsOf(ctx, parent.el.op);
      setOperationNumberSub(ps, operationNumber, true);
    }
    return;
  }

  const ref = found.el.op;
  const op = resolveOperation(ctx.dia, ref);
  if (op === undefined) return;
  const slots = slotsOf(ctx, ref, operationNumber);

  switch (op.kind) {
    case 'connect': {
      setOperationNumberMain(slots, operationNumber);
      if (slots.subAssigned) {
        // Connect の m_bBoolData1 = connectToFront(反転結合の向き)。
        mergeOperationNumber(slots, op.connectToFront);
        const iLevelNext = [...iLevelSearch];
        iLevelNext[iLevelNext.length - 1] = (iLevelNext[iLevelNext.length - 1] ?? 0) + 1;
        runJunctionRecursion(ctx, tree, iLevelNext, slots.n1);
        trimSuffixOperationNumber(slots);
      } else {
        // Sub 未着 → WaitList へ退避(PR-D の収束で回収)。
        ctx.waitList.push({
          ref,
          ressyaProperty: { houkou: ref.houkou, ressyaIndex: ref.ressyaIndex, jikoku: null },
          contElements: tree.nodes.map((n) => n.el),
          iLevelSearch: [...iLevelSearch],
          strOperationNumber: [...operationNumber],
        });
      }
      break;
    }
    case 'release': {
      const pos = op.releasePosition;
      setOperationNumberBefore(slots, operationNumber, pos, op.releaseCount);
      // 主編成(n2)で next へ。
      const iLevelNext = [...iLevelSearch];
      iLevelNext[iLevelNext.length - 1] = (iLevelNext[iLevelNext.length - 1] ?? 0) + 1;
      runJunctionRecursion(ctx, tree, iLevelNext, slots.n2);
      // 解結編成(n3)で子レベルへ。
      const iLevelSub = [...iLevelSearch, 0];
      runJunctionRecursion(ctx, tree, iLevelSub, slots.n3);
      trimSuffixOperationNumber(slots);
      break;
    }
    case 'numberChange': {
      // 空配列 = 反転(edit-model と同じ規約)。
      const reverse = op.operationNumbers.length === 0;
      if (reverse) {
        setOperationNumberAssigned(slots, operationNumber, true);
        const iLevelNext = [...iLevelSearch];
        iLevelNext[iLevelNext.length - 1] = (iLevelNext[iLevelNext.length - 1] ?? 0) + 1;
        // getOperationNumber(NumberChange&&reverse) = #3。
        runJunctionRecursion(ctx, tree, iLevelNext, slots.n3);
      } else {
        // 非 reverse: 運番を切替、再帰しない(別 seed で再開)。
        setOperationNumberAssigned(slots, op.operationNumbers, false);
      }
      break;
    }
    default:
      // in / out / outer / junction / shunt。
      handleTerminalOrJunction(ctx, ref, op, operationNumber, slots);
      break;
  }
}

/** In/Out/Outer/Junction/Shunt 分岐(終端 or 次列車 hop)。 */
function handleTerminalOrJunction(
  ctx: AssignContext,
  ref: OpRef,
  op: BeforeOperation | AfterOperation,
  operationNumber: string[],
  slots: OperationNumberSlots,
): void {
  // 終端の運番を確定(#1、Before Junction のみ #2 だが後述の junction 側で扱う)。
  slots.n1 = [...operationNumber];

  if (op.kind === 'junction' && ref.opKind === 'after') {
    // 次列車接続: 占有から次列車を探し hop する。
    const seed = ctx.state.junctionSeeds.find(
      (js) => js.seed.afterOp !== null && opRefKey(js.seed.afterOp) === opRefKey(ref),
    );
    if (seed === undefined) return;
    const list = ctx.state.occupancy[seed.ekiIndexOfExist]?.[seed.trackIndex];
    if (list === undefined) return;
    const result = searchRessyaElement(list, ref, ctx.operationCrossKitenJikoku);
    const nextBefore = result?.next.beforeOp ?? null;
    if (result === null || nextBefore === null) return;

    // 折返し反転(方向差 && size>1)。
    const sameHoukou = ref.houkou === result.next.ressyahoukou;
    let temp = reverseForRoute(operationNumber, ctx.operationNumberReverse, sameHoukou);

    const nextSlots = slotsOf(ctx, nextBefore);
    // 空/空白のみなら次列車の Temp(#1)で置換。
    if (isEmptyOrBlank(temp) && !isEmptyOrBlank(nextSlots.n1)) temp = [...nextSlots.n1];

    // 次列車 Before Junction の setOperationNumber は #2(原典 :7979)。
    nextSlots.n2 = [...temp];

    // 次列車ツリーへ hop。次列車の前列車接続ノードを treeLevel で探し、その back()++ から辿る。
    const nextTree = treeOf(ctx, result.next.ressyahoukou, result.next.ressyaIndex);
    if (nextTree === undefined) return;
    const nextNode = nextTree.nodes.find((n) => opRefKey(n.el.op) === opRefKey(nextBefore));
    if (nextNode === undefined) return;
    const iLevelNext = [...nextNode.treeLevel];
    iLevelNext[iLevelNext.length - 1] = (iLevelNext[iLevelNext.length - 1] ?? 0) + 1;
    runJunctionRecursion(ctx, nextTree, iLevelNext, temp);
  }
  // in / out / outer / shunt は終端(運番確定のみ、hop しない)。
  // InOutLinkCode 連携 hop は PR-E(入出区連携)で扱う。
}
