// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 up-tri
//
// Based on OuDiaSecond (Copyright (C) 2017-2026 diagram_mania)
// and OuDia (Copyright (C) 2006-2017 take-okm)

/**
 * カスタマイズ時刻表ビュー(冊子風。原典 ViewJikokuhyou の bCustomizeDisplayMode 経路)。
 * follow-up #11。
 *
 * 通常時刻表と違い **1 列 = 1 チェーン**で、列の中に複数の列車が縦に積まれる。
 * 列の並びは運用探索が決める(enableOperation が 1 以上のとき併合・分割が起きる)。
 *
 * ★読み取り専用。編集は通常時刻表で行う(原典も同じ)。
 * ★描画は当面 DOM テーブル。列数が多いファイルでの Canvas 化は後続。
 */

import type { CustomizeRowSpec } from '@oudia-web/derive';
import {
  buildCustomizeChainsWithoutOperation,
  buildCustomizeGrid,
  buildCustomizeRowSpec,
  buildCustomizeTimetableCsv,
} from '@oudia-web/derive';
import type { RosenFileData } from '@oudia-web/format';
import { useMemo, useState } from 'react';
import { downloadCsv } from '../file/saveFile.js';
import { useOperationSearch } from '../hooks/useOperationSearch.js';
import {
  OperationSearchControls,
  operationRefreshKeyProps,
  operationSearchPlaceholder,
} from './OperationSearchControls.js';

/** 行の左見出し(原典の項目名)。駅ブロックは駅名 + 種別で作る。 */
const ROW_LABEL: Partial<Record<CustomizeRowSpec['type'], string>> = {
  ressyabangou: '列車番号',
  operationNumber: '運用番号',
  ressyasyubetsu: '列車種別',
  ressyamei: '列車名',
  gousuu: '号数',
  gou: '',
  shihatsuEkimei: '始発駅',
  shuchakuEkimei: '終着駅',
  bikou: '備考',
};

/** 駅ブロック行の 2 列目(着/発/番線 等)の見出し。 */
const EKI_SUB_LABEL: Partial<Record<CustomizeRowSpec['type'], string>> = {
  ekiPrevRessyabangou: '前の列車番号',
  ekiPrevOperationNumber: '前の運用番号',
  ekiPrevRessyasyubetsu: '前の列車種別',
  ekiPrevRessyamei: '前の列車名',
  ekiPrevGousuu: '',
  ekiPrevGou: '',
  ekiOuterShihatsu1: '始発駅',
  ekiOuterShihatsu2: '時刻',
  chaku: '着',
  nyuusen: '入線',
  track: '番線',
  ekiRessyabangou: '列車番号',
  ekiOperationNumber: '運用番号',
  ekiRessyasyubetsu: '列車種別',
  ekiRessyamei: '列車名',
  ekiGousuu: '',
  ekiGou: '',
  hatsu: '発',
  ekiOuterShuchaku1: '終着駅',
  ekiOuterShuchaku2: '時刻',
};

export function CustomizeTimetableView(props: {
  data: RosenFileData;
  diaIndex: number;
  houkou: 0 | 1;
}): React.ReactElement {
  const { data, diaIndex, houkou } = props;
  const [paused, setPaused] = useState(false);
  const [manualKey, setManualKey] = useState(0);
  const [displayEkimei, setDisplayEkimei] = useState(true);
  // [通過駅の駅時刻を表示する]。OFF のとき通過駅は " ﾚ"(原典の全分岐で同じガード)。
  const [displayTsuuka, setDisplayTsuuka] = useState(false);

  const search = useOperationSearch(data, diaIndex, paused, manualKey);
  const dia = data.rosen.diaCont[diaIndex];
  const enableOperation = data.rosen.enableOperation;

  /** チェーン列。運用機能が無効なら探索を待たずに 1 列車 1 列で作る。 */
  const chains = useMemo(() => {
    if (dia === undefined) return null;
    if (enableOperation === 0) {
      return buildCustomizeChainsWithoutOperation(
        dia.ressyaCont[houkou] ?? [],
        data.rosen.ressyasyubetsuCont,
        data.rosen.disableHiddenSyubetsu,
      );
    }
    if (search.result === null) return null;
    return houkou === 0
      ? search.result.customizeRessyaIndexChains.kudari
      : search.result.customizeRessyaIndexChains.nobori;
  }, [dia, houkou, enableOperation, data.rosen, search.result]);

  const rows = useMemo(
    () =>
      buildCustomizeRowSpec(data.rosen.ekiCont, houkou, {
        displayRessyamei: data.dispProp.displayRessyamei,
        enableOperation,
        operationNumberRows: data.dispProp.operationNumberRows,
        displayShihatsuShuchakuEkimei: displayEkimei,
      }),
    [data.rosen.ekiCont, houkou, data.dispProp, enableOperation, displayEkimei],
  );

  const gridOptions = useMemo(
    () => ({
      conv: {
        noColon: false,
        outputSecond: false,
        secondRoundChaku: data.dispProp.secondRoundChaku,
        secondRoundHatsu: data.dispProp.secondRoundHatsu,
        display2400: data.dispProp.display2400,
      },
      displayTsuukaEkiJikoku: displayTsuuka,
    }),
    [data.dispProp, displayTsuuka],
  );

  const columns = useMemo(() => {
    if (dia === undefined || chains === null) return null;
    return buildCustomizeGrid(dia, data.rosen, houkou, chains, rows, gridOptions);
  }, [dia, data.rosen, houkou, chains, rows, gridOptions]);

  // 運用機能が無効なら探索は不要なので placeholder も出さない。
  const ready = dia !== undefined && columns !== null;
  const placeholder =
    enableOperation === 0 ? (
      ready ? null : (
        <div className="view-error">カスタマイズ時刻表を生成できませんでした。</div>
      )
    ) : (
      operationSearchPlaceholder(search, ready)
    );

  const ekiCount = data.rosen.ekiCont.length;
  const ekimeiOf = (ekiOrder: number): string => {
    const idx = houkou === 0 ? ekiOrder : ekiCount - 1 - ekiOrder;
    return data.rosen.ekiCont[idx]?.ekimei ?? '';
  };

  return (
    <div
      className="customize-timetable"
      {...operationRefreshKeyProps(() => {
        setManualKey((k) => k + 1);
      })}
    >
      <div className="view-toolbar">
        <label>
          <input
            type="checkbox"
            checked={displayEkimei}
            onChange={(e) => {
              setDisplayEkimei(e.target.checked);
            }}
          />
          始発・終着駅名を表示
        </label>
        <label>
          <input
            type="checkbox"
            checked={displayTsuuka}
            onChange={(e) => {
              setDisplayTsuuka(e.target.checked);
            }}
          />
          通過駅の時刻を表示
        </label>
        {enableOperation > 0 && (
          <OperationSearchControls
            search={search}
            paused={paused}
            onPausedChange={setPaused}
            onRefresh={() => {
              setManualKey((k) => k + 1);
            }}
          />
        )}
        <button
          type="button"
          disabled={dia === undefined || chains === null}
          onClick={() => {
            if (dia === undefined || chains === null) return;
            downloadCsv(
              buildCustomizeTimetableCsv({
                rosen: data.rosen,
                dia,
                houkou,
                chains,
                rowOptions: {
                  displayRessyamei: data.dispProp.displayRessyamei,
                  enableOperation,
                  operationNumberRows: data.dispProp.operationNumberRows,
                  displayShihatsuShuchakuEkimei: displayEkimei,
                },
                gridOptions,
              }),
              `${dia.name}_${houkou === 0 ? '下り' : '上り'}カスタマイズ時刻表.csv`,
            );
          }}
        >
          CSV 出力
        </button>
        <span className="stale-note">{chains === null ? '' : `${String(chains.length)} 列`}</span>
      </div>
      {placeholder ??
        (columns === null ? null : (
          <div className="customize-scroller">
            <table className="customize-grid">
              <tbody>
                {rows.map((row, ri) => {
                  const isEki = row.ekiOrder !== null;
                  // 同じ駅の最初の行にだけ駅名を出す(縦の駅ブロック見出し)。
                  const first = rows.findIndex((r) => r.ekiOrder === row.ekiOrder);
                  const label = isEki
                    ? ri === first
                      ? ekimeiOf(row.ekiOrder)
                      : ''
                    : (ROW_LABEL[row.type] ?? '');
                  return (
                    <tr key={ri} className={isEki ? 'eki-row' : 'header-row'}>
                      <th className="row-ekimei">{label}</th>
                      <th className="row-sub">{isEki ? (EKI_SUB_LABEL[row.type] ?? '') : ''}</th>
                      {columns.map((col, ci) => (
                        <td key={ci} className={`cell-${col.cells[ri]?.kind ?? 'empty'}`}>
                          {col.cells[ri]?.text ?? ''}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ))}
    </div>
  );
}
