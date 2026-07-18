// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 oudia-second-web contributors

/**
 * 時刻表編集の E2E 回帰(roadmap §M3「Playwright キーボード回帰の骨格」)。
 * 実 fixture(sample2.oud2)をドロップ → 下り時刻表を開き → キーボードで編集し、
 * ダイアログ・コミット・Undo・コピペ・検索の主要フローが動くことを検証する。
 *
 * グリッドは Canvas 描画のためセル文字は DOM に出ない。E2E は DOM に現れる成果物
 * (ダイアログ・入力欄・ファイル名・検索バー)を対象に検証する。M3 はタブ表示モードのみ。
 */

import { test, expect } from '@playwright/test';
import { dropFile, openTimetableDown } from './helpers.js';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await dropFile(page, 'sample2.oud2');
});

test('ファイルを開くとヘッダにファイル名が出て、路線ツリーが表示される', async ({ page }) => {
  await expect(page.locator('.file-name')).toContainText('sample2.oud2');
  await expect(page.getByRole('navigation', { name: '路線ツリー' })).toBeVisible();
});

test('下り時刻表を開くとグリッドが描画される', async ({ page }) => {
  await openTimetableDown(page);
  await expect(page.locator('.grid-root canvas')).toBeVisible();
  // タブが 1 つ開いている。
  await expect(page.locator('.tab.active')).toBeVisible();
});

test('Enter で列車のプロパティダイアログが開く', async ({ page }) => {
  await openTimetableDown(page);
  await page.locator('.grid-root').press('Enter');
  await expect(page.getByText('列車のプロパティ')).toBeVisible();
});

test('文字キー押下でダイアログが開き、その文字が列車番号欄に入る', async ({ page }) => {
  await openTimetableDown(page);
  await page.locator('.grid-root').press('7');
  const dialog = page.locator('dialog.prop-dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel('列車番号')).toHaveValue('7');
});

test('列車番号を編集して OK すると閉じ、Esc/キャンセルは変更しない', async ({ page }) => {
  await openTimetableDown(page);

  // 1) 編集してコミット。
  await page.locator('.grid-root').press('Enter');
  const dialog = page.locator('dialog.prop-dialog');
  await dialog.getByLabel('列車番号').fill('E2E123');
  await dialog.getByRole('button', { name: 'OK' }).click();
  await expect(dialog).toBeHidden();

  // 2) 再度開くと編集値が保持されている(コミットが反映された)。
  await page.locator('.grid-root').press('Enter');
  await expect(page.locator('dialog.prop-dialog').getByLabel('列車番号')).toHaveValue('E2E123');
  // キャンセルは変更しない。
  await page.locator('dialog.prop-dialog').getByRole('button', { name: 'キャンセル' }).click();
  await expect(page.locator('dialog.prop-dialog')).toBeHidden();
});

test('Esc でダイアログがキャンセルされる', async ({ page }) => {
  await openTimetableDown(page);
  await page.locator('.grid-root').press('Enter');
  await expect(page.locator('dialog.prop-dialog')).toBeVisible();
  await page.locator('dialog.prop-dialog').press('Escape');
  await expect(page.locator('dialog.prop-dialog')).toBeHidden();
});

test('Ctrl+C → Ctrl+V → Ctrl+Z のコピペ・Undo フローが破綻しない', async ({ page }) => {
  await openTimetableDown(page);
  const grid = page.locator('.grid-root');
  // コピー → 貼り付け → Undo。DOM 上の検証点は「例外なく操作でき、グリッドが表示され続ける」。
  await grid.press('Control+c');
  await grid.press('Control+v');
  await grid.press('Control+z');
  await expect(grid.locator('canvas')).toBeVisible();
  // 編集後に列車プロパティダイアログが依然開ける(状態が壊れていない)。
  await grid.press('Enter');
  await expect(page.getByText('列車のプロパティ')).toBeVisible();
});

test('Ctrl+F で列車番号検索バーが開き、Esc で閉じる', async ({ page }) => {
  await openTimetableDown(page);
  const grid = page.locator('.grid-root');
  await grid.press('Control+f');
  const search = page.getByPlaceholder('列車番号を検索');
  await expect(search).toBeVisible();
  await search.fill('1');
  await search.press('Enter');
  await expect(page.getByRole('button', { name: '次を検索' })).toBeVisible();
  // 背後のグリッドにダイアログが漏れて開いていないこと(伝播停止の検証)。
  await expect(page.locator('dialog.prop-dialog')).toBeHidden();
  // Esc で閉じる。
  await search.press('Escape');
  await expect(search).toBeHidden();
});

test('駅時刻(発)行へ移動して Enter すると駅時刻ダイアログが開く', async ({ page }) => {
  await openTimetableDown(page);
  const grid = page.locator('.grid-root');
  // 初期フォーカス(列車番号行)から下へ 9 行で発時刻行(駅 0)に入る(sample2 の行構成)。
  for (let i = 0; i < 9; i++) await grid.press('ArrowDown');
  await grid.press('Enter');
  const dialog = page.locator('dialog.prop-dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('.dialog-title')).toContainText('駅時刻のプロパティ');
});
