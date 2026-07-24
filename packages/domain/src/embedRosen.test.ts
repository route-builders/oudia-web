// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 up-tri

/**
 * 路線の組入れ(embedRosen)のテスト(原典 CentDedRosen::insert のコア)。
 * 実機一致は実機フィクスチャ入手時に検証。ここでは合成データで移植ロジックを単体検証する。
 */

import type { RosenFileData } from '@oudia-web/format';
import { asSeconds, parseNodeTree, readRosenFile, writeOud2 } from '@oudia-web/format';
import { describe, expect, it } from 'vitest';
import { canEmbedRosen, embedRosen } from './embedRosen.js';
import {
  createDefaultDia,
  createDefaultEki,
  createDefaultRessyasyubetsu,
  createNewRosen,
} from './factory.js';
import { createNullRessya } from './ressya.js';

/** 駅名リスト + ダイヤ 1 個 + 全区間走行の下り列車 1 本を持つ路線。 */
function makeRosen(
  name: string,
  ekimeis: string[],
  syubetsuNames: string[],
  bangou: string,
): RosenFileData {
  const data = createNewRosen();
  data.rosen.rosenmei = name;
  data.rosen.ressyasyubetsuCont = syubetsuNames.map((n) => createDefaultRessyasyubetsu(n));
  ekimeis.forEach((n, i) => data.rosen.ekiCont.push(createDefaultEki(i, n)));
  const dia = createDefaultDia('平日');
  const r = createNullRessya(ekimeis.length, 0);
  r.isNull = false;
  r.ressyabangou = bangou;
  for (let o = 0; o < ekimeis.length; o++) {
    const s = r.ekiJikokuCont[o];
    if (s === undefined) continue;
    s.ekiatsukai = 'teisya';
    if (o > 0) s.chakuJikoku = asSeconds(3600 + o * 300 - 30);
    if (o < ekimeis.length - 1) s.hatsuJikoku = asSeconds(3600 + o * 300);
    s.ressyaTrackIndex = 0;
  }
  dia.ressyaCont[0].push(r);
  data.rosen.diaCont.push(dia);
  return data;
}

/** 全ダイヤ全方向全列車で ekiJikokuCont.length === ekiCount(I1)。 */
function assertI1(data: RosenFileData): void {
  const n = data.rosen.ekiCont.length;
  for (const dia of data.rosen.diaCont) {
    for (const houkou of [0, 1] as const) {
      for (const r of dia.ressyaCont[houkou]) {
        expect(r.ekiJikokuCont.length).toBe(n);
      }
    }
  }
}

describe('canEmbedRosen', () => {
  it('2 駅未満は不可', () => {
    const base = makeRosen('base', ['A'], ['普通'], '1M');
    const add = makeRosen('add', ['X', 'Y'], ['普通'], '9M');
    expect(canEmbedRosen(base, 0)).toBe(false);
    void add;
  });
});

describe('embedRosen(終着側組入れ)', () => {
  it('終着駅へ別路線を追加すると駅が連結される', () => {
    const base = makeRosen('base', ['A', 'B', 'C'], ['普通'], '1M');
    const add = makeRosen('add', ['X', 'Y'], ['普通'], '9M');
    const out = embedRosen(base, add, 2); // C(終着)へ組入れ
    // 駅が A,B,C,X,Y に。
    expect(out.rosen.ekiCont.map((e) => e.ekimei)).toEqual(['A', 'B', 'C', 'X', 'Y']);
    assertI1(out);
  });

  it('種別が同名マージされる(普通は再利用)', () => {
    const base = makeRosen('base', ['A', 'B', 'C'], ['普通', '急行'], '1M');
    const add = makeRosen('add', ['X', 'Y'], ['普通', '快速'], '9M');
    const out = embedRosen(base, add, 2);
    // 普通は再利用、急行(base)+ 快速(add 新規)。
    expect(out.rosen.ressyasyubetsuCont.map((s) => s.syubetsumei)).toEqual([
      '普通',
      '急行',
      '快速',
    ]);
  });

  it('ダイヤが同名マージされ、add の列車が追加される', () => {
    const base = makeRosen('base', ['A', 'B', 'C'], ['普通'], '1M');
    const add = makeRosen('add', ['X', 'Y'], ['普通'], '9M');
    const out = embedRosen(base, add, 2);
    // 同名「平日」に併合され、列車が 2 本(1M + 9M)。
    expect(out.rosen.diaCont).toHaveLength(1);
    const bangous = (out.rosen.diaCont[0]?.ressyaCont[0] ?? []).map((r) => r.ressyabangou);
    expect(bangous).toContain('1M');
    expect(bangous).toContain('9M');
  });

  it('comment が連結される', () => {
    const base = makeRosen('base', ['A', 'B', 'C'], ['普通'], '1M');
    base.rosen.comment = 'base コメント';
    const add = makeRosen('add', ['X', 'Y'], ['普通'], '9M');
    add.rosen.comment = 'add コメント';
    const out = embedRosen(base, add, 2);
    expect(out.rosen.comment).toBe('base コメント\n\nadd コメント');
  });
});

describe('embedRosen(始発側組入れ)', () => {
  it('始発駅へ別路線を追加', () => {
    const base = makeRosen('base', ['A', 'B', 'C'], ['普通'], '1M');
    const add = makeRosen('add', ['X', 'Y'], ['普通'], '9M');
    const out = embedRosen(base, add, 0); // A(始発)へ組入れ
    expect(out.rosen.ekiCont.map((e) => e.ekimei)).toEqual(['X', 'Y', 'A', 'B', 'C']);
    assertI1(out);
  });
});

describe('embedRosen(中間駅組入れ)', () => {
  it('中間駅 B へ組入れると B が同名分割され add 駅が挟まる', () => {
    const base = makeRosen('base', ['A', 'B', 'C'], ['普通'], '1M');
    const add = makeRosen('add', ['X', 'Y'], ['普通'], '9M');
    const out = embedRosen(base, add, 1); // B(中間)へ組入れ
    // B が分割されて A,B,X,Y,B,C 相当(同名 B が 2 つ)。
    const names = out.rosen.ekiCont.map((e) => e.ekimei);
    expect(names.filter((n) => n === 'B')).toHaveLength(2);
    expect(names).toContain('X');
    expect(names).toContain('Y');
    assertI1(out);
  });
});

describe('embedRosen(ファイル妥当性・純変換)', () => {
  it('元ドキュメントは変更されない', () => {
    const base = makeRosen('base', ['A', 'B', 'C'], ['普通'], '1M');
    const add = makeRosen('add', ['X', 'Y'], ['普通'], '9M');
    const beforeBase = JSON.stringify(base);
    const beforeAdd = JSON.stringify(add);
    embedRosen(base, add, 2);
    expect(JSON.stringify(base)).toBe(beforeBase);
    expect(JSON.stringify(add)).toBe(beforeAdd);
  });

  it('組入れ結果が書き出して読み戻せる', () => {
    const base = makeRosen('base', ['A', 'B', 'C'], ['普通'], '1M');
    const add = makeRosen('add', ['X', 'Y'], ['普通'], '9M');
    const out = embedRosen(base, add, 2);
    const bytes = writeOud2(out);
    const parsed = parseNodeTree(bytes);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const read = readRosenFile(parsed.root);
    expect(read.data.rosen.ekiCont.map((e) => e.ekimei)).toEqual(['A', 'B', 'C', 'X', 'Y']);
    // 注: リーダーは末尾の運行なしスロットを切り詰めるため read 後の ekiJikokuCont は
    // 駅数より短くなりうる(既存仕様。getEkiJikoku/slotAt が補償)。ここでは駅名一致で妥当性を確認する。
  });
});
