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
import type { Dia, Eki, Jikoku, Ressya } from '@oudia-web/format';
import { buildInitialChains } from '../operationLight/deriveOperationLight.js';
import {
  type ExpandContext,
  type ExpandResult,
  searchAfterOperationElementLight,
  searchBeforeOperationElementLight,
} from '../operationLight/extract.js';
import { buildEkiOrderTable, insertRessyaElement } from '../operationLight/occupancy.js';
import type {
  CustomizeChainColumn,
  Houkou,
  OperationElementLight,
  RessyaElement,
} from '../operationLight/types.js';

/** 1 列車ぶんの STEP1 結果(作業要素ツリー + 収集 seed)。 */
export interface RessyaOperationTree {
  readonly houkou: Houkou;
  readonly ressyaIndex: number;
  /** DFS 順の作業要素列(iLevel パスつき)。junctionOperationElement が iLevel で辿る。 */
  readonly elements: OperationElementLight[];
  readonly outOuterSeeds: OperationElementLight[];
  readonly beforeJunctionSeeds: OperationElementLight[];
  readonly numberChangeSeeds: OperationElementLight[];
}

/** Full 探索の中間状態(SETUP + STEP1 の成果。PR-C 以降が消費)。 */
export interface FullState {
  /** occupancy[ekiIndex][trackIndex] = 起点循環ソート済み RessyaElement 列(Light と同一)。 */
  readonly occupancy: RessyaElement[][][];
  /** 列車ツリー: trees[houkou][ressyaIndex]。無効列車は undefined。 */
  readonly trees: (RessyaOperationTree | undefined)[][];
  /** 次列車接続の種(後作業末尾 Junction。占有 index/track つき)。 */
  readonly junctionSeeds: {
    readonly seed: RessyaElement;
    readonly ekiIndexOfExist: number;
    readonly trackIndex: number;
  }[];
  /** 出区/路線外始発 seed(全列車横断)。STEP2 起点。 */
  readonly outOuterSeeds: OperationElementLight[];
  /** 前列車接続始発 seed。STEP3b 孤立検査対象。 */
  readonly beforeJunctionSeeds: OperationElementLight[];
  /** 運用番号変更 seed。STEP3a 起点。 */
  readonly numberChangeSeeds: OperationElementLight[];
  /** 表示チェーン(Light と共有)。 */
  readonly chains: { kudari: CustomizeChainColumn[]; nobori: CustomizeChainColumn[] };
}

export interface DeriveOperationFullOptions {
  readonly operationCrossKitenJikoku: boolean;
  readonly disableHiddenSyubetsu: boolean;
  readonly kitenJikoku: Jikoku;
  /** 路線全体の運用番号順反転(m_bOperationNumberReverse)。 */
  readonly operationNumberReverse: boolean;
}

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

      const elements = [...before.elements, ...after.elements];
      const tree: RessyaOperationTree = {
        houkou,
        ressyaIndex,
        elements,
        outOuterSeeds: [...before.outOuterSeeds, ...after.outOuterSeeds],
        beforeJunctionSeeds: [...before.beforeJunctionSeeds, ...after.beforeJunctionSeeds],
        numberChangeSeeds: [],
      };
      treeRow[ressyaIndex] = tree;
      outOuterSeeds.push(...tree.outOuterSeeds);
      beforeJunctionSeeds.push(...tree.beforeJunctionSeeds);
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
