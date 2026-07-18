// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 up-tri
//
// Based on OuDiaSecond (Copyright (C) 2017-2026 diagram_mania)
// and OuDia (Copyright (C) 2006-2017 take-okm)

/**
 * S00 世代リーダー(グループ 2 = OuDiaSecond.1.00、グループ 1 = OuDia.1.02)。
 * 原典 CconvCentDedS00。OuDia.1.02 も同じ経路で読む(CconvCentDedOud は writer 専用)。
 *
 * 差分(M1 プラン変換表 S00):
 * - O1: 空 Ekimei → "00"。
 * - O2: 着発表示・番線省略フラグは keisiki から導出(キーを持たない)。
 * - O3: DownMain/UpMain キーなし → 既定 0 / 1。
 * - O4: EkiTrack2Cont なし → 空(現行リーダーが空コンテナで処理)。
 * - O5: Kyoukaisen から分岐駅推定(BrunchCoreEkiIndex + 主要駅昇格)。Kyoukaisen 自体は
 *   モデルに載せない(推定にのみ使う)。
 * - O7/O8: EkiJikoku に $ なし → 番線は主本線(Kudari=downMain=0 / Nobori=upMain=1)。
 */

import type { Eki, Rosen } from '../model/entities.js';
import type { NodeCursor } from '../node/cursor.js';
import { decodeEkiJikoku } from '../value/ekiJikoku.js';
import { deriveJikokuDisplayFromKeisiki, deriveJikokuhyouTrackOmit } from './keisiki.js';
import type { ReaderProfile } from './profile.js';

/**
 * S00 プロファイルを生成する。読み取り 1 回ぶんの Kyoukaisen 状態(駅 id → 境界線)を
 * 保持するため、ファイルごとに新しいインスタンスを作る。
 */
export function createS00Profile(): ReaderProfile {
  // Eki.id(読込順の連番)→ Kyoukaisen。fixupEki で捕捉し postProcess で消費する。
  const kyoukaisenById = new Map<number, boolean>();

  return {
    readMainTracks() {
      // O3: DownMain/UpMain は S00 に存在しない。既定 0 / 1(原典 ctor)。
      return { downMain: 0, upMain: 1 };
    },
    decodeEkiJikokuElement(ekiElem, _trackElem, ekiTrack2Count, mainTrack) {
      // O7: $ を持たないため現行デコーダで OK(番線は主本線に落ちる)。
      return decodeEkiJikoku(ekiElem, ekiTrack2Count, mainTrack);
    },
    readsRessyaTrack: false,
    fixupEki(eki: Eki, cur: NodeCursor): Eki {
      // O5: Kyoukaisen を捕捉(_ttoi == 1)。
      const kyoukaisen = Number.parseInt(cur.value('Kyoukaisen') ?? '', 10) === 1;
      kyoukaisenById.set(eki.id, kyoukaisen);
      // O1: 空 Ekimei → "00"。O2: keisiki から表示フラグ導出。
      const display = deriveJikokuDisplayFromKeisiki(eki.ekijikokukeisiki);
      return {
        ...eki,
        ekimei: eki.ekimei === '' ? '00' : eki.ekimei,
        jikokuhyouJikokuDisplayKudari: display.kudari,
        jikokuhyouJikokuDisplayNobori: display.nobori,
        jikokuhyouTrackOmit: deriveJikokuhyouTrackOmit(eki.ekijikokukeisiki),
      };
    },
    postProcess(rosen: Rosen): Rosen {
      return inferBranch(rosen, kyoukaisenById);
    },
  };
}

/**
 * 分岐駅推定(原典 CconvCentDedS00.cpp:432-479)。
 *   内部駅(idx 1..size-2)を走査し:
 *   (1) KudariChaku かつ Kyoukaisen → 下方向に同名 Hatsuchaku を探し基幹駅に。
 *   (2) NoboriChaku かつ **1 つ上の駅**の Kyoukaisen → 上方向に同名 Hatsuchaku を探し基幹駅に。
 *   いずれも基幹駅・派生駅を主要駅へ昇格。
 */
function inferBranch(rosen: Rosen, kyoukaisenById: Map<number, boolean>): Rosen {
  const eki = rosen.ekiCont;
  const size = eki.length;
  if (size < 3) return rosen;

  // ミュータブルな作業配列(浅いコピー)で相互更新する。
  const work: Eki[] = eki.map((e) => ({ ...e }));
  const kyoukaisen = (i: number): boolean => {
    const e = work[i];
    return e !== undefined && (kyoukaisenById.get(e.id) ?? false);
  };

  for (let idx = 1; idx < size - 1; idx++) {
    const cur = work[idx];
    if (cur === undefined) continue;
    if (cur.ekijikokukeisiki === 'kudariChaku' && kyoukaisen(idx)) {
      for (let s = idx + 1; s < size - 1; s++) {
        const search = work[s];
        if (search === undefined) continue;
        if (cur.ekimei === search.ekimei && search.ekijikokukeisiki === 'hatsuchaku') {
          work[idx] = { ...cur, brunchCoreEkiIndex: s, ekikibo: 'syuyou' };
          work[s] = { ...search, ekikibo: 'syuyou' };
          break;
        }
      }
    } else if (cur.ekijikokukeisiki === 'noboriChaku' && kyoukaisen(idx - 1)) {
      for (let s = idx - 1; s > 0; s--) {
        const search = work[s];
        if (search === undefined) continue;
        if (cur.ekimei === search.ekimei && search.ekijikokukeisiki === 'hatsuchaku') {
          work[idx] = { ...cur, brunchCoreEkiIndex: s, ekikibo: 'syuyou' };
          work[s] = { ...search, ekikibo: 'syuyou' };
          break;
        }
      }
    }
  }

  return { ...rosen, ekiCont: work };
}
