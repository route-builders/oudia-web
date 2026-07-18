// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 oudia-second-web contributors

/**
 * ネイティブ <dialog>(モーダル)ラッパ(design §05 5.1)。showModal() で開き、
 * Esc = キャンセル、Enter = OK(textarea 内を除く)。閉じたらフォーカスを呼び出し元へ戻す。
 * UI ライブラリは使わない(02_architecture §1.2)。
 */

import { useEffect, useRef } from 'react';

export function Dialog(props: {
  title: string;
  onOk: () => void;
  onCancel: () => void;
  children: React.ReactNode;
  /** OK ボタンの活性(検証エラー時に無効化する場合)。既定 true。 */
  okEnabled?: boolean;
}): React.ReactElement {
  const { title, onOk, onCancel, children, okEnabled = true } = props;
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dlg = ref.current;
    if (dlg === null) return;
    // 既に開いていなければモーダルで開く。
    if (!dlg.open) dlg.showModal();
    // Esc(dialog の cancel イベント)= キャンセル。
    const onNativeCancel = (e: Event): void => {
      e.preventDefault();
      onCancel();
    };
    dlg.addEventListener('cancel', onNativeCancel);
    return () => {
      dlg.removeEventListener('cancel', onNativeCancel);
    };
  }, [onCancel]);

  return (
    <dialog
      ref={ref}
      className="prop-dialog"
      onKeyDown={(e) => {
        // ダイアログ内のキーは背後のグリッド(.grid-root)へ伝播させない。
        e.stopPropagation();
        // Enter = OK(textarea 内は改行を優先)。
        if (e.key === 'Enter' && !(e.target instanceof HTMLTextAreaElement)) {
          e.preventDefault();
          if (okEnabled) onOk();
        }
      }}
    >
      <form
        method="dialog"
        onSubmit={(e) => {
          e.preventDefault();
        }}
      >
        <header className="dialog-title">{title}</header>
        <div className="dialog-body">{children}</div>
        <footer className="dialog-footer">
          <button type="button" className="dialog-ok" disabled={!okEnabled} onClick={onOk}>
            OK
          </button>
          <button type="button" className="dialog-cancel" onClick={onCancel}>
            キャンセル
          </button>
        </footer>
      </form>
    </dialog>
  );
}
