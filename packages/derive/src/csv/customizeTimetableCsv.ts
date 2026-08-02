// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 up-tri
//
// Based on OuDiaSecond (Copyright (C) 2017-2026 diagram_mania)
// and OuDia (Copyright (C) 2006-2017 take-okm)

/**
 * カスタマイズ時刻表 CSV(原典 ConvJikokuhyouCsv/CconvJikokuhyouCustomizeCsv.cpp)。
 * follow-up #11 / ADR-0002。
 *
 * ★**ADR-0002 のとおり、原典の欠陥を修正した「作者が意図した動作」を実装する。**
 * 原典は配布ソースがコンパイル不能(`_T("+";)` 等の構文誤りが 8 箇所)で、
 * 実際の出力を観測できない。加えて列がズレる出力バグが 3 件ある。
 *
 * 本実装は**画面表示と同じ行スペック・同じセル充填**(customizeColSpec / buildCustomizeGrid)
 * の上に構築する。これにより:
 * - ★原典バグ 1(:5626-5642 / :5700-5720 でヘッダ 2・3 行目を誤った row へ insert)と
 * - ★原典バグ 2(encode_AddRessya:4983 の二重分岐で EkiPrevRessyamei のデータセルが 0 個)と
 * - ★原典バグ 3(encode_AddRessyaNull:5174-5181 が運番を段数に関係なく 1 行だけ)
 * が**構造的に起こらない**(行スペックが 1 行 = 1 セルを保証するため)。
 *
 * ★原典と同じ点: FileType 行の値は `OuDiaSecond.JikokuhyouCsv.3`(通常時刻表は .2)、
 * 3 行目は方向名 + "カスタマイズ"、UTF-8 BOM + CRLF。
 *
 * ★駅名がヘッダに載るのは 着 / 発 / 番線 の 3 種だけ(原典どおり)。したがってこの CSV は
 * **再取込不能**で、原典にも decode は存在しない。
 */

import type { Dia, Ressyahoukou, Rosen } from '@oudia-web/format';
import { encodeCsvDocument } from '@oudia-web/format';
import type { CustomizeGridOptions } from '../grid/buildCustomizeGrid.js';
import { buildCustomizeGrid } from '../grid/buildCustomizeGrid.js';
import type { CustomizeRowOptions, CustomizeRowSpec } from '../grid/customizeColSpec.js';
import { buildCustomizeRowSpec } from '../grid/customizeColSpec.js';
import type { CustomizeChainColumn } from '../operationLight/types.js';

/** 原典と同じ書き出し設定(UTF-8 BOM + CRLF)。 */
const CSV_OPTIONS = { lineEnding: '\r\n', bom: true } as const;

/** カスタマイズ時刻表 CSV の FileType(原典 :100)。通常時刻表は .2。 */
export const CUSTOMIZE_TIMETABLE_CSV_FILETYPE = 'OuDiaSecond.JikokuhyouCsv.3';

/**
 * 行ラベル(左 2 列)。
 *
 * ★「始発駅」は原典では `IDS_WORD_ShuchakuEkimei` を渡すバグで "終着駅" と出るが、
 * ADR-0002 のとおり**修正して "始発駅" を出す**(既存 timetableCsv.ts と一貫させる)。
 */
const ROW_LABEL: Partial<Record<CustomizeRowSpec['type'], readonly [string, string]>> = {
  ressyabangou: ['列車番号', ''],
  operationNumber: ['運用番号', ''],
  ressyasyubetsu: ['列車種別', ''],
  ressyamei: ['列車名', ''],
  gousuu: ['号数', ''],
  gou: ['', ''],
  shihatsuEkimei: ['始発駅', ''],
  shuchakuEkimei: ['終着駅', ''],
  bikou: ['備考', ''],
};

/** 駅ブロック行のラベル。★駅名が入るのは 着 / 発 / 番線 だけ(原典 :5574-5720)。 */
const EKI_ROW_LABEL: Partial<Record<CustomizeRowSpec['type'], string>> = {
  ekiPrevRessyabangou: '前の列車番号',
  ekiPrevOperationNumber: '前の運用番号',
  ekiPrevRessyasyubetsu: '前の列車種別',
  ekiPrevRessyamei: '前の列車名',
  ekiPrevGousuu: '',
  ekiPrevGou: '',
  ekiOuterShihatsu1: '始発駅',
  ekiOuterShihatsu2: '時刻',
  nyuusen: '入線時刻',
  ekiRessyabangou: '列車番号',
  ekiOperationNumber: '運用番号',
  ekiRessyasyubetsu: '列車種別',
  ekiRessyamei: '列車名',
  ekiGousuu: '',
  ekiGou: '',
  ekiOuterShuchaku1: '終着駅',
  ekiOuterShuchaku2: '時刻',
};

/** 着 / 発 / 番線 だけ [駅名, 種別] の 2 セルになる。 */
const EKI_JIKOKU_LABEL: Partial<Record<CustomizeRowSpec['type'], string>> = {
  chaku: '着',
  hatsu: '発',
  track: '番線',
};

export interface BuildCustomizeTimetableCsvParams {
  readonly rosen: Rosen;
  readonly dia: Dia;
  readonly houkou: Ressyahoukou;
  /** 運用探索が決めたチェーン列(方向ぶん)。 */
  readonly chains: readonly CustomizeChainColumn[];
  readonly rowOptions: CustomizeRowOptions;
  readonly gridOptions: CustomizeGridOptions;
}

/**
 * カスタマイズ時刻表 CSV を組み立てる。
 *
 * 構造: 1 行目 FileType / 2 行目 ダイヤ名 / 3 行目 方向 + "カスタマイズ" / 4 行目 空行 /
 * 以降は行スペック 1 行につき [ラベル1, ラベル2, ...各列のセル]。
 */
export function buildCustomizeTimetableCsv(params: BuildCustomizeTimetableCsvParams): string {
  const { rosen, dia, houkou, chains, rowOptions, gridOptions } = params;
  const specRows = buildCustomizeRowSpec(rosen.ekiCont, houkou, rowOptions);
  const columns = buildCustomizeGrid(dia, rosen, houkou, chains, specRows, gridOptions);
  const ekiCount = rosen.ekiCont.length;

  const rows: string[][] = [];
  rows.push(['FileType', CUSTOMIZE_TIMETABLE_CSV_FILETYPE]);
  rows.push([dia.name]);
  rows.push([`${houkou === 0 ? '下り' : '上り'}カスタマイズ`]);
  rows.push([]); // 空行(セル 0 個)

  for (const [ri, spec] of specRows.entries()) {
    const label = labelOf(spec, rosen, houkou, ekiCount);
    rows.push([...label, ...columns.map((c) => c.cells[ri]?.text ?? '')]);
  }

  return encodeCsvDocument(rows, CSV_OPTIONS);
}

/** 行の左 2 列。 */
function labelOf(
  spec: CustomizeRowSpec,
  rosen: Rosen,
  houkou: Ressyahoukou,
  ekiCount: number,
): [string, string] {
  if (spec.ekiOrder === null) {
    const l = ROW_LABEL[spec.type];
    return l === undefined ? ['', ''] : [l[0], l[1]];
  }
  const jikoku = EKI_JIKOKU_LABEL[spec.type];
  if (jikoku !== undefined) {
    const ekiIndex = houkou === 0 ? spec.ekiOrder : ekiCount - 1 - spec.ekiOrder;
    return [rosen.ekiCont[ekiIndex]?.ekimei ?? '', jikoku];
  }
  // ★駅名を持たない行(前列車情報・路線外欄・入線)はラベルのみ。原典どおり。
  return [EKI_ROW_LABEL[spec.type] ?? '', ''];
}
