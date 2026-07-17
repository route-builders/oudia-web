// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 oudia-second-web contributors
//
// Based on OuDiaSecond (Copyright (C) 2017-2026 diagram_mania)
// and OuDia (Copyright (C) 2006-2017 take-okm)

/**
 * 駅時刻表(発車標)のビューモデル導出(原典 CWndDcdGridEkiJikokuhyouList のプレーン版)。
 *
 * 1 駅 1 方向の発車内容を「発車時刻の時」でバケットへ振り分ける純関数。CSV 書き出し
 * (csv/ekiTimetableCsv.ts)と M1 の Canvas 駅時刻表ビューが共有する。運用連結(種別変更列・
 * 路線外終着など)は M7 スコープなので、各列車を単純に 1 エントリへ展開する。
 */

import type { Dia, RosenFileData, Ressya, Ressyahoukou } from '@oudia/format';
import { getSyuuchakuEki, getValidSihatsuEki, getValidSyuuchakuEki } from '../csv/runRange.js';

/** 1 列車ぶんの発車内容(原典 EkiJikokuhyouContent のプレーン版サブセット)。 */
export interface EkiJikokuhyouContent {
  /** 発車分(0–59)。 */
  readonly minute: number;
  readonly syubetsuIndex: number;
  /** 終着駅Order(方向基準。-1=環状 / -2=環状線)。プレーン版は getValidSyuuchakuEki の値。 */
  readonly syuuchakuEkiOrder: number;
  readonly ressyaTrackIndex: number | null;
  /** 当駅始発か(getValidSihatsuEki === 当駅Order)。 */
  readonly isShihatsu: boolean;
}

/** 駅時刻表ビューモデル(時バケット + 対象駅/方向)。 */
export interface EkiJikokuhyouViewModel {
  readonly houkou: Ressyahoukou;
  /** 対象駅の駅Order(方向基準)。 */
  readonly ekiOrder: number;
  /** 時(0–23)→ その時に発車する列車の内容(発車分の昇順)。 */
  readonly buckets: ReadonlyMap<number, readonly EkiJikokuhyouContent[]>;
}

/** 終着駅Order(プレーン版は getValidSyuuchakuEki。-1/-2 の環状ケースは M7)。 */
function syuuchakuOrderOf(ressya: Ressya): number {
  return getValidSyuuchakuEki(ressya);
}

function insertSorted(
  buckets: Map<number, EkiJikokuhyouContent[]>,
  hour: number,
  content: EkiJikokuhyouContent,
): void {
  let list = buckets.get(hour);
  if (list === undefined) {
    list = [];
    buckets.set(hour, list);
  }
  let i = 0;
  while (i < list.length && (list[i]?.minute ?? Infinity) <= content.minute) i++;
  list.splice(i, 0, content);
}

/**
 * 対象駅・方向の発車内容を時バケットへ導出する。
 *   除外規則: 運休 / 隠し種別(disableHiddenSyubetsu なら除外しない)/ 当駅非停車 /
 *   発時刻 null / 当駅止まり(getSyuuchakuEki <= 当駅Order)。バケット内は発車分の昇順。
 */
export function deriveEkiJikokuhyou(
  data: RosenFileData,
  dia: Dia,
  houkou: Ressyahoukou,
  ekiOrder: number,
): EkiJikokuhyouViewModel {
  const buckets = new Map<number, EkiJikokuhyouContent[]>();
  const cont = dia.ressyaCont[houkou];
  for (const ressya of cont) {
    if (ressya.isNull) continue;
    if (ressya.isCanceled) continue;
    const syubetsu = data.rosen.ressyasyubetsuCont[ressya.syubetsuIndex];
    if (syubetsu !== undefined && syubetsu.hidden && !data.rosen.disableHiddenSyubetsu) continue;
    const ej = ressya.ekiJikokuCont[ekiOrder];
    if (ej === undefined) continue;
    if (ej.ekiatsukai !== 'teisya') continue;
    if (ej.hatsuJikoku === null) continue;
    // 当駅止まり(この先へ運行しない)を除外。
    if (getSyuuchakuEki(ressya) <= ekiOrder) continue;

    const total = ej.hatsuJikoku;
    const hour = Math.floor(total / 3600) % 24;
    const minute = Math.floor((total % 3600) / 60);
    insertSorted(buckets, hour, {
      minute,
      syubetsuIndex: ressya.syubetsuIndex,
      syuuchakuEkiOrder: syuuchakuOrderOf(ressya),
      ressyaTrackIndex: ej.ressyaTrackIndex,
      isShihatsu: getValidSihatsuEki(ressya) === ekiOrder,
    });
  }
  return { houkou, ekiOrder, buckets };
}
