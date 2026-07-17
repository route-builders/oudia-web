// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 oudia-second-web contributors
//
// Based on OuDiaSecond (Copyright (C) 2017-2026 diagram_mania)
// and OuDia (Copyright (C) 2006-2017 take-okm)

/**
 * 列車線(スジ)構築パイプライン(原典 CentDedDgrRessya::readCentDedRessya の
 * 02→05→06→08 段。analysis §05 §4)。1 列車を 0 本以上の直線区間へ分解する。
 *
 * 座標は Dgr 秒(X = 午前 0 時からの経過秒。日跨ぎは 86400 超)。null = 時刻なし(原典 INT_MIN)。
 * この順序・60 秒閾値・補間ルールが OuDia 特有の見た目(長時間停車の水平線・主要駅での折れ・
 * 経由なしの切断)を決めるため忠実に再現する。在線表(_07)・運用(_11)は M1 対象外。
 */

import type { Ressya, Ressyahoukou } from '@oudia/format';
import { ekiIndexOfEkiOrder } from '@oudia/domain';
import { getEkiJikoku, getSihatsuEki, getSyuuchakuEki } from '../csv/runRange.js';
import type { DiaLayoutFrame, Ressyasen } from './types.js';

const SECONDS_PER_DAY = 86400;

/** 列車線構築中の駅ごとの X 座標(原典 CentDedDgrEkiJikoku)。null = 時刻なし。 */
interface DgrEkiJikoku {
  ekiatsukai: 'none' | 'teisya' | 'tsuuka';
  chakuX: number | null;
  hatsuX: number | null;
  /** 列車線と駅横線の交点 X(中間駅の線形補間値。原典 m_iDgrXPosRessyasen)。 */
  ressyasenX: number | null;
}

/** hatsu 優先(なければ chaku)。原典 getDgrXPosHatsu(true)。 */
function hatsuOr(ej: DgrEkiJikoku): number | null {
  return ej.hatsuX ?? ej.chakuX;
}
/** chaku 優先(なければ hatsu)。原典 getDgrXPosChaku(true)。 */
function chakuOr(ej: DgrEkiJikoku): number | null {
  return ej.chakuX ?? ej.hatsuX;
}

/** shiftDgrXPos(bShiftPrev=false)。x を [base, base+86400) へシフト。 */
function shiftDgrXPos(input: number, base: number): number {
  let x = input;
  while (x < base || x >= base + SECONDS_PER_DAY) {
    if (x < base) x += SECONDS_PER_DAY;
    else x -= SECONDS_PER_DAY;
  }
  return x;
}

/** 駅Order の Y 座標(dgrYTer 基準。駅Index へ変換)。 */
function yOf(frame: DiaLayoutFrame, houkou: Ressyahoukou, order: number): number {
  const ekiCount = frame.ekiLayouts.length;
  const e = frame.ekiLayouts[ekiIndexOfEkiOrder(order, ekiCount, houkou)];
  return e?.dgrYTer ?? 0;
}

/** 駅間 [begin, end] の累積 Y 距離(原典 calcDgrYEkikanSize)。 */
function dgrYEkikanSize(
  frame: DiaLayoutFrame,
  houkou: Ressyahoukou,
  begin: number,
  end: number,
): number {
  return Math.abs(yOf(frame, houkou, end) - yOf(frame, houkou, begin));
}

/**
 * (02) 駅時刻 → X 座標。最初の非 null を基準に、以降は差分累積(日跨ぎは 86400 超)。
 * 通過駅で片方だけ時刻がある場合はもう片方に複製。
 */
function createDgrEkiJikoku(ressya: Ressya, ekiCount: number): DgrEkiJikoku[] {
  const out: DgrEkiJikoku[] = [];
  let lastJikoku: number | null = null;
  let lastX = 0;

  for (let order = 0; order < ekiCount; order++) {
    const ej = getEkiJikoku(ressya, order);
    const xs: [number | null, number | null] = [null, null];
    const times: (number | null)[] = [ej.chakuJikoku, ej.hatsuJikoku];
    for (let ch = 0; ch < 2; ch++) {
      const t = times[ch];
      if (t === undefined || t === null) continue;
      let x: number;
      if (lastJikoku === null) {
        x = shiftDgrXPos(t, lastX);
      } else {
        let diff = t - lastJikoku;
        if (diff > SECONDS_PER_DAY / 2) diff -= SECONDS_PER_DAY;
        else if (diff < -SECONDS_PER_DAY / 2) diff += SECONDS_PER_DAY;
        x = lastX + diff;
      }
      lastJikoku = t;
      lastX = x;
      xs[ch] = x;
    }
    let chakuX = xs[0];
    let hatsuX = xs[1];
    if (ej.ekiatsukai === 'tsuuka') {
      if (chakuX === null && hatsuX !== null) chakuX = hatsuX;
      else if (chakuX !== null && hatsuX === null) hatsuX = chakuX;
    }
    out.push({ ekiatsukai: ej.ekiatsukai, chakuX, hatsuX, ressyasenX: null });
  }
  return out;
}

/** (05) 経由なし区間の端の時刻補完(原典 _05_complementKeiyunasiSide)。 */
function complementKeiyunasiSide(cont: DgrEkiJikoku[]): void {
  for (let before = 0; before < cont.length; before++) {
    const b = cont[before];
    if (b === undefined) continue;
    if (b.ekiatsukai !== 'teisya' && b.ekiatsukai !== 'tsuuka') continue;

    let after = -1;
    for (let i = before + 1; i < cont.length; i++) {
      const cur = cont[i];
      if (cur === undefined) break;
      if (cur.ekiatsukai === 'none') continue;
      // none 以外(= teisya / tsuuka)なら経由なし区間の直後駅。
      after = i;
      break;
    }
    if (after === -1 || after === cont.length) continue;
    if (before + 1 === after) continue;

    const a = cont[after];
    if (a === undefined) continue;
    if (b.chakuX === null && a.chakuX !== null) b.chakuX = a.chakuX;
    if (b.hatsuX === null && a.hatsuX !== null) b.hatsuX = a.hatsuX;
    if (b.chakuX !== null && a.chakuX === null) a.chakuX = b.chakuX;
    if (b.hatsuX !== null && a.hatsuX === null) a.hatsuX = b.hatsuX;
    before = after - 1;
  }
}

/** この列車の駅間 [from, to] 実所要秒(hatsu(from)→chaku(to))。長時間停車補完の閾値用。 */
function runSecBetween(ressya: Ressya, from: number, to: number): number {
  const a = getEkiJikoku(ressya, from);
  const b = getEkiJikoku(ressya, to);
  const h = a.hatsuJikoku ?? a.chakuJikoku;
  const c = b.chakuJikoku ?? b.hatsuJikoku;
  if (h === null || c === null) return 0;
  let diff = c - h;
  if (diff < 0) diff += SECONDS_PER_DAY;
  return diff;
}

/** (06_01) 長時間停車の着時刻補完(原典 _06_complementLongStop_01)。 */
function complementLongStop01(cont: DgrEkiJikoku[], ressya: Ressya, syuuchaku: number): void {
  for (let before = 0; before < cont.length; before++) {
    const b = cont[before];
    if (b === undefined) continue;
    if (!(
      (b.chakuX !== null || b.hatsuX !== null) &&
      (b.ekiatsukai === 'teisya' || b.ekiatsukai === 'tsuuka')
    )) {
      continue;
    }
    let after = -1;
    for (let i = before + 1; i < cont.length; i++) {
      const cur = cont[i];
      if (cur === undefined) break;
      if (cur.chakuX === null && cur.hatsuX === null) continue;
      if (cur.chakuX === null && cur.hatsuX !== null && i < syuuchaku) {
        after = i;
        break;
      }
      after = -1;
      break;
    }
    if (after === -1 || after === cont.length) continue;
    const a = cont[after];
    if (a === undefined) continue;
    if (a.hatsuX === null) continue;

    const base0 = b.hatsuX ?? b.chakuX;
    if (base0 === null) continue;
    const base = base0 + runSecBetween(ressya, before, after);
    if (base < a.hatsuX - 60) a.chakuX = base;
    before = after - 1;
  }
}

/** (06_02) 長時間停車の発時刻補完(対称)。 */
function complementLongStop02(cont: DgrEkiJikoku[], ressya: Ressya, sihatsu: number): void {
  for (let after = cont.length - 1; after >= 0; after--) {
    const a = cont[after];
    if (a === undefined) continue;
    if (!(
      (a.chakuX !== null || a.hatsuX !== null) &&
      (a.ekiatsukai === 'teisya' || a.ekiatsukai === 'tsuuka')
    )) {
      continue;
    }
    let before = -1;
    for (let i = after - 1; i >= 0; i--) {
      const cur = cont[i];
      if (cur === undefined) break;
      if (cur.chakuX === null && cur.hatsuX === null) continue;
      if (cur.hatsuX === null && cur.chakuX !== null && i > sihatsu) {
        before = i;
        break;
      }
      before = -1;
      break;
    }
    if (before === -1) continue;
    const b = cont[before];
    if (b === undefined) continue;
    if (b.chakuX === null) continue;

    const base0 = a.chakuX ?? a.hatsuX;
    if (base0 === null) continue;
    const base = base0 - runSecBetween(ressya, before, after);
    if (base > b.chakuX + 60) b.hatsuX = base;
    after = before + 1;
  }
}

/** 起点探索(原典 _01_calcKiten)。 */
function calcKiten(cont: DgrEkiJikoku[], from: number): number {
  for (let i = from; i < cont.length - 1; i++) {
    const cur = cont[i];
    const next = cont[i + 1];
    if (cur === undefined || next === undefined) continue;
    if (hatsuOr(cur) !== null && (next.ekiatsukai === 'teisya' || next.ekiatsukai === 'tsuuka')) {
      return i;
    }
  }
  return -1;
}

/** 終点探索(原典 _02_calcSyuuten)。失敗 -1。 */
function calcSyuuten(cont: DgrEkiJikoku[], kiten: number, syuuchaku: number): number {
  let syuuten = -1;
  for (let i = kiten + 1; syuuten < 0 && i <= syuuchaku; i++) {
    const cur = cont[i];
    if (cur === undefined) continue;
    if (cur.chakuX !== null && cur.hatsuX !== null) syuuten = i;
    else if (i === syuuchaku) syuuten = i;
  }
  if (syuuten < 0) return -1;
  for (; syuuten > kiten; syuuten--) {
    const cur = cont[syuuten];
    if (cur !== undefined && (cur.chakuX !== null || cur.hatsuX !== null)) break;
  }
  return syuuten === kiten ? -1 : syuuten;
}

/** (04) 主要駅・時刻あり通過駅で終点を前倒し(原典 _04_adjustSyuuten4)。 */
function adjustSyuuten4(
  cont: DgrEkiJikoku[],
  frame: DiaLayoutFrame,
  houkou: Ressyahoukou,
  kiten: number,
  syuuten: number,
): number {
  const ekiCount = frame.ekiLayouts.length;
  for (let i = kiten + 1; i < syuuten; i++) {
    const ej = cont[i];
    if (ej === undefined) continue;
    const t = chakuOr(ej);
    if (t === null) continue;
    const eki = frame.ekiLayouts[ekiIndexOfEkiOrder(i, ekiCount, houkou)];
    if (eki?.isSyuyou === true) return i;
    if (ej.ekiatsukai === 'tsuuka') return i;
  }
  return syuuten;
}

/** 中間駅の X を Y 距離比で線形補間(原典 setDgrXPosRessyasen)。 */
function interpolate(
  cont: DgrEkiJikoku[],
  frame: DiaLayoutFrame,
  houkou: Ressyahoukou,
  begin: number,
  end: number,
): void {
  const b = cont[begin];
  const e = cont[end];
  if (b === undefined || e === undefined) return;
  const xb = hatsuOr(b);
  const xe = chakuOr(e);
  if (xb === null || xe === null) return;
  const total = dgrYEkikanSize(frame, houkou, begin, end);
  for (let i = begin + 1; i < end; i++) {
    const cur = cont[i];
    if (cur === undefined) continue;
    const partial = dgrYEkikanSize(frame, houkou, begin, i);
    cur.ressyasenX = total === 0 ? xb : xb + Math.round(((xe - xb) * partial) / total);
  }
}

/** (05) 補間位置と実時刻の差が 60 秒以上なら終点を前倒し(原典 _05_adjustSyuuten5)。 */
function adjustSyuuten5(cont: DgrEkiJikoku[], kiten: number, syuuten: number): number {
  for (let i = syuuten - 1; i > kiten; i--) {
    const ej = cont[i];
    if (ej === undefined) continue;
    const t = hatsuOr(ej);
    if (t !== null && ej.ressyasenX !== null && Math.abs(t - ej.ressyasenX) >= 60) {
      return i;
    }
  }
  return syuuten;
}

/**
 * (06) 経由なしで切る(原典 _06_reduceToKeiyunasi)。線内に運行なしがあれば、その直前を
 * 終点にし、直前(と直後)の着発を補間値に置換する。戻り値: 新終点(変更なしなら null)。
 */
function reduceToKeiyunasi(cont: DgrEkiJikoku[], kiten: number, syuuten: number): number | null {
  let beforeK = -1;
  for (let i = kiten + 1; beforeK === -1 && i < syuuten; i++) {
    if (cont[i + 1]?.ekiatsukai === 'none') beforeK = i;
  }
  if (beforeK === -1) return null;

  let afterK = -1;
  for (let i = beforeK + 1; afterK === -1 && i < syuuten; i++) {
    const ej = cont[i];
    if (ej !== undefined && ej.ekiatsukai !== 'none') afterK = i;
  }

  const b = cont[beforeK];
  if (b !== undefined && b.ressyasenX !== null) {
    b.chakuX = b.ressyasenX;
    b.hatsuX = b.ressyasenX;
  }
  if (afterK !== -1) {
    const a = cont[afterK];
    if (a !== undefined && a.ressyasenX !== null) {
      a.chakuX = a.ressyasenX;
      a.hatsuX = a.ressyasenX;
    }
  }
  return beforeK;
}

/** (08) 列車線分割(原典 _08_updateRessyasenCont)。 */
export function buildRessyasenCont(
  cont: DgrEkiJikoku[],
  frame: DiaLayoutFrame,
  houkou: Ressyahoukou,
  syuuchaku: number,
): Ressyasen[] {
  const out: Ressyasen[] = [];
  let kiten = 0;
  for (;;) {
    kiten = calcKiten(cont, kiten);
    if (kiten < 0) break;

    let syuuten = calcSyuuten(cont, kiten, syuuchaku);
    if (syuuten < 0) {
      kiten++;
      continue;
    }
    syuuten = adjustSyuuten4(cont, frame, houkou, kiten, syuuten);

    // 補正5/6 のリトライループ。
    for (;;) {
      interpolate(cont, frame, houkou, kiten, syuuten);
      const s5 = adjustSyuuten5(cont, kiten, syuuten);
      if (s5 !== syuuten) {
        syuuten = s5;
        continue; // 折り直し。
      }
      const s6 = reduceToKeiyunasi(cont, kiten, syuuten);
      if (s6 !== null && s6 !== syuuten) {
        syuuten = s6;
        continue;
      }
      break;
    }

    const kb = cont[kiten];
    const ke = cont[syuuten];
    const kitenX = kb === undefined ? null : hatsuOr(kb);
    const syuutenX = ke === undefined ? null : chakuOr(ke);
    if (kitenX !== null && syuutenX !== null && syuuten > kiten) {
      out.push({
        kitenEkiOrder: kiten,
        syuutenEkiOrder: syuuten,
        kitenDgrX: kitenX,
        syuutenDgrX: syuutenX,
      });
    }

    if (syuuten <= kiten) {
      kiten++;
    } else {
      kiten = syuuten;
    }
    if (kiten >= cont.length - 1) break;
  }
  return out;
}

/** shouldRessyajouhouDraw の M1 近似: 最初の列車線起点だけ true(原典 _04 の簡略)。 */
export function computeShouldRessyajouhouDraw(
  ressyasenCont: readonly Ressyasen[],
  ekiCount: number,
): boolean[] {
  const flags = new Array<boolean>(ekiCount).fill(false);
  const first = ressyasenCont[0];
  if (first !== undefined && first.kitenEkiOrder < ekiCount) {
    flags[first.kitenEkiOrder] = true;
  }
  return flags;
}

/** 1 列車のレイアウト(列車線列 + X 範囲)を構築する。運休/Null はスジなし。 */
export function computeRessyaRessyasen(
  ressya: Ressya,
  frame: DiaLayoutFrame,
  houkou: Ressyahoukou,
): { ressyasenCont: Ressyasen[]; dgrXZone: readonly [number, number] | null } {
  const ekiCount = frame.ekiLayouts.length;
  if (ressya.isNull || ressya.isCanceled) return { ressyasenCont: [], dgrXZone: null };

  const cont = createDgrEkiJikoku(ressya, ekiCount);
  complementKeiyunasiSide(cont);
  const sihatsu = getSihatsuEki(ressya);
  const syuuchaku = getSyuuchakuEki(ressya);
  if (syuuchaku < 0) return { ressyasenCont: [], dgrXZone: null };
  complementLongStop01(cont, ressya, syuuchaku);
  complementLongStop02(cont, ressya, sihatsu);

  const ressyasenCont = buildRessyasenCont(cont, frame, houkou, syuuchaku);

  let min = Infinity;
  let max = -Infinity;
  for (const ej of cont) {
    for (const x of [ej.chakuX, ej.hatsuX]) {
      if (x === null) continue;
      if (x < min) min = x;
      if (x > max) max = x;
    }
  }
  const dgrXZone: readonly [number, number] | null = min === Infinity ? null : [min, max];
  return { ressyasenCont, dgrXZone };
}
