// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 up-tri
//
// Based on OuDiaSecond (Copyright (C) 2017-2026 diagram_mania)
// and OuDia (Copyright (C) 2006-2017 take-okm)

/**
 * 運用一覧図(原典 ViewAllOperationTable2)の**図本体**の幾何導出。M7e。
 *
 * 原典:
 * - 図本体 ViewAllOperationTable2/CDcdAllOperationTable.cpp:222-1200(DcDraw)
 * - 枠・ヘッダ・左右パネル 同 CDcdAllOperationTable2.cpp:319-1490
 *
 * ★横軸 = 時刻(秒)。X の全体範囲は [起点時刻, 起点時刻 + 86400) 固定で、
 * 起点時刻未満の時刻は +86400 して同じ座標系に載せる(:522 / :633)。
 * ★縦軸 = 運用 1 本 1 行。行の内部座標は Dgr 30 単位で、線の中心は 30*i + 15(:461-466)。
 * ★1 本の運用は「列車ごとの水平線分の連なり」。帯でも折れ線でもなく、列車間(折返し・
 * 停泊)には**何も描かれない**(:476, :761-767)。
 *
 * ★出区・入区の専用記号は**存在しない**。出入区は左右パネルの駅名+時刻でだけ表す。
 *
 * ★描画時のテキスト実測が要る処理(駅名・分ラベルの重なり回避)は render 層で行う。
 * ここは「どの位置にどの文字を出すか」と「隣とどの規則で衝突回避するか」まで返す。
 */

import { ekiIndexOfEkiOrder } from '@oudia-web/domain';
import type {
  Colorref,
  Dia,
  Eki,
  Jikoku,
  Ressyahoukou,
  Ressyasyubetsu,
  Rosen,
  SenStyle,
} from '@oudia-web/format';
import type { OperationTableEntry } from '../operationFull/types.js';

/** 1 運用ぶんの行の高さ(Dgr 単位。原典 DEFAULT_YSIZE_PER_ONEOPERATION)。 */
export const OPERATION_ROW_DGR_HEIGHT = 30;

/** 時間目盛の粗密 8 段階(原典 m_arVline[8]、CDcdAllOperationTable.cpp:116-124)。 */
export const VLINE_PITCHES: readonly {
  readonly dot: number;
  readonly solid: number;
  readonly bold: number;
  readonly label: string;
}[] = [
  { dot: 60, solid: 300, bold: 1800, label: '1分目' },
  { dot: 120, solid: 600, bold: 3600, label: '2分目' },
  { dot: 300, solid: 600, bold: 3600, label: '5分目' },
  { dot: 600, solid: 1800, bold: 3600, label: '10分目' },
  { dot: 900, solid: 900, bold: 3600, label: '15分目' },
  { dot: 1200, solid: 1200, bold: 3600, label: '20分目' },
  { dot: 1800, solid: 1800, bold: 3600, label: '30分目' },
  { dot: 3600, solid: 3600, bold: 3600, label: '60分目' },
];

/** 既定の時間目盛(原典 m_idxVlineMode = 3 = 10 分目)。 */
export const DEFAULT_VLINE_MODE = 3;

/** 列車 1 本(または同一列車扱いで併合した連なり)の水平線分。 */
export interface OperationDiagramSegment {
  /** 始点(起点時刻基準の秒。日跨ぎは +86400 済み)。 */
  readonly fromSec: number;
  readonly toSec: number;
  readonly senColor: Colorref;
  readonly senStyle: SenStyle;
  /** 線幅(原典はダイヤ画面より 1px 太い = 2 or 3)。 */
  readonly lineWidth: number;
  /** 線の中央に出す列車情報(空なら出さない)。 */
  readonly info: string;
}

/** 線の下に出す駅名略称ラベル。 */
export interface OperationDiagramEkimeiLabel {
  readonly sec: number;
  readonly text: string;
  /**
   * ひとつ前のラベルと**同一駅**か。重なり回避の規則が変わる(原典 :986-1078):
   * 同一駅 → 近ければ 1 個に統合して中点へ / 別駅 → 重なれば左右へ押し広げて両方出す。
   */
  readonly sameAsPrev: boolean;
}

/** 線の上に出す「分」2 桁ラベル(原典 :697-724 / :1171-1197)。 */
export interface OperationDiagramMinuteLabel {
  readonly sec: number;
  readonly text: string;
  readonly sameAsPrev: boolean;
}

/** 図の 1 行 = 1 運用。 */
export interface OperationDiagramRow {
  readonly operationNumber: string;
  readonly segments: OperationDiagramSegment[];
  readonly ekimeiLabels: OperationDiagramEkimeiLabel[];
  readonly minuteLabels: OperationDiagramMinuteLabel[];
}

export interface AllOperationDiagramOptions {
  readonly kitenJikoku: number;
  readonly displayRessyabangou: boolean;
  readonly displaySyubetsuRyakusyou: boolean;
  readonly displayRessyamei: boolean;
  /** 線の上に「分」を出すか。 */
  readonly displayJikokuMinute: boolean;
  readonly displayParentSyubetsu: boolean;
}

/** 起点時刻基準に正規化した秒(原典 :522 / :633)。 */
function toDgrSec(jikoku: Jikoku, kiten: number): number | null {
  if (jikoku === null) return null;
  return jikoku < kiten ? jikoku + 86400 : jikoku;
}

/** 親種別を 1 段だけ解決する(原典 :484-489)。 */
function resolveSyubetsu(
  syubetsuCont: readonly Ressyasyubetsu[],
  index: number,
  displayParent: boolean,
): Ressyasyubetsu | undefined {
  const s = syubetsuCont[index];
  if (!displayParent || s === undefined) return s;
  const p = s.parentSyubetsuIndex;
  return p !== null && p >= 0 ? (syubetsuCont[p] ?? s) : s;
}

/**
 * ダイヤグラム用の駅名略称(原典 getEkimeiDiagramRyaku(true)、CentDedEki.cpp:519-526)。
 * EkimeiDiaRyaku が空なら駅名の 1 文字目。
 */
function ekimeiDiaRyaku(eki: Eki | undefined): string {
  if (eki === undefined) return '';
  if (eki.ekimeiDiaRyaku !== '') return eki.ekimeiDiaRyaku;
  return [...eki.ekimei][0] ?? '';
}

/** 路線外発着駅の略称(原典 getOuterTerminalDiaRyaku(idx,true)、CentDedEki.cpp:415-431)。 */
function outerDiaRyaku(eki: Eki | undefined, outerIndex: number): string {
  const t = eki?.outerTerminalCont[outerIndex];
  if (t === undefined) return '';
  if (t.diaRyaku !== '') return t.diaRyaku;
  return [...t.ekimei][0] ?? '';
}

/** 分 2 桁(原典 strprintf("%02d", getMinute()))。 */
function minuteText(sec: number): string {
  return String(Math.floor((sec % 3600) / 60)).padStart(2, '0');
}

/** 駅の同一性判定(分岐環状グループの一致まで見る原典を、ここでは駅 index 一致で近似)。 */
function sameStation(a: { eki: number; outer: number | null }, b: typeof a): boolean {
  return a.eki === b.eki && a.outer === b.outer;
}

/**
 * 1 運用ぶんの図の幾何を導出する(原典 CDcdAllOperationTable::DcDraw の運用ループ、:476-1200)。
 */
export function deriveOperationDiagramRow(
  dia: Dia,
  rosen: Rosen,
  operationNumber: string,
  entries: readonly OperationTableEntry[],
  opts: AllOperationDiagramOptions,
): OperationDiagramRow {
  const kiten = opts.kitenJikoku;
  const n = rosen.ekiCont.length;
  const segments: OperationDiagramSegment[] = [];
  const ekimeiLabels: OperationDiagramEkimeiLabel[] = [];
  const minuteLabels: OperationDiagramMinuteLabel[] = [];

  /** その運用の最初の始発時刻(24h 打ち切りの基準。原典 OutJikoku)。 */
  let outSec: number | null = null;
  let prevChakuSec: number | null = null;
  /** 直前が種別変更 / 列車情報変更で繋がっているか(原典 bClassPropertyChange)。 */
  let classPropertyChange = false;
  let prevStation: { eki: number; outer: number | null } | null = null;

  for (let k = 0; k < entries.length; k++) {
    const e = entries[k];
    if (e === undefined) break;
    const houkou: Ressyahoukou = e.ressyaProperty.houkou;
    const ressya = dia.ressyaCont[houkou]?.[e.ressyaProperty.ressyaIndex];
    if (ressya === undefined) continue;

    // ---- 始発側 ----
    const sEkiIndex = ekiIndexOfEkiOrder(e.sihatsuEkiOrder, n, houkou);
    const sEki = rosen.ekiCont[sEkiIndex];
    const sOuter = e.outerSihatsuEkiIndex;
    const sJikoku =
      sOuter !== null
        ? e.outerSihatsuJikoku
        : (ressya.ekiJikokuCont[e.sihatsuEkiOrder]?.hatsuJikoku ?? null);
    let fromSec = toDgrSec(sJikoku, kiten);
    if (fromSec === null) continue;
    // 種別変更 / 列車情報変更で繋がっているときは前列車の終着まで線を伸ばす(原典 :512-515)。
    if (classPropertyChange && prevChakuSec !== null) fromSec = prevChakuSec;

    if (outSec === null) outSec = fromSec;
    else if (fromSec < (prevChakuSec ?? outSec)) break; // 24h を超えた(原典 :534-548)

    // ---- 同一列車扱い(PropertySame)は 1 本に併合(原典 :559-624)----
    let last = e;
    while (
      k + 1 < entries.length &&
      last.afterType === 'propertySame' &&
      entries[k + 1]?.beforeType === 'propertySame'
    ) {
      k++;
      const nx = entries[k];
      if (nx === undefined) break;
      last = nx;
    }
    const tHoukou: Ressyahoukou = last.ressyaProperty.houkou;
    const tRessya = dia.ressyaCont[tHoukou]?.[last.ressyaProperty.ressyaIndex];
    const tEkiIndex = ekiIndexOfEkiOrder(last.syuuchakuEkiOrder, n, tHoukou);
    const tEki = rosen.ekiCont[tEkiIndex];
    const tOuter = last.outerSyuuchakuEkiIndex;
    const tJikoku =
      tOuter !== null
        ? last.outerSyuuchakuJikoku
        : (tRessya?.ekiJikokuCont[last.syuuchakuEkiOrder]?.chakuJikoku ?? null);
    const toSec = toDgrSec(tJikoku, kiten);
    if (toSec === null) continue;

    // ---- 線 ----
    const syubetsu = resolveSyubetsu(
      rosen.ressyasyubetsuCont,
      ressya.syubetsuIndex,
      opts.displayParentSyubetsu,
    );
    const style = syubetsu?.diagramLineStyle;
    const info = buildInfo(ressya, syubetsu, opts);
    const seg = {
      senColor: style?.senColor ?? (0 as Colorref),
      senStyle: style?.senStyle ?? ('jissen' as SenStyle),
      // 原典 :749: ダイヤ画面より 1px 太い。
      lineWidth: (style?.isBold === true ? 2 : 1) + 1,
      info,
    };
    // 起点時刻をまたぐ線は 2 本に分割し、列車情報も 2 回描く(原典 :643-657 / :752-758)。
    if (kiten + 86400 > fromSec && fromSec < kiten + 86400 && toSec > kiten + 86400) {
      segments.push({ ...seg, fromSec, toSec: kiten + 86400 });
      segments.push({ ...seg, fromSec: kiten, toSec: toSec - 86400 });
    } else {
      segments.push({ ...seg, fromSec, toSec });
    }

    // ---- ラベル ----
    const sStation = { eki: sEkiIndex, outer: sOuter };
    const tStation = { eki: tEkiIndex, outer: tOuter };
    if (!classPropertyChange) {
      ekimeiLabels.push({
        sec: fromSec,
        text: sOuter !== null ? outerDiaRyaku(sEki, sOuter) : ekimeiDiaRyaku(sEki),
        sameAsPrev: prevStation !== null && sameStation(prevStation, sStation),
      });
      if (opts.displayJikokuMinute) {
        minuteLabels.push({
          sec: fromSec,
          text: minuteText(fromSec),
          sameAsPrev: prevStation !== null && sameStation(prevStation, sStation),
        });
      }
    }
    ekimeiLabels.push({
      sec: toSec,
      text: tOuter !== null ? outerDiaRyaku(tEki, tOuter) : ekimeiDiaRyaku(tEki),
      sameAsPrev: false,
    });
    if (opts.displayJikokuMinute) {
      minuteLabels.push({ sec: toSec, text: minuteText(toSec), sameAsPrev: false });
    }

    // ---- 次列車との接続種別 ----
    const nx = entries[k + 1];
    classPropertyChange =
      nx !== undefined &&
      ((last.afterType === 'classChange' && nx.beforeType === 'classChange') ||
        (last.afterType === 'propertyChange' && nx.beforeType === 'propertyChange'));
    prevChakuSec = toSec;
    prevStation = tStation;
  }

  return { operationNumber, segments, ekimeiLabels, minuteLabels };
}

/** 線の中央に出す列車情報(原典 :770-806)。 */
function buildInfo(
  ressya: { ressyabangou: string; ressyamei: string; gousuu: string },
  syubetsu: Ressyasyubetsu | undefined,
  opts: AllOperationDiagramOptions,
): string {
  const parts: string[] = [];
  if (opts.displayRessyabangou && ressya.ressyabangou !== '') parts.push(ressya.ressyabangou);
  if (opts.displaySyubetsuRyakusyou && syubetsu !== undefined && syubetsu.ryakusyou !== '') {
    parts.push(syubetsu.ryakusyou);
  }
  if (opts.displayRessyamei && ressya.ressyamei !== '') {
    parts.push(ressya.ressyamei);
    if (ressya.gousuu !== '') parts.push(`${ressya.gousuu}号`);
  }
  return parts.join(' ');
}

/** 図全体(並べ替え済みの運用番号の順)。 */
export function deriveAllOperationDiagram(
  dia: Dia,
  rosen: Rosen,
  operationNumbers: readonly string[],
  operationTable: ReadonlyMap<string, readonly OperationTableEntry[]>,
  opts: AllOperationDiagramOptions,
): OperationDiagramRow[] {
  return operationNumbers.map((num) =>
    deriveOperationDiagramRow(dia, rosen, num, operationTable.get(num) ?? [], opts),
  );
}
