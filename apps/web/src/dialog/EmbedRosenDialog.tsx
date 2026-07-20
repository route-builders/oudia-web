// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 up-tri
//
// Based on OuDiaSecond (Copyright (C) 2017-2026 diagram_mania)
// and OuDia (Copyright (C) 2006-2017 take-okm)

/**
 * 路線の組入れダイアログ(原典 CDlgRosenfileInsert 相当)。別の .oud2/.oud を読み込み、
 * 組入れ先駅を選んで現在の路線へ埋め込む。結果は新しいドキュメントとして loadData で反映する
 * (原典は 1 Undo コマンドだが、大規模な全置換のため Web 版では新規ドキュメント扱いとする)。
 */

import { canEmbedRosen, embedRosen } from '@oudia-web/domain';
import type { RosenFileData } from '@oudia-web/format';
import { useState } from 'react';
import { openFileObject } from '../file/openFile.js';
import { Dialog } from './Dialog.js';

export function EmbedRosenDialog(props: {
  data: RosenFileData;
  /** 組入れ結果を新ドキュメントとして反映する(App の loadData)。 */
  onEmbedded: (data: RosenFileData, fileName: string) => void;
  fileName: string | null;
  onClose: () => void;
}): React.ReactElement {
  const { data, onEmbedded, fileName, onClose } = props;
  const ekiCont = data.rosen.ekiCont;
  const [addData, setAddData] = useState<RosenFileData | null>(null);
  const [addName, setAddName] = useState<string>('');
  const [insertIndex, setInsertIndex] = useState(Math.max(0, ekiCont.length - 1));
  const [error, setError] = useState<string | null>(null);

  const okEnabled = addData !== null && canEmbedRosen(data, insertIndex);

  const onPickFile = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const file = e.target.files?.[0];
    if (file === undefined) return;
    setError(null);
    openFileObject(file).then(
      (r) => {
        setAddData(r.data);
        setAddName(r.fileName);
      },
      (err: unknown) => {
        setError(err instanceof Error ? err.message : String(err));
      },
    );
  };

  const commit = (): void => {
    if (addData === null) {
      setError('組み入れるファイルを選択してください。');
      return;
    }
    if (!canEmbedRosen(data, insertIndex)) {
      setError('組入れには現在の路線が 2 駅以上必要です。');
      return;
    }
    try {
      const out = embedRosen(data, addData, insertIndex);
      const base = (fileName ?? '路線').replace(/\.(oud2?|OUD2?)$/, '');
      onEmbedded(out, `${base}_組入れ.oud2`);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <Dialog title="路線の組入れ" onOk={commit} onCancel={onClose} okEnabled={okEnabled}>
      <p className="dialog-note">
        別の路線ファイル(.oud2 / .oud)を、現在の路線の指定した駅位置へ組み入れます。
      </p>
      <label className="dialog-field">
        組み入れるファイル
        <input type="file" accept=".oud2,.oud" onChange={onPickFile} />
      </label>
      {addData !== null && (
        <p className="dialog-note">
          読込: {addName}(駅 {addData.rosen.ekiCont.length} / 列車種別{' '}
          {addData.rosen.ressyasyubetsuCont.length} / ダイヤ {addData.rosen.diaCont.length})
        </p>
      )}
      <label className="dialog-field">
        組入れ先の駅
        <select
          value={insertIndex}
          onChange={(e) => {
            setInsertIndex(Number(e.target.value));
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
      {error !== null && <p className="dialog-error">{error}</p>}
    </Dialog>
  );
}
