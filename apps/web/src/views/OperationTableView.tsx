// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 up-tri

/**
 * 運用表ビュー(従来形式)。「ダイヤ × 運用番号」ごとに開く読み取り専用グリッド。M7d。
 *
 * derive の deriveOperationTableView が返す行列をそのまま DOM テーブルで表示する。
 * 箱ダイヤ形式は別レンダラ(後続タスク)。
 */

import {
  buildOperationTableCsv,
  deriveBoxOperationTableView,
  deriveOperationTableView,
  OPERATION_TABLE_HEADER,
} from '@oudia-web/derive';
import type { RosenFileData } from '@oudia-web/format';
import { useMemo, useState } from 'react';
import { downloadCsv } from '../file/saveFile.js';
import { useOperationSearch } from '../hooks/useOperationSearch.js';
import { useDocStore } from '../store/docStore.js';
import { BoxOperationTable } from './BoxOperationTable.js';
import {
  OperationSearchControls,
  operationRefreshKeyProps,
  operationSearchPlaceholder,
} from './OperationSearchControls.js';

export function OperationTableView(props: {
  data: RosenFileData;
  diaIndex: number;
  operationNumber: string;
}): React.ReactElement {
  const { data, diaIndex, operationNumber } = props;
  const openView = useDocStore((s) => s.openView);
  const [displayTrackName, setDisplayTrackName] = useState(false);
  const [noboriLeftToRight, setNoboriLeftToRight] = useState(false);
  // [箱ダイヤ形式で表示する](原典 m_bDisplayExtensionOperationTable)。既定 false。
  const [boxDia, setBoxDia] = useState(false);
  // [通過駅の駅時刻を表示する(箱ダイヤ時のみ)](原典 m_bDisplayTsuukaEkiJikoku)。
  const [displayTsuukaEkiJikoku, setDisplayTsuukaEkiJikoku] = useState(false);
  const [paused, setPaused] = useState(false);
  const [manualKey, setManualKey] = useState(0);

  const search = useOperationSearch(data, diaIndex, paused, manualKey);
  const dia = data.rosen.diaCont[diaIndex];

  const vm = useMemo(() => {
    if (dia === undefined || search.result === null) return null;
    const entries = search.result.operationTable.get(operationNumber) ?? [];
    return deriveOperationTableView(dia, data.rosen, operationNumber, entries, {
      displayRessyamei: data.dispProp.displayRessyamei,
      displayTrackName,
      displayParentSyubetsu: false,
      displayNoboriLeftToRight: noboriLeftToRight,
      conv: {
        noColon: false,
        outputSecond: false,
        secondRoundChaku: data.dispProp.secondRoundChaku,
        secondRoundHatsu: data.dispProp.secondRoundHatsu,
        display2400: data.dispProp.display2400,
      },
    });
  }, [dia, data, search.result, operationNumber, displayTrackName, noboriLeftToRight]);

  const boxVm = useMemo(() => {
    if (!boxDia || dia === undefined || search.result === null) return null;
    const entries = search.result.operationTable.get(operationNumber) ?? [];
    return deriveBoxOperationTableView(dia, data.rosen, operationNumber, entries, {
      displayRessyamei: data.dispProp.displayRessyamei,
      displayTrackName,
      displayParentSyubetsu: false,
      displayTsuukaEkiJikoku,
      conv: {
        noColon: false,
        outputSecond: false,
        secondRoundChaku: data.dispProp.secondRoundChaku,
        secondRoundHatsu: data.dispProp.secondRoundHatsu,
        display2400: data.dispProp.display2400,
      },
    });
  }, [boxDia, dia, data, search.result, operationNumber, displayTrackName, displayTsuukaEkiJikoku]);

  if (data.rosen.enableOperation < 2) {
    return (
      <div className="view-error">
        運用表は運用機能が「通常」(EnableOperation=2)のときだけ表示できます。
      </div>
    );
  }
  const placeholder = operationSearchPlaceholder(search, dia !== undefined && vm !== null);

  return (
    <div
      className="operation-table"
      {...operationRefreshKeyProps(() => {
        setManualKey((k) => k + 1);
      })}
    >
      <div className="view-toolbar">
        <span className="op-number-title">運用番号 {operationNumber}</span>
        <label>
          <input
            type="checkbox"
            checked={displayTrackName}
            onChange={(e) => {
              setDisplayTrackName(e.target.checked);
            }}
          />
          着発番線名を表示
        </label>
        <label>
          <input
            type="checkbox"
            checked={boxDia}
            onChange={(e) => {
              setBoxDia(e.target.checked);
            }}
          />
          箱ダイヤ形式で表示
        </label>
        {/* 原典どおり、この 2 つは対応する形式のときだけ効く。 */}
        <label>
          <input
            type="checkbox"
            checked={noboriLeftToRight}
            onChange={(e) => {
              setNoboriLeftToRight(e.target.checked);
            }}
          />
          上り始発駅を左に(従来形式時のみ)
        </label>
        <label>
          <input
            type="checkbox"
            checked={displayTsuukaEkiJikoku}
            onChange={(e) => {
              setDisplayTsuukaEkiJikoku(e.target.checked);
            }}
          />
          通過駅時刻を表示(箱ダイヤ時のみ)
        </label>
        <button
          type="button"
          onClick={() => {
            openView({ type: 'allOperationTable', diaIndex, graphical: false });
          }}
        >
          運用一覧表へ
        </button>
        <OperationSearchControls
          search={search}
          paused={paused}
          onPausedChange={setPaused}
          onRefresh={() => {
            setManualKey((k) => k + 1);
          }}
        />
        <button
          type="button"
          disabled={search.result === null || dia === undefined}
          onClick={() => {
            if (search.result === null || dia === undefined) return;
            downloadCsv(
              buildOperationTableCsv({
                rosen: data.rosen,
                dia,
                operationNumbers: [operationNumber],
                operationTable: search.result.operationTable,
                options: {
                  displayRessyamei: data.dispProp.displayRessyamei,
                  displayTrackName,
                  displayParentSyubetsu: false,
                  displayNoboriLeftToRight: noboriLeftToRight,
                  conv: {
                    noColon: false,
                    outputSecond: false,
                    secondRoundChaku: data.dispProp.secondRoundChaku,
                    secondRoundHatsu: data.dispProp.secondRoundHatsu,
                    display2400: data.dispProp.display2400,
                  },
                },
              }),
              `${dia.name}_運用表_${operationNumber}.csv`,
            );
          }}
        >
          CSV 出力
        </button>
      </div>
      {placeholder}
      {placeholder === null && vm !== null && vm.rows.length === 0 && (
        <div className="view-error">運用番号「{operationNumber}」の運用がありません。</div>
      )}
      {placeholder === null && boxVm !== null && boxVm.rows.length > 0 && (
        <BoxOperationTable
          vm={boxVm}
          displayRessyamei={data.dispProp.displayRessyamei}
          onOpenTimetable={(houkou) => {
            openView({ type: 'timetable', diaIndex, houkou });
          }}
        />
      )}
      {placeholder === null && !boxDia && vm !== null && vm.rows.length > 0 && (
        <table className="operation-table-grid">
          <thead>
            <tr>
              {vm.columns.map((c) => (
                <th key={c}>{OPERATION_TABLE_HEADER[c]}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {vm.rows.map((row, i) => (
              <tr
                key={i}
                onDoubleClick={() => {
                  openView({ type: 'timetable', diaIndex, houkou: row.houkou });
                }}
              >
                {vm.columns.map((c) => {
                  switch (c) {
                    case 'ressyabangou':
                      return <td key={c}>{row.ressyabangou}</td>;
                    case 'ressyasyubetsu':
                      return <td key={c}>{row.syubetsumei}</td>;
                    case 'ressyamei':
                      return <td key={c}>{row.ressyamei}</td>;
                    case 'originSideEkimei':
                      return <td key={c}>{row.originSide.ekimei}</td>;
                    case 'originSideEkiTrack':
                      return <td key={c}>{row.originSide.track}</td>;
                    case 'originSideEkijikoku':
                      return (
                        <td key={c} className="jikoku">
                          {row.originSide.jikokuText}
                        </td>
                      );
                    case 'ressyahoukou':
                      return (
                        <td key={c} className="arrow">
                          {row.houkouArrow}
                        </td>
                      );
                    case 'terminalSideEkimei':
                      return <td key={c}>{row.terminalSide.ekimei}</td>;
                    case 'terminalSideEkiTrack':
                      return <td key={c}>{row.terminalSide.track}</td>;
                    case 'terminalSideEkijikoku':
                      return (
                        <td key={c} className="jikoku">
                          {row.terminalSide.jikokuText}
                        </td>
                      );
                  }
                })}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
