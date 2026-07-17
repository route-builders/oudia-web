// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 oudia-second-web contributors

import { describe, it, expect, beforeEach } from 'vitest';
import { useDocStore } from './docStore.js';
import type { RosenFileData } from '@oudia/format';

const FAKE_DATA = { rosen: { rosenmei: 'テスト' } } as unknown as RosenFileData;

describe('docStore(タブ dedup・クローズ)', () => {
  beforeEach(() => {
    useDocStore.getState().loadData(FAKE_DATA, 'test.oud2', 0);
  });

  it('同一記述子は二重に開かない(アクティブ化のみ)', () => {
    const { openView } = useDocStore.getState();
    openView({ type: 'timetable', diaIndex: 0, houkou: 0 });
    openView({ type: 'timetable', diaIndex: 0, houkou: 0 });
    expect(useDocStore.getState().tabs.length).toBe(1);
  });

  it('異なる記述子は別タブ', () => {
    const { openView } = useDocStore.getState();
    openView({ type: 'diagram', diaIndex: 0 });
    openView({ type: 'timetable', diaIndex: 0, houkou: 0 });
    openView({ type: 'timetable', diaIndex: 0, houkou: 1 });
    expect(useDocStore.getState().tabs.length).toBe(3);
  });

  it('タブを閉じるとアクティブが隣接タブへ移る', () => {
    const { openView, closeTab } = useDocStore.getState();
    openView({ type: 'diagram', diaIndex: 0 });
    openView({ type: 'timetable', diaIndex: 0, houkou: 0 });
    const s1 = useDocStore.getState();
    const activeKey = s1.activeKey!;
    closeTab(activeKey);
    const s2 = useDocStore.getState();
    expect(s2.tabs.length).toBe(1);
    expect(s2.activeKey).not.toBe(activeKey);
    expect(s2.activeKey).not.toBeNull();
  });

  it('全タブを閉じるとアクティブは null', () => {
    const { openView, closeTab } = useDocStore.getState();
    openView({ type: 'diagram', diaIndex: 0 });
    closeTab(useDocStore.getState().activeKey!);
    expect(useDocStore.getState().activeKey).toBeNull();
  });

  it('loadData でタブが初期化される', () => {
    const { openView, loadData } = useDocStore.getState();
    openView({ type: 'diagram', diaIndex: 0 });
    loadData(FAKE_DATA, 'other.oud2', 2);
    const s = useDocStore.getState();
    expect(s.tabs.length).toBe(0);
    expect(s.fileName).toBe('other.oud2');
    expect(s.warningCount).toBe(2);
  });
});

describe('docStore(コマンドエンジン接続)', () => {
  const FRESH = (): RosenFileData => ({ rosen: { comment: '初期' } }) as unknown as RosenFileData;

  beforeEach(() => {
    useDocStore.getState().loadData(FRESH(), 'edit.oud2', 0);
  });

  it('dispatch で data が更新され、変更カウンタが 1 になる', () => {
    useDocStore.getState().dispatch({ type: 'comment/set', comment: '編集後' });
    const s = useDocStore.getState();
    expect(s.data!.rosen.comment).toBe('編集後');
    expect(s.docState!.changeCount).toBe(1);
  });

  it('undo で元に戻り、変更カウンタが 0 になる', () => {
    const { dispatch, undo } = useDocStore.getState();
    dispatch({ type: 'comment/set', comment: '編集後' });
    undo();
    const s = useDocStore.getState();
    expect(s.data!.rosen.comment).toBe('初期');
    expect(s.docState!.changeCount).toBe(0);
  });

  it('redo で編集後に戻る', () => {
    const { dispatch, undo, redo } = useDocStore.getState();
    dispatch({ type: 'comment/set', comment: '編集後' });
    undo();
    redo();
    expect(useDocStore.getState().data!.rosen.comment).toBe('編集後');
  });

  it('markSaved で変更カウンタが 0 になる', () => {
    const { dispatch, markSaved } = useDocStore.getState();
    dispatch({ type: 'comment/set', comment: 'x' });
    markSaved();
    expect(useDocStore.getState().docState!.changeCount).toBe(0);
  });
});
