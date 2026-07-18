// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 up-tri
//
// Based on OuDiaSecond (Copyright (C) 2017-2026 diagram_mania)
// and OuDia (Copyright (C) 2006-2017 take-okm)

/**
 * 駅時刻表 CSV の書き出し(原典 CconvEkiJikohyouCsv::encode の移植。
 * origin/.../ViewEkiJikokuhyou/CconvEkiJikokuhyouCsv.cpp:178)。
 *
 * 1 駅 1 方向の発車標。発車時刻を「時」でバケットし、各時バケット内で列車を左→右の列に、
 * 種別略称 / 発車分 / 行先略称(+ 番線)を上下に並べる転置レイアウト。運用連結(種別変更列や
 * 路線外終着など)は M7 スコープなので、M2 は各列車を単純に 1 列へ展開する。
 *
 * 直列化はバイト一致のため **UTF-8 BOM + CRLF** で行う(原典 _tfopen_s("w , ccs=UTF-8"))。
 */

import { ekiIndexOfEkiOrder } from '@oudia-web/domain';
import type { Dia, Eki, Ressyahoukou, Rosen, RosenFileData } from '@oudia-web/format';
import { encodeCsvDocument, RESSYAHOUKOU_KUDARI } from '@oudia-web/format';
import type { EkiJikokuhyouContent } from '../ekiJikokuhyou/deriveEkiJikokuhyou.js';
import { deriveEkiJikokuhyou } from '../ekiJikokuhyou/deriveEkiJikokuhyou.js';
import { getEkimeiJikokuhyouRyaku, getTrackRyakusyou } from './ekiDisplay.js';

const NAME_EKI = '駅';
const NAME_JIKOKUHYOU = '時刻表';
const NAME_KUDARI_JIKOKUHYOU = '下り時刻表';
const NAME_NOBORI_JIKOKUHYOU = '上り時刻表';
const NAME_IS_SHIHATSU = '●'; // U+25CF 当駅始発
const NAME_LOOP = '環状'; // iSyuuchakuEkiOrder == -1
const NAME_FOR_LOOP = '環状線'; // iSyuuchakuEkiOrder == -2

export interface EkiTimetableCsvOptions {
  readonly displayParentSyubetsu: boolean;
  /** 番線行を出すか。 */
  readonly displayTrack: boolean;
  /** 当駅始発マーク(●)を出すか。 */
  readonly displayIsShihatsu: boolean;
}

export interface BuildEkiTimetableCsvParams {
  readonly dia: Dia;
  readonly houkou: Ressyahoukou;
  /** 対象駅の駅Order(方向基準)。 */
  readonly ekiOrder: number;
  readonly options: EkiTimetableCsvOptions;
  /** 連結出力の 2 ブロック目以降(直前に空行を 1 行入れる)。 */
  readonly resume?: boolean;
}

/** 種別略称(親種別置換つき)。行先や種別変更で共用。 */
function ryakusyou(data: RosenFileData, syubetsuIndex: number, displayParent: boolean): string {
  const cont = data.rosen.ressyasyubetsuCont;
  let s = cont[syubetsuIndex];
  if (s === undefined) return '';
  if (displayParent && s.parentSyubetsuIndex !== null) {
    const parent = cont[s.parentSyubetsuIndex];
    if (parent !== undefined) s = parent;
  }
  return s.ryakusyou;
}

/** 方向表示ラベル(下り/上り時刻表。ダイヤ別名があればそれ + 時刻表)。 */
function directionLabel(rosen: Rosen, houkou: Ressyahoukou): string {
  if (houkou === RESSYAHOUKOU_KUDARI) {
    return rosen.kudariDiaAlias === ''
      ? NAME_KUDARI_JIKOKUHYOU
      : rosen.kudariDiaAlias + NAME_JIKOKUHYOU;
  }
  return rosen.noboriDiaAlias === ''
    ? NAME_NOBORI_JIKOKUHYOU
    : rosen.noboriDiaAlias + NAME_JIKOKUHYOU;
}

export type BuildEkiTimetableCsvResult =
  | { readonly ok: true; readonly csv: string }
  | { readonly ok: false; readonly code: -1 };

/**
 * 1 駅 1 方向の駅時刻表 CSV ブロックを組み立てる。UTF-8 BOM + CRLF で直列化する。
 */
export function buildEkiTimetableCsv(
  data: RosenFileData,
  params: BuildEkiTimetableCsvParams,
): BuildEkiTimetableCsvResult {
  const { dia, houkou, ekiOrder, options: opt } = params;
  const rosen = data.rosen;
  const ekiCont = rosen.ekiCont;
  const ekiCount = ekiCont.length;
  const eki = ekiCont[ekiIndexOfEkiOrder(ekiOrder, ekiCount, houkou)];
  if (eki === undefined) return { ok: false, code: -1 };

  const { buckets } = deriveEkiJikokuhyou(data, dia, houkou, ekiOrder);
  const rows: string[][] = [];

  if (params.resume === true) rows.push([]); // ブロック区切りの空行

  // タイトル行: "<ダイヤ名> <駅名>駅 <方向ラベル>"
  const title = `${dia.name} ${eki.ekimei}${NAME_EKI} ${directionLabel(rosen, houkou)}`;
  rows.push([title]);

  const hours = [...buckets.keys()];
  if (hours.length > 0) {
    // 時範囲(first..last、内側の空きも埋める)。24 跨ぎラップは normalizedHour で扱う。
    const firstHour = Math.min(...hours);
    const lastHour = Math.max(...hours);
    for (let idx = 0; firstHour + idx <= lastHour; idx++) {
      const normalizedHour = firstHour + idx;
      const list = buckets.get(normalizedHour) ?? [];
      const rowA = [String(normalizedHour)];
      const rowB = [''];
      const rowC = [''];
      const rowD = [''];
      for (const c of list) {
        rowA.push(ryakusyou(data, c.syubetsuIndex, opt.displayParentSyubetsu));
        rowB.push((opt.displayIsShihatsu && c.isShihatsu ? NAME_IS_SHIHATSU : '') + pad2(c.minute));
        rowC.push(destinationLabel(ekiCont, ekiCount, houkou, c));
        if (opt.displayTrack) rowD.push(trackLabel(eki, houkou, c));
      }
      rows.push(rowA, rowB, rowC);
      if (opt.displayTrack) rows.push(rowD);
    }
  }

  return {
    ok: true,
    csv: encodeCsvDocument(rows, { lineEnding: '\r\n', bom: true }),
  };
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function destinationLabel(
  ekiCont: readonly Eki[],
  ekiCount: number,
  houkou: Ressyahoukou,
  c: EkiJikokuhyouContent,
): string {
  if (c.syuuchakuEkiOrder === -1) return NAME_LOOP;
  if (c.syuuchakuEkiOrder === -2) return NAME_FOR_LOOP;
  const dest = ekiCont[ekiIndexOfEkiOrder(c.syuuchakuEkiOrder, ekiCount, houkou)];
  if (dest === undefined) return '';
  return getEkimeiJikokuhyouRyaku(dest);
}

function trackLabel(eki: Eki, houkou: Ressyahoukou, c: EkiJikokuhyouContent): string {
  if (c.ressyaTrackIndex === null) return '';
  const track = eki.ekiTrack2Cont[c.ressyaTrackIndex];
  if (track === undefined) return '';
  return getTrackRyakusyou(track, houkou);
}
