// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 up-tri

/** タブバー(開いているビューの切替・クローズ)。 */

import type { RosenFileData } from '@oudia-web/format';
import { useDocStore } from '../store/docStore.js';
import type { ViewDescriptor } from '../tabs/viewDescriptor.js';
import { descriptorLabel } from '../tabs/viewDescriptor.js';

function labelOf(data: RosenFileData, d: ViewDescriptor): string {
  const diaName = 'diaIndex' in d ? (data.rosen.diaCont[d.diaIndex]?.name ?? '') : '';
  const ekimei = d.type === 'ekiJikokuhyou' ? data.rosen.ekiCont[d.ekiOrder]?.ekimei : undefined;
  return descriptorLabel(d, diaName, ekimei);
}

export function TabBar(props: { data: RosenFileData }): React.ReactElement {
  const { data } = props;
  const tabs = useDocStore((s) => s.tabs);
  const activeKey = useDocStore((s) => s.activeKey);
  const setActive = useDocStore((s) => s.setActive);
  const closeTab = useDocStore((s) => s.closeTab);

  return (
    <div className="tab-bar" role="tablist">
      {tabs.map((tab) => (
        <div
          key={tab.key}
          className={`tab${tab.key === activeKey ? ' active' : ''}`}
          role="tab"
          aria-selected={tab.key === activeKey}
        >
          <button
            className="tab-label"
            onClick={() => {
              setActive(tab.key);
            }}
          >
            {labelOf(data, tab.descriptor)}
          </button>
          <button
            className="tab-close"
            aria-label="閉じる"
            onClick={() => {
              closeTab(tab.key);
            }}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
