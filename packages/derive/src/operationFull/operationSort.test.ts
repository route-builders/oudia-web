// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 up-tri

/**
 * 運用の並べ替え(operationSort.ts)の単体テスト。M7d。
 * 運用番号の自然順比較(数字塊/文字塊・末尾要素基準)と 5 種のソートキーを検証する。
 */

import { createDefaultEki, createNullRessya, deriveBrunchLoopMap } from '@oudia-web/domain';
import type { Eki, Ressya } from '@oudia-web/format';
import { asSeconds } from '@oudia-web/format';
import { describe, expect, it } from 'vitest';
import {
  lessOperation,
  lessOperationNumber,
  type OperationSort,
  type OperationSortContext,
  type OperationSortKey,
  operationSortKeyOf,
  sortOperationNumbers,
  splitOperationNumberParts,
} from './operationSort.js';
import type { OperationTableEntry } from './types.js';

const J = (h: number, m = 0) => asSeconds(h * 3600 + m * 60);

/** 運用番号列を並べ替える(比較関数の検証用。挿入ソートで原典と同じ順序になる)。 */
function sortNumbers(list: string[], compareBottom = false): string[] {
  const out: string[] = [];
  for (const s of list) {
    let done = false;
    for (let i = 0; i < out.length; i++) {
      if (lessOperationNumber(s, out[i] ?? '', compareBottom)) {
        out.splice(i, 0, s);
        done = true;
        break;
      }
    }
    if (!done) out.push(s);
  }
  return out;
}

describe('splitOperationNumberParts', () => {
  it('数字塊と文字塊に切る', () => {
    expect(splitOperationNumberParts('A12B3')).toEqual([
      { num: null, str: 'A' },
      { num: 12, str: '' },
      { num: null, str: 'B' },
      { num: 3, str: '' },
    ]);
  });

  it('空文字は塊なし', () => {
    expect(splitOperationNumberParts('')).toEqual([]);
  });

  it('先頭 0 は数値化で落ちる(原典 _ttoi)', () => {
    expect(splitOperationNumberParts('007')).toEqual([{ num: 7, str: '' }]);
  });

  it('全角数字は文字塊(原典 _istdigit は ASCII のみ)', () => {
    expect(splitOperationNumberParts('１２')).toEqual([{ num: null, str: '１２' }]);
  });
});

describe('lessOperationNumber(自然順比較)', () => {
  it('数値として並ぶ(辞書順ではない)', () => {
    expect(sortNumbers(['10', '9', '100', '2'])).toEqual(['2', '9', '10', '100']);
  });

  it('空文字は最後', () => {
    expect(sortNumbers(['3', '', '1'])).toEqual(['1', '3', '']);
  });

  it('数字塊は文字塊より先', () => {
    expect(lessOperationNumber('1', 'A', false)).toBe(true);
    expect(lessOperationNumber('A', '1', false)).toBe(false);
  });

  it('文字塊同士はまず長さ、次に辞書順', () => {
    // 'AB' より 'C' が先(長さ 1 < 2)。
    expect(lessOperationNumber('C', 'AB', false)).toBe(true);
    // 同じ長さなら辞書順。
    expect(lessOperationNumber('A', 'B', false)).toBe(true);
  });

  it('全塊同点なら塊数が少ない方が先', () => {
    expect(lessOperationNumber('1', '1A', false)).toBe(true);
    expect(lessOperationNumber('1A', '1', false)).toBe(false);
  });

  it('末尾要素基準では末尾の塊から突き合わせる', () => {
    // 通常: A1 < B1(先頭の文字塊 A < B)。
    expect(sortNumbers(['B1', 'A2'])).toEqual(['A2', 'B1']);
    // 末尾基準: 末尾の数字塊 1 < 2 なので B1 が先。
    expect(sortNumbers(['B1', 'A2'], true)).toEqual(['B1', 'A2']);
  });
});

// ---- ソートキー抽出 ----

function makeEkiCont(): Eki[] {
  return [0, 1, 2].map((i) => createDefaultEki(i, `E${String(i)}`));
}

/** E0〜E2 を全区間走行する下り列車。 */
function makeRessya(): Ressya {
  const r = createNullRessya(3, 0);
  r.isNull = false;
  for (let o = 0; o < 3; o++) {
    const s = r.ekiJikokuCont[o];
    if (s === undefined) continue;
    s.ekiatsukai = 'teisya';
    s.chakuJikoku = J(8, o * 30);
    s.hatsuJikoku = J(8, o * 30 + 5);
  }
  return r;
}

function makeCtx(ekiCont: Eki[], ressya: Ressya): OperationSortContext {
  return {
    ressyaCont: [[ressya], []],
    ekiCount: ekiCont.length,
    brunchLoop: deriveBrunchLoopMap(ekiCont),
  };
}

function entry(over: Partial<OperationTableEntry> = {}): OperationTableEntry {
  return {
    ressyaProperty: { houkou: 0, ressyaIndex: 0, jikoku: null },
    sihatsuEkiOrder: 0,
    beforeType: 'outIn',
    outerSihatsuEkiIndex: null,
    outerSihatsuJikoku: null,
    chakuJikoku: null,
    syuuchakuEkiOrder: 2,
    afterType: 'outIn',
    outerSyuuchakuEkiIndex: null,
    hatsuJikoku: null,
    outerSyuuchakuJikoku: null,
    afterOperation: null,
    ...over,
  };
}

describe('operationSortKeyOf', () => {
  const ekiCont = makeEkiCont();
  const ressya = makeRessya();
  const ctx = makeCtx(ekiCont, ressya);

  it('出区側は先頭エントリの始発駅・発時刻を使う', () => {
    const k = operationSortKeyOf('5', [entry(), entry({ sihatsuEkiOrder: 1 })], 'outEki', ctx);
    expect(k.ekiIndex).toBe(0);
    expect(k.outerEkiIndex).toBeNull();
    expect(k.jikoku).toBe(J(8, 5)); // E0 の発時刻
  });

  it('入区側は末尾エントリの終着駅・着時刻を使う', () => {
    const k = operationSortKeyOf(
      '5',
      [entry({ syuuchakuEkiOrder: 1 }), entry({ syuuchakuEkiOrder: 2 })],
      'inEki',
      ctx,
    );
    expect(k.ekiIndex).toBe(2);
    expect(k.jikoku).toBe(J(9)); // E2 の着時刻
  });

  it('路線外始発は路線外駅 index と路線外発時刻を使う', () => {
    const k = operationSortKeyOf(
      '5',
      [entry({ outerSihatsuEkiIndex: 3, outerSihatsuJikoku: J(7) })],
      'outEki',
      ctx,
    );
    expect(k.outerEkiIndex).toBe(3);
    expect(k.jikoku).toBe(J(7));
  });
});

describe('lessOperation(5 モード)', () => {
  const OPTS = (sort: OperationSort) =>
    ({ sort, compareBottom: false, kitenJikoku: null }) as const;
  const key = (over: Partial<OperationSortKey>): OperationSortKey => ({
    operationNumber: '1',
    ekiIndex: 0,
    outerEkiIndex: null,
    jikoku: null,
    ...over,
  });

  it('運用番号順は運番だけを見る', () => {
    const a = key({ operationNumber: '2', ekiIndex: 9, jikoku: J(23) });
    const b = key({ operationNumber: '10', ekiIndex: 0, jikoku: J(1) });
    expect(lessOperation(a, b, OPTS('operationNumber'))).toBe(true);
  });

  it('出区駅順は 駅 → 路線外 → 時刻 → 運番 の順で見る', () => {
    const a = key({ operationNumber: '9', ekiIndex: 0 });
    const b = key({ operationNumber: '1', ekiIndex: 1 });
    expect(lessOperation(a, b, OPTS('outEki'))).toBe(true);
    // 同一駅 → 純粋な出区が路線外始発より先。
    const c = key({ operationNumber: '9', ekiIndex: 0, outerEkiIndex: null });
    const d = key({ operationNumber: '1', ekiIndex: 0, outerEkiIndex: 0 });
    expect(lessOperation(c, d, OPTS('outEki'))).toBe(true);
    // 同一駅・同一路線外 → 時刻順。
    const e = key({ operationNumber: '9', ekiIndex: 0, jikoku: J(7) });
    const f = key({ operationNumber: '1', ekiIndex: 0, jikoku: J(8) });
    expect(lessOperation(e, f, OPTS('outEki'))).toBe(true);
  });

  it('時刻順は 時刻 → 運番 の順で見る(駅は無視)', () => {
    const a = key({ operationNumber: '9', ekiIndex: 9, jikoku: J(7) });
    const b = key({ operationNumber: '1', ekiIndex: 0, jikoku: J(8) });
    expect(lessOperation(a, b, OPTS('outJikoku'))).toBe(true);
  });

  it('空運番はモードに関係なく最後', () => {
    const a = key({ operationNumber: '', jikoku: J(1) });
    const b = key({ operationNumber: '9', jikoku: J(23) });
    expect(lessOperation(a, b, OPTS('outJikoku'))).toBe(false);
  });
});

describe('sortOperationNumbers', () => {
  const ekiCont = makeEkiCont();
  const ressya = makeRessya();
  const ctx = makeCtx(ekiCont, ressya);

  it('運用番号順で自然順に並ぶ', () => {
    const table = new Map<string, OperationTableEntry[]>([
      ['10', [entry()]],
      ['2', [entry()]],
      ['A1', [entry()]],
      ['9', [entry()]],
    ]);
    const order = sortOperationNumbers(
      table,
      { sort: 'operationNumber', compareBottom: false, kitenJikoku: null },
      ctx,
    );
    expect(order).toEqual(['2', '9', '10', 'A1']);
  });

  it('エントリが空の運番(原典 operator[] が作る空リスト)は除外する', () => {
    const table = new Map<string, OperationTableEntry[]>([
      ['1', [entry()]],
      ['2', []],
    ]);
    const order = sortOperationNumbers(
      table,
      { sort: 'operationNumber', compareBottom: false, kitenJikoku: null },
      ctx,
    );
    expect(order).toEqual(['1']);
  });
});
