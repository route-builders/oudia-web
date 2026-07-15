// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 oudia-second-web contributors
//
// Based on OuDiaSecond (Copyright (C) 2017-2026 diagram_mania)
// and OuDia (Copyright (C) 2006-2017 take-okm)

/**
 * 駅作業(Operation)のスキャナ(file-io §3.5、analysis §03 §6.4)。
 * 原典 CconvCentDed::CentDedBeforeOperationCont_From/To_string ほかの忠実移植。
 * **逐次スキャン**。
 *
 * キー名: `Operation{駅Order}{B|A}` + 入れ子は `.{親内作業index}{B|A}` の繰り返し
 *   (例 `Operation13B`、`Operation13B.0A`)。
 * 値: 作業のカンマ連結。各作業は種類番号のあと `/` `$` `/` `$` `/` の交互固定順で
 *   最大 5 パラメータ(type/p1$p2/p3$p4/p5)。運用番号は `;` 区切り配列。
 */

import type { AfterJunctionType, AfterOperation, BeforeOperation, Jikoku } from '../model/index.js';
import { decodeJikoku, encodeJikoku, isJikokuDecodeError } from './jikoku.js';

/** `Operation{path}` キーの値を提供・受理する側テーブル。 */
export interface OperationKeyStore {
  /** キー `Operation{path}` の値(なければ undefined)。 */
  get(path: string): string | undefined;
}

const JUNCTION_TYPE_BY_CODE: Record<number, AfterJunctionType> = {
  0: 'unrelated',
  1: 'classChange',
  2: 'propertyChange',
  3: 'propertySame',
};

function junctionTypeToCode(t: AfterJunctionType): number {
  return t === 'classChange' ? 1 : t === 'propertyChange' ? 2 : t === 'propertySame' ? 3 : 0;
}

function readJikoku(s: string): Jikoku {
  if (s === '') return null;
  const r = decodeJikoku(s);
  return isJikokuDecodeError(r) ? null : r;
}

/** `;` 区切りの運用番号配列。空文字列は空配列。 */
function splitOperationNumbers(s: string): string[] {
  if (s === '') return [];
  return s.split(';');
}

function joinOperationNumbers(nums: string[]): string {
  return nums.join(';');
}

/** 寛容 int(範囲補正は呼出し側)。 */
function stoiLenient(s: string): number {
  const n = Number.parseInt(s, 10);
  return Number.isNaN(n) ? 0 : n;
}

/** 解結位置(0=後方 / 1=前方 / 2=前方以外)。範囲外は 0。 */
function toReleasePosition(n: number): 0 | 1 | 2 {
  return n === 1 ? 1 : n === 2 ? 2 : 0;
}

/**
 * 1 作業の値部分を type/p1$p2/p3$p4/p5 に分解する(原典の交互固定順区切り)。
 * type の後は `/` `$` `/` `$` `/` の順に区切る。区切りが尽きたら残りを最後のパラメータに。
 */
function splitOperationParams(operation: string): {
  type: string;
  p1: string;
  p2: string;
  p3: string;
  p4: string;
  p5: string;
} {
  let rest = operation;
  const take = (delim: string): string => {
    const pos = rest.indexOf(delim);
    if (pos !== -1) {
      const head = rest.slice(0, pos);
      rest = rest.slice(pos + 1);
      return head;
    }
    const head = rest;
    rest = '';
    return head;
  };
  const type = take('/');
  const p1 = take('$');
  const p2 = take('/');
  const p3 = take('$');
  const p4 = take('/');
  const p5 = rest;
  return { type, p1, p2, p3, p4, p5 };
}

// ---- decode: Operation キー群 → BeforeOperation[] / AfterOperation[] ----

/**
 * 前作業列を decode する。原典 CentDedBeforeOperationCont_From_string。
 * @param store `Operation{path}` キーの値を返す側テーブル
 * @param parentIndex 親パス(例 `13B`、`13B.0A`)。`Operation` プレフィックス除去後の部分
 */
export function decodeBeforeOperationCont(
  store: OperationKeyStore,
  parentIndex: string,
  ekiTrack2Count: number,
  outerTerminalCount: number,
): BeforeOperation[] {
  const value = store.get(parentIndex);
  if (value === undefined || value === '') return [];

  const result: BeforeOperation[] = [];
  const operations = value.split(',');
  for (const [idx, operation] of operations.entries()) {
    const { type, p1, p2, p3, p4, p5 } = splitOperationParams(operation);
    switch (type) {
      case '0': {
        let track = stoiLenient(p1);
        if (track < 0 || track >= ekiTrack2Count) track = 0;
        result.push({
          kind: 'shunt',
          shuntTrackIndex: track,
          shuntHatsuJikoku: readJikoku(p2),
          shuntChakuJikoku: readJikoku(p3),
          displayJikoku: p4 === '1',
        });
        break;
      }
      case '1': {
        result.push({
          kind: 'connect',
          connectToFront: p1 === '1',
          connectJikoku: readJikoku(p2),
          formationBeforeOperationCont: decodeBeforeOperationCont(
            store,
            `${parentIndex}.${String(idx)}B`,
            ekiTrack2Count,
            outerTerminalCount,
          ),
        });
        break;
      }
      case '2': {
        result.push({
          kind: 'release',
          releasePosition: toReleasePosition(stoiLenient(p1)),
          releaseCount: stoiLenient(p2),
          releaseJikoku: readJikoku(p3),
          formationAfterOperationCont: decodeAfterOperationCont(
            store,
            `${parentIndex}.${String(idx)}A`,
            ekiTrack2Count,
            outerTerminalCount,
          ),
        });
        break;
      }
      case '3': {
        result.push({
          kind: 'out',
          outJikoku: readJikoku(p1),
          inOutLinkCode: p2,
          operationNumbers: splitOperationNumbers(p3),
        });
        break;
      }
      case '4': {
        let outerIdx = stoiLenient(p1);
        if (outerIdx < 0 || outerIdx >= outerTerminalCount) outerIdx = 0;
        result.push({
          kind: 'outer',
          outerTerminalIndex: outerIdx,
          outerHatsuJikoku: readJikoku(p2),
          chakuJikoku: readJikoku(p3),
          inOutLinkCode: p4,
          operationNumbers: splitOperationNumbers(p5),
        });
        break;
      }
      case '5': {
        result.push({
          kind: 'junction',
          kitenJikoku: readJikoku(p1),
          kariOperationNumbers: splitOperationNumbers(p2),
        });
        break;
      }
      case '6': {
        // p1 空 = 運用番号順反転(空配列)。
        result.push({ kind: 'numberChange', operationNumbers: splitOperationNumbers(p1) });
        break;
      }
      default:
        // 未知 type は無視(原典は何も追加しない)。
        break;
    }
  }
  return result;
}

/**
 * 後作業列を decode する。原典 CentDedAfterOperationCont_From_string。
 */
export function decodeAfterOperationCont(
  store: OperationKeyStore,
  parentIndex: string,
  ekiTrack2Count: number,
  outerTerminalCount: number,
): AfterOperation[] {
  const value = store.get(parentIndex);
  if (value === undefined || value === '') return [];

  const result: AfterOperation[] = [];
  const operations = value.split(',');
  for (const [idx, operation] of operations.entries()) {
    const { type, p1, p2, p3, p4 } = splitOperationParams(operation);
    switch (type) {
      case '0': {
        let track = stoiLenient(p1);
        if (track < 0 || track >= ekiTrack2Count) track = 0;
        result.push({
          kind: 'shunt',
          shuntTrackIndex: track,
          shuntHatsuJikoku: readJikoku(p2),
          shuntChakuJikoku: readJikoku(p3),
          displayJikoku: p4 === '1',
        });
        break;
      }
      case '1': {
        result.push({
          kind: 'connect',
          connectToFront: p1 === '1',
          connectJikoku: readJikoku(p2),
          formationBeforeOperationCont: decodeBeforeOperationCont(
            store,
            `${parentIndex}.${String(idx)}B`,
            ekiTrack2Count,
            outerTerminalCount,
          ),
        });
        break;
      }
      case '2': {
        result.push({
          kind: 'release',
          releasePosition: toReleasePosition(stoiLenient(p1)),
          releaseCount: stoiLenient(p2),
          releaseJikoku: readJikoku(p3),
          formationAfterOperationCont: decodeAfterOperationCont(
            store,
            `${parentIndex}.${String(idx)}A`,
            ekiTrack2Count,
            outerTerminalCount,
          ),
        });
        break;
      }
      case '3': {
        result.push({ kind: 'in', inJikoku: readJikoku(p1), inOutLinkCode: p2 });
        break;
      }
      case '4': {
        let outerIdx = stoiLenient(p1);
        if (outerIdx < 0 || outerIdx >= outerTerminalCount) outerIdx = 0;
        result.push({
          kind: 'outer',
          outerTerminalIndex: outerIdx,
          hatsuJikoku: readJikoku(p2),
          outerChakuJikoku: readJikoku(p3),
          inOutLinkCode: p4,
        });
        break;
      }
      case '5': {
        let typeCode = stoiLenient(p2);
        if (typeCode < 0 || typeCode > 3) typeCode = 0;
        result.push({
          kind: 'junction',
          syuutenJikoku: readJikoku(p1),
          junctionType: JUNCTION_TYPE_BY_CODE[typeCode] ?? 'unrelated',
        });
        break;
      }
      case '6': {
        result.push({ kind: 'numberChange', operationNumbers: splitOperationNumbers(p1) });
        break;
      }
      default:
        break;
    }
  }
  return result;
}

// ---- encode: BeforeOperation[] / AfterOperation[] → Operation キー群 ----

/** encode の出力エントリ(キーパス → 値)。キーは `Operation` プレフィックス除去後のパス。 */
export interface OperationEntry {
  path: string;
  value: string;
}

/**
 * 前作業列を encode する。原典 CentDedBeforeOperationCont_To_string。
 * 先頭に自分の列([parentIndex, カンマ連結])を置き、connect/release の子列を続ける。
 * 空の作業列(要素 0)は呼出し側でキー出力を抑制する。
 */
export function encodeBeforeOperationCont(
  cont: BeforeOperation[],
  parentIndex: string,
): OperationEntry[] {
  const entries: OperationEntry[] = [{ path: parentIndex, value: '' }];
  const thisCont: string[] = [];

  for (const [idx, op] of cont.entries()) {
    switch (op.kind) {
      case 'shunt': {
        thisCont.push(
          `0/${String(op.shuntTrackIndex)}$${encodeJikoku(op.shuntHatsuJikoku)}/${encodeJikoku(op.shuntChakuJikoku)}$${op.displayJikoku ? '1' : '0'}`,
        );
        break;
      }
      case 'connect': {
        thisCont.push(`1/${op.connectToFront ? '1' : '0'}$${encodeJikoku(op.connectJikoku)}`);
        entries.push(
          ...encodeBeforeOperationCont(
            op.formationBeforeOperationCont,
            `${parentIndex}.${String(idx)}B`,
          ),
        );
        break;
      }
      case 'release': {
        thisCont.push(
          `2/${String(op.releasePosition)}$${String(op.releaseCount)}/${encodeJikoku(op.releaseJikoku)}`,
        );
        entries.push(
          ...encodeAfterOperationCont(
            op.formationAfterOperationCont,
            `${parentIndex}.${String(idx)}A`,
          ),
        );
        break;
      }
      case 'out': {
        thisCont.push(
          `3/${encodeJikoku(op.outJikoku)}$${op.inOutLinkCode}/${joinOperationNumbers(op.operationNumbers)}`,
        );
        break;
      }
      case 'outer': {
        thisCont.push(
          `4/${String(op.outerTerminalIndex)}$${encodeJikoku(op.outerHatsuJikoku)}/${encodeJikoku(op.chakuJikoku)}$${op.inOutLinkCode}/${joinOperationNumbers(op.operationNumbers)}`,
        );
        break;
      }
      case 'junction': {
        thisCont.push(
          `5/${encodeJikoku(op.kitenJikoku)}$${joinOperationNumbers(op.kariOperationNumbers)}`,
        );
        break;
      }
      case 'numberChange': {
        thisCont.push(`6/${joinOperationNumbers(op.operationNumbers)}`);
        break;
      }
    }
  }

  entries[0] = { path: parentIndex, value: thisCont.join(',') };
  return entries;
}

/** 後作業列を encode する。原典 CentDedAfterOperationCont_To_string。 */
export function encodeAfterOperationCont(
  cont: AfterOperation[],
  parentIndex: string,
): OperationEntry[] {
  const entries: OperationEntry[] = [{ path: parentIndex, value: '' }];
  const thisCont: string[] = [];

  for (const [idx, op] of cont.entries()) {
    switch (op.kind) {
      case 'shunt': {
        thisCont.push(
          `0/${String(op.shuntTrackIndex)}$${encodeJikoku(op.shuntHatsuJikoku)}/${encodeJikoku(op.shuntChakuJikoku)}$${op.displayJikoku ? '1' : '0'}`,
        );
        break;
      }
      case 'connect': {
        thisCont.push(`1/${op.connectToFront ? '1' : '0'}$${encodeJikoku(op.connectJikoku)}`);
        entries.push(
          ...encodeBeforeOperationCont(
            op.formationBeforeOperationCont,
            `${parentIndex}.${String(idx)}B`,
          ),
        );
        break;
      }
      case 'release': {
        thisCont.push(
          `2/${String(op.releasePosition)}$${String(op.releaseCount)}/${encodeJikoku(op.releaseJikoku)}`,
        );
        entries.push(
          ...encodeAfterOperationCont(
            op.formationAfterOperationCont,
            `${parentIndex}.${String(idx)}A`,
          ),
        );
        break;
      }
      case 'in': {
        thisCont.push(`3/${encodeJikoku(op.inJikoku)}$${op.inOutLinkCode}`);
        break;
      }
      case 'outer': {
        thisCont.push(
          `4/${String(op.outerTerminalIndex)}$${encodeJikoku(op.hatsuJikoku)}/${encodeJikoku(op.outerChakuJikoku)}$${op.inOutLinkCode}`,
        );
        break;
      }
      case 'junction': {
        thisCont.push(
          `5/${encodeJikoku(op.syuutenJikoku)}$${String(junctionTypeToCode(op.junctionType))}`,
        );
        break;
      }
      case 'numberChange': {
        thisCont.push(`6/${joinOperationNumbers(op.operationNumbers)}`);
        break;
      }
    }
  }

  entries[0] = { path: parentIndex, value: thisCont.join(',') };
  return entries;
}
