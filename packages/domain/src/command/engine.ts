// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 oudia-second-web contributors
//
// Based on OuDiaSecond (Copyright (C) 2017-2026 diagram_mania)
// and OuDia (Copyright (C) 2006-2017 take-okm)

/**
 * 編集コマンドエンジン(architecture §4.3–§4.4)。単一チョークポイント。
 *
 * ストア(Zustand)非依存の純ロジックとして実装する。app 層がこの状態を Zustand で
 * 包む。Immer の produceWithPatches で patch / 逆 patch を記録し、Undo = 逆 patch 適用、
 * Redo = patch 適用とする(逆コマンド方式は不採用)。
 *
 * 変更カウンタは原典仕様を踏襲: 保存で 0、変更/Redo で +1、Undo で -1、負の状態から
 * 編集したら INT_MAX(「保存後に Undo してから編集した」ケースで未保存扱いを維持)。
 */

import { applyPatches, produceWithPatches, enablePatches } from 'immer';
import type { RosenFileData } from '@oudia/format';
import { applyCommand } from './reducers.js';
import type { EditCommand, HistoryEntry } from './types.js';

// Immer の patch 記録を有効化(モジュール読込時に 1 度)。
enablePatches();

/** 32bit 符号付き整数の最大値(原典 INT_MAX)。未保存扱いの番兵。 */
export const INT_MAX = 2147483647;

/** Undo 履歴の既定深さ(原典 8 固定から拡張。architecture §4.4)。 */
export const DEFAULT_UNDO_DEPTH = 100;

/** ドキュメント編集状態(RosenFileData + 履歴 + 変更カウンタ)。イミュータブルに扱う。 */
export interface DocumentState {
  /** 現在のドキュメント(読取専用として公開)。 */
  readonly rosenFileData: RosenFileData;
  /** Undo 履歴(古い→新しい)。末尾が直近コマンド。 */
  readonly history: readonly HistoryEntry[];
  /** Redo スタック(新しい→古い)。末尾が次に Redo する対象。 */
  readonly redoStack: readonly HistoryEntry[];
  /**
   * 変更カウンタ。0 = 保存済み(未変更)。原典の modify count 仕様に従う。
   * 負値は「保存状態より Undo で戻った」状態を表す。
   */
  readonly changeCount: number;
  /** Undo 履歴の最大保持数。超過時は最古を捨てる。 */
  readonly undoDepth: number;
}

/** 初期状態を作る(読込直後 = 保存済み・履歴なし)。 */
export function createDocumentState(
  rosenFileData: RosenFileData,
  undoDepth: number = DEFAULT_UNDO_DEPTH,
): DocumentState {
  return {
    rosenFileData,
    history: [],
    redoStack: [],
    changeCount: 0,
    undoDepth,
  };
}

/** 変更/Redo 時の変更カウンタ更新(原典仕様)。負状態からの編集は INT_MAX。 */
function incrementChangeCount(prev: number): number {
  // 負の状態(保存後に Undo して戻った)から編集 → 二度と 0 に戻さないため INT_MAX。
  if (prev < 0) return INT_MAX;
  return prev + 1;
}

/**
 * コマンドを実行する(単一チョークポイント)。新しい DocumentState を返す。
 * 1) produceWithPatches で状態更新 + patch 記録
 * 2) 履歴追加(Redo スタッククリア、深さ超過なら最古を捨てる)
 * 3) 変更カウンタ更新
 */
export function executeCommand(state: DocumentState, command: EditCommand): DocumentState {
  const [next, patches, inversePatches] = produceWithPatches(
    state.rosenFileData,
    (draft: RosenFileData) => {
      applyCommand(draft, command);
    },
  );

  const entry: HistoryEntry = { command, patches, inversePatches };
  const history = [...state.history, entry];
  // 深さ超過なら最古を捨てる(捨てた分の patch は永久に Undo 不能。原典の深さ制限相当)。
  const trimmed =
    history.length > state.undoDepth ? history.slice(history.length - state.undoDepth) : history;

  return {
    rosenFileData: next,
    history: trimmed,
    redoStack: [],
    changeCount: incrementChangeCount(state.changeCount),
    undoDepth: state.undoDepth,
  };
}

/** Undo できるか。 */
export function canUndo(state: DocumentState): boolean {
  return state.history.length > 0;
}

/** Redo できるか。 */
export function canRedo(state: DocumentState): boolean {
  return state.redoStack.length > 0;
}

/** 直近コマンドを取り消す(逆 patch 適用)。変更カウンタ -1。 */
export function undo(state: DocumentState): DocumentState {
  if (state.history.length === 0) return state;
  const entry = state.history[state.history.length - 1];
  if (entry === undefined) return state;

  const next = applyPatches(state.rosenFileData, entry.inversePatches);
  return {
    rosenFileData: next,
    history: state.history.slice(0, -1),
    redoStack: [...state.redoStack, entry],
    changeCount: state.changeCount - 1,
    undoDepth: state.undoDepth,
  };
}

/** 取り消したコマンドをやり直す(正 patch 適用)。変更カウンタ +1(負なら INT_MAX)。 */
export function redo(state: DocumentState): DocumentState {
  if (state.redoStack.length === 0) return state;
  const entry = state.redoStack[state.redoStack.length - 1];
  if (entry === undefined) return state;

  const next = applyPatches(state.rosenFileData, entry.patches);
  return {
    rosenFileData: next,
    history: [...state.history, entry],
    redoStack: state.redoStack.slice(0, -1),
    changeCount: incrementChangeCount(state.changeCount),
    undoDepth: state.undoDepth,
  };
}

/** 保存済みとしてマークする(変更カウンタを 0 に)。履歴は保持する。 */
export function markSaved(state: DocumentState): DocumentState {
  if (state.changeCount === 0) return state;
  return { ...state, changeCount: 0 };
}

/** 未保存の変更があるか(変更カウンタ != 0)。 */
export function isDirty(state: DocumentState): boolean {
  return state.changeCount !== 0;
}
