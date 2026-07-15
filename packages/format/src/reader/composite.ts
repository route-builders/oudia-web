// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 oudia-second-web contributors
//
// Based on OuDiaSecond (Copyright (C) 2017-2026 diagram_mania)
// and OuDia (Copyright (C) 2006-2017 take-okm)

/**
 * Eki の複合値プロパティ(カンマ連結)の decode/encode(analysis §03 §5.2)。
 * JikokuhyouJikokuDisplay("着,発")、JikokuhyouSyubetsuChangeDisplay(5 値)、
 * JikokuhyouOuterDisplay("始発,終着")、DiagramTrackOmit(番線数分の 0/1)。
 */

import type { JikokuDisplay, OuterDisplay, SyubetsuChangeDisplay } from '../model/entities.js';

function clampInt(value: string | undefined, fallback: number, min: number, max: number): number {
  if (value === undefined || value === '') return fallback;
  const n = Number.parseInt(value, 10);
  if (Number.isNaN(n) || n < min || n > max) return fallback;
  return n;
}

/** "着,発"(各 0/1)。既定 両方 true。範囲外・非数 → 1。 */
export function decodeJikokuDisplay(value: string | undefined): JikokuDisplay {
  if (value === undefined || value === '') return { chaku: true, hatsu: true };
  const parts = value.split(',');
  const read = (s: string | undefined): boolean => {
    if (s === undefined || s === '') return true;
    const n = Number.parseInt(s, 10);
    if (Number.isNaN(n) || n < 0 || n > 1) return true;
    return n === 1;
  };
  return { chaku: read(parts[0]), hatsu: read(parts[1]) };
}

export function encodeJikokuDisplay(d: JikokuDisplay): string {
  return `${d.chaku ? '1' : '0'},${d.hatsu ? '1' : '0'}`;
}

/** "a,b,c,d,e" の 5 値。既定 0,0,0,0,1。 */
export function decodeSyubetsuChangeDisplay(value: string | undefined): SyubetsuChangeDisplay {
  const parts = value === undefined || value === '' ? [] : value.split(',');
  return {
    ressyabangou: clampInt(parts[0], 0, 0, 3) as 0 | 1 | 2 | 3,
    operationNumber: clampInt(parts[1], 0, 0, 4) as 0 | 1 | 2 | 3 | 4,
    syubetsu: clampInt(parts[2], 0, 0, 3) as 0 | 1 | 2 | 3,
    ressyamei: clampInt(parts[3], 0, 0, 3) as 0 | 1 | 2 | 3,
    operationNumberRows: clampInt(parts[4], 1, 1, 5) as 1 | 2 | 3 | 4 | 5,
  };
}

export function encodeSyubetsuChangeDisplay(d: SyubetsuChangeDisplay): string {
  return [d.ressyabangou, d.operationNumber, d.syubetsu, d.ressyamei, d.operationNumberRows].join(
    ',',
  );
}

/** "始発,終着"(各 0/1)。既定 0,0。 */
export function decodeOuterDisplay(value: string | undefined): OuterDisplay {
  const parts = value === undefined || value === '' ? [] : value.split(',');
  const read = (s: string | undefined): boolean => s === '1';
  return { origin: read(parts[0]), terminal: read(parts[1]) };
}

export function encodeOuterDisplay(d: OuterDisplay): string {
  return `${d.origin ? '1' : '0'},${d.terminal ? '1' : '0'}`;
}

/** DiagramTrackOmit: 番線数分の 0/1 カンマ連結。不足分は false。 */
export function decodeTrackOmit(value: string | undefined, trackCount: number): boolean[] {
  const result: boolean[] = [];
  const parts = value === undefined || value === '' ? [] : value.split(',');
  for (let i = 0; i < trackCount; i++) {
    result.push(parts[i] === '1');
  }
  return result;
}

export function encodeTrackOmit(omit: boolean[]): string {
  return omit.map((b) => (b ? '1' : '0')).join(',');
}
