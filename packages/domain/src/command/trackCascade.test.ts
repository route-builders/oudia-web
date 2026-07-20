// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 up-tri

/**
 * 番線編集カスケード(M6)の原典忠実性テスト。
 * - 番線削除ガード(最後/主本線/使用中は拒否)
 * - 番線並べ替え/削除での ressyaTrackIndex 再マップ(teisya/tsuuka のみ)
 */

import type { EkiTrack2, RosenFileData } from '@oudia-web/format';
import { asSeconds } from '@oudia-web/format';
import { describe, expect, it } from 'vitest';
import { createDefaultDia, createDefaultEki, createNewRosen } from '../factory.js';
import { createNullRessya } from '../ressya.js';
import { createDocumentState, executeCommand } from './engine.js';

function track(name: string, ryaku: string): EkiTrack2 {
  return { trackName: name, trackRyakusyou: ryaku, trackNoboriRyakusyou: '' };
}

/** 3 番線の駅 1 個 + 下り列車 1 本(駅 0 に停車・番線 2 使用)を持つ路線。 */
function rosen3Track(): RosenFileData {
  const data = createNewRosen();
  const eki = createDefaultEki(0, 'A');
  eki.ekiTrack2Cont = [track('1番線', '1'), track('2番線', '2'), track('3番線', '3')];
  eki.diagramTrackOmit = [false, false, false];
  eki.downMain = 0;
  eki.upMain = 1;
  data.rosen.ekiCont.push(eki);
  const dia = createDefaultDia('D');
  const r = createNullRessya(1, 0);
  r.isNull = false;
  const slot = r.ekiJikokuCont[0];
  if (slot !== undefined) {
    slot.ekiatsukai = 'teisya';
    slot.hatsuJikoku = asSeconds(3600);
    slot.ressyaTrackIndex = 2; // 3番線
  }
  dia.ressyaCont[0].push(r);
  data.rosen.diaCont.push(dia);
  return data;
}

describe('番線削除ガード', () => {
  it('主本線を削除しようとすると拒否', () => {
    const state = createDocumentState(rosen3Track());
    // 番線 0(downMain)を削除: oldToNew=[-1,0,1]。
    expect(() =>
      executeCommand(state, {
        type: 'ekiTrack2/replace',
        ekiIndex: 0,
        tracks: [track('2番線', '2'), track('3番線', '3')],
        downMain: 0,
        upMain: 0,
        diagramTrackOmit: [false, false],
        oldToNew: [-1, 0, 1],
      }),
    ).toThrow(/主本線/);
  });

  it('使用中の番線を削除しようとすると拒否', () => {
    const state = createDocumentState(rosen3Track());
    // 番線 2(列車が使用中)を削除: oldToNew=[0,1,-1]。
    expect(() =>
      executeCommand(state, {
        type: 'ekiTrack2/replace',
        ekiIndex: 0,
        tracks: [track('1番線', '1'), track('2番線', '2')],
        downMain: 0,
        upMain: 1,
        diagramTrackOmit: [false, false],
        oldToNew: [0, 1, -1],
      }),
    ).toThrow(/使用中/);
  });

  it('最後の 1 本になる削除は拒否', () => {
    const data = createNewRosen();
    const eki = createDefaultEki(0, 'A');
    eki.ekiTrack2Cont = [track('1番線', '1')];
    eki.diagramTrackOmit = [false];
    eki.downMain = 0;
    eki.upMain = 0;
    data.rosen.ekiCont.push(eki);
    const state = createDocumentState(data);
    expect(() =>
      executeCommand(state, {
        type: 'ekiTrack2/replace',
        ekiIndex: 0,
        tracks: [],
        downMain: 0,
        upMain: 0,
        diagramTrackOmit: [],
        oldToNew: [-1],
      }),
    ).toThrow(/0 本/);
  });
});

describe('番線再マップ', () => {
  it('番線並べ替え(0↔2)で列車の ressyaTrackIndex が追従', () => {
    const data = rosen3Track();
    // 列車は番線 2 使用。番線を [2番線,1番線,3番線] のように並べ替え: 旧0→1, 旧1→0, 旧2→2。
    // ここでは旧2(3番線)を先頭へ: new order = [3番線,1番線,2番線], oldToNew: 旧0→1,旧1→2,旧2→0。
    const state = createDocumentState(data);
    const next = executeCommand(state, {
      type: 'ekiTrack2/replace',
      ekiIndex: 0,
      tracks: [track('3番線', '3'), track('1番線', '1'), track('2番線', '2')],
      downMain: 1, // 旧 downMain 0 → 新 1
      upMain: 2, // 旧 upMain 1 → 新 2
      diagramTrackOmit: [false, false, false],
      oldToNew: [1, 2, 0],
    });
    const slot = next.rosenFileData.rosen.diaCont[0]?.ressyaCont[0]?.[0]?.ekiJikokuCont[0];
    expect(slot?.ressyaTrackIndex).toBe(0); // 旧2 → 新0
  });

  it('未使用番線の削除で残りの index が詰まる', () => {
    const data = rosen3Track();
    // 番線 1 を主本線から外す(下り 0 / 上り 0)ので削除可能にする。列車は番線 2 使用。
    const eki = data.rosen.ekiCont[0];
    if (eki !== undefined) eki.upMain = 0;
    // 番線 1(未使用・非主本線)を削除: oldToNew=[0,-1,1]。
    const state = createDocumentState(data);
    const next = executeCommand(state, {
      type: 'ekiTrack2/replace',
      ekiIndex: 0,
      tracks: [track('1番線', '1'), track('3番線', '3')],
      downMain: 0,
      upMain: 0,
      diagramTrackOmit: [false, false],
      oldToNew: [0, -1, 1],
    });
    const slot = next.rosenFileData.rosen.diaCont[0]?.ressyaCont[0]?.[0]?.ekiJikokuCont[0];
    expect(slot?.ressyaTrackIndex).toBe(1); // 旧2 → 新1
    expect(next.rosenFileData.rosen.ekiCont[0]?.ekiTrack2Cont).toHaveLength(2);
  });
});
