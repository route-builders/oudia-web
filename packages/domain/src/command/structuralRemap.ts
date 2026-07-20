// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 up-tri
//
// Based on OuDiaSecond (Copyright (C) 2017-2026 diagram_mania)
// and OuDia (Copyright (C) 2006-2017 take-okm)

/**
 * 種別・ダイヤの構造編集に伴う index 再マップ(原典 CentDedRessyasyubetsuCont /
 * CentDedRosen::swapRessyasyubetsu / CRfEditCmd_Dia の直訳)。data-model §8.3(b)(c)。
 */

import type { RosenFileData } from '@oudia-web/format';

/** 全ダイヤ全方向の全列車へ syubetsuIndex の変換関数を適用する。 */
function forEachRessyaSyubetsuIndex(draft: RosenFileData, fn: (idx: number) => number): void {
  for (const dia of draft.rosen.diaCont) {
    for (let houkou = 0; houkou < 2; houkou++) {
      const list = dia.ressyaCont[houkou];
      if (list === undefined) continue;
      for (const ressya of list) {
        ressya.syubetsuIndex = fn(ressya.syubetsuIndex);
      }
    }
  }
}

/**
 * 種別挿入の再マップ(原典 CentDedRessyasyubetsuCont::insert 148-156 + onRessyasyubetsuInsert)。
 * parentSyubetsuIndex >= iIndex は ++(+1<size ガード付き)、列車 syubetsuIndex は
 * iIndex <= idx で ++。
 */
export function remapSyubetsuInsert(draft: RosenFileData, iIndex: number): void {
  const size = draft.rosen.ressyasyubetsuCont.length;
  for (const s of draft.rosen.ressyasyubetsuCont) {
    if (
      s.parentSyubetsuIndex !== null &&
      s.parentSyubetsuIndex >= iIndex &&
      s.parentSyubetsuIndex + 1 < size
    ) {
      s.parentSyubetsuIndex += 1;
    }
  }
  forEachRessyaSyubetsuIndex(draft, (idx) => (iIndex <= idx ? idx + 1 : idx));
}

/**
 * 種別削除の再マップ(原典 erase 210-217 + onRessyasyubetsuErase の 1 件ずつ)。
 * 削除範囲 [iIndex, iIndex+iSize) を 1 件ずつ高 index から処理する意味を、まとめて
 * 「> 範囲末端は -iSize、範囲内は既定へ落とす」で表現する。
 * - parentSyubetsuIndex: >= iIndex+iSize は -iSize / [iIndex, iIndex+iSize) を指すものは null
 * - 列車 syubetsuIndex: >= iIndex+iSize は -iSize / 範囲内(削除された種別)は 0(既定種別)
 */
export function remapSyubetsuErase(draft: RosenFileData, iIndex: number, iSize: number): void {
  const end = iIndex + iSize;
  for (const s of draft.rosen.ressyasyubetsuCont) {
    if (s.parentSyubetsuIndex === null) continue;
    if (s.parentSyubetsuIndex >= end) s.parentSyubetsuIndex -= iSize;
    else if (s.parentSyubetsuIndex >= iIndex) s.parentSyubetsuIndex = null;
  }
  forEachRessyaSyubetsuIndex(draft, (idx) => {
    if (idx >= end) return idx - iSize;
    if (idx >= iIndex) return 0; // 削除された種別を指す列車は既定種別へ
    return idx;
  });
}

/**
 * 種別入替の再マップ(原典 CentDedRosen::swapRessyasyubetsu、CentDedRosen.cpp:2047)。
 * A ブロック [indexA, indexA+sizeA) と単一 B(indexB)を入替えた「配列の並べ替え」に対応する
 * 旧→新 index の全単射 permutation を作り、parentSyubetsuIndex と全列車 syubetsuIndex を
 * 同じ写像で付け替える。呼出側が実際の配列並べ替えを終えた後の「旧→新写像」を渡す前提で
 * なく、ここで permutation を計算して両方(配列並べ替え + 参照付替え)を行う。
 *
 * 実装は ressya/swap と同じ 2 分岐(A<B / A>B)で配列を並べ替え、同時に oldToNew を作る。
 */
export function remapSyubetsuSwap(
  draft: RosenFileData,
  indexA: number,
  sizeA: number,
  indexB: number,
): void {
  const cont = draft.rosen.ressyasyubetsuCont;
  const n = cont.length;
  const oldToNew = new Array<number>(n);
  for (let i = 0; i < n; i++) oldToNew[i] = i;

  const block = cont.slice(indexA, indexA + sizeA);
  const b = cont[indexB];
  if (b === undefined) return;

  if (indexA < indexB) {
    // [pre, A(sizeA), mid, B, post] → [pre, B, A, mid, post]
    const mid = cont.slice(indexA + sizeA, indexB);
    cont.splice(indexA, indexB - indexA + 1, b, ...block, ...mid);
    // 旧→新: B は indexA へ、A ブロックは indexA+1..、mid は後ろへずれる。
    oldToNew[indexB] = indexA;
    for (let k = 0; k < sizeA; k++) oldToNew[indexA + k] = indexA + 1 + k;
    for (let k = 0; k < mid.length; k++) oldToNew[indexA + sizeA + k] = indexA + 1 + sizeA + k;
  } else {
    // [pre, B, mid, A(sizeA), post] → [pre, mid, A, B, post]
    const mid = cont.slice(indexB + 1, indexA);
    cont.splice(indexB, indexA + sizeA - indexB, ...mid, ...block, b);
    for (let k = 0; k < mid.length; k++) oldToNew[indexB + 1 + k] = indexB + k;
    for (let k = 0; k < sizeA; k++) oldToNew[indexA + k] = indexB + mid.length + k;
    oldToNew[indexB] = indexB + mid.length + sizeA;
  }

  const map = (idx: number): number => (idx >= 0 && idx < n ? (oldToNew[idx] ?? idx) : idx);
  for (const s of cont) {
    if (s.parentSyubetsuIndex !== null) s.parentSyubetsuIndex = map(s.parentSyubetsuIndex);
  }
  for (const dia of draft.rosen.diaCont) {
    for (let houkou = 0; houkou < 2; houkou++) {
      const list = dia.ressyaCont[houkou];
      if (list === undefined) continue;
      for (const ressya of list) ressya.syubetsuIndex = map(ressya.syubetsuIndex);
    }
  }
}

/**
 * ダイヤ削除時の kijunDiaIndex 調整(原典 CRfEditCmd_Dia::execute 192-247、純削除ケース)。
 * 削除範囲を指すものは 0、範囲より後ろは -iSize。
 */
export function remapDiaErase(draft: RosenFileData, iIndex: number, iSize: number): void {
  const end = iIndex + iSize;
  const kijun = draft.rosen.kijunDiaIndex;
  if (kijun >= end) draft.rosen.kijunDiaIndex = kijun - iSize;
  else if (kijun >= iIndex) draft.rosen.kijunDiaIndex = 0;
}

/**
 * ダイヤ純入替(上下移動)時の kijunDiaIndex 端点入替(原典 CRfEditCmd_Dia::execute の
 * bIsSwap 分岐)。kijun が入替範囲の端点なら反対端へ。
 */
export function remapKijunDiaOnSwap(draft: RosenFileData, iIndex: number, iSize: number): void {
  const kijun = draft.rosen.kijunDiaIndex;
  if (kijun === iIndex) draft.rosen.kijunDiaIndex = iIndex + iSize - 1;
  else if (kijun === iIndex + iSize - 1) draft.rosen.kijunDiaIndex = iIndex;
}
