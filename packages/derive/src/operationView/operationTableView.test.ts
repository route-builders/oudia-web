// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 up-tri

/**
 * 運用表ビュー(従来形式)のビューモデル(operationTableView.ts)の単体テスト。M7d。
 * 列構成・同一列車扱いの行併合・行方向の再判定・起点/終点の左右振り分けを検証する。
 */

import {
  createDefaultDia,
  createDefaultEki,
  createDefaultEkiTrack2,
  createNewRosen,
  createNullRessya,
} from '@oudia-web/domain';
import type { Dia, Ressya, Rosen } from '@oudia-web/format';
import { asSeconds } from '@oudia-web/format';
import { describe, expect, it } from 'vitest';
import type { OperationTableEntry } from '../operationFull/types.js';
import {
  buildOperationTableColumns,
  combineOperationTableRows,
  deriveOperationTableView,
  type OperationTableViewOptions,
} from './operationTableView.js';

const J = (h: number, m = 0) => asSeconds(h * 3600 + m * 60);

const OPTS: OperationTableViewOptions = {
  displayRessyamei: true,
  displayTrackName: false,
  displayParentSyubetsu: false,
  displayNoboriLeftToRight: false,
  conv: {
    noColon: false,
    outputSecond: false,
    secondRoundChaku: 0,
    secondRoundHatsu: 0,
    display2400: false,
  },
};

function makeRessya(bangou: string, houkou: 0 | 1): Ressya {
  const r = createNullRessya(3, 0);
  r.isNull = false;
  r.ressyabangou = bangou;
  for (let o = 0; o < 3; o++) {
    const s = r.ekiJikokuCont[o];
    if (s === undefined) continue;
    s.ekiatsukai = 'teisya';
    s.chakuJikoku = J(8, o * 30);
    s.hatsuJikoku = J(8, o * 30 + 5);
    s.ressyaTrackIndex = 0;
  }
  void houkou;
  return r;
}

function makeRosen(): Rosen {
  const rosen = createNewRosen().rosen;
  rosen.ekiCont = [0, 1, 2].map((i) => {
    const eki = createDefaultEki(i, `E${String(i)}`);
    eki.ekiTrack2Cont = [createDefaultEkiTrack2('1', '1')];
    return eki;
  });
  return rosen;
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

describe('buildOperationTableColumns', () => {
  it('既定は 8 列(番線なし・列車名あり)', () => {
    expect(buildOperationTableColumns(true, false)).toEqual([
      'ressyabangou',
      'ressyasyubetsu',
      'ressyamei',
      'originSideEkimei',
      'originSideEkijikoku',
      'ressyahoukou',
      'terminalSideEkimei',
      'terminalSideEkijikoku',
    ]);
  });

  it('番線表示で左右に番線列が入る', () => {
    const cols = buildOperationTableColumns(false, true);
    expect(cols).toContain('originSideEkiTrack');
    expect(cols).toContain('terminalSideEkiTrack');
    expect(cols).not.toContain('ressyamei');
  });
});

describe('combineOperationTableRows', () => {
  it('同一列車扱いの連続は 1 行に併合する', () => {
    const entries = [
      entry({ afterType: 'propertySame' }),
      entry({ beforeType: 'propertySame', afterType: 'propertySame' }),
      entry({ beforeType: 'propertySame' }),
    ];
    const rows = combineOperationTableRows(entries, 3);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.combineCount).toBe(3);
  });

  it('片側だけ PropertySame なら併合しない', () => {
    const entries = [entry({ afterType: 'propertySame' }), entry({ beforeType: 'classChange' })];
    const rows = combineOperationTableRows(entries, 3);
    expect(rows).toHaveLength(2);
  });

  it('併合で方向が変わるとき駅 index の大小で行方向を決める', () => {
    // 先頭=下り E0 始発、末尾=上り。上り終着 order 2 → EkiIndex 0 なので 始発(0) > 終着(0) ではなく等しい。
    // ここでは 始発 order 0(下り→index 0)、終着 order 0(上り→index 2)で 0 < 2 → 下り。
    const entries = [
      entry({ sihatsuEkiOrder: 0, afterType: 'propertySame' }),
      entry({
        ressyaProperty: { houkou: 1, ressyaIndex: 0, jikoku: null },
        beforeType: 'propertySame',
        syuuchakuEkiOrder: 0,
      }),
    ];
    const rows = combineOperationTableRows(entries, 3);
    expect(rows[0]?.houkou).toBe(0);
  });
});

describe('deriveOperationTableView', () => {
  function setup(): { dia: Dia; rosen: Rosen } {
    const rosen = makeRosen();
    const dia = createDefaultDia('D');
    dia.ressyaCont[0].push(makeRessya('1M', 0), makeRessya('3M', 0));
    dia.ressyaCont[1].push(makeRessya('2M', 1));
    rosen.diaCont = [dia];
    return { dia, rosen };
  }

  it('1 行 = 1 列車。始発が起点側、終着が終点側に入る(下り)', () => {
    const { dia, rosen } = setup();
    const vm = deriveOperationTableView(dia, rosen, '5', [entry()], OPTS);
    expect(vm.rows).toHaveLength(1);
    const row = vm.rows[0];
    expect(row?.ressyabangou).toBe('1M');
    expect(row?.originSide.ekimei).toBe('E0');
    expect(row?.originSide.jikokuText).toBe(' 8:05');
    expect(row?.terminalSide.ekimei).toBe('E2');
    expect(row?.terminalSide.jikokuText).toBe(' 9:00');
    expect(row?.houkouArrow).toBe('→');
  });

  it('上りは左右が入れ替わり矢印が ← になる', () => {
    const { dia, rosen } = setup();
    const e = entry({ ressyaProperty: { houkou: 1, ressyaIndex: 0, jikoku: null } });
    const vm = deriveOperationTableView(dia, rosen, '5', [e], OPTS);
    const row = vm.rows[0];
    expect(row?.houkouArrow).toBe('←');
    // 上り order 0 = EkiIndex 2 = E2 が始発 → 終点側の列に入る。
    expect(row?.terminalSide.ekimei).toBe('E2');
    expect(row?.originSide.ekimei).toBe('E0');
  });

  it('[上り始発駅を左に] で上りも → になり左右も戻る', () => {
    const { dia, rosen } = setup();
    const e = entry({ ressyaProperty: { houkou: 1, ressyaIndex: 0, jikoku: null } });
    const vm = deriveOperationTableView(dia, rosen, '5', [e], {
      ...OPTS,
      displayNoboriLeftToRight: true,
    });
    expect(vm.rows[0]?.houkouArrow).toBe('→');
    expect(vm.rows[0]?.originSide.ekimei).toBe('E2');
  });

  it('路線外始発は路線外駅名を出し番線欄は空のまま', () => {
    const { dia, rosen } = setup();
    const e0 = rosen.ekiCont[0];
    if (e0) e0.outerTerminalCont = [{ ekimei: '車庫', jikokuRyaku: '', diaRyaku: '' }];
    const vm = deriveOperationTableView(
      dia,
      rosen,
      '5',
      [entry({ outerSihatsuEkiIndex: 0, outerSihatsuJikoku: J(7, 30) })],
      { ...OPTS, displayTrackName: true },
    );
    expect(vm.rows[0]?.originSide.ekimei).toBe('車庫');
    expect(vm.rows[0]?.originSide.jikokuText).toBe(' 7:30');
    expect(vm.rows[0]?.originSide.track).toBe('');
    // 終着側は通常なので番線が入る。
    expect(vm.rows[0]?.terminalSide.track).toBe('1');
  });

  it('同一列車扱いの併合行は 先頭列車の情報 + 末尾列車の終着', () => {
    const { dia, rosen } = setup();
    const entries = [
      entry({ afterType: 'propertySame', syuuchakuEkiOrder: 1 }),
      entry({
        ressyaProperty: { houkou: 0, ressyaIndex: 1, jikoku: null },
        beforeType: 'propertySame',
        sihatsuEkiOrder: 1,
        syuuchakuEkiOrder: 2,
      }),
    ];
    const vm = deriveOperationTableView(dia, rosen, '5', entries, OPTS);
    expect(vm.rows).toHaveLength(1);
    expect(vm.rows[0]?.ressyabangou).toBe('1M'); // 先頭列車
    expect(vm.rows[0]?.originSide.ekimei).toBe('E0'); // 先頭の始発
    expect(vm.rows[0]?.terminalSide.ekimei).toBe('E2'); // 末尾の終着
    expect(vm.rows[0]?.combineCount).toBe(2);
  });
});
