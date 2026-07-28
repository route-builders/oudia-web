// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 up-tri
//
// Based on OuDiaSecond (Copyright (C) 2017-2026 diagram_mania)
// and OuDia (Copyright (C) 2006-2017 take-okm)

/**
 * 運用表の箱ダイヤ形式レンダラ(原典 CWndDcdGridOperationTable の Extension 経路 +
 * CDcDraw_Extension の図形)。M7e。
 *
 * derive の deriveBoxOperationTableView が返す「駅 = 列 / 列車 = 行」のビューモデルを、
 * 1 列車 = 着行 / 線行(3px)/ 発行 の 3 段テーブルとして描く。
 *
 * 図形の再現:
 * - 横線 full/right/left … 線行セル内の div の幅と位置(原典 CDcDraw_Extension.cpp:132-180)
 * - 破線 dash … 原典は等間隔でない 5 本の矩形(:181-222)。同じ比率を linear-gradient の
 *   ハードストップで再現する(x = 0, 3w/16, 7w/16, 11w/16, 15w/16 / 幅 w/16, w/8, w/8, w/8, 残り)
 * - 出区 ○ … 着セルの下端に接する中抜きの円。直径 = セル高 × 0.8(:223-260)
 * - 入区 △ … 発セルの上端に頂点、下端 0.8 の位置に底辺(:263-310)。上向き・中抜き
 * - 縦線 … セル中央の幅 3px の縦棒
 *
 * ★記号を置いたセルには時刻を描かない(原典はテキストボックスごと置換する)。
 * ビューモデル側で番線名を反対のセルへ逃がしてあるので、ここでは素直に出す。
 */

import type {
  BoxCell,
  BoxLineType,
  BoxOperationTableViewModel,
  BoxSymbol,
} from '@oudia-web/derive';
import { colorrefToCss } from '@oudia-web/render';

/** 破線の 5 セグメント(原典 CDcDraw_Extension.cpp:181-222 の比率)。 */
const DASH_STOPS: readonly (readonly [number, number])[] = [
  [0, 6.25],
  [18.75, 31.25],
  [43.75, 56.25],
  [68.75, 81.25],
  [93.75, 100],
];

function dashBackground(color: string): string {
  const parts: string[] = [];
  let prev = 0;
  for (const [from, to] of DASH_STOPS) {
    parts.push(`transparent ${String(prev)}%`, `transparent ${String(from)}%`);
    parts.push(`${color} ${String(from)}%`, `${color} ${String(to)}%`);
    prev = to;
  }
  parts.push(`transparent ${String(prev)}%`, 'transparent 100%');
  return `linear-gradient(to right, ${parts.join(',')})`;
}

/** 線行セルの中身(横線)。 */
function LineBar(props: { line: BoxLineType; color: string }): React.ReactElement | null {
  const { line, color } = props;
  if (line === 'none') return null;
  if (line === 'dash') {
    return (
      <span
        className="box-line"
        style={{ left: 0, width: '100%', background: dashBackground(color) }}
      />
    );
  }
  // right = 右半分(中央から右端)/ left = 左半分(左端から中央)。
  const style =
    line === 'full'
      ? { left: 0, width: '100%' }
      : line === 'right'
        ? { left: '50%', width: '50%' }
        : { left: 0, width: '50%' };
  return <span className="box-line" style={{ ...style, background: color }} />;
}

/** 着セル / 発セルの記号。 */
function BoxMark(props: { symbol: BoxSymbol; color: string }): React.ReactElement | null {
  const { symbol, color } = props;
  switch (symbol) {
    case 'none':
      return null;
    case 'vline':
      return <span className="box-vline" style={{ background: color }} />;
    case 'circle':
      // 中抜きの円。下端が線行に接する(原典は着セル高の 0.8)。
      return (
        <svg className="box-mark box-mark-circle" viewBox="0 0 10 10" aria-hidden="true">
          <circle cx="5" cy="5" r="4" fill="none" stroke={color} strokeWidth="1.6" />
        </svg>
      );
    case 'triangle':
      // 上向きの中抜き三角。頂点が線行に接する。
      return (
        <svg className="box-mark box-mark-triangle" viewBox="0 0 10 10" aria-hidden="true">
          <polygon points="5,1 1,9 9,9" fill="none" stroke={color} strokeWidth="1.6" />
        </svg>
      );
  }
}

function ChakuCell(props: { cell: BoxCell | null; color: string }): React.ReactElement {
  const { cell, color } = props;
  if (cell === null) return <td className="box-chaku" />;
  return (
    <td className={`box-chaku${cell.chakuGray ? ' tsuuka' : ''}`}>
      <BoxMark symbol={cell.chakuSymbol} color={color} />
      {cell.chakuSymbol === 'none' && cell.chaku}
    </td>
  );
}

function HatsuCell(props: { cell: BoxCell | null; color: string }): React.ReactElement {
  const { cell, color } = props;
  if (cell === null) return <td className="box-hatsu" />;
  return (
    <td className={`box-hatsu${cell.hatsuGray ? ' tsuuka' : ''}`}>
      <BoxMark symbol={cell.hatsuSymbol} color={color} />
      {cell.hatsuSymbol === 'none' && cell.hatsu}
    </td>
  );
}

export function BoxOperationTable(props: {
  vm: BoxOperationTableViewModel;
  displayRessyamei: boolean;
  onOpenTimetable: (houkou: 0 | 1) => void;
}): React.ReactElement {
  const { vm, displayRessyamei, onOpenTimetable } = props;
  return (
    <table className="box-operation-table">
      <thead>
        <tr>
          <th>列車番号</th>
          <th>種別</th>
          {displayRessyamei && <th>列車名</th>}
          {vm.headers.map((h, i) => (
            // 列は駅Index 昇順で固定。路線外スロットは見出しなし(原典どおり)。
            <th key={`${String(i)}:${h}`}>{h}</th>
          ))}
        </tr>
      </thead>
      {vm.rows.map((row, ri) => {
        const color = colorrefToCss(row.senColor);
        // 継続印: 列車番号 / 種別 / 列車名 を "↓" に置き換える(原典 :952/:984/:1022)。
        const label = (v: string): string => (row.isContinue ? '↓' : v);
        return (
          <tbody
            key={`${String(ri)}:${row.ressyabangou}`}
            className="box-row"
            onDoubleClick={() => {
              onOpenTimetable(row.houkou);
            }}
          >
            <tr className="box-tr-chaku">
              <th rowSpan={3}>{label(row.ressyabangou)}</th>
              <th rowSpan={3}>{label(row.syubetsumei)}</th>
              {displayRessyamei && <th rowSpan={3}>{label(row.ressyamei)}</th>}
              {row.cells.map((cell, ci) => (
                <ChakuCell key={ci} cell={cell} color={color} />
              ))}
            </tr>
            <tr className="box-tr-line">
              {row.cells.map((cell, ci) => (
                <td key={ci} className="box-line-cell">
                  {cell !== null && <LineBar line={cell.line} color={color} />}
                </td>
              ))}
            </tr>
            <tr className="box-tr-hatsu">
              {row.cells.map((cell, ci) => (
                <HatsuCell key={ci} cell={cell} color={color} />
              ))}
            </tr>
          </tbody>
        );
      })}
    </table>
  );
}
