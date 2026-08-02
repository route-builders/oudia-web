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

import type { AfterOperation, BeforeOperation, Dia, Jikoku, Ressya } from '@oudia-web/format';
import type { MoveList } from '../operationLight/chains.js';
import { addMove, mergeChains } from '../operationLight/chains.js';
import { classify } from '../operationLight/deriveOperationLight.js';
import { searchRessyaElement } from '../operationLight/occupancy.js';
import type {
  BeforeAfterType,
  CustomizeChainColumn,
  Houkou,
  JunctionResolution,
  OpRef,
} from '../operationLight/types.js';
import { opRefKey } from '../operationLight/types.js';

export { resolveOperation } from './operationRef.js';

import type { OuterInsertList } from './customizeInserts.js';
import {
  addOuterInsert,
  createOuterConnectColumn,
  createOuterReleaseColumn,
  isConnectValid,
  isReleaseValid,
} from './customizeInserts.js';
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
import { resolveOperation } from './operationRef.js';
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
  /** 次列車接続の表示解決(原典 setJunctionSucceed / JunctionJikoku ほか、:7528-7960)。 */
  readonly junctionResult: Map<string, JunctionResolution>;
  /** 表示チェーンと並べ替え move-list(実処理は completeCustomizeJikokuhyouContent 相当で適用)。 */
  readonly chains: { kudari: CustomizeChainColumn[]; nobori: CustomizeChainColumn[] };
  readonly connectMoves: { kudari: MoveList; nobori: MoveList };
  readonly releaseMoves: { kudari: MoveList; nobori: MoveList };
  /**
   * 路線外始発/終着だけの疑似列の差し込み待ち
   * (原典 m_contOuterConnectInsertList / m_contOuterReleaseInsertList。☆1〜☆4)。
   */
  readonly outerConnectInserts: OuterInsertList;
  readonly outerReleaseInserts: OuterInsertList;
  /** 再帰の暴走ガード(実測用。原典にはない安全弁。閾値超過で打ち切り)。 */
  readonly guard: { count: number; readonly limit: number };
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
      // 入出区連携コードが成立していれば出区側へ運番を引き継ぐ(原典 :6858-7035)。
      hopByInOutLink(ctx, ressyaProperty, afterOp.inOutLinkCode, ref, temp);
      return;
    }
    if (afterOp.kind === 'outer') {
      // 路線外終着(原典 :7060-7087)。
      const temp = [...operationNumber];
      addTable(ctx, ressyaProperty, temp, node.el.ekiOrder, afterOp, ref, 'outer');
      slots.n1 = temp;
      // ☆3: 主編成から解結された編成なら、列車の右側に路線外終着相当 + ↴ の疑似列を足す
      // (原典 :7088-7148)。★判定は**探索用 iLevel**(iLevelSearch)で行う。
      const tree = treeOf(ctx, ressyaProperty.houkou, ressyaProperty.ressyaIndex);
      if (tree !== undefined && isReleaseValid(ctx.dia, tree, iLevelSearch)) {
        pushOuterReleaseInsert(ctx, ressyaProperty, node, afterOp, temp);
      }
      // 入出区連携コード(原典 :7191-7385)。In と同じ処理。
      hopByInOutLink(ctx, ressyaProperty, afterOp.inOutLinkCode, ref, temp);
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
 * 入出区連携コードによる出区側への運番引継ぎ(原典 In :6858-7035 / 路線外終着 :7191-7385)。
 * iStatus==2(1:1 ペア成立)のときだけ働き、相手の出区・路線外始発から探索を続ける。
 */
function hopByInOutLink(
  ctx: AssignContext,
  ressyaProperty: RessyaPropertyRef,
  code: string,
  afterRef: OpRef,
  numbers: string[],
): void {
  if (code === '') return;
  const link = ctx.state.inOutLinks.get(code);
  if (link === undefined || link.status !== 2) return;
  const nextRef = link.beforeOperation;
  const nextProp = link.outRessyaProperties[0];
  if (nextRef === null || nextProp === undefined) return;

  // 一覧表示用に引継ぎ運番を控える(原典 :6868 / :7201)。
  link.operationNumbers = [...numbers];

  const nextTree = treeOf(ctx, nextProp.houkou, nextProp.ressyaIndex);
  if (nextTree === undefined) return;
  const nextNode = nextTree.nodes.find((n) => opRefKey(n.el.op) === opRefKey(nextRef));
  if (nextNode === undefined) return;

  // 折返し反転(方向差 && size>1。原典 :6886-6891 / :7219-7224)。
  const sameHoukou = ressyaProperty.houkou === nextProp.houkou;
  let carried = reverseForRoute(numbers, ctx.operationNumberReverse, sameHoukou);

  const nextSlots = slotsOf(ctx, nextRef);
  // 空/空白のみなら出区側の元運番で置換(原典 :6896-6900 / :7229-7233)。
  if (isEmptyOrBlank(carried) && !isEmptyOrBlank(nextSlots.n1)) carried = [...nextSlots.n1];

  // setOperationNumberAssignedByLinkCode = #2(原典 :6903 / :7236)。
  nextSlots.n2 = [...carried];

  // ☆2 / ☆4: 引継ぎ先が路線外始発の増結編成なら、疑似列を左へ差し込む
  // (原典 :6905-6975 / :7238-7305)。★引き継いだ運番(置換後)を使う。
  if (nextOpIsOuter(ctx, nextRef) && isConnectValid(ctx.dia, nextTree, nextNode.treeLevel)) {
    pushOuterConnectInsert(ctx, nextProp.houkou, nextProp.ressyaIndex, nextNode, nextRef, carried);
  }

  // 次エントリを開始する。検索キーに入区/路線外終着を渡して運用表の並びを定める(原典 :7020)。
  const nextOp = resolveOperation(ctx.dia, nextRef) as BeforeOperation | undefined;
  insertOperationTableContentToBuffer(
    ctx.opTable,
    nextProp,
    carried,
    nextNode.el.ekiOrder,
    nextOp ?? null,
    afterRef,
    'outIn',
  );

  runJunctionRecursion(ctx, nextProp, nextTree, nextLevel(nextNode.treeLevel), carried);
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

  // 表示解決 + 表示チェーンの並べ替え登録(原典 :7528-7960。Light の resolveJunctions と同型)。
  registerJunctionDisplay(ctx, ref, node, result, beforeAfterType, sameHoukou);
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

/**
 * 次列車接続の表示解決を記録し、表示チェーンの並べ替えを登録する(原典 :7528-7960)。
 * Light の resolveJunctions(:1546-2003)と同じ判定を Full の再帰内で行う。
 */
function registerJunctionDisplay(
  ctx: AssignContext,
  ref: OpRef,
  node: TreeNode,
  result: {
    next: { beforeOp: OpRef | null; ressyahoukou: Houkou; ressyaIndex: number };
    terminalJikoku: Jikoku;
  },
  beforeAfterType: BeforeAfterTypeFull,
  sameHoukou: boolean,
): void {
  const nextTrain = result.next.beforeOp;
  if (nextTrain === null) return;
  ctx.junctionResult.set(opRefKey(ref), {
    junctionSucceed: true,
    beforeAfterType: toLightType(beforeAfterType),
    nextTrain,
    junctionJikoku: result.terminalJikoku,
    // 方向不一致で符号反転(原典 :1662-1666 / :7590)。
    prevRessyahoukou: sameHoukou ? ref.houkou : -ref.houkou,
    ressyajouhouOmit: beforeAfterType === 'propertySame',
  });

  // 編成タイプ: 探索パスのトップレベル(length===1)が主編成(原典 :7598/:7625/:7677)。
  const prevType = node.treeLevel.length === 1 ? 0 : 1;
  const nextNode = ctx.state.trees[result.next.ressyahoukou]?.[result.next.ressyaIndex]?.nodes.find(
    (n) => opRefKey(n.el.op) === opRefKey(nextTrain),
  );
  const nextType = (nextNode?.treeLevel.length ?? 1) === 1 ? 0 : 1;
  const currEkiOrder = ref.ekiOrder;
  const nextEkiOrder = nextTrain.ekiOrder;
  if (
    beforeAfterType === 'unrelated' ||
    !sameHoukou ||
    (prevType === 1 && nextType === 1) ||
    currEkiOrder > nextEkiOrder
  ) {
    return;
  }
  const chain = ref.houkou === 0 ? ctx.chains.kudari : ctx.chains.nobori;
  const rel = ref.houkou === 0 ? ctx.releaseMoves.kudari : ctx.releaseMoves.nobori;
  const con = ref.houkou === 0 ? ctx.connectMoves.kudari : ctx.connectMoves.nobori;
  if (prevType === 1) {
    addMove(rel, currEkiOrder, [ref.ressyaIndex, nextTrain.ressyaIndex]);
  } else if (nextType === 1) {
    addMove(con, nextEkiOrder, [nextTrain.ressyaIndex, ref.ressyaIndex]);
  } else {
    mergeChains(chain, ref.ressyaIndex, nextTrain.ressyaIndex);
  }
}

/** Full の 7 値を Light 表示用の 4 値へ落とす(出入区・路線外・運番変更は別列車扱い)。 */
function toLightType(t: BeforeAfterTypeFull): BeforeAfterType {
  return t === 'classChange' || t === 'propertyChange' || t === 'propertySame' ? t : 'unrelated';
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

// ---- ☆1〜☆4: 路線外始発 / 終着だけの疑似列の生成(原典 :5136-5200 / :6905-6975 /
// :7088-7148 / :7238-7305)。差し込みは completeCustomizeJikokuhyouContent 相当 ----

/** その OpRef が路線外始発(前作業 outer)か。 */
function nextOpIsOuter(ctx: AssignContext, ref: OpRef): boolean {
  return resolveOperation(ctx.dia, ref)?.kind === 'outer' && ref.opKind === 'before';
}

/** 路線外始発の増結疑似列を差し込み待ちへ積む。 */
function pushOuterConnectInsert(
  ctx: AssignContext,
  houkou: Houkou,
  ressyaIndex: number,
  node: TreeNode,
  ref: OpRef,
  operationNumbers: readonly string[],
): void {
  if (ref.opKind !== 'before') return;
  const op = resolveOperation(ctx.dia, ref) as BeforeOperation | undefined;
  if (op === undefined || op.kind !== 'outer') return;
  const ressya = ctx.dia.ressyaCont[houkou][ressyaIndex];
  if (ressya === undefined) return;
  addOuterInsert(ctx.outerConnectInserts, houkou, node.el.ekiOrder, {
    ressyaIndex,
    column: createOuterConnectColumn(
      ressya,
      node.el.ekiOrder,
      op,
      ressya.ekiJikokuCont[node.el.ekiOrder],
      operationNumbers,
    ),
  });
}

/** 路線外終着の解結疑似列を差し込み待ちへ積む(☆3)。 */
function pushOuterReleaseInsert(
  ctx: AssignContext,
  ressyaProperty: RessyaPropertyRef,
  node: TreeNode,
  op: AfterOperation & { kind: 'outer' },
  operationNumbers: readonly string[],
): void {
  const ressya = ctx.dia.ressyaCont[ressyaProperty.houkou][ressyaProperty.ressyaIndex];
  if (ressya === undefined) return;
  addOuterInsert(ctx.outerReleaseInserts, ressyaProperty.houkou, node.el.ekiOrder, {
    ressyaIndex: ressyaProperty.ressyaIndex,
    column: createOuterReleaseColumn(
      ressya,
      node.el.ekiOrder,
      op,
      ressya.ekiJikokuCont[node.el.ekiOrder],
      operationNumbers,
    ),
  });
}
