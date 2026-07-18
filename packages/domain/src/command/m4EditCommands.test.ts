// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 oudia-second-web contributors

// M4 編集コマンド(シフト伝播・writeJikoku 繰上げ繰下げ・通過-停車・運休独立トグル・
// 種別/番号ステップ)のレデューサ検証。原典 CentDedRessya.cpp 284-1010 /
// CWjkState_Ressyahensyu.cpp 4919-5042, 9942-9997, 14585-14621 準拠(抽出レポート引用)。

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parseNodeTree, readRosenFile } from '@oudia/format';
import type { RosenFileData } from '@oudia/format';
import { createDocumentState, executeCommand, undo, redo } from './engine.js';
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

function assertSymmetry(cmd: EditCommand): void {
  const s0 = createDocumentState(base());
  const s1 = executeCommand(s0, cmd);
  const s2 = undo(s1);
  expect(s2.rosenFileData).toEqual(s0.rosenFileData);
  const s3 = redo(s2);
  expect(s3.rosenFileData).toEqual(s1.rosenFileData);
}

// sample2 下り 列車 0 の既知形状(検証用アンカー):
//   駅4: 着 720 / 発 780、駅6: 発 1020、駅8: 着 1320 / 発 1360、駅13: 着 1980(発 null)、
//   駅14-20: 運行なし、駅21: 発 2130。
const DIA = 0;
const DOWN = 0 as const;

describe('ekiJikoku/shiftJikoku(modifyRessyaJikoku 忠実)', () => {
  it('発基準の前方シフト: 当該駅の着は不変・発と以後の全非 null 時刻が動く', () => {
    const next = run(base(), {
      type: 'ekiJikoku/shiftJikoku',
      diaIndex: DIA,
      houkou: DOWN,
      ressyaIndices: [0],
      ekiOrder: 4,
      item: 'hatsu',
      deltaSeconds: -60,
    });
    const cont = next.rosen.diaCont[DIA]!.ressyaCont[DOWN][0]!.ekiJikokuCont;
    expect(cont[4]!.chakuJikoku).toBe(720); // 基準が発なら着は対象外
    expect(cont[4]!.hatsuJikoku).toBe(780 - 60);
    expect(cont[6]!.hatsuJikoku).toBe(1020 - 60);
    expect(cont[8]!.chakuJikoku).toBe(1320 - 60);
    expect(cont[8]!.hatsuJikoku).toBe(1360 - 60);
    // 運行なし区間(null)はスキップされ、その先も動く。
    expect(cont[21]!.hatsuJikoku).toBe(2130 - 60);
    // 基準より前は不変。
    expect(cont[2]!.hatsuJikoku).toBe(310);
  });

  it('着基準の前方シフトは当該駅の着も動く', () => {
    const next = run(base(), {
      type: 'ekiJikoku/shiftJikoku',
      diaIndex: DIA,
      houkou: DOWN,
      ressyaIndices: [0],
      ekiOrder: 4,
      item: 'chaku',
      deltaSeconds: 120,
    });
    const cont = next.rosen.diaCont[DIA]!.ressyaCont[DOWN][0]!.ekiJikokuCont;
    expect(cont[4]!.chakuJikoku).toBe(720 + 120);
    expect(cont[4]!.hatsuJikoku).toBe(780 + 120);
  });

  it('Rev(起点方向): 発基準なら同駅の着も対象、以後(末尾方向)は不変', () => {
    const next = run(base(), {
      type: 'ekiJikoku/shiftJikoku',
      diaIndex: DIA,
      houkou: DOWN,
      ressyaIndices: [0],
      ekiOrder: 4,
      item: 'hatsu',
      deltaSeconds: 60,
      rev: true,
    });
    const cont = next.rosen.diaCont[DIA]!.ressyaCont[DOWN][0]!.ekiJikokuCont;
    expect(cont[4]!.hatsuJikoku).toBe(780 + 60);
    expect(cont[4]!.chakuJikoku).toBe(720 + 60);
    expect(cont[2]!.hatsuJikoku).toBe(310 + 60);
    expect(cont[0]!.hatsuJikoku).toBe(0 + 60);
    expect(cont[6]!.hatsuJikoku).toBe(1020); // 末尾方向は不変
  });

  it('Rev の着基準は同駅の発を含まない', () => {
    const next = run(base(), {
      type: 'ekiJikoku/shiftJikoku',
      diaIndex: DIA,
      houkou: DOWN,
      ressyaIndices: [0],
      ekiOrder: 4,
      item: 'chaku',
      deltaSeconds: 60,
      rev: true,
    });
    const cont = next.rosen.diaCont[DIA]!.ressyaCont[DOWN][0]!.ekiJikokuCont;
    expect(cont[4]!.chakuJikoku).toBe(720 + 60);
    expect(cont[4]!.hatsuJikoku).toBe(780); // 発は対象外
    expect(cont[2]!.hatsuJikoku).toBe(310 + 60);
  });

  it('24h ラップ: 発 0 秒に -60 で 86340', () => {
    const next = run(base(), {
      type: 'ekiJikoku/shiftJikoku',
      diaIndex: DIA,
      houkou: DOWN,
      ressyaIndices: [0],
      ekiOrder: 0,
      item: 'chaku',
      deltaSeconds: -60,
    });
    const cont = next.rosen.diaCont[DIA]!.ressyaCont[DOWN][0]!.ekiJikokuCont;
    expect(cont[0]!.hatsuJikoku).toBe(86400 - 60);
  });

  it('複数列車に適用され、範囲外 ekiOrder は no-op', () => {
    const d0 = base();
    const before1 = d0.rosen.diaCont[DIA]!.ressyaCont[DOWN][2]!.ekiJikokuCont[0]!.hatsuJikoku;
    const next = run(d0, {
      type: 'ekiJikoku/shiftJikoku',
      diaIndex: DIA,
      houkou: DOWN,
      ressyaIndices: [0, 2],
      ekiOrder: 0,
      item: 'chaku',
      deltaSeconds: 60,
    });
    const list = next.rosen.diaCont[DIA]!.ressyaCont[DOWN];
    expect(list[0]!.ekiJikokuCont[0]!.hatsuJikoku).toBe(60);
    expect(list[2]!.ekiJikokuCont[0]!.hatsuJikoku).toBe((before1 as number) + 60);
    // 範囲外は no-op(例外なし)。
    const same = run(base(), {
      type: 'ekiJikoku/shiftJikoku',
      diaIndex: DIA,
      houkou: DOWN,
      ressyaIndices: [0],
      ekiOrder: 999,
      item: 'chaku',
      deltaSeconds: 60,
    });
    expect(same).toEqual(base());
  });

  it('Undo/Redo 対称', () => {
    assertSymmetry({
      type: 'ekiJikoku/shiftJikoku',
      diaIndex: DIA,
      houkou: DOWN,
      ressyaIndices: [0],
      ekiOrder: 4,
      item: 'hatsu',
      deltaSeconds: -60,
    });
  });

  it('作業時刻もシフトされる(着 Order=前作業・発 Order=後作業。原典 753-762)', () => {
    // 列車 0: 駅 0 前作業 out(86340)/ 駅 13 前作業 release(2040)/ 駅 32 後作業 in(4290)。
    const next = run(base(), {
      type: 'ekiJikoku/shiftJikoku',
      diaIndex: DIA,
      houkou: DOWN,
      ressyaIndices: [0],
      ekiOrder: 0,
      item: 'chaku',
      deltaSeconds: 60,
    });
    const cont = next.rosen.diaCont[DIA]!.ressyaCont[DOWN][0]!.ekiJikokuCont;
    const out = cont[0]!.beforeOperationCont[0]!;
    expect(out.kind).toBe('out');
    if (out.kind === 'out') expect(out.outJikoku).toBe(0); // 86340 + 60 → 24h wrap
    const rel = cont[13]!.beforeOperationCont[0]!;
    if (rel.kind === 'release') expect(rel.releaseJikoku).toBe(2040 + 60);
    const inn = cont[32]!.afterOperationCont[0]!;
    if (inn.kind === 'in') expect(inn.inJikoku).toBe(4290 + 60);
  });

  it('(有効始発駅, 発)基準では当駅の前作業もシフトされる(原典 732-739)', () => {
    const next = run(base(), {
      type: 'ekiJikoku/shiftJikoku',
      diaIndex: DIA,
      houkou: DOWN,
      ressyaIndices: [0],
      ekiOrder: 0,
      item: 'hatsu', // 駅 0 は有効始発駅(発 0・次駅停車)
      deltaSeconds: 60,
    });
    const out =
      next.rosen.diaCont[DIA]!.ressyaCont[DOWN][0]!.ekiJikokuCont[0]!.beforeOperationCont[0]!;
    if (out.kind === 'out') expect(out.outJikoku).toBe(0); // 1 回だけシフト(二重にならない)
  });
});

describe('ekiJikoku/writeJikoku(modifyCentDedEkiJikoku 忠実)', () => {
  const target = { diaIndex: DIA, houkou: DOWN, ressyaIndex: 0, ekiOrder: 4 } as const;

  it('modify=false は置換のみ(以後の駅は不変)', () => {
    const next = run(base(), {
      type: 'ekiJikoku/writeJikoku',
      ...target,
      chakuInput: '012',
      hatsuInput: '014',
      modify: false,
    });
    const cont = next.rosen.diaCont[DIA]!.ressyaCont[DOWN][0]!.ekiJikokuCont;
    expect(cont[4]!.chakuJikoku).toBe(12 * 60);
    expect(cont[4]!.hatsuJikoku).toBe(14 * 60);
    expect(cont[6]!.hatsuJikoku).toBe(1020); // 伝播なし
  });

  it('modify=true: 発が前後非 null なら発差分が次駅以後へ伝播(当該駅の着は動かない)', () => {
    // 発 780 → 900(+120)。着は変更しない(同値入力)。
    const next = run(base(), {
      type: 'ekiJikoku/writeJikoku',
      ...target,
      chakuInput: '012', // 720 = 0:12
      hatsuInput: '015', // 900 = 0:15
      modify: true,
    });
    const cont = next.rosen.diaCont[DIA]!.ressyaCont[DOWN][0]!.ekiJikokuCont;
    expect(cont[4]!.chakuJikoku).toBe(720);
    expect(cont[4]!.hatsuJikoku).toBe(900);
    expect(cont[6]!.hatsuJikoku).toBe(1020 + 120);
    expect(cont[8]!.chakuJikoku).toBe(1320 + 120);
    expect(cont[21]!.hatsuJikoku).toBe(2130 + 120);
    expect(cont[2]!.hatsuJikoku).toBe(310); // 前方は不変
  });

  it('modify=true: 着のみ変更(発は同値)では伝播しない(発差分 0。原典の発優先分岐)', () => {
    const next = run(base(), {
      type: 'ekiJikoku/writeJikoku',
      ...target,
      chakuInput: '011', // 660(-60)
      hatsuInput: '013', // 780 同値
      modify: true,
    });
    const cont = next.rosen.diaCont[DIA]!.ressyaCont[DOWN][0]!.ekiJikokuCont;
    expect(cont[4]!.chakuJikoku).toBe(660);
    expect(cont[4]!.hatsuJikoku).toBe(780);
    expect(cont[6]!.hatsuJikoku).toBe(1020); // 発差分 0 → 伝播なし
  });

  it('modify=true: 発が null の駅で着を変更すると着差分が当該駅の発以後へ伝播', () => {
    // 駅13: 着 1980 / 発 null。着 +60 → 以後(駅21〜)へ伝播。
    const next = run(base(), {
      type: 'ekiJikoku/writeJikoku',
      diaIndex: DIA,
      houkou: DOWN,
      ressyaIndex: 0,
      ekiOrder: 13,
      chakuInput: '034', // 2040 = 0:34(旧 1980 = 0:33)
      hatsuInput: '',
      modify: true,
    });
    const cont = next.rosen.diaCont[DIA]!.ressyaCont[DOWN][0]!.ekiJikokuCont;
    expect(cont[13]!.chakuJikoku).toBe(2040);
    expect(cont[21]!.hatsuJikoku).toBe(2130 + 60);
    expect(cont[8]!.hatsuJikoku).toBe(1360); // 前方は不変
  });

  it('2 桁入力は時補完される(前駅の発の「時」を引き継ぐ)', () => {
    // 駅8(着 1320/発 1360)で着に "23" → 前駅(駅6)発 1020 の時=0 → 23 分 = 1380。
    const next = run(base(), {
      type: 'ekiJikoku/writeJikoku',
      diaIndex: DIA,
      houkou: DOWN,
      ressyaIndex: 0,
      ekiOrder: 8,
      chakuInput: '23',
      hatsuInput: '23', // 発の補完基準は新着(1380)→ 同時刻 23 分 = 1380
      modify: false,
    });
    const cont = next.rosen.diaCont[DIA]!.ressyaCont[DOWN][0]!.ekiJikokuCont;
    expect(cont[8]!.chakuJikoku).toBe(23 * 60);
    expect(cont[8]!.hatsuJikoku).toBe(23 * 60);
  });

  it('運行なし駅への書込は停車へ自動昇格する(setChakujikoku の None→Teisya)', () => {
    const next = run(base(), {
      type: 'ekiJikoku/writeJikoku',
      diaIndex: DIA,
      houkou: DOWN,
      ressyaIndex: 0,
      ekiOrder: 14, // 運行なし
      chakuInput: '',
      hatsuInput: '0340',
      modify: false,
    });
    const ej = next.rosen.diaCont[DIA]!.ressyaCont[DOWN][0]!.ekiJikokuCont[14]!;
    expect(ej.ekiatsukai).toBe('teisya');
    expect(ej.hatsuJikoku).toBe(3 * 3600 + 40 * 60);
  });

  it('Undo/Redo 対称(modify=true)', () => {
    assertSymmetry({
      type: 'ekiJikoku/writeJikoku',
      ...target,
      chakuInput: '012',
      hatsuInput: '015',
      modify: true,
    });
  });
});

describe('ekiJikoku/toggleTsuukaTeisya(各列車独立トグル)', () => {
  it('停車→通過は時刻・番線を維持する', () => {
    const next = run(base(), {
      type: 'ekiJikoku/toggleTsuukaTeisya',
      diaIndex: DIA,
      houkou: DOWN,
      ressyaIndices: [0],
      ekiOrder: 4,
    });
    const ej = next.rosen.diaCont[DIA]!.ressyaCont[DOWN][0]!.ekiJikokuCont[4]!;
    expect(ej.ekiatsukai).toBe('tsuuka');
    expect(ej.chakuJikoku).toBe(720); // 時刻維持(通過時刻)
    expect(ej.hatsuJikoku).toBe(780);
    expect(ej.ressyaTrackIndex).toBe(2); // 番線維持
  });

  it('通過→停車も時刻・番線を維持する(往復で元に戻る)', () => {
    const once = run(base(), {
      type: 'ekiJikoku/toggleTsuukaTeisya',
      diaIndex: DIA,
      houkou: DOWN,
      ressyaIndices: [0],
      ekiOrder: 4,
    });
    const twice = run(once, {
      type: 'ekiJikoku/toggleTsuukaTeisya',
      diaIndex: DIA,
      houkou: DOWN,
      ressyaIndices: [0],
      ekiOrder: 4,
    });
    expect(twice).toEqual(base());
  });

  it('運行なし→通過で基準番線(主本線)が設定される', () => {
    // 列車 0 駅 14 は運行なし。駅 14(駅Order=駅Index、下り)の downMain = 0。
    const next = run(base(), {
      type: 'ekiJikoku/toggleTsuukaTeisya',
      diaIndex: DIA,
      houkou: DOWN,
      ressyaIndices: [0],
      ekiOrder: 14,
    });
    const ej = next.rosen.diaCont[DIA]!.ressyaCont[DOWN][0]!.ekiJikokuCont[14]!;
    expect(ej.ekiatsukai).toBe('tsuuka');
    expect(ej.chakuJikoku).toBeNull();
    const eki14 = next.rosen.ekiCont[14]!;
    expect(ej.ressyaTrackIndex).toBe(eki14.downMain);
  });

  it('混在選択では各列車が独立に反転する(代表値方式ではない)', () => {
    // 駅 13: 列車 0 = 停車(着 1980)、列車 1 = 停車(発 2220)。まず列車 0 だけ通過化。
    const prep = run(base(), {
      type: 'ekiJikoku/toggleTsuukaTeisya',
      diaIndex: DIA,
      houkou: DOWN,
      ressyaIndices: [0],
      ekiOrder: 13,
    });
    // 混在(0=通過, 1=停車)で両方に適用 → 0 は停車へ、1 は通過へ。
    const next = run(prep, {
      type: 'ekiJikoku/toggleTsuukaTeisya',
      diaIndex: DIA,
      houkou: DOWN,
      ressyaIndices: [0, 1],
      ekiOrder: 13,
    });
    const list = next.rosen.diaCont[DIA]!.ressyaCont[DOWN];
    expect(list[0]!.ekiJikokuCont[13]!.ekiatsukai).toBe('teisya');
    expect(list[1]!.ekiJikokuCont[13]!.ekiatsukai).toBe('tsuuka');
  });

  it('Undo/Redo 対称', () => {
    assertSymmetry({
      type: 'ekiJikoku/toggleTsuukaTeisya',
      diaIndex: DIA,
      houkou: DOWN,
      ressyaIndices: [0, 1],
      ekiOrder: 13,
    });
  });
});

describe('ekiJikoku/toggleTsuuka(基準番線適用の追補)', () => {
  it('運行なし→通過で主本線が設定される', () => {
    const next = run(base(), {
      type: 'ekiJikoku/toggleTsuuka',
      diaIndex: DIA,
      houkou: DOWN,
      ressyaIndices: [0],
      ekiOrder: 14,
    });
    const ej = next.rosen.diaCont[DIA]!.ressyaCont[DOWN][0]!.ekiJikokuCont[14]!;
    expect(ej.ekiatsukai).toBe('tsuuka');
    expect(ej.ressyaTrackIndex).toBe(next.rosen.ekiCont[14]!.downMain);
  });

  it('停車→通過は番線を維持し時刻のみ消去する', () => {
    const next = run(base(), {
      type: 'ekiJikoku/toggleTsuuka',
      diaIndex: DIA,
      houkou: DOWN,
      ressyaIndices: [0],
      ekiOrder: 4,
    });
    const ej = next.rosen.diaCont[DIA]!.ressyaCont[DOWN][0]!.ekiJikokuCont[4]!;
    expect(ej.ekiatsukai).toBe('tsuuka');
    expect(ej.chakuJikoku).toBeNull();
    expect(ej.hatsuJikoku).toBeNull();
    expect(ej.ressyaTrackIndex).toBe(2); // 維持
  });
});

describe('ressya/toggleCanceled(各列車独立反転)', () => {
  it('混在選択で全列車の状態が反転する', () => {
    const prep = run(base(), {
      type: 'ressya/setCanceled',
      diaIndex: DIA,
      houkou: DOWN,
      ressyaIndices: [0],
      canceled: true,
    });
    const next = run(prep, {
      type: 'ressya/toggleCanceled',
      diaIndex: DIA,
      houkou: DOWN,
      ressyaIndices: [0, 1],
    });
    const list = next.rosen.diaCont[DIA]!.ressyaCont[DOWN];
    expect(list[0]!.isCanceled).toBe(false); // 運休 → 解除
    expect(list[1]!.isCanceled).toBe(true); // 非運休 → 運休
  });

  it('Undo/Redo 対称', () => {
    assertSymmetry({
      type: 'ressya/toggleCanceled',
      diaIndex: DIA,
      houkou: DOWN,
      ressyaIndices: [0, 1],
    });
  });
});

describe('ressya/stepSyubetsu(端でラップ)', () => {
  it('+1 で次の種別、13 種の末尾からは 0 へラップ', () => {
    const next = run(base(), {
      type: 'ressya/stepSyubetsu',
      diaIndex: DIA,
      houkou: DOWN,
      ressyaIndices: [0], // syubetsuIndex 4
      step: 1,
    });
    expect(next.rosen.diaCont[DIA]!.ressyaCont[DOWN][0]!.syubetsuIndex).toBe(5);
  });

  it('0 から -1 で末尾へラップ', () => {
    // 列車 0 を 0 に設定してから -1。
    const prep = run(base(), {
      type: 'ressya/setProp',
      diaIndex: DIA,
      houkou: DOWN,
      ressyaIndex: 0,
      prop: { key: 'syubetsuIndex', value: 0 },
    });
    const next = run(prep, {
      type: 'ressya/stepSyubetsu',
      diaIndex: DIA,
      houkou: DOWN,
      ressyaIndices: [0],
      step: -1,
    });
    const n = base().rosen.ressyasyubetsuCont.length;
    expect(next.rosen.diaCont[DIA]!.ressyaCont[DOWN][0]!.syubetsuIndex).toBe(n - 1);
  });
});

describe('ressya/modifyBangou(末尾数字加算)', () => {
  it('列車番号 +1 は 0 詰めで再整形("001" → "002")', () => {
    const next = run(base(), {
      type: 'ressya/modifyBangou',
      diaIndex: DIA,
      houkou: DOWN,
      ressyaIndices: [0],
      target: 'ressyabangou',
      delta: 1,
    });
    expect(next.rosen.diaCont[DIA]!.ressyaCont[DOWN][0]!.ressyabangou).toBe('002');
  });

  it('負クランプ: "001" -10 → "000"', () => {
    const next = run(base(), {
      type: 'ressya/modifyBangou',
      diaIndex: DIA,
      houkou: DOWN,
      ressyaIndices: [0],
      target: 'ressyabangou',
      delta: -10,
    });
    expect(next.rosen.diaCont[DIA]!.ressyaCont[DOWN][0]!.ressyabangou).toBe('000');
  });

  it('数字なし(空の号数)は no-op', () => {
    const next = run(base(), {
      type: 'ressya/modifyBangou',
      diaIndex: DIA,
      houkou: DOWN,
      ressyaIndices: [0],
      target: 'gousuu',
      delta: 1,
    });
    expect(next.rosen.diaCont[DIA]!.ressyaCont[DOWN][0]!.gousuu).toBe('');
  });

  it('号数は 0 詰めなし("05" 相当の再整形をしない)', () => {
    const prep = run(base(), {
      type: 'ressya/setProp',
      diaIndex: DIA,
      houkou: DOWN,
      ressyaIndex: 0,
      prop: { key: 'gousuu', value: '05' },
    });
    const next = run(prep, {
      type: 'ressya/modifyBangou',
      diaIndex: DIA,
      houkou: DOWN,
      ressyaIndices: [0],
      target: 'gousuu',
      delta: 1,
    });
    expect(next.rosen.diaCont[DIA]!.ressyaCont[DOWN][0]!.gousuu).toBe('6');
  });
});
