// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 oudia-second-web contributors
//
// Based on OuDiaSecond (Copyright (C) 2017-2026 diagram_mania)

/**
 * 時刻表ビューの設定ストア(原典 CWndJikokuhyou の .ini 永続化属性 → localStorage、
 * analysis §04 7.4 / design §05 4.1)。原典と同じくアプリ全体で共有し、変更は即保存する。
 *
 * M4-1 では繰上げ繰下げ(m_bModifyEkijikoku。原典既定 true: CWndJikokuhyou.cpp 1355)と
 * フォーカス移動モード(m_bJikokuhyouFocusMoveRight。既定 false = 下移動)のみ。
 * 表示トグル群は M4-6 で拡張する。
 */

import { create } from 'zustand';

export interface JikokuhyouSettings {
  /** [駅時刻の繰上げ・繰下げ]: ダイアログの時刻書込を伝播つき(modify)にする。原典既定 ON。 */
  readonly modifyEkijikoku: boolean;
  /** フォーカス移動モード: true = 右移動(次列車)/ false = 下移動(次の行)。原典既定 false。 */
  readonly focusMoveRight: boolean;
}

export const DEFAULT_JIKOKUHYOU_SETTINGS: JikokuhyouSettings = {
  modifyEkijikoku: true,
  focusMoveRight: false,
};

const STORAGE_KEY = 'oudia-second-web:jikokuhyouSettings:v1';

function load(): JikokuhyouSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) return DEFAULT_JIKOKUHYOU_SETTINGS;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return DEFAULT_JIKOKUHYOU_SETTINGS;
    // 既知キーのみ採用(将来のキー追加・削除に対して前方互換)。
    const out = { ...DEFAULT_JIKOKUHYOU_SETTINGS };
    for (const key of Object.keys(out) as (keyof JikokuhyouSettings)[]) {
      const v = (parsed as Record<string, unknown>)[key];
      if (typeof v === 'boolean') (out as Record<string, boolean>)[key] = v;
    }
    return out;
  } catch {
    return DEFAULT_JIKOKUHYOU_SETTINGS; // localStorage 不可(プライベートモード等)は既定値
  }
}

function save(s: JikokuhyouSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    // 保存不可でも動作は継続(セッション内のみ有効)。
  }
}

interface SettingsState {
  jikokuhyou: JikokuhyouSettings;
  /** 1 項目を変更して即保存する。 */
  setJikokuhyouSetting: <K extends keyof JikokuhyouSettings>(
    key: K,
    value: JikokuhyouSettings[K],
  ) => void;
}

export const useSettingsStore = create<SettingsState>((set) => ({
  jikokuhyou: load(),
  setJikokuhyouSetting: (key, value) => {
    set((s) => {
      const next = { ...s.jikokuhyou, [key]: value };
      save(next);
      return { jikokuhyou: next };
    });
  },
}));
