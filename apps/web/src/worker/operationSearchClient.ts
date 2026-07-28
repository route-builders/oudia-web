// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 up-tri

/**
 * 運用探索 Worker のメインスレッド側クライアント(設計 §4.6)。M7e。
 *
 * - Worker は**遅延生成**する(運用機能を使わないファイルでは起動しない)。
 * - `new Worker(new URL(...))` が失敗する環境(テスト・SSR・未対応ブラウザ)では
 *   同期実装へ自動フォールバックする。呼び出し側は常に Promise を受け取る。
 * - 呼び出し側(useOperationSearch)は「最後に依頼したものだけ採用」を seq で担保する。
 */

import { wrap } from 'comlink';
import type {
  OperationFullRequest,
  OperationLightRequest,
  OperationSearchApi,
} from './operationSearchApi.js';
import { operationSearchApi } from './operationSearchApi.js';

/** メイン側から見た API(Worker でも同期フォールバックでも常に Promise)。 */
interface AsyncOperationSearchApi {
  full(req: OperationFullRequest): Promise<ReturnType<OperationSearchApi['full']>>;
  light(req: OperationLightRequest): Promise<ReturnType<OperationSearchApi['light']>>;
}

let cached: AsyncOperationSearchApi | null = null;
let worker: Worker | null = null;

/** Worker を作る。失敗したら同期実装を返す(フォールバック)。 */
function getApi(): AsyncOperationSearchApi {
  if (cached !== null) return cached;
  try {
    if (typeof Worker === 'undefined') throw new Error('Worker unsupported');
    worker = new Worker(new URL('./operationSearch.worker.ts', import.meta.url), {
      type: 'module',
    });
    const remote = wrap<OperationSearchApi>(worker);
    cached = {
      full: (req) => remote.full(req),
      light: (req) => remote.light(req),
    };
  } catch {
    // テスト環境・未対応ブラウザ。メインスレッドで同期実行する。
    cached = {
      full: (req) => Promise.resolve(operationSearchApi.full(req)),
      light: (req) => Promise.resolve(operationSearchApi.light(req)),
    };
  }
  return cached;
}

/** Worker が実際に起動しているか(テスト・診断用)。 */
export function isWorkerActive(): boolean {
  return worker !== null;
}

/** Worker を破棄する(HMR / テストのクリーンアップ用)。 */
export function terminateOperationSearchWorker(): void {
  worker?.terminate();
  worker = null;
  cached = null;
}

/** Full 探索(運番割付あり)。 */
export async function runOperationFull(
  req: OperationFullRequest,
): Promise<ReturnType<OperationSearchApi['full']>> {
  return await getApi().full(req);
}

/** Light 探索(接続のみ)。 */
export async function runOperationLight(
  req: OperationLightRequest,
): Promise<ReturnType<OperationSearchApi['light']>> {
  return await getApi().light(req);
}
