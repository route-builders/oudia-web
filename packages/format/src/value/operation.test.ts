// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 up-tri

// 根拠: docs/analysis/03_file-format.md §6.4、docs/design/04_file-io.md §3.5
// 原典: entDed/CconvCentDed.cpp(CentDedBefore/AfterOperationCont_From/To_string)

import { describe, expect, it } from 'vitest';
import type { OperationEntry, OperationKeyStore } from './operation.js';
import {
    decodeAfterOperationCont,
    decodeBeforeOperationCont,
    encodeAfterOperationCont,
    encodeBeforeOperationCont,
} from './operation.js';

/** OperationEntry[] を側テーブルにする(encode → store → decode の往復テスト用)。 */
function storeOf(entries: OperationEntry[]): OperationKeyStore {
  const map = new Map(entries.map((e) => [e.path, e.value]));
  return { get: (path) => map.get(path) };
}

describe('前作業 decode/encode', () => {
  it('出区(out): 3/出区時刻$連携コード/運番', () => {
    const store = storeOf([{ path: '13B', value: '3/500$AB/101' }]);
    const cont = decodeBeforeOperationCont(store, '13B', 4, 2);
    expect(cont).toHaveLength(1);
    const op = cont[0]!;
    expect(op.kind).toBe('out');
    if (op.kind === 'out') {
      expect(op.outJikoku).toBe(5 * 3600);
      expect(op.inOutLinkCode).toBe('AB');
      expect(op.operationNumbers).toEqual(['101']);
    }
    // encode 往復
    const entries = encodeBeforeOperationCont(cont, '13B');
    expect(entries).toEqual([{ path: '13B', value: '3/500$AB/101' }]);
  });

  it('前列車接続(junction): 5/起点時刻$仮運番(;連結)', () => {
    const store = storeOf([{ path: '0B', value: '5/459$1;2' }]);
    const cont = decodeBeforeOperationCont(store, '0B', 4, 0);
    const op = cont[0]!;
    expect(op.kind).toBe('junction');
    if (op.kind === 'junction') {
      expect(op.kitenJikoku).toBe(4 * 3600 + 59 * 60);
      expect(op.kariOperationNumbers).toEqual(['1', '2']);
    }
    expect(encodeBeforeOperationCont(cont, '0B')).toEqual([{ path: '0B', value: '5/459$1;2' }]);
  });

  it('運用番号変更(numberChange): 空は順反転(空配列)', () => {
    const store = storeOf([{ path: '5B', value: '6/' }]);
    const cont = decodeBeforeOperationCont(store, '5B', 4, 0);
    const op = cont[0]!;
    expect(op.kind).toBe('numberChange');
    if (op.kind === 'numberChange') expect(op.operationNumbers).toEqual([]);
    expect(encodeBeforeOperationCont(cont, '5B')).toEqual([{ path: '5B', value: '6/' }]);
  });
});

describe('後作業 decode/encode', () => {
  it('次列車接続(junction): 5/終点時刻$接続タイプ', () => {
    const store = storeOf([{ path: '13A', value: '5/1200$2' }]);
    const cont = decodeAfterOperationCont(store, '13A', 4, 0);
    const op = cont[0]!;
    expect(op.kind).toBe('junction');
    if (op.kind === 'junction') {
      expect(op.syuutenJikoku).toBe(12 * 3600);
      expect(op.junctionType).toBe('propertyChange'); // 2
    }
    expect(encodeAfterOperationCont(cont, '13A')).toEqual([{ path: '13A', value: '5/1200$2' }]);
  });

  it('入区(in): 3/入区時刻$連携コード', () => {
    const store = storeOf([{ path: '13A', value: '3/1230$XY' }]);
    const cont = decodeAfterOperationCont(store, '13A', 4, 0);
    const op = cont[0]!;
    expect(op.kind).toBe('in');
    expect(encodeAfterOperationCont(cont, '13A')).toEqual([{ path: '13A', value: '3/1230$XY' }]);
  });
});

describe('入れ子作業(解結 → 子後作業列)', () => {
  it('release の子キー Operation{path}.{idx}A を再帰 decode/encode する', () => {
    // 前作業列 13B に「解結(2)」があり、その解結編成の後作業列 13B.0A に「次列車接続」。
    const store = storeOf([
      { path: '13B', value: '2/0$1/1000' },
      { path: '13B.0A', value: '5/1100$1' },
    ]);
    const cont = decodeBeforeOperationCont(store, '13B', 4, 0);
    expect(cont).toHaveLength(1);
    const op = cont[0]!;
    expect(op.kind).toBe('release');
    if (op.kind === 'release') {
      expect(op.formationAfterOperationCont).toHaveLength(1);
      expect(op.formationAfterOperationCont[0]!.kind).toBe('junction');
    }
    // encode は親列 → 子列の順(原典の出力順)。
    const entries = encodeBeforeOperationCont(cont, '13B');
    expect(entries).toEqual([
      { path: '13B', value: '2/0$1/1000' },
      { path: '13B.0A', value: '5/1100$1' },
    ]);
  });
});
