// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 up-tri
//
// Based on OuDiaSecond (Copyright (C) 2017-2026 diagram_mania)
// and OuDia (Copyright (C) 2006-2017 take-okm)

/**
 * 列車の運行範囲導出(原典 CentDedRessya の getSihatsuEki 系メソッドの移植。
 * CentDedRessya.cpp:358-640)。すべて駅Order(方向基準)で扱う。
 */

import type { EkiJikoku, Jikoku, Ressya } from '@oudia-web/format';

/**
 * 駅Order の駅時刻を取得する(原典 getCentDedEkiJikoku。CentDedRessya.cpp:236)。
 * 範囲外(このライブラリのリーダーは末尾 None を切り詰めるため起こり得る)は
 * 既定値 = 運行なし(None・時刻 null・番線なし)を返す。
 */
export function getEkiJikoku(ressya: Ressya, iEkiOrder: number): EkiJikoku {
  const ej = ressya.ekiJikokuCont[iEkiOrder];
  if (ej !== undefined) return ej;
  return {
    ekiatsukai: 'none',
    chakuJikoku: null,
    hatsuJikoku: null,
    ressyaTrackIndex: null,
    beforeOperationCont: [],
    afterOperationCont: [],
  };
}

/** 始発駅Order = atsukai != none の最小駅Order。なければ -1(原典 getSihatsuEki)。 */
export function getSihatsuEki(ressya: Ressya): number {
  const cont = ressya.ekiJikokuCont;
  for (let i = 0; i < cont.length; i++) {
    if (getEkiJikoku(ressya, i).ekiatsukai !== 'none') return i;
  }
  return -1;
}

/** 終着駅Order = atsukai != none の最大駅Order。なければ -1(原典 getSyuuchakuEki)。 */
export function getSyuuchakuEki(ressya: Ressya): number {
  const cont = ressya.ekiJikokuCont;
  for (let i = cont.length - 1; i >= 0; i--) {
    if (getEkiJikoku(ressya, i).ekiatsukai !== 'none') return i;
  }
  return -1;
}

/**
 * 有効始発駅Order(原典 getValidSihatsuEki。CentDedRessya.cpp:558-580)。
 *   atsukai != none かつ発時刻が非 null かつ次駅が停車/通過、の最小駅Order。なければ -1。
 */
export function getValidSihatsuEki(ressya: Ressya): number {
  const cont = ressya.ekiJikokuCont;
  for (let i = 0; i < cont.length - 1; i++) {
    const ej = getEkiJikoku(ressya, i);
    if (ej.ekiatsukai === 'none') continue;
    if (ej.hatsuJikoku === null) continue;
    const next = getEkiJikoku(ressya, i + 1).ekiatsukai;
    if (next === 'teisya' || next === 'tsuuka') return i;
  }
  return -1;
}

/**
 * 有効終着駅Order(原典 getValidSyuuchakuEki。CentDedRessya.cpp:582-604)。
 *   atsukai != none かつ着時刻が非 null かつ前駅が停車/通過、の最大駅Order。なければ -1。
 */
export function getValidSyuuchakuEki(ressya: Ressya): number {
  const cont = ressya.ekiJikokuCont;
  for (let i = cont.length - 1; i > 0; i--) {
    const ej = getEkiJikoku(ressya, i);
    if (ej.ekiatsukai === 'none') continue;
    if (ej.chakuJikoku === null) continue;
    const prev = getEkiJikoku(ressya, i - 1).ekiatsukai;
    if (prev === 'teisya' || prev === 'tsuuka') return i;
  }
  return -1;
}

/**
 * (ekiOrder, item) の直前から着⇄発を交互に遡り、最初の非 null 時刻を返す
 * (原典 findrevJikoku(decJikokuOrder(order))。CentDedRessya.cpp:638-670, 1008-1024)。
 * 発 → 同駅の着 → 前駅の発 → … の順。駅扱・表示有無は見ない(時刻値の非 null のみ)。
 * 連続入力モードの入場判定・時合成の基準(ダイアログの時補完基準 referJikokuFor とは別物)。
 */
export function findRevJikokuItem(
  ressya: Ressya,
  ekiOrder: number,
  item: 'chaku' | 'hatsu',
): EkiJikoku['hatsuJikoku'] {
  let o = ekiOrder;
  let it = item;
  for (;;) {
    if (it === 'hatsu') {
      it = 'chaku'; // 発 → 同駅の着
    } else {
      o -= 1; // 着 → 前駅の発
      it = 'hatsu';
    }
    if (o < 0) return null;
    const ej = getEkiJikoku(ressya, o);
    const v = it === 'chaku' ? ej.chakuJikoku : ej.hatsuJikoku;
    if (v !== null) return v;
  }
}

/**
 * iEkiOrder と次駅の間が運行ありか(原典 isRunBetweenNextEki。CentDedRessya.cpp:486-508)。
 *   両駅とも停車または通過なら true。
 */
export function isRunBetweenNextEki(ressya: Ressya, iEkiOrder: number): boolean {
  const cont = ressya.ekiJikokuCont;
  if (!(iEkiOrder >= 0 && iEkiOrder < cont.length - 1)) return false;
  const a = getEkiJikoku(ressya, iEkiOrder).ekiatsukai;
  const b = getEkiJikoku(ressya, iEkiOrder + 1).ekiatsukai;
  return (a === 'teisya' || a === 'tsuuka') && (b === 'teisya' || b === 'tsuuka');
}

/** 最初に isRunBetweenNextEki が真になる駅Order。なければ -1(原典 getRunFirstEkiOrder)。 */
export function getRunFirstEkiOrder(ressya: Ressya): number {
  for (let i = 0; i < ressya.ekiJikokuCont.length; i++) {
    if (isRunBetweenNextEki(ressya, i)) return i;
  }
  return -1;
}

/** 最後に isRunBetweenNextEki が真になる駅Order + 1。なければ -1(原典 getRunLastEkiOrder)。 */
export function getRunLastEkiOrder(ressya: Ressya): number {
  for (let i = ressya.ekiJikokuCont.length - 2; i >= 0; i--) {
    if (isRunBetweenNextEki(ressya, i)) return i + 1;
  }
  return -1;
}

/**
 * fromOrder より後(fromOrder+1 以降)で最初に isRunBetweenNextEki が真になる駅Order。
 * なければ -1(原典 CentDedRessya::getRunBetweenEkiForward。adjustOperation の運行なし区間
 * 追跡で使う)。fromOrder 自身が走行区間の起点なら次の走行駅を返す。
 */
export function getRunBetweenEkiForward(ressya: Ressya, fromOrder: number): number {
  for (let i = fromOrder + 1; i < ressya.ekiJikokuCont.length; i++) {
    if (isRunBetweenNextEki(ressya, i)) return i;
  }
  return -1;
}

/**
 * fromOrder-2 以下で最初に isRunBetweenNextEki が真になる駅Order + 1。なければ -1
 * (原典 CentDedRessya::getRunBetweenEkiBackward、CentDedRessya.cpp:1613-1629)。
 * 分岐/環状駅で着側・発側が分かれるとき、終着作業を着側の駅Order へ寄せるのに使う。
 */
export function getRunBetweenEkiBackward(ressya: Ressya, fromOrder: number): number {
  if (!(fromOrder >= 0 && fromOrder < ressya.ekiJikokuCont.length)) return -1;
  for (let i = fromOrder - 2; i >= 0; i--) {
    if (isRunBetweenNextEki(ressya, i)) return i + 1;
  }
  return -1;
}

/**
 * 「入換着時刻を当駅の着時刻とみなして表示する」を考慮した着時刻(原典
 * CentDedEkiJikoku::getVirtualChakujikoku、CentDedEkiJikoku.cpp:203-232)。
 *
 * 着時刻が null ならそのまま null。そうでなければ前作業列を**末尾から**辿り、
 * 「番線が現在の在線番線と違う入換」を探す(同一番線への入換は無効扱いで読み飛ばす)。
 * 見つかった入換が「着時刻を表示する」なら**その入換着時刻**を当駅の着時刻として返す。
 * 表示しない設定なら在線番線をその入換元へ更新して探索を続ける。
 */
export function getVirtualChakuJikoku(slot: EkiJikoku): Jikoku {
  if (slot.chakuJikoku === null) return null;
  let track = slot.ressyaTrackIndex;
  for (let idx = slot.beforeOperationCont.length - 1; idx >= 0; idx--) {
    const op = slot.beforeOperationCont[idx];
    if (op === undefined || op.kind !== 'shunt') continue;
    if (track === op.shuntTrackIndex) continue; // 同一番線からの入換は無効
    if (op.displayJikoku) {
      // 原典 getOperationChakuJikoku(true) = 入換着時刻、null なら入換発時刻。
      return op.shuntChakuJikoku ?? op.shuntHatsuJikoku;
    }
    track = op.shuntTrackIndex;
  }
  return slot.chakuJikoku;
}

/**
 * 「入換発時刻を当駅の発時刻とみなして表示する」を考慮した発時刻(原典
 * getVirtualHatsujikoku、CentDedEkiJikoku.cpp:259-288)。着側と対称だが、
 * 後作業列は**先頭から**辿る。
 */
export function getVirtualHatsuJikoku(slot: EkiJikoku): Jikoku {
  if (slot.hatsuJikoku === null) return null;
  let track = slot.ressyaTrackIndex;
  for (const op of slot.afterOperationCont) {
    if (op.kind !== 'shunt') continue;
    if (track === op.shuntTrackIndex) continue;
    if (op.displayJikoku) return op.shuntHatsuJikoku;
    track = op.shuntTrackIndex;
  }
  return slot.hatsuJikoku;
}
