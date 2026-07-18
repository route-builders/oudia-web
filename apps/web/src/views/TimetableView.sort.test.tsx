// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 up-tri
// @vitest-environment happy-dom

// 並べ替え・列車番号で一本化・最小所要時間列車に移動(ツールバー)の配線検証。

import { buildTimetableGrid, defaultTimetableGridOptions } from '@oudia-web/derive';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { parseBytes } from '../file/openFile.js';
import { useDocStore } from '../store/docStore.js';
import { DEFAULT_JIKOKUHYOU_SETTINGS, useSettingsStore } from '../store/settingsStore.js';
import { TimetableView } from './TimetableView.js';

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
const bangous = () => list().map((r) => r.ressyabangou);

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

describe('TimetableView(並べ替え・一本化・最小所要)', () => {
  beforeEach(() => {
    (HTMLCanvasElement.prototype as unknown as { getContext: () => unknown }).getContext = () =>
      null;
    localStorage.clear();
    useSettingsStore.setState({ jikokuhyou: DEFAULT_JIKOKUHYOU_SETTINGS });
    loadSample();
  });
  afterEach(() => {
    cleanup();
    useDocStore.setState({ docState: null, data: null, clipboard: null });
  });

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

  it('列車番号行で[並べ替え]→ 全列車が番号順になり、Ctrl+Z で戻る', () => {
    const { root, scroller } = renderView();
    clickCell(scroller, 0, 0); // 列車番号行
    const before = bangous();
    fireEvent.click(screen.getByText('並べ替え'));
    const after = bangous();
    expect(after).not.toEqual(before);
    // 番号順(数値優先の分割比較)。空番号の isNull 列車は後方。
    const nonEmpty = after.filter((b) => b !== '');
    const resorted = [...nonEmpty];
    // 検証は「隣接ペアが逆転していない」ことを数値プレフィクスで確認。
    for (let i = 0; i + 1 < resorted.length; i++) {
      const a = parseInt(resorted[i]!, 10);
      const b = parseInt(resorted[i + 1]!, 10);
      expect(a).toBeLessThanOrEqual(b);
    }
    fireEvent.keyDown(root, { key: 'z', ctrlKey: true });
    expect(bangous()).toEqual(before);
  });

  it('駅時刻行で[並べ替え](駅扱ソート)→ フォーカス駅の時刻順になる', () => {
    const rows = gridRows();
    const row4 = rows.findIndex((r) => r.type === 'hatsu' && r.ekiOrder === 4);
    const { scroller } = renderView();
    clickCell(scroller, row4, 0);
    fireEvent.click(screen.getByText('並べ替え'));
    // 駅 4 に発時刻を持つ列車が先頭側に、駅 4 運行なしの列車が後方に並ぶ。
    const atsukaiRank = list().map((r) => {
      const e = r.ekiJikokuCont[4]?.ekiatsukai ?? 'none';
      return e === 'teisya' ? 0 : e === 'tsuuka' ? 1 : 2;
    });
    for (let i = 0; i + 1 < atsukaiRank.length; i++) {
      expect(atsukaiRank[i]!).toBeLessThanOrEqual(atsukaiRank[i + 1]!);
    }
  });

  it('乗継ソート設定でも並べ替えが実行できる(推定時刻ベース)', () => {
    useSettingsStore.getState().setJikokuhyouSetting('ekijikokuSort', 'transfer');
    const rows = gridRows();
    const row4 = rows.findIndex((r) => r.type === 'hatsu' && r.ekiOrder === 4);
    const { scroller } = renderView();
    clickCell(scroller, row4, 0);
    const before = bangous();
    fireEvent.click(screen.getByText('並べ替え'));
    // 実行され列車数は不変(順序は乗継配置に依存)。
    expect(list().length).toBe(before.length);
    // 駅 4 に時刻を持つ列車群は時刻順に整列している(ソート済み集合)。
    const withTime = list().filter((r) => r.ekiJikokuCont[4]?.hatsuJikoku != null);
    for (let i = 0; i + 1 < withTime.length; i++) {
      expect(withTime[i]!.ekiJikokuCont[4]!.hatsuJikoku as number).toBeLessThanOrEqual(
        withTime[i + 1]!.ekiJikokuCont[4]!.hatsuJikoku as number,
      );
    }
  });

  it('[列車番号で一本化]は分断ペアを併合する', () => {
    const rows = gridRows();
    const row8 = rows.findIndex((r) => r.type === 'chaku' && r.ekiOrder === 8);
    const { root, scroller } = renderView();
    clickCell(scroller, row8, 0);
    fireEvent.keyDown(root, { key: 'i', ctrlKey: true, shiftKey: true }); // 分断
    const split = list().length;
    clickCell(scroller, row8, 0);
    fireEvent.click(screen.getByText('列車番号で一本化'));
    expect(list().length).toBe(split - 1);
  });

  it('[最小所要時間列車に移動]はデータを変えずフォーカス列を移す', () => {
    const rows = gridRows();
    const row4 = rows.findIndex((r) => r.type === 'hatsu' && r.ekiOrder === 4);
    const { root, scroller } = renderView();
    clickCell(scroller, row4, 0);
    const before = data();
    fireEvent.click(screen.getByText('最小所要時間列車に移動'));
    expect(data()).toBe(before); // dispatch なし
    // フォーカスが移った列車のセルで Ctrl+Shift+L(+1分)を打つと、その列車に効く。
    fireEvent.keyDown(root, { key: 'l', ctrlKey: true, shiftKey: true });
    expect(data()).not.toBe(before);
  });
});
