// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 up-tri

/**
 * 読込コンテキスト。警告・エラーの蓄積を担う(file-io §3.7)。
 * この段階(M1 現行リーダー)はエラーを 1 件目で打ち切らず、致命的キー不正のみ throw する。
 */

import type { ErrorDetail, ReadWarning } from '../errors.js';

export class ReadContext {
  readonly warnings: ReadWarning[] = [];
  readonly errorDetails: ErrorDetail[] = [];

  warn(warning: ReadWarning): void {
    this.warnings.push(warning);
  }
}

/** 読込致命エラー(FileType 不正・必須キー欠落など)。負のエラーコードを持つ。 */
export class ReadError extends Error {
  constructor(
    readonly code: number,
    readonly detail?: ErrorDetail,
  ) {
    super(`ReadError(${String(code)})`);
    this.name = 'ReadError';
  }
}
