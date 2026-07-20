// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 up-tri
//
// Based on OuDiaSecond (Copyright (C) 2017-2026 diagram_mania)
// and OuDia (Copyright (C) 2006-2017 take-okm)

/**
 * 作業整合 adjustOperation(原典 3 層 + 入れ子再帰の直訳。data-model §8.3(d))。M7a。
 *
 * 駅時刻・駅扱の変更後に列車単位で呼ぶ。有効始発駅の前作業先頭を先端作業
 * (out/outer/junction)に、有効終着駅の後作業末尾を終端作業(in/outer/junction)に強制し、
 * 有効範囲外の作業を削除、増結/解結の入れ子編成作業にも再帰適用する。
 *
 * 原典の 3 層:
 * - 層1 CentDedRessya::adjustOperation(CentDedRessya.cpp:1356-1500): magic iType 決定
 * - 層2 CentDedEkiJikoku::adjustOperation(CentDedEkiJikoku.cpp:452-528): iType→Cont 引数翻訳
 * - 層3 CentDed{Before,After}OperationCont::adjustOperation(:221/:222): 実 insert/erase
 * - 入れ子 CentDed{Before,After}Operation::adjustOperation(:522/:598): 増結/解結の子列正規化
 *
 * TS では層1〜層3を関数呼びで表現する。magic iType(INT_MIN/-2/-1/0/1/2)は内部実装値。
 *
 * 分岐環状の同一駅群判定(isSameBrunchLoopGroup)は deriveBrunchLoopMap を使う。単線では
 * 「同一駅Order か」に縮退する。
 */

import type {
  AfterOperation,
  BeforeOperation,
  EkiJikoku,
  Ressya,
  Ressyahoukou,
  Rosen,
} from '@oudia-web/format';
import { type BrunchLoopMap, deriveBrunchLoopMap } from '../brunchLoop.js';
import { ekiIndexOfEkiOrder } from '../ekiOrder.js';
import {
  getRunBetweenEkiForward,
  getValidSihatsuEki,
  getValidSyuuchakuEki,
  isRunBetweenNextEki,
} from '../runRange.js';
import { chakuHyouji, hatsuHyouji } from './keisikiAdjust.js';

// ---- 先端/終端作業の判定(原典 isFirstOperation / isLastOperation)----

/** 先端作業(前作業先頭に来るべき開始作業): out / outer / junction。 */
function isFirstBefore(op: BeforeOperation): boolean {
  return op.kind === 'out' || op.kind === 'outer' || op.kind === 'junction';
}
/** 終端作業(後作業末尾に来るべき終了作業): in / outer / junction。 */
function isLastAfter(op: AfterOperation): boolean {
  return op.kind === 'in' || op.kind === 'outer' || op.kind === 'junction';
}

/** 空の前列車接続(原典 BOperation_Junction 既定)。 */
function makeBeforeJunction(): BeforeOperation {
  return { kind: 'junction', kitenJikoku: null, kariOperationNumbers: [] };
}
/** 空の次列車接続(原典 AOperation_Junction 既定。junctionType=unrelated)。 */
function makeAfterJunction(): AfterOperation {
  return { kind: 'junction', syuutenJikoku: null, junctionType: 'unrelated' };
}

// ---- 入れ子再帰(層: CentDed{Before,After}Operation::adjustOperation)----

/** 増結/解結の子編成作業列を正規化する(前作業)。 */
function adjustNestedBefore(op: BeforeOperation): void {
  if (op.kind === 'connect') {
    // 増結の子 = 前作業列。先頭を先端作業に強制。
    adjustBeforeCont(op.formationBeforeOperationCont, -1);
  } else if (op.kind === 'release') {
    // 解結の子 = 後作業列。末尾を終端作業に強制。
    adjustAfterCont(op.formationAfterOperationCont, 1);
  }
}
/** 増結/解結の子編成作業列を正規化する(後作業)。 */
function adjustNestedAfter(op: AfterOperation): void {
  if (op.kind === 'connect') {
    adjustBeforeCont(op.formationBeforeOperationCont, -1);
  } else if (op.kind === 'release') {
    adjustAfterCont(op.formationAfterOperationCont, 1);
  }
}

// ---- 層3: Cont 単位の正規化(原典 CentDed{Before,After}OperationCont::adjustOperation)----

/**
 * 前作業列を正規化する。iType: INT_MIN(-∞)=全削除 / -1=先端作業を先頭に確保 / 0=中間駅。
 */
function adjustBeforeCont(cont: BeforeOperation[], iType: number): void {
  if (iType === Number.NEGATIVE_INFINITY) {
    cont.length = 0;
    return;
  }
  if (iType === -1) {
    if (cont.length === 0) {
      cont.push(makeBeforeJunction());
    } else {
      if (!isFirstBefore(cont[0] as BeforeOperation)) {
        cont.unshift(makeBeforeJunction());
      }
      for (let idx = 1; idx < cont.length; idx++) {
        const op = cont[idx];
        if (op === undefined) continue;
        if (op.kind === 'connect' || op.kind === 'release') {
          adjustNestedBefore(op);
        } else if (isFirstBefore(op)) {
          cont.splice(idx, 1);
          idx--;
        }
      }
    }
    return;
  }
  // iType === 0(中間駅): 先端作業は全削除、Connect/Release は再帰。
  for (let idx = 0; idx < cont.length; idx++) {
    const op = cont[idx];
    if (op === undefined) continue;
    if (op.kind === 'connect' || op.kind === 'release') {
      adjustNestedBefore(op);
    } else if (isFirstBefore(op)) {
      cont.splice(idx, 1);
      idx--;
    }
  }
}

/**
 * 後作業列を正規化する。iType: INT_MIN=全削除 / 1=終端作業を末尾に確保 / 0=中間駅。
 */
function adjustAfterCont(cont: AfterOperation[], iType: number): void {
  if (iType === Number.NEGATIVE_INFINITY) {
    cont.length = 0;
    return;
  }
  if (iType === 1) {
    if (cont.length === 0) {
      cont.push(makeAfterJunction());
    } else {
      const last = cont[cont.length - 1];
      if (last !== undefined && !isLastAfter(last)) {
        cont.push(makeAfterJunction());
      }
      for (let idx = cont.length - 2; idx >= 0; idx--) {
        const op = cont[idx];
        if (op === undefined) continue;
        if (op.kind === 'connect' || op.kind === 'release') {
          adjustNestedAfter(op);
        } else if (isLastAfter(op)) {
          cont.splice(idx, 1);
        }
      }
    }
    return;
  }
  // iType === 0(中間駅): 終端作業は全削除、Connect/Release は再帰。
  for (let idx = 0; idx < cont.length; idx++) {
    const op = cont[idx];
    if (op === undefined) continue;
    if (op.kind === 'connect' || op.kind === 'release') {
      adjustNestedAfter(op);
    } else if (isLastAfter(op)) {
      cont.splice(idx, 1);
      idx--;
    }
  }
}

// ---- 層2: スロット単位の iType 翻訳(原典 CentDedEkiJikoku::adjustOperation)----

/**
 * 1 スロットの前後作業を magic iType(INT_MIN/-2/-1/0/1/2)で正規化する。
 * (原典 CentDedEkiJikoku.cpp:452-528。着発時刻の有無で分岐)。
 */
function adjustSlotOperation(slot: EkiJikoku, iType: number): void {
  const NEG = Number.NEGATIVE_INFINITY;
  if (iType === NEG) {
    adjustBeforeCont(slot.beforeOperationCont, NEG);
    adjustAfterCont(slot.afterOperationCont, NEG);
  } else if (iType === -2) {
    // 有効始発駅: 前作業に先端作業を確保、後作業は中間扱い。
    adjustBeforeCont(slot.beforeOperationCont, -1);
    adjustAfterCont(slot.afterOperationCont, 0);
  } else if (iType === -1) {
    // 運行なし後の到着駅: 前作業削除、発時刻あれば後作業中間 なければ全削除。
    adjustBeforeCont(slot.beforeOperationCont, NEG);
    adjustAfterCont(slot.afterOperationCont, slot.hatsuJikoku === null ? NEG : 0);
  } else if (iType === 0) {
    // 通常中間駅: 着発どちらか null なら両方削除、両方あれば中間。
    if (slot.chakuJikoku === null || slot.hatsuJikoku === null) {
      adjustBeforeCont(slot.beforeOperationCont, NEG);
      adjustAfterCont(slot.afterOperationCont, NEG);
    } else {
      adjustBeforeCont(slot.beforeOperationCont, 0);
      adjustAfterCont(slot.afterOperationCont, 0);
    }
  } else if (iType === 1) {
    // 運行なし前の出発駅: 着時刻あれば前作業中間 なければ削除、後作業は常に削除。
    adjustBeforeCont(slot.beforeOperationCont, slot.chakuJikoku === null ? NEG : 0);
    adjustAfterCont(slot.afterOperationCont, NEG);
  } else if (iType === 2) {
    // 有効終着駅: 前作業は中間扱い、後作業に終端作業を確保。
    adjustBeforeCont(slot.beforeOperationCont, 0);
    adjustAfterCont(slot.afterOperationCont, 1);
  }
}

// ---- 分岐環状の同一駅群判定 ----

/**
 * 2 つの駅Order が分岐環状で同一駅群か(原典 CentDedEkiCont::isSameBrunchLoopGroup)。
 * 単線では「同一駅Index か」に縮退する。分岐環状では deriveBrunchLoopMap の
 * loop/originSide/terminalSide 配列の一致で判定する。
 */
function isSameBrunchLoopGroup(
  map: BrunchLoopMap,
  ekiCount: number,
  houkou: Ressyahoukou,
  orderA: number,
  orderB: number,
): boolean {
  const idxA = ekiIndexOfEkiOrder(orderA, ekiCount, houkou);
  const idxB = ekiIndexOfEkiOrder(orderB, ekiCount, houkou);
  if (idxA === idxB) return true;
  // 同じグループ = 同じ loop 配列(参照は違うが内容一致)を共有する。standalone は false。
  const posA = map.positions[idxA];
  const posB = map.positions[idxB];
  if (posA === 'standalone' || posB === 'standalone') return false;
  const loopA = map.ekiIndexLoop[idxA] ?? [];
  const loopB = map.ekiIndexLoop[idxB] ?? [];
  if (loopA.length === 0 || loopB.length === 0) return false;
  return loopA.length === loopB.length && loopA.every((v, i) => v === loopB[i]);
}

// ---- 層1: 列車オーケストレーション(原典 CentDedRessya::adjustOperation)----

/**
 * 1 列車の作業整合(原典 CentDedRessya::adjustOperation、CentDedRessya.cpp:1356-1500)。
 * ressya を破壊的に更新する(draft レデューサからも純関数からも呼べる)。
 *
 * @param rosen  路線(駅時刻形式・分岐環状の参照に使う)
 * @param ressya 対象列車(houkou はこの列車のもの)
 */
export function adjustRessyaOperation(rosen: Rosen, ressya: Ressya): void {
  const sihatsu = getValidSihatsuEki(ressya);
  const syuuchaku = getValidSyuuchakuEki(ressya);
  if (sihatsu === -1 || syuuchaku === -1 || sihatsu >= syuuchaku) return;

  const ekiCount = rosen.ekiCont.length;
  const houkou = ressya.houkou;
  const map = deriveBrunchLoopMap(rosen.ekiCont);
  // 駅Order → 駅時刻形式の着発表示(方向考慮)。
  const keisikiAt = (order: number): { chaku: boolean; hatsu: boolean } => {
    const eki = rosen.ekiCont[ekiIndexOfEkiOrder(order, ekiCount, houkou)];
    if (eki === undefined) return { chaku: false, hatsu: false };
    return {
      chaku: chakuHyouji(eki.ekijikokukeisiki, houkou),
      hatsu: hatsuHyouji(eki.ekijikokukeisiki, houkou),
    };
  };
  const isHatsuChakuHyouji = (order: number): boolean => {
    const h = keisikiAt(order);
    return h.chaku && h.hatsu;
  };

  for (let ekiOrder = 0; ekiOrder < ressya.ekiJikokuCont.length; ekiOrder++) {
    const slot = ressya.ekiJikokuCont[ekiOrder];
    if (slot === undefined) continue;

    if (ekiOrder < sihatsu || ekiOrder > syuuchaku) {
      adjustSlotOperation(slot, Number.NEGATIVE_INFINITY);
    } else if (ekiOrder === sihatsu) {
      adjustSlotOperation(slot, -2);
    } else if (ekiOrder === syuuchaku) {
      adjustSlotOperation(slot, 2);
    } else {
      // 中間駅(sihatsu < ekiOrder < syuuchaku)。
      if (isRunBetweenNextEki(ressya, ekiOrder)) {
        // 前後とも走行 → 駅時刻形式が着発表示なら着発両方要(0)、そうでなければ全削除。
        adjustSlotOperation(slot, isHatsuChakuHyouji(ekiOrder) ? 0 : Number.NEGATIVE_INFINITY);
      } else {
        // 走行なし区間の起点 → 次の走行駅と合わせて評価。
        const hatsuOrder = getRunBetweenEkiForward(ressya, ekiOrder);
        if (hatsuOrder === -1) continue;
        let bSame = isSameBrunchLoopGroup(map, ekiCount, houkou, ekiOrder, hatsuOrder);
        if (bSame) {
          // 駅時刻形式(d)のチェック: 前駅に着表示・後駅に発表示が必須。
          if (!keisikiAt(ekiOrder).chaku || !keisikiAt(hatsuOrder).hatsu) bSame = false;
        }
        const slotHatsu = ressya.ekiJikokuCont[hatsuOrder];
        if (bSame && slotHatsu !== undefined) {
          if (slot.chakuJikoku !== null && slotHatsu.hatsuJikoku !== null) {
            // 前駅は前作業のみ有効(後作業削除)、後駅は後作業のみ有効(前作業削除)。
            adjustSlotOperation(slot, 1);
            adjustSlotOperation(slotHatsu, -1);
          } else {
            adjustSlotOperation(slot, Number.NEGATIVE_INFINITY);
            adjustSlotOperation(slotHatsu, Number.NEGATIVE_INFINITY);
          }
        } else if (slotHatsu !== undefined) {
          adjustSlotOperation(slot, Number.NEGATIVE_INFINITY);
          adjustSlotOperation(slotHatsu, Number.NEGATIVE_INFINITY);
        }
        // 区間中間の走行なし駅は全削除。
        for (let ord = ekiOrder + 1; ord < hatsuOrder; ord++) {
          const mid = ressya.ekiJikokuCont[ord];
          if (mid !== undefined) adjustSlotOperation(mid, Number.NEGATIVE_INFINITY);
        }
        ekiOrder = hatsuOrder;
      }
    }
  }
}

/** 全ダイヤ・全方向・全列車に adjustRessyaOperation を適用する(駅編集カスケード step7 相当)。 */
export function adjustAllOperation(rosen: Rosen): void {
  for (const dia of rosen.diaCont) {
    for (const houkou of [0, 1] as const) {
      for (const ressya of dia.ressyaCont[houkou]) {
        adjustRessyaOperation(rosen, ressya);
      }
    }
  }
}
