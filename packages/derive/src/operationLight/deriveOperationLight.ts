// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 up-tri
//
// Based on OuDiaSecond (Copyright (C) 2017-2026 diagram_mania)
// and OuDia (Copyright (C) 2006-2017 take-okm)

/**
 * Light 運用探索の本体(原典 CentDedRosen::OperationConnect の iEnableOperation==1 経路 =
 * CDedOperationConnecter::operationConnectLight、cpp:586)。M7b Light。
 *
 * 各列車の有効始発スロットの前作業列 / 有効終着スロットの後作業列を抽出・展開し、接続点
 * Junction を占有リストへ登録する。占有リストが揃ったら junctionSeeds(次列車接続)を
 * SearchRessyaElement で解決する(Step2 = PR3)。運番割付・出入区連携は行わない(Full=M7c)。
 *
 * PR2 の段階では占有リスト構築 + junctionSeed 収集まで(junctionResult は空・チェーンは未構築)。
 */

import { getValidSihatsuEki, getValidSyuuchakuEki } from '@oudia-web/domain';
import type { Dia, Eki, Jikoku, Ressya } from '@oudia-web/format';
import {
  type ExpandContext,
  searchAfterOperationElementLight,
  searchBeforeOperationElementLight,
} from './extract.js';
import { buildEkiOrderTable, insertRessyaElement } from './occupancy.js';
import type { Houkou, OperationLightResult, RessyaElement } from './types.js';

/** 占有リスト + 次列車接続の種(PR2 の中間成果。PR3 が junction 解決に使う)。 */
export interface OccupancyBuild {
  /** occupancy[ekiIndex][trackIndex] = 起点循環ソート済み RessyaElement 列。 */
  readonly occupancy: RessyaElement[][][];
  /** 次列車接続の種(後作業末尾 Junction)。 */
  readonly junctionSeeds: {
    readonly seed: RessyaElement;
    readonly ekiIndexOfExist: number;
    readonly trackIndex: number;
  }[];
}

export interface DeriveOperationLightOptions {
  readonly operationCrossKitenJikoku: boolean;
  readonly disableHiddenSyubetsu: boolean;
  readonly kitenJikoku: Jikoku;
}

/**
 * 占有リストを構築し junctionSeed を収集する(原典 operationConnectLight の Step1 相当)。
 * 各列車について:
 * - 有効始発スロットの前作業列を searchBeforeOperationElementLight で展開(先頭 Junction を占有登録)
 * - 有効終着スロットの後作業列を searchAfterOperationElementLight で展開(末尾 Junction を占有登録 + seed)
 */
export function buildOccupancy(
  dia: Dia,
  ekiCont: readonly Eki[],
  opts: DeriveOperationLightOptions,
): OccupancyBuild {
  const table = buildEkiOrderTable(ekiCont);
  // occupancy[ekiIndex][trackIndex] を空で用意。番線数は駅ごとに異なる。
  const occupancy: RessyaElement[][][] = ekiCont.map((eki) =>
    eki.ekiTrack2Cont.map(() => [] as RessyaElement[]),
  );
  const junctionSeeds: OccupancyBuild['junctionSeeds'] = [];

  for (const houkouNum of [0, 1] as const) {
    const houkou: Houkou = houkouNum;
    const list = dia.ressyaCont[houkou];
    list.forEach((ressya, ressyaIndex) => {
      if (ressya.isCanceled || ressya.isNull) return;
      const sihatsu = getValidSihatsuEki(ressya);
      const syuuchaku = getValidSyuuchakuEki(ressya);
      if (sihatsu < 0 || syuuchaku < 0 || sihatsu >= syuuchaku) return;

      // 有効始発の前作業列(前列車接続 = 受け側)。
      registerBefore(ressya, ressyaIndex, houkou, sihatsu, table, occupancy, opts);
      // 有効終着の後作業列(次列車接続 = 種)。
      registerAfter(ressya, ressyaIndex, houkou, syuuchaku, table, occupancy, junctionSeeds, opts);
    });
  }

  return { occupancy, junctionSeeds };
}

function slotTrackIndex(ressya: Ressya, ekiOrder: number): number {
  return ressya.ekiJikokuCont[ekiOrder]?.ressyaTrackIndex ?? 0;
}

function registerBefore(
  ressya: Ressya,
  ressyaIndex: number,
  houkou: Houkou,
  ekiOrder: number,
  table: number[][],
  occupancy: RessyaElement[][][],
  opts: DeriveOperationLightOptions,
): void {
  const slot = ressya.ekiJikokuCont[ekiOrder];
  if (slot === undefined || slot.beforeOperationCont.length === 0) return;
  const ekiIndexOfExist = table[ekiOrder]?.[houkou] ?? ekiOrder;
  const ctx: ExpandContext = { houkou, ressyaIndex, ekiOrder, ekiIndexOfExist };
  const trackConnect = slotTrackIndex(ressya, ekiOrder);
  const r = searchBeforeOperationElementLight(
    slot.beforeOperationCont,
    slot.hatsuJikoku,
    [0],
    trackConnect,
    ctx,
  );
  for (const ins of r.existInserts) {
    const trackList = occupancy[ins.ekiIndexOfExist]?.[ins.trackIndex];
    if (trackList !== undefined) insertRessyaElement(trackList, ins.el, opts.kitenJikoku);
  }
}

function registerAfter(
  ressya: Ressya,
  ressyaIndex: number,
  houkou: Houkou,
  ekiOrder: number,
  table: number[][],
  occupancy: RessyaElement[][][],
  junctionSeeds: OccupancyBuild['junctionSeeds'],
  opts: DeriveOperationLightOptions,
): void {
  const slot = ressya.ekiJikokuCont[ekiOrder];
  if (slot === undefined || slot.afterOperationCont.length === 0) return;
  const ekiIndexOfExist = table[ekiOrder]?.[houkou] ?? ekiOrder;
  const ctx: ExpandContext = { houkou, ressyaIndex, ekiOrder, ekiIndexOfExist };
  const trackRelease = slotTrackIndex(ressya, ekiOrder);
  const r = searchAfterOperationElementLight(
    slot.afterOperationCont,
    slot.chakuJikoku,
    [0],
    trackRelease,
    ctx,
  );
  for (const ins of r.existInserts) {
    const trackList = occupancy[ins.ekiIndexOfExist]?.[ins.trackIndex];
    if (trackList !== undefined) insertRessyaElement(trackList, ins.el, opts.kitenJikoku);
  }
  for (const seed of r.junctionSeeds) {
    // seed が登録された占有 index/track を控える(PR3 の SearchRessyaElement 用)。
    junctionSeeds.push({ seed, ekiIndexOfExist, trackIndex: seedTrack(r, seed) });
  }
}

/** seed に対応する existInsert の trackIndex を引く。 */
function seedTrack(
  r: { existInserts: { el: RessyaElement; trackIndex: number }[] },
  seed: RessyaElement,
): number {
  const hit = r.existInserts.find((ins) => ins.el === seed);
  return hit?.trackIndex ?? 0;
}

/**
 * Light 運用探索(公開 API)。PR2 では占有リスト構築 + seed 収集まで。
 * junction 解決(Step2 = PR3)と表示チェーン(Step3 = PR4)は後続で埋める。
 */
export function deriveOperationLight(
  dia: Dia,
  ekiCont: readonly Eki[],
  opts: DeriveOperationLightOptions,
): OperationLightResult {
  // PR2: 占有構築のみ(結果は PR3 で junctionResult を埋める)。
  buildOccupancy(dia, ekiCont, opts);
  return {
    junctionResult: new Map(),
    customizeRessyaIndexChains: { kudari: [], nobori: [] },
  };
}
