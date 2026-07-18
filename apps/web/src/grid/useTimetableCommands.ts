// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 oudia-second-web contributors
//
// Based on OuDiaSecond (Copyright (C) 2017-2026 diagram_mania)

/**
 * キーマップアクション → EditCommand の配線(design §05 4.3)。選択・フォーカス・クリップボードを
 * 参照し、原典 §6 の選択仕様に従って ressya/replaceRange・swap・駅時刻コマンドへ正規化する。
 *
 * 編集コマンド後のフォーカス移動は原典どおり(CWjkState_Ressyahensyu.cpp):
 * [通過][通過-停車][経由なし][当駅始発][当駅止り][運休] → moveNext(true)(次駅へ)、
 * [時刻消去] → moveNext(false)(着 → 同駅の発へ)、±1分し次へ(駅時刻行のみ)→ moveNext(false)。
 *
 * 未配線: 連続入力(M4-2)・番線行の ±1 多態(M6)・作業行/路線外行(M7)。
 */

import { useCallback } from 'react';
import type { RosenFileData } from '@oudia/format';
import type { TimetableGridSpec } from '@oudia/derive';
import type { EkijikokuModifyOperation2 } from '@oudia/domain';
import { copyRessyaToClipboard, computePasteTrains, isNullModifyOperation2 } from '@oudia/domain';
import { useDocStore } from '../store/docStore.js';
import type { JikokuStepAction, ResolvedAction } from './keymap.js';
import type { SelectionState } from './selection.js';
import { getEffectiveRessyaIndices, focusRessyaIndex } from './selection.js';
import { resolveCellTarget } from './cellSemantics.js';

export interface TimetableCommandCtx {
  data: RosenFileData;
  grid: TimetableGridSpec;
  diaIndex: number;
  houkou: 0 | 1;
  selection: SelectionState;
  /** 編集後のフォーカス移動(原典 moveFocusCellToNext(bNextEkiOrder))。 */
  moveNext: (nextEkiOrder: boolean) => void;
  /** Ctrl+Shift+K のフォーカス移動(原典 moveFocusCellToPrev)。 */
  movePrev: () => void;
  /** 駅時刻変更の記憶(ビュー単位。null = 未実行 → 再実行無効)。 */
  modifyOp2: EkijikokuModifyOperation2 | null;
}

/** 列車番号/号数行の delta(原典対照表: Move=±1 / NoMove=±10 / Any1=±2 / Any2=±100)。 */
const BANGOU_DELTA: Record<JikokuStepAction['variant'], number> = {
  move: 1,
  noMove: 10,
  any1: 2,
  any2: 100,
};

/** アクションを実行する関数を返す。実行できなければ何もしない。 */
export function useTimetableCommands(ctx: TimetableCommandCtx): (action: ResolvedAction) => void {
  const dispatch = useDocStore((s) => s.dispatch);
  const undo = useDocStore((s) => s.undo);
  const redo = useDocStore((s) => s.redo);
  const clipboard = useDocStore((s) => s.clipboard);
  const setClipboard = useDocStore((s) => s.setClipboard);

  const { data, grid, diaIndex, houkou, selection, moveNext, movePrev, modifyOp2 } = ctx;

  return useCallback(
    (action: ResolvedAction) => {
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

      // ---- 連続 1 分修正系(構造化アクション。フォーカス行種別で多態)----
      if (typeof action === 'object') {
        runJikokuStep(action);
        return;
      }

      function runJikokuStep(step: JikokuStepAction): void {
        if (focusTarget === null || targets.length === 0) return;
        if (focusTarget.kind === 'ekiJikoku') {
          // iType 0/10: 駅時刻シフト。move/noMove = 60 秒、any1/any2 = DispProp の任意秒。
          const sec =
            step.variant === 'any1'
              ? data.dispProp.anySecondIncDec1
              : step.variant === 'any2'
                ? data.dispProp.anySecondIncDec2
                : 60;
          dispatch({
            type: 'ekiJikoku/shiftJikoku',
            diaIndex,
            houkou,
            ressyaIndices: targets,
            ekiOrder: focusTarget.ekiOrder,
            item: focusTarget.target,
            deltaSeconds: step.sign * sec,
            rev: step.rev,
          });
          // フォーカス移動は Move 系 + 駅時刻行のみ(原典 6277-6280)。編集が no-op でも移動する。
          if (step.variant === 'move') moveNext(false);
          return;
        }
        if (focusTarget.kind === 'track') {
          // iType 1: 番線 prev/next は M6(番線行表示・編集)で結線する。
          return;
        }
        if (focusTarget.kind === 'ressyaProp') {
          const rt = focusTarget.rowType;
          if (rt === 'ressyasyubetsu') {
            // iType 8: 種別を前/次へ(端でラップ)。フォーカスは移動しない。
            dispatch({
              type: 'ressya/stepSyubetsu',
              diaIndex,
              houkou,
              ressyaIndices: targets,
              step: step.sign,
            });
            return;
          }
          if (rt === 'ressyabangou' || rt === 'gousuu') {
            // iType 11/12: 列車番号/号数の末尾数字 ± delta。
            dispatch({
              type: 'ressya/modifyBangou',
              diaIndex,
              houkou,
              ressyaIndices: targets,
              target: rt,
              delta: step.sign * BANGOU_DELTA[step.variant],
            });
            return;
          }
        }
        // その他の行種別(列車名・備考・作業等)は原典どおり無効(iRv=-1)。
      }

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
          // 原典 OnJikokuhyouJikokuSakujo(4696-4800): 着/発の駅時刻セルのみ有効(番線行は不可)。
          if (focusTarget?.kind !== 'ekiJikoku' || targets.length === 0) return;
          dispatch({
            type: 'ekiJikoku/clear',
            diaIndex,
            houkou,
            ressyaIndices: targets,
            ekiOrder: focusTarget.ekiOrder,
            target: focusTarget.target,
          });
          moveNext(false); // 着を消した直後に同駅の発を消せるように(4792)
          return;
        }

        case 'clearCell': {
          // BackSpace: フォーカスセル(単一)のデータ削除。
          if (focusTarget === null) return;
          if (focusTarget.kind === 'ekiJikoku') {
            // 駅時刻セルは「運行なし」扱いへ変更した上で時刻を削除(clearToNone)。
            dispatch({
              type: 'ekiJikoku/setKeiyunasi',
              diaIndex,
              houkou,
              ressyaIndices: [focusTarget.ressyaIndex],
              ekiOrder: focusTarget.ekiOrder,
            });
            return;
          }
          if (focusTarget.kind === 'ressyaProp') {
            // テキスト系の列車プロパティ行は空文字化(種別・始終着駅名は対象外)。
            const rt = focusTarget.rowType;
            if (rt === 'ressyabangou' || rt === 'ressyamei' || rt === 'gousuu' || rt === 'bikou') {
              dispatch({
                type: 'ressya/setProp',
                diaIndex,
                houkou,
                ressyaIndex: focusTarget.ressyaIndex,
                prop: { key: rt, value: '' },
              });
            }
          }
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
          moveNext(true); // 原典 4909
          return;
        }

        case 'tsuukaTeisya': {
          // 原典 OnJikokuhyouTsuukateisya(4919-5042): 駅時刻/番線行で有効・各列車独立トグル。
          if (ekiOrder === null || targets.length === 0) return;
          dispatch({
            type: 'ekiJikoku/toggleTsuukaTeisya',
            diaIndex,
            houkou,
            ressyaIndices: targets,
            ekiOrder,
          });
          moveNext(true); // 原典 5031
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
          moveNext(true); // 原典 5119
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
          moveNext(true); // 原典 5195
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
          moveNext(true); // 原典 5271
          return;
        }

        case 'toggleCanceled': {
          // 原典 OnJikokuhyouCanceled(9942-9997): セル位置の制約なし・各列車独立反転。
          if (targets.length === 0) return;
          dispatch({
            type: 'ressya/toggleCanceled',
            diaIndex,
            houkou,
            ressyaIndices: targets,
          });
          moveNext(true); // 原典 9994
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

        case 'focusNext':
          moveNext(false); // 原典 OnJikokuhyouEkijikokuNext(6528-6572)
          return;
        case 'focusPrev':
          movePrev();
          return;

        case 'renzoku':
          // 連続入力モードの起動はビュー側で処理(M4-2)。ここでは no-op。
          return;

        case 'modifyEkijikoku':
          // ダイアログの起動はビュー側で処理。ここでは no-op。
          return;

        case 'modifyRepeat': {
          // 原典 OnJikokuhyouModifyEkijikokuCmdRepeat(5978-6040): 記憶が NULL なら完全 no-op。
          // シフト秒数は新フォーカスに相対、コピー元は絶対、適用先の着/発はフォーカスに従う。
          if (modifyOp2 === null || isNullModifyOperation2(modifyOp2)) return;
          if (focusTarget?.kind !== 'ekiJikoku' || targets.length === 0) return;
          dispatch({
            type: 'ekiJikoku/modifyOperation2',
            diaIndex,
            houkou,
            ressyaIndices: targets,
            ekiOrder: focusTarget.ekiOrder,
            item: focusTarget.target,
            op: modifyOp2,
          });
          moveNext(true); // 成功時 moveFocusCellToNext(true)(6026-6037)
          return;
        }

        case 'search':
          // 検索バーの起動はビュー側で処理(ここでは no-op)。
          return;
      }
    },
    [
      data,
      grid,
      diaIndex,
      houkou,
      selection,
      dispatch,
      undo,
      redo,
      clipboard,
      setClipboard,
      moveNext,
      movePrev,
      modifyOp2,
    ],
  );
}
