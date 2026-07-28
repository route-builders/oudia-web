// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 up-tri
//
// Based on OuDiaSecond (Copyright (C) 2017-2026 diagram_mania)
// and OuDia (Copyright (C) 2006-2017 take-okm)

/**
 * 作業編集ダイアログ(原典 CDlgOperationProp、ViewJikokuhyou/CDlgOperationProp.cpp)。M7b PR-3。
 *
 * 「純 edit-model(domain)+ 薄い React ビュー」の二層。前作業・後作業を flat リスト
 * (`FlatOp[]` + iLevel)で保持し、選択行の (kind, isAfter) に応じた動的コントロールを
 * `operationFieldSpec` で決め、行書式は `formatOperationLine` で描く。編集操作は
 * `editOps`(add/insert/childAdd/clear/setKind)の純関数を呼ぶ。OK 時に `completeUiData` で
 * 時刻補完 → `fromFlat*` で再帰 union へ畳み、`ekiJikoku/setOperations` を dispatch する。
 *
 * adjustOperation(整合)はダイアログ内で呼ばない(原典同様。setOperations reducer が担う)。
 */

import {
  childOperationAdd,
  completeUiData,
  type FlatOp,
  formatOperationLine,
  fromFlatAfter,
  fromFlatBefore,
  OP_RELEASE,
  type OperationEditKind,
  operationAdd,
  operationClear,
  operationFieldSpec,
  operationInsert,
  placeholderFlat,
  setKind,
  toFlatAfter,
  toFlatBefore,
} from '@oudia-web/domain';
import type {
  AfterOperation,
  BeforeOperation,
  EkiTrack2,
  Jikoku,
  OuterTerminal,
} from '@oudia-web/format';
import { decodeJikoku, encodeJikoku } from '@oudia-web/format';
import { useMemo, useState } from 'react';
import { Dialog } from './Dialog.js';

export interface OperationDialogTarget {
  diaIndex: number;
  houkou: 0 | 1;
  ressyaIndex: number;
  /** 有効始発 or 有効終着の駅Order。 */
  ekiOrder: number;
  /** この駅の前作業列(有効始発 or 有効終着スロット)。 */
  beforeCont: readonly BeforeOperation[];
  /** この駅の後作業列。 */
  afterCont: readonly AfterOperation[];
  /** 当駅の着時刻(補完基準。null=始発)。 */
  chakuJikoku: Jikoku;
  /** 当駅の発時刻(補完基準。null=止まり)。 */
  hatsuJikoku: Jikoku;
  /** 当駅が停車扱いか(路線外補完に使う)。 */
  isTeisya: boolean;
  /** 当駅の番線(行書式・番線コンボ)。 */
  tracks: readonly EkiTrack2[];
  /** 当駅の路線外発着駅(行書式・路線外コンボ)。 */
  outerTerminals: readonly OuterTerminal[];
  /** 駅名(タイトル表示)。 */
  ekimei: string;
}

/** どちらの作業列を編集中か + 選択 index。 */
interface Selection {
  side: 'before' | 'after';
  index: number;
}

/** 時刻文字列 → Jikoku(空=null、不正=元のまま扱わず null)。 */
function parseJikoku(input: string): Jikoku {
  const r = decodeJikoku(input.trim());
  return typeof r === 'object' && r !== null && 'code' in r ? null : (r as Jikoku);
}

export function OperationDialog(props: {
  target: OperationDialogTarget;
  onOk: (before: BeforeOperation[], after: AfterOperation[]) => void;
  onClose: () => void;
}): React.ReactElement {
  const { target, onOk, onClose } = props;

  // flat の前後作業リスト(空なら番兵)。
  const [before, setBefore] = useState<FlatOp[]>(() => {
    const f = toFlatBefore(target.beforeCont);
    return f.length === 0 ? placeholderFlat() : f;
  });
  const [after, setAfter] = useState<FlatOp[]>(() => {
    const f = toFlatAfter(target.afterCont);
    return f.length === 0 ? placeholderFlat() : f;
  });
  const [selection, setSelection] = useState<Selection>({ side: 'before', index: 0 });

  const fmtCtx = useMemo(
    () => ({ tracks: target.tracks, outerTerminals: target.outerTerminals }),
    [target.tracks, target.outerTerminals],
  );

  const list = selection.side === 'before' ? before : after;
  const setList = selection.side === 'before' ? setBefore : setAfter;
  const isAfter = selection.side === 'after';
  const selected = list[selection.index];

  // 選択行の実効 isAfter(子作業は親の side に従う。ここでは list 側を採用)。
  const effectiveIsAfter = isAfter;

  const spec = useMemo(() => {
    if (selected === undefined) return null;
    const depth = selected.level.length;
    // 同階層の隣接兄弟の有無(Up/Down 用。簡易: 同 level 長で末尾以外一致)。
    const siblings = list.filter(
      (o) =>
        o.level.length === depth && o.level.slice(0, -1).every((v, i) => v === selected.level[i]),
    );
    const myPos = siblings.indexOf(selected);
    return operationFieldSpec(selected.kind, effectiveIsAfter, {
      outerEnable: target.outerTerminals.length > 0,
      levelDepth: depth,
      hasPrevSibling: myPos > 0,
      hasNextSibling: myPos >= 0 && myPos < siblings.length - 1,
    });
  }, [selected, list, effectiveIsAfter, target.outerTerminals.length]);

  /** 選択行を部分更新する。 */
  const updateSelected = (patch: Partial<FlatOp>): void => {
    setList((prev) => prev.map((o, i) => (i === selection.index ? { ...o, ...patch } : o)));
  };

  /** 編集操作(add/insert/childAdd/clear)を適用して選択を更新。 */
  const applyEdit = (
    fn: (flat: readonly FlatOp[], sel: number) => { flat: FlatOp[]; selected: number },
  ): void => {
    const r = fn(list, selection.index);
    setList(r.flat);
    setSelection({ side: selection.side, index: r.selected });
  };

  const changeKind = (kind: OperationEditKind): void => {
    const r = setKind(list, selection.index, kind, isAfter);
    setList(r.flat);
    setSelection({ side: selection.side, index: r.selected });
  };

  const commit = (): void => {
    // 番兵のみの列は空列として畳む。
    const beforeWork = [...before];
    const afterWork = [...after];
    completeUiData(beforeWork, afterWork, target.chakuJikoku, target.hatsuJikoku, {
      isTeisya: target.isTeisya,
    });
    onOk(fromFlatBefore(beforeWork), fromFlatAfter(afterWork));
    onClose();
  };

  return (
    <Dialog title={`作業のプロパティ(${target.ekimei})`} onOk={commit} onCancel={onClose}>
      <div className="op-dialog">
        <div className="op-lists">
          <OperationList
            title="前作業"
            side="before"
            flat={before}
            selection={selection}
            onSelect={(index) => setSelection({ side: 'before', index })}
            fmtCtx={fmtCtx}
            isAfter={false}
          />
          <OperationList
            title="後作業"
            side="after"
            flat={after}
            selection={selection}
            onSelect={(index) => setSelection({ side: 'after', index })}
            fmtCtx={fmtCtx}
            isAfter={true}
          />
        </div>

        {selected !== undefined && spec !== null && (
          <div className="op-editor">
            {/* 種別ラジオ */}
            <div className="op-radios">
              {spec.radios.map((r) => (
                <label key={r.kind} className="op-radio">
                  <input
                    type="radio"
                    name="op-kind"
                    checked={selected.kind === r.kind}
                    disabled={!r.enabled}
                    onChange={() => changeKind(r.kind as OperationEditKind)}
                  />
                  {r.label}
                </label>
              ))}
            </div>

            {/* コンボ Data1 */}
            {spec.combo1.visible && (
              <label className="dialog-field">
                {spec.combo1.label}
                <ComboData1
                  kind={spec.combo1.kind}
                  value={selected.comboData1}
                  tracks={target.tracks}
                  outerTerminals={target.outerTerminals}
                  onChange={(v) => updateSelected({ comboData1: v })}
                />
              </label>
            )}

            {/* Edit1(時刻 or 編成数) */}
            {spec.edit1.visible && (
              <label className="dialog-field">
                {spec.edit1.label}
                {selected.kind === OP_RELEASE ? (
                  <input
                    type="number"
                    min={1}
                    max={10}
                    value={selected.releaseCount || 1}
                    onChange={(e) => updateSelected({ releaseCount: Number(e.target.value) })}
                  />
                ) : (
                  <input
                    type="text"
                    value={encodeJikoku(selected.editData1)}
                    placeholder="--:--"
                    onChange={(e) => updateSelected({ editData1: parseJikoku(e.target.value) })}
                  />
                )}
              </label>
            )}

            {/* Edit2(時刻) */}
            {spec.edit2.visible && (
              <label className="dialog-field">
                {spec.edit2.label}
                <input
                  type="text"
                  value={encodeJikoku(selected.editData2)}
                  placeholder="--:--"
                  onChange={(e) => updateSelected({ editData2: parseJikoku(e.target.value) })}
                />
              </label>
            )}

            {/* 運用番号(';' 区切り) */}
            {spec.operationNumbers.visible && (
              <label className="dialog-field">
                {spec.operationNumbers.label}
                <input
                  type="text"
                  value={selected.operationNumbers.join(';')}
                  onChange={(e) =>
                    updateSelected({
                      operationNumbers: e.target.value === '' ? [] : e.target.value.split(';'),
                    })
                  }
                />
              </label>
            )}

            {/* チェック(当駅時刻扱い / 順反転) */}
            {spec.check1.visible && (
              <label className="dialog-field dialog-check">
                <input
                  type="checkbox"
                  checked={selected.check1}
                  onChange={(e) => updateSelected({ check1: e.target.checked })}
                />
                {spec.check1.label}
              </label>
            )}

            {/* 入出区連携コード */}
            {spec.inOutLinkCode.visible && (
              <label className="dialog-field">
                {spec.inOutLinkCode.label}
                <input
                  type="text"
                  value={selected.inOutLinkCode}
                  onChange={(e) => updateSelected({ inOutLinkCode: e.target.value })}
                />
              </label>
            )}

            {/* 操作ボタン */}
            <div className="op-buttons">
              <button
                type="button"
                disabled={!spec.buttons.add}
                onClick={() => applyEdit(operationAdd)}
              >
                後に追加
              </button>
              <button
                type="button"
                disabled={!spec.buttons.insert}
                onClick={() => applyEdit(operationInsert)}
              >
                前に挿入
              </button>
              {spec.buttons.childAdd.visible && (
                <button type="button" onClick={() => applyEdit(childOperationAdd)}>
                  {spec.buttons.childAdd.label}
                </button>
              )}
              <button
                type="button"
                disabled={!spec.buttons.clear}
                onClick={() => applyEdit(operationClear)}
              >
                削除
              </button>
            </div>
          </div>
        )}
      </div>
    </Dialog>
  );
}

/** 片側(前/後)の作業リスト。行書式で描き、クリックで選択。 */
function OperationList(props: {
  title: string;
  side: 'before' | 'after';
  flat: readonly FlatOp[];
  selection: Selection;
  onSelect: (index: number) => void;
  fmtCtx: { tracks: readonly EkiTrack2[]; outerTerminals: readonly OuterTerminal[] };
  isAfter: boolean;
}): React.ReactElement {
  const { title, side, flat, selection, onSelect, fmtCtx, isAfter } = props;
  return (
    <div className="op-list">
      <div className="op-list-title">{title}</div>
      <ul className="op-list-items">
        {flat.map((op, i) => {
          const isSel = selection.side === side && selection.index === i;
          return (
            <li key={i}>
              <button
                type="button"
                className={isSel ? 'op-row op-row-sel' : 'op-row'}
                onClick={() => onSelect(i)}
              >
                {formatOperationLine(op, isAfter, fmtCtx)}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** コンボ Data1 の物理コンボ(種類ごとに選択肢が異なる)。 */
function ComboData1(props: {
  kind: 'none' | 'shuntTrack' | 'connectPos' | 'releasePos' | 'outerEki' | 'junctionType';
  value: number;
  tracks: readonly EkiTrack2[];
  outerTerminals: readonly OuterTerminal[];
  onChange: (v: number) => void;
}): React.ReactElement {
  const { kind, value, tracks, outerTerminals, onChange } = props;
  let options: string[] = [];
  if (kind === 'shuntTrack') options = tracks.map((t) => t.trackName);
  else if (kind === 'connectPos') options = ['編成後方に増結', '編成前方に増結'];
  else if (kind === 'releasePos') {
    options = ['後方編成を解結(後方数指定)', '前方編成を解結', '後方編成を解結(前方数指定)'];
  } else if (kind === 'outerEki') options = outerTerminals.map((o) => o.ekimei);
  else if (kind === 'junctionType') {
    options = ['別列車', '種別変更', '列車情報変更', '同一列車扱い'];
  }
  return (
    <select value={value} onChange={(e) => onChange(Number(e.target.value))}>
      {options.map((label, i) => (
        <option key={i} value={i}>
          {label}
        </option>
      ))}
    </select>
  );
}
