// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 oudia-second-web contributors

import { describe, it, expect } from 'vitest';
import { resolveEditAction } from './keymap.js';
import type { KeymapMode } from './keymap.js';

const PWA: KeymapMode = { ctrlBindings: true };
const TAB: KeymapMode = { ctrlBindings: false };

type Ev = Parameters<typeof resolveEditAction>[0];
const ev = (o: Partial<Ev>): Ev => ({
  key: '',
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  shiftKey: false,
  ...o,
});

describe('resolveEditAction', () => {
  it('Ctrl+C/X/V/Z/Y は両モードで有効(ブラウザ非衝突)', () => {
    expect(resolveEditAction(ev({ key: 'c', ctrlKey: true }), TAB)).toBe('copy');
    expect(resolveEditAction(ev({ key: 'x', ctrlKey: true }), TAB)).toBe('cut');
    expect(resolveEditAction(ev({ key: 'v', ctrlKey: true }), TAB)).toBe('paste');
    expect(resolveEditAction(ev({ key: 'z', ctrlKey: true }), TAB)).toBe('undo');
    expect(resolveEditAction(ev({ key: 'y', ctrlKey: true }), TAB)).toBe('redo');
  });

  it('Ctrl+Shift+Z は redo(mac 慣習)', () => {
    expect(resolveEditAction(ev({ key: 'z', ctrlKey: true, shiftKey: true }), TAB)).toBe('redo');
  });

  it('Del = clear、Ctrl+Del = clearJikoku', () => {
    expect(resolveEditAction(ev({ key: 'Delete' }), TAB)).toBe('clear');
    expect(resolveEditAction(ev({ key: 'Delete', ctrlKey: true }), TAB)).toBe('clearJikoku');
  });

  it('BackSpace(修飾なし)= clearCell、修飾つきは対象外', () => {
    expect(resolveEditAction(ev({ key: 'Backspace' }), TAB)).toBe('clearCell');
    expect(resolveEditAction(ev({ key: 'Backspace', ctrlKey: true }), TAB)).toBeNull();
    expect(resolveEditAction(ev({ key: 'Backspace', altKey: true }), TAB)).toBeNull();
    expect(resolveEditAction(ev({ key: 'Backspace', shiftKey: true }), TAB)).toBeNull();
  });

  it('当駅始発/止り/運休は Alt 系で常時有効', () => {
    expect(resolveEditAction(ev({ key: 'u', altKey: true }), TAB)).toBe('sihatsuEki');
    expect(resolveEditAction(ev({ key: 'i', altKey: true }), TAB)).toBe('syuuchakuEki');
    expect(resolveEditAction(ev({ key: 'b', altKey: true }), TAB)).toBe('toggleCanceled');
  });

  it('当駅始発は Ctrl 系でもタブ表示で有効(design §4.1: 傍受可能な Ctrl 系は常時)', () => {
    expect(resolveEditAction(ev({ key: 'u', ctrlKey: true }), PWA)).toBe('sihatsuEki');
    expect(resolveEditAction(ev({ key: 'u', ctrlKey: true }), TAB)).toBe('sihatsuEki');
  });

  it('Ctrl+Shift+U/I/V = 直通化/分断/時刻のみ貼り付け(Alt+Shift でも)', () => {
    expect(resolveEditAction(ev({ key: 'u', ctrlKey: true, shiftKey: true }), TAB)).toBe(
      'tyokutsuu',
    );
    expect(resolveEditAction(ev({ key: 'i', ctrlKey: true, shiftKey: true }), TAB)).toBe('bundan');
    expect(resolveEditAction(ev({ key: 'v', ctrlKey: true, shiftKey: true }), TAB)).toBe(
      'pasteJikokuOnly',
    );
    expect(resolveEditAction(ev({ key: 'u', altKey: true, shiftKey: true }), TAB)).toBe(
      'tyokutsuu',
    );
  });

  it('通過 = テンキー- / Ctrl+-(両モード)、経由なし = テンキー/ ', () => {
    expect(resolveEditAction(ev({ key: '-', code: 'NumpadSubtract' }), TAB)).toBe('tsuuka');
    expect(resolveEditAction(ev({ key: '-', ctrlKey: true }), PWA)).toBe('tsuuka');
    expect(resolveEditAction(ev({ key: '-', ctrlKey: true }), TAB)).toBe('tsuuka');
    expect(resolveEditAction(ev({ key: '/', code: 'NumpadDivide' }), TAB)).toBe('keiyunasi');
  });

  it('Alt+- は通過-停車トグル(テンキー- でも)', () => {
    expect(resolveEditAction(ev({ key: '-', altKey: true }), TAB)).toBe('tsuukaTeisya');
    expect(resolveEditAction(ev({ key: '-', code: 'NumpadSubtract', altKey: true }), TAB)).toBe(
      'tsuukaTeisya',
    );
    // Ctrl+Alt+- は対象外(Rev 系でもない)。
    expect(resolveEditAction(ev({ key: '-', ctrlKey: true, altKey: true }), TAB)).toBeNull();
  });

  it('Ctrl+J/L = ±1分し次へ、Ctrl+Shift+J/L = ±1分(タブ表示でも有効)', () => {
    expect(resolveEditAction(ev({ key: 'j', ctrlKey: true }), TAB)).toEqual({
      kind: 'jikokuStep',
      sign: -1,
      variant: 'move',
      rev: false,
    });
    expect(resolveEditAction(ev({ key: 'l', ctrlKey: true }), TAB)).toEqual({
      kind: 'jikokuStep',
      sign: 1,
      variant: 'move',
      rev: false,
    });
    expect(resolveEditAction(ev({ key: 'j', ctrlKey: true, shiftKey: true }), TAB)).toEqual({
      kind: 'jikokuStep',
      sign: -1,
      variant: 'noMove',
      rev: false,
    });
  });

  it('Alt+J/L は代替バインド(macOS の Alt+J = ∆ でも code から解決)', () => {
    expect(resolveEditAction(ev({ key: 'j', altKey: true }), TAB)).toEqual({
      kind: 'jikokuStep',
      sign: -1,
      variant: 'move',
      rev: false,
    });
    expect(resolveEditAction(ev({ key: '∆', code: 'KeyJ', altKey: true }), TAB)).toEqual({
      kind: 'jikokuStep',
      sign: -1,
      variant: 'move',
      rev: false,
    });
  });

  it('Ctrl+Alt+J/L は Rev 系', () => {
    expect(resolveEditAction(ev({ key: 'j', ctrlKey: true, altKey: true }), TAB)).toEqual({
      kind: 'jikokuStep',
      sign: -1,
      variant: 'move',
      rev: true,
    });
    expect(
      resolveEditAction(ev({ key: 'l', ctrlKey: true, altKey: true, shiftKey: true }), TAB),
    ).toEqual({ kind: 'jikokuStep', sign: 1, variant: 'noMove', rev: true });
  });

  it('Ctrl+K / Ctrl+Shift+K = フォーカスを次へ/前へ', () => {
    expect(resolveEditAction(ev({ key: 'k', ctrlKey: true }), TAB)).toBe('focusNext');
    expect(resolveEditAction(ev({ key: 'k', ctrlKey: true, shiftKey: true }), TAB)).toBe(
      'focusPrev',
    );
    expect(resolveEditAction(ev({ key: 'k', altKey: true }), TAB)).toBe('focusNext');
  });

  it("Ctrl+';' / Ctrl+':' = 任意秒 1(Shift で任意秒 2。code は Semicolon/Quote)", () => {
    expect(resolveEditAction(ev({ key: ';', code: 'Semicolon', ctrlKey: true }), TAB)).toEqual({
      kind: 'jikokuStep',
      sign: -1,
      variant: 'any1',
      rev: false,
    });
    expect(resolveEditAction(ev({ key: ':', code: 'Quote', ctrlKey: true }), TAB)).toEqual({
      kind: 'jikokuStep',
      sign: 1,
      variant: 'any1',
      rev: false,
    });
    expect(
      resolveEditAction(ev({ key: ';', code: 'Semicolon', ctrlKey: true, shiftKey: true }), TAB),
    ).toEqual({ kind: 'jikokuStep', sign: -1, variant: 'any2', rev: false });
  });

  it('駅時刻変更 = Ctrl+M / Alt+M、再実行 = Ctrl+. / Alt+.(素の . は原典に存在しない)', () => {
    expect(resolveEditAction(ev({ key: 'm', ctrlKey: true }), TAB)).toBe('modifyEkijikoku');
    expect(resolveEditAction(ev({ key: 'm', altKey: true }), TAB)).toBe('modifyEkijikoku');
    expect(resolveEditAction(ev({ key: '.', code: 'Period', ctrlKey: true }), TAB)).toBe(
      'modifyRepeat',
    );
    expect(resolveEditAction(ev({ key: '.', code: 'Period', altKey: true }), TAB)).toBe(
      'modifyRepeat',
    );
    // 素の '.' はダイアログへのキー転送に回す(原典もバインドなし)。
    expect(resolveEditAction(ev({ key: '.', code: 'Period' }), TAB)).toBeNull();
  });

  it('連続入力: Alt+T は常時、Ctrl+T は standalone のみ(傍受不能リスト)', () => {
    expect(resolveEditAction(ev({ key: 't', altKey: true }), TAB)).toBe('renzoku');
    expect(resolveEditAction(ev({ key: 't', ctrlKey: true }), TAB)).toBeNull();
    expect(resolveEditAction(ev({ key: 't', ctrlKey: true }), PWA)).toBe('renzoku');
  });

  it('Ctrl+←/→ は左へ/右へ(両モード)', () => {
    expect(resolveEditAction(ev({ key: 'ArrowLeft', ctrlKey: true }), TAB)).toBe('swapLeft');
    expect(resolveEditAction(ev({ key: 'ArrowRight', ctrlKey: true }), TAB)).toBe('swapRight');
  });

  it('Ctrl+F = 検索(両モード)', () => {
    expect(resolveEditAction(ev({ key: 'f', ctrlKey: true }), TAB)).toBe('search');
  });

  it('修飾なしの文字キーはアクションでない(ダイアログ起動へ回す)', () => {
    expect(resolveEditAction(ev({ key: 'a' }), PWA)).toBeNull();
    expect(resolveEditAction(ev({ key: 'ArrowUp' }), PWA)).toBeNull();
  });
});
