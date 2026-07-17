// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 oudia-second-web contributors
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

import type { Dia, Eki, RosenFileData, Ressya, Ressyahoukou, Rosen } from '@oudia/format';
import { encodeCsvDocument, RESSYAHOUKOU_KUDARI } from '@oudia/format';
import { ekiIndexOfEkiOrder } from '@oudia/domain';
import { getEkimeiJikokuhyouRyaku, getTrackRyakusyou } from './ekiDisplay.js';
import { getValidSihatsuEki, getValidSyuuchakuEki, getSyuuchakuEki } from './runRange.js';

const NAME_EKI = '駅';
const NAME_JIKOKUHYOU = '時刻表';
const NAME_KUDARI_JIKOKUHYOU = '下り時刻表';
const NAME_NOBORI_JIKOKUHYOU = '上り時刻表';
const NAME_IS_SHIHATSU = '●'; // U+25CF 当駅始発
const NAME_LOOP = '環状'; // iSyuuchakuEkiOrder == -1
const NAME_FOR_LOOP = '環状線'; // iSyuuchakuEkiOrder == -2

/** 1 列車ぶんの発車内容(原典 EkiJikokuhyouContent の M2 サブセット)。 */
interface EkiJikokuhyouContent {
  readonly minute: number;
  readonly syubetsuIndex: number;
  /** 終着駅Order(-1=環状 / -2=環状線)。M2 は getValidSyuuchakuEki の値。 */
  readonly syuuchakuEkiOrder: number;
  readonly ressyaTrackIndex: number | null;
  readonly isShihatsu: boolean;
}

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

/**
 * 対象駅・方向の発車内容を時バケットへ導出する(原典 CWndDcdGridEkiJikokuhyouList の
 * プレーン版。運用連結なし)。除外規則:運休 / 隠し種別 / 当駅非停車 / 発時刻 null /
 * 当駅止まり。バケット内は発車分の昇順(挿入ソート)。
 */
function deriveContent(
  data: RosenFileData,
  dia: Dia,
  houkou: Ressyahoukou,
  ekiOrder: number,
): Map<number, EkiJikokuhyouContent[]> {
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
    const content: EkiJikokuhyouContent = {
      minute,
      syubetsuIndex: ressya.syubetsuIndex,
      syuuchakuEkiOrder: syuuchakuOrderOf(ressya),
      ressyaTrackIndex: ej.ressyaTrackIndex,
      isShihatsu: getValidSihatsuEki(ressya) === ekiOrder,
    };
    insertSorted(buckets, hour, content);
  }
  return buckets;
}

/** 終着駅Order(M2 は getValidSyuuchakuEki。-1/-2 の環状ケースは M7)。 */
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

export type BuildEkiTimetableCsvResult =
  { readonly ok: true; readonly csv: string } | { readonly ok: false; readonly code: -1 };

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

  const buckets = deriveContent(data, dia, houkou, ekiOrder);
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
