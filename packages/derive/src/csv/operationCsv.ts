// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 up-tri
//
// Based on OuDiaSecond (Copyright (C) 2017-2026 diagram_mania)
// and OuDia (Copyright (C) 2006-2017 take-okm)

/**
 * 運用表 CSV / 運用一覧表 CSV(原典 CconvOperationTableCsv::encode :226-700 /
 * CconvAllOperationTableCsv::encode :226-300 の直訳)。M7d。
 *
 * どちらも UTF-8 BOM + CRLF(原典 stringToFile が `_tfopen_s(..., "w , ccs=UTF-8")` を使うため。
 * vectorToFile.cpp:174-204)。セル引用は改行と `"` を含むときだけ(カンマは引用しない
 * = 原典既知の穴)で、既存 encodeCsvDocument と一致する。
 *
 * ★運用表 CSV の 1 行目はダイヤ名のみ(FileType 行は原典でコメントアウト、:272-279)。
 * ★運用一覧表 CSV には FileType 行がある。
 * ★箱ダイヤ形式の CSV は別タスク(表示駅リスト構築が必要)。
 */

import type { Dia, Rosen } from '@oudia-web/format';
import { encodeCsvDocument } from '@oudia-web/format';
import type { OperationTableEntry } from '../operationFull/types.js';
import type { AllOperationTableViewModel } from '../operationView/allOperationTable.js';
import type {
  OperationTableViewModel,
  OperationTableViewOptions,
} from '../operationView/operationTableView.js';
import { deriveOperationTableView } from '../operationView/operationTableView.js';

/** 原典と同じ書き出し設定(UTF-8 BOM + CRLF)。 */
const CSV_OPTIONS = { lineEnding: '\r\n', bom: true } as const;

const WORD_RESSYABANGOU = '列車番号';
const WORD_RESSYASYUBETSU = '列車種別';
const WORD_RESSYAMEI = '列車名';
const WORD_GOUSUU = '号数';
const WORD_EKIMEI = '駅名';
const WORD_EKIJIKOKU = '駅時刻';
const WORD_TRACK = '番線';

export interface BuildOperationTableCsvParams {
  readonly rosen: Rosen;
  readonly dia: Dia;
  /** 出力対象の運用番号(並べ替え済みの順序で渡す)。 */
  readonly operationNumbers: readonly string[];
  /** deriveOperationFull の operationTable。 */
  readonly operationTable: ReadonlyMap<string, readonly OperationTableEntry[]>;
  readonly options: OperationTableViewOptions;
}

/**
 * 運用表 CSV(従来形式)を組み立てる(原典 :226-700)。
 *
 * 構造: 1 行目 = ダイヤ名。以降、運用番号ごとに
 * [空行] → [運用番号 1 セル] → [項目名行] → [各行] を繰り返す。
 */
export function buildOperationTableCsv(params: BuildOperationTableCsvParams): string {
  const { rosen, dia, operationNumbers, operationTable, options } = params;
  const rows: string[][] = [];
  rows.push([dia.name]);

  const showRessyamei = options.displayRessyamei;
  const showTrack = options.displayTrackName;

  for (const operationNumber of operationNumbers) {
    const entries = operationTable.get(operationNumber) ?? [];
    if (entries.length === 0) continue;
    const vm: OperationTableViewModel = deriveOperationTableView(
      dia,
      rosen,
      operationNumber,
      entries,
      options,
    );

    rows.push([]); // 空行(セル 0 個)
    rows.push([operationNumber]);

    // 項目名行(原典 :638-676)。矢印列のヘッダは空セル。
    const header: string[] = [WORD_RESSYABANGOU, WORD_RESSYASYUBETSU];
    if (showRessyamei) header.push(WORD_RESSYAMEI, WORD_GOUSUU, '');
    header.push(WORD_EKIMEI);
    if (showTrack) header.push(WORD_TRACK);
    header.push(WORD_EKIJIKOKU, '', WORD_EKIMEI);
    if (showTrack) header.push(WORD_TRACK);
    header.push(WORD_EKIJIKOKU);
    rows.push(header);

    for (const row of vm.rows) {
      const cells: string[] = [row.ressyabangou, row.syubetsumei];
      if (showRessyamei) {
        // グリッドは「列車名 + 号数号」を 1 セルに詰めるが、CSV は 3 列に分ける(原典 :638-676)。
        const [mei, gou] = splitRessyameiGousuu(row.ressyamei);
        cells.push(mei, gou, gou === '' ? '' : '号');
      }
      cells.push(row.originSide.ekimei);
      if (showTrack) cells.push(row.originSide.track);
      cells.push(row.originSide.jikokuText, row.houkouArrow, row.terminalSide.ekimei);
      if (showTrack) cells.push(row.terminalSide.track);
      cells.push(row.terminalSide.jikokuText);
      rows.push(cells);
    }
  }

  return encodeCsvDocument(rows, CSV_OPTIONS);
}

/** ビューモデルの「列車名 号数号」から [列車名, 号数] に戻す。 */
function splitRessyameiGousuu(text: string): [string, string] {
  const m = /^(.*) (\S+)号$/.exec(text);
  if (m === null) return [text, ''];
  return [m[1] ?? '', m[2] ?? ''];
}

export interface BuildAllOperationTableCsvParams {
  readonly dia: Dia;
  readonly viewModel: AllOperationTableViewModel;
  readonly displayRessyamei: boolean;
  readonly displayAllRessya: boolean;
}

/** 運用一覧表 CSV の FileType(原典 CconvAllOperationTableCsv.h)。 */
export const ALL_OPERATION_TABLE_CSV_FILETYPE = 'OuDiaSecond.AllOperationTableCsv.1';

/**
 * 運用一覧表 CSV を組み立てる(原典 CconvAllOperationTableCsv::encode :226-300)。
 *
 * 構造: 1 行目 = FileType、2 行目 = ダイヤ名、3 行目 = 空行、4 行目 = 項目名行、以降データ行。
 * データ行の先頭は 1 始まりの連番、列車ブロックの先頭セルは 下り/上り。
 */
export function buildAllOperationTableCsv(params: BuildAllOperationTableCsvParams): string {
  const { dia, viewModel, displayRessyamei, displayAllRessya } = params;
  const rows: string[][] = [];
  rows.push(['FileType', ALL_OPERATION_TABLE_CSV_FILETYPE]);
  rows.push([dia.name]);
  rows.push([]);

  const slots = viewModel.rows[0]?.ressya.length ?? (displayAllRessya ? 0 : 2);

  const header: string[] = ['', '運用番号', '出区駅名', '発時刻', '', '入区駅名', '着時刻'];
  for (let i = 0; i < slots; i++) {
    header.push(displayAllRessya ? String(i + 1) : i === 0 ? '出区列車' : '入区列車');
    header.push(WORD_RESSYABANGOU, '種別');
    if (displayRessyamei) header.push(WORD_RESSYAMEI, WORD_GOUSUU, '');
    if (i < slots - 1) header.push(''); // 列車間の矢印列
  }
  rows.push(header);

  for (const row of viewModel.rows) {
    const cells: string[] = [
      String(row.rowNumber),
      row.operationNumber,
      row.outEkimei,
      row.outJikokuText,
      '→',
      row.inEkimei,
      row.inJikokuText,
    ];
    row.ressya.forEach((cell, i) => {
      if (cell === null) {
        cells.push('', '', '');
        if (displayRessyamei) cells.push('', '', '');
      } else {
        cells.push(cell.houkouText, cell.ressyabangou, cell.syubetsumei);
        if (displayRessyamei) {
          const [mei, gou] = splitRessyameiGousuu(cell.ressyamei);
          cells.push(mei, gou, gou === '' ? '' : '号');
        }
      }
      if (i < slots - 1) cells.push(cell?.arrowAfter === true ? '→' : '');
    });
    rows.push(cells);
  }

  return encodeCsvDocument(rows, CSV_OPTIONS);
}
