// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 oudia-second-web contributors
//
// Based on OuDiaSecond (Copyright (C) 2017-2026 diagram_mania)
// and OuDia (Copyright (C) 2006-2017 take-okm)

/**
 * コマンドレデューサ群(architecture §4.3)。Immer の draft に対する命令的レデューサ。
 * 原典 CRfEditCmd 各 execute() の直訳を狙う。純関数の decompose はしない。
 */

import type { RosenFileData } from '@oudia/format';
import type { EditCommand } from './types.js';

/** 改行を LF に正規化する(原典 strLfOf。CRLF/CR → LF)。 */
export function normalizeToLf(s: string): string {
  return s.replace(/\r\n?/g, '\n');
}

/**
 * コマンド型 → draft レデューサ。draft は Immer の可変プロキシ。
 * 各レデューサは draft を直接変更し、戻り値は使わない(Immer が patch を記録)。
 */
export const commandReducers: {
  [K in EditCommand['type']]: (
    draft: RosenFileData,
    cmd: Extract<EditCommand, { type: K }>,
  ) => void;
} = {
  'comment/set': (draft, cmd) => {
    // 原典 CRfEditCmd_Comment: 改行を LF 正規化して setComment。
    draft.rosen.comment = normalizeToLf(cmd.comment);
  },
};

/** 到達不能分岐(判別可能ユニオンの網羅性検査)。 */
function assertNever(x: never): never {
  throw new Error(`未対応のコマンド型: ${JSON.stringify(x)}`);
}

/**
 * コマンドを draft に適用する(判別子で型を絞る型安全ディスパッチ)。
 * commandReducers[type] を直接呼ぶと関数ユニオンが never に潰れるため、
 * 判別子で分岐して個別レデューサへ渡す。M3 以降はここに case を追加する。
 */
export function applyCommand(draft: RosenFileData, cmd: EditCommand): void {
  switch (cmd.type) {
    // M2 時点ではコマンド型が 1 種のみのため、この switch は「常に真」に見えるが、
    // M3 以降でコマンド型が増えたときに網羅性(assertNever)を効かせる骨組みである。
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- 単一メンバ union の暫定
    case 'comment/set':
      commandReducers['comment/set'](draft, cmd);
      return;
    default:
      assertNever(cmd.type);
  }
}
