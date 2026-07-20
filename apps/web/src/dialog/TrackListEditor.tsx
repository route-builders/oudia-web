// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 up-tri
//
// Based on OuDiaSecond (Copyright (C) 2017-2026 diagram_mania)
// and OuDia (Copyright (C) 2006-2017 take-okm)

/**
 * 番線リスト編集(M6、原典 CDlgEkiProp の番線 CListCtrl + iEkiTrack2Map)。
 * EkiPropDialog に埋め込む。行 = 番線。追加/削除/上下移動 + 名称・略称・主本線・省略を編集する。
 *
 * 旧→新 index マップ(長さ=編集開始時の番線数、値 -1=削除)を UI 操作から組み立てる:
 * 各行は origin(編集開始時の旧 index、または新規行は null)を保持する。commit 時に
 * 「旧 index i を持つ行の現在位置」を oldToNew[i] に、どの行にも無い旧 index を -1 にする。
 */

import type { EkiTrack2 } from '@oudia-web/format';
import { useState } from 'react';

/** 編集中の 1 行(番線 + 由来 index + 主本線フラグ + 省略フラグ)。 */
export interface TrackRow {
  /** 編集開始時の旧 index。新規行は null(マップ対象外)。 */
  origin: number | null;
  trackName: string;
  trackRyakusyou: string;
  trackNoboriRyakusyou: string;
  isDownMain: boolean;
  isUpMain: boolean;
  omit: boolean;
}

/** Eki の番線データから編集用の行配列を作る。 */
export function toTrackRows(
  tracks: readonly EkiTrack2[],
  downMain: number,
  upMain: number,
  omit: readonly boolean[],
): TrackRow[] {
  return tracks.map((t, i) => ({
    origin: i,
    trackName: t.trackName,
    trackRyakusyou: t.trackRyakusyou,
    trackNoboriRyakusyou: t.trackNoboriRyakusyou,
    isDownMain: i === downMain,
    isUpMain: i === upMain,
    omit: omit[i] ?? false,
  }));
}

/** 行配列から commit 用の { tracks, downMain, upMain, diagramTrackOmit, oldToNew } を導出。 */
export function fromTrackRows(
  rows: readonly TrackRow[],
  oldCount: number,
): {
  tracks: EkiTrack2[];
  downMain: number;
  upMain: number;
  diagramTrackOmit: boolean[];
  oldToNew: number[];
} {
  const tracks: EkiTrack2[] = rows.map((r) => ({
    trackName: r.trackName,
    trackRyakusyou: r.trackRyakusyou,
    trackNoboriRyakusyou: r.trackNoboriRyakusyou,
  }));
  const diagramTrackOmit = rows.map((r) => r.omit);
  let downMain = rows.findIndex((r) => r.isDownMain);
  let upMain = rows.findIndex((r) => r.isUpMain);
  if (downMain < 0) downMain = 0;
  if (upMain < 0) upMain = 0;
  // oldToNew: 旧 index → 現在位置。どの行にも無い旧 index は -1(削除)。
  const oldToNew = new Array<number>(oldCount).fill(-1);
  rows.forEach((r, newIdx) => {
    if (r.origin !== null && r.origin >= 0 && r.origin < oldCount) {
      oldToNew[r.origin] = newIdx;
    }
  });
  return { tracks, downMain, upMain, diagramTrackOmit, oldToNew };
}

/** 主本線は 1 本のみ(原典 CDlgEkiProp の demote 動作)。指定行を主本線にし他を降格。 */
function setSoleMain(rows: TrackRow[], index: number, kind: 'down' | 'up'): TrackRow[] {
  return rows.map((r, i) => ({
    ...r,
    ...(kind === 'down' ? { isDownMain: i === index } : { isUpMain: i === index }),
  }));
}

export function TrackListEditor(props: {
  rows: TrackRow[];
  onChange: (rows: TrackRow[]) => void;
}): React.ReactElement {
  const { rows, onChange } = props;
  const [sel, setSel] = useState(0);
  const s = Math.min(sel, rows.length - 1);

  const update = (index: number, patch: Partial<TrackRow>): void => {
    onChange(rows.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  };

  const add = (): void => {
    const num = rows.length + 1;
    onChange([
      ...rows,
      {
        origin: null,
        trackName: `${String(num)}番線`,
        trackRyakusyou: String(num),
        trackNoboriRyakusyou: '',
        isDownMain: false,
        isUpMain: false,
        omit: false,
      },
    ]);
    setSel(rows.length);
  };

  const remove = (): void => {
    if (rows.length <= 1) return;
    onChange(rows.filter((_, i) => i !== s));
    setSel(Math.max(0, s - 1));
  };

  const move = (dir: -1 | 1): void => {
    const j = s + dir;
    if (j < 0 || j >= rows.length) return;
    const next = [...rows];
    const a = next[s];
    const b = next[j];
    if (a === undefined || b === undefined) return;
    next[s] = b;
    next[j] = a;
    onChange(next);
    setSel(j);
  };

  return (
    <fieldset className="dialog-field track-editor">
      <legend>番線</legend>
      <div className="track-editor-toolbar">
        <button type="button" onClick={add}>
          追加
        </button>
        <button type="button" onClick={remove} disabled={rows.length <= 1}>
          削除
        </button>
        <button type="button" onClick={() => move(-1)} disabled={s <= 0}>
          上へ
        </button>
        <button type="button" onClick={() => move(1)} disabled={s >= rows.length - 1}>
          下へ
        </button>
      </div>
      <table className="track-editor-table">
        <thead>
          <tr>
            <th>番線名</th>
            <th>略称</th>
            <th>上り略称</th>
            <th>下り主</th>
            <th>上り主</th>
            <th>省略</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className={i === s ? 'selected' : ''} onClick={() => setSel(i)}>
              <td>
                <input
                  type="text"
                  value={r.trackName}
                  aria-label={`番線名 ${String(i)}`}
                  onChange={(e) => update(i, { trackName: e.target.value })}
                />
              </td>
              <td>
                <input
                  type="text"
                  value={r.trackRyakusyou}
                  aria-label={`略称 ${String(i)}`}
                  onChange={(e) => update(i, { trackRyakusyou: e.target.value })}
                />
              </td>
              <td>
                <input
                  type="text"
                  value={r.trackNoboriRyakusyou}
                  aria-label={`上り略称 ${String(i)}`}
                  onChange={(e) => update(i, { trackNoboriRyakusyou: e.target.value })}
                />
              </td>
              <td>
                <input
                  type="radio"
                  name="downMain"
                  checked={r.isDownMain}
                  aria-label={`下り主本線 ${String(i)}`}
                  onChange={() => onChange(setSoleMain(rows, i, 'down'))}
                />
              </td>
              <td>
                <input
                  type="radio"
                  name="upMain"
                  checked={r.isUpMain}
                  aria-label={`上り主本線 ${String(i)}`}
                  onChange={() => onChange(setSoleMain(rows, i, 'up'))}
                />
              </td>
              <td>
                <input
                  type="checkbox"
                  checked={r.omit}
                  aria-label={`ダイヤ表示省略 ${String(i)}`}
                  onChange={(e) => update(i, { omit: e.target.checked })}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </fieldset>
  );
}
