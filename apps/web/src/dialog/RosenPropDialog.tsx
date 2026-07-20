// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 up-tri
//
// Based on OuDiaSecond (Copyright (C) 2017-2026 diagram_mania)
// and OuDia (Copyright (C) 2006-2017 take-okm)

/**
 * 路線ファイルのプロパティダイアログ(design §05 5.4。原典 CDlgRosenFileProp)。
 * [路線] / [ダイヤグラム] / [時刻表] / [フォント・色] の 4 タブを持つ。commit() で全タブを
 * 一括検証してから、変更のあった rosen フィールドを 1 コマンド({ type: 'rosen/setProp' })、
 * 変更のあった DispProp フィールドを編集済み全体として 1 コマンド({ type: 'dispProp/set' })
 * として dispatch する。タブ UI は既存プリミティブが無いためダイアログ内に自前で構築する。
 */

import type { DispProp, EditCommand, Jikoku, Rosen } from '@oudia-web/domain';
import { decodeJikoku, encodeJikoku, isJikokuDecodeError } from '@oudia-web/format';
import { useEffect, useRef, useState } from 'react';
import { Dialog } from './Dialog.js';

type TabId = 'rosen' | 'diagram' | 'jikokuhyou' | 'font';

const KYORI_MIN = 30;
const KYORI_MAX = 1800;

/** 数値入力のパース。空文字列・非整数・範囲外は null(検証エラー)。 */
function parseIntInRange(value: string, min: number, max: number): number | null {
  if (value.trim() === '') return null;
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) return null;
  return n;
}

export function RosenPropDialog(props: {
  rosen: Rosen;
  dispProp: DispProp;
  /** 基準ダイヤ select の選択肢(index = diaIndex)。 */
  diaNames: readonly string[];
  dispatch: (cmd: EditCommand) => void;
  onClose: () => void;
}): React.ReactElement {
  const { rosen, dispProp, diaNames, dispatch, onClose } = props;

  const [activeTab, setActiveTab] = useState<TabId>('rosen');

  // ---- [路線] タブ ----
  const [rosenmei, setRosenmei] = useState<string>(rosen.rosenmei);
  const [kudariDiaAlias, setKudariDiaAlias] = useState<string>(rosen.kudariDiaAlias);
  const [noboriDiaAlias, setNoboriDiaAlias] = useState<string>(rosen.noboriDiaAlias);
  const [kijunDiaIndex, setKijunDiaIndex] = useState<number>(rosen.kijunDiaIndex);
  const [disableHiddenSyubetsu, setDisableHiddenSyubetsu] = useState<boolean>(
    rosen.disableHiddenSyubetsu,
  );
  const [enableOperation, setEnableOperation] = useState<0 | 1 | 2>(rosen.enableOperation);
  const [operationNumberReverse, setOperationNumberReverse] = useState<boolean>(
    rosen.operationNumberReverse,
  );
  const [operationCrossKitenJikoku, setOperationCrossKitenJikoku] = useState<boolean>(
    rosen.operationCrossKitenJikoku,
  );

  // ---- [ダイヤグラム] タブ ----
  const [kitenJikokuStr, setKitenJikokuStr] = useState<string>(encodeJikoku(rosen.kitenJikoku));
  const [kyoriStr, setKyoriStr] = useState<string>(String(rosen.diagramDgrYZahyouKyoriDefault));

  // ---- [時刻表] タブ(DispProp)----
  const [ressyaWidthStr, setRessyaWidthStr] = useState<string>(
    String(dispProp.jikokuhyouRessyaWidth),
  );
  const [display2400, setDisplay2400] = useState<boolean>(dispProp.display2400);
  const [anySec1Str, setAnySec1Str] = useState<string>(String(dispProp.anySecondIncDec1));
  const [anySec2Str, setAnySec2Str] = useState<string>(String(dispProp.anySecondIncDec2));

  // ---- [フォント・色] タブ(DispProp。M5 は最小限)----
  const [ekimeiLengthStr, setEkimeiLengthStr] = useState<string>(String(dispProp.ekimeiLength));
  const [displayRessyamei, setDisplayRessyamei] = useState<boolean>(dispProp.displayRessyamei);

  // 検証エラー(commit 試行時にセット。ユーザ入力で自動クリアはしない — commit で再計算)。
  const [errors, setErrors] = useState<{
    kitenJikoku?: string;
    kyori?: string;
    ressyaWidth?: string;
    anySec1?: string;
    anySec2?: string;
    ekimeiLength?: string;
  }>({});

  // 路線名欄へフォーカスし、全選択する。
  const rosenmeiRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const el = rosenmeiRef.current;
    if (el === null) return;
    el.focus();
    el.setSelectionRange(0, el.value.length);
    // マウント時 1 回のみ。
  }, []);

  const commit = (): void => {
    // ---- 全タブを一括検証 ----
    const nextErrors: typeof errors = {};

    // 起点時刻(空文字列 → null)。
    const decodedKiten = decodeJikoku(kitenJikokuStr);
    if (isJikokuDecodeError(decodedKiten)) {
      nextErrors.kitenJikoku = '起点時刻の書式が不正です';
    }
    const kyori = parseIntInRange(kyoriStr, KYORI_MIN, KYORI_MAX);
    if (kyori === null) {
      nextErrors.kyori = `既定駅間幅は ${KYORI_MIN}〜${KYORI_MAX} の整数で入力してください`;
    }
    const ressyaWidth = parseIntInRange(ressyaWidthStr, 1, 100);
    if (ressyaWidth === null) {
      nextErrors.ressyaWidth = '列車欄幅は 1〜100 の整数で入力してください';
    }
    const anySec1 = parseIntInRange(anySec1Str, 0, 3600);
    if (anySec1 === null) {
      nextErrors.anySec1 = '任意秒送り1 は 0〜3600 の整数で入力してください';
    }
    const anySec2 = parseIntInRange(anySec2Str, 0, 3600);
    if (anySec2 === null) {
      nextErrors.anySec2 = '任意秒送り2 は 0〜3600 の整数で入力してください';
    }
    const ekimeiLength = parseIntInRange(ekimeiLengthStr, 1, 100);
    if (ekimeiLength === null) {
      nextErrors.ekimeiLength = '駅名欄幅は 1〜100 の整数で入力してください';
    }

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }
    // 数値フィールドの non-null narrowing(検証済みだが TS へ明示。到達しない防御)。
    if (
      kyori === null ||
      ressyaWidth === null ||
      anySec1 === null ||
      anySec2 === null ||
      ekimeiLength === null
    ) {
      return;
    }
    setErrors({});

    // 検証済み(上の early-return により non-null が保証される)。
    const kitenJikoku: Jikoku = decodedKiten as Jikoku;

    // ---- rosen フィールドの差分(変更ぶんのみ patch へ)----
    // patch の型は rosen/setProp コマンドの patch フィールドから引き当てる(手書き重複を避ける)。
    const patch: Extract<EditCommand, { type: 'rosen/setProp' }>['patch'] = {};
    if (rosenmei !== rosen.rosenmei) patch.rosenmei = rosenmei;
    if (kudariDiaAlias !== rosen.kudariDiaAlias) patch.kudariDiaAlias = kudariDiaAlias;
    if (noboriDiaAlias !== rosen.noboriDiaAlias) patch.noboriDiaAlias = noboriDiaAlias;
    // 変更判定は decode 済みの秒値どうしで行う(同一時刻の別表記で no-op dispatch しない)。
    if (kitenJikoku !== rosen.kitenJikoku) patch.kitenJikoku = kitenJikoku;
    if (kyori !== rosen.diagramDgrYZahyouKyoriDefault) {
      patch.diagramDgrYZahyouKyoriDefault = kyori;
    }
    if (enableOperation !== rosen.enableOperation) patch.enableOperation = enableOperation;
    if (operationNumberReverse !== rosen.operationNumberReverse) {
      patch.operationNumberReverse = operationNumberReverse;
    }
    if (operationCrossKitenJikoku !== rosen.operationCrossKitenJikoku) {
      patch.operationCrossKitenJikoku = operationCrossKitenJikoku;
    }
    if (kijunDiaIndex !== rosen.kijunDiaIndex) patch.kijunDiaIndex = kijunDiaIndex;
    if (disableHiddenSyubetsu !== rosen.disableHiddenSyubetsu) {
      patch.disableHiddenSyubetsu = disableHiddenSyubetsu;
    }
    if (Object.keys(patch).length > 0) {
      dispatch({ type: 'rosen/setProp', patch });
    }

    // ---- DispProp フィールドの差分 ----
    const dispChanged =
      ressyaWidth !== dispProp.jikokuhyouRessyaWidth ||
      display2400 !== dispProp.display2400 ||
      anySec1 !== dispProp.anySecondIncDec1 ||
      anySec2 !== dispProp.anySecondIncDec2 ||
      ekimeiLength !== dispProp.ekimeiLength ||
      displayRessyamei !== dispProp.displayRessyamei;
    if (dispChanged) {
      const edited: DispProp = {
        ...dispProp,
        jikokuhyouRessyaWidth: ressyaWidth,
        display2400,
        anySecondIncDec1: anySec1,
        anySecondIncDec2: anySec2,
        ekimeiLength,
        displayRessyamei,
      };
      dispatch({ type: 'dispProp/set', value: edited });
    }

    onClose();
  };

  const tab = (id: TabId, label: string): React.ReactElement => (
    <button
      type="button"
      role="tab"
      id={`rosenprop-tab-${id}`}
      aria-selected={activeTab === id}
      aria-controls={`rosenprop-panel-${id}`}
      className={activeTab === id ? 'dialog-tab dialog-tab-active' : 'dialog-tab'}
      onClick={() => {
        setActiveTab(id);
      }}
    >
      {label}
    </button>
  );

  return (
    <Dialog title="路線ファイルのプロパティ" onOk={commit} onCancel={onClose}>
      <div className="dialog-tablist" role="tablist" aria-label="路線ファイルのプロパティ">
        {tab('rosen', '路線')}
        {tab('diagram', 'ダイヤグラム')}
        {tab('jikokuhyou', '時刻表')}
        {tab('font', 'フォント・色')}
      </div>

      {activeTab === 'rosen' && (
        <div role="tabpanel" id="rosenprop-panel-rosen" aria-labelledby="rosenprop-tab-rosen">
          <label className="dialog-field">
            路線名
            <input
              ref={rosenmeiRef}
              type="text"
              value={rosenmei}
              onChange={(e) => {
                setRosenmei(e.target.value);
              }}
            />
          </label>

          <label className="dialog-field">
            下り別名
            <input
              type="text"
              value={kudariDiaAlias}
              placeholder="下り"
              onChange={(e) => {
                setKudariDiaAlias(e.target.value);
              }}
            />
          </label>

          <label className="dialog-field">
            上り別名
            <input
              type="text"
              value={noboriDiaAlias}
              placeholder="上り"
              onChange={(e) => {
                setNoboriDiaAlias(e.target.value);
              }}
            />
          </label>

          <label className="dialog-field">
            基準ダイヤ
            <select
              value={kijunDiaIndex}
              onChange={(e) => {
                setKijunDiaIndex(Number(e.target.value));
              }}
            >
              {diaNames.map((name, i) => (
                <option key={i} value={i}>
                  {name}
                </option>
              ))}
            </select>
          </label>

          <label className="dialog-field dialog-check">
            <input
              type="checkbox"
              checked={disableHiddenSyubetsu}
              onChange={(e) => {
                setDisableHiddenSyubetsu(e.target.checked);
              }}
            />
            隠し種別を無効化
          </label>

          <label className="dialog-field">
            運用機能
            <select
              value={enableOperation}
              onChange={(e) => {
                setEnableOperation(Number(e.target.value) as 0 | 1 | 2);
              }}
            >
              <option value={0}>無効</option>
              <option value={1}>簡易</option>
              <option value={2}>通常</option>
            </select>
          </label>

          <label className="dialog-field dialog-check">
            <input
              type="checkbox"
              checked={operationNumberReverse}
              onChange={(e) => {
                setOperationNumberReverse(e.target.checked);
              }}
            />
            運用番号反転
          </label>

          <label className="dialog-field dialog-check">
            <input
              type="checkbox"
              checked={operationCrossKitenJikoku}
              onChange={(e) => {
                setOperationCrossKitenJikoku(e.target.checked);
              }}
            />
            起点跨ぎ運用
          </label>
        </div>
      )}

      {activeTab === 'diagram' && (
        <div role="tabpanel" id="rosenprop-panel-diagram" aria-labelledby="rosenprop-tab-diagram">
          <label className="dialog-field">
            起点時刻
            <input
              type="text"
              value={kitenJikokuStr}
              placeholder="0"
              onChange={(e) => {
                setKitenJikokuStr(e.target.value);
              }}
            />
          </label>
          {errors.kitenJikoku !== undefined && <p className="dialog-error">{errors.kitenJikoku}</p>}

          <label className="dialog-field">
            既定駅間幅(秒)
            <input
              type="text"
              className="dialog-num"
              inputMode="numeric"
              aria-label="既定駅間幅(秒)"
              value={kyoriStr}
              onChange={(e) => {
                setKyoriStr(e.target.value);
              }}
            />
          </label>
          {errors.kyori !== undefined && <p className="dialog-error">{errors.kyori}</p>}
        </div>
      )}

      {activeTab === 'jikokuhyou' && (
        <div
          role="tabpanel"
          id="rosenprop-panel-jikokuhyou"
          aria-labelledby="rosenprop-tab-jikokuhyou"
        >
          <label className="dialog-field">
            列車欄幅
            <input
              type="text"
              className="dialog-num"
              inputMode="numeric"
              aria-label="列車欄幅"
              value={ressyaWidthStr}
              onChange={(e) => {
                setRessyaWidthStr(e.target.value);
              }}
            />
          </label>
          {errors.ressyaWidth !== undefined && <p className="dialog-error">{errors.ressyaWidth}</p>}

          <label className="dialog-field dialog-check">
            <input
              type="checkbox"
              checked={display2400}
              onChange={(e) => {
                setDisplay2400(e.target.checked);
              }}
            />
            2400時表示
          </label>

          <label className="dialog-field">
            任意秒送り1
            <input
              type="text"
              className="dialog-num"
              inputMode="numeric"
              aria-label="任意秒送り1"
              value={anySec1Str}
              onChange={(e) => {
                setAnySec1Str(e.target.value);
              }}
            />
          </label>
          {errors.anySec1 !== undefined && <p className="dialog-error">{errors.anySec1}</p>}

          <label className="dialog-field">
            任意秒送り2
            <input
              type="text"
              className="dialog-num"
              inputMode="numeric"
              aria-label="任意秒送り2"
              value={anySec2Str}
              onChange={(e) => {
                setAnySec2Str(e.target.value);
              }}
            />
          </label>
          {errors.anySec2 !== undefined && <p className="dialog-error">{errors.anySec2}</p>}
        </div>
      )}

      {activeTab === 'font' && (
        <div role="tabpanel" id="rosenprop-panel-font" aria-labelledby="rosenprop-tab-font">
          <p className="dialog-note">フォント・色の詳細編集は今後対応</p>

          <label className="dialog-field">
            駅名欄幅
            <input
              type="text"
              className="dialog-num"
              inputMode="numeric"
              aria-label="駅名欄幅"
              value={ekimeiLengthStr}
              onChange={(e) => {
                setEkimeiLengthStr(e.target.value);
              }}
            />
          </label>
          {errors.ekimeiLength !== undefined && (
            <p className="dialog-error">{errors.ekimeiLength}</p>
          )}

          <label className="dialog-field dialog-check">
            <input
              type="checkbox"
              checked={displayRessyamei}
              onChange={(e) => {
                setDisplayRessyamei(e.target.checked);
              }}
            />
            列車名表示
          </label>
        </div>
      )}
    </Dialog>
  );
}
