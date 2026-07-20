// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 up-tri
//
// Based on OuDiaSecond (Copyright (C) 2017-2026 diagram_mania)
// and OuDia (Copyright (C) 2006-2017 take-okm)

/**
 * ダイヤ一覧ダイアログ(design 05_ui-views §5.1、原典 CDlgDiaList)。
 * 唯一の「即時反映」ダイアログ: OK/キャンセルを持たず、各ボタンが個別の EditCommand を
 * その場で発行する(ボタン 1 回 = Undo 1 単位)。新規/コピー/削除/上へ/下へ/プロパティ(改名)。
 */

import { createDefaultDia, type EditCommand } from '@oudia-web/domain';
import type { Dia, RosenFileData } from '@oudia-web/format';
import { useEffect, useRef, useState } from 'react';

export function DiaListDialog(props: {
  data: RosenFileData;
  dispatch: (cmd: EditCommand) => void;
  onClose: () => void;
}): React.ReactElement {
  const { data, dispatch, onClose } = props;
  const dias = data.rosen.diaCont;
  const [selected, setSelected] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLDialogElement>(null);
  // onClose の identity 変化で効果が再実行されないよう ref 経由で参照する(Dialog.tsx と同方針)。
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const dlg = ref.current;
    if (dlg === null) return;
    if (!dlg.open) dlg.showModal();
    const onCancel = (e: Event): void => {
      e.preventDefault();
      onCloseRef.current();
    };
    dlg.addEventListener('cancel', onCancel);
    return () => {
      dlg.removeEventListener('cancel', onCancel);
      if (dlg.open) dlg.close();
    };
  }, []);

  const sel = dias.length === 0 ? -1 : Math.min(selected, dias.length - 1);

  const run = (fn: () => void): void => {
    setError(null);
    try {
      fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  /** 路線内で一意なダイヤ名を作る(base があれば base のコピー名)。 */
  const uniqueName = (base: string): string => {
    const names = new Set(dias.map((d) => d.name));
    if (!names.has(base)) return base;
    for (let i = 2; ; i++) {
      const cand = `${base} (${String(i)})`;
      if (!names.has(cand)) return cand;
    }
  };

  const onNew = (): void => {
    const name = uniqueName(`ダイヤ${String(dias.length + 1)}`);
    run(() => {
      dispatch({
        type: 'dia/replaceRange',
        index: dias.length,
        count: 0,
        dia: [createDefaultDia(name)],
      });
    });
    setSelected(dias.length);
  };

  const onCopy = (): void => {
    const src = dias[sel];
    if (src === undefined) return;
    const copy: Dia = structuredClone(src);
    copy.name = uniqueName(`${src.name} のコピー`);
    run(() => {
      dispatch({ type: 'dia/replaceRange', index: dias.length, count: 0, dia: [copy] });
    });
    setSelected(dias.length);
  };

  const onDelete = (): void => {
    if (sel < 0) return;
    run(() => {
      dispatch({ type: 'dia/replaceRange', index: sel, count: 1, dia: [] });
    });
    setSelected(Math.max(0, sel - 1));
  };

  const onUp = (): void => {
    if (sel <= 0) return;
    const a = dias[sel];
    const b = dias[sel - 1];
    if (a === undefined || b === undefined) return;
    run(() => {
      // 純入替(上下移動): [a, b] を [sel-1] から置換(isSwap=true → kijunDiaIndex 端点入替)。
      dispatch({
        type: 'dia/replaceRange',
        index: sel - 1,
        count: 2,
        dia: [structuredClone(a), structuredClone(b)],
        isSwap: true,
      });
    });
    setSelected(sel - 1);
  };

  const onDown = (): void => {
    if (sel < 0 || sel >= dias.length - 1) return;
    const a = dias[sel];
    const b = dias[sel + 1];
    if (a === undefined || b === undefined) return;
    run(() => {
      dispatch({
        type: 'dia/replaceRange',
        index: sel,
        count: 2,
        dia: [structuredClone(b), structuredClone(a)],
        isSwap: true,
      });
    });
    setSelected(sel + 1);
  };

  const onRename = (): void => {
    const cur = dias[sel];
    if (cur === undefined) return;
    const input = window.prompt('ダイヤ名', cur.name);
    if (input === null) return;
    run(() => {
      dispatch({ type: 'dia/setProp', diaIndex: sel, prop: { key: 'name', value: input } });
    });
  };

  return (
    <dialog ref={ref} className="prop-dialog" onKeyDown={(e) => e.stopPropagation()}>
      <header className="dialog-title">ダイヤ一覧</header>
      <div className="dialog-body">
        {error !== null && <p className="dialog-error">{error}</p>}
        <ul className="dia-list">
          {dias.map((d, i) => (
            <li
              key={i}
              className={i === sel ? 'selected' : ''}
              onClick={() => setSelected(i)}
              onDoubleClick={onRename}
            >
              {d.name}
            </li>
          ))}
          {dias.length === 0 && <li className="empty-row">ダイヤがありません。</li>}
        </ul>
        <div className="dia-list-buttons">
          <button type="button" onClick={onNew}>
            新規作成
          </button>
          <button type="button" onClick={onRename} disabled={sel < 0}>
            プロパティ
          </button>
          <button type="button" onClick={onCopy} disabled={sel < 0}>
            コピー
          </button>
          <button type="button" onClick={onDelete} disabled={sel < 0}>
            削除
          </button>
          <button type="button" onClick={onUp} disabled={sel <= 0}>
            上へ
          </button>
          <button type="button" onClick={onDown} disabled={sel < 0 || sel >= dias.length - 1}>
            下へ
          </button>
        </div>
      </div>
      <footer className="dialog-footer">
        <button type="button" className="dialog-ok" onClick={onClose}>
          閉じる
        </button>
      </footer>
    </dialog>
  );
}
