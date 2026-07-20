// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 up-tri

/**
 * deriveBrunchLoopMap の原典忠実性テスト(searchEkiIndexBrunchLoop の 4 ケース)。
 * 位置コード: 'standalone'(-1) / 'originSideBrunch'(INT_MIN) / number(loop 内) /
 * 'terminalSideBrunch'(INT_MAX)。配列は昇順。
 */

import type { Eki } from '@oudia-web/format';
import { describe, expect, it } from 'vitest';
import { deriveBrunchLoopMap } from './brunchLoop.js';
import { createDefaultEki } from './factory.js';

function ekiChain(
  n: number,
  config: (i: number) => Partial<Pick<Eki, 'brunchCoreEkiIndex' | 'loopOriginEkiIndex'>>,
): Eki[] {
  return Array.from({ length: n }, (_, i) => {
    const e = createDefaultEki(i, `E${String(i)}`);
    Object.assign(e, config(i));
    return e;
  });
}

describe('deriveBrunchLoopMap', () => {
  it('分岐なし: 全駅 standalone', () => {
    const map = deriveBrunchLoopMap(ekiChain(4, () => ({})));
    expect(map.positions).toEqual(['standalone', 'standalone', 'standalone', 'standalone']);
    expect(map.ekiIndexLoop.every((a) => a.length === 0)).toBe(true);
  });

  it('終点側分岐: 駅3 が 駅1 を core にする(CASE B: core < index)', () => {
    // 0-1-2 が本線、3 が 1 から分岐(1 より後ろ)。
    const eki = ekiChain(4, (i) => (i === 3 ? { brunchCoreEkiIndex: 1 } : {}));
    const map = deriveBrunchLoopMap(eki);
    // 駅3 は core(1)より後ろ → terminalSideBrunch。
    expect(map.positions[3]).toBe('terminalSideBrunch');
    // 駅1(core)は loop チェーンの一員(position 数値)。
    expect(typeof map.positions[1]).toBe('number');
    // グループの terminalSide 配列に 3 が含まれる。
    expect(map.ekiIndexBrunchTerminalSide[1]).toContain(3);
  });

  it('起点側分岐: 駅0 が 駅2 を core にする(CASE A: core > index)', () => {
    const eki = ekiChain(4, (i) => (i === 0 ? { brunchCoreEkiIndex: 2 } : {}));
    const map = deriveBrunchLoopMap(eki);
    expect(map.positions[0]).toBe('originSideBrunch');
    expect(map.ekiIndexBrunchOriginSide[2]).toContain(0);
  });

  it('環状: 駅3 の loopOrigin が 駅0(CASE C/D)', () => {
    const eki = ekiChain(4, (i) => (i === 3 ? { loopOriginEkiIndex: 0 } : {}));
    const map = deriveBrunchLoopMap(eki);
    // 環状チェーンは 0..3 を含み、各駅は number position。
    expect(typeof map.positions[0]).toBe('number');
    expect(typeof map.positions[3]).toBe('number');
    // loop 配列は昇順で 0 と 3 を含む。
    expect(map.ekiIndexLoop[0]).toContain(0);
    expect(map.ekiIndexLoop[0]).toContain(3);
    // 昇順であることの確認。
    const loop = map.ekiIndexLoop[3] ?? [];
    expect([...loop]).toEqual([...loop].sort((a, b) => a - b));
  });
});
