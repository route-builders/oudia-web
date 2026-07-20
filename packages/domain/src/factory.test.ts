// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 up-tri

import { parseNodeTree, readRosenFile, writeOud2 } from '@oudia-web/format';
import { describe, expect, it } from 'vitest';
import { createDefaultDia, createDefaultEki, createNewRosen } from './factory.js';

describe('createNewRosen', () => {
  it('原典既定: 駅 0・ダイヤ 0・種別「普通」1 個', () => {
    const data = createNewRosen();
    expect(data.rosen.ekiCont).toHaveLength(0);
    expect(data.rosen.diaCont).toHaveLength(0);
    expect(data.rosen.ressyasyubetsuCont).toHaveLength(1);
    expect(data.rosen.ressyasyubetsuCont[0]?.syubetsumei).toBe('普通');
    // 新規作成の operationCrossKitenJikoku は true(ファイル省略時 false との差)。
    expect(data.rosen.operationCrossKitenJikoku).toBe(true);
    expect(data.rosen.diagramDgrYZahyouKyoriDefault).toBe(60);
  });

  it('空の新規ファイルがライターで例外なく書ける', () => {
    const data = createNewRosen();
    expect(() => writeOud2(data)).not.toThrow();
  });

  it('駅・ダイヤを足した新規ファイルが書けて読み戻せる', () => {
    const data = createNewRosen();
    data.rosen.rosenmei = 'テスト線';
    data.rosen.ekiCont.push(createDefaultEki(0, 'A駅'));
    data.rosen.ekiCont.push(createDefaultEki(1, 'B駅'));
    data.rosen.diaCont.push(createDefaultDia('平日'));

    const bytes = writeOud2(data);
    const parsed = parseNodeTree(bytes);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const read = readRosenFile(parsed.root);
    const r = read.data.rosen;
    expect(r.rosenmei).toBe('テスト線');
    expect(r.ekiCont.map((e) => e.ekimei)).toEqual(['A駅', 'B駅']);
    expect(r.ekiCont[0]?.ekiTrack2Cont.map((t) => t.trackName)).toEqual(['1番線', '2番線']);
    expect(r.ekiCont[0]?.downMain).toBe(0);
    expect(r.ekiCont[0]?.upMain).toBe(1);
    expect(r.diaCont.map((d) => d.name)).toEqual(['平日']);
  });

  it('createDefaultEki は番線 2 個・downMain0/upMain1・全表示フラグ既定', () => {
    const eki = createDefaultEki(3, 'X');
    expect(eki.id).toBe(3);
    expect(eki.ekiTrack2Cont).toHaveLength(2);
    expect(eki.diagramTrackOmit).toEqual([false, false]);
    expect(eki.ekijikokukeisiki).toBe('hatsu');
    expect(eki.ekikibo).toBe('ippan');
    expect(eki.brunchCoreEkiIndex).toBeNull();
    expect(eki.loopOriginEkiIndex).toBeNull();
  });
});
