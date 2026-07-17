// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 oudia-second-web contributors

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parseBytes } from './openFile.js';

const here = dirname(fileURLToPath(import.meta.url));
function readFixture(rel: string): Uint8Array {
  return new Uint8Array(
    readFileSync(join(here, '..', '..', '..', '..', 'packages', 'format', 'fixtures', rel)),
  );
}

describe('parseBytes(ファイル読込)', () => {
  it('sample2 を読み込み RosenFileData を返す', () => {
    const r = parseBytes(readFixture('current/sample2.oud2'), 'sample2.oud2');
    expect(r.fileName).toBe('sample2.oud2');
    expect(r.data.rosen.diaCont.length).toBeGreaterThan(0);
    expect(r.data.rosen.ekiCont.length).toBe(38);
  });

  it('旧世代(OuDia.1.02)も読める', () => {
    const r = parseBytes(readFixture('oldgen/oudia-1.02.oud'), 'oudia-1.02.oud');
    expect(r.data.sourceFileType).toBe('OuDia.1.02');
    expect(r.data.rosen.rosenmei).toBe('テスト線');
  });

  it('壊れたバイト列は Error を throw', () => {
    expect(() => parseBytes(new Uint8Array([0x00, 0x01]), 'bad')).toThrow();
  });
});
