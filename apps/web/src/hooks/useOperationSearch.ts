// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 up-tri

/**
 * 運用探索結果の導出キャッシュ(architecture §4.1: 導出値はストア外)。M7d → M7e で Worker 化。
 *
 * 原典は列車編集のたびにダイヤ単位で全再探索する。TS も「ダイヤが変わったら再計算」を
 * 副作用で行うが、探索は **Worker** で実行し(設計 §4.6)、完了までは**前回結果を出し続ける**。
 * これで 500 列車規模でも UI が固まらない(roadmap M7 完了条件 #2)。
 *
 * 設計 §3.6 の「運用更新の一時停止」(+ F5 手動更新)は paused / manualKey で表現し、
 * 一時停止中は前回の結果を保持したまま返す(原典と同じ挙動)。
 *
 * enableOperation < 2(無効・簡易)では運番が割り当たらないので null を返す。
 */

import type { OperationFullResult } from '@oudia-web/derive';
import type { RosenFileData } from '@oudia-web/format';
import { useEffect, useRef, useState } from 'react';
import { runOperationFull } from '../worker/operationSearchClient.js';

export interface UseOperationSearchResult {
  /** 探索結果。enableOperation < 2 のときは null。探索中は**前回の結果**。 */
  readonly result: OperationFullResult | null;
  /** 一時停止中(表示中の結果が古い可能性がある)。 */
  readonly paused: boolean;
  /** 探索実行中(表示中の結果は前回のもの)。 */
  readonly pending: boolean;
  /** 探索が例外で終わったときのメッセージ。成功で null に戻る。 */
  readonly error: string | null;
}

/**
 * ダイヤの運用探索を Worker で実行する(一時停止中は前回結果を保持)。
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
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastManualKey = useRef<number>(manualKey);
  /** 最後に依頼した探索の通し番号。古い応答はこれと違えば捨てる。 */
  const seq = useRef(0);
  const dia = data?.rosen.diaCont[diaIndex];

  useEffect(() => {
    const forced = manualKey !== lastManualKey.current;
    lastManualKey.current = manualKey;
    // 一時停止中は自動更新しない(手動更新のときだけ通す)。
    if (paused && !forced) return;
    if (data === null || dia === undefined || data.rosen.enableOperation < 2) {
      seq.current += 1; // 走行中の探索の応答を無効化する
      setResult(null);
      setPending(false);
      setError(null);
      return;
    }
    const mySeq = ++seq.current;
    setPending(true);
    runOperationFull({
      dia,
      ekiCont: data.rosen.ekiCont,
      options: {
        operationCrossKitenJikoku: data.rosen.operationCrossKitenJikoku,
        disableHiddenSyubetsu: data.rosen.disableHiddenSyubetsu,
        kitenJikoku: data.rosen.kitenJikoku,
        operationNumberReverse: data.rosen.operationNumberReverse,
        syubetsuCont: data.rosen.ressyasyubetsuCont,
      },
    })
      .then((r) => {
        if (seq.current !== mySeq) return; // 追い越された古い応答は捨てる
        setResult(r);
        setError(null);
        setPending(false);
      })
      .catch((e: unknown) => {
        if (seq.current !== mySeq) return;
        // 失敗しても前回結果は保持する(表示を空にしない)。
        setError(e instanceof Error ? e.message : String(e));
        setPending(false);
      });
  }, [data, dia, paused, manualKey]);

  return { result, paused, pending, error };
}
