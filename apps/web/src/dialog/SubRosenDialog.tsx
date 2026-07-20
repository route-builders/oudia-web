// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 up-tri
//
// Based on OuDiaSecond (Copyright (C) 2017-2026 diagram_mania)
// and OuDia (Copyright (C) 2006-2017 take-okm)

/**
 * 路線の切り出しダイアログ(原典 CDlgRosenCreateSubRosen 相当)。開始駅・終了駅を選び、
 * その範囲だけを残した新しい .oud2 を生成してダウンロードする(元ドキュメントは変更しない)。
 * bEnableOuter(路線外発着変換)は M7 隣接のため本 UI では扱わない(domain 側も未対応)。
 */

import { canCreateSubRosen, createSubRosen } from '@oudia-web/domain';
import type { RosenFileData } from '@oudia-web/format';
import { writeOud2 } from '@oudia-web/format';
import { useState } from 'react';
import { downloadBytes } from '../file/saveFile.js';
import { Dialog } from './Dialog.js';

export function SubRosenDialog(props: {
  data: RosenFileData;
  fileName: string | null;
  onClose: () => void;
}): React.ReactElement {
  const { data, fileName, onClose } = props;
  const ekiCont = data.rosen.ekiCont;
  const [startIndex, setStartIndex] = useState(0);
  const [endIndex, setEndIndex] = useState(Math.max(0, ekiCont.length - 1));
  const [error, setError] = useState<string | null>(null);

  const count = endIndex - startIndex + 1;
  const rangeValid = startIndex <= endIndex && count >= 1;
  const okEnabled = rangeValid && canCreateSubRosen(data, startIndex, count);

  const commit = (): void => {
    if (!okEnabled) {
      setError('切り出し範囲が不正です(路線は 3 駅以上・開始 ≤ 終了)。');
      return;
    }
    try {
      const sub = createSubRosen(data, startIndex, count);
      const bytes = writeOud2(sub);
      const base = (fileName ?? '路線').replace(/\.(oud2?|OUD2?)$/, '');
      downloadBytes(bytes, `${base}_切り出し.oud2`);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <Dialog title="路線の切り出し" onOk={commit} onCancel={onClose} okEnabled={okEnabled}>
      <p className="dialog-note">
        選択した駅の範囲だけを残した新しい路線ファイル(.oud2)をダウンロードします。
      </p>
      <label className="dialog-field">
        開始駅
        <select
          value={startIndex}
          onChange={(e) => {
            setStartIndex(Number(e.target.value));
            setError(null);
          }}
        >
          {ekiCont.map((eki, i) => (
            <option key={eki.id} value={i}>
              {i}: {eki.ekimei || '(無名駅)'}
            </option>
          ))}
        </select>
      </label>
      <label className="dialog-field">
        終了駅
        <select
          value={endIndex}
          onChange={(e) => {
            setEndIndex(Number(e.target.value));
            setError(null);
          }}
        >
          {ekiCont.map((eki, i) => (
            <option key={eki.id} value={i}>
              {i}: {eki.ekimei || '(無名駅)'}
            </option>
          ))}
        </select>
      </label>
      {!rangeValid && <p className="dialog-error">開始駅は終了駅以下にしてください。</p>}
      {rangeValid && !canCreateSubRosen(data, startIndex, count) && (
        <p className="dialog-error">切り出しには路線が 3 駅以上必要です。</p>
      )}
      {error !== null && <p className="dialog-error">{error}</p>}
    </Dialog>
  );
}
