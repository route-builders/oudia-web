// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 up-tri

/**
 * 整合カスケードのプロパティベーステスト(常設 CI。data-model §8.1 I1–I8 + roadmap M5 完了条件)。
 *
 * 任意の駅追加/削除/置換・種別入替/増減・分岐環状設定の系列を生成し、各コマンド後に
 * 不変条件を検証する。加えて「駅削除 → Undo で完全復元」(patch 方式)と unknownEntries の
 * 随伴保持を検証する。失敗再現はシード固定コメントを添えて残す(testing-guidelines §3)。
 */

import type { Ressya, RosenFileData } from '@oudia-web/format';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { deriveBrunchLoopMap } from '../brunchLoop.js';
import { createDefaultDia, createDefaultEki, createNewRosen } from '../factory.js';
import { createNullRessya } from '../ressya.js';
import { createDocumentState, type DocumentState, executeCommand, undo } from './engine.js';
import type { EditCommand } from './types.js';

// ---- 初期状態の生成 ----

/** 走行区間を持つ簡単な列車(停車を数駅に置く)を作る。 */
function makeRunningRessya(
  ekiCount: number,
  houkou: 0 | 1,
  syubetsuCount: number,
  seed: number,
): Ressya {
  const r = createNullRessya(ekiCount, houkou);
  r.isNull = false;
  r.syubetsuIndex = seed % syubetsuCount;
  r.ressyabangou = String(100 + seed);
  // 連続した停車区間(order a..b)を作る。
  const a = seed % Math.max(1, ekiCount - 1);
  const b = Math.min(ekiCount - 1, a + 1 + (seed % 2));
  for (let o = a; o <= b; o++) {
    const slot = r.ekiJikokuCont[o];
    if (slot === undefined) continue;
    slot.ekiatsukai = 'teisya';
    const sec = (6 * 3600 + seed * 60 + o * 120) % 86400;
    if (o > a) slot.chakuJikoku = sec as never;
    if (o < b) slot.hatsuJikoku = (sec + 30) as never;
    slot.ressyaTrackIndex = o % 2; // 0 or 1(既定 2 番線内)
  }
  return r;
}

function makeInitialRosen(
  ekiCount: number,
  syubetsuCount: number,
  diaCount: number,
): RosenFileData {
  const data = createNewRosen();
  data.rosen.rosenmei = 'PBT';
  for (let i = 0; i < ekiCount; i++) data.rosen.ekiCont.push(createDefaultEki(i, `駅${String(i)}`));
  for (let s = 1; s < syubetsuCount; s++) {
    data.rosen.ressyasyubetsuCont.push({
      syubetsumei: `種別${String(s)}`,
      ryakusyou: '',
      jikokuhyouMojiColor: data.rosen.ressyasyubetsuCont[0]?.jikokuhyouMojiColor ?? (0 as never),
      jikokuhyouFontIndex: 0,
      jikokuhyouBackColor: data.rosen.ressyasyubetsuCont[0]?.jikokuhyouBackColor ?? (0 as never),
      diagramLineStyle: { senColor: 0 as never, senStyle: 'jissen', isBold: false },
      stopMarkDrawType: 'drawOnStop',
      parentSyubetsuIndex: null,
      hidden: false,
    });
  }
  for (let d = 0; d < diaCount; d++) {
    const dia = createDefaultDia(`ダイヤ${String(d)}`);
    for (const houkou of [0, 1] as const) {
      for (let t = 0; t < 3; t++) {
        dia.ressyaCont[houkou].push(makeRunningRessya(ekiCount, houkou, syubetsuCount, d * 10 + t));
      }
    }
    data.rosen.diaCont.push(dia);
  }
  return data;
}

// ---- 不変条件 I1–I8 の検証 ----

function assertInvariants(data: RosenFileData): void {
  const ekiCount = data.rosen.ekiCont.length;
  const syubetsuCount = data.rosen.ressyasyubetsuCont.length;
  const diaCount = data.rosen.diaCont.length;

  // I3: 種別 >= 1・種別名非空
  expect(syubetsuCount).toBeGreaterThanOrEqual(1);
  for (const s of data.rosen.ressyasyubetsuCont) {
    expect(s.syubetsumei).not.toBe('');
    // I6: parentSyubetsuIndex は null または [0, 種別数)
    if (s.parentSyubetsuIndex !== null) {
      expect(s.parentSyubetsuIndex).toBeGreaterThanOrEqual(0);
      expect(s.parentSyubetsuIndex).toBeLessThan(syubetsuCount);
    }
  }

  // I2: ダイヤ名一意・非空
  const diaNames = new Set<string>();
  for (const dia of data.rosen.diaCont) {
    expect(dia.name).not.toBe('');
    expect(diaNames.has(dia.name)).toBe(false);
    diaNames.add(dia.name);
  }
  // I6: kijunDiaIndex ∈ [0, ダイヤ数)(ダイヤ 0 個のときは 0 を許容)
  if (diaCount > 0) {
    expect(data.rosen.kijunDiaIndex).toBeGreaterThanOrEqual(0);
    expect(data.rosen.kijunDiaIndex).toBeLessThan(diaCount);
  }

  // I6: 駅の参照 index
  for (const eki of data.rosen.ekiCont) {
    expect(eki.downMain).toBeGreaterThanOrEqual(0);
    expect(eki.downMain).toBeLessThan(eki.ekiTrack2Cont.length);
    expect(eki.upMain).toBeGreaterThanOrEqual(0);
    expect(eki.upMain).toBeLessThan(eki.ekiTrack2Cont.length);
    // diagramTrackOmit.length === 番線数
    expect(eki.diagramTrackOmit.length).toBe(eki.ekiTrack2Cont.length);
    if (eki.brunchCoreEkiIndex !== null) {
      expect(eki.brunchCoreEkiIndex).toBeGreaterThanOrEqual(0);
      expect(eki.brunchCoreEkiIndex).toBeLessThan(ekiCount);
    }
    if (eki.loopOriginEkiIndex !== null) {
      expect(eki.loopOriginEkiIndex).toBeGreaterThanOrEqual(0);
      expect(eki.loopOriginEkiIndex).toBeLessThan(ekiCount);
    }
  }

  // I1 / I4 / I6 / I7 / I8: 列車ごと
  for (let d = 0; d < diaCount; d++) {
    const dia = data.rosen.diaCont[d];
    if (dia === undefined) continue;
    for (const houkou of [0, 1] as const) {
      for (const ressya of dia.ressyaCont[houkou]) {
        // I4: houkou はコンテナと一致
        expect(ressya.houkou).toBe(houkou);
        // I1: 駅時刻数 === 駅数
        expect(ressya.ekiJikokuCont.length).toBe(ekiCount);
        for (const ej of ressya.ekiJikokuCont) {
          // I6: syubetsuIndex は範囲内(列車単位)
          // I6: ressyaTrackIndex は null または [0, 当駅番線数)
          // I7: none ⇒ 時刻 null かつ作業なし
          if (ej.ekiatsukai === 'none') {
            expect(ej.chakuJikoku).toBeNull();
            expect(ej.hatsuJikoku).toBeNull();
            expect(ej.beforeOperationCont.length).toBe(0);
            expect(ej.afterOperationCont.length).toBe(0);
          }
        }
        // I6: syubetsuIndex
        expect(ressya.syubetsuIndex).toBeGreaterThanOrEqual(0);
        expect(ressya.syubetsuIndex).toBeLessThan(syubetsuCount);
      }
    }
  }

  // ressyaTrackIndex の範囲(各駅の番線数に依存 → 駅Order 変換して照合)
  for (const dia of data.rosen.diaCont) {
    for (const houkou of [0, 1] as const) {
      for (const ressya of dia.ressyaCont[houkou]) {
        for (let order = 0; order < ressya.ekiJikokuCont.length; order++) {
          const ej = ressya.ekiJikokuCont[order];
          if (ej === undefined || ej.ressyaTrackIndex === null) continue;
          const ekiIndex = houkou === 0 ? order : ekiCount - 1 - order;
          const eki = data.rosen.ekiCont[ekiIndex];
          if (eki === undefined) continue;
          expect(ej.ressyaTrackIndex).toBeGreaterThanOrEqual(0);
          expect(ej.ressyaTrackIndex).toBeLessThan(eki.ekiTrack2Cont.length);
        }
      }
    }
  }

  // 分岐環状派生マップが例外なく計算でき、長さが駅数と一致する(§8.3(e))。
  const map = deriveBrunchLoopMap(data.rosen.ekiCont);
  expect(map.positions.length).toBe(ekiCount);
}

// ---- コマンド生成 ----

type CmdGen = (data: RosenFileData, seed: number) => EditCommand | null;

const insertEki: CmdGen = (data, seed) => {
  const n = data.rosen.ekiCont.length;
  const index = seed % (n + 1);
  const id = nextEkiId(data);
  return {
    type: 'eki/replaceRange',
    index,
    count: 0,
    eki: [createDefaultEki(id, `挿入${String(id)}`)],
  };
};

const eraseEki: CmdGen = (data, seed) => {
  const n = data.rosen.ekiCont.length;
  if (n <= 1) return null; // 全消しは避ける(意味のあるカスケードを保つ)
  const index = seed % n;
  return { type: 'eki/replaceRange', index, count: 1, eki: [] };
};

const setKeisiki: CmdGen = (data, seed) => {
  const n = data.rosen.ekiCont.length;
  if (n === 0) return null;
  const keisikis = ['hatsu', 'hatsuchaku', 'kudariChaku', 'noboriChaku'] as const;
  return {
    type: 'eki/setProp',
    ekiIndex: seed % n,
    prop: { key: 'ekijikokukeisiki', value: keisikis[seed % keisikis.length] ?? 'hatsu' },
  };
};

const setBrunch: CmdGen = (data, seed) => {
  const n = data.rosen.ekiCont.length;
  if (n < 2) return null;
  const ekiIndex = seed % n;
  // core は自分以外の有効駅。null(解除)も混ぜる。
  if (seed % 3 === 0)
    return { type: 'eki/setBrunch', ekiIndex, brunchCoreEkiIndex: null, brunchOpposite: false };
  let core = (ekiIndex + 1 + (seed % (n - 1))) % n;
  if (core === ekiIndex) core = (core + 1) % n;
  return {
    type: 'eki/setBrunch',
    ekiIndex,
    brunchCoreEkiIndex: core,
    brunchOpposite: seed % 2 === 0,
  };
};

const insertSyubetsu: CmdGen = (data, seed) => {
  const n = data.rosen.ressyasyubetsuCont.length;
  const index = seed % (n + 1);
  const name = `追加種別${String(seed)}_${String(data.rosen.ressyasyubetsuCont.length)}`;
  return {
    type: 'syubetsu/replaceRange',
    index,
    count: 0,
    syubetsu: [
      {
        syubetsumei: name,
        ryakusyou: '',
        jikokuhyouMojiColor: 0 as never,
        jikokuhyouFontIndex: 0,
        jikokuhyouBackColor: 0 as never,
        diagramLineStyle: { senColor: 0 as never, senStyle: 'jissen', isBold: false },
        stopMarkDrawType: 'drawOnStop',
        parentSyubetsuIndex: null,
        hidden: false,
      },
    ],
  };
};

const eraseSyubetsu: CmdGen = (data, seed) => {
  const n = data.rosen.ressyasyubetsuCont.length;
  if (n <= 1) return null; // I3: 0 個にはできない
  return { type: 'syubetsu/replaceRange', index: seed % n, count: 1, syubetsu: [] };
};

const swapSyubetsu: CmdGen = (data, seed) => {
  const n = data.rosen.ressyasyubetsuCont.length;
  if (n < 2) return null;
  const indexA = seed % n;
  const indexB = indexA === 0 ? 1 : indexA - 1; // 隣と入替(上下移動)
  return { type: 'syubetsu/swap', indexA, sizeA: 1, indexB };
};

const insertDia: CmdGen = (data, seed) => {
  const n = data.rosen.diaCont.length;
  const ekiCount = data.rosen.ekiCont.length;
  const dia = createDefaultDia(`追加ダイヤ${String(seed)}_${String(n)}`);
  // 空でよいが、駅数依存の I1 を効かせるため isNull 列車を数本入れる。
  for (const houkou of [0, 1] as const) {
    dia.ressyaCont[houkou].push(createNullRessya(ekiCount, houkou));
  }
  return { type: 'dia/replaceRange', index: n, count: 0, dia: [dia] };
};

const eraseDia: CmdGen = (data, seed) => {
  const n = data.rosen.diaCont.length;
  if (n === 0) return null;
  return { type: 'dia/replaceRange', index: seed % n, count: 1, dia: [] };
};

function nextEkiId(data: RosenFileData): number {
  const used = new Set(data.rosen.ekiCont.map((e) => e.id));
  let id = 0;
  while (used.has(id)) id++;
  return id;
}

// ---- M6 番線編集の生成器(roadmap M6 完了条件 1: 番線再マップを常設テストへ追加)----

const insertTrack: CmdGen = (data, seed) => {
  const n = data.rosen.ekiCont.length;
  if (n === 0) return null;
  const ekiIndex = seed % n;
  const eki = data.rosen.ekiCont[ekiIndex];
  if (eki === undefined) return null;
  const oldCount = eki.ekiTrack2Cont.length;
  const num = oldCount + 1;
  const tracks = [
    ...eki.ekiTrack2Cont.map((t) => ({ ...t })),
    { trackName: `${String(num)}番線`, trackRyakusyou: String(num), trackNoboriRyakusyou: '' },
  ];
  return {
    type: 'ekiTrack2/replace',
    ekiIndex,
    tracks,
    downMain: eki.downMain,
    upMain: eki.upMain,
    diagramTrackOmit: [...eki.diagramTrackOmit, false],
    oldToNew: eki.ekiTrack2Cont.map((_, i) => i), // 恒等(末尾追加は map 外)
  };
};

const deleteTrack: CmdGen = (data, seed) => {
  const n = data.rosen.ekiCont.length;
  if (n === 0) return null;
  const ekiIndex = seed % n;
  const eki = data.rosen.ekiCont[ekiIndex];
  if (eki === undefined || eki.ekiTrack2Cont.length <= 1) return null;
  // 末尾番線を削除対象に選ぶ(ガードで拒否されうる — その場合は呼出側で握りつぶす)。
  const delIdx = eki.ekiTrack2Cont.length - 1;
  const tracks = eki.ekiTrack2Cont.filter((_, i) => i !== delIdx).map((t) => ({ ...t }));
  const oldToNew = eki.ekiTrack2Cont.map((_, i) => (i === delIdx ? -1 : i));
  // 主本線が消える場合は clamp(ガード回避のため 0 へ寄せる。実際の UI もそうする)。
  const downMain = eki.downMain === delIdx ? 0 : eki.downMain;
  const upMain = eki.upMain === delIdx ? 0 : eki.upMain;
  return {
    type: 'ekiTrack2/replace',
    ekiIndex,
    tracks,
    downMain,
    upMain,
    diagramTrackOmit: eki.diagramTrackOmit.filter((_, i) => i !== delIdx),
    oldToNew,
  };
};

const GENERATORS: CmdGen[] = [
  insertEki,
  eraseEki,
  setKeisiki,
  setBrunch,
  insertSyubetsu,
  eraseSyubetsu,
  swapSyubetsu,
  insertDia,
  eraseDia,
  insertTrack,
  deleteTrack,
];

// ---- プロパティ ----

interface Op {
  gen: number;
  seed: number;
}

const opArb: fc.Arbitrary<Op> = fc.record({
  gen: fc.integer({ min: 0, max: GENERATORS.length - 1 }),
  seed: fc.integer({ min: 0, max: 999 }),
});

describe('整合カスケードのプロパティ(I1–I8)', () => {
  it('任意の構造編集系列後も I1–I8 が成立し、分岐環状マップが計算可能', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 6 }), // 初期駅数
        fc.integer({ min: 1, max: 4 }), // 初期種別数
        fc.integer({ min: 1, max: 3 }), // 初期ダイヤ数
        fc.array(opArb, { minLength: 1, maxLength: 25 }),
        (ekiCount, syubetsuCount, diaCount, ops) => {
          let state: DocumentState = createDocumentState(
            makeInitialRosen(ekiCount, syubetsuCount, diaCount),
          );
          assertInvariants(state.rosenFileData);
          for (const op of ops) {
            const gen = GENERATORS[op.gen];
            if (gen === undefined) continue;
            const cmd = gen(state.rosenFileData, op.seed);
            if (cmd === null) continue;
            // 事前検証で拒否されるコマンド(名前重複・0 個削除等)は例外になりうる。
            // 拒否は正常系(不変条件を守るためのガード)なのでスキップして状態を保つ。
            try {
              state = executeCommand(state, cmd);
            } catch {
              continue;
            }
            assertInvariants(state.rosenFileData);
          }
        },
      ),
      { numRuns: 300 },
    );
  });

  it('駅削除 → Undo で駅時刻・番線参照・分岐環状が完全復元(patch 対称性)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 3, max: 6 }),
        fc.integer({ min: 1, max: 3 }),
        fc.integer({ min: 0, max: 999 }),
        (ekiCount, syubetsuCount, seed) => {
          const initial = makeInitialRosen(ekiCount, syubetsuCount, 2);
          // 分岐設定を 1 つ入れて、削除 → Undo での復元を厳しくする。
          const e = initial.rosen.ekiCont[ekiCount - 1];
          if (e !== undefined) e.brunchCoreEkiIndex = 0;
          const before = createDocumentState(initial);
          const beforeJson = JSON.stringify(before.rosenFileData);
          const index = seed % ekiCount;
          const after = executeCommand(before, {
            type: 'eki/replaceRange',
            index,
            count: 1,
            eki: [],
          });
          const restored = undo(after);
          expect(JSON.stringify(restored.rosenFileData)).toBe(beforeJson);
        },
      ),
      { numRuns: 200 },
    );
  });

  it('unknownEntries は駅移動(erase+insert)後も随伴して保持される', () => {
    const data = makeInitialRosen(4, 2, 1);
    const target = data.rosen.ekiCont[2];
    if (target === undefined) throw new Error('setup');
    target.unknownEntries = [{ index: 99, name: 'FutureKey', value: 'v' }];
    const targetId = target.id;
    let state = createDocumentState(data);
    // 駅 2 を削除して先頭へ挿入(erase+insert の 2 コマンド)。
    const removed = structuredClone(state.rosenFileData.rosen.ekiCont[2]);
    if (removed === undefined) throw new Error('removed');
    state = executeCommand(state, { type: 'eki/replaceRange', index: 2, count: 1, eki: [] });
    state = executeCommand(state, { type: 'eki/replaceRange', index: 0, count: 0, eki: [removed] });
    const moved = state.rosenFileData.rosen.ekiCont.find((e) => e.id === targetId);
    expect(moved?.unknownEntries).toEqual([{ index: 99, name: 'FutureKey', value: 'v' }]);
  });
});
