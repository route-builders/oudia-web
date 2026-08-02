// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 up-tri

/**
 * 路線ツリー(ナビゲーション専用)。ダイヤごとに ダイヤグラム / 下り・上り時刻表 /
 * 各駅の駅時刻表 を開くリンクを並べる(architecture §4.5)。
 *
 * 運用系(運用一覧表 / 運用一覧図 / 入出区連携コード一覧)は原典では右クリック限定の
 * 隠し導線だったが、設計 §2.2 の決定に従い**常設の子項目に昇格**する。表示条件は原典と同じく
 * EnableOperation=2(通常モード)のときのみ(簡易モードでは運番が割り当たらないため)。
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
      <ul className="rosen-level-list">
        <li>
          <button
            onClick={() => {
              openView({ type: 'ekiView' });
            }}
          >
            駅
          </button>
        </li>
        <li>
          <button
            onClick={() => {
              openView({ type: 'syubetsuView' });
            }}
          >
            列車種別
          </button>
        </li>
      </ul>
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
                  openView({ type: 'customizeTimetable', diaIndex, houkou: 0 });
                }}
              >
                下りカスタマイズ時刻表
              </button>
            </li>
            <li>
              <button
                onClick={() => {
                  openView({ type: 'customizeTimetable', diaIndex, houkou: 1 });
                }}
              >
                上りカスタマイズ時刻表
              </button>
            </li>
            {data.rosen.enableOperation === 2 && (
              <>
                <li>
                  <button
                    onClick={() => {
                      openView({ type: 'allOperationTable', diaIndex, graphical: false });
                    }}
                  >
                    運用一覧表
                  </button>
                </li>
                <li>
                  <button
                    onClick={() => {
                      openView({ type: 'allOperationTable', diaIndex, graphical: true });
                    }}
                  >
                    運用一覧図
                  </button>
                </li>
                <li>
                  <button
                    onClick={() => {
                      openView({ type: 'inOutLinkCodeList', diaIndex });
                    }}
                  >
                    入出区連携コード一覧
                  </button>
                </li>
              </>
            )}
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
