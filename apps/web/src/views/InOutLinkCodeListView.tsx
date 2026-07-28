// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 up-tri

/**
 * 入出区連携コード一覧(参照専用)。M7d。
 *
 * 原典どおり固定 9 列。矢印と運用番号はペア成立(iStatus==2)のときだけ出る。
 * 「無効」等の文言は原典に存在しないので出さない。行のダブルクリックで時刻表へ移動する。
 */

import {
  deriveInOutLinkCodeList,
  IN_OUT_LINK_CODE_LIST_COLUMNS,
  IN_OUT_LINK_CODE_LIST_HEADER,
} from '@oudia-web/derive';
import type { RosenFileData } from '@oudia-web/format';
import { useMemo, useState } from 'react';
import { useOperationSearch } from '../hooks/useOperationSearch.js';
import { useDocStore } from '../store/docStore.js';

export function InOutLinkCodeListView(props: {
  data: RosenFileData;
  diaIndex: number;
}): React.ReactElement {
  const { data, diaIndex } = props;
  const openView = useDocStore((s) => s.openView);
  const [paused, setPaused] = useState(false);
  const [manualKey, setManualKey] = useState(0);
  const search = useOperationSearch(data, diaIndex, paused, manualKey);
  const dia = data.rosen.diaCont[diaIndex];

  const vm = useMemo(() => {
    if (dia === undefined || search.result === null) return null;
    return deriveInOutLinkCodeList(data.rosen, dia.ressyaCont, search.result.inOutLinkCodes);
  }, [dia, data.rosen, search.result]);

  if (data.rosen.enableOperation < 2) {
    return (
      <div className="view-error">
        入出区連携コード一覧は運用機能が「通常」(EnableOperation=2)のときだけ表示できます。
      </div>
    );
  }
  if (dia === undefined || vm === null) {
    return <div className="view-error">運用探索の結果がありません。</div>;
  }
  if (vm.rows.length === 0) {
    return <div className="view-error">入出区連携コードが設定された作業がありません。</div>;
  }

  return (
    <div className="inout-link-code-list">
      <div className="view-toolbar">
        <label>
          <input
            type="checkbox"
            checked={paused}
            onChange={(e) => {
              setPaused(e.target.checked);
            }}
          />
          運用更新を一時停止
        </label>
        <button
          type="button"
          onClick={() => {
            setManualKey((k) => k + 1);
          }}
        >
          更新(F5)
        </button>
      </div>
      <table className="inout-link-grid">
        <thead>
          <tr>
            {IN_OUT_LINK_CODE_LIST_COLUMNS.map((c) => (
              <th key={c}>{IN_OUT_LINK_CODE_LIST_HEADER[c]}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {vm.rows.map((row, i) => (
            <tr
              key={i}
              onDoubleClick={() => {
                const target = row.inSide.ressya ?? row.outSide.ressya;
                if (target !== null) {
                  openView({ type: 'timetable', diaIndex, houkou: target.houkou });
                }
              }}
            >
              <td className="code">{row.code}</td>
              <td>{row.inSide.houkouText}</td>
              <td>{row.inSide.ressyabangou}</td>
              <td>{row.inSide.syubetsumei}</td>
              <td className="arrow">{row.arrow}</td>
              <td>{row.outSide.houkouText}</td>
              <td>{row.outSide.ressyabangou}</td>
              <td>{row.outSide.syubetsumei}</td>
              <td className="op-number">{row.operationNumber}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
