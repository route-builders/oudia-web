// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 up-tri

// 直通化・分断・時刻のみ貼り付け・一本化(原典 CentDedRessya::direct/undirect/pasteEkiJikoku +
// CRessyaContUnifier + CentDedRessyaCont::findTrainToDirect)の検証。

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { RosenFileData } from '@oudia-web/format';
import { parseNodeTree, readRosenFile, writeOud2 } from '@oudia-web/format';
import { describe, expect, it } from 'vitest';
import { findTrainToDirect } from '../ressya.js';
import { createDocumentState, executeCommand, undo } from './engine.js';
import type { EditCommand } from './types.js';

const here = dirname(fileURLToPath(import.meta.url));
const fixtures = join(here, '..', '..', '..', 'format', 'fixtures');
const ORIGINAL = new Uint8Array(readFileSync(join(fixtures, 'current', 'sample2.oud2')));
function base(): RosenFileData {
  const parsed = parseNodeTree(ORIGINAL);
  if (!parsed.ok) throw new Error('parse');
  return readRosenFile(parsed.root).data;
}
function run(data: RosenFileData, ...cmds: EditCommand[]): RosenFileData {
  let s = createDocumentState(data);
  for (const c of cmds) s = executeCommand(s, c);
  return s.rosenFileData;
}
const list = (d: RosenFileData) => d.rosen.diaCont[0]!.ressyaCont[0];

// sample2 下り列車 0(001): 駅4 着720/発780、駅6 発1020、駅8 着1320/発1360、駅13 着1980。
const UNDIRECT_8: EditCommand = {
  type: 'ressya/undirect',
  diaIndex: 0,
  houkou: 0,
  ressyaIndex: 0,
  ekiOrder: 8,
};

describe('ressya/undirect(分断)', () => {
  it('駅 8 で分断: 前半は当駅止まり(発消去)・後半は当駅始発(着消去)が直後に挿入される', () => {
    const before = list(base()).length;
    const next = run(base(), UNDIRECT_8);
    const cont = list(next);
    expect(cont.length).toBe(before + 1);
    const front = cont[0]!;
    const back = cont[1]!;
    // 前半: 駅 8 の着 1320 は残り発は消える。以後は運行なし。
    expect(front.ekiJikokuCont[8]!.chakuJikoku).toBe(1320);
    expect(front.ekiJikokuCont[8]!.hatsuJikoku).toBeNull();
    expect(front.ekiJikokuCont[9]!.ekiatsukai).toBe('none');
    // 後半: 駅 8 の発 1360 は残り着は消える。以前は運行なし。
    expect(back.ekiJikokuCont[8]!.hatsuJikoku).toBe(1360);
    expect(back.ekiJikokuCont[8]!.chakuJikoku).toBeNull();
    expect(back.ekiJikokuCont[7]!.ekiatsukai).toBe('none');
    expect(back.ekiJikokuCont[9]!.chakuJikoku).toBe(1450);
    // 両方とも全属性(番号・種別)を複製。
    expect(front.ressyabangou).toBe('001');
    expect(back.ressyabangou).toBe('001');
    expect(back.syubetsuIndex).toBe(front.syubetsuIndex);
  });

  it('発時刻しかない駅(駅 6)での分断は前半・後半とも発時刻が残る(原典の境界動作)', () => {
    const next = run(base(), { ...UNDIRECT_8, ekiOrder: 6 });
    const cont = list(next);
    expect(cont[0]!.ekiJikokuCont[6]!.hatsuJikoku).toBe(1020); // 着なし → 発は消えない
    expect(cont[1]!.ekiJikokuCont[6]!.hatsuJikoku).toBe(1020);
  });

  it('Undo でバイト一致', () => {
    const s1 = executeCommand(createDocumentState(base()), UNDIRECT_8);
    const out = writeOud2(undo(s1).rosenFileData);
    expect(Buffer.from(out).equals(Buffer.from(ORIGINAL))).toBe(true);
  });
});

describe('findTrainToDirect + ressya/direct(直通化)', () => {
  it('分断した 2 本を再接続すると元のファイルとバイト一致する(ラウンドトリップ)', () => {
    const split = run(base(), UNDIRECT_8);
    // 相手探索: フォーカス = 前半(index 0)・フォーカス駅 = 分断駅 8。
    const partner = findTrainToDirect(list(split), 0, 8);
    expect(partner).toBe(1);
    const rejoined = run(split, {
      type: 'ressya/direct',
      diaIndex: 0,
      houkou: 0,
      syuuchakuIndex: 0,
      sihatsuIndex: 1,
      ekiOrder: 8,
    });
    expect(Buffer.from(writeOud2(rejoined)).equals(Buffer.from(ORIGINAL))).toBe(true);
  });

  it('時刻条件: 相手の発がフォーカスの着より前(mod ±12h で負)なら対象外', () => {
    const split = run(
      base(),
      UNDIRECT_8,
      // 後半(index 1)を -2 時間シフト → 発 1360-7200 < 着 1320。
      {
        type: 'ekiJikoku/shiftJikoku',
        diaIndex: 0,
        houkou: 0,
        ressyaIndices: [1],
        ekiOrder: 8,
        item: 'hatsu',
        deltaSeconds: -7200,
      },
    );
    expect(findTrainToDirect(list(split), 0, 8)).toBeNull();
  });

  it('種別が異なる列車は対象外', () => {
    const split = run(base(), UNDIRECT_8, {
      type: 'ressya/stepSyubetsu',
      diaIndex: 0,
      houkou: 0,
      ressyaIndices: [1],
      step: 1,
    });
    expect(findTrainToDirect(list(split), 0, 8)).toBeNull();
  });

  it('別駅接続(terminal < start): 間の駅は運行なし化・接続駅の番線は始発側', () => {
    // 前半 = 駅 8 止まり、後半 = 駅 13 始発へ加工。後半の運行区間は駅 21 から
    // (駅 14-20 は運行なし)なので runFirst = 21 が接続駅になる。
    const split = run(base(), UNDIRECT_8, {
      type: 'ressya/setSihatsuEki',
      diaIndex: 0,
      houkou: 0,
      ressyaIndices: [1],
      ekiOrder: 13,
    });
    const backTrack = list(split)[1]!.ekiJikokuCont[21]!.ressyaTrackIndex;
    expect(findTrainToDirect(list(split), 0, 21)).toBe(1);
    const joined = run(split, {
      type: 'ressya/direct',
      diaIndex: 0,
      houkou: 0,
      syuuchakuIndex: 0,
      sihatsuIndex: 1,
      ekiOrder: 21,
    });
    const r = list(joined)[0]!;
    for (let o = 9; o <= 20; o++) expect(r.ekiJikokuCont[o]!.ekiatsukai).toBe('none'); // 間
    expect(r.ekiJikokuCont[8]!.chakuJikoku).toBe(1320); // 前半の終着はそのまま
    expect(r.ekiJikokuCont[21]!.chakuJikoku).toBeNull(); // this 側は none → 着なし
    expect(r.ekiJikokuCont[21]!.hatsuJikoku).toBe(2130); // 発 = 始発側
    expect(r.ekiJikokuCont[21]!.ressyaTrackIndex).toBe(backTrack); // 別駅接続 → 番線は始発側
    expect(r.ekiJikokuCont[23]!.chakuJikoku).toBe(2460); // 以後は始発側のコピー
  });

  it('列車情報は終着側優先(空のときだけ始発側を採用)', () => {
    const split = run(
      base(),
      UNDIRECT_8,
      {
        type: 'ressya/setProp',
        diaIndex: 0,
        houkou: 0,
        ressyaIndex: 0,
        prop: { key: 'ressyabangou', value: '' },
      },
      {
        type: 'ressya/setProp',
        diaIndex: 0,
        houkou: 0,
        ressyaIndex: 1,
        prop: { key: 'bikou', value: '後半備考' },
      },
    );
    const frontBikou = list(split)[0]!.bikou; // 終着側は元の備考(非空)を持つ
    const joined = run(split, {
      type: 'ressya/direct',
      diaIndex: 0,
      houkou: 0,
      syuuchakuIndex: 0,
      sihatsuIndex: 1,
      ekiOrder: 8,
    });
    const r = list(joined)[0]!;
    expect(r.ressyabangou).toBe('001'); // 終着側が空 → 始発側から採用
    expect(r.bikou).toBe(frontBikou); // 終着側が非空 → 終着側優先(始発側は採用しない)
  });
});

describe('ressya/pasteEkiJikoku(時刻のみ貼り付け)', () => {
  it('src の停車/通過駅のみ上書きし、運行なし駅・列車情報は維持する', () => {
    const d0 = base();
    const src = structuredClone(list(d0)[2]!); // 003(駅4 着4320/発4380)
    const next = run(d0, {
      type: 'ressya/pasteEkiJikoku',
      diaIndex: 0,
      houkou: 0,
      ressyaIndex: 0,
      src,
    });
    const r = list(next)[0]!;
    expect(r.ekiJikokuCont[4]!.chakuJikoku).toBe(4320); // src で上書き
    expect(r.ekiJikokuCont[4]!.hatsuJikoku).toBe(4380);
    expect(r.ekiJikokuCont[14]!.ekiatsukai).toBe('none'); // src も none → 維持
    expect(r.ressyabangou).toBe('001'); // 列車情報は不変
  });

  it('src の時刻が null の欄は既存値を維持する(駅扱のみ上書き)', () => {
    const d0 = base();
    // 駅 4 に時刻を持つ列車 0 に対し、駅 4 が停車・時刻なしの src を貼る。
    const src = structuredClone(list(d0)[0]!);
    src.ekiJikokuCont[4] = {
      ...src.ekiJikokuCont[4]!,
      chakuJikoku: null,
      hatsuJikoku: null,
    };
    const next = run(d0, {
      type: 'ressya/pasteEkiJikoku',
      diaIndex: 0,
      houkou: 0,
      ressyaIndex: 0,
      src,
    });
    expect(list(next)[0]!.ekiJikokuCont[4]!.chakuJikoku).toBe(720); // 維持
  });
});

describe('ressya/unify(列車番号で一本化)', () => {
  it('分断した 2 本(同番号・同種別・接続駅一致)が併合され、元とバイト一致する', () => {
    const split = run(base(), UNDIRECT_8);
    const unified = run(split, {
      type: 'ressya/unify',
      diaIndex: 0,
      houkou: 0,
      targetIndices: null,
    });
    expect(Buffer.from(writeOud2(unified)).equals(Buffer.from(ORIGINAL))).toBe(true);
  });

  it('列車番号が空の列車は併合しない', () => {
    const split = run(
      base(),
      UNDIRECT_8,
      {
        type: 'ressya/setProp',
        diaIndex: 0,
        houkou: 0,
        ressyaIndex: 0,
        prop: { key: 'ressyabangou', value: '' },
      },
      {
        type: 'ressya/setProp',
        diaIndex: 0,
        houkou: 0,
        ressyaIndex: 1,
        prop: { key: 'ressyabangou', value: '' },
      },
    );
    const count = list(split).length;
    const unified = run(split, {
      type: 'ressya/unify',
      diaIndex: 0,
      houkou: 0,
      targetIndices: null,
    });
    expect(list(unified).length).toBe(count); // 併合なし
  });

  it('明示選択(targetIndices)外の列車は対象にならない', () => {
    const split = run(base(), UNDIRECT_8); // index 0,1 が併合可能ペア
    const unified = run(split, {
      type: 'ressya/unify',
      diaIndex: 0,
      houkou: 0,
      targetIndices: [0, 2], // ペアの片割れ(1)を含まない
    });
    expect(list(unified).length).toBe(list(split).length); // 併合なし
  });

  it('接続駅の Order が一致しないペアは併合しない', () => {
    // 駅 8 で分断後、後半を当駅始発 9 に変更 → 接続駅不一致(8 ≠ 9)。
    const split = run(base(), UNDIRECT_8, {
      type: 'ressya/setSihatsuEki',
      diaIndex: 0,
      houkou: 0,
      ressyaIndices: [1],
      ekiOrder: 9,
    });
    const unified = run(split, {
      type: 'ressya/unify',
      diaIndex: 0,
      houkou: 0,
      targetIndices: null,
    });
    expect(list(unified).length).toBe(list(split).length);
  });

  it('運行範囲が重なるペアは追加条件なしで併合される(U 229/252 非該当経路)', () => {
    // 列車 0 の複製を挿入(完全に重なる同番号・同種別ペア)→ 無条件併合で -1 本。
    const d0 = base();
    const dup = structuredClone(list(d0)[0]!);
    const withDup = run(d0, {
      type: 'ressya/replaceRange',
      diaIndex: 0,
      houkou: 0,
      index: 1,
      count: 0,
      trains: [dup],
    });
    const before = list(withDup).length;
    const unified = run(withDup, {
      type: 'ressya/unify',
      diaIndex: 0,
      houkou: 0,
      targetIndices: null,
    });
    expect(list(unified).length).toBe(before - 1);
    expect(list(unified)[0]!.ekiJikokuCont[4]!.chakuJikoku).toBe(720); // 値は維持
  });

  it('Undo 1 回で全併合が戻る', () => {
    const split = run(base(), UNDIRECT_8);
    const s0 = createDocumentState(split);
    const s1 = executeCommand(s0, {
      type: 'ressya/unify',
      diaIndex: 0,
      houkou: 0,
      targetIndices: null,
    });
    expect(list(s1.rosenFileData).length).toBe(list(split).length - 1);
    expect(undo(s1).rosenFileData).toEqual(split);
  });
});
