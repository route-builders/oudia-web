// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 up-tri
//
// Based on OuDiaSecond (Copyright (C) 2017-2026 diagram_mania)

/**
 * 乗継ソート(原典 CDedRessyaSoater_Transfer、entDgr/CDedRessyaSoater_Transfer.cpp
 * 798-1266。抽出レポート sort-min-idou §3)。
 *
 * 手順:
 * 1. 各列車の推定時刻(computeEstimateJikoku)を作る。
 * 2. フォーカス駅の駅扱が None 以外の列車を「ソート済み」集合に入れ、時刻順に整列。
 * 3. 残り(ソート前)を乗継関係で挿入配置: 着行なら To(F 起点方向) → From(F 終着方向) →
 *    From(全駅)、発行なら From → To → To(全駅)。各段階は 主要駅 600 秒以内 →
 *    全駅 600 秒以内 → 全駅無制限 を「移動が発生する限り再実行」。
 * 4. 残余は 終着駅 Order > F(NULL 列車以外)なら先頭へ、それ以外は末尾へ(元順維持)。
 *
 * カスタマイズ列の併合/分割グループ維持(Ver2 の運用連携)は M7。
 */

import { getSyuuchakuEki, kitenCompareKey, subJikokuWrapped } from '@oudia-web/domain';
import type { Ressya } from '@oudia-web/format';
import { asSeconds } from '@oudia-web/format';
import type { EstimateSlot } from '../layout/ressyaLayout.js';

export interface TransferSortInput {
  /** ソート対象列車(選択列車を左から詰めた列)。 */
  items: readonly Ressya[];
  /** items[i] の推定時刻(computeEstimateJikoku の結果)。 */
  estimates: readonly (readonly EstimateSlot[])[];
  /** フォーカス駅 Order と着/発。 */
  ekiOrder: number;
  item: 'chaku' | 'hatsu';
  /** ダイヤグラム起点時刻(秒)。 */
  kiten: number;
  /** 駅 Order → 主要駅か。 */
  isSyuyouByOrder: readonly boolean[];
}

const MAX_NORIKAE_SEC = 600; // 乗換 10 分
// 原典 3 段階(From 343-434 / To 469-551): (1) 主要駅のみ・600 秒 →
// (2) 非主要駅のみ・600 秒 → (3) 全駅・無制限。
const STAGES: { filter: 'syuyou' | 'nonSyuyou' | 'all'; maxSec: number }[] = [
  { filter: 'syuyou', maxSec: MAX_NORIKAE_SEC },
  { filter: 'nonSyuyou', maxSec: MAX_NORIKAE_SEC },
  { filter: 'all', maxSec: Number.MAX_SAFE_INTEGER },
];

/**
 * 乗換秒数(原典 calcNorikaeSec 1231-1266)。駅 o で from の着 → to の発。
 * 両駅扱 None 以外・着発とも非 null(代替なし)・起点時刻基準で 発 >= 着・
 * ±12h 正規化秒が 0 以上。それ以外は null(不可)。
 */
function calcNorikaeSec(
  from: readonly EstimateSlot[],
  to: readonly EstimateSlot[],
  o: number,
  kiten: number,
): number | null {
  const f = from[o];
  const t = to[o];
  if (f === undefined || t === undefined) return null;
  if (f.ekiatsukai === 'none' || t.ekiatsukai === 'none') return null;
  if (f.chaku === null || t.hatsu === null) return null;
  if (kitenCompareKey(t.hatsu, kiten) < kitenCompareKey(f.chaku, kiten)) return null; // 起点跨ぎ不可
  const sec = subJikokuWrapped(asSeconds(t.hatsu), asSeconds(f.chaku));
  return sec < 0 ? null : sec;
}

/** フォーカス項目の時刻(null なら他方代替)と着由来フラグ。 */
function itemJikoku(
  est: readonly EstimateSlot[],
  o: number,
  item: 'chaku' | 'hatsu',
): { v: number | null; isChaku: boolean } {
  const s = est[o];
  if (s === undefined) return { v: null, isChaku: item === 'chaku' };
  const primary = item === 'chaku' ? s.chaku : s.hatsu;
  if (primary !== null) return { v: primary, isChaku: item === 'chaku' };
  const alt = item === 'chaku' ? s.hatsu : s.chaku;
  return { v: alt, isChaku: item !== 'chaku' };
}

/** 乗継ソートの結果順(items 内位置の permutation)を返す。 */
export function transferSortOrder(input: TransferSortInput): number[] {
  const { items, estimates, ekiOrder, item, kiten, isSyuyouByOrder } = input;
  const ekiCount = isSyuyouByOrder.length;

  // ---- 初期分割(988-1005)----
  const sorted: number[] = [];
  const unsorted: number[] = [];
  for (let i = 0; i < items.length; i++) {
    const atsukai = estimates[i]?.[ekiOrder]?.ekiatsukai ?? 'none';
    (atsukai !== 'none' ? sorted : unsorted).push(i);
  }

  // ---- ソート済み集合の整列(CCompareRessyaIndex_Ekijikoku 653-795)----
  sorted.sort((a, b) => {
    const ja = itemJikoku(estimates[a] ?? [], ekiOrder, item);
    const jb = itemJikoku(estimates[b] ?? [], ekiOrder, item);
    if ((ja.v === null) !== (jb.v === null)) return ja.v === null ? 1 : -1;
    if (ja.v !== null && jb.v !== null) {
      const ka = kitenCompareKey(ja.v, kiten);
      const kb = kitenCompareKey(jb.v, kiten);
      if (ka !== kb) return ka - kb;
      if (ja.isChaku !== jb.isChaku) return ja.isChaku ? -1 : 1;
    }
    return a - b;
  });

  // ---- 駅単位処理(To 202-310 / From 96-199)----
  const est = (i: number): readonly EstimateSlot[] => estimates[i] ?? [];

  /** ソート前 → ソート後への乗継(To)。挿入は乗継先の直前(左詰め調整つき)。 */
  const stationTo = (o: number, maxSec: number): boolean => {
    let moved = false;
    for (let ui = 0; ui < unsorted.length; ui++) {
      const u = unsorted[ui];
      if (u === undefined) continue;
      let found = -1;
      for (let si = 0; si < sorted.length; si++) {
        const s = sorted[si];
        if (s === undefined) continue;
        const sec = calcNorikaeSec(est(u), est(s), o, kiten);
        if (sec !== null && sec <= maxSec) {
          found = si;
          break; // 先頭(早い方)から最初の成立
        }
      }
      if (found === -1) continue;
      // 挿入位置を左へ: 候補の着(代替なしの生値)が null なら停止、非 null なら
      // 着(発代替)同士の比較で 候補 <= 移動列車 の位置で止め、その直後(原典 272-291)。
      const move = est(u)[o];
      const moveChaku = move === undefined ? null : (move.chaku ?? move.hatsu);
      let pos = found;
      while (pos - 1 >= 0) {
        const prev = sorted[pos - 1];
        const cand = prev === undefined ? undefined : est(prev)[o];
        if (cand?.chaku == null) break; // 生の着が null → 停止
        const candChaku = cand.chaku;
        if (
          moveChaku === null ||
          kitenCompareKey(candChaku, kiten) <= kitenCompareKey(moveChaku, kiten)
        ) {
          break;
        }
        pos--;
      }
      sorted.splice(pos, 0, u);
      unsorted.splice(ui, 1);
      ui--;
      moved = true;
    }
    return moved;
  };

  /** ソート後 → ソート前への乗継(From)。挿入は乗継元の直後(右詰め調整つき)。 */
  const stationFrom = (o: number, maxSec: number): boolean => {
    let moved = false;
    for (let ui = unsorted.length - 1; ui >= 0; ui--) {
      const u = unsorted[ui];
      if (u === undefined) continue;
      let found = -1;
      for (let si = sorted.length - 1; si >= 0; si--) {
        const s = sorted[si];
        if (s === undefined) continue;
        const sec = calcNorikaeSec(est(s), est(u), o, kiten);
        if (sec !== null && sec <= maxSec) {
          found = si;
          break; // 末尾(遅い方)から最初の成立
        }
      }
      if (found === -1) continue;
      // 挿入位置を右へ: 候補の発(代替なしの生値)が null なら停止、非 null なら
      // 発(着代替)同士の比較で 移動列車 <= 候補 の位置まで進める(原典 161-177)。
      const move = est(u)[o];
      const moveHatsu = move === undefined ? null : (move.hatsu ?? move.chaku);
      let pos = found + 1;
      while (pos < sorted.length) {
        const cur = sorted[pos];
        const cand = cur === undefined ? undefined : est(cur)[o];
        if (cand?.hatsu == null) break; // 生の発が null → 停止
        const candHatsu = cand.hatsu;
        if (
          moveHatsu === null ||
          kitenCompareKey(moveHatsu, kiten) <= kitenCompareKey(candHatsu, kiten)
        ) {
          break;
        }
        pos++;
      }
      sorted.splice(pos, 0, u);
      unsorted.splice(ui, 1);
      moved = true;
    }
    return moved;
  };

  /** 段階つきラッパ(From 341-434 / To 463-551)。orders は駅の走査順。 */
  const runPhase = (kind: 'to' | 'from', orders: number[]): void => {
    for (const stage of STAGES) {
      let moved = true;
      while (moved) {
        moved = false;
        for (const o of orders) {
          if (stage.filter === 'syuyou' && isSyuyouByOrder[o] !== true) continue;
          if (stage.filter === 'nonSyuyou' && isSyuyouByOrder[o] === true) continue;
          moved =
            (kind === 'to' ? stationTo(o, stage.maxSec) : stationFrom(o, stage.maxSec)) || moved;
        }
      }
    }
  };

  const downTo0: number[] = [];
  for (let o = ekiOrder; o >= 0; o--) downTo0.push(o);
  const upToEnd: number[] = [];
  for (let o = ekiOrder; o < ekiCount; o++) upToEnd.push(o);
  const allFrom0: number[] = [];
  for (let o = 0; o < ekiCount; o++) allFrom0.push(o);
  const allFromEnd: number[] = [];
  for (let o = ekiCount - 1; o >= 0; o--) allFromEnd.push(o);

  if (item === 'chaku') {
    // (a) To(F 起点方向) → (b) From(F 終着方向) → (c) From(全駅)(1050-1085)。
    runPhase('to', downTo0);
    runPhase('from', upToEnd);
    runPhase('from', allFrom0);
  } else {
    // 発行: From → To → To(全駅)(1086-1124)。
    runPhase('from', upToEnd);
    runPhase('to', downTo0);
    runPhase('to', allFromEnd);
  }

  // ---- 残余(1127-1165): 終着駅 Order > F(NULL 列車以外)は先頭へ、他は末尾へ ----
  const prepend: number[] = [];
  const append: number[] = [];
  for (const u of unsorted) {
    const r = items[u];
    if (r === undefined) continue;
    if (!r.isNull && getSyuuchakuEki(r) > ekiOrder) prepend.push(u);
    else append.push(u);
  }
  return [...prepend, ...sorted, ...append];
}
