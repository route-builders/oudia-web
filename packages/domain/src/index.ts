// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 up-tri

/**
 * `@oudia-web/domain` 公開 API。
 *
 * domain は format のモデル型宣言を re-export し(file-io §2.3)、エンティティ・時刻演算・
 * コマンドレデューサ・整合カスケードを提供する。M1 では時刻演算・index 変換を実装する。
 */

// ---- ファイル同型モデルの型(実体は @oudia-web/format/model)----
export type * from '@oudia-web/format';
// ---- 分岐・環状の派生マップ(導出値。ストア外)----
export type { BrunchLoopMap, BrunchLoopPosition } from './brunchLoop.js';
export { deriveBrunchLoopMap } from './brunchLoop.js';
// ---- 作業整合 adjustOperation(M7a。駅編集後・作業編集後に呼ぶ)----
export { adjustAllOperation, adjustRessyaOperation } from './command/adjustOperation.js';
// ---- 駅表示設定の一括サイクル(M6 カスタマイズ時刻表)----
export type { EkiDisplaySetting } from './command/ekiDisplayCycle.js';
export { cycleEkiDisplaySetting } from './command/ekiDisplayCycle.js';
// ---- 編集コマンド基盤(executeCommand / patch Undo/Redo / 変更カウンタ)----
export * from './command/index.js';
// ---- 番線編集の削除ガード(UI の事前検証で使う)----
export { checkTrackDeletable } from './command/trackCascade.js';
// ---- 時刻演算・index 変換(domain 実装)----
export * from './ekiOrder.js';
// ---- 路線の組入れ(別路線の埋込。原典 CentDedRosen::insert)----
export { canEmbedRosen, embedRosen } from './embedRosen.js';
// ---- 新規エンティティのファクトリ(createDefault* / createNewRosen)----
export {
  createDefaultDia,
  createDefaultDispProp,
  createDefaultEki,
  createDefaultEkiTrack2,
  createDefaultRessyasyubetsu,
  createDefaultRosen,
  createNewRosen,
  makeNoneEkiJikoku,
  NEW_FILE_TYPE,
} from './factory.js';
export * from './jikoku.js';
// ---- 列車エンティティ構築・直通化相手探索 ----
export { createNullRessya, findTrainToDirect } from './ressya.js';
// ---- 列車の運行範囲導出(getSihatsuEki 系。derive から移設)----
export * from './runRange.js';
// ---- 列車の並べ替え・最小所要時間検索(CDedRessyaSoater 系)----
export * from './sort/ressyaSort.js';
// ---- 路線の切り出し(部分路線生成。原典 createSubRosen)----
export { canCreateSubRosen, createSubRosen } from './subRosen.js';
