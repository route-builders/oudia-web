// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 up-tri

/**
 * 運用系ビュー共通の「運用更新の一時停止 / 更新(F5)」コントロールと探索状態表示。M7e。
 *
 * 探索は Worker で走るので、結果が来るまで**前回の内容を表示したまま**にする
 * (設計 §3.6 / roadmap M7 完了条件 #2)。初回はまだ前回結果が無いので「探索中」を出す。
 */

import type { KeyboardEvent } from 'react';
import type { UseOperationSearchResult } from '../hooks/useOperationSearch.js';

/**
 * 運用手動更新のキー(設計 05 §4.3: F5 / Alt+F5。ブラウザの再読み込みは preventDefault で抑止)。
 * ビュー根の div に spread して使う。傍受は「そのビューにフォーカスがあるとき」だけ。
 */
export function operationRefreshKeyProps(onRefresh: () => void): {
  tabIndex: number;
  onKeyDown: (e: KeyboardEvent<HTMLElement>) => void;
} {
  return {
    tabIndex: -1,
    onKeyDown: (e) => {
      if (e.key !== 'F5') return;
      e.preventDefault();
      onRefresh();
    },
  };
}

export function OperationSearchControls(props: {
  search: UseOperationSearchResult;
  paused: boolean;
  onPausedChange: (v: boolean) => void;
  onRefresh: () => void;
}): React.ReactElement {
  const { search, paused, onPausedChange, onRefresh } = props;
  return (
    <>
      <label>
        <input
          type="checkbox"
          checked={paused}
          onChange={(e) => {
            onPausedChange(e.target.checked);
          }}
        />
        運用更新を一時停止
      </label>
      <button type="button" onClick={onRefresh}>
        更新(F5)
      </button>
      {paused && <span className="stale-note">一時停止中</span>}
      {/* 前回結果を表示したまま再探索中(= 表示が古い可能性がある)ときだけ出す。
          初回でまだ何も出せないときは本文側の「運用探索中…」が担当する。 */}
      {search.pending && search.result !== null && <span className="stale-note">運用探索中…</span>}
      {search.error !== null && <span className="error-note">運用探索に失敗: {search.error}</span>}
    </>
  );
}

/**
 * 探索結果がまだ無いときの本文(探索中 / 対象外 / 失敗)。null なら本文を描いてよい。
 */
export function operationSearchPlaceholder(
  search: UseOperationSearchResult,
  ready: boolean,
): React.ReactElement | null {
  if (ready) return null;
  if (search.error !== null) {
    return <div className="view-error">運用探索に失敗しました: {search.error}</div>;
  }
  if (search.pending) return <div className="view-note">運用探索中…</div>;
  return <div className="view-error">運用探索の結果がありません。</div>;
}
