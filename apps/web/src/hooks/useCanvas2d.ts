// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 oudia-second-web contributors

/**
 * Canvas 2D の生成・DPR 対応・リサイズ購読フック。描画関数を渡すと、サイズ変化・
 * 依存変化のたびに CSS px 座標系(dpr 適用済み)で再描画する(design §3.2)。
 */

import { useEffect, useRef } from 'react';

/** dpr 上限(design §3.2: Retina 以上はスジ描画で視認差がなくコストのみ増える)。 */
const MAX_DPR = 2;

export interface CanvasSize {
  readonly w: number;
  readonly h: number;
}

/**
 * @param draw   (ctx, size) を受けて描画する。CSS px 座標系(dpr 変換済み)。
 * @param deps   draw の依存(変化で再描画)。
 */
export function useCanvas2d(
  draw: (ctx: CanvasRenderingContext2D, size: CanvasSize) => void,
  deps: readonly unknown[],
): React.RefObject<HTMLCanvasElement> {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawRef = useRef(draw);
  drawRef.current = draw;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null) return;
    const parent = canvas.parentElement;
    if (parent === null) return;

    const render = (): void => {
      const rect = parent.getBoundingClientRect();
      const w = Math.max(1, Math.floor(rect.width));
      const h = Math.max(1, Math.floor(rect.height));
      const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      canvas.style.width = `${String(w)}px`;
      canvas.style.height = `${String(h)}px`;
      const ctx = canvas.getContext('2d');
      if (ctx === null) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      drawRef.current(ctx, { w, h });
    };

    render();
    const ro = new ResizeObserver(render);
    ro.observe(parent);
    return () => {
      ro.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return canvasRef;
}
