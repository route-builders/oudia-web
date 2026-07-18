// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 up-tri
//
// Based on OuDiaSecond (Copyright (C) 2017-2026 diagram_mania)
// and OuDia (Copyright (C) 2006-2017 take-okm)

/**
 * 時刻表 CSV の書き出し(原典 CconvJikokuhyouCsv::encode + encode_AddRessya のプレーン経路
 * bCustomizeDisplayMode=false の移植。origin/.../ConvJikokuhyouCsv/CconvJikokuhyouCsv.cpp)。
 *
 * 列 = 列車、行 = メタ項目または駅時刻セル、の行列。M2 スコープ:運用(Operation)関連の
 * 行・列と路線外発着ブロックは対象外(iEnableOperation=1、outer 表示 OFF 固定)。ただし
 * 始発駅作業/終着駅作業の**ラベル行は原典が常に 2 行出力する**ため、空セルで整合を保つ。
 */

import {
    ekiIndexOfEkiOrder, getEkiJikoku,
    getSihatsuEki,
    getSyuuchakuEki,
    getValidSihatsuEki,
    getValidSyuuchakuEki,
    isRunBetweenNextEki
} from '@oudia-web/domain';
import type { Eki, EkiJikoku, Jikoku, JikokuConvOptions, Ressya, Ressyahoukou, RosenFileData } from '@oudia-web/format';
import { encodeCsvDocument, encodeJikokuCsv, RESSYAHOUKOU_KUDARI } from '@oudia-web/format';
import { buildColSpec } from './colSpec.js';
import { getEkimeiJikokuhyouRyaku, getTrackRyakusyou, isHatsuChakuHyouji } from './ekiDisplay.js';

// ---- 固定文字列リテラル(原典 DiagramEdit.rc STRINGTABLE、CconvJikokuhyouCsv.cpp)----
const NAME_FILE_TYPE = 'FileType';
const NAME_FILE_TYPE_VALUE = 'OuDiaSecond.JikokuhyouCsv.2';
const NAME_KUDARI = '下り';
const NAME_NOBORI = '上り';
const NAME_RESSYABANGOU = '列車番号';
const NAME_RESSYASYUBETSU = '列車種別';
const NAME_RESSYAMEI = '列車名';
const NAME_GOUSUU = '号数';
const NAME_GOU = '号';
const NAME_BIKOU = '備考';
const NAME_CHAKU = '着';
const NAME_HATSU = '発';
const NAME_TRACK = '番線';
const NAME_SHIHATSU_EKIMEI = '始発駅';
const NAME_OPERATION_SHIHATSU = '始発駅作業';
const NAME_SHUCHAKU_EKIMEI = '終着駅';
const NAME_OPERATION_SHUCHAKU = '終着駅作業';
const NAME_TSUUKA = ' ﾚ'; // U+0020 + 半角カタカナ ﾚ (U+FF9A)
const NAME_KEIYUNASI = '||';

/** 時刻表 CSV の表示オプション(M2 プレーン経路)。 */
export interface TimetableCsvOptions {
  /** 通過駅時刻を表示するか(既定 true)。 */
  readonly displayTsuukaEkiJikoku: boolean;
  /** 秒を表示するか。 */
  readonly displaySecondEkiJikoku: boolean;
  /** コロンを表示するか。 */
  readonly displayColonEkiJikoku: boolean;
  /** 親種別で置換するか。 */
  readonly displayParentSyubetsu: boolean;
  /** 列車名/号数/号 行を出すか(既定 true。DispProp.displayRessyamei)。 */
  readonly displayRessyamei: boolean;
  /** 着時刻の秒単位処理(DispProp.secondRoundChaku)。 */
  readonly secondRoundChaku: 0 | 1 | 2;
  /** 発時刻の秒単位処理(DispProp.secondRoundHatsu)。 */
  readonly secondRoundHatsu: 0 | 1 | 2;
  /** 0:00 着を 24:00 表示するか(DispProp.display2400)。 */
  readonly display2400: boolean;
}

/** DispProp から表示オプションの既定を組み立てる。 */
export function defaultTimetableCsvOptions(data: RosenFileData): TimetableCsvOptions {
  return {
    displayTsuukaEkiJikoku: true,
    displaySecondEkiJikoku: false,
    displayColonEkiJikoku: false,
    displayParentSyubetsu: false,
    displayRessyamei: data.dispProp.displayRessyamei,
    secondRoundChaku: data.dispProp.secondRoundChaku,
    secondRoundHatsu: data.dispProp.secondRoundHatsu,
    display2400: data.dispProp.display2400,
  };
}

export interface BuildTimetableCsvParams {
  readonly diaIndex: number;
  readonly houkou: Ressyahoukou;
  /** 先頭列車 index(既定 0)。 */
  readonly ressyaIndex?: number;
  /** 列車数(省略 = 末尾まで)。 */
  readonly ressyaCount?: number;
  readonly options: TimetableCsvOptions;
}

export type BuildTimetableCsvResult =
  { readonly ok: true; readonly csv: string } | { readonly ok: false; readonly code: -1 | -2 | -3 };

/** 種別略称(親種別置換つき。原典 CconvJikokuhyouCsv.cpp:834-842,895-897)。 */
function ryakusyouWithParent(data: RosenFileData, ressya: Ressya, displayParent: boolean): string {
  const cont = data.rosen.ressyasyubetsuCont;
  let s = cont[ressya.syubetsuIndex];
  if (s === undefined) return '';
  if (displayParent && s.parentSyubetsuIndex !== null) {
    const parent = cont[s.parentSyubetsuIndex];
    if (parent !== undefined) s = parent;
  }
  return s.ryakusyou;
}

/** encode_Ekijikoku 相当(停車/通過セル。通過は末尾に "?" を付す)。 */
function encodeEkijikokuCell(
  atsukai: 'teisya' | 'tsuuka',
  jikoku: Jikoku,
  isChaku: boolean,
  refer: Jikoku,
  conv: JikokuConvOptions,
): string {
  const s = encodeJikokuCsv(jikoku, isChaku, refer, conv);
  return atsukai === 'tsuuka' ? `${s}?` : s;
}

/**
 * ReferJikoku(逆転防止の対時刻)を求める(原典 CconvJikokuhyouCsv.cpp:1259-1287)。
 * `!displaySecond && roundChaku==2 && roundHatsu<=1` のときだけ計算する。M2 では運行ギャップを
 * 跨ぐ探索は稀にしか発火しないが、同駅の発時刻取得までは忠実に再現する。
 */
function computeRefer(ressya: Ressya, iEkiOrder: number, opt: TimetableCsvOptions): Jikoku {
  if (opt.displaySecondEkiJikoku) return null;
  if (!(opt.secondRoundChaku === 2 && opt.secondRoundHatsu <= 1)) return null;
  const validSyuuchaku = getValidSyuuchakuEki(ressya);
  if (!(iEkiOrder < validSyuuchaku && validSyuuchaku !== -1)) return null;
  if (isRunBetweenNextEki(ressya, iEkiOrder)) {
    return getEkiJikoku(ressya, iEkiOrder).hatsuJikoku;
  }
  // 運行ギャップを跨ぐ探索は M2 の分岐/環状同一群判定を伴うため保守的に無効化する。
  return null;
}

/**
 * 時刻表 CSV を組み立てる。列車を列に、メタ項目・駅時刻を行に配置する。
 */
export function buildTimetableCsv(
  data: RosenFileData,
  params: BuildTimetableCsvParams,
): BuildTimetableCsvResult {
  const { rosen } = data;
  const dia = rosen.diaCont[params.diaIndex];
  if (dia === undefined) return { ok: false, code: -1 };

  const houkou = params.houkou;
  const opt = params.options;
  const ekiCont = rosen.ekiCont;
  const ekiCount = ekiCont.length;

  const allRessya = dia.ressyaCont[houkou];
  const start = params.ressyaIndex ?? 0;
  if (!(start >= 0 && start <= allRessya.length)) return { ok: false, code: -2 };
  const count = params.ressyaCount ?? allRessya.length - start;
  if (count < 0) return { ok: false, code: -3 };
  const ressyaList = allRessya.slice(start, start + count);

  const colSpec = buildColSpec(ekiCont, houkou);

  const conv: JikokuConvOptions = {
    noColon: !opt.displayColonEkiJikoku,
    outputSecond: opt.displaySecondEkiJikoku,
    secondRoundChaku: opt.secondRoundChaku,
    secondRoundHatsu: opt.secondRoundHatsu,
    display2400: opt.display2400,
  };

  // ---- 行を左ラベルで初期化(各行への参照を直接保持して追記する)----
  const rows: string[][] = [];
  const add = (cells: string[]): string[] => {
    rows.push(cells);
    return cells;
  };

  add([NAME_FILE_TYPE, NAME_FILE_TYPE_VALUE]); // 0
  add([dia.name]); // 1
  add([houkou === RESSYAHOUKOU_KUDARI ? NAME_KUDARI : NAME_NOBORI]); // 2
  add([]); // 3 空行

  // 左ラベル行(各列車が 1 セルずつ追記する)。
  const rowRessyabangou = add([NAME_RESSYABANGOU, '']);
  const rowSyubetsu = add([NAME_RESSYASYUBETSU, '']);

  let rowRessyamei: string[] | null = null;
  let rowGousuu: string[] | null = null;
  let rowGou: string[] | null = null;
  if (opt.displayRessyamei) {
    rowRessyamei = add([NAME_RESSYAMEI, '']);
    rowGousuu = add([NAME_GOUSUU, '']);
    rowGou = add(['', '']);
  }

  const rowShihatsuEkimei = add([NAME_SHIHATSU_EKIMEI, '']);
  // 始発駅作業(原典は常に 2 行。M2 では中身は空)。
  const rowShihatsuOp1 = add([NAME_OPERATION_SHIHATSU, '']);
  const rowShihatsuOp2 = add(['', '']);

  const rowShuchakuEkimei = add([NAME_SHUCHAKU_EKIMEI, '']);
  const rowShuchakuOp1 = add([NAME_OPERATION_SHUCHAKU, '']);
  const rowShuchakuOp2 = add(['', '']);

  // 駅時刻ブロック(colSpec 順)。各行への参照を保持する。
  const colRows: string[][] = colSpec.map((spec) => {
    const eki = ekiCont[ekiIndexOfEkiOrder(spec.ekiOrder, ekiCount, houkou)];
    const label =
      spec.type === 'chaku' ? NAME_CHAKU : spec.type === 'hatsu' ? NAME_HATSU : NAME_TRACK;
    return add([eki?.ekimei ?? '', label]);
  });

  const rowBikou = add([NAME_BIKOU, '']);

  // ---- 各列車のセルを追記 ----
  for (const ressya of ressyaList) {
    appendRessya(ressya);
  }

  return { ok: true, csv: encodeCsvDocument(rows) };

  function appendRessya(ressya: Ressya): void {
    if (ressya.isNull) {
      appendNull();
      return;
    }
    rowRessyabangou.push(ressya.ressyabangou);
    rowSyubetsu.push(ryakusyouWithParent(data, ressya, opt.displayParentSyubetsu));
    if (rowRessyamei !== null && rowGousuu !== null && rowGou !== null) {
      rowRessyamei.push(ressya.ressyamei);
      rowGousuu.push(ressya.gousuu);
      rowGou.push(ressya.gousuu !== '' ? NAME_GOU : '');
    }

    const validSihatsu = getValidSihatsuEki(ressya);
    rowShihatsuEkimei.push(validSihatsu !== -1 ? ekimeiRyakuOf(validSihatsu) : '');
    rowShihatsuOp1.push('');
    rowShihatsuOp2.push('');

    const validSyuuchaku = getValidSyuuchakuEki(ressya);
    rowShuchakuEkimei.push(validSyuuchaku !== -1 ? ekimeiRyakuOf(validSyuuchaku) : '');
    rowShuchakuOp1.push('');
    rowShuchakuOp2.push('');

    const sihatsu = getSihatsuEki(ressya);
    const syuuchaku = getSyuuchakuEki(ressya);

    colSpec.forEach((spec, c) => {
      const iEkiOrder = spec.ekiOrder;
      const eki = ekiCont[ekiIndexOfEkiOrder(iEkiOrder, ekiCount, houkou)];
      const ej = getEkiJikoku(ressya, iEkiOrder);
      let text = '';
      if (eki !== undefined) {
        if (spec.type === 'chaku') {
          text = chakuCell(ressya, ej, iEkiOrder, sihatsu, syuuchaku, eki);
        } else if (spec.type === 'hatsu') {
          text = hatsuCell(ressya, ej, iEkiOrder, sihatsu, syuuchaku, eki);
        } else {
          text = trackCell(ej, iEkiOrder, sihatsu, syuuchaku, eki);
        }
      }
      colRows[c]?.push(text);
    });

    rowBikou.push(ressya.bikou);
  }

  function ekimeiRyakuOf(ekiOrder: number): string {
    const eki = ekiCont[ekiIndexOfEkiOrder(ekiOrder, ekiCount, houkou)];
    return eki === undefined ? '' : getEkimeiJikokuhyouRyaku(eki);
  }

  function appendNull(): void {
    // Null 列車は各左ラベル行・各駅時刻列・備考に空セルを追記する(整合維持)。
    rowRessyabangou.push('');
    rowSyubetsu.push('');
    if (rowRessyamei !== null && rowGousuu !== null && rowGou !== null) {
      rowRessyamei.push('');
      rowGousuu.push('');
      rowGou.push('');
    }
    rowShihatsuEkimei.push('');
    rowShihatsuOp1.push('');
    rowShihatsuOp2.push('');
    rowShuchakuEkimei.push('');
    rowShuchakuOp1.push('');
    rowShuchakuOp2.push('');
    for (const row of colRows) row.push('');
    rowBikou.push('');
  }

  function chakuCell(
    ressya: Ressya,
    ej: EkiJikoku,
    iEkiOrder: number,
    sihatsu: number,
    syuuchaku: number,
    eki: Eki,
  ): string {
    let text = '';
    switch (ej.ekiatsukai) {
      case 'none':
        // outer 表示 OFF の M2 では、運行範囲の内側(始発 < i < 終着)のみ経由なし。
        if (iEkiOrder > sihatsu && sihatsu !== -1 && iEkiOrder < syuuchaku) {
          text = NAME_KEIYUNASI;
        }
        break;
      case 'tsuuka':
        if (ej.chakuJikoku !== null && opt.displayTsuukaEkiJikoku) {
          const refer = computeRefer(ressya, iEkiOrder, opt);
          text = encodeEkijikokuCell('tsuuka', ej.chakuJikoku, true, refer, conv);
        } else {
          text = NAME_TSUUKA;
        }
        break;
      case 'teisya':
        if (ej.chakuJikoku !== null) {
          const refer = computeRefer(ressya, iEkiOrder, opt);
          text = encodeEkijikokuCell('teisya', ej.chakuJikoku, true, refer, conv);
        }
        break;
    }
    // 発着表示駅 かつ 停車/通過 かつ 着 null かつ 前駅 none かつ 始発 < i → 経由なし。
    text = applyPostSwitchChaku(ressya, ej, iEkiOrder, sihatsu, eki, text);
    return text;
  }

  function applyPostSwitchChaku(
    ressya: Ressya,
    ej: EkiJikoku,
    iEkiOrder: number,
    sihatsu: number,
    eki: Eki,
    text: string,
  ): string {
    const prevIsNone =
      iEkiOrder - 1 >= 0 && getEkiJikoku(ressya, iEkiOrder - 1).ekiatsukai === 'none';
    if (
      isHatsuChakuHyouji(eki.ekijikokukeisiki, houkou) &&
      (ej.ekiatsukai === 'teisya' || ej.ekiatsukai === 'tsuuka') &&
      ej.chakuJikoku === null &&
      prevIsNone &&
      sihatsu < iEkiOrder
    ) {
      return NAME_KEIYUNASI;
    }
    return text;
  }

  function hatsuCell(
    ressya: Ressya,
    ej: EkiJikoku,
    iEkiOrder: number,
    sihatsu: number,
    syuuchaku: number,
    eki: Eki,
  ): string {
    let text = '';
    switch (ej.ekiatsukai) {
      case 'none':
        if (iEkiOrder > sihatsu && sihatsu !== -1 && iEkiOrder < syuuchaku) {
          text = NAME_KEIYUNASI;
        }
        break;
      case 'tsuuka':
        if (ej.hatsuJikoku !== null && opt.displayTsuukaEkiJikoku) {
          text = encodeEkijikokuCell('tsuuka', ej.hatsuJikoku, false, null, conv);
        } else {
          text = NAME_TSUUKA;
        }
        break;
      case 'teisya':
        if (ej.hatsuJikoku !== null) {
          text = encodeEkijikokuCell('teisya', ej.hatsuJikoku, false, null, conv);
        }
        break;
    }
    // 発着表示駅 かつ 停車/通過 かつ 発 null かつ 次駅 none かつ 終着 > i → 経由なし。
    const nextIsNone =
      iEkiOrder + 1 < ekiCount && getEkiJikoku(ressya, iEkiOrder + 1).ekiatsukai === 'none';
    if (
      isHatsuChakuHyouji(eki.ekijikokukeisiki, houkou) &&
      (ej.ekiatsukai === 'teisya' || ej.ekiatsukai === 'tsuuka') &&
      ej.hatsuJikoku === null &&
      nextIsNone &&
      syuuchaku > iEkiOrder
    ) {
      text = NAME_KEIYUNASI;
    }
    return text;
  }

  function trackCell(
    ej: EkiJikoku,
    iEkiOrder: number,
    sihatsu: number,
    syuuchaku: number,
    eki: Eki,
  ): string {
    if (ej.ekiatsukai === 'none') {
      if (iEkiOrder > sihatsu && sihatsu !== -1 && iEkiOrder < syuuchaku) {
        return NAME_KEIYUNASI;
      }
      return '';
    }
    if (ej.ressyaTrackIndex === null) return '';
    const track = eki.ekiTrack2Cont[ej.ressyaTrackIndex];
    if (track === undefined) return '';
    return getTrackRyakusyou(track, houkou);
  }
}
