// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 up-tri

// 旧世代リーダー(S09 / S05 / S00 / OuDia.1.02)の読込・境界検証(M1 完了条件 #1)。
// 旧世代は現行 FileType では書き出さないためバイト一致(往復)は対象外。読込結果のモデルを検証する。

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseNodeTree, readRosenFile } from '../index.js';
import type { RosenFileData } from '../model/rosenFileData.js';

const here = dirname(fileURLToPath(import.meta.url));
const fixtures = join(here, '..', '..', 'fixtures', 'oldgen');

function load(rel: string): RosenFileData {
  const bytes = new Uint8Array(readFileSync(join(fixtures, rel)));
  const parsed = parseNodeTree(bytes);
  if (!parsed.ok) throw new Error(`parse failed: ${rel} (code ${String(parsed.code)})`);
  return readRosenFile(parsed.root).data;
}

describe('S09(OuDiaSecond.1.09、現行のサブセット)', () => {
  const d = load('oudiasecond-1.09.oud2');

  it('エラーなく読め、FileType を保持する', () => {
    expect(d.sourceFileType).toBe('OuDiaSecond.1.09');
    expect(d.rosen.rosenmei).toBe('テスト線');
  });

  it('$番線 が honored される(現行と同一デコード)', () => {
    const train = d.rosen.diaCont[0]!.ressyaCont[0][0]!;
    // 駅0: `1;/500$1` → teisya, hatsu 05:00:00, track 1。
    expect(train.ekiJikokuCont[0]!.ekiatsukai).toBe('teisya');
    expect(train.ekiJikokuCont[0]!.hatsuJikoku).toBe(18000);
    expect(train.ekiJikokuCont[0]!.ressyaTrackIndex).toBe(1);
    // 駅1: `1;530/` → chaku 05:30:00、番線指定なし → 主本線 0。
    expect(train.ekiJikokuCont[1]!.chakuJikoku).toBe(19800);
    expect(train.ekiJikokuCont[1]!.ressyaTrackIndex).toBe(0);
  });

  it('欠落キーは現行既定(hidden/canceled=false)', () => {
    expect(d.rosen.ressyasyubetsuCont[0]!.hidden).toBe(false);
    expect(d.rosen.diaCont[0]!.ressyaCont[0][0]!.isCanceled).toBe(false);
    expect(d.rosen.kijunDiaIndex).toBe(0);
    expect(d.rosen.disableHiddenSyubetsu).toBe(false);
  });
});

describe('S05(OuDiaSecond.1.01–1.05)', () => {
  const d = load('oudiasecond-1.05.oud2');

  it('エラーなく読め、FileType を保持する', () => {
    expect(d.sourceFileType).toBe('OuDiaSecond.1.05');
  });

  it('DownMain/UpMain は 1 起点 → 0 起点(−1)', () => {
    // A駅: DownMain=1→0, UpMain=2→1。B駅: DownMain=1→0, UpMain=1→0。
    expect(d.rosen.ekiCont[0]!.downMain).toBe(0);
    expect(d.rosen.ekiCont[0]!.upMain).toBe(1);
    expect(d.rosen.ekiCont[1]!.downMain).toBe(0);
    expect(d.rosen.ekiCont[1]!.upMain).toBe(0);
  });

  it('番線は RessyaTrack= から 1 起点でマージされる', () => {
    const train = d.rosen.diaCont[0]!.ressyaCont[0][0]!;
    // RessyaTrack=2,1: 駅0 番線 2(size 2)→ 1、駅1 番線 1(size 1)→ 0。
    expect(train.ekiJikokuCont[0]!.ressyaTrackIndex).toBe(1);
    expect(train.ekiJikokuCont[1]!.ressyaTrackIndex).toBe(0);
    // EkiJikoku に $ はない。時刻は正しく decode される。
    expect(train.ekiJikokuCont[0]!.hatsuJikoku).toBe(18000);
    expect(train.ekiJikokuCont[1]!.chakuJikoku).toBe(19800);
  });

  it('EnableOperation 非空 → 2', () => {
    expect(d.rosen.enableOperation).toBe(2);
  });

  it('着発表示・番線省略フラグは keisiki から導出される', () => {
    // A駅 Hatsuchaku → 両方向着発表示 true、番線省略 false。
    const a = d.rosen.ekiCont[0]!;
    expect(a.jikokuhyouJikokuDisplayKudari).toEqual({ chaku: true, hatsu: true });
    expect(a.jikokuhyouJikokuDisplayNobori).toEqual({ chaku: true, hatsu: true });
    expect(a.jikokuhyouTrackOmit).toBe(false);
    // B駅 NoboriChaku → 下り{chaku:false,hatsu:true} 上り{chaku:true,hatsu:false}。
    const b = d.rosen.ekiCont[1]!;
    expect(b.jikokuhyouJikokuDisplayKudari).toEqual({ chaku: false, hatsu: true });
    expect(b.jikokuhyouJikokuDisplayNobori).toEqual({ chaku: true, hatsu: false });
  });

  it('EkimeiJikokuRyaku / EkimeiDiaRyaku は空注入', () => {
    expect(d.rosen.ekiCont[0]!.ekimeiJikokuRyaku).toBe('');
    expect(d.rosen.ekiCont[0]!.ekimeiDiaRyaku).toBe('');
  });
});

describe('S00(OuDiaSecond.1.00)', () => {
  const d = load('oudiasecond-1.00.oud2');

  it('エラーなく読め、FileType を保持する', () => {
    expect(d.sourceFileType).toBe('OuDiaSecond.1.00');
  });

  it('空 Ekimei → "00"', () => {
    expect(d.rosen.ekiCont[0]!.ekimei).toBe('00');
    expect(d.rosen.ekiCont[1]!.ekimei).toBe('B駅');
  });

  it('EkiTrack2Cont なし → 空、DownMain/UpMain 既定 0/1', () => {
    expect(d.rosen.ekiCont[0]!.ekiTrack2Cont.length).toBe(0);
    expect(d.rosen.ekiCont[0]!.downMain).toBe(0);
    expect(d.rosen.ekiCont[0]!.upMain).toBe(1);
  });

  it('番線は主本線($ なし)。下り列車 → 0', () => {
    const train = d.rosen.diaCont[0]!.ressyaCont[0][0]!;
    expect(train.ekiJikokuCont.every((e) => e.ressyaTrackIndex === 0)).toBe(true);
    expect(train.ekiJikokuCont[0]!.hatsuJikoku).toBe(18000);
  });

  it('着発表示フラグは keisiki から導出される', () => {
    // 駅0 Hatsuchaku。
    expect(d.rosen.ekiCont[0]!.jikokuhyouJikokuDisplayKudari).toEqual({ chaku: true, hatsu: true });
  });
});

describe('OuDia.1.02(SJIS 無 BOM、S00 経路)', () => {
  const d = load('oudia-1.02.oud');

  it('SJIS がデコードされ、エラーなく読める(FileType 保持)', () => {
    expect(d.sourceFileType).toBe('OuDia.1.02');
    // mojibake なら日本語が壊れる。
    expect(d.rosen.rosenmei).toBe('テスト線');
    expect(d.rosen.ekiCont[0]!.ekimei).toBe('起点');
  });

  it('Kyoukaisen からの分岐駅推定(基幹駅 index + 主要駅昇格)', () => {
    // 駅1(分岐, KudariChaku, Kyoukaisen)→ 下方向の同名 Hatsuchaku(駅2)を基幹駅に。
    const eki = d.rosen.ekiCont;
    expect(eki[1]!.ekimei).toBe('分岐');
    expect(eki[1]!.brunchCoreEkiIndex).toBe(2);
    expect(eki[1]!.ekikibo).toBe('syuyou');
    expect(eki[2]!.ekikibo).toBe('syuyou');
    // 起点・終点は一般駅のまま。
    expect(eki[0]!.ekikibo).toBe('ippan');
    expect(eki[3]!.ekikibo).toBe('ippan');
  });
});
