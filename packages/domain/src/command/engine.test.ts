// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 oudia-second-web contributors

// コマンド基盤の検証: comment/set 実行 → Undo → Redo → 保存 で
// 変更カウンタが原典仕様通り遷移し、patch 適用が対称であることを確認する。
// 根拠: docs/design/02_architecture.md §4.3–§4.4(完了条件 #3)

import { describe, it, expect } from 'vitest';
import type { RosenFileData, Rosen, DispProp } from '@oudia/format';
import {
  canRedo,
  canUndo,
  createDocumentState,
  executeCommand,
  INT_MAX,
  isDirty,
  markSaved,
  normalizeToLf,
  redo,
  undo,
} from './index.js';

/** テスト用の最小 Rosen(コメント編集に必要な部分のみ)。 */
function makeRosen(comment: string): Rosen {
  return {
    rosenmei: 'テスト線',
    kudariDiaAlias: '',
    noboriDiaAlias: '',
    ekiCont: [],
    ressyasyubetsuCont: [],
    diaCont: [],
    kitenJikoku: null,
    diagramDgrYZahyouKyoriDefault: 60,
    enableOperation: 0,
    operationNumberReverse: false,
    operationCrossKitenJikoku: false,
    kijunDiaIndex: 0,
    disableHiddenSyubetsu: false,
    comment,
  };
}

/** テスト用の最小 RosenFileData。dispProp は空の構造体でよい(コメント編集は触らない)。 */
function makeDoc(comment = ''): RosenFileData {
  return {
    sourceFileType: 'OuDiaSecond.1.17',
    rosen: makeRosen(comment),
    dispProp: {} as DispProp,
    windowPlacement: null,
    sourceFileTypeAppComment: null,
  };
}

describe('normalizeToLf(改行の LF 正規化)', () => {
  it('CRLF / CR を LF に変換する', () => {
    expect(normalizeToLf('a\r\nb\rc\nd')).toBe('a\nb\nc\nd');
  });
});

describe('executeCommand(comment/set)', () => {
  it('コメントを設定し、改行を LF 正規化する', () => {
    const s0 = createDocumentState(makeDoc('旧'));
    const s1 = executeCommand(s0, { type: 'comment/set', comment: '行1\r\n行2\r行3' });
    expect(s1.rosenFileData.rosen.comment).toBe('行1\n行2\n行3');
  });

  it('元の状態を破壊しない(イミュータブル)', () => {
    const s0 = createDocumentState(makeDoc('旧'));
    executeCommand(s0, { type: 'comment/set', comment: '新' });
    expect(s0.rosenFileData.rosen.comment).toBe('旧');
    expect(s0.changeCount).toBe(0);
    expect(s0.history).toHaveLength(0);
  });
});

describe('Undo / Redo の patch 対称性', () => {
  it('Undo で元のコメントに戻り、Redo で再適用される', () => {
    const s0 = createDocumentState(makeDoc('旧'));
    const s1 = executeCommand(s0, { type: 'comment/set', comment: '新' });
    expect(s1.rosenFileData.rosen.comment).toBe('新');

    const s2 = undo(s1);
    expect(s2.rosenFileData.rosen.comment).toBe('旧');
    expect(canUndo(s2)).toBe(false);
    expect(canRedo(s2)).toBe(true);

    const s3 = redo(s2);
    expect(s3.rosenFileData.rosen.comment).toBe('新');
    expect(canUndo(s3)).toBe(true);
    expect(canRedo(s3)).toBe(false);
  });

  it('新規コマンドは Redo スタックをクリアする', () => {
    const s0 = createDocumentState(makeDoc('旧'));
    const s1 = executeCommand(s0, { type: 'comment/set', comment: 'A' });
    const s2 = undo(s1);
    expect(canRedo(s2)).toBe(true);
    const s3 = executeCommand(s2, { type: 'comment/set', comment: 'B' });
    expect(canRedo(s3)).toBe(false);
    expect(s3.rosenFileData.rosen.comment).toBe('B');
  });

  it('100 回の連続編集 → 100 回 Undo → 100 回 Redo で破綻しない', () => {
    let s = createDocumentState(makeDoc('0'));
    for (let i = 1; i <= 100; i++) {
      s = executeCommand(s, { type: 'comment/set', comment: String(i) });
    }
    expect(s.rosenFileData.rosen.comment).toBe('100');
    for (let i = 0; i < 100; i++) s = undo(s);
    expect(s.rosenFileData.rosen.comment).toBe('0');
    expect(canUndo(s)).toBe(false);
    for (let i = 0; i < 100; i++) s = redo(s);
    expect(s.rosenFileData.rosen.comment).toBe('100');
    expect(canRedo(s)).toBe(false);
  });
});

describe('変更カウンタ(原典仕様: 保存0 / 変更+1 / Undo-1 / 負から編集で INT_MAX)', () => {
  it('読込直後は 0(保存済み)', () => {
    const s0 = createDocumentState(makeDoc());
    expect(s0.changeCount).toBe(0);
    expect(isDirty(s0)).toBe(false);
  });

  it('変更で +1、Undo で -1', () => {
    const s0 = createDocumentState(makeDoc());
    const s1 = executeCommand(s0, { type: 'comment/set', comment: 'A' });
    expect(s1.changeCount).toBe(1);
    const s2 = executeCommand(s1, { type: 'comment/set', comment: 'B' });
    expect(s2.changeCount).toBe(2);
    const s3 = undo(s2);
    expect(s3.changeCount).toBe(1);
    const s4 = undo(s3);
    expect(s4.changeCount).toBe(0);
    expect(isDirty(s4)).toBe(false); // 保存状態に戻った
  });

  it('Redo で +1', () => {
    const s0 = createDocumentState(makeDoc());
    const s1 = executeCommand(s0, { type: 'comment/set', comment: 'A' });
    const s2 = undo(s1);
    expect(s2.changeCount).toBe(0);
    const s3 = redo(s2);
    expect(s3.changeCount).toBe(1);
  });

  it('保存で 0 に、以後の変更で再び +1', () => {
    const s0 = createDocumentState(makeDoc());
    const s1 = executeCommand(s0, { type: 'comment/set', comment: 'A' });
    expect(s1.changeCount).toBe(1);
    const s2 = markSaved(s1);
    expect(s2.changeCount).toBe(0);
    expect(isDirty(s2)).toBe(false);
    const s3 = executeCommand(s2, { type: 'comment/set', comment: 'B' });
    expect(s3.changeCount).toBe(1);
  });

  it('保存 → Undo で負 → 編集で INT_MAX(未保存扱いを維持)', () => {
    const s0 = createDocumentState(makeDoc());
    const s1 = executeCommand(s0, { type: 'comment/set', comment: 'A' });
    const s2 = markSaved(s1); // 保存済み(count=0)
    const s3 = undo(s2); // 保存状態から Undo → -1(負)
    expect(s3.changeCount).toBe(-1);
    expect(isDirty(s3)).toBe(true); // 負でも未保存扱い
    const s4 = executeCommand(s3, { type: 'comment/set', comment: 'C' });
    expect(s4.changeCount).toBe(INT_MAX); // 負状態からの編集は INT_MAX
    expect(isDirty(s4)).toBe(true);
  });
});
