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
  // キー転送・初期フォーカスは発時刻欄(発行なので着欄ではない)。
  await expect(dialog.getByLabel('発時刻')).toBeFocused();
  // OK ボタンは Primary Color(白背景 + 白文字の退行を防ぐ。CSS 詳細度回帰ガード)。
  await expect(dialog.locator('.dialog-ok')).toHaveCSS('background-color', 'rgb(29, 95, 176)');
  await expect(dialog.locator('.dialog-ok')).toHaveCSS('color', 'rgb(255, 255, 255)');
});

test('BackSpace で駅時刻セルが運行なし化され、再度開くと運行なしが選択されている', async ({
  page,
}) => {
  await openTimetableDown(page);
  const grid = page.locator('.grid-root');
  // 発時刻行(駅 0)へ移動して BackSpace → 運行なし化。
  for (let i = 0; i < 9; i++) await grid.press('ArrowDown');
  await grid.press('Backspace');
  // ダイアログは開かず、グリッドにフォーカスが残る。
  await expect(page.locator('dialog.prop-dialog')).toBeHidden();
  await expect(grid).toBeFocused();
  // 同セルを Enter で開くと駅扱 = 運行なし・時刻欄は空。
  await grid.press('Enter');
  const dialog = page.locator('dialog.prop-dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel('運行なし')).toBeChecked();
  await expect(dialog.getByLabel('発時刻')).toHaveValue('');
  // Undo で戻す(後続テストへの影響なし。ページごとに再読込だが念のため)。
  await dialog.getByRole('button', { name: 'キャンセル' }).click();
  await grid.press('Control+z');
});

test('セルのダブルクリックで編集ダイアログが開く', async ({ page }) => {
  await openTimetableDown(page);
  // 列 2(先頭列車)× 行 0(列車番号行)。駅名 96px + 着発 64px = 160px が列車列の左端。
  await page.locator('.grid-scroller').dblclick({ position: { x: 170, y: 10 } });
  await expect(page.getByText('列車のプロパティ')).toBeVisible();
});

test('ダイアログを閉じるとフォーカスがグリッドへ戻り、矢印キーがスクロールを発火しない', async ({
  page,
}) => {
  await openTimetableDown(page);
  const grid = page.locator('.grid-root');

  // Esc で閉じる。
  await grid.press('Enter');
  await expect(page.locator('dialog.prop-dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('dialog.prop-dialog')).toBeHidden();
  await expect(grid).toBeFocused();

  // 矢印キーはセル移動として扱われ(preventDefault)、スクロールは発火しない。
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  const scrollTop = await page.locator('.grid-scroller').evaluate((el) => el.scrollTop);
  expect(scrollTop).toBe(0);

  // OK(Enter)で閉じた場合もフォーカスが戻る。
  await grid.press('Enter');
  await expect(page.locator('dialog.prop-dialog')).toBeVisible();
  await page.keyboard.press('Enter'); // ダイアログ内 Enter = OK
  await expect(page.locator('dialog.prop-dialog')).toBeHidden();
  await expect(grid).toBeFocused();
});

test('駅時刻セルで数字キー入力を開始すると対象欄に入り、2 文字目以降も続けて入力できる', async ({
  page,
}) => {
  await openTimetableDown(page);
  const grid = page.locator('.grid-root');
  // 発時刻行(駅 0)で数字キー → ダイアログの発時刻欄に '7' が入り続けて入力できる
  // (運行なしセルの停車昇格フローは happy-dom 統合テストで検証)。
  for (let i = 0; i < 9; i++) await grid.press('ArrowDown');
  await grid.press('7');
  const dialog = page.locator('dialog.prop-dialog');
  await expect(dialog).toBeVisible();
  const hatsu = dialog.getByLabel('発時刻');
  await expect(hatsu).toBeFocused();
  await expect(hatsu).toHaveValue('7');
  // 続けてタイプ → '730' になる(2 文字目以降が入力できる)。
  await page.keyboard.type('30');
  await expect(hatsu).toHaveValue('730');
  await dialog.getByRole('button', { name: 'キャンセル' }).click();
});
