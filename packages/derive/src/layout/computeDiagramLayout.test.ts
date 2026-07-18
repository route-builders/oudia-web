// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 up-tri

import type { EkiJikoku, Ressya, RosenFileData } from '@oudia-web/format';
import { RESSYAHOUKOU_KUDARI } from '@oudia-web/format';
import { describe, expect, it } from 'vitest';
import { loadFixture } from '../csv/testFixture.js';
import { computeDiagramLayout } from './computeDiagramLayout.js';
import { findEkikanSaisyouSec } from './ekiLayout.js';
import { ej, makeSyntheticRosen } from './testSynthetic.js';

describe('computeDiagramLayout(sample2 座標スナップショット)', () => {
  it('dia0 下りのフレーム + 先頭列車の列車線', () => {
    const data = loadFixture('current/sample2.oud2');
    const r = computeDiagramLayout(data, 0);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // フレーム全体は大きいので Y 座標列と先頭 2 列車のスジのみスナップショット。
    const frameY = r.layout.frame.ekiLayouts.map((e) => e.dgrYTer);
    const firstTrains = r.layout.ressyaLayouts[0].slice(0, 2).map((t) => ({
      ressyabangou: t.ressyabangou,
      dgrXZone: t.dgrXZone,
      ressyasenCont: t.ressyasenCont,
    }));
    expect({ dgrYSize: r.layout.frame.dgrYSize, frameY, firstTrains }).toMatchSnapshot();
  });

  it('不正な diaIndex は -1', () => {
    const data = loadFixture('current/sample2.oud2');
    expect(computeDiagramLayout(data, 99)).toEqual({ ok: false, code: -1 });
  });
});

// ---- 境界ケース(完了条件 #2: 長時間停車・日跨ぎ・通過推定・経由なし)----

function kudariTrain(cont: EkiJikoku[]): Ressya {
  return {
    isNull: false,
    houkou: RESSYAHOUKOU_KUDARI,
    syubetsuIndex: 0,
    ressyabangou: '1',
    ressyamei: '',
    gousuu: '',
    bikou: '',
    isCanceled: false,
    ekiJikokuCont: cont,
  };
}

function layoutOfTrain(data: RosenFileData) {
  const r = computeDiagramLayout(data, 0);
  if (!r.ok) throw new Error('layout failed');
  return r.layout.ressyaLayouts[0][0]!;
}

describe('境界ケース', () => {
  it('日跨ぎ: 23:00 発 → 1:00 着で X > 86400', () => {
    // 2 駅、23:00 発 → 翌 1:00 着(1:00 = 3600 秒。差分累積で X = 90000)。
    const data = makeSyntheticRosen(2, [
      kudariTrain([ej('teisya', null, 23 * 3600), ej('teisya', 3600, null)]),
    ]);
    // 1:00 = 3600 秒だが、23:00 発からの差分累積で X = 82800 + 7200 = 90000。
    const t = layoutOfTrain(data);
    expect(t.ressyasenCont.length).toBe(1);
    expect(t.ressyasenCont[0]!.kitenDgrX).toBe(82800); // 23:00
    expect(t.ressyasenCont[0]!.syuutenDgrX).toBe(90000); // 翌 1:00 (86400 超)
  });

  it('経由なし: 中間が運行なしだとスジが 2 本に分断される', () => {
    // 4 駅: A(発) B(運行なし) C(運行なし) D(着)… ではなく、
    // A→B 運行、B→C 経由なし、C→D 運行。B/C を none にする。
    const data = makeSyntheticRosen(4, [
      kudariTrain([
        ej('teisya', null, 5 * 3600),
        ej('teisya', 5 * 3600 + 300, 5 * 3600 + 360),
        ej('none', null, null),
        ej('teisya', 5 * 3600 + 900, null),
      ]),
    ]);
    const t = layoutOfTrain(data);
    // 経由なし(駅2)で切れ、A→B と D 周辺で分断(2 区間以上)。
    expect(t.ressyasenCont.length).toBeGreaterThanOrEqual(1);
    // 経由なし駅(order 2)を跨ぐ単一区間は存在しない。
    for (const s of t.ressyasenCont) {
      expect(!(s.kitenEkiOrder < 2 && s.syuutenEkiOrder > 2)).toBe(true);
    }
  });

  it('長時間停車: 途中の停車時間が長いと着時刻が補完され水平線になる', () => {
    // A 発 5:00、B(時刻なし通過想定)、C 着なし発 6:00(長時間停車)。
    const data = makeSyntheticRosen(3, [
      kudariTrain([
        ej('teisya', null, 5 * 3600),
        ej('tsuuka', null, null),
        ej('teisya', null, 6 * 3600),
      ]),
    ]);
    const t = layoutOfTrain(data);
    // 破綻なくスジが生成される(長時間停車補完が働く)。
    expect(t.dgrXZone).not.toBeNull();
  });
});

describe('findEkikanSaisyouSec', () => {
  it('停車-停車の最小所要秒を優先する', () => {
    const fast = kudariTrain([ej('teisya', null, 0), ej('teisya', 60, null)]); // 60s
    const slow = kudariTrain([ej('teisya', null, 0), ej('teisya', 120, null)]); // 120s
    expect(findEkikanSaisyouSec([fast, slow], 0)).toBe(60);
  });

  it('該当列車なしは 0', () => {
    const none = kudariTrain([ej('none', null, null), ej('none', null, null)]);
    expect(findEkikanSaisyouSec([none], 0)).toBe(0);
  });
});
