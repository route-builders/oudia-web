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

/** 駅ビュー(路線全体・行=駅)。M5。路線に 1 つだけ開く。 */
export interface EkiViewDescriptor {
  readonly type: 'ekiView';
}

/** 列車種別ビュー(路線全体・行=種別)。M5。路線に 1 つだけ開く。 */
export interface SyubetsuViewDescriptor {
  readonly type: 'syubetsuView';
}

/** 運用表ビュー(1 ダイヤ × 1 運用番号)。M7d。 */
export interface OperationTableDescriptor {
  readonly type: 'operationTable';
  readonly diaIndex: number;
  readonly operationNumber: string;
}

/**
 * 運用一覧表 / 運用一覧図(1 ダイヤ)。M7d。
 * 設計 §3.6 の「1 ビューモデル + 2 レンダラ」。graphical で表(false)/図(true)を分ける。
 */
export interface AllOperationTableDescriptor {
  readonly type: 'allOperationTable';
  readonly diaIndex: number;
  readonly graphical: boolean;
}

/** 入出区連携コード一覧(1 ダイヤ)。M7d。 */
export interface InOutLinkCodeListDescriptor {
  readonly type: 'inOutLinkCodeList';
  readonly diaIndex: number;
}

export type ViewDescriptor =
  | DiagramDescriptor
  | TimetableDescriptor
  | EkiJikokuhyouDescriptor
  | EkiViewDescriptor
  | SyubetsuViewDescriptor
  | OperationTableDescriptor
  | AllOperationTableDescriptor
  | InOutLinkCodeListDescriptor;

/** 記述子の一意キー(dedup 用)。 */
export function descriptorKey(d: ViewDescriptor): string {
  switch (d.type) {
    case 'diagram':
      return `diagram:${String(d.diaIndex)}`;
    case 'timetable':
      return `timetable:${String(d.diaIndex)}:${String(d.houkou)}`;
    case 'ekiJikokuhyou':
      return `eki:${String(d.diaIndex)}:${String(d.houkou)}:${String(d.ekiOrder)}`;
    case 'ekiView':
      return 'ekiView';
    case 'syubetsuView':
      return 'syubetsuView';
    case 'operationTable':
      return `operationTable:${String(d.diaIndex)}:${d.operationNumber}`;
    case 'allOperationTable':
      return `allOperationTable:${String(d.diaIndex)}:${d.graphical ? 'g' : 't'}`;
    case 'inOutLinkCodeList':
      return `inOutLinkCodeList:${String(d.diaIndex)}`;
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
    case 'ekiView':
      return '駅';
    case 'syubetsuView':
      return '列車種別';
    case 'operationTable':
      return `${diaName} 運用表 ${d.operationNumber}`;
    case 'allOperationTable':
      return `${diaName} ${d.graphical ? '運用一覧図' : '運用一覧表'}`;
    case 'inOutLinkCodeList':
      return `${diaName} 入出区連携コード一覧`;
  }
}

/**
 * 記述子がまだ有効か(構造編集で駅数・ダイヤ数が変わった後のタブ整合検証)。
 * 無効なタブ(削除・範囲外のダイヤ/駅を指すもの)はストア購読側が閉じる(design §4.5)。
 */
export function isDescriptorValid(d: ViewDescriptor, diaCount: number, ekiCount: number): boolean {
  switch (d.type) {
    case 'diagram':
    case 'timetable':
      return d.diaIndex >= 0 && d.diaIndex < diaCount;
    case 'ekiJikokuhyou':
      return d.diaIndex >= 0 && d.diaIndex < diaCount && d.ekiOrder >= 0 && d.ekiOrder < ekiCount;
    case 'ekiView':
    case 'syubetsuView':
      return true; // 路線単位ビューは常に有効
    case 'operationTable':
    case 'allOperationTable':
    case 'inOutLinkCodeList':
      return d.diaIndex >= 0 && d.diaIndex < diaCount;
  }
}
