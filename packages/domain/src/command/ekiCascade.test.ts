// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 up-tri

/**
 * 駅カスケードの原典忠実性テスト(狙い撃ち)。
 * - 上り列車の ekiJikokuCont 挿入 order(反転 + 挿入時 +1)
 * - Tsuuka-neighbor 規則(走行区間への挿入は通過 + 主本線)
 * - brunch/loop index シフトの挿入(>= かつ +1<size)・削除(厳密 > / == は null)非対称
 */

import type { RosenFileData } from '@oudia-web/format';
import { asSeconds } from '@oudia-web/format';
import { describe, expect, it } from 'vitest';
import { createDefaultDia, createDefaultEki, createNewRosen } from '../factory.js';
import { createNullRessya } from '../ressya.js';
import { createDocumentState, executeCommand } from './engine.js';

function baseRosen(ekiCount: number): RosenFileData {
  const data = createNewRosen();
  for (let i = 0; i < ekiCount; i++) data.rosen.ekiCont.push(createDefaultEki(i, `E${String(i)}`));
  data.rosen.diaCont.push(createDefaultDia('D'));
  return data;
}

describe('駅挿入カスケード', () => {
  it('走行区間の内側へ挿入すると通過 + 主本線スロットになる(下り)', () => {
    const data = baseRosen(3);
    const dia = data.rosen.diaCont[0];
    if (dia === undefined) throw new Error('dia');
    // 下り列車: 駅 0,1,2 すべて停車(走行区間)。主本線 downMain=0。
    const r = createNullRessya(3, 0);
    r.isNull = false;
    for (let o = 0; o < 3; o++) {
      const s = r.ekiJikokuCont[o];
      if (s === undefined) continue;
      s.ekiatsukai = 'teisya';
      s.hatsuJikoku = asSeconds(3600 + o * 60);
      s.chakuJikoku = o > 0 ? asSeconds(3600 + o * 60 - 30) : null;
    }
    dia.ressyaCont[0].push(r);

    let state = createDocumentState(data);
    // 駅 index 1(中間)へ挿入 → 下り order 1。前後(order0/order1)とも走行中 → 通過。
    state = executeCommand(state, {
      type: 'eki/replaceRange',
      index: 1,
      count: 0,
      eki: [createDefaultEki(99, 'NEW')],
    });
    const rr = state.rosenFileData.rosen.diaCont[0]?.ressyaCont[0]?.[0];
    expect(rr?.ekiJikokuCont).toHaveLength(4);
    const inserted = rr?.ekiJikokuCont[1];
    expect(inserted?.ekiatsukai).toBe('tsuuka');
    expect(inserted?.ressyaTrackIndex).toBe(0); // downMain
    expect(inserted?.chakuJikoku).toBeNull();
  });

  it('端への挿入は None スロット(下り先頭)', () => {
    const data = baseRosen(3);
    const dia = data.rosen.diaCont[0];
    if (dia === undefined) throw new Error('dia');
    const r = createNullRessya(3, 0);
    r.isNull = false;
    const s1 = r.ekiJikokuCont[1];
    if (s1 !== undefined) {
      s1.ekiatsukai = 'teisya';
      s1.hatsuJikoku = asSeconds(3600);
    }
    dia.ressyaCont[0].push(r);
    let state = createDocumentState(data);
    state = executeCommand(state, {
      type: 'eki/replaceRange',
      index: 0,
      count: 0,
      eki: [createDefaultEki(99, 'HEAD')],
    });
    const rr = state.rosenFileData.rosen.diaCont[0]?.ressyaCont[0]?.[0];
    expect(rr?.ekiJikokuCont[0]?.ekiatsukai).toBe('none');
  });

  it('上り列車の ekiJikokuCont は反転 order へ挿入される(+1)', () => {
    const data = baseRosen(3);
    const dia = data.rosen.diaCont[0];
    if (dia === undefined) throw new Error('dia');
    // 上り列車: order は index の反転(order0 = 駅 index2)。全駅停車。
    const r = createNullRessya(3, 1);
    r.isNull = false;
    for (let o = 0; o < 3; o++) {
      const s = r.ekiJikokuCont[o];
      if (s === undefined) continue;
      s.ekiatsukai = 'teisya';
      // order で識別できる時刻を入れる。
      s.hatsuJikoku = asSeconds(7200 + o * 300);
    }
    dia.ressyaCont[1].push(r);

    let state = createDocumentState(data);
    // 駅 index 0(下り先頭 = 上り終着)へ挿入。上り order = (3-1-0)+1 = 3(末尾)。
    state = executeCommand(state, {
      type: 'eki/replaceRange',
      index: 0,
      count: 0,
      eki: [createDefaultEki(99, 'X')],
    });
    const rr = state.rosenFileData.rosen.diaCont[0]?.ressyaCont[1]?.[0];
    expect(rr?.ekiJikokuCont).toHaveLength(4);
    // 末尾(order3)が新スロット。既存 order0..2 の時刻は不変。
    expect(rr?.ekiJikokuCont[0]?.hatsuJikoku).toBe(7200);
    expect(rr?.ekiJikokuCont[2]?.hatsuJikoku).toBe(7800);
    expect(rr?.ekiJikokuCont[3]?.ekiatsukai).toBe('none'); // 端 → None
  });
});

describe('brunch index シフトの非対称性', () => {
  it('挿入で brunchCoreEkiIndex が正しくシフト(>=)', () => {
    const data = baseRosen(4);
    // 駅3 が 駅1 を core にする。
    const e3 = data.rosen.ekiCont[3];
    if (e3 !== undefined) e3.brunchCoreEkiIndex = 1;
    let state = createDocumentState(data);
    // 駅 index 1 へ挿入 → core(=1)は >= 1 なので +1 = 2。
    state = executeCommand(state, {
      type: 'eki/replaceRange',
      index: 1,
      count: 0,
      eki: [createDefaultEki(99, 'I')],
    });
    // 駅3 は駅4 へずれ、その core は 2 になっている。
    const moved = state.rosenFileData.rosen.ekiCont.find((e) => e.id === e3?.id);
    expect(moved?.brunchCoreEkiIndex).toBe(2);
  });

  it('削除で core を指していた参照が null 化(== 削除 index)', () => {
    const data = baseRosen(4);
    const e3 = data.rosen.ekiCont[3];
    if (e3 !== undefined) e3.brunchCoreEkiIndex = 1;
    let state = createDocumentState(data);
    // 駅 index 1(= core)を削除 → 駅3 の core は削除対象なので null。
    state = executeCommand(state, { type: 'eki/replaceRange', index: 1, count: 1, eki: [] });
    const moved = state.rosenFileData.rosen.ekiCont.find((e) => e.id === e3?.id);
    expect(moved?.brunchCoreEkiIndex).toBeNull();
  });

  it('削除で core > 削除 index の参照は -1 シフト', () => {
    const data = baseRosen(4);
    const e0 = data.rosen.ekiCont[0];
    if (e0 !== undefined) e0.brunchCoreEkiIndex = 3; // 駅0 が駅3 を core に
    let state = createDocumentState(data);
    state = executeCommand(state, { type: 'eki/replaceRange', index: 1, count: 1, eki: [] });
    const moved = state.rosenFileData.rosen.ekiCont.find((e) => e.id === e0?.id);
    expect(moved?.brunchCoreEkiIndex).toBe(2); // 3 > 1 → 2
  });
});
