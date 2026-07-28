// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 up-tri

/** 作業行書式 formatOperationLine + field-visibility operationFieldSpec のテスト(PR-2)。 */

import type { EkiTrack2, OuterTerminal } from '@oudia-web/format';
import { asSeconds } from '@oudia-web/format';
import { describe, expect, it } from 'vitest';
import {
  type FlatOp,
  OP_CONNECT,
  OP_JUNCTION,
  OP_NUMBER_CHANGE,
  OP_OUT_IN,
  OP_OUTER,
  OP_RELEASE,
  OP_SHUNT,
} from './editModel.js';
import {
  formatOperationJikoku,
  formatOperationLine,
  type OperationFormatCtx,
  operationFieldSpec,
} from './operationView.js';

const tracks: EkiTrack2[] = [
  { trackName: '1番線', trackRyakusyou: '1', trackNoboriRyakusyou: '' },
  { trackName: '2番線', trackRyakusyou: '2', trackNoboriRyakusyou: '' },
];
const outerTerminals: OuterTerminal[] = [{ ekimei: '車庫前', jikokuRyaku: '', diaRyaku: '' }];
const ctx: OperationFormatCtx = { tracks, outerTerminals };

function op(partial: Partial<FlatOp> & Pick<FlatOp, 'kind'>): FlatOp {
  return {
    comboData1: 0,
    editData1: null,
    editData2: null,
    releaseCount: 0,
    check1: false,
    operationNumbers: [],
    inOutLinkCode: '',
    level: [0],
    ...partial,
  };
}

describe('formatOperationJikoku', () => {
  it('秒付き・コロンなし・時 0 埋めなし', () => {
    expect(formatOperationJikoku(asSeconds(8 * 3600 + 29 * 60 + 45))).toBe('82945');
    expect(formatOperationJikoku(asSeconds(0))).toBe('00000'); // 0:00:00
    expect(formatOperationJikoku(asSeconds(23 * 3600 + 5 * 60 + 3))).toBe('230503');
    expect(formatOperationJikoku(null)).toBe('--:--');
  });
});

describe('formatOperationLine 各種別', () => {
  it('入換(前作業=「から」)', () => {
    const line = formatOperationLine(
      op({ kind: OP_SHUNT, comboData1: 1, editData1: asSeconds(3600), editData2: null }),
      false,
      ctx,
    );
    expect(line).toBe('0 入換 2番線から 10000 発 --:-- 着 ');
  });

  it('入換(後作業=「へ」)', () => {
    const line = formatOperationLine(
      op({ kind: OP_SHUNT, comboData1: 0, editData1: null, editData2: asSeconds(3660) }),
      true,
      ctx,
    );
    expect(line).toBe('0 入換 1番線へ --:-- 発 10100 着 ');
  });

  it('増結(罫線 ┘)', () => {
    const line = formatOperationLine(
      op({ kind: OP_CONNECT, comboData1: 0, editData1: asSeconds(3600), level: [1, 1] }),
      false,
      ctx,
    );
    expect(line).toBe('1.1┘ 増結 10000 編成後方に増結');
  });

  it('解結(罫線 ┐・編成数)', () => {
    const line = formatOperationLine(
      op({ kind: OP_RELEASE, comboData1: 0, releaseCount: 3, editData2: asSeconds(3600) }),
      false,
      ctx,
    );
    expect(line).toBe('0┐ 解結 10000 後方の 3 編成を解結');
  });

  it('出区(前=運番+連携)', () => {
    const line = formatOperationLine(
      op({
        kind: OP_OUT_IN,
        editData1: asSeconds(3540),
        operationNumbers: ['1', '2'],
        inOutLinkCode: 'AB',
      }),
      false,
      ctx,
    );
    expect(line).toBe('0 出区 05900 1;2 AB');
  });

  it('入区(後=連携のみ)', () => {
    const line = formatOperationLine(
      op({ kind: OP_OUT_IN, editData1: asSeconds(3600), inOutLinkCode: 'CD' }),
      true,
      ctx,
    );
    expect(line).toBe('0 入区 10000 CD');
  });

  it('路線外始発(前)', () => {
    const line = formatOperationLine(
      op({
        kind: OP_OUTER,
        comboData1: 0,
        editData1: asSeconds(3000),
        editData2: asSeconds(3600),
      }),
      false,
      ctx,
    );
    expect(line).toBe('0 路線外始発 車庫前駅 05000 発 当駅 10000 着');
  });

  it('次列車接続(後=タイプ)', () => {
    const line = formatOperationLine(
      op({ kind: OP_JUNCTION, comboData1: 1, editData1: asSeconds(3600) }),
      true,
      ctx,
    );
    expect(line).toBe('0 次列車接続 10000 種別変更');
  });

  it('前列車接続(前=仮運番)', () => {
    const line = formatOperationLine(
      op({ kind: OP_JUNCTION, editData1: asSeconds(3600), operationNumbers: ['A1'] }),
      false,
      ctx,
    );
    expect(line).toBe('0 前列車接続 10000 A1');
  });

  it('運用番号変更 / 順反転', () => {
    expect(
      formatOperationLine(op({ kind: OP_NUMBER_CHANGE, operationNumbers: ['5'] }), false, ctx),
    ).toBe('0 運用番号変更 5');
    expect(formatOperationLine(op({ kind: OP_NUMBER_CHANGE, check1: true }), false, ctx)).toBe(
      '0 運用番号順反転',
    );
  });
});

describe('operationFieldSpec', () => {
  const opts = { outerEnable: true, levelDepth: 1, hasPrevSibling: false, hasNextSibling: false };

  it('入換系と端点系のラジオが相互排他', () => {
    const shunt = operationFieldSpec(OP_SHUNT, false, opts);
    // 入換系(0,1,2,6)有効 / 端点系(3,4,5)無効。
    expect(shunt.radios[0]?.enabled).toBe(true);
    expect(shunt.radios[1]?.enabled).toBe(true);
    expect(shunt.radios[6]?.enabled).toBe(true);
    expect(shunt.radios[3]?.enabled).toBe(false);
    const out = operationFieldSpec(OP_OUT_IN, false, opts);
    expect(out.radios[3]?.enabled).toBe(true);
    expect(out.radios[5]?.enabled).toBe(true);
    expect(out.radios[0]?.enabled).toBe(false);
  });

  it('ラジオラベルが前後で差し替わる', () => {
    const before = operationFieldSpec(OP_OUT_IN, false, opts);
    const after = operationFieldSpec(OP_OUT_IN, true, opts);
    expect(before.radios[3]?.label).toBe('出区');
    expect(after.radios[3]?.label).toBe('入区');
    expect(before.radios[5]?.label).toBe('前列車接続');
    expect(after.radios[5]?.label).toBe('次列車接続');
  });

  it('入換のコンボ=番線・Edit1=発・Edit2=着・チェック有効(深さ1)', () => {
    const spec = operationFieldSpec(OP_SHUNT, false, opts);
    expect(spec.combo1).toMatchObject({ visible: true, kind: 'shuntTrack' });
    expect(spec.edit1.visible).toBe(true);
    expect(spec.edit2.visible).toBe(true);
    expect(spec.check1.visible).toBe(true);
    expect(spec.inOutLinkCode.visible).toBe(false);
  });

  it('入換の当駅時刻チェックは深さ>1 で無効', () => {
    const deep = operationFieldSpec(OP_SHUNT, false, { ...opts, levelDepth: 2 });
    expect(deep.check1.visible).toBe(false);
  });

  it('出区は運番+連携コード有効、入区は連携のみ', () => {
    const out = operationFieldSpec(OP_OUT_IN, false, opts);
    const inn = operationFieldSpec(OP_OUT_IN, true, opts);
    expect(out.operationNumbers.visible).toBe(true);
    expect(out.inOutLinkCode.visible).toBe(true);
    expect(inn.operationNumbers.visible).toBe(false);
    expect(inn.inOutLinkCode.visible).toBe(true);
  });

  it('路線外は outerEnable=false でラジオ 4 無効', () => {
    const spec = operationFieldSpec(OP_OUT_IN, false, { ...opts, outerEnable: false });
    expect(spec.radios[4]?.enabled).toBe(false);
  });

  it('増結/解結は ChildAdd 有効、ラベルが差し替わる', () => {
    const conn = operationFieldSpec(OP_CONNECT, false, opts);
    const rel = operationFieldSpec(OP_RELEASE, false, opts);
    expect(conn.buttons.childAdd.visible).toBe(true);
    expect(conn.buttons.childAdd.label).toBe('増結編成の作業を挿入');
    expect(rel.buttons.childAdd.label).toBe('解結編成の作業を追加');
    const shunt = operationFieldSpec(OP_SHUNT, false, opts);
    expect(shunt.buttons.childAdd.visible).toBe(false);
  });

  it('Up/Down は隣接兄弟があるときのみ', () => {
    const noSib = operationFieldSpec(OP_SHUNT, false, opts);
    expect(noSib.buttons.up).toBe(false);
    expect(noSib.buttons.down).toBe(false);
    const withSib = operationFieldSpec(OP_SHUNT, false, {
      ...opts,
      hasPrevSibling: true,
      hasNextSibling: true,
    });
    expect(withSib.buttons.up).toBe(true);
    expect(withSib.buttons.down).toBe(true);
  });
});
