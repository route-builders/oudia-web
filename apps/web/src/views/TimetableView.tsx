// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 up-tri
//
// Based on OuDiaSecond (Copyright (C) 2017-2026 diagram_mania)
// and OuDia (Copyright (C) 2006-2017 take-okm)

/**
 * 通常時刻表ビュー(編集対応。design §05 3.1)。derive の buildTimetableGrid + render の
 * drawGrid に、フォーカス枠・選択ハイライトのオーバーレイと対話(クリック/キーボード/キー転送
 * ダイアログ)を重ねる。状態変更は store.dispatch(EditCommand)経由(architecture §4.3)。
 */

import { buildTimetableGrid, defaultTimetableGridOptions } from '@oudia-web/derive';
import {
  ekiIndexOfEkiOrder,
  getEkiJikoku,
  getValidSihatsuEki,
  getValidSyuuchakuEki,
} from '@oudia-web/domain';
import type { RosenFileData } from '@oudia-web/format';
import type { GridTheme } from '@oudia-web/render';
import { drawGrid, GridGeometry } from '@oudia-web/render';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { EkiJikokuDialogTarget } from '../dialog/EkiJikokuDialog.js';
import { EkiJikokuDialog } from '../dialog/EkiJikokuDialog.js';
import { DEFAULT_MODIFY_OP2, ModifyEkijikokuDialog } from '../dialog/ModifyEkijikokuDialog.js';
import type { OperationDialogTarget } from '../dialog/OperationDialog.js';
import { OperationDialog } from '../dialog/OperationDialog.js';
import type { RessyaPropDialogTarget } from '../dialog/RessyaPropDialog.js';
import { RessyaPropDialog } from '../dialog/RessyaPropDialog.js';
import { resolveCellTarget } from '../grid/cellSemantics.js';
import { cellViewRect, hitTestCell } from '../grid/hitTest.js';
import { detectKeymapMode, resolveEditAction } from '../grid/keymap.js';
import { referJikokuFor } from '../grid/referJikoku.js';
import type { RenzokuState } from '../grid/renzoku.js';
import {
  calcJikokuRowToNext,
  canEnterRenzoku,
  isHatsuChakuHyouji,
  renzokuEditMark,
} from '../grid/renzoku.js';
import { getCommandRessyaIndices, getSelectedRessyaIndices } from '../grid/selection.js';
import { TrainSearchBar } from '../grid/TrainSearchBar.js';
import { useGridSelection } from '../grid/useGridSelection.js';
import { useTimetableCommands } from '../grid/useTimetableCommands.js';
import { ViewToggleMenu } from '../grid/ViewToggleMenu.js';
import { useCanvas2d } from '../hooks/useCanvas2d.js';
import { useDocStore } from '../store/docStore.js';
import { useSettingsStore } from '../store/settingsStore.js';

const THEME: GridTheme = {
  cellFont: { pointTextHeight: 9, facename: '', bold: false, italic: false },
  gridLineColor: 'rgb(200,200,200)',
  headerBgColor: 'rgb(240,240,240)',
  defaultTextColor: 'rgb(0,0,0)',
  cellPadding: 3,
};

const ROW_H = 20;
const COL_W = 64;
const EKIMEI_W = 96;
const FIXED_ROWS = 0; // ヘッダ固定は M1 では簡略(全行スクロール)。
const FIXED_COLS = 2;

const EMPTY_RESSYA_LIST: readonly import('@oudia-web/format').Ressya[] = [];

/** 開いているダイアログの状態(initial は常に指定・キー転送でなければ undefined)。 */
type ActiveDialog =
  | {
      kind: 'ekiJikoku';
      target: EkiJikokuDialogTarget;
      initial: string | undefined;
      /** キー転送・初期フォーカスの宛先(フォーカス行が着行/発行のどちらか)。 */
      field: 'chaku' | 'hatsu';
    }
  | { kind: 'ressyaProp'; target: RessyaPropDialogTarget; initial: string | undefined }
  | { kind: 'operation'; target: OperationDialogTarget };

export function TimetableView(props: {
  data: RosenFileData;
  diaIndex: number;
  houkou: 0 | 1;
}): React.ReactElement {
  const { data, diaIndex, houkou } = props;
  const dispatch = useDocStore((s) => s.dispatch);
  const [scroll, setScroll] = useState({ x: 0, y: 0 });
  const scrollerRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const [dialog, setDialog] = useState<ActiveDialog | null>(null);

  // 表示トグル(原典 [表示] メニュー。localStorage 永続の設定ストア)。
  const displayToggles = useSettingsStore((s) => s.jikokuhyou);
  const built = useMemo(() => {
    const base = defaultTimetableGridOptions(data, houkou);
    return buildTimetableGrid(data, diaIndex, {
      ...base,
      displayTsuukaEkiJikoku: displayToggles.displayTsuukaEkiJikoku,
      displayAllEkiJikoku: displayToggles.displayAllEkiJikoku,
      displayParentSyubetsu: displayToggles.displayParentSyubetsu,
      conv: {
        ...base.conv,
        noColon: !displayToggles.displayColonEkiJikoku,
        outputSecond: displayToggles.displaySecondEkiJikoku,
      },
    });
  }, [data, diaIndex, houkou, displayToggles]);
  const grid = built.ok ? built.grid : null;

  const geom = useMemo(() => {
    if (grid === null) return null;
    const cols = grid.columns.map((c) => (c.type === 'ekimei' ? EKIMEI_W : COL_W));
    const rows = grid.rows.map(() => ROW_H);
    return new GridGeometry(cols, rows);
  }, [grid]);

  // 選択状態(grid が null のときは空グリッドで代用してフック順序を保つ)。
  const emptyGrid = useMemo(
    () => ({ houkou, columns: [], rows: [], cells: [], ekijikokuRowRange: { begin: 0, end: 0 } }),
    [houkou],
  );
  // ダイヤ/方向の切替では選択を初期化、編集によるグリッド再構築では位置を保つ(クランプのみ)。
  const sel = useGridSelection(grid ?? emptyGrid, `${String(diaIndex)}:${String(houkou)}`);
  const view = useMemo(
    () => ({ scrollX: scroll.x, scrollY: scroll.y, fixedCols: FIXED_COLS, fixedRows: FIXED_ROWS }),
    [scroll.x, scroll.y],
  );

  const keymapMode = useMemo(() => detectKeymapMode(), []);
  const [searchOpen, setSearchOpen] = useState(false);

  // 編集コマンド後のフォーカス移動(原典 moveFocusCellToNext/Prev。moveRight はビュー設定)。
  const focusMoveRight = useSettingsStore((s) => s.jikokuhyou.focusMoveRight);
  const moveNext = useCallback(
    (nextEkiOrder: boolean) => {
      sel.moveNext(focusMoveRight, nextEkiOrder);
    },
    [sel, focusMoveRight],
  );
  const movePrev = useCallback(() => {
    sel.movePrev(focusMoveRight);
  }, [sel, focusMoveRight]);

  // 駅時刻変更の記憶(原典 m_EkijikokuModifyOperation2。ビュー = ダイヤ×方向 単位・非永続)。
  const viewKey = `${String(diaIndex)}:${String(houkou)}`;
  const modifyOp2 = useDocStore((s) => s.modifyOp2ByView[viewKey] ?? null);
  const setModifyOp2 = useDocStore((s) => s.setModifyOp2);
  const [modifyDialogOpen, setModifyDialogOpen] = useState(false);

  // 並べ替え設定(ビュー設定 m_eEkijikokuSort / m_bCompareBottom)。
  const ekijikokuSort = useSettingsStore((s) => s.jikokuhyou.ekijikokuSort);
  const compareBottom = useSettingsStore((s) => s.jikokuhyou.compareBottom);

  // 最小所要時間列車に移動: 行は維持して列だけ移す。
  const focusTrainCol = useCallback(
    (ressyaIndex: number) => {
      if (grid === null) return;
      const col = grid.columns.findIndex(
        (c) => c.type === 'ressya' && c.ressyaIndex === ressyaIndex,
      );
      if (col === -1) return;
      sel.focusCell({ row: sel.selection.focus.row, col });
    },
    [grid, sel],
  );

  const runCommand = useTimetableCommands({
    data,
    grid: grid ?? emptyGrid,
    diaIndex,
    houkou,
    selection: sel.selection,
    moveNext,
    movePrev,
    modifyOp2,
    ekijikokuSort,
    compareBottom,
    focusTrainCol,
  });

  // ---- 連続入力モード(原典 CWjkState_Renzoku、design §05 4.4)----
  const [renzoku, setRenzoku] = useState<RenzokuState | null>(null);
  const ressyaList = data.rosen.diaCont[diaIndex]?.ressyaCont[houkou] ?? EMPTY_RESSYA_LIST;

  const tryEnterRenzoku = useCallback(() => {
    if (grid === null) return;
    const focus = sel.selection.focus;
    if (!canEnterRenzoku(grid, focus, ressyaList)) return; // canEnter 3 条件
    sel.focusCell(focus); // onEnter: 選択解除(SelectMode_NONE)
    setRenzoku({ colIndex: focus.col, minutes: '' });
  }, [grid, sel, ressyaList]);

  // フォーカスを次/前の駅時刻セルへ(calcCellToNext)。ブロック外に出たら自動終了。
  const advanceRenzoku = useCallback(
    (sign: 1 | -1) => {
      if (grid === null) return;
      const next = calcJikokuRowToNext(grid, sel.selection.focus.row, sign);
      if (next === null) {
        setRenzoku(null); // 終着入力で自動終了(1043-1053)
        return;
      }
      sel.focusCell({ row: next, col: sel.selection.focus.col });
      setRenzoku((r) => (r === null ? null : { ...r, minutes: '' }));
    },
    [grid, sel],
  );

  // update_adjustProp 相当: 列変更(-4)・非時刻行(-2)・前に時刻なし(-3)で自動退場。
  useEffect(() => {
    if (renzoku === null || grid === null) return;
    const f = sel.selection.focus;
    if (f.col !== renzoku.colIndex || !canEnterRenzoku(grid, f, ressyaList)) {
      setRenzoku(null);
    }
  }, [renzoku, grid, sel.selection.focus, ressyaList]);

  // モード中のキー処理(原典 OnChar / OnKeyDown + 許可 5 コマンド)。
  const onRenzokuKeyDown = useCallback(
    (e: React.KeyboardEvent): void => {
      if (grid === null || renzoku === null) return;
      const focus = sel.selection.focus;
      const focusTarget = resolveCellTarget(grid, focus.row, focus.col);

      if (e.key === 'Escape') {
        e.preventDefault();
        setRenzoku(null); // 即退場(モデル変更なし)
        return;
      }
      if (e.key === 'Backspace') {
        e.preventDefault();
        if (renzoku.minutes.length > 0) {
          // 1 文字訂正(モデル非破壊)。
          setRenzoku({ ...renzoku, minutes: renzoku.minutes.slice(0, -1) });
        } else {
          advanceRenzoku(-1); // 前の駅時刻セルへ(NULL なら退場)
        }
        return;
      }
      // 矢印キーは既定ナビゲーション(移動後の adjustProp 相当 effect が退場判定)。
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault();
        sel.arrow(e.key === 'ArrowUp' ? -1 : 1, 0, false);
        setRenzoku({ ...renzoku, minutes: '' }); // フォーカス移動で分クリア
        return;
      }
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault();
        sel.arrow(0, e.key === 'ArrowLeft' ? -1 : 1, false);
        setRenzoku({ ...renzoku, minutes: '' }); // 列変更 → effect が退場させる
        return;
      }

      // 許可コマンド(時刻消去/通過/通過-停車/運行なし/連続入力トグル)。他は無効(-1)。
      const action = resolveEditAction(e, keymapMode);
      if (action === 'renzoku') {
        e.preventDefault();
        setRenzoku(null); // トグルで終了
        return;
      }
      if (
        action === 'clearJikoku' ||
        action === 'tsuuka' ||
        action === 'tsuukaTeisya' ||
        action === 'keiyunasi'
      ) {
        e.preventDefault();
        if (focusTarget?.kind !== 'ekiJikoku') return;
        const common = {
          diaIndex,
          houkou,
          ressyaIndices: [focusTarget.ressyaIndex],
          ekiOrder: focusTarget.ekiOrder,
        };
        if (action === 'clearJikoku') {
          dispatch({
            type: 'ekiJikoku/clear',
            ...common,
            target: focusTarget.target,
            teisyaFirst: true, // 連続入力モード版(1118-1138)
          });
        } else if (action === 'tsuuka') {
          dispatch({ type: 'ekiJikoku/toggleTsuuka', ...common });
        } else if (action === 'tsuukaTeisya') {
          dispatch({ type: 'ekiJikoku/toggleTsuukaTeisya', ...common });
        } else {
          // [運行なし] ＜12.3＞例外: 発着表示駅の発時刻行では駅時刻を変更しない。
          if (!(isHatsuChakuHyouji(grid, focusTarget.ekiOrder) && focusTarget.target === 'hatsu')) {
            dispatch({ type: 'ekiJikoku/setKeiyunasi', ...common });
          }
        }
        advanceRenzoku(1); // 実行後フォーカス前進 + モード継続
        return;
      }
      if (action !== null) {
        e.preventDefault(); // その他のコマンドはモード中無効(基底 -1)
        return;
      }

      // 数字入力: 1 文字目 '0'-'5' / 2 文字目 '0'-'9'。不受理は何も起きない。
      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        const ch = e.key;
        if (renzoku.minutes.length === 0 && ch >= '0' && ch <= '5') {
          setRenzoku({ ...renzoku, minutes: ch });
          return;
        }
        if (renzoku.minutes.length === 1 && ch >= '0' && ch <= '9') {
          if (focusTarget?.kind !== 'ekiJikoku') return;
          dispatch({
            type: 'ekiJikoku/renzokuInput',
            diaIndex,
            houkou,
            ressyaIndex: focusTarget.ressyaIndex,
            ekiOrder: focusTarget.ekiOrder,
            item: focusTarget.target,
            minutes: Number(renzoku.minutes + ch),
          });
          advanceRenzoku(1);
        }
        return;
      }
      if (e.key === 'Enter') e.preventDefault(); // ダイアログ起動もモード中は無効
    },
    [grid, renzoku, sel, keymapMode, diaIndex, houkou, dispatch, advanceRenzoku],
  );

  // ダイアログを開く(セル target → 具体的ダイアログ)。
  const openDialogForCell = useCallback(
    (row: number, col: number, initial?: string): void => {
      if (grid === null) return;
      const target = resolveCellTarget(grid, row, col);
      if (target === null) return;
      const dia = data.rosen.diaCont[diaIndex];
      if (dia === undefined) return;
      const list = dia.ressyaCont[houkou];

      if (target.kind === 'ekiJikoku') {
        const ressya = list[target.ressyaIndex];
        if (ressya === undefined) return;
        // リーダーは末尾の運行なしスロットを切り詰めるため既定値で補う(末尾駅でも開ける)。
        const ej = getEkiJikoku(ressya, target.ekiOrder);
        const eki = data.rosen.ekiCont[target.ekiOrder];
        setDialog({
          kind: 'ekiJikoku',
          initial,
          field: target.target, // フォーカス行(着/発)に応じてキー転送先を振り分ける
          target: {
            diaIndex,
            houkou,
            ressyaIndex: target.ressyaIndex,
            ekiOrder: target.ekiOrder,
            ekiJikoku: ej,
            ekimei: eki?.ekimei ?? '',
            ressyabangou: ressya.ressyabangou,
            referJikoku: referJikokuFor(ressya, target.ekiOrder),
          },
        });
      } else if (target.kind === 'ressyaProp') {
        const ressya = list[target.ressyaIndex];
        if (ressya === undefined) return;
        setDialog({
          kind: 'ressyaProp',
          initial,
          target: {
            diaIndex,
            houkou,
            ressyaIndex: target.ressyaIndex,
            ressya,
            syubetsuCont: data.rosen.ressyasyubetsuCont,
          },
        });
      } else if (target.kind === 'operation') {
        const ressya = list[target.ressyaIndex];
        if (ressya === undefined) return;
        // 始発駅作業行=有効始発、終着駅作業行=有効終着の駅Order を解決。
        const ekiOrder =
          target.rowType === 'operationShihatsu'
            ? getValidSihatsuEki(ressya)
            : getValidSyuuchakuEki(ressya);
        // 有効始発/終着が無い(空列車・運行なし)なら開かない。
        if (ekiOrder === -1) return;
        const ekiCount = data.rosen.ekiCont.length;
        const eki = data.rosen.ekiCont[ekiIndexOfEkiOrder(ekiOrder, ekiCount, houkou)];
        const ej = getEkiJikoku(ressya, ekiOrder);
        setDialog({
          kind: 'operation',
          target: {
            diaIndex,
            houkou,
            ressyaIndex: target.ressyaIndex,
            ekiOrder,
            beforeCont: ej.beforeOperationCont,
            afterCont: ej.afterOperationCont,
            chakuJikoku: ej.chakuJikoku,
            hatsuJikoku: ej.hatsuJikoku,
            isTeisya: ej.ekiatsukai === 'teisya',
            tracks: eki?.ekiTrack2Cont ?? [],
            outerTerminals: eki?.outerTerminalCont ?? [],
            ekimei: eki?.ekimei ?? '',
          },
        });
      }
      // ekimei / track / newRessya は本 M3 のダイアログ対象外(v0.5-0.7)。
    },
    [grid, data, diaIndex, houkou],
  );

  // マウスイベント → セル位置(ビューポート座標のヒットテスト)。
  const hitFromEvent = useCallback(
    (e: React.MouseEvent): { row: number; col: number } | null => {
      if (geom === null) return null;
      const rect = e.currentTarget.getBoundingClientRect();
      return hitTestCell(geom, view, e.clientX - rect.left, e.clientY - rect.top);
    },
    [geom, view],
  );

  const onCanvasClick = useCallback(
    (e: React.MouseEvent): void => {
      if (grid === null) return;
      const hit = hitFromEvent(e);
      if (hit === null) return;
      // 連続入力モード中はセル選択禁止(SelectMode_NONE)→ 修飾を無視した単一フォーカス移動。
      // フォーカス移動で入力途中の分もクリアする(原典 OnSetFocusCell 1659-1668)。
      const inRenzoku = renzoku !== null;
      sel.clickCell(hit, {
        shift: !inRenzoku && e.shiftKey,
        ctrl: !inRenzoku && (e.ctrlKey || e.metaKey),
      });
      if (inRenzoku) setRenzoku((r) => (r === null ? null : { ...r, minutes: '' }));
      rootRef.current?.focus();
    },
    [grid, hitFromEvent, sel, renzoku],
  );

  // ダブルクリック = Enter と同じダイアログを開く(design §05 3.1 §262)。
  const onCanvasDoubleClick = useCallback(
    (e: React.MouseEvent): void => {
      if (grid === null) return;
      if (renzoku !== null) return; // モード中はダイアログ起動無効
      const hit = hitFromEvent(e);
      if (hit === null) return;
      sel.clickCell(hit, { shift: false, ctrl: false });
      openDialogForCell(hit.row, hit.col);
    },
    [grid, hitFromEvent, sel, openDialogForCell, renzoku],
  );

  // ダイアログが閉じたらフォーカスをグリッドへ戻す(モーダル表示中の focus() は
  // ブラウザに無視されるため、アンマウント後の effect で行う)。
  const wasDialogOpen = useRef(false);
  useEffect(() => {
    if (dialog === null && wasDialogOpen.current) rootRef.current?.focus();
    wasDialogOpen.current = dialog !== null;
  }, [dialog]);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent): void => {
      if (grid === null) return;

      // 0) 連続入力モード中は専用ハンドラが全キーを処理する。
      if (renzoku !== null) {
        onRenzokuKeyDown(e);
        return;
      }

      // 1) 編集アクション(キーマップ)を最優先で解決(Ctrl/Alt 系・Del・テンキー等)。
      const action = resolveEditAction(e, keymapMode);
      if (action !== null) {
        e.preventDefault();
        if (action === 'search') setSearchOpen(true);
        else if (action === 'renzoku') tryEnterRenzoku();
        else if (action === 'modifyEkijikoku') {
          // 有効条件: フォーカスが着/発の駅時刻行 + createCmd(Select) 成立(原典 5908-5923)。
          const t = resolveCellTarget(grid, sel.selection.focus.row, sel.selection.focus.col);
          if (t?.kind === 'ekiJikoku' && getCommandRessyaIndices(sel.selection, grid).length > 0) {
            setModifyDialogOpen(true);
          }
        } else runCommand(action);
        return;
      }

      // 2) ナビゲーション・既定アクション。
      switch (e.key) {
        case 'ArrowUp':
          e.preventDefault();
          sel.arrow(-1, 0, e.shiftKey);
          return;
        case 'ArrowDown':
          e.preventDefault();
          sel.arrow(1, 0, e.shiftKey);
          return;
        case 'ArrowLeft':
          e.preventDefault();
          sel.arrow(0, -1, e.shiftKey);
          return;
        case 'ArrowRight':
        case 'Tab':
          e.preventDefault();
          sel.arrow(0, e.shiftKey && e.key === 'Tab' ? -1 : 1, false);
          return;
        case 'Enter':
          e.preventDefault();
          openDialogForCell(sel.selection.focus.row, sel.selection.focus.col);
          return;
        default:
          break;
      }
      // 3) printable キー(1 文字・修飾なし)→ キー転送ダイアログ。
      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        openDialogForCell(sel.selection.focus.row, sel.selection.focus.col, e.key);
      }
    },
    [
      grid,
      sel,
      openDialogForCell,
      keymapMode,
      runCommand,
      renzoku,
      onRenzokuKeyDown,
      tryEnterRenzoku,
    ],
  );

  const selectedRessya = useMemo(
    () =>
      grid === null ? new Set<number>() : new Set(getSelectedRessyaIndices(sel.selection, grid)),
    [grid, sel.selection],
  );

  const canvasRef = useCanvas2d(
    (ctx, size) => {
      if (grid === null || geom === null) return;
      drawGrid(
        ctx,
        grid,
        geom,
        {
          scrollX: scroll.x,
          scrollY: scroll.y,
          viewW: size.w,
          viewH: size.h,
          fixedCols: FIXED_COLS,
          fixedRows: FIXED_ROWS,
        },
        THEME,
      );
      drawSelectionOverlay(ctx, grid, geom, view, sel.selection.focus, selectedRessya);
      // 連続入力モードの編集中マーク("%2d%-2s": 直前時刻の時 + 入力途中の分)。
      if (renzoku !== null) {
        const mark = renzokuEditMark(grid, sel.selection.focus, ressyaList, renzoku.minutes);
        if (mark !== null) {
          const r = cellViewRect(geom, view, sel.selection.focus.row, sel.selection.focus.col);
          ctx.save();
          ctx.fillStyle = 'rgb(255,255,220)';
          ctx.fillRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2);
          ctx.fillStyle = 'rgb(0,0,0)';
          ctx.font = '12px ui-monospace, monospace';
          ctx.textBaseline = 'middle';
          ctx.fillText(mark, r.x + 3, r.y + r.h / 2);
          ctx.restore();
        }
      }
    },
    [grid, geom, scroll, sel.selection, selectedRessya, renzoku, ressyaList],
  );

  // 列車番号検索: query に一致する列車列へフォーカスを移す(fromCol より右で最初の一致、
  // 末尾まで無ければ先頭から)。ヒットしなければ false。
  const searchTrain = useCallback(
    (query: string, fromCol: number): boolean => {
      if (grid === null || query === '') return false;
      const q = query.toLowerCase();
      const n = grid.columns.length;
      for (let step = 1; step <= n; step++) {
        const c = (fromCol + step) % n;
        const col = grid.columns[c];
        if (col?.type !== 'ressya') continue;
        const ressya = data.rosen.diaCont[diaIndex]?.ressyaCont[houkou][col.ressyaIndex];
        if (ressya?.ressyabangou.toLowerCase().includes(q) === true) {
          sel.focusCell({ row: sel.selection.focus.row, col: c });
          return true;
        }
      }
      return false;
    },
    [grid, data, diaIndex, houkou, sel],
  );

  if (grid === null || geom === null) {
    return <div className="view-error">時刻表を生成できませんでした。</div>;
  }

  // ツールバーコマンド(ショートカットのないメニュー相当。実行後はグリッドへフォーカス復帰)。
  const runToolbar = (action: 'sort' | 'unify' | 'minJikan'): void => {
    runCommand(action);
    rootRef.current?.focus();
  };

  return (
    <div className="timetable-view">
      <div className="grid-toolbar" role="toolbar" aria-label="時刻表コマンド">
        {/* 連続入力モード中は他コマンド無効(原典: 許可 5 コマンド以外は -1)。 */}
        <button
          type="button"
          disabled={renzoku !== null}
          onClick={() => {
            runToolbar('sort');
          }}
        >
          並べ替え
        </button>
        <button
          type="button"
          disabled={renzoku !== null}
          onClick={() => {
            runToolbar('unify');
          }}
        >
          列車番号で一本化
        </button>
        <button
          type="button"
          disabled={renzoku !== null}
          onClick={() => {
            runToolbar('minJikan');
          }}
        >
          最小所要時間列車に移動
        </button>
        <ViewToggleMenu
          disabled={renzoku !== null}
          onAfterChange={() => {
            rootRef.current?.focus();
          }}
        />
      </div>
      <div className="grid-root" ref={rootRef} tabIndex={0} onKeyDown={onKeyDown}>
        <canvas ref={canvasRef} className="grid-content" />
        {renzoku !== null && (
          <div className="renzoku-indicator" role="status" aria-live="polite">
            連続入力モード
          </div>
        )}
        {searchOpen && (
          <TrainSearchBar
            onSearch={(q) => searchTrain(q, sel.selection.focus.col)}
            onClose={() => {
              setSearchOpen(false);
              rootRef.current?.focus();
            }}
          />
        )}
        <div
          ref={scrollerRef}
          className="grid-scroller"
          onScroll={(e) => {
            const el = e.currentTarget;
            setScroll({ x: el.scrollLeft, y: el.scrollTop });
          }}
          onClick={onCanvasClick}
          onDoubleClick={onCanvasDoubleClick}
        >
          <div
            className="grid-spacer"
            style={{ width: geom.totalWidth, height: geom.totalHeight }}
          />
        </div>

        {dialog?.kind === 'ekiJikoku' && (
          <EkiJikokuDialog
            target={dialog.target}
            {...(dialog.initial !== undefined ? { initialKeyString: dialog.initial } : {})}
            initialField={dialog.field}
            dispatch={dispatch}
            onClose={() => {
              setDialog(null);
            }}
          />
        )}
        {dialog?.kind === 'ressyaProp' && (
          <RessyaPropDialog
            target={dialog.target}
            {...(dialog.initial !== undefined ? { initialKeyString: dialog.initial } : {})}
            dispatch={dispatch}
            onClose={() => {
              setDialog(null);
            }}
          />
        )}
        {dialog?.kind === 'operation' && (
          <OperationDialog
            target={dialog.target}
            onOk={(before, after) => {
              // OK = 1 Undo 単位。adjustOperation は setOperations reducer が担う。
              dispatch({
                type: 'ekiJikoku/setOperations',
                diaIndex: dialog.target.diaIndex,
                houkou: dialog.target.houkou,
                ressyaIndex: dialog.target.ressyaIndex,
                ekiOrder: dialog.target.ekiOrder,
                beforeOperationCont: before,
                afterOperationCont: after,
              });
            }}
            onClose={() => {
              setDialog(null);
            }}
          />
        )}
        {modifyDialogOpen && (
          <ModifyEkijikokuDialog
            ekiCont={data.rosen.ekiCont}
            houkou={houkou}
            initial={modifyOp2 ?? DEFAULT_MODIFY_OP2}
            onOk={(op) => {
              // 原典 5942-5963: 実行成否より先に記憶を更新 → 実行 → 成功時フォーカス前進。
              setModifyOp2(viewKey, op);
              setModifyDialogOpen(false);
              const t = resolveCellTarget(grid, sel.selection.focus.row, sel.selection.focus.col);
              if (t?.kind !== 'ekiJikoku') return;
              const targets = getCommandRessyaIndices(sel.selection, grid);
              if (targets.length === 0) return;
              // NULL 状態(変更しない + 駅扱変更なし)は記憶のみ更新(再実行が無効化される)。
              if (!op.setEkiatsukai && op.operation === 'nop') return;
              dispatch({
                type: 'ekiJikoku/modifyOperation2',
                diaIndex,
                houkou,
                ressyaIndices: targets,
                ekiOrder: t.ekiOrder,
                item: t.target,
                op,
              });
              moveNext(true);
            }}
            onClose={() => {
              setModifyDialogOpen(false);
            }}
          />
        )}
      </div>
    </div>
  );
}

/** フォーカス枠(点線)+ 選択列ハイライトを Canvas に重ね描き(design §6.1)。 */
function drawSelectionOverlay(
  ctx: CanvasRenderingContext2D,
  grid: import('@oudia-web/derive').TimetableGridSpec,
  geom: GridGeometry,
  view: { scrollX: number; scrollY: number; fixedCols: number; fixedRows: number },
  focus: { row: number; col: number },
  selectedRessya: ReadonlySet<number>,
): void {
  // 選択列(列車)のハイライト(半透明)。
  if (selectedRessya.size > 0) {
    ctx.fillStyle = 'rgba(29,95,176,0.15)';
    for (let c = 0; c < grid.columns.length; c++) {
      const col = grid.columns[c];
      if (col?.type !== 'ressya' || !selectedRessya.has(col.ressyaIndex)) continue;
      const r = cellViewRect(geom, view, 0, c);
      ctx.fillRect(r.x, 0, r.w, geom.totalHeight);
    }
  }
  // フォーカス枠(点線)。
  const fr = cellViewRect(geom, view, focus.row, focus.col);
  ctx.save();
  ctx.strokeStyle = 'rgb(29,95,176)';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([3, 2]);
  ctx.strokeRect(fr.x + 0.5, fr.y + 0.5, fr.w - 1, fr.h - 1);
  ctx.restore();
}
