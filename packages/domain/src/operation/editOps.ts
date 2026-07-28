// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 up-tri
//
// Based on OuDiaSecond (Copyright (C) 2017-2026 diagram_mania)
// and OuDia (Copyright (C) 2006-2017 take-okm)

/**
 * flat 作業列(片側 = 前作業 or 後作業)への編集操作(原典 CDlgOperationProp の
 * OperationAdd / Insert / ChildOperationAdd / OperationClear / 種別変更の直訳)。M7b PR-2。
 *
 * 全操作は「flat splice + iLevel 一括補正」。補正規則(原典 dlgop.cpp:2322-2346):
 *   iAddPosition より下で、
 *     (1) level.length >= iAddiLevel.length、かつ
 *     (2) iAddiLevel の末尾以外の桁が一致、かつ
 *     (3) iAddiLevel.length-1 桁目の値 >= iAddiLevel の末尾値
 *   の行のその桁を ±1 する。
 *
 * 純関数として `FlatOp[]` を受け取り新配列を返す(元は変更しない)。選択位置 iListSelected は
 * 引数で受け取り、新しい選択位置を結果に含める。
 */

import {
  type FlatOp,
  OP_CONNECT,
  OP_JUNCTION,
  OP_PLACEHOLDER,
  OP_RELEASE,
  OP_SHUNT,
  type OperationEditKind,
} from './editModel.js';

/** 編集結果(新しい flat 列 + 新しい選択位置)。 */
export interface EditResult {
  readonly flat: FlatOp[];
  readonly selected: number;
}

/** 既定の新規作業(原典 Operation() = 入換・全 0)。level は呼出側で設定。 */
function newOp(level: number[]): FlatOp {
  return {
    kind: OP_SHUNT,
    comboData1: 0,
    editData1: null,
    editData2: null,
    releaseCount: 0,
    check1: false,
    operationNumbers: [],
    inOutLinkCode: '',
    level,
  };
}

/** プレースホルダ(iOp=7, level [0])。 */
function placeholderOp(): FlatOp {
  return { ...newOp([0]), kind: OP_PLACEHOLDER };
}

function cloneOp(op: FlatOp): FlatOp {
  return { ...op, operationNumbers: [...op.operationNumbers], level: [...op.level] };
}
function cloneFlat(flat: readonly FlatOp[]): FlatOp[] {
  return flat.map(cloneOp);
}

/**
 * iLevel 一括補正(原典 dlgop.cpp:2322-2346 / ChildAdd の全域版は from=0 かつ skip=iAddPosition)。
 * from 以降で「level.length >= addLevel.length && 上位桁一致 && addLevel.length-1 桁 >= addLevel 末尾」
 * の行のその桁を delta する。skipIndex(追加行自身)は補正しない。
 */
function adjustLevels(
  flat: FlatOp[],
  addLevel: readonly number[],
  from: number,
  delta: number,
  skipIndex: number,
): void {
  const d = addLevel.length; // 対象桁 = d-1
  const last = addLevel[d - 1] ?? 0;
  for (let idx = from; idx < flat.length; idx++) {
    if (idx === skipIndex) continue;
    const op = flat[idx];
    if (op === undefined) continue;
    if (op.level.length < d) continue;
    let match = true;
    for (let l = 0; l < d - 1; l++) {
      if (op.level[l] !== addLevel[l]) {
        match = false;
        break;
      }
    }
    if (match && (op.level[d - 1] ?? 0) >= last) {
      op.level[d - 1] = (op.level[d - 1] ?? 0) + delta;
    }
  }
}

/**
 * 「後に追加」(原典 OperationAdd、dlgop.cpp:2236)。選択行の後ろに新規入換を挿入。
 * 選択がプレースホルダ(7)なら全消去して入換1件に。解結(2)なら後作業群を飛び越す。
 */
export function operationAdd(flat: readonly FlatOp[], selected: number): EditResult {
  if (selected < 0) return { flat: cloneFlat(flat), selected };
  const s = cloneFlat(flat);
  const sel = s[selected];
  if (sel === undefined) return { flat: s, selected };

  if (sel.kind === OP_PLACEHOLDER) {
    return { flat: [newOp([0])], selected: 0 };
  }

  let addLevel: number[];
  let addPosition: number;
  if (sel.kind === OP_RELEASE) {
    addLevel = [...sel.level];
    // 解結の後作業群を飛び越した後方位置を探す。
    addPosition = s.length;
    for (let idx = selected + 1; idx < s.length; idx++) {
      const op = s[idx];
      if (op === undefined) continue;
      if (op.level.length < addLevel.length) {
        addPosition = idx;
        break;
      }
      if (op.level[addLevel.length - 1] !== addLevel[addLevel.length - 1]) {
        addPosition = idx;
        break;
      }
    }
    addLevel[addLevel.length - 1] = (addLevel[addLevel.length - 1] ?? 0) + 1;
  } else {
    addLevel = [...sel.level];
    addLevel[addLevel.length - 1] = (addLevel[addLevel.length - 1] ?? 0) + 1;
    addPosition = selected + 1;
  }

  s.splice(addPosition, 0, newOp([...addLevel]));
  adjustLevels(s, addLevel, addPosition + 1, +1, addPosition);
  return { flat: s, selected: addPosition };
}

/**
 * 「前に挿入」(原典 OperationInsert、dlgop.cpp:2364)。選択行の前に新規入換を挿入。
 * 増結(1)なら前作業群を飛び越して前方へ。
 */
export function operationInsert(flat: readonly FlatOp[], selected: number): EditResult {
  if (selected < 0) return { flat: cloneFlat(flat), selected };
  const s = cloneFlat(flat);
  const sel = s[selected];
  if (sel === undefined) return { flat: s, selected };

  if (sel.kind === OP_PLACEHOLDER) {
    return { flat: [newOp([0])], selected: 0 };
  }

  let addLevel: number[];
  let addPosition: number;
  if (sel.kind === OP_CONNECT) {
    addLevel = [...sel.level];
    addPosition = 0;
    for (let idx = selected - 1; idx >= 0; idx--) {
      const op = s[idx];
      if (op === undefined) continue;
      if (op.level.length < addLevel.length) {
        addPosition = idx + 1;
        break;
      }
      if (op.level[addLevel.length - 1] !== addLevel[addLevel.length - 1]) {
        addPosition = idx + 1;
        break;
      }
    }
  } else {
    addLevel = [...sel.level];
    addPosition = selected;
  }

  s.splice(addPosition, 0, newOp([...addLevel]));
  adjustLevels(s, addLevel, addPosition + 1, +1, addPosition);
  return { flat: s, selected: addPosition };
}

/**
 * 「増結/解結の子として追加」(原典 ChildOperationAdd、dlgop.cpp:2489)。
 * 増結(1)なら前作業として選択位置に、解結(2)なら後作業として選択+1 に挿入。
 * 補正は全域(from=0)・追加行自身のみ skip。
 */
export function childOperationAdd(flat: readonly FlatOp[], selected: number): EditResult {
  if (selected < 0) return { flat: cloneFlat(flat), selected };
  const s = cloneFlat(flat);
  const sel = s[selected];
  if (sel === undefined) return { flat: s, selected };

  let addLevel: number[] | undefined;
  let addPosition = 0;
  let newSelected = selected;
  if (sel.kind === OP_CONNECT) {
    // 直前作業(前作業最下位)の level 末尾 +1。増結の前作業は必ず 1 件以上ある。
    const prev = s[selected - 1];
    if (prev === undefined) return { flat: s, selected };
    addLevel = [...prev.level];
    addLevel[addLevel.length - 1] = (addLevel[addLevel.length - 1] ?? 0) + 1;
    addPosition = selected;
  } else if (sel.kind === OP_RELEASE) {
    // 直後作業(後作業最上位)の level を継承。
    const next = s[selected + 1];
    if (next === undefined) return { flat: s, selected };
    addLevel = [...next.level];
    addPosition = selected + 1;
    newSelected = selected + 1;
  } else {
    return { flat: s, selected }; // 増解結以外では無効
  }

  s.splice(addPosition, 0, newOp([...addLevel]));
  adjustLevels(s, addLevel, 0, +1, addPosition);
  return { flat: s, selected: newSelected };
}

/**
 * 「削除」(原典 OperationClear、dlgop.cpp:2592)。選択行を削除。増解結なら子群も削除。
 * 削除後 0 件ならプレースホルダを追加。
 */
export function operationClear(flat: readonly FlatOp[], selected: number): EditResult {
  if (selected < 0) return { flat: cloneFlat(flat), selected };
  const s = cloneFlat(flat);
  const sel = s[selected];
  if (sel === undefined) return { flat: s, selected };

  const delLevel = [...sel.level];
  let delPosition = selected;
  let delSize = 1;

  if (sel.kind === OP_CONNECT) {
    // 前作業(子)を併せて削除(選択より前方を後ろから走査)。
    for (let idxb = selected - 1; idxb >= 0; idxb--) {
      const op = s[idxb];
      if (op === undefined) break;
      if (op.level.length <= delLevel.length) break;
      let match = true;
      for (let l = 0; l < delLevel.length; l++) {
        if (op.level[l] !== delLevel[l]) {
          match = false;
          break;
        }
      }
      if (!match) break;
      delPosition--;
      delSize++;
    }
  } else if (sel.kind === OP_RELEASE) {
    // 後作業(子)を併せて削除(選択より後方を走査)。
    for (let idxa = selected + 1; idxa < s.length; idxa++) {
      const op = s[idxa];
      if (op === undefined) break;
      if (op.level.length <= delLevel.length) break;
      let match = true;
      for (let l = 0; l < delLevel.length; l++) {
        if (op.level[l] !== delLevel[l]) {
          match = false;
          break;
        }
      }
      if (!match) break;
      delSize++;
    }
  }

  s.splice(delPosition, delSize);
  adjustLevels(s, delLevel, delPosition, -1, -1);

  if (s.length === 0) s.push(placeholderOp());

  let newSelected = selected;
  if (s.length <= selected) newSelected = s.length - 1;
  return { flat: s, selected: newSelected };
}

/**
 * 種別変更(原典 AdjustUiData の一部、dlgop.cpp:686-1082 の簡略版)。
 * 選択行の kind を newKind に変える。増解結からの変更では子群を削除、増解結への変更では
 * 子作業(前列車/次列車接続)を 1 件生成する。時刻フィールドの引き継ぎは最小限に留め、
 * comboData1 はリセットする。
 *
 * 注意: 原典の完全なフィールド引き継ぎ(editData1↔editData2 の細かい移送・標準番線供給)は
 * PR-2 スコープでは中核ケース(増解結の子生成・子群削除)のみ移植し、時刻の引き継ぎは
 * 保守的に「両時刻を保持」する(誤消去を避ける)。標準番線は 0 を既定とする。
 */
export function setKind(
  flat: readonly FlatOp[],
  selected: number,
  newKind: OperationEditKind,
  isAfter: boolean,
): EditResult {
  if (selected < 0) return { flat: cloneFlat(flat), selected };
  let s = cloneFlat(flat);
  const sel = s[selected];
  if (sel === undefined) return { flat: s, selected };
  const oldKind = sel.kind;
  if (oldKind === newKind) return { flat: s, selected };

  // 旧種別が増解結なら子群を削除してから種別を変える(Clear と同じ子検出)。
  if (oldKind === OP_CONNECT || oldKind === OP_RELEASE) {
    const cleared = operationClear(s, selected);
    // Clear は選択行自身も消すので、ここでは子だけ消したいが、原典は種別変更時
    // 「子群のみ」削除する。簡便のため Clear で全消し → 同位置に新規種別を挿入し直す。
    s = cleared.flat;
    // Clear で 0 件化しプレースホルダになった場合の復帰。
    if (s.length === 1 && s[0]?.kind === OP_PLACEHOLDER) {
      s = [{ ...newOp([0]), kind: newKind }];
      s = applyChildForRenketsu(s, 0, newKind, isAfter);
      return { flat: s, selected: 0 };
    }
    // Clear が選択位置を詰めた後の位置に新規を挿入。
    const insertAt = Math.min(cleared.selected, s.length);
    const level = s[insertAt]?.level ?? s[insertAt - 1]?.level ?? [0];
    s.splice(insertAt, 0, { ...newOp([...level]), kind: newKind });
    s = applyChildForRenketsu(s, insertAt, newKind, isAfter);
    return { flat: s, selected: insertAt };
  }

  // 旧が非増解結: フィールドを保持しつつ kind とリセットのみ。
  const updated: FlatOp = { ...cloneOp(sel), kind: newKind, comboData1: 0 };
  s[selected] = updated;
  s = applyChildForRenketsu(s, selected, newKind, isAfter);
  return { flat: s, selected };
}

/**
 * 新種別が増結/解結のとき、子作業(前列車接続/次列車接続)を 1 件生成する
 * (原典 cpp:686-1082 の増解結化。増結=前作業として level.push_back(0) を選択位置に、
 * 解結=後作業として選択+1 に)。
 */
function applyChildForRenketsu(
  flat: FlatOp[],
  selected: number,
  newKind: OperationEditKind,
  _isAfter: boolean,
): FlatOp[] {
  const s = cloneFlat(flat);
  const sel = s[selected];
  if (sel === undefined) return s;
  if (newKind === OP_CONNECT) {
    // 増結の子=前作業。前列車接続(junction)を level+[0] で選択位置の直前に挿入。
    const childLevel = [...sel.level, 0];
    const child: FlatOp = { ...newOp(childLevel), kind: OP_JUNCTION };
    s.splice(selected, 0, child);
    return s;
  }
  if (newKind === OP_RELEASE) {
    // 解結の子=後作業。次列車接続(junction)を level+[0] で選択位置の直後に挿入。
    const childLevel = [...sel.level, 0];
    const child: FlatOp = { ...newOp(childLevel), kind: OP_JUNCTION };
    s.splice(selected + 1, 0, child);
    return s;
  }
  return s;
}
