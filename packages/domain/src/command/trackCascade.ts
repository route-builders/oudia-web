// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 up-tri
//
// Based on OuDiaSecond (Copyright (C) 2017-2026 diagram_mania)
// and OuDia (Copyright (C) 2006-2017 take-okm)

/**
 * 番線(EkiTrack2)編集の整合カスケード(原典 CDlgEkiProp の iEkiTrack2Map +
 * CentDedRosen::adjustBrunchLoopEkiTrack2OuterTerminal の直訳)。M6。
 *
 * 原典は番線コンテナ自身の自己カスケードを持たない。UI がユーザ操作から
 * 「旧→新 index マップ」(長さ=旧番線数、値 -1=削除、新番線はマップに無い)を組み立て、
 * それをコマンドに渡して top-down で再マップする。**削除はガード(最後/主本線/使用中は拒否)で
 * あって clamp ではない**(CentDedEkiJikokuCont.cpp:336-347 は teisya/tsuuka のみ再マップし、
 * INT_MIN 未設定は触らない = 削除された番線が in-use になることは構造的に起きない)。
 *
 * 本移植では 1 駅の番線編集を「置換後の番線リスト + downMain/upMain/diagramTrackOmit +
 * 旧→新マップ」で表現する。分岐環状グループへの伝播(sibling eki)は M6 のこの段階では
 * 単独駅前提のため対象外(ユーザ決定: 分岐環状在線表は後回し)。
 */

import type { AfterOperation, BeforeOperation, RosenFileData } from '@oudia-web/format';
import { ekiOrderOfEkiIndex } from '../ekiOrder.js';

/** 旧→新 index マップ(長さ=旧番線数、値 -1=削除)を関数化する。範囲外は恒等。 */
function mapper(oldToNew: readonly number[]): (idx: number) => number {
  return (idx) => {
    if (idx < 0 || idx >= oldToNew.length) return idx; // 新番線(マップ外)は恒等
    return oldToNew[idx] ?? idx;
  };
}

/** shunt 作業の番線 index(m_iIntData1)を再帰的に再マップ(増結/解結の入れ子も辿る)。 */
function remapBeforeOps(ops: BeforeOperation[], map: (idx: number) => number): void {
  for (const op of ops) {
    if (op.kind === 'shunt') {
      op.shuntTrackIndex = map(op.shuntTrackIndex);
    } else if (op.kind === 'connect') {
      remapBeforeOps(op.formationBeforeOperationCont, map);
    } else if (op.kind === 'release') {
      remapAfterOps(op.formationAfterOperationCont, map);
    }
  }
}

function remapAfterOps(ops: AfterOperation[], map: (idx: number) => number): void {
  for (const op of ops) {
    if (op.kind === 'shunt') {
      op.shuntTrackIndex = map(op.shuntTrackIndex);
    } else if (op.kind === 'connect') {
      remapBeforeOps(op.formationBeforeOperationCont, map);
    } else if (op.kind === 'release') {
      remapAfterOps(op.formationAfterOperationCont, map);
    }
  }
}

/**
 * 番線編集の ressya 側再マップ(原典 CentDedEkiJikokuCont::adjustBrunchLoopEkiTrack2)。
 * 全ダイヤ全方向の全列車について、当該駅の停車/通過スロットの ressyaTrackIndex と
 * 前後作業の shunt 番線を旧→新マップで付け替える。運行なし(null / none)は触らない。
 *
 * @param iEkiIndex  編集した駅の駅Index
 * @param oldToNew   旧→新 番線 index マップ(-1=削除)
 */
export function remapRessyaTrackIndex(
  draft: RosenFileData,
  iEkiIndex: number,
  oldToNew: readonly number[],
): void {
  const map = mapper(oldToNew);
  const ekiCount = draft.rosen.ekiCont.length;
  for (const dia of draft.rosen.diaCont) {
    for (const houkou of [0, 1] as const) {
      const list = dia.ressyaCont[houkou];
      const ekiOrder = ekiOrderOfEkiIndex(iEkiIndex, ekiCount, houkou);
      for (const ressya of list) {
        const slot = ressya.ekiJikokuCont[ekiOrder];
        if (slot === undefined) continue;
        // 停車/通過のみ(原典 Ekiatsukai==Teisya/Tsuuka のゲート。none は INT_MIN 未設定)。
        if (slot.ekiatsukai !== 'teisya' && slot.ekiatsukai !== 'tsuuka') continue;
        if (slot.ressyaTrackIndex !== null) {
          slot.ressyaTrackIndex = map(slot.ressyaTrackIndex);
        }
        remapBeforeOps(slot.beforeOperationCont, map);
        remapAfterOps(slot.afterOperationCont, map);
      }
    }
  }
}

/**
 * 番線削除ガード(原典 CDlgEkiProp の削除拒否条件 + isExistRessyaOfEkiTrack2)。
 * 削除しようとする番線 index の集合について、次のいずれかなら理由文字列を返す(削除不可):
 * - 最後の 1 本になる(番線 0 個は不可)
 * - 主本線(downMain / upMain)を指している
 * - 当該駅を停車/通過する列車が使用中(ressyaTrackIndex が一致)
 * 問題なければ null。
 */
export function checkTrackDeletable(
  draft: RosenFileData,
  iEkiIndex: number,
  deleteTrackIndices: readonly number[],
): string | null {
  const eki = draft.rosen.ekiCont[iEkiIndex];
  if (eki === undefined) return '駅が見つかりません';
  const del = new Set(deleteTrackIndices);
  if (eki.ekiTrack2Cont.length - del.size < 1) {
    return '番線を 0 本にはできません';
  }
  if (del.has(eki.downMain) || del.has(eki.upMain)) {
    return '主本線に指定された番線は削除できません';
  }
  // 使用中チェック(全ダイヤ全方向)。
  const ekiCount = draft.rosen.ekiCont.length;
  for (const dia of draft.rosen.diaCont) {
    for (const houkou of [0, 1] as const) {
      const ekiOrder = ekiOrderOfEkiIndex(iEkiIndex, ekiCount, houkou);
      for (const ressya of dia.ressyaCont[houkou]) {
        const slot = ressya.ekiJikokuCont[ekiOrder];
        if (slot === undefined || slot.ressyaTrackIndex === null) continue;
        if (slot.ekiatsukai !== 'teisya' && slot.ekiatsukai !== 'tsuuka') continue;
        if (del.has(slot.ressyaTrackIndex)) {
          return `番線 ${String(slot.ressyaTrackIndex)} は「${dia.name}」の列車が使用中のため削除できません`;
        }
      }
    }
  }
  return null;
}
