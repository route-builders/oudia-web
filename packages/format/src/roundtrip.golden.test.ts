// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 oudia-second-web contributors

// 黄金テスト T1(恒等ラウンドトリップ): 実ファイルを読込 → 無編集 → 書出 →
// 元バイト列と完全一致(BOM・CRLF 含む)。
// 根拠: docs/design/04_file-io.md §5.2 T1、docs/design/02_architecture.md §7.1
//
// この S1 スパイクでは FileTypeAppComment 行の再生成を行わない(ノードツリーを
// そのまま書き戻す)ため、当該行も含めて完全一致を検証できる。世代別リーダー・
// 1.17 ライター実装(M2)で appComment 注入方式へ移行する際、本テストの位置づけを
// 「appComment 元値注入で完全一致」に引き継ぐ。

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { roundtripOud2, parseNodeTree } from './index.js';

const here = dirname(fileURLToPath(import.meta.url));
const fixtures = join(here, '..', 'fixtures');

function readFixture(rel: string): Uint8Array {
  return new Uint8Array(readFileSync(join(fixtures, rel)));
}

/** バイト列の完全一致。不一致時は最初の差分位置を報告する(簡易差分レポータ)。 */
function expectBytesEqual(actual: Uint8Array, expected: Uint8Array, label: string): void {
  if (actual.length === expected.length) {
    let diff = -1;
    for (let i = 0; i < actual.length; i++) {
      if (actual[i] !== expected[i]) {
        diff = i;
        break;
      }
    }
    if (diff === -1) return; // 完全一致
    const ctx = (buf: Uint8Array): string =>
      Array.from(buf.slice(Math.max(0, diff - 8), diff + 8))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join(' ');
    throw new Error(
      `${label}: バイト不一致 at offset ${String(diff)}\n  expected: ${ctx(expected)}\n  actual:   ${ctx(actual)}`,
    );
  }
  expect.fail(
    `${label}: 長さ不一致 expected=${String(expected.length)} actual=${String(actual.length)}`,
  );
}

const T1_CANONICAL = [
  'current/sample2.oud2',
  'current/sample.oud2',
  'synthetic/escape.oud2',
  'synthetic/minimal.oud2',
];

describe('黄金テスト T1: 恒等ラウンドトリップ(バイト一致)', () => {
  for (const rel of T1_CANONICAL) {
    it(`${rel} が読込 → 書出でバイト一致する`, () => {
      const original = readFixture(rel);
      const r = roundtripOud2(original);
      expect(r.ok).toBe(true);
      if (r.ok) {
        expectBytesEqual(r.bytes, original, rel);
      }
    });
  }
});

describe('T3(冪等性): 1 回目の出力を再往復しても安定', () => {
  for (const rel of T1_CANONICAL) {
    it(`${rel} は 2 回目の往復でも 1 回目の出力と一致する`, () => {
      const original = readFixture(rel);
      const first = roundtripOud2(original);
      expect(first.ok).toBe(true);
      if (first.ok) {
        const second = roundtripOud2(first.bytes);
        expect(second.ok).toBe(true);
        if (second.ok) expectBytesEqual(second.bytes, first.bytes, `${rel}(2周目)`);
      }
    });
  }
});

describe('旧世代フィクスチャの読込スモーク', () => {
  // 非正規形(閉じ忘れ)はパースが完走することのみ確認する(T1 対象外)。
  it('unclosed-dir.oud2 はエラーなく読める(閉じ忘れディレクトリ受理)', () => {
    const path = join(fixtures, 'synthetic', 'unclosed-dir.oud2');
    if (!existsSync(path)) return;
    const r = parseNodeTree(new Uint8Array(readFileSync(path)));
    expect(r.ok).toBe(true);
  });
});
