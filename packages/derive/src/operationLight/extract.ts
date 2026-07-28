// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 up-tri
//
// Based on OuDiaSecond (Copyright (C) 2017-2026 diagram_mania)
// and OuDia (Copyright (C) 2006-2017 take-okm)

/**
 * Light 運用探索の作業抽出 + 中間駅の増解結入れ子展開(原典
 * searchBeforeOperationElementLight / searchAfterOperationElementLight、cpp:5860 / 6260)。
 * M7b Light PR2。
 *
 * 各列車の前作業/後作業コンテナを平坦化して OperationElementLight 列にし、接続点 Junction
 * (前作業先頭=前列車接続 / 後作業末尾=次列車接続)だけを占有リストへ登録する。中間駅の
 * 増結(Connect)は前作業列を、解結(Release)は後作業列を子に持ち、再帰展開する。
 * 並び順: 増結=[...子展開, 親](子先・親後)、解結=[親, ...子展開](親先・子後)。
 *
 * 純関数化: 原典は m_contRessyaExist / m_contJunctionList を副作用で書くが、TS では
 * 「占有登録すべき RessyaElement 列(existInserts)」と「次列車接続の種(junctionSeeds)」を
 * 戻り値で返し、呼出側(deriveOperationLight)がイミュータブルに畳み込む。
 *
 * Light 省略(原典との差分): clearOperationNumber・出入区連携・運番割当・PatternDiagramPreview
 * 周期複製(m_iPatternDiagramPreviewCycleSecond>0)。
 */

import type { AfterOperation, BeforeOperation, Jikoku } from '@oudia-web/format';
import type { Houkou, OperationElementLight, OpRef, RessyaElement } from './types.js';

/** 展開結果。elements=簡略図要素、existInserts=占有登録すべき要素、junctionSeeds=次列車接続の種。 */
export interface ExpandResult {
  elements: OperationElementLight[];
  existInserts: { ekiIndexOfExist: number; trackIndex: number; el: RessyaElement }[];
  junctionSeeds: RessyaElement[];
}

/** 展開の共通コンテキスト(列車・駅・占有アクセスの固定情報)。 */
export interface ExpandContext {
  readonly houkou: Houkou;
  readonly ressyaIndex: number;
  readonly ekiOrder: number;
  readonly ekiIndexOfExist: number;
}

function emptyResult(): ExpandResult {
  return { elements: [], existInserts: [], junctionSeeds: [] };
}

function merge(into: ExpandResult, from: ExpandResult): void {
  into.elements.push(...from.elements);
  into.existInserts.push(...from.existInserts);
  into.junctionSeeds.push(...from.junctionSeeds);
}

/** OpRef を組む(iLevel パスつき)。 */
function makeRef(ctx: ExpandContext, opKind: 'before' | 'after', iLevel: number[]): OpRef {
  return {
    houkou: ctx.houkou,
    ressyaIndex: ctx.ressyaIndex,
    ekiOrder: ctx.ekiOrder,
    opKind,
    iLevel,
  };
}

/**
 * 前作業列を展開する(原典 searchBeforeOperationElementLight、cpp:5860-6045)。
 * @param cont          前作業列(増結の子 = 別編成の前作業列)
 * @param connectJikoku 親の増結時刻(先頭 Junction の起点時刻フォールバック)
 * @param iLevelParent  親の iLevel(トップは [contIndex])
 * @param trackConnect  親の増結が行われた番線 index(先頭 Junction の占有番線)
 * @param ctx           展開コンテキスト
 */
export function searchBeforeOperationElementLight(
  cont: readonly BeforeOperation[],
  connectJikoku: Jikoku,
  iLevelParent: readonly number[],
  trackConnect: number,
  ctx: ExpandContext,
): ExpandResult {
  const result = emptyResult();
  const first = cont[0];
  if (first === undefined) return result;

  if (first.kind === 'out' || first.kind === 'outer') {
    // 出区・路線外始発: 占有登録せず要素だけ集める。
    const iLevel = [...iLevelParent, 0];
    result.elements.push(makeRef2(ctx, 'before', iLevel));
  } else if (first.kind === 'junction') {
    // 前列車接続: 起点時刻を導出して占有登録(次列車探索の受け側。seed にはしない)。
    let originJikoku: Jikoku = connectJikoku;
    let trackIndex = trackConnect;
    // 後方の shunt/connect/release から起点時刻・番線を更新(原典 :5903-5925)。
    for (let idxb = cont.length - 1; idxb > 0; idxb--) {
      const op = cont[idxb];
      if (op === undefined) continue;
      if (op.kind === 'shunt') {
        if (trackIndex !== op.shuntTrackIndex) {
          originJikoku = op.shuntHatsuJikoku;
          trackIndex = op.shuntTrackIndex;
        }
      } else if (op.kind === 'connect') {
        originJikoku = op.connectJikoku;
      } else if (op.kind === 'release') {
        originJikoku = op.releaseJikoku;
      }
    }
    // 明示の起点時刻があれば優先(原典 :5926-5929)。
    if (first.kitenJikoku !== null) originJikoku = first.kitenJikoku;

    const iLevel = [...iLevelParent, 0];
    const ref = makeRef(ctx, 'before', iLevel);
    result.elements.push({
      op: ref,
      iLevel,
      ekiOrder: ctx.ekiOrder,
      ekiIndexOfExist: ctx.ekiIndexOfExist,
      ressyaTrackIndex: trackIndex,
    });
    const el: RessyaElement = {
      beforeOp: ref,
      afterOp: null,
      jikoku: originJikoku,
      ressyahoukou: ctx.houkou,
      ressyaIndex: ctx.ressyaIndex,
    };
    result.existInserts.push({ ekiIndexOfExist: ctx.ekiIndexOfExist, trackIndex, el });
  }

  // 中間の増解結(idxb=1..size-1、原典 :5975-5943)。
  let iLevelAdd = 1;
  for (let idxb = 1; idxb < cont.length; idxb++) {
    const op = cont[idxb];
    if (op === undefined) continue;
    if (op.kind === 'connect') {
      const iLevel = [...iLevelParent, iLevelAdd];
      const trackIndex = backwardShuntTrack(cont, idxb, trackConnect);
      const child = searchBeforeOperationElementLight(
        op.formationBeforeOperationCont,
        op.connectJikoku,
        iLevel,
        trackIndex,
        ctx,
      );
      // 増結: [...子展開, 親](子先・親後)。
      merge(result, child);
      result.elements.push(makeRef2(ctx, 'before', iLevel));
      iLevelAdd++;
    } else if (op.kind === 'release') {
      const iLevel = [...iLevelParent, iLevelAdd];
      const trackIndex = backwardShuntTrack(cont, idxb, trackConnect);
      const parentEl = makeRef2(ctx, 'before', iLevel);
      const child = searchAfterOperationElementLight(
        op.formationAfterOperationCont,
        op.releaseJikoku,
        iLevel,
        trackIndex,
        ctx,
      );
      // 解結: [親, ...子展開](親先・子後)。
      result.elements.push(parentEl);
      merge(result, child);
      iLevelAdd++;
    }
  }
  return result;
}

/**
 * 後作業列を展開する(原典 searchAfterOperationElementLight、cpp:6260-6345)。
 * 末尾 Junction(次列車接続)を占有登録し、junctionSeeds へも push する(前作業との非対称)。
 */
export function searchAfterOperationElementLight(
  cont: readonly AfterOperation[],
  releaseJikoku: Jikoku,
  iLevelParent: readonly number[],
  trackRelease: number,
  ctx: ExpandContext,
): ExpandResult {
  const result = emptyResult();
  const last = cont[cont.length - 1];

  // 中間の増解結(idxa=0..size-2、原典 :6279)。
  let iLevelAdd = 0;
  for (let idxa = 0; idxa < cont.length - 1; idxa++) {
    const op = cont[idxa];
    if (op === undefined) continue;
    if (op.kind === 'connect') {
      const iLevel = [...iLevelParent, iLevelAdd];
      const trackIndex = forwardShuntTrackAfter(cont, idxa, trackRelease);
      const child = searchBeforeOperationElementLight(
        op.formationBeforeOperationCont,
        op.connectJikoku,
        iLevel,
        trackIndex,
        ctx,
      );
      merge(result, child);
      result.elements.push(makeRef2(ctx, 'after', iLevel));
      iLevelAdd++;
    } else if (op.kind === 'release') {
      const iLevel = [...iLevelParent, iLevelAdd];
      const trackIndex = forwardShuntTrackAfter(cont, idxa, trackRelease);
      const parentEl = makeRef2(ctx, 'after', iLevel);
      const child = searchAfterOperationElementLight(
        op.formationAfterOperationCont,
        op.releaseJikoku,
        iLevel,
        trackIndex,
        ctx,
      );
      result.elements.push(parentEl);
      merge(result, child);
      iLevelAdd++;
    }
  }

  // 末尾: 入区・路線外終着は集めるだけ、次列車接続は占有登録 + seed。
  if (last !== undefined) {
    const iLevel = [...iLevelParent, iLevelAdd];
    if (last.kind === 'junction') {
      let terminalJikoku: Jikoku = releaseJikoku;
      let trackIndex = trackRelease;
      for (let idxa = 0; idxa < cont.length - 1; idxa++) {
        const op = cont[idxa];
        if (op === undefined) continue;
        if (op.kind === 'shunt') {
          if (trackIndex !== op.shuntTrackIndex) {
            terminalJikoku = op.shuntHatsuJikoku;
            trackIndex = op.shuntTrackIndex;
          }
        } else if (op.kind === 'connect') {
          terminalJikoku = op.connectJikoku;
        } else if (op.kind === 'release') {
          terminalJikoku = op.releaseJikoku;
        }
      }
      if (last.syuutenJikoku !== null) terminalJikoku = last.syuutenJikoku;

      const ref = makeRef(ctx, 'after', iLevel);
      result.elements.push({
        op: ref,
        iLevel,
        ekiOrder: ctx.ekiOrder,
        ekiIndexOfExist: ctx.ekiIndexOfExist,
        ressyaTrackIndex: trackIndex,
      });
      const el: RessyaElement = {
        beforeOp: null,
        afterOp: ref,
        jikoku: terminalJikoku,
        ressyahoukou: ctx.houkou,
        ressyaIndex: ctx.ressyaIndex,
      };
      result.existInserts.push({ ekiIndexOfExist: ctx.ekiIndexOfExist, trackIndex, el });
      result.junctionSeeds.push(el);
    } else if (last.kind === 'in' || last.kind === 'outer') {
      result.elements.push(makeRef2(ctx, 'after', iLevel));
    }
  }
  return result;
}

/** 増解結行の番線を後方の shunt から探す(原典 :5984-5991)。 */
function backwardShuntTrack(
  cont: readonly BeforeOperation[],
  from: number,
  fallback: number,
): number {
  let track = fallback;
  for (let idx = cont.length - 1; idx > from; idx--) {
    const op = cont[idx];
    if (op?.kind === 'shunt') track = op.shuntTrackIndex;
  }
  return track;
}

/** 後作業側の増解結番線を前方の shunt から探す(原典 :6284-6291)。 */
function forwardShuntTrackAfter(
  cont: readonly AfterOperation[],
  from: number,
  fallback: number,
): number {
  let track = fallback;
  for (let idx = 0; idx < from; idx++) {
    const op = cont[idx];
    if (op?.kind === 'shunt') track = op.shuntTrackIndex;
  }
  return track;
}

/** 占有登録しない単純な OperationElementLight(番線・占有 index は使わないので 0/未使用)。 */
function makeRef2(
  ctx: ExpandContext,
  opKind: 'before' | 'after',
  iLevel: number[],
): OperationElementLight {
  return {
    op: makeRef(ctx, opKind, iLevel),
    iLevel,
    ekiOrder: ctx.ekiOrder,
    ekiIndexOfExist: ctx.ekiIndexOfExist,
    ressyaTrackIndex: -1,
  };
}
