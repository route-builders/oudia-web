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
import type { CustomizeChainColumn } from '../operationLight/types.js';
import { createCustomizeChainColumn } from '../operationLight/types.js';
import { buildCustomizeGrid, buildNyuusenJikokuIndex } from './buildCustomizeGrid.js';
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

  it('★Eki*: 1 列車目の始発駅は Display が最大値でなければ「空文字」(「↓」ではない)', () => {
    const { dia, rosen } = setup();
    for (const e of rosen.ekiCont) {
      e.jikokuhyouSyubetsuChangeDisplayKudari = {
        ressyabangou: 1,
        operationNumber: 1,
        syubetsu: 1,
        ressyamei: 1,
        operationNumberRows: 1,
      };
    }
    dia.ressyaCont[0].push(train('1M', 0, 3, 8));
    const { rows, cells } = cellsOf(dia, rosen, [0]);
    expect(at(rows, cells, 'ekiRessyabangou', 0)).toBe('');
  });

  it('★Eki*: Display=3(常に表示)なら始発・中間で列車番号が出る', () => {
    const { dia, rosen } = setup();
    for (const e of rosen.ekiCont) {
      e.jikokuhyouSyubetsuChangeDisplayKudari = {
        ressyabangou: 3,
        operationNumber: 4,
        syubetsu: 3,
        ressyamei: 3,
        operationNumberRows: 1,
      };
    }
    dia.ressyaCont[0].push(train('1M', 0, 3, 8));
    const { rows, cells } = cellsOf(dia, rosen, [0]);
    expect(at(rows, cells, 'ekiRessyabangou', 0)).toBe('1M');
    expect(at(rows, cells, 'ekiRessyabangou', 1)).toBe('1M');
  });

  it('★Eki*: Display が中間値なら中間駅は「↓」になる', () => {
    const { dia, rosen } = setup();
    for (const e of rosen.ekiCont) {
      e.jikokuhyouSyubetsuChangeDisplayKudari = {
        ressyabangou: 2,
        operationNumber: 3,
        syubetsu: 2,
        ressyamei: 2,
        operationNumberRows: 1,
      };
    }
    dia.ressyaCont[0].push(train('1M', 0, 3, 8));
    const { rows, cells } = cellsOf(dia, rosen, [0]);
    expect(at(rows, cells, 'ekiRessyabangou', 1)).toBe('↓');
  });

  it('★Eki*: 種別欄は略称(原典 getRyakusyou)', () => {
    const { dia, rosen } = setup();
    const sy = rosen.ressyasyubetsuCont[0];
    if (sy === undefined) throw new Error('no syubetsu');
    sy.syubetsumei = '特別急行';
    sy.ryakusyou = '特急';
    for (const e of rosen.ekiCont) {
      e.jikokuhyouSyubetsuChangeDisplayKudari = {
        ressyabangou: 3,
        operationNumber: 4,
        syubetsu: 3,
        ressyamei: 3,
        operationNumberRows: 1,
      };
    }
    dia.ressyaCont[0].push(train('1M', 0, 3, 8));
    const { rows, cells } = cellsOf(dia, rosen, [0]);
    expect(at(rows, cells, 'ekiRessyasyubetsu', 0)).toBe('特急');
    // 列ヘッダの種別欄も略称。
    expect(at(rows, cells, 'ressyasyubetsu', null)).toBe('特急');
  });

  it('★Eki*: 列車名は「↓」「||」を出さず空文字になる', () => {
    const { dia, rosen } = setup();
    for (const e of rosen.ekiCont) {
      e.jikokuhyouSyubetsuChangeDisplayKudari = {
        ressyabangou: 2,
        operationNumber: 3,
        syubetsu: 2,
        ressyamei: 2,
        operationNumberRows: 1,
      };
    }
    dia.ressyaCont[0].push(train('1M', 0, 3, 8));
    const { rows, cells } = cellsOf(dia, rosen, [0]);
    expect(at(rows, cells, 'ekiRessyamei', 1)).toBe('');
  });
});

/** 前列車情報欄を全部出す行オプション(★enableOperation > 1 が前提)。 */
const PREV_OPTS: CustomizeRowOptions = {
  displayRessyamei: false,
  enableOperation: 2,
  operationNumberRows: 1,
  displayShihatsuShuchakuEkimei: false,
};

/** 全駅の前列車情報欄を Display 値 v で有効にする。 */
function enablePrev(rosen: Rosen, v: 1 | 2 | 3, opRows: 1 | 2 | 3 | 4 | 5 = 1): void {
  for (const e of rosen.ekiCont) {
    e.jikokuhyouPrevSyubetsuChangeDisplayKudari = {
      ressyabangou: v,
      operationNumber: v,
      syubetsu: v,
      ressyamei: v,
      operationNumberRows: opRows,
    };
  }
}

function prevCellsOf(
  dia: Dia,
  rosen: Rosen,
  chain: number[],
  over: Partial<CustomizeChainColumn> = {},
  opts: CustomizeRowOptions = PREV_OPTS,
): { rows: ReturnType<typeof buildCustomizeRowSpec>; cells: readonly { text: string }[] } {
  const rows = buildCustomizeRowSpec(rosen.ekiCont, 0, opts);
  const col = { ...createCustomizeChainColumn(chain), ...over };
  const cols = buildCustomizeGrid(dia, rosen, 0, [col], rows, { conv: CONV });
  return { rows, cells: cols[0]?.cells ?? [] };
}

describe('buildCustomizeGrid — EkiPrev*(前列車情報欄)', () => {
  it('★中間駅は経由なし区間だけ「||」。前列車情報は一切出ない', () => {
    // 5 駅にして真ん中(駅2)だけ経由なしにする。始発 0 / 終着 4 は保つ。
    const rosen = createNewRosen().rosen;
    rosen.ekiCont = [0, 1, 2, 3, 4].map((i) => {
      const e = createDefaultEki(i, `E${String(i)}`);
      e.jikokuhyouJikokuDisplayKudari = { chaku: true, hatsu: true };
      return e;
    });
    const dia = createDefaultDia('D');
    rosen.diaCont = [dia];
    enablePrev(rosen, 3);
    const r = createNullRessya(5, 0);
    r.isNull = false;
    r.ressyabangou = '1M';
    for (let o = 0; o < 5; o++) {
      const s = r.ekiJikokuCont[o];
      if (s === undefined) continue;
      // ★駅扱 'none' = 経由なし(原典 Ekiatsukai_None)。
      s.ekiatsukai = o === 2 ? 'none' : 'teisya';
      s.chakuJikoku = J(8, o * 10);
      s.hatsuJikoku = J(8, o * 10 + 2);
    }
    dia.ressyaCont[0].push(r);
    const { rows, cells } = prevCellsOf(dia, rosen, [0], { beforeType: 'classChange' });
    // Display=3(常に表示)でも中間駅では前列車情報を出さない。
    expect(at(rows, cells, 'ekiPrevRessyabangou', 1)).toBe('');
    // 駅1→駅2 が経由なし = 駅2 の前列車欄は「||」。
    expect(at(rows, cells, 'ekiPrevRessyabangou', 2)).toBe('||');
    expect(at(rows, cells, 'ekiPrevRessyabangou', 3)).toBe('||');
  });

  it('始発駅ちょうどでは 路線外始発相当(sihatsuEkiOrder >= -2)のときだけ前列車情報が出る', () => {
    const { dia, rosen } = setup();
    enablePrev(rosen, 3);
    dia.ressyaCont[0].push(train('1M', 0, 3, 8));
    const none = prevCellsOf(dia, rosen, [0], { prevRessyabangou: '9M' });
    expect(at(none.rows, none.cells, 'ekiPrevRessyabangou', 0)).toBe('');
    const outer = prevCellsOf(dia, rosen, [0], {
      prevRessyabangou: '9M',
      sihatsuEkiOrder: -1,
    });
    expect(at(outer.rows, outer.cells, 'ekiPrevRessyabangou', 0)).toBe('9M');
  });

  it('★列車名だけ「||」を出さず、2 列車目の始発駅でも前列車名を出す(原典 :6765 のガード欠落)', () => {
    const { dia, rosen } = setup();
    enablePrev(rosen, 3);
    // 1M: 駅0→1、3M: 駅2→3。間(駅1→2)に隙間がある = prevTerm(1) < 始発(2)。
    dia.ressyaCont[0].push(train('1M', 0, 1, 8), train('3M', 2, 3, 9));
    const { rows, cells } = prevCellsOf(
      dia,
      rosen,
      [0, 1],
      { prevRessyabangou: '9M', prevRessyamei: 'あさ', sihatsuEkiOrder: -1 },
      { ...PREV_OPTS, displayRessyamei: true },
    );
    // 駅2 は 2 列車目の始発。番号/種別は「||」。
    expect(at(rows, cells, 'ekiPrevRessyabangou', 2)).toBe('||');
    // ★列車名だけは前列車名が出る。
    expect(at(rows, cells, 'ekiPrevRessyamei', 2)).toBe('あさ');
  });

  it('終着より後は「||」。列車名は空のまま', () => {
    const { dia, rosen } = setup();
    enablePrev(rosen, 3);
    // ★路線外終着欄は**終着より後**の駅に置く。terminal[T] はその駅Order を返し、
    // 「||」は T+1 .. terminal[T] の範囲だけに出る。
    const e2 = rosen.ekiCont[2];
    if (e2 === undefined) throw new Error('no eki');
    e2.jikokuhyouOuterDisplayKudari = { origin: false, terminal: true };
    dia.ressyaCont[0].push(train('1M', 0, 1, 8));
    const { rows, cells } = prevCellsOf(
      dia,
      rosen,
      [0],
      { syuuchakuEkiOrder: -1, prevRessyamei: 'あさ' },
      { ...PREV_OPTS, displayRessyamei: true },
    );
    expect(at(rows, cells, 'ekiPrevRessyabangou', 2)).toBe('||');
    expect(at(rows, cells, 'ekiPrevRessyamei', 2)).toBe('');
  });

  it('★運用番号の Display=1 は else-if 連鎖を食い切る(運番一致なら classChange でも出さない)', () => {
    const { dia, rosen } = setup();
    enablePrev(rosen, 1);
    const r = train('1M', 0, 3, 8);
    const s = r.ekiJikokuCont[0];
    if (s === undefined) throw new Error('no slot');
    // 自列車の運番は永続の numberChange から引かれる(getOperationNumberAt)。
    s.afterOperationCont = [{ kind: 'numberChange', operationNumbers: ['A01'] }];
    dia.ressyaCont[0].push(r);
    const same = prevCellsOf(dia, rosen, [0], {
      beforeType: 'classChange',
      prevOperationNumber: ['A01'],
      sihatsuEkiOrder: -1,
    });
    expect(at(same.rows, same.cells, 'ekiPrevOperationNumber', 0)).toBe('');
    const diff = prevCellsOf(dia, rosen, [0], {
      beforeType: 'classChange',
      prevOperationNumber: ['B02'],
      sihatsuEkiOrder: -1,
    });
    expect(at(diff.rows, diff.cells, 'ekiPrevOperationNumber', 0)).toBe('B02');
  });

  it('★列車 NULL の疑似列でも「||」を出す(切り離し区間)', () => {
    const { dia, rosen } = setup();
    enablePrev(rosen, 3);
    // 切り離し駅(0)より後 〜 路線外終着欄のある駅(2)までが「||」。
    const e2 = rosen.ekiCont[2];
    if (e2 === undefined) throw new Error('no eki');
    e2.jikokuhyouOuterDisplayKudari = { origin: false, terminal: true };
    const { rows, cells } = prevCellsOf(
      dia,
      rosen,
      [],
      { releaseEkiOrder: 0, prevRessyamei: 'あさ' },
      { ...PREV_OPTS, displayRessyamei: true },
    );
    expect(at(rows, cells, 'ekiPrevRessyabangou', 1)).toBe('||');
    // ★列車名だけは (a) の枝が無いので空(原典 :6690-6716)。
    expect(at(rows, cells, 'ekiPrevRessyamei', 1)).toBe('');
  });

  it('★連結駅の次駅ブロック先頭は「↳」で上書き。号数・号は空のまま', () => {
    const { dia, rosen } = setup();
    enablePrev(rosen, 3);
    // 駅1 を「着のみ表示」にする(↳ の条件 3)。
    const e1 = rosen.ekiCont[1];
    if (e1 === undefined) throw new Error('no eki');
    e1.jikokuhyouJikokuDisplayKudari = { chaku: true, hatsu: false };
    dia.ressyaCont[0].push(train('1M', 0, 1, 8));
    const { rows, cells } = prevCellsOf(
      dia,
      rosen,
      [0],
      { connectEkiOrder: 1, prevGousuu: '3', prevRessyamei: 'あさ' },
      { ...PREV_OPTS, displayRessyamei: true },
    );
    // 駅2 の前列車欄先頭(列車番号)に ↳。
    expect(at(rows, cells, 'ekiPrevRessyabangou', 2)).toBe('↳');
    // ★↳ は「直上行が前の駅の行」= 駅ブロックの**最上段**にしか出ない(原典の条件 4)。
    // 列車番号行があるので列車名行には出ない。
    expect(at(rows, cells, 'ekiPrevRessyamei', 2)).toBe('');
  });

  it('★列車名行が駅ブロック最上段なら ↳ はそこに出る。号数・号は空のまま', () => {
    const { dia, rosen } = setup();
    // 前列車欄は列車名だけ有効にする。
    for (const e of rosen.ekiCont) {
      e.jikokuhyouPrevSyubetsuChangeDisplayKudari = {
        ressyabangou: 0,
        operationNumber: 0,
        syubetsu: 0,
        ressyamei: 3,
        operationNumberRows: 1,
      };
    }
    const e1 = rosen.ekiCont[1];
    if (e1 === undefined) throw new Error('no eki');
    e1.jikokuhyouJikokuDisplayKudari = { chaku: true, hatsu: false };
    dia.ressyaCont[0].push(train('1M', 0, 1, 8));
    const { rows, cells } = prevCellsOf(
      dia,
      rosen,
      [0],
      { connectEkiOrder: 1, prevGousuu: '3', prevRessyamei: 'あさ' },
      { ...PREV_OPTS, displayRessyamei: true },
    );
    // ★列車名セルは ↳、号数・号は空(原典 :6828-6853)。
    expect(at(rows, cells, 'ekiPrevRessyamei', 2)).toBe('↳');
    expect(at(rows, cells, 'ekiPrevGousuu', 2)).toBe('');
    expect(at(rows, cells, 'ekiPrevGou', 2)).toBe('');
  });

  it('★「↓」「↴」は EkiPrev* には絶対に出ない(原典の死にコード)', () => {
    const { dia, rosen } = setup();
    enablePrev(rosen, 2);
    dia.ressyaCont[0].push(train('1M', 0, 3, 8));
    const { rows, cells } = prevCellsOf(dia, rosen, [0], { beforeType: 'propertyChange' });
    for (const [i, row] of rows.entries()) {
      if (!row.type.startsWith('ekiPrev')) continue;
      expect(cells[i]?.text).not.toBe('↓');
      expect(cells[i]?.text).not.toBe('↴');
    }
  });

  it('前列車の種別欄は略称。親種別が有効なら 1 段だけ親に置換する', () => {
    const { dia, rosen } = setup();
    enablePrev(rosen, 3);
    const sy = rosen.ressyasyubetsuCont[0];
    if (sy === undefined) throw new Error('no syubetsu');
    sy.ryakusyou = '快';
    rosen.ressyasyubetsuCont.push({
      ...sy,
      syubetsumei: '準急',
      ryakusyou: '準',
      parentSyubetsuIndex: 0,
    });
    dia.ressyaCont[0].push(train('1M', 0, 3, 8));
    const rows = buildCustomizeRowSpec(rosen.ekiCont, 0, PREV_OPTS);
    const col = {
      ...createCustomizeChainColumn([0]),
      sihatsuEkiOrder: -1,
      prevRessyasyubetsuIndex: 1,
    };
    const plain = buildCustomizeGrid(dia, rosen, 0, [col], rows, { conv: CONV });
    expect(at(rows, plain[0]?.cells ?? [], 'ekiPrevRessyasyubetsu', 0)).toBe('準');
    const parent = buildCustomizeGrid(dia, rosen, 0, [col], rows, {
      conv: CONV,
      displayParentSyubetsu: true,
    });
    expect(at(rows, parent[0]?.cells ?? [], 'ekiPrevRessyasyubetsu', 0)).toBe('快');
  });
});

describe('buildCustomizeGrid — EkiOuter*(路線外始発 / 終着欄)', () => {
  /** 路線外欄を出す駅を指定する。 */
  function enableOuter(rosen: Rosen, at: number, origin: boolean, terminal: boolean): void {
    const e = rosen.ekiCont[at];
    if (e === undefined) throw new Error('no eki');
    e.jikokuhyouOuterDisplayKudari = { origin, terminal };
  }

  const OUTER_OPTS: CustomizeRowOptions = {
    displayRessyamei: false,
    enableOperation: 2,
    operationNumberRows: 1,
    displayShihatsuShuchakuEkimei: false,
  };

  it('★列車 NULL の疑似列でも路線外始発欄に駅名と時刻が出る(分割・併合の本体)', () => {
    const { dia, rosen } = setup();
    enableOuter(rosen, 1, true, false);
    const e0 = rosen.ekiCont[0];
    if (e0 === undefined) throw new Error('no eki');
    e0.outerTerminalCont = [{ ekimei: '車庫', jikokuRyaku: '', diaRyaku: '' }];
    const { rows, cells } = prevCellsOf(
      dia,
      rosen,
      [],
      {
        connectEkiOrder: 2,
        sihatsuEkiOrder: 0,
        outerSihatsuEkiIndex: 0,
        outerSihatsuJikoku: J(7, 30),
      },
      OUTER_OPTS,
    );
    expect(at(rows, cells, 'ekiOuterShihatsu1', 1)).toBe('車庫');
    expect(at(rows, cells, 'ekiOuterShihatsu2', 1)).toBe(' 7:30');
  });

  it('★環状(始発駅Order < 0)は駅名セルが「環状」', () => {
    const { dia, rosen } = setup();
    enableOuter(rosen, 1, true, false);
    const { rows, cells } = prevCellsOf(
      dia,
      rosen,
      [],
      { connectEkiOrder: 2, sihatsuEkiOrder: -1, outerSihatsuJikoku: null },
      OUTER_OPTS,
    );
    expect(at(rows, cells, 'ekiOuterShihatsu1', 1)).toBe('環状');
    // ★時刻が null のセルは空(encode がそのまま空文字を返す)。
    expect(at(rows, cells, 'ekiOuterShihatsu2', 1)).toBe('');
  });

  it('列車の路線外始発作業(outer)からも駅名・時刻が出る', () => {
    const { dia, rosen } = setup();
    enableOuter(rosen, 0, true, false);
    const e0 = rosen.ekiCont[0];
    if (e0 === undefined) throw new Error('no eki');
    e0.outerTerminalCont = [{ ekimei: '甲', jikokuRyaku: '甲駅', diaRyaku: '' }];
    const r = train('1M', 0, 3, 8);
    const s0 = r.ekiJikokuCont[0];
    if (s0 === undefined) throw new Error('no slot');
    s0.beforeOperationCont = [
      {
        kind: 'outer',
        outerTerminalIndex: 0,
        outerHatsuJikoku: J(7, 15),
        chakuJikoku: null,
        inOutLinkCode: '',
        operationNumbers: [],
      },
    ];
    dia.ressyaCont[0].push(r);
    const { rows, cells } = prevCellsOf(dia, rosen, [0], {}, OUTER_OPTS);
    // ★略称が空でなければ略称。
    expect(at(rows, cells, 'ekiOuterShihatsu1', 0)).toBe('甲駅');
    expect(at(rows, cells, 'ekiOuterShihatsu2', 0)).toBe(' 7:15');
  });

  it('★終着欄の時刻は着時刻扱い、始発欄は発時刻扱い(2400 表記の可否が変わる)', () => {
    const { dia, rosen } = setup();
    enableOuter(rosen, 3, false, true);
    const r = train('1M', 0, 3, 8);
    const s3 = r.ekiJikokuCont[3];
    if (s3 === undefined) throw new Error('no slot');
    s3.afterOperationCont = [
      {
        kind: 'outer',
        outerTerminalIndex: 0,
        hatsuJikoku: J(8, 32),
        outerChakuJikoku: J(24, 0),
        inOutLinkCode: '',
      },
    ];
    const e3 = rosen.ekiCont[3];
    if (e3 === undefined) throw new Error('no eki');
    e3.outerTerminalCont = [{ ekimei: '乙', jikokuRyaku: '', diaRyaku: '' }];
    dia.ressyaCont[0].push(r);
    const rowsSpec = buildCustomizeRowSpec(rosen.ekiCont, 0, OUTER_OPTS);
    const cols = buildCustomizeGrid(dia, rosen, 0, [createCustomizeChainColumn([0])], rowsSpec, {
      conv: { ...CONV, display2400: true },
    });
    const cells = cols[0]?.cells ?? [];
    expect(at(rowsSpec, cells, 'ekiOuterShuchaku1', 3)).toBe('乙');
    // 着時刻なので 24:00 表記が有効。
    expect(at(rowsSpec, cells, 'ekiOuterShuchaku2', 3)).toBe('24:00');
  });

  it('★運行なし区間の「||」は始発欄が e-1・終着欄が e(片側だけ -1)', () => {
    // 5 駅。駅2 が経由なし = 駅1→2 と 駅2→3 が運行なし。
    const rosen = createNewRosen().rosen;
    rosen.ekiCont = [0, 1, 2, 3, 4].map((i) => {
      const e = createDefaultEki(i, `E${String(i)}`);
      e.jikokuhyouJikokuDisplayKudari = { chaku: true, hatsu: true };
      e.jikokuhyouOuterDisplayKudari = { origin: true, terminal: true };
      return e;
    });
    const dia = createDefaultDia('D');
    rosen.diaCont = [dia];
    const r = createNullRessya(5, 0);
    r.isNull = false;
    r.ressyabangou = '1M';
    for (let o = 0; o < 5; o++) {
      const s = r.ekiJikokuCont[o];
      if (s === undefined) continue;
      s.ekiatsukai = o === 2 ? 'none' : 'teisya';
      s.chakuJikoku = J(8, o * 10);
      s.hatsuJikoku = J(8, o * 10 + 2);
    }
    dia.ressyaCont[0].push(r);
    const { rows, cells } = prevCellsOf(dia, rosen, [0], {}, OUTER_OPTS);
    // 始発欄(着の上): 駅2 は 駅1→2 が運行なし → 「||」。
    expect(at(rows, cells, 'ekiOuterShihatsu1', 2)).toBe('||');
    expect(at(rows, cells, 'ekiOuterShihatsu1', 1)).toBe('');
    // 終着欄(発の下): 駅1 は 駅1→2 が運行なし → 「||」。
    expect(at(rows, cells, 'ekiOuterShuchaku1', 1)).toBe('||');
    expect(at(rows, cells, 'ekiOuterShuchaku1', 2)).toBe('||');
  });

  it('★路線外欄の 2 行目では列車切替 reducer を進めない', () => {
    const { dia, rosen } = setup();
    for (const e of rosen.ekiCont) {
      e.jikokuhyouOuterDisplayKudari = { origin: true, terminal: true };
    }
    const e1 = rosen.ekiCont[1];
    if (e1 === undefined) throw new Error('no eki');
    e1.outerTerminalCont = [{ ekimei: '乙', jikokuRyaku: '', diaRyaku: '' }];
    // 駅1 で終わる列車を 3 本続け、4 本目が駅1→3。発側(>=)は 発行 → 終着欄1 と
    // 進むので、終着欄2 でも進むと 1 本ぶん先の列車になってしまう。
    const a = train('1M', 0, 1, 8);
    const b = train('3M', 0, 1, 9);
    const c = train('7M', 0, 1, 9);
    const s1 = c.ekiJikokuCont[1];
    if (s1 === undefined) throw new Error('no slot');
    s1.afterOperationCont = [
      {
        kind: 'outer',
        outerTerminalIndex: 0,
        hatsuJikoku: null,
        outerChakuJikoku: J(9, 40),
        inOutLinkCode: '',
      },
    ];
    dia.ressyaCont[0].push(a, b, c, train('5M', 1, 3, 10));
    const rowsSpec = buildCustomizeRowSpec(rosen.ekiCont, 0, OUTER_OPTS);
    const cols = buildCustomizeGrid(
      dia,
      rosen,
      0,
      [createCustomizeChainColumn([0, 1, 2, 3])],
      rowsSpec,
      { conv: CONV },
    );
    const cells = cols[0]?.cells ?? [];
    // 駅1 の終着欄は 7M の路線外終着。2 行目でもう一度進むと 5M になり時刻が消える。
    expect(at(rowsSpec, cells, 'ekiOuterShuchaku1', 1)).toBe('乙');
    expect(at(rowsSpec, cells, 'ekiOuterShuchaku2', 1)).toBe(' 9:40');
  });

  it('★どの分岐にも当たらなければ空文字(プレースホルダにしない)', () => {
    const { dia, rosen } = setup();
    enableOuter(rosen, 3, true, true);
    dia.ressyaCont[0].push(train('1M', 0, 1, 8));
    const { rows, cells } = prevCellsOf(dia, rosen, [0], {}, OUTER_OPTS);
    // 駅3 は終着(1)より後だが路線外終着作業も content も無い。
    expect(at(rows, cells, 'ekiOuterShihatsu1', 3)).toBe('');
    expect(at(rows, cells, 'ekiOuterShuchaku1', 3)).toBe('');
  });
});

describe('buildCustomizeGrid — 入線時刻', () => {
  const NYUUSEN_OPTS: CustomizeRowOptions = {
    displayRessyamei: false,
    enableOperation: 1,
    operationNumberRows: 1,
    displayShihatsuShuchakuEkimei: false,
  };

  /** 全駅の入線時刻行を出す。 */
  function enableNyuusen(rosen: Rosen): void {
    for (const e of rosen.ekiCont) {
      e.jikokuhyouNyuusenJikokuDisplayKudari = true;
    }
  }

  it('★実時刻が出るのは有効始発駅だけ(出区時刻)', () => {
    const { dia, rosen } = setup();
    enableNyuusen(rosen);
    const r = train('1M', 0, 3, 8);
    const s0 = r.ekiJikokuCont[0];
    if (s0 === undefined) throw new Error('no slot');
    s0.beforeOperationCont = [
      { kind: 'out', outJikoku: J(7, 45), inOutLinkCode: '', operationNumbers: [] },
    ];
    dia.ressyaCont[0].push(r);
    const { rows, cells } = prevCellsOf(dia, rosen, [0], {}, NYUUSEN_OPTS);
    expect(at(rows, cells, 'nyuusen', 0)).toBe(' 7:45');
    // 中間駅・終着駅には絶対に出ない。
    expect(at(rows, cells, 'nyuusen', 1)).toBe('');
    expect(at(rows, cells, 'nyuusen', 3)).toBe('');
  });

  it('★入換は番線が同じなら値を取らず走査を続ける(break しない)', () => {
    const { dia, rosen } = setup();
    enableNyuusen(rosen);
    const r = train('1M', 0, 3, 8);
    const s0 = r.ekiJikokuCont[0];
    if (s0 === undefined) throw new Error('no slot');
    s0.ressyaTrackIndex = 0;
    // 末尾→先頭に走査する。末尾の入換は番線が同じなので飛ばし、その前の出区を拾う。
    s0.beforeOperationCont = [
      { kind: 'out', outJikoku: J(7, 45), inOutLinkCode: '', operationNumbers: [] },
      {
        kind: 'shunt',
        shuntTrackIndex: 0,
        shuntHatsuJikoku: J(7, 50),
        shuntChakuJikoku: J(7, 55),
        displayJikoku: false,
      },
    ];
    dia.ressyaCont[0].push(r);
    const { rows, cells } = prevCellsOf(dia, rosen, [0], {}, NYUUSEN_OPTS);
    expect(at(rows, cells, 'nyuusen', 0)).toBe(' 7:45');
  });

  it('入換の番線が違えば入換着時刻(null なら入換発)を使う', () => {
    const { dia, rosen } = setup();
    enableNyuusen(rosen);
    const r = train('1M', 0, 3, 8);
    const s0 = r.ekiJikokuCont[0];
    if (s0 === undefined) throw new Error('no slot');
    s0.ressyaTrackIndex = 0;
    s0.beforeOperationCont = [
      {
        kind: 'shunt',
        shuntTrackIndex: 1,
        shuntHatsuJikoku: J(7, 50),
        shuntChakuJikoku: null,
        displayJikoku: false,
      },
    ];
    dia.ressyaCont[0].push(r);
    const { rows, cells } = prevCellsOf(dia, rosen, [0], {}, NYUUSEN_OPTS);
    expect(at(rows, cells, 'nyuusen', 0)).toBe(' 7:50');
  });

  it('★チェーン 2 列車目以降は自分の始発駅でも実時刻を出さない(「||」)', () => {
    const { dia, rosen } = setup();
    enableNyuusen(rosen);
    const a = train('1M', 0, 1, 8);
    const b = train('3M', 1, 3, 9);
    const s1 = b.ekiJikokuCont[1];
    if (s1 === undefined) throw new Error('no slot');
    s1.beforeOperationCont = [
      { kind: 'out', outJikoku: J(8, 55), inOutLinkCode: '', operationNumbers: [] },
    ];
    dia.ressyaCont[0].push(a, b);
    const { rows, cells } = prevCellsOf(dia, rosen, [0, 1], {}, NYUUSEN_OPTS);
    // 駅1 は 3M の始発だが prevTerm(=1M の終着 1)があるので「||」ではなく空。
    // (prevTerm < e が成り立たないため。原典 :8298-8306)
    expect(at(rows, cells, 'nyuusen', 1)).toBe('');
  });

  it('★次列車接続の入線時刻は探索結果の索引から引く(oud2 非永続)', () => {
    const { dia, rosen } = setup();
    enableNyuusen(rosen);
    const r = train('1M', 0, 3, 8);
    const s0 = r.ekiJikokuCont[0];
    if (s0 === undefined) throw new Error('no slot');
    s0.beforeOperationCont = [{ kind: 'junction', kitenJikoku: J(7, 0), kariOperationNumbers: [] }];
    dia.ressyaCont[0].push(r);
    const rowsSpec = buildCustomizeRowSpec(rosen.ekiCont, 0, NYUUSEN_OPTS);
    // 索引が無ければ空。
    const bare = buildCustomizeGrid(dia, rosen, 0, [createCustomizeChainColumn([0])], rowsSpec, {
      conv: CONV,
    });
    expect(at(rowsSpec, bare[0]?.cells ?? [], 'nyuusen', 0)).toBe('');
    // 探索結果(前列車の後作業キー → nextTrain)から索引を作って渡す。
    const index = buildNyuusenJikokuIndex(
      new Map([
        [
          'x',
          {
            junctionSucceed: true,
            beforeAfterType: 'unrelated' as const,
            nextTrain: {
              houkou: 0 as const,
              ressyaIndex: 0,
              ekiOrder: 0,
              opKind: 'before' as const,
              iLevel: [0],
            },
            junctionJikoku: J(7, 20),
            prevRessyahoukou: 0,
            ressyajouhouOmit: false,
          },
        ],
      ]),
    );
    const withIndex = buildCustomizeGrid(
      dia,
      rosen,
      0,
      [createCustomizeChainColumn([0])],
      rowsSpec,
      { conv: CONV, nyuusenJikoku: index },
    );
    expect(at(rowsSpec, withIndex[0]?.cells ?? [], 'nyuusen', 0)).toBe(' 7:20');
  });

  it('★列車 NULL の疑似列で e === releaseEkiOrder は空(着欄と非対称)', () => {
    const { dia, rosen } = setup();
    enableNyuusen(rosen);
    const e2 = rosen.ekiCont[2];
    if (e2 === undefined) throw new Error('no eki');
    e2.jikokuhyouOuterDisplayKudari = { origin: false, terminal: true };
    const { rows, cells } = prevCellsOf(dia, rosen, [], { releaseEkiOrder: 0 }, NYUUSEN_OPTS);
    expect(at(rows, cells, 'nyuusen', 0)).toBe('');
    expect(at(rows, cells, 'nyuusen', 1)).toBe('||');
  });
});
