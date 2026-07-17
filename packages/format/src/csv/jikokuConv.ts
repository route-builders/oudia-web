// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 oudia-second-web contributors
//
// Based on OuDiaSecond (Copyright (C) 2017-2026 diagram_mania)
// and OuDia (Copyright (C) 2006-2017 take-okm)

/**
 * 時刻セルの整形(原典 CdDedJikoku::CConv::encode の忠実移植。
 * origin/DiagramEdit/DiagramEdit/entDed/CdDedJikoku.cpp:126)。
 *
 * ファイル書き出しの `encodeJikoku`(value/jikoku.ts)とは **設定が異なる**ため
 * 流用しない。CSV 出力では時をスペース詰め 2 桁(EHour_ZeroToSpace)、秒表示 ON/OFF、
 * コロン ON/OFF、秒単位丸め(切捨/丸め/切上)+ 着発逆転防止(anti-swap)、24 時表示
 * を扱う。原典の分岐をそのまま移植する。
 */

import type { Jikoku, Seconds } from '../model/basic.js';
import { asSeconds } from '../model/basic.js';
import type { SecondRound } from '../model/enums.js';

const SECONDS_PER_DAY = 86400;
const ROUND_DOWN: SecondRound = 0;
const ROUND: SecondRound = 1;
const ROUND_UP: SecondRound = 2;

/** 原典 CConv::encode の設定。encode_Ekijikoku(CconvJikokuhyouCsv.cpp:201)が構築する値に対応。 */
export interface JikokuConvOptions {
  /** コロンなし(原典 m_bNoColon = !bDisplayColonEkiJikoku)。 */
  readonly noColon: boolean;
  /** 秒を出力するか(原典 m_eSecond == ESecond_Output = bDisplaySecondEkiJikoku)。 */
  readonly outputSecond: boolean;
  /** 着時刻の秒単位処理(原典 m_eSecondRoundChaku)。 */
  readonly secondRoundChaku: SecondRound;
  /** 発時刻の秒単位処理(原典 m_eSecondRoundHatsu)。 */
  readonly secondRoundHatsu: SecondRound;
  /** 0:00 の着時刻を 24:00 と表示するか(原典 m_bDisplay2400)。 */
  readonly display2400: boolean;
}

function normalize(totalSeconds: number): Seconds {
  let s = totalSeconds % SECONDS_PER_DAY;
  if (s < 0) s += SECONDS_PER_DAY;
  return asSeconds(s + 0);
}

function hourOf(j: Seconds): number {
  return Math.floor(j / 3600);
}
function minuteOf(j: Seconds): number {
  return Math.floor((j % 3600) / 60);
}
function secondOf(j: Seconds): number {
  return j % 60;
}

/** `%2d` 相当(EHour_ZeroToSpace)。0〜9 は先頭スペース + 数字、10 以上は 2 桁。 */
function padHourZeroToSpace(iHour: number): string {
  const s = String(iHour);
  return s.length >= 2 ? s : ` ${s}`;
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/**
 * 時刻 → CSV セル文字列(原典 CConv::encode)。
 *
 * @param jikoku       対象時刻(null なら空文字列)
 * @param isChaku      着時刻か(原典 bIsChakuJikoku)。丸め方向と 2400 判定に影響
 * @param referJikoku  逆転防止のための対になる時刻(原典 aCompareJikoku)。null で無効
 */
export function encodeJikokuCsv(
  jikoku: Jikoku,
  isChaku: boolean,
  referJikoku: Jikoku,
  options: JikokuConvOptions,
): string {
  if (jikoku === null) return '';
  const j: Seconds = jikoku;

  const { noColon, outputSecond, secondRoundChaku, secondRoundHatsu, display2400 } = options;

  let strRv = '';

  if (!outputSecond) {
    // ESecond_NoSecond: 秒単位丸め処理を行う(分・時にも波及し得る)。
    let temp: Seconds = j;
    const add = (sec: number): void => {
      temp = normalize(temp + sec);
    };

    if (referJikoku === null) {
      // 原典の演算子優先順位に忠実:&& が || より強く束縛する。
      if (
        (isChaku && secondRoundChaku === ROUND_UP) ||
        (!isChaku && secondRoundHatsu === ROUND_UP)
      ) {
        add(59);
      } else if (
        (isChaku && secondRoundChaku === ROUND) ||
        (!isChaku && secondRoundHatsu === ROUND)
      ) {
        add(30);
      }
    } else {
      const ref: Seconds = referJikoku;
      if (hourOf(j) === hourOf(ref) && minuteOf(j) === minuteOf(ref)) {
        const js = secondOf(j);
        const rs = secondOf(ref);
        if (
          isChaku &&
          secondRoundChaku === ROUND_UP &&
          (secondRoundHatsu === ROUND_DOWN || secondRoundHatsu === ROUND) &&
          js > 0 &&
          js < 30 &&
          rs > 0 &&
          rs < 30
        ) {
          // 着切上・発 切捨/丸め、着発ともに 1-29 秒 → 逆転回避のため着は切捨(処理なし)。
        } else if (
          !isChaku &&
          (secondRoundChaku === ROUND_UP || secondRoundChaku === ROUND) &&
          secondRoundHatsu === ROUND_DOWN &&
          js >= 30 &&
          rs >= 30
        ) {
          // 着 丸め/切上・発切捨、着発ともに 30-59 秒 → 発を切上げて順序維持。
          add(59);
        } else if (
          isChaku &&
          secondRoundChaku === ROUND_UP &&
          secondRoundHatsu === ROUND_DOWN &&
          js > 0 &&
          js < 30 &&
          rs >= 30
        ) {
          // 着 1-29 秒 / 発 30-59 秒 → 秒の平均が 30 以上なら切上、未満なら切捨に統一。
          if (js + rs >= 60) add(59);
        } else if (
          !isChaku &&
          secondRoundChaku === ROUND_UP &&
          secondRoundHatsu === ROUND_DOWN &&
          js >= 30 &&
          rs > 0 &&
          rs < 30
        ) {
          if (js + rs >= 60) add(59);
        } else {
          if (
            (isChaku && secondRoundChaku === ROUND_UP) ||
            (!isChaku && secondRoundHatsu === ROUND_UP)
          ) {
            add(59);
          } else if (
            (isChaku && secondRoundChaku === ROUND) ||
            (!isChaku && secondRoundHatsu === ROUND)
          ) {
            add(30);
          }
        }
      } else {
        // 時分が一致しない → 通常の切上/丸め。
        if (
          (isChaku && secondRoundChaku === ROUND_UP) ||
          (!isChaku && secondRoundHatsu === ROUND_UP)
        ) {
          add(59);
        } else if (
          (isChaku && secondRoundChaku === ROUND) ||
          (!isChaku && secondRoundHatsu === ROUND)
        ) {
          add(30);
        }
      }
    }

    // 時(丸め後の temp から)。
    let iHour = hourOf(temp);
    if (display2400 && isChaku && iHour === 0 && minuteOf(temp) === 0) {
      iHour = 24;
    }
    strRv += padHourZeroToSpace(iHour);
    if (!noColon) strRv += ':';
    strRv += pad2(minuteOf(temp));
  } else {
    // 秒出力あり。時分秒は元の値から取る(丸めなし)。
    let iHour = hourOf(j);
    if (display2400 && isChaku && iHour === 0 && minuteOf(j) === 0) {
      iHour = 24;
    }
    strRv += padHourZeroToSpace(iHour);
    if (!noColon) strRv += ':';
    strRv += pad2(minuteOf(j));
    // ESecond_Output 固定(encode_Ekijikoku は NotIfZero を選ばない)。
    if (!noColon) strRv += ':';
    strRv += pad2(secondOf(j));
  }

  return strRv;
}
