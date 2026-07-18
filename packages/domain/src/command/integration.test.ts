// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 up-tri

// 統合検証: 実ファイルを読み → comment/set 編集 → writeOud2 →
// 再読込したコメントが編集後の値になる(コマンド基盤 × format ライターの結合)。
// また無編集での read→write バイト一致(黄金 T1)がコマンド基盤導入後も不変であることを確認。

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseNodeTree, readRosenFile, writeOud2 } from '@oudia-web/format';
import { describe, expect, it } from 'vitest';
import { createDocumentState, executeCommand, markSaved, undo } from './index.js';
import type { EditCommand } from './types.js';

const here = dirname(fileURLToPath(import.meta.url));
// domain/src/command → リポジトリの packages/format/fixtures を参照。
const fixtures = join(here, '..', '..', '..', 'format', 'fixtures');

function readDoc(rel: string): ReturnType<typeof readRosenFile>['data'] {
  const bytes = new Uint8Array(readFileSync(join(fixtures, rel)));
  const parsed = parseNodeTree(bytes);
  if (!parsed.ok) throw new Error('parse failed');
  return readRosenFile(parsed.root).data;
}

describe('コマンド基盤 × format ライターの結合', () => {
  it('comment/set → writeOud2 → 再読込でコメントが編集後の値になる', () => {
    const doc = readDoc('current/sample2.oud2');
    const s0 = createDocumentState(doc);
    const s1 = executeCommand(s0, {
      type: 'comment/set',
      comment: '編集後コメント\r\n2 行目',
    });

    const bytes = writeOud2(s1.rosenFileData);
    const parsed = parseNodeTree(bytes);
    if (!parsed.ok) throw new Error('re-parse failed');
    const reread = readRosenFile(parsed.root).data;
    // 改行は LF 正規化されている。
    expect(reread.rosen.comment).toBe('編集後コメント\n2 行目');
  });

  it('無編集で read → write するとバイト一致(T1 がコマンド基盤で不変)', () => {
    const original = new Uint8Array(readFileSync(join(fixtures, 'current', 'sample2.oud2')));
    const parsed = parseNodeTree(original);
    if (!parsed.ok) throw new Error('parse failed');
    const doc = readRosenFile(parsed.root).data;
    // コマンドを通さず(無編集)そのまま書き戻す。
    const out = writeOud2(doc);
    expect(Buffer.from(out).equals(Buffer.from(original))).toBe(true);
  });

  it('編集 → Undo でコメントが元に戻り、書き出しも元ファイルとバイト一致する', () => {
    const original = new Uint8Array(readFileSync(join(fixtures, 'current', 'sample2.oud2')));
    const parsed = parseNodeTree(original);
    if (!parsed.ok) throw new Error('parse failed');
    const doc = readRosenFile(parsed.root).data;

    const s0 = createDocumentState(doc);
    const s1 = executeCommand(s0, { type: 'comment/set', comment: '一時的な変更' });
    const s2 = undo(s1);
    expect(s2.changeCount).toBe(0);

    const out = writeOud2(s2.rosenFileData);
    expect(Buffer.from(out).equals(Buffer.from(original))).toBe(true);
  });

  it('編集 → 保存(markSaved)で変更カウンタが 0 になる', () => {
    const doc = readDoc('current/sample2.oud2');
    const s1 = executeCommand(createDocumentState(doc), {
      type: 'comment/set',
      comment: 'x',
    });
    expect(s1.changeCount).toBe(1);
    expect(markSaved(s1).changeCount).toBe(0);
  });
});

// M3 編集コマンドのバイト一致検証(完了条件 #2 の土台)。
// 決定論的なコマンド(none→run で基準番線探索を要しないもの)について、
// 編集 → Undo → writeOud2 が元ファイルとバイト一致することを検証する。
describe('M3 編集 → Undo でバイト一致(黄金 T1 discipline)', () => {
  const ORIGINAL = new Uint8Array(readFileSync(join(fixtures, 'current', 'sample2.oud2')));

  function editUndoBytes(cmd: EditCommand): Uint8Array {
    const parsed = parseNodeTree(ORIGINAL);
    if (!parsed.ok) throw new Error('parse');
    const s0 = createDocumentState(readRosenFile(parsed.root).data);
    const s2 = undo(executeCommand(s0, cmd));
    return writeOud2(s2.rosenFileData);
  }

  const CASES: { name: string; cmd: EditCommand }[] = [
    {
      name: 'ressya/setProp(列車番号)',
      cmd: {
        type: 'ressya/setProp',
        diaIndex: 0,
        houkou: 0,
        ressyaIndex: 0,
        prop: { key: 'ressyabangou', value: 'ZZZ' },
      },
    },
    {
      name: 'ressya/setCanceled',
      cmd: {
        type: 'ressya/setCanceled',
        diaIndex: 0,
        houkou: 0,
        ressyaIndices: [0],
        canceled: true,
      },
    },
    {
      name: 'ressya/swap',
      cmd: { type: 'ressya/swap', diaIndex: 0, houkou: 0, indexA: 0, sizeA: 1, indexB: 1 },
    },
    {
      name: 'ressya/setSihatsuEki',
      cmd: {
        type: 'ressya/setSihatsuEki',
        diaIndex: 0,
        houkou: 0,
        ressyaIndices: [0],
        ekiOrder: 2,
      },
    },
    {
      name: 'ekiJikoku/clear(着)',
      cmd: {
        type: 'ekiJikoku/clear',
        diaIndex: 0,
        houkou: 0,
        ressyaIndices: [0],
        ekiOrder: 5,
        target: 'chaku',
      },
    },
    {
      name: 'ekiJikoku/setEkiatsukai(通過)',
      cmd: {
        type: 'ekiJikoku/setEkiatsukai',
        diaIndex: 0,
        houkou: 0,
        ressyaIndices: [0],
        ekiOrder: 2,
        ekiatsukai: 'tsuuka',
      },
    },
    // ---- M4 ----
    {
      name: 'ekiJikoku/shiftJikoku(-1分し次へ相当)',
      cmd: {
        type: 'ekiJikoku/shiftJikoku',
        diaIndex: 0,
        houkou: 0,
        ressyaIndices: [0],
        ekiOrder: 4,
        item: 'hatsu',
        deltaSeconds: -60,
      },
    },
    {
      name: 'ekiJikoku/shiftJikoku(Rev)',
      cmd: {
        type: 'ekiJikoku/shiftJikoku',
        diaIndex: 0,
        houkou: 0,
        ressyaIndices: [0],
        ekiOrder: 4,
        item: 'hatsu',
        deltaSeconds: 60,
        rev: true,
      },
    },
    {
      name: 'ekiJikoku/writeJikoku(繰上げ繰下げ ON)',
      cmd: {
        type: 'ekiJikoku/writeJikoku',
        diaIndex: 0,
        houkou: 0,
        ressyaIndex: 0,
        ekiOrder: 4,
        chakuInput: '012',
        hatsuInput: '015',
        modify: true,
      },
    },
    {
      name: 'ekiJikoku/toggleTsuukaTeisya',
      cmd: {
        type: 'ekiJikoku/toggleTsuukaTeisya',
        diaIndex: 0,
        houkou: 0,
        ressyaIndices: [0],
        ekiOrder: 4,
      },
    },
    {
      name: 'ekiJikoku/toggleTsuuka(運行なし→通過の基準番線)',
      cmd: {
        type: 'ekiJikoku/toggleTsuuka',
        diaIndex: 0,
        houkou: 0,
        ressyaIndices: [0],
        ekiOrder: 14,
      },
    },
    {
      name: 'ressya/toggleCanceled',
      cmd: {
        type: 'ressya/toggleCanceled',
        diaIndex: 0,
        houkou: 0,
        ressyaIndices: [0, 1],
      },
    },
    {
      name: 'ressya/stepSyubetsu',
      cmd: {
        type: 'ressya/stepSyubetsu',
        diaIndex: 0,
        houkou: 0,
        ressyaIndices: [0],
        step: 1,
      },
    },
    {
      name: 'ressya/modifyBangou',
      cmd: {
        type: 'ressya/modifyBangou',
        diaIndex: 0,
        houkou: 0,
        ressyaIndices: [0],
        target: 'ressyabangou',
        delta: 1,
      },
    },
    {
      name: 'ekiJikoku/renzokuInput(運行なし駅の停車化 + 基準番線)',
      cmd: {
        type: 'ekiJikoku/renzokuInput',
        diaIndex: 0,
        houkou: 0,
        ressyaIndex: 0,
        ekiOrder: 14,
        item: 'hatsu',
        minutes: 45,
      },
    },
    {
      name: 'ekiJikoku/clear(teisyaFirst)',
      cmd: {
        type: 'ekiJikoku/clear',
        diaIndex: 0,
        houkou: 0,
        ressyaIndices: [0],
        ekiOrder: 4,
        target: 'chaku',
        teisyaFirst: true,
      },
    },
    {
      name: 'ressya/reorder(並べ替え)',
      cmd: {
        type: 'ressya/reorder',
        diaIndex: 0,
        houkou: 0,
        targetIndices: [0, 1, 2, 3],
        order: [3, 1, 0, 2],
      },
    },
  ];

  for (const c of CASES) {
    it(`${c.name} → Undo でバイト一致`, () => {
      const out = editUndoBytes(c.cmd);
      expect(Buffer.from(out).equals(Buffer.from(ORIGINAL))).toBe(true);
    });
  }

  it('ressya/setProp → writeOud2 → 再読込で編集が反映される', () => {
    const parsed = parseNodeTree(ORIGINAL);
    if (!parsed.ok) throw new Error('parse');
    const s1 = executeCommand(createDocumentState(readRosenFile(parsed.root).data), {
      type: 'ressya/setProp',
      diaIndex: 0,
      houkou: 0,
      ressyaIndex: 0,
      prop: { key: 'bikou', value: 'M3備考' },
    });
    const reparsed = parseNodeTree(writeOud2(s1.rosenFileData));
    if (!reparsed.ok) throw new Error('re-parse');
    const reread = readRosenFile(reparsed.root).data;
    expect(reread.rosen.diaCont[0]!.ressyaCont[0][0]!.bikou).toBe('M3備考');
  });
});
