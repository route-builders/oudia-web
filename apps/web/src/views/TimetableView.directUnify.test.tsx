// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 oudia-second-web contributors
// @vitest-environment happy-dom

// 直通化(Ctrl+Shift+U)・分断(Ctrl+Shift+I)・時刻のみ貼り付け(Ctrl+Shift+V)の配線検証。

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { render, cleanup, fireEvent } from '@testing-library/react';
import { buildTimetableGrid, defaultTimetableGridOptions } from '@oudia/derive';
import { TimetableView } from './TimetableView.js';
import { useDocStore } from '../store/docStore.js';
import { parseBytes } from '../file/openFile.js';

const here = dirname(fileURLToPath(import.meta.url));
const ROW_H = 20;
const EKIMEI_W = 96;
const COL_W = 64;

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
const list = () => data().rosen.diaCont[0]!.ressyaCont[0];

function gridRows() {
  const built = buildTimetableGrid(data(), 0, defaultTimetableGridOptions(data(), 0));
  if (!built.ok) throw new Error('grid');
  return built.grid.rows;
}

function clickCell(scroller: Element, row: number, trainIndex: number): void {
  fireEvent.click(scroller, {
    clientX: EKIMEI_W + COL_W + trainIndex * COL_W + 5,
    clientY: row * ROW_H + 5,
  });
}

describe('TimetableView(直通化・分断・時刻のみ貼り付け)', () => {
  beforeEach(() => {
    (HTMLCanvasElement.prototype as unknown as { getContext: () => unknown }).getContext = () =>
      null;
    loadSample();
  });
  afterEach(() => {
    cleanup();
    useDocStore.setState({ docState: null, data: null, clipboard: null });
  });

  // 実 App と同じく store を購読して再レンダする(stale data prop を避ける)。
  function Harness(): React.ReactElement {
    const d = useDocStore((s) => s.data);
    return <TimetableView data={d!} diaIndex={0} houkou={0} />;
  }

  function renderView(): { root: Element; scroller: Element } {
    render(<Harness />);
    return {
      root: document.querySelector('.grid-root')!,
      scroller: document.querySelector('.grid-scroller')!,
    };
  }

  it('Ctrl+Shift+I で分断 → Ctrl+Shift+U で再接続(列車数が +1 → -1)', () => {
    const rows = gridRows();
    const row8 = rows.findIndex((r) => r.type === 'chaku' && r.ekiOrder === 8);
    const { root, scroller } = renderView();
    const before = list().length;

    clickCell(scroller, row8, 0);
    fireEvent.keyDown(root, { key: 'i', ctrlKey: true, shiftKey: true });
    expect(list().length).toBe(before + 1);
    expect(list()[0]!.ekiJikokuCont[8]!.hatsuJikoku).toBeNull(); // 前半は当駅止まり

    // 再接続: フォーカスは分断駅(前半の終着)に置く。分断後フォーカスは次駅へ移動して
    // いるため、クリックし直す。
    clickCell(scroller, row8, 0);
    fireEvent.keyDown(root, { key: 'u', ctrlKey: true, shiftKey: true });
    expect(list().length).toBe(before);
    expect(list()[0]!.ekiJikokuCont[8]!.chakuJikoku).toBe(1320);
    expect(list()[0]!.ekiJikokuCont[8]!.hatsuJikoku).toBe(1360);
  });

  it('始発駅では分断できない(-21 相当の no-op)', () => {
    const rows = gridRows();
    const firstHatsu = rows.findIndex((r) => r.type === 'hatsu' && r.ekiOrder === 0);
    const { root, scroller } = renderView();
    const before = list().length;
    clickCell(scroller, firstHatsu, 0);
    fireEvent.keyDown(root, { key: 'i', ctrlKey: true, shiftKey: true });
    expect(list().length).toBe(before);
  });

  it('Ctrl+Shift+V で時刻のみ貼り付け(列車情報は不変・クリップボード累積は進まない)', () => {
    const rows = gridRows();
    const row4 = rows.findIndex((r) => r.type === 'chaku' && r.ekiOrder === 4);
    const { root, scroller } = renderView();

    // 列車 2(003)をコピー。
    clickCell(scroller, 0, 2);
    fireEvent.keyDown(root, { key: 'c', ctrlKey: true });
    const accumBefore = useDocStore.getState().clipboard!.accum;

    // 列車 0 に時刻のみ貼り付け。
    clickCell(scroller, row4, 0);
    fireEvent.keyDown(root, { key: 'v', ctrlKey: true, shiftKey: true });
    const r0 = list()[0]!;
    expect(r0.ekiJikokuCont[4]!.chakuJikoku).toBe(4320); // 003 の時刻で上書き
    expect(r0.ressyabangou).toBe('001'); // 列車情報は不変
    expect(useDocStore.getState().clipboard!.accum).toEqual(accumBefore); // 累積は進まない
  });
});
