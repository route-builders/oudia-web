// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 oudia-second-web contributors

// 非正規形フィクスチャの読込スモーク。バイト一致 T1 の本体は golden-corpus.test.ts に
// 集約済み(ノード/モデル両レベル + 冪等性 + コーパス 10 本以上)。ここでは T1 対象外の
// 「閉じ忘れディレクトリ」パースが完走することのみ確認する。

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parseNodeTree } from './index.js';

const here = dirname(fileURLToPath(import.meta.url));
const fixtures = join(here, '..', 'fixtures');

describe('非正規形フィクスチャの読込スモーク(T1 対象外)', () => {
  it('unclosed-dir.oud2 はエラーなく読める(閉じ忘れディレクトリ受理)', () => {
    const path = join(fixtures, 'synthetic', 'unclosed-dir.oud2');
    if (!existsSync(path)) return;
    const r = parseNodeTree(new Uint8Array(readFileSync(path)));
    expect(r.ok).toBe(true);
  });
});
