// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 up-tri

/**
 * 運用探索 Worker のエントリ(設計 §4.6)。M7e。
 *
 * derive の純関数をそのまま Worker スレッドで走らせるだけ。ここにロジックは書かない。
 * 500 列車規模で数百 ms かかる探索をメインスレッドから外し、UI の 16ms 応答を守る。
 */

import { expose } from 'comlink';
import { operationSearchApi } from './operationSearchApi.js';

expose(operationSearchApi);
