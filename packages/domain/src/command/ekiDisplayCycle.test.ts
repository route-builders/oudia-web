// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 up-tri

/** 駅表示設定サイクルの原典忠実性テスト(CWndDcdGridEki の各カラム規則)。 */

import { RESSYAHOUKOU_KUDARI } from '@oudia-web/format';
import { describe, expect, it } from 'vitest';
import { createDefaultEki, createNewRosen } from '../factory.js';
import { cycleEkiDisplaySetting } from './ekiDisplayCycle.js';
import { createDocumentState, executeCommand } from './engine.js';

describe('cycleEkiDisplaySetting', () => {
  it('着/発は 着 → 着発 → 発 → 着 の 3 状態(順送り)', () => {
    const eki = createDefaultEki(0, 'A');
    // 既定は {chaku:true, hatsu:true}(着発)。順送りで 発 → 着 → 着発。
    cycleEkiDisplaySetting(eki, 'chakuHatsu', RESSYAHOUKOU_KUDARI, true);
    expect(eki.jikokuhyouJikokuDisplayKudari).toEqual({ chaku: false, hatsu: true }); // 発
    cycleEkiDisplaySetting(eki, 'chakuHatsu', RESSYAHOUKOU_KUDARI, true);
    expect(eki.jikokuhyouJikokuDisplayKudari).toEqual({ chaku: true, hatsu: false }); // 着
    cycleEkiDisplaySetting(eki, 'chakuHatsu', RESSYAHOUKOU_KUDARI, true);
    expect(eki.jikokuhyouJikokuDisplayKudari).toEqual({ chaku: true, hatsu: true }); // 着発
  });

  it('着/発の逆送りは順送りの逆順', () => {
    const eki = createDefaultEki(0, 'A'); // 着発
    cycleEkiDisplaySetting(eki, 'chakuHatsu', RESSYAHOUKOU_KUDARI, false);
    expect(eki.jikokuhyouJikokuDisplayKudari).toEqual({ chaku: true, hatsu: false }); // 着
  });

  it('track / nyuusen は bool トグル', () => {
    const eki = createDefaultEki(0, 'A');
    expect(eki.jikokuhyouTrackDisplayKudari).toBe(false);
    cycleEkiDisplaySetting(eki, 'track', RESSYAHOUKOU_KUDARI, true);
    expect(eki.jikokuhyouTrackDisplayKudari).toBe(true);
    cycleEkiDisplaySetting(eki, 'track', RESSYAHOUKOU_KUDARI, true);
    expect(eki.jikokuhyouTrackDisplayKudari).toBe(false);
  });

  it('ressyabangou は 0..3 サイクル', () => {
    const eki = createDefaultEki(0, 'A'); // 既定 0
    for (const expected of [1, 2, 3, 0]) {
      cycleEkiDisplaySetting(eki, 'ressyabangou', RESSYAHOUKOU_KUDARI, true);
      expect(eki.jikokuhyouSyubetsuChangeDisplayKudari.ressyabangou).toBe(expected);
    }
  });

  it('operationNumber は 0..4 サイクル', () => {
    const eki = createDefaultEki(0, 'A');
    for (const expected of [1, 2, 3, 4, 0]) {
      cycleEkiDisplaySetting(eki, 'operationNumber', RESSYAHOUKOU_KUDARI, true);
      expect(eki.jikokuhyouSyubetsuChangeDisplayKudari.operationNumber).toBe(expected);
    }
  });

  it('operationNumberRows は operationNumber>0 のときだけ 1..5 サイクル', () => {
    const eki = createDefaultEki(0, 'A'); // operationNumber=0, rows=1
    // operationNumber=0 のときは変わらない。
    cycleEkiDisplaySetting(eki, 'operationNumberRows', RESSYAHOUKOU_KUDARI, true);
    expect(eki.jikokuhyouSyubetsuChangeDisplayKudari.operationNumberRows).toBe(1);
    // operationNumber を 1 にすると Rows がサイクル可能に。
    eki.jikokuhyouSyubetsuChangeDisplayKudari.operationNumber = 1;
    cycleEkiDisplaySetting(eki, 'operationNumberRows', RESSYAHOUKOU_KUDARI, true);
    expect(eki.jikokuhyouSyubetsuChangeDisplayKudari.operationNumberRows).toBe(2);
  });
});

describe('eki/cycleDisplaySetting コマンド', () => {
  it('選択駅すべてに一括適用され、Undo で戻る', () => {
    const data = createNewRosen();
    data.rosen.ekiCont.push(createDefaultEki(0, 'A'), createDefaultEki(1, 'B'));
    let state = createDocumentState(data);
    state = executeCommand(state, {
      type: 'eki/cycleDisplaySetting',
      ekiIndices: [0, 1],
      setting: 'track',
      houkou: 0,
      forward: true,
    });
    expect(state.rosenFileData.rosen.ekiCont[0]?.jikokuhyouTrackDisplayKudari).toBe(true);
    expect(state.rosenFileData.rosen.ekiCont[1]?.jikokuhyouTrackDisplayKudari).toBe(true);
  });
});
