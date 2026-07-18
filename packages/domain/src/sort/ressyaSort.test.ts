// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 up-tri

// 並べ替え比較関数(CDedRessyaSoater 系)+ 最小所要時間検索の検証。

import type { EkiJikoku, Ressya } from '@oudia-web/format';
import { asSeconds } from '@oudia-web/format';
import { describe, expect, it } from 'vitest';
import {
  compareRessyabangouSplit,
  findEkikanSaisyouSecIndex,
  kitenCompareKey,
  sortRessyaOrder,
  splitRessyabangou,
} from './ressyaSort.js';

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
    ekiJikokuCont: slots ?? [ej(), ej()],
    ...rest,
  };
}
const t = (min: number) => asSeconds(min * 60);

describe('splitRessyabangou', () => {
  it('数字と非数字の交互列に分割し、数字塊は int 化する', () => {
    expect(splitRessyabangou('AB012CD')).toEqual([
      { num: null, str: 'AB' },
      { num: 12, str: '' },
      { num: null, str: 'CD' },
    ]);
    expect(splitRessyabangou('')).toEqual([{ num: null, str: '' }]);
    expect(splitRessyabangou('1234M')).toEqual([
      { num: 1234, str: '' },
      { num: null, str: 'M' },
    ]);
  });
});

describe('compareRessyabangouSplit', () => {
  it('原典ヘッダ例: 12AB vs CD34 — 先頭比較なら 12AB 先、末尾比較なら CD34 先', () => {
    expect(compareRessyabangouSplit('12AB', 'CD34', false)).toBeLessThan(0);
    expect(compareRessyabangouSplit('12AB', 'CD34', true)).toBeGreaterThan(0);
  });

  it('数字は値比較(012 = 12 < 100)、非数字は短い方が先 → 辞書順', () => {
    expect(compareRessyabangouSplit('012', '100', false)).toBeLessThan(0);
    expect(compareRessyabangouSplit('AB', 'Z', false)).toBeGreaterThan(0); // 短い Z が先
    expect(compareRessyabangouSplit('AB', 'AC', false)).toBeLessThan(0);
  });

  it('共通長で決着しなければ要素数の少ない方が先', () => {
    expect(compareRessyabangouSplit('12M', '12M3', false)).toBeLessThan(0);
  });
});

describe('sortRessyaOrder(駅扱ソート)', () => {
  const kiten = 5 * 3600; // 起点 5:00
  it('停車→通過→運行なしの順、同ランクは時刻昇順(起点基準の循環)', () => {
    const items = [
      ressya({ ressyabangou: 'A', slots: [ej({ ekiatsukai: 'tsuuka', hatsuJikoku: t(600) })] }),
      ressya({ ressyabangou: 'B', slots: [ej({ ekiatsukai: 'teisya', hatsuJikoku: t(60) })] }), // 1:00 → 起点前 = +24h
      ressya({ ressyabangou: 'C', slots: [ej({ ekiatsukai: 'teisya', hatsuJikoku: t(360) })] }), // 6:00
      ressya({ ressyabangou: 'D', slots: [ej({ ekiatsukai: 'none' })] }),
    ];
    const order = sortRessyaOrder(items, {
      kind: 'ekiatsukai',
      ekiOrder: 0,
      item: 'hatsu',
      kiten,
    });
    // C(停車 6:00) → B(停車 1:00 = 起点前で +24h) → A(通過) → D(運行なし)。
    expect(order.map((i) => items[i]!.ressyabangou)).toEqual(['C', 'B', 'A', 'D']);
  });

  it('フォーカス項目が null なら他方で代替し、同時刻は着由来が先', () => {
    const items = [
      ressya({ ressyabangou: 'A', slots: [ej({ hatsuJikoku: t(400) })] }), // 発 400
      ressya({ ressyabangou: 'B', slots: [ej({ chakuJikoku: t(400) })] }), // 発 null → 着代替
    ];
    const order = sortRessyaOrder(items, {
      kind: 'ekiatsukai',
      ekiOrder: 0,
      item: 'hatsu',
      kiten: 0,
    });
    expect(order.map((i) => items[i]!.ressyabangou)).toEqual(['B', 'A']); // 着由来が先
  });
});

describe('sortRessyaOrder(番号系)', () => {
  it('列車番号ソート: 空番号は後、分割比較、同値は元順維持', () => {
    const items = [
      ressya({ ressyabangou: '' }),
      ressya({ ressyabangou: '102M' }),
      ressya({ ressyabangou: '5M' }),
      ressya({ ressyabangou: '102M', ressyamei: '' }),
    ];
    const order = sortRessyaOrder(items, { kind: 'ressyabangou', compareBottom: false });
    expect(order).toEqual([2, 1, 3, 0]); // 5M → 102M(元順) → 空
  });

  it('種別ソート: 種別 Index 昇順 → 列車名辞書順', () => {
    const items = [
      ressya({ syubetsuIndex: 2, ressyamei: 'あさま' }),
      ressya({ syubetsuIndex: 1, ressyamei: 'ひかり' }),
      ressya({ syubetsuIndex: 1, ressyamei: 'こだま' }),
    ];
    const order = sortRessyaOrder(items, { kind: 'ressyasyubetsu', compareBottom: false });
    expect(order).toEqual([2, 1, 0]); // (1,こだま) → (1,ひかり) → (2,あさま)
  });

  it('isNull 列車は常に後', () => {
    const items = [ressya({ isNull: true }), ressya({ ressyabangou: '1' })];
    expect(sortRessyaOrder(items, { kind: 'bikou' })).toEqual([1, 0]);
  });
});

describe('findEkikanSaisyouSecIndex', () => {
  it('駅間所要秒の最小を返し、停車-停車ペアを優先する', () => {
    const items = [
      // 通過-通過 100 秒(最小だが通過)。
      ressya({
        slots: [
          ej({ ekiatsukai: 'tsuuka', hatsuJikoku: asSeconds(1000) }),
          ej({ ekiatsukai: 'tsuuka', chakuJikoku: asSeconds(1100) }),
        ],
      }),
      // 停車-停車 200 秒 → こちらを優先。
      ressya({
        slots: [ej({ hatsuJikoku: asSeconds(2000) }), ej({ chakuJikoku: asSeconds(2200) })],
      }),
      // 停車-停車 300 秒。
      ressya({
        slots: [ej({ hatsuJikoku: asSeconds(3000) }), ej({ chakuJikoku: asSeconds(3300) })],
      }),
    ];
    expect(findEkikanSaisyouSecIndex(items, 0)).toBe(1);
  });

  it('停車ペアが無ければ通過を含む最小、時刻の無い列車は対象外、皆無なら null', () => {
    const items = [
      ressya({
        slots: [
          ej({ ekiatsukai: 'tsuuka', hatsuJikoku: asSeconds(1000) }),
          ej({ ekiatsukai: 'tsuuka', chakuJikoku: asSeconds(1100) }),
        ],
      }),
      ressya({ slots: [ej(), ej()] }),
    ];
    expect(findEkikanSaisyouSecIndex(items, 0)).toBe(0);
    expect(findEkikanSaisyouSecIndex([ressya({ slots: [ej(), ej()] })], 0)).toBeNull();
  });
});

describe('kitenCompareKey', () => {
  it('起点より前は +24h(5:00 起点で 5:00 < 23:59 < 0:00 < 4:59)', () => {
    const k = 5 * 3600;
    const vals = [5 * 3600, 23 * 3600 + 59 * 60, 0, 5 * 3600 - 60].map((v) =>
      kitenCompareKey(v, k),
    );
    expect([...vals].sort((a, b) => a - b)).toEqual(vals);
  });
});
