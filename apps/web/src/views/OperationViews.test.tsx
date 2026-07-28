// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 up-tri
// @vitest-environment happy-dom

/**
 * 運用系ビュー(運用一覧表 / 運用一覧図 / 運用表 / 入出区連携コード一覧)の配線テスト。M7d。
 * sample2.oud2(EnableOperation=2)を読み、ツリー導線とタブが機能することを確認する。
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { RosenFileData } from '@oudia-web/format';
import { parseNodeTree, readRosenFile } from '@oudia-web/format';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { RosenTree } from '../shell/RosenTree.js';
import { useDocStore } from '../store/docStore.js';
import { AllOperationTableView } from './AllOperationTableView.js';
import { InOutLinkCodeListView } from './InOutLinkCodeListView.js';

const here = dirname(fileURLToPath(import.meta.url));

function loadSample2(): RosenFileData {
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
  const parsed = parseNodeTree(bytes);
  if (!parsed.ok) throw new Error('parse failed');
  return readRosenFile(parsed.root).data;
}

let data: RosenFileData;

beforeEach(() => {
  data = loadSample2();
  useDocStore.getState().loadData(data, 'sample2.oud2', 0);
});
afterEach(cleanup);

describe('路線ツリーの運用系導線', () => {
  it('EnableOperation=2 なら 運用一覧表 / 運用一覧図 / 入出区連携コード一覧 が並ぶ', () => {
    render(<RosenTree data={data} />);
    expect(screen.getAllByText('運用一覧表').length).toBeGreaterThan(0);
    expect(screen.getAllByText('運用一覧図').length).toBeGreaterThan(0);
    expect(screen.getAllByText('入出区連携コード一覧').length).toBeGreaterThan(0);
  });

  it('EnableOperation<2 では運用系の項目が出ない', () => {
    const off: RosenFileData = {
      ...data,
      rosen: { ...data.rosen, enableOperation: 1 },
    };
    render(<RosenTree data={off} />);
    expect(screen.queryByText('運用一覧表')).toBeNull();
    expect(screen.queryByText('入出区連携コード一覧')).toBeNull();
  });

  it('運用一覧表をクリックするとタブが開く', () => {
    render(<RosenTree data={data} />);
    fireEvent.click(screen.getAllByText('運用一覧表')[0]!);
    const tabs = useDocStore.getState().tabs;
    expect(tabs.some((t) => t.key === 'allOperationTable:0:t')).toBe(true);
  });
});

describe('AllOperationTableView', () => {
  it('運用が並び、並び順を切り替えられる', () => {
    render(<AllOperationTableView data={data} diaIndex={0} graphical={false} />);
    // 見出しが出る = 表レンダラが動いている。
    expect(screen.getByText('運用番号')).toBeTruthy();
    expect(screen.getByText('出区駅名')).toBeTruthy();
    const select = screen.getByLabelText<HTMLSelectElement>(/並び順/);
    fireEvent.change(select, { target: { value: 'outJikoku' } });
    expect(select.value).toBe('outJikoku');
  });

  it('図に切り替えると別タブとして開く', () => {
    render(<AllOperationTableView data={data} diaIndex={0} graphical={false} />);
    fireEvent.click(screen.getByText('図で見る'));
    expect(useDocStore.getState().tabs.some((t) => t.key === 'allOperationTable:0:g')).toBe(true);
  });

  it('EnableOperation<2 では案内文を出す', () => {
    const off: RosenFileData = { ...data, rosen: { ...data.rosen, enableOperation: 0 } };
    render(<AllOperationTableView data={off} diaIndex={0} graphical={false} />);
    expect(screen.getByText(/運用機能が「通常」/)).toBeTruthy();
  });
});

describe('InOutLinkCodeListView', () => {
  it('連携コードがなければ案内文を出す', () => {
    render(<InOutLinkCodeListView data={data} diaIndex={0} />);
    // sample2 に連携コードがなければ案内、あればヘッダが出る。どちらかであればよい。
    const empty = screen.queryByText(/入出区連携コードが設定された作業がありません/);
    if (empty === null) {
      expect(screen.getByText('連携コード')).toBeTruthy();
    } else {
      expect(empty).toBeTruthy();
    }
  });
});
