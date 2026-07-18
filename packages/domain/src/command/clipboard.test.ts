// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 up-tri

// 列単位コピー/貼り付けの純ロジック(累積移動量)。原典 modifyRessyaBangou/Gou/RessyaJikoku 照合。

import type { RosenFileData } from '@oudia-web/format';
import { parseNodeTree, readRosenFile, writeOud2 } from '@oudia-web/format';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { getEkiJikoku } from '../runRange.js';
import {
    addToTrailingNumber,
    computePasteTrains,
    copyRessyaToClipboard,
    NO_PASTE_IDOURYOU,
} from './clipboard.js';
import { createDocumentState, executeCommand, undo } from './engine.js';

const here = dirname(fileURLToPath(import.meta.url));
const fixtures = join(here, '..', '..', '..', 'format', 'fixtures');
function loadDoc(rel: string): RosenFileData {
  const bytes = new Uint8Array(readFileSync(join(fixtures, rel)));
  const parsed = parseNodeTree(bytes);
  if (!parsed.ok) throw new Error('parse');
  return readRosenFile(parsed.root).data;
}

describe('addToTrailingNumber(文字列数値への加算)', () => {
  it('末尾数字に加算する', () => {
    expect(addToTrailingNumber('101', 2, true)).toBe('103');
    expect(addToTrailingNumber('101', 2, false)).toBe('103');
  });

  it('列車番号はゼロ詰め(元の桁数を保つ)', () => {
    expect(addToTrailingNumber('007', 1, true)).toBe('008');
    expect(addToTrailingNumber('099', 1, true)).toBe('100'); // 桁あふれは自然幅
  });

  it('号数はゼロ詰めしない', () => {
    expect(addToTrailingNumber('007', 1, false)).toBe('8');
  });

  it('末尾側の連続数字ブロックだけ動かし、接頭辞・接尾辞を保持する', () => {
    // 右端から最初に見つかる数字ブロックが対象(原典 idxNumBottom→idxNumTop)。
    // "1M23" → 末尾ブロックは "23"、先頭 1M は保持 → "1M25"。
    expect(addToTrailingNumber('1M23', 2, true)).toBe('1M25');
    // "101A" → 右端から最初の数字は "1"(101)、その後の "A" は接尾辞として保持 → "103A"。
    expect(addToTrailingNumber('101A', 2, true)).toBe('103A');
  });

  it('数字が無ければ変更しない', () => {
    expect(addToTrailingNumber('あさかぜ', 5, true)).toBe('あさかぜ');
    expect(addToTrailingNumber('', 5, true)).toBe('');
  });

  it('負の結果は 0 に切り上げ', () => {
    expect(addToTrailingNumber('003', -10, true)).toBe('000');
    expect(addToTrailingNumber('3', -10, false)).toBe('0');
  });

  it('全角数字は全角のまま戻す', () => {
    expect(addToTrailingNumber('１０１', 2, false)).toBe('１０３');
    expect(addToTrailingNumber('００７', 1, true)).toBe('００８');
  });

  it('shift 0 は恒等', () => {
    expect(addToTrailingNumber('101', 0, true)).toBe('101');
  });
});

describe('copyRessyaToClipboard', () => {
  it('深いコピーを取り、累積を 0 リセットする', () => {
    const data = loadDoc('current/sample2.oud2');
    const src = data.rosen.diaCont[0]!.ressyaCont[0].slice(0, 2);
    const clip = copyRessyaToClipboard(src, 0);
    expect(clip.trains).toHaveLength(2);
    expect(clip.accum).toEqual(NO_PASTE_IDOURYOU);
    // 深いコピー: 元を書き換えてもクリップボードは不変。
    const orig = clip.trains[0]!.ressyabangou;
    src[0]!.ressyabangou = 'MUTATED';
    expect(clip.trains[0]!.ressyabangou).toBe(orig);
  });
});

describe('computePasteTrains(累積移動量)', () => {
  it('空クリップボードは null', () => {
    const clip = copyRessyaToClipboard([], 0);
    expect(computePasteTrains(clip)).toBeNull();
  });

  it('移動量 0 は列車をそのまま複製する', () => {
    const data = loadDoc('current/sample2.oud2');
    const src = data.rosen.diaCont[0]!.ressyaCont[0].slice(0, 1);
    const clip = copyRessyaToClipboard(src, 0);
    const r = computePasteTrains(clip, NO_PASTE_IDOURYOU);
    expect(r).not.toBeNull();
    expect(r!.trains[0]!.ressyabangou).toBe(src[0]!.ressyabangou);
  });

  it('パターンダイヤ: +600 秒を 3 回連続貼り付けで +600/+1200/+1800', () => {
    const data = loadDoc('current/sample2.oud2');
    // 発時刻を持つ列車を 1 本コピー。
    const list = data.rosen.diaCont[0]!.ressyaCont[0];
    const train = list[0]!;
    // 最初の非 null 発時刻を基準にする。
    let baseHatsu: number | null = null;
    let order = -1;
    for (let o = 0; o < train.ekiJikokuCont.length; o++) {
      const h = getEkiJikoku(train, o).hatsuJikoku;
      if (h !== null) {
        baseHatsu = h;
        order = o;
        break;
      }
    }
    expect(baseHatsu).not.toBeNull();

    const idouryou = { jikanSeconds: 600, ressyabangou: 0, gousuu: 0 };
    let clip = copyRessyaToClipboard([train], 0);

    const offsets = [600, 1200, 1800];
    for (const expected of offsets) {
      const r = computePasteTrains(clip, idouryou);
      expect(r).not.toBeNull();
      const h = getEkiJikoku(r!.trains[0]!, order).hatsuJikoku as number;
      expect(h).toBe((baseHatsu! + expected) % 86400);
      clip = r!.clipboard; // 累積が進んだクリップボードを再利用
    }
  });

  it('列車番号・号数の累積加算(2 回目は 2×)', () => {
    const data = loadDoc('current/sample2.oud2');
    // 数字を含む列車番号を持つ列車を探す。
    const list = data.rosen.diaCont[0]!.ressyaCont[0];
    const train = list.find((r) => /\d/.test(r.ressyabangou));
    if (train === undefined) return; // 数字入り番号がなければスキップ。
    const m = /(\d+)(?!.*\d)/.exec(train.ressyabangou);
    const baseNum = parseInt(m![1]!, 10);

    const idouryou = { jikanSeconds: 0, ressyabangou: 2, gousuu: 0 };
    let clip = copyRessyaToClipboard([train], 0);

    const r1 = computePasteTrains(clip, idouryou)!;
    const n1 = parseInt(/(\d+)(?!.*\d)/.exec(r1.trains[0]!.ressyabangou)![1]!, 10);
    expect(n1).toBe(baseNum + 2);
    clip = r1.clipboard;

    const r2 = computePasteTrains(clip, idouryou)!;
    const n2 = parseInt(/(\d+)(?!.*\d)/.exec(r2.trains[0]!.ressyabangou)![1]!, 10);
    expect(n2).toBe(baseNum + 4);
  });
});

describe('コピー → 貼り付け → replaceRange(コマンド結合)', () => {
  it('貼り付けは focus 位置に N 本挿入する(列車数 +N)', () => {
    const data = loadDoc('current/sample2.oud2');
    const before = data.rosen.diaCont[0]!.ressyaCont[0].length;
    const src = data.rosen.diaCont[0]!.ressyaCont[0].slice(0, 2);
    const clip = copyRessyaToClipboard(src, 0);
    const paste = computePasteTrains(clip)!;

    const s1 = executeCommand(createDocumentState(data), {
      type: 'ressya/replaceRange',
      diaIndex: 0,
      houkou: 0,
      index: 1,
      count: 0,
      trains: paste.trains,
    });
    expect(s1.rosenFileData.rosen.diaCont[0]!.ressyaCont[0].length).toBe(before + 2);
  });

  it('貼り付け(移動量 0)→ Undo で元ファイルとバイト一致', () => {
    const ORIGINAL = new Uint8Array(readFileSync(join(fixtures, 'current', 'sample2.oud2')));
    const parsed = parseNodeTree(ORIGINAL);
    if (!parsed.ok) throw new Error('parse');
    const doc = readRosenFile(parsed.root).data;
    const src = doc.rosen.diaCont[0]!.ressyaCont[0].slice(0, 1);
    const clip = copyRessyaToClipboard(src, 0);
    const paste = computePasteTrains(clip)!;

    const s0 = createDocumentState(doc);
    const s1 = executeCommand(s0, {
      type: 'ressya/replaceRange',
      diaIndex: 0,
      houkou: 0,
      index: 0,
      count: 0,
      trains: paste.trains,
    });
    const s2 = undo(s1);
    const out = writeOud2(s2.rosenFileData);
    expect(Buffer.from(out).equals(Buffer.from(ORIGINAL))).toBe(true);
  });
});
