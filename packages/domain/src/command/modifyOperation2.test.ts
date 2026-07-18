// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 oudia-second-web contributors

// 駅時刻変更(原典 CentDedRessya_EkijikokuModifyOperation2::execute 86-183)の検証。

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parseNodeTree, readRosenFile, writeOud2 } from '@oudia/format';
import type { RosenFileData } from '@oudia/format';
import { createDocumentState, executeCommand, undo } from './engine.js';
import type {
  EditCommand,
  EkiJikokuModifyOperation2Command,
  EkijikokuModifyOperation2,
} from './types.js';
import { isNullModifyOperation2 } from './types.js';

const here = dirname(fileURLToPath(import.meta.url));
const fixtures = join(here, '..', '..', '..', 'format', 'fixtures');
const ORIGINAL = new Uint8Array(readFileSync(join(fixtures, 'current', 'sample2.oud2')));
function base(): RosenFileData {
  const parsed = parseNodeTree(ORIGINAL);
  if (!parsed.ok) throw new Error('parse');
  return readRosenFile(parsed.root).data;
}
function run(data: RosenFileData, cmd: EditCommand): RosenFileData {
  return executeCommand(createDocumentState(data), cmd).rosenFileData;
}

const NOP: EkijikokuModifyOperation2 = {
  setEkiatsukai: false,
  ekiatsukai: 'teisya',
  operation: 'nop',
  seconds: 0,
  copySrc: null,
};

// sample2 下り列車 0: 駅4 着720 発780 / 駅6 発1020 / 駅8 着1320 発1360。
const baseCmd: Omit<EkiJikokuModifyOperation2Command, 'op'> = {
  type: 'ekiJikoku/modifyOperation2',
  diaIndex: 0,
  houkou: 0,
  ressyaIndices: [0],
  ekiOrder: 4,
  item: 'hatsu',
};

describe('ekiJikoku/modifyOperation2', () => {
  it('繰下げ(modify)はフォーカスの時刻 Order 自身を含む以後へ伝播、前へは不変', () => {
    const next = run(base(), {
      ...baseCmd,
      op: { ...NOP, operation: 'modify', seconds: 90 },
    });
    const cont = next.rosen.diaCont[0]!.ressyaCont[0][0]!.ekiJikokuCont;
    expect(cont[4]!.chakuJikoku).toBe(720); // 発基準なので着は不変
    expect(cont[4]!.hatsuJikoku).toBe(780 + 90);
    expect(cont[6]!.hatsuJikoku).toBe(1020 + 90);
    expect(cont[2]!.hatsuJikoku).toBe(310); // 前方不変
  });

  it('他駅からコピー(copy)は片側のみ・伝播なし。+秒加算つき', () => {
    const next = run(base(), {
      ...baseCmd,
      op: { ...NOP, operation: 'copy', seconds: 120, copySrc: { ekiOrder: 6, item: 'hatsu' } },
    });
    const cont = next.rosen.diaCont[0]!.ressyaCont[0][0]!.ekiJikokuCont;
    expect(cont[4]!.hatsuJikoku).toBe(1020 + 120); // 駅 6 発 + 120
    expect(cont[4]!.chakuJikoku).toBe(720); // 片側のみ
    expect(cont[6]!.hatsuJikoku).toBe(1020); // 伝播なし
  });

  it('コピー元が null なら null がそのまま入る(±秒は no-op。実質設定なし化)', () => {
    const next = run(base(), {
      ...baseCmd,
      op: { ...NOP, operation: 'copy', seconds: 60, copySrc: { ekiOrder: 3, item: 'chaku' } },
    });
    expect(next.rosen.diaCont[0]!.ressyaCont[0][0]!.ekiJikokuCont[4]!.hatsuJikoku).toBeNull();
  });

  it('運行なし駅への非 null コピーは停車へ自動昇格する', () => {
    const next = run(base(), {
      ...baseCmd,
      ekiOrder: 14, // 運行なし
      op: { ...NOP, operation: 'copy', seconds: 0, copySrc: { ekiOrder: 4, item: 'hatsu' } },
    });
    const ej = next.rosen.diaCont[0]!.ressyaCont[0][0]!.ekiJikokuCont[14]!;
    expect(ej.ekiatsukai).toBe('teisya');
    expect(ej.hatsuJikoku).toBe(780);
  });

  it('設定なし化(toNull)は片側のみ null・駅扱は変えない(両 null でも None 化しない)', () => {
    const next = run(base(), {
      ...baseCmd,
      ekiOrder: 6, // 発のみの駅
      op: { ...NOP, operation: 'toNull' },
    });
    const ej = next.rosen.diaCont[0]!.ressyaCont[0][0]!.ekiJikokuCont[6]!;
    expect(ej.hatsuJikoku).toBeNull();
    expect(ej.ekiatsukai).toBe('teisya'); // 時刻消去コマンドと違い None 化しない
  });

  it('駅扱変更 + 繰下げの同時指定は 駅扱 → 時刻 の順に適用される', () => {
    const next = run(base(), {
      ...baseCmd,
      op: { ...NOP, setEkiatsukai: true, ekiatsukai: 'tsuuka', operation: 'modify', seconds: 60 },
    });
    const ej = next.rosen.diaCont[0]!.ressyaCont[0][0]!.ekiJikokuCont[4]!;
    expect(ej.ekiatsukai).toBe('tsuuka'); // 時刻保持の通過化(setEkiatsukai 準拠)
    expect(ej.hatsuJikoku).toBe(780 + 60); // その後シフト
  });

  it('駅扱=運行なしは全消去(時刻・番線)', () => {
    const next = run(base(), {
      ...baseCmd,
      op: { ...NOP, setEkiatsukai: true, ekiatsukai: 'none' },
    });
    const ej = next.rosen.diaCont[0]!.ressyaCont[0][0]!.ekiJikokuCont[4]!;
    expect(ej.ekiatsukai).toBe('none');
    expect(ej.chakuJikoku).toBeNull();
    expect(ej.ressyaTrackIndex).toBeNull();
  });

  it('複数列車へ 1 コマンドで適用され、Undo 1 回で全列車が戻る(byte 一致)', () => {
    const s0 = createDocumentState(base());
    const s1 = executeCommand(s0, {
      ...baseCmd,
      ressyaIndices: [0, 2],
      op: { ...NOP, operation: 'modify', seconds: -60 },
    });
    const list = s1.rosenFileData.rosen.diaCont[0]!.ressyaCont[0];
    expect(list[0]!.ekiJikokuCont[4]!.hatsuJikoku).toBe(780 - 60);
    expect(list[2]!.ekiJikokuCont[4]!.hatsuJikoku).toBe(4380 - 60);
    const s2 = undo(s1);
    expect(Buffer.from(writeOud2(s2.rosenFileData)).equals(Buffer.from(ORIGINAL))).toBe(true);
  });

  it('isNullModifyOperation2: 未実行/変更しないの判定', () => {
    expect(isNullModifyOperation2(NOP)).toBe(true);
    expect(isNullModifyOperation2({ ...NOP, operation: 'toNull' })).toBe(false);
    expect(isNullModifyOperation2({ ...NOP, setEkiatsukai: true })).toBe(false);
  });
});
