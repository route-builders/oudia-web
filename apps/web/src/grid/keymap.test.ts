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

  it('当駅始発/止り/運休は Alt 系で常時有効', () => {
    expect(resolveEditAction(ev({ key: 'u', altKey: true }), TAB)).toBe('sihatsuEki');
    expect(resolveEditAction(ev({ key: 'i', altKey: true }), TAB)).toBe('syuuchakuEki');
    expect(resolveEditAction(ev({ key: 'b', altKey: true }), TAB)).toBe('toggleCanceled');
  });

  it('当駅始発は Ctrl 系では PWA のみ有効', () => {
    expect(resolveEditAction(ev({ key: 'u', ctrlKey: true }), PWA)).toBe('sihatsuEki');
    expect(resolveEditAction(ev({ key: 'u', ctrlKey: true }), TAB)).toBeNull();
  });

  it('Ctrl+Shift+U(直通化)は M3 では未対応 → null', () => {
    expect(resolveEditAction(ev({ key: 'u', ctrlKey: true, shiftKey: true }), PWA)).toBeNull();
  });

  it('通過 = テンキー- / Ctrl+-(PWA)、経由なし = テンキー/ ', () => {
    expect(resolveEditAction(ev({ key: '-', code: 'NumpadSubtract' }), TAB)).toBe('tsuuka');
    expect(resolveEditAction(ev({ key: '-', ctrlKey: true }), PWA)).toBe('tsuuka');
    expect(resolveEditAction(ev({ key: '/', code: 'NumpadDivide' }), TAB)).toBe('keiyunasi');
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
