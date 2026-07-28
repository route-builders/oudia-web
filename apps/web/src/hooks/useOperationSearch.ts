// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 up-tri

/**
 * 運用探索結果の導出キャッシュ(architecture §4.1: 導出値はストア外)。M7d。
 *
 * 原典は列車編集のたびにダイヤ単位で全再探索する。TS も「ダイヤが変わったら再計算」を
 * 副作用で行う。設計 §3.6 の「運用更新の一時停止」(+ F5 手動更新)は paused / manualKey で
 * 表現し、一時停止中は**前回の結果を保持**したまま返す(原典と同じ挙動)。
 *
 * enableOperation < 2(無効・簡易)では運番が割り当たらないので null を返す。
 * ★Worker への退避(設計 §3.6 の非ブロック実行)は別タスク。今は同期実行する。
 */

import { deriveOperationFull, type OperationFullResult } from '@oudia-web/derive';
import type { RosenFileData } from '@oudia-web/format';
import { useEffect, useRef, useState } from 'react';

export interface UseOperationSearchResult {
  /** 探索結果。enableOperation < 2 のときは null。 */
  readonly result: OperationFullResult | null;
  /** 一時停止中(表示中の結果が古い可能性がある)。 */
  readonly paused: boolean;
}

/**
 * ダイヤの運用探索を実行する(一時停止中は前回結果を保持)。
 *
 * @param paused    運用更新の一時停止。既定 false
 * @param manualKey 手動更新(F5)のたびに増やす値。paused でもこれが変われば再計算する
 */
export function useOperationSearch(
  data: RosenFileData | null,
  diaIndex: number,
  paused = false,
  manualKey = 0,
): UseOperationSearchResult {
  const [result, setResult] = useState<OperationFullResult | null>(null);
  const lastManualKey = useRef<number>(manualKey);
  const dia = data?.rosen.diaCont[diaIndex];

  useEffect(() => {
    const forced = manualKey !== lastManualKey.current;
    lastManualKey.current = manualKey;
    // 一時停止中は自動更新しない(手動更新のときだけ通す)。
    if (paused && !forced) return;
    if (data === null || dia === undefined || data.rosen.enableOperation < 2) {
      setResult(null);
      return;
    }
    setResult(
      deriveOperationFull(dia, data.rosen.ekiCont, {
        operationCrossKitenJikoku: data.rosen.operationCrossKitenJikoku,
        disableHiddenSyubetsu: data.rosen.disableHiddenSyubetsu,
        kitenJikoku: data.rosen.kitenJikoku,
        operationNumberReverse: data.rosen.operationNumberReverse,
        syubetsuCont: data.rosen.ressyasyubetsuCont,
      }),
    );
  }, [data, dia, paused, manualKey]);

  return { result, paused };
}
