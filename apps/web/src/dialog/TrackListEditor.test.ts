// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 up-tri

/** 番線編集の旧→新マップ導出(fromTrackRows)の検証。UI 操作の中核ロジック。 */

import type { EkiTrack2 } from '@oudia-web/format';
import { describe, expect, it } from 'vitest';
import { fromTrackRows, type TrackRow, toTrackRows } from './TrackListEditor.js';

function tracks(...names: string[]): EkiTrack2[] {
  return names.map((n) => ({ trackName: `${n}番線`, trackRyakusyou: n, trackNoboriRyakusyou: '' }));
}

describe('toTrackRows / fromTrackRows', () => {
  it('無編集ラウンドトリップは恒等マップ', () => {
    const rows = toTrackRows(tracks('1', '2', '3'), 0, 1, [false, false, false]);
    const out = fromTrackRows(rows, 3);
    expect(out.oldToNew).toEqual([0, 1, 2]);
    expect(out.downMain).toBe(0);
    expect(out.upMain).toBe(1);
    expect(out.tracks).toHaveLength(3);
  });

  it('先頭↔末尾の入替で oldToNew が正しく permute', () => {
    const rows = toTrackRows(tracks('1', '2', '3'), 0, 1, [false, false, false]);
    // [1,2,3] → [3,2,1](0↔2)。origin は 2,1,0 の順。
    const reordered: TrackRow[] = [rows[2], rows[1], rows[0]].filter(
      (r): r is TrackRow => r !== undefined,
    );
    const out = fromTrackRows(reordered, 3);
    // 旧0 は新2、旧1 は新1、旧2 は新0。
    expect(out.oldToNew).toEqual([2, 1, 0]);
  });

  it('中間の削除で oldToNew に -1 が入り残りが詰まる', () => {
    const rows = toTrackRows(tracks('1', '2', '3'), 0, 2, [false, false, false]);
    // 番線 1(index1)を削除 → [1番線, 3番線]。
    const remaining: TrackRow[] = [rows[0], rows[2]].filter((r): r is TrackRow => r !== undefined);
    const out = fromTrackRows(remaining, 3);
    expect(out.oldToNew).toEqual([0, -1, 1]);
    expect(out.tracks).toHaveLength(2);
  });

  it('新規追加行は oldToNew の対象外(末尾に増える)', () => {
    const rows = toTrackRows(tracks('1', '2'), 0, 1, [false, false]);
    const added: TrackRow[] = [
      ...rows,
      {
        origin: null,
        trackName: '3番線',
        trackRyakusyou: '3',
        trackNoboriRyakusyou: '',
        isDownMain: false,
        isUpMain: false,
        omit: false,
      },
    ];
    const out = fromTrackRows(added, 2);
    // 旧番線 2 個は恒等、新規行はマップに現れない(長さ = 旧番線数 2)。
    expect(out.oldToNew).toEqual([0, 1]);
    expect(out.tracks).toHaveLength(3);
  });

  it('主本線フラグが downMain/upMain に反映される', () => {
    const rows = toTrackRows(tracks('1', '2', '3'), 0, 1, [false, false, false]);
    // 3番線(index2)を下り主本線に。
    const edited = rows.map((r, i) => ({ ...r, isDownMain: i === 2 }));
    const out = fromTrackRows(edited, 3);
    expect(out.downMain).toBe(2);
    expect(out.upMain).toBe(1); // 変更なし
  });
});
