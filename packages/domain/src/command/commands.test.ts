// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 up-tri

// M3 編集コマンドのレデューサ + patch Undo/Redo 対称性(実 fixture sample2 で検証)。

import type { RosenFileData } from '@oudia-web/format';
import { parseNodeTree, readRosenFile } from '@oudia-web/format';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createNullRessya } from '../ressya.js';
import { getEkiJikoku, getSihatsuEki, getSyuuchakuEki } from '../runRange.js';
import { createDocumentState, executeCommand, redo, undo } from './engine.js';
import type { EditCommand } from './types.js';

const here = dirname(fileURLToPath(import.meta.url));
const fixtures = join(here, '..', '..', '..', 'format', 'fixtures');
function loadDoc(rel: string): RosenFileData {
  const bytes = new Uint8Array(readFileSync(join(fixtures, rel)));
  const parsed = parseNodeTree(bytes);
  if (!parsed.ok) throw new Error('parse');
  return readRosenFile(parsed.root).data;
}
const base = (): RosenFileData => loadDoc('current/sample2.oud2');

/** 1 コマンドの Undo/Redo 対称性を検証する(executeCommand → undo === 元、redo === 実行後)。 */
function assertSymmetry(cmd: EditCommand): void {
  const s0 = createDocumentState(base());
  const s1 = executeCommand(s0, cmd);
  const s2 = undo(s1);
  expect(s2.rosenFileData).toEqual(s0.rosenFileData);
  const s3 = redo(s2);
  expect(s3.rosenFileData).toEqual(s1.rosenFileData);
}

describe('ressya/replaceRange', () => {
  it('末尾に空列車を挿入(NewItem 相当)して列車数が +1', () => {
    const data = base();
    const ekiCount = data.rosen.ekiCont.length;
    const before = data.rosen.diaCont[0]!.ressyaCont[0].length;
    const s1 = executeCommand(createDocumentState(data), {
      type: 'ressya/replaceRange',
      diaIndex: 0,
      houkou: 0,
      index: before,
      count: 0,
      trains: [createNullRessya(ekiCount, 0)],
    });
    expect(s1.rosenFileData.rosen.diaCont[0]!.ressyaCont[0].length).toBe(before + 1);
  });

  it('先頭列車を削除(count 1・trains 空)して列車数が −1', () => {
    const data = base();
    const before = data.rosen.diaCont[0]!.ressyaCont[0].length;
    const s1 = executeCommand(createDocumentState(data), {
      type: 'ressya/replaceRange',
      diaIndex: 0,
      houkou: 0,
      index: 0,
      count: 1,
      trains: [],
    });
    expect(s1.rosenFileData.rosen.diaCont[0]!.ressyaCont[0].length).toBe(before - 1);
  });

  it('Undo/Redo 対称(挿入)', () => {
    const ekiCount = base().rosen.ekiCont.length;
    assertSymmetry({
      type: 'ressya/replaceRange',
      diaIndex: 0,
      houkou: 0,
      index: 0,
      count: 0,
      trains: [createNullRessya(ekiCount, 0)],
    });
  });
});

describe('ressya/swap', () => {
  it('隣接 2 列車を入れ替える', () => {
    const data = base();
    const list = data.rosen.diaCont[0]!.ressyaCont[0];
    const b0 = list[0]!.ressyabangou;
    const b1 = list[1]!.ressyabangou;
    const s1 = executeCommand(createDocumentState(data), {
      type: 'ressya/swap',
      diaIndex: 0,
      houkou: 0,
      indexA: 0,
      sizeA: 1,
      indexB: 1,
    });
    const after = s1.rosenFileData.rosen.diaCont[0]!.ressyaCont[0];
    expect(after[0]!.ressyabangou).toBe(b1);
    expect(after[1]!.ressyabangou).toBe(b0);
  });

  it('B が A ブロック内は例外', () => {
    expect(() =>
      executeCommand(createDocumentState(base()), {
        type: 'ressya/swap',
        diaIndex: 0,
        houkou: 0,
        indexA: 0,
        sizeA: 2,
        indexB: 1,
      }),
    ).toThrow();
  });

  it('Undo/Redo 対称', () => {
    assertSymmetry({ type: 'ressya/swap', diaIndex: 0, houkou: 0, indexA: 0, sizeA: 1, indexB: 1 });
  });
});

describe('ressya/setProp', () => {
  it('列車番号を変更', () => {
    const s1 = executeCommand(createDocumentState(base()), {
      type: 'ressya/setProp',
      diaIndex: 0,
      houkou: 0,
      ressyaIndex: 0,
      prop: { key: 'ressyabangou', value: '9999X' },
    });
    expect(s1.rosenFileData.rosen.diaCont[0]!.ressyaCont[0][0]!.ressyabangou).toBe('9999X');
  });

  it('Undo/Redo 対称', () => {
    assertSymmetry({
      type: 'ressya/setProp',
      diaIndex: 0,
      houkou: 0,
      ressyaIndex: 0,
      prop: { key: 'bikou', value: 'テスト備考' },
    });
  });
});

describe('ressya/setCanceled', () => {
  it('運休フラグを立てる', () => {
    const s1 = executeCommand(createDocumentState(base()), {
      type: 'ressya/setCanceled',
      diaIndex: 0,
      houkou: 0,
      ressyaIndices: [0, 1],
      canceled: true,
    });
    const list = s1.rosenFileData.rosen.diaCont[0]!.ressyaCont[0];
    expect(list[0]!.isCanceled).toBe(true);
    expect(list[1]!.isCanceled).toBe(true);
  });

  it('Undo/Redo 対称', () => {
    assertSymmetry({
      type: 'ressya/setCanceled',
      diaIndex: 0,
      houkou: 0,
      ressyaIndices: [0],
      canceled: true,
    });
  });
});

describe('ressya/setSihatsuEki(当駅始発)', () => {
  it('指定駅より前を全 None 化し、発ありなら着消去', () => {
    // 始発が 0 の列車で、始発を駅 2 に設定 → 駅 0,1 が None、駅 2 は着消去(発ありのとき)。
    const data = base();
    const train0 = data.rosen.diaCont[0]!.ressyaCont[0][0]!;
    const targetOrder = 2;
    const s1 = executeCommand(createDocumentState(data), {
      type: 'ressya/setSihatsuEki',
      diaIndex: 0,
      houkou: 0,
      ressyaIndices: [0],
      ekiOrder: targetOrder,
    });
    const r = s1.rosenFileData.rosen.diaCont[0]!.ressyaCont[0][0]!;
    for (let o = 0; o < targetOrder; o++) {
      expect(getEkiJikoku(r, o).ekiatsukai).toBe('none');
    }
    // 発があった駅は着が消える。
    const hadHatsu = getEkiJikoku(train0, targetOrder).hatsuJikoku !== null;
    if (hadHatsu) expect(getEkiJikoku(r, targetOrder).chakuJikoku).toBeNull();
    // 始発駅Order が targetOrder になる(前が全 None なので)。
    expect(getSihatsuEki(r)).toBe(targetOrder);
  });

  it('Undo/Redo 対称', () => {
    assertSymmetry({
      type: 'ressya/setSihatsuEki',
      diaIndex: 0,
      houkou: 0,
      ressyaIndices: [0],
      ekiOrder: 2,
    });
  });
});

describe('ressya/setSyuuchakuEki(当駅止り)', () => {
  it('指定駅より後を全 None 化', () => {
    const data = base();
    const targetOrder = 3;
    const s1 = executeCommand(createDocumentState(data), {
      type: 'ressya/setSyuuchakuEki',
      diaIndex: 0,
      houkou: 0,
      ressyaIndices: [0],
      ekiOrder: targetOrder,
    });
    const r = s1.rosenFileData.rosen.diaCont[0]!.ressyaCont[0][0]!;
    expect(getSyuuchakuEki(r)).toBeLessThanOrEqual(targetOrder);
  });

  it('Undo/Redo 対称', () => {
    assertSymmetry({
      type: 'ressya/setSyuuchakuEki',
      diaIndex: 0,
      houkou: 0,
      ressyaIndices: [0],
      ekiOrder: 3,
    });
  });
});

describe('ekiJikoku/setChaku・setHatsu', () => {
  it('着時刻を設定すると none→teisya へ昇格', () => {
    const data = base();
    // 通過駅を探して着を入れる。
    const train = data.rosen.diaCont[0]!.ressyaCont[0][0]!;
    let order = -1;
    for (let o = 0; o < train.ekiJikokuCont.length; o++) {
      if (getEkiJikoku(train, o).ekiatsukai === 'tsuuka') {
        order = o;
        break;
      }
    }
    if (order === -1) return; // 通過駅がなければスキップ。
    const s1 = executeCommand(createDocumentState(data), {
      type: 'ekiJikoku/setChaku',
      diaIndex: 0,
      houkou: 0,
      ressyaIndex: 0,
      ekiOrder: order,
      input: '600', // 6:00
    });
    const ej = getEkiJikoku(s1.rosenFileData.rosen.diaCont[0]!.ressyaCont[0][0]!, order);
    expect(ej.chakuJikoku).toBe(6 * 3600);
  });

  it('Undo/Redo 対称(発設定)', () => {
    assertSymmetry({
      type: 'ekiJikoku/setHatsu',
      diaIndex: 0,
      houkou: 0,
      ressyaIndex: 0,
      ekiOrder: 1,
      input: '700',
    });
  });
});

describe('ekiJikoku トグル', () => {
  it('通過(破壊的)→ ekiatsukai=tsuuka + 時刻 null', () => {
    const s1 = executeCommand(createDocumentState(base()), {
      type: 'ekiJikoku/toggleTsuuka',
      diaIndex: 0,
      houkou: 0,
      ressyaIndices: [0],
      ekiOrder: 1,
    });
    const ej = getEkiJikoku(s1.rosenFileData.rosen.diaCont[0]!.ressyaCont[0][0]!, 1);
    expect(ej.ekiatsukai).toBe('tsuuka');
    expect(ej.chakuJikoku).toBeNull();
    expect(ej.hatsuJikoku).toBeNull();
  });

  it('経由なし → None + 全消去(番線 null)', () => {
    const s1 = executeCommand(createDocumentState(base()), {
      type: 'ekiJikoku/setKeiyunasi',
      diaIndex: 0,
      houkou: 0,
      ressyaIndices: [0],
      ekiOrder: 1,
    });
    const ej = getEkiJikoku(s1.rosenFileData.rosen.diaCont[0]!.ressyaCont[0][0]!, 1);
    expect(ej.ekiatsukai).toBe('none');
    expect(ej.ressyaTrackIndex).toBeNull();
  });

  it('時刻消去で両時刻 null なら None 化', () => {
    // 停車駅(着発あり)で着発を両方消す。
    const data = base();
    const s1 = executeCommand(createDocumentState(data), {
      type: 'ekiJikoku/clear',
      diaIndex: 0,
      houkou: 0,
      ressyaIndices: [0],
      ekiOrder: 0,
      target: 'chaku',
    });
    const s2 = executeCommand(s1, {
      type: 'ekiJikoku/clear',
      diaIndex: 0,
      houkou: 0,
      ressyaIndices: [0],
      ekiOrder: 0,
      target: 'hatsu',
    });
    const ej = getEkiJikoku(s2.rosenFileData.rosen.diaCont[0]!.ressyaCont[0][0]!, 0);
    expect(ej.chakuJikoku).toBeNull();
    expect(ej.hatsuJikoku).toBeNull();
    expect(ej.ekiatsukai).toBe('none');
  });

  it('Undo/Redo 対称(通過)', () => {
    assertSymmetry({
      type: 'ekiJikoku/toggleTsuuka',
      diaIndex: 0,
      houkou: 0,
      ressyaIndices: [0],
      ekiOrder: 1,
    });
  });
});

describe('100 回 mixed → 100 回 Undo で完全復元', () => {
  it('patch 対称性(混在コマンド列)', () => {
    const s0 = createDocumentState(base());
    let s = s0;
    const ekiCount = s0.rosenFileData.rosen.ekiCont.length;
    for (let i = 0; i < 100; i++) {
      const kind = i % 5;
      const cmd: EditCommand =
        kind === 0
          ? {
              type: 'ressya/setProp',
              diaIndex: 0,
              houkou: 0,
              ressyaIndex: 0,
              prop: { key: 'bikou', value: `b${String(i)}` },
            }
          : kind === 1
            ? {
                type: 'ressya/setCanceled',
                diaIndex: 0,
                houkou: 0,
                ressyaIndices: [0],
                canceled: i % 2 === 0,
              }
            : kind === 2
              ? {
                  type: 'ekiJikoku/toggleTsuuka',
                  diaIndex: 0,
                  houkou: 0,
                  ressyaIndices: [0],
                  ekiOrder: 1,
                }
              : kind === 3
                ? {
                    type: 'ressya/replaceRange',
                    diaIndex: 0,
                    houkou: 0,
                    index: 0,
                    count: 0,
                    trains: [createNullRessya(ekiCount, 0)],
                  }
                : { type: 'comment/set', comment: `コメント${String(i)}` };
      s = executeCommand(s, cmd);
    }
    for (let i = 0; i < 100; i++) s = undo(s);
    expect(s.rosenFileData).toEqual(s0.rosenFileData);
  });
});
