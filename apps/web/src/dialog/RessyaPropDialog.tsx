// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 oudia-second-web contributors
//
// Based on OuDiaSecond (Copyright (C) 2017-2026 diagram_mania)
// and OuDia (Copyright (C) 2006-2017 take-okm)

/**
 * 列車のプロパティダイアログ(design §05 5.3.2)。列車番号 / 種別(select) / 列車名 /
 * 号数 / 備考 / 運休扱い を編集。変更のあったフィールドを ressya/setProp・setCanceled として
 * dispatch する(各 1 コマンド)。新規列車列で開いた場合の末尾追加は呼出側(グリッド)が
 * ressya/replaceRange を先に発行してから本ダイアログを開く。
 */

import { useEffect, useRef, useState } from 'react';
import type { Ressya, Ressyasyubetsu } from '@oudia/format';
import type { EditCommand } from '@oudia/domain';
import { Dialog } from './Dialog.js';

export interface RessyaPropDialogTarget {
  diaIndex: number;
  houkou: 0 | 1;
  ressyaIndex: number;
  ressya: Ressya;
  /** 種別 select の選択肢(index = syubetsuIndex)。 */
  syubetsuCont: readonly Ressyasyubetsu[];
}

export function RessyaPropDialog(props: {
  target: RessyaPropDialogTarget;
  /** 初期文字列(キー転送。列車番号欄へ入る)。 */
  initialKeyString?: string;
  dispatch: (cmd: EditCommand) => void;
  onClose: () => void;
}): React.ReactElement {
  const { target, initialKeyString, dispatch, onClose } = props;
  const r = target.ressya;

  const [ressyabangou, setRessyabangou] = useState<string>(initialKeyString ?? r.ressyabangou);
  const [syubetsuIndex, setSyubetsuIndex] = useState<number>(r.syubetsuIndex);

  // 列車番号欄へフォーカスし、カーソルを末尾に置く(design §5.2 キー転送)。
  const bangouRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const el = bangouRef.current;
    if (el === null) return;
    el.focus();
    const n = el.value.length;
    el.setSelectionRange(n, n);
    // マウント時 1 回のみ。
  }, []);
  const [ressyamei, setRessyamei] = useState<string>(r.ressyamei);
  const [gousuu, setGousuu] = useState<string>(r.gousuu);
  const [bikou, setBikou] = useState<string>(r.bikou);
  const [isCanceled, setIsCanceled] = useState<boolean>(r.isCanceled);

  const commit = (): void => {
    const base = {
      diaIndex: target.diaIndex,
      houkou: target.houkou,
      ressyaIndex: target.ressyaIndex,
    };
    // 変更のあったフィールドのみ dispatch(1 フィールド = 1 コマンド)。
    if (syubetsuIndex !== r.syubetsuIndex) {
      dispatch({
        type: 'ressya/setProp',
        ...base,
        prop: { key: 'syubetsuIndex', value: syubetsuIndex },
      });
    }
    if (ressyabangou !== r.ressyabangou) {
      dispatch({
        type: 'ressya/setProp',
        ...base,
        prop: { key: 'ressyabangou', value: ressyabangou },
      });
    }
    if (ressyamei !== r.ressyamei) {
      dispatch({ type: 'ressya/setProp', ...base, prop: { key: 'ressyamei', value: ressyamei } });
    }
    if (gousuu !== r.gousuu) {
      dispatch({ type: 'ressya/setProp', ...base, prop: { key: 'gousuu', value: gousuu } });
    }
    if (bikou !== r.bikou) {
      dispatch({ type: 'ressya/setProp', ...base, prop: { key: 'bikou', value: bikou } });
    }
    if (isCanceled !== r.isCanceled) {
      dispatch({
        type: 'ressya/setCanceled',
        diaIndex: target.diaIndex,
        houkou: target.houkou,
        ressyaIndices: [target.ressyaIndex],
        canceled: isCanceled,
      });
    }
    onClose();
  };

  return (
    <Dialog title="列車のプロパティ" onOk={commit} onCancel={onClose}>
      <label className="dialog-field">
        列車番号
        <input
          ref={bangouRef}
          type="text"
          value={ressyabangou}
          onChange={(e) => {
            setRessyabangou(e.target.value);
          }}
        />
      </label>

      <label className="dialog-field">
        種別
        <select
          value={syubetsuIndex}
          onChange={(e) => {
            setSyubetsuIndex(Number(e.target.value));
          }}
        >
          {target.syubetsuCont.map((s, i) => (
            <option key={i} value={i}>
              {s.syubetsumei}
            </option>
          ))}
        </select>
      </label>

      <label className="dialog-field">
        列車名
        <input
          type="text"
          value={ressyamei}
          onChange={(e) => {
            setRessyamei(e.target.value);
          }}
        />
      </label>

      <label className="dialog-field">
        号数
        <input
          type="text"
          value={gousuu}
          onChange={(e) => {
            setGousuu(e.target.value);
          }}
        />
      </label>

      <label className="dialog-field">
        備考
        <input
          type="text"
          value={bikou}
          onChange={(e) => {
            setBikou(e.target.value);
          }}
        />
      </label>

      <label className="dialog-field dialog-check">
        <input
          type="checkbox"
          checked={isCanceled}
          onChange={(e) => {
            setIsCanceled(e.target.checked);
          }}
        />
        運休
      </label>
    </Dialog>
  );
}
