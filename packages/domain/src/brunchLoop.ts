// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 up-tri
//
// Based on OuDiaSecond (Copyright (C) 2017-2026 diagram_mania)
// and OuDia (Copyright (C) 2006-2017 take-okm)

/**
 * 分岐・環状の派生マップ導出(原典 CentDedEkiCont::adjustBrunchLoopCont /
 * searchEkiIndexBrunchLoop、CentDedEkiCont.cpp:2017 / 1498 の直訳)。
 *
 * ストアに持たない導出値(data-model §2.10 BrunchLoopMap)。入力は各駅の
 * brunchCoreEkiIndex / loopOriginEkiIndex(いずれも駅Index、null=なし)のみ。
 * 参照が整合していれば常に計算可能で、駅編集時は参照だけ整合させれば足りる(§8.3(e))。
 *
 * 原典の配列順序は .h コメント(降順)が stale で、実際に populate される
 * searchEkiIndexBrunchLoop の配列は **昇順**(コメントアウトされた降順ループが昇順 +
 * push_back/push_front に差し替えられている)。本移植も昇順に揃える。
 *
 * positions[] の意味(原典 m_iBrunchLoopPosition):
 * - 'originSideBrunch'(原典 INT_MIN): 起点側の分岐派生駅
 * - 'standalone'(原典 -1): どの分岐・環状にも属さない単独駅
 * - 数値 >= 0: 環状チェーン内の位置(iEkiIndexLoop での 0 起点 index)。core/loop 端も含む
 * - 'terminalSideBrunch'(原典 INT_MAX): 終点側の分岐派生駅
 */

import type { Eki } from '@oudia-web/format';

export type BrunchLoopPosition = 'originSideBrunch' | 'standalone' | number | 'terminalSideBrunch';

export interface BrunchLoopMap {
  /** 駅ごとの位置コード(ekiCont と同じ長さ・同じ添字)。 */
  positions: BrunchLoopPosition[];
  /** 各駅が属するグループの起点側分岐駅 index 群(昇順)。 */
  ekiIndexBrunchOriginSide: number[][];
  /** 各駅が属するグループの環状チェーン駅 index 群(昇順)。 */
  ekiIndexLoop: number[][];
  /** 各駅が属するグループの終点側分岐駅 index 群(昇順)。 */
  ekiIndexBrunchTerminalSide: number[][];
}

interface SearchResult {
  /** 原典 searchEkiIndexBrunchLoop の戻り値。-1=standalone、それ以外は非負(loop 内位置)。 */
  position: number;
  originSide: number[];
  loop: number[];
  terminalSide: number[];
}

/** 駅 index の brunchCore(null → -1 相当の負値扱い)。 */
function coreOf(ekiCont: readonly Eki[], i: number): number {
  const e = ekiCont[i];
  return e === undefined || e.brunchCoreEkiIndex === null ? -1 : e.brunchCoreEkiIndex;
}

/** 駅 index の loopOrigin(null → -1)。 */
function loopOriginOf(ekiCont: readonly Eki[], i: number): number {
  const e = ekiCont[i];
  return e === undefined || e.loopOriginEkiIndex === null ? -1 : e.loopOriginEkiIndex;
}

/**
 * 環状チェーンを idxl から下方向(index 増加方向)へ辿る。
 * 原典: do{ idxl より大きい最小の idxls で loopOrigin==idxl のものを探し push_back }while(found)。
 * loop 配列に昇順で push する。戻り値は末端 idxl。
 */
function chainDown(ekiCont: readonly Eki[], startIdxl: number, loop: number[]): number {
  let idxl = startIdxl;
  for (;;) {
    let found = -1;
    for (let idxls = idxl + 1; idxls < ekiCont.length; idxls++) {
      if (loopOriginOf(ekiCont, idxls) === idxl) {
        found = idxls;
        break; // 最小の idxls
      }
    }
    if (found === -1) break;
    loop.push(found);
    idxl = found;
  }
  return idxl;
}

/**
 * 環状チェーンを idxl から上方向(index 減少方向)へ辿る。
 * 原典: while(loopOrigin(idxl)>=0){ push_front(loopOrigin(idxl)); idxl=loopOrigin(idxl) }。
 * loop 配列の先頭に unshift する。戻り値は先頭 idxl。
 */
function chainUp(ekiCont: readonly Eki[], startIdxl: number, loop: number[]): number {
  let idxl = startIdxl;
  for (;;) {
    const origin = loopOriginOf(ekiCont, idxl);
    if (origin < 0) break;
    loop.unshift(origin);
    idxl = origin;
  }
  return idxl;
}

/**
 * 起点側の分岐派生駅(idxl を core に持つ 0..idxl-1 の駅)を originSide へ昇順収集する。
 */
function collectOriginSide(ekiCont: readonly Eki[], idxl: number, originSide: number[]): void {
  for (let idxo = 0; idxo < idxl; idxo++) {
    if (coreOf(ekiCont, idxo) === idxl) originSide.push(idxo);
  }
}

/**
 * 終点側の分岐派生駅(idxl を core に持つ idxl+1..size-1 の駅)を terminalSide へ昇順収集する。
 */
function collectTerminalSide(ekiCont: readonly Eki[], idxl: number, terminalSide: number[]): void {
  for (let idxt = idxl + 1; idxt < ekiCont.length; idxt++) {
    if (coreOf(ekiCont, idxt) === idxl) terminalSide.push(idxt);
  }
}

/**
 * 原典 searchEkiIndexBrunchLoop(CentDedEkiCont.cpp:1498)の 4 ケース直訳。
 * iEkiIndex 自身の brunch/loop 設定で分岐する。
 */
function searchEkiIndexBrunchLoop(ekiCont: readonly Eki[], iEkiIndex: number): SearchResult {
  const core = coreOf(ekiCont, iEkiIndex);
  const origin = loopOriginOf(ekiCont, iEkiIndex);
  const originSide: number[] = [];
  const loop: number[] = [];
  const terminalSide: number[] = [];

  if (core >= 0 && core > iEkiIndex) {
    // CASE A: 起点側(下り側)分岐派生駅。core は自分より後ろにある。
    loop.push(core);
    collectOriginSide(ekiCont, core, originSide);
    const tail = chainDown(ekiCont, core, loop);
    collectTerminalSide(ekiCont, tail, terminalSide);
    return { position: Number.NEGATIVE_INFINITY, originSide, loop, terminalSide }; // INT_MIN 相当
  }

  if (core >= 0 && core < iEkiIndex) {
    // CASE B: 終点側(上り側)分岐派生駅。core は自分より手前。
    loop.push(core);
    collectTerminalSide(ekiCont, core, terminalSide);
    const head = chainUp(ekiCont, core, loop);
    collectOriginSide(ekiCont, head, originSide);
    return { position: Number.POSITIVE_INFINITY, originSide, loop, terminalSide }; // INT_MAX 相当
  }

  if (core < 0 && origin >= 0) {
    // CASE C: 環状チェーンの終端(loopOrigin を持つ)。
    loop.push(iEkiIndex);
    loop.unshift(origin);
    const head = chainUp(ekiCont, origin, loop);
    collectOriginSide(ekiCont, head, originSide);
    const tail = chainDown(ekiCont, iEkiIndex, loop);
    collectTerminalSide(ekiCont, tail, terminalSide);
    const pos = loop.indexOf(iEkiIndex);
    return { position: pos, originSide, loop, terminalSide };
  }

  // CASE D: core<0 && origin<0。core/loopOrigin 候補または真の単独駅。
  for (let idxo = 0; idxo < iEkiIndex; idxo++) {
    if (coreOf(ekiCont, idxo) === iEkiIndex) {
      if (loop.length === 0) loop.push(iEkiIndex);
      originSide.push(idxo);
    }
  }
  {
    let idxl = iEkiIndex;
    for (;;) {
      let found = -1;
      for (let idxls = idxl + 1; idxls < ekiCont.length; idxls++) {
        if (loopOriginOf(ekiCont, idxls) === idxl) {
          found = idxls;
          break;
        }
      }
      if (found === -1) break;
      if (loop.length === 0) loop.push(iEkiIndex);
      loop.push(found);
      idxl = found;
    }
    collectTerminalSide(ekiCont, idxl, terminalSide);
  }
  if (loop.length === 0) return { position: -1, originSide, loop, terminalSide }; // STANDALONE
  return { position: loop.indexOf(iEkiIndex), originSide, loop, terminalSide };
}

/**
 * 分岐・環状の派生マップを全駅ぶん計算する(原典 adjustBrunchLoopCont の直訳)。
 * bChecked で訪問済みをスキップし、グループ単位で一括解決する。
 */
export function deriveBrunchLoopMap(ekiCont: readonly Eki[]): BrunchLoopMap {
  const n = ekiCont.length;
  const positions: BrunchLoopPosition[] = new Array<BrunchLoopPosition>(n).fill('standalone');
  const ekiIndexBrunchOriginSide: number[][] = Array.from({ length: n }, () => []);
  const ekiIndexLoop: number[][] = Array.from({ length: n }, () => []);
  const ekiIndexBrunchTerminalSide: number[][] = Array.from({ length: n }, () => []);
  const checked = new Array<boolean>(n).fill(false);

  for (let idx = 0; idx < n; idx++) {
    if (checked[idx]) continue;
    const res = searchEkiIndexBrunchLoop(ekiCont, idx);
    if (res.position === -1) {
      positions[idx] = 'standalone';
      checked[idx] = true;
      continue;
    }
    // グループ全員に同じ 3 配列を付与しつつ position コードを刻む。
    for (const idxo of res.originSide) {
      positions[idxo] = 'originSideBrunch';
      ekiIndexBrunchOriginSide[idxo] = res.originSide.slice();
      ekiIndexLoop[idxo] = res.loop.slice();
      ekiIndexBrunchTerminalSide[idxo] = res.terminalSide.slice();
      checked[idxo] = true;
    }
    for (let k = 0; k < res.loop.length; k++) {
      const idxl = res.loop[k];
      if (idxl === undefined) continue;
      positions[idxl] = k; // loop 内 0 起点 index
      ekiIndexBrunchOriginSide[idxl] = res.originSide.slice();
      ekiIndexLoop[idxl] = res.loop.slice();
      ekiIndexBrunchTerminalSide[idxl] = res.terminalSide.slice();
      checked[idxl] = true;
    }
    for (const idxt of res.terminalSide) {
      positions[idxt] = 'terminalSideBrunch';
      ekiIndexBrunchOriginSide[idxt] = res.originSide.slice();
      ekiIndexLoop[idxt] = res.loop.slice();
      ekiIndexBrunchTerminalSide[idxt] = res.terminalSide.slice();
      checked[idxt] = true;
    }
  }

  return { positions, ekiIndexBrunchOriginSide, ekiIndexLoop, ekiIndexBrunchTerminalSide };
}

/**
 * ある駅と分岐・環状で連なる駅 index 群を平坦に列挙する(原典
 * CentDedEkiCont::getEkiIndexBrunchLoop、CentDedEkiCont.cpp:1338-1496 の直訳)。
 *
 * `deriveBrunchLoopMap` が返す 3 分割(起点側分岐 / 環状チェーン / 終点側分岐)とは**別の関数**で、
 * こちらは「自駅 + 関係する駅」を 1 本の列にして返す。用途は所属判定(原典も `find` するだけ)
 * なので順序に意味はない。分岐設定の向き(基幹駅が自駅より上か下か)で 4 通りに場合分けする。
 *
 * 使い所: 運用表 CSV の出区/入区駅指定(原典 CDlgOperationTableCsvExport.cpp:763-768)、
 * 交差支障の同一駅群など。
 */
export function getEkiIndexBrunchLoop(ekiCont: readonly Eki[], ekiIndex: number): number[] {
  const n = ekiCont.length;
  const out: number[] = [ekiIndex];
  const self = ekiCont[ekiIndex];
  if (self === undefined) return out;
  const core = coreOf(ekiCont, ekiIndex);
  const loopOrigin = loopOriginOf(ekiCont, ekiIndex);

  /** 環状チェーンを下方向(index 増加)へ辿り、末端 index を返す(原典の do-while)。 */
  const chainDownFrom = (start: number): number => {
    let idxl = start;
    for (;;) {
      let found = -1;
      for (let idxls = idxl + 1; idxls < n; idxls++) {
        if (loopOriginOf(ekiCont, idxls) === idxl) {
          found = idxls;
          break;
        }
      }
      if (found === -1) break;
      out.push(found);
      idxl = found;
    }
    return idxl;
  };
  /** 環状チェーンを上方向へ辿り、末端 index を返す。 */
  const chainUpFrom = (start: number): number => {
    let idxl = start;
    for (;;) {
      const origin = loopOriginOf(ekiCont, idxl);
      if (origin < 0) break;
      out.push(origin);
      idxl = origin;
    }
    return idxl;
  };
  /** idxl を基幹駅とする派生駅を上方向に集める。 */
  const derivedAbove = (idxl: number, skip = -1): void => {
    for (let idxu = idxl - 1; idxu >= 0; idxu--) {
      if (idxu !== skip && coreOf(ekiCont, idxu) === idxl) out.push(idxu);
    }
  };
  /** idxl を基幹駅とする派生駅を下方向に集める。 */
  const derivedBelow = (idxl: number, skip = -1): void => {
    for (let idxd = idxl + 1; idxd < n; idxd++) {
      if (idxd !== skip && coreOf(ekiCont, idxd) === idxl) out.push(idxd);
    }
  };

  if (core >= 0 && core > ekiIndex) {
    // 自駅が「下方への派生駅」= 基幹駅は自駅より下。基幹駅から下へ繋がりうる(:1345-1382)。
    out.push(core);
    derivedAbove(core, ekiIndex);
    const idxl = chainDownFrom(core);
    derivedBelow(idxl);
  } else if (core >= 0 && core < ekiIndex) {
    // 自駅が「上方への派生駅」。基幹駅から上へ繋がりうる(:1383-1410)。
    out.push(core);
    derivedBelow(core, ekiIndex);
    const idxl = chainUpFrom(core);
    derivedAbove(idxl);
  } else if (loopOrigin >= 0) {
    // 自駅が環状の終点駅(:1411-1455)。上方へ遡ってから、自駅から下方へも辿る。
    out.push(loopOrigin);
    const up = chainUpFrom(loopOrigin);
    derivedAbove(up);
    const down = chainDownFrom(ekiIndex);
    derivedBelow(down);
  } else {
    // 分岐・環状の設定を持たない駅(基幹駅 or 環状起点でありうる。:1456-1494)。
    derivedAbove(ekiIndex);
    const idxl = chainDownFrom(ekiIndex);
    derivedBelow(idxl);
  }
  return out;
}

// ---- 駅Order / 列車方向で見た分岐環状グループ ----

/** 駅Order 基準の分岐環状グループ(原典 getEkiOrderBrunchLoop の戻り値 + 3 deque)。 */
export interface BrunchLoopGroupOrders {
  /** グループ内での位置。単独駅は 'standalone'。 */
  readonly position: BrunchLoopPosition;
  /** 起点側の分岐派生駅(駅Order 昇順)。 */
  readonly originSide: number[];
  /** 環状チェーン(駅Order 昇順)。 */
  readonly loop: number[];
  /** 終点側の分岐派生駅(駅Order 昇順)。 */
  readonly terminalSide: number[];
}

/**
 * 駅Order + 列車方向で分岐環状グループを引く(原典 CentDedEkiCont::getEkiOrderBrunchLoop、
 * CentDedEkiCont.cpp:1714-1775)。在線表の駅群展開はこれが唯一の入口。
 *
 * ★上りでは EkiIndex 版の結果をそのまま使えない:
 * - **originSide と terminalSide が入れ替わる**(列車から見た起点/終点が逆になるため)
 * - 3 配列とも push_front で積み直されるので、駅Order でも昇順になる
 * - position も INT_MAX ↔ INT_MIN(= terminalSideBrunch ↔ originSideBrunch)を入れ替え、
 *   数値位置は `loop.length - pos - 1` に補正する
 */
export function getEkiOrderBrunchLoop(
  map: BrunchLoopMap,
  ekiCount: number,
  ekiOrder: number,
  houkou: 0 | 1,
): BrunchLoopGroupOrders {
  const ekiIndex = houkou === 0 ? ekiOrder : ekiCount - 1 - ekiOrder;
  const position = map.positions[ekiIndex] ?? 'standalone';
  const originSide = map.ekiIndexBrunchOriginSide[ekiIndex] ?? [];
  const loop = map.ekiIndexLoop[ekiIndex] ?? [];
  const terminalSide = map.ekiIndexBrunchTerminalSide[ekiIndex] ?? [];
  if (position === 'standalone') {
    return { position, originSide: [], loop: [], terminalSide: [] };
  }
  if (houkou === 0) {
    // 下りは 駅Index == 駅Order。
    return {
      position,
      originSide: [...originSide],
      loop: [...loop],
      terminalSide: [...terminalSide],
    };
  }
  // 上り: Index → Order に写して push_front(= 反転)。昇順のまま保たれる。
  const toOrders = (list: readonly number[]): number[] =>
    list.map((i) => ekiCount - 1 - i).reverse();
  let pos: BrunchLoopPosition;
  if (position === 'terminalSideBrunch') pos = 'originSideBrunch';
  else if (position === 'originSideBrunch') pos = 'terminalSideBrunch';
  else pos = loop.length - position - 1;
  return {
    position: pos,
    // ★入れ替わる。
    originSide: toOrders(terminalSide),
    loop: toOrders(loop),
    terminalSide: toOrders(originSide),
  };
}

/**
 * 2 駅が同じ分岐環状グループに属するか(原典 CentDedEkiCont::isSameBrunchLoopGroup、
 * CentDedEkiCont.cpp:1968-2004)。経由なし区間を 1 本の在線として繋ぐかの判定に使う。
 *
 * 同一駅なら true。**どちらかが単独駅なら false**。それ以外は
 * 「最も起点側の基幹駅(ekiIndexLoop[0])が一致するか」で判定する。
 */
export function isSameBrunchLoopGroup(
  map: BrunchLoopMap,
  ekiIndexA: number,
  ekiIndexB: number,
): boolean {
  const n = map.positions.length;
  if (ekiIndexA < 0 || ekiIndexA >= n) return false;
  if (ekiIndexB < 0 || ekiIndexB >= n) return false;
  if (ekiIndexA === ekiIndexB) return true;
  if (map.positions[ekiIndexA] === 'standalone') return false;
  if (map.positions[ekiIndexB] === 'standalone') return false;
  const a = map.ekiIndexLoop[ekiIndexA]?.[0];
  const b = map.ekiIndexLoop[ekiIndexB]?.[0];
  return a !== undefined && a === b;
}

/** 駅Order 版(原典 CentDedEkiCont.cpp:2007-2015)。 */
export function isSameBrunchLoopGroupByOrder(
  map: BrunchLoopMap,
  ekiCount: number,
  ekiOrderA: number,
  ekiOrderB: number,
  houkou: 0 | 1,
): boolean {
  const toIndex = (o: number): number => (houkou === 0 ? o : ekiCount - 1 - o);
  return isSameBrunchLoopGroup(map, toIndex(ekiOrderA), toIndex(ekiOrderB));
}
