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
