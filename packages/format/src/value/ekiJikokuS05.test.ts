// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 up-tri

import { describe, expect, it } from 'vitest';
import { decodeEkiJikokuS05 } from './ekiJikoku.js';

describe('decodeEkiJikokuS05(RessyaTrack= マージ)', () => {
  it('駅扱 + 着/発を decode($ なし)、番線は trackElem から 1 起点', () => {
    // `1;/500` teisya 発 05:00:00、番線 2(size 2)→ 1。
    const r = decodeEkiJikokuS05('1;/500', '2', 2, 0);
    expect(r.ekiatsukai).toBe('teisya');
    expect(r.hatsuJikoku).toBe(18000);
    expect(r.chakuJikoku).toBeNull();
    expect(r.ressyaTrackIndex).toBe(1);
  });

  it('着/発 両方(着/発)', () => {
    const r = decodeEkiJikokuS05('1;500/530', '1', 2, 0);
    expect(r.chakuJikoku).toBe(18000);
    expect(r.hatsuJikoku).toBe(19800);
    expect(r.ressyaTrackIndex).toBe(0);
  });

  it('番線 0(旧主本線)→ 主本線にフォールバック', () => {
    const r = decodeEkiJikokuS05('1;/500', '0', 2, 1);
    expect(r.ressyaTrackIndex).toBe(1);
  });

  it('番線が範囲外(> size)→ 主本線', () => {
    const r = decodeEkiJikokuS05('1;/500', '9', 2, 1);
    expect(r.ressyaTrackIndex).toBe(1);
  });

  it('trackElem 空(OOB 相当)→ 主本線', () => {
    const r = decodeEkiJikokuS05('1;/500', '', 2, 1);
    expect(r.ressyaTrackIndex).toBe(1);
  });

  it('trackElem の ; 以降(作業)は無視して先頭のみ使う', () => {
    const r = decodeEkiJikokuS05('1;/500', '2;なにか', 2, 0);
    expect(r.ressyaTrackIndex).toBe(1);
  });

  it('駅扱 3(旧 経由なし)→ none', () => {
    const r = decodeEkiJikokuS05('3;/500', '1', 2, 0);
    expect(r.ekiatsukai).toBe('none');
  });

  it('通過(駅扱 2)', () => {
    const r = decodeEkiJikokuS05('2;/500', '1', 2, 0);
    expect(r.ekiatsukai).toBe('tsuuka');
  });

  it('空要素 → none・時刻 null・番線 主本線', () => {
    const r = decodeEkiJikokuS05('', '', 2, 0);
    expect(r.ekiatsukai).toBe('none');
    expect(r.chakuJikoku).toBeNull();
    expect(r.hatsuJikoku).toBeNull();
    expect(r.ressyaTrackIndex).toBe(0);
  });
});
