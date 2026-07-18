// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 up-tri

// 現行世代リーダーの検証: 実ファイル sample2.oud2 を readRosenFile で読み、
// RosenFileData の構造(駅・種別・ダイヤ・列車・駅時刻・番線・入れ子作業)が
// 期待どおり構築されることを確認する。
// 根拠: docs/design/04_file-io.md §3、原典 CconvCentDed の読込ロジック。

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseNodeTree } from '../index.js';
import type { RosenFileData } from '../model/rosenFileData.js';
import { readRosenFile } from './index.js';

const here = dirname(fileURLToPath(import.meta.url));
const fixtures = join(here, '..', '..', 'fixtures');

function loadFixture(rel: string): RosenFileData {
  const bytes = new Uint8Array(readFileSync(join(fixtures, rel)));
  const parsed = parseNodeTree(bytes);
  expect(parsed.ok).toBe(true);
  if (!parsed.ok) throw new Error('parse failed');
  return readRosenFile(parsed.root).data;
}

describe('readRosenFile: sample2.oud2(現行世代 1.17)', () => {
  const data = loadFixture('current/sample2.oud2');
  const rosen = data.rosen;

  it('sourceFileType を保持する', () => {
    expect(data.sourceFileType).toBe('OuDiaSecond.1.17');
  });

  it('路線メタ情報を読む', () => {
    expect(rosen.rosenmei).toBe('Ou2ndサンプル線');
    expect(rosen.kudariDiaAlias).toBe('');
    expect(rosen.noboriDiaAlias).toBe('');
    // KitenJikoku=000 → 0 秒。
    expect(rosen.kitenJikoku).toBe(0);
    expect(rosen.diagramDgrYZahyouKyoriDefault).toBe(90);
    expect(rosen.enableOperation).toBe(2);
    // KijunDiaIndex=1(明示)。
    expect(rosen.kijunDiaIndex).toBe(1);
    // OperationCrossKitenJikoku キー欠落 → false。
    expect(rosen.operationCrossKitenJikoku).toBe(false);
    // Comment は複数行(\n エスケープ解除済み)。
    expect(rosen.comment.startsWith('路線概要\n')).toBe(true);
  });

  it('38 駅を読み、駅名・番線・時刻形式を復元する', () => {
    expect(rosen.ekiCont).toHaveLength(38);
    const eki0 = rosen.ekiCont[0];
    expect(eki0).toBeDefined();
    if (!eki0) return;
    expect(eki0.ekimei).toBe('田角');
    expect(eki0.ekimeiJikokuRyaku).toBe('田角');
    expect(eki0.ekimeiDiaRyaku).toBe('田');
    expect(eki0.ekijikokukeisiki).toBe('noboriChaku');
    expect(eki0.ekikibo).toBe('syuyou');
    expect(eki0.downMain).toBe(1);
    expect(eki0.upMain).toBe(1);
    // 4 番線(1〜4番線)。
    expect(eki0.ekiTrack2Cont).toHaveLength(4);
    expect(eki0.ekiTrack2Cont[0]?.trackName).toBe('1番線');
    expect(eki0.ekiTrack2Cont[0]?.trackRyakusyou).toBe('1');
    expect(eki0.ekiTrack2Cont[0]?.trackNoboriRyakusyou).toBe('降1');
    // DiagramTrackOmit=0,0,0,0 → 全 false・番線数と同数。
    expect(eki0.diagramTrackOmit).toEqual([false, false, false, false]);
    // JikokuhyouJikokuDisplayKudari=0,1 → 着 false / 発 true。
    expect(eki0.jikokuhyouJikokuDisplayKudari).toEqual({ chaku: false, hatsu: true });
    expect(eki0.jikokuhyouJikokuDisplayNobori).toEqual({ chaku: true, hatsu: false });
    // 駅 ID は読込順に採番。
    expect(eki0.id).toBe(0);
    expect(rosen.ekiCont[37]?.id).toBe(37);
  });

  it('CrossingCheckRule(平面交差)を駅に復元する', () => {
    const eki0 = rosen.ekiCont[0];
    if (!eki0) return;
    // 田角には複数の交差ルールがある。
    expect(eki0.crossingCheckRuleCont.length).toBeGreaterThan(0);
    const rule0 = eki0.crossingCheckRuleCont[0];
    expect(rule0?.caption).toBe('開通時隔');
    expect(rule0?.enable).toBe(true);
    expect(rule0?.headwaySecond).toBe(90);
    // BeforeFromTrackContentCont=0$0;0$1;0$2;0$3 → 4 番線(type=track)。
    expect(rule0?.beforeFromTrackContentCont).toEqual([
      { trackType: 'track', index: 0 },
      { trackType: 'track', index: 1 },
      { trackType: 'track', index: 2 },
      { trackType: 'track', index: 3 },
    ]);
    // BeforeToTrackContentCont=2$0 → terminal, index 0。
    expect(rule0?.beforeToTrackContentCont).toEqual([{ trackType: 'terminal', index: 0 }]);
  });

  it('13 種別を読み、線スタイル・親種別を復元する', () => {
    expect(rosen.ressyasyubetsuCont).toHaveLength(13);
    const rs0 = rosen.ressyasyubetsuCont[0];
    expect(rs0?.syubetsumei).toBe('各駅停車');
    expect(rs0?.diagramLineStyle.senStyle).toBe('jissen');
  });

  it('2 ダイヤを読み、方向別の列車数を復元する', () => {
    expect(rosen.diaCont).toHaveLength(2);
    const dia0 = rosen.diaCont[0];
    const dia1 = rosen.diaCont[1];
    expect(dia0?.name).toBe('平日ダイヤ');
    expect(dia1?.name).toBe('基準運転時分');
    // Dia[0]: Kudari=16, Nobori=15。
    expect(dia0?.ressyaCont[0]).toHaveLength(16);
    expect(dia0?.ressyaCont[1]).toHaveLength(15);
    // Dia[1]: Kudari=6, Nobori=6。
    expect(dia1?.ressyaCont[0]).toHaveLength(6);
    expect(dia1?.ressyaCont[1]).toHaveLength(6);
    // 既定サイクル秒(欠落 → 600)。
    expect(dia0?.patternDiagramPreviewCycleSecond).toBe(600);
  });

  it('先頭下り列車の属性・駅時刻・番線を復元する', () => {
    const dia0 = rosen.diaCont[0];
    const ressya0 = dia0?.ressyaCont[0][0];
    expect(ressya0).toBeDefined();
    if (!ressya0) return;
    expect(ressya0.isNull).toBe(false);
    expect(ressya0.houkou).toBe(0); // 下り
    expect(ressya0.syubetsuIndex).toBe(4);
    expect(ressya0.ressyabangou).toBe('001');
    expect(ressya0.bikou).toBe('シンプルな分割例');
    // EkiJikoku は 33 要素(駅Order 0..32)。
    expect(ressya0.ekiJikokuCont).toHaveLength(33);
    // 先頭駅時刻: "1;000$2" → 停車・発 00:00:00・番線 index 2。
    const ej0 = ressya0.ekiJikokuCont[0];
    expect(ej0?.ekiatsukai).toBe('teisya');
    expect(ej0?.hatsuJikoku).toBe(0);
    expect(ej0?.ressyaTrackIndex).toBe(2);
  });

  it('入れ子作業(解結 → 次列車接続)を復元する', () => {
    const dia0 = rosen.diaCont[0];
    const ressya0 = dia0?.ressyaCont[0][0];
    if (!ressya0) return;
    // Operation0B=3/2359$/1;2 → 駅Order0 の前作業に「出区」。
    const ej0 = ressya0.ekiJikokuCont[0];
    expect(ej0?.beforeOperationCont).toHaveLength(1);
    const outOp = ej0?.beforeOperationCont[0];
    expect(outOp?.kind).toBe('out');
    if (outOp?.kind === 'out') {
      expect(outOp.operationNumbers).toEqual(['1', '2']);
    }
    // Operation13B=2/0$1/034(駅Order13 の前作業に「解結」)+ 子 Operation13B.0A=5/$2。
    const ej13 = ressya0.ekiJikokuCont[13];
    expect(ej13?.beforeOperationCont).toHaveLength(1);
    const releaseOp = ej13?.beforeOperationCont[0];
    expect(releaseOp?.kind).toBe('release');
    if (releaseOp?.kind === 'release') {
      // 入れ子: 解結編成の後作業に「次列車接続」。
      expect(releaseOp.formationAfterOperationCont).toHaveLength(1);
      expect(releaseOp.formationAfterOperationCont[0]?.kind).toBe('junction');
    }
  });

  it('DispProp を全キー既定つきで読む', () => {
    const dp = data.dispProp;
    // JikokuhyouFont は 8 スロット。
    expect(dp.jikokuhyouFont).toHaveLength(8);
    expect(dp.jikokuhyouFont[0]?.facename).toBe('Meiryo UI');
    expect(dp.jikokuhyouFont[0]?.pointTextHeight).toBe(9);
    expect(dp.jikokuhyouFont[1]?.bold).toBe(true);
    // DiaBackColor は 5 色。
    expect(dp.diaBackColor).toHaveLength(5);
    // JikokuhyouBackColor は 4 色。
    expect(dp.jikokuhyouBackColor).toHaveLength(4);
    // 明示値: EkimeiLength=7, DisplayRessyamei=0, Display2400=1, OperationNumberRows=2。
    expect(dp.ekimeiLength).toBe(7);
    expect(dp.displayRessyamei).toBe(false);
    expect(dp.display2400).toBe(true);
    expect(dp.operationNumberRows).toBe(2);
    expect(dp.displayInOutLinkCode).toBe(true);
  });

  it('WindowPlacement を透過保持する', () => {
    expect(data.windowPlacement).not.toBeNull();
    expect(data.windowPlacement?.[0]).toEqual({ name: 'RosenViewWidth', value: '184' });
  });

  it('ルート直下に既知外の未知エントリを残さない(FileTypeAppComment は消費・破棄)', () => {
    // sample2 のルートは FileType/Rosen/DispProp/WindowPlacement/FileTypeAppComment のみ。
    expect(data.unknownEntries).toBeUndefined();
  });
});

describe('readRosenFile: sample.oud2(より大きな実ファイル)', () => {
  const data = loadFixture('current/sample.oud2');

  it('93 駅・3 ダイヤをエラーなく読む', () => {
    expect(data.sourceFileType).toBe('OuDiaSecond.1.17');
    expect(data.rosen.ekiCont).toHaveLength(93);
    expect(data.rosen.diaCont).toHaveLength(3);
    expect(data.rosen.diaCont.map((d) => d.name)).toEqual([
      '平日ダイヤ',
      '基準運転時分',
      '日中パターンダイヤ',
    ]);
  });

  it('全列車の駅時刻数が駅数を超えない(駅Order 上限で打ち切り)', () => {
    const ekiCount = data.rosen.ekiCont.length;
    for (const dia of data.rosen.diaCont) {
      for (const houkou of dia.ressyaCont) {
        for (const ressya of houkou) {
          expect(ressya.ekiJikokuCont.length).toBeLessThanOrEqual(ekiCount);
        }
      }
    }
  });
});
