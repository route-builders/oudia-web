// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 up-tri
//
// Based on OuDiaSecond (Copyright (C) 2017-2026 diagram_mania)
// and OuDia (Copyright (C) 2006-2017 take-okm)

/**
 * 駅の挿入・削除の整合カスケード(原典 CRfEditCmd_Eki::execute + CentDedRosen::onEkiInsert/
 * onEkiErase + 各 CentDed*::onEkiInsert/onEkiErase の直訳)。data-model §8.3(a)。
 *
 * eki/replaceRange レデューサは replace-region を「単一 index の挿入/削除の列」に分解して
 * このモジュールの primitives を呼ぶ。原典 CRfEditCmd_Eki は erase→set→insert の順で
 * まとめて処理し最後に一度だけ adjustBrunchLoopCont するが、派生マップはストア外(§8.3(e))
 * なので Web 版では「参照(brunchCore/loopOrigin/crossingCheckRule/番線)の整合」だけを
 * 各 index 操作で保てばよい。deriveBrunchLoopMap は参照が整合していれば常に計算可能。
 *
 * 最重要な非対称性(バイト一致のため厳守):
 * - 挿入: brunchCore/loopOrigin は `>= iEkiIndex かつ +1<size` で ++(CentDedEki.cpp:528)
 * - 削除: 厳密 `> iEkiIndex` で --(ガードなし。==iEkiIndex は原典では dangling だが、
 *   本移植は設計 §8.3-3 に従い「削除駅を指す参照は null」にする)
 * - 上り列車の ekiJikokuCont: order = ekiCount-1-index。挿入時のみ +1(CentDedDia.cpp:654)
 */

import type { Eki, EkiJikoku, RosenFileData } from '@oudia-web/format';
import { RESSYAHOUKOU_KUDARI } from '@oudia-web/format';
import { makeNoneEkiJikoku } from '../factory.js';

/** 上り(Nobori)は index を反転して order にする。挿入/削除で +1 の有無が異なる(呼出側)。 */
function orderOfIndexKudari(iEkiIndex: number): number {
  return iEkiIndex; // 下りは index=order
}

/**
 * 全ダイヤ・全方向・全列車に対して、駅挿入に伴う ekiJikokuCont の伸長を行う
 * (原典 CentDedRosen::onEkiInsert → DiaCont → Dia::onEkiInsert → RessyaCont → Ressya →
 * CentDedEkiJikokuCont::onEkiInsert、CentDedEkiJikokuCont.cpp:219)。
 *
 * @param newEkiCount 挿入後の駅数(=ekiCont.length)
 */
function growEkiJikokuOnInsert(draft: RosenFileData, iEkiIndex: number, newEkiCount: number): void {
  const oldEkiCount = newEkiCount - 1;
  for (const dia of draft.rosen.diaCont) {
    for (let houkou = 0; houkou < 2; houkou++) {
      const list = dia.ressyaCont[houkou];
      if (list === undefined) continue;
      const downMainTrack = draft.rosen.ekiCont[iEkiIndex]?.downMain ?? 0;
      const upMainTrack = draft.rosen.ekiCont[iEkiIndex]?.upMain ?? 0;
      // 挿入位置を駅Order へ。下り=index、上り=ekiCount-1-index + 1(原典 CentDedDia.cpp:654)。
      const insertOrder =
        houkou === RESSYAHOUKOU_KUDARI
          ? orderOfIndexKudari(iEkiIndex)
          : oldEkiCount - 1 - iEkiIndex + 1;
      const mainTrack = houkou === RESSYAHOUKOU_KUDARI ? downMainTrack : upMainTrack;
      for (const ressya of list) {
        insertOneSlot(ressya.ekiJikokuCont, insertOrder, mainTrack);
      }
    }
  }
}

/**
 * 1 列車の ekiJikokuCont の insertOrder 位置へスロットを挿入する
 * (原典 CentDedEkiJikokuCont::onEkiInsert)。挿入位置の前後(order-1 / order)が
 * ともに走行中(ekiatsukai!=='none')なら Tsuuka + 主本線、それ以外は None 既定。
 *
 * リーダーは末尾 None を切り詰めるため cont が駅数より短い場合がある。まず insertOrder
 * まで None で伸長してから判定・挿入する(原典はコンテナが常に駅数分あるため不要な処理だが、
 * 本移植では欠落スロットを補ってから原典と同じ判定を行う)。
 */
function insertOneSlot(cont: EkiJikoku[], insertOrder: number, mainTrack: number): void {
  // 前後判定は「挿入前コンテナ」で行う(原典 get(order-1)/get(order))。欠落は None 扱い。
  const before = insertOrder - 1 >= 0 ? cont[insertOrder - 1] : undefined;
  const at = insertOrder < cont.length ? cont[insertOrder] : undefined;
  const beforeRunning = before !== undefined && before.ekiatsukai !== 'none';
  const atRunning = at !== undefined && at.ekiatsukai !== 'none';
  // 挿入位置まで None で伸長(末尾切り詰め対策)。
  while (cont.length < insertOrder) cont.push(makeNoneEkiJikoku());
  const slot = makeNoneEkiJikoku();
  // 原典条件: 0 < order < 挿入前 size かつ前後とも走行中。size は挿入前コンテナ長(補填後の
  // cont.length は伸長で変わりうるが、原典の size は「駅数-1」= at が存在する内部位置を意味する)。
  if (insertOrder > 0 && at !== undefined && beforeRunning && atRunning) {
    slot.ekiatsukai = 'tsuuka';
    slot.ressyaTrackIndex = mainTrack;
  }
  cont.splice(insertOrder, 0, slot);
}

/**
 * 駅削除に伴う ekiJikokuCont の短縮(原典 CentDedEkiJikokuCont::onEkiErase = 単純 erase)。
 * 上り・下りとも +1 なし(原典 CentDedDia.cpp:678)。
 */
function shrinkEkiJikokuOnErase(
  draft: RosenFileData,
  iEkiIndex: number,
  oldEkiCount: number,
): void {
  for (const dia of draft.rosen.diaCont) {
    for (let houkou = 0; houkou < 2; houkou++) {
      const list = dia.ressyaCont[houkou];
      if (list === undefined) continue;
      const eraseOrder = houkou === RESSYAHOUKOU_KUDARI ? iEkiIndex : oldEkiCount - 1 - iEkiIndex;
      for (const ressya of list) {
        if (eraseOrder < ressya.ekiJikokuCont.length) {
          ressya.ekiJikokuCont.splice(eraseOrder, 1);
        }
      }
    }
  }
}

/**
 * 単一駅の index 参照シフト(挿入)。原典 CentDedEki::onEkiInsert(CentDedEki.cpp:528)。
 * brunchCore/loopOrigin は `>= iEkiIndex かつ +1<size` のとき ++。crossingCheckRule の
 * TrackType_Origin/Terminal の index も同規則。
 */
function shiftEkiRefsOnInsert(eki: Eki, iEkiIndex: number, newSize: number): void {
  if (
    eki.brunchCoreEkiIndex !== null &&
    eki.brunchCoreEkiIndex >= iEkiIndex &&
    eki.brunchCoreEkiIndex + 1 < newSize
  ) {
    eki.brunchCoreEkiIndex += 1;
  }
  if (
    eki.loopOriginEkiIndex !== null &&
    eki.loopOriginEkiIndex >= iEkiIndex &&
    eki.loopOriginEkiIndex + 1 < newSize
  ) {
    eki.loopOriginEkiIndex += 1;
  }
  for (const rule of eki.crossingCheckRuleCont) {
    for (const cont of [
      rule.beforeFromTrackContentCont,
      rule.beforeToTrackContentCont,
      rule.afterFromTrackContentCont,
      rule.afterToTrackContentCont,
    ]) {
      for (const tc of cont) {
        if (
          (tc.trackType === 'origin' || tc.trackType === 'terminal') &&
          tc.index >= iEkiIndex &&
          tc.index + 1 < newSize
        ) {
          tc.index += 1;
        }
      }
    }
  }
}

/**
 * 単一駅の index 参照シフト(削除)。原典 CentDedEki::onEkiErase(CentDedEki.cpp:614)。
 * brunchCore/loopOrigin は厳密 `> iEkiIndex` で --。crossingCheckRule も同規則。
 * ==iEkiIndex を指す参照(削除駅そのもの)は、設計 §8.3-3 に従い null 化する(原典は
 * dangling のまま上位で掃除するが、本移植は削除カスケード内で null にする)。
 */
function shiftEkiRefsOnErase(eki: Eki, iEkiIndex: number): void {
  if (eki.brunchCoreEkiIndex !== null) {
    if (eki.brunchCoreEkiIndex === iEkiIndex) eki.brunchCoreEkiIndex = null;
    else if (eki.brunchCoreEkiIndex > iEkiIndex) eki.brunchCoreEkiIndex -= 1;
  }
  if (eki.loopOriginEkiIndex !== null) {
    if (eki.loopOriginEkiIndex === iEkiIndex) eki.loopOriginEkiIndex = null;
    else if (eki.loopOriginEkiIndex > iEkiIndex) eki.loopOriginEkiIndex -= 1;
  }
  for (const rule of eki.crossingCheckRuleCont) {
    for (const cont of [
      rule.beforeFromTrackContentCont,
      rule.beforeToTrackContentCont,
      rule.afterFromTrackContentCont,
      rule.afterToTrackContentCont,
    ]) {
      // 参照先喪失(==iEkiIndex)は index を -1 相当にしないが、> は --。
      // Origin/Terminal 以外(track/outer)は駅 index でないので触らない。
      for (const tc of cont) {
        if (tc.trackType === 'origin' || tc.trackType === 'terminal') {
          if (tc.index > iEkiIndex) tc.index -= 1;
        }
      }
    }
  }
}

/**
 * 単一駅の挿入カスケード。ekiCont への挿入は呼出側(replaceRange)が済ませ、ここでは
 * ekiJikokuCont 伸長 + 全駅の index 参照シフトを行う。
 * @param newEki 挿入済みで ekiCont に入っている駅(伸長時に downMain/upMain を参照)
 */
export function cascadeEkiInsert(draft: RosenFileData, iEkiIndex: number): void {
  const newSize = draft.rosen.ekiCont.length;
  // (2) ekiJikokuCont 伸長。挿入駅は既に ekiCont[iEkiIndex] にある(downMain/upMain 参照)。
  growEkiJikokuOnInsert(draft, iEkiIndex, newSize);
  // (3)(4) 全駅の brunchCore/loopOrigin/crossingCheckRule を index シフト。挿入駅自身も対象
  //   (原典 CentDedEkiCont::onEkiInsert は全 eki を回す。挿入駅の参照は通常なし)。
  for (const eki of draft.rosen.ekiCont) {
    shiftEkiRefsOnInsert(eki, iEkiIndex, newSize);
  }
  // (5) ekijikokukeisiki 端点正規化(挿入のみ)。
  normalizeEndpointKeisikiOnInsert(draft, iEkiIndex);
}

/**
 * 単一駅の削除カスケード。ekiCont からの削除は呼出側が行い、ここでは ekiJikokuCont 短縮 +
 * 全駅の index 参照シフトを行う。
 * @param oldEkiCount 削除前の駅数
 */
export function cascadeEkiErase(
  draft: RosenFileData,
  iEkiIndex: number,
  oldEkiCount: number,
): void {
  shrinkEkiJikokuOnErase(draft, iEkiIndex, oldEkiCount);
  for (const eki of draft.rosen.ekiCont) {
    shiftEkiRefsOnErase(eki, iEkiIndex);
  }
}

/**
 * ekijikokukeisiki の端点正規化(原典 CentDedEkiCont::onEkiInsert、CentDedEkiCont.cpp:749。
 * 挿入のみ)。新しい端駅を挿入したとき、旧端駅を core に持つ分岐がまだ生きていれば、
 * 旧端駅の駅時刻形式を終着専用の Chaku から発着(Hatsuchaku)へ戻す。
 */
function normalizeEndpointKeisikiOnInsert(draft: RosenFileData, iEkiIndex: number): void {
  const ekiCont = draft.rosen.ekiCont;
  const size = ekiCont.length;
  if (size < 2) return;
  if (iEkiIndex === 0) {
    const eki1 = ekiCont[1];
    if (eki1 !== undefined && eki1.ekijikokukeisiki === 'noboriChaku') {
      for (let idx = 2; idx < size; idx++) {
        if (ekiCont[idx]?.brunchCoreEkiIndex === 1) {
          eki1.ekijikokukeisiki = 'hatsuchaku';
          break;
        }
      }
    }
  } else if (iEkiIndex === size - 1) {
    const ekiPrev = ekiCont[size - 2];
    if (ekiPrev !== undefined && ekiPrev.ekijikokukeisiki === 'kudariChaku') {
      for (let idx = 0; idx <= size - 3; idx++) {
        if (ekiCont[idx]?.brunchCoreEkiIndex === size - 2) {
          ekiPrev.ekijikokukeisiki = 'hatsuchaku';
          break;
        }
      }
    }
  }
}
