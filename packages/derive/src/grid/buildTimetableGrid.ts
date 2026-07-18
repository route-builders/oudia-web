// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 oudia-second-web contributors
//
// Based on OuDiaSecond (Copyright (C) 2017-2026 diagram_mania)
// and OuDia (Copyright (C) 2006-2017 take-okm)

/**
 * 通常時刻表グリッドの組み立て(原典 CCellBuilder のプレーン経路全体)。
 * 行スペック(colSpec)× 列(駅名 / 着発ラベル / 列車 × N)から密なセル行列を作る。
 * render 層(タスク #20)が消費するデータ契約。
 */

import type { Dia, Eki, Ressya, Ressyahoukou, RosenFileData } from '@oudia/format';
import type { JikokuConvOptions } from '@oudia/format';
import { ekiIndexOfEkiOrder } from '@oudia/domain';
import { getEkimeiJikokuhyouRyaku } from '../csv/ekiDisplay.js';
import {
  getSihatsuEki,
  getSyuuchakuEki,
  getValidSihatsuEki,
  getValidSyuuchakuEki,
  getEkiJikoku,
} from '@oudia/domain';
import { buildJikokuhyouRowSpec } from './colSpec.js';
import type { JikokuhyouRowSpec } from './colSpec.js';
import { chakuCell, hatsuCell, trackCell } from './cellSpec.js';
import type { CellContext } from './cellSpec.js';
import type { CellSpec, GridColumn, TimetableGridSpec } from './types.js';
import { plainStyle } from './types.js';

const NAME_CHAKU = '着';
const NAME_HATSU = '発';
const NAME_TRACK = '番線';
const NAME_GOU = '号';

// 左ラベル(行見出し)。
const ROW_LABEL: Record<string, string> = {
  ressyabangou: '列車番号',
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
  readonly conv: JikokuConvOptions;
}

/** DispProp から既定オプションを組む(M1 .ini 既定)。 */
export function defaultTimetableGridOptions(
  data: RosenFileData,
  houkou: Ressyahoukou,
): BuildTimetableGridOptions {
  return {
    houkou,
    displayRessyamei: data.dispProp.displayRessyamei,
    displayTsuukaEkiJikoku: true,
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

/** 種別略称(親種別置換なし。M1 は既定)。 */
function ryakusyou(data: RosenFileData, ressya: Ressya): string {
  return data.rosen.ressyasyubetsuCont[ressya.syubetsuIndex]?.ryakusyou ?? '';
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
      rowCells.push(trainCell(ctx, data, row, ressya, rr.sihatsu, rr.syuuchaku, ekiCount, houkou));
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
      return text(ryakusyou(data, ressya));
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
    case 'operationShihatsu':
    case 'operationShuchaku':
      return { text: '', kind: 'operationSpacer', mark: null, style: plainStyle() };
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
