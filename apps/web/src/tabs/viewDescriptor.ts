// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 up-tri

/**
 * ビュー記述子(architecture §4.5)。1 ビュー = 1 記述子。同一記述子は二重に開かない
 * (キーで dedup)。M1 は読み取り専用の 3 ビュー(ダイヤグラム/時刻表/駅時刻表)。
 */

/** ダイヤグラムビュー(1 ダイヤ)。 */
export interface DiagramDescriptor {
  readonly type: 'diagram';
  readonly diaIndex: number;
}

/** 時刻表ビュー(1 ダイヤ × 1 方向)。 */
export interface TimetableDescriptor {
  readonly type: 'timetable';
  readonly diaIndex: number;
  readonly houkou: 0 | 1;
}

/** 駅時刻表ビュー(1 ダイヤ × 1 方向 × 1 駅)。 */
export interface EkiJikokuhyouDescriptor {
  readonly type: 'ekiJikokuhyou';
  readonly diaIndex: number;
  readonly houkou: 0 | 1;
  readonly ekiOrder: number;
}

export type ViewDescriptor = DiagramDescriptor | TimetableDescriptor | EkiJikokuhyouDescriptor;

/** 記述子の一意キー(dedup 用)。 */
export function descriptorKey(d: ViewDescriptor): string {
  switch (d.type) {
    case 'diagram':
      return `diagram:${String(d.diaIndex)}`;
    case 'timetable':
      return `timetable:${String(d.diaIndex)}:${String(d.houkou)}`;
    case 'ekiJikokuhyou':
      return `eki:${String(d.diaIndex)}:${String(d.houkou)}:${String(d.ekiOrder)}`;
  }
}

/** タブ表示ラベル。 */
export function descriptorLabel(d: ViewDescriptor, diaName: string, ekimei?: string): string {
  const dir = 'houkou' in d ? (d.houkou === 0 ? '下り' : '上り') : '';
  switch (d.type) {
    case 'diagram':
      return `${diaName} ダイヤグラム`;
    case 'timetable':
      return `${diaName} ${dir}時刻表`;
    case 'ekiJikokuhyou':
      return `${diaName} ${ekimei ?? ''}駅 ${dir}時刻表`;
  }
}
