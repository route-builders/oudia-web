// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 oudia-second-web contributors

/**
 * `@oudia/derive` 公開 API。
 *
 * ダイヤグラムレイアウト(computeDiagramLayout)・cellSpec・運用探索・交差支障判定を
 * 提供する導出層。すべて入力 → 出力の純関数(ドメイン状態を変更しない)。
 *
 * M2: 時刻表 CSV / 駅時刻表 CSV の書き出しを提供する。
 */

export { buildColSpec } from './csv/colSpec.js';
export type { CsvColumnType, CsvColumnSpec } from './csv/colSpec.js';
export {
  getChakujikokuHyouji,
  getHatsujikokuHyouji,
  isHatsuChakuHyouji,
  getTrackDisplay,
  getTrackRyakusyou,
  getEkimeiJikokuhyouRyaku,
} from './csv/ekiDisplay.js';
export {
  getSihatsuEki,
  getSyuuchakuEki,
  getValidSihatsuEki,
  getValidSyuuchakuEki,
  isRunBetweenNextEki,
} from './csv/runRange.js';
export { buildTimetableCsv, defaultTimetableCsvOptions } from './csv/timetableCsv.js';
export type {
  TimetableCsvOptions,
  BuildTimetableCsvParams,
  BuildTimetableCsvResult,
} from './csv/timetableCsv.js';
export { buildEkiTimetableCsv } from './csv/ekiTimetableCsv.js';
export type {
  EkiTimetableCsvOptions,
  BuildEkiTimetableCsvParams,
  BuildEkiTimetableCsvResult,
} from './csv/ekiTimetableCsv.js';
export { deriveEkiJikokuhyou } from './ekiJikokuhyou/deriveEkiJikokuhyou.js';
export type {
  EkiJikokuhyouContent,
  EkiJikokuhyouViewModel,
} from './ekiJikokuhyou/deriveEkiJikokuhyou.js';
