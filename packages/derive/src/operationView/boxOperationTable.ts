// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 up-tri
//
// Based on OuDiaSecond (Copyright (C) 2017-2026 diagram_mania)
// and OuDia (Copyright (C) 2006-2017 take-okm)

/**
 * 運用表の**箱ダイヤ形式**(原典 m_bDisplayExtensionOperationTable)のビューモデル。M7e。
 *
 * 原典:
 * - 表示駅列の構築    ViewOperationTable/CWndDcdGridOperationTable.cpp:3011-3250
 * - 行併合 + 継続印 ↓ 同 :5651-5748
 * - 1 行(= 1 列車)の全セル 同 :837-2969(OnUpdate_setCentDedRessya_To_Column_Extension)
 * - 図形プリミティブ  ViewOperationTable/CDcDraw_Extension.cpp
 * - 文字版の対応表    ViewOperationTable/CconvOperationTableCsv.cpp:2531-2612
 *
 * ★**駅は横(列)、列車は縦(行)**。従来形式(operationTableView.ts)とは軸も列構成も違う。
 * 1 列車 = 着行 / 線行(3px)/ 発行 の 3 段で、列車番号・種別・列車名は 3 段ぶち抜き。
 *
 * ★記号は 2 つの状態量だけで決まる(原典 :2812-2960):
 * - 横線 iHorizontalLineType: none / full / right(右半分)/ left(左半分)/ dash(経由なし)
 * - 縦線 iVerticalLineType: -2=出区○(着セル)/ -1=縦線(着セル)/ 0=なし /
 *   +1=縦線(発セル)/ +2=入区△(発セル)
 *   ※原典 :1211-1217 と :2891-2896 のコメントはどちらも実装と食い違う。実装が正。
 *
 * ★○ は常に着(上)セル、△ は常に発(下)セル。上り列車でも入れ替わらない。
 * 入れ替わるのは横線の left/right だけ。[上り始発駅を左に] は箱ダイヤでは効かない
 * (駅列は常に駅Index 昇順)。
 *
 * ★記号を置いたセルには時刻を描かない(原典は CDcdTextbox ごと差し替える)。
 * そのぶん番線名は反対側のセルへ逃がす(:1414-1436 / :1633-1655)。
 *
 * ★通過駅時刻に括弧は付かない。灰色(128,128,128)にするだけ。括弧は番線名略称専用。
 *
 * ★すべて oud2 非永続の派生表示情報 = 黄金テスト非該当。
 */

import {
  ekiIndexOfEkiOrder,
  getRunBetweenEkiBackward,
  getRunBetweenEkiForward,
  getVirtualChakuJikoku,
  getVirtualHatsuJikoku,
  isRunBetweenNextEki,
} from '@oudia-web/domain';
import type {
  Colorref,
  Dia,
  Eki,
  JikokuConvOptions,
  Ressya,
  Ressyahoukou,
  Ressyasyubetsu,
  Rosen,
} from '@oudia-web/format';
import { asColorref, encodeJikokuCsv } from '@oudia-web/format';
import { getTrackRyakusyou } from '../csv/ekiDisplay.js';
import type { OperationTableEntry } from '../operationFull/types.js';

/**
 * 表示駅列 1 本(原典 deque<int> m_iDisplayJikokuEkiIndex の要素)。
 * 原典は INT_MIN / INT_MAX を特別値に使うが、TS ではタグ付き union にする。
 */
export type BoxColumn =
  | { readonly kind: 'outerLeft' }
  | { readonly kind: 'eki'; readonly ekiIndex: number }
  | { readonly kind: 'outerRight' };

/** 線行の横線(原典 iHorizontalLineType の -1/0/1/2/3)。 */
export type BoxLineType = 'none' | 'full' | 'right' | 'left' | 'dash';

/** 着セル / 発セルの記号(原典 iVerticalLineType)。 */
export type BoxSymbol = 'none' | 'circle' | 'triangle' | 'vline';

/** 1 駅列 × 1 列車のセル(着 / 線 / 発 の 3 段ぶん)。 */
export interface BoxCell {
  readonly chaku: string;
  readonly hatsu: string;
  /** 通過(運転停車)駅の時刻は灰色にする(原典 CdColorProp(128,128,128))。 */
  readonly chakuGray: boolean;
  readonly hatsuGray: boolean;
  readonly line: BoxLineType;
  /** 着セルの記号(circle | vline | none)。 */
  readonly chakuSymbol: BoxSymbol;
  /** 発セルの記号(triangle | vline | none)。 */
  readonly hatsuSymbol: BoxSymbol;
}

/** 1 行 = 1 列車(同一列車扱いの併合を含む)。 */
export interface BoxRow {
  readonly ressyabangou: string;
  readonly syubetsumei: string;
  readonly syubetsuIndex: number;
  readonly ressyamei: string;
  /** 線・記号の色 = 種別のダイヤグラム線色(原典 getDiagramSenColor)。 */
  readonly senColor: Colorref;
  /**
   * 継続印。true なら 列車番号 / 種別 / 列車名 のテキストを "↓" に置き換える
   * (原典 :952/:984/:1022)。**箱ダイヤ専用**。
   */
  readonly isContinue: boolean;
  readonly houkou: Ressyahoukou;
  /** columns と同じ長さ。埋まっていない列は null(空セル)。 */
  readonly cells: (BoxCell | null)[];
}

export interface BoxOperationTableViewModel {
  readonly operationNumber: string;
  readonly columns: BoxColumn[];
  /** 列見出し(駅名。路線外スロットは空文字。原典 :3919-3923 / CSV :647-658)。 */
  readonly headers: string[];
  readonly rows: BoxRow[];
}

export interface BoxOperationTableOptions {
  readonly displayRessyamei: boolean;
  /** [着発番線名を表示](原典 m_bDisplayTrackName)。 */
  readonly displayTrackName: boolean;
  readonly displayParentSyubetsu: boolean;
  /** [通過駅の駅時刻を表示する(箱ダイヤ時のみ)](原典 m_bDisplayTsuukaEkiJikoku)。 */
  readonly displayTsuukaEkiJikoku: boolean;
  readonly conv: JikokuConvOptions;
}

// ---- 行併合(箱ダイヤ規則)----

/** 併合済みの 1 行。 */
export interface CombinedBoxRow {
  readonly start: number;
  readonly combineCount: number;
  readonly houkou: Ressyahoukou;
  /** 前の行から「同一列車扱いだが 1 直線に描けない」ので分割された行。 */
  readonly isContinue: boolean;
}

/** 併合行の方向を始発駅 index と終着駅 index の大小で決める(原典 CSV :323-336)。 */
function decideHoukou(base: Ressyahoukou, sIdx: number, tIdx: number): Ressyahoukou {
  if (sIdx > tIdx) return 1;
  if (sIdx < tIdx) return 0;
  return base;
}

/**
 * 箱ダイヤの行併合(原典 :5651-5748 / CSV :305-396)。
 *
 * 従来形式(combineOperationTableRows)との差は 1 点だけ:
 * PropertySame で繋がっていても「方向が違う」または「前列車の終着 EkiOrder >
 * 次列車の始発 EkiOrder」なら**併合を打ち切り**、次の行に継続印 ↓ を立てる(:5694-5711)。
 * これにより箱ダイヤの 1 行は必ず単一方向・駅順単調になる。
 */
export function combineBoxOperationTableRows(
  entries: readonly OperationTableEntry[],
  ekiCount: number,
): CombinedBoxRow[] {
  const rows: CombinedBoxRow[] = [];
  let isContinue = false;
  for (let i = 0; i < entries.length; ) {
    const head = entries[i];
    if (head === undefined) break;
    const rowIsContinue = isContinue;
    isContinue = false;
    let houkou = head.ressyaProperty.houkou;
    const sIdx = ekiIndexOfEkiOrder(head.sihatsuEkiOrder, ekiCount, houkou);
    let tIdx = ekiIndexOfEkiOrder(head.syuuchakuEkiOrder, ekiCount, houkou);
    let j = i;
    while (j + 1 < entries.length) {
      const cur = entries[j];
      const next = entries[j + 1];
      if (cur === undefined || next === undefined) break;
      if (cur.afterType !== 'propertySame' || next.beforeType !== 'propertySame') break;
      // ★箱ダイヤ専用の分割条件(:5694-5711)。
      if (
        cur.ressyaProperty.houkou !== next.ressyaProperty.houkou ||
        cur.syuuchakuEkiOrder > next.sihatsuEkiOrder
      ) {
        isContinue = true;
        break;
      }
      j++;
      tIdx = ekiIndexOfEkiOrder(next.syuuchakuEkiOrder, ekiCount, next.ressyaProperty.houkou);
    }
    houkou = decideHoukou(houkou, sIdx, tIdx);
    rows.push({ start: i, combineCount: j - i + 1, houkou, isContinue: rowIsContinue });
    i = j + 1;
  }
  return rows;
}

// ---- 表示駅列 ----

/** 昇順ユニーク挿入(原典 CSV :485-513)。 */
function insertSortedUnique(list: number[], v: number): void {
  for (let k = 0; k < list.length; k++) {
    const cur = list[k];
    if (cur === undefined) continue;
    if (cur === v) return;
    if (cur > v) {
      list.splice(k, 0, v);
      return;
    }
  }
  list.push(v);
}

/** 分岐駅は基幹駅へ 1 段だけ寄せる(原典 :3085-3090 / :3163-3168)。 */
function toCore(ekiCont: readonly Eki[], ekiIndex: number): number {
  const core = ekiCont[ekiIndex]?.brunchCoreEkiIndex;
  return core === undefined || core === null || core < 0 ? ekiIndex : core;
}

/** 運行区間へ丸めた始発 / 終着の駅Order(原典 :3044-3055)。-1 のときは丸めない。 */
function normalizedOrders(
  entry: OperationTableEntry,
  ressya: Ressya | undefined,
): { sOrder: number; tOrder: number } {
  let sOrder = entry.sihatsuEkiOrder;
  let tOrder = entry.syuuchakuEkiOrder;
  if (ressya !== undefined) {
    if (!isRunBetweenNextEki(ressya, sOrder)) {
      const v = getRunBetweenEkiForward(ressya, sOrder);
      // 原典は -1 を未防御で駅 index 化する。TS では丸めをあきらめて元の値を使う。
      if (v >= 0) sOrder = v;
    }
    if (!isRunBetweenNextEki(ressya, tOrder - 1)) {
      const v = getRunBetweenEkiBackward(ressya, tOrder);
      if (v >= 0) tOrder = v;
    }
  }
  return { sOrder, tOrder };
}

/**
 * 箱ダイヤの表示駅列を構築する(原典 :3011-3250 / CSV :400-632)。
 *
 * 1. [箱ダイヤに時刻を表示する] 駅(Eki.operationTableDisplayJikoku)を駅Index 昇順に全部
 *    (**その運用に列車が来なくても列になる**)
 * 2. 各行の起点側 / 終点側の発着駅を昇順ユニーク挿入(併合行の中間境界駅は入らない)
 * 3. 路線外発着があれば左端 / 右端に拡張スロットを高々 1 個ずつ
 */
export function buildBoxOperationTableColumns(
  rosen: Rosen,
  dia: Dia,
  entries: readonly OperationTableEntry[],
): BoxColumn[] {
  const ekiCont = rosen.ekiCont;
  const n = ekiCont.length;
  const rows = combineBoxOperationTableRows(entries, n);
  if (rows.length === 0) return [];

  const display: number[] = [];
  for (let i = 0; i < n; i++) {
    if (ekiCont[i]?.operationTableDisplayJikoku === true) display.push(i);
  }

  const originOuter: number[] = [];
  const terminalOuter: number[] = [];
  for (const row of rows) {
    for (let cb = 0; cb < row.combineCount; cb++) {
      const e = entries[row.start + cb];
      if (e === undefined) continue;
      const ressya = dia.ressyaCont[e.ressyaProperty.houkou]?.[e.ressyaProperty.ressyaIndex];
      const { sOrder, tOrder } = normalizedOrders(e, ressya);
      const kudari = e.ressyaProperty.houkou === 0;

      // (a) 起点側: 行が下り → 先頭列車のみ / 行が上り → 末尾列車のみ(原典 :440-447)
      if ((row.houkou === 0 && cb === 0) || (row.houkou === 1 && cb === row.combineCount - 1)) {
        const v = kudari ? sOrder : ekiIndexOfEkiOrder(tOrder, n, 1);
        const outer = kudari ? e.outerSihatsuEkiIndex !== null : e.outerSyuuchakuEkiIndex !== null;
        const core = toCore(ekiCont, v);
        if (outer) originOuter.push(core);
        else insertSortedUnique(display, core);
      }
      // (b) 終点側(原典 :519-527)
      if ((row.houkou === 0 && cb === row.combineCount - 1) || (row.houkou === 1 && cb === 0)) {
        const v = kudari ? tOrder : ekiIndexOfEkiOrder(sOrder, n, 1);
        const outer = kudari ? e.outerSyuuchakuEkiIndex !== null : e.outerSihatsuEkiIndex !== null;
        const core = toCore(ekiCont, v);
        if (outer) terminalOuter.push(core);
        else insertSortedUnique(display, core);
      }
    }
  }

  const cols: BoxColumn[] = display.map((ekiIndex) => ({ kind: 'eki', ekiIndex }) as const);
  // 起点側の拡張スロット(原典 :3219-3231)。高々 1 個。
  for (const v of originOuter) {
    const first = cols[0];
    if (first === undefined) {
      cols.unshift({ kind: 'outerLeft' });
      break;
    }
    if (first.kind === 'eki' && v <= first.ekiIndex) {
      cols.unshift({ kind: 'outerLeft' });
      break;
    }
  }
  // 終点側(原典 :3238-3249)。★size()==1 分岐は原典どおり(実駅 1 個でも発火する)。
  for (const v of terminalOuter) {
    if (cols.length === 1) {
      cols.push({ kind: 'outerRight' });
      break;
    }
    const last = cols[cols.length - 1];
    if (last !== undefined && last.kind === 'eki' && v >= last.ekiIndex) {
      cols.push({ kind: 'outerRight' });
      break;
    }
  }
  return cols;
}

// ---- セル ----

function emptyCell(): BoxCell {
  return {
    chaku: '',
    hatsu: '',
    chakuGray: false,
    hatsuGray: false,
    line: 'none',
    chakuSymbol: 'none',
    hatsuSymbol: 'none',
  };
}

/** 親種別へ 1 段だけ差し替える(原典 :894-899)。 */
function resolveSyubetsuIndex(
  syubetsuCont: readonly Ressyasyubetsu[],
  index: number,
  displayParent: boolean,
): number {
  const parent = syubetsuCont[index]?.parentSyubetsuIndex;
  if (!displayParent) return index;
  return parent !== undefined && parent !== null && parent >= 0 ? parent : index;
}

function ressyameiText(ressya: Ressya): string {
  return ressya.gousuu !== '' ? `${ressya.ressyamei} ${ressya.gousuu}号` : ressya.ressyamei;
}

function trackText(
  eki: Eki | undefined,
  ressya: Ressya | undefined,
  order: number,
  houkou: Ressyahoukou,
): string {
  const slot = ressya?.ekiJikokuCont[order];
  if (eki === undefined || slot === undefined || slot.ressyaTrackIndex === null) return '';
  const t = eki.ekiTrack2Cont[slot.ressyaTrackIndex];
  return t === undefined ? '' : `(${getTrackRyakusyou(t, houkou)})`;
}

/**
 * 箱ダイヤ形式のビューモデルを組み立てる。
 *
 * @param entries deriveOperationFull の operationTable から引いた 1 運用ぶんの時刻順エントリ列
 */
export function deriveBoxOperationTableView(
  dia: Dia,
  rosen: Rosen,
  operationNumber: string,
  entries: readonly OperationTableEntry[],
  opts: BoxOperationTableOptions,
): BoxOperationTableViewModel {
  const ekiCont = rosen.ekiCont;
  const n = ekiCont.length;
  const columns = buildBoxOperationTableColumns(rosen, dia, entries);
  const headers = columns.map((c) => (c.kind === 'eki' ? (ekiCont[c.ekiIndex]?.ekimei ?? '') : ''));
  /** 駅Index → 列 index。 */
  const colOf = new Map<number, number>();
  for (const [i, c] of columns.entries()) if (c.kind === 'eki') colOf.set(c.ekiIndex, i);
  const outerLeftCol = columns[0]?.kind === 'outerLeft' ? 0 : -1;
  const outerRightCol =
    columns[columns.length - 1]?.kind === 'outerRight' ? columns.length - 1 : -1;

  const rows = combineBoxOperationTableRows(entries, n).map((row): BoxRow => {
    const head = entries[row.start];
    const rHead =
      head === undefined
        ? undefined
        : dia.ressyaCont[head.ressyaProperty.houkou]?.[head.ressyaProperty.ressyaIndex];
    const syubetsuIndex = resolveSyubetsuIndex(
      rosen.ressyasyubetsuCont,
      rHead?.syubetsuIndex ?? 0,
      opts.displayParentSyubetsu,
    );
    const cells: (BoxCell | null)[] = columns.map(() => null);
    /** first-wins(原典 :2827-2834 の setIfDcDraw ガード)。 */
    const put = (col: number, cell: BoxCell): void => {
      if (col < 0 || col >= cells.length) return;
      if (cells[col] !== null) return;
      cells[col] = cell;
    };

    for (let cb = 0; cb < row.combineCount; cb++) {
      const e = entries[row.start + cb];
      if (e === undefined) continue;
      const houkou = e.ressyaProperty.houkou;
      const kudari = houkou === 0;
      const ressya = dia.ressyaCont[houkou]?.[e.ressyaProperty.ressyaIndex];
      const { sOrder, tOrder } = normalizedOrders(e, ressya);
      const sIdx = toCore(ekiCont, ekiIndexOfEkiOrder(sOrder, n, houkou));
      const tIdx = toCore(ekiCont, ekiIndexOfEkiOrder(tOrder, n, houkou));
      const hasPrev = cb > 0; // 同一行に前列車がいる
      const hasNext = cb < row.combineCount - 1;
      const sEki = ekiCont[ekiIndexOfEkiOrder(sOrder, n, houkou)];
      const tEki = ekiCont[ekiIndexOfEkiOrder(tOrder, n, houkou)];
      const sSlot = ressya?.ekiJikokuCont[sOrder];
      const tSlot = ressya?.ekiJikokuCont[tOrder];

      /**
       * 縦線で繋ぐ相手(原典 iPrevShuchakuEkiIndex / iNextShihatsuEkiIndex、:3318-3358)。
       * 「行の先頭/末尾 かつ 運用の端でない かつ 路線外発着でない かつ 出入区でない
       * かつ 相手も路線外発着・出入区でない」ときだけ求める。これにより ○/△ と縦線は排他になる。
       */
      let prevShuchakuEkiIndex = -1;
      if (
        cb === 0 &&
        row.start > 0 &&
        e.outerSihatsuEkiIndex === null &&
        e.beforeType !== 'outIn'
      ) {
        const prev = entries[row.start - 1];
        if (
          prev !== undefined &&
          prev.outerSyuuchakuEkiIndex === null &&
          prev.afterType !== 'outIn'
        ) {
          const pRessya =
            dia.ressyaCont[prev.ressyaProperty.houkou]?.[prev.ressyaProperty.ressyaIndex];
          const { tOrder: pt } = normalizedOrders(prev, pRessya);
          prevShuchakuEkiIndex = toCore(
            ekiCont,
            ekiIndexOfEkiOrder(pt, n, prev.ressyaProperty.houkou),
          );
        }
      }
      let nextShihatsuEkiIndex = -1;
      const nextIdx = row.start + row.combineCount;
      if (
        cb === row.combineCount - 1 &&
        nextIdx < entries.length &&
        e.outerSyuuchakuEkiIndex === null &&
        e.afterType !== 'outIn'
      ) {
        const next = entries[nextIdx];
        if (
          next !== undefined &&
          next.outerSihatsuEkiIndex === null &&
          next.beforeType !== 'outIn'
        ) {
          const nRessya =
            dia.ressyaCont[next.ressyaProperty.houkou]?.[next.ressyaProperty.ressyaIndex];
          const { sOrder: ns } = normalizedOrders(next, nRessya);
          nextShihatsuEkiIndex = toCore(
            ekiCont,
            ekiIndexOfEkiOrder(ns, n, next.ressyaProperty.houkou),
          );
        }
      }

      /** その駅の時刻を出すか(中間駅の条件。原典 :1935-1938 ほか)。 */
      const showMiddle = (ekiIndex: number, atsukai: string | undefined): boolean =>
        ekiCont[ekiIndex]?.operationTableDisplayJikoku === true &&
        (opts.displayTsuukaEkiJikoku || atsukai === 'teisya');

      // ---- 路線外始発 / 路線外終着(拡張スロット。原典 :1233-1237 / :1665-1673)----
      if (e.outerSihatsuEkiIndex !== null) {
        const col = kudari ? outerLeftCol : outerRightCol;
        put(col, {
          ...emptyCell(),
          chaku: sEki?.outerTerminalCont[e.outerSihatsuEkiIndex]?.ekimei ?? '',
          hatsu: encodeJikokuCsv(e.outerSihatsuJikoku, false, null, opts.conv),
          line: kudari ? 'right' : 'left',
        });
      }
      if (e.outerSyuuchakuEkiIndex !== null) {
        const col = kudari ? outerRightCol : outerLeftCol;
        put(col, {
          ...emptyCell(),
          hatsu: tEki?.outerTerminalCont[e.outerSyuuchakuEkiIndex]?.ekimei ?? '',
          chaku: encodeJikokuCsv(e.outerSyuuchakuJikoku, true, null, opts.conv),
          line: kudari ? 'left' : 'right',
        });
      }

      // ---- 始発駅セル ----
      if (e.outerSihatsuEkiIndex === null) {
        const col = colOf.get(sIdx);
        if (col !== undefined) {
          // 併合の内側(前列車あり)でだけ、時刻表示駅・駅扱いの条件が効く(原典 :1385-1391)。
          const show = !hasPrev || showMiddle(sIdx, sSlot?.ekiatsukai);
          let chakuSymbol: BoxSymbol = 'none';
          if (e.beforeType === 'outIn') chakuSymbol = 'circle';
          else if (prevShuchakuEkiIndex !== -1 && prevShuchakuEkiIndex === sIdx) {
            // 運用上の前列車の終着駅がこの駅なら縦線で繋ぐ(原典 :1409 / :3318-3338)。
            chakuSymbol = 'vline';
          }
          const hatsu = show
            ? encodeJikokuCsv(
                sSlot === undefined ? null : getVirtualHatsuJikoku(sSlot),
                false,
                null,
                opts.conv,
              )
            : '';
          // 番線名は記号のない側へ。記号があるときは発側へ逃がす(原典 :1414-1436)。
          const track =
            opts.displayTrackName && !hasPrev ? trackText(sEki, ressya, sOrder, houkou) : '';
          put(col, {
            ...emptyCell(),
            chaku: chakuSymbol === 'none' ? track : '',
            hatsu: hatsu + (chakuSymbol === 'none' ? '' : track),
            hatsuGray: hasPrev && sSlot?.ekiatsukai === 'tsuuka',
            // 前列車が同一行なら着セルと線は前列車の管轄(原典 :1400-1401)。
            line: hasPrev ? 'none' : kudari ? 'right' : 'left',
            chakuSymbol: hasPrev ? 'none' : chakuSymbol,
          });
        }
      }

      // ---- 終着駅セル ----
      if (e.outerSyuuchakuEkiIndex === null) {
        const col = colOf.get(tIdx);
        if (col !== undefined) {
          const show = !hasNext || showMiddle(tIdx, tSlot?.ekiatsukai);
          let hatsuSymbol: BoxSymbol = 'none';
          if (e.afterType === 'outIn') hatsuSymbol = 'triangle';
          else if (nextShihatsuEkiIndex !== -1 && nextShihatsuEkiIndex === tIdx) {
            hatsuSymbol = 'vline';
          }
          const chaku = show
            ? encodeJikokuCsv(
                tSlot === undefined ? null : getVirtualChakuJikoku(tSlot),
                true,
                null,
                opts.conv,
              )
            : '';
          const track = opts.displayTrackName ? trackText(tEki, ressya, tOrder, houkou) : '';
          put(col, {
            ...emptyCell(),
            chaku: chaku + (hatsuSymbol === 'none' && !hasNext ? '' : track),
            hatsu: hatsuSymbol === 'none' && !hasNext ? track : '',
            chakuGray: hasNext && tSlot?.ekiatsukai === 'tsuuka',
            // 次列車が同一行なら線は全域にして発セルを次列車へ譲る(原典 :1612-1621)。
            line: hasNext ? 'full' : kudari ? 'left' : 'right',
            hatsuSymbol: hasNext ? 'none' : hatsuSymbol,
          });
        }
      }

      // ---- 中間駅セル ----
      const lo = Math.min(sIdx, tIdx);
      const hi = Math.max(sIdx, tIdx);
      /**
       * 併合行で次列車がいるとき、自分の終着駅から次列車の始発駅までの区間は
       * **前列車(= この列車)の管轄で破線**にする(原典 :1312-1318 のコメント)。
       */
      let gapLo = lo;
      let gapHi = hi;
      if (hasNext) {
        const nx = entries[row.start + cb + 1];
        if (nx !== undefined) {
          const nRessya = dia.ressyaCont[nx.ressyaProperty.houkou]?.[nx.ressyaProperty.ressyaIndex];
          const { sOrder: ns } = normalizedOrders(nx, nRessya);
          const nIdx = toCore(ekiCont, ekiIndexOfEkiOrder(ns, n, nx.ressyaProperty.houkou));
          gapLo = Math.min(gapLo, nIdx);
          gapHi = Math.max(gapHi, nIdx);
        }
      }
      for (const [ci, c] of columns.entries()) {
        if (c.kind !== 'eki') continue;
        if (c.ekiIndex <= gapLo || c.ekiIndex >= gapHi) continue;
        if (cells[ci] !== null) continue;
        // 自列車の運行範囲の外(= 併合の隙間)は時刻なしの破線だけ。
        if (c.ekiIndex <= lo || c.ekiIndex >= hi) {
          put(ci, { ...emptyCell(), line: 'dash' });
          continue;
        }
        const order = ekiIndexOfEkiOrder(c.ekiIndex, n, houkou);
        const slot = ressya?.ekiJikokuCont[order];
        const runs = ressya !== undefined && isRunBetweenNextEki(ressya, order);
        const runsPrev = ressya !== undefined && isRunBetweenNextEki(ressya, order - 1);
        const show = showMiddle(c.ekiIndex, slot?.ekiatsukai);
        const chaku =
          runsPrev && show && slot !== undefined
            ? encodeJikokuCsv(getVirtualChakuJikoku(slot), true, null, opts.conv)
            : '';
        const hatsu =
          runs && show && slot !== undefined
            ? encodeJikokuCsv(getVirtualHatsuJikoku(slot), false, null, opts.conv)
            : '';
        const gray = slot?.ekiatsukai === 'tsuuka';
        put(ci, {
          ...emptyCell(),
          chaku,
          hatsu,
          chakuGray: gray,
          hatsuGray: gray,
          // 経由なし区間(着も発も無い)は破線(原典 :2010-2018)。
          line: !runsPrev && !runs ? 'dash' : 'full',
        });
      }
    }

    return {
      ressyabangou: rHead?.ressyabangou ?? '',
      syubetsumei: rosen.ressyasyubetsuCont[syubetsuIndex]?.syubetsumei ?? '',
      syubetsuIndex,
      ressyamei: rHead === undefined ? '' : ressyameiText(rHead),
      senColor: rosen.ressyasyubetsuCont[syubetsuIndex]?.diagramLineStyle.senColor ?? asColorref(0),
      isContinue: row.isContinue,
      houkou: row.houkou,
      cells,
    };
  });

  return { operationNumber, columns, headers, rows };
}
