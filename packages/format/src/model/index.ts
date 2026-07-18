// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 up-tri

/**
 * ファイル同型モデルの型宣言(data-model §2)。
 *
 * これらの型の実体は format の model/ に置き(依存方向 format ← domain を満たすため。
 * file-io §2.3)、@oudia-web/domain が re-export する。model/ には型宣言と判別可能ユニオンの
 * 定義のみを置き、コマンド・整合カスケード等の振る舞いは一切置かない。
 */

export * from './basic.js';
export * from './entities.js';
export * from './enums.js';
export * from './operation.js';
export * from './rosenFileData.js';

