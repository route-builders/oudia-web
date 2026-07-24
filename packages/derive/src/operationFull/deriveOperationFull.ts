// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 up-tri
//
// Based on OuDiaSecond (Copyright (C) 2017-2026 diagram_mania)
// and OuDia (Copyright (C) 2006-2017 take-okm)

/**
 * Full 運用探索の本体(原典 CentDedRosen::OperationConnect の iEnableOperation==2 経路 =
 * CDedOperationConnecter::operationConnect、cpp:3901-5637)。M7c。
 *
 * Light と占有エンジン(occupancy.ts)・チェーン(chains.ts)・作業抽出(extract.ts)を共有し、
 * Full 専用に運番割付を追加する。PR-B の段階では SETUP + STEP1(占有構築 + 列車ごとの作業要素
 * ツリー保存 + 3 seed 収集)まで。運番割付(junctionOperationElement)は PR-C 以降。
 *
 * ★出力(割付済み運番・運用表・入出区連携)はすべて oud2 非永続 = 黄金テスト非該当。
 * #1(ユーザー永続運番)は seed 入力として消費するだけで書き戻さない。
 */

import { getValidSihatsuEki, getValidSyuuchakuEki } from '@oudia-web/domain';
import type { BeforeOperation, Dia, Eki, Jikoku, Ressya } from '@oudia-web/format';
import { buildInitialChains } from '../operationLight/deriveOperationLight.js';
import {
  type ExpandContext,
  type ExpandResult,
  searchAfterOperationElementLight,
  searchBeforeOperationElementLight,
} from '../operationLight/extract.js';
import { buildEkiOrderTable, insertRessyaElement } from '../operationLight/occupancy.js';
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
import type {
  ConnectWaitItem,
  DeriveOperationFullOptions,
  FullState,
  OperationFullResult,
  OperationNumberMap,
  RessyaOperationTree,
  TreeNode,
} from './types.js';

function slotTrackIndex(ressya: Ressya, ekiOrder: number): number {
  return ressya.ekiJikokuCont[ekiOrder]?.ressyaTrackIndex ?? 0;
}

/**
 * SETUP + STEP1(原典 :3901-5058)。占有格子を構築し、各列車の作業要素ツリーと 3 seed を収集する。
 * 占有登録ロジックは Light(buildOccupancy)と同一で、結果の占有格子は Light とバイト一致する。
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
  const outOuterSeeds: OperationElementLight[] = [];
  const beforeJunctionSeeds: OperationElementLight[] = [];
  const numberChangeSeeds: OperationElementLight[] = [];

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

      const before = expandBefore(ressya, ressyaIndex, houkou, sihatsu, table);
      const after = expandAfter(ressya, ressyaIndex, houkou, syuuchaku, table);

      // 占有登録(Light と同一)。
      registerOccupancy(occupancy, before, opts.kitenJikoku);
      registerOccupancy(occupancy, after, opts.kitenJikoku);
      for (const seed of after.junctionSeeds) {
        junctionSeeds.push({
          seed,
          ekiIndexOfExist: table[syuuchaku]?.[houkou] ?? syuuchaku,
          trackIndex: seedTrack(after, seed),
        });
      }

      // NumberChange seed を作業列(union)から直接収集(reverse でないもののみ、原典 :4376/6144)。
      collectNumberChangeSeeds(
        ressya,
        ressyaIndex,
        houkou,
        sihatsu,
        syuuchaku,
        opts,
        numberChangeSeeds,
      );

      // treeLevel を列車全体で連番化(before のトップ桁数だけ after をオフセット)。
      const beforeTop = countTopLevel(before.elements);
      const nodes: TreeNode[] = [
        ...before.elements.map((el) => ({ el, treeLevel: [...el.iLevel] })),
        ...after.elements.map((el) => ({ el, treeLevel: offsetTop(el.iLevel, beforeTop) })),
      ];
      const outSeeds: TreeNode[] = [
        ...before.outOuterSeeds.map((el) => ({ el, treeLevel: [...el.iLevel] })),
        ...after.outOuterSeeds.map((el) => ({ el, treeLevel: offsetTop(el.iLevel, beforeTop) })),
      ];
      const bjSeeds: TreeNode[] = [
        ...before.beforeJunctionSeeds.map((el) => ({ el, treeLevel: [...el.iLevel] })),
        ...after.beforeJunctionSeeds.map((el) => ({
          el,
          treeLevel: offsetTop(el.iLevel, beforeTop),
        })),
      ];
      const tree: RessyaOperationTree = {
        houkou,
        ressyaIndex,
        nodes,
        outOuterSeeds: outSeeds,
        beforeJunctionSeeds: bjSeeds,
      };
      treeRow[ressyaIndex] = tree;
      outOuterSeeds.push(...outSeeds.map((n) => n.el));
      beforeJunctionSeeds.push(...bjSeeds.map((n) => n.el));
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

function expandBefore(
  ressya: Ressya,
  ressyaIndex: number,
  houkou: Houkou,
  ekiOrder: number,
  table: number[][],
): ExpandResult {
  const slot = ressya.ekiJikokuCont[ekiOrder];
  const ekiIndexOfExist = table[ekiOrder]?.[houkou] ?? ekiOrder;
  const ctx: ExpandContext = { houkou, ressyaIndex, ekiOrder, ekiIndexOfExist };
  if (slot === undefined || slot.beforeOperationCont.length === 0) {
    return emptyExpand();
  }
  return searchBeforeOperationElementLight(
    slot.beforeOperationCont,
    slot.hatsuJikoku,
    [],
    slotTrackIndex(ressya, ekiOrder),
    ctx,
  );
}

function expandAfter(
  ressya: Ressya,
  ressyaIndex: number,
  houkou: Houkou,
  ekiOrder: number,
  table: number[][],
): ExpandResult {
  const slot = ressya.ekiJikokuCont[ekiOrder];
  const ekiIndexOfExist = table[ekiOrder]?.[houkou] ?? ekiOrder;
  const ctx: ExpandContext = { houkou, ressyaIndex, ekiOrder, ekiIndexOfExist };
  if (slot === undefined || slot.afterOperationCont.length === 0) {
    return emptyExpand();
  }
  return searchAfterOperationElementLight(
    slot.afterOperationCont,
    slot.chakuJikoku,
    [],
    slotTrackIndex(ressya, ekiOrder),
    ctx,
  );
}

function emptyExpand(): ExpandResult {
  return {
    elements: [],
    existInserts: [],
    junctionSeeds: [],
    outOuterSeeds: [],
    beforeJunctionSeeds: [],
    numberChangeSeeds: [],
  };
}

function registerOccupancy(
  occupancy: RessyaElement[][][],
  r: ExpandResult,
  kitenJikoku: Jikoku,
): void {
  for (const ins of r.existInserts) {
    const trackList = occupancy[ins.ekiIndexOfExist]?.[ins.trackIndex];
    if (trackList !== undefined) insertRessyaElement(trackList, ins.el, kitenJikoku);
  }
}

function seedTrack(r: ExpandResult, seed: RessyaElement): number {
  const hit = r.existInserts.find((ins) => ins.el === seed);
  return hit?.trackIndex ?? 0;
}

/**
 * 運用番号変更 seed を union から直接収集する(reverse でないもののみ、原典 :4376/6144)。
 * extract は NumberChange 要素を出さないため、有効区間の中間駅スロットを走査して拾う。
 */
function collectNumberChangeSeeds(
  ressya: Ressya,
  ressyaIndex: number,
  houkou: Houkou,
  sihatsu: number,
  syuuchaku: number,
  _opts: DeriveOperationFullOptions,
  out: OperationElementLight[],
): void {
  for (let ekiOrder = sihatsu; ekiOrder <= syuuchaku; ekiOrder++) {
    const slot = ressya.ekiJikokuCont[ekiOrder];
    if (slot === undefined) continue;
    slot.beforeOperationCont.forEach((op, idx) => {
      if (op.kind === 'numberChange' && op.operationNumbers.length > 0) {
        out.push(makeElement(houkou, ressyaIndex, ekiOrder, 'before', [idx]));
      }
    });
    slot.afterOperationCont.forEach((op, idx) => {
      if (op.kind === 'numberChange' && op.operationNumbers.length > 0) {
        out.push(makeElement(houkou, ressyaIndex, ekiOrder, 'after', [idx]));
      }
    });
  }
}

/** トップレベル(iLevel.length===1)要素の最大 index+1(= トップ桁の個数)。 */
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

function makeElement(
  houkou: Houkou,
  ressyaIndex: number,
  ekiOrder: number,
  opKind: 'before' | 'after',
  iLevel: number[],
): OperationElementLight {
  return {
    op: { houkou, ressyaIndex, ekiOrder, opKind, iLevel },
    iLevel,
    ekiOrder,
    ekiIndexOfExist: -1,
    ressyaTrackIndex: -1,
  };
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

/**
 * STEP2(原典 :5060-5283)。出区/路線外始発 seed を起点に運番を割り付ける。
 * 各 seed の元運番(#1)を種として runJunctionRecursion を back()++ で起動する。
 */
function assignFromOutOuter(ctx: AssignContext): void {
  for (const seed of ctx.state.outOuterSeeds) {
    const ref = seed.op;
    const tree = ctx.state.trees[ref.houkou]?.[ref.ressyaIndex];
    if (tree === undefined) continue;
    const original = originalNumberOf(ctx.dia, ref);
    // seed 自身(出区/路線外始発)の運番を #1 に確定する(原典 setOperationNumber、cpp:5257 付近)。
    setSeedNumber(ctx.numbers, ref, original);
    // 次作業へ(iLevel の back()++)。
    const iLevelNext = [...ref.iLevel];
    iLevelNext[iLevelNext.length - 1] = (iLevelNext[iLevelNext.length - 1] ?? 0) + 1;
    runJunctionRecursion(ctx, tree, iLevelNext, original);
  }
}

/** seed の運番を #1 に記録する(スロットがなければ作る)。 */
function setSeedNumber(numbers: OperationNumberMap, ref: OpRef, original: string[]): void {
  const key = opRefKey(ref);
  const s = numbers.get(key) ?? { n1: [], n2: [], n3: [], subAssigned: false };
  s.n1 = [...original];
  numbers.set(key, s);
}

/** 運番 Map → assignedNumbers(opRefKey → 割付運番 #1/#2 のうち非空優先)。 */
function collectAssigned(numbers: OperationNumberMap): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const [key, slots] of numbers) {
    // 割付結果は #2(Main/Assigned)優先、なければ #1。
    const assigned = slots.n2.length > 0 ? slots.n2 : slots.n1;
    out.set(key, assigned);
  }
  return out;
}

/**
 * Full 運用探索(公開 API)。M7c PR-C の段階では SETUP+STEP1 + STEP2(出区/路線外 seed の運番割付)まで。
 * STEP3a/3b(NumberChange/孤立 junction)と WaitList retry は PR-D、運用表 Map 整形は PR-E。
 * 出力はすべて非永続(oud2 に書き戻さない)= 黄金テスト非該当。
 */
export function deriveOperationFull(
  dia: Dia,
  ekiCont: readonly Eki[],
  opts: DeriveOperationFullOptions,
): OperationFullResult {
  const state = buildFullState(dia, ekiCont, opts);
  const numbers: OperationNumberMap = new Map();
  const waitList: ConnectWaitItem[] = [];
  const ctx: AssignContext = {
    dia,
    state,
    numbers,
    waitList,
    operationCrossKitenJikoku: opts.operationCrossKitenJikoku,
    operationNumberReverse: opts.operationNumberReverse,
    guard: { count: 0, limit: 100000 },
  };

  assignFromOutOuter(ctx);
  // STEP3a/3b・WaitList retry は PR-D。運用表 Map・入出区連携は PR-E。

  return {
    junctionResult: new Map(),
    customizeRessyaIndexChains: state.chains,
    operationTable: new Map(),
    assignedNumbers: collectAssigned(numbers),
    inOutLinkCodes: new Map(),
  };
}
