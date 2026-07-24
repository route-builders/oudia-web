// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 up-tri

/**
 * 組入れ/切り出し(embed/extract)の E2E。
 * - 切り出し: ダイアログで範囲を選び、.oud2 ダウンロードが発火する。
 * - 組入れ: ダイアログが開き、ファイル未選択では OK が無効。
 */

import { expect, test } from '@playwright/test';
import { dropFile } from './helpers.js';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await dropFile(page, 'sample2.oud2');
});

test('切り出しダイアログで範囲を選ぶと .oud2 がダウンロードされる', async ({ page }) => {
  await page.getByRole('button', { name: '切り出し' }).click();
  await expect(page.locator('.dialog-title', { hasText: '路線の切り出し' })).toBeVisible();
  // 開始・終了 select が駅一覧を持つ。
  const startSelect = page.locator('.prop-dialog select').first();
  await expect(startSelect.locator('option')).not.toHaveCount(0);
  // OK でダウンロード発火。
  const downloadPromise = page.waitForEvent('download');
  await page.locator('.prop-dialog .dialog-ok').click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toContain('切り出し');
  expect(download.suggestedFilename()).toContain('.oud2');
});

test('組入れダイアログはファイル未選択では OK が無効', async ({ page }) => {
  await page.getByRole('button', { name: '組入れ' }).click();
  await expect(page.locator('.dialog-title', { hasText: '路線の組入れ' })).toBeVisible();
  // ファイル未選択 → OK 無効。
  await expect(page.locator('.prop-dialog .dialog-ok')).toBeDisabled();
  // キャンセルで閉じる。
  await page.locator('.prop-dialog .dialog-cancel').click();
  await expect(page.locator('.dialog-title', { hasText: '路線の組入れ' })).toHaveCount(0);
});
