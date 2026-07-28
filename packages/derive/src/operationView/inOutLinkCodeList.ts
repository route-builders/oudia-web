// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 up-tri
//
// Based on OuDiaSecond (Copyright (C) 2017-2026 diagram_mania)
// and OuDia (Copyright (C) 2006-2017 take-okm)

/**
 * 入出区連携コード一覧ビューのビューモデル(原典 CWndDcdGridInOutLinkCodeList の
 * OnUpdate_All :1037-1346 / 列生成 CdInOutLinkCodeListXColSpecCont::scan :108-141 の直訳)。M7d。
 *
 * 参照専用の固定 9 列グリッド。データ源は deriveOperationFull の inOutLinkCodes
 * (Map<連携コード, InOutLinkCodeEntry>)のみで、運用表は使わない。
 *
 * 1 コードにつき max(入区側本数, 出区側本数) 行を積む(入区側と出区側は同じ行 index で
 * **独立に**引くだけでペアリングではない)。コードはグループ先頭行にのみ出す。
 *
 * ★矢印「→」と運用番号は iStatus==2(ペア成立)のときだけ出る。**原典に「無効」という
 * 文言は存在しない**(色分けも注記もない)。無効は「矢印と運番が空」として読ませる。
 * ★運用番号の区切りは `+`(oud2 の `;` ではない)。
 * ★CSV は原典に存在しない(ハンドラがコメントアウト)。
 */

import type { Ressyahoukou, Rosen } from '@oudia-web/format';
import type { InOutLinkCodeEntry, RessyaPropertyRef } from '../operationFull/types.js';

/** 列(原典 CdInOutLinkCodeListXColSpec の EColumnType。順序固定・条件分岐なし)。 */
export type InOutLinkCodeListColumn =
  | 'inOutLinkCode'
  | 'inRessyahoukou'
  | 'inRessyabangou'
  | 'inRessyasyubetsu'
  | 'arrow'
  | 'outRessyahoukou'
  | 'outRessyabangou'
  | 'outRessyasyubetsu'
  | 'operationNumber';

/** 列は常に固定 9 列(原典 scan :108-141)。 */
export const IN_OUT_LINK_CODE_LIST_COLUMNS: readonly InOutLinkCodeListColumn[] = [
  'inOutLinkCode',
  'inRessyahoukou',
  'inRessyabangou',
  'inRessyasyubetsu',
  'arrow',
  'outRessyahoukou',
  'outRessyabangou',
  'outRessyasyubetsu',
  'operationNumber',
];

/** 列見出し(原典 :1598-1794)。矢印列は見出しなし。 */
export const IN_OUT_LINK_CODE_LIST_HEADER: Readonly<Record<InOutLinkCodeListColumn, string>> = {
  inOutLinkCode: '連携コード',
  inRessyahoukou: '入区',
  inRessyabangou: '列車番号',
  inRessyasyubetsu: '種別',
  arrow: '',
  outRessyahoukou: '出区',
  outRessyabangou: '列車番号',
  outRessyasyubetsu: '種別',
  operationNumber: '運用番号',
};

/** 片側(入区 / 出区)3 セル。該当行に列車がなければ全て空。 */
export interface InOutLinkCodeListSideCell {
  readonly houkouText: string;
  readonly ressyabangou: string;
  readonly syubetsumei: string;
  /** 色・フォント引き当て用。列車がない行は null。 */
  readonly syubetsuIndex: number | null;
  /** 「時刻表へ移動」の遷移先。列車がない行は null。 */
  readonly ressya: { readonly houkou: Ressyahoukou; readonly ressyaIndex: number } | null;
}

export interface InOutLinkCodeListRow {
  /** グループ先頭行だけコード文字列、以降は空(原典 :1122-1143)。 */
  readonly code: string;
  /** この行が属する連携コード(遷移・グルーピング用。表示には使わない)。 */
  readonly groupCode: string;
  readonly inSide: InOutLinkCodeListSideCell;
  readonly outSide: InOutLinkCodeListSideCell;
  /** iStatus==2 のときだけ "→"。 */
  readonly arrow: string;
  /** iStatus==2 のときだけ運用番号(`+` 連結)。 */
  readonly operationNumber: string;
  readonly status: 0 | 1 | 2 | 3;
}

export interface InOutLinkCodeListViewModel {
  readonly columns: readonly InOutLinkCodeListColumn[];
  readonly rows: InOutLinkCodeListRow[];
}

const EMPTY_SIDE: InOutLinkCodeListSideCell = {
  houkouText: '',
  ressyabangou: '',
  syubetsumei: '',
  syubetsuIndex: null,
  ressya: null,
};

/** 方向ラベル(ダイヤ別名があればそれ。原典 :1078-1092)。 */
function houkouText(rosen: Rosen, houkou: Ressyahoukou): string {
  const alias = houkou === 0 ? rosen.kudariDiaAlias : rosen.noboriDiaAlias;
  if (alias !== '') return alias;
  return houkou === 0 ? '下り' : '上り';
}

function sideCell(
  rosen: Rosen,
  ressyaCont: readonly (readonly { ressyabangou: string; syubetsuIndex: number }[])[],
  prop: RessyaPropertyRef | undefined,
): InOutLinkCodeListSideCell {
  if (prop === undefined) return EMPTY_SIDE;
  const ressya = ressyaCont[prop.houkou]?.[prop.ressyaIndex];
  if (ressya === undefined) return EMPTY_SIDE;
  return {
    houkouText: houkouText(rosen, prop.houkou),
    ressyabangou: ressya.ressyabangou,
    syubetsumei: rosen.ressyasyubetsuCont[ressya.syubetsuIndex]?.syubetsumei ?? '',
    syubetsuIndex: ressya.syubetsuIndex,
    ressya: { houkou: prop.houkou, ressyaIndex: prop.ressyaIndex },
  };
}

/**
 * 入出区連携コード一覧のビューモデルを組み立てる。
 *
 * 行順は**連携コードの昇順**(原典は std::map なのでキー順。登録順ではない)。
 *
 * @param inOutLinkCodes deriveOperationFull の出力
 * @param ressyaCont     [方向][列車index](Dia.ressyaCont をそのまま渡せる)
 */
export function deriveInOutLinkCodeList(
  rosen: Rosen,
  ressyaCont: readonly (readonly { ressyabangou: string; syubetsuIndex: number }[])[],
  inOutLinkCodes: ReadonlyMap<string, InOutLinkCodeEntry>,
): InOutLinkCodeListViewModel {
  const rows: InOutLinkCodeListRow[] = [];
  const codes = [...inOutLinkCodes.keys()].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

  for (const code of codes) {
    const entry = inOutLinkCodes.get(code);
    if (entry === undefined) continue;
    const count = Math.max(entry.inRessyaProperties.length, entry.outRessyaProperties.length);
    const active = entry.status === 2;
    for (let i = 0; i < count; i++) {
      rows.push({
        code: i === 0 ? code : '',
        groupCode: code,
        inSide: sideCell(rosen, ressyaCont, entry.inRessyaProperties[i]),
        outSide: sideCell(rosen, ressyaCont, entry.outRessyaProperties[i]),
        arrow: active ? '→' : '',
        operationNumber: active ? entry.operationNumbers.join('+') : '',
        status: entry.status,
      });
    }
  }

  return { columns: IN_OUT_LINK_CODE_LIST_COLUMNS, rows };
}
