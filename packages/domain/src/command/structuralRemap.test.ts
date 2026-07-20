// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 up-tri

/**
 * 種別・ダイヤの構造編集カスケードの原典忠実性テスト(狙い撃ち)。
 */

import { describe, expect, it } from 'vitest';
import { createDefaultDia, createDefaultRessyasyubetsu, createNewRosen } from '../factory.js';
import { createNullRessya } from '../ressya.js';
import { createDocumentState, executeCommand } from './engine.js';

describe('syubetsu 削除の再マップ', () => {
  it('削除された種別を使う列車は既定種別 0 へ、後ろの index は -1', () => {
    const data = createNewRosen();
    data.rosen.ressyasyubetsuCont = ['A', 'B', 'C'].map((n) => createDefaultRessyasyubetsu(n));
    const dia = createDefaultDia('D');
    const r0 = createNullRessya(0, 0);
    r0.isNull = false;
    r0.syubetsuIndex = 1; // B
    const r1 = createNullRessya(0, 0);
    r1.isNull = false;
    r1.syubetsuIndex = 2; // C
    dia.ressyaCont[0].push(r0, r1);
    data.rosen.diaCont.push(dia);

    let state = createDocumentState(data);
    // 種別 B(index1)を削除。
    state = executeCommand(state, {
      type: 'syubetsu/replaceRange',
      index: 1,
      count: 1,
      syubetsu: [],
    });
    const list = state.rosenFileData.rosen.diaCont[0]?.ressyaCont[0];
    expect(list?.[0]?.syubetsuIndex).toBe(0); // B を使っていた列車 → 既定 0
    expect(list?.[1]?.syubetsuIndex).toBe(1); // C(index2)→ index1 へシフト
  });

  it('親種別を参照する index も再マップ / 削除された親は null', () => {
    const data = createNewRosen();
    const [a, b, c] = ['A', 'B', 'C'].map((n) => createDefaultRessyasyubetsu(n));
    if (a === undefined || b === undefined || c === undefined) throw new Error('setup');
    c.parentSyubetsuIndex = 0; // C の親 = A
    b.parentSyubetsuIndex = 2; // B の親 = C
    data.rosen.ressyasyubetsuCont = [a, b, c];
    let state = createDocumentState(data);
    // A(index0)を削除。C の親(0)は削除対象 → null。B の親(2)は -1 → 1。
    state = executeCommand(state, {
      type: 'syubetsu/replaceRange',
      index: 0,
      count: 1,
      syubetsu: [],
    });
    const sub = state.rosenFileData.rosen.ressyasyubetsuCont;
    // 残: [B, C]。B の親(旧2=C)→ 1。C の親(旧0=A、削除)→ null。
    const bAfter = sub.find((s) => s.syubetsumei === 'B');
    const cAfter = sub.find((s) => s.syubetsumei === 'C');
    expect(bAfter?.parentSyubetsuIndex).toBe(1);
    expect(cAfter?.parentSyubetsuIndex).toBeNull();
  });

  it('0 個になる削除は拒否される', () => {
    const data = createNewRosen(); // 種別 1 個('普通')
    const state = createDocumentState(data);
    expect(() =>
      executeCommand(state, { type: 'syubetsu/replaceRange', index: 0, count: 1, syubetsu: [] }),
    ).toThrow();
  });
});

describe('syubetsu 入替(上下移動)', () => {
  it('入替で全列車の syubetsuIndex が追従', () => {
    const data = createNewRosen();
    data.rosen.ressyasyubetsuCont = ['A', 'B', 'C'].map((n) => createDefaultRessyasyubetsu(n));
    const dia = createDefaultDia('D');
    const r = createNullRessya(0, 0);
    r.isNull = false;
    r.syubetsuIndex = 2; // C
    dia.ressyaCont[0].push(r);
    data.rosen.diaCont.push(dia);
    let state = createDocumentState(data);
    // C(index2)を上へ = swap(2,1,1) → [A, C, B]。
    state = executeCommand(state, { type: 'syubetsu/swap', indexA: 2, sizeA: 1, indexB: 1 });
    const sub = state.rosenFileData.rosen.ressyasyubetsuCont.map((s) => s.syubetsumei);
    expect(sub).toEqual(['A', 'C', 'B']);
    // C を使っていた列車の index は 1(新しい C の位置)。
    expect(state.rosenFileData.rosen.diaCont[0]?.ressyaCont[0]?.[0]?.syubetsuIndex).toBe(1);
  });
});

describe('dia 削除の kijunDiaIndex 調整', () => {
  it('基準ダイヤより後ろを削除しても基準は維持、基準自身の削除で 0 へ', () => {
    const data = createNewRosen();
    for (const n of ['D0', 'D1', 'D2']) data.rosen.diaCont.push(createDefaultDia(n));
    data.rosen.kijunDiaIndex = 1;
    let state = createDocumentState(data);
    // D2(index2)削除 → 基準 1 は不変。
    state = executeCommand(state, { type: 'dia/replaceRange', index: 2, count: 1, dia: [] });
    expect(state.rosenFileData.rosen.kijunDiaIndex).toBe(1);
    // D1(index1 = 基準)削除 → 0 へ。
    state = executeCommand(state, { type: 'dia/replaceRange', index: 1, count: 1, dia: [] });
    expect(state.rosenFileData.rosen.kijunDiaIndex).toBe(0);
  });

  it('ダイヤ名重複の挿入は拒否', () => {
    const data = createNewRosen();
    data.rosen.diaCont.push(createDefaultDia('平日'));
    const state = createDocumentState(data);
    expect(() =>
      executeCommand(state, {
        type: 'dia/replaceRange',
        index: 1,
        count: 0,
        dia: [createDefaultDia('平日')],
      }),
    ).toThrow();
  });
});
