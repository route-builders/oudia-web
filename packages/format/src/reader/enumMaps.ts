// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 up-tri
//
// Based on OuDiaSecond (Copyright (C) 2017-2026 diagram_mania)
// and OuDia (Copyright (C) 2006-2017 take-okm)

/**
 * 列挙値のファイル識別子文字列 ⇄ TS 文字列ユニオンの対応表(data-model §5)。
 */

import type {
    DiagramRessyajouhouHyouji,
    Ekijikokukeisiki,
    Ekikibo,
    SenStyle,
    StopMarkDrawType,
    TrackType,
} from '../model/enums.js';

// ---- Ekijikokukeisiki(駅時刻形式)----
export const EKIJIKOKUKEISIKI_FROM_FILE: Record<string, Ekijikokukeisiki> = {
  Jikokukeisiki_Hatsu: 'hatsu',
  Jikokukeisiki_Hatsuchaku: 'hatsuchaku',
  Jikokukeisiki_KudariChaku: 'kudariChaku',
  Jikokukeisiki_NoboriChaku: 'noboriChaku',
  Jikokukeisiki_KudariHatsuchaku: 'kudariHatsuchaku',
  Jikokukeisiki_NoboriHatsuchaku: 'noboriHatsuchaku',
};
export const EKIJIKOKUKEISIKI_TO_FILE: Record<Ekijikokukeisiki, string> = {
  hatsu: 'Jikokukeisiki_Hatsu',
  hatsuchaku: 'Jikokukeisiki_Hatsuchaku',
  kudariChaku: 'Jikokukeisiki_KudariChaku',
  noboriChaku: 'Jikokukeisiki_NoboriChaku',
  kudariHatsuchaku: 'Jikokukeisiki_KudariHatsuchaku',
  noboriHatsuchaku: 'Jikokukeisiki_NoboriHatsuchaku',
};

// ---- Ekikibo(駅規模)----
export const EKIKIBO_FROM_FILE: Record<string, Ekikibo> = {
  Ekikibo_Ippan: 'ippan',
  Ekikibo_Syuyou: 'syuyou',
};
export const EKIKIBO_TO_FILE: Record<Ekikibo, string> = {
  ippan: 'Ekikibo_Ippan',
  syuyou: 'Ekikibo_Syuyou',
};

// ---- DiagramRessyajouhouHyouji ----
// 'origin' は既定でファイルにキーを出力しない。読込で空/欠落 → 'origin'。
export const DIAGRAM_RESSYAJOUHOU_FROM_FILE: Record<string, DiagramRessyajouhouHyouji> = {
  DiagramRessyajouhouHyouji_Origin: 'origin',
  DiagramRessyajouhouHyouji_Anytime: 'anytime',
  DiagramRessyajouhouHyouji_Not: 'not',
};
export const DIAGRAM_RESSYAJOUHOU_TO_FILE: Record<DiagramRessyajouhouHyouji, string | null> = {
  origin: null, // キーを出力しない
  anytime: 'DiagramRessyajouhouHyouji_Anytime',
  not: 'DiagramRessyajouhouHyouji_Not',
};

// ---- SenStyle(線スタイル)----
export const SENSTYLE_FROM_FILE: Record<string, SenStyle> = {
  SenStyle_Jissen: 'jissen',
  SenStyle_Hasen: 'hasen',
  SenStyle_Tensen: 'tensen',
  SenStyle_Ittensasen: 'ittensasen',
};
export const SENSTYLE_TO_FILE: Record<SenStyle, string> = {
  jissen: 'SenStyle_Jissen',
  hasen: 'SenStyle_Hasen',
  tensen: 'SenStyle_Tensen',
  ittensasen: 'SenStyle_Ittensasen',
};

// ---- StopMarkDrawType(停車駅明示)----
export const STOPMARK_FROM_FILE: Record<string, StopMarkDrawType> = {
  EStopMarkDrawType_DrawOnStop: 'drawOnStop',
  EStopMarkDrawType_Nothing: 'nothing',
  EStopMarkDrawType_DrawOnPass: 'drawOnPass',
};
export const STOPMARK_TO_FILE: Record<StopMarkDrawType, string> = {
  drawOnStop: 'EStopMarkDrawType_DrawOnStop',
  nothing: 'EStopMarkDrawType_Nothing',
  drawOnPass: 'EStopMarkDrawType_DrawOnPass',
};

// ---- TrackType(平面交差の番線種別。数値コード)----
// 原典 ETrackType: 0=駅番線 / 1=起点側 / 2=終点側 / 3=路線外(analysis §03 §5.7)。
export const TRACKTYPE_BY_CODE: Record<number, TrackType> = {
  0: 'track',
  1: 'origin',
  2: 'terminal',
  3: 'outer',
};
export const TRACKTYPE_TO_CODE: Record<TrackType, number> = {
  track: 0,
  origin: 1,
  terminal: 2,
  outer: 3,
};
