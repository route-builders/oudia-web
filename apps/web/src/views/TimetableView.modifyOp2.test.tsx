// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 up-tri
// @vitest-environment happy-dom

// 駅時刻変更ダイアログ(Ctrl+M)+ 再実行(Ctrl+'.')のビュー統合検証。

import { buildTimetableGrid, defaultTimetableGridOptions } from '@oudia-web/derive';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { parseBytes } from '../file/openFile.js';
import { useDocStore } from '../store/docStore.js';
import { TimetableView } from './TimetableView.js';

const here = dirname(fileURLToPath(import.meta.url));
const ROW_H = 20;
const EKIMEI_W = 96;
const COL_W = 64;

beforeAll(() => {
  const proto = HTMLDialogElement.prototype as unknown as {
    showModal: () => void;
    close: () => void;
  };
  proto.showModal = function showModal(this: HTMLDialogElement) {
    this.open = true;
  };
  proto.close = function close(this: HTMLDialogElement) {
    this.open = false;
  };
});

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
const train0 = () => data().rosen.diaCont[0]!.ressyaCont[0][0]!;

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

describe('TimetableView(駅時刻変更 + 再実行)', () => {
  beforeEach(() => {
    (HTMLCanvasElement.prototype as unknown as { getContext: () => unknown }).getContext = () =>
      null;
    loadSample();
  });
  afterEach(() => {
    cleanup();
    useDocStore.setState({ docState: null, data: null, clipboard: null, modifyOp2ByView: {} });
  });

  function renderView(): { root: Element; scroller: Element } {
    render(<TimetableView data={data()} diaIndex={0} houkou={0} />);
    return {
      root: document.querySelector('.grid-root')!,
      scroller: document.querySelector('.grid-scroller')!,
    };
  }

  function focusHatsu4(root: Element, scroller: Element): void {
    const rows = gridRows();
    const row = rows.findIndex((r) => r.type === 'hatsu' && r.ekiOrder === 4);
    clickCell(scroller, row, 0);
    void root;
  }

  it('Alt+M でダイアログが開き、繰下げ 1 分 30 秒で OK すると以後へ伝播 + フォーカス次駅へ', () => {
    const { root, scroller } = renderView();
    focusHatsu4(root, scroller);
    fireEvent.keyDown(root, { key: 'm', altKey: true });
    expect(screen.getByText('駅時刻変更')).toBeTruthy();

    fireEvent.click(screen.getByLabelText<HTMLInputElement>(/繰下げ\/繰上げ/));
    fireEvent.change(screen.getByLabelText<HTMLInputElement>('繰下げ分'), {
      target: { value: '1' },
    });
    fireEvent.change(screen.getByLabelText<HTMLInputElement>('繰下げ秒'), {
      target: { value: '30' },
    });
    fireEvent.click(screen.getByText('OK'));

    expect(train0().ekiJikokuCont[4]!.hatsuJikoku).toBe(780 + 90);
    expect(train0().ekiJikokuCont[6]!.hatsuJikoku).toBe(1020 + 90);
    expect(train0().ekiJikokuCont[4]!.chakuJikoku).toBe(720); // 発基準・着不変

    // 再実行(Ctrl+'.')はフォーカス位置(次駅の時刻行)へ同じ操作を相対適用する。
    fireEvent.keyDown(root, { key: '.', code: 'Period', ctrlKey: true });
    // 駅 4 の次の時刻行 = 駅 5 の発行(通過・時刻 null)→ シフトは null をスキップし
    // 以後の非 null(駅 6〜)がさらに +90 される。
    expect(train0().ekiJikokuCont[6]!.hatsuJikoku).toBe(1020 + 180);
    expect(train0().ekiJikokuCont[4]!.hatsuJikoku).toBe(780 + 90); // 前方は 1 回分のみ
  });

  it('列車番号行では Ctrl+M が無効(ダイアログが開かない)', () => {
    const { root, scroller } = renderView();
    clickCell(scroller, 0, 0);
    fireEvent.keyDown(root, { key: 'm', ctrlKey: true });
    expect(screen.queryByText('駅時刻変更')).toBeNull();
  });

  it('記憶が無い状態の再実行は完全 no-op', () => {
    const { root, scroller } = renderView();
    focusHatsu4(root, scroller);
    const before = data();
    fireEvent.keyDown(root, { key: '.', ctrlKey: true });
    expect(data()).toBe(before);
  });

  it('「変更しない」で OK すると記憶が NULL 化し再実行が無効になる', () => {
    const { root, scroller } = renderView();
    focusHatsu4(root, scroller);
    // まず繰下げを実行して記憶を作る。
    fireEvent.keyDown(root, { key: 'm', altKey: true });
    fireEvent.click(screen.getByLabelText<HTMLInputElement>(/繰下げ\/繰上げ/));
    fireEvent.change(screen.getByLabelText<HTMLInputElement>('繰下げ分'), {
      target: { value: '1' },
    });
    fireEvent.click(screen.getByText('OK'));
    // 「変更しない」で OK し直す(データは変わらない。記憶のみ NULL 化)。
    fireEvent.keyDown(root, { key: 'm', altKey: true });
    fireEvent.click(screen.getByLabelText<HTMLInputElement>('変更しない'));
    const snapshot = data();
    fireEvent.click(screen.getByText('OK'));
    expect(data()).toBe(snapshot);
    // 再実行は no-op。
    fireEvent.keyDown(root, { key: '.', ctrlKey: true });
    expect(data()).toBe(snapshot);
  });

  it('キャンセルでは記憶もデータも変わらない', () => {
    const { root, scroller } = renderView();
    focusHatsu4(root, scroller);
    fireEvent.keyDown(root, { key: 'm', altKey: true });
    fireEvent.click(screen.getByLabelText<HTMLInputElement>(/繰下げ\/繰上げ/));
    fireEvent.change(screen.getByLabelText<HTMLInputElement>('繰下げ分'), {
      target: { value: '5' },
    });
    const before = data();
    fireEvent.click(screen.getByText('キャンセル'));
    expect(data()).toBe(before);
    expect(useDocStore.getState().modifyOp2ByView['0:0']).toBeUndefined();
  });

  it('他駅からコピー: コピー元は絶対・適用先はフォーカスの着/発', () => {
    const { root, scroller } = renderView();
    focusHatsu4(root, scroller);
    fireEvent.keyDown(root, { key: 'm', altKey: true });
    fireEvent.click(screen.getByLabelText<HTMLInputElement>(/他駅からコピー/));
    // コピー元 = 駅Order 6 の発(index 13)、+60 秒。
    fireEvent.change(screen.getByLabelText<HTMLSelectElement>('コピー元'), {
      target: { value: String(6 * 2 + 1) },
    });
    fireEvent.change(screen.getByLabelText<HTMLInputElement>('コピー分'), {
      target: { value: '1' },
    });
    fireEvent.change(screen.getByLabelText<HTMLInputElement>('コピー秒'), {
      target: { value: '0' },
    });
    fireEvent.click(screen.getByText('OK'));
    expect(train0().ekiJikokuCont[4]!.hatsuJikoku).toBe(1020 + 60); // 駅 6 発 + 60
    expect(train0().ekiJikokuCont[6]!.hatsuJikoku).toBe(1020); // 伝播なし
  });

  it('不正な数値では閉じずエラー表示、データも不変', () => {
    const { root, scroller } = renderView();
    focusHatsu4(root, scroller);
    fireEvent.keyDown(root, { key: 'm', altKey: true });
    fireEvent.click(screen.getByLabelText<HTMLInputElement>(/繰下げ\/繰上げ/));
    fireEvent.change(screen.getByLabelText<HTMLInputElement>('繰下げ分'), {
      target: { value: 'abc' },
    });
    const before = data();
    fireEvent.click(screen.getByText('OK'));
    expect(screen.getByText(/整数を入力/)).toBeTruthy();
    expect(screen.getByText('駅時刻変更')).toBeTruthy(); // 閉じない
    expect(data()).toBe(before);
  });
});
