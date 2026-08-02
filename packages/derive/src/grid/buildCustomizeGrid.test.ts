// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 up-tri

/**
 * カスタマイズ時刻表のセル充填(buildCustomizeGrid.ts)の単体テスト。follow-up #11。
 * ★最重要は「切替駅で着半分が前列車・発半分が次列車」になること。
 */

import {
  createDefaultDia,
  createDefaultEki,
  createNewRosen,
  createNullRessya,
} from '@oudia-web/domain';
import type { Dia, Eki, Ressya, Rosen } from '@oudia-web/format';
import { asSeconds } from '@oudia-web/format';
import { describe, expect, it } from 'vitest';
import { createCustomizeChainColumn } from '../operationLight/types.js';
import { buildCustomizeGrid } from './buildCustomizeGrid.js';
import type { CustomizeRowOptions } from './customizeColSpec.js';
import { buildCustomizeRowSpec } from './customizeColSpec.js';

const J = (h: number, m: number) => asSeconds(h * 3600 + m * 60);
const CONV = {
  noColon: false,
  outputSecond: false,
  secondRoundChaku: 0,
  secondRoundHatsu: 0,
  display2400: false,
} as const;

const ROW_OPTS: CustomizeRowOptions = {
  displayRessyamei: false,
  enableOperation: 0,
  operationNumberRows: 1,
  displayShihatsuShuchakuEkimei: true,
};

/** 4 駅・着発とも表示の路線。 */
function setup(): { dia: Dia; rosen: Rosen; ekiCont: Eki[] } {
  const rosen = createNewRosen().rosen;
  rosen.ekiCont = [0, 1, 2, 3].map((i) => {
    const e = createDefaultEki(i, `E${String(i)}`);
    e.jikokuhyouJikokuDisplayKudari = { chaku: true, hatsu: true };
    return e;
  });
  const dia = createDefaultDia('D');
  rosen.diaCont = [dia];
  return { dia, rosen, ekiCont: rosen.ekiCont };
}

/** 駅Order [from, to] を走る列車。 */
function train(bangou: string, from: number, to: number, baseHour: number): Ressya {
  const r = createNullRessya(4, 0);
  r.isNull = false;
  r.ressyabangou = bangou;
  for (let o = from; o <= to; o++) {
    const s = r.ekiJikokuCont[o];
    if (s === undefined) continue;
    s.ekiatsukai = 'teisya';
    s.chakuJikoku = J(baseHour, o * 10);
    s.hatsuJikoku = J(baseHour, o * 10 + 2);
  }
  return r;
}

function cellsOf(
  dia: Dia,
  rosen: Rosen,
  chain: number[],
  opts: CustomizeRowOptions = ROW_OPTS,
): { rows: ReturnType<typeof buildCustomizeRowSpec>; cells: readonly { text: string }[] } {
  const rows = buildCustomizeRowSpec(rosen.ekiCont, 0, opts);
  const cols = buildCustomizeGrid(dia, rosen, 0, [createCustomizeChainColumn(chain)], rows, {
    conv: CONV,
  });
  return { rows, cells: cols[0]?.cells ?? [] };
}

/** 指定の行種別・駅Order のセル文字列。 */
function at(
  rows: ReturnType<typeof buildCustomizeRowSpec>,
  cells: readonly { text: string }[],
  type: string,
  ekiOrder: number | null,
): string {
  const i = rows.findIndex((r) => r.type === type && r.ekiOrder === ekiOrder);
  return i < 0 ? '(no row)' : (cells[i]?.text ?? '(no cell)');
}

describe('buildCustomizeGrid', () => {
  it('1 列車だけの列は通常の時刻が並ぶ', () => {
    const { dia, rosen } = setup();
    dia.ressyaCont[0].push(train('1M', 0, 3, 8));
    const { rows, cells } = cellsOf(dia, rosen, [0]);
    expect(at(rows, cells, 'ressyabangou', null)).toBe('1M');
    expect(at(rows, cells, 'hatsu', 0)).toBe(' 8:02');
    expect(at(rows, cells, 'chaku', 3)).toBe(' 8:30');
  });

  it('ヘッダは常にチェーン先頭列車、終着駅名は最終列車', () => {
    const { dia, rosen } = setup();
    // 1M: 駅0→1、3M: 駅1→3。
    dia.ressyaCont[0].push(train('1M', 0, 1, 8), train('3M', 1, 3, 9));
    const { rows, cells } = cellsOf(dia, rosen, [0, 1]);
    expect(at(rows, cells, 'ressyabangou', null)).toBe('1M');
    expect(at(rows, cells, 'shihatsuEkimei', null)).toBe('E0');
    // 終着駅名は最終列車(3M)の終着 = E3。
    expect(at(rows, cells, 'shuchakuEkimei', null)).toBe('E3');
  });

  it('★切替駅では着半分が前列車・発半分が次列車になる(原典の非対称)', () => {
    const { dia, rosen } = setup();
    // 1M は 8 時台で駅0→1、3M は 9 時台で駅1→3。切替駅 = 駅1。
    dia.ressyaCont[0].push(train('1M', 0, 1, 8), train('3M', 1, 3, 9));
    const { rows, cells } = cellsOf(dia, rosen, [0, 1]);
    // 駅1 の着 = 前列車 1M(8 時台)、発 = 次列車 3M(9 時台)。
    expect(at(rows, cells, 'chaku', 1)).toBe(' 8:10');
    expect(at(rows, cells, 'hatsu', 1)).toBe(' 9:12');
    // 駅2 は次列車のみ。
    expect(at(rows, cells, 'chaku', 2)).toBe(' 9:20');
  });

  it('列車の運行範囲の外はプレースホルダ。チェーン内側は「||」で繋ぐ', () => {
    const { dia, rosen } = setup();
    // 3M は駅2→3 のみ。単独チェーンなら駅0 はプレースホルダ。
    dia.ressyaCont[0].push(train('3M', 2, 3, 9));
    const solo = cellsOf(dia, rosen, [0]);
    expect(
      solo.cells[solo.rows.findIndex((r) => r.type === 'chaku' && r.ekiOrder === 0)]?.text,
    ).toBe('・・');

    // ★切替駅の発は、原典では「当列車の**有効始発スロット**の発時刻」を出す
    // (原典 :11302。切替駅 e と有効始発が一致するとは限らない = 間に経由なし区間がある前提)。
    const { dia: d2, rosen: r2 } = setup();
    d2.ressyaCont[0].push(train('1M', 0, 1, 8), train('3M', 2, 3, 9));
    const chained = cellsOf(d2, r2, [0, 1]);
    // 駅1 は 1M の終着 = 切替駅。発行は 3M 担当で、3M の有効始発(駅2)の発時刻が出る。
    expect(at(chained.rows, chained.cells, 'hatsu', 1)).toBe(' 9:22');
    // 駅1 の着は前列車 1M のもの。
    expect(at(chained.rows, chained.cells, 'chaku', 1)).toBe(' 8:10');
  });

  it('★通過駅の " ﾚ" は [通過駅時刻を表示] が OFF のときだけ(原典の全分岐で同じガード)', () => {
    const { dia, rosen } = setup();
    const r = train('1M', 0, 3, 8);
    const slot = r.ekiJikokuCont[1];
    if (slot === undefined) throw new Error('no slot');
    slot.ekiatsukai = 'tsuuka';
    dia.ressyaCont[0].push(r);
    const rows = buildCustomizeRowSpec(rosen.ekiCont, 0, ROW_OPTS);
    const off = buildCustomizeGrid(dia, rosen, 0, [createCustomizeChainColumn([0])], rows, {
      conv: CONV,
    });
    const on = buildCustomizeGrid(dia, rosen, 0, [createCustomizeChainColumn([0])], rows, {
      conv: CONV,
      displayTsuukaEkiJikoku: true,
    });
    const i = rows.findIndex((x) => x.type === 'chaku' && x.ekiOrder === 1);
    expect(off[0]?.cells[i]?.text).toBe(' ﾚ');
    // ON なら実時刻が出る。
    expect(on[0]?.cells[i]?.text).toBe(' 8:10');
  });

  it('主要駅かつ着発どちらか非表示なら運行なしが「----」になる', () => {
    const { dia, rosen } = setup();
    const e1 = rosen.ekiCont[1];
    if (e1 === undefined) throw new Error('no eki');
    e1.ekikibo = 'syuyou';
    e1.jikokuhyouJikokuDisplayKudari = { chaku: true, hatsu: false };
    dia.ressyaCont[0].push(train('3M', 2, 3, 9));
    const { rows, cells } = cellsOf(dia, rosen, [0]);
    expect(at(rows, cells, 'chaku', 1)).toBe('----');
  });

  it('番線は着側扱い(切替駅では前列車の番線)', () => {
    const { dia, rosen } = setup();
    const e = rosen.ekiCont[1];
    if (e === undefined) throw new Error('no eki');
    e.jikokuhyouTrackDisplayKudari = true;
    e.ekiTrack2Cont = [
      { trackName: '1番線', trackRyakusyou: '1', trackNoboriRyakusyou: '' },
      { trackName: '2番線', trackRyakusyou: '2', trackNoboriRyakusyou: '' },
    ];
    const a = train('1M', 0, 1, 8);
    const b = train('3M', 1, 3, 9);
    const sa = a.ekiJikokuCont[1];
    const sb = b.ekiJikokuCont[1];
    if (sa === undefined || sb === undefined) throw new Error('no slot');
    sa.ressyaTrackIndex = 0; // 前列車 = 1番線
    sb.ressyaTrackIndex = 1; // 次列車 = 2番線
    dia.ressyaCont[0].push(a, b);
    const { rows, cells } = cellsOf(dia, rosen, [0, 1]);
    // 番線行は arrival 側なので前列車(1番線)。
    expect(at(rows, cells, 'track', 1)).toBe('1');
  });
});
