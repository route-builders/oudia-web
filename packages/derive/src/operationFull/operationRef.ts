// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 up-tri
//
// Based on OuDiaSecond (Copyright (C) 2017-2026 diagram_mania)
// and OuDia (Copyright (C) 2006-2017 take-okm)

/**
 * OpRef(方向 + 列車 index + 駅Order + before/after + iLevel パス)から作業実体を辿る。
 * 循環参照を避けるため operationNumberAssign から切り出した単独モジュール。
 */

import type { AfterOperation, BeforeOperation, Dia } from '@oudia-web/format';
import type { OpRef } from '../operationLight/types.js';

/** OpRef が指す union 作業を辿る(iLevel パス。before/after 両対応)。 */
export function resolveOperation(
  dia: Dia,
  ref: OpRef,
): BeforeOperation | AfterOperation | undefined {
  const ressya = dia.ressyaCont[ref.houkou][ref.ressyaIndex];
  const slot = ressya?.ekiJikokuCont[ref.ekiOrder];
  if (slot === undefined) return undefined;
  // iLevel[0] はトップ Cont index。以降は connect/release の子。
  let beforeCont: readonly BeforeOperation[] = slot.beforeOperationCont;
  let afterCont: readonly AfterOperation[] = slot.afterOperationCont;
  let inBefore = ref.opKind === 'before';
  for (let d = 0; d < ref.iLevel.length; d++) {
    const idx = ref.iLevel[d] ?? 0;
    const cont = inBefore ? beforeCont : afterCont;
    const op = cont[idx];
    if (op === undefined) return undefined;
    if (d === ref.iLevel.length - 1) return op;
    // 子へ潜る: connect の子は前作業列、release の子は後作業列。
    if (op.kind === 'connect') {
      beforeCont = op.formationBeforeOperationCont;
      inBefore = true;
    } else if (op.kind === 'release') {
      afterCont = op.formationAfterOperationCont;
      inBefore = false;
    } else {
      return undefined;
    }
  }
  return undefined;
}
