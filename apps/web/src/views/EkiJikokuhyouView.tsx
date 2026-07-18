// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 up-tri

/**
 * 駅時刻表ビュー(読み取り専用の発車標)。derive の deriveEkiJikokuhyou VM を DOM テーブルで
 * 表示する。発車標は小規模なので Canvas グリッドではなく素の table を使う(M1 簡略)。
 */

import { deriveEkiJikokuhyou, getEkimeiJikokuhyouRyaku } from '@oudia-web/derive';
import { ekiIndexOfEkiOrder } from '@oudia-web/domain';
import type { RosenFileData } from '@oudia-web/format';
import { useMemo } from 'react';

export function EkiJikokuhyouView(props: {
  data: RosenFileData;
  diaIndex: number;
  houkou: 0 | 1;
  ekiOrder: number;
}): React.ReactElement {
  const { data, diaIndex, houkou, ekiOrder } = props;
  const dia = data.rosen.diaCont[diaIndex];

  const vm = useMemo(() => {
    if (dia === undefined) return null;
    return deriveEkiJikokuhyou(data, dia, houkou, ekiOrder);
  }, [data, dia, houkou, ekiOrder]);

  if (dia === undefined || vm === null) {
    return <div className="view-error">駅時刻表を生成できませんでした。</div>;
  }

  const ekiCount = data.rosen.ekiCont.length;
  const hours = [...vm.buckets.keys()].sort((a, b) => a - b);

  const destName = (order: number): string => {
    if (order === -1) return '環状';
    if (order === -2) return '環状線';
    const eki = data.rosen.ekiCont[ekiIndexOfEkiOrder(order, ekiCount, houkou)];
    return eki === undefined ? '' : getEkimeiJikokuhyouRyaku(eki);
  };
  const syubetsuRyaku = (i: number): string => data.rosen.ressyasyubetsuCont[i]?.ryakusyou ?? '';

  return (
    <div className="eki-jikokuhyou">
      <table>
        <tbody>
          {hours.map((h) => {
            const list = vm.buckets.get(h) ?? [];
            return (
              <tr key={h}>
                <th className="hour">{h}</th>
                <td>
                  {list.map((c, i) => (
                    <span key={i} className="dep">
                      <span className="min">
                        {c.isShihatsu ? '●' : ''}
                        {String(c.minute).padStart(2, '0')}
                      </span>
                      <span className="syubetsu">{syubetsuRyaku(c.syubetsuIndex)}</span>
                      <span className="dest">{destName(c.syuuchakuEkiOrder)}</span>
                    </span>
                  ))}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
