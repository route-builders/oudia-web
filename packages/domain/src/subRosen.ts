// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 up-tri
//
// Based on OuDiaSecond (Copyright (C) 2017-2026 diagram_mania)
// and OuDia (Copyright (C) 2006-2017 take-okm)

/**
 * 路線の切り出し(部分路線の生成。原典 CentDedRosen::createSubRosen、
 * CentDedRosen.cpp:1306)。指定した駅Index範囲だけを残した新しい RosenFileData を返す
 * 純変換(元ドキュメントは変更しない。UI は結果を .oud2 としてダウンロードする)。
 *
 * スコープ: bEnableOuter=false のコアのみ移植する。原典の (0) 路線外発着変換
 * (範囲外に有効始発終着がある列車を路線外発着へ変換)は運用作業(Outer / 運用番号 /
 * 入出区連携コード)の生成を伴い M7 隣接のため先送りする(roadmap M6 スコープ注記に対応)。
 *
 * アルゴリズム(原典 (1)(2)):
 * (1) 保持範囲 [iEkiIndex, iEkiIndex+iEkiCount) の各駅で、範囲外を指す
 *     brunchCoreEkiIndex / loopOriginEkiIndex を null 化(brunchCore は範囲外全般、
 *     loopOrigin は範囲手前 < iEkiIndex のみ — 原典忠実)。
 *     終点側 erase(iEkiIndex+iEkiCount, INT_MAX) → 起点側 erase(0, iEkiIndex)。
 *     末尾駅の nextEkiDistance = 0。
 * (2) どの駅間も走行しない(isRunBetweenNextEki が全 order で false)列車を削除。
 */

import type { RosenFileData } from '@oudia-web/format';
import { cascadeEkiErase } from './command/ekiCascade.js';
import { isRunBetweenNextEki } from './runRange.js';

/** 切り出しの実行可否(原典 CMainFrame の ≥3 駅ガード + 範囲妥当性)。 */
export function canCreateSubRosen(
  data: RosenFileData,
  iEkiIndex: number,
  iEkiCount: number,
): boolean {
  const total = data.rosen.ekiCont.length;
  if (total < 3) return false; // 原典 OnFileRosenCreateSubRosen_Process の rv=-31
  if (iEkiCount < 1) return false;
  if (iEkiIndex < 0 || iEkiIndex + iEkiCount > total) return false;
  return true;
}

/**
 * 部分路線を生成する(原典 createSubRosen の bEnableOuter=false コア)。
 * @throws Error 範囲が不正(canCreateSubRosen で事前検証すること)
 */
export function createSubRosen(
  data: RosenFileData,
  iEkiIndex: number,
  iEkiCount: number,
): RosenFileData {
  if (!canCreateSubRosen(data, iEkiIndex, iEkiCount)) {
    throw new Error(
      `createSubRosen 範囲不正: index=${String(iEkiIndex)} count=${String(iEkiCount)} total=${String(data.rosen.ekiCont.length)}`,
    );
  }
  const out: RosenFileData = structuredClone(data);
  const ekiCont = out.rosen.ekiCont;

  // (1) 保持範囲の駅で、範囲外を指す分岐・環状参照を解除。
  for (let idx = iEkiIndex; idx < iEkiIndex + iEkiCount; idx++) {
    const eki = ekiCont[idx];
    if (eki === undefined) continue;
    if (
      eki.brunchCoreEkiIndex !== null &&
      (eki.brunchCoreEkiIndex < iEkiIndex || eki.brunchCoreEkiIndex >= iEkiIndex + iEkiCount)
    ) {
      eki.brunchCoreEkiIndex = null;
    }
    if (eki.loopOriginEkiIndex !== null && eki.loopOriginEkiIndex < iEkiIndex) {
      eki.loopOriginEkiIndex = null;
    }
  }

  // (1 続き) 終点側を削除 → 起点側を削除(各削除でカスケード)。
  // 終点側: [iEkiIndex+iEkiCount, 末尾] を高 index から 1 駅ずつ。
  for (let idx = ekiCont.length - 1; idx >= iEkiIndex + iEkiCount; idx--) {
    const oldCount = ekiCont.length;
    ekiCont.splice(idx, 1);
    cascadeEkiErase(out, idx, oldCount);
  }
  // 起点側: [0, iEkiIndex) を高 index から 1 駅ずつ(index 0 まで)。
  for (let idx = iEkiIndex - 1; idx >= 0; idx--) {
    const oldCount = ekiCont.length;
    ekiCont.splice(idx, 1);
    cascadeEkiErase(out, idx, oldCount);
  }

  // 末尾駅の次駅距離を 0 に。
  const bottom = ekiCont[ekiCont.length - 1];
  if (bottom !== undefined) bottom.nextEkiDistance = 0;

  // (2) 運行区間を 1 つも持たない列車を削除。
  for (const dia of out.rosen.diaCont) {
    for (const houkou of [0, 1] as const) {
      const list = dia.ressyaCont[houkou];
      for (let i = list.length - 1; i >= 0; i--) {
        const ressya = list[i];
        if (ressya === undefined) continue;
        let runs = false;
        for (let o = 0; o < ressya.ekiJikokuCont.length; o++) {
          if (isRunBetweenNextEki(ressya, o)) {
            runs = true;
            break;
          }
        }
        if (!runs) list.splice(i, 1);
      }
    }
  }

  return out;
}
