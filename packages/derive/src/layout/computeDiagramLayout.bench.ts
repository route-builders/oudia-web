// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 oudia-second-web contributors

// 代表規模(500 列車 × 50 駅)のレイアウト計算ベンチ(architecture §8.1)。
// 予算: computeDiagramLayout 全体 < 100ms(駅・種別編集時のみ)、
//       1 列車再計算(編集反映のホットパス)< 0.5ms。CI で前回比を追跡する。

import { bench, describe } from 'vitest';
import { computeDiagramLayout, buildDiaLayoutFrame } from '../index.js';
import { makeBenchRosen } from '../benchFixture.js';

const data = makeBenchRosen(50, 500);

describe('ダイヤグラムレイアウト(500 列車 × 50 駅)', () => {
  bench('computeDiagramLayout(全体)', () => {
    computeDiagramLayout(data, 0);
  });

  bench('buildDiaLayoutFrame(Y 軸 + 駅間最小秒スキャン)', () => {
    const dia = data.rosen.diaCont[0]!;
    buildDiaLayoutFrame(data.rosen, dia.ressyaCont[0], dia.ressyaCont[1]);
  });
});
