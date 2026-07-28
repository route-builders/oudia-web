// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 up-tri

/**
 * 運用探索 Worker クライアントのフォールバック検証。M7e。
 *
 * Node/テスト環境には Worker が無いので、クライアントは**同期実装へ自動フォールバック**して
 * 同じ結果を返さなければならない(この性質があるから既存のビューテストが Worker 無しで通る)。
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deriveOperationFull } from '@oudia-web/derive';
import { parseNodeTree, readRosenFile } from '@oudia-web/format';
import { afterEach, describe, expect, it } from 'vitest';
import {
  isWorkerActive,
  runOperationFull,
  terminateOperationSearchWorker,
} from './operationSearchClient.js';

const here = dirname(fileURLToPath(import.meta.url));

function loadSample2() {
  const bytes = new Uint8Array(
    readFileSync(
      join(
        here,
        '..',
        '..',
        '..',
        '..',
        'packages',
        'format',
        'fixtures',
        'current',
        'sample2.oud2',
      ),
    ),
  );
  const parsed = parseNodeTree(bytes);
  if (!parsed.ok) throw new Error('parse failed');
  return readRosenFile(parsed.root).data;
}

afterEach(() => {
  terminateOperationSearchWorker();
});

describe('operationSearchClient', () => {
  it('Worker が無い環境では同期実装へフォールバックし、直接呼びと同一結果を返す', async () => {
    const data = loadSample2();
    const dia = data.rosen.diaCont[0];
    if (dia === undefined) throw new Error('no dia');
    const options = {
      operationCrossKitenJikoku: data.rosen.operationCrossKitenJikoku,
      disableHiddenSyubetsu: data.rosen.disableHiddenSyubetsu,
      kitenJikoku: data.rosen.kitenJikoku,
      operationNumberReverse: data.rosen.operationNumberReverse,
      syubetsuCont: data.rosen.ressyasyubetsuCont,
    };

    const viaClient = await runOperationFull({ dia, ekiCont: data.rosen.ekiCont, options });
    const direct = deriveOperationFull(dia, data.rosen.ekiCont, options);

    expect(isWorkerActive()).toBe(false);
    expect([...viaClient.operationTable.keys()].sort()).toEqual(
      [...direct.operationTable.keys()].sort(),
    );
    expect(viaClient.assignedNumbers.size).toBe(direct.assignedNumbers.size);
    expect(viaClient.inOutLinkCodes.size).toBe(direct.inOutLinkCodes.size);
  });
});
