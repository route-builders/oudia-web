// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 oudia-second-web contributors
//
// Based on OuDiaSecond (Copyright (C) 2017-2026 diagram_mania)

/**
 * キーマップアクション → EditCommand の配線(design §05 4.3)。選択・フォーカス・クリップボードを
 * 参照し、原典 §6 の選択仕様に従って ressya/replaceRange・swap・駅時刻コマンドへ正規化する。
 *
 * M3 範囲: undo/redo・cut/copy/paste・clear・tsuuka・keiyunasi・sihatsu/syuuchakuEki・
 * canceled・swap。連続入力・直通化/分断・駅時刻挿入削除・作業は M4/M5/M7。
 */

import { useCallback } from 'react';
import type { RosenFileData } from '@oudia/format';
import type { TimetableGridSpec } from '@oudia/derive';
import { copyRessyaToClipboard, computePasteTrains } from '@oudia/domain';
import { useDocStore } from '../store/docStore.js';
import type { EditAction } from './keymap.js';
import type { SelectionState } from './selection.js';
import { getEffectiveRessyaIndices, focusRessyaIndex } from './selection.js';
import { resolveCellTarget } from './cellSemantics.js';

export interface TimetableCommandCtx {
  data: RosenFileData;
  grid: TimetableGridSpec;
  diaIndex: number;
  houkou: 0 | 1;
  selection: SelectionState;
}

/** アクションを実行する関数を返す。実行できなければ何もしない。 */
export function useTimetableCommands(ctx: TimetableCommandCtx): (action: EditAction) => void {
  const dispatch = useDocStore((s) => s.dispatch);
  const undo = useDocStore((s) => s.undo);
  const redo = useDocStore((s) => s.redo);
  const clipboard = useDocStore((s) => s.clipboard);
  const setClipboard = useDocStore((s) => s.setClipboard);

  const { data, grid, diaIndex, houkou, selection } = ctx;

  return useCallback(
    (action: EditAction) => {
      const dia = data.rosen.diaCont[diaIndex];
      if (dia === undefined) return;
      const list = dia.ressyaCont[houkou];
      const targets = getEffectiveRessyaIndices(selection, grid);
      const focusTarget = resolveCellTarget(grid, selection.focus.row, selection.focus.col);
      // 駅時刻系アクションの ekiOrder(フォーカスが駅時刻/番線行のとき)。
      const ekiOrder =
        focusTarget?.kind === 'ekiJikoku' || focusTarget?.kind === 'track'
          ? focusTarget.ekiOrder
          : null;

      switch (action) {
        case 'undo':
          undo();
          return;
        case 'redo':
          redo();
          return;

        case 'copy':
        case 'cut': {
          if (targets.length === 0) return;
          const trains = targets.map((i) => list[i]).filter((r) => r !== undefined);
          if (trains.length === 0) return;
          setClipboard(copyRessyaToClipboard(trains, houkou));
          if (action === 'cut') {
            // 選択列車を後ろから削除(index ずれ回避)。1 コマンドずつ。
            for (const i of [...targets].sort((a, b) => b - a)) {
              dispatch({
                type: 'ressya/replaceRange',
                diaIndex,
                houkou,
                index: i,
                count: 1,
                trains: [],
              });
            }
          }
          return;
        }

        case 'paste': {
          if (clipboard === null) return;
          const result = computePasteTrains(clipboard);
          if (result === null) return;
          const insertAt = focusRessyaIndex(selection, grid) ?? list.length;
          dispatch({
            type: 'ressya/replaceRange',
            diaIndex,
            houkou,
            index: insertAt,
            count: 0,
            trains: result.trains,
          });
          setClipboard(result.clipboard); // 累積を進める
          return;
        }

        case 'clear': {
          // Del: 選択列車を削除(原典は種別依存だが、列フォーカスでは列削除)。後ろから。
          if (targets.length === 0) return;
          for (const i of [...targets].sort((a, b) => b - a)) {
            dispatch({
              type: 'ressya/replaceRange',
              diaIndex,
              houkou,
              index: i,
              count: 1,
              trains: [],
            });
          }
          return;
        }

        case 'clearJikoku': {
          if (ekiOrder === null || targets.length === 0) return;
          const target = focusTarget?.kind === 'ekiJikoku' ? focusTarget.target : 'chaku';
          dispatch({
            type: 'ekiJikoku/clear',
            diaIndex,
            houkou,
            ressyaIndices: targets,
            ekiOrder,
            target,
          });
          return;
        }

        case 'tsuuka': {
          if (ekiOrder === null || targets.length === 0) return;
          dispatch({
            type: 'ekiJikoku/toggleTsuuka',
            diaIndex,
            houkou,
            ressyaIndices: targets,
            ekiOrder,
          });
          return;
        }

        case 'keiyunasi': {
          if (ekiOrder === null || targets.length === 0) return;
          dispatch({
            type: 'ekiJikoku/setKeiyunasi',
            diaIndex,
            houkou,
            ressyaIndices: targets,
            ekiOrder,
          });
          return;
        }

        case 'sihatsuEki': {
          if (ekiOrder === null || targets.length === 0) return;
          dispatch({
            type: 'ressya/setSihatsuEki',
            diaIndex,
            houkou,
            ressyaIndices: targets,
            ekiOrder,
          });
          return;
        }

        case 'syuuchakuEki': {
          if (ekiOrder === null || targets.length === 0) return;
          dispatch({
            type: 'ressya/setSyuuchakuEki',
            diaIndex,
            houkou,
            ressyaIndices: targets,
            ekiOrder,
          });
          return;
        }

        case 'toggleCanceled': {
          if (targets.length === 0) return;
          // 全対象が運休なら解除、そうでなければ運休(原典トグルは代表値の反転)。
          const allCanceled = targets.every((i) => list[i]?.isCanceled === true);
          dispatch({
            type: 'ressya/setCanceled',
            diaIndex,
            houkou,
            ressyaIndices: targets,
            canceled: !allCanceled,
          });
          return;
        }

        case 'swapLeft':
        case 'swapRight': {
          const fi = focusRessyaIndex(selection, grid);
          if (fi === null) return;
          const other = action === 'swapLeft' ? fi - 1 : fi + 1;
          if (other < 0 || other >= list.length) return;
          dispatch({ type: 'ressya/swap', diaIndex, houkou, indexA: fi, sizeA: 1, indexB: other });
          return;
        }

        case 'search':
          // 検索バーの起動はビュー側で処理(ここでは no-op)。
          return;
      }
    },
    [data, grid, diaIndex, houkou, selection, dispatch, undo, redo, clipboard, setClipboard],
  );
}
