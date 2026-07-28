// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 up-tri
//
// Based on OuDiaSecond (Copyright (C) 2017-2026 diagram_mania)
// and OuDia (Copyright (C) 2006-2017 take-okm)

/**
 * 運用表ビュー(従来形式)のビューモデル(原典 CWndDcdGridOperationTable の
 * 行統合 OnUpdate :5644-5744 / 行生成 OnUpdate_setCentDedRessya_To_Column :348-836 /
 * 列生成 CdOperationTableXColSpecCont::scan :121-179 の直訳)。M7d。
 *
 * 「ダイヤ × 運用番号」ごとに 1 ビュー。データ源は deriveOperationFull の operationTable の
 * 1 エントリ(運用番号 → 時刻順 OperationTableEntry 列)。1 行 = 1 列車で、同一列車扱い
 * (PropertySame)で接続された列車は 1 行に併合する。
 *
 * ★箱ダイヤ形式(m_bDisplayExtensionOperationTable)は別ビューモデル。出区 ○ / 入区 △ /
 * 継続矢印 ↓ / 通過駅時刻表示は**箱ダイヤ専用**で従来形式には出ない(原典 :2890-2960 / :952)。
 *
 * ★すべて oud2 非永続の派生表示情報 = 黄金テスト非該当。
 */

import {
  ekiIndexOfEkiOrder,
  getRunBetweenEkiBackward,
  getRunBetweenEkiForward,
  isRunBetweenNextEki,
} from '@oudia-web/domain';
import type {
  Dia,
  Eki,
  JikokuConvOptions,
  Ressya,
  Ressyahoukou,
  Ressyasyubetsu,
  Rosen,
} from '@oudia-web/format';
import { encodeJikokuCsv } from '@oudia-web/format';
import { getTrackRyakusyou } from '../csv/ekiDisplay.js';
import type { OperationTableEntry } from '../operationFull/types.js';

/** 列スペック(原典 CdOperationTableXColSpec の EColumnType。従来形式ぶん)。 */
export type OperationTableColumn =
  | 'ressyabangou'
  | 'ressyasyubetsu'
  | 'ressyamei'
  | 'originSideEkimei'
  | 'originSideEkiTrack'
  | 'originSideEkijikoku'
  | 'ressyahoukou'
  | 'terminalSideEkimei'
  | 'terminalSideEkiTrack'
  | 'terminalSideEkijikoku';

/** 列見出し(原典 :3837-4108)。方向矢印列は見出しなし。 */
export const OPERATION_TABLE_HEADER: Readonly<Record<OperationTableColumn, string>> = {
  ressyabangou: '列車番号',
  ressyasyubetsu: '種別',
  ressyamei: '列車名',
  originSideEkimei: '駅名',
  originSideEkiTrack: '番線',
  originSideEkijikoku: '駅時刻',
  ressyahoukou: '',
  terminalSideEkimei: '駅名',
  terminalSideEkiTrack: '番線',
  terminalSideEkijikoku: '駅時刻',
};

export interface OperationTableViewOptions {
  /** DispProp.displayRessyamei(路線ファイル属性。ビューのトグルではない)。 */
  readonly displayRessyamei: boolean;
  /** [着発番線名を表示](原典 m_bDisplayTrackName)。既定 false。 */
  readonly displayTrackName: boolean;
  /** [親種別を有効にする](原典 m_bDisplayParentSyubetsu)。既定 false。 */
  readonly displayParentSyubetsu: boolean;
  /** [上り始発駅を左に](原典 m_bDisplayNoboriLeftToRight)。既定 false。 */
  readonly displayNoboriLeftToRight: boolean;
  readonly conv: JikokuConvOptions;
}

/** 駅側(起点側 / 終点側)1 ブロックのセル。 */
export interface OperationTableEkiCell {
  readonly ekimei: string;
  /** 番線略称。路線外発着と番線非表示のときは空。 */
  readonly track: string;
  readonly jikokuText: string;
}

/** 1 行 = 1 列車(同一列車扱いは併合済み)。 */
export interface OperationTableViewRow {
  readonly ressyabangou: string;
  readonly syubetsumei: string;
  /** 親種別解決後の種別 index(色・フォント引き当て用)。 */
  readonly syubetsuIndex: number;
  readonly ressyamei: string;
  /** 起点側の列(路線の起点寄り。内容は行の方向で入れ替わる)。 */
  readonly originSide: OperationTableEkiCell;
  /** 終点側の列。 */
  readonly terminalSide: OperationTableEkiCell;
  /** 方向矢印("→" / "←")。 */
  readonly houkouArrow: string;
  /** 併合後の行方向。 */
  readonly houkou: Ressyahoukou;
  /** 併合した元エントリ数(原典 iCombineCount)。 */
  readonly combineCount: number;
}

export interface OperationTableViewModel {
  readonly operationNumber: string;
  readonly columns: OperationTableColumn[];
  readonly rows: OperationTableViewRow[];
}

/** 列スペックを構築する(原典 scan :121-179 の従来形式経路)。 */
export function buildOperationTableColumns(
  displayRessyamei: boolean,
  displayTrackName: boolean,
): OperationTableColumn[] {
  const cols: OperationTableColumn[] = ['ressyabangou', 'ressyasyubetsu'];
  if (displayRessyamei) cols.push('ressyamei');
  cols.push('originSideEkimei');
  if (displayTrackName) cols.push('originSideEkiTrack');
  cols.push('originSideEkijikoku', 'ressyahoukou', 'terminalSideEkimei');
  if (displayTrackName) cols.push('terminalSideEkiTrack');
  cols.push('terminalSideEkijikoku');
  return cols;
}

/** 併合された 1 行(先頭エントリ index と併合数、行方向)。 */
interface CombinedRow {
  readonly start: number;
  readonly combineCount: number;
  readonly houkou: Ressyahoukou;
}

/**
 * 同一列車扱い(PropertySame)で接続された列車を 1 行に併合する(原典 :5644-5744)。
 * 併合後、先頭列車の方向と末尾列車の方向が違うときだけ、始発駅 index と終着駅 index の
 * 大小で行方向を上書きする(始発 < 終着 → 下り / > → 上り / == → 先頭の方向のまま)。
 */
export function combineOperationTableRows(
  entries: readonly OperationTableEntry[],
  ekiCount: number,
): CombinedRow[] {
  const rows: CombinedRow[] = [];
  for (let i = 0; i < entries.length; ) {
    const head = entries[i];
    if (head === undefined) break;
    let j = i;
    while (j + 1 < entries.length) {
      const cur = entries[j];
      const next = entries[j + 1];
      if (cur?.afterType !== 'propertySame' || next?.beforeType !== 'propertySame') break;
      j++;
    }
    const tail = entries[j];
    let houkou: Ressyahoukou = head.ressyaProperty.houkou;
    if (tail !== undefined && houkou !== tail.ressyaProperty.houkou) {
      const sihatsuIndex = ekiIndexOfEkiOrder(head.sihatsuEkiOrder, ekiCount, houkou);
      const syuuchakuIndex = ekiIndexOfEkiOrder(
        tail.syuuchakuEkiOrder,
        ekiCount,
        tail.ressyaProperty.houkou,
      );
      if (sihatsuIndex < syuuchakuIndex) houkou = 0;
      else if (sihatsuIndex > syuuchakuIndex) houkou = 1;
    }
    rows.push({ start: i, combineCount: j - i + 1, houkou });
    i = j + 1;
  }
  return rows;
}

/** 親種別へ 1 段だけ差し替える(原典 :385-394)。 */
function resolveSyubetsuIndex(
  syubetsuCont: readonly Ressyasyubetsu[],
  index: number,
  displayParent: boolean,
): number {
  if (!displayParent) return index;
  const parent = syubetsuCont[index]?.parentSyubetsuIndex;
  return parent !== undefined && parent !== null && parent >= 0 ? parent : index;
}

/** 始発側のセル(原典 :396-403 / :547-586 / :609-656)。 */
function sihatsuCell(
  entry: OperationTableEntry,
  ressya: Ressya | undefined,
  ekiCont: readonly Eki[],
  opts: OperationTableViewOptions,
): OperationTableEkiCell {
  const houkou = entry.ressyaProperty.houkou;
  let order = entry.sihatsuEkiOrder;
  if (ressya !== undefined && !isRunBetweenNextEki(ressya, order)) {
    order = getRunBetweenEkiForward(ressya, order);
  }
  const eki = ekiCont[ekiIndexOfEkiOrder(order, ekiCont.length, houkou)];
  if (entry.outerSihatsuEkiIndex !== null) {
    // 路線外始発: 境界駅の路線外駅名。番線欄は空のまま(原典 :615)。
    return {
      ekimei: eki?.outerTerminalCont[entry.outerSihatsuEkiIndex]?.ekimei ?? '',
      track: '',
      jikokuText: encodeJikokuCsv(entry.outerSihatsuJikoku, false, null, opts.conv),
    };
  }
  const slot = ressya?.ekiJikokuCont[order];
  const track =
    opts.displayTrackName && eki !== undefined && slot !== undefined
      ? (() => {
          if (slot.ressyaTrackIndex === null) return '';
          const t = eki.ekiTrack2Cont[slot.ressyaTrackIndex];
          return t === undefined ? '' : getTrackRyakusyou(t, houkou);
        })()
      : '';
  return {
    ekimei: eki?.ekimei ?? '',
    track,
    jikokuText: encodeJikokuCsv(slot?.hatsuJikoku ?? null, false, null, opts.conv),
  };
}

/** 終着側のセル(原典 :406-411 / :658-735 / :757-802)。運行区間補正の判定は order-1。 */
function syuuchakuCell(
  entry: OperationTableEntry,
  ressya: Ressya | undefined,
  ekiCont: readonly Eki[],
  opts: OperationTableViewOptions,
): OperationTableEkiCell {
  const houkou = entry.ressyaProperty.houkou;
  let order = entry.syuuchakuEkiOrder;
  if (ressya !== undefined && !isRunBetweenNextEki(ressya, order - 1)) {
    order = getRunBetweenEkiBackward(ressya, order);
  }
  const eki = ekiCont[ekiIndexOfEkiOrder(order, ekiCont.length, houkou)];
  if (entry.outerSyuuchakuEkiIndex !== null) {
    return {
      ekimei: eki?.outerTerminalCont[entry.outerSyuuchakuEkiIndex]?.ekimei ?? '',
      track: '',
      jikokuText: encodeJikokuCsv(entry.outerSyuuchakuJikoku, true, null, opts.conv),
    };
  }
  const slot = ressya?.ekiJikokuCont[order];
  const track =
    opts.displayTrackName && eki !== undefined && slot !== undefined
      ? (() => {
          if (slot.ressyaTrackIndex === null) return '';
          const t = eki.ekiTrack2Cont[slot.ressyaTrackIndex];
          return t === undefined ? '' : getTrackRyakusyou(t, houkou);
        })()
      : '';
  return {
    ekimei: eki?.ekimei ?? '',
    track,
    jikokuText: encodeJikokuCsv(slot?.chakuJikoku ?? null, true, null, opts.conv),
  };
}

/** 列車名 + 号数(原典 :468-504)。 */
function ressyameiText(ressya: Ressya): string {
  return ressya.gousuu !== '' ? `${ressya.ressyamei} ${ressya.gousuu}号` : ressya.ressyamei;
}

/**
 * 運用表ビュー(従来形式)のビューモデルを組み立てる。
 *
 * @param entries deriveOperationFull の operationTable から引いた 1 運用ぶんの時刻順エントリ列
 */
export function deriveOperationTableView(
  dia: Dia,
  rosen: Rosen,
  operationNumber: string,
  entries: readonly OperationTableEntry[],
  opts: OperationTableViewOptions,
): OperationTableViewModel {
  const ekiCont = rosen.ekiCont;
  const ressyaOf = (e: OperationTableEntry): Ressya | undefined =>
    dia.ressyaCont[e.ressyaProperty.houkou]?.[e.ressyaProperty.ressyaIndex];

  const rows = combineOperationTableRows(entries, ekiCont.length).map((combined) => {
    const head = entries[combined.start];
    const tail = entries[combined.start + combined.combineCount - 1];
    const rHead = head === undefined ? undefined : ressyaOf(head);
    const rTail = tail === undefined ? undefined : ressyaOf(tail);

    const sihatsu =
      head === undefined
        ? { ekimei: '', track: '', jikokuText: '' }
        : sihatsuCell(head, rHead, ekiCont, opts);
    const syuuchaku =
      tail === undefined
        ? { ekimei: '', track: '', jikokuText: '' }
        : syuuchakuCell(tail, rTail, ekiCont, opts);

    // 下り、または [上り始発駅を左に] のとき、始発が起点側の列に入る(原典 :513-537)。
    const sihatsuOnOrigin = combined.houkou === 0 || opts.displayNoboriLeftToRight;
    const syubetsuIndex = resolveSyubetsuIndex(
      rosen.ressyasyubetsuCont,
      rHead?.syubetsuIndex ?? 0,
      opts.displayParentSyubetsu,
    );

    return {
      ressyabangou: rHead?.ressyabangou ?? '',
      syubetsumei: rosen.ressyasyubetsuCont[syubetsuIndex]?.syubetsumei ?? '',
      syubetsuIndex,
      ressyamei: rHead === undefined ? '' : ressyameiText(rHead),
      originSide: sihatsuOnOrigin ? sihatsu : syuuchaku,
      terminalSide: sihatsuOnOrigin ? syuuchaku : sihatsu,
      // 上り かつ [上り始発駅を左に] OFF のときだけ "←"(原典 :806-833)。
      houkouArrow: combined.houkou === 1 && !opts.displayNoboriLeftToRight ? '←' : '→',
      houkou: combined.houkou,
      combineCount: combined.combineCount,
    };
  });

  return {
    operationNumber,
    columns: buildOperationTableColumns(opts.displayRessyamei, opts.displayTrackName),
    rows,
  };
}
