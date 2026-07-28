// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 up-tri
//
// Based on OuDiaSecond (Copyright (C) 2017-2026 diagram_mania)
// and OuDia (Copyright (C) 2006-2017 take-okm)

/**
 * 運用表 CSV エクスポートダイアログ(原典 CDlgOperationTableCsvExport、
 * ViewAllOperationTable/CDlgOperationTableCsvExport.cpp + DiagramEdit.rc:2208-2234)。M7e。
 *
 * ★このダイアログが出るのは**運用一覧表ビューからの「運用表 CSV エクスポート」だけ**。
 * 運用表ビュー(単一運用)と運用一覧表 CSV は原典もダイアログなしで即保存する。
 *
 * ★原典に有効/無効の連動は一切ない(MESSAGE_MAP が空、cpp:645-648)。
 * ラジオが「全運用」でもキーワード欄・駅コンボは操作できる。ここでも足さない。
 *
 * ★抽出条件はどこにも永続化されない(oud2 にも INI にも書かれない)。
 */

import type {
  OperationCsvExportTarget,
  OperationMatchMode,
  OperationSort,
} from '@oudia-web/derive';
import { OPERATION_MATCH_LABEL, OPERATION_MATCH_MODES } from '@oudia-web/derive';
import type { Eki } from '@oudia-web/format';
import { useState } from 'react';
import { Dialog } from './Dialog.js';

/** ダイアログの確定値(呼び出し側が CSV 生成に渡す)。 */
export interface OperationTableCsvExportSettings {
  readonly target: OperationCsvExportTarget;
  readonly sort: OperationSort;
  /** [箱ダイヤ形式で表示する]。 */
  readonly boxDia: boolean;
  /** [上り列車の始発駅を左側にする(従来形式時のみ)]。 */
  readonly noboriLeftToRight: boolean;
  /** [通過駅の駅時刻を表示する(箱ダイヤ時のみ)]。 */
  readonly displayTsuukaEkiJikoku: boolean;
  /** [着発番線名を表示する]。 */
  readonly displayTrackName: boolean;
}

/** 並び順コンボの項目(原典 cpp:710-722。EOperationSort と同順)。 */
const SORT_ITEMS: readonly { value: OperationSort; label: string }[] = [
  { value: 'operationNumber', label: '運用番号順に並べる' },
  { value: 'outEki', label: '出区駅順に並べる' },
  { value: 'outJikoku', label: '発時刻順に並べる' },
  { value: 'inEki', label: '入区駅順に並べる' },
  { value: 'inJikoku', label: '着時刻順に並べる' },
];

export function OperationTableCsvExportDialog(props: {
  ekiCont: readonly Eki[];
  /** 既定値(呼び出し元ビューの表示設定から)。 */
  initial: OperationTableCsvExportSettings & { keyword: string; ekiIndex: number };
  onOk: (settings: OperationTableCsvExportSettings) => void;
  onCancel: () => void;
}): React.ReactElement {
  const { ekiCont, initial, onOk, onCancel } = props;
  const [radio, setRadio] = useState<0 | 1 | 2>(
    initial.target.kind === 'all' ? 0 : initial.target.kind === 'operationNumber' ? 1 : 2,
  );
  const [keyword, setKeyword] = useState(initial.keyword);
  const [mode, setMode] = useState<OperationMatchMode>(
    initial.target.kind === 'operationNumber' ? initial.target.mode : 'substring',
  );
  const [ekiIndex, setEkiIndex] = useState(initial.ekiIndex);
  const [inOrOut, setInOrOut] = useState<'out' | 'in'>(
    initial.target.kind === 'station' ? initial.target.inOrOut : 'out',
  );
  const [includeOuterTerminal, setIncludeOuterTerminal] = useState(
    initial.target.kind === 'station' ? initial.target.includeOuterTerminal : true,
  );
  const [sort, setSort] = useState<OperationSort>(initial.sort);
  const [boxDia, setBoxDia] = useState(initial.boxDia);
  const [noboriLeftToRight, setNoboriLeftToRight] = useState(initial.noboriLeftToRight);
  const [displayTsuukaEkiJikoku, setDisplayTsuukaEkiJikoku] = useState(
    initial.displayTsuukaEkiJikoku,
  );
  const [displayTrackName, setDisplayTrackName] = useState(initial.displayTrackName);

  const commit = (): void => {
    const target: OperationCsvExportTarget =
      radio === 0
        ? { kind: 'all' }
        : radio === 1
          ? { kind: 'operationNumber', keyword, mode }
          : { kind: 'station', ekiIndex, inOrOut, includeOuterTerminal };
    onOk({
      target,
      sort,
      boxDia,
      noboriLeftToRight,
      displayTsuukaEkiJikoku,
      displayTrackName,
    });
  };

  return (
    <Dialog title="運用表CSVエクスポート" okLabel="エクスポート" onOk={commit} onCancel={onCancel}>
      <fieldset className="dialog-group">
        <label className="dialog-radio">
          <input
            type="radio"
            name="opcsv-target"
            checked={radio === 0}
            onChange={() => {
              setRadio(0);
            }}
          />
          全運用を出力
        </label>
        <label className="dialog-radio">
          <input
            type="radio"
            name="opcsv-target"
            checked={radio === 1}
            onChange={() => {
              setRadio(1);
            }}
          />
          <input
            type="text"
            aria-label="運用番号キーワード"
            value={keyword}
            size={10}
            onChange={(e) => {
              setKeyword(e.target.value);
            }}
          />
          <select
            aria-label="運用番号の照合方法"
            value={mode}
            onChange={(e) => {
              setMode(e.target.value as OperationMatchMode);
            }}
          >
            {OPERATION_MATCH_MODES.map((m) => (
              <option key={m} value={m}>
                {OPERATION_MATCH_LABEL[m]}
              </option>
            ))}
          </select>
          運用番号の運用を抽出する
        </label>
        <label className="dialog-radio">
          <input
            type="radio"
            name="opcsv-target"
            checked={radio === 2}
            onChange={() => {
              setRadio(2);
            }}
          />
          <select
            aria-label="出入区駅"
            value={ekiIndex}
            onChange={(e) => {
              setEkiIndex(Number(e.target.value));
            }}
          >
            {ekiCont.map((eki, i) => (
              <option key={eki.id} value={i}>
                {eki.ekimei}
              </option>
            ))}
          </select>
          駅を
          <select
            aria-label="出区か入区か"
            value={inOrOut}
            onChange={(e) => {
              setInOrOut(e.target.value as 'out' | 'in');
            }}
          >
            <option value="out">出区</option>
            <option value="in">入区</option>
          </select>
          する運用を抽出する
        </label>
      </fieldset>
      <label className="dialog-field">
        並び順
        <select
          value={sort}
          onChange={(e) => {
            setSort(e.target.value as OperationSort);
          }}
        >
          {SORT_ITEMS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </label>
      {/* ★原典どおり、この項目は「駅を出入区する運用を抽出する」ときだけ効く。 */}
      <label className="dialog-check">
        <input
          type="checkbox"
          checked={includeOuterTerminal}
          onChange={(e) => {
            setIncludeOuterTerminal(e.target.checked);
          }}
        />
        路線外発着を含む
      </label>
      {/* 箱ダイヤ形式の CSV は後続タスク。実装まで操作できないようにしておく
          (原典には disabled 連動が無いので、これは実装状況に伴う一時的な差分)。 */}
      <label className="dialog-check">
        <input
          type="checkbox"
          checked={boxDia}
          disabled
          title="箱ダイヤ形式は未実装です"
          onChange={(e) => {
            setBoxDia(e.target.checked);
          }}
        />
        箱ダイヤ形式で表示する
      </label>
      <label className="dialog-check">
        <input
          type="checkbox"
          checked={noboriLeftToRight}
          onChange={(e) => {
            setNoboriLeftToRight(e.target.checked);
          }}
        />
        上り列車の始発駅を左側にする(従来形式時のみ)
      </label>
      <label className="dialog-check">
        <input
          type="checkbox"
          checked={displayTsuukaEkiJikoku}
          onChange={(e) => {
            setDisplayTsuukaEkiJikoku(e.target.checked);
          }}
        />
        通過駅の駅時刻を表示する(箱ダイヤ時のみ)
      </label>
      <label className="dialog-check">
        <input
          type="checkbox"
          checked={displayTrackName}
          onChange={(e) => {
            setDisplayTrackName(e.target.checked);
          }}
        />
        着発番線名を表示する
      </label>
    </Dialog>
  );
}
