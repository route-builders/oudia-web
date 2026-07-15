// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 oudia-second-web contributors
//
// Based on OuDiaSecond (Copyright (C) 2017-2026 diagram_mania)
// and OuDia (Copyright (C) 2006-2017 take-okm)

/**
 * ファイル同型モデルの基本型。data-model §2.1。
 *
 * これらの型宣言の実体は format の model/ に置く(依存方向 format ← domain を
 * 満たすため。file-io §2.3)。domain がこれらを re-export する。
 */

/**
 * 時刻: 00:00 からの経過秒。0 <= v < 86400。日付概念なし・24h サイクリック。
 * 原典 CdDedJikoku::m_iTotalSeconds。Null(原典 INT_MIN)は Jikoku 型の null で表す。
 */
export type Seconds = number & { readonly __brand: 'Seconds' };

/** Null をとりうる時刻(原典 CdDedJikoku そのもの)。 */
export type Jikoku = Seconds | null;

/** 経過時間: 符号付き秒。Null 状態なし(原典 CdDedJikan::m_iTotalSeconds)。 */
export type Jikan = number & { readonly __brand: 'Jikan' };

/**
 * 色: Win32 COLORREF(0x00BBGGRR)をそのまま保持(原典 CdColorProp)。
 * ファイルの "%08X" と 1:1 のためラウンドトリップが自明。
 */
export type Colorref = number & { readonly __brand: 'Colorref' };

/** Seconds ブランド構築ヘルパ(範囲チェックは呼出し側の責務)。 */
export function asSeconds(n: number): Seconds {
  return n as Seconds;
}

/** Colorref ブランド構築ヘルパ。 */
export function asColorref(n: number): Colorref {
  return n as Colorref;
}

/** Jikan ブランド構築ヘルパ。 */
export function asJikan(n: number): Jikan {
  return n as Jikan;
}

/** 列車方向(原典 ERessyahoukou)。Dia.ressyaCont のタプル添字と一致させるため数値。 */
export type Ressyahoukou = 0 | 1;
export const RESSYAHOUKOU_KUDARI = 0 as const; // Ressyahoukou_Kudari
export const RESSYAHOUKOU_NOBORI = 1 as const; // Ressyahoukou_Nobori

/** フォント(原典 CdConnectedString2 形式のフォント指定。analysis §03 §6.5)。 */
export interface FontProp {
  pointTextHeight: number; // PointTextHeight
  logicalunitTextHeight: number | null; // LogicalunitTextHeight(通常未使用)
  logicalunitCellHeight: number | null; // LogicalunitCellHeight(通常未使用)
  facename: string; // Facename
  bold: boolean; // Bold("1" のときのみ出力)
  italic: boolean; // Itaric(ファイルキーは原文ママの綴り)
  underline: boolean; // Underline
  strikeOut: boolean; // StrikeOut
  escapement: number; // Escapement(回転。GDI lfEscapement 相当。既定 0)
}

/** 未解釈ノード(WindowPlacement と未知ディレクトリの中身)。 */
export interface RawEntry {
  name: string;
  value?: string;
  children?: RawEntry[];
}

/** 未知キー・未知ノードの透過保持(data-model §1.5、architecture §6.1)。 */
export interface UnknownEntry {
  /**
   * 元ノード内での出現位置(既知キーを含む 0 起点の通し番号)。
   * ライターは既知キーをテーブル順に出力しつつ、この index 位置に再挿入する。
   */
  index: number;
  /**
   * エンティティに写像されない中間ディレクトリ('EkiTrack2Cont.' / 'Kudari.' / 'Nobori.')
   * 直下の未知エントリを親エンティティ(Eki / Dia)で保持する場合のみ設定(§1.5)。
   * 設定時、index はその中間ディレクトリ内での出現位置。
   */
  container?: string;
  name: string;
  value?: string; // プロパティ行(エスケープ解除済み)。ディレクトリなら省略
  children?: RawEntry[]; // ディレクトリ(未解釈サブツリー)。プロパティなら省略
}
