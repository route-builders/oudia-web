// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 oudia-second-web contributors
//
// Based on OuDiaSecond (Copyright (C) 2017-2026 diagram_mania)
// and OuDia (Copyright (C) 2006-2017 take-okm)

/**
 * S05 世代リーダー(グループ 3、OuDiaSecond.1.01〜1.05)。
 * 原典 CconvCentDedS05。現行世代との差分だけをフック(ReaderProfile)で表現する。
 *
 * 差分(M1 プラン変換表 S05):
 * - D1: DownMain/UpMain は 1 起点 → 0 起点(−1。欠落 → −1)。
 * - D2: 番線は EkiJikoku 内 `$` ではなく兄弟キー RessyaTrack= の対応要素から(1 起点)。
 * - D3: EnableOperation 非空 → 2。
 * - D4: JikokuhyouTrackOmit・着発表示フラグは keisiki から導出(キーを持たない)。
 */

import type { Eki, Rosen } from '../model/entities.js';
import { decodeEkiJikokuS05 } from '../value/ekiJikoku.js';
import type { NodeCursor } from '../node/cursor.js';
import type { ReaderProfile } from './profile.js';
import { deriveJikokuDisplayFromKeisiki, deriveJikokuhyouTrackOmit } from './keisiki.js';

function decrementMain(v: string | undefined): number {
  // 原典: _ttoi(空→0) してから無条件で −1。欠落 → −1。
  const raw = v === undefined || v === '' ? 0 : Number.parseInt(v, 10);
  return (Number.isNaN(raw) ? 0 : raw) - 1;
}

export const S05_PROFILE: ReaderProfile = {
  readMainTracks(cur: NodeCursor) {
    return {
      downMain: decrementMain(cur.value('DownMain')),
      upMain: decrementMain(cur.value('UpMain')),
    };
  },
  decodeEkiJikokuElement(ekiElem, trackElem, ekiTrack2Count, mainTrack) {
    return decodeEkiJikokuS05(ekiElem, trackElem, ekiTrack2Count, mainTrack);
  },
  readsRessyaTrack: true,
  fixupEki(eki: Eki): Eki {
    const display = deriveJikokuDisplayFromKeisiki(eki.ekijikokukeisiki);
    return {
      ...eki,
      jikokuhyouJikokuDisplayKudari: display.kudari,
      jikokuhyouJikokuDisplayNobori: display.nobori,
      jikokuhyouTrackOmit: deriveJikokuhyouTrackOmit(eki.ekijikokukeisiki),
    };
  },
  fixupRosen(rosen: Rosen, cur: NodeCursor): Rosen {
    // D3: EnableOperation は生値が非空なら 2(値は無視)、空/欠落なら 0(原典 S05.cpp:2096)。
    const raw = cur.value('EnableOperation');
    const enableOperation: 0 | 2 = raw === undefined || raw === '' ? 0 : 2;
    return { ...rosen, enableOperation };
  },
};
