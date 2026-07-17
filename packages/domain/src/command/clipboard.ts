// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 oudia-second-web contributors
//
// Based on OuDiaSecond (Copyright (C) 2017-2026 diagram_mania)
// and OuDia (Copyright (C) 2006-2017 take-okm)

/**
 * 列(列車)単位のコピー/切り取り/貼り付けの純ロジック(analysis §04 貼り付け移動量)。
 *
 * 原典 CWjkState_Ressyahensyu.cpp の OnEditCopy/Cut/Paste_Process と
 * CentDedRessya::modifyRessyaJikoku / modifyRessyaBangou / modifyGou の直訳。
 *
 * クリップボードは「列車の独自形式(深いコピー)」+「貼り付け移動量の累積アキュムレータ」を持つ。
 * コピー/切り取りで累積をリセットし、貼り付けごとに (累積 + 増分) を適用してから累積に増分を足す
 * (apply-then-increment)。これがパターンダイヤ連続貼り付け(完了条件 #3)の仕組み。
 *
 * この層は状態変更を直接行わない。貼り付けは computePasteTrains が返す trains[] を
 * ressya/replaceRange コマンド(count 0 の純挿入)に載せて executeCommand へ渡す。
 */

import type { Jikoku, Ressya, Ressyahoukou } from '@oudia/format';
import { asSeconds } from '@oudia/format';

const SEC_DAY = 86400;

/** 原典 adjustTotalSeconds: 秒を [0, 86400) に丸める(負も正しく wrap)。 */
function mod86400(n: number): number {
  return ((n % SEC_DAY) + SEC_DAY) % SEC_DAY;
}

/**
 * 貼り付け移動量(増分)。原典 m_jikanPasteIdouryou / m_iRessyaBangouPasteIdouryou /
 * m_iGouPasteIdouryou。ビューのプロパティで設定する。既定は全 0(移動なし)。
 */
export interface PasteIdouryou {
  /** 時刻移動量(秒。負可)。原典 CdDedJikan m_jikanPasteIdouryou。 */
  jikanSeconds: number;
  /** 列車番号の数値部への加算(負可)。原典 int m_iRessyaBangouPasteIdouryou。 */
  ressyabangou: number;
  /** 号数の数値部への加算(負可)。原典 int m_iGouPasteIdouryou。 */
  gousuu: number;
}

/** 移動なしの既定値。 */
export const NO_PASTE_IDOURYOU: PasteIdouryou = {
  jikanSeconds: 0,
  ressyabangou: 0,
  gousuu: 0,
};

/**
 * 列車クリップボード。原典 clipboard(独自形式)+ 累積アキュムレータ。
 * trains は格納時に深いコピー済み(以後の編集から独立)。
 */
export interface RessyaClipboard {
  /** 格納された列車(深いコピー)。 */
  trains: Ressya[];
  /** コピー元の方向(貼り付け先方向と一致すべきかの判定用。参考情報)。 */
  houkou: Ressyahoukou;
  /** 累積アキュムレータ。原典 m_..PrevValue。コピー/切り取りで 0 にリセットされる。 */
  accum: PasteIdouryou;
}

/**
 * コピー/切り取り: 選択列車を深いコピーしてクリップボードを作る。
 * 累積アキュムレータは 0 にリセット(原典: コピー/切り取り時に PrevValue = 0)。
 */
export function copyRessyaToClipboard(trains: Ressya[], houkou: Ressyahoukou): RessyaClipboard {
  return {
    trains: trains.map((r) => structuredClone(r)),
    houkou,
    accum: { ...NO_PASTE_IDOURYOU },
  };
}

/**
 * 文字列の末尾連続数字部に整数を加算する(原典 modifyRessyaBangou / modifyGou の共通ロジック)。
 *
 * - 末尾(右端)から連続する数字の並びを探す。半角/全角どちらも数字として扱う。
 * - その数値に shift を足す。負なら 0 に切り上げる(原典: iRessyaBangou < 0 → 0)。
 * - 数字部を再フォーマットして戻す。前後の非数字はそのまま保持。
 * - 元が全角数字なら結果も全角に戻す。
 * - 数字が無ければ変更しない(元の文字列をそのまま返す)。
 *
 * @param padWidth true = 元の桁数へゼロ詰め(列車番号 `%0*d`)/ false = 詰めない(号数 `%d`)
 */
export function addToTrailingNumber(s: string, shift: number, padWidth: boolean): string {
  if (shift === 0) return s;
  // 末尾から連続数字の範囲 [top, bottom] を求める(bottom = 右端の数字 index)。
  // 対象は BMP の半角/全角数字のみなのでコードユニット単位の走査で十分。
  const chars = Array.from(s);
  let bottom = -1;
  for (let i = chars.length - 1; i >= 0; i--) {
    if (isDigitChar(chars[i])) {
      bottom = i;
      break;
    }
  }
  if (bottom === -1) return s; // 数字なし → 変更しない
  let top = bottom;
  while (top - 1 >= 0 && isDigitChar(chars[top - 1])) top--;

  const digitChars = chars.slice(top, bottom + 1);
  const fullWidth = digitChars.some(isFullWidthDigit);
  const value = parseInt(toHalfWidthDigits(digitChars.join('')), 10);
  const shifted = Math.max(0, value + shift); // 負 → 0 clamp(原典)

  const width = bottom - top + 1;
  let body = padWidth ? String(shifted).padStart(width, '0') : String(shifted);
  if (fullWidth) body = toFullWidthDigits(body);

  return chars.slice(0, top).join('') + body + chars.slice(bottom + 1).join('');
}

function isDigitChar(c: string | undefined): boolean {
  if (c === undefined) return false;
  return (c >= '0' && c <= '9') || isFullWidthDigit(c);
}

function isFullWidthDigit(c: string): boolean {
  return c >= '０' && c <= '９'; // ０..９
}

function toHalfWidthDigits(s: string): string {
  let out = '';
  for (const c of s) {
    out += isFullWidthDigit(c) ? String.fromCharCode(c.charCodeAt(0) - 0xff10 + 0x30) : c;
  }
  return out;
}

function toFullWidthDigits(s: string): string {
  let out = '';
  for (const c of s) {
    out += c >= '0' && c <= '9' ? String.fromCharCode(c.charCodeAt(0) - 0x30 + 0xff10) : c;
  }
  return out;
}

/** 非 null の時刻に delta 秒を加算(24h wrap)。null はそのまま。 */
function shiftJikoku(j: Jikoku, delta: number): Jikoku {
  if (j === null) return null;
  return asSeconds(mod86400((j as number) + delta));
}

/**
 * 1 列車の全駅時刻に delta 秒を加算する(原典 CentDedRessya::modifyRessyaJikoku,
 * 駅0 着 → 駅0 発 → 駅1 着 → … の順)。非 null の着/発のみ対象。24h wrap。
 * 破壊的(draft を書き換える)。運用作業時刻の移動は M7(enableOperation 有効時)まで対象外。
 */
function shiftRessyaJikoku(ressya: Ressya, delta: number): void {
  if (delta === 0) return;
  for (const ej of ressya.ekiJikokuCont) {
    ej.chakuJikoku = shiftJikoku(ej.chakuJikoku, delta);
    ej.hatsuJikoku = shiftJikoku(ej.hatsuJikoku, delta);
  }
}

/**
 * 貼り付け実行の純計算。原典 OnEditPaste_Process:
 * 1. 適用移動量 = 累積 + 増分(apply-before-increment)。
 * 2. クリップボードの各列車(深いコピー)に、時刻・列車番号・号数の移動量を適用。
 * 3. 累積 += 増分(列車が 0 本のときは累積を進めない → ここでは 0 本を弾く)。
 *
 * 返り値: 挿入すべき trains(ressya/replaceRange に載せる)と、更新後クリップボード
 * (累積が進んだもの。連続貼り付けで再利用する)。クリップボードが空なら null。
 *
 * @param idouryou 増分(ビュー設定)。省略時は移動なし。
 */
export function computePasteTrains(
  clipboard: RessyaClipboard,
  idouryou: PasteIdouryou = NO_PASTE_IDOURYOU,
): { trains: Ressya[]; clipboard: RessyaClipboard } | null {
  if (clipboard.trains.length === 0) return null;

  // 適用移動量 = 累積 + 増分。
  const applyJikan = clipboard.accum.jikanSeconds + idouryou.jikanSeconds;
  const applyBangou = clipboard.accum.ressyabangou + idouryou.ressyabangou;
  const applyGou = clipboard.accum.gousuu + idouryou.gousuu;

  const trains = clipboard.trains.map((src) => {
    const r = structuredClone(src);
    shiftRessyaJikoku(r, applyJikan);
    r.ressyabangou = addToTrailingNumber(r.ressyabangou, applyBangou, true); // 号数と違いゼロ詰め
    r.gousuu = addToTrailingNumber(r.gousuu, applyGou, false); // 号数はゼロ詰めなし
    return r;
  });

  // 累積 += 増分(次回の連続貼り付けのため)。
  const nextClipboard: RessyaClipboard = {
    ...clipboard,
    accum: {
      jikanSeconds: clipboard.accum.jikanSeconds + idouryou.jikanSeconds,
      ressyabangou: clipboard.accum.ressyabangou + idouryou.ressyabangou,
      gousuu: clipboard.accum.gousuu + idouryou.gousuu,
    },
  };

  return { trains, clipboard: nextClipboard };
}
