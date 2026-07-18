// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 up-tri
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

import type { TimetableGridSpec } from '@oudia-web/derive';
import { buildDiaLayoutFrame, computeEstimateJikoku, transferSortOrder } from '@oudia-web/derive';
import type { EkijikokuModifyOperation2, SortMethod } from '@oudia-web/domain';
import {
    computePasteTrains,
    copyRessyaToClipboard,
    ekiIndexOfEkiOrder,
    findEkikanSaisyouSecIndex,
    findTrainToDirect,
    getEkiJikoku,
    getSihatsuEki,
    getSyuuchakuEki,
    isNullModifyOperation2,
    sortRessyaOrder,
} from '@oudia-web/domain';
import type { RosenFileData } from '@oudia-web/format';
import { useCallback } from 'react';
import { useDocStore } from '../store/docStore.js';
import { resolveCellTarget } from './cellSemantics.js';
import type { JikokuStepAction, ResolvedAction } from './keymap.js';
import type { SelectionState } from './selection.js';
import {
    focusRessyaIndex,
    getCommandRessyaIndices,
    getFocusCommandRessyaIndex,
    getSelectedRessyaIndices,
    hasMultiSelection,
} from './selection.js';

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
  /** 駅時刻行の並べ替え方式(ビュー設定 m_eEkijikokuSort)。 */
  ekijikokuSort: 'ekiatsukai' | 'transfer';
  /** 並べ替えの末尾要素基準(ビュー設定 m_bCompareBottom)。 */
  compareBottom: boolean;
  /** 最小所要時間列車に移動: 見つかった列車の列へフォーカス(行は維持)。 */
  focusTrainCol: (ressyaIndex: number) => void;
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

  const {
    data,
    grid,
    diaIndex,
    houkou,
    selection,
    moveNext,
    movePrev,
    modifyOp2,
    ekijikokuSort,
    compareBottom,
    focusTrainCol,
  } = ctx;

  return useCallback(
    (action: ResolvedAction) => {
      const dia = data.rosen.diaCont[diaIndex];
      if (dia === undefined) return;
      const list = dia.ressyaCont[houkou];
      // Select 系の対象(原典 ECreateCmd_Select: 選択 1 列車のみはコマンド無効)。
      const targets = getCommandRessyaIndices(selection, grid);
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
          // 原典 ECreateCmd_NewItem: 複数選択中は不可。
          if (clipboard === null || hasMultiSelection(selection, grid)) return;
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

        case 'tyokutsuu': {
          // 原典 OnJikokuhyouDirect(5284-5437): 複数選択中は不可(ECreateCmd_Focus)、
          // フォーカスは駅時刻/番線行かつ終着駅以降、相手不在なら無効。
          if (ekiOrder === null) return;
          const fi = getFocusCommandRessyaIndex(selection, grid); // 選択ありは無効(Focus 系)
          if (fi === null) return;
          const focusTrain = list[fi];
          if (focusTrain === undefined) return;
          if (ekiOrder < getSyuuchakuEki(focusTrain)) return; // -13
          const partner = findTrainToDirect(list, fi, ekiOrder);
          if (partner === null) return; // -14
          dispatch({
            type: 'ressya/direct',
            diaIndex,
            houkou,
            syuuchakuIndex: fi,
            sihatsuIndex: partner,
            ekiOrder,
          });
          moveNext(true); // 原典 5407-5411
          return;
        }

        case 'bundan': {
          // 原典 OnJikokuhyouUndirect(5438-5576): 始発 < フォーカス駅 < 終着(厳密)かつ
          // フォーカス駅に着か発の時刻があること。
          if (ekiOrder === null) return;
          const fi = getFocusCommandRessyaIndex(selection, grid); // 選択ありは無効(Focus 系)
          if (fi === null) return;
          const focusTrain = list[fi];
          if (focusTrain === undefined) return;
          if (!(getSihatsuEki(focusTrain) < ekiOrder && ekiOrder < getSyuuchakuEki(focusTrain))) {
            return; // -21
          }
          const slot = getEkiJikoku(focusTrain, ekiOrder);
          if (slot.chakuJikoku === null && slot.hatsuJikoku === null) return; // -22
          dispatch({ type: 'ressya/undirect', diaIndex, houkou, ressyaIndex: fi, ekiOrder });
          moveNext(true); // 原典 5546-5551
          return;
        }

        case 'pasteJikokuOnly': {
          // 原典 OnEditPasteEkiJikoku(3881-3972): 内部形式のみ・先頭 1 本のみ使用・
          // フォーカス行の駅種別チェックなし・貼り付け移動量の累積なし・フォーカス移動なし。
          if (clipboard === null) return;
          const fi = getFocusCommandRessyaIndex(selection, grid); // 選択ありは無効(Focus 系)
          if (fi === null) return;
          const src = clipboard.trains[0];
          if (src === undefined) return;
          dispatch({ type: 'ressya/pasteEkiJikoku', diaIndex, houkou, ressyaIndex: fi, src });
          return;
        }

        case 'unify': {
          // 原典 OnJikokuhyouUnify(4494-4587): フォーカスは駅時刻/番線行。
          // 選択なし → 全列車、選択あり → 選択列車のみ。フォーカス移動なし。
          if (ekiOrder === null) return;
          const explicit = getSelectedRessyaIndices(selection, grid);
          if (explicit.length === 1) return; // 原典 ECreateCmd_All: 選択 1 列は不成立(2496)
          dispatch({
            type: 'ressya/unify',
            diaIndex,
            houkou,
            targetIndices: explicit.length > 0 ? explicit : null,
          });
          return;
        }

        case 'sort': {
          // 原典 OnJikokuhyouSort(4260-4492): フォーカス行種別で方式決定。選択なし → 全列車、
          // 選択あり → 選択列車のみ(1 本だけの選択は無効)。フォーカス移動なし。
          if (focusTarget === null) return;
          const explicit = getSelectedRessyaIndices(selection, grid);
          if (explicit.length === 1) return; // 原典: 選択 1 列は不成立(2496)
          const targetIndices = explicit.length > 0 ? explicit : list.map((_, i) => i);
          const items = targetIndices
            .map((i) => list[i])
            .filter((r): r is NonNullable<typeof r> => r !== undefined);
          if (items.length !== targetIndices.length || items.length === 0) return;
          const kiten = (data.rosen.kitenJikoku as number | null) ?? 0;

          let order: number[] | null = null;
          if (focusTarget.kind === 'ekiJikoku') {
            if (ekijikokuSort === 'transfer') {
              // 乗継ソート: ダイヤグラムの推定時刻(列車線の交点)を使う。
              const frame = buildDiaLayoutFrame(data.rosen, dia.ressyaCont[0], dia.ressyaCont[1]);
              const estimates = items.map((r) => computeEstimateJikoku(r, frame, houkou));
              const ekiCount = data.rosen.ekiCont.length;
              const isSyuyouByOrder = Array.from(
                { length: ekiCount },
                (_, o) =>
                  data.rosen.ekiCont[ekiIndexOfEkiOrder(o, ekiCount, houkou)]?.ekikibo === 'syuyou',
              );
              order = transferSortOrder({
                items,
                estimates,
                ekiOrder: focusTarget.ekiOrder,
                item: focusTarget.target,
                kiten,
                isSyuyouByOrder,
              });
            } else {
              order = sortRessyaOrder(items, {
                kind: 'ekiatsukai',
                ekiOrder: focusTarget.ekiOrder,
                item: focusTarget.target,
                kiten,
              });
            }
          } else if (focusTarget.kind === 'track') {
            order = sortRessyaOrder(items, {
              kind: 'track',
              ekiOrder: focusTarget.ekiOrder,
              kiten,
            });
          } else if (focusTarget.kind === 'ressyaProp') {
            const rt = focusTarget.rowType;
            const method: SortMethod | null =
              rt === 'ressyasyubetsu'
                ? { kind: 'ressyasyubetsu', compareBottom }
                : rt === 'ressyamei' || rt === 'gousuu' || rt === 'gou'
                  ? { kind: 'ressyamei', compareBottom }
                  : rt === 'ressyabangou'
                    ? { kind: 'ressyabangou', compareBottom }
                    : rt === 'bikou'
                      ? { kind: 'bikou' }
                      : null;
            if (method === null) return; // 駅名行等は無効(-1)
            order = sortRessyaOrder(items, method);
          }
          if (order === null) return;
          dispatch({ type: 'ressya/reorder', diaIndex, houkou, targetIndices, order });
          return;
        }

        case 'minJikan': {
          // 原典 OnJikokuhyouEKikanSaisyouSec(4147-4255): 着/発/番線行 + 終着駅行以外。
          // 選択と無関係に全列車から検索し、見つかった列車の列へフォーカス(行は維持)。
          if (ekiOrder === null || ekiOrder >= data.rosen.ekiCont.length - 1) return;
          const idx = findEkikanSaisyouSecIndex(list, ekiOrder);
          if (idx === null) return; // 原典はエラーダイアログ。フォーカス不動
          focusTrainCol(idx);
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
      ekijikokuSort,
      compareBottom,
      focusTrainCol,
    ],
  );
}
