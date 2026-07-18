// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 up-tri

// テスト用のフィクスチャ読込ヘルパ(実 OuDiaSecond ファイルを RosenFileData へ)。

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { RosenFileData } from '@oudia-web/format';
import { parseNodeTree, readRosenFile } from '@oudia-web/format';

const here = dirname(fileURLToPath(import.meta.url));
// derive/src/csv → リポジトリの packages/format/fixtures を参照。
const fixtures = join(here, '..', '..', '..', 'format', 'fixtures');

export function loadFixture(rel: string): RosenFileData {
  const bytes = new Uint8Array(readFileSync(join(fixtures, rel)));
  const parsed = parseNodeTree(bytes);
  if (!parsed.ok) throw new Error(`parse failed: ${rel}`);
  return readRosenFile(parsed.root).data;
}
