// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 up-tri

/**
 * 列車番号検索バー(design §05 3.5 / 7.1)。ビュー内の簡易検索(Ctrl+F 傍受)。
 * Enter = 次を検索、Esc = 閉じる。一致なしは視覚フィードバック。
 */

import { useEffect, useRef, useState } from 'react';

export function TrainSearchBar(props: {
  /** query で検索して一致列へフォーカスを移す。ヒットしたら true。 */
  onSearch: (query: string) => boolean;
  onClose: () => void;
}): React.ReactElement {
  const { onSearch, onClose } = props;
  const [query, setQuery] = useState('');
  const [notFound, setNotFound] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const runSearch = (): void => {
    const hit = onSearch(query);
    setNotFound(!hit && query !== '');
  };

  return (
    <div className="train-search-bar">
      <input
        ref={inputRef}
        type="text"
        placeholder="列車番号を検索"
        className={notFound ? 'not-found' : ''}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setNotFound(false);
        }}
        onKeyDown={(e) => {
          // 検索バー内のキーはグリッド(.grid-root)へ伝播させない
          // (Enter がグリッドのダイアログ起動へ抜けるのを防ぐ)。
          if (e.key === 'Enter') {
            e.preventDefault();
            e.stopPropagation();
            runSearch();
          } else if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            onClose();
          } else {
            // 文字入力などもグリッドのキーマップへ抜けないよう止める。
            e.stopPropagation();
          }
        }}
      />
      <button type="button" onClick={runSearch}>
        次を検索
      </button>
      <button type="button" onClick={onClose}>
        ✕
      </button>
    </div>
  );
}
