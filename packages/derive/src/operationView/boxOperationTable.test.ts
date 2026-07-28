// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 up-tri

/**
 * 箱ダイヤ形式ビューモデル(boxOperationTable.ts)の単体テスト。M7e。
 * 表示駅列の構築規則・行併合(↓)・記号(○/△/縦線)・線種(right/left/full/dash)を検証する。
 */

import {
  createDefaultDia,
  createDefaultEki,
  createNewRosen,
  createNullRessya,
} from '@oudia-web/domain';
import type { Dia, Ressya, Rosen } from '@oudia-web/format';
import { asSeconds } from '@oudia-web/format';
import { describe, expect, it } from 'vitest';
import type { OperationTableEntry } from '../operationFull/types.js';
import {
  type BoxOperationTableOptions,
  buildBoxOperationTableColumns,
  combineBoxOperationTableRows,
  deriveBoxOperationTableView,
} from './boxOperationTable.js';

const J = (h: number, m = 0) => asSeconds(h * 3600 + m * 60);
const OPTS: BoxOperationTableOptions = {
  displayRessyamei: false,
  displayTrackName: false,
  displayParentSyubetsu: false,
  displayTsuukaEkiJikoku: false,
  conv: {
    noColon: false,
    outputSecond: false,
    secondRoundChaku: 0,
    secondRoundHatsu: 0,
    display2400: false,
  },
};

/** 4 駅・全駅停車の列車。 */
function makeRessya(bangou: string): Ressya {
  const r = createNullRessya(4, 0);
  r.isNull = false;
  r.ressyabangou = bangou;
  for (let o = 0; o < 4; o++) {
    const s = r.ekiJikokuCont[o];
    if (s === undefined) continue;
    s.ekiatsukai = 'teisya';
    s.chakuJikoku = J(8, o * 30);
    s.hatsuJikoku = J(8, o * 30 + 5);
  }
  return r;
}

function setup(): { dia: Dia; rosen: Rosen } {
  const rosen = createNewRosen().rosen;
  rosen.ekiCont = [0, 1, 2, 3].map((i) => createDefaultEki(i, `E${String(i)}`));
  const dia = createDefaultDia('ダイヤA');
  dia.ressyaCont[0].push(makeRessya('1M'), makeRessya('3M'));
  dia.ressyaCont[1].push(makeRessya('2M'));
  rosen.diaCont = [dia];
  return { dia, rosen };
}

function entry(over: Partial<OperationTableEntry> = {}): OperationTableEntry {
  return {
    ressyaProperty: { houkou: 0, ressyaIndex: 0, jikoku: null },
    sihatsuEkiOrder: 0,
    beforeType: 'outIn',
    outerSihatsuEkiIndex: null,
    outerSihatsuJikoku: null,
    chakuJikoku: null,
    syuuchakuEkiOrder: 3,
    afterType: 'outIn',
    outerSyuuchakuEkiIndex: null,
    hatsuJikoku: null,
    outerSyuuchakuJikoku: null,
    afterOperation: null,
    ...over,
  };
}

describe('buildBoxOperationTableColumns', () => {
  it('始発駅と終着駅が列になる(表示フラグ OFF でも端点は列)', () => {
    const { dia, rosen } = setup();
    const cols = buildBoxOperationTableColumns(rosen, dia, [entry()]);
    expect(cols).toEqual([
      { kind: 'eki', ekiIndex: 0 },
      { kind: 'eki', ekiIndex: 3 },
    ]);
  });

  it('[箱ダイヤに時刻を表示する] 駅は列車が来なくても列になる(原典 :3022-3029)', () => {
    const { dia, rosen } = setup();
    const eki2 = rosen.ekiCont[2];
    if (eki2 === undefined) throw new Error('no eki');
    eki2.operationTableDisplayJikoku = true;
    // 0→1 だけ走る列車。駅 2 は範囲外だがフラグ ON なので列になる。
    const cols = buildBoxOperationTableColumns(rosen, dia, [entry({ syuuchakuEkiOrder: 1 })]);
    expect(cols).toEqual([
      { kind: 'eki', ekiIndex: 0 },
      { kind: 'eki', ekiIndex: 1 },
      { kind: 'eki', ekiIndex: 2 },
    ]);
  });

  it('同じ駅は 2 回現れない(折返し運用でも列は増えない)', () => {
    const { dia, rosen } = setup();
    const cols = buildBoxOperationTableColumns(rosen, dia, [
      entry({ afterType: 'propertyChange' }),
      // 上り 2M(始発 order0 = 駅3、終着 order3 = 駅0)。
      entry({
        ressyaProperty: { houkou: 1, ressyaIndex: 0, jikoku: null },
        beforeType: 'propertyChange',
        sihatsuEkiOrder: 0,
        syuuchakuEkiOrder: 3,
      }),
    ]);
    expect(cols).toEqual([
      { kind: 'eki', ekiIndex: 0 },
      { kind: 'eki', ekiIndex: 3 },
    ]);
  });

  it('分岐駅は基幹駅の列に寄る(原典 :3085-3090)', () => {
    const { dia, rosen } = setup();
    const eki3 = rosen.ekiCont[3];
    if (eki3 === undefined) throw new Error('no eki');
    eki3.brunchCoreEkiIndex = 1;
    const cols = buildBoxOperationTableColumns(rosen, dia, [entry()]);
    // 終着 = 駅3 だが基幹駅 1 に統合される。
    expect(cols).toEqual([
      { kind: 'eki', ekiIndex: 0 },
      { kind: 'eki', ekiIndex: 1 },
    ]);
  });

  it('路線外始発は左端に拡張スロットを 1 個だけ足す(原典 :3219-3231)', () => {
    const { dia, rosen } = setup();
    const cols = buildBoxOperationTableColumns(rosen, dia, [
      entry({ outerSihatsuEkiIndex: 0, sihatsuEkiOrder: 0 }),
    ]);
    expect(cols[0]).toEqual({ kind: 'outerLeft' });
    expect(cols.filter((c) => c.kind === 'outerLeft')).toHaveLength(1);
  });

  it('★運行区間が取れない列車(丸めが -1)は列にも行セルにもしない', () => {
    const { dia, rosen } = setup();
    // 全駅を運行なしにすると getRunBetweenEkiForward/Backward が -1 を返す。
    const r = dia.ressyaCont[0]?.[0];
    if (r === undefined) throw new Error('no ressya');
    for (const slot of r.ekiJikokuCont) {
      slot.ekiatsukai = 'none';
      slot.chakuJikoku = null;
      slot.hatsuJikoku = null;
    }
    const cols = buildBoxOperationTableColumns(rosen, dia, [entry()]);
    // 原典は eki[-1] でクラッシュする。TS は「その列車の列候補を捨てる」。
    expect(cols.every((c) => c.kind !== 'eki' || c.ekiIndex >= 0)).toBe(true);
    const vm = deriveBoxOperationTableView(dia, rosen, '1', [entry()], OPTS);
    expect(vm.columns.every((c) => c.kind !== 'eki' || c.ekiIndex >= 0)).toBe(true);
    // 行自体は残る(原典も行構築は先に済んでいる)。
    expect(vm.rows).toHaveLength(1);
  });
});

describe('combineBoxOperationTableRows', () => {
  it('同一列車扱いは併合する', () => {
    const rows = combineBoxOperationTableRows(
      [
        entry({ syuuchakuEkiOrder: 1, afterType: 'propertySame' }),
        entry({ sihatsuEkiOrder: 1, beforeType: 'propertySame' }),
      ],
      4,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.combineCount).toBe(2);
    expect(rows[0]?.isContinue).toBe(false);
  });

  it('★方向が違えば同一列車扱いでも行を割り、次行に継続印を立てる(原典 :5694-5711)', () => {
    const rows = combineBoxOperationTableRows(
      [
        entry({ afterType: 'propertySame' }),
        entry({
          ressyaProperty: { houkou: 1, ressyaIndex: 0, jikoku: null },
          beforeType: 'propertySame',
        }),
      ],
      4,
    );
    expect(rows).toHaveLength(2);
    expect(rows[0]?.isContinue).toBe(false);
    expect(rows[1]?.isContinue).toBe(true);
  });

  it('★駅順が逆転しても行を割る(前列車終着 order > 次列車始発 order)', () => {
    const rows = combineBoxOperationTableRows(
      [
        entry({ sihatsuEkiOrder: 0, syuuchakuEkiOrder: 3, afterType: 'propertySame' }),
        entry({ sihatsuEkiOrder: 1, syuuchakuEkiOrder: 3, beforeType: 'propertySame' }),
      ],
      4,
    );
    expect(rows).toHaveLength(2);
    expect(rows[1]?.isContinue).toBe(true);
  });
});

describe('deriveBoxOperationTableView', () => {
  it('出区は着セルに ○、入区は発セルに △(方向によらない)', () => {
    const { dia, rosen } = setup();
    const vm = deriveBoxOperationTableView(dia, rosen, '1', [entry()], OPTS);
    expect(vm.rows).toHaveLength(1);
    const [start, end] = vm.rows[0]?.cells ?? [];
    expect(start?.chakuSymbol).toBe('circle');
    expect(start?.line).toBe('right'); // 下り始発 = 右半分
    expect(end?.hatsuSymbol).toBe('triangle');
    expect(end?.line).toBe('left'); // 下り終着 = 左半分
  });

  it('上り列車は横線の左右が入れ替わる(○△ は入れ替わらない)', () => {
    const { dia, rosen } = setup();
    const vm = deriveBoxOperationTableView(
      dia,
      rosen,
      '1',
      [entry({ ressyaProperty: { houkou: 1, ressyaIndex: 0, jikoku: null } })],
      OPTS,
    );
    // 上り: 始発 = 駅3(右端の列)、終着 = 駅0(左端の列)。
    const cells = vm.rows[0]?.cells ?? [];
    const sihatsu = cells[cells.length - 1];
    const syuuchaku = cells[0];
    expect(sihatsu?.chakuSymbol).toBe('circle');
    expect(sihatsu?.line).toBe('left'); // 上り始発 = 左半分
    expect(syuuchaku?.hatsuSymbol).toBe('triangle');
    expect(syuuchaku?.line).toBe('right');
  });

  it('運用上の前列車の終着駅と一致すれば縦線で繋ぐ', () => {
    const { dia, rosen } = setup();
    const entries = [
      entry({ syuuchakuEkiOrder: 3, afterType: 'propertyChange' }),
      entry({
        ressyaProperty: { houkou: 0, ressyaIndex: 1, jikoku: null },
        sihatsuEkiOrder: 3,
        syuuchakuEkiOrder: 3,
        beforeType: 'propertyChange',
      }),
    ];
    const vm = deriveBoxOperationTableView(dia, rosen, '1', entries, OPTS);
    expect(vm.rows).toHaveLength(2);
    // 2 行目の始発駅(= 駅3)セルに縦線。
    const col3 = vm.columns.findIndex((c) => c.kind === 'eki' && c.ekiIndex === 3);
    expect(vm.rows[1]?.cells[col3]?.chakuSymbol).toBe('vline');
    // 1 行目の終着駅(同じ列)にも縦線(発セル側)。
    expect(vm.rows[0]?.cells[col3]?.hatsuSymbol).toBe('vline');
  });

  it('運行中の中間駅は記号なしの全域線', () => {
    const { dia, rosen } = setup();
    const eki1 = rosen.ekiCont[1];
    if (eki1 === undefined) throw new Error('no eki');
    eki1.operationTableDisplayJikoku = true;
    const vm = deriveBoxOperationTableView(dia, rosen, '1', [entry()], OPTS);
    const col1 = vm.columns.findIndex((c) => c.kind === 'eki' && c.ekiIndex === 1);
    expect(vm.rows[0]?.cells[col1]?.chakuSymbol).toBe('none');
    expect(vm.rows[0]?.cells[col1]?.hatsuSymbol).toBe('none');
    expect(vm.rows[0]?.cells[col1]?.line).toBe('full');
    expect(vm.rows[0]?.cells[col1]?.chaku).not.toBe('');
  });

  it('併合行の隙間(前列車終着〜次列車始発)は破線(原典 :1312-1318)', () => {
    // 5 駅。前列車 0→1、次列車 3→4 を同一列車扱いで併合し、駅 2 を表示駅にする。
    const rosen = createNewRosen().rosen;
    rosen.ekiCont = [0, 1, 2, 3, 4].map((i) => createDefaultEki(i, `E${String(i)}`));
    const eki2 = rosen.ekiCont[2];
    if (eki2 === undefined) throw new Error('no eki');
    eki2.operationTableDisplayJikoku = true;
    const dia = createDefaultDia('ダイヤA');
    const mk = (): Ressya => {
      const r = createNullRessya(5, 0);
      r.isNull = false;
      r.ressyabangou = 'X';
      for (let o = 0; o < 5; o++) {
        const s = r.ekiJikokuCont[o];
        if (s === undefined) continue;
        s.ekiatsukai = 'teisya';
        s.chakuJikoku = J(8, o * 10);
        s.hatsuJikoku = J(8, o * 10 + 2);
      }
      return r;
    };
    dia.ressyaCont[0].push(mk(), mk());
    rosen.diaCont = [dia];

    const entries = [
      entry({ sihatsuEkiOrder: 0, syuuchakuEkiOrder: 1, afterType: 'propertySame' }),
      entry({
        ressyaProperty: { houkou: 0, ressyaIndex: 1, jikoku: null },
        sihatsuEkiOrder: 3,
        syuuchakuEkiOrder: 4,
        beforeType: 'propertySame',
      }),
    ];
    const vm = deriveBoxOperationTableView(dia, rosen, '1', entries, OPTS);
    expect(vm.rows).toHaveLength(1);
    const col2 = vm.columns.findIndex((c) => c.kind === 'eki' && c.ekiIndex === 2);
    expect(col2).toBeGreaterThanOrEqual(0);
    expect(vm.rows[0]?.cells[col2]?.line).toBe('dash');
    expect(vm.rows[0]?.cells[col2]?.chaku).toBe('');
  });

  it('通過駅の時刻は既定で出さない。[通過駅時刻を表示] で出て灰色になる', () => {
    const { dia, rosen } = setup();
    const eki1 = rosen.ekiCont[1];
    if (eki1 === undefined) throw new Error('no eki');
    eki1.operationTableDisplayJikoku = true;
    const slot = dia.ressyaCont[0]?.[0]?.ekiJikokuCont[1];
    if (slot === undefined) throw new Error('no slot');
    slot.ekiatsukai = 'tsuuka';

    const off = deriveBoxOperationTableView(dia, rosen, '1', [entry()], OPTS);
    const col1 = off.columns.findIndex((c) => c.kind === 'eki' && c.ekiIndex === 1);
    expect(off.rows[0]?.cells[col1]?.chaku).toBe('');

    const on = deriveBoxOperationTableView(dia, rosen, '1', [entry()], {
      ...OPTS,
      displayTsuukaEkiJikoku: true,
    });
    expect(on.rows[0]?.cells[col1]?.chaku).not.toBe('');
    // 括弧は付かない。灰色フラグだけ立つ(原典 CdColorProp(128,128,128))。
    expect(on.rows[0]?.cells[col1]?.chaku).not.toContain('(');
    expect(on.rows[0]?.cells[col1]?.chakuGray).toBe(true);
  });

  it('併合行では内側の駅の線が全域になり、記号は付かない', () => {
    const { dia, rosen } = setup();
    const entries = [
      entry({ syuuchakuEkiOrder: 2, afterType: 'propertySame' }),
      entry({
        ressyaProperty: { houkou: 0, ressyaIndex: 1, jikoku: null },
        sihatsuEkiOrder: 2,
        syuuchakuEkiOrder: 3,
        beforeType: 'propertySame',
      }),
    ];
    // 併合境界駅(駅2)は表示フラグを立てないと列にならない(原典 fact: 中間境界駅は列外)。
    const eki2b = rosen.ekiCont[2];
    if (eki2b === undefined) throw new Error('no eki');
    eki2b.operationTableDisplayJikoku = true;
    const vm = deriveBoxOperationTableView(dia, rosen, '1', entries, OPTS);
    expect(vm.rows).toHaveLength(1);
    const col2 = vm.columns.findIndex((c) => c.kind === 'eki' && c.ekiIndex === 2);
    const cell = vm.rows[0]?.cells[col2];
    expect(cell?.line).toBe('full');
    expect(cell?.chakuSymbol).toBe('none');
    expect(cell?.hatsuSymbol).toBe('none');
  });

  it('列見出しは駅名。路線外スロットは空文字', () => {
    const { dia, rosen } = setup();
    const vm = deriveBoxOperationTableView(
      dia,
      rosen,
      '1',
      [entry({ outerSihatsuEkiIndex: 0 })],
      OPTS,
    );
    expect(vm.headers[0]).toBe('');
    expect(vm.headers.slice(1)).toContain('E3');
  });
});
