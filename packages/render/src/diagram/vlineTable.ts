// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 up-tri
//
// Based on OuDiaSecond (Copyright (C) 2017-2026 diagram_mania)
// and OuDia (Copyright (C) 2006-2017 take-okm)

/**
 * 縦罫線(時刻グリッド)の 8 択固定テーブル(原典 m_arVline。design/06_rendering §1.2)。
 * pitch = 細点線、middlePitch = 実線、boldPitch = 太線の各周期(秒)。
 */

export interface VlinePitch {
  /** 細点線の周期(秒)。 */
  readonly pitch: number;
  /** 実線の周期(秒)。 */
  readonly middlePitch: number;
  /** 太線の周期(秒)。 */
  readonly boldPitch: number;
}

const M = 60; // 1 分(秒)

/** 8 択テーブル(mode 0..7)。既定は mode 1(2 分目)。 */
export const VLINE_TABLE: readonly VlinePitch[] = [
  { pitch: 1 * M, middlePitch: 5 * M, boldPitch: 30 * M }, // 0
  { pitch: 2 * M, middlePitch: 10 * M, boldPitch: 60 * M }, // 1(既定)
  { pitch: 5 * M, middlePitch: 10 * M, boldPitch: 60 * M }, // 2
  { pitch: 10 * M, middlePitch: 30 * M, boldPitch: 60 * M }, // 3
  { pitch: 15 * M, middlePitch: 15 * M, boldPitch: 60 * M }, // 4
  { pitch: 20 * M, middlePitch: 20 * M, boldPitch: 60 * M }, // 5
  { pitch: 30 * M, middlePitch: 30 * M, boldPitch: 60 * M }, // 6
  { pitch: 60 * M, middlePitch: 60 * M, boldPitch: 60 * M }, // 7
];

export const DEFAULT_VLINE_MODE = 1;

/** 縦罫線 1 本の線種。 */
export type VlineStyle = 'bold' | 'solid' | 'dot';

/** 時刻(秒)がどの線種か(太線 > 実線 > 点線の優先)。 */
export function vlineStyleAt(mode: VlinePitch, seconds: number): VlineStyle {
  if (seconds % mode.boldPitch === 0) return 'bold';
  if (seconds % mode.middlePitch === 0) return 'solid';
  return 'dot';
}

/**
 * 表示 X 範囲 [beginSec, endSec] 内の、pitch 倍数の時刻とその線種を列挙する。
 * 開始位置は beginSec 以降の最初の pitch 倍数(design §1.2)。
 */
export function enumVlines(
  mode: VlinePitch,
  beginSec: number,
  endSec: number,
): { seconds: number; style: VlineStyle }[] {
  const out: { seconds: number; style: VlineStyle }[] = [];
  const first = Math.ceil(beginSec / mode.pitch) * mode.pitch;
  for (let s = first; s <= endSec; s += mode.pitch) {
    out.push({ seconds: s, style: vlineStyleAt(mode, s) });
  }
  return out;
}
