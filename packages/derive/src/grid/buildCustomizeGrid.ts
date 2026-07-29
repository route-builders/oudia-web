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

import { getValidSihatsuEki, getValidSyuuchakuEki } from '@oudia-web/domain';
import type { Dia, Eki, JikokuConvOptions, Ressya, Ressyahoukou, Rosen } from '@oudia-web/format';
import { encodeJikokuCsv } from '@oudia-web/format';
import { getTrackRyakusyou } from '../csv/ekiDisplay.js';
import type { CustomizeChainColumn } from '../operationLight/types.js';
import type { CustomizeRowSpec } from './customizeColSpec.js';
import type { CellSpec, MarkKind } from './types.js';
import { MARK_GLYPH } from './types.js';

export interface CustomizeGridOptions {
  readonly conv: JikokuConvOptions;
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

  const cells: CellSpec[] = [];
  for (const row of rows) {
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
    cells.push(fillRow(row, { dia, rosen, houkou, column, ressya, head, idx, prevTerm, opts }));
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
      return textCell(
        head === undefined ? '' : (rosen.ressyasyubetsuCont[head.syubetsuIndex]?.syubetsumei ?? ''),
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
      return jikokuCell(row, ctx, e, eki, sihatsu, syuuchaku, true);
    case 'hatsu':
      return jikokuCell(row, ctx, e, eki, sihatsu, syuuchaku, false);
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
    default:
      // EkiPrev* / Eki* / EkiOuter* / 入線 は後続タスク(原典の分岐が非常に多い)。
      return EMPTY_CELL;
  }
}

/**
 * 着 / 発の時刻セル(原典 setRessya_Chaku :7131-8036 / setRessya_Hatsu :11022-11940 の
 * 主要 5 分岐)。
 *
 * - 有効始発 / 終着が取れない列車 … 既定プレースホルダのまま
 * - 運行範囲の外 … プレースホルダ(前列車が同じ列にいるなら「||」)
 * - 運行範囲の内 … 実時刻。運行なし区間は「||」
 *
 * ★路線外始発終着・切替駅の特殊表示(前列車終着の着時刻を出す等)は後続。
 */
function jikokuCell(
  row: CustomizeRowSpec,
  ctx: FillCtx,
  e: number,
  eki: Eki | undefined,
  sihatsu: number,
  syuuchaku: number,
  isChaku: boolean,
): CellSpec {
  const { rosen, houkou, ressya, prevTerm, opts } = ctx;
  const ekiCount = rosen.ekiCont.length;
  if (ressya === undefined) return EMPTY_CELL;
  const syubetsuIndex = ressya.syubetsuIndex;
  if (sihatsu < 0 || syuuchaku < 0) {
    return placeholder(eki, e, ekiCount, houkou, syubetsuIndex);
  }
  // 運行範囲の外。チェーンの内側(前列車がいる)なら「||」で繋ぐ。
  if (e < sihatsu) {
    return prevTerm >= 0
      ? markCell('keiyunasi', syubetsuIndex)
      : placeholder(eki, e, ekiCount, houkou, syubetsuIndex);
  }
  if (e > syuuchaku) {
    return placeholder(eki, e, ekiCount, houkou, syubetsuIndex);
  }
  const slot = ressya.ekiJikokuCont[e];
  if (slot === undefined) return EMPTY_CELL;
  if (slot.ekiatsukai === 'none') return markCell('keiyunasi', syubetsuIndex);
  if (slot.ekiatsukai === 'tsuuka') return markCell('tsuuka', syubetsuIndex);
  const jikoku = isChaku ? slot.chakuJikoku : slot.hatsuJikoku;
  if (jikoku === null) return markCell('keiyunasi', syubetsuIndex);
  void row;
  return textCell(encodeJikokuCsv(jikoku, isChaku, null, opts.conv), 'jikoku', syubetsuIndex);
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
