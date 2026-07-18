// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 up-tri

// 代表規模の時刻表グリッド構築ベンチ(architecture §8.1)。
// 予算: 編集反映 16ms 以内(コマンド実行 + 列再構築 + 再描画の一部)。
// 全体構築は駅・種別編集時のみだが、可視域限定評価の前提としてホット。

import { bench, describe } from 'vitest';
import { makeBenchRosen } from '../benchFixture.js';
import { buildTimetableGrid, defaultTimetableGridOptions } from '../index.js';

const data = makeBenchRosen(50, 500);
const opts = defaultTimetableGridOptions(data, 0);

describe('通常時刻表グリッド(500 列車 × 50 駅)', () => {
  bench('buildTimetableGrid(全体)', () => {
    buildTimetableGrid(data, 0, opts);
  });
});
