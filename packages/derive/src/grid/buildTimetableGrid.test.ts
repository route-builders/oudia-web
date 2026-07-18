// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 up-tri

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { RosenFileData } from '@oudia-web/format';
import {
  parseNodeTree,
  RESSYAHOUKOU_KUDARI,
  RESSYAHOUKOU_NOBORI,
  readRosenFile,
} from '@oudia-web/format';
import { describe, expect, it } from 'vitest';
import { buildTimetableGrid, defaultTimetableGridOptions } from './buildTimetableGrid.js';
import { buildJikokuhyouRowSpec } from './colSpec.js';

const here = dirname(fileURLToPath(import.meta.url));
function loadRel(rel: string): RosenFileData {
  const bytes = new Uint8Array(
    readFileSync(join(here, '..', '..', '..', 'format', 'fixtures', rel)),
  );
  const parsed = parseNodeTree(bytes);
  if (!parsed.ok) throw new Error(`parse failed: ${rel}`);
  return readRosenFile(parsed.root).data;
}

describe('buildTimetableGrid(sample2 スナップショット)', () => {
  it('下り dia0(先頭 3 列車 × 全行の圧縮スナップショット)', () => {
    const data = loadRel('current/sample2.oud2');
    const r = buildTimetableGrid(data, 0, defaultTimetableGridOptions(data, RESSYAHOUKOU_KUDARI));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // 全セルは巨大なので、各行の [駅名/着発ラベル, 先頭 3 列車のテキスト or マーク] に圧縮。
    const compact = r.grid.rows.map((row, ri) => {
      const cells = r.grid.cells[ri]!;
      const label = `${cells[0]!.text}/${cells[1]!.text}`;
      const trains = cells
        .slice(2, 5)
        .map((c) => (c.kind === 'mark' ? `#${c.mark ?? ''}` : c.text));
      return [row.type, label, trains];
    });
    expect(compact).toMatchSnapshot();
  });

  it('上り dia0 も破綻なく生成される', () => {
    const data = loadRel('current/sample2.oud2');
    const r = buildTimetableGrid(data, 0, defaultTimetableGridOptions(data, RESSYAHOUKOU_NOBORI));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.grid.columns.length).toBeGreaterThan(2);
    // 通過時刻に "?" が付かないこと(CSV との差)。
    const anyQuestion = r.grid.cells.some((row) => row.some((c) => c.text.includes('?')));
    expect(anyQuestion).toBe(false);
  });

  it('旧世代(1.05)でも世代非依存にグリッド生成できる', () => {
    const data = loadRel('oldgen/oudiasecond-1.05.oud2');
    const r = buildTimetableGrid(data, 0, defaultTimetableGridOptions(data, RESSYAHOUKOU_KUDARI));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.grid.rows.length).toBeGreaterThan(0);
  });

  it('不正な diaIndex は -1', () => {
    const data = loadRel('current/sample2.oud2');
    expect(
      buildTimetableGrid(data, 99, defaultTimetableGridOptions(data, RESSYAHOUKOU_KUDARI)),
    ).toEqual({
      ok: false,
      code: -1,
    });
  });
});

describe('buildJikokuhyouRowSpec(行構造)', () => {
  it('始発駅作業/終着駅作業が各 2 行(1 ラベル + 1 空継続)', () => {
    const data = loadRel('current/sample2.oud2');
    const rows = buildJikokuhyouRowSpec(data.rosen.ekiCont, RESSYAHOUKOU_KUDARI, {
      displayRessyamei: true,
    });
    expect(rows.filter((r) => r.type === 'operationShihatsu').length).toBe(2);
    expect(rows.filter((r) => r.type === 'operationShuchaku').length).toBe(2);
    // 各作業ブロックの 2 行目は継続行。
    const shihatsu = rows.filter((r) => r.type === 'operationShihatsu');
    expect(shihatsu[0]!.isContinuation).toBe(false);
    expect(shihatsu[1]!.isContinuation).toBe(true);
  });

  it('displayRessyamei=false で列車名/号数/号 の 3 行が消える', () => {
    const data = loadRel('current/sample2.oud2');
    const rows = buildJikokuhyouRowSpec(data.rosen.ekiCont, RESSYAHOUKOU_KUDARI, {
      displayRessyamei: false,
    });
    expect(rows.some((r) => r.type === 'ressyamei')).toBe(false);
    expect(rows.some((r) => r.type === 'gousuu')).toBe(false);
    expect(rows.some((r) => r.type === 'gou')).toBe(false);
  });

  it('備考が最終行', () => {
    const data = loadRel('current/sample2.oud2');
    const rows = buildJikokuhyouRowSpec(data.rosen.ekiCont, RESSYAHOUKOU_KUDARI, {
      displayRessyamei: true,
    });
    expect(rows[rows.length - 1]!.type).toBe('bikou');
  });
});
