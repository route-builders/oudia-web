// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 up-tri
//
// Based on OuDiaSecond (Copyright (C) 2017-2026 diagram_mania)
// and OuDia (Copyright (C) 2006-2017 take-okm)

/**
 * 運用表エントリの生成・時刻順挿入(原典 CDedOperationConnecter::
 * insertOperationTableContentToBuffer(cpp:8005-8085)/ addOperationTableContent(cpp:8087-8249)
 * の直訳)。M7c-2 PR-1。
 *
 * 運用探索は「開始作業(出区/路線外始発/前列車接続/運番変更)」で運用表エントリの前半を
 * バッファ([方向][列車index] の Map<運番, entry>)へ入れ、「終了作業(入区/路線外終着/
 * 次列車接続/運番変更)」でバッファから取り出して後半を埋め、Dia の運用表 Map へ時刻順に
 * 挿入する。1 エントリ = 「ある列車内での 1 運用番号の開始作業〜終了作業の組」。
 *
 * ★`;n` 接尾辞: 同一列車で同じ運番が複数回開始する場合、バッファのキー衝突を避けるため
 * insertOperationTableContentToBuffer が `運番;0`, `運番;1`, ... を**運番配列に破壊的に付与**する
 * (cpp:8022-8038)。接尾辞は再帰の下流へそのまま伝播し、addOperationTableContent が
 * 運用表 Map へ書くときに除去する(cpp:8180-8185)。dedup ではない(重複除去は原典に存在しない)。
 *
 * ★出力はすべて oud2 非永続 = 黄金テスト非該当([[m7c-full-search]])。
 */

import {
  compareJikoku,
  getRunBetweenEkiBackward,
  getRunBetweenEkiForward,
  isRunBetweenNextEki,
} from '@oudia-web/domain';
import type { AfterOperation, BeforeOperation, Jikoku, Ressya } from '@oudia-web/format';
import type { OpRef } from '../operationLight/types.js';
import type { BeforeAfterTypeFull, OperationTableEntry, RessyaPropertyRef } from './types.js';

/**
 * 運用表の組み立てコンテキスト(原典 m_contOperationTableContentBuffer +
 * CentDedDia::m_contOperationTableContent)。
 */
export interface OperationTableContext {
  /** [方向][列車index] → Map<運番(接尾辞付きあり), 開始側を入れた途中エントリ>。 */
  readonly buffer: Map<string, OperationTableEntry>[][];
  /** 完成エントリ Map<運番(接尾辞なし), 時刻順エントリ列>(原典 m_contOperationTableContent)。 */
  readonly table: Map<string, OperationTableEntry[]>;
  readonly kitenJikoku: Jikoku;
}

/** 空のコンテキストを作る(列車数は方向ごとに与える)。 */
export function createOperationTableContext(
  ressyaCount: readonly [number, number],
  kitenJikoku: Jikoku,
): OperationTableContext {
  const buffer: Map<string, OperationTableEntry>[][] = [
    Array.from({ length: ressyaCount[0] }, () => new Map<string, OperationTableEntry>()),
    Array.from({ length: ressyaCount[1] }, () => new Map<string, OperationTableEntry>()),
  ];
  return { buffer, table: new Map(), kitenJikoku };
}

/** 空のエントリ(原典 OperationTableContent の既定コンストラクタ、CentDedDia.h:232-246)。 */
function emptyEntry(ressyaProperty: RessyaPropertyRef): OperationTableEntry {
  return {
    ressyaProperty,
    sihatsuEkiOrder: 0,
    beforeType: 'unrelated',
    outerSihatsuEkiIndex: null,
    outerSihatsuJikoku: null,
    chakuJikoku: null,
    syuuchakuEkiOrder: 0,
    afterType: 'unrelated',
    outerSyuuchakuEkiIndex: null,
    hatsuJikoku: null,
    outerSyuuchakuJikoku: null,
    afterOperation: null,
  };
}

/** バッファ本体を取り出す(範囲外なら undefined)。 */
function bufferOf(
  ctx: OperationTableContext,
  ref: RessyaPropertyRef,
): Map<string, OperationTableEntry> | undefined {
  return ctx.buffer[ref.houkou]?.[ref.ressyaIndex];
}

/**
 * 開始作業を運用表バッファへ入れる(原典 insertOperationTableContentToBuffer、cpp:8005-8085)。
 *
 * ★`operationNumbers` を破壊的に書き換える(キー衝突時の `;n` 接尾辞付与)。呼び出し側は
 * この配列を下流の再帰へそのまま渡すこと(原典が参照渡しで伝播させているため)。
 *
 * @param beforeOp   開始作業の前作業(出区/路線外始発の判定と路線外情報の取得に使う)。null 可
 * @param afterRef   位置決め用の検索キー後作業(前列車接続で始まる場合の前列車終端)。null 可
 * @param beforeType 開始側の接続種別
 */
export function insertOperationTableContentToBuffer(
  ctx: OperationTableContext,
  ressyaProperty: RessyaPropertyRef,
  operationNumbers: string[],
  sihatsuEkiOrder: number,
  beforeOp: BeforeOperation | null,
  afterRef: OpRef | null,
  beforeType: BeforeAfterTypeFull,
): void {
  const buf = bufferOf(ctx, ressyaProperty);
  if (buf === undefined) return;

  for (let idx = 0; idx < operationNumbers.length; idx++) {
    const raw = operationNumbers[idx];
    if (raw === undefined || raw === '') continue; // 空運番は運用表に載せない(cpp:8018-8021)

    // 既存キーと衝突する場合は `運番;0`, `運番;1`, ... の未使用名へ改名する(cpp:8022-8038)。
    let key = raw;
    if (buf.has(key)) {
      for (let n = 0; ; n++) {
        const cand = `${raw};${String(n)}`;
        if (!buf.has(cand)) {
          key = cand;
          operationNumbers[idx] = cand; // ★破壊的: 接尾辞を下流へ伝播させる
          break;
        }
      }
    }

    const entry = emptyEntry(ressyaProperty);
    entry.sihatsuEkiOrder = sihatsuEkiOrder;

    if (beforeOp !== null && beforeOp.kind === 'outer') {
      // 路線外始発コンストラクタ(CentDedDia.h:305-325)。eBeforeType は Outer 固定。
      entry.beforeType = 'outer';
      entry.outerSihatsuEkiIndex = beforeOp.outerTerminalIndex;
      entry.outerSihatsuJikoku = beforeOp.outerHatsuJikoku;
      entry.chakuJikoku = beforeOp.chakuJikoku;
      if (afterRef !== null) entry.afterOperation = afterRef;
    } else if (beforeOp !== null && beforeOp.kind === 'out') {
      // 出区(cpp:8054-8066)。eBeforeType は引数によらず OutIn 固定。
      entry.beforeType = 'outIn';
      if (afterRef !== null) entry.afterOperation = afterRef;
    } else if (afterRef !== null) {
      // 前列車接続で始まる(cpp:8067-8075)。検索キー後作業を保持する。
      entry.beforeType = beforeType;
      entry.afterOperation = afterRef;
    } else {
      // 前列車のない前列車接続・運番変更で始まる(cpp:8076-8083)。
      entry.beforeType = beforeType;
    }

    buf.set(key, entry);
  }
}

/**
 * 終了作業で運用表エントリを確定し、運用表 Map へ時刻順に挿入する
 * (原典 addOperationTableContent、cpp:8087-8249)。
 *
 * ★`operationNumbers` を破壊的に書き換える(`;n` 接尾辞の除去、cpp:8180-8185)。
 * 原典も終了作業では呼び出し側がコピーを渡し、除去後の値を作業の表示運番にセットする。
 *
 * @param afterOp  終了作業の後作業(路線外終着の情報取得に使う)。null 可
 * @param afterRef 終了作業の参照(次エントリの位置決め検索キーになる)。null 可
 */
export function addOperationTableContent(
  ctx: OperationTableContext,
  ressya: Ressya,
  ressyaProperty: RessyaPropertyRef,
  operationNumbers: string[],
  syuuchakuEkiOrder: number,
  afterOp: AfterOperation | null,
  afterRef: OpRef | null,
  afterType: BeforeAfterTypeFull,
): void {
  const buf = bufferOf(ctx, ressyaProperty);
  if (buf === undefined) return;

  for (let idx = 0; idx < operationNumbers.length; idx++) {
    const key = operationNumbers[idx];
    if (key === undefined || key === '') continue;
    const stored = buf.get(key);
    if (stored === undefined) continue; // 開始側がない = この運番の運用ではない(cpp:8103-8104)

    const entry: OperationTableEntry = { ...stored };

    // 開始駅と終着駅が同一駅なら区間なし → 捨てる(cpp:8109-8132)。
    if (entry.sihatsuEkiOrder === syuuchakuEkiOrder) continue;
    if (
      !isRunBetweenNextEki(ressya, entry.sihatsuEkiOrder) &&
      !isRunBetweenNextEki(ressya, syuuchakuEkiOrder - 1) &&
      getRunBetweenEkiForward(ressya, entry.sihatsuEkiOrder) === syuuchakuEkiOrder
    ) {
      continue;
    }

    // 分岐/環状で着側・発側が分かれる駅の補正(cpp:8134-8151)。
    if (!isRunBetweenNextEki(ressya, entry.sihatsuEkiOrder)) {
      entry.sihatsuEkiOrder = getRunBetweenEkiForward(ressya, entry.sihatsuEkiOrder);
    }
    let syuuchakuOrder = syuuchakuEkiOrder;
    if (!isRunBetweenNextEki(ressya, syuuchakuEkiOrder - 1)) {
      syuuchakuOrder = getRunBetweenEkiBackward(ressya, syuuchakuEkiOrder);
    }

    // 位置決めに使うのは「バッファに入っていた検索キー」(cpp:8153)。
    const searchRef = stored.afterOperation;
    entry.afterOperation = afterRef; // 次エントリの検索キーになる(cpp:8154-8163)
    entry.syuuchakuEkiOrder = syuuchakuOrder;
    entry.afterType = afterType;

    if (afterOp !== null && afterOp.kind === 'outer') {
      entry.outerSyuuchakuEkiIndex = afterOp.outerTerminalIndex;
      entry.hatsuJikoku = afterOp.hatsuJikoku;
      entry.outerSyuuchakuJikoku = afterOp.outerChakuJikoku;
    }

    // 運用表 Map のキーは接尾辞を落とした素の運番(cpp:8180-8185)。★破壊的。
    const semi = key.indexOf(';');
    const plainKey = semi >= 0 ? key.slice(0, semi) : key;
    operationNumbers[idx] = plainKey;

    insertIntoTable(ctx, plainKey, entry, searchRef);
  }
}

/**
 * 運用表 Map への挿入位置決め(原典 cpp:8187-8246)。
 * (1) 検索キー後作業が一致する要素の**直後**へ挿入(挿入できたら列車プロパティ時刻を null 化)。
 * (2) 見つからず、かつ自身に時刻がある場合は時刻順に挿入(どれよりも後なら末尾)。
 * (3) 見つからず時刻もない場合は、繋がる出区・路線外始発がない → 運用表に載せない。
 *
 * ★(3) でもキー自体は作られる(原典 :8189-8190 が `operator[]` でリストを先に生やすため)。
 * 空リストの運番が Map に残りうるので、消費側(運用表ビュー)は空を読み飛ばすこと。
 */
function insertIntoTable(
  ctx: OperationTableContext,
  key: string,
  entry: OperationTableEntry,
  searchRef: OpRef | null,
): void {
  let list = ctx.table.get(key);
  if (list === undefined) {
    list = [];
    ctx.table.set(key, list);
  }

  if (searchRef !== null) {
    for (let i = 0; i < list.length; i++) {
      const cur = list[i];
      if (cur === undefined) continue;
      if (cur.afterOperation !== null && opRefSame(cur.afterOperation, searchRef)) {
        entry.ressyaProperty = { ...entry.ressyaProperty, jikoku: null };
        list.splice(i + 1, 0, entry);
        return;
      }
    }
  }

  if (entry.ressyaProperty.jikoku === null) return; // (3) 起点に繋がらない → 載せない
  if (list.length === 0) {
    list.push(entry);
    return;
  }
  for (let i = 0; i < list.length; i++) {
    const cur = list[i];
    if (cur === undefined) continue;
    if (
      cur.ressyaProperty.jikoku !== null &&
      compareJikoku(entry.ressyaProperty.jikoku, cur.ressyaProperty.jikoku, ctx.kitenJikoku) < 0
    ) {
      list.splice(i, 0, entry);
      return;
    }
  }
  list.push(entry);
}

/** OpRef の同一性(原典のポインタ比較 `itrList->AfterOperation == pAfterOperationForSearch`)。 */
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
