// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 up-tri
//
// Based on OuDiaSecond (Copyright (C) 2017-2026 diagram_mania)
// and OuDia (Copyright (C) 2006-2017 take-okm)

/**
 * 運用探索の作業抽出 + 増解結入れ子展開(原典
 * searchBeforeOperationElementLight / searchAfterOperationElementLight、cpp:5860 / 6260、
 * および Full 版 searchBeforeOperationElement / searchAfterOperationElement、cpp:5640 / 6048)。
 * M7b Light PR2 / M7c-2 PR-1。
 *
 * 各列車の前作業/後作業コンテナを平坦化して OperationElementLight 列にし、接続点 Junction
 * (前作業先頭=前列車接続 / 後作業末尾=次列車接続)だけを占有リストへ登録する。中間駅の
 * 増結(Connect)は前作業列を、解結(Release)は後作業列を子に持ち、再帰展開する。
 * 並び順: 増結=[...子展開, 親](子先・親後)、解結=[親, ...子展開](親先・子後)。
 *
 * ★2 種類の iLevel を持つ(原典との差分の要):
 * - `OperationElementLight.iLevel` = **探索パス**。原典 iLevelAdd と同じ採番で、入換(Shunt)を
 *   飛ばして増解結・運番変更だけを数える。`back()++` の走査はこちらを使う。
 * - `OperationElementLight.op.iLevel` = **union の実パス**(コンテナ index そのもの)。
 *   作業実体を引く resolveOperation と作業の同一性(OpRef)はこちらを使う。
 *   原典はポインタを別に保持するのでこの区別が要らないが、TS は参照を index パスで表すため必要。
 *
 * 純関数化: 原典は m_contRessyaExist / m_contJunctionList を副作用で書くが、TS では
 * 「占有登録すべき RessyaElement 列(existInserts)」と「次列車接続の種(junctionSeeds)」を
 * 戻り値で返し、呼出側(deriveOperationLight / deriveOperationFull)が畳み込む。
 *
 * Light 省略(原典との差分): clearOperationNumber・出入区連携・運番割当・PatternDiagramPreview
 * 周期複製(m_iPatternDiagramPreviewCycleSecond>0)・運用番号変更(collectNumberChange=false)。
 */

import type { AfterOperation, BeforeOperation, Jikoku } from '@oudia-web/format';
import type { Houkou, OperationElementLight, OpRef, RessyaElement } from './types.js';

/**
 * 展開結果。elements=簡略図要素、existInserts=占有登録すべき要素、junctionSeeds=次列車接続の種。
 * Full 専用 seed(outOuterSeeds/beforeJunctionSeeds/numberChangeSeeds)は Light 呼出側では無視され、
 * Full(M7c)の運番割付が消費する。search 本体は常に収集する(Light 無回帰=既存テストで担保)。
 */
export interface ExpandResult {
  elements: OperationElementLight[];
  existInserts: { ekiIndexOfExist: number; trackIndex: number; el: RessyaElement }[];
  junctionSeeds: RessyaElement[];
  /** 出区・路線外始発(前作業先頭)。Full の STEP2 運番 seed。 */
  outOuterSeeds: OperationElementLight[];
  /** 前列車接続(前作業先頭 Junction)。Full の STEP3b 孤立検査対象。 */
  beforeJunctionSeeds: OperationElementLight[];
  /**
   * 運用番号変更(反転でないもののみ)。Full の STEP3a 運番 seed。
   * jikoku は運用表の挿入位置決めに使う当駅時刻(原典 :4371/:4565/:4655/:4771 の暫定措置)。
   */
  numberChangeSeeds: { el: OperationElementLight; jikoku: Jikoku }[];
  /**
   * 入出区連携コードが入力された出区/路線外始発・入区/路線外終着(Full のみ)。
   * jikoku は起点跨ぎ判定に使う出区/入区時刻(原典 :4127/:4149/:4890-4896)。
   */
  inOutLinkSeeds: { el: OperationElementLight; code: string; isOut: boolean; jikoku: Jikoku }[];
}

/** 展開の共通コンテキスト(列車・駅・占有アクセスの固定情報)。 */
export interface ExpandContext {
  readonly houkou: Houkou;
  readonly ressyaIndex: number;
  readonly ekiOrder: number;
  readonly ekiIndexOfExist: number;
  /**
   * 運用番号変更を作業要素として収集するか(Full のみ true)。原典は Light 版
   * (searchBefore/AfterOperationElementLight, :5860/:6260)が NumberChange を扱わず、
   * Full 版(:5640/:6048)だけが扱って iLevelAdd も進める。既定 false = Light 互換。
   */
  readonly collectNumberChange?: boolean;
  /** 運用番号変更 seed に刻む当駅時刻(collectNumberChange のときのみ使う)。 */
  readonly numberChangeJikoku?: Jikoku;
}

/** 親のパス組(探索パス / union 実パス)。トップレベルは両方とも空配列。 */
export interface LevelParent {
  /** 探索パス(iLevelAdd 採番。入換を飛ばす)。 */
  readonly search: readonly number[];
  /** union の実パス(コンテナ index)。 */
  readonly real: readonly number[];
}

/** トップレベル(親なし)の LevelParent。 */
export const ROOT_LEVEL: LevelParent = { search: [], real: [] };

function emptyResult(): ExpandResult {
  return {
    elements: [],
    existInserts: [],
    junctionSeeds: [],
    outOuterSeeds: [],
    beforeJunctionSeeds: [],
    numberChangeSeeds: [],
    inOutLinkSeeds: [],
  };
}

function merge(into: ExpandResult, from: ExpandResult): void {
  into.elements.push(...from.elements);
  into.existInserts.push(...from.existInserts);
  into.junctionSeeds.push(...from.junctionSeeds);
  into.outOuterSeeds.push(...from.outOuterSeeds);
  into.beforeJunctionSeeds.push(...from.beforeJunctionSeeds);
  into.numberChangeSeeds.push(...from.numberChangeSeeds);
  into.inOutLinkSeeds.push(...from.inOutLinkSeeds);
}

/** 子のパス組を作る。 */
function childLevel(parent: LevelParent, searchIdx: number, realIdx: number): LevelParent {
  return { search: [...parent.search, searchIdx], real: [...parent.real, realIdx] };
}

/** OpRef を組む(union の実パス)。 */
function makeRef(ctx: ExpandContext, opKind: 'before' | 'after', real: readonly number[]): OpRef {
  return {
    houkou: ctx.houkou,
    ressyaIndex: ctx.ressyaIndex,
    ekiOrder: ctx.ekiOrder,
    opKind,
    iLevel: [...real],
  };
}

/** 占有登録しない作業要素(番線・占有 index は使わないので -1)。 */
function makeElement(
  ctx: ExpandContext,
  opKind: 'before' | 'after',
  level: LevelParent,
): OperationElementLight {
  return {
    op: makeRef(ctx, opKind, level.real),
    iLevel: [...level.search],
    ekiOrder: ctx.ekiOrder,
    ekiIndexOfExist: ctx.ekiIndexOfExist,
    ressyaTrackIndex: -1,
  };
}

/**
 * 前作業列を展開する(原典 searchBeforeOperationElement(Light) :5860-6045 / Full :5640-5859)。
 * 先頭は出区・路線外始発・前列車接続として特別扱いする(列車の先端 or 増結編成の先端)。
 *
 * @param cont          前作業列(増結の子 = 別編成の前作業列)
 * @param connectJikoku 親の増結時刻(先頭 Junction の起点時刻フォールバック)
 * @param parent        親のパス組(トップは ROOT_LEVEL)
 * @param trackConnect  親の増結が行われた番線 index(先頭 Junction の占有番線)
 * @param ctx           展開コンテキスト
 */
export function searchBeforeOperationElementLight(
  cont: readonly BeforeOperation[],
  connectJikoku: Jikoku,
  parent: LevelParent,
  trackConnect: number,
  ctx: ExpandContext,
): ExpandResult {
  const result = emptyResult();
  const first = cont[0];
  if (first === undefined) return result;

  if (first.kind === 'out' || first.kind === 'outer') {
    // 出区・路線外始発: 占有登録せず要素だけ集める。Full の運番 seed(outOuter)。
    const el = makeElement(ctx, 'before', childLevel(parent, 0, 0));
    result.elements.push(el);
    result.outOuterSeeds.push(el);
    if ((ctx.collectNumberChange ?? false) && first.inOutLinkCode !== '') {
      // 入出区連携コード(原典 :4135-4141 / :4157-4163 / :5672-5678 / :5692-5698)。
      result.inOutLinkSeeds.push({
        el,
        code: first.inOutLinkCode,
        isOut: true,
        jikoku: first.kind === 'out' ? first.outJikoku : first.outerHatsuJikoku,
      });
    }
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

    const level = childLevel(parent, 0, 0);
    const ref = makeRef(ctx, 'before', level.real);
    const opEl: OperationElementLight = {
      op: ref,
      iLevel: [...level.search],
      ekiOrder: ctx.ekiOrder,
      ekiIndexOfExist: ctx.ekiIndexOfExist,
      ressyaTrackIndex: trackIndex,
    };
    result.elements.push(opEl);
    // 前列車接続の始発 = Full の STEP3b 孤立検査対象。
    result.beforeJunctionSeeds.push(opEl);
    const el: RessyaElement = {
      beforeOp: ref,
      afterOp: null,
      jikoku: originJikoku,
      ressyahoukou: ctx.houkou,
      ressyaIndex: ctx.ressyaIndex,
    };
    result.existInserts.push({ ekiIndexOfExist: ctx.ekiIndexOfExist, trackIndex, el });
  }

  // 中間の増解結・運番変更(idxb=1..size-1、原典 :5975-6043 / Full :5766-5856)。
  let iLevelAdd = 1;
  for (let idxb = 1; idxb < cont.length; idxb++) {
    const op = cont[idxb];
    if (op === undefined) continue;
    if (op.kind === 'connect') {
      const level = childLevel(parent, iLevelAdd, idxb);
      const trackIndex = backwardShuntTrack(cont, idxb, trackConnect);
      const sub = searchBeforeOperationElementLight(
        op.formationBeforeOperationCont,
        op.connectJikoku,
        level,
        trackIndex,
        ctx,
      );
      // 増結: [...子展開, 親](子先・親後)。
      merge(result, sub);
      result.elements.push(makeElement(ctx, 'before', level));
      iLevelAdd++;
    } else if (op.kind === 'release') {
      const level = childLevel(parent, iLevelAdd, idxb);
      const trackIndex = backwardShuntTrack(cont, idxb, trackConnect);
      const parentEl = makeElement(ctx, 'before', level);
      const sub = searchAfterOperationElementLight(
        op.formationAfterOperationCont,
        op.releaseJikoku,
        level,
        trackIndex,
        ctx,
      );
      // 解結: [親, ...子展開](親先・子後)。
      result.elements.push(parentEl);
      merge(result, sub);
      iLevelAdd++;
    } else if (op.kind === 'numberChange' && (ctx.collectNumberChange ?? false)) {
      // 運用番号変更(Full のみ。原典 :5833-5856)。反転(空配列)は seed にしないが探索桁は進める。
      const el = makeElement(ctx, 'before', childLevel(parent, iLevelAdd, idxb));
      result.elements.push(el);
      if (op.operationNumbers.length > 0) {
        result.numberChangeSeeds.push({ el, jikoku: ctx.numberChangeJikoku ?? null });
      }
      iLevelAdd++;
    }
  }
  return result;
}

/**
 * 後作業列を展開する(原典 searchAfterOperationElement(Light) :6260-6345 / Full :6048-6259)。
 * 末尾 Junction(次列車接続)を占有登録し、junctionSeeds へも push する(前作業との非対称)。
 */
export function searchAfterOperationElementLight(
  cont: readonly AfterOperation[],
  releaseJikoku: Jikoku,
  parent: LevelParent,
  trackRelease: number,
  ctx: ExpandContext,
): ExpandResult {
  const result = emptyResult();
  const lastIdx = cont.length - 1;
  const last = cont[lastIdx];

  // 中間の増解結・運番変更(idxa=0..size-2、原典 :6279 / Full :6067)。
  let iLevelAdd = 0;
  for (let idxa = 0; idxa < lastIdx; idxa++) {
    const op = cont[idxa];
    if (op === undefined) continue;
    if (op.kind === 'connect') {
      const level = childLevel(parent, iLevelAdd, idxa);
      const trackIndex = forwardShuntTrackAfter(cont, idxa, trackRelease);
      const sub = searchBeforeOperationElementLight(
        op.formationBeforeOperationCont,
        op.connectJikoku,
        level,
        trackIndex,
        ctx,
      );
      merge(result, sub);
      result.elements.push(makeElement(ctx, 'after', level));
      iLevelAdd++;
    } else if (op.kind === 'release') {
      const level = childLevel(parent, iLevelAdd, idxa);
      const trackIndex = forwardShuntTrackAfter(cont, idxa, trackRelease);
      const parentEl = makeElement(ctx, 'after', level);
      const sub = searchAfterOperationElementLight(
        op.formationAfterOperationCont,
        op.releaseJikoku,
        level,
        trackIndex,
        ctx,
      );
      result.elements.push(parentEl);
      merge(result, sub);
      iLevelAdd++;
    } else if (op.kind === 'numberChange' && (ctx.collectNumberChange ?? false)) {
      // 運用番号変更(Full のみ。原典 :6133-6156)。
      const el = makeElement(ctx, 'after', childLevel(parent, iLevelAdd, idxa));
      result.elements.push(el);
      if (op.operationNumbers.length > 0) {
        result.numberChangeSeeds.push({ el, jikoku: ctx.numberChangeJikoku ?? null });
      }
      iLevelAdd++;
    }
  }

  // 末尾: 入区・路線外終着は集めるだけ、次列車接続は占有登録 + seed。
  if (last !== undefined) {
    const level = childLevel(parent, iLevelAdd, lastIdx);
    if (last.kind === 'junction') {
      let terminalJikoku: Jikoku = releaseJikoku;
      let trackIndex = trackRelease;
      for (let idxa = 0; idxa < lastIdx; idxa++) {
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

      const ref = makeRef(ctx, 'after', level.real);
      result.elements.push({
        op: ref,
        iLevel: [...level.search],
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
      const el = makeElement(ctx, 'after', level);
      result.elements.push(el);
      if ((ctx.collectNumberChange ?? false) && last.inOutLinkCode !== '') {
        // 入出区連携コード(原典 :4888-4902 / :6168-6183)。
        result.inOutLinkSeeds.push({
          el,
          code: last.inOutLinkCode,
          isOut: false,
          jikoku: last.kind === 'in' ? last.inJikoku : last.outerChakuJikoku,
        });
      }
    }
  }
  return result;
}

/**
 * 駅の前作業列を「先頭の特別扱いなし」で展開する(原典 STEP1 の中間駅ループ :4496-4583 /
 * 終着駅 :4701-4783)。増結・解結・運用番号変更だけを拾い、入換は探索桁を消費しない。Full 専用。
 */
export function expandStationBefore(
  cont: readonly BeforeOperation[],
  parent: LevelParent,
  trackDefault: number,
  ctx: ExpandContext,
): ExpandResult {
  const result = emptyResult();
  let iLevelAdd = 0;
  for (let idxb = 0; idxb < cont.length; idxb++) {
    const op = cont[idxb];
    if (op === undefined) continue;
    if (op.kind === 'connect') {
      const level = childLevel(parent, iLevelAdd, idxb);
      const sub = searchBeforeOperationElementLight(
        op.formationBeforeOperationCont,
        op.connectJikoku,
        level,
        backwardShuntTrack(cont, idxb, trackDefault),
        ctx,
      );
      merge(result, sub);
      result.elements.push(makeElement(ctx, 'before', level));
      iLevelAdd++;
    } else if (op.kind === 'release') {
      const level = childLevel(parent, iLevelAdd, idxb);
      const parentEl = makeElement(ctx, 'before', level);
      const sub = searchAfterOperationElementLight(
        op.formationAfterOperationCont,
        op.releaseJikoku,
        level,
        backwardShuntTrack(cont, idxb, trackDefault),
        ctx,
      );
      result.elements.push(parentEl);
      merge(result, sub);
      iLevelAdd++;
    } else if (op.kind === 'numberChange') {
      const el = makeElement(ctx, 'before', childLevel(parent, iLevelAdd, idxb));
      result.elements.push(el);
      if (op.operationNumbers.length > 0) {
        result.numberChangeSeeds.push({ el, jikoku: ctx.numberChangeJikoku ?? null });
      }
      iLevelAdd++;
    }
  }
  return result;
}

/**
 * 駅の後作業列を「末尾の特別扱いなし」で展開する(原典 STEP1 の始発駅 :4390-4479 /
 * 中間駅ループ :4585-4676)。Full 専用。
 */
export function expandStationAfter(
  cont: readonly AfterOperation[],
  parent: LevelParent,
  trackDefault: number,
  ctx: ExpandContext,
): ExpandResult {
  const result = emptyResult();
  let iLevelAdd = 0;
  for (let idxa = 0; idxa < cont.length; idxa++) {
    const op = cont[idxa];
    if (op === undefined) continue;
    if (op.kind === 'connect') {
      const level = childLevel(parent, iLevelAdd, idxa);
      const sub = searchBeforeOperationElementLight(
        op.formationBeforeOperationCont,
        op.connectJikoku,
        level,
        forwardShuntTrackAfter(cont, idxa, trackDefault),
        ctx,
      );
      merge(result, sub);
      result.elements.push(makeElement(ctx, 'after', level));
      iLevelAdd++;
    } else if (op.kind === 'release') {
      const level = childLevel(parent, iLevelAdd, idxa);
      const parentEl = makeElement(ctx, 'after', level);
      const sub = searchAfterOperationElementLight(
        op.formationAfterOperationCont,
        op.releaseJikoku,
        level,
        forwardShuntTrackAfter(cont, idxa, trackDefault),
        ctx,
      );
      result.elements.push(parentEl);
      merge(result, sub);
      iLevelAdd++;
    } else if (op.kind === 'numberChange') {
      const el = makeElement(ctx, 'after', childLevel(parent, iLevelAdd, idxa));
      result.elements.push(el);
      if (op.operationNumbers.length > 0) {
        result.numberChangeSeeds.push({ el, jikoku: ctx.numberChangeJikoku ?? null });
      }
      iLevelAdd++;
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
