// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 oudia-second-web contributors
//
// Based on OuDiaSecond (Copyright (C) 2017-2026 diagram_mania)
// and OuDia (Copyright (C) 2006-2017 take-okm)

/**
 * 時刻表ビューのキーマップ(design §05 4.1・4.3)。原典アクセラレータ(Ctrl 系)と代替バインド
 * (Alt 系。全環境常時有効)の 2 モードを持ち、KeyboardEvent → 抽象アクションに解決する。
 *
 * PWA(standalone)では Ctrl 系を追加で有効化する。タブ表示時、傍受不能キー(Ctrl+T/N/W 等)は
 * 諦めるが、本 M3 のアクションはいずれも傍受可能なため両モードで有効。純ロジック(React 非依存)。
 *
 * M3 で解決するアクションのみ(連続入力・直通化/分断・作業・駅時刻挿入削除は M4/M5/M7)。
 */

/** 時刻表編集の抽象アクション(M3 範囲)。 */
export type EditAction =
  | 'undo'
  | 'redo'
  | 'cut'
  | 'copy'
  | 'paste'
  | 'clear' // Del: 消去(選択列車を空列車化 or 削除)
  | 'clearJikoku' // Ctrl+Del: 時刻消去
  | 'clearCell' // BackSpace: フォーカスセルのデータ削除(駅時刻 → 運行なし化)
  | 'tsuuka' // 通過
  | 'keiyunasi' // 経由なし
  | 'sihatsuEki' // 当駅始発
  | 'syuuchakuEki' // 当駅止り
  | 'toggleCanceled' // 運休トグル
  | 'swapLeft' // 左へ(並び順)
  | 'swapRight' // 右へ
  | 'search'; // 列車番号検索

/** キーマップモード。 */
export interface KeymapMode {
  /** 原典 Ctrl 系バインドを有効化(PWA standalone で true)。 */
  readonly ctrlBindings: boolean;
}

/**
 * KeyboardEvent → EditAction。該当なしは null。
 * Ctrl/Meta を同一視(mac 対応)。Alt 系は常時有効、Ctrl 系は mode.ctrlBindings のときのみ。
 */
export function resolveEditAction(
  e: {
    key: string;
    code?: string;
    ctrlKey: boolean;
    metaKey: boolean;
    altKey: boolean;
    shiftKey: boolean;
  },
  mode: KeymapMode,
): EditAction | null {
  const ctrl = (e.ctrlKey || e.metaKey) && mode.ctrlBindings;
  const alt = e.altKey;
  const key = e.key.toLowerCase();

  // ブラウザ非衝突キー(両モード共通、原典どおり)。
  // Ctrl+X/C/V/Z/Y は衝突しないため mode に関わらず Ctrl でも有効。
  const clip = e.ctrlKey || e.metaKey;
  if (clip && !alt && !e.shiftKey) {
    switch (key) {
      case 'z':
        return 'undo';
      case 'y':
        return 'redo';
      case 'x':
        return 'cut';
      case 'c':
        return 'copy';
      case 'v':
        return 'paste';
      case 'f':
        return 'search';
      default:
        break;
    }
  }
  // Ctrl+Shift+Z = redo(mac 慣習)。
  if (clip && !alt && e.shiftKey && key === 'z') return 'redo';

  // Del / Ctrl+Del。
  if (key === 'delete' || key === 'del') {
    return e.ctrlKey || e.metaKey ? 'clearJikoku' : 'clear';
  }

  // BackSpace(修飾なし)= フォーカスセルのデータ削除。
  if (key === 'backspace' && !e.ctrlKey && !e.metaKey && !alt && !e.shiftKey) {
    return 'clearCell';
  }

  // 通過: Ctrl+'-' / テンキー'-' / Alt+'-'(通過-停車トグルは M4、ここでは通過)。
  // 経由なし: Ctrl+Shift+'-' / テンキー'/'。
  if (e.code === 'NumpadSubtract' || (ctrl && key === '-')) return 'tsuuka';
  if (e.code === 'NumpadDivide' || (ctrl && e.shiftKey && key === '-')) return 'keiyunasi';

  // 当駅始発/止り: Ctrl+U/I(Alt+U/I)。Shift 付きは直通化/分断(M5)なので除外。
  if ((ctrl || alt) && !e.shiftKey) {
    if (key === 'u') return 'sihatsuEki';
    if (key === 'i') return 'syuuchakuEki';
    if (key === 'b') return 'toggleCanceled';
  }

  // 左へ/右へ: Ctrl+←/→(ブラウザ非衝突・両モード共通)。
  if ((e.ctrlKey || e.metaKey) && !alt) {
    if (e.key === 'ArrowLeft') return 'swapLeft';
    if (e.key === 'ArrowRight') return 'swapRight';
  }

  return null;
}

/** 実行環境から既定のキーマップモードを判定する(PWA standalone なら Ctrl 系有効)。 */
export function detectKeymapMode(): KeymapMode {
  const standalone =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(display-mode: standalone)').matches;
  return { ctrlBindings: standalone };
}
