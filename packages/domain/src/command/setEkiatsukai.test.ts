// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 oudia-second-web contributors

// ekiJikoku/setEkiatsukai(駅扱の直接設定。駅時刻ダイアログの駅扱ラジオ)のレデューサ検証。

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parseNodeTree, readRosenFile, writeOud2 } from '@oudia/format';
import type { RosenFileData } from '@oudia/format';
import { createDocumentState, executeCommand, undo, redo } from './engine.js';
import type { EditCommand } from './types.js';
import { getEkiJikoku } from '../runRange.js';

const here = dirname(fileURLToPath(import.meta.url));
const fixtures = join(here, '..', '..', '..', 'format', 'fixtures');
function base(): RosenFileData {
  const bytes = new Uint8Array(readFileSync(join(fixtures, 'current', 'sample2.oud2')));
  const parsed = parseNodeTree(bytes);
  if (!parsed.ok) throw new Error('parse');
  return readRosenFile(parsed.root).data;
}

/** 停車(時刻あり)の駅Order を探す。 */
function findTeisyaWithJikoku(data: RosenFileData): number {
  const train = data.rosen.diaCont[0]!.ressyaCont[0][0]!;
  for (let o = 0; o < train.ekiJikokuCont.length; o++) {
    const ej = getEkiJikoku(train, o);
    if (ej.ekiatsukai === 'teisya' && (ej.chakuJikoku !== null || ej.hatsuJikoku !== null)) {
      return o;
    }
  }
  throw new Error('停車(時刻あり)の駅が見つからない');
}

function setAtsukai(ekiOrder: number, ekiatsukai: 'teisya' | 'tsuuka' | 'none'): EditCommand {
  return {
    type: 'ekiJikoku/setEkiatsukai',
    diaIndex: 0,
    houkou: 0,
    ressyaIndices: [0],
    ekiOrder,
    ekiatsukai,
  };
}

describe('ekiJikoku/setEkiatsukai(原典 CentDedEkiJikoku::setEkiatsukai 準拠)', () => {
  it('停車 → 通過: 時刻は保持される(消去は toggleTsuuka の責務)', () => {
    const data = base();
    const order = findTeisyaWithJikoku(data);
    const before = getEkiJikoku(data.rosen.diaCont[0]!.ressyaCont[0][0]!, order);
    const s1 = executeCommand(createDocumentState(data), setAtsukai(order, 'tsuuka'));
    const ej = getEkiJikoku(s1.rosenFileData.rosen.diaCont[0]!.ressyaCont[0][0]!, order);
    expect(ej.ekiatsukai).toBe('tsuuka');
    expect(ej.chakuJikoku).toEqual(before.chakuJikoku); // 通過時刻として保持
    expect(ej.hatsuJikoku).toEqual(before.hatsuJikoku);
  });

  it('→ 運行なし: 全消去(時刻・番線 null)', () => {
    const data = base();
    const order = findTeisyaWithJikoku(data);
    const s1 = executeCommand(createDocumentState(data), setAtsukai(order, 'none'));
    const ej = getEkiJikoku(s1.rosenFileData.rosen.diaCont[0]!.ressyaCont[0][0]!, order);
    expect(ej.ekiatsukai).toBe('none');
    expect(ej.chakuJikoku).toBeNull();
    expect(ej.hatsuJikoku).toBeNull();
    expect(ej.ressyaTrackIndex).toBeNull();
  });

  it('通過 → 停車: 時刻は保持される(通過時刻 → 停車時刻)', () => {
    const data = base();
    const order = findTeisyaWithJikoku(data);
    const before = getEkiJikoku(data.rosen.diaCont[0]!.ressyaCont[0][0]!, order);
    // 停車 → 通過 → 停車。時刻は一貫して保持される。
    let s = executeCommand(createDocumentState(data), setAtsukai(order, 'tsuuka'));
    s = executeCommand(s, setAtsukai(order, 'teisya'));
    const ej = getEkiJikoku(s.rosenFileData.rosen.diaCont[0]!.ressyaCont[0][0]!, order);
    expect(ej.ekiatsukai).toBe('teisya');
    expect(ej.chakuJikoku).toEqual(before.chakuJikoku);
    expect(ej.hatsuJikoku).toEqual(before.hatsuJikoku);
  });

  it('Undo/Redo 対称', () => {
    const data = base();
    const order = findTeisyaWithJikoku(data);
    const s0 = createDocumentState(data);
    const s1 = executeCommand(s0, setAtsukai(order, 'none'));
    const s2 = undo(s1);
    expect(s2.rosenFileData).toEqual(s0.rosenFileData);
    const s3 = redo(s2);
    expect(s3.rosenFileData).toEqual(s1.rosenFileData);
  });

  it('編集(none 化)→ Undo → writeOud2 で元とバイト一致(実変更を保証した非自明検証)', () => {
    const original = new Uint8Array(readFileSync(join(fixtures, 'current', 'sample2.oud2')));
    const parsed = parseNodeTree(original);
    if (!parsed.ok) throw new Error('parse');
    const data = readRosenFile(parsed.root).data;
    const order = findTeisyaWithJikoku(data); // 停車(時刻あり)→ none 化は必ず実変更になる
    const s0 = createDocumentState(data);
    const s1 = executeCommand(s0, setAtsukai(order, 'none'));
    // 空検証でないこと(状態が実際に変わっている)。
    expect(s1.rosenFileData).not.toEqual(s0.rosenFileData);
    const out = writeOud2(undo(s1).rosenFileData);
    expect(Buffer.from(out).equals(Buffer.from(original))).toBe(true);
  });

  it('ressyaIndices 複数の列車へ一括適用される', () => {
    const data = base();
    const order = findTeisyaWithJikoku(data);
    const s1 = executeCommand(createDocumentState(data), {
      type: 'ekiJikoku/setEkiatsukai',
      diaIndex: 0,
      houkou: 0,
      ressyaIndices: [0, 1],
      ekiOrder: order,
      ekiatsukai: 'none',
    });
    const list = s1.rosenFileData.rosen.diaCont[0]!.ressyaCont[0];
    expect(getEkiJikoku(list[0]!, order).ekiatsukai).toBe('none');
    expect(getEkiJikoku(list[1]!, order).ekiatsukai).toBe('none');
  });
});
