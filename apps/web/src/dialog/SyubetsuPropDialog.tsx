// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 up-tri
//
// Based on OuDiaSecond (Copyright (C) 2017-2026 diagram_mania)
// and OuDia (Copyright (C) 2006-2017 take-okm)

/**
 * 列車種別のプロパティダイアログ(design §05 5.3.4)。種別名 / 略称 / 時刻表文字色・
 * フォント・背景色 / ダイヤグラム線(色・線種・太線 + ライブプレビュー)/ 停車駅明示 /
 * 親種別 / 隠し種別 を編集。commit() で全フィールド検証後、編集済みの Ressyasyubetsu を
 * 1 コマンド({ type: 'syubetsu/setProp', syubetsuIndex, value })として dispatch する。
 */

import type {
  Colorref,
  EditCommand,
  Ressyasyubetsu,
  SenStyle,
  StopMarkDrawType,
} from '@oudia-web/domain';
import { colorrefToRgb, rgbToColorref } from '@oudia-web/format';
import { useEffect, useRef, useState } from 'react';
import { Dialog } from './Dialog.js';

/** Colorref → `#rrggbb`(<input type="color"> 用)。 */
function colorrefToHex(color: Colorref): string {
  const { r, g, b } = colorrefToRgb(color);
  const hex = (n: number): string => (n & 0xff).toString(16).padStart(2, '0');
  return `#${hex(r)}${hex(g)}${hex(b)}`;
}

/** `#rrggbb` → Colorref。想定外入力は黒(0)へフォールバック。 */
function hexToColorref(hex: string): Colorref {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex);
  if (m === null || m[1] === undefined) return rgbToColorref(0, 0, 0);
  const v = Number.parseInt(m[1], 16);
  return rgbToColorref((v >> 16) & 0xff, (v >> 8) & 0xff, v & 0xff);
}

/** senStyle → canvas の setLineDash パターン。 */
function senStyleDash(style: SenStyle): number[] {
  switch (style) {
    case 'jissen':
      return [];
    case 'hasen':
      return [6, 4];
    case 'tensen':
      return [2, 3];
    case 'ittensasen':
      return [8, 3, 2, 3];
  }
}

const SEN_STYLE_OPTIONS: readonly { value: SenStyle; label: string }[] = [
  { value: 'jissen', label: '実線' },
  { value: 'hasen', label: '破線' },
  { value: 'tensen', label: '点線' },
  { value: 'ittensasen', label: '一点鎖線' },
];

const STOP_MARK_OPTIONS: readonly { value: StopMarkDrawType; label: string }[] = [
  { value: 'drawOnStop', label: '短時間停車駅に○' },
  { value: 'nothing', label: 'なし' },
  { value: 'drawOnPass', label: '通過駅に×(予約)' },
];

export interface SyubetsuPropDialogTarget {
  syubetsuIndex: number;
  syubetsu: Ressyasyubetsu;
  /** 親種別 select の選択肢(index = syubetsuIndex)。 */
  syubetsuCont: readonly Ressyasyubetsu[];
}

export function SyubetsuPropDialog(props: {
  target: SyubetsuPropDialogTarget;
  /** 初期文字列(キー転送。種別名欄へ入る)。 */
  initialKeyString?: string;
  dispatch: (cmd: EditCommand) => void;
  onClose: () => void;
}): React.ReactElement {
  const { target, initialKeyString, dispatch, onClose } = props;
  const s = target.syubetsu;

  const [syubetsumei, setSyubetsumei] = useState<string>(initialKeyString ?? s.syubetsumei);
  const [ryakusyou, setRyakusyou] = useState<string>(s.ryakusyou);
  const [jikokuhyouMojiColor, setJikokuhyouMojiColor] = useState<Colorref>(s.jikokuhyouMojiColor);
  const [jikokuhyouFontIndex, setJikokuhyouFontIndex] = useState<number>(s.jikokuhyouFontIndex);
  const [jikokuhyouBackColor, setJikokuhyouBackColor] = useState<Colorref>(s.jikokuhyouBackColor);
  const [senColor, setSenColor] = useState<Colorref>(s.diagramLineStyle.senColor);
  const [senStyle, setSenStyle] = useState<SenStyle>(s.diagramLineStyle.senStyle);
  const [isBold, setIsBold] = useState<boolean>(s.diagramLineStyle.isBold);
  const [stopMarkDrawType, setStopMarkDrawType] = useState<StopMarkDrawType>(s.stopMarkDrawType);
  const [parentSyubetsuIndex, setParentSyubetsuIndex] = useState<number | null>(
    s.parentSyubetsuIndex,
  );
  const [hidden, setHidden] = useState<boolean>(s.hidden);

  // 種別名欄へフォーカスし、カーソルを末尾に置く(design §5.2 キー転送)。
  const meiRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const el = meiRef.current;
    if (el === null) return;
    el.focus();
    const n = el.value.length;
    el.setSelectionRange(n, n);
    // マウント時 1 回のみ。
  }, []);

  // ダイヤグラム線のライブプレビュー。色・線種・太線の変化で再描画する。
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null) return;
    const ctx = canvas.getContext('2d');
    if (ctx === null) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.strokeStyle = colorrefToHex(senColor);
    ctx.lineWidth = isBold ? 3 : 1;
    ctx.setLineDash(senStyleDash(senStyle));
    const y = Math.round(canvas.height / 2) + 0.5;
    ctx.beginPath();
    ctx.moveTo(8, y);
    ctx.lineTo(canvas.width - 8, y);
    ctx.stroke();
    ctx.restore();
  }, [senColor, senStyle, isBold]);

  const meiEmpty = syubetsumei.trim() === '';

  const commit = (): void => {
    // 全フィールドを先に検証(design §5.1 commit 規約)。
    if (meiEmpty) return;

    const edited: Ressyasyubetsu = {
      ...s,
      syubetsumei,
      ryakusyou,
      jikokuhyouMojiColor,
      jikokuhyouFontIndex,
      jikokuhyouBackColor,
      diagramLineStyle: { senColor, senStyle, isBold },
      stopMarkDrawType,
      parentSyubetsuIndex,
      hidden,
    };
    dispatch({
      type: 'syubetsu/setProp',
      syubetsuIndex: target.syubetsuIndex,
      value: edited,
    });
    onClose();
  };

  return (
    <Dialog title="列車種別のプロパティ" onOk={commit} onCancel={onClose} okEnabled={!meiEmpty}>
      <label className="dialog-field">
        種別名
        <input
          ref={meiRef}
          type="text"
          value={syubetsumei}
          onChange={(e) => {
            setSyubetsumei(e.target.value);
          }}
        />
      </label>
      {meiEmpty ? <p className="dialog-error">種別名を入力してください。</p> : null}

      <label className="dialog-field">
        略称
        <input
          type="text"
          maxLength={6}
          value={ryakusyou}
          onChange={(e) => {
            setRyakusyou(e.target.value);
          }}
        />
      </label>

      <label className="dialog-field">
        時刻表文字色
        <input
          type="color"
          value={colorrefToHex(jikokuhyouMojiColor)}
          onChange={(e) => {
            setJikokuhyouMojiColor(hexToColorref(e.target.value));
          }}
        />
      </label>

      <label className="dialog-field">
        時刻表フォント
        <select
          value={jikokuhyouFontIndex}
          onChange={(e) => {
            setJikokuhyouFontIndex(Number(e.target.value));
          }}
        >
          {Array.from({ length: 8 }, (_, i) => (
            <option key={i} value={i}>
              フォント{i + 1}
            </option>
          ))}
        </select>
      </label>

      <label className="dialog-field">
        時刻表背景色
        <input
          type="color"
          value={colorrefToHex(jikokuhyouBackColor)}
          onChange={(e) => {
            setJikokuhyouBackColor(hexToColorref(e.target.value));
          }}
        />
      </label>

      <fieldset className="dialog-field">
        <legend>ダイヤグラム線</legend>
        <label className="dialog-field">
          線色
          <input
            type="color"
            value={colorrefToHex(senColor)}
            onChange={(e) => {
              setSenColor(hexToColorref(e.target.value));
            }}
          />
        </label>
        <label className="dialog-field">
          線種
          <select
            value={senStyle}
            onChange={(e) => {
              setSenStyle(e.target.value as SenStyle);
            }}
          >
            {SEN_STYLE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label className="dialog-field dialog-check">
          <input
            type="checkbox"
            checked={isBold}
            onChange={(e) => {
              setIsBold(e.target.checked);
            }}
          />
          太線
        </label>
        <canvas ref={canvasRef} width={120} height={24} aria-label="ダイヤグラム線プレビュー" />
      </fieldset>

      <fieldset className="dialog-field">
        <legend>停車駅明示</legend>
        {STOP_MARK_OPTIONS.map((o) => (
          <label key={o.value} className="dialog-field dialog-check">
            <input
              type="radio"
              name="stopMarkDrawType"
              value={o.value}
              checked={stopMarkDrawType === o.value}
              onChange={() => {
                setStopMarkDrawType(o.value);
              }}
            />
            {o.label}
          </label>
        ))}
      </fieldset>

      <label className="dialog-field">
        親種別
        <select
          value={parentSyubetsuIndex === null ? '' : String(parentSyubetsuIndex)}
          onChange={(e) => {
            setParentSyubetsuIndex(e.target.value === '' ? null : Number(e.target.value));
          }}
        >
          <option value="">(なし)</option>
          {target.syubetsuCont.map((cand, i) =>
            i === target.syubetsuIndex ? null : (
              <option key={i} value={i}>
                {cand.syubetsumei}
              </option>
            ),
          )}
        </select>
      </label>

      <label className="dialog-field dialog-check">
        <input
          type="checkbox"
          checked={hidden}
          onChange={(e) => {
            setHidden(e.target.checked);
          }}
        />
        隠し種別
      </label>
    </Dialog>
  );
}
