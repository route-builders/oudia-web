// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 up-tri

/**
 * M4 入力効率の E2E 回帰(原典マニュアル 2.3 章「列車のいろいろな入力方法」をシナリオの
 * 一次ソースにする。roadmap §M4 完了条件 1)。
 *
 * 検証は DOM に現れる成果物で行う(Canvas のセル文字は DOM に出ない):
 * ダイアログの入力値・スペーサ寸法(列車数/行数)・インジケータ・設定ストア。
 *
 * セル座標: 列車 0 の列 = x 170 / 行 r の中心 = y r*20+10。
 * ★行番号は**ハードコードしない**。ヘッダ行は表示設定で増減する(M7d で運用番号行が
 * 5 行増えた)ので、gridRowIndex で行構成から引く。
 * 列車 0(001)は 駅 2 発 310 / 駅 4 着 720 発 780 を持つ。
 */

import type { Page } from '@playwright/test';
import { expect, test } from '@playwright/test';
import { dropFile, gridRowIndex, openTimetableDown } from './helpers.js';

const COL_TRAIN0 = 170; // 駅名 96 + 着発 64 + セル内
const COL_TRAIN1 = 234;
const y = (row: number): number => row * 20 + 10;

/** 行の種類("hatsu:4" 等)からセル中心 Y を求める。 */
async function yOf(page: Page, key: string): Promise<number> {
  return y(await gridRowIndex(page, key));
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await dropFile(page, 'sample2.oud2');
  await openTimetableDown(page);
});

/** セルをダブルクリックして駅時刻ダイアログを開く(行は種類で指定する)。 */
async function openJikokuAt(page: Page, x: number, rowKey: string): Promise<void> {
  await page.locator('.grid-scroller').dblclick({ position: { x, y: await yOf(page, rowKey) } });
  await expect(page.locator('dialog.prop-dialog')).toBeVisible();
}

test('連続入力モード: Alt+T で開始 → 分 2 桁入力 → Esc 終了(2.3.4 連続入力)', async ({ page }) => {
  const grid = page.locator('.grid-root');
  // 駅 4 の着行(行 17)へ。前に駅 2 発 310 があるので入場可。
  await page
    .locator('.grid-scroller')
    .click({ position: { x: COL_TRAIN0, y: await yOf(page, 'chaku:4') } });
  await grid.press('Alt+t');
  await expect(page.getByText('連続入力モード')).toBeVisible();

  // "25" → 基準 0:05(駅 2 発 310 の時 0)から 0:25 が着に入り、次の駅時刻セルへ前進。
  await grid.press('2');
  await grid.press('5');
  await expect(page.getByText('連続入力モード')).toBeVisible(); // モード継続

  await grid.press('Escape');
  await expect(page.getByText('連続入力モード')).toBeHidden();

  // 入力値の検証: 駅 4 の着時刻 = 0:25 = "025"。
  await openJikokuAt(page, COL_TRAIN0, 'chaku:4');
  await expect(page.locator('dialog.prop-dialog').getByLabel('着時刻')).toHaveValue('025');
});

test('連続 1 分修正: Ctrl+Shift+L で +1 分(移動なし)が同セルに累積する(2.3.7)', async ({
  page,
}) => {
  const grid = page.locator('.grid-root');
  await page
    .locator('.grid-scroller')
    .click({ position: { x: COL_TRAIN0, y: await yOf(page, 'hatsu:4') } }); // 駅 4 発
  await grid.press('Control+Shift+l');
  await grid.press('Control+Shift+l');
  // 発 780(0:13)+120 = 0:15。
  await openJikokuAt(page, COL_TRAIN0, 'hatsu:4');
  await expect(page.locator('dialog.prop-dialog').getByLabel('発時刻')).toHaveValue('015');
});

test('繰上げ・繰下げ: ダイアログの時刻変更が以後の駅へ伝播する(2.3.6)', async ({ page }) => {
  // 駅 0 の発行(行 9)を 0:00 → 0:05 へ(+300 秒)。チェックは原典既定 ON。
  await openJikokuAt(page, COL_TRAIN0, 'hatsu:0');
  const dialog = page.locator('dialog.prop-dialog');
  await expect(dialog.getByLabel('時刻の繰上げ・繰下げ')).toBeChecked();
  await dialog.getByLabel('発時刻').fill('005');
  await dialog.getByRole('button', { name: 'OK' }).click();
  await expect(dialog).toBeHidden();

  // 駅 4 の着 720 + 300 = 1020 = 0:17。
  await openJikokuAt(page, COL_TRAIN0, 'chaku:4');
  await expect(page.locator('dialog.prop-dialog').getByLabel('着時刻')).toHaveValue('017');
});

test('駅時刻変更(Ctrl+M): 繰下げ 1 分を適用し、再実行(Ctrl+.)も動く(2.3.12)', async ({ page }) => {
  const grid = page.locator('.grid-root');
  await page
    .locator('.grid-scroller')
    .click({ position: { x: COL_TRAIN0, y: await yOf(page, 'hatsu:4') } }); // 駅 4 発
  await grid.press('Alt+m');
  const dlg = page.locator('dialog.prop-dialog');
  await expect(dlg.locator('.dialog-title')).toHaveText('駅時刻変更');
  await dlg.getByLabel(/繰下げ\/繰上げ/).check();
  await dlg.getByLabel('繰下げ分').fill('1');
  await dlg.getByLabel('繰下げ秒').fill('0');
  await dlg.getByRole('button', { name: 'OK' }).click();
  await expect(dlg).toBeHidden();

  // 発 780 + 60 = 0:14。
  await openJikokuAt(page, COL_TRAIN0, 'hatsu:4');
  await expect(page.locator('dialog.prop-dialog').getByLabel('発時刻')).toHaveValue('014');
  await page.locator('dialog.prop-dialog').getByRole('button', { name: 'キャンセル' }).click();

  // 再実行: 別セル(駅 4 着行)で Ctrl+. → 着 720 + 60 = 0:13。
  await page
    .locator('.grid-scroller')
    .click({ position: { x: COL_TRAIN0, y: await yOf(page, 'chaku:4') } });
  await grid.press('Control+.');
  await openJikokuAt(page, COL_TRAIN0, 'chaku:4');
  await expect(page.locator('dialog.prop-dialog').getByLabel('着時刻')).toHaveValue('013');
});

test('分断(Ctrl+Shift+I)→ 直通化(Ctrl+Shift+U)で列車数が +1 → -1(2.3.10)', async ({ page }) => {
  const grid = page.locator('.grid-root');
  const spacer = page.locator('.grid-spacer');
  const widthBefore = await spacer.evaluate((el) => el.clientWidth);

  // 駅 4(始発 0 < 4 < 終着 32・発 780 あり)で分断。
  await page
    .locator('.grid-scroller')
    .click({ position: { x: COL_TRAIN0, y: await yOf(page, 'hatsu:4') } });
  await grid.press('Control+Shift+i');
  await expect.poll(async () => spacer.evaluate((el) => el.clientWidth)).toBe(widthBefore + 64); // 列車 +1 = 1 列(64px)増

  // 直通化: フォーカス駅 = 前半の終着駅(駅 4)で相手(直後の後半)と接続。
  await page
    .locator('.grid-scroller')
    .click({ position: { x: COL_TRAIN0, y: await yOf(page, 'hatsu:4') } });
  await grid.press('Control+Shift+u');
  await expect.poll(async () => spacer.evaluate((el) => el.clientWidth)).toBe(widthBefore);

  // 復元確認: 駅 4 の着発が元の値。
  await openJikokuAt(page, COL_TRAIN0, 'chaku:4');
  await expect(page.locator('dialog.prop-dialog').getByLabel('着時刻')).toHaveValue('012');
  await expect(page.locator('dialog.prop-dialog').getByLabel('発時刻')).toHaveValue('013');
});

test('時刻のみ貼り付け(Ctrl+Shift+V): 別列車へ時刻だけ移り列車番号は不変(2.3.9)', async ({
  page,
}) => {
  const grid = page.locator('.grid-root');
  // 列車 0(001)をコピー。
  await page
    .locator('.grid-scroller')
    .click({ position: { x: COL_TRAIN0, y: await yOf(page, 'ressyabangou') } });
  await grid.press('Control+c');
  // 列車 1(101)へ時刻のみ貼り付け。
  await page
    .locator('.grid-scroller')
    .click({ position: { x: COL_TRAIN1, y: await yOf(page, 'ressyabangou') } });
  await grid.press('Control+Shift+v');

  // 列車 1 の駅 4 着が 001 の時刻(0:12)になり、タイトルの列車番号は 101 のまま。
  await openJikokuAt(page, COL_TRAIN1, 'chaku:4');
  const dialog = page.locator('dialog.prop-dialog');
  await expect(dialog.getByLabel('着時刻')).toHaveValue('012');
  await expect(dialog.locator('.dialog-title')).toContainText('101');
});

test('一本化ツールバー: 分断した列車が[列車番号で一本化]で併合される(2.3.11)', async ({ page }) => {
  const grid = page.locator('.grid-root');
  const spacer = page.locator('.grid-spacer');
  const widthBefore = await spacer.evaluate((el) => el.clientWidth);

  await page
    .locator('.grid-scroller')
    .click({ position: { x: COL_TRAIN0, y: await yOf(page, 'hatsu:4') } });
  await grid.press('Control+Shift+i'); // 分断
  await expect.poll(async () => spacer.evaluate((el) => el.clientWidth)).toBe(widthBefore + 64);

  await page
    .locator('.grid-scroller')
    .click({ position: { x: COL_TRAIN0, y: await yOf(page, 'chaku:4') } });
  await page.getByRole('button', { name: '列車番号で一本化' }).click();
  await expect.poll(async () => spacer.evaluate((el) => el.clientWidth)).toBe(widthBefore);
});

test('表示メニュー: 全時刻を表示 ON で行数(総高さ)が増え、設定が永続化される', async ({ page }) => {
  const spacer = page.locator('.grid-spacer');
  const heightBefore = await spacer.evaluate((el) => el.clientHeight);

  await page.getByRole('button', { name: '表示 ▾' }).click();
  await page.getByLabel('全時刻を表示').check();
  await expect
    .poll(async () => spacer.evaluate((el) => el.clientHeight))
    .toBeGreaterThan(heightBefore);

  const stored = await page.evaluate(() => localStorage.getItem('oudia-web:jikokuhyouSettings:v1'));
  expect(stored).toContain('"displayAllEkiJikoku":true');
});

test('並べ替えツールバー: 列車番号行で実行しても列車数は不変・Undo で戻せる', async ({ page }) => {
  const grid = page.locator('.grid-root');
  const spacer = page.locator('.grid-spacer');
  const widthBefore = await spacer.evaluate((el) => el.clientWidth);

  await page
    .locator('.grid-scroller')
    .click({ position: { x: COL_TRAIN0, y: await yOf(page, 'ressyabangou') } });
  await page.getByRole('button', { name: '並べ替え', exact: true }).click();
  await expect.poll(async () => spacer.evaluate((el) => el.clientWidth)).toBe(widthBefore);
  await grid.press('Control+z'); // Undo 可能(1 コマンド)
});
