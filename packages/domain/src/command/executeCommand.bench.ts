// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 up-tri

// コマンド実行のベンチ(architecture §8.1 / M3 完了条件 #4「編集反映 16ms」の domain 部分)。
// executeCommand は Immer produceWithPatches(構造共有 + patch 記録)がホット。
// 大規模ファイル(sample.oud2 約 1.1MB)を土台に、代表的な編集コマンドの所要を測る。

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseNodeTree, readRosenFile } from '@oudia-web/format';
import { bench, describe } from 'vitest';
import { createNullRessya } from '../ressya.js';
import { createDocumentState, executeCommand } from './engine.js';

const here = dirname(fileURLToPath(import.meta.url));
const bytes = new Uint8Array(
  readFileSync(join(here, '..', '..', '..', 'format', 'fixtures', 'current', 'sample.oud2')),
);
const parsed = parseNodeTree(bytes);
if (!parsed.ok) throw new Error('parse');
const doc = readRosenFile(parsed.root).data;
const s0 = createDocumentState(doc);
const ekiCount = doc.rosen.ekiCont.length;

describe('executeCommand(大規模ファイル)', () => {
  bench('ressya/setProp(1 列車のプロパティ)', () => {
    executeCommand(s0, {
      type: 'ressya/setProp',
      diaIndex: 0,
      houkou: 0,
      ressyaIndex: 0,
      prop: { key: 'bikou', value: 'x' },
    });
  });

  bench('ekiJikoku/setHatsu(1 セル + patch)', () => {
    executeCommand(s0, {
      type: 'ekiJikoku/setHatsu',
      diaIndex: 0,
      houkou: 0,
      ressyaIndex: 0,
      ekiOrder: 1,
      input: '700',
    });
  });

  bench('ressya/replaceRange(空列車挿入 + deep copy)', () => {
    executeCommand(s0, {
      type: 'ressya/replaceRange',
      diaIndex: 0,
      houkou: 0,
      index: 0,
      count: 0,
      trains: [createNullRessya(ekiCount, 0)],
    });
  });
});
