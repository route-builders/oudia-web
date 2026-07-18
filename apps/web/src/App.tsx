// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 up-tri

/** アプリシェル。ファイルを開く・路線ツリー・タブ・アクティブビュー描画。 */

import type { RosenFileData } from '@oudia-web/format';
import { useCallback, useState } from 'react';
import { openFileObject, pickAndOpen } from './file/openFile.js';
import { useUnsavedGuard } from './hooks/useUnsavedGuard.js';
import { RosenTree } from './shell/RosenTree.js';
import { TabBar } from './shell/TabBar.js';
import { useDocStore } from './store/docStore.js';
import type { ViewDescriptor } from './tabs/viewDescriptor.js';
import { DiagramView } from './views/DiagramView.js';
import { EkiJikokuhyouView } from './views/EkiJikokuhyouView.js';
import { TimetableView } from './views/TimetableView.js';

export function App(): React.ReactElement {
  const data = useDocStore((s) => s.data);
  const fileName = useDocStore((s) => s.fileName);
  const warningCount = useDocStore((s) => s.warningCount);
  const tabs = useDocStore((s) => s.tabs);
  const activeKey = useDocStore((s) => s.activeKey);
  const loadData = useDocStore((s) => s.loadData);
  const swReload = useDocStore((s) => s.swReload);
  const [error, setError] = useState<string | null>(null);

  // 未保存時の離脱保護(リロード/クローズで確認ダイアログ)+ タイトル * マーカー。
  useUnsavedGuard();

  const openPicker = useCallback(() => {
    setError(null);
    pickAndOpen().then(
      (r) => {
        if (r !== null) loadData(r.data, r.fileName, r.warningCount);
      },
      (e: unknown) => {
        setError(e instanceof Error ? e.message : String(e));
      },
    );
  }, [loadData]);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer.files[0];
      if (file === undefined) return;
      setError(null);
      openFileObject(file).then(
        (r) => {
          loadData(r.data, r.fileName, r.warningCount);
        },
        (err: unknown) => {
          setError(err instanceof Error ? err.message : String(err));
        },
      );
    },
    [loadData],
  );

  const activeTab = tabs.find((t) => t.key === activeKey);

  return (
    <div
      className="app"
      onDrop={onDrop}
      onDragOver={(e) => {
        e.preventDefault();
      }}
    >
      <header className="app-header">
        <span className="app-brand">
          oudia-web<span className="app-brand-stage">(アルファ版)</span>
        </span>
        <button className="open-btn" onClick={openPicker}>
          ファイルを開く
        </button>
        {fileName !== null && (
          <span className="file-name">
            {fileName}
            {warningCount > 0 && <span className="warn"> (警告 {warningCount})</span>}
          </span>
        )}
        {swReload !== null && (
          <button
            className="sw-update"
            onClick={() => {
              swReload();
            }}
          >
            更新があります(再読み込み)
          </button>
        )}
      </header>

      {error !== null && <div className="app-error">{error}</div>}

      {data === null ? (
        <div className="app-empty">
          <p>OuDia / OuDiaSecond ファイル(.oud2 / .oud)を開くか、ここにドロップしてください。</p>
        </div>
      ) : (
        <div className="app-body">
          <aside className="app-sidebar">
            <RosenTree data={data} />
          </aside>
          <main className="app-main">
            <TabBar data={data} />
            <div className="view-container">
              {activeTab === undefined ? (
                <div className="app-empty">左のツリーからビューを開いてください。</div>
              ) : (
                renderView(data, activeTab.descriptor)
              )}
            </div>
          </main>
        </div>
      )}

      <footer className="app-footer">
        <a href="https://web.route.builders/" target="_blank" rel="noreferrer">
          &copy; 2026 up-tri.
        </a>
        <nav className="app-footer-links" aria-label="サイト情報">
          <a href="https://web.route.builders/notice/" target="_blank" rel="noreferrer">
            注意事項
          </a>
          <a href="https://web.route.builders/disclaimer/" target="_blank" rel="noreferrer">
            免責事項・ライセンス情報
          </a>
        </nav>
      </footer>
    </div>
  );
}

function renderView(data: RosenFileData, d: ViewDescriptor): React.ReactElement {
  switch (d.type) {
    case 'diagram':
      return <DiagramView data={data} diaIndex={d.diaIndex} />;
    case 'timetable':
      return <TimetableView data={data} diaIndex={d.diaIndex} houkou={d.houkou} />;
    case 'ekiJikokuhyou':
      return (
        <EkiJikokuhyouView
          data={data}
          diaIndex={d.diaIndex}
          houkou={d.houkou}
          ekiOrder={d.ekiOrder}
        />
      );
  }
}
