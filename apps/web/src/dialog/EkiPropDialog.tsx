// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 up-tri
//
// Based on OuDiaSecond (Copyright (C) 2017-2026 diagram_mania)
// and OuDia (Copyright (C) 2006-2017 take-okm)

/**
 * 駅のプロパティダイアログ(design §05 5.3.3、1 画面・タブなし)。駅名 / 時刻表略称 /
 * ダイヤグラム略称 / 駅時刻形式(select) / 駅規模(radio) / 次駅距離 / 分岐駅 / 環状線 を編集。
 * 変更のあったフィールドを eki/setProp・eki/setBrunch・eki/setLoop として dispatch する。
 * 分岐と環状は原典同様 相互排他(UI 上で一方を on にすると他方の操作を無効化する)。
 * 番線(ekiTrack2)編集(M6)は TrackListEditor を埋め込み、ekiTrack2/replace で反映する。
 */

import {
  checkTrackDeletable,
  type EditCommand,
  type Eki,
  type Ekijikokukeisiki,
  type Ekikibo,
} from '@oudia-web/domain';
import { useEffect, useRef, useState } from 'react';
import { useDocStore } from '../store/docStore.js';
import { Dialog } from './Dialog.js';
import { fromTrackRows, TrackListEditor, type TrackRow, toTrackRows } from './TrackListEditor.js';

/** 駅時刻形式 select の選択肢(design §5.3.3 の表示ラベル)。 */
const EKIJIKOKUKEISIKI_OPTIONS: ReadonlyArray<{ value: Ekijikokukeisiki; label: string }> = [
  { value: 'hatsu', label: '発時刻のみ' },
  { value: 'hatsuchaku', label: '発着時刻' },
  { value: 'kudariChaku', label: '下り着時刻' },
  { value: 'noboriChaku', label: '上り着時刻' },
  { value: 'kudariHatsuchaku', label: '下り発着' },
  { value: 'noboriHatsuchaku', label: '上り発着' },
];

export interface EkiPropDialogTarget {
  ekiIndex: number;
  eki: Eki;
  ekiCount: number;
}

export function EkiPropDialog(props: {
  target: EkiPropDialogTarget;
  /** 初期文字列(キー転送。駅名欄へ入る)。 */
  initialKeyString?: string;
  dispatch: (cmd: EditCommand) => void;
  onClose: () => void;
}): React.ReactElement {
  const { target, initialKeyString, dispatch, onClose } = props;
  const { ekiIndex, eki, ekiCount } = target;

  // ---- 基本フィールド(target.eki から seed)----
  const [ekimei, setEkimei] = useState<string>(initialKeyString ?? eki.ekimei);
  const [ekimeiJikokuRyaku, setEkimeiJikokuRyaku] = useState<string>(eki.ekimeiJikokuRyaku);
  const [ekimeiDiaRyaku, setEkimeiDiaRyaku] = useState<string>(eki.ekimeiDiaRyaku);
  const [ekijikokukeisiki, setEkijikokukeisiki] = useState<Ekijikokukeisiki>(eki.ekijikokukeisiki);
  const [ekikibo, setEkikibo] = useState<Ekikibo>(eki.ekikibo);
  const [nextEkiDistance, setNextEkiDistance] = useState<string>(String(eki.nextEkiDistance));

  // ---- 分岐駅 ----
  const [brunchOn, setBrunchOn] = useState<boolean>(eki.brunchCoreEkiIndex !== null);
  const [brunchCore, setBrunchCore] = useState<number | null>(eki.brunchCoreEkiIndex);
  const [brunchOpposite, setBrunchOpposite] = useState<boolean>(eki.brunchOpposite);

  // ---- 環状線 ----
  const [loopOn, setLoopOn] = useState<boolean>(eki.loopOriginEkiIndex !== null);
  const [loopOrigin, setLoopOrigin] = useState<number | null>(eki.loopOriginEkiIndex);
  const [loopOpposite, setLoopOpposite] = useState<boolean>(eki.loopOpposite);

  // ---- 番線(M6)----
  const data = useDocStore((s) => s.data);
  const [trackRows, setTrackRows] = useState<TrackRow[]>(() =>
    toTrackRows(eki.ekiTrack2Cont, eki.downMain, eki.upMain, eki.diagramTrackOmit),
  );
  const oldTrackCount = eki.ekiTrack2Cont.length;
  const [trackError, setTrackError] = useState<string | null>(null);

  // 駅名欄へフォーカスし、カーソルを末尾に置く(design §5.2 キー転送)。
  const ekimeiRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const el = ekimeiRef.current;
    if (el === null) return;
    el.focus();
    const n = el.value.length;
    el.setSelectionRange(n, n);
    // マウント時 1 回のみ。
  }, []);

  // 自駅を除く他駅の index(基幹駅 / 起点駅の候補)。駅名は未取得のため index で表示する。
  const otherEkiIndices: number[] = [];
  for (let i = 0; i < ekiCount; i++) {
    if (i !== ekiIndex) otherEkiIndices.push(i);
  }

  // ---- 検証 ----
  const distanceValue = Number(nextEkiDistance);
  const distanceValid =
    nextEkiDistance.trim() !== '' && Number.isInteger(distanceValue) && distanceValue >= 0;
  const brunchValid = !brunchOn || brunchCore !== null;
  const loopValid = !loopOn || loopOrigin !== null;
  // 番線: 名称・略称は非空必須(ライターが空で例外を投げる)。
  const tracksValid =
    trackRows.length >= 1 &&
    trackRows.every((r) => r.trackName.trim() !== '' && r.trackRyakusyou.trim() !== '');
  const okEnabled = distanceValid && brunchValid && loopValid && tracksValid;

  const commit = (): void => {
    if (!okEnabled) return;

    // 番線編集の反映(変更があれば)。削除ガードは事前検証してインラインエラーにする。
    const derived = fromTrackRows(trackRows, oldTrackCount);
    const tracksChanged =
      derived.tracks.length !== eki.ekiTrack2Cont.length ||
      derived.downMain !== eki.downMain ||
      derived.upMain !== eki.upMain ||
      derived.tracks.some((t, i) => {
        const o = eki.ekiTrack2Cont[i];
        return (
          o === undefined ||
          t.trackName !== o.trackName ||
          t.trackRyakusyou !== o.trackRyakusyou ||
          t.trackNoboriRyakusyou !== o.trackNoboriRyakusyou
        );
      }) ||
      derived.diagramTrackOmit.some((v, i) => v !== (eki.diagramTrackOmit[i] ?? false)) ||
      derived.oldToNew.some((v, i) => v !== i);
    if (tracksChanged) {
      const deleted = derived.oldToNew.map((v, i) => (v === -1 ? i : -1)).filter((i) => i >= 0);
      if (deleted.length > 0 && data !== null) {
        const err = checkTrackDeletable(data, ekiIndex, deleted);
        if (err !== null) {
          setTrackError(err);
          return;
        }
      }
      dispatch({
        type: 'ekiTrack2/replace',
        ekiIndex,
        tracks: derived.tracks,
        downMain: derived.downMain,
        upMain: derived.upMain,
        diagramTrackOmit: derived.diagramTrackOmit,
        oldToNew: derived.oldToNew,
      });
    }

    // 変更のあったフィールドのみ dispatch(1 フィールド = 1 コマンド)。
    if (ekimei !== eki.ekimei) {
      dispatch({ type: 'eki/setProp', ekiIndex, prop: { key: 'ekimei', value: ekimei } });
    }
    if (ekimeiJikokuRyaku !== eki.ekimeiJikokuRyaku) {
      dispatch({
        type: 'eki/setProp',
        ekiIndex,
        prop: { key: 'ekimeiJikokuRyaku', value: ekimeiJikokuRyaku },
      });
    }
    if (ekimeiDiaRyaku !== eki.ekimeiDiaRyaku) {
      dispatch({
        type: 'eki/setProp',
        ekiIndex,
        prop: { key: 'ekimeiDiaRyaku', value: ekimeiDiaRyaku },
      });
    }
    if (ekijikokukeisiki !== eki.ekijikokukeisiki) {
      dispatch({
        type: 'eki/setProp',
        ekiIndex,
        prop: { key: 'ekijikokukeisiki', value: ekijikokukeisiki },
      });
    }
    if (ekikibo !== eki.ekikibo) {
      dispatch({ type: 'eki/setProp', ekiIndex, prop: { key: 'ekikibo', value: ekikibo } });
    }
    if (distanceValue !== eki.nextEkiDistance) {
      dispatch({
        type: 'eki/setProp',
        ekiIndex,
        prop: { key: 'nextEkiDistance', value: distanceValue },
      });
    }

    // 分岐駅。分岐 on と環状 on は相互排他のため、分岐を設定するときは環状は解除される
    // (レデューサ側でも core 設定時に loopOriginEkiIndex を null 化する)。
    const nextBrunchCore = brunchOn ? brunchCore : null;
    if (nextBrunchCore !== eki.brunchCoreEkiIndex || brunchOpposite !== eki.brunchOpposite) {
      dispatch({
        type: 'eki/setBrunch',
        ekiIndex,
        brunchCoreEkiIndex: nextBrunchCore,
        brunchOpposite,
      });
    }

    // 環状線。
    const nextLoopOrigin = loopOn ? loopOrigin : null;
    if (nextLoopOrigin !== eki.loopOriginEkiIndex || loopOpposite !== eki.loopOpposite) {
      dispatch({
        type: 'eki/setLoop',
        ekiIndex,
        loopOriginEkiIndex: nextLoopOrigin,
        loopOpposite,
      });
    }

    onClose();
  };

  return (
    <Dialog title="駅のプロパティ" onOk={commit} onCancel={onClose} okEnabled={okEnabled}>
      <label className="dialog-field">
        駅名
        <input
          ref={ekimeiRef}
          type="text"
          value={ekimei}
          onChange={(e) => {
            setEkimei(e.target.value);
          }}
        />
      </label>

      <label className="dialog-field">
        駅名時刻表略称
        <input
          type="text"
          value={ekimeiJikokuRyaku}
          onChange={(e) => {
            setEkimeiJikokuRyaku(e.target.value);
          }}
        />
      </label>

      <label className="dialog-field">
        駅名ダイヤグラム略称
        <input
          type="text"
          value={ekimeiDiaRyaku}
          onChange={(e) => {
            setEkimeiDiaRyaku(e.target.value);
          }}
        />
      </label>

      <label className="dialog-field">
        駅時刻形式
        <select
          value={ekijikokukeisiki}
          onChange={(e) => {
            setEkijikokukeisiki(e.target.value as Ekijikokukeisiki);
          }}
        >
          {EKIJIKOKUKEISIKI_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>

      <fieldset className="dialog-field">
        <legend>駅規模</legend>
        <label className="dialog-field dialog-check">
          <input
            type="radio"
            name="ekikibo"
            checked={ekikibo === 'ippan'}
            onChange={() => {
              setEkikibo('ippan');
            }}
          />
          一般駅
        </label>
        <label className="dialog-field dialog-check">
          <input
            type="radio"
            name="ekikibo"
            checked={ekikibo === 'syuyou'}
            onChange={() => {
              setEkikibo('syuyou');
            }}
          />
          主要駅
        </label>
      </fieldset>

      <label className="dialog-field">
        次駅距離(秒。0 = 路線既定)
        <input
          className="dialog-num"
          type="text"
          inputMode="numeric"
          aria-label="次駅距離(秒)"
          value={nextEkiDistance}
          onChange={(e) => {
            setNextEkiDistance(e.target.value);
          }}
        />
      </label>
      {!distanceValid && (
        <p className="dialog-error">次駅距離は 0 以上の整数で入力してください。</p>
      )}

      <fieldset className="dialog-field">
        <legend>分岐駅</legend>
        <label className="dialog-field dialog-check">
          <input
            type="checkbox"
            checked={brunchOn}
            disabled={loopOn}
            onChange={(e) => {
              setBrunchOn(e.target.checked);
            }}
          />
          分岐駅にする
        </label>
        <label className="dialog-field">
          基幹駅
          <select
            value={brunchCore ?? ''}
            disabled={!brunchOn || loopOn}
            onChange={(e) => {
              setBrunchCore(e.target.value === '' ? null : Number(e.target.value));
            }}
          >
            <option value="">(選択してください)</option>
            {otherEkiIndices.map((i) => (
              <option key={i} value={i}>
                駅Index {i}
              </option>
            ))}
          </select>
        </label>
        <label className="dialog-field dialog-check">
          <input
            type="checkbox"
            checked={brunchOpposite}
            disabled={!brunchOn || loopOn}
            onChange={(e) => {
              setBrunchOpposite(e.target.checked);
            }}
          />
          対向
        </label>
        {brunchOn && brunchCore === null && (
          <p className="dialog-error">基幹駅を選択してください。</p>
        )}
      </fieldset>

      <fieldset className="dialog-field">
        <legend>環状線</legend>
        <label className="dialog-field dialog-check">
          <input
            type="checkbox"
            checked={loopOn}
            disabled={brunchOn}
            onChange={(e) => {
              setLoopOn(e.target.checked);
            }}
          />
          環状線起点にする
        </label>
        <label className="dialog-field">
          起点駅
          <select
            value={loopOrigin ?? ''}
            disabled={!loopOn || brunchOn}
            onChange={(e) => {
              setLoopOrigin(e.target.value === '' ? null : Number(e.target.value));
            }}
          >
            <option value="">(選択してください)</option>
            {otherEkiIndices.map((i) => (
              <option key={i} value={i}>
                駅Index {i}
              </option>
            ))}
          </select>
        </label>
        <label className="dialog-field dialog-check">
          <input
            type="checkbox"
            checked={loopOpposite}
            disabled={!loopOn || brunchOn}
            onChange={(e) => {
              setLoopOpposite(e.target.checked);
            }}
          />
          対向
        </label>
        {loopOn && loopOrigin === null && (
          <p className="dialog-error">起点駅を選択してください。</p>
        )}
      </fieldset>

      <TrackListEditor
        rows={trackRows}
        onChange={(rows) => {
          setTrackError(null);
          setTrackRows(rows);
        }}
      />
      {!tracksValid && (
        <p className="dialog-error">番線名・略称は空にできません(1 本以上必要です)。</p>
      )}
      {trackError !== null && <p className="dialog-error">{trackError}</p>}
    </Dialog>
  );
}
