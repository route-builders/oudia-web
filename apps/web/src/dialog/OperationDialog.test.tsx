// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 up-tri
// @vitest-environment happy-dom

/** 作業編集ダイアログ(OperationDialog)の統合テスト(PR-3)。 */

import type { AfterOperation, BeforeOperation } from '@oudia-web/format';
import { asSeconds } from '@oudia-web/format';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { OperationDialog, type OperationDialogTarget } from './OperationDialog.js';

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

afterEach(cleanup);

function makeTarget(over: Partial<OperationDialogTarget> = {}): OperationDialogTarget {
  return {
    diaIndex: 0,
    houkou: 0,
    ressyaIndex: 0,
    ekiOrder: 0,
    beforeCont: [],
    afterCont: [],
    chakuJikoku: null,
    hatsuJikoku: asSeconds(3600),
    isTeisya: true,
    tracks: [
      { trackName: '1番線', trackRyakusyou: '1', trackNoboriRyakusyou: '' },
      { trackName: '2番線', trackRyakusyou: '2', trackNoboriRyakusyou: '' },
    ],
    outerTerminals: [{ ekimei: '車庫前', jikokuRyaku: '', diaRyaku: '' }],
    ekimei: 'A駅',
    ...over,
  };
}

describe('OperationDialog', () => {
  it('既存の出区作業を表示する', () => {
    const before: BeforeOperation[] = [
      { kind: 'out', outJikoku: asSeconds(3540), inOutLinkCode: '', operationNumbers: ['1'] },
    ];
    render(
      <OperationDialog
        target={makeTarget({ beforeCont: before })}
        onOk={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    // 前作業リストの行(op-row)に「出区」の書式文字列が出る。
    const rows = document.querySelectorAll('.op-row');
    const texts = Array.from(rows).map((r) => r.textContent ?? '');
    expect(texts.some((t) => t.includes('出区'))).toBe(true);
  });

  it('空の作業列でも開き、番兵「(作業を追加)」が出る', () => {
    render(<OperationDialog target={makeTarget()} onOk={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getAllByText('(作業を追加)').length).toBeGreaterThan(0);
  });

  it('OK で前後作業の union を返す(既存を保持)', () => {
    const before: BeforeOperation[] = [
      { kind: 'out', outJikoku: asSeconds(3540), inOutLinkCode: 'AB', operationNumbers: ['1'] },
    ];
    const after: AfterOperation[] = [{ kind: 'in', inJikoku: asSeconds(7200), inOutLinkCode: '' }];
    const onOk = vi.fn<(b: BeforeOperation[], a: AfterOperation[]) => void>();
    render(
      <OperationDialog
        target={makeTarget({ beforeCont: before, afterCont: after })}
        onOk={onOk}
        onClose={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByText('OK'));
    expect(onOk).toHaveBeenCalledTimes(1);
    const [b, a] = onOk.mock.calls[0] ?? [];
    expect(b?.[0]?.kind).toBe('out');
    if (b?.[0]?.kind === 'out') {
      expect(b[0].inOutLinkCode).toBe('AB');
      expect(b[0].operationNumbers).toEqual(['1']);
    }
    expect(a?.[0]?.kind).toBe('in');
  });

  it('種別を入換→解結に変えると子作業が生えて union に入れ子ができる', () => {
    const before: BeforeOperation[] = [
      {
        kind: 'shunt',
        shuntTrackIndex: 0,
        shuntHatsuJikoku: null,
        shuntChakuJikoku: null,
        displayJikoku: false,
      },
    ];
    const onOk = vi.fn<(b: BeforeOperation[], a: AfterOperation[]) => void>();
    render(
      <OperationDialog target={makeTarget({ beforeCont: before })} onOk={onOk} onClose={vi.fn()} />,
    );
    // 前作業の入換行を選択(既定で最初の行が選択済み)。解結ラジオへ変更。
    const releaseRadio = screen.getByLabelText('解結');
    fireEvent.click(releaseRadio);
    fireEvent.click(screen.getByText('OK'));
    const [b] = onOk.mock.calls[0] ?? [];
    expect(b?.[0]?.kind).toBe('release');
    if (b?.[0]?.kind === 'release') {
      // 解結の子(後作業)に次列車接続が 1 件。
      expect(b[0].formationAfterOperationCont.length).toBeGreaterThan(0);
    }
  });
});
