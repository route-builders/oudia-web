// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 up-tri

// 連続入力モードの domain コマンド(原典 CWjkState_Renzoku::OnChar 919-1028 /
// OnJikokuhyouJikokuSakujo 1118-1138)と findRevJikokuItem の検証。

import type { RosenFileData } from '@oudia-web/format';
import { parseNodeTree, readRosenFile } from '@oudia-web/format';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { findRevJikokuItem } from '../runRange.js';
import { createDocumentState, executeCommand, redo, undo } from './engine.js';
import type { EditCommand } from './types.js';

const here = dirname(fileURLToPath(import.meta.url));
const fixtures = join(here, '..', '..', '..', 'format', 'fixtures');
function base(): RosenFileData {
  const bytes = new Uint8Array(readFileSync(join(fixtures, 'current', 'sample2.oud2')));
  const parsed = parseNodeTree(bytes);
  if (!parsed.ok) throw new Error('parse');
  return readRosenFile(parsed.root).data;
}
function run(data: RosenFileData, cmd: EditCommand): RosenFileData {
  return executeCommand(createDocumentState(data), cmd).rosenFileData;
}

// sample2 下り列車 0: 駅0 発0 / 駅1 発250 / 駅2 発310 / 駅3 停(時刻なし)/ 駅4 着720 発780 /
// 駅5 通過 / 駅6 発1020 / 駅14-20 運行なし。
const DIA = 0;
const DOWN = 0 as const;

describe('findRevJikokuItem(原典 findrevJikoku)', () => {
  it('発行の基準は同駅の着(あれば)', () => {
    const r = base().rosen.diaCont[DIA]!.ressyaCont[DOWN][0]!;
    expect(findRevJikokuItem(r, 4, 'hatsu')).toBe(720); // 駅 4 の着
  });

  it('着行の基準は前駅の発、無時刻駅を跨いで遡る', () => {
    const r = base().rosen.diaCont[DIA]!.ressyaCont[DOWN][0]!;
    // 駅 4 の着 → 駅 3 は停車だが時刻なし → 駅 2 の発 310。駅扱は見ない。
    expect(findRevJikokuItem(r, 4, 'chaku')).toBe(310);
  });

  it('先頭(駅 0 の発)の基準は同駅の着 = null → さらに遡れず null', () => {
    const r = base().rosen.diaCont[DIA]!.ressyaCont[DOWN][0]!;
    expect(findRevJikokuItem(r, 0, 'hatsu')).toBeNull();
  });
});

describe('ekiJikoku/renzokuInput', () => {
  it('分 2 桁を直前時刻の「時」と合成して書き込む(発行)', () => {
    // 駅 6 の発行: 基準 = 駅 4 の発 780(0:13)→ 時 0。分 25 → 0:25 = 1500。
    const next = run(base(), {
      type: 'ekiJikoku/renzokuInput',
      diaIndex: DIA,
      houkou: DOWN,
      ressyaIndex: 0,
      ekiOrder: 6,
      item: 'hatsu',
      minutes: 25,
    });
    const ej = next.rosen.diaCont[DIA]!.ressyaCont[DOWN][0]!.ekiJikokuCont[6]!;
    expect(ej.hatsuJikoku).toBe(25 * 60);
    expect(ej.ekiatsukai).toBe('teisya');
  });

  it('直前時刻より前の分は +1 時間される(0:13 基準に 05 → 1:05)', () => {
    const next = run(base(), {
      type: 'ekiJikoku/renzokuInput',
      diaIndex: DIA,
      houkou: DOWN,
      ressyaIndex: 0,
      ekiOrder: 6,
      item: 'hatsu',
      minutes: 5,
    });
    const ej = next.rosen.diaCont[DIA]!.ressyaCont[DOWN][0]!.ekiJikokuCont[6]!;
    expect(ej.hatsuJikoku).toBe(3600 + 5 * 60);
  });

  it('同値なら補正なし(基準 0:13 に 13 → 0:13)', () => {
    const next = run(base(), {
      type: 'ekiJikoku/renzokuInput',
      diaIndex: DIA,
      houkou: DOWN,
      ressyaIndex: 0,
      ekiOrder: 6,
      item: 'hatsu',
      minutes: 13,
    });
    expect(next.rosen.diaCont[DIA]!.ressyaCont[DOWN][0]!.ekiJikokuCont[6]!.hatsuJikoku).toBe(
      13 * 60,
    );
  });

  it('運行なし駅への入力は停車化 + 基準番線(主本線)適用', () => {
    const next = run(base(), {
      type: 'ekiJikoku/renzokuInput',
      diaIndex: DIA,
      houkou: DOWN,
      ressyaIndex: 0,
      ekiOrder: 14, // 運行なし
      item: 'hatsu',
      minutes: 45,
    });
    const ej = next.rosen.diaCont[DIA]!.ressyaCont[DOWN][0]!.ekiJikokuCont[14]!;
    expect(ej.ekiatsukai).toBe('teisya');
    expect(ej.ressyaTrackIndex).toBe(next.rosen.ekiCont[14]!.downMain);
  });

  it('通過駅への入力は停車化するが番線は変更しない', () => {
    const d0 = base();
    const trackBefore = d0.rosen.diaCont[DIA]!.ressyaCont[DOWN][0]!.ekiJikokuCont[5]!;
    expect(trackBefore.ekiatsukai).toBe('tsuuka');
    const next = run(d0, {
      type: 'ekiJikoku/renzokuInput',
      diaIndex: DIA,
      houkou: DOWN,
      ressyaIndex: 0,
      ekiOrder: 5,
      item: 'hatsu',
      minutes: 14,
    });
    const ej = next.rosen.diaCont[DIA]!.ressyaCont[DOWN][0]!.ekiJikokuCont[5]!;
    expect(ej.ekiatsukai).toBe('teisya');
    expect(ej.ressyaTrackIndex).toBe(trackBefore.ressyaTrackIndex); // 番線維持
    expect(ej.hatsuJikoku).toBe(14 * 60); // 基準 780(0:13)→ 14 分 = 0:14
  });

  it('23 時台からの +1 時間は 0 時台へラップする', () => {
    // 駅 6 の発を 23:50 にしてから駅 8 の着へ 10 分を入力 → 0:10。
    const prep = run(base(), {
      type: 'ekiJikoku/writeJikoku',
      diaIndex: DIA,
      houkou: DOWN,
      ressyaIndex: 0,
      ekiOrder: 6,
      chakuInput: '',
      hatsuInput: '2350',
      modify: false,
    });
    // 駅 7 は通過(時刻なし)なので駅 8 着の基準は駅 6 発 23:50。
    const next = run(prep, {
      type: 'ekiJikoku/renzokuInput',
      diaIndex: DIA,
      houkou: DOWN,
      ressyaIndex: 0,
      ekiOrder: 8,
      item: 'chaku',
      minutes: 10,
    });
    expect(next.rosen.diaCont[DIA]!.ressyaCont[DOWN][0]!.ekiJikokuCont[8]!.chakuJikoku).toBe(
      10 * 60,
    );
  });

  it('Undo/Redo 対称', () => {
    const s0 = createDocumentState(base());
    const cmd: EditCommand = {
      type: 'ekiJikoku/renzokuInput',
      diaIndex: DIA,
      houkou: DOWN,
      ressyaIndex: 0,
      ekiOrder: 14,
      item: 'hatsu',
      minutes: 45,
    };
    const s1 = executeCommand(s0, cmd);
    const s2 = undo(s1);
    expect(s2.rosenFileData).toEqual(s0.rosenFileData);
    expect(redo(s2).rosenFileData).toEqual(s1.rosenFileData);
  });
});

describe('ekiJikoku/clear(teisyaFirst: 連続入力モード版)', () => {
  it('通過駅の片側消去で駅扱が停車になる(通常版は通過のまま)', () => {
    // 駅 5 は通過・時刻なし → まず発時刻を持つ通過駅を作る。
    const prep0 = run(base(), {
      type: 'ekiJikoku/writeJikoku',
      diaIndex: DIA,
      houkou: DOWN,
      ressyaIndex: 0,
      ekiOrder: 5,
      chakuInput: '014',
      hatsuInput: '015',
      modify: false,
    });
    const prep = run(prep0, {
      type: 'ekiJikoku/setEkiatsukai',
      diaIndex: DIA,
      houkou: DOWN,
      ressyaIndices: [0],
      ekiOrder: 5,
      ekiatsukai: 'tsuuka',
    });
    // 連続入力モード版: 着のみ消去 → teisyaFirst で停車化され、発が残るので停車のまま。
    const renzoku = run(prep, {
      type: 'ekiJikoku/clear',
      diaIndex: DIA,
      houkou: DOWN,
      ressyaIndices: [0],
      ekiOrder: 5,
      target: 'chaku',
      teisyaFirst: true,
    });
    expect(renzoku.rosen.diaCont[DIA]!.ressyaCont[DOWN][0]!.ekiJikokuCont[5]!.ekiatsukai).toBe(
      'teisya',
    );
    // 通常版: 通過のまま。
    const normal = run(prep, {
      type: 'ekiJikoku/clear',
      diaIndex: DIA,
      houkou: DOWN,
      ressyaIndices: [0],
      ekiOrder: 5,
      target: 'chaku',
    });
    expect(normal.rosen.diaCont[DIA]!.ressyaCont[DOWN][0]!.ekiJikokuCont[5]!.ekiatsukai).toBe(
      'tsuuka',
    );
  });

  it('teisyaFirst でも両 null なら運行なし化する', () => {
    const next = run(base(), {
      type: 'ekiJikoku/clear',
      diaIndex: DIA,
      houkou: DOWN,
      ressyaIndices: [0],
      ekiOrder: 6, // 発 1020 のみ
      target: 'hatsu',
      teisyaFirst: true,
    });
    expect(next.rosen.diaCont[DIA]!.ressyaCont[DOWN][0]!.ekiJikokuCont[6]!.ekiatsukai).toBe('none');
  });
});
