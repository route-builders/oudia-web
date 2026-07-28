// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 up-tri
//
// Based on OuDiaSecond (Copyright (C) 2017-2026 diagram_mania)
// and OuDia (Copyright (C) 2006-2017 take-okm)

/**
 * 作業編集の時刻補完(原典 CPropEditUI_Operation の getJikokuFromUI /
 * Before・AfterOperationComplement / UiDataToTarget の時刻補完部の忠実移植)。M7b PR-2。
 *
 * 2 系統:
 * - `completeJikokuFromInput`: UI の分のみ入力(2 桁)を基準時刻の「時」で補完し、
 *   bBefore による ±1h 補正を行う(原典 getJikokuFromUI、cpp:121-194)。
 * - `completeFlatTimes`: flat 作業列の null 時刻を、前後の作業へ基準を伝播しながら
 *   ±60 秒で埋める(原典 Before/AfterOperationComplement、cpp:3117/3551 と
 *   UiDataToTarget の呼出、cpp:3981-4082)。
 *
 * 符号(memory m7b-time-completion):
 * - 前方(idx 昇順)= +60 秒 / 後方(idx 降順)= −60 秒(入換発なし・出入区・路線外)。
 * - 増結/解結は基準に ±0(pSourceJikoku そのまま)。
 * - 前方の入換のみ「発 → 着」二段で基準を更新する。
 * - 増結の子は常に後方(前作業列)、解結の子は常に前方(後作業列)。
 *
 * ★標準番線・路線外標準所要時間の「生成元」ロジックは原典ツリーに未収録(消費規則のみ確定)。
 * ここでは標準所要は「未設定 = 0 = 補完スキップ」を既定にし、供給は呼出側の任意引数とする。
 */

import type { Jikoku } from '@oudia-web/format';
import { addSeconds, SECONDS_PER_DAY, secondsOfHms, subJikoku } from '../jikoku.js';
import { type FlatOp, OP_CONNECT, OP_OUT_IN, OP_OUTER, OP_RELEASE, OP_SHUNT } from './editModel.js';

// ---- getJikokuFromUI(UI 文字列 → Jikoku、分のみ入力の時補完)----

/** Jikoku の「時」(0..23)を返す(原典 getHour = TotalSeconds / 3600)。 */
function hourOf(jikoku: Jikoku): number {
  if (jikoku === null) return 0;
  return Math.floor((jikoku as number) / 3600);
}

/**
 * UI 入力文字列を Jikoku へ変換する(原典 getJikokuFromUI、cpp:121-194)。
 *
 * decode 済みの Jikoku を渡す簡略版とは別に、ここでは「分のみ 2 桁入力 → 基準の時で補完」
 * の分岐だけを担う。呼出側は通常の decode(HH:MM:SS)を先に行い、それが失敗(=分のみ)
 * だったときにこの関数へ委譲する。
 *
 * @param minuteInput 2 桁の分文字列(例 '45')
 * @param refJikoku   基準時刻(直前の駅時刻等)。null なら補完しない(元の parse 失敗を返す)。
 * @param bBefore     true = 基準より前に収める(超えたら −1h)/ false = 基準より後に収める(前なら +1h)
 * @returns 補完した Jikoku。補完不能なら null。
 */
export function completeMinuteInput(
  minuteInput: string,
  refJikoku: Jikoku,
  bBefore: boolean,
): Jikoku {
  if (refJikoku === null) return null;
  if (!/^\d{2}$/.test(minuteInput)) return null;
  const iMin = Number.parseInt(minuteInput, 10);
  if (!(iMin >= 0 && iMin < 60)) return null;
  let jikoku: Jikoku = secondsOfHms(hourOf(refJikoku), iMin, 0);
  const sub = subJikoku(jikoku, refJikoku) as number;
  if (bBefore) {
    // 補完値が基準より後(厳密正)なら 1 時間引く(基準以前へ)。
    if (sub > 0) jikoku = normalize((jikoku as number) - 3600);
  } else {
    // 補完値が基準より前(厳密負)なら 1 時間足す(基準以後へ)。
    if (sub < 0) jikoku = normalize((jikoku as number) + 3600);
  }
  return jikoku;
}

function normalize(total: number): Jikoku {
  return addSeconds(
    secondsOfHms(0, 0, 0),
    ((total % SECONDS_PER_DAY) + SECONDS_PER_DAY) % SECONDS_PER_DAY,
  );
}

// ---- Before/AfterOperationComplement(flat 列の null 時刻を伝播補完)----

/** 補完の対象・方向・停車扱い。 */
export interface CompleteOptions {
  /** 停車扱いか(原典 bIsTeisya。停車のときのみ路線外の当駅着/発を補完)。 */
  readonly isTeisya: boolean;
  /**
   * 路線外標準所要時間 [発着駅index][0|1](秒)。原典 m_iStandardOuterTerminalJikan。
   * 生成元が未確定のため既定は空(= 補完スキップ)。
   */
  readonly outerStandardJikan?: readonly (readonly number[])[];
}

/**
 * 増結の子(前作業列)を後方から補完する / 解結の子(後作業列)を前方から補完する
 * ための再帰入口。親の時刻を基準に、直接の子行(level.length === parentLevel.length + 1)
 * のみを対象とする。
 */
function complementChildren(
  flat: FlatOp[],
  parentLevel: number[],
  base: Jikoku,
  forward: boolean,
  opts: CompleteOptions,
): void {
  // 直接の子行の index を集める(level が親 +1 段で上位一致)。
  const childIdx: number[] = [];
  for (let i = 0; i < flat.length; i++) {
    const op = flat[i];
    if (op === undefined) continue;
    if (op.level.length !== parentLevel.length + 1) continue;
    let match = true;
    for (let d = 0; d < parentLevel.length; d++) {
      if (op.level[d] !== parentLevel[d]) {
        match = false;
        break;
      }
    }
    if (match) childIdx.push(i);
  }
  complementSlots(flat, childIdx, base, forward, opts);
}

/**
 * 指定 index 群(同一階層の作業列)を forward 方向に走査し、null 時刻を基準からの ±60 秒で
 * 埋めながら基準をチェーン更新する(原典 Before/AfterOperationComplement のループ本体)。
 * 増結/解結は子列へ再帰する。
 */
function complementSlots(
  flat: FlatOp[],
  order: number[],
  initialBase: Jikoku,
  forward: boolean,
  opts: CompleteOptions,
): void {
  let base = initialBase;
  const seq = forward ? order : [...order].reverse();
  const delta = forward ? 60 : -60;

  for (const i of seq) {
    const op = flat[i];
    if (op === undefined) continue;
    switch (op.kind) {
      case OP_SHUNT: {
        // 入換発が null → 着も null なら base±60 を発に、着があれば発=着。
        if (op.editData1 === null) {
          if (op.editData2 === null) {
            op.editData1 = addSeconds(base, delta);
          } else {
            op.editData1 = op.editData2;
          }
        }
        base = op.editData1;
        // 前方のみ「発 → 着」で基準を着へ二段更新。
        if (forward && op.editData2 !== null) base = op.editData2;
        break;
      }
      case OP_CONNECT: {
        // 増結時刻 null なら base のまま(±0)。子(前作業)は後方から補完。
        if (op.editData1 === null) op.editData1 = base;
        base = op.editData1;
        complementChildren(flat, op.level, base, false, opts);
        break;
      }
      case OP_RELEASE: {
        // 解結時刻(editData2)null なら base(±0)。子(後作業)は前方から補完。
        if (op.editData2 === null) op.editData2 = base;
        base = op.editData2;
        if (op.releaseCount <= 0) op.releaseCount = 1;
        complementChildren(flat, op.level, base, true, opts);
        break;
      }
      case OP_OUT_IN: {
        // 出区(前)/入区(後)時刻 null なら base±60。
        if (op.editData1 === null) op.editData1 = addSeconds(base, delta);
        base = op.editData1;
        break;
      }
      case OP_OUTER: {
        // 路線外の当駅時刻(前=当駅着 editData2 / 後=当駅発 editData1)は bIsTeisya のみ補完。
        completeOuter(op, base, forward, opts);
        // 基準は当駅側時刻へ。
        const anchor = forward ? op.editData1 : op.editData2;
        if (anchor !== null) base = anchor;
        break;
      }
      default:
        // junction / numberChange 等は時刻補完対象外(基準は更新しない)。
        break;
    }
  }
}

/**
 * 路線外の時刻補完(標準所要が与えられていれば当駅時刻から加減算)。原典 cpp:3370/3691。
 * 前方(後作業=路線外終着): 当駅発 editData1 空なら base+副所要 / 路線外着 editData2 空なら base+主所要。
 * 後方(前作業=路線外始発): 当駅着 editData2 空なら base−副所要 / 路線外発 editData1 空なら base−主所要。
 */
function completeOuter(op: FlatOp, base: Jikoku, forward: boolean, opts: CompleteOptions): void {
  const std = opts.outerStandardJikan?.[op.comboData1];
  const main = std?.[0] ?? 0; // 主所要(路線外↔当駅)
  const sub = std?.[1] ?? 0; // 副所要(当駅着/発)
  if (forward) {
    // 後作業=路線外終着。当駅発 = base、路線外着 = base + main。
    if (op.editData1 === null && opts.isTeisya) op.editData1 = base;
    if (op.editData2 === null && main !== 0) op.editData2 = addSeconds(op.editData1 ?? base, main);
    void sub;
  } else {
    // 前作業=路線外始発。当駅着 = base、路線外発 = base − main。
    if (op.editData2 === null && opts.isTeisya) op.editData2 = base;
    if (op.editData1 === null && main !== 0) op.editData1 = addSeconds(op.editData2 ?? base, -main);
    void sub;
  }
}

/** flat 列のトップレベル index を Cont 順(level[0] 昇順)に返す。 */
function topLevelOrder(flat: readonly FlatOp[]): number[] {
  const idx: number[] = [];
  for (let i = 0; i < flat.length; i++) {
    if (flat[i]?.level.length === 1) idx.push(i);
  }
  return idx.sort((a, b) => (flat[a]?.level[0] ?? 0) - (flat[b]?.level[0] ?? 0));
}

/**
 * 前作業列 flat の時刻を補完する(原典 BeforeOperationComplement のトップ呼出)。
 * @param base    基準時刻(通常=当駅着時刻)
 * @param forward true=前方から / false=後方から
 */
export function completeFlatBefore(
  flat: FlatOp[],
  base: Jikoku,
  forward: boolean,
  opts: CompleteOptions,
): void {
  complementSlots(flat, topLevelOrder(flat), base, forward, opts);
}

/** 後作業列 flat の時刻を補完する(原典 AfterOperationComplement のトップ呼出)。 */
export function completeFlatAfter(
  flat: FlatOp[],
  base: Jikoku,
  forward: boolean,
  opts: CompleteOptions,
): void {
  complementSlots(flat, topLevelOrder(flat), base, forward, opts);
}

/**
 * ダイアログ OK 時の時刻補完(原典 UiDataToTarget、cpp:3981-4082)。
 * 当駅の駅種別(始発/止まり/通常)で前後作業の補完方向を切り替える。
 *
 * @param before    前作業 flat(この場で破壊的に補完)
 * @param after     後作業 flat
 * @param chakuJikoku 当駅の着時刻(-1 相当 = null なら始発)
 * @param hatsuJikoku 当駅の発時刻(null なら止まり)
 * @param opts      停車扱い等
 */
export function completeUiData(
  before: FlatOp[],
  after: FlatOp[],
  chakuJikoku: Jikoku,
  hatsuJikoku: Jikoku,
  opts: CompleteOptions,
): void {
  if (chakuJikoku === null) {
    // 当駅始発: 基準=発。後作業 then 前作業とも後方から。
    completeFlatAfter(after, hatsuJikoku, false, opts);
    completeFlatBefore(before, hatsuJikoku, false, opts);
  } else if (hatsuJikoku === null) {
    // 当駅止まり: 基準=着。前作業 then 後作業とも前方から。
    completeFlatBefore(before, chakuJikoku, true, opts);
    completeFlatAfter(after, chakuJikoku, true, opts);
  } else {
    // 通常: 前作業(着基準・前方)、後作業(発基準・後方)。
    completeFlatBefore(before, chakuJikoku, true, opts);
    completeFlatAfter(after, hatsuJikoku, false, opts);
  }
}
