// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 oudia-second-web contributors

/**
 * バイト一致検証のカスタム差分レポータ(architecture §7.1)。
 * 黄金テスト(バイト一致 CI ゲート)で共有する。不一致時に最初の差分位置を
 * hex + テキストコンテキストで報告し、原因特定を容易にする。
 */

/** バイト列の完全一致を検証する。不一致なら差分位置つきの Error を throw する。 */
export function assertBytesEqual(actual: Uint8Array, expected: Uint8Array, label: string): void {
  if (actual.length === expected.length) {
    let diff = -1;
    for (let i = 0; i < actual.length; i++) {
      if (actual[i] !== expected[i]) {
        diff = i;
        break;
      }
    }
    if (diff === -1) return; // 完全一致

    const hex = (buf: Uint8Array): string =>
      Array.from(buf.slice(Math.max(0, diff - 12), diff + 12))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join(' ');
    const text = (buf: Uint8Array): string =>
      new TextDecoder().decode(buf.slice(Math.max(0, diff - 40), diff + 40));

    throw new Error(
      `${label}: バイト不一致 at offset ${String(diff)} / ${String(expected.length)}\n` +
        `  expected hex: ${hex(expected)}\n` +
        `  actual   hex: ${hex(actual)}\n` +
        `  expected txt: ${JSON.stringify(text(expected))}\n` +
        `  actual   txt: ${JSON.stringify(text(actual))}`,
    );
  }
  throw new Error(
    `${label}: 長さ不一致 expected=${String(expected.length)} actual=${String(actual.length)}`,
  );
}
