// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 up-tri
//
// Based on OuDiaSecond (Copyright (C) 2017-2026 diagram_mania)
// and OuDia (Copyright (C) 2006-2017 take-okm)

/**
 * 旧世代(S00/S05)で駅時刻形式(Ekijikokukeisiki)から時刻表の着発表示フラグ・
 * 番線省略フラグを導出する(原典 CconvCentDedS00.cpp:251-302 / CconvCentDedS05.cpp:363-436)。
 *
 * 現行世代はこれらを個別キー(JikokuhyouJikokuDisplayKudari/Nobori 等)として持つが、
 * 旧世代はキーを持たず keisiki から機械的に導出していた。旧世代リーダーが同じ導出を再現する。
 */

import type { JikokuDisplay } from '../model/entities.js';
import type { Ekijikokukeisiki } from '../model/enums.js';

/**
 * keisiki → { 下り, 上り } の着発表示(原典の 4 ブール set*Display の対応)。
 *   下り着 = Hatsuchaku | KudariChaku | KudariHatsuchaku
 *   下り発 = Hatsu | Hatsuchaku | KudariHatsuchaku | NoboriChaku | NoboriHatsuchaku
 *   上り着 = Hatsuchaku | NoboriChaku | NoboriHatsuchaku
 *   上り発 = Hatsu | Hatsuchaku | KudariChaku | KudariHatsuchaku | NoboriHatsuchaku
 */
export function deriveJikokuDisplayFromKeisiki(k: Ekijikokukeisiki): {
  kudari: JikokuDisplay;
  nobori: JikokuDisplay;
} {
  const chakuKudari = k === 'hatsuchaku' || k === 'kudariChaku' || k === 'kudariHatsuchaku';
  const chakuNobori = k === 'hatsuchaku' || k === 'noboriChaku' || k === 'noboriHatsuchaku';
  const hatsuKudari =
    k === 'hatsu' ||
    k === 'hatsuchaku' ||
    k === 'kudariHatsuchaku' ||
    k === 'noboriChaku' ||
    k === 'noboriHatsuchaku';
  const hatsuNobori =
    k === 'hatsu' ||
    k === 'hatsuchaku' ||
    k === 'kudariChaku' ||
    k === 'kudariHatsuchaku' ||
    k === 'noboriHatsuchaku';
  return {
    kudari: { chaku: chakuKudari, hatsu: hatsuKudari },
    nobori: { chaku: chakuNobori, hatsu: hatsuNobori },
  };
}

/**
 * keisiki → 番線省略(原典 Ver2.00.05:「旧ファイル読込時、発時刻のみの駅は番線表示省略 ON」)。
 *   Hatsu | KudariHatsuchaku | NoboriHatsuchaku → true。
 */
export function deriveJikokuhyouTrackOmit(k: Ekijikokukeisiki): boolean {
  return k === 'hatsu' || k === 'kudariHatsuchaku' || k === 'noboriHatsuchaku';
}
