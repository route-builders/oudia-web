// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 up-tri
//
// Based on OuDiaSecond (Copyright (C) 2017-2026 diagram_mania)
// and OuDia (Copyright (C) 2006-2017 take-okm)

/**
 * 文字列リテラルユニオンの列挙。data-model §5。
 * ファイル上の表現(数値 / 識別子文字列)との対応は schema/ 側のテーブルで定義する。
 */

/** 駅扱(原典 EEkiatsukai)。空/0=none, 1=teisya, 2=tsuuka。旧 3(経由なし)は none に変換。 */
export type Ekiatsukai = 'none' | 'teisya' | 'tsuuka';

/** 駅時刻形式(原典 EEkijikokukeisiki)。ファイルは識別子文字列そのもの。 */
export type Ekijikokukeisiki =
  'hatsu' | 'hatsuchaku' | 'kudariChaku' | 'noboriChaku' | 'kudariHatsuchaku' | 'noboriHatsuchaku';

/** 駅規模(原典 EEkikibo)。syuyou は主要駅(ダイヤグラム横罫線が太線)。 */
export type Ekikibo = 'ippan' | 'syuyou';

/**
 * ダイヤグラム列車情報表示(原典 EDiagramRessyajouhouHyouji)。
 * 'origin' が既定で、ファイルではキー自体を出力しない。
 */
export type DiagramRessyajouhouHyouji = 'origin' | 'anytime' | 'not';

/** 線スタイル(原典 ESenStyle)。jissen=実線(既定)。 */
export type SenStyle = 'jissen' | 'hasen' | 'tensen' | 'ittensasen';

/** 停車駅明示(原典 EStopMarkDrawType)。drawOnStop=短時間停車駅に ○(既定)。 */
export type StopMarkDrawType = 'drawOnStop' | 'nothing' | 'drawOnPass';

/** 交差チェックの番線種別(原典 ETrackType)。index の意味が type に依存する(§5.7)。 */
export type TrackType = 'track' | 'origin' | 'terminal' | 'outer';

/** 次列車接続タイプ(原典 後作業 m_iIntData1)。範囲外は 'unrelated' に補正。 */
export type AfterJunctionType = 'unrelated' | 'classChange' | 'propertyChange' | 'propertySame';

/** 秒処理(原典 CdDedJikoku::CConv::ESecondRound)。0=切捨 / 1=丸め / 2=切上。 */
export type SecondRound = 0 | 1 | 2;
