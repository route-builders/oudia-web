// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 oudia-second-web contributors

/**
 * ドキュメントストア(Zustand)。M1 は読み取り専用: 読み込んだ RosenFileData + タブ状態のみ。
 * M2 のコマンドエンジン(executeCommand)接続は M3 で行う(architecture §4.3-4.4)。
 */

import { create } from 'zustand';
import type { RosenFileData } from '@oudia/format';
import type { ViewDescriptor } from '../tabs/viewDescriptor.js';
import { descriptorKey } from '../tabs/viewDescriptor.js';

export interface OpenTab {
  readonly key: string;
  readonly descriptor: ViewDescriptor;
}

interface DocState {
  /** 読み込んだファイル(null = 未読込)。 */
  data: RosenFileData | null;
  /** 読み込んだファイル名(表示用)。 */
  fileName: string | null;
  /** 読込警告(件数)。 */
  warningCount: number;
  /** 開いているタブ。 */
  tabs: OpenTab[];
  /** アクティブタブのキー(null = ホーム)。 */
  activeKey: string | null;

  /** ファイルを読み込む(タブは初期化)。 */
  loadData: (data: RosenFileData, fileName: string, warningCount: number) => void;
  /** ビューを開く(重複は既存タブをアクティブ化)。 */
  openView: (descriptor: ViewDescriptor) => void;
  /** タブを閉じる。 */
  closeTab: (key: string) => void;
  /** アクティブタブを切り替える。 */
  setActive: (key: string | null) => void;
}

export const useDocStore = create<DocState>((set) => ({
  data: null,
  fileName: null,
  warningCount: 0,
  tabs: [],
  activeKey: null,

  loadData: (data, fileName, warningCount) => {
    set({ data, fileName, warningCount, tabs: [], activeKey: null });
  },

  openView: (descriptor) => {
    const key = descriptorKey(descriptor);
    set((s) => {
      // 二重オープン防止: 既存タブがあればアクティブ化のみ。
      if (s.tabs.some((t) => t.key === key)) {
        return { activeKey: key };
      }
      return { tabs: [...s.tabs, { key, descriptor }], activeKey: key };
    });
  },

  closeTab: (key) => {
    set((s) => {
      const idx = s.tabs.findIndex((t) => t.key === key);
      const tabs = s.tabs.filter((t) => t.key !== key);
      let activeKey = s.activeKey;
      if (s.activeKey === key) {
        // 閉じたタブがアクティブなら隣接タブへ。
        const next = tabs[Math.min(idx, tabs.length - 1)];
        activeKey = next?.key ?? null;
      }
      return { tabs, activeKey };
    });
  },

  setActive: (key) => {
    set({ activeKey: key });
  },
}));
