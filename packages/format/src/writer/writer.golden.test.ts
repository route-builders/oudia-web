// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 oudia-second-web contributors

// モデルレベル黄金テスト T1: 実ファイルを readRosenFile で読み → writeOud2 で書き →
// 元バイト列と完全一致(BOM・CRLF・FileTypeAppComment・WindowPlacement 含む)。
// 既存の roundtrip.golden.test.ts はノードレベル(parse→serialize)であり、
// 本テストはモデル(RosenFileData)経由でのバイト一致を実証する。
// 根拠: docs/design/04_file-io.md §5.2 T1、design/02_architecture.md §7.1

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parseNodeTree } from '../index.js';
import { readRosenFile } from '../reader/index.js';
import { writeOud2 } from './index.js';

const here = dirname(fileURLToPath(import.meta.url));
const fixtures = join(here, '..', '..', 'fixtures');

function readFixture(rel: string): Uint8Array {
  return new Uint8Array(readFileSync(join(fixtures, rel)));
}

/** モデル往復(read → write)。 */
function modelRoundtrip(bytes: Uint8Array): Uint8Array {
  const parsed = parseNodeTree(bytes);
  if (!parsed.ok) throw new Error(`parse failed: ${String(parsed.code)}`);
  const { data } = readRosenFile(parsed.root);
  return writeOud2(data);
}

/** バイト完全一致。不一致時は最初の差分位置を hex コンテキストで報告。 */
function expectBytesEqual(actual: Uint8Array, expected: Uint8Array, label: string): void {
  if (actual.length === expected.length) {
    let diff = -1;
    for (let i = 0; i < actual.length; i++) {
      if (actual[i] !== expected[i]) {
        diff = i;
        break;
      }
    }
    if (diff === -1) return;
    const ctx = (buf: Uint8Array): string =>
      Array.from(buf.slice(Math.max(0, diff - 12), diff + 12))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join(' ');
    const asText = (buf: Uint8Array): string =>
      new TextDecoder().decode(buf.slice(Math.max(0, diff - 40), diff + 40));
    throw new Error(
      `${label}: バイト不一致 at offset ${String(diff)}\n` +
        `  expected: ${ctx(expected)}\n  actual:   ${ctx(actual)}\n` +
        `  exp text: ${JSON.stringify(asText(expected))}\n  act text: ${JSON.stringify(asText(actual))}`,
    );
  }
  expect.fail(
    `${label}: 長さ不一致 expected=${String(expected.length)} actual=${String(actual.length)}`,
  );
}

const T1_MODEL = ['current/sample2.oud2', 'current/sample.oud2'];

describe('黄金テスト T1(モデルレベル): read → write でバイト一致', () => {
  for (const rel of T1_MODEL) {
    it(`${rel} が readRosenFile → writeOud2 でバイト一致する`, () => {
      const original = readFixture(rel);
      const out = modelRoundtrip(original);
      expectBytesEqual(out, original, rel);
    });
  }
});

describe('T3(モデル冪等性): 1 回目の出力を再往復しても安定', () => {
  for (const rel of T1_MODEL) {
    it(`${rel} は 2 周目でも 1 周目の出力と一致する`, () => {
      const original = readFixture(rel);
      const first = modelRoundtrip(original);
      const second = modelRoundtrip(first);
      expectBytesEqual(second, first, `${rel}(2周目)`);
    });
  }
});

describe('未知キー保全: 将来版キーを含むファイルの往復', () => {
  it('future-unknown.oud2 が read → write でバイト一致する(未知キーを記録 index へ差し戻し)', () => {
    const original = readFixture('synthetic/future-unknown.oud2');
    const out = modelRoundtrip(original);
    expectBytesEqual(out, original, 'synthetic/future-unknown.oud2');
  });
});
