// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 up-tri

// 性能ベンチ: 大規模ファイル(sample.oud2, 約1.1MB)の decode/parse/serialize 所要時間。
// 予算: decode+parse < 250ms(タスク 0001)、書出含む往復 < 600ms(file-io §10)。
// CI で記録・前回比監視する(testing-guidelines §5-6)。

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bench, describe } from 'vitest';
import {
    decodeOudText,
    parsePropertiesText,
    roundtripOud2,
    serializePropertiesText,
} from './index.js';

const here = dirname(fileURLToPath(import.meta.url));
const sample = new Uint8Array(readFileSync(join(here, '..', 'fixtures', 'current', 'sample.oud2')));

describe('sample.oud2 (約1.1MB)', () => {
  bench('decodeOudText', () => {
    decodeOudText(sample);
  });

  bench('decode + parse', () => {
    const d = decodeOudText(sample);
    if (d.ok) parsePropertiesText(d.text);
  });

  bench('往復(decode+parse+serialize+encode)', () => {
    roundtripOud2(sample);
  });

  bench('serialize のみ', () => {
    const d = decodeOudText(sample);
    if (!d.ok) return;
    const p = parsePropertiesText(d.text);
    if (p.ok) serializePropertiesText(p.root);
  });
});
