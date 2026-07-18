// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 up-tri
//
// Based on OuDiaSecond (Copyright (C) 2017-2026 diagram_mania)
// and OuDia (Copyright (C) 2006-2017 take-okm)

/**
 * ダイヤグラム(スジ図)のレイアウト計算(原典 CentDedDgrDia::readCentDedRosen。
 * analysis §05)。RosenFileData の 1 ダイヤを Dgr 座標(デバイス非依存)へ変換する。
 *
 * Y = 駅間最小所要秒の累積、X = 駅時刻の差分累積(日跨ぎ 86400 超)。デバイス座標
 * (ピクセル)への線形変換・色・線種・24 時間繰り返し描画は render 層の責務。
 */

import type { RosenFileData } from '@oudia-web/format';
import { RESSYAHOUKOU_KUDARI, RESSYAHOUKOU_NOBORI } from '@oudia-web/format';
import { buildDiaLayoutFrame } from './ekiLayout.js';
import { computeRessyaRessyasen, computeShouldRessyajouhouDraw } from './ressyaLayout.js';
import type { DiagramLayout, RessyaLayout } from './types.js';

export type ComputeDiagramLayoutResult =
  { readonly ok: true; readonly layout: DiagramLayout } | { readonly ok: false; readonly code: -1 };

/**
 * 指定ダイヤのダイヤグラムレイアウトを計算する。
 * @param diaIndex diaCont への index
 */
export function computeDiagramLayout(
  data: RosenFileData,
  diaIndex: number,
): ComputeDiagramLayoutResult {
  const dia = data.rosen.diaCont[diaIndex];
  if (dia === undefined) return { ok: false, code: -1 };

  const kudari = dia.ressyaCont[RESSYAHOUKOU_KUDARI];
  const nobori = dia.ressyaCont[RESSYAHOUKOU_NOBORI];
  const frame = buildDiaLayoutFrame(data.rosen, kudari, nobori);
  const ekiCount = frame.ekiLayouts.length;

  const layoutOf = (
    ressyaList: readonly (typeof kudari)[number][],
    houkou: 0 | 1,
  ): RessyaLayout[] =>
    ressyaList.map((ressya) => {
      const { ressyasenCont, dgrXZone } = computeRessyaRessyasen(ressya, frame, houkou);
      return {
        houkou,
        syubetsuIndex: ressya.syubetsuIndex,
        ressyabangou: ressya.ressyabangou,
        ressyamei: ressya.ressyamei,
        gousuu: ressya.gousuu,
        ressyasenCont,
        dgrXZone,
        shouldRessyajouhouDraw: computeShouldRessyajouhouDraw(ressyasenCont, ekiCount),
      };
    });

  const layout: DiagramLayout = {
    frame,
    ressyaLayouts: [layoutOf(kudari, RESSYAHOUKOU_KUDARI), layoutOf(nobori, RESSYAHOUKOU_NOBORI)],
  };
  return { ok: true, layout };
}
