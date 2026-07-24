// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 up-tri

/**
 * 路線の切り出し(createSubRosen)のテスト(原典 (1)(2) コア)。
 */

import type { RosenFileData } from '@oudia-web/format';
import { asSeconds, parseNodeTree, readRosenFile, writeOud2 } from '@oudia-web/format';
import { describe, expect, it } from 'vitest';
import { createDefaultDia, createDefaultEki, createNewRosen } from './factory.js';
import { createNullRessya } from './ressya.js';
import { canCreateSubRosen, createSubRosen } from './subRosen.js';

/** 5 駅 A–E + 下り列車 2 本(1 本は C–E のみ走行、1 本は全区間走行)。 */
function rosen5(): RosenFileData {
  const data = createNewRosen();
  for (const [i, n] of ['A', 'B', 'C', 'D', 'E'].entries()) {
    data.rosen.ekiCont.push(createDefaultEki(i, n));
  }
  const dia = createDefaultDia('D');
  // 全区間走行(A→E)。
  const full = createNullRessya(5, 0);
  full.isNull = false;
  full.ressyabangou = '1M';
  for (let o = 0; o < 5; o++) {
    const s = full.ekiJikokuCont[o];
    if (s === undefined) continue;
    s.ekiatsukai = 'teisya';
    if (o > 0) s.chakuJikoku = asSeconds(3600 + o * 300 - 30);
    if (o < 4) s.hatsuJikoku = asSeconds(3600 + o * 300);
    s.ressyaTrackIndex = 0;
  }
  // C–E のみ走行。
  const partial = createNullRessya(5, 0);
  partial.isNull = false;
  partial.ressyabangou = '3M';
  for (let o = 2; o < 5; o++) {
    const s = partial.ekiJikokuCont[o];
    if (s === undefined) continue;
    s.ekiatsukai = 'teisya';
    if (o > 2) s.chakuJikoku = asSeconds(7200 + o * 300 - 30);
    if (o < 4) s.hatsuJikoku = asSeconds(7200 + o * 300);
    s.ressyaTrackIndex = 0;
  }
  dia.ressyaCont[0].push(full, partial);
  data.rosen.diaCont.push(dia);
  return data;
}

describe('canCreateSubRosen', () => {
  it('3 駅未満は不可', () => {
    const data = createNewRosen();
    data.rosen.ekiCont.push(createDefaultEki(0, 'A'), createDefaultEki(1, 'B'));
    expect(canCreateSubRosen(data, 0, 2)).toBe(false);
  });
  it('範囲外は不可', () => {
    expect(canCreateSubRosen(rosen5(), 3, 3)).toBe(false); // 3+3 > 5
    expect(canCreateSubRosen(rosen5(), 1, 3)).toBe(true);
  });
});

describe('createSubRosen', () => {
  it('駅範囲 [1,4) = B,C,D を残す', () => {
    const sub = createSubRosen(rosen5(), 1, 3);
    expect(sub.rosen.ekiCont.map((e) => e.ekimei)).toEqual(['B', 'C', 'D']);
    // 全列車の駅時刻数 = 駅数(I1)。
    for (const r of sub.rosen.diaCont[0]?.ressyaCont[0] ?? []) {
      expect(r.ekiJikokuCont.length).toBe(3);
    }
  });

  it('切り出し範囲を走行しない列車は削除される', () => {
    // 範囲 [0,2) = A,B のみ残す → C–E 走行の 3M は消える(A–E 走行の 1M は残る)。
    const sub = createSubRosen(rosen5(), 0, 2);
    const bangous = (sub.rosen.diaCont[0]?.ressyaCont[0] ?? []).map((r) => r.ressyabangou);
    expect(bangous).toContain('1M');
    expect(bangous).not.toContain('3M');
  });

  it('範囲外を指す分岐設定は解除される', () => {
    const data = rosen5();
    // 駅 D(index3)が駅 A(index0・範囲外)を core にする分岐。範囲 [2,5) を切り出す。
    const d = data.rosen.ekiCont[3];
    if (d !== undefined) d.brunchCoreEkiIndex = 0;
    const sub = createSubRosen(data, 2, 3); // C,D,E
    // 元 D は新 index1。その brunchCore は範囲外(A)を指していたので null。
    const newD = sub.rosen.ekiCont[1];
    expect(newD?.brunchCoreEkiIndex).toBeNull();
  });

  it('末尾駅の次駅距離が 0 になる', () => {
    const data = rosen5();
    const c = data.rosen.ekiCont[2];
    if (c !== undefined) c.nextEkiDistance = 120; // C の次駅距離
    const sub = createSubRosen(data, 0, 3); // A,B,C → 末尾 C
    expect(sub.rosen.ekiCont[2]?.nextEkiDistance).toBe(0);
  });

  it('元ドキュメントは変更されない(純変換)', () => {
    const data = rosen5();
    const before = JSON.stringify(data);
    createSubRosen(data, 1, 3);
    expect(JSON.stringify(data)).toBe(before);
  });

  it('生成結果が書き出して読み戻せる(ファイル妥当性)', () => {
    const sub = createSubRosen(rosen5(), 1, 3);
    const bytes = writeOud2(sub);
    const parsed = parseNodeTree(bytes);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const read = readRosenFile(parsed.root);
    expect(read.data.rosen.ekiCont.map((e) => e.ekimei)).toEqual(['B', 'C', 'D']);
  });
});
