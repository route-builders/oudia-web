// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 up-tri

/**
 * .oud2 バイト列をブラウザからダウンロードする最小ユーティリティ(切り出し等で使う)。
 * 汎用の保存 UI(上書き保存・FSAccess 書込)は M2 の別スコープ。ここは Blob ダウンロードのみ。
 */

/** bytes を fileName としてダウンロードさせる。 */
export function downloadBytes(bytes: Uint8Array, fileName: string): void {
  // 一部のブラウザ型定義で BlobPart に Uint8Array<ArrayBufferLike> が合わないため
  // ArrayBuffer スライスを渡す。
  const buf = bytes.slice().buffer;
  const blob = new Blob([buf], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // 次のタスクで解放(click ハンドラ完了後)。
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
