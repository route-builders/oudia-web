// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 up-tri
//
// Based on OuDiaSecond (Copyright (C) 2017-2026 diagram_mania)
// and OuDia (Copyright (C) 2006-2017 take-okm)

/**
 * 時刻表ビューのキーマップ(design §05 4.1・4.3 の確定表)。KeyboardEvent → 抽象アクション。
 * 純ロジック(React 非依存)。
 *
 * 方針(design §05 4.1):
 * - 代替バインド(Alt 系)は全環境で常時有効。
 * - 原典バインド(Ctrl 系)のうち傍受可能なもの(Ctrl+J/K/L・Ctrl+U/I/B・Ctrl+'-' 等)は
 *   タブ表示でも preventDefault で奪って常時有効。
 * - 既知の傍受不能キー(Ctrl+T = ブラウザの新規タブ)のみ PWA standalone
 *   (mode.ctrlBindings)に限定する。
 * - macOS では Alt+文字 の e.key が別文字になるため、文字キーは e.code から復元する。
 */

/** 時刻表編集の抽象アクション(文字列系)。 */
export type EditAction =
  | 'undo'
  | 'redo'
  | 'cut'
  | 'copy'
  | 'paste'
  | 'clear' // Del: 消去(選択列車を空列車化 or 削除)
  | 'clearJikoku' // Ctrl+Del: 時刻消去
  | 'clearCell' // BackSpace: フォーカスセルのデータ削除(駅時刻 → 運行なし化)
  | 'tsuuka' // 通過(時刻消去)
  | 'tsuukaTeisya' // Alt+'-': 通過-停車トグル(時刻維持)
  | 'keiyunasi' // 経由なし
  | 'sihatsuEki' // 当駅始発
  | 'syuuchakuEki' // 当駅止り
  | 'tyokutsuu' // Ctrl+Shift+U: 直通化
  | 'bundan' // Ctrl+Shift+I: 分断
  | 'pasteJikokuOnly' // Ctrl+Shift+V: 時刻のみ貼り付け
  | 'unify' // 列車番号で一本化(原典ショートカットなし。ツールバーから)
  | 'sort' // 並べ替え(フォーカス行種別で多態。原典ショートカットなし)
  | 'minJikan' // 最小所要時間列車に移動(原典ショートカットなし)
  | 'toggleCanceled' // 運休トグル
  | 'swapLeft' // 左へ(並び順)
  | 'swapRight' // 右へ
  | 'focusNext' // Ctrl+K: フォーカスを次へ
  | 'focusPrev' // Ctrl+Shift+K: フォーカスを前へ
  | 'renzoku' // Ctrl+T / Alt+T: 連続入力モード
  | 'modifyEkijikoku' // Ctrl+M / Alt+M: 駅時刻変更ダイアログ
  | 'modifyRepeat' // Ctrl+'.' / Alt+'.': 駅時刻変更の再実行(素の '.' は原典に存在しない)
  | 'search'; // 列車番号検索

/**
 * 連続 1 分修正系(Ctrl+J/L・任意秒・Rev)の構造化アクション(原典 8 ハンドラ × Rev、
 * CWjkState_Ressyahensyu.cpp 6046-8057)。フォーカス行種別による多態はコマンド層で解決する。
 */
export interface JikokuStepAction {
  kind: 'jikokuStep';
  /** -1 = Dec(Ctrl+J 系)/ +1 = Inc(Ctrl+L 系)。 */
  sign: 1 | -1;
  /**
   * move = ±1分し次へ / noMove = ±1分 / any1・any2 = ±任意秒 1・2。
   * 列車番号・号数行では move=±1 / noMove=±10 / any1=±2 / any2=±100(原典対照表)。
   */
  variant: 'move' | 'noMove' | 'any1' | 'any2';
  /** Rev 系(Ctrl+Alt。フォーカス以前へ伝播)。駅時刻行でのみ意味を持つ。 */
  rev: boolean;
}

/** resolveEditAction の解決結果。 */
export type ResolvedAction = EditAction | JikokuStepAction;

/** キーマップモード。 */
export interface KeymapMode {
  /** 傍受不能な原典バインド(Ctrl+T 等)を有効化(PWA standalone で true)。 */
  readonly ctrlBindings: boolean;
}

interface KeyEventLike {
  key: string;
  code?: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}

/** e.code(KeyA〜KeyZ)から文字を復元する。文字キーでなければ null。 */
function codeLetter(e: KeyEventLike): string | null {
  const c = e.code;
  if (c?.length === 4 && c.startsWith('Key')) return c.slice(3).toLowerCase();
  return null;
}

function step(sign: 1 | -1, variant: JikokuStepAction['variant'], rev: boolean): JikokuStepAction {
  return { kind: 'jikokuStep', sign, variant, rev };
}

/**
 * KeyboardEvent → ResolvedAction。該当なしは null。
 * Ctrl/Meta を同一視(mac 対応)。
 */
export function resolveEditAction(e: KeyEventLike, mode: KeymapMode): ResolvedAction | null {
  const mod = e.ctrlKey || e.metaKey;
  const alt = e.altKey;
  const shift = e.shiftKey;
  const key = e.key.toLowerCase();
  // Alt 併用時に e.key が別文字化する環境(macOS)対応: 文字キーは code を優先する。
  const letter = codeLetter(e) ?? key;

  // ---- クリップボード・Undo・検索(Ctrl のみ。ブラウザ非衝突)----
  if (mod && !alt && !shift) {
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
  if (mod && !alt && shift && key === 'z') return 'redo';

  // ---- Del / BackSpace ----
  if (key === 'delete' || key === 'del') {
    return mod ? 'clearJikoku' : 'clear';
  }
  if (key === 'backspace' && !mod && !alt && !shift) {
    return 'clearCell';
  }

  // ---- '-' 系: 通過 / 通過-停車 / 経由なし ----
  const isMinus = key === '-' || e.code === 'NumpadSubtract' || e.code === 'Minus';
  if (alt && !mod && isMinus) return 'tsuukaTeisya'; // 原典 Alt+'-'(VK_OEM_MINUS+ALT)
  if (!alt) {
    if (e.code === 'NumpadSubtract' || (mod && !shift && key === '-')) return 'tsuuka';
    if (e.code === 'NumpadDivide' || (mod && shift && (key === '-' || key === '_'))) {
      return 'keiyunasi';
    }
  }

  // ---- 連続 1 分修正系(J/L)+ フォーカス移動(K)----
  // Ctrl または Alt(単独)= 通常、Ctrl+Alt = Rev。Shift = NoMove / Prev。
  const single = (mod || alt) && !(mod && alt); // Ctrl か Alt のどちらか一方のみ
  if (letter === 'j' || letter === 'l') {
    const sign: 1 | -1 = letter === 'j' ? -1 : 1;
    if (mod && alt) return step(sign, shift ? 'noMove' : 'move', true);
    if (single) return step(sign, shift ? 'noMove' : 'move', false);
  }
  if (letter === 'k' && single) return shift ? 'focusPrev' : 'focusNext';

  // ---- 任意秒(';' = Dec / ':' = Inc。JIS 配列基準、code は Semicolon / Quote)----
  const anyKey =
    e.code === 'Semicolon'
      ? 'dec'
      : e.code === 'Quote'
        ? 'inc'
        : e.code !== undefined
          ? null
          : key === ';'
            ? 'dec'
            : key === ':'
              ? 'inc'
              : null;
  if (anyKey !== null) {
    const sign: 1 | -1 = anyKey === 'dec' ? -1 : 1;
    const variant = shift ? ('any2' as const) : ('any1' as const);
    if (mod && alt) return step(sign, variant, true);
    if (single) return step(sign, variant, false);
  }

  // ---- 直通化/分断/時刻のみ貼り付け(Ctrl+Shift または Alt+Shift)----
  if (single && shift) {
    if (letter === 'u') return 'tyokutsuu';
    if (letter === 'i') return 'bundan';
    if (letter === 'v') return 'pasteJikokuOnly';
  }

  // ---- 当駅始発/止り・運休・駅時刻変更(Ctrl または Alt、Shift なし)----
  if (single && !shift) {
    if (letter === 'u') return 'sihatsuEki';
    if (letter === 'i') return 'syuuchakuEki';
    if (letter === 'b') return 'toggleCanceled';
    if (letter === 'm') return 'modifyEkijikoku';
    // 再実行: 原典は Ctrl+'.'(VK_OEM_PERIOD+CONTROL)のみ。素の '.' バインドは存在しない
    // (DiagramEdit.rc 1518。旧マニュアルの「[.]キー」記述は OuDia 時代のもの)。
    if (e.code === 'Period' || key === '.') return 'modifyRepeat';
  }

  // ---- 連続入力モード(Ctrl+T は傍受不能 → standalone のみ。Alt+T は常時)----
  if (letter === 't' && !shift) {
    if (alt && !mod) return 'renzoku';
    if (mod && !alt && mode.ctrlBindings) return 'renzoku';
  }

  // ---- 左へ/右へ: Ctrl+←/→(ブラウザ非衝突)----
  if (mod && !alt) {
    if (e.key === 'ArrowLeft') return 'swapLeft';
    if (e.key === 'ArrowRight') return 'swapRight';
  }

  return null;
}

/** 実行環境から既定のキーマップモードを判定する(PWA standalone なら傍受不能キーも有効)。 */
export function detectKeymapMode(): KeymapMode {
  const standalone =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(display-mode: standalone)').matches;
  return { ctrlBindings: standalone };
}
