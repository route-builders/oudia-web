// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 up-tri

/**
 * カスタマイズ時刻表の行スペック(customizeColSpec.ts)の単体テスト。follow-up #11。
 * 通常時刻表との差分と、1 駅ブロック内の順序・列車切替側(arrival/departure)を検証する。
 */

import { createDefaultEki } from '@oudia-web/domain';
import type { Eki } from '@oudia-web/format';
import { describe, expect, it } from 'vitest';
import type { CustomizeRowOptions } from './customizeColSpec.js';
import { buildCustomizeRowSpec } from './customizeColSpec.js';

const OPTS: CustomizeRowOptions = {
  displayRessyamei: false,
  enableOperation: 2,
  operationNumberRows: 1,
  displayShihatsuShuchakuEkimei: false,
};

/** 着発・番線・入線・路線外・前後情報欄を全部 ON にした 2 駅。 */
function ekiCont(): Eki[] {
  return [0, 1].map((i) => {
    const e = createDefaultEki(i, `E${String(i)}`);
    e.jikokuhyouJikokuDisplayKudari = { chaku: true, hatsu: true };
    e.jikokuhyouTrackDisplayKudari = true;
    e.jikokuhyouNyuusenJikokuDisplayKudari = true;
    e.jikokuhyouOuterDisplayKudari = { origin: true, terminal: true };
    e.jikokuhyouSyubetsuChangeDisplayKudari = {
      ressyabangou: 1,
      operationNumber: 1,
      syubetsu: 1,
      ressyamei: 1,
      operationNumberRows: 1,
    };
    e.jikokuhyouPrevSyubetsuChangeDisplayKudari = {
      ressyabangou: 1,
      operationNumber: 1,
      syubetsu: 1,
      ressyamei: 1,
      operationNumberRows: 1,
    };
    return e;
  });
}

/** 駅 0 のブロックだけを取り出す。 */
function block0(rows: ReturnType<typeof buildCustomizeRowSpec>) {
  return rows.filter((r) => r.ekiOrder === 0).map((r) => r.type);
}

describe('buildCustomizeRowSpec', () => {
  it('列ヘッダは 列車番号 → 運番 → 種別 で始まり、備考で終わる', () => {
    const rows = buildCustomizeRowSpec(ekiCont(), 0, OPTS);
    expect(rows[0]?.type).toBe('ressyabangou');
    expect(rows[1]?.type).toBe('operationNumber');
    expect(rows[2]?.type).toBe('ressyasyubetsu');
    expect(rows[rows.length - 1]?.type).toBe('bikou');
  });

  it('★始発駅名・終着駅名は設定 ON のときだけ出る(通常時刻表は無条件)', () => {
    const off = buildCustomizeRowSpec(ekiCont(), 0, OPTS).map((r) => r.type);
    expect(off).not.toContain('shihatsuEkimei');
    expect(off).not.toContain('shuchakuEkimei');
    const on = buildCustomizeRowSpec(ekiCont(), 0, {
      ...OPTS,
      displayShihatsuShuchakuEkimei: true,
    }).map((r) => r.type);
    expect(on).toContain('shihatsuEkimei');
    expect(on).toContain('shuchakuEkimei');
  });

  it('★始発/終着駅作業・路線外(トップレベル)・駅ごとの前後作業行は出ない', () => {
    const types = buildCustomizeRowSpec(ekiCont(), 0, OPTS).map((r) => r.type as string);
    for (const t of [
      'operationShihatsu',
      'operationShuchaku',
      'beforeOperation',
      'afterOperation',
    ]) {
      expect(types).not.toContain(t);
    }
  });

  it('★1 駅ブロックの順序: EkiPrev* → 路線外始発 → 着 → 入線 → 番線 → Eki* → 発 → 路線外終着', () => {
    const rows = buildCustomizeRowSpec(ekiCont(), 0, OPTS);
    expect(block0(rows)).toEqual([
      'ekiPrevRessyabangou',
      'ekiPrevOperationNumber',
      'ekiPrevRessyasyubetsu',
      'ekiPrevRessyamei',
      'ekiPrevGousuu',
      'ekiPrevGou',
      'ekiOuterShihatsu1',
      'ekiOuterShihatsu2',
      'chaku',
      'nyuusen',
      'track',
      'ekiRessyabangou',
      'ekiOperationNumber',
      'ekiRessyasyubetsu',
      'ekiRessyamei',
      'ekiGousuu',
      'ekiGou',
      'hatsu',
      'ekiOuterShuchaku1',
      'ekiOuterShuchaku2',
    ]);
  });

  it('★入線行は着行の「後」', () => {
    const types = block0(buildCustomizeRowSpec(ekiCont(), 0, OPTS));
    expect(types.indexOf('nyuusen')).toBeGreaterThan(types.indexOf('chaku'));
  });

  it('★列車切替の側: 番線までが arrival、Eki* 以降が departure', () => {
    const rows = buildCustomizeRowSpec(ekiCont(), 0, OPTS).filter((r) => r.ekiOrder === 0);
    const sideOf = (t: string): string | null => rows.find((r) => r.type === t)?.side ?? 'missing';
    for (const t of ['ekiPrevRessyabangou', 'ekiOuterShihatsu1', 'chaku', 'nyuusen', 'track']) {
      expect(sideOf(t)).toBe('arrival');
    }
    for (const t of ['ekiRessyabangou', 'hatsu', 'ekiOuterShuchaku1']) {
      expect(sideOf(t)).toBe('departure');
    }
    // ヘッダ群と備考は切替しない。
    expect(buildCustomizeRowSpec(ekiCont(), 0, OPTS)[0]?.side).toBeNull();
  });

  it('★前列車情報欄は enableOperation > 1 のときだけ出る', () => {
    const t1 = buildCustomizeRowSpec(ekiCont(), 0, { ...OPTS, enableOperation: 1 }).map(
      (r) => r.type,
    );
    expect(t1).not.toContain('ekiPrevRessyabangou');
    // 入線時刻は enableOperation > 0 なので簡易でも出る。
    expect(t1).toContain('nyuusen');
    const t0 = buildCustomizeRowSpec(ekiCont(), 0, { ...OPTS, enableOperation: 0 }).map(
      (r) => r.type,
    );
    expect(t0).not.toContain('nyuusen');
    // 自列車の運番行も enableOperation > 1 のときだけ。
    expect(t1).not.toContain('ekiOperationNumber');
    expect(t1).toContain('ekiRessyabangou');
  });

  it('★着発・番線は駅の個別設定で決まる(駅時刻形式や TrackOmit は見ない)', () => {
    const cont = ekiCont();
    const e0 = cont[0];
    if (e0 === undefined) throw new Error('no eki');
    e0.jikokuhyouJikokuDisplayKudari = { chaku: false, hatsu: true };
    e0.jikokuhyouTrackDisplayKudari = false;
    e0.jikokuhyouTrackOmit = true; // ★カスタマイズでは無視される
    const types = block0(buildCustomizeRowSpec(cont, 0, OPTS));
    expect(types).not.toContain('chaku');
    expect(types).toContain('hatsu');
    expect(types).not.toContain('track');
  });

  it('上りは駅Order 順が反転する(駅Index → 駅Order 変換)', () => {
    const cont = ekiCont();
    const e0 = cont[0];
    const e1 = cont[1];
    if (e0 === undefined || e1 === undefined) throw new Error('no eki');
    // 上り側の設定だけ駅 0(= 上り駅Order 1)に入れる。
    e0.jikokuhyouJikokuDisplayNobori = { chaku: true, hatsu: false };
    e1.jikokuhyouJikokuDisplayNobori = { chaku: false, hatsu: false };
    const rows = buildCustomizeRowSpec(cont, 1, OPTS);
    // 上り駅Order 1 = 駅Index 0 に着行が出る。
    expect(rows.some((r) => r.type === 'chaku' && r.ekiOrder === 1)).toBe(true);
    expect(rows.some((r) => r.type === 'chaku' && r.ekiOrder === 0)).toBe(false);
  });
});
