// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 up-tri
//
// Based on OuDiaSecond (Copyright (C) 2017-2026 diagram_mania)
// and OuDia (Copyright (C) 2006-2017 take-okm)

/**
 * Light 運用探索の占有エンジン(原典 CDedOperationConnecter の InsertRessyaElement /
 * SearchRessyaElement / SearchRessyaElementRev の直訳)。M7b Light PR1。
 *
 * 占有リスト list<RessyaElement> は起点時刻(m_KitenJikoku)基準で循環ソートされる。
 * 各物理番線に「着(AfterOperation 有効)」と「発(BeforeOperation 有効)」のイベントを
 * 時刻順に並べ、同時刻の着発ペアを畳み込む。次列車接続 = 同一物理番線で「着の直後の発」。
 *
 * 原典 file:line は origin/DiagramEdit/DiagramEdit/entDed/CDedOperationConnecter.cpp。
 */

import { compareJikoku } from '@oudia-web/domain';
import type { Eki, Jikoku } from '@oudia-web/format';
import type { Houkou, OpRef, RessyaElement } from './types.js';

/**
 * 占有リストへの挿入(原典 InsertRessyaElement、cpp:184-269)。list を破壊的に更新する。
 * ソート判定は compareJikoku(..., kitenJikoku)(循環)、同時刻の次要素等値判定は
 * compareJikoku(..., 0)(素の等値)を使い分ける(原典 :198/:225 の非対称)。
 *
 * @param list 対象番線の占有リスト(破壊的更新)
 * @param el   挿入する RessyaElement
 * @param kitenJikoku 起点時刻(循環ソートの基準)
 */
export function insertRessyaElement(
  list: RessyaElement[],
  el: RessyaElement,
  kitenJikoku: Jikoku,
): void {
  if (list.length === 0) {
    list.push(el);
    return;
  }
  for (let i = 0; i < list.length; i++) {
    const itr = list[i];
    if (itr === undefined) continue;
    const cmp = compareJikoku(el.jikoku, itr.jikoku, kitenJikoku);
    if (cmp < 0) {
      // el が itr より前 → この位置に挿入。
      list.splice(i, 0, el);
      return;
    }
    if (cmp > 0) {
      // el が itr より後 → 次の比較へ。
      continue;
    }
    // 同時刻(cmp === 0): 着発の組合せで 4 分岐(原典 :216-262)。
    const next = list[i + 1];
    const nextSameTime = next !== undefined && compareJikoku(el.jikoku, next.jikoku, null) === 0;

    if (el.afterOp !== null && itr.afterOp !== null) {
      // (a) 着着: itr を着でなくし、次要素が同時刻なら削除。
      itr.afterOp = null;
      if (nextSameTime) list.splice(i + 1, 1);
    } else if (el.afterOp !== null && itr.beforeOp !== null) {
      // (b) 着発: 着を発の直前に挿入。
      list.splice(i, 0, el);
    } else if (el.beforeOp !== null && itr.afterOp !== null) {
      // (c) 発着: 次が同時刻ならペア成立(itr 着を潰し next 削除・return)、
      //     そうでなければ次要素位置に挿入。
      if (nextSameTime) {
        itr.afterOp = null;
        list.splice(i + 1, 1);
        return;
      }
      list.splice(i + 1, 0, el);
    } else if (el.beforeOp !== null && itr.beforeOp !== null) {
      // (d) 発発: itr を発でなくす。
      itr.beforeOp = null;
    }
    return;
  }
  // すべて el より前(同時刻含む後方)だった → 末尾へ追加。
  list.push(el);
}

/** SearchRessyaElement の戻り値(次列車 + 接続時刻)。未成立は null。 */
export interface SearchResult {
  readonly next: RessyaElement;
  readonly terminalJikoku: Jikoku;
}

/**
 * 次列車探索(原典 SearchRessyaElement、cpp:443-509)。
 * afterOp に一致する要素を線形探索し、その直後の要素が発端(beforeOp!=null)なら
 * それを次列車として返す。末尾のときは crossKiten が true なら先頭へラップ、
 * false なら未成立。
 *
 * @param list          対象番線の占有リスト
 * @param afterOp       自列車終着の後作業(次列車接続)
 * @param crossKiten    起点跨ぎ許可(m_bOperationCrossKitenJikoku)
 */
export function searchRessyaElement(
  list: readonly RessyaElement[],
  afterOp: OpRef,
  crossKiten: boolean,
): SearchResult | null {
  for (let i = 0; i < list.length; i++) {
    const itr = list[i];
    if (itr === undefined) continue;
    // 一致条件: afterOp が同一(iShiftSecond は Light 常に 0 なので比較不要)。
    if (itr.afterOp !== null && opRefSame(itr.afterOp, afterOp)) {
      let nextIdx = i + 1;
      if (nextIdx >= list.length) {
        if (crossKiten) {
          nextIdx = 0;
        } else {
          return null; // 跨がない → 未成立
        }
      }
      const next = list[nextIdx];
      if (next !== undefined && next.beforeOp !== null) {
        return { next, terminalJikoku: itr.jikoku };
      }
      return null;
    }
  }
  return null;
}

/**
 * 前列車存在確認(原典 SearchRessyaElementRev、cpp:511-584)。
 * beforeOp に一致する要素の直前が着端(afterOp!=null)なら前列車ありで true。
 * 先頭のときは crossKiten が true なら末尾へラップ。Light では現状未使用だが忠実移植する。
 */
export function searchRessyaElementRev(
  list: readonly RessyaElement[],
  beforeOp: OpRef,
  crossKiten: boolean,
): boolean {
  for (let i = 0; i < list.length; i++) {
    const itr = list[i];
    if (itr === undefined) continue;
    if (itr.beforeOp !== null && opRefSame(itr.beforeOp, beforeOp)) {
      let prevIdx = i - 1;
      if (prevIdx < 0) {
        if (crossKiten) {
          prevIdx = list.length - 1;
        } else {
          return false;
        }
      }
      const prev = list[prevIdx];
      return prev !== undefined && prev.afterOp !== null;
    }
  }
  return false;
}

/** OpRef 同一比較(このモジュール内ヘルパ。types.opRefEquals の非 null 版)。 */
function opRefSame(a: OpRef, b: OpRef): boolean {
  return (
    a.houkou === b.houkou &&
    a.ressyaIndex === b.ressyaIndex &&
    a.ekiOrder === b.ekiOrder &&
    a.opKind === b.opKind &&
    a.iLevel.length === b.iLevel.length &&
    a.iLevel.every((v, i) => v === b.iLevel[i])
  );
}

/**
 * 駅Order → 物理 eki index の写像テーブル(原典 iEkiOrderTable、cpp:586-623)。
 * `table[ekiOrder][houkou]` = 占有リストアクセス用 eki index。
 * 下り(houkou=0)は ekiOrder = ekiIndex、上り(houkou=1)は ekiIndex = N-1-ekiOrder。
 *
 * 第一段は分岐環状の集約(ekiIndexLoop[iEki][0] 寄せ)を行わず単独駅に縮退する。
 * 全駅が非分岐環状なら原典の通常駅パスと完全一致する。上り反転は単線でも必須。
 */
export function buildEkiOrderTable(ekiCont: readonly Eki[]): number[][] {
  const n = ekiCont.length;
  const table: number[][] = [];
  for (let order = 0; order < n; order++) {
    const kudariIndex = order; // 下り: 駅Order = 駅Index
    const noboriIndex = n - 1 - order; // 上り: 反転
    table[order] = [kudariIndex, noboriIndex];
  }
  return table;
}

/** 駅Order + 方向 → 物理 eki index(buildEkiOrderTable の参照ヘルパ)。 */
export function ekiIndexOfExist(
  table: readonly number[][],
  ekiOrder: number,
  houkou: Houkou,
): number {
  return table[ekiOrder]?.[houkou] ?? ekiOrder;
}
