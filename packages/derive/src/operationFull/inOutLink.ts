// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 up-tri
//
// Based on OuDiaSecond (Copyright (C) 2017-2026 diagram_mania)
// and OuDia (Copyright (C) 2006-2017 take-okm)

/**
 * 入出区連携コードの登録と状態機械(原典 CDedOperationConnecter::insertInOutLinkCodeElement、
 * cpp:8251-8377)。M7c-2 PR-2。
 *
 * 入区(または路線外終着)と出区(または路線外始発)に同じコードを設定すると、コードのペアが
 * **1:1 で成立したときに限り**(iStatus==2)、入区側で確定した運番が出区側へ引き継がれる。
 *
 * iStatus の意味(CentDedDia.h の InOutLinkCodeContent コメント):
 * - 0 = 出区(路線外始発)のみ登録済み
 * - 1 = 入区(路線外終着)のみ登録済み
 * - 2 = ペア成立(有効。運番の引継ぎが起きるのはこれだけ)
 * - 3 = 無効(出区または入区が 2 本以上ある / ペアだが起点時刻を跨いでいて許可されない)
 *
 * ★出力(一覧)は oud2 非永続 = 黄金テスト非該当。oud2 に書かれるのは各作業の連携コード文字列のみ。
 */

import { compareJikoku } from '@oudia-web/domain';
import type { Jikoku } from '@oudia-web/format';
import type { OpRef } from '../operationLight/types.js';
import type { InOutLinkCodeEntry, RessyaPropertyRef } from './types.js';

/** 連携コードが入力された作業 1 件(原典 RessyaElement の連携用途)。 */
export interface InOutLinkElement {
  readonly ref: OpRef;
  /** 方向 + 列車 index + 出区/入区時刻(起点跨ぎ判定に使う)。 */
  readonly ressyaProperty: RessyaPropertyRef;
  /** true = 出区・路線外始発(前作業) / false = 入区・路線外終着(後作業)。 */
  readonly isOut: boolean;
}

/** 空のエントリを作る。 */
function newEntry(status: 0 | 1): InOutLinkCodeEntry {
  return {
    inRessyaProperties: [],
    outRessyaProperties: [],
    status,
    beforeOperation: null,
    operationNumbers: [],
  };
}

/**
 * 連携コード一覧へ 1 件登録する(原典 insertInOutLinkCodeElement、cpp:8251-8377)。
 * `map` を破壊的に更新する。
 *
 * @param operationCrossKitenJikoku 起点時刻跨ぎ接続を許可するか(false なら時刻の前後を検査する)
 */
export function insertInOutLinkCodeElement(
  map: Map<string, InOutLinkCodeEntry>,
  code: string,
  el: InOutLinkElement,
  operationCrossKitenJikoku: boolean,
  kitenJikoku: Jikoku,
): void {
  if (code === '') return;
  const found = map.get(code);

  if (el.isOut) {
    // 出区・路線外始発(原典 :8258-8319)。
    if (found === undefined) {
      const entry = newEntry(0);
      entry.outRessyaProperties.push(el.ressyaProperty);
      entry.beforeOperation = el.ref;
      map.set(code, entry);
      return;
    }
    if (found.status === 1) {
      // 既登録の入区とペアになる。起点跨ぎが無効なら「出区 >= 入区」でなければ無効(:8287-8305)。
      const inJikoku = found.inRessyaProperties[0]?.jikoku ?? null;
      const satisfy =
        operationCrossKitenJikoku ||
        compareJikoku(el.ressyaProperty.jikoku, inJikoku, kitenJikoku) >= 0;
      if (satisfy) {
        found.status = 2;
        found.outRessyaProperties.push(el.ressyaProperty);
        found.beforeOperation = el.ref;
      } else {
        found.status = 3;
      }
      return;
    }
    if (found.status === 0 || found.status === 2) {
      // 出区が被る → 無効(:8307-8313)。
      found.status = 3;
      found.outRessyaProperties.push(el.ressyaProperty);
      found.beforeOperation = null;
      return;
    }
    // status === 3: 追加のみ(:8314-8317)。
    found.outRessyaProperties.push(el.ressyaProperty);
    return;
  }

  // 入区・路線外終着(原典 :8320-8376)。
  if (found === undefined) {
    const entry = newEntry(1);
    entry.inRessyaProperties.push(el.ressyaProperty);
    map.set(code, entry);
    return;
  }
  if (found.status === 0) {
    // 既登録の出区とペアになる。起点跨ぎが無効なら「入区 <= 出区」でなければ無効(:8343-8361)。
    const outJikoku = found.outRessyaProperties[0]?.jikoku ?? null;
    const satisfy =
      operationCrossKitenJikoku ||
      compareJikoku(el.ressyaProperty.jikoku, outJikoku, kitenJikoku) <= 0;
    if (satisfy) {
      found.status = 2;
      found.inRessyaProperties.push(el.ressyaProperty);
    } else {
      found.status = 3;
      found.beforeOperation = null;
    }
    return;
  }
  if (found.status === 1 || found.status === 2) {
    // 入区が被る → 無効(:8363-8369)。
    found.status = 3;
    found.inRessyaProperties.push(el.ressyaProperty);
    found.beforeOperation = null;
    return;
  }
  // status === 3: 追加のみ(:8370-8373)。
  found.inRessyaProperties.push(el.ressyaProperty);
}

/** コードのペアが成立していて運番引継ぎが有効か(iStatus==2)。 */
export function isLinkActive(entry: InOutLinkCodeEntry | undefined): boolean {
  return entry !== undefined && entry.status === 2;
}
