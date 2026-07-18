// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 up-tri
//
// Based on OuDiaSecond (Copyright (C) 2017-2026 diagram_mania)
// and OuDia (Copyright (C) 2006-2017 take-okm)

/**
 * 世代別リーダーのフック(ReaderProfile)。現行世代リーダー(current.ts)を土台に、
 * 旧世代(S05/S00)が差し替える少数の変換点だけをフックとして切り出す。
 *
 * 各フックは任意(省略時は現行世代の挙動)。current.ts は CURRENT_PROFILE(恒等)を既定にする。
 * 世代差の網羅は M1 プランの変換表(S09=現行と同一、S05/S00 は下記フックのみ)に対応する。
 */

import type { Eki, Rosen } from '../model/entities.js';
import type { NodeCursor } from '../node/cursor.js';
import type { DecodedEkiJikoku } from '../value/ekiJikoku.js';
import { decodeEkiJikoku } from '../value/ekiJikoku.js';

export interface ReaderProfile {
  /**
   * DownMain / UpMain の読み方。現行世代は raw(既定 0)。S05 は 1 起点 → 0 起点(−1)、
   * S00 は不読(既定 0 / 1)。
   */
  readMainTracks(cur: NodeCursor): { downMain: number; upMain: number };

  /**
   * EkiJikoku 1 要素の decode。現行/S00 は `$番線` つきの現行デコーダ(trackElem 無視)。
   * S05 は `$` を持たず、番線を trackElem(RessyaTrack= の対応要素)から解決する。
   * @param trackElem RessyaTrack= の対応要素(readsRessyaTrack が true のときのみ意味を持つ)
   */
  decodeEkiJikokuElement(
    ekiElem: string,
    trackElem: string,
    ekiTrack2Count: number,
    mainTrack: number,
  ): DecodedEkiJikoku;

  /** RessyaTrack= 兄弟キーを EkiJikoku と併読するか(S05 のみ true)。 */
  readonly readsRessyaTrack: boolean;

  /**
   * Eki 読取後の補正(任意)。S00 は空 Ekimei→"00"、S00/S05 は keisiki から着発表示・
   * 番線省略フラグを導出する。cur は同一 Eki ノードのカーソル(生値の参照用)。
   */
  fixupEki?(eki: Eki, cur: NodeCursor): Eki;

  /**
   * Rosen 読取後の補正(任意)。S05 は EnableOperation 非空→2。
   * cur は Rosen ノードのカーソル(生値の参照用)。
   */
  fixupRosen?(rosen: Rosen, cur: NodeCursor): Rosen;

  /** Rosen 全体の後処理(任意)。S00 は Kyoukaisen からの分岐駅推定。 */
  postProcess?(rosen: Rosen): Rosen;
}

/** 現行世代(グループ 5)。恒等フック。S09(グループ 4)もこれを使う。 */
export const CURRENT_PROFILE: ReaderProfile = {
  readMainTracks(cur: NodeCursor) {
    return { downMain: intOr0(cur.value('DownMain')), upMain: intOr0(cur.value('UpMain')) };
  },
  decodeEkiJikokuElement(ekiElem, _trackElem, ekiTrack2Count, mainTrack) {
    // 現行/S00 は現行デコーダ($番線 対応。S00 は $ を含まず主本線に落ちる)。
    return decodeEkiJikoku(ekiElem, ekiTrack2Count, mainTrack);
  },
  readsRessyaTrack: false,
};

function intOr0(v: string | undefined): number {
  if (v === undefined || v === '') return 0;
  const n = Number.parseInt(v, 10);
  return Number.isNaN(n) ? 0 : n;
}
