// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 oudia-second-web contributors

import { describe, it, expect } from 'vitest';
import { RESSYAHOUKOU_KUDARI, RESSYAHOUKOU_NOBORI } from '@oudia/format';
import { buildEkiTimetableCsv } from './ekiTimetableCsv.js';
import { loadFixture } from './testFixture.js';

const OPT = { displayParentSyubetsu: false, displayTrack: false, displayIsShihatsu: true };
const OPT_TRACK = { displayParentSyubetsu: false, displayTrack: true, displayIsShihatsu: true };

describe('buildEkiTimetableCsv(実ファイル sample2)', () => {
  it('下り・田角駅(始発駅)スナップショット', () => {
    const data = loadFixture('current/sample2.oud2');
    const r = buildEkiTimetableCsv(data, {
      dia: data.rosen.diaCont[0]!,
      houkou: RESSYAHOUKOU_KUDARI,
      ekiOrder: 0,
      options: OPT,
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.csv).toMatchSnapshot();
  });

  it('下り・中間駅 + 番線行つきスナップショット', () => {
    const data = loadFixture('current/sample2.oud2');
    const r = buildEkiTimetableCsv(data, {
      dia: data.rosen.diaCont[0]!,
      houkou: RESSYAHOUKOU_KUDARI,
      ekiOrder: 5,
      options: OPT_TRACK,
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.csv).toMatchSnapshot();
  });

  it('上り・中間駅スナップショット', () => {
    const data = loadFixture('current/sample2.oud2');
    const r = buildEkiTimetableCsv(data, {
      dia: data.rosen.diaCont[0]!,
      houkou: RESSYAHOUKOU_NOBORI,
      ekiOrder: 5,
      options: OPT,
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.csv).toMatchSnapshot();
  });

  it('UTF-8 BOM で始まり、CRLF で行終端する', () => {
    const data = loadFixture('current/sample2.oud2');
    const r = buildEkiTimetableCsv(data, {
      dia: data.rosen.diaCont[0]!,
      houkou: RESSYAHOUKOU_KUDARI,
      ekiOrder: 0,
      options: OPT,
    });
    if (!r.ok) throw new Error('build failed');
    expect(r.csv.startsWith('﻿')).toBe(true);
    expect(r.csv.includes('\r\n')).toBe(true);
    // タイトル行に駅名 + 方向ラベル。
    expect(r.csv).toContain('駅 下り時刻表');
  });

  it('resume=true は先頭に空行を 1 行入れる(ブロック連結)', () => {
    const data = loadFixture('current/sample2.oud2');
    const r = buildEkiTimetableCsv(data, {
      dia: data.rosen.diaCont[0]!,
      houkou: RESSYAHOUKOU_KUDARI,
      ekiOrder: 0,
      options: OPT,
      resume: true,
    });
    if (!r.ok) throw new Error('build failed');
    // BOM の直後が空行(いきなり CRLF)。
    expect(r.csv.startsWith('﻿\r\n')).toBe(true);
  });

  it('不正な ekiOrder は -1', () => {
    const data = loadFixture('current/sample2.oud2');
    const r = buildEkiTimetableCsv(data, {
      dia: data.rosen.diaCont[0]!,
      houkou: RESSYAHOUKOU_KUDARI,
      ekiOrder: 999,
      options: OPT,
    });
    expect(r).toEqual({ ok: false, code: -1 });
  });
});
