// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 up-tri
//
// Based on OuDiaSecond (Copyright (C) 2017-2026 diagram_mania)
// and OuDia (Copyright (C) 2006-2017 take-okm)

/**
 * 運番割付の再帰エンジン(原典 junctionOperationElement、CDedOperationConnecter.cpp:6467-8003)。
 * M7c PR-C + M7c-2 PR-1(運用表エントリ生成の配線)。
 *
 * 列車の作業要素ツリー(iLevel パス)を DFS で辿り、各作業種別に応じて運番を割り付ける。
 * 増結(Connect)は Main→Sub 到着で merge、解結(Release)は split して 2 方向、次列車接続(Junction)は
 * SearchRessyaElement で次列車へ hop。運番は別 Map(OperationNumberMap)に格納する(union 非改変)。
 *
 * 終端作業(入区 / 路線外終着 / 次列車接続 / 運番変更)では addOperationTableContent で運用表
 * エントリを確定し、次列車の前列車接続では insertOperationTableContentToBuffer で次エントリを
 * 開始する(operationTable.ts)。
 *
 * 循環運用の停止は原典忠実(明示 visited なし)。SearchRessyaElement の一方向性 + 起点跨ぎ 1 周制限に
 * 依存する。無限再帰しないことは合成フィクスチャで実測する(出たら ADR で visited 導入を検討)。
 */

import type { AfterOperation, BeforeOperation, Dia, Ressya } from '@oudia-web/format';
import { classify } from '../operationLight/deriveOperationLight.js';
import { searchRessyaElement } from '../operationLight/occupancy.js';
import type { BeforeAfterType, Houkou, OpRef } from '../operationLight/types.js';
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
import type { OperationTableContext } from './operationTable.js';
import { addOperationTableContent, insertOperationTableContentToBuffer } from './operationTable.js';
import type {
  BeforeAfterTypeFull,
  ConnectWaitItem,
  FullState,
  OperationNumberMap,
  OperationNumberSlots,
  RessyaOperationTree,
  RessyaPropertyRef,
  TreeNode,
} from './types.js';

/** 割付の可変コンテキスト(運番 Map + WaitList + 運用表 + オプション)。 */
export interface AssignContext {
  readonly dia: Dia;
  readonly state: FullState;
  readonly numbers: OperationNumberMap;
  readonly waitList: ConnectWaitItem[];
  /** 運用表バッファ + 出力 Map(原典 m_contOperationTableContentBuffer / Dia の運用表)。 */
  readonly opTable: OperationTableContext;
  readonly operationCrossKitenJikoku: boolean;
  readonly operationNumberReverse: boolean;
  /** 種別 index → 隠し種別か(隠し跨ぎで接続種別を unrelated へ降格。原典 :7503-7515)。 */
  readonly hidden: readonly boolean[];
  readonly hiddenExist: boolean;
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

/** 列車エンティティを引く。 */
function ressyaOf(ctx: AssignContext, ref: RessyaPropertyRef): Ressya | undefined {
  return ctx.dia.ressyaCont[ref.houkou][ref.ressyaIndex];
}

/**
 * 運番割付の再帰(原典 junctionOperationElement、cpp:6467-8003)。
 * @param ressyaProperty   現在辿っている列車のプロパティ(方向 + index + 起点時刻)
 * @param tree             現在辿っている列車の作業ツリー
 * @param iLevelSearch     探索する iLevel パス
 * @param operationNumber  親から渡された運番 vector(`;n` 接尾辞付きのことがある)
 */
export function runJunctionRecursion(
  ctx: AssignContext,
  ressyaProperty: RessyaPropertyRef,
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
        const iLevelNext = nextLevel(iLevelSearch);
        runJunctionRecursion(ctx, ressyaProperty, tree, iLevelNext, slots.n1);
        trimSuffixOperationNumber(slots);
      } else {
        // Sub 未着 → WaitList へ退避(収束ループで回収)。
        ctx.waitList.push({
          ref,
          ressyaProperty,
          contElements: tree.nodes.map((n) => n.el),
          iLevelSearch: [...iLevelSearch],
          strOperationNumber: [...operationNumber],
        });
      }
      break;
    }
    case 'release': {
      setOperationNumberBefore(slots, operationNumber, op.releasePosition, op.releaseCount);
      // 主編成(n2)で next へ。
      runJunctionRecursion(ctx, ressyaProperty, tree, nextLevel(iLevelSearch), slots.n2);
      // 解結編成(n3)で子レベルへ。
      runJunctionRecursion(ctx, ressyaProperty, tree, [...iLevelSearch, 0], slots.n3);
      trimSuffixOperationNumber(slots);
      break;
    }
    case 'numberChange': {
      // 空配列 = 反転(edit-model と同じ規約)。
      const reverse = op.operationNumbers.length === 0;
      if (reverse) {
        // 反転: #3 に反転運番を作り、そのまま次作業へ(原典 :6606-6623 / :6759-6773)。
        setOperationNumberAssigned(slots, operationNumber, true);
        runJunctionRecursion(ctx, ressyaProperty, tree, nextLevel(iLevelSearch), slots.n3);
      } else {
        // 非反転: この作業を終点として運用表に書き、鎖を切る(原典 :6624-6641 / :6774-6791)。
        // 続きは STEP3a の運番変更 seed から別の鎖として再開する。
        const temp = [...operationNumber];
        addTable(ctx, ressyaProperty, temp, found.el.ekiOrder, null, null, 'numberChange');
        setOperationNumberAssigned(slots, temp, false);
      }
      break;
    }
    default:
      // in / out / outer / junction / shunt。
      handleTerminalOrJunction(
        ctx,
        ressyaProperty,
        found,
        op,
        operationNumber,
        slots,
        iLevelSearch,
      );
      break;
  }
}

/** iLevel の末尾を +1 した新配列(原典 iLevelNext.back()++)。 */
function nextLevel(iLevel: readonly number[]): number[] {
  const out = [...iLevel];
  out[out.length - 1] = (out[out.length - 1] ?? 0) + 1;
  return out;
}

/** addOperationTableContent の薄いラッパ(列車解決 + 未登録列車の無視)。 */
function addTable(
  ctx: AssignContext,
  ressyaProperty: RessyaPropertyRef,
  operationNumbers: string[],
  syuuchakuEkiOrder: number,
  afterOp: AfterOperation | null,
  afterRef: OpRef | null,
  afterType: BeforeAfterTypeFull,
): void {
  const ressya = ressyaOf(ctx, ressyaProperty);
  if (ressya === undefined) return;
  addOperationTableContent(
    ctx.opTable,
    ressya,
    ressyaProperty,
    operationNumbers,
    syuuchakuEkiOrder,
    afterOp,
    afterRef,
    afterType,
  );
}

/** In/Out/Outer/Junction/Shunt 分岐(終端 or 次列車 hop)。 */
function handleTerminalOrJunction(
  ctx: AssignContext,
  ressyaProperty: RessyaPropertyRef,
  node: TreeNode,
  op: BeforeOperation | AfterOperation,
  operationNumber: string[],
  slots: OperationNumberSlots,
  iLevelSearch: number[],
): void {
  const ref = node.el.op;

  if (ref.opKind === 'after') {
    const afterOp = op as AfterOperation;
    if (afterOp.kind === 'in') {
      // 入区(原典 :6824-6857)。運用表を閉じ、接尾辞を落とした運番を作業に確定する。
      const temp = [...operationNumber];
      addTable(ctx, ressyaProperty, temp, node.el.ekiOrder, afterOp, ref, 'outIn');
      slots.n1 = temp;
      // 入出区連携コードによる出区側への引継ぎは M7c-2 PR-2(入出区連携)で扱う。
      return;
    }
    if (afterOp.kind === 'outer') {
      // 路線外終着(原典 :7060-7087)。
      const temp = [...operationNumber];
      addTable(ctx, ressyaProperty, temp, node.el.ekiOrder, afterOp, ref, 'outer');
      slots.n1 = temp;
      return;
    }
    if (afterOp.kind === 'junction') {
      hopToNextTrain(ctx, ressyaProperty, node, afterOp, operationNumber, iLevelSearch);
      return;
    }
  }

  // out / outer(前作業)/ 前列車接続(前作業)/ 入換は運番確定のみ(原典 :6674-6676 で
  // Before Junction の処理は前列車 After Junction 側へ移管済み)。
  slots.n1 = [...operationNumber];
}

/**
 * 次列車接続(後作業)の処理(原典 :7390-8001)。
 * SearchRessyaElement で次列車を探し、運用表を閉じてから次列車の前列車接続へ hop する。
 */
function hopToNextTrain(
  ctx: AssignContext,
  ressyaProperty: RessyaPropertyRef,
  node: TreeNode,
  op: AfterOperation & { kind: 'junction' },
  operationNumber: string[],
  iLevelSearch: number[],
): void {
  const ref = node.el.op;
  const temp = [...operationNumber];

  // 占有位置は要素自身が持つ(原典 :7463-7466 の iEkiIndexofContExist / iRessyaTrackIndex)。
  // Full では増解結相手編成の次列車接続は m_contJunctionList に入らないため、seed 一覧は引けない。
  const list = ctx.state.occupancy[node.el.ekiIndexOfExist]?.[node.el.ressyaTrackIndex];
  const result =
    list === undefined ? null : searchRessyaElement(list, ref, ctx.operationCrossKitenJikoku);
  const nextBefore = result?.next.beforeOp ?? null;

  if (result === null || nextBefore === null) {
    // 次列車なし → 接続種別は常に Unrelated で運用表を閉じる(原典 :7468-7482)。
    addTable(ctx, ressyaProperty, temp, node.el.ekiOrder, op, ref, 'unrelated');
    return;
  }

  // 次列車あり → 次列車接続タイプが接続種別になる(原典 :7489-7515)。
  const beforeAfterType = classifyWithHidden(
    ctx,
    classify(op.junctionType),
    ressyaProperty,
    result.next.ressyahoukou,
    result.next.ressyaIndex,
  );
  addTable(ctx, ressyaProperty, temp, node.el.ekiOrder, op, ref, beforeAfterType);

  // 折返し反転(方向差 && size>1)。
  const sameHoukou = ref.houkou === result.next.ressyahoukou;
  let carried = reverseForRoute(temp, ctx.operationNumberReverse, sameHoukou);

  const nextSlots = slotsOf(ctx, nextBefore);
  // 空/空白のみなら次列車の仮運番(#1)で置換(原典 :7966-7975)。
  if (isEmptyOrBlank(carried) && !isEmptyOrBlank(nextSlots.n1)) carried = [...nextSlots.n1];

  // 次列車 Before Junction の setOperationNumber は #2(原典 :7979)。
  nextSlots.n2 = [...carried];

  const nextTree = treeOf(ctx, result.next.ressyahoukou, result.next.ressyaIndex);
  if (nextTree === undefined) return;
  const nextNode = nextTree.nodes.find((n) => opRefKey(n.el.op) === opRefKey(nextBefore));
  if (nextNode === undefined) return;

  const nextProperty: RessyaPropertyRef = {
    houkou: result.next.ressyahoukou,
    ressyaIndex: result.next.ressyaIndex,
    jikoku: result.next.jikoku,
  };
  // 次エントリを開始する。検索キーに自分(次列車接続)を渡すことで運用表の並びが定まる(原典 :7986)。
  insertOperationTableContentToBuffer(
    ctx.opTable,
    nextProperty,
    carried,
    nextNode.el.ekiOrder,
    null,
    ref,
    beforeAfterType,
  );

  void iLevelSearch;
  runJunctionRecursion(ctx, nextProperty, nextTree, nextLevel(nextNode.treeLevel), carried);
}

/** 隠し種別跨ぎで unrelated へ降格する(原典 :7503-7515)。 */
function classifyWithHidden(
  ctx: AssignContext,
  base: BeforeAfterType,
  curr: RessyaPropertyRef,
  nextHoukou: Houkou,
  nextRessyaIndex: number,
): BeforeAfterTypeFull {
  if (!ctx.hiddenExist || base === 'unrelated') return base;
  const a = ctx.dia.ressyaCont[curr.houkou][curr.ressyaIndex];
  const b = ctx.dia.ressyaCont[nextHoukou][nextRessyaIndex];
  if (a === undefined || b === undefined) return base;
  const ha = ctx.hidden[a.syubetsuIndex] ?? false;
  const hb = ctx.hidden[b.syubetsuIndex] ?? false;
  return ha === hb ? base : 'unrelated';
}
