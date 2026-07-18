// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 up-tri

/**
 * `@oudia-web/derive` 公開 API。
 *
 * ダイヤグラムレイアウト(computeDiagramLayout)・cellSpec・運用探索・交差支障判定を
 * 提供する導出層。すべて入力 → 出力の純関数(ドメイン状態を変更しない)。
 *
 * M2: 時刻表 CSV / 駅時刻表 CSV の書き出しを提供する。
 */

export { buildColSpec } from './csv/colSpec.js';
export type { CsvColumnSpec, CsvColumnType } from './csv/colSpec.js';
export {
    getChakujikokuHyouji, getEkimeiJikokuhyouRyaku, getHatsujikokuHyouji, getTrackDisplay,
    getTrackRyakusyou, isHatsuChakuHyouji
} from './csv/ekiDisplay.js';
// 運行範囲導出は domain へ移設。derive 公開 API 後方互換のため re-export する。
export {
    getSihatsuEki,
    getSyuuchakuEki,
    getValidSihatsuEki,
    getValidSyuuchakuEki,
    isRunBetweenNextEki
} from '@oudia-web/domain';
export { buildEkiTimetableCsv } from './csv/ekiTimetableCsv.js';
export type {
    BuildEkiTimetableCsvParams,
    BuildEkiTimetableCsvResult, EkiTimetableCsvOptions
} from './csv/ekiTimetableCsv.js';
export { buildTimetableCsv, defaultTimetableCsvOptions } from './csv/timetableCsv.js';
export type {
    BuildTimetableCsvParams,
    BuildTimetableCsvResult, TimetableCsvOptions
} from './csv/timetableCsv.js';
export { deriveEkiJikokuhyou } from './ekiJikokuhyou/deriveEkiJikokuhyou.js';
export type {
    EkiJikokuhyouContent,
    EkiJikokuhyouViewModel
} from './ekiJikokuhyou/deriveEkiJikokuhyou.js';

// ---- ダイヤグラム(スジ図)レイアウト ----
export { computeDiagramLayout } from './layout/computeDiagramLayout.js';
export type { ComputeDiagramLayoutResult } from './layout/computeDiagramLayout.js';
export { buildDiaLayoutFrame, findEkikanSaisyouSec } from './layout/ekiLayout.js';
export { computeEstimateJikoku } from './layout/ressyaLayout.js';
export type { EstimateSlot } from './layout/ressyaLayout.js';
export type {
    DiaLayoutFrame, DiagramLayout, EkiLayout,
    RessyaLayout,
    Ressyasen
} from './layout/types.js';
export { transferSortOrder } from './sort/transferSort.js';
export type { TransferSortInput } from './sort/transferSort.js';

// ---- 通常時刻表グリッド(cellSpec / colSpec)----
export { buildTimetableGrid, defaultTimetableGridOptions } from './grid/buildTimetableGrid.js';
export type {
    BuildTimetableGridOptions,
    BuildTimetableGridResult
} from './grid/buildTimetableGrid.js';
export { chakuCell, getKyoukaisen, hatsuCell, trackCell } from './grid/cellSpec.js';
export { buildJikokuhyouRowSpec } from './grid/colSpec.js';
export type { JikokuhyouRowSpec, JikokuhyouRowType } from './grid/colSpec.js';
export { MARK_GLYPH } from './grid/types.js';
export type {
    CellKind, CellSpec, CellStyle, GridColumn, MarkKind, TimetableGridSpec
} from './grid/types.js';

