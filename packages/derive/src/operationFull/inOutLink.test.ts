// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 up-tri

/**
 * 入出区連携コードの状態機械(inOutLink.ts)の単体テスト。M7c-2 PR-2。
 * iStatus 0/1/2/3 の遷移、起点跨ぎ無効時の時刻検査、重複時の無効化を検証する。
 */

import { asSeconds } from '@oudia-web/format';
import { describe, expect, it } from 'vitest';
import type { OpRef } from '../operationLight/types.js';
import { type InOutLinkElement, insertInOutLinkCodeElement } from './inOutLink.js';
import type { InOutLinkCodeEntry } from './types.js';

const J = (h: number, m = 0) => asSeconds(h * 3600 + m * 60);

const ref = (ressyaIndex: number, opKind: 'before' | 'after'): OpRef => ({
  houkou: 0,
  ressyaIndex,
  ekiOrder: 0,
  opKind,
  iLevel: [0],
});

const outEl = (ressyaIndex: number, jikoku: ReturnType<typeof J>): InOutLinkElement => ({
  ref: ref(ressyaIndex, 'before'),
  ressyaProperty: { houkou: 0, ressyaIndex, jikoku },
  isOut: true,
});

const inEl = (ressyaIndex: number, jikoku: ReturnType<typeof J>): InOutLinkElement => ({
  ref: ref(ressyaIndex, 'after'),
  ressyaProperty: { houkou: 0, ressyaIndex, jikoku },
  isOut: false,
});

function newMap(): Map<string, InOutLinkCodeEntry> {
  return new Map<string, InOutLinkCodeEntry>();
}

describe('insertInOutLinkCodeElement', () => {
  it('出区だけなら iStatus=0', () => {
    const m = newMap();
    insertInOutLinkCodeElement(m, 'A', outEl(0, J(7)), true, null);
    expect(m.get('A')?.status).toBe(0);
    expect(m.get('A')?.outRessyaProperties).toHaveLength(1);
    expect(m.get('A')?.beforeOperation).not.toBeNull();
  });

  it('入区だけなら iStatus=1', () => {
    const m = newMap();
    insertInOutLinkCodeElement(m, 'A', inEl(0, J(22)), true, null);
    expect(m.get('A')?.status).toBe(1);
    expect(m.get('A')?.inRessyaProperties).toHaveLength(1);
  });

  it('入区 → 出区 でペア成立(iStatus=2)', () => {
    const m = newMap();
    insertInOutLinkCodeElement(m, 'A', inEl(0, J(22)), true, null);
    insertInOutLinkCodeElement(m, 'A', outEl(1, J(23)), true, null);
    const e = m.get('A');
    expect(e?.status).toBe(2);
    expect(e?.beforeOperation?.ressyaIndex).toBe(1);
  });

  it('出区 → 入区 でもペア成立(iStatus=2)', () => {
    const m = newMap();
    insertInOutLinkCodeElement(m, 'A', outEl(0, J(23)), true, null);
    insertInOutLinkCodeElement(m, 'A', inEl(1, J(22)), true, null);
    expect(m.get('A')?.status).toBe(2);
  });

  it('出区が 2 本なら無効(iStatus=3、beforeOperation は null 化)', () => {
    const m = newMap();
    insertInOutLinkCodeElement(m, 'A', outEl(0, J(7)), true, null);
    insertInOutLinkCodeElement(m, 'A', outEl(1, J(8)), true, null);
    const e = m.get('A');
    expect(e?.status).toBe(3);
    expect(e?.beforeOperation).toBeNull();
    expect(e?.outRessyaProperties).toHaveLength(2);
  });

  it('入区が 2 本なら無効(iStatus=3)', () => {
    const m = newMap();
    insertInOutLinkCodeElement(m, 'A', inEl(0, J(22)), true, null);
    insertInOutLinkCodeElement(m, 'A', inEl(1, J(23)), true, null);
    const e = m.get('A');
    expect(e?.status).toBe(3);
    expect(e?.inRessyaProperties).toHaveLength(2);
  });

  it('ペア成立後にさらに出区が来ると無効(iStatus=3)', () => {
    const m = newMap();
    insertInOutLinkCodeElement(m, 'A', inEl(0, J(22)), true, null);
    insertInOutLinkCodeElement(m, 'A', outEl(1, J(23)), true, null);
    insertInOutLinkCodeElement(m, 'A', outEl(2, J(23, 30)), true, null);
    expect(m.get('A')?.status).toBe(3);
    expect(m.get('A')?.beforeOperation).toBeNull();
  });

  it('無効(3)になった後の追加は一覧にだけ積まれる', () => {
    const m = newMap();
    insertInOutLinkCodeElement(m, 'A', outEl(0, J(7)), true, null);
    insertInOutLinkCodeElement(m, 'A', outEl(1, J(8)), true, null);
    insertInOutLinkCodeElement(m, 'A', outEl(2, J(9)), true, null);
    insertInOutLinkCodeElement(m, 'A', inEl(3, J(22)), true, null);
    const e = m.get('A');
    expect(e?.status).toBe(3);
    expect(e?.outRessyaProperties).toHaveLength(3);
    expect(e?.inRessyaProperties).toHaveLength(1);
  });

  describe('起点跨ぎ接続が無効(operationCrossKitenJikoku=false)のときの時刻検査', () => {
    it('入区 → 出区: 出区が入区以降ならペア成立', () => {
      const m = newMap();
      insertInOutLinkCodeElement(m, 'A', inEl(0, J(22)), false, null);
      insertInOutLinkCodeElement(m, 'A', outEl(1, J(23)), false, null);
      expect(m.get('A')?.status).toBe(2);
    });

    it('入区 → 出区: 出区が入区より前なら無効', () => {
      const m = newMap();
      insertInOutLinkCodeElement(m, 'A', inEl(0, J(22)), false, null);
      insertInOutLinkCodeElement(m, 'A', outEl(1, J(6)), false, null);
      const e = m.get('A');
      expect(e?.status).toBe(3);
      // 原典 :8304 は status だけ書き換え、出区は積まない。
      expect(e?.outRessyaProperties).toHaveLength(0);
    });

    it('出区 → 入区: 入区が出区より後なら無効(beforeOperation も落ちる)', () => {
      const m = newMap();
      insertInOutLinkCodeElement(m, 'A', outEl(0, J(6)), false, null);
      insertInOutLinkCodeElement(m, 'A', inEl(1, J(22)), false, null);
      const e = m.get('A');
      expect(e?.status).toBe(3);
      expect(e?.beforeOperation).toBeNull();
    });

    it('起点跨ぎが有効なら時刻を検査しない', () => {
      const m = newMap();
      insertInOutLinkCodeElement(m, 'A', inEl(0, J(22)), true, null);
      insertInOutLinkCodeElement(m, 'A', outEl(1, J(6)), true, null);
      expect(m.get('A')?.status).toBe(2);
    });
  });

  it('空コードは登録しない', () => {
    const m = newMap();
    insertInOutLinkCodeElement(m, '', outEl(0, J(7)), true, null);
    expect(m.size).toBe(0);
  });
});
