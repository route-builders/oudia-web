// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 up-tri
//
// Based on OuDiaSecond (Copyright (C) 2017-2026 diagram_mania)
// and OuDia (Copyright (C) 2006-2017 take-okm)

/**
 * ファイル読込のエラー・警告体系。
 *
 * 原典の負コード体系(analysis §8、file-io §3.7)を踏襲する。この S1 スパイクの
 * 段階では物理層・文法層のコードのみを扱い、マッピング層(-1000 系のエンティティ
 * コード)は世代別リーダー実装時(M1)に追加する。
 */

/** 文法・物理層のエラーコード(この段階で表面化しうるもの)。 */
export const ErrorCode = {
  /** OuPropertiesText の文法解釈失敗(Aborted / NotClosed を -1 に集約)。file-io §3.3。 */
  GrammarInvalid: -1,
  /** ファイルに `\0` が含まれる(バイナリファイル)。原典 stringFromFile の -3。 */
  BinaryNul: -3,
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

/**
 * 文法エラーの内訳。原典は decode の負値(-1 Aborted / -2 NotClosed)を
 * ユーザ可視コード -1 に潰すが、内訳は reason で区別する(file-io §3.3)。
 */
export type GrammarErrorReason = 'containerAborted' | 'containerNotClosed';

/**
 * エラー詳細(原典 COuErrorInfoContainer 相当)。
 * 「どのノードのどの値が悪いか」を提示するために蓄積する。
 */
export interface ErrorDetail {
  readonly reason: string;
  readonly entries: readonly { readonly key: string; readonly value: string }[];
}

/**
 * 警告(パースを止めない事象)。開発者コンソール・ファイル情報ダイアログで確認する。
 * この段階では 0x5C ハック適用・SJIS 置換文字発生を積む(file-io §3.7)。
 */
export type ReadWarning =
  | { readonly kind: 'sjis0x5cHackApplied'; readonly count: number }
  | { readonly kind: 'sjisReplacementChar'; readonly count: number }
  | { readonly kind: 'utf8ReplacementChar'; readonly count: number };
