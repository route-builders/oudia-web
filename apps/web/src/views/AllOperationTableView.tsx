// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 up-tri

/**
 * 運用一覧表 / 運用一覧図(設計 §3.6「1 ビューモデル + 2 レンダラ」)。M7d。
 *
 * derive の deriveAllOperationTable が返す共通ビューモデルを、表は DOM テーブルで、
 * 図は横軸 = 時刻の帯で描く。表と図は**別タブ**(記述子の graphical で区別)で、
 * ツールバーの [表|図] は対応するタブへの切替として働く。
 *
 * 行(運用)をダブルクリックすると運用表ビューを開く。
 */

import type { AllOperationTableRow, OperationSort } from '@oudia-web/derive';
import { buildAllOperationTableCsv, deriveAllOperationTable } from '@oudia-web/derive';
import { deriveBrunchLoopMap } from '@oudia-web/domain';
import type { RosenFileData } from '@oudia-web/format';
import { useMemo, useState } from 'react';
import { downloadCsv } from '../file/saveFile.js';
import { useOperationSearch } from '../hooks/useOperationSearch.js';
import { useDocStore } from '../store/docStore.js';
import { OperationSearchControls, operationSearchPlaceholder } from './OperationSearchControls.js';

const SORT_LABEL: Readonly<Record<OperationSort, string>> = {
  operationNumber: '運用番号順',
  outEki: '出区駅順',
  outJikoku: '発時刻順',
  inEki: '入区駅順',
  inJikoku: '着時刻順',
};

export function AllOperationTableView(props: {
  data: RosenFileData;
  diaIndex: number;
  graphical: boolean;
}): React.ReactElement {
  const { data, diaIndex, graphical } = props;
  const openView = useDocStore((s) => s.openView);
  const [sort, setSort] = useState<OperationSort>('operationNumber');
  const [compareBottom, setCompareBottom] = useState(false);
  const [displayAllRessya, setDisplayAllRessya] = useState(false);
  const [paused, setPaused] = useState(false);
  const [manualKey, setManualKey] = useState(0);

  const search = useOperationSearch(data, diaIndex, paused, manualKey);
  const dia = data.rosen.diaCont[diaIndex];

  const vm = useMemo(() => {
    if (dia === undefined || search.result === null) return null;
    return deriveAllOperationTable(
      dia,
      data.rosen,
      search.result.operationTable,
      {
        displayRessyamei: data.dispProp.displayRessyamei,
        displayAllRessya,
        displayParentSyubetsu: false,
        sort,
        compareBottom,
        kitenJikoku: data.rosen.kitenJikoku,
        conv: {
          noColon: false,
          outputSecond: false,
          secondRoundChaku: data.dispProp.secondRoundChaku,
          secondRoundHatsu: data.dispProp.secondRoundHatsu,
          display2400: data.dispProp.display2400,
        },
      },
      deriveBrunchLoopMap(data.rosen.ekiCont),
    );
  }, [dia, data, search.result, sort, compareBottom, displayAllRessya]);

  if (data.rosen.enableOperation < 2) {
    return (
      <div className="view-error">
        運用一覧は運用機能が「通常」(EnableOperation=2)のときだけ表示できます。
      </div>
    );
  }
  const placeholder = operationSearchPlaceholder(search, dia !== undefined && vm !== null);

  const openOperationTable = (operationNumber: string): void => {
    openView({ type: 'operationTable', diaIndex, operationNumber });
  };

  return (
    <div className="all-operation-table">
      <div className="view-toolbar">
        <label>
          並び順
          <select
            value={sort}
            onChange={(e) => {
              setSort(e.target.value as OperationSort);
            }}
          >
            {(Object.keys(SORT_LABEL) as OperationSort[]).map((k) => (
              <option key={k} value={k}>
                {SORT_LABEL[k]}
              </option>
            ))}
          </select>
        </label>
        <label>
          <input
            type="checkbox"
            checked={compareBottom}
            onChange={(e) => {
              setCompareBottom(e.target.checked);
            }}
          />
          運用番号を末尾要素から比較
        </label>
        {!graphical && (
          <label>
            <input
              type="checkbox"
              checked={displayAllRessya}
              onChange={(e) => {
                setDisplayAllRessya(e.target.checked);
              }}
            />
            全列車を表示
          </label>
        )}
        <button
          type="button"
          onClick={() => {
            openView({ type: 'allOperationTable', diaIndex, graphical: !graphical });
          }}
        >
          {graphical ? '表で見る' : '図で見る'}
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
          disabled={dia === undefined || vm === null}
          onClick={() => {
            if (dia === undefined || vm === null) return;
            downloadCsv(
              buildAllOperationTableCsv({
                dia,
                viewModel: vm,
                displayRessyamei: data.dispProp.displayRessyamei,
                displayAllRessya,
              }),
              `${dia.name}_運用一覧表.csv`,
            );
          }}
        >
          CSV 出力
        </button>
      </div>
      {placeholder ??
        (vm === null ? null : graphical ? (
          <AllOperationGraph
            rows={vm.rows}
            kitenJikoku={data.rosen.kitenJikoku}
            onOpen={openOperationTable}
          />
        ) : (
          <AllOperationGrid
            rows={vm.rows}
            displayAllRessya={displayAllRessya}
            onOpen={openOperationTable}
          />
        ))}
    </div>
  );
}

/** 一覧表レンダラ(行 = 運用、列 = 運番/出区/→/入区 + 列車情報の繰り返し)。 */
function AllOperationGrid(props: {
  rows: readonly AllOperationTableRow[];
  displayAllRessya: boolean;
  onOpen: (operationNumber: string) => void;
}): React.ReactElement {
  const { rows, onOpen } = props;
  const slots = rows[0]?.ressya.length ?? 0;
  return (
    <table className="all-operation-grid">
      <thead>
        <tr>
          <th />
          <th>運用番号</th>
          <th>出区駅名</th>
          <th>発時刻</th>
          <th />
          <th>入区駅名</th>
          <th>着時刻</th>
          {Array.from({ length: slots }, (_, i) => (
            <th key={i} colSpan={2}>
              {props.displayAllRessya ? String(i + 1) : i === 0 ? '出区列車' : '入区列車'}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr
            key={row.operationNumber}
            onDoubleClick={() => {
              onOpen(row.operationNumber);
            }}
          >
            <td className="col-number">{row.rowNumber}</td>
            <td className="op-number">{row.operationNumber}</td>
            <td>{row.outEkimei}</td>
            <td className="jikoku">{row.outJikokuText}</td>
            <td className="arrow">→</td>
            <td>{row.inEkimei}</td>
            <td className="jikoku">{row.inJikokuText}</td>
            {row.ressya.map((cell, i) => (
              <td key={i} colSpan={2} className="ressya-cell">
                {cell === null ? (
                  ''
                ) : (
                  <>
                    <span className="houkou">{cell.houkouText}</span>
                    <span className="bangou">{cell.ressyabangou}</span>
                    <span className="syubetsu">{cell.syubetsumei}</span>
                    {cell.arrowAfter && <span className="arrow">→</span>}
                  </>
                )}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const GRAPH_HOURS = 24;
const GRAPH_WIDTH = 1440; // 1 分 = 1px

/**
 * 一覧図レンダラ(行 = 運用、横軸 = 時刻)。
 * 出区〜入区を 1 本の帯で描き、上部に「時」目盛を出す。起点時刻からの相対位置で並べる。
 */
function AllOperationGraph(props: {
  rows: readonly AllOperationTableRow[];
  kitenJikoku: number | null;
  onOpen: (operationNumber: string) => void;
}): React.ReactElement {
  const { rows, kitenJikoku, onOpen } = props;
  const kiten = kitenJikoku ?? 0;
  /** 起点時刻を 0 とした分位置(循環)。 */
  const minuteOf = (j: number | null): number | null => {
    if (j === null) return null;
    let s = j - kiten;
    if (s < 0) s += 86400;
    return Math.floor(s / 60);
  };

  return (
    <div className="all-operation-graph" style={{ width: GRAPH_WIDTH + 120 }}>
      <div className="graph-scale">
        {Array.from({ length: GRAPH_HOURS }, (_, h) => (
          <span key={h} className="hour" style={{ left: 120 + h * 60 }}>
            {(Math.floor(kiten / 3600) + h) % 24}
          </span>
        ))}
      </div>
      {rows.map((row) => {
        const from = minuteOf(row.outJikoku);
        const to = minuteOf(row.inJikoku);
        const left = from ?? 0;
        const width = from !== null && to !== null && to > from ? to - from : 2;
        return (
          <div
            key={row.operationNumber}
            className="graph-row"
            onDoubleClick={() => {
              onOpen(row.operationNumber);
            }}
          >
            <span className="graph-label">{row.operationNumber}</span>
            <span className="graph-out">{row.outEkimei}</span>
            <span className="graph-band" style={{ left: 120 + left, width }} />
            <span className="graph-in">{row.inEkimei}</span>
          </div>
        );
      })}
    </div>
  );
}
