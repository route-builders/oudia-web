// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 up-tri

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
  /** OK ボタンのラベル(原典が「エクスポート」等の場合に差し替える)。既定 "OK"。 */
  okLabel?: string;
}): React.ReactElement {
  const { title, onOk, onCancel, children, okEnabled = true, okLabel = 'OK' } = props;
  const ref = useRef<HTMLDialogElement>(null);
  // onCancel の identity 変化で効果が再実行されないよう ref 経由で参照する。
  const onCancelRef = useRef(onCancel);
  onCancelRef.current = onCancel;

  useEffect(() => {
    const dlg = ref.current;
    if (dlg === null) return;
    // マウント時に 1 回だけモーダルで開く。
    if (!dlg.open) dlg.showModal();
    // Esc(dialog の cancel イベント)= キャンセル。
    const onNativeCancel = (e: Event): void => {
      e.preventDefault();
      onCancelRef.current();
    };
    dlg.addEventListener('cancel', onNativeCancel);
    return () => {
      dlg.removeEventListener('cancel', onNativeCancel);
      // アンマウント前に必ず native close する。モーダルが開いたまま DOM から消すと
      // ブラウザの「showModal 前のフォーカスへ戻す」復元が働かず、フォーカスが body へ
      // 落ちて矢印キーがスクロールを発火してしまう。
      if (dlg.open) dlg.close();
    };
  }, []);

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
            {okLabel}
          </button>
          <button type="button" className="dialog-cancel" onClick={onCancel}>
            キャンセル
          </button>
        </footer>
      </form>
    </dialog>
  );
}
