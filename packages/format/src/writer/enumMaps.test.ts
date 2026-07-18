// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 up-tri

// 列挙 ⇄ ファイル値の対応表が読み/書きで相互逆写像であることを検証する。
// 書き出しの値ドリフトは T1 バイト一致と原典 OuDia の再読込を同時に壊すため、
// TO_FILE / BY_CODE / TO_CODE が FROM_FILE の厳密な逆であることを固定する。

import { describe, expect, it } from 'vitest';
import {
  DIAGRAM_RESSYAJOUHOU_FROM_FILE,
  DIAGRAM_RESSYAJOUHOU_TO_FILE,
  EKIJIKOKUKEISIKI_FROM_FILE,
  EKIJIKOKUKEISIKI_TO_FILE,
  EKIKIBO_FROM_FILE,
  EKIKIBO_TO_FILE,
  SENSTYLE_FROM_FILE,
  SENSTYLE_TO_FILE,
  STOPMARK_FROM_FILE,
  STOPMARK_TO_FILE,
  TRACKTYPE_BY_CODE,
  TRACKTYPE_TO_CODE,
} from '../reader/enumMaps.js';

describe('TrackType コード ⇄ ユニオンの相互逆写像', () => {
  it('TRACKTYPE_TO_CODE ∘ TRACKTYPE_BY_CODE は恒等', () => {
    for (const [codeStr, type] of Object.entries(TRACKTYPE_BY_CODE)) {
      expect(TRACKTYPE_TO_CODE[type]).toBe(Number(codeStr));
    }
  });
  it('TRACKTYPE_BY_CODE ∘ TRACKTYPE_TO_CODE は恒等', () => {
    for (const [type, code] of Object.entries(TRACKTYPE_TO_CODE)) {
      expect(TRACKTYPE_BY_CODE[code]).toBe(type);
    }
  });
});

describe('識別子文字列 ⇄ ユニオンの相互逆写像(TO_FILE は FROM_FILE の逆)', () => {
  it('Ekijikokukeisiki', () => {
    for (const [id, union] of Object.entries(EKIJIKOKUKEISIKI_FROM_FILE)) {
      expect(EKIJIKOKUKEISIKI_TO_FILE[union]).toBe(id);
    }
  });
  it('Ekikibo', () => {
    for (const [id, union] of Object.entries(EKIKIBO_FROM_FILE)) {
      expect(EKIKIBO_TO_FILE[union]).toBe(id);
    }
  });
  it('SenStyle', () => {
    for (const [id, union] of Object.entries(SENSTYLE_FROM_FILE)) {
      expect(SENSTYLE_TO_FILE[union]).toBe(id);
    }
  });
  it('StopMarkDrawType', () => {
    for (const [id, union] of Object.entries(STOPMARK_FROM_FILE)) {
      expect(STOPMARK_TO_FILE[union]).toBe(id);
    }
  });
  it('DiagramRessyajouhouHyouji(origin はキー無出力 = null)', () => {
    // 'origin' は書き出さない(null)。それ以外は識別子へ往復。
    expect(DIAGRAM_RESSYAJOUHOU_TO_FILE.origin).toBeNull();
    for (const [id, union] of Object.entries(DIAGRAM_RESSYAJOUHOU_FROM_FILE)) {
      if (union === 'origin') continue; // FROM は _Origin を許容するが TO は null
      expect(DIAGRAM_RESSYAJOUHOU_TO_FILE[union]).toBe(id);
    }
  });
});
