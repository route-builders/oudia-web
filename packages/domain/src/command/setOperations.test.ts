// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 up-tri

/** ekiJikoku/setOperations コマンド(M7a/M7b の作業編集経路)のテスト。 */

import type { RosenFileData } from '@oudia-web/format';
import { asSeconds, parseNodeTree, readRosenFile, writeOud2 } from '@oudia-web/format';
import { describe, expect, it } from 'vitest';
import { createDefaultDia, createDefaultEki, createNewRosen } from '../factory.js';
import { createNullRessya } from '../ressya.js';
import { createDocumentState, executeCommand, undo } from './engine.js';

/** 3 駅 hatsuchaku + 全区間走行の下り列車 1 本 + enableOperation=1。 */
function rosenOp(): RosenFileData {
  const data = createNewRosen();
  data.rosen.enableOperation = 1;
  for (let i = 0; i < 3; i++) {
    const e = createDefaultEki(i, `E${String(i)}`);
    e.ekijikokukeisiki = 'hatsuchaku';
    data.rosen.ekiCont.push(e);
  }
  const dia = createDefaultDia('D');
  const r = createNullRessya(3, 0);
  r.isNull = false;
  r.ressyabangou = '1M';
  for (let o = 0; o < 3; o++) {
    const s = r.ekiJikokuCont[o];
    if (s === undefined) continue;
    s.ekiatsukai = 'teisya';
    if (o > 0) s.chakuJikoku = asSeconds(3600 + o * 300 - 30);
    if (o < 2) s.hatsuJikoku = asSeconds(3600 + o * 300);
    s.ressyaTrackIndex = 0;
  }
  dia.ressyaCont[0].push(r);
  data.rosen.diaCont.push(dia);
  return data;
}

describe('ekiJikoku/setOperations', () => {
  it('有効始発駅に出区作業を設定でき、後で adjustOperation が終端も補填', () => {
    let state = createDocumentState(rosenOp());
    state = executeCommand(state, {
      type: 'ekiJikoku/setOperations',
      diaIndex: 0,
      houkou: 0,
      ressyaIndex: 0,
      ekiOrder: 0,
      beforeOperationCont: [
        { kind: 'out', outJikoku: asSeconds(3540), inOutLinkCode: '', operationNumbers: ['1'] },
      ],
      afterOperationCont: [],
    });
    const r = state.rosenFileData.rosen.diaCont[0]?.ressyaCont[0]?.[0];
    // 有効始発(0)に out。
    expect(r?.ekiJikokuCont[0]?.beforeOperationCont[0]?.kind).toBe('out');
    // adjustOperation が有効終着(2)に junction を補填。
    expect(r?.ekiJikokuCont[2]?.afterOperationCont.at(-1)?.kind).toBe('junction');
  });

  it('中間駅に置いた先端作業は adjustOperation で削除される', () => {
    let state = createDocumentState(rosenOp());
    state = executeCommand(state, {
      type: 'ekiJikoku/setOperations',
      diaIndex: 0,
      houkou: 0,
      ressyaIndex: 0,
      ekiOrder: 1, // 中間駅
      beforeOperationCont: [
        { kind: 'out', outJikoku: asSeconds(3900), inOutLinkCode: '', operationNumbers: ['1'] },
      ],
      afterOperationCont: [],
    });
    const r = state.rosenFileData.rosen.diaCont[0]?.ressyaCont[0]?.[0];
    expect(r?.ekiJikokuCont[1]?.beforeOperationCont).toHaveLength(0);
  });

  it('Undo で作業設定前の状態へ完全復元(patch 対称性)', () => {
    const before = createDocumentState(rosenOp());
    const beforeJson = JSON.stringify(before.rosenFileData);
    const after = executeCommand(before, {
      type: 'ekiJikoku/setOperations',
      diaIndex: 0,
      houkou: 0,
      ressyaIndex: 0,
      ekiOrder: 0,
      beforeOperationCont: [
        { kind: 'out', outJikoku: asSeconds(3540), inOutLinkCode: '', operationNumbers: ['1'] },
      ],
      afterOperationCont: [],
    });
    const restored = undo(after);
    expect(JSON.stringify(restored.rosenFileData)).toBe(beforeJson);
  });

  it('作業を設定した結果が書き出して読み戻せる(oud2 往復)', () => {
    let state = createDocumentState(rosenOp());
    state = executeCommand(state, {
      type: 'ekiJikoku/setOperations',
      diaIndex: 0,
      houkou: 0,
      ressyaIndex: 0,
      ekiOrder: 0,
      beforeOperationCont: [
        { kind: 'out', outJikoku: asSeconds(3540), inOutLinkCode: 'AB', operationNumbers: ['1'] },
      ],
      afterOperationCont: [],
    });
    const bytes = writeOud2(state.rosenFileData);
    const parsed = parseNodeTree(bytes);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const read = readRosenFile(parsed.root);
    const r = read.data.rosen.diaCont[0]?.ressyaCont[0]?.[0];
    const out = r?.ekiJikokuCont[0]?.beforeOperationCont[0];
    expect(out?.kind).toBe('out');
    if (out?.kind === 'out') {
      expect(out.inOutLinkCode).toBe('AB');
      expect(out.operationNumbers).toEqual(['1']);
    }
  });
});
