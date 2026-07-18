// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 up-tri
//
// Based on OuDiaSecond (Copyright (C) 2017-2026 diagram_mania)

/**
 * 『駅時刻変更』ダイアログ(原典 CDlgModifyEkijikokuOperation2 / IDD_ModifyEkijikokuOperation2)。
 *
 * - [駅扱] 変更するチェック + 運行なし/停車/通過 ラジオ(チェック ON のときのみ有効)
 * - [駅時刻] 変更しない / 繰下げ・繰上げ(分+秒)/ 他駅からコピー(駅コンボ + 分+秒)/
 *   設定なしにする
 * - 秒数の合成(OnOK 321-355): 分>0 → 分*60+|秒| / 分<0 → 分*60-|秒| / 分==0 → 秒(符号込)
 * - 初期値はビューの記憶(前回の操作内容)から復元。分 = trunc(秒/60)、秒 = 秒%60。
 * - int 変換不可なら閉じずに継続(範囲チェックなし)。
 */

import type { EkijikokuModifyOperation2 } from '@oudia-web/domain';
import { ekiIndexOfEkiOrder } from '@oudia-web/domain';
import type { Eki } from '@oudia-web/format';
import { useState } from 'react';
import { Dialog } from './Dialog.js';

export interface ModifyEkijikokuDialogProps {
  ekiCont: readonly Eki[];
  houkou: 0 | 1;
  /** ビューが記憶する前回の操作内容(初期値)。 */
  initial: EkijikokuModifyOperation2;
  /** OK: 合成済みの操作内容を返す(呼出側が記憶更新 → 実行)。 */
  onOk: (op: EkijikokuModifyOperation2) => void;
  onClose: () => void;
}

/** 記憶が無いときの初期値(原典 ctor: NULL 状態・コピー元は駅Order 0 の着)。 */
export const DEFAULT_MODIFY_OP2: EkijikokuModifyOperation2 = {
  setEkiatsukai: false,
  ekiatsukai: 'none',
  operation: 'nop',
  seconds: 0,
  copySrc: null,
};

/** 原典 OnOK の分+秒 → 秒合成。 */
export function composeSeconds(min: number, sec: number): number {
  if (min > 0) return min * 60 + Math.abs(sec);
  if (min < 0) return min * 60 - Math.abs(sec);
  return sec;
}

const INT_RE = /^-?\d+$/;

export function ModifyEkijikokuDialog(props: ModifyEkijikokuDialogProps): React.ReactElement {
  const { ekiCont, houkou, initial, onOk, onClose } = props;

  const [setAtsukai, setSetAtsukai] = useState(initial.setEkiatsukai);
  const [atsukai, setAtsukaiValue] = useState(initial.ekiatsukai);
  const [operation, setOperation] = useState(initial.operation);
  // 分/秒フィールド(繰下げ用・コピー用の両方に同じ記憶値を展開。原典 182-218)。
  const initMin = String(Math.trunc(initial.seconds / 60));
  const initSec = String(initial.seconds % 60);
  const [min1, setMin1] = useState(initMin);
  const [sec1, setSec1] = useState(initSec);
  const [min2, setMin2] = useState(initMin);
  const [sec2, setSec2] = useState(initSec);
  // コンボ index = 駅Order*2 (+1 なら発)。
  const [copyIndex, setCopyIndex] = useState(
    initial.copySrc === null
      ? 0
      : initial.copySrc.ekiOrder * 2 + (initial.copySrc.item === 'hatsu' ? 1 : 0),
  );
  const [error, setError] = useState<string | null>(null);

  const ekimeiOf = (ekiOrder: number): string =>
    ekiCont[ekiIndexOfEkiOrder(ekiOrder, ekiCont.length, houkou)]?.ekimei ?? '';

  const commit = (): void => {
    // int 変換検証(選択中の操作のフィールドのみ。原典 UpdateData 失敗相当)。
    const fields = operation === 'modify' ? [min1, sec1] : operation === 'copy' ? [min2, sec2] : [];
    if (fields.some((f) => !INT_RE.test(f.trim()))) {
      setError('分・秒には整数を入力してください。');
      return;
    }
    const next: EkijikokuModifyOperation2 = {
      setEkiatsukai: setAtsukai,
      ekiatsukai: atsukai,
      operation,
      // Nop/ToNull では秒数・コピー元は前回値のまま保持(原典 OnOK 339-355)。
      seconds:
        operation === 'modify'
          ? composeSeconds(Number(min1.trim()), Number(sec1.trim()))
          : operation === 'copy'
            ? composeSeconds(Number(min2.trim()), Number(sec2.trim()))
            : initial.seconds,
      copySrc:
        operation === 'copy'
          ? { ekiOrder: Math.floor(copyIndex / 2), item: copyIndex % 2 === 1 ? 'hatsu' : 'chaku' }
          : initial.copySrc,
    };
    onOk(next);
  };

  return (
    <Dialog title="駅時刻変更" onOk={commit} onCancel={onClose}>
      <fieldset className="dialog-field">
        <legend>駅扱</legend>
        <label>
          <input
            type="checkbox"
            checked={setAtsukai}
            onChange={(e) => {
              setSetAtsukai(e.target.checked);
            }}
          />
          変更する
        </label>
        {(['none', 'teisya', 'tsuuka'] as const).map((v) => (
          <label key={v}>
            <input
              type="radio"
              name="modify-atsukai"
              checked={atsukai === v}
              disabled={!setAtsukai}
              onChange={() => {
                setAtsukaiValue(v);
              }}
            />
            {v === 'none' ? '運行なし' : v === 'teisya' ? '停車' : '通過'}
          </label>
        ))}
      </fieldset>

      <fieldset className="dialog-field">
        <legend>駅時刻</legend>
        <label>
          <input
            type="radio"
            name="modify-op"
            checked={operation === 'nop'}
            onChange={() => {
              setOperation('nop');
            }}
          />
          変更しない
        </label>
        <div>
          <label>
            <input
              type="radio"
              name="modify-op"
              checked={operation === 'modify'}
              onChange={() => {
                setOperation('modify');
              }}
            />
            繰下げ/繰上げ:
          </label>
          <input
            type="text"
            inputMode="numeric"
            aria-label="繰下げ分"
            className="dialog-num"
            value={min1}
            disabled={operation !== 'modify'}
            onChange={(e) => {
              setMin1(e.target.value);
            }}
          />
          分
          <input
            type="text"
            inputMode="numeric"
            aria-label="繰下げ秒"
            className="dialog-num"
            value={sec1}
            disabled={operation !== 'modify'}
            onChange={(e) => {
              setSec1(e.target.value);
            }}
          />
          秒繰下げ(負なら繰上げ)
        </div>
        <div>
          <label>
            <input
              type="radio"
              name="modify-op"
              checked={operation === 'copy'}
              onChange={() => {
                setOperation('copy');
              }}
            />
            他駅からコピー:
          </label>
          <select
            aria-label="コピー元"
            value={copyIndex}
            disabled={operation !== 'copy'}
            onChange={(e) => {
              setCopyIndex(Number(e.target.value));
            }}
          >
            {Array.from({ length: ekiCont.length * 2 }, (_, i) => (
              <option key={i} value={i}>
                {ekimeiOf(Math.floor(i / 2))} {i % 2 === 1 ? '発' : '着'}
              </option>
            ))}
          </select>
          の
          <input
            type="text"
            inputMode="numeric"
            aria-label="コピー分"
            className="dialog-num"
            value={min2}
            disabled={operation !== 'copy'}
            onChange={(e) => {
              setMin2(e.target.value);
            }}
          />
          分
          <input
            type="text"
            inputMode="numeric"
            aria-label="コピー秒"
            className="dialog-num"
            value={sec2}
            disabled={operation !== 'copy'}
            onChange={(e) => {
              setSec2(e.target.value);
            }}
          />
          秒後(負なら前)
        </div>
        <label>
          <input
            type="radio"
            name="modify-op"
            checked={operation === 'toNull'}
            onChange={() => {
              setOperation('toNull');
            }}
          />
          設定なしにする
        </label>
      </fieldset>

      {error !== null && <p className="dialog-error">{error}</p>}
    </Dialog>
  );
}
