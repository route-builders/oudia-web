// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 oudia-second-web contributors
//
// Based on OuDiaSecond (Copyright (C) 2017-2026 diagram_mania)
// and OuDia (Copyright (C) 2006-2017 take-okm)

/**
 * 通常時刻表グリッドの 1 セル判定(原典 CCellBuilder のプレーン分岐。
 * 着 CCellBuilder.cpp:6884 / 発 :9425 / 番線 :8349)。byte-verified シンボルで上→下に
 * 先勝ち評価し、最後に post-override を適用する。
 *
 * M1 では路線外(Outer)表示 OFF 固定のため Outer 分岐は発火しない。したがって着/発の
 * 運行なし(None)は run-interior→||、主要駅→----、else→・・ の 3 択に縮退する。
 * カスタマイズ専用の "===="(終着)は出さない。通過時刻に "?" は付けない(CSV とは異なる)。
 */

import type { Colorref, Eki, EkiJikoku, Jikoku, Ressya, Ressyahoukou } from '@oudia/format';
import { RESSYAHOUKOU_KUDARI, encodeJikokuCsv } from '@oudia/format';
import type { JikokuConvOptions } from '@oudia/format';
import { ekiIndexOfEkiOrder } from '@oudia/domain';
import { getTrackRyakusyou, isHatsuChakuHyouji } from '../csv/ekiDisplay.js';
import { getEkiJikoku, getValidSyuuchakuEki, isRunBetweenNextEki } from '../csv/runRange.js';
import type { CellSpec, CellStyle, MarkKind } from './types.js';
import { plainStyle } from './types.js';

const GREY = (128 + (128 << 8) + (128 << 16)) as Colorref; // 灰(通過時刻の文字色)

/** 駅Order の Eki を取得(路線基準 ekiCont から方向写像)。 */
function ekiAtOrder(
  ekiCont: readonly Eki[],
  ekiOrder: number,
  houkou: Ressyahoukou,
): Eki | undefined {
  return ekiCont[ekiIndexOfEkiOrder(ekiOrder, ekiCont.length, houkou)];
}

/**
 * 境界線(原典 CdDedDgrEki の kyoukaisen 導出。CentDedEkiCont.cpp:113-128 下り / 303-318 上り)。
 * next/prev は**駅Index 空間**(パス順)。駅Order → 駅Index に戻してから ±1 する。
 */
export function getKyoukaisen(
  ekiCont: readonly Eki[],
  ekiOrder: number,
  houkou: Ressyahoukou,
): boolean {
  const n = ekiCont.length;
  const idx = ekiIndexOfEkiOrder(ekiOrder, n, houkou);
  const cur = ekiCont[idx];
  if (cur === undefined) return false;

  if (houkou === RESSYAHOUKOU_KUDARI) {
    const next = idx < n - 1 ? ekiCont[idx + 1] : undefined;
    if (cur.ekijikokukeisiki === 'kudariChaku' && cur.brunchCoreEkiIndex !== null) return true;
    if (next?.ekijikokukeisiki === 'noboriChaku' && next.brunchCoreEkiIndex !== null) return true;
    if (cur.ekijikokukeisiki === 'kudariChaku' && next?.ekijikokukeisiki === 'noboriChaku') {
      return true;
    }
    return false;
  }
  const prev = idx > 0 ? ekiCont[idx - 1] : undefined;
  if (prev?.ekijikokukeisiki === 'kudariChaku' && prev.brunchCoreEkiIndex !== null) return true;
  if (cur.ekijikokukeisiki === 'noboriChaku' && cur.brunchCoreEkiIndex !== null) return true;
  if (prev?.ekijikokukeisiki === 'kudariChaku' && cur.ekijikokukeisiki === 'noboriChaku') {
    return true;
  }
  return false;
}

/**
 * 主要駅表記(原典 bIsSyuyouEkiHyouki。CCellBuilder.cpp:6935-6959)。
 *   主要駅 && 0 < i < N-1 && !発着表示 && !当駅境界線 && !前駅境界線。
 */
function bIsSyuyouEkiHyouki(
  ekiCont: readonly Eki[],
  ekiOrder: number,
  houkou: Ressyahoukou,
): boolean {
  const n = ekiCont.length;
  if (!(ekiOrder > 0 && ekiOrder < n - 1)) return false;
  const eki = ekiAtOrder(ekiCont, ekiOrder, houkou);
  if (eki === undefined) return false;
  if (eki.ekikibo !== 'syuyou') return false;
  if (isHatsuChakuHyouji(eki.ekijikokukeisiki, houkou)) return false;
  if (getKyoukaisen(ekiCont, ekiOrder, houkou)) return false;
  if (getKyoukaisen(ekiCont, ekiOrder - 1, houkou)) return false;
  return true;
}

/** 運行なし(None)セルのマーク。M1 は Outer OFF のため 3 択。 */
function noneMark(
  ekiCont: readonly Eki[],
  ekiOrder: number,
  houkou: Ressyahoukou,
  sihatsu: number,
  syuuchaku: number,
): MarkKind | null {
  // run-interior(始発 < i < 終着)→ 経由なし。
  if (ekiOrder > sihatsu && sihatsu !== -1 && ekiOrder < syuuchaku) return 'keiyunasi';
  // 主要駅表記 → ----、それ以外 → ・・。
  return bIsSyuyouEkiHyouki(ekiCont, ekiOrder, houkou) ? 'unkounasiSyuyou' : 'unkounasiIppan';
}

function markCell(mark: MarkKind, style: CellStyle): CellSpec {
  return { text: '', kind: 'mark', mark, style };
}
function jikokuCell(text: string, style: CellStyle): CellSpec {
  return { text, kind: 'jikoku', mark: null, style };
}
function emptyCell(): CellSpec {
  return { text: '', kind: 'empty', mark: null, style: plainStyle() };
}

/** 種別スタイル(文字色・フォント index)を組む。 */
function syubetsuStyle(
  ressya: Ressya,
  syubetsu: { jikokuhyouMojiColor: Colorref; jikokuhyouFontIndex: number } | undefined,
  grey: boolean,
): CellStyle {
  return {
    syubetsuIndex: ressya.syubetsuIndex,
    mojiColor: grey ? GREY : (syubetsu?.jikokuhyouMojiColor ?? null),
    fontIndex: syubetsu?.jikokuhyouFontIndex ?? null,
    backColor: null,
    tategaki: false,
  };
}

/** ReferJikoku(逆転防止対時刻)。CSV の computeRefer と同ロジック。 */
function computeRefer(ressya: Ressya, iEkiOrder: number, conv: JikokuConvOptions): Jikoku {
  if (conv.outputSecond) return null;
  if (!(conv.secondRoundChaku === 2 && conv.secondRoundHatsu <= 1)) return null;
  const validSyuuchaku = getValidSyuuchakuEki(ressya);
  if (!(iEkiOrder < validSyuuchaku && validSyuuchaku !== -1)) return null;
  if (isRunBetweenNextEki(ressya, iEkiOrder)) return getEkiJikoku(ressya, iEkiOrder).hatsuJikoku;
  return null;
}

export interface CellContext {
  readonly ekiCont: readonly Eki[];
  readonly houkou: Ressyahoukou;
  readonly conv: JikokuConvOptions;
  readonly displayTsuukaEkiJikoku: boolean;
  /** syubetsuIndex → 種別描画属性。 */
  readonly syubetsuOf: (
    index: number,
  ) => { jikokuhyouMojiColor: Colorref; jikokuhyouFontIndex: number } | undefined;
}

/** 着セル(原典 setRessya_Chaku)。 */
export function chakuCell(
  ctx: CellContext,
  ressya: Ressya,
  ej: EkiJikoku,
  iEkiOrder: number,
  sihatsu: number,
  syuuchaku: number,
): CellSpec {
  const { ekiCont, houkou } = ctx;
  const syubetsu = ctx.syubetsuOf(ressya.syubetsuIndex);
  let cell: CellSpec;

  switch (ej.ekiatsukai) {
    case 'none':
      cell = markOrEmpty(noneMark(ekiCont, iEkiOrder, houkou, sihatsu, syuuchaku));
      break;
    case 'tsuuka':
      if (ej.chakuJikoku !== null && ctx.displayTsuukaEkiJikoku) {
        const refer = computeRefer(ressya, iEkiOrder, ctx.conv);
        const text = encodeJikokuCsv(ej.chakuJikoku, true, refer, ctx.conv);
        cell = jikokuCell(text, syubetsuStyle(ressya, syubetsu, true));
      } else {
        cell = markCell('tsuuka', plainStyle());
      }
      break;
    case 'teisya':
      if (ej.chakuJikoku !== null) {
        const refer = computeRefer(ressya, iEkiOrder, ctx.conv);
        const text = encodeJikokuCsv(ej.chakuJikoku, true, refer, ctx.conv);
        cell = jikokuCell(text, syubetsuStyle(ressya, syubetsu, false));
      } else if (getEkiJikoku(ressya, iEkiOrder).hatsuJikoku !== null && iEkiOrder === sihatsu) {
        // 停車・着空欄だが発時刻あり & 始発駅 → 運行なし一般マーク。
        cell = markCell('unkounasiIppan', plainStyle());
      } else {
        cell = markCell('teisyaMaru', plainStyle());
      }
      break;
  }

  return applyPostOverrideChaku(ekiCont, houkou, ressya, ej, iEkiOrder, sihatsu, cell);
}

/** 発セル(原典 setRessya_Hatsu。着の鏡像)。 */
export function hatsuCell(
  ctx: CellContext,
  ressya: Ressya,
  ej: EkiJikoku,
  iEkiOrder: number,
  sihatsu: number,
  syuuchaku: number,
): CellSpec {
  const { ekiCont, houkou } = ctx;
  const syubetsu = ctx.syubetsuOf(ressya.syubetsuIndex);
  let cell: CellSpec;

  switch (ej.ekiatsukai) {
    case 'none':
      cell = markOrEmpty(noneMark(ekiCont, iEkiOrder, houkou, sihatsu, syuuchaku));
      break;
    case 'tsuuka':
      if (ej.hatsuJikoku !== null && ctx.displayTsuukaEkiJikoku) {
        const text = encodeJikokuCsv(ej.hatsuJikoku, false, null, ctx.conv);
        cell = jikokuCell(text, syubetsuStyle(ressya, syubetsu, true));
      } else {
        cell = markCell('tsuuka', plainStyle());
      }
      break;
    case 'teisya':
      if (ej.hatsuJikoku !== null) {
        const text = encodeJikokuCsv(ej.hatsuJikoku, false, null, ctx.conv);
        cell = jikokuCell(text, syubetsuStyle(ressya, syubetsu, false));
      } else if (getEkiJikoku(ressya, iEkiOrder).chakuJikoku !== null && iEkiOrder === syuuchaku) {
        cell = markCell('unkounasiIppan', plainStyle());
      } else {
        cell = markCell('teisyaMaru', plainStyle());
      }
      break;
  }

  return applyPostOverrideHatsu(ekiCont, houkou, ressya, ej, iEkiOrder, syuuchaku, cell);
}

/** 番線セル(原典 setRessya_Track)。 */
export function trackCell(
  ctx: CellContext,
  ej: EkiJikoku,
  iEkiOrder: number,
  sihatsu: number,
  syuuchaku: number,
): CellSpec {
  if (ej.ekiatsukai === 'none') {
    if (iEkiOrder > sihatsu && sihatsu !== -1 && iEkiOrder < syuuchaku) {
      return markCell('keiyunasi', plainStyle());
    }
    return emptyCell();
  }
  if (ej.ressyaTrackIndex === null) return emptyCell();
  const eki = ekiAtOrder(ctx.ekiCont, iEkiOrder, ctx.houkou);
  const track = eki?.ekiTrack2Cont[ej.ressyaTrackIndex];
  if (track === undefined) return emptyCell();
  const text = getTrackRyakusyou(track, ctx.houkou);
  return { text, kind: text === '' ? 'empty' : 'track', mark: null, style: plainStyle() };
}

function markOrEmpty(mark: MarkKind | null): CellSpec {
  return mark === null ? emptyCell() : markCell(mark, plainStyle());
}

/** 着 post-override: 発着表示駅 & 停車/通過 & 着 null & 前駅 None & 始発 < i → ||。 */
function applyPostOverrideChaku(
  ekiCont: readonly Eki[],
  houkou: Ressyahoukou,
  ressya: Ressya,
  ej: EkiJikoku,
  iEkiOrder: number,
  sihatsu: number,
  cell: CellSpec,
): CellSpec {
  const eki = ekiAtOrder(ekiCont, iEkiOrder, houkou);
  if (eki === undefined) return cell;
  const prevIsNone =
    iEkiOrder - 1 >= 0 && getEkiJikoku(ressya, iEkiOrder - 1).ekiatsukai === 'none';
  if (
    isHatsuChakuHyouji(eki.ekijikokukeisiki, houkou) &&
    (ej.ekiatsukai === 'teisya' || ej.ekiatsukai === 'tsuuka') &&
    ej.chakuJikoku === null &&
    prevIsNone &&
    sihatsu < iEkiOrder
  ) {
    return markCell('keiyunasi', plainStyle());
  }
  return cell;
}

/** 発 post-override: 発着表示駅 & 停車/通過 & 発 null & 次駅 None & 終着 > i → ||。 */
function applyPostOverrideHatsu(
  ekiCont: readonly Eki[],
  houkou: Ressyahoukou,
  ressya: Ressya,
  ej: EkiJikoku,
  iEkiOrder: number,
  syuuchaku: number,
  cell: CellSpec,
): CellSpec {
  const eki = ekiAtOrder(ekiCont, iEkiOrder, houkou);
  if (eki === undefined) return cell;
  const nextIsNone =
    iEkiOrder + 1 < ekiCont.length && getEkiJikoku(ressya, iEkiOrder + 1).ekiatsukai === 'none';
  if (
    isHatsuChakuHyouji(eki.ekijikokukeisiki, houkou) &&
    (ej.ekiatsukai === 'teisya' || ej.ekiatsukai === 'tsuuka') &&
    ej.hatsuJikoku === null &&
    nextIsNone &&
    syuuchaku > iEkiOrder
  ) {
    return markCell('keiyunasi', plainStyle());
  }
  return cell;
}
