// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 up-tri
//
// Based on OuDiaSecond (Copyright (C) 2017-2026 diagram_mania)
// and OuDia (Copyright (C) 2006-2017 take-okm)

/**
 * 運用一覧表 / 運用一覧図の共通ビューモデル(原典 CWndDcdGridAllOperationTable の
 * OnUpdate_All :338-1097 / 列生成 CdAllOperationTableXColSpecCont::scan :113-196 /
 * maxRessyaCount 算出 :1499-1526 の直訳)。M7d。
 *
 * 設計 §3.6 の「1 ビューモデル + 2 レンダラ」。表(グリッド)と図(キャンバス)は
 * 同じ AllOperationTableViewModel を読み、レンダラだけが違う。
 *
 * 行 = 運用 1 件。データ源は deriveOperationFull の operationTable
 * (Map<運用番号, OperationTableEntry[]>)。出区側は先頭エントリ、入区側は末尾エントリ。
 *
 * ★すべて oud2 非永続の派生表示情報 = 黄金テスト非該当。
 */

import type { BrunchLoopMap } from '@oudia-web/domain';
import {
  ekiIndexOfEkiOrder,
  getRunBetweenEkiBackward,
  getRunBetweenEkiForward,
  isRunBetweenNextEki,
} from '@oudia-web/domain';
import type {
  Dia,
  Eki,
  Jikoku,
  JikokuConvOptions,
  Ressya,
  Ressyahoukou,
  Ressyasyubetsu,
  Rosen,
} from '@oudia-web/format';
import { encodeJikokuCsv } from '@oudia-web/format';
import type { OperationSort, OperationSortContext } from '../operationFull/operationSort.js';
import { sortOperationNumbers } from '../operationFull/operationSort.js';
import type { OperationTableEntry } from '../operationFull/types.js';

/** 列スペック(原典 CdAllOperationTableXColSpec の EColumnType)。 */
export type AllOperationTableColumn =
  | { readonly kind: 'columnNumber' }
  | { readonly kind: 'operationNumber' }
  | { readonly kind: 'outEkimei' }
  | { readonly kind: 'outHatsujikoku' }
  | { readonly kind: 'arrow' }
  | { readonly kind: 'inEkimei' }
  | { readonly kind: 'inChakujikoku' }
  | { readonly kind: 'ressyahoukou'; readonly ressyaIndex: number }
  | { readonly kind: 'ressyabangou'; readonly ressyaIndex: number }
  | { readonly kind: 'ressyasyubetsu'; readonly ressyaIndex: number }
  | { readonly kind: 'ressyamei'; readonly ressyaIndex: number }
  | { readonly kind: 'ressyaArrow'; readonly ressyaIndex: number };

/** 固定(横スクロールしない)列数 = 列番号〜着時刻の 7 列(原典 :1730-1732)。 */
export const ALL_OPERATION_TABLE_FIX_COLUMN_COUNT = 7;

export interface AllOperationTableOptions {
  /** DispProp.displayRessyamei。 */
  readonly displayRessyamei: boolean;
  /** [全列車を表示](原典 m_bDisplayAllRessya)。既定 false。 */
  readonly displayAllRessya: boolean;
  /** [親種別を有効にする](原典 m_bDisplayParentSyubetsu)。既定 false。 */
  readonly displayParentSyubetsu: boolean;
  /** 並べ替え(原典 m_eOperationSort)。既定 'operationNumber'。 */
  readonly sort: OperationSort;
  /** 運用番号を末尾要素から比較(原典 m_bCompareBottom)。既定 false。 */
  readonly compareBottom: boolean;
  readonly kitenJikoku: Jikoku;
  readonly conv: JikokuConvOptions;
}

/** 1 運用内の 1 列車ぶんのセル群。 */
export interface AllOperationTableRessyaCell {
  /** 同一列車扱いの一体化を反映した方向(原典 :662-736)。 */
  readonly houkou: Ressyahoukou;
  /** 方向の表示文字列(ダイヤ別名があればそれ)。 */
  readonly houkouText: string;
  readonly ressyabangou: string;
  readonly syubetsumei: string;
  /** 親種別解決後の種別 index(色・フォント引き当て用)。 */
  readonly syubetsuIndex: number;
  /** 列車名(号数連結済み)。 */
  readonly ressyamei: string;
  /** 後続列車があるか(原典 RessyaArrow に "→" を出すか)。 */
  readonly arrowAfter: boolean;
}

/** 1 行 = 1 運用。 */
export interface AllOperationTableRow {
  readonly operationNumber: string;
  /** 1 始まりの行番号(原典 ColumnNumber セル)。 */
  readonly rowNumber: number;
  readonly outEkimei: string;
  readonly outJikokuText: string;
  /** 図レンダラ用の生時刻。 */
  readonly outJikoku: Jikoku;
  readonly inEkimei: string;
  readonly inJikokuText: string;
  readonly inJikoku: Jikoku;
  /** 列車情報の繰り返し部。列数に満たない分は null(空白埋め)。 */
  readonly ressya: readonly (AllOperationTableRessyaCell | null)[];
  /** 図レンダラ用: 元エントリ列(時刻順)。 */
  readonly entries: readonly OperationTableEntry[];
}

export interface AllOperationTableViewModel {
  readonly columns: AllOperationTableColumn[];
  readonly rows: AllOperationTableRow[];
  /** 同一列車扱いを 1 本に潰した最大列車数(原典 m_iMaxRessyaCount)。 */
  readonly maxRessyaCount: number;
}

/**
 * 列スペックを構築する(原典 CdAllOperationTableXColSpecCont::scan、:113-196)。
 * 固定 7 列 + 列車情報の繰り返し部。全列車表示 OFF のときは繰り返し部が**必ず 2 組**。
 */
export function buildAllOperationTableColumns(
  displayRessyamei: boolean,
  displayAllRessya: boolean,
  maxRessyaCount: number,
): AllOperationTableColumn[] {
  const cols: AllOperationTableColumn[] = [
    { kind: 'columnNumber' },
    { kind: 'operationNumber' },
    { kind: 'outEkimei' },
    { kind: 'outHatsujikoku' },
    { kind: 'arrow' },
    { kind: 'inEkimei' },
    { kind: 'inChakujikoku' },
  ];
  const pushTrain = (idx: number, last: boolean): void => {
    cols.push({ kind: 'ressyahoukou', ressyaIndex: idx });
    cols.push({ kind: 'ressyabangou', ressyaIndex: idx });
    cols.push({ kind: 'ressyasyubetsu', ressyaIndex: idx });
    if (displayRessyamei) cols.push({ kind: 'ressyamei', ressyaIndex: idx });
    // 最後の列車の後には矢印列を作らない(原典 :160-164)。
    if (!last) cols.push({ kind: 'ressyaArrow', ressyaIndex: idx });
  };
  if (displayAllRessya) {
    for (let idx = 0; idx < maxRessyaCount; idx++) pushTrain(idx, idx >= maxRessyaCount - 1);
  } else {
    // 出区列車・入区列車の 2 組固定(原典 :166-194)。
    pushTrain(0, false);
    pushTrain(1, true);
  }
  return cols;
}

/** 列スペックの位置を引く(原典 ColumnNumberFromSpec)。見つからなければ -1。 */
export function columnIndexOf(
  cols: readonly AllOperationTableColumn[],
  spec: AllOperationTableColumn,
): number {
  return cols.findIndex((c) => {
    if (c.kind !== spec.kind) return false;
    // 列車情報部のみ ressyaIndex も一致必須(原典 isEqualTo :200-220)。
    if ('ressyaIndex' in c && 'ressyaIndex' in spec) return c.ressyaIndex === spec.ressyaIndex;
    return true;
  });
}

/** 同一列車扱いで連結された列車を 1 本に潰した本数(原典 :1499-1526)。 */
export function countRessyaInOperation(entries: readonly OperationTableEntry[]): number {
  let count = entries.length;
  for (let i = 0; i + 1 < entries.length; i++) {
    if (entries[i]?.afterType === 'propertySame' && entries[i + 1]?.beforeType === 'propertySame') {
      count--;
    }
  }
  return count;
}

/** 方向の表示文字列(ダイヤ別名があればそれ。原典 :364-383)。 */
function houkouText(rosen: Rosen, houkou: Ressyahoukou): string {
  const alias = houkou === 0 ? rosen.kudariDiaAlias : rosen.noboriDiaAlias;
  if (alias !== '') return alias;
  return houkou === 0 ? '下り' : '上り';
}

/** 親種別へ 1 段だけ差し替える(原典 :350-361)。 */
function resolveSyubetsuIndex(
  syubetsuCont: readonly Ressyasyubetsu[],
  index: number,
  displayParent: boolean,
): number {
  if (!displayParent) return index;
  const parent = syubetsuCont[index]?.parentSyubetsuIndex;
  return parent !== undefined && parent !== null && parent >= 0 ? parent : index;
}

/** 列車名 + 号数(原典 :445-460 と同じ連結)。 */
function ressyameiText(ressya: Ressya): string {
  return ressya.gousuu !== '' ? `${ressya.ressyamei} ${ressya.gousuu}号` : ressya.ressyamei;
}

/** 出区側の駅名・時刻(原典 :427-479)。 */
function outSide(
  entry: OperationTableEntry,
  ressya: Ressya | undefined,
  ekiCont: readonly Eki[],
  conv: JikokuConvOptions,
): { ekimei: string; jikoku: Jikoku; text: string } {
  const houkou = entry.ressyaProperty.houkou;
  if (entry.outerSihatsuEkiIndex !== null) {
    // 路線外始発: 境界駅の路線外発着駅名を使う(RunBetween 補正はしない)。
    const eki = ekiCont[ekiIndexOfEkiOrder(entry.sihatsuEkiOrder, ekiCont.length, houkou)];
    const ekimei = eki?.outerTerminalCont[entry.outerSihatsuEkiIndex]?.ekimei ?? '';
    return {
      ekimei,
      jikoku: entry.outerSihatsuJikoku,
      text: encodeJikokuCsv(entry.outerSihatsuJikoku, false, null, conv),
    };
  }
  let order = entry.sihatsuEkiOrder;
  if (ressya !== undefined && !isRunBetweenNextEki(ressya, order)) {
    order = getRunBetweenEkiForward(ressya, order);
  }
  const eki = ekiCont[ekiIndexOfEkiOrder(order, ekiCont.length, houkou)];
  const jikoku = ressya?.ekiJikokuCont[order]?.hatsuJikoku ?? null;
  return { ekimei: eki?.ekimei ?? '', jikoku, text: encodeJikokuCsv(jikoku, false, null, conv) };
}

/** 入区側の駅名・時刻(原典 :503-556)。運行区間補正の判定は order-1。 */
function inSide(
  entry: OperationTableEntry,
  ressya: Ressya | undefined,
  ekiCont: readonly Eki[],
  conv: JikokuConvOptions,
): { ekimei: string; jikoku: Jikoku; text: string } {
  const houkou = entry.ressyaProperty.houkou;
  if (entry.outerSyuuchakuEkiIndex !== null) {
    const eki = ekiCont[ekiIndexOfEkiOrder(entry.syuuchakuEkiOrder, ekiCont.length, houkou)];
    const ekimei = eki?.outerTerminalCont[entry.outerSyuuchakuEkiIndex]?.ekimei ?? '';
    return {
      ekimei,
      jikoku: entry.outerSyuuchakuJikoku,
      text: encodeJikokuCsv(entry.outerSyuuchakuJikoku, true, null, conv),
    };
  }
  let order = entry.syuuchakuEkiOrder;
  if (ressya !== undefined && !isRunBetweenNextEki(ressya, order - 1)) {
    order = getRunBetweenEkiBackward(ressya, order);
  }
  const eki = ekiCont[ekiIndexOfEkiOrder(order, ekiCont.length, houkou)];
  const jikoku = ressya?.ekiJikokuCont[order]?.chakuJikoku ?? null;
  return { ekimei: eki?.ekimei ?? '', jikoku, text: encodeJikokuCsv(jikoku, true, null, conv) };
}

/**
 * 同一列車扱いの一体化区間の方向を決める(原典 :662-736)。
 * 一体化区間の先頭 iSihatsuEkiOrder と末尾 iSyuuchakuEkiOrder の駅 index を比べ、
 * 始発 < 終着 → 下り / > → 上り / == → 先頭列車の方向のまま。
 * 戻り値は「決定した方向」と「一体化で吸収した件数」。
 */
function mergedHoukou(
  entries: readonly OperationTableEntry[],
  start: number,
  ekiCount: number,
  fallback: Ressyahoukou,
): { houkou: Ressyahoukou; absorbed: number } {
  const head = entries[start];
  if (head === undefined || head.afterType !== 'propertySame') {
    return { houkou: fallback, absorbed: 0 };
  }
  let i = start;
  let absorbed = 0;
  while (i + 1 < entries.length) {
    const cur = entries[i];
    const next = entries[i + 1];
    if (cur?.afterType !== 'propertySame' || next?.beforeType !== 'propertySame') break;
    i++;
    absorbed++;
  }
  const tail = entries[i];
  if (tail === undefined) return { houkou: fallback, absorbed };
  const sihatsuIndex = ekiIndexOfEkiOrder(
    head.sihatsuEkiOrder,
    ekiCount,
    head.ressyaProperty.houkou,
  );
  const syuuchakuIndex = ekiIndexOfEkiOrder(
    tail.syuuchakuEkiOrder,
    ekiCount,
    tail.ressyaProperty.houkou,
  );
  if (sihatsuIndex < syuuchakuIndex) return { houkou: 0, absorbed };
  if (sihatsuIndex > syuuchakuIndex) return { houkou: 1, absorbed };
  return { houkou: fallback, absorbed };
}

/** 1 列車ぶんのセルを作る。 */
function ressyaCell(
  rosen: Rosen,
  ressya: Ressya,
  houkou: Ressyahoukou,
  syubetsuIndex: number,
  arrowAfter: boolean,
): AllOperationTableRessyaCell {
  return {
    houkou,
    houkouText: houkouText(rosen, houkou),
    ressyabangou: ressya.ressyabangou,
    syubetsumei: rosen.ressyasyubetsuCont[syubetsuIndex]?.syubetsumei ?? '',
    syubetsuIndex,
    ressyamei: ressyameiText(ressya),
    arrowAfter,
  };
}

/**
 * 運用一覧表 / 運用一覧図の共通ビューモデルを組み立てる。
 *
 * @param operationTable deriveOperationFull の出力(Map<運用番号, 時刻順エントリ列>)
 */
export function deriveAllOperationTable(
  dia: Dia,
  rosen: Rosen,
  operationTable: ReadonlyMap<string, readonly OperationTableEntry[]>,
  opts: AllOperationTableOptions,
  brunchLoop: BrunchLoopMap,
): AllOperationTableViewModel {
  const ekiCont = rosen.ekiCont;
  const sortCtx: OperationSortContext = {
    ressyaCont: dia.ressyaCont,
    ekiCount: ekiCont.length,
    brunchLoop,
  };
  const order = sortOperationNumbers(
    operationTable,
    { sort: opts.sort, compareBottom: opts.compareBottom, kitenJikoku: opts.kitenJikoku },
    sortCtx,
  );

  // maxRessyaCount は全運用の最大値(原典 :1499-1526)。
  let maxRessyaCount = 0;
  for (const num of order) {
    const entries = operationTable.get(num) ?? [];
    maxRessyaCount = Math.max(maxRessyaCount, countRessyaInOperation(entries));
  }
  const slots = opts.displayAllRessya ? maxRessyaCount : 2;

  const ressyaOf = (e: OperationTableEntry): Ressya | undefined =>
    dia.ressyaCont[e.ressyaProperty.houkou]?.[e.ressyaProperty.ressyaIndex];

  const rows: AllOperationTableRow[] = order.map((operationNumber, rowIdx) => {
    const entries = operationTable.get(operationNumber) ?? [];
    const first = entries[0];
    const last = entries[entries.length - 1];
    const out =
      first === undefined
        ? { ekimei: '', jikoku: null, text: '' }
        : outSide(first, ressyaOf(first), ekiCont, opts.conv);
    const inn =
      last === undefined
        ? { ekimei: '', jikoku: null, text: '' }
        : inSide(last, ressyaOf(last), ekiCont, opts.conv);

    const cells: (AllOperationTableRessyaCell | null)[] = new Array<null>(slots).fill(null);
    if (opts.displayAllRessya) {
      // 同一列車扱いで一体化した区間は 1 列にまとめる(原典 :558-775)。
      let slot = 0;
      let propertySameCount = 0;
      for (let i = 0; i < entries.length && slot < slots; i++) {
        const e = entries[i];
        const r = e === undefined ? undefined : ressyaOf(e);
        if (e === undefined || r === undefined) continue;
        const merged = mergedHoukou(entries, i, ekiCont.length, e.ressyaProperty.houkou);
        propertySameCount += merged.absorbed;
        i += merged.absorbed;
        const syubetsuIndex = resolveSyubetsuIndex(
          rosen.ressyasyubetsuCont,
          r.syubetsuIndex,
          opts.displayParentSyubetsu,
        );
        // 矢印は「後続列車がまだある」ときのみ(原典 :746-772)。
        const arrowAfter = slot + propertySameCount < entries.length - 1 && slot < slots - 1;
        cells[slot] = ressyaCell(rosen, r, merged.houkou, syubetsuIndex, arrowAfter);
        slot++;
      }
    } else if (first !== undefined && last !== undefined) {
      // 出区列車 / 入区列車の 2 本固定。方向は一体化を考慮せず素の方向(原典 :846)。
      const rOut = ressyaOf(first);
      const rIn = ressyaOf(last);
      if (rOut !== undefined) {
        cells[0] = ressyaCell(
          rosen,
          rOut,
          first.ressyaProperty.houkou,
          resolveSyubetsuIndex(
            rosen.ressyasyubetsuCont,
            rOut.syubetsuIndex,
            opts.displayParentSyubetsu,
          ),
          true, // 原典 :1000 付近は常に "→"
        );
      }
      if (rIn !== undefined) {
        cells[1] = ressyaCell(
          rosen,
          rIn,
          last.ressyaProperty.houkou,
          resolveSyubetsuIndex(
            rosen.ressyasyubetsuCont,
            rIn.syubetsuIndex,
            opts.displayParentSyubetsu,
          ),
          false,
        );
      }
    }

    return {
      operationNumber,
      rowNumber: rowIdx + 1,
      outEkimei: out.ekimei,
      outJikokuText: out.text,
      outJikoku: out.jikoku,
      inEkimei: inn.ekimei,
      inJikokuText: inn.text,
      inJikoku: inn.jikoku,
      ressya: cells,
      entries,
    };
  });

  return {
    columns: buildAllOperationTableColumns(
      opts.displayRessyamei,
      opts.displayAllRessya,
      maxRessyaCount,
    ),
    rows,
    maxRessyaCount,
  };
}
