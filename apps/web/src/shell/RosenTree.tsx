// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 up-tri

/**
 * 路線ツリー(ナビゲーション専用)。ダイヤごとに ダイヤグラム / 下り・上り時刻表 /
 * 各駅の駅時刻表 を開くリンクを並べる(architecture §4.5)。
 */

import type { RosenFileData } from '@oudia-web/format';
import { useState } from 'react';
import { useDocStore } from '../store/docStore.js';

export function RosenTree(props: { data: RosenFileData }): React.ReactElement {
  const { data } = props;
  const openView = useDocStore((s) => s.openView);
  const [expandedEki, setExpandedEki] = useState<Record<number, boolean>>({});

  return (
    <nav className="rosen-tree" aria-label="路線ツリー">
      <div className="rosen-name">{data.rosen.rosenmei || '(無名路線)'}</div>
      {data.rosen.diaCont.map((dia, diaIndex) => (
        <div key={diaIndex} className="dia-node">
          <div className="dia-name">{dia.name}</div>
          <ul className="view-list">
            <li>
              <button
                onClick={() => {
                  openView({ type: 'diagram', diaIndex });
                }}
              >
                ダイヤグラム
              </button>
            </li>
            <li>
              <button
                onClick={() => {
                  openView({ type: 'timetable', diaIndex, houkou: 0 });
                }}
              >
                下り時刻表
              </button>
            </li>
            <li>
              <button
                onClick={() => {
                  openView({ type: 'timetable', diaIndex, houkou: 1 });
                }}
              >
                上り時刻表
              </button>
            </li>
            <li>
              <button
                onClick={() => {
                  setExpandedEki((s) => ({ ...s, [diaIndex]: !s[diaIndex] }));
                }}
              >
                駅時刻表 {expandedEki[diaIndex] === true ? '▾' : '▸'}
              </button>
              {expandedEki[diaIndex] === true && (
                <ul className="eki-list">
                  {data.rosen.ekiCont.map((eki, ekiIndex) => (
                    <li key={ekiIndex}>
                      <button
                        onClick={() => {
                          // 下り駅時刻表(駅Order = 下り駅Index)。
                          openView({
                            type: 'ekiJikokuhyou',
                            diaIndex,
                            houkou: 0,
                            ekiOrder: ekiIndex,
                          });
                        }}
                      >
                        {eki.ekimei || '(無名駅)'}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          </ul>
        </div>
      ))}
    </nav>
  );
}
