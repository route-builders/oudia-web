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
 * 挙動(原典 CPropEditUI_Ekijikoku 準拠):
 * - 時刻欄は開いた時点では駅扱によらず有効(運行なしなら「有効・空」。UiDataFromTarget)。
 *   無効になるのは編集中にラジオを「運行なし」へ変更したときのみ(AdjustUiData)。
 * - 運行なしのまま時刻欄が変更されたら駅扱を「停車」へ自動昇格する(blur / OK 時。
 *   AdjustUiData。キー転送で開いた場合は開いた時点で昇格させる = 同じ確定結果の簡略化)。
 * - 停車⇔通過の切替では時刻を保持する(消去は None 化のときだけ。CentDedEkiJikoku::setEkiatsukai)。
 * - キー転送(initialKeyString)はフォーカス行に応じて着欄 / 発欄へ入る(initialField)。
 *   原典は既存文字列を全選択しておき転送キーで置換する — 初期値を転送文字列にするのと等価。
 * - 開いたとき対象時刻欄へフォーカスし、カーソルは末尾(design §5.2)。
 * - コミット: 駅扱変更 → ekiJikoku/setEkiatsukai、時刻変更 → ekiJikoku/writeJikoku を dispatch。
 *   [時刻の繰上げ・繰下げ]チェック(原典 m_bModifyEkijikoku、既定 ON)が ON なら
 *   writeJikoku の modify=true(原典 modifyCentDedEkiJikoku: 発差分を以後の駅へ伝播)。
 */

import { useEffect, useRef, useState } from 'react';
import type { EkiJikoku, Ekiatsukai, Jikoku } from '@oudia/format';
import { encodeJikoku } from '@oudia/format';
import type { EditCommand } from '@oudia/domain';
import { decodeJikokuWithHourCompletion } from '@oudia/domain';
import { useSettingsStore } from '../store/settingsStore.js';
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
  /** 初期文字列(キー転送。initialField の欄へ入る)。 */
  initialKeyString?: string;
  /** キー転送・初期フォーカスの宛先(フォーカス行が着行なら 'chaku'、発行なら 'hatsu')。既定 'chaku'。 */
  initialField?: 'chaku' | 'hatsu';
  dispatch: (cmd: EditCommand) => void;
  onClose: () => void;
}): React.ReactElement {
  const { target, initialKeyString, initialField = 'chaku', dispatch, onClose } = props;
  const ej = target.ekiJikoku;
  const hasKeyString = initialKeyString !== undefined && initialKeyString !== '';

  // 運行なしセルへのキー転送は「停車」へ自動昇格して受け付ける(原典は blur/OK 時に昇格。
  // キー転送 = 時刻欄の変更が確定しているため開いた時点で昇格させても確定結果は同じ)。
  const [ekiatsukai, setEkiatsukai] = useState<Ekiatsukai>(
    hasKeyString && ej.ekiatsukai === 'none' ? 'teisya' : ej.ekiatsukai,
  );
  const [chaku, setChaku] = useState<string>(
    initialField === 'chaku' && hasKeyString ? initialKeyString : encodeJikoku(ej.chakuJikoku),
  );
  const [hatsu, setHatsu] = useState<string>(
    initialField === 'hatsu' && hasKeyString ? initialKeyString : encodeJikoku(ej.hatsuJikoku),
  );
  const [error, setError] = useState<string | null>(null);
  // 時刻欄の活性。開いた時点では駅扱によらず有効(運行なしなら「有効・空」)。
  // 編集中にラジオを運行なしへ変えたときだけ無効化する(原典 AdjustUiData)。
  const [timesEnabled, setTimesEnabled] = useState(true);
  // [時刻の繰上げ・繰下げ](原典 m_bModifyEkijikoku。ビュー設定として記憶、既定 ON)。
  const modifyEkijikoku = useSettingsStore((s) => s.jikokuhyou.modifyEkijikoku);
  const setJikokuhyouSetting = useSettingsStore((s) => s.setJikokuhyouSetting);

  // 対象時刻欄へフォーカスし、カーソルを末尾に置く(design §5.2 キー転送)。
  const chakuRef = useRef<HTMLInputElement>(null);
  const hatsuRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const el = initialField === 'hatsu' ? hatsuRef.current : chakuRef.current;
    if (el === null || el.disabled) return;
    el.focus();
    const n = el.value.length;
    el.setSelectionRange(n, n);
    // マウント時 1 回のみ。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const commit = (): void => {
    const chakuChanged = chaku !== encodeJikoku(ej.chakuJikoku);
    const hatsuChanged = hatsu !== encodeJikoku(ej.hatsuJikoku);

    // 運行なしのまま時刻欄が変更されていたら停車へ自動昇格(原典 AdjustUiData の OK 時適用)。
    let finalAtsukai = ekiatsukai;
    if (
      finalAtsukai === 'none' &&
      timesEnabled &&
      ((chakuChanged && chaku !== '') || (hatsuChanged && hatsu !== ''))
    ) {
      finalAtsukai = 'teisya';
    }

    // 検証は必ず「全 dispatch より前」に行う(原典 CPropEditUi2::EndEdit は CheckUiData 成功後に
    // のみ UiDataToTarget を呼ぶ)。エラー時に一部の変更だけが store へ確定するのを防ぐ。
    const writesJikoku = finalAtsukai !== 'none' && timesEnabled;
    if (writesJikoku) {
      // 着/発の decode 検証(時補完込み)。発の補完基準は(新)着 ?? 前駅の時刻
      // (reducer の writeJikoku・原典 getJikokuFromUI と同じ解決順)。
      const decChaku = decodeJikokuWithHourCompletion(chaku, target.referJikoku);
      if (decChaku === 'invalid') {
        setError('時刻の書式が不正です(例: 915 / 1315 / 131545)。');
        return;
      }
      const decHatsu = decodeJikokuWithHourCompletion(hatsu, decChaku ?? target.referJikoku);
      if (decHatsu === 'invalid') {
        setError('時刻の書式が不正です(例: 915 / 1315 / 131545)。');
        return;
      }
    }

    // 原典 UiDataToTarget は駅扱 + 着発を 1 つの EkiJikoku として書く(OK 1 回 = Undo 1 単位)。
    // 時刻書込がある場合は writeJikoku 1 コマンドに駅扱変更を同乗させる。
    if (writesJikoku && (chakuChanged || hatsuChanged)) {
      dispatch({
        type: 'ekiJikoku/writeJikoku',
        diaIndex: target.diaIndex,
        houkou: target.houkou,
        ressyaIndex: target.ressyaIndex,
        ekiOrder: target.ekiOrder,
        chakuInput: chaku,
        hatsuInput: hatsu,
        modify: modifyEkijikoku,
        ...(finalAtsukai !== ej.ekiatsukai && finalAtsukai !== 'none'
          ? { ekiatsukai: finalAtsukai }
          : {}),
      });
    } else if (finalAtsukai !== ej.ekiatsukai) {
      // 時刻書込がない(無変更 or 運行なし化)ときは駅扱のみ。None 化の全消去はレデューサが持つ。
      dispatch({
        type: 'ekiJikoku/setEkiatsukai',
        diaIndex: target.diaIndex,
        houkou: target.houkou,
        ressyaIndices: [target.ressyaIndex],
        ekiOrder: target.ekiOrder,
        ekiatsukai: finalAtsukai,
      });
    }
    onClose();
  };

  // blur 時の正規化: decode 成功なら表示書式へ再整形(原典 blur 正規化)。
  // 運行なしのまま非 null 時刻が入ったら停車へ自動昇格(原典 AdjustUiData の KILLFOCUS 適用)。
  const normalizeField = (raw: string, set: (v: string) => void): void => {
    const dec = decodeJikokuWithHourCompletion(raw, target.referJikoku);
    if (dec === 'invalid') return;
    set(encodeJikoku(dec));
    if (ekiatsukai === 'none' && timesEnabled && dec !== null) setEkiatsukai('teisya');
  };

  const timeDisabled = !timesEnabled;

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
                // ラジオを運行なしへ変えたら時刻欄を無効化、停車/通過へ戻したら有効化
                // (原典 AdjustUiData の Enable 制御)。
                setTimesEnabled(v !== 'none');
              }}
            />
            {v === 'teisya' ? '停車' : v === 'tsuuka' ? '通過' : '運行なし'}
          </label>
        ))}
      </fieldset>

      <label className="dialog-field">
        着時刻
        <input
          ref={chakuRef}
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
          ref={hatsuRef}
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

      <label className="dialog-field dialog-check">
        <input
          type="checkbox"
          checked={modifyEkijikoku}
          onChange={(e) => {
            setJikokuhyouSetting('modifyEkijikoku', e.target.checked);
          }}
        />
        時刻の繰上げ・繰下げ
      </label>

      {error !== null && <p className="dialog-error">{error}</p>}
    </Dialog>
  );
}
