// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 up-tri
//
// Based on OuDiaSecond (Copyright (C) 2017-2026 diagram_mania)
// and OuDia (Copyright (C) 2006-2017 take-okm)

/**
 * 運用の並べ替え(原典 CWndDcdGridAllOperationTable の splitOperationNumber :1101-1188 /
 * SortOperationNumber :1190-1366 / SortOperation :1368-1459 / キー抽出 + 挿入ソート
 * :1500-1664 の直訳)。M7d。
 *
 * 運用一覧表・運用一覧図・運用表 CSV エクスポートが共有する。原典は CSV 側
 * (CDlgOperationTableCsvExport.cpp:148-508)に同じコードを丸ごと複製しているが、TS では
 * 1 実装を共有する。
 *
 * ★並べ替え設定は oud2 ではなくレジストリ(AppProp)に保存される **ビュー設定**であり、
 * 黄金テスト非該当。ファイルから復元されるものではない。
 */

import type { BrunchLoopMap } from '@oudia-web/domain';
import {
  compareJikoku,
  ekiIndexOfEkiOrder,
  getRunBetweenEkiBackward,
  getRunBetweenEkiForward,
  isRunBetweenNextEki,
} from '@oudia-web/domain';
import type { Jikoku, Ressya } from '@oudia-web/format';
import type { OperationTableEntry } from './types.js';

/** 並べ替えの種類(原典 EOperationSort、CWndDcdGridAllOperationTable.h:107-114)。 */
export type OperationSort = 'operationNumber' | 'outEki' | 'outJikoku' | 'inEki' | 'inJikoku';

/** 並べ替え設定(ビュー設定。oud2 非永続)。 */
export interface OperationSortOptions {
  /** 既定 'operationNumber'。 */
  readonly sort: OperationSort;
  /** 運用番号を末尾要素から比較する(原典 m_bCompareBottom)。既定 false。 */
  readonly compareBottom: boolean;
  readonly kitenJikoku: Jikoku;
}

/**
 * 運用番号の塊(原典は 2 本の配列 iOperationNumber/strPart で表し、
 * iOperationNumber[i] === INT_MIN が「この塊は文字」の標識)。
 */
export interface OperationNumberChunk {
  /** 数字塊なら値、文字塊なら null。 */
  readonly num: number | null;
  /** 文字塊なら文字列、数字塊なら空文字。 */
  readonly str: string;
}

/**
 * 運用番号を「連続する数字」「連続する非数字」の塊列に切る
 * (原典 splitOperationNumber、cpp:1101-1188)。
 * 数字判定は ASCII 0-9 のみ(原典 _istdigit)。全角数字は文字塊になる。
 */
export function splitOperationNumberParts(s: string): OperationNumberChunk[] {
  const out: OperationNumberChunk[] = [];
  let i = 0;
  while (i < s.length) {
    const isDigit = (c: string): boolean => c >= '0' && c <= '9';
    const start = i;
    const digit = isDigit(s[i] ?? '');
    while (i < s.length && isDigit(s[i] ?? '') === digit) i++;
    const part = s.slice(start, i);
    out.push(digit ? { num: Number.parseInt(part, 10), str: '' } : { num: null, str: part });
  }
  return out;
}

/**
 * 運用番号の自然順比較(原典 SortOperationNumber、cpp:1190-1366)。
 * 戻り値 true = a が先(strictly-less 述語)。
 *
 * 規則: 空文字は最後 → 塊単位で突き合わせ(compareBottom なら末尾から)→
 * 数字塊が文字塊より先 → 文字塊同士は**まず短い方が先**、次に辞書順(コード単位)→
 * 数字塊同士は数値の小さい方が先 → 全塊同点なら塊数が少ない方が先。
 */
export function lessOperationNumber(a: string, b: string, compareBottom: boolean): boolean {
  if (b === '') return true; // 原典 :1196-1199(空は最後)
  if (a === '') return false;
  const pa = splitOperationNumberParts(a);
  const pb = splitOperationNumberParts(b);
  const n = Math.min(pa.length, pb.length);
  for (let idx = 0; idx < n; idx++) {
    // compareBottom なら末尾から idx+1 番目同士を突き合わせる(原典 :1216-1226)。
    const ca = compareBottom ? pa[pa.length - 1 - idx] : pa[idx];
    const cb = compareBottom ? pb[pb.length - 1 - idx] : pb[idx];
    if (ca === undefined || cb === undefined) continue;
    const aNum = ca.num !== null;
    const bNum = cb.num !== null;
    if (aNum !== bNum) return aNum; // 数字塊が文字塊より先(原典 :1229-1237)
    if (!aNum) {
      // 文字塊同士: まず長さ、次に辞書順(原典 :1239-1259)。
      if (ca.str.length !== cb.str.length) return ca.str.length < cb.str.length;
      if (ca.str !== cb.str) return ca.str < cb.str;
      continue;
    }
    if (ca.num !== cb.num) return (ca.num ?? 0) < (cb.num ?? 0); // 原典 :1261-1270
  }
  // 全塊同点 → 塊数が少ない方が先(原典 :1355-1364)。
  if (pa.length !== pb.length) return pa.length < pb.length;
  return false;
}

/** 1 運用ぶんの並べ替えキー(原典 iEkiIndexCont / iOuterIndexCont / JikokuCont の 1 行)。 */
export interface OperationSortKey {
  readonly operationNumber: string;
  /** 分岐環状集約済みの駅 index。時刻順のときは未使用。 */
  readonly ekiIndex: number;
  /** 路線外発着駅 index。非路線外は null(比較上は最小 = 純粋な出入区が先)。 */
  readonly outerEkiIndex: number | null;
  readonly jikoku: Jikoku;
}

/** null(非路線外)を最小に落とす(原典 INT_MIN)。 */
function outerRank(v: number | null): number {
  return v === null ? Number.NEGATIVE_INFINITY : v;
}

/**
 * 運用 2 件の並べ替え比較(原典 SortOperation、cpp:1368-1459)。true = a が先。
 * 全モードの最終 tie-break が運用番号順(運番は一意なので全順序が決まる)。
 */
export function lessOperation(
  a: OperationSortKey,
  b: OperationSortKey,
  opts: OperationSortOptions,
): boolean {
  // 運番が空なら常に最後(原典 :1379-1382。モードに関係なく即 false)。
  if (a.operationNumber === '') return false;

  if (opts.sort === 'outEki' || opts.sort === 'inEki') {
    if (a.ekiIndex !== b.ekiIndex) return a.ekiIndex < b.ekiIndex;
    const oa = outerRank(a.outerEkiIndex);
    const ob = outerRank(b.outerEkiIndex);
    if (oa !== ob) return oa < ob;
    const c = compareJikoku(a.jikoku, b.jikoku, opts.kitenJikoku);
    if (c !== 0) return c < 0;
  } else if (opts.sort === 'outJikoku' || opts.sort === 'inJikoku') {
    const c = compareJikoku(a.jikoku, b.jikoku, opts.kitenJikoku);
    if (c !== 0) return c < 0;
  }
  return lessOperationNumber(a.operationNumber, b.operationNumber, opts.compareBottom);
}

/** キー抽出に必要な周辺データ。 */
export interface OperationSortContext {
  /** [方向][列車index]。 */
  readonly ressyaCont: readonly (readonly Ressya[])[];
  readonly ekiCount: number;
  readonly brunchLoop: BrunchLoopMap;
}

/** 分岐・環状グループは環状チェーンの先頭駅へ集約する(原典 :1531-1542 / :1585-1596)。 */
function aggregateEkiIndex(ctx: OperationSortContext, ekiIndex: number): number {
  const pos = ctx.brunchLoop.positions[ekiIndex];
  if (pos === undefined || pos === 'standalone') return ekiIndex;
  return ctx.brunchLoop.ekiIndexLoop[ekiIndex]?.[0] ?? ekiIndex;
}

/**
 * 運用 1 件(時刻順エントリ列)から並べ替えキーを作る(原典 cpp:1531-1638)。
 * 出区側は先頭エントリ、入区側は末尾エントリを見る。
 */
export function operationSortKeyOf(
  operationNumber: string,
  entries: readonly OperationTableEntry[],
  sort: OperationSort,
  ctx: OperationSortContext,
): OperationSortKey {
  const useIn = sort === 'inEki' || sort === 'inJikoku';
  const entry = useIn ? entries[entries.length - 1] : entries[0];
  if (entry === undefined) {
    return { operationNumber, ekiIndex: 0, outerEkiIndex: null, jikoku: null };
  }
  const houkou = entry.ressyaProperty.houkou;
  const ressya = ctx.ressyaCont[houkou]?.[entry.ressyaProperty.ressyaIndex];

  if (useIn) {
    // 入区側(原典 :1585-1638)。運行区間補正は order-1 で判定する点に注意。
    if (entry.outerSyuuchakuEkiIndex !== null) {
      return {
        operationNumber,
        ekiIndex: aggregateEkiIndex(
          ctx,
          ekiIndexOfEkiOrder(entry.syuuchakuEkiOrder, ctx.ekiCount, houkou),
        ),
        outerEkiIndex: entry.outerSyuuchakuEkiIndex,
        jikoku: entry.outerSyuuchakuJikoku,
      };
    }
    let order = entry.syuuchakuEkiOrder;
    if (ressya !== undefined && !isRunBetweenNextEki(ressya, order - 1)) {
      order = getRunBetweenEkiBackward(ressya, order);
    }
    return {
      operationNumber,
      ekiIndex: aggregateEkiIndex(ctx, ekiIndexOfEkiOrder(order, ctx.ekiCount, houkou)),
      outerEkiIndex: null,
      jikoku: ressya?.ekiJikokuCont[order]?.chakuJikoku ?? null,
    };
  }

  // 出区側(原典 :1531-1584)。
  if (entry.outerSihatsuEkiIndex !== null) {
    return {
      operationNumber,
      ekiIndex: aggregateEkiIndex(
        ctx,
        ekiIndexOfEkiOrder(entry.sihatsuEkiOrder, ctx.ekiCount, houkou),
      ),
      outerEkiIndex: entry.outerSihatsuEkiIndex,
      jikoku: entry.outerSihatsuJikoku,
    };
  }
  let order = entry.sihatsuEkiOrder;
  if (ressya !== undefined && !isRunBetweenNextEki(ressya, order)) {
    order = getRunBetweenEkiForward(ressya, order);
  }
  return {
    operationNumber,
    ekiIndex: aggregateEkiIndex(ctx, ekiIndexOfEkiOrder(order, ctx.ekiCount, houkou)),
    outerEkiIndex: null,
    jikoku: ressya?.ekiJikokuCont[order]?.hatsuJikoku ?? null,
  };
}

/**
 * 運用表 Map を並べ替えて運用番号の列を返す(原典 cpp:1500-1664 の挿入ソート)。
 * 原典どおり「lessOperation(新, 既存[i]) が最初に true になる位置へ挿入、なければ末尾」で
 * 走らせる(strictly-less 述語なので完全同値は後ろに付く = 安定)。
 *
 * エントリが空の運番(原典 operator[] が作った空リスト)は運用として成立しないので除く。
 */
export function sortOperationNumbers(
  table: ReadonlyMap<string, readonly OperationTableEntry[]>,
  opts: OperationSortOptions,
  ctx: OperationSortContext,
): string[] {
  const order: string[] = [];
  const keys: OperationSortKey[] = [];
  for (const [operationNumber, entries] of table) {
    if (entries.length === 0) continue;
    const key = operationSortKeyOf(operationNumber, entries, opts.sort, ctx);
    let inserted = false;
    for (let i = 0; i < keys.length; i++) {
      const cur = keys[i];
      if (cur === undefined) continue;
      if (lessOperation(key, cur, opts)) {
        order.splice(i, 0, operationNumber);
        keys.splice(i, 0, key);
        inserted = true;
        break;
      }
    }
    if (!inserted) {
      order.push(operationNumber);
      keys.push(key);
    }
  }
  return order;
}
