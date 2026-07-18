// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 up-tri

/** E2E 共通ヘルパ: 実 fixture(.oud2)をドロップして読み込む + ビューを開く。 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';

const here = dirname(fileURLToPath(import.meta.url));
// apps/web/e2e → リポジトリの packages/format/fixtures。
const FIXTURES = join(here, '..', '..', '..', 'packages', 'format', 'fixtures');

/** fixture ファイルのバイト列(base64)を返す。 */
export function fixtureBase64(rel: string): string {
  return readFileSync(join(FIXTURES, 'current', rel)).toString('base64');
}

/**
 * .oud2 を App にドロップして読み込む(File System Access ピッカーを介さず、
 * 実際の onDrop 経路を通す)。読み込み後、ファイル名がヘッダに出るまで待つ。
 */
export async function dropFile(page: Page, fileName: string): Promise<void> {
  const b64 = fixtureBase64(fileName);

  // ブラウザ内で DataTransfer + File を組み立て、.app 要素へ drop を発火する。
  await page.evaluate(
    async ({ b64, fileName }) => {
      const res = await fetch(`data:application/octet-stream;base64,${b64}`);
      const buf = await res.arrayBuffer();
      const file = new File([buf], fileName, { type: 'text/plain' });
      const dt = new DataTransfer();
      dt.items.add(file);
      const app = document.querySelector('.app');
      if (app === null) throw new Error('.app not found');
      const opts = { bubbles: true, cancelable: true, dataTransfer: dt } as DragEventInit;
      app.dispatchEvent(new DragEvent('dragover', opts));
      app.dispatchEvent(new DragEvent('drop', opts));
    },
    { b64, fileName },
  );

  await expect(page.locator('.file-name')).toContainText(fileName);
}

/**
 * 路線ツリーから下り時刻表を開き、グリッドにフォーカスを与える。
 * クリックはフォーカスセルを動かしてしまうため、選択は初期状態(列車番号行・先頭列車)の
 * ままにしておく。以降のテストは初期フォーカスからの相対移動で目的セルへ辿る。
 */
export async function openTimetableDown(page: Page): Promise<void> {
  await page.getByRole('button', { name: '下り時刻表' }).first().click();
  await expect(page.locator('.grid-root')).toBeVisible();
  await page.locator('.grid-root').focus();
}
