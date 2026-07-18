// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 up-tri
// @vitest-environment happy-dom

// 離脱保護(design §6.5): 未保存時のみ beforeunload をブロックし、タイトルに * を付ける。

import type { RosenFileData } from '@oudia-web/format';
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useDocStore } from '../store/docStore.js';
import { useUnsavedGuard } from './useUnsavedGuard.js';

const FAKE = (): RosenFileData => ({ rosen: { comment: '初期' } }) as unknown as RosenFileData;

/** cancelable な beforeunload を発火し、ブロックされたか(defaultPrevented)を返す。 */
function fireBeforeUnload(): boolean {
  const e = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(e);
  return e.defaultPrevented;
}

describe('useUnsavedGuard', () => {
  beforeEach(() => {
    useDocStore.getState().loadData(FAKE(), 'guard.oud2', 0);
  });
  afterEach(() => {
    cleanup();
    useDocStore.setState({ docState: null, data: null, fileName: null });
  });

  it('未編集(変更カウンタ 0)ではリロードをブロックしない', () => {
    renderHook(() => {
      useUnsavedGuard();
    });
    expect(fireBeforeUnload()).toBe(false);
  });

  it('未保存の編集があるとブロックする(確認ダイアログの発火条件)', () => {
    renderHook(() => {
      useUnsavedGuard();
    });
    act(() => {
      useDocStore.getState().dispatch({ type: 'comment/set', comment: '編集' });
    });
    expect(fireBeforeUnload()).toBe(true);
  });

  it('Undo で保存済み状態(カウンタ 0)へ戻るとブロックしない', () => {
    renderHook(() => {
      useUnsavedGuard();
    });
    act(() => {
      useDocStore.getState().dispatch({ type: 'comment/set', comment: '編集' });
      useDocStore.getState().undo();
    });
    expect(fireBeforeUnload()).toBe(false);
  });

  it('markSaved 後はブロックしない', () => {
    renderHook(() => {
      useUnsavedGuard();
    });
    act(() => {
      useDocStore.getState().dispatch({ type: 'comment/set', comment: '編集' });
      useDocStore.getState().markSaved();
    });
    expect(fireBeforeUnload()).toBe(false);
  });

  it('アンマウント後はブロックしない(ハンドラ解除)', () => {
    const { unmount } = renderHook(() => {
      useUnsavedGuard();
    });
    act(() => {
      useDocStore.getState().dispatch({ type: 'comment/set', comment: '編集' });
    });
    unmount();
    expect(fireBeforeUnload()).toBe(false);
  });

  it('タイトル: 未保存で「* 」、ファイル名を含み、保存済みで * が消える', () => {
    renderHook(() => {
      useUnsavedGuard();
    });
    expect(document.title).toBe('guard.oud2 — OuDiaSecond Web ビューア');
    act(() => {
      useDocStore.getState().dispatch({ type: 'comment/set', comment: '編集' });
    });
    expect(document.title).toBe('* guard.oud2 — OuDiaSecond Web ビューア');
    act(() => {
      useDocStore.getState().markSaved();
    });
    expect(document.title).toBe('guard.oud2 — OuDiaSecond Web ビューア');
  });
});
