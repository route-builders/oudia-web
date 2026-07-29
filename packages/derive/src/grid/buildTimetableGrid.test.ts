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

  it('enableOperation=0 では運用番号行が出ず、作業行は 2 行だけ(原典 :213-275)', () => {
    const data = loadRel('current/sample2.oud2');
    const r = buildTimetableGrid(data, 0, {
      ...defaultTimetableGridOptions(data, RESSYAHOUKOU_KUDARI),
      enableOperation: 0, // 強制 0
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // 運用番号行は enableOperation > 1 のときだけ出る。
    expect(r.grid.rows.filter((row) => row.type === 'operationNumber')).toHaveLength(0);
    // 作業ブロックは 1=作業名 / 2=時刻 の 2 行のみ(運番・連携コード行は出ない)。
    expect(r.grid.rows.filter((row) => row.type === 'operationShihatsu')).toHaveLength(2);
    expect(r.grid.rows.filter((row) => row.type === 'operationShuchaku')).toHaveLength(2);
    // 1/2 行目のテキストは原典どおり enableOperation に関係なく埋まる(CCellBuilder.cpp:6404-)。
    const nameRow = r.grid.rows.findIndex((row) => row.type === 'operationShihatsu');
    expect(r.grid.cells[nameRow]?.[2]?.text).toBe('出区');
  });

  it('enableOperation=2 では運用番号行が OperationNumberRows 段ぶん出る', () => {
    const data = loadRel('current/sample2.oud2'); // EnableOperation=2 / OperationNumberRows=2
    const r = buildTimetableGrid(data, 0, defaultTimetableGridOptions(data, RESSYAHOUKOU_KUDARI));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const opNumRows = r.grid.rows.filter((row) => row.type === 'operationNumber');
    expect(opNumRows).toHaveLength(data.dispProp.operationNumberRows);
    // 段は 0..rows-1、最下段だけ細線。
    expect(opNumRows.map((row) => row.operationIndex)).toEqual([0, 1]);
    expect(opNumRows.map((row) => row.bottomBorder)).toEqual(['none', 'narrow']);
    // 1 列車目の運番 1;2 は 2 段に割れる("1" / "+2")。
    const first = r.grid.rows.findIndex((row) => row.type === 'operationNumber');
    expect(r.grid.cells[first]?.[2]?.text).toBe('1');
    expect(r.grid.cells[first + 1]?.[2]?.text).toBe('+2');
  });

  it('enableOperation>=1 で作業行に作業テキストが出る(sample2 実データ)', () => {
    const data = loadRel('current/sample2.oud2'); // EnableOperation=2
    const r = buildTimetableGrid(data, 0, defaultTimetableGridOptions(data, RESSYAHOUKOU_KUDARI));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // 作業行に空でないテキストが少なくとも 1 つある(出区/入区/接続 等)。
    let found = false;
    r.grid.rows.forEach((row, ri) => {
      if (row.type !== 'operationShihatsu' && row.type !== 'operationShuchaku') return;
      for (let c = 2; c < r.grid.columns.length; c++) {
        if ((r.grid.cells[ri]?.[c]?.text ?? '') !== '') found = true;
      }
    });
    expect(found).toBe(true);
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
