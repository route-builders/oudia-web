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
    const input = screen.getByLabelText<HTMLInputElement>('着時刻');
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

  it('通過に切り替えて OK すると setEkiatsukai(tsuuka)のみ dispatch(時刻は保持され再送しない)', () => {
    const dispatch = vi.fn<(c: EditCommand) => void>();
    render(<EkiJikokuDialog target={makeTarget()} dispatch={dispatch} onClose={vi.fn()} />);
    fireEvent.click(screen.getByLabelText<HTMLInputElement>('通過'));
    fireEvent.click(screen.getByText('OK'));
    // 原典: 停車⇔通過の切替は時刻を保持(レデューサも消さない)。時刻欄は無変更なので送らない。
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledWith({
      type: 'ekiJikoku/setEkiatsukai',
      diaIndex: 0,
      houkou: 0,
      ressyaIndices: [1],
      ekiOrder: 3,
      ekiatsukai: 'tsuuka',
    });
  });

  it('運行なしに切り替えて OK すると setEkiatsukai(none)のみ dispatch(時刻は送らない)', () => {
    const dispatch = vi.fn<(c: EditCommand) => void>();
    render(<EkiJikokuDialog target={makeTarget()} dispatch={dispatch} onClose={vi.fn()} />);
    fireEvent.click(screen.getByLabelText<HTMLInputElement>('運行なし'));
    fireEvent.click(screen.getByText('OK'));
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledWith({
      type: 'ekiJikoku/setEkiatsukai',
      diaIndex: 0,
      houkou: 0,
      ressyaIndices: [1],
      ekiOrder: 3,
      ekiatsukai: 'none',
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
    fireEvent.change(screen.getByLabelText<HTMLInputElement>('着時刻'), {
      target: { value: '99999' },
    });
    fireEvent.click(screen.getByText('OK'));
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByText(/書式が不正/)).toBeTruthy();
  });

  it('検証エラー時は駅扱変更も含め何も dispatch されない(検証は全書込みより前。原典 EndEdit)', () => {
    const dispatch = vi.fn<(c: EditCommand) => void>();
    const onClose = vi.fn();
    render(<EkiJikokuDialog target={makeTarget()} dispatch={dispatch} onClose={onClose} />);
    // 駅扱を通過へ変更しつつ、発時刻に不正文字列 → OK。
    fireEvent.click(screen.getByLabelText<HTMLInputElement>('通過'));
    fireEvent.change(screen.getByLabelText<HTMLInputElement>('発時刻'), {
      target: { value: 'abc' },
    });
    fireEvent.click(screen.getByText('OK'));
    // エラー表示・非クローズに加え、setEkiatsukai も送られていないこと(部分確定の禁止)。
    expect(dispatch).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    // 入力を修正して OK し直すと、駅扱 + 発時刻がそれぞれ 1 回ずつ dispatch される。
    fireEvent.change(screen.getByLabelText<HTMLInputElement>('発時刻'), {
      target: { value: '620' },
    });
    fireEvent.click(screen.getByText('OK'));
    expect(dispatch).toHaveBeenCalledTimes(2);
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'ekiJikoku/setEkiatsukai', ekiatsukai: 'tsuuka' }),
    );
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'ekiJikoku/setHatsu', input: '620' }),
    );
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('時刻を編集してから運行なしを選んで OK すると setEkiatsukai(none)のみ 1 件 dispatch される', () => {
    // OK 時の停車自動昇格が「ユーザが明示的に運行なしへ変更した」ケースを上書きしないこと
    // (timesEnabled ガードの回帰検証)。
    const dispatch = vi.fn<(c: EditCommand) => void>();
    render(<EkiJikokuDialog target={makeTarget()} dispatch={dispatch} onClose={vi.fn()} />);
    const chaku = screen.getByLabelText<HTMLInputElement>('着時刻');
    fireEvent.change(chaku, { target: { value: '610' } });
    fireEvent.blur(chaku);
    fireEvent.click(screen.getByLabelText<HTMLInputElement>('運行なし'));
    fireEvent.click(screen.getByText('OK'));
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'ekiJikoku/setEkiatsukai', ekiatsukai: 'none' }),
    );
  });

  it('初期文字列(キー転送)は既定で着時刻欄に入り、フォーカスもそこへ', () => {
    render(
      <EkiJikokuDialog
        target={makeTarget()}
        initialKeyString="7"
        dispatch={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    const chaku = screen.getByLabelText<HTMLInputElement>('着時刻');
    expect(chaku.value).toBe('7');
    expect(document.activeElement).toBe(chaku);
  });

  it('initialField=hatsu なら初期文字列は発時刻欄に入る(着時刻欄は元の値のまま)', () => {
    const dispatch = vi.fn<(c: EditCommand) => void>();
    render(
      <EkiJikokuDialog
        target={makeTarget()}
        initialKeyString="7"
        initialField="hatsu"
        dispatch={dispatch}
        onClose={vi.fn()}
      />,
    );
    const hatsu = screen.getByLabelText<HTMLInputElement>('発時刻');
    expect(hatsu.value).toBe('7');
    expect(screen.getByLabelText<HTMLInputElement>('着時刻').value).toBe('608');
    expect(document.activeElement).toBe(hatsu);
    // 続けて入力して OK → setHatsu のみ(着は不変)。
    fireEvent.change(hatsu, { target: { value: '710' } });
    fireEvent.click(screen.getByText('OK'));
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'ekiJikoku/setHatsu', input: '710' }),
    );
    expect(dispatch).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'ekiJikoku/setChaku' }),
    );
  });

  it('運行なしセルへのキー転送は「停車」へ自動昇格して入力を受け付ける', () => {
    const dispatch = vi.fn<(c: EditCommand) => void>();
    const target = makeTarget({ ekiatsukai: 'none', chakuJikoku: null, hatsuJikoku: null });
    render(
      <EkiJikokuDialog
        target={target}
        initialKeyString="6"
        dispatch={dispatch}
        onClose={vi.fn()}
      />,
    );
    // 駅扱が停車に昇格し、時刻欄が有効で続けて入力できる。
    expect(screen.getByLabelText<HTMLInputElement>('停車').checked).toBe(true);
    const chaku = screen.getByLabelText<HTMLInputElement>('着時刻');
    expect(chaku.disabled).toBe(false);
    expect(chaku.value).toBe('6');
    fireEvent.change(chaku, { target: { value: '605' } });
    fireEvent.click(screen.getByText('OK'));
    // 停車化 + 着時刻の両方が dispatch される。
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'ekiJikoku/setEkiatsukai', ekiatsukai: 'teisya' }),
    );
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'ekiJikoku/setChaku', input: '605' }),
    );
  });

  it('運行なしセルで停車ラジオを選ぶだけ(時刻入力なし)でも停車化が dispatch される', () => {
    const dispatch = vi.fn<(c: EditCommand) => void>();
    const target = makeTarget({ ekiatsukai: 'none', chakuJikoku: null, hatsuJikoku: null });
    render(<EkiJikokuDialog target={target} dispatch={dispatch} onClose={vi.fn()} />);
    fireEvent.click(screen.getByLabelText<HTMLInputElement>('停車'));
    fireEvent.click(screen.getByText('OK'));
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'ekiJikoku/setEkiatsukai', ekiatsukai: 'teisya' }),
    );
  });

  it('時刻欄は開いた時点では駅扱によらず有効(運行なしは「有効・空」。原典 UiDataFromTarget)', () => {
    const { unmount } = render(
      <EkiJikokuDialog
        target={makeTarget({ ekiatsukai: 'tsuuka', chakuJikoku: null, hatsuJikoku: null })}
        dispatch={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByLabelText<HTMLInputElement>('着時刻').disabled).toBe(false);
    expect(screen.getByLabelText<HTMLInputElement>('発時刻').disabled).toBe(false);
    unmount();

    render(
      <EkiJikokuDialog
        target={makeTarget({ ekiatsukai: 'none', chakuJikoku: null, hatsuJikoku: null })}
        dispatch={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    const chaku = screen.getByLabelText<HTMLInputElement>('着時刻');
    expect(chaku.disabled).toBe(false); // 運行なしでも有効・空
    expect(chaku.value).toBe('');
  });

  it('ラジオを運行なしへ変更すると時刻欄が無効化され、停車へ戻すと有効化される', () => {
    render(<EkiJikokuDialog target={makeTarget()} dispatch={vi.fn()} onClose={vi.fn()} />);
    fireEvent.click(screen.getByLabelText<HTMLInputElement>('運行なし'));
    expect(screen.getByLabelText<HTMLInputElement>('着時刻').disabled).toBe(true);
    fireEvent.click(screen.getByLabelText<HTMLInputElement>('停車'));
    expect(screen.getByLabelText<HTMLInputElement>('着時刻').disabled).toBe(false);
  });

  it('運行なしセルで時刻を入力して blur すると駅扱が停車へ自動昇格する(原典 AdjustUiData)', () => {
    const dispatch = vi.fn<(c: EditCommand) => void>();
    const target = makeTarget({ ekiatsukai: 'none', chakuJikoku: null, hatsuJikoku: null });
    render(<EkiJikokuDialog target={target} dispatch={dispatch} onClose={vi.fn()} />);
    const chaku = screen.getByLabelText<HTMLInputElement>('着時刻');
    fireEvent.change(chaku, { target: { value: '605' } });
    fireEvent.blur(chaku);
    expect(screen.getByLabelText<HTMLInputElement>('停車').checked).toBe(true);
    fireEvent.click(screen.getByText('OK'));
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'ekiJikoku/setEkiatsukai', ekiatsukai: 'teisya' }),
    );
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'ekiJikoku/setChaku', input: '605' }),
    );
  });

  it('blur せず OK した場合も運行なし + 時刻入力は停車として確定される', () => {
    const dispatch = vi.fn<(c: EditCommand) => void>();
    const target = makeTarget({ ekiatsukai: 'none', chakuJikoku: null, hatsuJikoku: null });
    render(<EkiJikokuDialog target={target} dispatch={dispatch} onClose={vi.fn()} />);
    fireEvent.change(screen.getByLabelText<HTMLInputElement>('着時刻'), {
      target: { value: '605' },
    });
    fireEvent.click(screen.getByText('OK'));
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'ekiJikoku/setEkiatsukai', ekiatsukai: 'teisya' }),
    );
  });
});
