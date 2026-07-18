// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 oudia-second-web contributors

// 乗継ソート(CDedRessyaSoater_Transfer)+ 推定時刻(createEstimateRessya)の検証。

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parseNodeTree, readRosenFile } from '@oudia/format';
import type { EkiJikoku, Ressya } from '@oudia/format';
import { buildDiaLayoutFrame } from '../layout/ekiLayout.js';
import { computeEstimateJikoku } from '../layout/ressyaLayout.js';
import type { EstimateSlot } from '../layout/ressyaLayout.js';
import { transferSortOrder } from './transferSort.js';

const here = dirname(fileURLToPath(import.meta.url));
const fixtures = join(here, '..', '..', '..', 'format', 'fixtures');

function loadSample() {
  const bytes = new Uint8Array(readFileSync(join(fixtures, 'current', 'sample2.oud2')));
  const p = parseNodeTree(bytes);
  if (!p.ok) throw new Error('parse');
  return readRosenFile(p.root).data;
}

function ej(over: Partial<EkiJikoku> = {}): EkiJikoku {
  return {
    ekiatsukai: 'teisya',
    chakuJikoku: null,
    hatsuJikoku: null,
    ressyaTrackIndex: null,
    beforeOperationCont: [],
    afterOperationCont: [],
    ...over,
  };
}
function ressya(over: Partial<Ressya> & { slots?: EkiJikoku[] }): Ressya {
  const { slots, ...rest } = over;
  return {
    isNull: false,
    houkou: 0,
    syubetsuIndex: 0,
    ressyabangou: '',
    ressyamei: '',
    gousuu: '',
    bikou: '',
    isCanceled: false,
    ekiJikokuCont: slots ?? [ej(), ej(), ej()],
    ...rest,
  };
}

function slot(
  atsukai: EstimateSlot['ekiatsukai'],
  chaku: number | null = null,
  hatsu: number | null = null,
): EstimateSlot {
  return { ekiatsukai: atsukai, chaku, hatsu };
}

describe('computeEstimateJikoku(sample2 実データ)', () => {
  it('実時刻のある駅はほぼ実時刻、無時刻の中間駅は補間値が入る', () => {
    const data = loadSample();
    const dia = data.rosen.diaCont[0]!;
    const frame = buildDiaLayoutFrame(data.rosen, dia.ressyaCont[0], dia.ressyaCont[1]);
    const est = computeEstimateJikoku(dia.ressyaCont[0][0]!, frame, 0);
    // 駅 0(発 0)は列車線起点 → 発 = 実時刻。
    expect(est[0]!.hatsu).toBe(0);
    // 駅 6 は発 1020 の実時刻を持つ → 推定は実時刻から 60 秒未満の誤差
    // (分割点なら一致、中間なら補間との差 < 60 が原典の分割保証)。
    const e6 = est[6]!.hatsu ?? est[6]!.chaku;
    expect(e6).not.toBeNull();
    expect(Math.abs((e6 ?? 0) - 1020)).toBeLessThan(60);
    // 停車だが時刻の無い駅 3 にも補間値が入る(駅 2 発 310 と駅 4 着 720 の間)。
    const e3 = est[3]!.chaku;
    expect(e3).not.toBeNull();
    expect(e3!).toBeGreaterThan(310);
    expect(e3!).toBeLessThan(720);
    // 運行なし駅は null のまま。
    expect(est[14]!.chaku).toBeNull();
    expect(est[14]!.ekiatsukai).toBe('none');
  });
});

describe('transferSortOrder', () => {
  const syuyou3 = [false, false, false];

  it('フォーカス駅に時刻のある列車は時刻順、運行なしの列車は乗継関係で挿入される', () => {
    // 駅 0 がフォーカス。A(発 1000)・B(発 2000)・C(発 3000)。
    // U は駅 0 運行なしだが、駅 1 で A(着 1200)から乗継(発 2500)できる → A の直後へ。
    const items = [
      ressya({ ressyabangou: 'A' }),
      ressya({ ressyabangou: 'B' }),
      ressya({ ressyabangou: 'C' }),
      ressya({ ressyabangou: 'U', slots: [ej({ ekiatsukai: 'none' }), ej(), ej()] }),
    ];
    const estimates: EstimateSlot[][] = [
      [slot('teisya', null, 1000), slot('teisya', 1200, 1250), slot('teisya', 1400)],
      [slot('teisya', null, 2000), slot('none'), slot('none')],
      [slot('teisya', null, 3000), slot('none'), slot('none')],
      [slot('none'), slot('teisya', null, 2500), slot('teisya', 2700)],
    ];
    const order = transferSortOrder({
      items,
      estimates,
      ekiOrder: 0,
      item: 'hatsu',
      kiten: 0,
      isSyuyouByOrder: syuyou3,
    });
    expect(order.map((i) => items[i]!.ressyabangou)).toEqual(['A', 'U', 'B', 'C']);
  });

  it('乗継秒 600 以内が先に配置され、起点を跨ぐ乗換は成立しない', () => {
    // U1 は A から 300 秒(段階 i/ii で配置)、U2 は逆転(発 < 着)で不成立 → 残余へ。
    const items = [
      ressya({ ressyabangou: 'A' }),
      ressya({ ressyabangou: 'U1', slots: [ej({ ekiatsukai: 'none' }), ej(), ej()] }),
      ressya({ ressyabangou: 'U2', slots: [ej({ ekiatsukai: 'none' }), ej(), ej()] }),
    ];
    const estimates: EstimateSlot[][] = [
      [slot('teisya', null, 1000), slot('teisya', 1200, null), slot('none')],
      [slot('none'), slot('teisya', null, 1500), slot('teisya', 1600)],
      [slot('none'), slot('teisya', null, 900), slot('none')], // 発 900 < 着 1200 → 不可
    ];
    const order = transferSortOrder({
      items,
      estimates,
      ekiOrder: 0,
      item: 'hatsu',
      kiten: 0,
      isSyuyouByOrder: syuyou3,
    });
    // U2 は残余: isNull でなく終着駅 Order(2 …実データでは全 teisya)> 0 → 先頭へ。
    expect(order.map((i) => items[i]!.ressyabangou)).toEqual(['U2', 'A', 'U1']);
  });

  it('To 経路(着行): 乗継先の直前へ挿入される(u の着 → s の発)', () => {
    // フォーカス駅 1(着行)。A は駅 1 発 1600。U は駅 1 運行なしではなく…
    // U はフォーカス駅 1 が none でソート前、駅 0 で U の着 1500 → A の発 1600(100 秒)。
    const items = [
      ressya({ ressyabangou: 'A' }),
      ressya({ ressyabangou: 'B' }),
      ressya({ ressyabangou: 'U', slots: [ej(), ej({ ekiatsukai: 'none' }), ej()] }),
    ];
    const estimates: EstimateSlot[][] = [
      [slot('teisya', null, 1600), slot('teisya', 1700, 1750), slot('none')],
      [slot('teisya', null, 3000), slot('teisya', 3100, 3150), slot('none')],
      [slot('teisya', 1500, null), slot('none'), slot('none')],
    ];
    const order = transferSortOrder({
      items,
      estimates,
      ekiOrder: 1,
      item: 'chaku', // 着行 → To(F..0) が先行
      kiten: 0,
      isSyuyouByOrder: syuyou3,
    });
    // U(着 1500)は駅 0 で A(発 1600)へ乗継 → A の直前へ。
    expect(order.map((i) => items[i]!.ressyabangou)).toEqual(['U', 'A', 'B']);
  });

  it('発行(hatsu)では From が先行し、乗継元の直後へ挿入される', () => {
    const items = [
      ressya({ ressyabangou: 'A' }),
      ressya({ ressyabangou: 'B' }),
      ressya({ ressyabangou: 'U', slots: [ej({ ekiatsukai: 'none' }), ej(), ej()] }),
    ];
    const estimates: EstimateSlot[][] = [
      [slot('teisya', null, 1000), slot('teisya', 1200, null), slot('none')],
      [slot('teisya', null, 2000), slot('none'), slot('none')],
      [slot('none'), slot('teisya', null, 1300), slot('teisya', 1400)],
    ];
    const order = transferSortOrder({
      items,
      estimates,
      ekiOrder: 0,
      item: 'hatsu', // 発行 → From(F..末尾) が先行
      kiten: 0,
      isSyuyouByOrder: syuyou3,
    });
    // A(駅 1 着 1200)→ U(駅 1 発 1300。100 秒)で A の直後へ。
    expect(order.map((i) => items[i]!.ressyabangou)).toEqual(['A', 'U', 'B']);
  });

  it('第 2 段階は非主要駅のみ(主要駅の 600 秒超は第 3 段階まで残る)', () => {
    // 駅 1 = 主要駅。A→U の乗継は 700 秒(600 超)なので第 1 段階では不成立、
    // 第 2 段階(非主要のみ)でも駅 1 は走査されず、第 3 段階(無制限)で成立する。
    // 挙動が原典と同じ「最終的には配置される」ことと、段階フィルタの存在を検証。
    const items = [
      ressya({ ressyabangou: 'A' }),
      ressya({ ressyabangou: 'U', slots: [ej({ ekiatsukai: 'none' }), ej(), ej()] }),
    ];
    const estimates: EstimateSlot[][] = [
      [slot('teisya', null, 1000), slot('teisya', 1200, null), slot('none')],
      [slot('none'), slot('teisya', null, 1900), slot('teisya', 2000)],
    ];
    const order = transferSortOrder({
      items,
      estimates,
      ekiOrder: 0,
      item: 'hatsu',
      kiten: 0,
      isSyuyouByOrder: [false, true, false], // 駅 1 は主要駅
    });
    expect(order.map((i) => items[i]!.ressyabangou)).toEqual(['A', 'U']);
  });

  it('isNull 列車は末尾へ、時刻 null のソート対象は後方', () => {
    const items = [
      ressya({ ressyabangou: 'A' }),
      ressya({ ressyabangou: 'N', isNull: true, slots: [ej({ ekiatsukai: 'none' })] }),
      ressya({ ressyabangou: 'B' }),
    ];
    const estimates: EstimateSlot[][] = [
      [slot('teisya', null, 2000)],
      [slot('none')],
      [slot('teisya', null, 1000)],
    ];
    const order = transferSortOrder({
      items,
      estimates,
      ekiOrder: 0,
      item: 'hatsu',
      kiten: 0,
      isSyuyouByOrder: [false],
    });
    expect(order.map((i) => items[i]!.ressyabangou)).toEqual(['B', 'A', 'N']);
  });
});
