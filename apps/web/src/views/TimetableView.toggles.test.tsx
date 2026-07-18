// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 oudia-second-web contributors
// @vitest-environment happy-dom

// 表示トグル群([表示]メニュー → derive オプション接続 → グリッド再構築)の統合検証。

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { render, cleanup, fireEvent, screen } from '@testing-library/react';
import { buildTimetableGrid, defaultTimetableGridOptions } from '@oudia/derive';
import { TimetableView } from './TimetableView.js';
import { useDocStore } from '../store/docStore.js';
import { useSettingsStore, DEFAULT_JIKOKUHYOU_SETTINGS } from '../store/settingsStore.js';
import { parseBytes } from '../file/openFile.js';

const here = dirname(fileURLToPath(import.meta.url));

function loadSample(): void {
  const bytes = new Uint8Array(
    readFileSync(
      join(
        here,
        '..',
        '..',
        '..',
        '..',
        'packages',
        'format',
        'fixtures',
        'current',
        'sample2.oud2',
      ),
    ),
  );
  const r = parseBytes(bytes, 'sample2.oud2');
  useDocStore.getState().loadData(r.data, r.fileName, r.warningCount);
}

const data = () => useDocStore.getState().data!;

describe('表示トグル(derive オプション)', () => {
  beforeEach(loadSample);
  afterEach(() => {
    useDocStore.setState({ docState: null, data: null });
  });

  it('全時刻を表示 ON で全駅に着・発の両行が生成される', () => {
    const base = defaultTimetableGridOptions(data(), 0);
    const normal = buildTimetableGrid(data(), 0, base);
    const all = buildTimetableGrid(data(), 0, { ...base, displayAllEkiJikoku: true });
    if (!normal.ok || !all.ok) throw new Error('grid');
    const count = (rows: readonly { type: string }[], t: string) =>
      rows.filter((r) => r.type === t).length;
    const ekiCount = data().rosen.ekiCont.length;
    expect(count(all.grid.rows, 'chaku')).toBe(ekiCount);
    expect(count(all.grid.rows, 'hatsu')).toBe(ekiCount);
    expect(count(normal.grid.rows, 'chaku')).toBeLessThan(ekiCount);
  });

  it('コロン・秒表示はセル書式に反映される(9:15 系 ↔ 915 系)', () => {
    const base = defaultTimetableGridOptions(data(), 0);
    const colon = buildTimetableGrid(data(), 0, {
      ...base,
      conv: { ...base.conv, noColon: false, outputSecond: true },
    });
    if (!colon.ok) throw new Error('grid');
    // 列車 0 の駅 4 着 720 秒 = 0:12:00 → コロン + 秒付き表記が含まれる。
    const flat = colon.grid.cells.flat().map((c) => c.text);
    expect(flat.some((t) => t.includes(':12:00'))).toBe(true);
  });

  it('通過駅の駅時刻を表示 OFF で通過時刻セルが「レ」になる', () => {
    const base = defaultTimetableGridOptions(data(), 0);
    const off = buildTimetableGrid(data(), 0, { ...base, displayTsuukaEkiJikoku: false });
    const on = buildTimetableGrid(data(), 0, base);
    if (!off.ok || !on.ok) throw new Error('grid');
    const countTsuuka = (cells: readonly (readonly { mark: string | null }[])[]) =>
      cells.flat().filter((c) => c.mark === 'tsuuka').length;
    expect(countTsuuka(off.grid.cells)).toBeGreaterThan(countTsuuka(on.grid.cells));
  });
});

describe('[表示]メニュー(ビュー統合)', () => {
  beforeEach(() => {
    (HTMLCanvasElement.prototype as unknown as { getContext: () => unknown }).getContext = () =>
      null;
    localStorage.clear();
    useSettingsStore.setState({ jikokuhyou: DEFAULT_JIKOKUHYOU_SETTINGS });
    loadSample();
  });
  afterEach(() => {
    cleanup();
    useDocStore.setState({ docState: null, data: null });
  });

  it('メニューから全時刻を表示を ON にするとグリッド行数が増え、設定が保存される', () => {
    render(<TimetableView data={data()} diaIndex={0} houkou={0} />);
    const spacer = document.querySelector<HTMLDivElement>('.grid-spacer')!;
    const heightBefore = spacer.style.height;

    fireEvent.click(screen.getByText('表示 ▾'));
    fireEvent.click(screen.getByLabelText<HTMLInputElement>('全時刻を表示'));

    expect(spacer.style.height).not.toBe(heightBefore); // 行数増 → 総高さ増
    expect(useSettingsStore.getState().jikokuhyou.displayAllEkiJikoku).toBe(true);
    const raw = localStorage.getItem('oudia-second-web:jikokuhyouSettings:v1');
    expect(raw).toContain('"displayAllEkiJikoku":true');
  });

  it('既定値: 通過駅の駅時刻を表示のみ ON(原典 .ini 既定)', () => {
    render(<TimetableView data={data()} diaIndex={0} houkou={0} />);
    fireEvent.click(screen.getByText('表示 ▾'));
    expect(screen.getByLabelText<HTMLInputElement>('通過駅の駅時刻を表示').checked).toBe(true);
    expect(screen.getByLabelText<HTMLInputElement>('全時刻を表示').checked).toBe(false);
    expect(screen.getByLabelText<HTMLInputElement>('秒単位の時刻を表示').checked).toBe(false);
  });
});
