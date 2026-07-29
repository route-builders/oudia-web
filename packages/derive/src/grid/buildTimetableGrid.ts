// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 up-tri
//
// Based on OuDiaSecond (Copyright (C) 2017-2026 diagram_mania)
// and OuDia (Copyright (C) 2006-2017 take-okm)

/**
 * 通常時刻表グリッドの組み立て(原典 CCellBuilder のプレーン経路全体)。
 * 行スペック(colSpec)× 列(駅名 / 着発ラベル / 列車 × N)から密なセル行列を作る。
 * render 層(タスク #20)が消費するデータ契約。
 */

import {
  ekiIndexOfEkiOrder,
  getEkiJikoku,
  getSihatsuEki,
  getSyuuchakuEki,
  getValidSihatsuEki,
  getValidSyuuchakuEki,
} from '@oudia-web/domain';
import type {
  Dia,
  Eki,
  Jikoku,
  JikokuConvOptions,
  Ressya,
  Ressyahoukou,
  RosenFileData,
} from '@oudia-web/format';
import { encodeJikokuCsv } from '@oudia-web/format';
import { getEkimeiJikokuhyouRyaku } from '../csv/ekiDisplay.js';
import type { CellContext } from './cellSpec.js';
import { chakuCell, hatsuCell, trackCell } from './cellSpec.js';
import type { JikokuhyouRowSpec } from './colSpec.js';
import { buildJikokuhyouRowSpec } from './colSpec.js';
import type { CellSpec, GridColumn, TimetableGridSpec } from './types.js';
import { plainStyle } from './types.js';

const NAME_CHAKU = '着';
const NAME_HATSU = '発';
const NAME_TRACK = '番線';
const NAME_GOU = '号';
const NAME_OPERATION_OUT = '出区';
const NAME_OPERATION_IN = '入区';

/** 次列車接続タイプの表示文字列(原典 IDS_WORD_JIKOKUHYOU_*、rc:3157-3159)。 */
const JUNCTION_TYPE_TEXT: Readonly<Record<string, string>> = {
  classChange: '種別変',
  propertyChange: '列情変',
  propertySame: '同一扱',
  unrelated: '',
};

// 左ラベル(行見出し)。
const ROW_LABEL: Record<string, string> = {
  ressyabangou: '列車番号',
  operationNumber: '運用番号',
  ressyasyubetsu: '列車種別',
  ressyamei: '列車名',
  gousuu: '号数',
  gou: '',
  shihatsuEkimei: '始発駅',
  operationShihatsu: '始発駅作業',
  shuchakuEkimei: '終着駅',
  operationShuchaku: '終着駅作業',
  bikou: '備考',
};

export interface BuildTimetableGridOptions {
  readonly houkou: Ressyahoukou;
  readonly displayRessyamei: boolean;
  readonly displayTsuukaEkiJikoku: boolean;
  /** [全時刻を表示](m_bDisplayAllEkiJikoku): 全駅に着・発の両行を生成。既定 false。 */
  readonly displayAllEkiJikoku?: boolean;
  /** [親種別を有効にする](m_bDisplayParentSyubetsu): 子種別を親種別の略称で表示。既定 false。 */
  readonly displayParentSyubetsu?: boolean;
  /**
   * 運用機能(Rosen.enableOperation。0=無効/1=簡易/2=通常)。>=1 で始発駅作業/終着駅作業行に
   * 作業テキストを表示する(M7b)。0 は従来どおり空(operationSpacer)= 黄金テスト不変。
   */
  readonly enableOperation?: number;
  /** DispProp.operationNumberRows(1..5)。運用番号行の段数。既定 1。 */
  readonly operationNumberRows?: number;
  /** DispProp.displayInOutLinkCode。作業ブロックの連携コード行の有無。既定 false。 */
  readonly displayInOutLinkCode?: boolean;
  readonly conv: JikokuConvOptions;
}

/** DispProp から既定オプションを組む(原典 .ini 既定)。 */
export function defaultTimetableGridOptions(
  data: RosenFileData,
  houkou: Ressyahoukou,
): BuildTimetableGridOptions {
  return {
    houkou,
    displayRessyamei: data.dispProp.displayRessyamei,
    displayTsuukaEkiJikoku: true,
    enableOperation: data.rosen.enableOperation,
    operationNumberRows: data.dispProp.operationNumberRows,
    displayInOutLinkCode: data.dispProp.displayInOutLinkCode,
    conv: {
      noColon: true,
      outputSecond: false,
      secondRoundChaku: data.dispProp.secondRoundChaku,
      secondRoundHatsu: data.dispProp.secondRoundHatsu,
      display2400: data.dispProp.display2400,
    },
  };
}

export type BuildTimetableGridResult =
  | { readonly ok: true; readonly grid: TimetableGridSpec }
  | { readonly ok: false; readonly code: -1 };

/** 種別略称(displayParentSyubetsu なら親種別へ差し替え。原典 CCellBuilder.cpp 6032)。 */
function ryakusyou(data: RosenFileData, ressya: Ressya, parentSubst: boolean): string {
  let idx = ressya.syubetsuIndex;
  if (parentSubst) {
    const parent = data.rosen.ressyasyubetsuCont[idx]?.parentSyubetsuIndex;
    if (parent !== undefined && parent !== null && parent >= 0) idx = parent;
  }
  return data.rosen.ressyasyubetsuCont[idx]?.ryakusyou ?? '';
}

/** 通常時刻表グリッドを組み立てる。 */
export function buildTimetableGrid(
  data: RosenFileData,
  diaIndex: number,
  opts: BuildTimetableGridOptions,
): BuildTimetableGridResult {
  const dia: Dia | undefined = data.rosen.diaCont[diaIndex];
  if (dia === undefined) return { ok: false, code: -1 };

  const { houkou } = opts;
  const ekiCont = data.rosen.ekiCont;
  const ekiCount = ekiCont.length;
  const ressyaList = dia.ressyaCont[houkou];

  const rows = buildJikokuhyouRowSpec(ekiCont, houkou, {
    displayRessyamei: opts.displayRessyamei,
    displayAllEkiJikoku: opts.displayAllEkiJikoku ?? false,
    enableOperation: opts.enableOperation ?? 0,
    operationNumberRows: opts.operationNumberRows ?? 1,
    displayInOutLinkCode: opts.displayInOutLinkCode ?? false,
  });

  const columns: GridColumn[] = [
    { type: 'ekimei' },
    { type: 'chakuhatsu' },
    ...ressyaList.map((_, i) => ({ type: 'ressya' as const, ressyaIndex: i })),
  ];

  const ctx: CellContext = {
    ekiCont,
    houkou,
    conv: opts.conv,
    displayTsuukaEkiJikoku: opts.displayTsuukaEkiJikoku,
    syubetsuOf: (index) => data.rosen.ressyasyubetsuCont[index],
  };

  // 列車ごとの run 範囲を先に計算。
  const runRanges = ressyaList.map((r) => ({
    sihatsu: getSihatsuEki(r),
    syuuchaku: getSyuuchakuEki(r),
  }));

  const cells: CellSpec[][] = rows.map((row) => {
    const rowCells: CellSpec[] = [];
    // X=0 駅名列 / X=1 着発ラベル列。
    rowCells.push(ekimeiCell(row, ekiCont, ekiCount, houkou));
    rowCells.push(chakuhatsuLabelCell(row));
    // X>=2 列車列。
    ressyaList.forEach((ressya, i) => {
      const rr = runRanges[i] ?? { sihatsu: -1, syuuchaku: -1 };
      rowCells.push(
        trainCell(
          ctx,
          data,
          row,
          ressya,
          rr.sihatsu,
          rr.syuuchaku,
          ekiCount,
          houkou,
          opts.displayParentSyubetsu ?? false,
          Math.min(5, Math.max(1, opts.operationNumberRows ?? 1)),
        ),
      );
    });
    return rowCells;
  });

  // 駅時刻行範囲(chaku/track/hatsu の最初/最後)。
  let begin = -1;
  let end = -1;
  rows.forEach((r, i) => {
    if (r.type === 'chaku' || r.type === 'track' || r.type === 'hatsu') {
      if (begin === -1) begin = i;
      end = i + 1;
    }
  });

  return {
    ok: true,
    grid: {
      houkou,
      columns,
      rows,
      cells,
      ekijikokuRowRange: { begin: begin === -1 ? 0 : begin, end: end === -1 ? 0 : end },
    },
  };
}

/** X=0 駅名セル。駅ブロック行のみ駅名、それ以外は左ラベル。 */
function ekimeiCell(
  row: JikokuhyouRowSpec,
  ekiCont: readonly Eki[],
  ekiCount: number,
  houkou: Ressyahoukou,
): CellSpec {
  if (row.type === 'chaku' || row.type === 'track' || row.type === 'hatsu') {
    const eki = ekiCont[ekiIndexOfEkiOrder(row.ekiOrder ?? 0, ekiCount, houkou)];
    const text = eki === undefined ? '' : eki.ekimei;
    return { text, kind: 'label', mark: null, style: plainStyle() };
  }
  const label = row.isContinuation ? '' : (ROW_LABEL[row.type] ?? '');
  return { text: label, kind: 'label', mark: null, style: plainStyle() };
}

/** X=1 着発ラベルセル(駅ブロック行のみ 着/発/番線)。 */
function chakuhatsuLabelCell(row: JikokuhyouRowSpec): CellSpec {
  let text = '';
  if (row.type === 'chaku') text = NAME_CHAKU;
  else if (row.type === 'hatsu') text = NAME_HATSU;
  else if (row.type === 'track') text = NAME_TRACK;
  return { text, kind: 'label', mark: null, style: plainStyle() };
}

/** X>=2 列車セル。行 type に応じてメタ/駅時刻を返す。 */
function trainCell(
  ctx: CellContext,
  data: RosenFileData,
  row: JikokuhyouRowSpec,
  ressya: Ressya,
  sihatsu: number,
  syuuchaku: number,
  ekiCount: number,
  houkou: Ressyahoukou,
  parentSubst: boolean,
  operationNumberRows: number,
): CellSpec {
  if (ressya.isNull) return { text: '', kind: 'empty', mark: null, style: plainStyle() };

  const text = (s: string): CellSpec => ({
    text: s,
    kind: 'text',
    mark: null,
    style: plainStyle(),
  });
  const ekimeiRyaku = (order: number): string => {
    if (order === -1) return '';
    const eki = data.rosen.ekiCont[ekiIndexOfEkiOrder(order, ekiCount, houkou)];
    return eki === undefined ? '' : getEkimeiJikokuhyouRyaku(eki);
  };

  switch (row.type) {
    case 'ressyabangou':
      return text(ressya.ressyabangou);
    case 'ressyasyubetsu':
      return text(ryakusyou(data, ressya, parentSubst));
    case 'ressyamei':
      return text(ressya.ressyamei);
    case 'gousuu':
      return text(ressya.gousuu);
    case 'gou':
      return text(ressya.gousuu !== '' ? NAME_GOU : '');
    case 'shihatsuEkimei':
      return text(ekimeiRyaku(getValidSihatsuEki(ressya)));
    case 'shuchakuEkimei':
      return text(ekimeiRyaku(getValidSyuuchakuEki(ressya)));
    case 'operationNumber': {
      // 運用番号行(原典 update02_02_02_12、CCellBuilder.cpp:5890-5975)。
      const cellText =
        operationNumberBlock(operationNumbersOf(ressya), operationNumberRows)[row.operationIndex] ??
        '';
      return {
        text: cellText,
        kind: 'operationNumber',
        mark: null,
        style: plainStyle(),
      };
    }
    case 'operationShihatsu':
    case 'operationShuchaku': {
      const cell = operationBlockCell(data, ressya, ekiCount, houkou, row.type, row.operationIndex);
      if (cell === null) {
        return { text: '', kind: 'operationSpacer', mark: null, style: plainStyle() };
      }
      return {
        text: cell.text,
        kind: 'operation',
        mark: null,
        style: { ...plainStyle(), tsuuka: cell.tsuuka },
      };
    }
    case 'bikou':
      return text(ressya.bikou);
    case 'chaku':
      return chakuCell(
        ctx,
        ressya,
        getEkiJikoku(ressya, row.ekiOrder ?? 0),
        row.ekiOrder ?? 0,
        sihatsu,
        syuuchaku,
      );
    case 'hatsu':
      return hatsuCell(
        ctx,
        ressya,
        getEkiJikoku(ressya, row.ekiOrder ?? 0),
        row.ekiOrder ?? 0,
        sihatsu,
        syuuchaku,
      );
    case 'track':
      return trackCell(
        ctx,
        getEkiJikoku(ressya, row.ekiOrder ?? 0),
        row.ekiOrder ?? 0,
        sihatsu,
        syuuchaku,
      );
  }
}

/**
 * 運用番号行の各段テキスト(原典 update02_02_02_12_setRessya_OperationNumber、
 * CCellBuilder.cpp:5890-5975)。
 *
 * 先頭から 1 段 1 個ずつ取り、最下段で残り全部を `+` 連結する。2 段目以降は先頭に `+` を付ける。
 * 例: rows=2, ['A','B','C'] → ['A', '+B+C'] / rows=1 → ['A+B+C']。
 * 残りが空になった段は `+` も付かず空文字列。
 */
export function operationNumberBlock(numbers: readonly string[], rows: number): string[] {
  const rest = [...numbers];
  const out: string[] = [];
  for (let idx = 0; idx < rows; idx++) {
    if (rest.length === 0) {
      out.push('');
      continue;
    }
    const prefix = idx === 0 ? '' : '+';
    if (idx === rows - 1) {
      out.push(prefix + rest.join('+'));
      rest.length = 0;
    } else {
      out.push(prefix + (rest.shift() ?? ''));
    }
  }
  return out;
}

/**
 * 列車の運用番号(原典 CentDedRessya::getOperationNumber(getValidSihatsuEki())、:1630-1691 の
 * 有効始発駅時点)。運休列車は空。
 *
 * 探索前(#2/#3 未割付)でもユーザー入力の永続 #1 を表示できる。TS は運番を別 Map で持つため、
 * ここでは #1(out/outer の operationNumbers・junction の kariOperationNumbers・
 * numberChange の operationNumbers)のみを見る。
 */
export function operationNumbersOf(ressya: Ressya): string[] {
  if (ressya.isCanceled) return [];
  const sihatsu = getValidSihatsuEki(ressya);
  if (sihatsu < 0) return [];
  const slot = ressya.ekiJikokuCont[sihatsu];
  const first = slot?.beforeOperationCont[0];
  if (first === undefined) return [];
  if (first.kind === 'out' || first.kind === 'outer') return [...first.operationNumbers];
  if (first.kind === 'junction') return [...first.kariOperationNumbers];
  return [];
}

/** 始発駅作業/終着駅作業 1 セルぶんの内容。null = 空セル。 */
interface OperationBlockCell {
  readonly text: string;
  /** 灰色表示(仮運用番号・時刻の代用)。 */
  readonly tsuuka: boolean;
}

/** 路線外発着駅の時刻表略称(原典 CentDedEki::getOuterTerminalJikokuRyaku(idx, true)、:399-413)。 */
function outerTerminalJikokuRyaku(eki: Eki | undefined, index: number): string {
  const t = eki?.outerTerminalCont[index];
  if (t === undefined) return '';
  return t.jikokuRyaku === '' ? t.ekimei : t.jikokuRyaku;
}

/**
 * 始発駅作業 / 終着駅作業ブロックの 1 行ぶん(原典 CCellBuilder.cpp:6304-6528 / :6594-6788)。
 *
 * 始発(前作業先頭 = 出区/路線外始発/前列車接続):
 *   1=作業名 / 2=時刻 / 3=運用番号(`;` 連結) / 4=入出区連携コード
 * 終着(後作業末尾 = 入区/路線外終着/次列車接続):
 *   1=作業名(次列車接続は接続タイプ) / 2=時刻 / 3=入出区連携コード  ※運番欄なし
 */
function operationBlockCell(
  data: RosenFileData,
  ressya: Ressya,
  ekiCount: number,
  houkou: Ressyahoukou,
  rowType: 'operationShihatsu' | 'operationShuchaku',
  index: number,
): OperationBlockCell | null {
  const isShihatsu = rowType === 'operationShihatsu';
  const order = isShihatsu ? getValidSihatsuEki(ressya) : getValidSyuuchakuEki(ressya);
  if (order === -1) return null;
  const slot = getEkiJikoku(ressya, order);
  const eki = data.rosen.ekiCont[ekiIndexOfEkiOrder(order, ekiCount, houkou)];
  const enc = (j: Jikoku, isChaku: boolean): string =>
    encodeJikokuCsv(j, isChaku, null, {
      noColon: false,
      outputSecond: false,
      secondRoundChaku: data.dispProp.secondRoundChaku,
      secondRoundHatsu: data.dispProp.secondRoundHatsu,
      display2400: data.dispProp.display2400,
    });
  const cell = (text: string, tsuuka = false): OperationBlockCell | null =>
    text === '' ? null : { text, tsuuka };

  if (isShihatsu) {
    // 先頭が先端作業(出区/路線外始発/前列車接続)でなければブロックは空(原典 getFirstOperation)。
    const first = slot.beforeOperationCont[0];
    if (first === undefined) return null;
    if (first.kind === 'out') {
      if (index === 0) return cell(NAME_OPERATION_OUT);
      if (index === 1) return cell(enc(first.outJikoku, true));
      if (index === 2) return cell(first.operationNumbers.join(';'));
      if (index === 3) return cell(first.inOutLinkCode);
      return null;
    }
    if (first.kind === 'outer') {
      if (index === 0) return cell(outerTerminalJikokuRyaku(eki, first.outerTerminalIndex));
      if (index === 1) {
        // 当駅着時刻。null なら当駅発時刻で代用し灰色にする(原典 :6380 付近)。
        const j = first.chakuJikoku ?? slot.hatsuJikoku;
        const t = enc(j, true);
        return cell(t === '' ? '' : `${t}${NAME_CHAKU}`, first.chakuJikoku === null);
      }
      if (index === 2) return cell(first.operationNumbers.join(';'));
      if (index === 3) return cell(first.inOutLinkCode);
      return null;
    }
    if (first.kind === 'junction') {
      if (index === 0) return null; // 作業名なし
      if (index === 1) return cell(enc(first.kitenJikoku, true));
      // 仮運用番号は灰色(原典 getCdDrawTextPropTsuuka)。
      if (index === 2) return cell(first.kariOperationNumbers.join(';'), true);
      return null;
    }
    return null;
  }

  const cont = slot.afterOperationCont;
  const last = cont[cont.length - 1];
  if (last === undefined) return null;
  if (last.kind === 'in') {
    if (index === 0) return cell(NAME_OPERATION_IN);
    if (index === 1) return cell(enc(last.inJikoku, false));
    if (index === 2) return cell(last.inOutLinkCode);
    return null;
  }
  if (last.kind === 'outer') {
    if (index === 0) return cell(outerTerminalJikokuRyaku(eki, last.outerTerminalIndex));
    if (index === 1) {
      const j = last.hatsuJikoku ?? slot.chakuJikoku;
      const t = enc(j, false);
      return cell(t === '' ? '' : `${t}${NAME_HATSU}`, last.hatsuJikoku === null);
    }
    if (index === 2) return cell(last.inOutLinkCode);
    return null;
  }
  if (last.kind === 'junction') {
    if (index === 0) return cell(JUNCTION_TYPE_TEXT[last.junctionType] ?? '');
    if (index === 1) return cell(enc(last.syuutenJikoku, false));
    return null;
  }
  return null;
}
