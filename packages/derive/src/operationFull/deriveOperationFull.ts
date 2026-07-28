// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 up-tri
//
// Based on OuDiaSecond (Copyright (C) 2017-2026 diagram_mania)
// and OuDia (Copyright (C) 2006-2017 take-okm)

/**
 * Full 運用探索の本体(原典 CentDedRosen::OperationConnect の iEnableOperation==2 経路 =
 * CDedOperationConnecter::operationConnect、cpp:3901-5637)。M7c + M7c-2。
 *
 * Light と占有エンジン(occupancy.ts)・チェーン(chains.ts)・作業抽出(extract.ts)を共有し、
 * Full 専用に運番割付(operationNumberAssign.ts)と運用表(operationTable.ts)を足す。
 *
 * STEP1 は列車 1 本ぶんの作業ツリーを **有効始発駅 → 中間駅 → 有効終着駅** の順に組み立て、
 * トップ桁を列車全体で連番にする(原典 iLevelAdd。TreeNode.treeLevel がこれに相当)。
 *
 * ★出力(割付済み運番・運用表・入出区連携)はすべて oud2 非永続 = 黄金テスト非該当。
 * #1(ユーザー永続運番)は seed 入力として消費するだけで書き戻さない。
 */

import { getValidSihatsuEki, getValidSyuuchakuEki } from '@oudia-web/domain';
import type { BeforeOperation, Dia, Eki, Jikoku, Ressya } from '@oudia-web/format';
import { buildInitialChains, computeHidden } from '../operationLight/deriveOperationLight.js';
import type { ExpandContext, ExpandResult } from '../operationLight/extract.js';
import {
  expandStationAfter,
  expandStationBefore,
  ROOT_LEVEL,
  searchAfterOperationElementLight,
  searchBeforeOperationElementLight,
} from '../operationLight/extract.js';
import {
  buildEkiOrderTable,
  insertRessyaElement,
  searchRessyaElementRev,
} from '../operationLight/occupancy.js';
import type {
  Houkou,
  OperationElementLight,
  OpRef,
  RessyaElement,
} from '../operationLight/types.js';
import { opRefKey } from '../operationLight/types.js';
import {
  type AssignContext,
  resolveOperation,
  runJunctionRecursion,
} from './operationNumberAssign.js';
import {
  createOperationTableContext,
  insertOperationTableContentToBuffer,
} from './operationTable.js';
import type {
  ConnectWaitItem,
  DeriveOperationFullOptions,
  FullState,
  OperationFullResult,
  OperationNumberMap,
  RessyaOperationTree,
  RessyaPropertyRef,
  TreeNode,
} from './types.js';

function slotTrackIndex(ressya: Ressya, ekiOrder: number): number {
  return ressya.ekiJikokuCont[ekiOrder]?.ressyaTrackIndex ?? 0;
}

/** 1 駅ぶんの展開結果とその探索桁数(トップ桁の消費量)。 */
interface StagePart {
  readonly result: ExpandResult;
  /** この段が消費したトップ桁数(次段のオフセット)。 */
  readonly topCount: number;
}

/**
 * SETUP + STEP1(原典 :3901-5058)。占有格子を構築し、各列車の作業要素ツリーと seed を収集する。
 * 占有登録ロジックは Light(buildOccupancy)と同一で、運用番号変更を含まない路線では
 * 結果の占有格子は Light とバイト一致する。
 */
export function buildFullState(
  dia: Dia,
  ekiCont: readonly Eki[],
  opts: DeriveOperationFullOptions,
): FullState {
  const table = buildEkiOrderTable(ekiCont);
  const occupancy: RessyaElement[][][] = ekiCont.map((eki) =>
    eki.ekiTrack2Cont.map(() => [] as RessyaElement[]),
  );
  const trees: (RessyaOperationTree | undefined)[][] = [[], []];
  const junctionSeeds: FullState['junctionSeeds'] = [];
  const outOuterSeeds: FullState['outOuterSeeds'] = [];
  const beforeJunctionSeeds: FullState['beforeJunctionSeeds'] = [];
  const numberChangeSeeds: FullState['numberChangeSeeds'] = [];

  for (const houkouNum of [0, 1] as const) {
    const houkou: Houkou = houkouNum;
    const list = dia.ressyaCont[houkou];
    const treeRow = new Array<RessyaOperationTree | undefined>(list.length).fill(undefined);
    trees[houkou] = treeRow;
    list.forEach((ressya, ressyaIndex) => {
      if (ressya.isCanceled || ressya.isNull) return;
      const sihatsu = getValidSihatsuEki(ressya);
      const syuuchaku = getValidSyuuchakuEki(ressya);
      if (sihatsu < 0 || syuuchaku < 0 || sihatsu >= syuuchaku) return;

      const parts = buildTrainParts(ressya, ressyaIndex, houkou, sihatsu, syuuchaku, table);

      // 段を順に連結し、トップ桁を列車全体の連番へ寄せる(原典 iLevelAdd)。
      const nodes: TreeNode[] = [];
      const outSeeds: TreeNode[] = [];
      const bjSeeds: TreeNode[] = [];
      const ncSeeds: { node: TreeNode; jikoku: Jikoku }[] = [];
      let offset = 0;
      for (const part of parts) {
        const shift = offset;
        const toNode = (el: OperationElementLight): TreeNode => ({
          el,
          treeLevel: offsetTop(el.iLevel, shift),
        });
        nodes.push(...part.result.elements.map(toNode));
        outSeeds.push(...part.result.outOuterSeeds.map(toNode));
        bjSeeds.push(...part.result.beforeJunctionSeeds.map(toNode));
        ncSeeds.push(
          ...part.result.numberChangeSeeds.map((s) => ({ node: toNode(s.el), jikoku: s.jikoku })),
        );
        // 占有登録(Light と同一)。
        for (const ins of part.result.existInserts) {
          const trackList = occupancy[ins.ekiIndexOfExist]?.[ins.trackIndex];
          if (trackList !== undefined) insertRessyaElement(trackList, ins.el, opts.kitenJikoku);
        }
        for (const seed of part.result.junctionSeeds) {
          const hit = part.result.existInserts.find((ins) => ins.el === seed);
          junctionSeeds.push({
            seed,
            ekiIndexOfExist: hit?.ekiIndexOfExist ?? 0,
            trackIndex: hit?.trackIndex ?? 0,
          });
        }
        offset += part.topCount;
      }

      const tree: RessyaOperationTree = {
        houkou,
        ressyaIndex,
        nodes,
        outOuterSeeds: outSeeds,
        beforeJunctionSeeds: bjSeeds,
      };
      treeRow[ressyaIndex] = tree;
      outOuterSeeds.push(...outSeeds);
      beforeJunctionSeeds.push(...bjSeeds);
      numberChangeSeeds.push(...ncSeeds);
    });
  }

  const chains = {
    kudari: buildInitialChains(dia, 0),
    nobori: buildInitialChains(dia, 1),
  };

  return {
    occupancy,
    trees,
    junctionSeeds,
    outOuterSeeds,
    beforeJunctionSeeds,
    numberChangeSeeds,
    chains,
  };
}

/**
 * 1 列車の作業ツリーを段(駅 × 前作業/後作業)に分けて展開する(原典 STEP1 :4114-4900)。
 * 順序 = 始発駅前作業 → 始発駅後作業 → 中間駅(前 → 後)× n → 終着駅前作業 → 終着駅後作業。
 */
function buildTrainParts(
  ressya: Ressya,
  ressyaIndex: number,
  houkou: Houkou,
  sihatsu: number,
  syuuchaku: number,
  table: number[][],
): StagePart[] {
  const parts: StagePart[] = [];
  const ctxOf = (ekiOrder: number, ncJikoku: Jikoku): ExpandContext => ({
    houkou,
    ressyaIndex,
    ekiOrder,
    ekiIndexOfExist: table[ekiOrder]?.[houkou] ?? ekiOrder,
    collectNumberChange: true,
    numberChangeJikoku: ncJikoku,
  });
  const push = (result: ExpandResult): void => {
    parts.push({ result, topCount: countTopLevel(result.elements) });
  };

  const sihatsuSlot = ressya.ekiJikokuCont[sihatsu];
  const syuuchakuSlot = ressya.ekiJikokuCont[syuuchaku];

  // 始発駅: 前作業列(先頭 = 出区/路線外始発/前列車接続)。運番変更 seed の時刻は当駅発時刻。
  if (sihatsuSlot !== undefined && sihatsuSlot.beforeOperationCont.length > 0) {
    push(
      searchBeforeOperationElementLight(
        sihatsuSlot.beforeOperationCont,
        sihatsuSlot.hatsuJikoku,
        ROOT_LEVEL,
        slotTrackIndex(ressya, sihatsu),
        ctxOf(sihatsu, sihatsuSlot.hatsuJikoku),
      ),
    );
  }
  // 始発駅: 後作業列(末尾の特別扱いなし。原典 :4390-4479)。
  if (sihatsuSlot !== undefined && sihatsuSlot.afterOperationCont.length > 0) {
    push(
      expandStationAfter(
        sihatsuSlot.afterOperationCont,
        ROOT_LEVEL,
        slotTrackIndex(ressya, sihatsu),
        ctxOf(sihatsu, sihatsuSlot.hatsuJikoku),
      ),
    );
  }

  // 中間駅(原典 :4487-4677)。前作業 → 後作業の順。
  for (let ekiOrder = sihatsu + 1; ekiOrder < syuuchaku; ekiOrder++) {
    const slot = ressya.ekiJikokuCont[ekiOrder];
    if (slot === undefined) continue;
    const track = slotTrackIndex(ressya, ekiOrder);
    if (slot.beforeOperationCont.length > 0) {
      push(
        expandStationBefore(
          slot.beforeOperationCont,
          ROOT_LEVEL,
          track,
          ctxOf(ekiOrder, slot.chakuJikoku),
        ),
      );
    }
    if (slot.afterOperationCont.length > 0) {
      push(
        expandStationAfter(
          slot.afterOperationCont,
          ROOT_LEVEL,
          track,
          ctxOf(ekiOrder, slot.hatsuJikoku),
        ),
      );
    }
  }

  // 終着駅: 前作業列(先頭の特別扱いなし。原典 :4701-4783)→ 後作業列(末尾 = 入区/路線外終着/次列車接続)。
  if (syuuchakuSlot !== undefined && syuuchakuSlot.beforeOperationCont.length > 0) {
    push(
      expandStationBefore(
        syuuchakuSlot.beforeOperationCont,
        ROOT_LEVEL,
        slotTrackIndex(ressya, syuuchaku),
        ctxOf(syuuchaku, syuuchakuSlot.chakuJikoku),
      ),
    );
  }
  if (syuuchakuSlot !== undefined && syuuchakuSlot.afterOperationCont.length > 0) {
    push(
      searchAfterOperationElementLight(
        syuuchakuSlot.afterOperationCont,
        syuuchakuSlot.chakuJikoku,
        ROOT_LEVEL,
        slotTrackIndex(ressya, syuuchaku),
        ctxOf(syuuchaku, syuuchakuSlot.chakuJikoku),
      ),
    );
  }

  return parts;
}

/** トップレベル(iLevel[0])の最大値 + 1(= トップ桁の消費数)。 */
function countTopLevel(elements: readonly OperationElementLight[]): number {
  let max = -1;
  for (const el of elements) {
    if (el.iLevel.length >= 1) max = Math.max(max, el.iLevel[0] ?? 0);
  }
  return max + 1;
}

/** iLevel のトップ桁を offset だけずらした新配列(下位桁はそのまま)。 */
function offsetTop(iLevel: readonly number[], offset: number): number[] {
  const out = [...iLevel];
  out[0] = (out[0] ?? 0) + offset;
  return out;
}

// ---- STEP2: 出区/路線外始発 seed からの運番割付(原典 :5060-5283)----

/** OpRef が指す前作業の元運番(#1 の種)を取り出す(出区/路線外始発は前作業のみ)。 */
function originalNumberOf(dia: Dia, ref: OpRef): string[] {
  if (ref.opKind !== 'before') return [''];
  const op = resolveOperation(dia, ref) as BeforeOperation | undefined;
  if (op === undefined) return [''];
  if (op.kind === 'out' || op.kind === 'outer') {
    return op.operationNumbers.length > 0 ? [...op.operationNumbers] : [''];
  }
  if (op.kind === 'junction') {
    return op.kariOperationNumbers.length > 0 ? [...op.kariOperationNumbers] : [''];
  }
  return [''];
}

/** 出区・路線外始発の運用表挿入時刻(原典 :4127/:4149)。 */
function seedJikokuOf(op: BeforeOperation | undefined): Jikoku {
  if (op === undefined) return null;
  if (op.kind === 'out') return op.outJikoku;
  if (op.kind === 'outer') return op.outerHatsuJikoku;
  if (op.kind === 'junction') return op.kitenJikoku;
  return null;
}

/**
 * STEP2(原典 :5060-5283)。出区/路線外始発 seed を起点に運番を割り付ける。
 * 各 seed の元運番(#1)を種として運用表エントリを開始し、runJunctionRecursion を back()++ で起動する。
 */
function assignFromOutOuter(ctx: AssignContext): void {
  for (const seed of ctx.state.outOuterSeeds) {
    const ref = seed.el.op;
    const tree = ctx.state.trees[ref.houkou]?.[ref.ressyaIndex];
    if (tree === undefined) continue;
    const op = resolveOperation(ctx.dia, ref) as BeforeOperation | undefined;
    const original = originalNumberOf(ctx.dia, ref);
    const property: RessyaPropertyRef = {
      houkou: ref.houkou,
      ressyaIndex: ref.ressyaIndex,
      jikoku: seedJikokuOf(op),
    };
    // seed 自身(出区/路線外始発)の運番を #1 に確定する(原典 setOperationNumber、cpp:5257 付近)。
    setSeedNumber(ctx.numbers, ref, original);
    // 運用表エントリの開始側を積む(空運番は内部で読み飛ばされる)。
    insertOperationTableContentToBuffer(
      ctx.opTable,
      property,
      original,
      seed.el.ekiOrder,
      op ?? null,
      null,
      op?.kind === 'outer' ? 'outer' : 'outIn',
    );
    // 次作業へ(iLevel の back()++)。
    runJunctionRecursion(ctx, property, tree, nextLevel(seed.treeLevel), original);
  }
}

/** iLevel の末尾を +1 した新配列(原典 iLevelNext.back()++)。 */
function nextLevel(iLevel: readonly number[]): number[] {
  const out = [...iLevel];
  out[out.length - 1] = (out[out.length - 1] ?? 0) + 1;
  return out;
}

/** seed の運番を #1 に記録する(スロットがなければ作る)。 */
function setSeedNumber(numbers: OperationNumberMap, ref: OpRef, original: string[]): void {
  const key = opRefKey(ref);
  const s = numbers.get(key) ?? { n1: [], n2: [], n3: [], subAssigned: false };
  s.n1 = [...original];
  numbers.set(key, s);
}

// ---- STEP3a: 運用番号変更 seed からの運番割付(原典 :5285-5387)----

/**
 * STEP3a(原典 :5285-5387)。運用番号変更(非反転)を起点に、新運番で運用表エントリを開始し
 * 次作業から探索を続ける。反転の運番変更は seed にならない(鎖の途中で処理される)。
 */
function assignFromNumberChange(ctx: AssignContext): void {
  for (const seed of ctx.state.numberChangeSeeds) {
    const ref = seed.node.el.op;
    const tree = ctx.state.trees[ref.houkou]?.[ref.ressyaIndex];
    if (tree === undefined) continue;
    const op = resolveOperation(ctx.dia, ref);
    if (op?.kind !== 'numberChange') continue;
    const original = op.operationNumbers.length > 0 ? [...op.operationNumbers] : [''];
    const property: RessyaPropertyRef = {
      houkou: ref.houkou,
      ressyaIndex: ref.ressyaIndex,
      jikoku: seed.jikoku,
    };
    // 運番変更作業自身の表示運番は永続 #1(新運番)。原典は getOperationNumber() が #1 を返すため
    // 明示の set はないが、TS は運番を別 Map で持つのでここで写す。
    setSeedNumber(ctx.numbers, ref, original);
    insertOperationTableContentToBuffer(
      ctx.opTable,
      property,
      original,
      seed.node.el.ekiOrder,
      null,
      null,
      'numberChange',
    );
    runJunctionRecursion(ctx, property, tree, nextLevel(seed.node.treeLevel), original);
  }
}

// ---- STEP3b: 孤立 junction(前が繋がらない前列車接続始発)への空白運番(原典 :5389-5478)----

/**
 * STEP3b(原典 :5389-5478)。前列車接続の始発で、前列車が存在しない(孤立)ものに空白運番を
 * 割り付けて鎖を開始する。searchRessyaElementRev で前列車の有無を判定する。
 */
function assignOrphanJunctions(ctx: AssignContext): void {
  for (const seed of ctx.state.beforeJunctionSeeds) {
    const ref = seed.el.op;
    const tree = ctx.state.trees[ref.houkou]?.[ref.ressyaIndex];
    if (tree === undefined) continue;
    // 既に運番が割り当たっていれば skip(hop で先に到達済み)。
    const existing = ctx.numbers.get(opRefKey(ref));
    if (existing !== undefined && (existing.n2.length > 0 || existing.n1.length > 0)) continue;
    // 占有から前列車の有無を判定。
    const list = ctx.state.occupancy[seed.el.ekiIndexOfExist]?.[seed.el.ressyaTrackIndex];
    if (list === undefined) continue;
    if (searchRessyaElementRev(list, ref, ctx.operationCrossKitenJikoku)) continue; // 前列車あり
    // 孤立 → 空白運番(元の仮運番があればそれ)で鎖を開始。
    const op = resolveOperation(ctx.dia, ref) as BeforeOperation | undefined;
    const original = originalNumberOf(ctx.dia, ref);
    const property: RessyaPropertyRef = {
      houkou: ref.houkou,
      ressyaIndex: ref.ressyaIndex,
      jikoku: seedJikokuOf(op),
    };
    setSeedNumber(ctx.numbers, ref, original);
    insertOperationTableContentToBuffer(
      ctx.opTable,
      property,
      original,
      seed.el.ekiOrder,
      null,
      null,
      'unrelated',
    );
    runJunctionRecursion(ctx, property, tree, nextLevel(seed.treeLevel), original);
  }
}

// ---- WaitList retry: 増結 Sub 未着の収束ループ(原典 :5479-5592)----

/**
 * WaitList retry(原典 :5479-5592)。増結の Sub が別 seed 経由で後着したものを回収する。
 * コピー → クリア → 各要素を再試行(処理中の再 push は次周回)。変化がなくなれば打ち切り。
 */
function resolveConnectWaitList(ctx: AssignContext): void {
  for (;;) {
    if (ctx.waitList.length === 0) break;
    const snapshot = ctx.waitList.slice();
    ctx.waitList.length = 0; // クリア(処理中の push は次周回へ)
    let changed = false;
    for (const item of snapshot) {
      const slots = ctx.numbers.get(opRefKey(item.ref));
      const tree = ctx.state.trees[item.ref.houkou]?.[item.ref.ressyaIndex];
      if (slots === undefined || tree === undefined) continue;
      if (slots.subAssigned) {
        // Sub が到着済み → 同じ作業から再試行(Connect 分岐が merge して先へ進む)。
        const node = findTreeNode(tree, item.ref);
        if (node === undefined) continue;
        runJunctionRecursion(
          ctx,
          item.ressyaProperty,
          tree,
          [...node.treeLevel],
          item.strOperationNumber,
        );
        changed = true;
      } else {
        // まだ未着 → 次周回へ持ち越し。
        ctx.waitList.push(item);
      }
    }
    if (!changed) break; // 変化なし = 残余打ち切り(解けない相互依存は捨てる)。
  }
}

/** ツリーから OpRef 一致のノードを引く。 */
function findTreeNode(tree: RessyaOperationTree, ref: OpRef): TreeNode | undefined {
  return tree.nodes.find((n) => opRefKey(n.el.op) === opRefKey(ref));
}

/**
 * 運番 Map → assignedNumbers(opRefKey → その作業の表示運番)。
 * 原典 getOperationNumber() のスロット選択に合わせる([[m7c-operation-number-statemachine]]):
 * 前列車接続(前作業)= #2、運用番号変更(反転)= #3、それ以外 = #1。
 */
function collectAssigned(
  dia: Dia,
  state: FullState,
  numbers: OperationNumberMap,
): Map<string, string[]> {
  // opRefKey → OpRef の逆引きを作業ツリーから作る(Map のキーは文字列のため)。
  const refByKey = new Map<string, OpRef>();
  for (const row of state.trees) {
    for (const tree of row) {
      if (tree === undefined) continue;
      for (const node of tree.nodes) refByKey.set(opRefKey(node.el.op), node.el.op);
    }
  }

  const out = new Map<string, string[]>();
  for (const [key, slots] of numbers) {
    const ref = refByKey.get(key);
    const op = ref === undefined ? undefined : resolveOperation(dia, ref);
    let assigned = slots.n1;
    if (ref?.opKind === 'before' && op?.kind === 'junction') {
      assigned = slots.n2.length > 0 ? slots.n2 : slots.n1;
    } else if (op?.kind === 'numberChange' && op.operationNumbers.length === 0) {
      assigned = slots.n3.length > 0 ? slots.n3 : slots.n1;
    } else if (assigned.length === 0) {
      assigned = slots.n2;
    }
    out.set(key, assigned);
  }
  return out;
}

/**
 * Full 運用探索(公開 API)。SETUP+STEP1(作業ツリー + 占有 + seed)+ STEP2(出区/路線外)+
 * STEP3a(運番変更)+ STEP3b(孤立 junction)+ WaitList retry(増結 Sub 収束)+ 運用表 Map。
 * 入出区連携一覧は M7c-2 PR-2。出力はすべて非永続(oud2 に書き戻さない)= 黄金テスト非該当。
 */
export function deriveOperationFull(
  dia: Dia,
  ekiCont: readonly Eki[],
  opts: DeriveOperationFullOptions,
): OperationFullResult {
  const state = buildFullState(dia, ekiCont, opts);
  const numbers: OperationNumberMap = new Map();
  const waitList: ConnectWaitItem[] = [];
  const { hidden, exist: hiddenExist } = computeHidden(
    opts.syubetsuCont,
    opts.disableHiddenSyubetsu,
  );
  const ctx: AssignContext = {
    dia,
    state,
    numbers,
    waitList,
    opTable: createOperationTableContext(
      [dia.ressyaCont[0].length, dia.ressyaCont[1].length],
      opts.kitenJikoku,
    ),
    operationCrossKitenJikoku: opts.operationCrossKitenJikoku,
    operationNumberReverse: opts.operationNumberReverse,
    hidden,
    hiddenExist,
    guard: { count: 0, limit: 100000 },
  };

  assignFromOutOuter(ctx); // STEP2
  assignFromNumberChange(ctx); // STEP3a
  assignOrphanJunctions(ctx); // STEP3b
  resolveConnectWaitList(ctx); // WaitList retry

  return {
    junctionResult: new Map(),
    customizeRessyaIndexChains: state.chains,
    operationTable: ctx.opTable.table,
    assignedNumbers: collectAssigned(dia, state, numbers),
    inOutLinkCodes: new Map(),
  };
}
