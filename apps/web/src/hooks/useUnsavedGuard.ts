// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 up-tri

/**
 * 離脱保護(design §6.5「変更状態と離脱保護」)。
 *
 * - 未保存の変更(変更カウンタ ≠ 0)があるとき、リロード・タブクローズ・ページ遷移で
 *   ブラウザ標準の確認ダイアログを表示する(beforeunload)。文言はブラウザが決める
 *   (カスタム文言は現行ブラウザでは表示されない)。
 * - 未保存のときタイトルへ「* 」マーカーを付ける(なぜ確認が出るかの可視化)。
 *
 * 未編集(変更カウンタ 0)のときは確認を出さない — 保存済み状態からのリロードまで
 * ブロックすると煩わしいため(design どおり「未保存時」に限定)。
 */

import { isDirty } from '@oudia-web/domain';
import { useEffect } from 'react';
import { useDocStore } from '../store/docStore.js';

const BASE_TITLE = 'OuDiaSecond Web ビューア';

export function useUnsavedGuard(): void {
  const docState = useDocStore((s) => s.docState);
  const fileName = useDocStore((s) => s.fileName);
  const dirty = docState !== null && isDirty(docState);

  // タイトルの * マーカー + ファイル名(design §6.5)。
  useEffect(() => {
    document.title = `${dirty ? '* ' : ''}${fileName !== null ? `${fileName} — ` : ''}${BASE_TITLE}`;
  }, [dirty, fileName]);

  // beforeunload ガード。ハンドラは 1 回だけ登録し、dirty 判定はイベント発火時に
  // store から直接読む(依存で付け外しすると発火タイミングの取りこぼしが起きるため)。
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent): void => {
      const s = useDocStore.getState().docState;
      if (s !== null && isDirty(s)) {
        // preventDefault + returnValue 設定でブラウザ標準の確認ダイアログが出る。
        e.preventDefault();
        // returnValue は仕様上 deprecated だが、旧 Chrome/一部ブラウザはこれがないと
        // ダイアログを出さないため互換目的で設定する(値自体は表示されない)。
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => {
      window.removeEventListener('beforeunload', handler);
    };
  }, []);
}
