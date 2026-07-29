// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 up-tri

/**
 * 運用探索 Worker の API 定義(設計 §4.6「運用探索は derive の純関数として Worker 実行」)。M7e。
 *
 * Worker 本体(operationSearch.worker.ts)とメインスレッド側クライアント
 * (operationSearchClient.ts)が共有する型と、**Worker が使えない環境用の同期実装**を置く。
 *
 * ★入出力はすべて構造化複製可能な素データ(plain object / Array / Map)。
 * deriveOperationFull の戻り値は Map を含むが Map は構造化複製できるのでそのまま返せる。
 */

import type {
  DeriveOperationFullOptions,
  DeriveOperationLightOptions,
  OperationFullResult,
  OperationLightResult,
} from '@oudia-web/derive';
import { deriveOperationFull, deriveOperationLight } from '@oudia-web/derive';
import type { Dia, Eki } from '@oudia-web/format';

/** Full 探索(運番割付あり。enableOperation===2)の入力。 */
export interface OperationFullRequest {
  readonly dia: Dia;
  readonly ekiCont: readonly Eki[];
  readonly options: DeriveOperationFullOptions;
}

/** Light 探索(接続のみ。enableOperation===1)の入力。 */
export interface OperationLightRequest {
  readonly dia: Dia;
  readonly ekiCont: readonly Eki[];
  readonly options: DeriveOperationLightOptions;
}

/** Worker が公開する API。Comlink.wrap の型パラメータになる。 */
export interface OperationSearchApi {
  full(req: OperationFullRequest): OperationFullResult;
  light(req: OperationLightRequest): OperationLightResult;
}

/**
 * 同期実装。Worker 内から expose する本体であり、
 * Worker を作れない環境(SSR / テスト / 未対応ブラウザ)のフォールバックでもある。
 */
export const operationSearchApi: OperationSearchApi = {
  full(req) {
    return deriveOperationFull(req.dia, req.ekiCont, req.options);
  },
  light(req) {
    return deriveOperationLight(req.dia, req.ekiCont, req.options);
  },
};
