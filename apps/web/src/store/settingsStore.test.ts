// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 oudia-second-web contributors
// @vitest-environment happy-dom

// 時刻表ビュー設定ストア(localStorage 永続化)の検証。

import { describe, it, expect, beforeEach } from 'vitest';
import { useSettingsStore, DEFAULT_JIKOKUHYOU_SETTINGS } from './settingsStore.js';

const KEY = 'oudia-second-web:jikokuhyouSettings:v1';

describe('settingsStore', () => {
  beforeEach(() => {
    localStorage.clear();
    useSettingsStore.setState({ jikokuhyou: DEFAULT_JIKOKUHYOU_SETTINGS });
  });

  it('既定値: 繰上げ繰下げ ON(原典 m_bModifyEkijikoku=true)・下移動モード', () => {
    const s = useSettingsStore.getState().jikokuhyou;
    expect(s.modifyEkijikoku).toBe(true);
    expect(s.focusMoveRight).toBe(false);
  });

  it('変更すると localStorage へ即保存される', () => {
    useSettingsStore.getState().setJikokuhyouSetting('modifyEkijikoku', false);
    expect(useSettingsStore.getState().jikokuhyou.modifyEkijikoku).toBe(false);
    const raw = localStorage.getItem(KEY);
    expect(raw).not.toBeNull();
    expect((JSON.parse(raw!) as { modifyEkijikoku: boolean }).modifyEkijikoku).toBe(false);
  });

  it('他のキーは変更されない', () => {
    useSettingsStore.getState().setJikokuhyouSetting('focusMoveRight', true);
    expect(useSettingsStore.getState().jikokuhyou.modifyEkijikoku).toBe(true);
    expect(useSettingsStore.getState().jikokuhyou.focusMoveRight).toBe(true);
  });
});
