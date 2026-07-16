// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 oudia-second-web contributors
//
// Based on OuDiaSecond (Copyright (C) 2017-2026 diagram_mania)
// and OuDia (Copyright (C) 2006-2017 take-okm)

/**
 * 駅の方向別・時刻表表示フラグ(原典 CentDedEkiCont の CdDedEki ビュー構築ロジックの移植)。
 *
 * 原典では方向別 CdDedEki ビューを構築する際、`m_eEkijikokukeisiki` から着/発/番線の
 * 表示可否ブール値を焼き込む(CentDedEkiCont.cpp 下り 229-240 / 上り 424-438)。ここでは
 * その 2 本の論理式を (keisiki, houkou) をキーにした純関数として移植する。
 */

import type { Eki, Ekijikokukeisiki, Ressyahoukou } from '@oudia/format';
import { RESSYAHOUKOU_KUDARI } from '@oudia/format';

/**
 * 着時刻列を表示するか(原典 CdDedEki ctor 引数 2)。
 *   下り: Hatsuchaku | KudariChaku | KudariHatsuchaku
 *   上り: Hatsuchaku | NoboriChaku | NoboriHatsuchaku
 */
export function getChakujikokuHyouji(keisiki: Ekijikokukeisiki, houkou: Ressyahoukou): boolean {
  if (houkou === RESSYAHOUKOU_KUDARI) {
    return keisiki === 'hatsuchaku' || keisiki === 'kudariChaku' || keisiki === 'kudariHatsuchaku';
  }
  return keisiki === 'hatsuchaku' || keisiki === 'noboriChaku' || keisiki === 'noboriHatsuchaku';
}

/**
 * 発時刻列を表示するか(原典 CdDedEki ctor 引数 3)。
 *   下り: Hatsuchaku | Hatsu | NoboriChaku | KudariHatsuchaku | NoboriHatsuchaku
 *   上り: Hatsuchaku | Hatsu | KudariChaku | KudariHatsuchaku | NoboriHatsuchaku
 */
export function getHatsujikokuHyouji(keisiki: Ekijikokukeisiki, houkou: Ressyahoukou): boolean {
  if (houkou === RESSYAHOUKOU_KUDARI) {
    return (
      keisiki === 'hatsuchaku' ||
      keisiki === 'hatsu' ||
      keisiki === 'noboriChaku' ||
      keisiki === 'kudariHatsuchaku' ||
      keisiki === 'noboriHatsuchaku'
    );
  }
  return (
    keisiki === 'hatsuchaku' ||
    keisiki === 'hatsu' ||
    keisiki === 'kudariChaku' ||
    keisiki === 'kudariHatsuchaku' ||
    keisiki === 'noboriHatsuchaku'
  );
}

/** その駅が着発両方を表示するか(原典 isHatsuChakuHyouji = 方向別 chaku && hatsu)。 */
export function isHatsuChakuHyouji(keisiki: Ekijikokukeisiki, houkou: Ressyahoukou): boolean {
  return getChakujikokuHyouji(keisiki, houkou) && getHatsujikokuHyouji(keisiki, houkou);
}

/**
 * 番線列を表示するか(原典プレーン CSV 条件 `getJikokuhyouTrackDisplay() || !getJikokuhyouTrackOmit()`。
 * CdYColSpecCont.cpp:413-415、bCustomizeDisplayMode=false)。
 *
 * ただし CdDedEki ビュー構築時に keisiki で gating される(CentDedEkiCont.cpp):
 * - display: `jikokuhyouTrackDisplay{Kudari|Nobori} && keisiki != {NoboriHatsuchaku|KudariHatsuchaku}`
 * - omit:    `(keisiki == Hatsu || keisiki == 反対方向Hatsuchaku) && jikokuhyouTrackOmit`
 */
export function getTrackDisplay(eki: Eki, houkou: Ressyahoukou): boolean {
  const keisiki = eki.ekijikokukeisiki;
  const display =
    houkou === RESSYAHOUKOU_KUDARI
      ? eki.jikokuhyouTrackDisplayKudari && keisiki !== 'noboriHatsuchaku'
      : eki.jikokuhyouTrackDisplayNobori && keisiki !== 'kudariHatsuchaku';
  const omit =
    houkou === RESSYAHOUKOU_KUDARI
      ? (keisiki === 'hatsu' || keisiki === 'noboriHatsuchaku') && eki.jikokuhyouTrackOmit
      : (keisiki === 'hatsu' || keisiki === 'kudariHatsuchaku') && eki.jikokuhyouTrackOmit;
  return display || !omit;
}

/**
 * 番線略称(原典 CentDedEkiTrack2::getTrackRyakusyou(houkou)。CentDedEkiTrack2.h:150-161)。
 *   上りで trackNoboriRyakusyou 非空ならそれ、さもなくば trackRyakusyou。
 */
export function getTrackRyakusyou(
  track: { trackRyakusyou: string; trackNoboriRyakusyou: string },
  houkou: Ressyahoukou,
): string {
  if (houkou === RESSYAHOUKOU_KUDARI || track.trackNoboriRyakusyou === '') {
    return track.trackRyakusyou;
  }
  return track.trackNoboriRyakusyou;
}

/**
 * 時刻表用駅名略称(原典 getEkimeiJikokuhyouRyaku(true)。CentDedEki.cpp:510-517)。
 *   略称が空なら駅名を返す。
 */
export function getEkimeiJikokuhyouRyaku(eki: Eki): string {
  return eki.ekimeiJikokuRyaku === '' ? eki.ekimei : eki.ekimeiJikokuRyaku;
}
