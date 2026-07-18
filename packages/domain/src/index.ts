// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 oudia-second-web contributors

/**
 * `@oudia/domain` 公開 API。
 *
 * domain は format のモデル型宣言を re-export し(file-io §2.3)、エンティティ・時刻演算・
 * コマンドレデューサ・整合カスケードを提供する。M1 では時刻演算・index 変換を実装する。
 */

// ---- ファイル同型モデルの型(実体は @oudia/format/model)----
export type * from '@oudia/format';

// ---- 時刻演算・index 変換(domain 実装)----
export * from './jikoku.js';
export * from './ekiOrder.js';

// ---- 列車の運行範囲導出(getSihatsuEki 系。derive から移設)----
export * from './runRange.js';

// ---- 列車エンティティ構築・直通化相手探索 ----
export { createNullRessya, findTrainToDirect } from './ressya.js';

// ---- 編集コマンド基盤(executeCommand / patch Undo/Redo / 変更カウンタ)----
export * from './command/index.js';
