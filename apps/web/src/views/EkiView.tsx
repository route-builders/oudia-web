// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 up-tri
//
// Based on OuDiaSecond (Copyright (C) 2017-2026 diagram_mania)
// and OuDia (Copyright (C) 2006-2017 take-okm)

/**
 * 駅ビュー(design 05_ui-views §3.3)。行 = 駅(起点順)。行単位で編集する。
 * [追加] = 末尾に既定駅を挿入(eki/replaceRange count 0)、[挿入] = 選択行の手前へ挿入、
 * [削除] = eki/replaceRange count 1、[反転] = 全駅順序反転(erase+insert 連鎖)。
 * ダブルクリック/[プロパティ] = 駅プロパティダイアログ。
 * 表示設定モード(16 設定一括サイクル)は M6。番線編集(番線リスト)も M6。
 */

import { createDefaultEki, type EkiDisplaySetting } from '@oudia-web/domain';
import type { Eki, Ekijikokukeisiki, RosenFileData } from '@oudia-web/format';
import { useState } from 'react';
import { EkiPropDialog } from '../dialog/EkiPropDialog.js';
import { useDocStore } from '../store/docStore.js';

/** 表示設定モードで一括サイクルする設定(M6。表示ラベル + 現在値の要約関数)。 */
const DISPLAY_SETTINGS: ReadonlyArray<{
  key: EkiDisplaySetting;
  label: string;
  summary: (eki: Eki, houkou: 0 | 1) => string;
}> = [
  {
    key: 'chakuHatsu',
    label: '着発',
    summary: (e, h) => {
      const jd = h === 0 ? e.jikokuhyouJikokuDisplayKudari : e.jikokuhyouJikokuDisplayNobori;
      return jd.chaku && jd.hatsu ? '着発' : jd.chaku ? '着' : '発';
    },
  },
  {
    key: 'track',
    label: '発着番線',
    summary: (e, h) =>
      (h === 0 ? e.jikokuhyouTrackDisplayKudari : e.jikokuhyouTrackDisplayNobori) ? '○' : '',
  },
  {
    key: 'nyuusen',
    label: '入線時刻',
    summary: (e, h) =>
      (h === 0 ? e.jikokuhyouNyuusenJikokuDisplayKudari : e.jikokuhyouNyuusenJikokuDisplayNobori)
        ? '○'
        : '',
  },
  {
    key: 'ressyabangou',
    label: '列車番号',
    summary: (e, h) =>
      String(
        (h === 0
          ? e.jikokuhyouSyubetsuChangeDisplayKudari
          : e.jikokuhyouSyubetsuChangeDisplayNobori
        ).ressyabangou,
      ),
  },
  {
    key: 'syubetsu',
    label: '種別',
    summary: (e, h) =>
      String(
        (h === 0
          ? e.jikokuhyouSyubetsuChangeDisplayKudari
          : e.jikokuhyouSyubetsuChangeDisplayNobori
        ).syubetsu,
      ),
  },
  {
    key: 'ressyamei',
    label: '列車名',
    summary: (e, h) =>
      String(
        (h === 0
          ? e.jikokuhyouSyubetsuChangeDisplayKudari
          : e.jikokuhyouSyubetsuChangeDisplayNobori
        ).ressyamei,
      ),
  },
  {
    key: 'outerOrigin',
    label: '路線外始発',
    summary: (e, h) =>
      (h === 0 ? e.jikokuhyouOuterDisplayKudari : e.jikokuhyouOuterDisplayNobori).origin ? '○' : '',
  },
  {
    key: 'outerTerminal',
    label: '路線外終着',
    summary: (e, h) =>
      (h === 0 ? e.jikokuhyouOuterDisplayKudari : e.jikokuhyouOuterDisplayNobori).terminal
        ? '○'
        : '',
  },
];

const KEISIKI_LABEL: Record<Ekijikokukeisiki, string> = {
  hatsu: '発',
  hatsuchaku: '発着',
  kudariChaku: '下り着',
  noboriChaku: '上り着',
  kudariHatsuchaku: '下り発着',
  noboriHatsuchaku: '上り発着',
};

/** 空き最小の駅 ID を採番する(原典 CentDedEkiCont::insert の id 採番規則)。 */
function nextEkiId(ekiCont: readonly Eki[]): number {
  const used = new Set(ekiCont.map((e) => e.id));
  let id = 0;
  while (used.has(id)) id++;
  return id;
}

export function EkiView(props: { data: RosenFileData }): React.ReactElement {
  const { data } = props;
  const dispatch = useDocStore((s) => s.dispatch);
  const cont = data.rosen.ekiCont;
  const [selected, setSelected] = useState(0);
  const [dialogIndex, setDialogIndex] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  // 表示設定モード(M6)。カスタマイズ時刻表向けの下り/上り各表示設定を一括サイクルする。
  const [settingMode, setSettingMode] = useState(false);
  const [settingHoukou, setSettingHoukou] = useState<0 | 1>(0);

  const sel = cont.length === 0 ? -1 : Math.min(selected, cont.length - 1);

  const cycle = (key: EkiDisplaySetting, forward: boolean): void => {
    if (sel < 0) return;
    run(() => {
      dispatch({
        type: 'eki/cycleDisplaySetting',
        ekiIndices: [sel],
        setting: key,
        houkou: settingHoukou,
        forward,
      });
    });
  };

  const run = (fn: () => void): void => {
    setError(null);
    try {
      fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const insertAt = (index: number): void => {
    const id = nextEkiId(cont);
    run(() => {
      dispatch({
        type: 'eki/replaceRange',
        index,
        count: 0,
        eki: [createDefaultEki(id, `新駅${String(id)}`)],
      });
    });
    setSelected(index);
  };

  const onAppend = (): void => {
    insertAt(cont.length);
  };
  const onInsert = (): void => {
    insertAt(sel < 0 ? 0 : sel);
  };
  const onDelete = (): void => {
    if (sel < 0) return;
    run(() => {
      dispatch({ type: 'eki/replaceRange', index: sel, count: 1, eki: [] });
    });
    setSelected(Math.max(0, sel - 1));
  };

  const onInvert = (): void => {
    // 全駅順序反転(原典 CentDedRosen::invert の簡易版: 反転した配列で全域置換)。
    run(() => {
      const reversed = [...cont].reverse().map((e) => structuredClone(e));
      dispatch({ type: 'eki/replaceRange', index: 0, count: cont.length, eki: reversed });
    });
  };

  const trackCount = (e: Eki): number => e.ekiTrack2Cont.length;
  const brunchLabel = (e: Eki): string =>
    e.brunchCoreEkiIndex !== null ? `分岐→${String(e.brunchCoreEkiIndex)}` : '';
  const loopLabel = (e: Eki): string =>
    e.loopOriginEkiIndex !== null ? `環状→${String(e.loopOriginEkiIndex)}` : '';

  return (
    <div className="row-grid-view eki-view">
      <div className="row-grid-toolbar">
        <button type="button" onClick={onAppend}>
          末尾に追加
        </button>
        <button type="button" onClick={onInsert} disabled={cont.length === 0}>
          手前に挿入
        </button>
        <button type="button" onClick={onDelete} disabled={sel < 0}>
          削除
        </button>
        <button type="button" onClick={onInvert} disabled={cont.length < 2}>
          駅順を反転
        </button>
        <button type="button" onClick={() => sel >= 0 && setDialogIndex(sel)} disabled={sel < 0}>
          プロパティ
        </button>
        <button
          type="button"
          className={settingMode ? 'active' : ''}
          onClick={() => setSettingMode((m) => !m)}
          disabled={cont.length === 0}
        >
          表示設定モード
        </button>
        {settingMode && (
          <>
            <select
              value={settingHoukou}
              onChange={(e) => setSettingHoukou(Number(e.target.value) === 1 ? 1 : 0)}
              aria-label="方向"
            >
              <option value={0}>下り</option>
              <option value={1}>上り</option>
            </select>
          </>
        )}
      </div>
      {error !== null && <div className="app-error">{error}</div>}
      {settingMode ? (
        <table className="row-grid setting-mode">
          <thead>
            <tr>
              <th>#</th>
              <th>駅名</th>
              {DISPLAY_SETTINGS.map((s) => (
                <th key={s.key}>
                  <div className="setting-col-head">
                    <span>{s.label}</span>
                    <span className="setting-cycle-buttons">
                      <button
                        type="button"
                        aria-label={`${s.label} 逆送り`}
                        onClick={() => cycle(s.key, false)}
                        disabled={sel < 0}
                      >
                        ◂
                      </button>
                      <button
                        type="button"
                        aria-label={`${s.label} 順送り`}
                        onClick={() => cycle(s.key, true)}
                        disabled={sel < 0}
                      >
                        ▸
                      </button>
                    </span>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {cont.map((e, i) => (
              <tr key={e.id} className={i === sel ? 'selected' : ''} onClick={() => setSelected(i)}>
                <td>{i}</td>
                <td>{e.ekimei || '(無名駅)'}</td>
                {DISPLAY_SETTINGS.map((s) => (
                  <td key={s.key}>{s.summary(e, settingHoukou)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <table className="row-grid">
          <thead>
            <tr>
              <th>#</th>
              <th>駅名</th>
              <th>駅時刻形式</th>
              <th>駅規模</th>
              <th>番線数</th>
              <th>分岐/環状</th>
            </tr>
          </thead>
          <tbody>
            {cont.map((e, i) => (
              <tr
                key={e.id}
                className={i === sel ? 'selected' : ''}
                onClick={() => setSelected(i)}
                onDoubleClick={() => setDialogIndex(i)}
              >
                <td>{i}</td>
                <td>{e.ekimei || '(無名駅)'}</td>
                <td>{KEISIKI_LABEL[e.ekijikokukeisiki]}</td>
                <td>{e.ekikibo === 'syuyou' ? '主要' : '一般'}</td>
                <td>{trackCount(e)}</td>
                <td>{[brunchLabel(e), loopLabel(e)].filter(Boolean).join(' ')}</td>
              </tr>
            ))}
            {cont.length === 0 && (
              <tr>
                <td colSpan={6} className="empty-row">
                  駅がありません。[末尾に追加] で駅を作成してください。
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}

      {dialogIndex !== null &&
        cont[dialogIndex] !== undefined &&
        (() => {
          const e = cont[dialogIndex];
          if (e === undefined) return null;
          return (
            <EkiPropDialog
              target={{ ekiIndex: dialogIndex, eki: e, ekiCount: cont.length }}
              dispatch={dispatch}
              onClose={() => setDialogIndex(null)}
            />
          );
        })()}
    </div>
  );
}
