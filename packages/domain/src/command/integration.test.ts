// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 oudia-second-web contributors

// 統合検証: 実ファイルを読み → comment/set 編集 → writeOud2 →
// 再読込したコメントが編集後の値になる(コマンド基盤 × format ライターの結合)。
// また無編集での read→write バイト一致(黄金 T1)がコマンド基盤導入後も不変であることを確認。

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parseNodeTree, readRosenFile, writeOud2 } from '@oudia/format';
import { createDocumentState, executeCommand, markSaved, undo } from './index.js';

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
