// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 up-tri

/**
 * ダイヤグラム運用記号の幾何導出(operationMark.ts)の単体テスト。M7d。
 * 出区○/入区△の上下向き・路線外斜線の伸ばす向き・前列車接続円弧の出現条件を検証する。
 */

import { describe, expect, it } from 'vitest';
import {
  deriveOperationMarks,
  deriveOperationNumberLabels,
  type OperationMarkInput,
} from './operationMark.js';

const base: OperationMarkInput = {
  houkou: 0,
  trackDisplay: true,
  chakuOperation: 0,
  hatsuOperation: 0,
  zaisen: [{ trackIndex: 0, dgrXChaku: 100, dgrXHatsu: 200, operationNumber: '5' }],
  dgrYSizeEkikanDefault: 60,
};

describe('deriveOperationMarks', () => {
  it('出区は中抜き円。在線 1 区間なら上方向(-1)', () => {
    const marks = deriveOperationMarks({ ...base, chakuOperation: 3 });
    expect(marks).toHaveLength(1);
    expect(marks[0]).toEqual({
      kind: 'outCircle',
      dgrX: 100,
      yShift: -1,
      operationNumber: '5',
    });
  });

  it('出区: 発側が -4/-5(分岐+逆方向)なら下方向(+1)', () => {
    const marks = deriveOperationMarks({ ...base, chakuOperation: 3, hatsuOperation: -4 });
    expect(marks[0]?.kind).toBe('outCircle');
    if (marks[0]?.kind === 'outCircle') expect(marks[0].yShift).toBe(1);
  });

  it('出区: 複数在線では次の番線と反対側に置く', () => {
    const marks = deriveOperationMarks({
      ...base,
      chakuOperation: 3,
      zaisen: [
        { trackIndex: 2, dgrXChaku: 100, dgrXHatsu: 150, operationNumber: '5' },
        { trackIndex: 0, dgrXChaku: 150, dgrXHatsu: 200, operationNumber: '5' },
      ],
    });
    // 下りで 0 番線側(小さい方)へ動く → 円は反対側(+1)。
    if (marks[0]?.kind === 'outCircle') expect(marks[0].yShift).toBe(1);
  });

  it('入区は中抜き三角。在線 1 区間なら下方向(+1)', () => {
    const marks = deriveOperationMarks({ ...base, hatsuOperation: 3 });
    expect(marks[0]).toEqual({
      kind: 'inTriangle',
      dgrX: 200,
      yShift: 1,
      operationNumber: '5',
    });
  });

  it('路線外始発は着 X から左へ 0.7D 伸びる斜線 + 駅名ラベル', () => {
    const marks = deriveOperationMarks({
      ...base,
      chakuOperation: 4,
      outerEkimeiSihatsu: '車庫',
    });
    expect(marks[0]).toEqual({
      kind: 'outerSlash',
      dgrXInner: 100,
      dgrXOuter: 100 - 42, // 60 * 0.7
      yShift: -1,
      isSihatsu: true,
      label: '車庫 5',
    });
  });

  it('路線外終着は発 X から右へ 0.7D 伸びる', () => {
    const marks = deriveOperationMarks({
      ...base,
      hatsuOperation: 4,
      outerEkimeiSyuuchaku: '車庫',
    });
    expect(marks[0]).toMatchObject({
      kind: 'outerSlash',
      dgrXInner: 200,
      dgrXOuter: 242,
      isSihatsu: false,
      yShift: 1,
    });
  });

  it('前列車接続の円弧は在線表非表示駅でだけ出る', () => {
    const shown = deriveOperationMarks({ ...base, chakuOperation: 5, trackDisplay: true });
    expect(shown).toHaveLength(0);
    const hidden = deriveOperationMarks({
      ...base,
      chakuOperation: 5,
      trackDisplay: false,
      prevRessyahoukou: 1,
    });
    expect(hidden[0]).toEqual({
      kind: 'prevJunctionArc',
      dgrXLeft: 100,
      dgrXRight: 200,
      leftShape: 1,
      rightShape: 1,
    });
  });

  it('在線区間がなければ何も出さない', () => {
    expect(deriveOperationMarks({ ...base, chakuOperation: 3, zaisen: [] })).toHaveLength(0);
  });
});

describe('deriveOperationNumberLabels', () => {
  it('在線横線の中央に運番を置く(下りは線の上側)', () => {
    expect(deriveOperationNumberLabels(base)).toEqual([
      { dgrX: 150, trackIndex: 0, yShift: -1, text: '5' },
    ]);
  });

  it('上りは線の下側', () => {
    expect(deriveOperationNumberLabels({ ...base, houkou: 1 })[0]?.yShift).toBe(1);
  });

  it('出区/入区/路線外のときはマーク側にラベルが付くので出さない', () => {
    expect(deriveOperationNumberLabels({ ...base, chakuOperation: 3 })).toHaveLength(0);
    expect(deriveOperationNumberLabels({ ...base, hatsuOperation: 4 })).toHaveLength(0);
  });

  it('運番が空の在線区間は出さない', () => {
    const r = deriveOperationNumberLabels({
      ...base,
      zaisen: [{ trackIndex: 0, dgrXChaku: 0, dgrXHatsu: 10, operationNumber: '' }],
    });
    expect(r).toHaveLength(0);
  });
});
