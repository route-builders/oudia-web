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

// 運行範囲導出は domain へ移設。derive 公開 API 後方互換のため re-export する。
export {
  getSihatsuEki,
  getSyuuchakuEki,
  getValidSihatsuEki,
  getValidSyuuchakuEki,
  isRunBetweenNextEki,
} from '@oudia-web/domain';
export type { CsvColumnSpec, CsvColumnType } from './csv/colSpec.js';
export { buildColSpec } from './csv/colSpec.js';
export {
  getChakujikokuHyouji,
  getEkimeiJikokuhyouRyaku,
  getHatsujikokuHyouji,
  getTrackDisplay,
  getTrackRyakusyou,
  isHatsuChakuHyouji,
} from './csv/ekiDisplay.js';
export type {
  BuildEkiTimetableCsvParams,
  BuildEkiTimetableCsvResult,
  EkiTimetableCsvOptions,
} from './csv/ekiTimetableCsv.js';
export { buildEkiTimetableCsv } from './csv/ekiTimetableCsv.js';
export type {
  BuildTimetableCsvParams,
  BuildTimetableCsvResult,
  TimetableCsvOptions,
} from './csv/timetableCsv.js';
export { buildTimetableCsv, defaultTimetableCsvOptions } from './csv/timetableCsv.js';
export type {
  EkiJikokuhyouContent,
  EkiJikokuhyouViewModel,
} from './ekiJikokuhyou/deriveEkiJikokuhyou.js';
export { deriveEkiJikokuhyou } from './ekiJikokuhyou/deriveEkiJikokuhyou.js';
export type {
  BuildTimetableGridOptions,
  BuildTimetableGridResult,
} from './grid/buildTimetableGrid.js';
// ---- 通常時刻表グリッド(cellSpec / colSpec)----
export { buildTimetableGrid, defaultTimetableGridOptions } from './grid/buildTimetableGrid.js';
export { chakuCell, getKyoukaisen, hatsuCell, trackCell } from './grid/cellSpec.js';
export type { JikokuhyouRowSpec, JikokuhyouRowType } from './grid/colSpec.js';
export { buildJikokuhyouRowSpec } from './grid/colSpec.js';
export type {
  CellKind,
  CellSpec,
  CellStyle,
  GridColumn,
  MarkKind,
  TimetableGridSpec,
} from './grid/types.js';
export { MARK_GLYPH } from './grid/types.js';
export type { ComputeDiagramLayoutResult } from './layout/computeDiagramLayout.js';
// ---- ダイヤグラム(スジ図)レイアウト ----
export { computeDiagramLayout } from './layout/computeDiagramLayout.js';
// ---- 在線表(M6・単独駅)----
export type {
  RessyaOccupancy,
  RessyaTrackLine,
  Zaisen,
} from './layout/deriveOccupancy.js';
export { deriveOccupancy } from './layout/deriveOccupancy.js';
export { buildDiaLayoutFrame, findEkikanSaisyouSec } from './layout/ekiLayout.js';
export type { EstimateSlot } from './layout/ressyaLayout.js';
export { computeEstimateJikoku } from './layout/ressyaLayout.js';
export type {
  DiagramLayout,
  DiaLayoutFrame,
  EkiLayout,
  RessyaLayout,
  Ressyasen,
  TrackLane,
} from './layout/types.js';
// ---- Full 運用探索(運番割付。M7c)----
export { buildFullState, deriveOperationFull } from './operationFull/deriveOperationFull.js';
// ---- 入出区連携コードの状態機械(M7c-2)----
export type { InOutLinkElement } from './operationFull/inOutLink.js';
export { insertInOutLinkCodeElement, isLinkActive } from './operationFull/inOutLink.js';
// ---- 運用の並べ替え(運用一覧表 / 一覧図 / CSV 共有。M7d)----
export type {
  OperationNumberChunk,
  OperationSort,
  OperationSortContext,
  OperationSortKey,
  OperationSortOptions,
} from './operationFull/operationSort.js';
export {
  lessOperation,
  lessOperationNumber,
  operationSortKeyOf,
  sortOperationNumbers,
  splitOperationNumberParts,
} from './operationFull/operationSort.js';
// ---- 運用表エントリの生成・時刻順挿入(M7c-2)----
export type { OperationTableContext } from './operationFull/operationTable.js';
export {
  addOperationTableContent,
  createOperationTableContext,
  insertOperationTableContentToBuffer,
} from './operationFull/operationTable.js';
export type {
  BeforeAfterTypeFull,
  ConnectWaitItem,
  DeriveOperationFullOptions,
  FullState,
  InOutLinkCodeEntry,
  OperationFullResult,
  OperationNumberMap,
  OperationNumberSlots,
  OperationTableEntry,
  RessyaOperationTree,
  RessyaPropertyRef,
  TreeNode,
} from './operationFull/types.js';
export type { MoveEntry, MoveList } from './operationLight/chains.js';
export {
  addMove,
  applyConnectMoveList,
  applyReleaseMoveList,
  emptyMoveList,
  findChainIndex,
  initChains,
  mergeChains,
  removeChainOf,
} from './operationLight/chains.js';
// ---- Light 運用探索の本体・作業抽出(M7b Light PR2)----
export type {
  DeriveOperationLightOptions,
  OccupancyBuild,
} from './operationLight/deriveOperationLight.js';
export { buildOccupancy, deriveOperationLight } from './operationLight/deriveOperationLight.js';
export type {
  ExpandContext,
  ExpandResult,
  LevelParent,
  TrainStage,
} from './operationLight/extract.js';
export {
  countTopLevel,
  expandStationAfter,
  expandStationBefore,
  ROOT_LEVEL,
  searchAfterOperationElementLight,
  searchBeforeOperationElementLight,
  walkTrainOperations,
} from './operationLight/extract.js';
// ---- Light 運用探索(占有エンジン。M7b Light PR1)----
export {
  buildEkiOrderTable,
  ekiIndexOfExist,
  insertRessyaElement,
  searchRessyaElement,
  searchRessyaElementRev,
} from './operationLight/occupancy.js';
export type {
  BeforeAfterType,
  CustomizeChainColumn,
  Houkou,
  JunctionResolution,
  Occupancy,
  OperationElementLight,
  OperationLightResult,
  OpRef,
  RessyaElement,
} from './operationLight/types.js';
export { opRefEquals, opRefKey } from './operationLight/types.js';
// ---- 運用一覧表 / 運用一覧図の共通ビューモデル(M7d)----
export type {
  AllOperationTableColumn,
  AllOperationTableOptions,
  AllOperationTableRessyaCell,
  AllOperationTableRow,
  AllOperationTableViewModel,
} from './operationView/allOperationTable.js';
export {
  ALL_OPERATION_TABLE_FIX_COLUMN_COUNT,
  buildAllOperationTableColumns,
  columnIndexOf,
  countRessyaInOperation,
  deriveAllOperationTable,
} from './operationView/allOperationTable.js';
// ---- 入出区連携コード一覧ビューモデル(M7d)----
export type {
  InOutLinkCodeListColumn,
  InOutLinkCodeListRow,
  InOutLinkCodeListSideCell,
  InOutLinkCodeListViewModel,
} from './operationView/inOutLinkCodeList.js';
export {
  deriveInOutLinkCodeList,
  IN_OUT_LINK_CODE_LIST_COLUMNS,
  IN_OUT_LINK_CODE_LIST_HEADER,
} from './operationView/inOutLinkCodeList.js';
// ---- 運用表ビュー(従来形式)ビューモデル(M7d)----
export type {
  OperationTableColumn,
  OperationTableEkiCell,
  OperationTableViewModel,
  OperationTableViewOptions,
  OperationTableViewRow,
} from './operationView/operationTableView.js';
export {
  buildOperationTableColumns,
  combineOperationTableRows,
  deriveOperationTableView,
  OPERATION_TABLE_HEADER,
} from './operationView/operationTableView.js';
export type { TransferSortInput } from './sort/transferSort.js';
export { transferSortOrder } from './sort/transferSort.js';
