// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 up-tri
//
// Based on OuDiaSecond (Copyright (C) 2017-2026 diagram_mania)
// and OuDia (Copyright (C) 2006-2017 take-okm)

/**
 * 列車種別ビュー(design 05_ui-views §3.3)。行 = 種別。行単位で編集する。
 * 行を選択して [上へ]/[下へ] = syubetsu/swap、[追加]/[削除] = syubetsu/replaceRange、
 * ダブルクリック/[プロパティ] = 種別プロパティダイアログ。表示は小規模なので DOM テーブル
 * (EkiJikokuhyouView と同じ方針。M1 簡略の延長)。
 */

import { createDefaultRessyasyubetsu } from '@oudia-web/domain';
import type { Colorref, RosenFileData, SenStyle } from '@oudia-web/format';
import { colorrefToRgb } from '@oudia-web/format';
import { useEffect, useRef, useState } from 'react';
import { SyubetsuPropDialog } from '../dialog/SyubetsuPropDialog.js';
import { useDocStore } from '../store/docStore.js';

function colorrefToCss(c: Colorref): string {
  const { r, g, b } = colorrefToRgb(c);
  return `rgb(${String(r)}, ${String(g)}, ${String(b)})`;
}

const SEN_DASH: Record<SenStyle, number[]> = {
  jissen: [],
  hasen: [6, 4],
  tensen: [2, 3],
  ittensasen: [8, 3, 2, 3],
};

/** 線サンプルを Canvas に描く小コンポーネント。 */
function LineSample(props: {
  color: Colorref;
  senStyle: SenStyle;
  bold: boolean;
}): React.ReactElement {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current;
    if (cv === null) return;
    const ctx = cv.getContext('2d');
    if (ctx === null) return;
    ctx.clearRect(0, 0, cv.width, cv.height);
    ctx.strokeStyle = colorrefToCss(props.color);
    ctx.lineWidth = props.bold ? 3 : 1;
    ctx.setLineDash(SEN_DASH[props.senStyle]);
    ctx.beginPath();
    ctx.moveTo(4, cv.height / 2);
    ctx.lineTo(cv.width - 4, cv.height / 2);
    ctx.stroke();
  }, [props.color, props.senStyle, props.bold]);
  return <canvas ref={ref} width={80} height={16} className="sen-sample" />;
}

export function SyubetsuView(props: { data: RosenFileData }): React.ReactElement {
  const { data } = props;
  const dispatch = useDocStore((s) => s.dispatch);
  const cont = data.rosen.ressyasyubetsuCont;
  const [selected, setSelected] = useState(0);
  const [dialogIndex, setDialogIndex] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const sel = Math.min(selected, cont.length - 1);

  const run = (fn: () => void): void => {
    setError(null);
    try {
      fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const onAdd = (): void => {
    const name = `新種別${String(cont.length)}`;
    run(() => {
      dispatch({
        type: 'syubetsu/replaceRange',
        index: cont.length,
        count: 0,
        syubetsu: [createDefaultRessyasyubetsu(name)],
      });
    });
    setSelected(cont.length);
  };

  const onDelete = (): void => {
    run(() => {
      dispatch({ type: 'syubetsu/replaceRange', index: sel, count: 1, syubetsu: [] });
    });
    setSelected(Math.max(0, sel - 1));
  };

  const onUp = (): void => {
    if (sel <= 0) return;
    run(() => {
      dispatch({ type: 'syubetsu/swap', indexA: sel, sizeA: 1, indexB: sel - 1 });
    });
    setSelected(sel - 1);
  };

  const onDown = (): void => {
    if (sel >= cont.length - 1) return;
    run(() => {
      dispatch({ type: 'syubetsu/swap', indexA: sel, sizeA: 1, indexB: sel + 1 });
    });
    setSelected(sel + 1);
  };

  const parentName = (idx: number | null): string =>
    idx === null ? '' : (cont[idx]?.syubetsumei ?? '');

  return (
    <div className="row-grid-view syubetsu-view">
      <div className="row-grid-toolbar">
        <button type="button" onClick={onAdd}>
          追加
        </button>
        <button type="button" onClick={onDelete} disabled={cont.length <= 1}>
          削除
        </button>
        <button type="button" onClick={onUp} disabled={sel <= 0}>
          上へ
        </button>
        <button type="button" onClick={onDown} disabled={sel >= cont.length - 1}>
          下へ
        </button>
        <button type="button" onClick={() => setDialogIndex(sel)}>
          プロパティ
        </button>
      </div>
      {error !== null && <div className="app-error">{error}</div>}
      <table className="row-grid">
        <thead>
          <tr>
            <th>#</th>
            <th>種別名</th>
            <th>略称</th>
            <th>文字色</th>
            <th>線</th>
            <th>親種別</th>
            <th>隠し</th>
          </tr>
        </thead>
        <tbody>
          {cont.map((s, i) => (
            <tr
              key={i}
              className={i === sel ? 'selected' : ''}
              onClick={() => setSelected(i)}
              onDoubleClick={() => setDialogIndex(i)}
            >
              <td>{i}</td>
              <td>{s.syubetsumei}</td>
              <td>{s.ryakusyou}</td>
              <td>
                <span
                  className="color-chip"
                  style={{ backgroundColor: colorrefToCss(s.jikokuhyouMojiColor) }}
                />
              </td>
              <td>
                <LineSample
                  color={s.diagramLineStyle.senColor}
                  senStyle={s.diagramLineStyle.senStyle}
                  bold={s.diagramLineStyle.isBold}
                />
              </td>
              <td>{parentName(s.parentSyubetsuIndex)}</td>
              <td>{s.hidden ? '✓' : ''}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {dialogIndex !== null &&
        cont[dialogIndex] !== undefined &&
        (() => {
          const s = cont[dialogIndex];
          if (s === undefined) return null;
          return (
            <SyubetsuPropDialog
              target={{ syubetsuIndex: dialogIndex, syubetsu: s, syubetsuCont: cont }}
              dispatch={dispatch}
              onClose={() => setDialogIndex(null)}
            />
          );
        })()}
    </div>
  );
}
