// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 up-tri
// @vitest-environment happy-dom

import type { EditCommand } from '@oudia-web/domain';
import type { Ressya, Ressyasyubetsu } from '@oudia-web/format';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { RessyaPropDialogTarget } from './RessyaPropDialog.js';
import { RessyaPropDialog } from './RessyaPropDialog.js';

// happy-dom は <dialog>.showModal を実装しないためスタブ化。
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

const SYUBETSU: Ressyasyubetsu[] = [
  { syubetsumei: '普通' } as Ressyasyubetsu,
  { syubetsumei: '急行' } as Ressyasyubetsu,
];

function makeTarget(over: Partial<Ressya> = {}): RessyaPropDialogTarget {
  const ressya: Ressya = {
    isNull: false,
    houkou: 0,
    syubetsuIndex: 0,
    ressyabangou: '101M',
    ressyamei: 'あさかぜ',
    gousuu: '1',
    bikou: '',
    isCanceled: false,
    ekiJikokuCont: [],
    ...over,
  };
  return { diaIndex: 0, houkou: 0, ressyaIndex: 2, ressya, syubetsuCont: SYUBETSU };
}

describe('RessyaPropDialog', () => {
  it('無変更で OK すると dispatch されない', () => {
    const dispatch = vi.fn<(c: EditCommand) => void>();
    const onClose = vi.fn();
    render(<RessyaPropDialog target={makeTarget()} dispatch={dispatch} onClose={onClose} />);
    fireEvent.click(screen.getByText('OK'));
    expect(dispatch).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('列車番号を変えて OK すると setProp(ressyabangou) を dispatch', () => {
    const dispatch = vi.fn<(c: EditCommand) => void>();
    render(<RessyaPropDialog target={makeTarget()} dispatch={dispatch} onClose={vi.fn()} />);
    const input = screen.getByDisplayValue('101M');
    fireEvent.change(input, { target: { value: '9999X' } });
    fireEvent.click(screen.getByText('OK'));
    expect(dispatch).toHaveBeenCalledWith({
      type: 'ressya/setProp',
      diaIndex: 0,
      houkou: 0,
      ressyaIndex: 2,
      prop: { key: 'ressyabangou', value: '9999X' },
    });
  });

  it('運休チェックで setCanceled を dispatch', () => {
    const dispatch = vi.fn<(c: EditCommand) => void>();
    render(<RessyaPropDialog target={makeTarget()} dispatch={dispatch} onClose={vi.fn()} />);
    fireEvent.click(screen.getByLabelText('運休'));
    fireEvent.click(screen.getByText('OK'));
    expect(dispatch).toHaveBeenCalledWith({
      type: 'ressya/setCanceled',
      diaIndex: 0,
      houkou: 0,
      ressyaIndices: [2],
      canceled: true,
    });
  });

  it('種別 select 変更で setProp(syubetsuIndex) を dispatch', () => {
    const dispatch = vi.fn<(c: EditCommand) => void>();
    render(<RessyaPropDialog target={makeTarget()} dispatch={dispatch} onClose={vi.fn()} />);
    fireEvent.change(screen.getByDisplayValue('普通'), { target: { value: '1' } });
    fireEvent.click(screen.getByText('OK'));
    expect(dispatch).toHaveBeenCalledWith({
      type: 'ressya/setProp',
      diaIndex: 0,
      houkou: 0,
      ressyaIndex: 2,
      prop: { key: 'syubetsuIndex', value: 1 },
    });
  });

  it('初期文字列(キー転送)が列車番号欄に入る', () => {
    render(
      <RessyaPropDialog
        target={makeTarget()}
        initialKeyString="7"
        dispatch={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByDisplayValue('7')).toBeTruthy();
  });

  it('キャンセルで dispatch されず onClose', () => {
    const dispatch = vi.fn<(c: EditCommand) => void>();
    const onClose = vi.fn();
    render(<RessyaPropDialog target={makeTarget()} dispatch={dispatch} onClose={onClose} />);
    fireEvent.click(screen.getByText('キャンセル'));
    expect(dispatch).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledOnce();
  });
});
