// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 oudia-second-web contributors
//
// Based on OuDiaSecond (Copyright (C) 2017-2026 diagram_mania)

/**
 * 時刻表ビューの[表示]メニュー(原典 [表示] メニューのトグル群 + ビューのプロパティの
 * ソート設定。analysis §04 7.4)。設定は settingsStore(localStorage)に永続化する。
 *
 * 原典との対応: 通過駅の駅時刻(既定 ON)/全時刻/秒/コロン/親種別。
 * 始発終着駅名は編集モードでは常時表示(行生成に影響しないため項目なし)、
 * 通過種別フォント・基準運転時分・運用更新停止は M7、番線表示は M6。
 */

import { useState } from 'react';
import { useSettingsStore } from '../store/settingsStore.js';

const TOGGLES = [
  { key: 'displayTsuukaEkiJikoku', label: '通過駅の駅時刻を表示' },
  { key: 'displayAllEkiJikoku', label: '全時刻を表示' },
  { key: 'displaySecondEkiJikoku', label: '秒単位の時刻を表示' },
  { key: 'displayColonEkiJikoku', label: 'コロン付きの時刻表記をする' },
  { key: 'displayParentSyubetsu', label: '親種別を有効にする' },
] as const;

export function ViewToggleMenu(props: { onAfterChange?: () => void }): React.ReactElement {
  const { onAfterChange } = props;
  const settings = useSettingsStore((s) => s.jikokuhyou);
  const setSetting = useSettingsStore((s) => s.setJikokuhyouSetting);
  const [open, setOpen] = useState(false);

  return (
    <div className="toolbar-menu">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => {
          setOpen((v) => !v);
        }}
      >
        表示 ▾
      </button>
      {open && (
        <div className="toolbar-dropdown" role="menu">
          {TOGGLES.map((t) => (
            <label key={t.key}>
              <input
                type="checkbox"
                checked={settings[t.key]}
                onChange={(e) => {
                  setSetting(t.key, e.target.checked);
                  onAfterChange?.();
                }}
              />
              {t.label}
            </label>
          ))}
          <hr />
          <label>
            <input
              type="checkbox"
              checked={settings.focusMoveRight}
              onChange={(e) => {
                setSetting('focusMoveRight', e.target.checked);
                onAfterChange?.();
              }}
            />
            フォーカス右移動(OFF = 下移動)
          </label>
          <label>
            <input
              type="checkbox"
              checked={settings.ekijikokuSort === 'transfer'}
              onChange={(e) => {
                setSetting('ekijikokuSort', e.target.checked ? 'transfer' : 'ekiatsukai');
                onAfterChange?.();
              }}
            />
            駅時刻の並べ替えに乗継ソートを使う
          </label>
          <label>
            <input
              type="checkbox"
              checked={settings.compareBottom}
              onChange={(e) => {
                setSetting('compareBottom', e.target.checked);
                onAfterChange?.();
              }}
            />
            列車番号を末尾要素から比較する
          </label>
        </div>
      )}
    </div>
  );
}
