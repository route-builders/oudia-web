// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 up-tri

/**
 * ファイルを開く(File System Access API 優先、input[type=file] フォールバック、
 * ドロップ対応。design/05_ui-views / M1 プラン #6)。bytes → RosenFileData。
 */

import type { RosenFileData } from '@oudia-web/format';
import { parseNodeTree, readRosenFile } from '@oudia-web/format';

export interface OpenResult {
  readonly data: RosenFileData;
  readonly fileName: string;
  readonly warningCount: number;
}

/** File System Access API が使えるか。 */
function hasFileSystemAccess(): boolean {
  return typeof (window as { showOpenFilePicker?: unknown }).showOpenFilePicker === 'function';
}

/** bytes を RosenFileData へ。パース/読込失敗は Error を throw。 */
export function parseBytes(bytes: Uint8Array, fileName: string): OpenResult {
  const parsed = parseNodeTree(bytes);
  if (!parsed.ok) {
    throw new Error(`ファイルを解析できませんでした(code ${String(parsed.code)}): ${fileName}`);
  }
  const { data, warnings } = readRosenFile(parsed.root);
  return { data, fileName, warningCount: warnings.length };
}

/** File オブジェクトから読み込む(ドロップ・input 共通)。 */
export async function openFileObject(file: File): Promise<OpenResult> {
  const buf = await file.arrayBuffer();
  return parseBytes(new Uint8Array(buf), file.name);
}

interface FilePickerHandle {
  getFile: () => Promise<File>;
}
interface PickerWindow {
  showOpenFilePicker: (opts: unknown) => Promise<FilePickerHandle[]>;
}

/**
 * ファイルピッカーを開く(FSAccess 優先)。キャンセル時は null。
 */
export async function pickAndOpen(): Promise<OpenResult | null> {
  if (hasFileSystemAccess()) {
    try {
      const [handle] = await (window as unknown as PickerWindow).showOpenFilePicker({
        types: [
          {
            description: 'OuDia / OuDiaSecond ファイル',
            accept: { 'text/plain': ['.oud2', '.oud'] },
          },
        ],
        multiple: false,
      });
      if (handle === undefined) return null;
      const file = await handle.getFile();
      return await openFileObject(file);
    } catch (e) {
      // ユーザキャンセル(AbortError)は null、それ以外は再 throw。
      if (e instanceof DOMException && e.name === 'AbortError') return null;
      throw e;
    }
  }
  // フォールバック: input[type=file]。
  return openViaInput();
}

function openViaInput(): Promise<OpenResult | null> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.oud2,.oud';
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      if (file === undefined) {
        resolve(null);
        return;
      }
      openFileObject(file).then(resolve, reject);
    });
    input.click();
  });
}
