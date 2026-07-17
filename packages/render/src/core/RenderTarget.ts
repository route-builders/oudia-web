// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 oudia-second-web contributors
//
// Based on OuDiaSecond (Copyright (C) 2017-2026 diagram_mania)
// and OuDia (Copyright (C) 2006-2017 take-okm)

/**
 * 描画対象の薄いラッパ(原典 IfDcdTarget の縮約。design/06_rendering §6.1)。
 * Canvas 2D ctx にクリップ・オフセットのヘルパを足すだけ。ダーティ矩形管理は上位の責務。
 *
 * ctx 型は CanvasRenderingContext2D / OffscreenCanvasRenderingContext2D の共通部分だけを
 * 使う(テストではモック ctx を差し込める)。
 */

/** 描画領域(CSS px 相当の論理座標)。 */
export interface Zone {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

/** render が使う ctx の最小インタフェース(モック可能)。 */
export interface RenderContext2D {
  save(): void;
  restore(): void;
  beginPath(): void;
  rect(x: number, y: number, w: number, h: number): void;
  clip(): void;
  translate(x: number, y: number): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  stroke(): void;
  fill(): void;
  fillRect(x: number, y: number, w: number, h: number): void;
  strokeRect(x: number, y: number, w: number, h: number): void;
  fillText(text: string, x: number, y: number): void;
  arc(x: number, y: number, r: number, start: number, end: number): void;
  rotate(angle: number): void;
  measureText(text: string): { width: number };
  setLineDash(segments: number[]): void;
  strokeStyle: string;
  fillStyle: string;
  lineWidth: number;
  font: string;
  textAlign: string;
  textBaseline: string;
}

export class RenderTarget {
  constructor(
    readonly ctx: RenderContext2D,
    readonly zone: Zone,
  ) {}

  /** クリップ領域を張って fn を実行(原典 CaDcdTargetClip)。 */
  withClip(zone: Zone, fn: () => void): void {
    this.ctx.save();
    this.ctx.beginPath();
    this.ctx.rect(zone.x, zone.y, zone.w, zone.h);
    this.ctx.clip();
    try {
      fn();
    } finally {
      this.ctx.restore();
    }
  }

  /** 原点をオフセットして fn を実行(原典 CaDcdTargetItemPosition)。 */
  withOffset(dx: number, dy: number, fn: () => void): void {
    this.ctx.save();
    this.ctx.translate(dx, dy);
    try {
      fn();
    } finally {
      this.ctx.restore();
    }
  }
}
