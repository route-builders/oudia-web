// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 up-tri
//
// Based on OuDiaSecond (Copyright (C) 2017-2026 diagram_mania)
// and OuDia (Copyright (C) 2006-2017 take-okm)

/**
 * カスタマイズ時刻表のセル充填(原典 CCellBuilderCustomize::update02_02_updateRessya、
 * ViewJikokuhyou/WndJikokuhyou/CCellBuilderCustomize.cpp:3902-4700)。follow-up #11。
 *
 * **1 列 = 1 チェーン**(CustomizeChainColumn)。列の中に複数の列車が縦に積まれ、
 * 駅を下るにつれて担当列車が切り替わる。
 *
 * ★原典は Y 行を**上から 1 回走査するだけで後戻りしない**。ここも同じ reducer にする。
 * 列内の状態は 4 つ:
 * - `idx`      … ressyaIndexCont の何番目か
 * - `ressya`   … 現在の列車
 * - `syuu`     … その列車の有効終着駅Order
 * - `prevTerm` … 直前列車の終着駅Order(原典 iCurrentRessyaShihatsuEkiOrder、初期 -1)
 *
 * ★**切替の比較演算子が着側と発側で違う**(原典 :4095 ほか vs :4396 ほか):
 * 着側行は `駅Order > syuu`、発側行は `>=`。つまり**切替駅では駅ブロックの着半分を
 * 前列車が、発半分を次列車が担当する**(番線も着側)。ここを取り違えると切替駅の
 * 時刻が 1 列車ぶんずれる。
 *
 * ★ヘッダ群(列車番号 / 運番 / 種別 / 列車名 / 号数 / 号 / 始発駅名)と備考は切替せず
 * **常にチェーン先頭列車**。終着駅名だけはループ後にもう一度上書きされるので実質
 * **最終列車**(原典 :4687-4719)。
 *
 * ★**空セルの既定はプレースホルダ**(主要駅表記なら「----」、他は「・・」。原典 :7195-7232)。
 * どの分岐にも当たらなければこれが残る。真の空文字は列車番号系テキスト行だけ。
 *
 * ★すべて oud2 非永続の派生表示情報 = 黄金テスト非該当。
 */

import {
  getOperationNumberAt,
  getValidSihatsuEki,
  getValidSyuuchakuEki,
  getVirtualChakuJikoku,
  getVirtualHatsuJikoku,
  isRunBetweenNextEki,
} from '@oudia-web/domain';
import type {
  Dia,
  Eki,
  Jikoku,
  JikokuConvOptions,
  Ressya,
  Ressyahoukou,
  Rosen,
} from '@oudia-web/format';
import { encodeJikokuCsv } from '@oudia-web/format';
import { getTrackRyakusyou } from '../csv/ekiDisplay.js';
import type { CustomizeChainColumn } from '../operationLight/types.js';
import { getKyoukaisen } from './cellSpec.js';
import type { CustomizeRowSpec } from './customizeColSpec.js';
import type { CellSpec, MarkKind } from './types.js';
import { MARK_GLYPH } from './types.js';

export interface CustomizeGridOptions {
  readonly conv: JikokuConvOptions;
  /**
   * [通過駅の駅時刻を表示する]。false のとき通過駅の着発は " ﾚ" になる。
   * ★原典は **!displayTsuukaEkiJikoku のときだけ** " ﾚ" にする(表示 ON なら実時刻を出す)。
   */
  readonly displayTsuukaEkiJikoku?: boolean;
}

/**
 * 路線外始発/終着欄の索引(原典 m_iOuterShihatsuDisplayEkiOrder /
 * m_iOuterShuchakuDisplayEkiOrder、CCellBuilderCustomize.cpp:12775-12800)。
 * - origin[e] = e **以下**で直近の「路線外始発欄あり」駅Order(前方走査。無ければ -1)
 * - terminal[e] = e **以上**で直近の「路線外終着欄あり」駅Order(後方走査。無ければ -1)
 * ★値は「駅Order」であって Y 行番号ではない。方向ごとに別物。
 */
export interface OuterDisplayIndex {
  readonly origin: readonly number[];
  readonly terminal: readonly number[];
}

/** 路線外欄の索引を前計算する。 */
export function buildOuterDisplayIndex(
  ekiCont: readonly Eki[],
  houkou: Ressyahoukou,
): OuterDisplayIndex {
  const n = ekiCont.length;
  const origin = new Array<number>(n).fill(-1);
  const terminal = new Array<number>(n).fill(-1);
  const ekiAt = (order: number): Eki | undefined => ekiCont[houkou === 0 ? order : n - 1 - order];
  let carry = -1;
  for (let o = 0; o < n; o++) {
    const d = ekiAt(o);
    const flag = houkou === 1 ? d?.jikokuhyouOuterDisplayNobori : d?.jikokuhyouOuterDisplayKudari;
    if (flag?.origin === true) carry = o;
    origin[o] = carry;
  }
  carry = -1;
  for (let o = n - 1; o >= 0; o--) {
    const d = ekiAt(o);
    const flag = houkou === 1 ? d?.jikokuhyouOuterDisplayNobori : d?.jikokuhyouOuterDisplayKudari;
    if (flag?.terminal === true) carry = o;
    terminal[o] = carry;
  }
  return { origin, terminal };
}

export interface CustomizeGridColumn {
  /** この列に積まれる列車 index(先頭列車の情報をヘッダに出す)。 */
  readonly ressyaIndexCont: readonly number[];
  /** rows と同じ長さのセル列。 */
  readonly cells: readonly CellSpec[];
}

/** マークセルを作る。 */
function markCell(mark: MarkKind, syubetsuIndex: number | null): CellSpec {
  return {
    text: MARK_GLYPH[mark],
    kind: 'mark',
    mark,
    style: {
      syubetsuIndex,
      mojiColor: null,
      fontIndex: null,
      backColor: null,
      tategaki: false,
    },
  };
}

/** テキストセルを作る。 */
function textCell(
  text: string,
  kind: CellSpec['kind'],
  syubetsuIndex: number | null,
  tsuuka = false,
): CellSpec {
  return {
    text,
    kind,
    mark: null,
    style: {
      syubetsuIndex,
      mojiColor: null,
      fontIndex: null,
      backColor: null,
      tategaki: false,
      tsuuka,
    },
  };
}

const EMPTY_CELL: CellSpec = {
  text: '',
  kind: 'empty',
  mark: null,
  style: {
    syubetsuIndex: null,
    mojiColor: null,
    fontIndex: null,
    backColor: null,
    tategaki: false,
  },
};

/**
 * 主要駅表記か(原典 bIsSyuyouEkiHyouki、CCellBuilderCustomize.cpp:7199-7213)。
 * 主要駅かつ中間駅かつ「着発どちらかが非表示」なら「----」、そうでなければ「・・」。
 * ★原典は境界線(Kyoukaisen)も見るが、そこは通常時刻表側の実装と共通化する余地があり未移植。
 */
function isSyuyouEkiHyouki(
  eki: Eki,
  ekiOrder: number,
  ekiCount: number,
  houkou: Ressyahoukou,
): boolean {
  if (eki.ekikibo !== 'syuyou') return false;
  if (!(ekiOrder > 0 && ekiOrder < ekiCount - 1)) return false;
  const d = houkou === 1 ? eki.jikokuhyouJikokuDisplayNobori : eki.jikokuhyouJikokuDisplayKudari;
  return !d.chaku || !d.hatsu;
}

/** 運行なしの既定プレースホルダ。 */
function placeholder(
  eki: Eki | undefined,
  ekiOrder: number,
  ekiCount: number,
  houkou: Ressyahoukou,
  syubetsuIndex: number | null,
): CellSpec {
  const syuyou = eki !== undefined && isSyuyouEkiHyouki(eki, ekiOrder, ekiCount, houkou);
  return markCell(syuyou ? 'unkounasiSyuyou' : 'unkounasiIppan', syubetsuIndex);
}

/** 列車名 + 号数(ヘッダ用)。 */
function ressyameiOf(ressya: Ressya): string {
  return ressya.ressyamei;
}

/**
 * 1 列(1 チェーン)のセルを埋める。
 *
 * @param rows buildCustomizeRowSpec の出力(この列と共通)
 */
export function fillCustomizeColumn(
  dia: Dia,
  rosen: Rosen,
  houkou: Ressyahoukou,
  column: CustomizeChainColumn,
  rows: readonly CustomizeRowSpec[],
  opts: CustomizeGridOptions,
): CustomizeGridColumn {
  const ekiCount = rosen.ekiCont.length;
  const list = dia.ressyaCont[houkou] ?? [];
  const ressyaOf = (i: number | undefined): Ressya | undefined =>
    i === undefined ? undefined : list[i];

  // ---- 列内の走査状態(原典 :3909-3968)----
  let idx = 0;
  let ressya = ressyaOf(column.ressyaIndexCont[0]);
  let syuu = ressya === undefined ? -1 : getValidSyuuchakuEki(ressya);
  /** 直前列車の終着駅Order(原典 iCurrentRessyaShihatsuEkiOrder)。 */
  let prevTerm = -1;
  const head = ressya;

  const outerIndex = buildOuterDisplayIndex(rosen.ekiCont, houkou);
  /** 駅ごとの運番段数(原典 getJikokuhyouOperationNumberDisplayRows)。 */
  const opNumberRowsAt = (r: Rosen, h: Ressyahoukou, ekiOrder: number | null): number => {
    if (ekiOrder === null) return 1;
    const n = r.ekiCont.length;
    const eki = r.ekiCont[h === 0 ? ekiOrder : n - 1 - ekiOrder];
    if (eki === undefined) return 1;
    const d =
      h === 1
        ? eki.jikokuhyouSyubetsuChangeDisplayNobori
        : eki.jikokuhyouSyubetsuChangeDisplayKudari;
    return d.operationNumberRows;
  };
  const cells: CellSpec[] = [];
  for (const [y, row] of rows.entries()) {
    // ★列車切替。着側は `>`、発側は `>=`(原典の非対称)。
    if (row.side !== null && row.ekiOrder !== null && column.ressyaIndexCont.length > 0) {
      const e = row.ekiOrder;
      const advance =
        idx < column.ressyaIndexCont.length - 1 &&
        syuu !== -1 &&
        (row.side === 'arrival' ? e > syuu : e >= syuu);
      if (advance) {
        idx += 1;
        prevTerm = syuu;
        ressya = ressyaOf(column.ressyaIndexCont[idx]);
        syuu = ressya === undefined ? -1 : getValidSyuuchakuEki(ressya);
      }
    }
    cells.push(
      fillRow(row, {
        dia,
        rosen,
        houkou,
        column,
        ressya,
        head,
        idx,
        prevTerm,
        opts,
        rows,
        y,
        outerIndex,
        list,
        opNumberRows: opNumberRowsAt(rosen, houkou, row.ekiOrder),
      }),
    );
  }

  // ★終着駅名はループ後にもう一度上書き = 実質「最終列車」(原典 :4687-4719)。
  const lastRessya = ressyaOf(column.ressyaIndexCont[column.ressyaIndexCont.length - 1]);
  for (const [i, row] of rows.entries()) {
    if (row.type !== 'shuchakuEkimei') continue;
    const order = lastRessya === undefined ? -1 : getValidSyuuchakuEki(lastRessya);
    const ekiIndex = houkou === 0 ? order : ekiCount - 1 - order;
    cells[i] = textCell(
      order < 0 ? '' : (rosen.ekiCont[ekiIndex]?.ekimei ?? ''),
      'text',
      lastRessya?.syubetsuIndex ?? null,
    );
  }

  return { ressyaIndexCont: column.ressyaIndexCont, cells };
}

interface FillCtx {
  dia: Dia;
  rosen: Rosen;
  houkou: Ressyahoukou;
  column: CustomizeChainColumn;
  /** 現在の担当列車。 */
  ressya: Ressya | undefined;
  /** チェーン先頭列車(ヘッダ用)。 */
  head: Ressya | undefined;
  idx: number;
  prevTerm: number;
  opts: CustomizeGridOptions;
  /** 行スペック全体。上下行の判定(「====」「↴」「↳」)に要る。 */
  rows: readonly CustomizeRowSpec[];
  /** この行の index。 */
  y: number;
  outerIndex: OuterDisplayIndex;
  /** この方向の列車リスト(チェーン内の前後列車を引く)。 */
  list: readonly Ressya[];
  /** 駅別運番欄の段数(原典 getJikokuhyouOperationNumberDisplayRows)。 */
  opNumberRows: number;
}

/** 1 セルを埋める。 */
function fillRow(row: CustomizeRowSpec, ctx: FillCtx): CellSpec {
  const { rosen, houkou, head, ressya } = ctx;
  const ekiCount = rosen.ekiCont.length;
  const headSyubetsu = head?.syubetsuIndex ?? null;

  // ---- ヘッダ群 / 備考: 常にチェーン先頭列車 ----
  switch (row.type) {
    case 'ressyabangou':
      return textCell(head?.ressyabangou ?? '', 'text', headSyubetsu);
    case 'ressyasyubetsu':
      // ★種別欄は**略称**(原典 getRyakusyou。列ヘッダ :5062 / 駅別 :9858)。
      return textCell(
        head === undefined ? '' : (rosen.ressyasyubetsuCont[head.syubetsuIndex]?.ryakusyou ?? ''),
        'text',
        headSyubetsu,
      );
    case 'ressyamei':
      return textCell(head === undefined ? '' : ressyameiOf(head), 'text', headSyubetsu);
    case 'gousuu':
      return textCell(head?.gousuu ?? '', 'text', headSyubetsu);
    case 'gou':
      return textCell(head?.gousuu === '' || head === undefined ? '' : '号', 'text', headSyubetsu);
    case 'shihatsuEkimei': {
      const order = head === undefined ? -1 : getValidSihatsuEki(head);
      const ekiIndex = houkou === 0 ? order : ekiCount - 1 - order;
      return textCell(
        order < 0 ? '' : (rosen.ekiCont[ekiIndex]?.ekimei ?? ''),
        'text',
        headSyubetsu,
      );
    }
    case 'shuchakuEkimei':
      // ループ後に最終列車で上書きされる。ここでは仮置き。
      return textCell('', 'text', headSyubetsu);
    case 'bikou':
      return textCell(head?.bikou ?? '', 'text', headSyubetsu);
    default:
      break;
  }

  const e = row.ekiOrder;
  if (e === null || ressya === undefined) return EMPTY_CELL;
  const ekiIndex = houkou === 0 ? e : ekiCount - 1 - e;
  const eki = rosen.ekiCont[ekiIndex];
  const syubetsuIndex = ressya.syubetsuIndex;
  const sihatsu = getValidSihatsuEki(ressya);
  const syuuchaku = getValidSyuuchakuEki(ressya);

  switch (row.type) {
    case 'chaku':
      return jikokuCell(row, ctx, e, true);
    case 'hatsu':
      return jikokuCell(row, ctx, e, false);
    case 'track': {
      if (e < sihatsu || e > syuuchaku) {
        return placeholder(eki, e, ekiCount, houkou, syubetsuIndex);
      }
      const slot = ressya.ekiJikokuCont[e];
      if (slot === undefined || slot.ressyaTrackIndex === null || eki === undefined) {
        return EMPTY_CELL;
      }
      const t = eki.ekiTrack2Cont[slot.ressyaTrackIndex];
      return t === undefined
        ? EMPTY_CELL
        : textCell(getTrackRyakusyou(t, houkou), 'track', syubetsuIndex);
    }
    case 'ekiRessyabangou':
    case 'ekiOperationNumber':
    case 'ekiRessyasyubetsu':
    case 'ekiRessyamei':
      return ekiInfoCell(row, ctx, e, eki, sihatsu, syuuchaku);
    case 'ekiGousuu':
    case 'ekiGou':
      // ★原典は EkiRessyamei のハンドラが号数・号の 2 セルも同時に書く(:10272)。
      // 専用のセル充填関数は存在しない(:10690 以降は全体コメントアウト)。
      return ekiGousuuCell(row, ctx, e, sihatsu, syuuchaku);
    default:
      // EkiPrev* / EkiOuter* / 入線 は後続。
      return EMPTY_CELL;
  }
}

/** 駅の「自列車情報欄」の表示設定(原典 getJikokuhyou*Display)。 */
function ekiDisplayValue(
  eki: Eki | undefined,
  houkou: Ressyahoukou,
  type: CustomizeRowSpec['type'],
): number {
  if (eki === undefined) return 0;
  const d =
    houkou === 1
      ? eki.jikokuhyouSyubetsuChangeDisplayNobori
      : eki.jikokuhyouSyubetsuChangeDisplayKudari;
  switch (type) {
    case 'ekiRessyabangou':
      return d.ressyabangou;
    case 'ekiOperationNumber':
      return d.operationNumber;
    case 'ekiRessyasyubetsu':
      return d.syubetsu;
    case 'ekiRessyamei':
      return d.ressyamei;
    default:
      return 0;
  }
}

/**
 * Eki*(その駅から出て行く列車の情報)のセル(原典 :8788-10688)。
 *
 * ★4 種とも同じ 7 分岐の骨格を持つ:
 * (A) 列車 NULL / (B) 有効始発終着なし / (C) e < 始発 / (D) e == 始発 /
 * (E) 中間駅 / (F) e == 終着 / (G) e > 終着。
 *
 * ★Display 値の意味(列車番号 / 種別 / 列車名): 1 = 種別変更時のみ / 2 = 種別・列車情報
 * 変更時 / 3 = 常に表示。**運用番号だけ 1 = 運番が変化したときのみ / 2 = 種別変更時 /
 * 3 = 種別・列車情報変更時 / 4 = 常に表示**とずれる。
 *
 * ★e == 有効始発 で 1 列車目かつ Display が最大値でないセルは **空文字**(「↓」ではない)。
 * 列ヘッダに既に列車番号・運番があるための意図的な仕様。
 *
 * ★Eki* は**発側**なので、切替駅では次列車が担当する。結果 e == 終着 の分岐に入るのは
 * チェーン最終列車のときだけ。
 */
function ekiInfoCell(
  row: CustomizeRowSpec,
  ctx: FillCtx,
  e: number,
  eki: Eki | undefined,
  sihatsu: number,
  syuuchaku: number,
): CellSpec {
  const { rosen, houkou, ressya, prevTerm, column, list, idx } = ctx;
  if (ressya === undefined) return EMPTY_CELL;
  const type = row.type;
  const isOpNum = type === 'ekiOperationNumber';
  const isMei = type === 'ekiRessyamei';
  const d = ekiDisplayValue(eki, houkou, type);
  const top = isOpNum ? 4 : 3; // 「常に表示」の値
  const mid = isOpNum ? 3 : 2; // 「列車情報変更でも表示」の値
  let sIdx = ressya.syubetsuIndex;

  /** その分岐で出す「値」。 */
  const ownValue = (): CellSpec => {
    switch (type) {
      case 'ekiRessyabangou':
        return textCell(ressya.ressyabangou, 'text', sIdx);
      case 'ekiOperationNumber':
        return operationNumberCell(getOperationNumberAt(ressya, e), row.operationIndex, ctx, sIdx);
      case 'ekiRessyasyubetsu':
        return textCell(rosen.ressyasyubetsuCont[sIdx]?.ryakusyou ?? '', 'text', sIdx);
      default:
        return textCell(ressya.ressyamei, 'text', sIdx);
    }
  };
  const mark = (m: MarkKind): CellSpec =>
    isOpNum ? operationNumberMarkCell(m, row.operationIndex, ctx, sIdx) : markCell(m, sIdx);

  if (sihatsu < 0 || syuuchaku < 0) return EMPTY_CELL;

  // ---- (C) 始発より手前 ----
  if (e < sihatsu) {
    if (isMei) return EMPTY_CELL; // ★列車名は常に空
    if (prevTerm >= 0) {
      if (e === prevTerm && hatsuDisp(eki, houkou)) {
        const prev = list[column.ressyaIndexCont[idx - 1] ?? -1];
        const pSlot = prev === undefined ? undefined : prev.ekiJikokuCont[e];
        return chakuDisp(eki, houkou) && pSlot?.hatsuJikoku === null
          ? mark('keiyunasi')
          : EMPTY_CELL;
      }
      return mark('keiyunasi');
    }
    const osdS = ctx.outerIndex.origin[sihatsu] ?? -1;
    const firstOuter = ressya.ekiJikokuCont[sihatsu]?.beforeOperationCont[0]?.kind === 'outer';
    if (firstOuter && osdS >= 0 && osdS <= e) return mark('keiyunasi');
    if (column.sihatsuEkiOrder >= -2 && osdS >= 0 && osdS <= e) {
      sIdx = column.prevRessyasyubetsuIndex;
      return mark('keiyunasi');
    }
    if (column.releaseEkiOrder >= 0 && column.releaseEkiOrder <= e) return mark('keiyunasi');
    return EMPTY_CELL;
  }

  // ---- (D) 始発ちょうど ----
  if (e === sihatsu) {
    if (d === top) return ownValue();
    if (isOpNum && d === 1 && prevTerm >= 0) {
      const prev = list[column.ressyaIndexCont[idx - 1] ?? -1];
      const before =
        prev === undefined ? [] : getOperationNumberAt(prev, getValidSyuuchakuEki(prev) - 1);
      const now = getOperationNumberAt(ressya, e);
      return before.join('\u0001') !== now.join('\u0001')
        ? operationNumberCell(now, row.operationIndex, ctx, sIdx)
        : mark('kudari');
    }
    if (prevTerm >= 0 && d >= 1) {
      const prev = list[column.ressyaIndexCont[idx - 1] ?? -1];
      const jt = lastJunctionType(prev);
      if (jt === 'classChange') return ownValue();
      if (jt === 'propertyChange' && d === mid) return ownValue();
      return isMei ? EMPTY_CELL : mark('kudari');
    }
    return EMPTY_CELL; // ★1 列車目で Display が最大値でなければ空文字
  }

  // ---- (E) 中間駅 ----
  if (e < syuuchaku) {
    const runs =
      isRunBetweenNextEki(ressya, e) ||
      (!chakuDisp(eki, houkou) && isRunBetweenNextEki(ressya, e - 1));
    if (!runs) return isMei ? EMPTY_CELL : mark('keiyunasi');
    if (d === top) return ownValue();
    if (isOpNum && d === 1) {
      const before = getOperationNumberAt(ressya, e - 1);
      const now = getOperationNumberAt(ressya, e);
      return before.join('\u0001') !== now.join('\u0001')
        ? operationNumberCell(now, row.operationIndex, ctx, sIdx)
        : mark('kudari');
    }
    return isMei ? EMPTY_CELL : mark('kudari');
  }

  // ---- (F) 終着ちょうど(チェーン最終列車のみ到達)----
  const osdE = ctx.outerIndex.terminal[syuuchaku] ?? -1;
  const afterCont = ressya.ekiJikokuCont[syuuchaku]?.afterOperationCont ?? [];
  const lastOuter = afterCont[afterCont.length - 1]?.kind === 'outer';
  if (e === syuuchaku) {
    if (lastOuter && osdE >= 0) return isMei ? EMPTY_CELL : mark('kudari');
    if (column.syuuchakuEkiOrder >= -2 && osdE >= 0) {
      // ★路線外終着「相当」。次列車の情報を、次列車の種別書式で描く。
      sIdx = column.ressyasyubetsuIndex;
      const colValue = (): CellSpec => {
        switch (type) {
          case 'ekiRessyabangou':
            return textCell(column.ressyabangou, 'text', sIdx);
          case 'ekiOperationNumber':
            return operationNumberCell(column.operationNumber, row.operationIndex, ctx, sIdx);
          case 'ekiRessyasyubetsu':
            return textCell(rosen.ressyasyubetsuCont[sIdx]?.ryakusyou ?? '', 'text', sIdx);
          default:
            return textCell(column.ressyamei, 'text', sIdx);
        }
      };
      if (d === top) return colValue();
      if (isOpNum && d === 1) {
        const before = getOperationNumberAt(ressya, e - 1);
        return before.join('\u0001') !== column.operationNumber.join('\u0001')
          ? colValue()
          : mark('kudari');
      }
      if (column.afterType === 'classChange') return colValue();
      if (column.afterType === 'propertyChange' && d === mid) return colValue();
      return mark('kudari');
    }
    if (column.connectEkiOrder >= 0 && column.connectEkiOrder > e) return mark('keiyunasi');
    return EMPTY_CELL;
  }

  // ---- (G) 終着より先 ----
  if ((lastOuter || column.syuuchakuEkiOrder >= -2) && osdE >= 0 && osdE >= e) {
    if (!lastOuter) sIdx = column.ressyasyubetsuIndex;
    return mark('keiyunasi');
  }
  if (column.connectEkiOrder >= 0 && column.connectEkiOrder > e) return mark('keiyunasi');
  return EMPTY_CELL;
}

/** 号数 / 号のセル(原典は EkiRessyamei ハンドラが同時に書く)。 */
function ekiGousuuCell(
  row: CustomizeRowSpec,
  ctx: FillCtx,
  e: number,
  sihatsu: number,
  syuuchaku: number,
): CellSpec {
  const { ressya, rosen, houkou } = ctx;
  if (ressya === undefined || sihatsu < 0 || syuuchaku < 0) return EMPTY_CELL;
  const eki = ekiAtOrder(rosen, houkou, e);
  // 列車名セルが値を出す条件と同じときだけ号数・号を出す。
  const meiRow: CustomizeRowSpec = { ...row, type: 'ekiRessyamei' };
  const mei = ekiInfoCell(meiRow, ctx, e, eki, sihatsu, syuuchaku);
  if (mei.kind !== 'text' || mei.text === '') return EMPTY_CELL;
  if (ressya.gousuu === '') return EMPTY_CELL;
  return textCell(row.type === 'ekiGousuu' ? ressya.gousuu : '号', 'text', ressya.syubetsuIndex);
}

/** 末尾作業の次列車接続タイプ(原典 getLastOperation().getNextJunctionType())。 */
function lastJunctionType(ressya: Ressya | undefined): string {
  if (ressya === undefined) return 'unrelated';
  const syuu = getValidSyuuchakuEki(ressya);
  if (syuu < 0) return 'unrelated';
  const cont = ressya.ekiJikokuCont[syuu]?.afterOperationCont ?? [];
  const last = cont[cont.length - 1];
  // ★末尾が junction でなければ既定オブジェクトが返るので unrelated 扱い
  // (原典 CentDedRessya.cpp:1575-1592)。
  return last?.kind === 'junction' ? last.junctionType : 'unrelated';
}

/**
 * 運用番号ブロックの 1 段(原典 iDisplayType == 1、:9679-9760)。
 * 最下段以外は先頭 1 個ずつ、最下段で残り全部を `+` 連結、2 段目以降は先頭に `+`。
 */
function operationNumberCell(
  numbers: readonly string[],
  stage: number,
  ctx: FillCtx,
  syubetsuIndex: number,
): CellSpec {
  const rows = operationNumberRowsOf(ctx);
  if (numbers.length === 0) return EMPTY_CELL;
  const last = stage === rows - 1;
  const text = last ? numbers.slice(stage).join('+') : (numbers[stage] ?? '');
  if (text === '') return EMPTY_CELL;
  return textCell(stage > 0 ? `+${text}` : text, 'operationNumber', syubetsuIndex);
}

/**
 * 運用番号ブロックのマーク段(原典 iDisplayType 2..5、:9736-9760)。
 * ★「||」「↓」は**全段に**出る。「↴」は最下段のみ、「↳」は先頭段のみ。
 */
function operationNumberMarkCell(
  m: MarkKind,
  stage: number,
  ctx: FillCtx,
  syubetsuIndex: number,
): CellSpec {
  const rows = operationNumberRowsOf(ctx);
  if (m === 'release') return stage === rows - 1 ? markCell(m, syubetsuIndex) : EMPTY_CELL;
  if (m === 'connect') return stage === 0 ? markCell(m, syubetsuIndex) : EMPTY_CELL;
  return markCell(m, syubetsuIndex);
}

/** その駅の運番段数。 */
function operationNumberRowsOf(ctx: FillCtx): number {
  return Math.max(1, ctx.opNumberRows);
}

/** その方向の駅(駅Order → Eki)。 */
function ekiAtOrder(rosen: Rosen, houkou: Ressyahoukou, ekiOrder: number): Eki | undefined {
  const n = rosen.ekiCont.length;
  return rosen.ekiCont[houkou === 0 ? ekiOrder : n - 1 - ekiOrder];
}

/** 着時刻表示 / 発時刻表示(カスタマイズは駅の個別設定)。 */
function chakuDisp(eki: Eki | undefined, houkou: Ressyahoukou): boolean {
  if (eki === undefined) return false;
  return houkou === 1
    ? eki.jikokuhyouJikokuDisplayNobori.chaku
    : eki.jikokuhyouJikokuDisplayKudari.chaku;
}
function hatsuDisp(eki: Eki | undefined, houkou: Ressyahoukou): boolean {
  if (eki === undefined) return false;
  return houkou === 1
    ? eki.jikokuhyouJikokuDisplayNobori.hatsu
    : eki.jikokuhyouJikokuDisplayKudari.hatsu;
}

/**
 * 秒丸めの補助時刻(原典 refer)。規則は 2 種類だけ(:7495-7542 ほか)。
 * - 着として表示するセル: (!秒表示 && 着丸め==2 && 発丸め<=1) のときだけ発時刻を渡す
 * - 発として表示するセル: (!秒表示 && 着丸め>=1 && 発丸め==0) のときだけ着時刻を渡す
 */
function referForChaku(conv: JikokuConvOptions, hatsu: Jikoku): Jikoku {
  return !conv.outputSecond && conv.secondRoundChaku === 2 && conv.secondRoundHatsu <= 1
    ? hatsu
    : null;
}
function referForHatsu(conv: JikokuConvOptions, chaku: Jikoku): Jikoku {
  return !conv.outputSecond && conv.secondRoundChaku >= 1 && conv.secondRoundHatsu === 0
    ? chaku
    : null;
}

/**
 * 着 / 発の時刻セル(原典 setRessya_Chaku :7131-8078 / setRessya_Hatsu :11022-11938)。
 *
 * 最上位の梯子は 6 分岐(:7334-8030):
 * (1) 有効始発 / 終着が取れない → 既定プレースホルダのまま
 * (2) e < 始発 / (3) e == 始発 / (4) e == 終着 / (5) e > 終着 / (6) 中間駅
 *
 * ★「====」は梯子の else ではなく**後置の独立 if**で、直前の「||」「↳」を**上書きする**
 * (:7753-7771 / :11616-11635)。
 * ★末尾にさらに「↴」「↳」の無条件上書きがある(:8038-8078 / :11898-11938)。
 * ★通過駅の " ﾚ" は **[通過駅時刻を表示] が OFF のときだけ**(全分岐で同じガード)。
 */
function jikokuCell(row: CustomizeRowSpec, ctx: FillCtx, e: number, isChaku: boolean): CellSpec {
  const { rosen, houkou, ressya, prevTerm, opts, column, rows, y, outerIndex, list, idx } = ctx;
  const ekiCount = rosen.ekiCont.length;
  const eki = ekiAtOrder(rosen, houkou, e);
  const conv = opts.conv;
  const dispTsuuka = opts.displayTsuukaEkiJikoku === true;

  // ---- 列車 NULL(路線外表示専用列)。原典 :7238-7315 / :11127-11208 ----
  if (ressya === undefined) {
    const sIdx =
      column.connectEkiOrder >= 0 ? column.prevRessyasyubetsuIndex : column.ressyasyubetsuIndex;
    const rel = column.releaseEkiOrder;
    const con = column.connectEkiOrder;
    if (rel >= 0) {
      if (isChaku) {
        if (e === rel) return markCell('release', sIdx);
        if (e > rel && e <= (outerIndex.terminal[rel] ?? -1)) return markCell('keiyunasi', sIdx);
      } else if (e === rel) {
        return textCell(encodeJikokuCsv(column.hatsuJikoku, false, null, conv), 'jikoku', sIdx);
      }
    }
    if (con >= 0) {
      if (isChaku) {
        if (e === con) {
          return textCell(encodeJikokuCsv(column.chakuJikoku, true, null, conv), 'jikoku', sIdx);
        }
        if ((outerIndex.origin[con] ?? -1) <= e && e < con) return markCell('keiyunasi', sIdx);
      } else if (e === con) {
        return markCell('connect', sIdx);
      }
    }
    return EMPTY_CELL;
  }

  const syubetsuIndex = ressya.syubetsuIndex;
  const sihatsu = getValidSihatsuEki(ressya);
  const syuu = getValidSyuuchakuEki(ressya);
  const ph = (): CellSpec => placeholder(eki, e, ekiCount, houkou, syubetsuIndex);
  if (sihatsu < 0 || syuu < 0) return ph();

  const slot = ressya.ekiJikokuCont[e];
  const osdS = outerIndex.origin[sihatsu] ?? -1;
  const osdE = outerIndex.terminal[syuu] ?? -1;
  const firstOuter = ressya.ekiJikokuCont[sihatsu]?.beforeOperationCont[0]?.kind === 'outer';
  const afterCont = ressya.ekiJikokuCont[syuu]?.afterOperationCont ?? [];
  const lastOuter = afterCont[afterCont.length - 1]?.kind === 'outer';

  /** 梯子の結果。null = プレースホルダ。 */
  let cell: CellSpec | null = null;

  if (e < sihatsu) {
    // ---- (2) 始発より手前(:7338-7379 / :11227-11353)----
    if (firstOuter && osdS >= 0 && osdS <= e) cell = markCell('keiyunasi', syubetsuIndex);
    else if (
      column.sihatsuEkiOrder >= -2 &&
      osdS >= 0 &&
      osdS <= e &&
      // ★発側だけ idx === 0 の条件が付く(原典の非対称。:11238 vs :7350)
      (isChaku || idx === 0)
    ) {
      cell = markCell('keiyunasi', column.prevRessyasyubetsuIndex);
    } else if (prevTerm >= 0) {
      cell = switchStationCell(ctx, e, isChaku, sihatsu, syuu);
    } else if (column.releaseEkiOrder >= 0) {
      const rel = column.releaseEkiOrder;
      if (isChaku) {
        if (e === rel) cell = markCell('release', syubetsuIndex);
        else if (rel < e) cell = markCell('keiyunasi', syubetsuIndex);
      } else if (rel <= e) {
        cell =
          e === rel && !chakuDisp(eki, houkou)
            ? markCell('release', syubetsuIndex)
            : markCell('keiyunasi', syubetsuIndex);
      }
    }
  } else if (e === sihatsu && isChaku && prevTerm >= 0 && prevTerm < e) {
    // ---- (3) 始発ちょうど かつ チェーンの 2 列車目以降(:7471-7544)----
    cell = switchStationCell(ctx, e, true, sihatsu, syuu);
  } else if (e === syuu && isChaku && idx < column.ressyaIndexCont.length - 1) {
    // ---- (4) 終着ちょうど かつ 次列車あり(:7663-7696)----
    if (slot?.ekiatsukai === 'tsuuka' && !dispTsuuka) cell = markCell('tsuuka', syubetsuIndex);
    else if (slot !== undefined) {
      const nx = list[column.ressyaIndexCont[idx + 1] ?? -1];
      const nSlot = nx === undefined ? undefined : nx.ekiJikokuCont[getValidSihatsuEki(nx)];
      const refer = referForChaku(conv, nSlot === undefined ? null : getVirtualHatsuJikoku(nSlot));
      cell = textCell(
        encodeJikokuCsv(getVirtualChakuJikoku(slot), true, refer, conv),
        'jikoku',
        syubetsuIndex,
      );
    }
  } else if (e > syuu) {
    // ---- (5) 終着より先(:7707-7743)----
    if (lastOuter && osdE >= 0 && osdE >= e) cell = markCell('keiyunasi', syubetsuIndex);
    else if (column.syuuchakuEkiOrder >= -2 && osdE >= 0 && osdE >= e) {
      cell = markCell('keiyunasi', column.ressyasyubetsuIndex);
    } else if (column.connectEkiOrder >= e && column.connectEkiOrder >= 0) {
      cell =
        column.connectEkiOrder === e && !chakuDisp(eki, houkou)
          ? markCell('connect', syubetsuIndex)
          : markCell('keiyunasi', syubetsuIndex);
    }
  } else if (e >= sihatsu && e <= syuu) {
    // ---- (3)(4)(6) 通常の運行範囲内 ----
    if (slot === undefined || slot.ekiatsukai === 'none') {
      cell = markCell('keiyunasi', syubetsuIndex);
    } else if (slot.ekiatsukai === 'tsuuka' && !dispTsuuka) {
      cell = markCell('tsuuka', syubetsuIndex);
    } else {
      const value = isChaku ? getVirtualChakuJikoku(slot) : getVirtualHatsuJikoku(slot);
      const refer = isChaku
        ? referForChaku(conv, getVirtualHatsuJikoku(slot))
        : referForHatsu(conv, getVirtualChakuJikoku(slot));
      cell =
        value === null
          ? markCell('keiyunasi', syubetsuIndex)
          : textCell(encodeJikokuCsv(value, isChaku, refer, conv), 'jikoku', syubetsuIndex);
    }
  }

  // ---- 「====」は後置の独立 if。上を**上書きする**(:7753-7771 / :11616-11635)----
  // ★col.syuuchakuEkiOrder < -2 は「通常表示(INT_MIN)」のみ。-1(環状)/-2(環状線)は
  // 路線外終着相当なので ==== を出さない。
  if (
    e === syuu + 1 &&
    ((!lastOuter && column.syuuchakuEkiOrder < -2 && column.connectEkiOrder < 0) || osdE < 0)
  ) {
    const up = rows[y - 1];
    const prevEki = ekiAtOrder(rosen, houkou, e - 1);
    if (
      up !== undefined &&
      up.ekiOrder === e - 1 &&
      !getKyoukaisen(rosen.ekiCont, e - 1, houkou) &&
      ((up.type === 'hatsu' && !chakuDisp(prevEki, houkou)) || up.type === 'chaku')
    ) {
      cell = markCell('syuuchaku', syubetsuIndex);
    }
  }

  // ---- 末尾の「↴」「↳」無条件上書き(:8038-8078 / :11898-11938)----
  const nextEki = ekiAtOrder(rosen, houkou, e + 1);
  if (
    e + 1 === sihatsu &&
    e + 1 === column.releaseEkiOrder &&
    !chakuDisp(nextEki, houkou) &&
    hatsuDisp(nextEki, houkou) &&
    rows[y + 1]?.ekiOrder === e + 1
  ) {
    cell = markCell('release', syubetsuIndex);
  }
  const prevEki2 = ekiAtOrder(rosen, houkou, e - 1);
  if (
    e - 1 === syuu &&
    e - 1 === column.connectEkiOrder &&
    syuu !== -1 &&
    chakuDisp(prevEki2, houkou) &&
    !hatsuDisp(prevEki2, houkou) &&
    rows[y - 1]?.ekiOrder === e - 1
  ) {
    cell = markCell('connect', syubetsuIndex);
  }

  void row;
  return cell ?? ph();
}

/**
 * 切替駅(チェーン内側)の着発セル(原典 Chaku :7471-7544 / Hatsu :11249-11335)。
 *
 * ★着側は「e === 有効始発」で発火し、**前列車の終着駅の着時刻**を出す。
 * ★発側は「prevTerm === e」(切替駅そのもの)でだけ発火し、**当列車の有効始発スロットの
 * 発時刻**を出す(e スロットではない)。それ以外の行は無条件「||」。
 * ★発側の判定に使うのは前列車スロットの **生の発時刻**(virtual ではない)。
 * ★発側の書式は 種別 index = 当列車 / 駅扱い = 前列車終着スロット の混成。
 */
function switchStationCell(
  ctx: FillCtx,
  e: number,
  isChaku: boolean,
  sihatsu: number,
  _syuu: number,
): CellSpec | null {
  const { rosen, houkou, ressya, prevTerm, opts, column, list, idx } = ctx;
  if (ressya === undefined) return null;
  const conv = opts.conv;
  const dispTsuuka = opts.displayTsuukaEkiJikoku === true;
  const eki = ekiAtOrder(rosen, houkou, e);
  const syubetsuIndex = ressya.syubetsuIndex;

  const prev = list[column.ressyaIndexCont[idx - 1] ?? -1];
  if (prev === undefined) return markCell('keiyunasi', syubetsuIndex);
  const pSlot = prev.ekiJikokuCont[getValidSyuuchakuEki(prev)];
  if (pSlot === undefined) return markCell('keiyunasi', syubetsuIndex);

  if (isChaku) {
    const slot = ressya.ekiJikokuCont[e];
    if (slot === undefined) return markCell('keiyunasi', syubetsuIndex);
    if (slot.ekiatsukai === 'tsuuka' && !dispTsuuka) {
      return hatsuDisp(eki, houkou)
        ? markCell('keiyunasi', syubetsuIndex)
        : markCell('tsuuka', syubetsuIndex);
    }
    if (slot.chakuJikoku !== null) {
      const refer = referForChaku(conv, getVirtualHatsuJikoku(slot));
      return textCell(
        encodeJikokuCsv(getVirtualChakuJikoku(pSlot), true, refer, conv),
        'jikoku',
        syubetsuIndex,
      );
    }
    if (hatsuDisp(eki, houkou)) return markCell('keiyunasi', syubetsuIndex);
    const refer = referForHatsu(conv, getVirtualChakuJikoku(pSlot));
    return textCell(
      encodeJikokuCsv(getVirtualHatsuJikoku(slot), false, refer, conv),
      'jikoku',
      syubetsuIndex,
    );
  }

  // ---- 発側 ----
  if (prevTerm !== e) return markCell('keiyunasi', syubetsuIndex);
  const sSlot = ressya.ekiJikokuCont[sihatsu];
  if (pSlot.ekiatsukai === 'tsuuka' && !dispTsuuka) {
    return chakuDisp(eki, houkou)
      ? markCell('keiyunasi', syubetsuIndex)
      : markCell('tsuuka', syubetsuIndex);
  }
  // ★生の発時刻で判定する(virtual ではない)。
  if (pSlot.hatsuJikoku !== null && sSlot !== undefined) {
    const refer = referForHatsu(conv, getVirtualChakuJikoku(pSlot));
    return textCell(
      encodeJikokuCsv(getVirtualHatsuJikoku(sSlot), false, refer, conv),
      'jikoku',
      syubetsuIndex,
    );
  }
  if (chakuDisp(eki, houkou)) return markCell('keiyunasi', syubetsuIndex);
  const refer = referForChaku(conv, sSlot === undefined ? null : getVirtualHatsuJikoku(sSlot));
  return textCell(
    encodeJikokuCsv(getVirtualChakuJikoku(pSlot), true, refer, conv),
    'jikoku',
    syubetsuIndex,
  );
}

/** ダイヤ 1 本ぶんのカスタマイズ時刻表グリッド(方向別)。 */
export function buildCustomizeGrid(
  dia: Dia,
  rosen: Rosen,
  houkou: Ressyahoukou,
  chains: readonly CustomizeChainColumn[],
  rows: readonly CustomizeRowSpec[],
  opts: CustomizeGridOptions,
): CustomizeGridColumn[] {
  return chains.map((c) => fillCustomizeColumn(dia, rosen, houkou, c, rows, opts));
}
