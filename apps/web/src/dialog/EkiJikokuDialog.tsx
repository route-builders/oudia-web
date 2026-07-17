// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 oudia-second-web contributors
//
// Based on OuDiaSecond (Copyright (C) 2017-2026 diagram_mania)
// and OuDia (Copyright (C) 2006-2017 take-okm)

/**
 * 駅時刻のプロパティダイアログ(design §05 5.3.1)。駅扱(停車/通過/運行なし)・着/発時刻を編集。
 * 時刻欄は blur/OK 時に decode + 2 桁時補完(getJikokuFromUI 忠実、domain の
 * decodeJikokuWithHourCompletion)。始発駅では補完しない。番線は v0.6〜(本 M3 では非表示)。
 *
 * コミットは 1 ダイアログ = 1 コマンド ではなく、変更のあった項目それぞれを dispatch する
 * (駅扱変更 → toggleTsuuka/setKeiyunasi、時刻 → setChaku/setHatsu)。各 dispatch は
 * executeCommand の 1 単位。M4 の連動(繰上げ繰下げ)は modify フラグで将来対応。
 */

import { useState } from 'react';
import type { EkiJikoku, Ekiatsukai, Jikoku } from '@oudia/format';
import { encodeJikoku } from '@oudia/format';
import type { EditCommand } from '@oudia/domain';
import { decodeJikokuWithHourCompletion } from '@oudia/domain';
import { Dialog } from './Dialog.js';

export interface EkiJikokuDialogTarget {
  diaIndex: number;
  houkou: 0 | 1;
  ressyaIndex: number;
  ekiOrder: number;
  /** 現在の駅時刻(表示初期値)。 */
  ekiJikoku: EkiJikoku;
  /** 見出し用: 駅名・列車番号。 */
  ekimei: string;
  ressyabangou: string;
  /** 時補完の参照時刻(前駅の発時刻優先。始発駅は null で補完しない)。 */
  referJikoku: Jikoku;
}

export function EkiJikokuDialog(props: {
  target: EkiJikokuDialogTarget;
  /** 初期文字列(キー転送。着時刻欄へ入る)。 */
  initialKeyString?: string;
  dispatch: (cmd: EditCommand) => void;
  onClose: () => void;
}): React.ReactElement {
  const { target, initialKeyString, dispatch, onClose } = props;
  const ej = target.ekiJikoku;

  const [ekiatsukai, setEkiatsukai] = useState<Ekiatsukai>(ej.ekiatsukai);
  const [chaku, setChaku] = useState<string>(initialKeyString ?? encodeJikoku(ej.chakuJikoku));
  const [hatsu, setHatsu] = useState<string>(encodeJikoku(ej.hatsuJikoku));
  const [error, setError] = useState<string | null>(null);

  const commit = (): void => {
    // 1) 駅扱の変更(none/tsuuka)。teisya への昇格は時刻書込で自動化されるため、
    //    ここでは通過・運行なしのみ明示コマンド化する。
    if (ekiatsukai !== ej.ekiatsukai) {
      if (ekiatsukai === 'tsuuka') {
        dispatch({
          type: 'ekiJikoku/toggleTsuuka',
          diaIndex: target.diaIndex,
          houkou: target.houkou,
          ressyaIndices: [target.ressyaIndex],
          ekiOrder: target.ekiOrder,
        });
      } else if (ekiatsukai === 'none') {
        dispatch({
          type: 'ekiJikoku/setKeiyunasi',
          diaIndex: target.diaIndex,
          houkou: target.houkou,
          ressyaIndices: [target.ressyaIndex],
          ekiOrder: target.ekiOrder,
        });
      }
    }

    // 2) 時刻(停車のときのみ有効)。通過/運行なしなら時刻編集はスキップ。
    if (ekiatsukai === 'teisya' || (ekiatsukai === ej.ekiatsukai && ekiatsukai !== 'tsuuka')) {
      // 着/発の decode 検証(時補完込み)。invalid ならエラー表示して閉じない。
      const decChaku = decodeJikokuWithHourCompletion(chaku, target.referJikoku);
      const decHatsu = decodeJikokuWithHourCompletion(hatsu, target.referJikoku);
      if (decChaku === 'invalid' || decHatsu === 'invalid') {
        setError('時刻の書式が不正です(例: 915 / 1315 / 131545)。');
        return;
      }
      if (chaku !== encodeJikoku(ej.chakuJikoku)) {
        dispatch({
          type: 'ekiJikoku/setChaku',
          diaIndex: target.diaIndex,
          houkou: target.houkou,
          ressyaIndex: target.ressyaIndex,
          ekiOrder: target.ekiOrder,
          input: chaku,
        });
      }
      if (hatsu !== encodeJikoku(ej.hatsuJikoku)) {
        dispatch({
          type: 'ekiJikoku/setHatsu',
          diaIndex: target.diaIndex,
          houkou: target.houkou,
          ressyaIndex: target.ressyaIndex,
          ekiOrder: target.ekiOrder,
          input: hatsu,
        });
      }
    }
    onClose();
  };

  // blur 時の正規化: decode 成功なら表示書式へ再整形(原典 blur 正規化)。
  const normalizeField = (raw: string, set: (v: string) => void): void => {
    const dec = decodeJikokuWithHourCompletion(raw, target.referJikoku);
    if (dec !== 'invalid') set(encodeJikoku(dec));
  };

  const timeDisabled = ekiatsukai !== 'teisya';

  return (
    <Dialog
      title={`駅時刻のプロパティ — ${target.ekimei} — ${target.ressyabangou}`}
      onOk={commit}
      onCancel={onClose}
    >
      <fieldset className="dialog-field">
        <legend>駅扱</legend>
        {(['teisya', 'tsuuka', 'none'] as const).map((v) => (
          <label key={v}>
            <input
              type="radio"
              name="ekiatsukai"
              checked={ekiatsukai === v}
              onChange={() => {
                setEkiatsukai(v);
              }}
            />
            {v === 'teisya' ? '停車' : v === 'tsuuka' ? '通過' : '運行なし'}
          </label>
        ))}
      </fieldset>

      <label className="dialog-field">
        着時刻
        <input
          type="text"
          inputMode="numeric"
          value={chaku}
          disabled={timeDisabled}
          onChange={(e) => {
            setChaku(e.target.value);
          }}
          onBlur={() => {
            normalizeField(chaku, setChaku);
          }}
        />
      </label>

      <label className="dialog-field">
        発時刻
        <input
          type="text"
          inputMode="numeric"
          value={hatsu}
          disabled={timeDisabled}
          onChange={(e) => {
            setHatsu(e.target.value);
          }}
          onBlur={() => {
            normalizeField(hatsu, setHatsu);
          }}
        />
      </label>

      {error !== null && <p className="dialog-error">{error}</p>}
    </Dialog>
  );
}
