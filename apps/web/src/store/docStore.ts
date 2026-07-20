// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 up-tri

/**
 * ドキュメントストア(Zustand)。M3 で domain のコマンドエンジン(executeCommand /
 * patch Undo/Redo / 変更カウンタ)へ接続する(architecture §4.3-4.4)。
 *
 * 状態変更は必ず dispatch(名前付きコマンド)経由。ビューは docState.rosenFileData を読む。
 * 後方互換のため data セレクタ(= docState?.rosenFileData ?? null)を維持する。
 */

import type {
  DocumentState,
  EditCommand,
  EkijikokuModifyOperation2,
  RessyaClipboard,
} from '@oudia-web/domain';
import {
  canRedo as canRedoState,
  canUndo as canUndoState,
  createDocumentState,
  createNewRosen,
  executeCommand,
  markSaved as markSavedState,
  redo as redoState,
  undo as undoState,
} from '@oudia-web/domain';
import type { RosenFileData } from '@oudia-web/format';
import { create } from 'zustand';
import type { ViewDescriptor } from '../tabs/viewDescriptor.js';
import { descriptorKey, isDescriptorValid } from '../tabs/viewDescriptor.js';

export interface OpenTab {
  readonly key: string;
  readonly descriptor: ViewDescriptor;
}

interface DocState {
  /** 編集状態(RosenFileData + 履歴 + 変更カウンタ)。null = 未読込。 */
  docState: DocumentState | null;
  /** 現在のドキュメント(null = 未読込)。docState.rosenFileData の別名(読取専用)。 */
  data: RosenFileData | null;
  /** 読み込んだファイル名(表示用)。 */
  fileName: string | null;
  /** 読込警告(件数)。 */
  warningCount: number;
  /** 開いているタブ。 */
  tabs: OpenTab[];
  /** アクティブタブのキー(null = ホーム)。 */
  activeKey: string | null;
  /** 列車クリップボード(アプリ内。null = 空)。貼り付け移動量の累積を保持する。 */
  clipboard: RessyaClipboard | null;
  /**
   * 駅時刻変更の記憶(原典 CWndJikokuhyou::m_EkijikokuModifyOperation2)。
   * ビュー(ダイヤ×方向)単位・非永続。キーは "diaIndex:houkou"。
   */
  modifyOp2ByView: Record<string, EkijikokuModifyOperation2>;
  /** SW 更新が利用可能なら reload コールバック(null = なし)。 */
  swReload: (() => void) | null;
  /** オフライン利用可能になったか。 */
  offlineReady: boolean;

  /** ファイルを読み込む(タブは初期化・履歴も初期化)。 */
  loadData: (data: RosenFileData, fileName: string, warningCount: number) => void;
  /** 新規ファイルを作成する(空の路線 + 既定 DispProp)。 */
  newFile: () => void;
  /** コマンドを実行する(単一チョークポイント)。未読込なら no-op。 */
  dispatch: (command: EditCommand) => void;
  /** 直近コマンドを取り消す。 */
  undo: () => void;
  /** 取り消したコマンドをやり直す。 */
  redo: () => void;
  /** 保存済みとしてマークする(変更カウンタを 0 に)。 */
  markSaved: () => void;
  /** 列車クリップボードを設定(コピー/切り取り時。累積は 0 リセット済みで渡す)。 */
  setClipboard: (clip: RessyaClipboard | null) => void;
  /** 駅時刻変更の記憶を更新(ダイアログ OK 時。実行成否より先に保存)。 */
  setModifyOp2: (viewKey: string, op: EkijikokuModifyOperation2) => void;
  /** ビューを開く(重複は既存タブをアクティブ化)。 */
  openView: (descriptor: ViewDescriptor) => void;
  /** タブを閉じる。 */
  closeTab: (key: string) => void;
  /** アクティブタブを切り替える。 */
  setActive: (key: string | null) => void;
  /** SW 更新利用可を通知(reload コールバックを保持)。 */
  setSwUpdate: (reload: () => void) => void;
  /** オフライン準備完了を通知。 */
  setOfflineReady: () => void;
}

export const useDocStore = create<DocState>((set) => ({
  docState: null,
  data: null,
  fileName: null,
  warningCount: 0,
  tabs: [],
  activeKey: null,
  clipboard: null,
  modifyOp2ByView: {},
  swReload: null,
  offlineReady: false,

  loadData: (data, fileName, warningCount) => {
    const docState = createDocumentState(data);
    set({
      docState,
      data: docState.rosenFileData,
      fileName,
      warningCount,
      tabs: [],
      activeKey: null,
      modifyOp2ByView: {}, // 記憶はドキュメント単位でリセット
    });
  },

  newFile: () => {
    const docState = createDocumentState(createNewRosen());
    set({
      docState,
      data: docState.rosenFileData,
      fileName: '新規路線.oud2',
      warningCount: 0,
      tabs: [],
      activeKey: null,
      modifyOp2ByView: {},
    });
  },

  dispatch: (command) => {
    set((s) => {
      if (s.docState === null) return s;
      const next = executeCommand(s.docState, command);
      // 構造編集(駅/ダイヤ増減)後、無効になったタブ(範囲外の diaIndex/ekiOrder を指すもの)を
      // 閉じる(design §4.5 のビュー記述子整合検証)。路線単位ビューは常に有効。
      const diaCount = next.rosenFileData.rosen.diaCont?.length ?? 0;
      const ekiCount = next.rosenFileData.rosen.ekiCont?.length ?? 0;
      const tabs = s.tabs.filter((t) => isDescriptorValid(t.descriptor, diaCount, ekiCount));
      let activeKey = s.activeKey;
      if (tabs.length !== s.tabs.length && !tabs.some((t) => t.key === activeKey)) {
        activeKey = tabs[tabs.length - 1]?.key ?? null;
      }
      return { docState: next, data: next.rosenFileData, tabs, activeKey };
    });
  },

  undo: () => {
    set((s) => {
      if (s.docState === null || !canUndoState(s.docState)) return s;
      const next = undoState(s.docState);
      return { docState: next, data: next.rosenFileData };
    });
  },

  redo: () => {
    set((s) => {
      if (s.docState === null || !canRedoState(s.docState)) return s;
      const next = redoState(s.docState);
      return { docState: next, data: next.rosenFileData };
    });
  },

  markSaved: () => {
    set((s) => {
      if (s.docState === null) return s;
      const next = markSavedState(s.docState);
      return { docState: next, data: next.rosenFileData };
    });
  },

  setClipboard: (clip) => {
    set({ clipboard: clip });
  },

  setModifyOp2: (viewKey, op) => {
    set((s) => ({ modifyOp2ByView: { ...s.modifyOp2ByView, [viewKey]: op } }));
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

  setSwUpdate: (reload) => {
    set({ swReload: reload });
  },

  setOfflineReady: () => {
    set({ offlineReady: true });
  },
}));
