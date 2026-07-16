// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 oudia-second-web contributors

// ★ バイト一致 CI 必須ゲート(architecture §7.1、roadmap M2 完了条件 #1)★
//
// コーパス全ファイルに対し「読込 → 無編集 → 書出 → 元ファイルとバイト一致」を
// 2 経路で検証する:
//   (A) ノードレベル: parseNodeTree → serialize → encode(パーサ/シリアライザの可逆性)
//   (B) モデルレベル: readRosenFile → writeOud2(世代別リーダー/ライターの可逆性)
// 加えて冪等性(2 周目一致)を確認する。
//
// このゲートは以後すべての PR のマージ条件。落ちる変更はマージ不可。

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parseNodeTree, readRosenFile, roundtripOud2, writeOud2 } from './index.js';
import { assertBytesEqual } from './testutil/byteDiff.js';

const here = dirname(fileURLToPath(import.meta.url));
const fixtures = join(here, '..', 'fixtures');

function read(rel: string): Uint8Array {
  return new Uint8Array(readFileSync(join(fixtures, rel)));
}

/**
 * モデルレベル・バイト一致コーパス(自作フィクスチャ 10 本以上。roadmap M2 完了条件 #1)。
 * すべて**正準形**(実 OuDiaSecond 出力、またはそれをライターで正準化した派生)。
 * 世代別リーダー/ライターの可逆性を「読込 → 無編集 → 書出 → バイト一致」で保証する。
 *
 * 機能網羅: 番線・分岐(Brunch)・OuterTerminal・平面交差・運用(Operation)・
 * WindowPlacement・環状(Loop)・隠し種別・パターンダイヤ・運休・駅間距離・
 * 未知キー保全・各種プロパティ欠落。
 */
const MODEL_CORPUS: readonly string[] = [
  'current/sample2.oud2',
  'current/sample.oud2',
  'roundtrip/canonical-sample2.oud2',
  'roundtrip/canceled.oud2',
  'roundtrip/next-eki-distance.oud2',
  'roundtrip/loop-hidden.oud2',
  'roundtrip/empty-comment.oud2',
  'roundtrip/no-window-placement.oud2',
  'roundtrip/no-app-comment.oud2',
  'synthetic/future-unknown.oud2', // 未知キー保全(root/Rosen/DispProp)
];

/**
 * ノードレベル・コーパス(文法パーサ/シリアライザの可逆性)。正準形でない
 * 文法端フィクスチャ(最小・エスケープ)も含む — これらはモデル正準化で
 * キーが補完されるためモデルレベルには載せない。
 */
const NODE_CORPUS: readonly string[] = [
  ...MODEL_CORPUS,
  'synthetic/escape.oud2', // エスケープ(\n / \\)
  'synthetic/minimal.oud2', // 最小構造(空 DispProp 等の文法端)
];

describe('★ バイト一致 CI ゲート: ノードレベル(parse → serialize)', () => {
  for (const rel of NODE_CORPUS) {
    it(rel, () => {
      const original = read(rel);
      const r = roundtripOud2(original);
      expect(r.ok).toBe(true);
      if (r.ok) assertBytesEqual(r.bytes, original, `node:${rel}`);
    });
  }
});

describe('★ バイト一致 CI ゲート: モデルレベル(readRosenFile → writeOud2)', () => {
  for (const rel of MODEL_CORPUS) {
    it(rel, () => {
      const original = read(rel);
      const parsed = parseNodeTree(original);
      expect(parsed.ok).toBe(true);
      if (!parsed.ok) return;
      const { data } = readRosenFile(parsed.root);
      assertBytesEqual(writeOud2(data), original, `model:${rel}`);
    });
  }
});

describe('★ 冪等性(T3): モデル往復を 2 回しても安定', () => {
  for (const rel of MODEL_CORPUS) {
    it(rel, () => {
      const parsed1 = parseNodeTree(read(rel));
      if (!parsed1.ok) throw new Error('parse');
      const first = writeOud2(readRosenFile(parsed1.root).data);
      const parsed2 = parseNodeTree(first);
      if (!parsed2.ok) throw new Error('re-parse');
      const second = writeOud2(readRosenFile(parsed2.root).data);
      assertBytesEqual(second, first, `idem:${rel}`);
    });
  }
});

it('モデルコーパスは 10 本以上(roadmap M2 完了条件 #1)', () => {
  expect(MODEL_CORPUS.length).toBeGreaterThanOrEqual(10);
});
