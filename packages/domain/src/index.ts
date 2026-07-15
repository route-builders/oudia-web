// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 oudia-second-web contributors

/**
 * `@oudia/domain` 公開 API(M0 スタブ)。
 *
 * domain は format の型宣言を re-export し(file-io §2.3)、エンティティ・時刻演算・
 * コマンドレデューサ・整合カスケードを提供する。実体は M1 以降で実装する。
 * ここでは依存方向(format ← domain)が成立することを示す最小の re-export のみ置く。
 */

export type { PtNode, PtDirectory } from '@oudia/format';
