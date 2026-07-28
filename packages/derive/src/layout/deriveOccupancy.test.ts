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
    // レーン Y は駅線より下(値が大きい)。
    const staY = a?.dgrYTer ?? 0;
    for (const lane of a?.trackLanes ?? []) {
      expect(lane.dgrY).toBeGreaterThan(staY);
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
