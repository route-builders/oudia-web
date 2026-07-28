// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 up-tri

// 描画コマンドを記録するモック RenderContext2D(design §6.3: スナップショットは
// 描画コマンド列を主とする)。実 Canvas なしで render 層を単体テストする。

import type { RenderContext2D } from './core/RenderTarget.js';

export interface RecordedCall {
  readonly op: string;
  readonly args: readonly unknown[];
}

export class MockCtx implements RenderContext2D {
  readonly calls: RecordedCall[] = [];
  strokeStyle: string | CanvasGradient | CanvasPattern = '';
  fillStyle: string | CanvasGradient | CanvasPattern = '';
  lineWidth = 1;
  font = '';
  textAlign: CanvasTextAlign = 'left';
  textBaseline: CanvasTextBaseline = 'alphabetic';

  private rec(op: string, ...args: unknown[]): void {
    this.calls.push({ op, args });
  }

  save(): void {
    this.rec('save');
  }
  restore(): void {
    this.rec('restore');
  }
  beginPath(): void {
    this.rec('beginPath');
  }
  rect(x: number, y: number, w: number, h: number): void {
    this.rec('rect', x, y, w, h);
  }
  clip(): void {
    this.rec('clip');
  }
  translate(x: number, y: number): void {
    this.rec('translate', x, y);
  }
  moveTo(x: number, y: number): void {
    this.rec('moveTo', x, y);
  }
  lineTo(x: number, y: number): void {
    this.rec('lineTo', x, y);
  }
  stroke(): void {
    this.rec('stroke');
  }
  fill(): void {
    this.rec('fill');
  }
  fillRect(x: number, y: number, w: number, h: number): void {
    this.rec('fillRect', x, y, w, h);
  }
  strokeRect(x: number, y: number, w: number, h: number): void {
    this.rec('strokeRect', x, y, w, h);
  }
  fillText(text: string, x: number, y: number): void {
    this.rec('fillText', text, x, y);
  }
  closePath(): void {
    this.rec('closePath');
  }
  bezierCurveTo(
    cp1x: number,
    cp1y: number,
    cp2x: number,
    cp2y: number,
    x: number,
    y: number,
  ): void {
    this.rec('bezierCurveTo', cp1x, cp1y, cp2x, cp2y, x, y);
  }
  scale(x: number, y: number): void {
    this.rec('scale', x, y);
  }
  arc(x: number, y: number, r: number, start: number, end: number): void {
    this.rec('arc', x, y, r, start, end);
  }
  rotate(angle: number): void {
    this.rec('rotate', angle);
  }
  measureText(text: string): { width: number } {
    // 概算: 全角 12px / 半角 6px。決定論的。
    let w = 0;
    for (const ch of text) w += ch.charCodeAt(0) > 0xff ? 12 : 6;
    return { width: w };
  }
  setLineDash(segments: number[]): void {
    this.rec('setLineDash', [...segments]);
  }

  /** 指定 op の呼び出し回数。 */
  count(op: string): number {
    return this.calls.filter((c) => c.op === op).length;
  }
  /** 指定 op の呼び出しがあるか。 */
  has(op: string): boolean {
    return this.calls.some((c) => c.op === op);
  }
  /** fillText で描かれた文字列一覧。 */
  texts(): string[] {
    return this.calls.filter((c) => c.op === 'fillText').map((c) => String(c.args[0]));
  }
}
