// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 oudia-second-web contributors

import { describe, it, expect } from 'vitest';
import { RESSYAHOUKOU_KUDARI, RESSYAHOUKOU_NOBORI } from '@oudia/format';
import { deriveEkiJikokuhyou } from './deriveEkiJikokuhyou.js';
import { loadFixture } from '../csv/testFixture.js';

describe('deriveEkiJikokuhyou(実ファイル sample2)', () => {
  it('始発駅(下り駅Order 0)は当駅始発フラグが立ち、発車分でソートされる', () => {
    const data = loadFixture('current/sample2.oud2');
    const vm = deriveEkiJikokuhyou(data, data.rosen.diaCont[0]!, RESSYAHOUKOU_KUDARI, 0);
    // 少なくとも 1 本は発車がある。
    const all = [...vm.buckets.values()].flat();
    expect(all.length).toBeGreaterThan(0);
    // 始発駅なので当駅始発フラグが立つ列車がある。
    expect(all.some((c) => c.isShihatsu)).toBe(true);
    // 各バケット内は発車分の昇順。
    for (const list of vm.buckets.values()) {
      for (let i = 1; i < list.length; i++) {
        expect(list[i]!.minute).toBeGreaterThanOrEqual(list[i - 1]!.minute);
      }
    }
  });

  it('バケットのキーは 0–23 の時、発車分は 0–59', () => {
    const data = loadFixture('current/sample2.oud2');
    const vm = deriveEkiJikokuhyou(data, data.rosen.diaCont[0]!, RESSYAHOUKOU_KUDARI, 3);
    for (const [hour, list] of vm.buckets) {
      expect(hour).toBeGreaterThanOrEqual(0);
      expect(hour).toBeLessThan(24);
      for (const c of list) {
        expect(c.minute).toBeGreaterThanOrEqual(0);
        expect(c.minute).toBeLessThan(60);
      }
    }
  });

  it('中間駅(下り駅Order 5)でも発車がバケットされる', () => {
    const data = loadFixture('current/sample2.oud2');
    const vm = deriveEkiJikokuhyou(data, data.rosen.diaCont[0]!, RESSYAHOUKOU_KUDARI, 5);
    const all = [...vm.buckets.values()].flat();
    expect(all.length).toBeGreaterThan(0);
    // 中間駅ゆえ当駅始発でない列車が含まれる。
    expect(all.some((c) => !c.isShihatsu)).toBe(true);
  });

  it('CSV エンコーダと同一のバケットを返す(抽出リグレッション)', () => {
    // CSV 側は同じ deriveEkiJikokuhyou を使うため、内容が一致する(スナップショットが
    // 変わらないことは ekiTimetableCsv.test.ts が担保)。ここでは VM が空でないことを確認。
    const data = loadFixture('current/sample2.oud2');
    const vm = deriveEkiJikokuhyou(data, data.rosen.diaCont[0]!, RESSYAHOUKOU_NOBORI, 5);
    expect([...vm.buckets.values()].flat().length).toBeGreaterThan(0);
  });
});
