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
 * Junction を占有リストへ登録する(Step1)。占有リストが揃ったら junctionSeeds(次列車接続)を
 * SearchRessyaElement で解決し(Step2)、表示チェーンを構築する(Step3)。運番割付・出入区連携・
 * completeCustomizeJikokuhyouContent の充填は行わない(Full=M7c / 充填は #11)。
 *
 * 出力(junctionResult / customizeRessyaIndexChains)はすべて oud2 非永続 = 黄金テスト非該当。
 */

import { getValidSihatsuEki, getValidSyuuchakuEki } from '@oudia-web/domain';
import type {
  AfterJunctionType,
  AfterOperation,
  Dia,
  Eki,
  Jikoku,
  Ressya,
  Ressyasyubetsu,
} from '@oudia-web/format';
import {
  addMove,
  applyConnectMoveList,
  applyReleaseMoveList,
  emptyMoveList,
  initChains,
  type MoveList,
  mergeChains,
  removeChainOf,
} from './chains.js';
import {
  type ExpandContext,
  searchAfterOperationElementLight,
  searchBeforeOperationElementLight,
} from './extract.js';
import { buildEkiOrderTable, insertRessyaElement, searchRessyaElement } from './occupancy.js';
import type {
  BeforeAfterType,
  CustomizeChainColumn,
  Houkou,
  JunctionResolution,
  OperationLightResult,
  OpRef,
  RessyaElement,
} from './types.js';
import { opRefKey } from './types.js';

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
  /** 種別コンテナ(隠し種別跨ぎの unrelated 降格に使う)。省略時は隠し種別なし扱い。 */
  readonly syubetsuCont?: readonly Ressyasyubetsu[];
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
    [],
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
    [],
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

/** junctionType(enum)→ beforeAfterType 恒等マップ(原典 :1580-1591)。 */
function classify(junctionType: AfterJunctionType): BeforeAfterType {
  return junctionType === 'classChange'
    ? 'classChange'
    : junctionType === 'propertyChange'
      ? 'propertyChange'
      : junctionType === 'propertySame'
        ? 'propertySame'
        : 'unrelated';
}

/** OpRef が指す作業(トップレベル or 入れ子)を union から辿って返す。 */
function resolveAfterOp(dia: Dia, ref: OpRef): AfterOperation | undefined {
  const ressya = dia.ressyaCont[ref.houkou][ref.ressyaIndex];
  const slot = ressya?.ekiJikokuCont[ref.ekiOrder];
  if (slot === undefined) return undefined;
  // iLevel パスで辿る(トップは [contIndex])。入れ子は connect/release の子。
  let afterCont: readonly AfterOperation[] = slot.afterOperationCont;
  let beforeIsAfter = true;
  for (let d = 0; d < ref.iLevel.length; d++) {
    const idx = ref.iLevel[d] ?? 0;
    if (d === ref.iLevel.length - 1) {
      return beforeIsAfter ? afterCont[idx] : undefined;
    }
    const parent = afterCont[idx];
    if (parent?.kind === 'release') {
      afterCont = parent.formationAfterOperationCont;
      beforeIsAfter = true;
    } else {
      return undefined; // connect の子は前作業列(next-junction は後作業なので通常来ない)
    }
  }
  return undefined;
}

/**
 * 種別ごとの隠しフラグを前計算する(原典 :662-678)。disableHiddenSyubetsu なら全 false。
 */
function computeHidden(
  syubetsuCont: readonly Ressyasyubetsu[] | undefined,
  disableHiddenSyubetsu: boolean,
): { hidden: boolean[]; exist: boolean } {
  if (disableHiddenSyubetsu || syubetsuCont === undefined) {
    return { hidden: [], exist: false };
  }
  const hidden = syubetsuCont.map((s) => s.hidden);
  return { hidden, exist: hidden.some((h) => h) };
}

/**
 * junction 解決(原典 operationConnectLight の Step2、cpp:1546-2003 の分類部)。
 * 各 seed(次列車接続)を SearchRessyaElement で解決し、junctionType で分類、
 * 隠し種別跨ぎで unrelated へ降格する。junctionResult Map を埋め、主編成×Unrelated の
 * 接続で表示チェーンを一本化併合する(原典 :1948-1991)。
 */
function resolveJunctions(
  dia: Dia,
  build: OccupancyBuild,
  chains: { kudari: CustomizeChainColumn[]; nobori: CustomizeChainColumn[] },
  ekiCount: number,
  opts: DeriveOperationLightOptions,
): Map<string, JunctionResolution> {
  const result = new Map<string, JunctionResolution>();
  const { hidden, exist: hiddenExist } = computeHidden(
    opts.syubetsuCont,
    opts.disableHiddenSyubetsu,
  );
  // move-list(増結/解結の並べ替え。junction ループ内で登録し、ループ後に適用)。
  const connectMoves = { kudari: emptyMoveList(), nobori: emptyMoveList() };
  const releaseMoves = { kudari: emptyMoveList(), nobori: emptyMoveList() };

  for (const { seed, ekiIndexOfExist, trackIndex } of build.junctionSeeds) {
    const afterRef = seed.afterOp;
    if (afterRef === null) continue;
    const list = build.occupancy[ekiIndexOfExist]?.[trackIndex];
    if (list === undefined) continue;

    const found = searchRessyaElement(list, afterRef, opts.operationCrossKitenJikoku);
    const nextTrain = found?.next.beforeOp ?? null;
    if (found === null || nextTrain === null) continue; // 次列車なし → 未成立

    const afterOp = resolveAfterOp(dia, afterRef);
    const junctionType = afterOp?.kind === 'junction' ? afterOp.junctionType : 'unrelated';
    let beforeAfterType = classify(junctionType);

    // 隠し種別跨ぎで unrelated 降格。
    if (hiddenExist && beforeAfterType !== 'unrelated') {
      const currSyubetsu =
        dia.ressyaCont[afterRef.houkou][afterRef.ressyaIndex]?.syubetsuIndex ?? 0;
      const nextSyubetsu =
        dia.ressyaCont[found.next.ressyahoukou][found.next.ressyaIndex]?.syubetsuIndex ?? 0;
      if ((hidden[currSyubetsu] ?? false) !== (hidden[nextSyubetsu] ?? false)) {
        beforeAfterType = 'unrelated';
      }
    }

    const sameHoukou = afterRef.houkou === found.next.ressyahoukou;
    result.set(opRefKey(afterRef), {
      junctionSucceed: true,
      beforeAfterType,
      nextTrain,
      junctionJikoku: found.terminalJikoku,
      // 方向不一致で符号反転(原典 :1662-1666。prevRessyahoukou の基準は 0/1 → +1/-1 で近似)。
      prevRessyahoukou: sameHoukou ? afterRef.houkou : -afterRef.houkou,
      ressyajouhouOmit: beforeAfterType === 'propertySame',
    });

    // チェーン並べ替え(原典 :1820-1998)。ガード: 非 Unrelated かつ同一方向かつ
    // 前後の編成タイプが「その他(2)」でなく、両方が解結/増結(1,1)でないこと。
    // 編成タイプ(原典 iPrevRessyaType/iNextRessyaType): iLevel.length===1 → 主編成(0)、
    // それ以外 → 解結/増結編成(1)に近似する(親作業の Connect/Release を辿る「その他(2)」の
    // 精密判定は簡略化。単純な増解結では 0/1 のみで正しく分岐する)。
    const prevType = afterRef.iLevel.length === 1 ? 0 : 1;
    const nextType = nextTrain.iLevel.length === 1 ? 0 : 1;
    const currEkiOrder = afterRef.ekiOrder;
    const nextEkiOrder = nextTrain.ekiOrder;
    if (
      beforeAfterType !== 'unrelated' &&
      sameHoukou &&
      !(prevType === 1 && nextType === 1) &&
      currEkiOrder <= nextEkiOrder
    ) {
      const chain = afterRef.houkou === 0 ? chains.kudari : chains.nobori;
      const rel = afterRef.houkou === 0 ? releaseMoves.kudari : releaseMoves.nobori;
      const con = afterRef.houkou === 0 ? connectMoves.kudari : connectMoves.nobori;
      if (prevType === 1) {
        // 解結: 分割元(curr)の駅Order へ [分割元, 分割列車] を登録。
        addMove(rel, currEkiOrder, [afterRef.ressyaIndex, nextTrain.ressyaIndex]);
      } else if (nextType === 1) {
        // 増結: 併合先(next)の駅Order へ [併合先, 併合列車] を登録。
        addMove(con, nextEkiOrder, [nextTrain.ressyaIndex, afterRef.ressyaIndex]);
      } else {
        // 両主編成 → 一本化併合。
        mergeChains(chain, afterRef.ressyaIndex, nextTrain.ressyaIndex);
      }
    }
  }

  // move-list 適用(原典 :2005-2118。増結=駅Order 降順 / 解結=昇順)。
  const applyMoves = (chain: CustomizeChainColumn[], con: MoveList, rel: MoveList): void => {
    applyConnectMoveList(chain, con, ekiCount);
    applyReleaseMoveList(chain, rel, ekiCount);
  };
  applyMoves(chains.kudari, connectMoves.kudari, releaseMoves.kudari);
  applyMoves(chains.nobori, connectMoves.nobori, releaseMoves.nobori);

  return result;
}

/** 各方向のチェーンを初期化し、除去対象(canceled/発着駅無効)の列を除く(原典 :635-762)。 */
function buildInitialChains(dia: Dia, houkou: Houkou): CustomizeChainColumn[] {
  const list = dia.ressyaCont[houkou];
  const chains = initChains(list.length);
  list.forEach((ressya, ressyaIndex) => {
    if (ressya.isNull) return; // null は触れない(継続)
    const sihatsu = getValidSihatsuEki(ressya);
    const syuuchaku = getValidSyuuchakuEki(ressya);
    if (ressya.isCanceled || sihatsu < 0 || syuuchaku < 0 || sihatsu >= syuuchaku) {
      removeChainOf(chains, ressyaIndex);
    }
  });
  return chains;
}

/**
 * Light 運用探索(公開 API)。占有構築 + junction 解決(Step2)+ 表示チェーン(Step3)。
 * チェーンの時刻等の充填(completeCustomizeJikokuhyouContent)は #11 描画側の責務。
 */
export function deriveOperationLight(
  dia: Dia,
  ekiCont: readonly Eki[],
  opts: DeriveOperationLightOptions,
): OperationLightResult {
  const build = buildOccupancy(dia, ekiCont, opts);
  const chains = {
    kudari: buildInitialChains(dia, 0),
    nobori: buildInitialChains(dia, 1),
  };
  const junctionResult = resolveJunctions(dia, build, chains, ekiCont.length, opts);
  return {
    junctionResult,
    customizeRessyaIndexChains: chains,
  };
}
