// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 up-tri

/**
 * 構造編集(M5)の E2E 回帰(roadmap §M5 完了条件 2「ゼロから路線を作成」)。
 * 新規作成 → 駅ビューで駅を追加 → 種別ビューで種別を追加 → ダイヤ一覧でダイヤを作成 →
 * 路線プロパティ・駅プロパティ・種別プロパティの各ダイアログが開いてコミットできること、
 * Undo/Redo が効くことを、DOM に現れる成果物で検証する(Canvas セルは DOM に出ない)。
 */

import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test('新規作成すると空の路線が開き、路線ツリーに 駅・列車種別 が出る', async ({ page }) => {
  await page.getByRole('button', { name: '新規作成' }).first().click();
  await expect(page.getByRole('navigation', { name: '路線ツリー' })).toBeVisible();
  await expect(page.getByRole('button', { name: '駅', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '列車種別' })).toBeVisible();
});

test('駅ビューで駅を追加・削除でき、行数が変わる', async ({ page }) => {
  await page.getByRole('button', { name: '新規作成' }).first().click();
  await page.getByRole('button', { name: '駅', exact: true }).click();
  // 空駅の状態(empty-row 表示)。
  await expect(page.locator('.eki-view .empty-row')).toBeVisible();
  // 末尾に追加 ×2。
  await page.getByRole('button', { name: '末尾に追加' }).click();
  await page.getByRole('button', { name: '末尾に追加' }).click();
  const rows = page.locator('.eki-view tbody tr');
  await expect(rows).toHaveCount(2);
  // 削除で 1 行に。
  await page.getByRole('button', { name: '削除' }).click();
  await expect(page.locator('.eki-view tbody tr')).toHaveCount(1);
});

test('駅プロパティダイアログで駅名を変えると表に反映される', async ({ page }) => {
  await page.getByRole('button', { name: '新規作成' }).first().click();
  await page.getByRole('button', { name: '駅', exact: true }).click();
  await page.getByRole('button', { name: '末尾に追加' }).click();
  await page.locator('.eki-view tbody tr').first().dblclick();
  await expect(page.getByText('駅のプロパティ')).toBeVisible();
  // 駅名欄(最初のテキスト入力)を書き換えて OK。
  const nameInput = page.locator('.prop-dialog input[type="text"]').first();
  await nameInput.fill('東京');
  await page.locator('.prop-dialog .dialog-ok').click();
  await expect(page.locator('.eki-view tbody')).toContainText('東京');
});

test('種別ビューで種別を追加でき、Undo で戻る', async ({ page }) => {
  await page.getByRole('button', { name: '新規作成' }).first().click();
  await page.getByRole('button', { name: '列車種別' }).click();
  // 既定 '普通' 1 行。
  await expect(page.locator('.syubetsu-view tbody tr')).toHaveCount(1);
  await page.getByRole('button', { name: '追加' }).click();
  await expect(page.locator('.syubetsu-view tbody tr')).toHaveCount(2);
  // ヘッダの [元に戻す] で 1 行へ。
  await page.getByRole('button', { name: '元に戻す' }).click();
  await expect(page.locator('.syubetsu-view tbody tr')).toHaveCount(1);
});

test('ダイヤ一覧で新規ダイヤを作ると路線ツリーに出る', async ({ page }) => {
  await page.getByRole('button', { name: '新規作成' }).first().click();
  await page.getByRole('button', { name: 'ダイヤ一覧' }).click();
  await expect(page.locator('.dialog-title', { hasText: 'ダイヤ一覧' })).toBeVisible();
  // ダイアログ内の [新規作成] ボタンを押す(ヘッダの新規作成と区別)。
  await page.locator('.dia-list-buttons').getByRole('button', { name: '新規作成' }).click();
  // 一覧に 1 件出る。
  await expect(page.locator('.dia-list li')).toHaveCount(1);
  await page.getByRole('button', { name: '閉じる' }).click();
  // 路線ツリーの dia ノードに ダイヤグラム リンクが出る。
  await expect(page.getByRole('button', { name: 'ダイヤグラム' })).toBeVisible();
});

test('路線プロパティダイアログが 4 タブで開き、路線名を変えられる', async ({ page }) => {
  await page.getByRole('button', { name: '新規作成' }).first().click();
  await page.getByRole('button', { name: '路線のプロパティ' }).click();
  await expect(page.getByText('路線ファイルのプロパティ')).toBeVisible();
  // タブが 4 つ。
  await expect(page.locator('.prop-dialog [role="tab"]')).toHaveCount(4);
  const rosenNameInput = page.locator('.prop-dialog input[type="text"]').first();
  await rosenNameInput.fill('中央線');
  await page.locator('.prop-dialog .dialog-ok').click();
  await expect(page.locator('.rosen-name')).toContainText('中央線');
});
