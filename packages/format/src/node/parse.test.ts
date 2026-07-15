// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 oudia-second-web contributors

// 根拠: docs/analysis/03_file-format.md §2、docs/design/04_file-io.md §3.3
// 原典: libs/OuLib/Str/OuPropertiesText/CConvNodeContainer.cpp (decodeNodeContainer / getLine)

import { describe, it, expect } from 'vitest';
import { parsePropertiesText } from './parse.js';
import { serializePropertiesText } from './serialize.js';
import { isDirectory, isProperty } from './types.js';
import type { PtDirectory } from './types.js';

/** 入力を LF 区切りに正規化して parse する(テスト記述の便宜)。 */
function parseOk(text: string): PtDirectory {
  const r = parsePropertiesText(text);
  if (!r.ok) throw new Error(`parse failed: ${r.reason}`);
  return r.root;
}

describe('parsePropertiesText: 行種別の判定', () => {
  it('プロパティ行を Key=Value に分割する', () => {
    const root = parseOk('Rosenmei=サンプル線\n');
    expect(root.children).toHaveLength(1);
    const p = root.children[0]!;
    expect(isProperty(p)).toBe(true);
    if (isProperty(p)) {
      expect(p.name).toBe('Rosenmei');
      expect(p.value).toBe('サンプル線');
    }
  });

  it('= を含まない非ディレクトリ行は「名前のみ・値空」のプロパティ', () => {
    const root = parseOk('LoneName\n');
    const p = root.children[0]!;
    expect(isProperty(p) && p.name).toBe('LoneName');
    expect(isProperty(p) && p.value).toBe('');
  });

  it('値に = を含む場合は最初の = で分割する', () => {
    const root = parseOk('Font=Point=10;Bold=1\n');
    const p = root.children[0]!;
    expect(isProperty(p) && p.name).toBe('Font');
    expect(isProperty(p) && p.value).toBe('Point=10;Bold=1');
  });

  it('空値プロパティ(= の後が空)を許容する', () => {
    const root = parseOk('KudariDiaAlias=\n');
    const p = root.children[0]!;
    expect(isProperty(p) && p.value).toBe('');
  });

  it('空行は読み飛ばす', () => {
    const root = parseOk('A=1\n\n\nB=2\n');
    expect(root.children).toHaveLength(2);
  });

  it('ディレクトリ開始(末尾 . かつ = なし)と終端(. のみ)を認識する', () => {
    const root = parseOk('Rosen.\nRosenmei=X\n.\n');
    expect(root.children).toHaveLength(1);
    const d = root.children[0]!;
    expect(isDirectory(d)).toBe(true);
    if (isDirectory(d)) {
      expect(d.name).toBe('Rosen');
      expect(d.children).toHaveLength(1);
      expect(isProperty(d.children[0]!) && (d.children[0] as { name: string }).name).toBe(
        'Rosenmei',
      );
    }
  });

  it('ネストしたディレクトリを正しく構築する', () => {
    const root = parseOk('Eki.\nEkiTrack2Cont.\nEkiTrack2.\nTrackName=1\n.\n.\n.\n');
    const eki = root.children[0]!;
    expect(isDirectory(eki)).toBe(true);
    if (isDirectory(eki)) {
      const cont = eki.children[0]!;
      expect(isDirectory(cont) && cont.name).toBe('EkiTrack2Cont');
      if (isDirectory(cont)) {
        const track = cont.children[0]!;
        expect(isDirectory(track) && track.name).toBe('EkiTrack2');
      }
    }
  });
});

describe('parsePropertiesText: 同名キーの出現順保存', () => {
  it('同名プロパティを出現順に配列で保持する', () => {
    const root = parseOk('F=a\nF=b\nF=c\n');
    expect(root.children).toHaveLength(3);
    const values = root.children.map((n) => (isProperty(n) ? n.value : null));
    expect(values).toEqual(['a', 'b', 'c']);
  });

  it('同名ディレクトリ(Eki.×n)を出現順に保持する', () => {
    const root = parseOk('Eki.\nEkimei=A\n.\nEki.\nEkimei=B\n.\n');
    expect(root.children).toHaveLength(2);
    const names = root.children.flatMap((n) =>
      isDirectory(n) ? n.children.map((c) => (isProperty(c) ? c.value : '')) : [],
    );
    expect(names).toEqual(['A', 'B']);
  });
});

describe('parsePropertiesText: EOF・エラー挙動', () => {
  it('閉じ忘れディレクトリ(子ありで EOF)は受理する', () => {
    // 原典: 対応する . がないまま EOF に達しても通常エラーにならない。
    const r = parsePropertiesText('Rosen.\nRosenmei=X\nEki.\nEkimei=A\n');
    expect(r.ok).toBe(true);
  });

  it('トップレベルに現れた . は Container Aborted エラー(-1)', () => {
    // 原典: トップレベル解釈後に . が残る → -1。
    const r = parsePropertiesText('A=1\n.\n');
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe(-1);
      expect(r.reason).toBe('containerAborted');
    }
  });

  it('ディレクトリ開始行がファイル末尾(以降に何もない)なら Container Not Closed', () => {
    // 原典: 子の decodeNodeContainer が「開始位置が既に末尾」で 0 を返す場合のみ NotClosed。
    const r = parsePropertiesText('Rosen.\n');
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe('containerNotClosed');
    }
  });

  it('空文字列は空のルートツリー', () => {
    const root = parseOk('');
    expect(root.children).toHaveLength(0);
  });
});

describe('parse → serialize: ツリー往復', () => {
  it('正規形テキストは parse → serialize で元テキスト(CRLF)に戻る', () => {
    // LF 入力を CRLF 出力に変換する点に注意(serialize は常に CRLF)。
    const lf = 'FileType=OuDiaSecond.1.17\nRosen.\nRosenmei=X\n.\nDispProp.\n.\n';
    const crlf = lf.replaceAll('\n', '\r\n');
    const root = parseOk(lf);
    expect(serializePropertiesText(root)).toBe(crlf);
  });
});
