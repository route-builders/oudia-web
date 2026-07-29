// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 up-tri

/**
 * 在線表導出(M6・単独駅)のテスト。
 * - EkiLayout の trackLanes は主要駅かつ diagramTrackDisplay のときのみ・省略番線は除外
 * - deriveOccupancy は在線表駅の停車/通過列車について Zaisen を作る
 */

import {
  createDefaultDia,
  createDefaultEki,
  createNewRosen,
  createNullRessya,
} from '@oudia-web/domain';
import type { RosenFileData } from '@oudia-web/format';
import { asSeconds } from '@oudia-web/format';
import { describe, expect, it } from 'vitest';
import { deriveOccupancy } from './deriveOccupancy.js';
import { buildDiaLayoutFrame } from './ekiLayout.js';

/** 在線表表示駅 A(主要・3 番線・番線1省略)+ 一般駅 B の 2 駅路線。 */
function rosenOccupancy(): RosenFileData {
  const data = createNewRosen();
  const a = createDefaultEki(0, 'A');
  a.ekikibo = 'syuyou';
  a.diagramTrackDisplay = true;
  // ★在線表が出るのは駅時刻形式が 発着 / 下り着 / 上り着 の駅だけ(原典
  // CentDedDgrDia.cpp:236-262)。既定の「発時刻のみ」では在線表は出ない。
  a.ekijikokukeisiki = 'hatsuchaku';
  a.ekiTrack2Cont = [
    { trackName: '1番線', trackRyakusyou: '1', trackNoboriRyakusyou: '' },
    { trackName: '2番線', trackRyakusyou: '2', trackNoboriRyakusyou: '' },
    { trackName: '3番線', trackRyakusyou: '3', trackNoboriRyakusyou: '' },
  ];
  a.diagramTrackOmit = [false, true, false]; // 番線1(2番線)を省略
  const b = createDefaultEki(1, 'B');
  data.rosen.ekiCont.push(a, b);
  const dia = createDefaultDia('D');
  // 下り列車: A 停車(番線2 = 3番線)7:00着 7:02発、B 停車。
  const r = createNullRessya(2, 0);
  r.isNull = false;
  const sa = r.ekiJikokuCont[0];
  const sb = r.ekiJikokuCont[1];
  if (sa !== undefined) {
    sa.ekiatsukai = 'teisya';
    sa.chakuJikoku = asSeconds(7 * 3600);
    sa.hatsuJikoku = asSeconds(7 * 3600 + 120);
    sa.ressyaTrackIndex = 2; // 3番線
  }
  if (sb !== undefined) {
    sb.ekiatsukai = 'teisya';
    sb.chakuJikoku = asSeconds(7 * 3600 + 300);
  }
  dia.ressyaCont[0].push(r);
  data.rosen.diaCont.push(dia);
  return data;
}

describe('EkiLayout の在線表レーン', () => {
  it('主要駅かつ diagramTrackDisplay の駅にレーンが付き、省略番線は除外', () => {
    const data = rosenOccupancy();
    const frame = buildDiaLayoutFrame(
      data.rosen,
      data.rosen.diaCont[0]?.ressyaCont[0] ?? [],
      data.rosen.diaCont[0]?.ressyaCont[1] ?? [],
    );
    const a = frame.ekiLayouts[0];
    const b = frame.ekiLayouts[1];
    // A はレーン 2 本(番線 0, 2。番線 1 は省略)。
    expect(a?.trackLanes?.map((l) => l.trackIndex)).toEqual([0, 2]);
    // B は在線表なし。
    expect(b?.trackLanes).toBeUndefined();
    // レーンは 2 本の駅線の**間**にある(Org < レーン < Ter)。
    const yOrg = a?.dgrYOrg ?? 0;
    const yTer = a?.dgrYTer ?? 0;
    for (const lane of a?.trackLanes ?? []) {
      expect(lane.dgrY).toBeGreaterThan(yOrg);
      expect(lane.dgrY).toBeLessThan(yTer);
    }
  });

  it('在線表帯ぶん B の Y が押し下がる', () => {
    const data = rosenOccupancy();
    const withDisplay = buildDiaLayoutFrame(
      data.rosen,
      data.rosen.diaCont[0]?.ressyaCont[0] ?? [],
      [],
    );
    // 在線表を切った場合と比べて B が下がる。
    const a2 = data.rosen.ekiCont[0];
    if (a2 !== undefined) a2.diagramTrackDisplay = false;
    const without = buildDiaLayoutFrame(data.rosen, data.rosen.diaCont[0]?.ressyaCont[0] ?? [], []);
    const bWith = withDisplay.ekiLayouts[1]?.dgrYTer ?? 0;
    const bWithout = without.ekiLayouts[1]?.dgrYTer ?? 0;
    expect(bWith).toBeGreaterThan(bWithout);
  });
});

describe('deriveOccupancy', () => {
  it('在線表駅で停車列車の Zaisen を作る', () => {
    const data = rosenOccupancy();
    const dia = data.rosen.diaCont[0];
    if (dia === undefined) throw new Error('dia');
    const frame = buildDiaLayoutFrame(data.rosen, dia.ressyaCont[0], dia.ressyaCont[1]);
    const occ = deriveOccupancy(data.rosen, dia.ressyaCont[0], dia.ressyaCont[1], frame.ekiLayouts);
    expect(occ.kudari).toHaveLength(1);
    const lines = occ.kudari[0]?.trackLines ?? [];
    // A(駅Index0)だけ在線表駅。B は在線表なし。
    expect(lines).toHaveLength(1);
    expect(lines[0]?.ekiIndex).toBe(0);
    const z = lines[0]?.zaisenCont[0];
    expect(z?.trackIndex).toBe(2);
    expect(z?.dgrXChaku).toBe(7 * 3600);
    expect(z?.dgrXHatsu).toBe(7 * 3600 + 120);
  });

  it('在線表駅が無ければ空', () => {
    const data = rosenOccupancy();
    const a = data.rosen.ekiCont[0];
    if (a !== undefined) a.diagramTrackDisplay = false;
    const dia = data.rosen.diaCont[0];
    if (dia === undefined) throw new Error('dia');
    const frame = buildDiaLayoutFrame(data.rosen, dia.ressyaCont[0], dia.ressyaCont[1]);
    const occ = deriveOccupancy(data.rosen, dia.ressyaCont[0], dia.ressyaCont[1], frame.ekiLayouts);
    expect(occ.kudari).toHaveLength(0);
    expect(occ.nobori).toHaveLength(0);
  });
});

describe('作業コード(M7e・単独駅)', () => {
  it('出区 → 着側 3(○)、入区 → 発側 3(△)。運番は永続 #1 を使う', () => {
    const data = rosenOccupancy();
    data.rosen.enableOperation = 2;
    const dia = data.rosen.diaCont[0];
    const r = dia?.ressyaCont[0]?.[0];
    const first = r?.ekiJikokuCont[0];
    const last = r?.ekiJikokuCont[1];
    if (first === undefined || last === undefined) throw new Error('no slot');
    first.beforeOperationCont = [
      { kind: 'out', outJikoku: asSeconds(6 * 3600), inOutLinkCode: '', operationNumbers: ['7'] },
    ];
    last.afterOperationCont = [{ kind: 'in', inJikoku: asSeconds(8 * 3600), inOutLinkCode: '' }];
    const frame = buildDiaLayoutFrame(
      data.rosen,
      dia?.ressyaCont[0] ?? [],
      dia?.ressyaCont[1] ?? [],
    );
    const occ = deriveOccupancy(
      data.rosen,
      dia?.ressyaCont[0] ?? [],
      dia?.ressyaCont[1] ?? [],
      frame.ekiLayouts,
    );
    const lineA = occ.kudari[0]?.trackLines[0];
    expect(lineA?.chakuOperation).toBe(3);
    expect(lineA?.operationNumber).toBe('7');
    // 終着駅 B は在線表駅ではないので trackLine が出ない。始発駅の発側は -1。
    expect(lineA?.hatsuOperation).toBe(-1);
  });

  it('運用機能が無効なら作業コードは 0 / -1 のまま', () => {
    const data = rosenOccupancy();
    data.rosen.enableOperation = 0;
    const dia = data.rosen.diaCont[0];
    const first = dia?.ressyaCont[0]?.[0]?.ekiJikokuCont[0];
    if (first === undefined) throw new Error('no slot');
    first.beforeOperationCont = [
      { kind: 'out', outJikoku: asSeconds(6 * 3600), inOutLinkCode: '', operationNumbers: ['7'] },
    ];
    const frame = buildDiaLayoutFrame(
      data.rosen,
      dia?.ressyaCont[0] ?? [],
      dia?.ressyaCont[1] ?? [],
    );
    const occ = deriveOccupancy(
      data.rosen,
      dia?.ressyaCont[0] ?? [],
      dia?.ressyaCont[1] ?? [],
      frame.ekiLayouts,
    );
    expect(occ.kudari[0]?.trackLines[0]?.chakuOperation).toBe(0);
    expect(occ.kudari[0]?.trackLines[0]?.operationNumber).toBe('');
  });
});

describe('在線表表示モード(原典 CentDedDgrDia.cpp:236-262)', () => {
  it('★駅時刻形式が「発時刻のみ」の駅は主要駅でも在線表を出さない', () => {
    const data = rosenOccupancy();
    const a = data.rosen.ekiCont[0];
    if (a === undefined) throw new Error('no eki');
    a.ekijikokukeisiki = 'hatsu';
    const frame = buildDiaLayoutFrame(data.rosen, data.rosen.diaCont[0]?.ressyaCont[0] ?? [], []);
    expect(frame.ekiLayouts[0]?.trackLanes).toBeUndefined();
  });

  it('★分岐環状グループに属する着時刻駅は在線表を出す(発着型へ昇格)', () => {
    const data = rosenOccupancy();
    const a = data.rosen.ekiCont[0];
    const b = data.rosen.ekiCont[1];
    if (a === undefined || b === undefined) throw new Error('no eki');
    a.ekijikokukeisiki = 'kudariChaku';

    // 単独駅のうちは mode 2(着時刻駅)。帯は出る。
    const alone = buildDiaLayoutFrame(data.rosen, [], []);
    expect(alone.ekiLayouts[0]?.trackLanes).toBeDefined();

    // 駅 B を駅 A から分岐させると A は発着型(mode 1)へ昇格する。
    b.brunchCoreEkiIndex = 0;
    const grouped = buildDiaLayoutFrame(data.rosen, [], []);
    expect(grouped.ekiLayouts[0]?.trackLanes).toBeDefined();
  });

  it('★在線表駅は駅線が 2 本になる(Org = 帯の上 / Ter = 帯の下)', () => {
    const data = rosenOccupancy();
    const frame = buildDiaLayoutFrame(data.rosen, [], []);
    const a = frame.ekiLayouts[0];
    const b = frame.ekiLayouts[1];
    if (a === undefined || b === undefined) throw new Error('no layout');
    expect(a.dgrYTer).toBeGreaterThan(a.dgrYOrg);
    // 在線表なしの駅は Org === Ter。
    expect(b.dgrYOrg).toBe(b.dgrYTer);
  });
});

describe('分岐環状の駅群展開(原典 CentDedDgrRessya.cpp:1788-2078)', () => {
  /** A(在線表・分岐基幹)と B(A から分岐)の 2 駅。 */
  function branchRosen(): RosenFileData {
    const data = rosenOccupancy();
    const a = data.rosen.ekiCont[0];
    const b = data.rosen.ekiCont[1];
    if (a === undefined || b === undefined) throw new Error('no eki');
    // B を A から分岐させる(B は A より後ろ = 終点側派生駅)。
    b.brunchCoreEkiIndex = 0;
    b.ekikibo = 'syuyou';
    b.diagramTrackDisplay = true;
    b.ekijikokukeisiki = 'hatsuchaku';
    b.ekiTrack2Cont = [
      { trackName: '1番線', trackRyakusyou: '1', trackNoboriRyakusyou: '' },
      { trackName: '2番線', trackRyakusyou: '2', trackNoboriRyakusyou: '' },
    ];
    b.diagramTrackOmit = [false, false];
    return data;
  }

  function occOf(data: RosenFileData) {
    const dia = data.rosen.diaCont[0];
    const frame = buildDiaLayoutFrame(
      data.rosen,
      dia?.ressyaCont[0] ?? [],
      dia?.ressyaCont[1] ?? [],
    );
    return deriveOccupancy(
      data.rosen,
      dia?.ressyaCont[0] ?? [],
      dia?.ressyaCont[1] ?? [],
      frame.ekiLayouts,
    );
  }

  it('★同じ Zaisen が駅群の各駅へ複製され、別々の行になる', () => {
    const data = branchRosen();
    const occ = occOf(data);
    const lines = occ.kudari[0]?.trackLines ?? [];
    // 駅 A の在線が 駅 A と 駅 B の 2 行になる(同じ Zaisen 内容)。
    const atA = lines.filter((l) => l.ekiIndex === 0);
    const atB = lines.filter((l) => l.ekiIndex === 1);
    expect(atA.length).toBeGreaterThan(0);
    expect(atB.length).toBeGreaterThan(0);
    expect(atB[0]?.zaisenCont[0]?.dgrXChaku).toBe(atA[0]?.zaisenCont[0]?.dgrXChaku);
  });

  it('★自駅は -1、他駅は反転フラグ比較で -2 / -4 になる', () => {
    const data = branchRosen();
    const occ = occOf(data);
    const lines = occ.kudari[0]?.trackLines ?? [];
    // 駅 A の在線を 駅 B へ複製した行。反転設定なし同士 → -2。
    const copied = lines.find((l) => l.ekiIndex === 1 && l.ekiOrder === 1);
    expect(copied).toBeDefined();
    expect([-2, -4]).toContain(copied?.hatsuOperation);
  });

  it('★反転設定が食い違うと -4 になる', () => {
    const data = branchRosen();
    const b = data.rosen.ekiCont[1];
    if (b === undefined) throw new Error('no eki');
    b.brunchOpposite = true;
    const occ = occOf(data);
    const lines = occ.kudari[0]?.trackLines ?? [];
    const copied = lines.find((l) => l.ekiIndex === 1 && l.ekiOrder === 1);
    expect(copied?.hatsuOperation).toBe(-4);
  });

  it('単独駅のときは自駅ぶんだけ(複製しない)', () => {
    const data = rosenOccupancy();
    const occ = occOf(data);
    const lines = occ.kudari[0]?.trackLines ?? [];
    expect(lines.every((l) => l.ekiIndex === 0)).toBe(true);
  });
});
