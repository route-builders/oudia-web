// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 oudia-second-web contributors
//
// Based on OuDiaSecond (Copyright (C) 2017-2026 diagram_mania)
// and OuDia (Copyright (C) 2006-2017 take-okm)

/**
 * EkiJikoku(駅時刻)1 要素のスキャナ(file-io §3.5、analysis §03 §6.2)。
 * 原典 CconvCentDed::CentDedEkiJikoku_From_string / _To_string の忠実移植。**逐次スキャン**。
 *
 * 1 要素の文法: `駅扱[;着時刻/発時刻][$番線Index]`。運行なしは要素全体が空文字列。
 * 1 列車分の値は「駅Order 0(方向別先頭駅)〜終着駅」のカンマ連結(始発前は空要素、
 * 終着より後は出力しない)。カンマ分割・start/terminal 範囲はリーダーが担う。
 */

import type { Ekiatsukai } from '../model/enums.js';
import type { Jikoku } from '../model/basic.js';
import { decodeJikoku, encodeJikoku, isJikokuDecodeError } from './jikoku.js';

/** decode 結果(駅扱 + 着発 + 番線)。番線は範囲補正済み。 */
export interface DecodedEkiJikoku {
  ekiatsukai: Ekiatsukai;
  chakuJikoku: Jikoku;
  hatsuJikoku: Jikoku;
  ressyaTrackIndex: number;
}

/** 駅扱コード(0/1/2)→ Ekiatsukai。旧世代リーダーと共有する。 */
export const EKIATSUKAI_BY_CODE: Record<number, Ekiatsukai> = {
  0: 'none',
  1: 'teisya',
  2: 'tsuuka',
};

function ekiatsukaiToCode(a: Ekiatsukai): number {
  return a === 'teisya' ? 1 : a === 'tsuuka' ? 2 : 0;
}

/** 時刻を寛容に読む(decode エラー時は null 扱い。原典は CdDedJikoku(str) で Null に落ちる)。 */
export function readJikokuLenient(s: string): Jikoku {
  if (s === '') return null;
  const r = decodeJikoku(s);
  if (isJikokuDecodeError(r)) return null;
  return r;
}

/**
 * EkiJikoku 1 要素を decode する。
 * @param ekiTrack2Count その駅の番線数
 * @param mainTrack その駅・方向の主本線 index(範囲外番線の補正先)
 *
 * 原典ロジック: 最初の `;` で駅扱と時刻部を分離。時刻部に `/` があれば前=着・後=発、
 * なければ全体=発。`$` 以降が番線。`;` が無くても `$` があれば駅扱+番線。
 * 駅扱 0..2 の範囲外(旧 3 = 経由なし含む)→ 0。番線範囲外 → 主本線。
 */
export function decodeEkiJikoku(
  value: string,
  ekiTrack2Count: number,
  mainTrack: number,
): DecodedEkiJikoku {
  let rest = value;
  let strEkiatsukai = '';
  let strChaku = '';
  let strHatsu = '';
  let strTrack = '';

  const semi = rest.indexOf(';');
  if (semi !== -1) {
    strEkiatsukai = rest.slice(0, semi);
    rest = rest.slice(semi + 1);

    const slash = rest.indexOf('/');
    if (slash !== -1) {
      strChaku = rest.slice(0, slash);
      rest = rest.slice(slash + 1);
      const dollar = rest.indexOf('$');
      if (dollar !== -1) {
        strHatsu = rest.slice(0, dollar);
        strTrack = rest.slice(dollar + 1);
      } else {
        strHatsu = rest;
      }
    } else {
      const dollar = rest.indexOf('$');
      if (dollar !== -1) {
        strHatsu = rest.slice(0, dollar);
        strTrack = rest.slice(dollar + 1);
      } else {
        strHatsu = rest;
      }
    }
  } else {
    const dollar = rest.indexOf('$');
    if (dollar !== -1) {
      strEkiatsukai = rest.slice(0, dollar);
      strTrack = rest.slice(dollar + 1);
    } else {
      strEkiatsukai = rest;
    }
  }

  // 駅扱: 空 → 0。0..2 の範囲外(旧 3 含む)→ 0。
  let code = strEkiatsukai === '' ? 0 : Number.parseInt(strEkiatsukai, 10);
  if (Number.isNaN(code) || !(code >= 0 && code < 3)) code = 0;

  // 番線: _ttoi(空 → 0)。範囲外 → 主本線。
  let track = strTrack === '' ? 0 : Number.parseInt(strTrack, 10);
  if (Number.isNaN(track) || track < 0 || track >= ekiTrack2Count) track = mainTrack;

  return {
    ekiatsukai: EKIATSUKAI_BY_CODE[code] ?? 'none',
    chakuJikoku: readJikokuLenient(strChaku),
    hatsuJikoku: readJikokuLenient(strHatsu),
    ressyaTrackIndex: track,
  };
}

/**
 * S05 世代(OuDiaSecond.1.01〜1.05)の EkiJikoku 1 要素を decode する。
 * 原典 CconvCentDedS05 の CentDedEkiJikoku_From_string(S05.cpp:1033-1123)。
 *
 * S05 は `$番線` を持たず、番線は兄弟キー `RessyaTrack=` の対応要素から来る。
 * eki 要素の文法は `駅扱[;着時刻/発時刻]`($ なし)。
 *
 * @param ekiElem       EkiJikoku 要素(`駅扱[;着/発]`)
 * @param trackElem     RessyaTrack 要素(1 起点の番線番号。`;` 以降は M1 では無視)。
 *                      対応要素が無い(OOB)場合は空文字列を渡す(→ 主本線)。
 * @param ekiTrack2Size その駅の番線数
 * @param mainTrack     その駅・方向の主本線 index(0 起点。範囲外番線の補正先)
 */
export function decodeEkiJikokuS05(
  ekiElem: string,
  trackElem: string,
  ekiTrack2Size: number,
  mainTrack: number,
): DecodedEkiJikoku {
  // Part A: eki 要素($ なし)。
  let strEkiatsukai = '';
  let strChaku = '';
  let strHatsu = '';
  const semi = ekiElem.indexOf(';');
  if (semi !== -1) {
    strEkiatsukai = ekiElem.slice(0, semi);
    const restA = ekiElem.slice(semi + 1);
    const slash = restA.indexOf('/');
    if (slash !== -1) {
      strChaku = restA.slice(0, slash);
      strHatsu = restA.slice(slash + 1);
    } else {
      strHatsu = restA;
    }
  } else {
    strEkiatsukai = ekiElem;
  }

  // Part B: 番線を trackElem から解決。`;` 以降(始発/終着作業)は M1 では無視。
  const semiT = trackElem.indexOf(';');
  const trackHead = semiT === -1 ? trackElem : trackElem.slice(0, semiT);
  let track: number;
  if (trackHead === '') {
    track = mainTrack;
  } else {
    const n = Number.parseInt(trackHead, 10);
    // 1 起点 → 0 起点。範囲外(0=旧主本線 / n>size / NaN)は主本線。
    track = !Number.isNaN(n) && n >= 1 && n <= ekiTrack2Size ? n - 1 : mainTrack;
  }

  // Part C: 駅扱(旧 3 = 経由なし → none)。
  let code = strEkiatsukai === '' ? 0 : Number.parseInt(strEkiatsukai, 10);
  if (Number.isNaN(code) || !(code >= 0 && code < 3)) code = 0;

  return {
    ekiatsukai: EKIATSUKAI_BY_CODE[code] ?? 'none',
    chakuJikoku: readJikokuLenient(strChaku),
    hatsuJikoku: readJikokuLenient(strHatsu),
    ressyaTrackIndex: track,
  };
}

/**
 * EkiJikoku 1 要素を encode する(原典 CentDedEkiJikoku_To_string)。
 *   駅扱≠none のとき駅扱数字を出力 → 着 or 発が非 null なら `;`(着が非 null なら `着/`、
 *   続けて発)→ 駅扱≠none なら常に `$番線`。運行なし(none)は空文字列。
 */
export function encodeEkiJikoku(e: DecodedEkiJikoku): string {
  if (e.ekiatsukai === 'none') return '';

  let out = String(ekiatsukaiToCode(e.ekiatsukai));
  const chaku = encodeJikoku(e.chakuJikoku);
  const hatsu = encodeJikoku(e.hatsuJikoku);
  if (chaku !== '' || hatsu !== '') {
    out += ';';
    if (chaku !== '') {
      out += chaku + '/';
    }
    out += hatsu;
  }
  out += '$' + String(e.ressyaTrackIndex);
  return out;
}

/** カンマ連結の EkiJikoku 値を要素配列に分割する(空要素も保持)。 */
export function splitEkiJikokuList(value: string): string[] {
  if (value === '') return [];
  return value.split(',');
}
