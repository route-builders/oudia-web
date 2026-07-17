// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 oudia-second-web contributors
// @vitest-environment happy-dom

import { describe, it, expect, vi, afterEach, beforeAll } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import type { EditCommand } from '@oudia/domain';
import type { EkiJikoku } from '@oudia/format';
import { asSeconds } from '@oudia/format';
import { EkiJikokuDialog } from './EkiJikokuDialog.js';
import type { EkiJikokuDialogTarget } from './EkiJikokuDialog.js';

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

const hms = (h: number, m: number, s = 0) => asSeconds(h * 3600 + m * 60 + s);

function makeTarget(over: Partial<EkiJikoku> = {}): EkiJikokuDialogTarget {
  const ekiJikoku: EkiJikoku = {
    ekiatsukai: 'teisya',
    chakuJikoku: hms(6, 8),
    hatsuJikoku: hms(6, 9),
    ressyaTrackIndex: null,
    beforeOperationCont: [],
    afterOperationCont: [],
    ...over,
  };
  return {
    diaIndex: 0,
    houkou: 0,
    ressyaIndex: 1,
    ekiOrder: 3,
    ekiJikoku,
    ekimei: '品川',
    ressyabangou: '1021M',
    referJikoku: hms(6, 0),
  };
}

describe('EkiJikokuDialog', () => {
  it('着時刻を変えて OK すると setChaku を dispatch', () => {
    const dispatch = vi.fn<(c: EditCommand) => void>();
    render(<EkiJikokuDialog target={makeTarget()} dispatch={dispatch} onClose={vi.fn()} />);
    // 着時刻欄(encodeJikoku(6:08) = '608')。
    const input = screen.getByDisplayValue('608');
    fireEvent.change(input, { target: { value: '610' } });
    fireEvent.click(screen.getByText('OK'));
    expect(dispatch).toHaveBeenCalledWith({
      type: 'ekiJikoku/setChaku',
      diaIndex: 0,
      houkou: 0,
      ressyaIndex: 1,
      ekiOrder: 3,
      input: '610',
    });
  });

  it('通過に切り替えて OK すると toggleTsuuka を dispatch', () => {
    const dispatch = vi.fn<(c: EditCommand) => void>();
    render(<EkiJikokuDialog target={makeTarget()} dispatch={dispatch} onClose={vi.fn()} />);
    fireEvent.click(screen.getByLabelText('通過'));
    fireEvent.click(screen.getByText('OK'));
    expect(dispatch).toHaveBeenCalledWith({
      type: 'ekiJikoku/toggleTsuuka',
      diaIndex: 0,
      houkou: 0,
      ressyaIndices: [1],
      ekiOrder: 3,
    });
  });

  it('運行なしに切り替えて OK すると setKeiyunasi を dispatch', () => {
    const dispatch = vi.fn<(c: EditCommand) => void>();
    render(<EkiJikokuDialog target={makeTarget()} dispatch={dispatch} onClose={vi.fn()} />);
    fireEvent.click(screen.getByLabelText('運行なし'));
    fireEvent.click(screen.getByText('OK'));
    expect(dispatch).toHaveBeenCalledWith({
      type: 'ekiJikoku/setKeiyunasi',
      diaIndex: 0,
      houkou: 0,
      ressyaIndices: [1],
      ekiOrder: 3,
    });
  });

  it('無変更 OK では dispatch されない', () => {
    const dispatch = vi.fn<(c: EditCommand) => void>();
    const onClose = vi.fn();
    render(<EkiJikokuDialog target={makeTarget()} dispatch={dispatch} onClose={onClose} />);
    fireEvent.click(screen.getByText('OK'));
    expect(dispatch).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('不正な時刻書式ではエラー表示して閉じない', () => {
    const dispatch = vi.fn<(c: EditCommand) => void>();
    const onClose = vi.fn();
    render(<EkiJikokuDialog target={makeTarget()} dispatch={dispatch} onClose={onClose} />);
    fireEvent.change(screen.getByDisplayValue('608'), { target: { value: '99999' } });
    fireEvent.click(screen.getByText('OK'));
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByText(/書式が不正/)).toBeTruthy();
  });

  it('初期文字列(キー転送)が着時刻欄に入る', () => {
    render(
      <EkiJikokuDialog
        target={makeTarget()}
        initialKeyString="7"
        dispatch={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByDisplayValue('7')).toBeTruthy();
  });
});
