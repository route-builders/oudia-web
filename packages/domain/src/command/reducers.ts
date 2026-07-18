// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 up-tri
//
// Based on OuDiaSecond (Copyright (C) 2017-2026 diagram_mania)
// and OuDia (Copyright (C) 2006-2017 take-okm)

/**
 * コマンドレデューサ群(architecture §4.3)。Immer の draft に対する命令的レデューサ。
 * 原典 CRfEditCmd 各 execute() の直訳を狙う。純関数の decompose はしない。
 *
 * 不変条件(byte 一致):
 * - Ressya.ekiJikokuCont は常に駅数と同数を保つ(末尾 None の切り詰めはライターの責務)。
 * - ekiatsukai==='none' の駅は ressyaTrackIndex=null(reader/writer と一致)。
 */

import type {
    AfterOperation,
    BeforeOperation,
    EkiJikoku,
    Jikoku,
    Ressya,
    Ressyahoukou,
    RosenFileData,
} from '@oudia-web/format';
import { asSeconds } from '@oudia-web/format';
import { ekiIndexOfEkiOrder } from '../ekiOrder.js';
import {
    findRevJikokuItem,
    getEkiJikoku,
    getRunFirstEkiOrder,
    getRunLastEkiOrder,
    getValidSihatsuEki,
    getValidSyuuchakuEki,
    isRunBetweenNextEki,
} from '../runRange.js';
import { addToTrailingNumber } from './clipboard.js';
import { decodeJikokuWithHourCompletion, subJikokuWrapped } from './jikokuCompletion.js';
import type { EditCommand } from './types.js';

/** 改行を LF に正規化する(原典 strLfOf。CRLF/CR → LF)。 */
export function normalizeToLf(s: string): string {
  return s.replace(/\r\n?/g, '\n');
}

const SEC_DAY = 86400;
function mod86400(n: number): number {
  return ((n % SEC_DAY) + SEC_DAY) % SEC_DAY;
}

// ---- 共有ヘルパ ----

/** 選択列車配列(方向コンテナは数値 index)。 */
function ressyaListOf(draft: RosenFileData, diaIndex: number, houkou: Ressyahoukou): Ressya[] {
  const dia = draft.rosen.diaCont[diaIndex];
  if (dia === undefined) throw new Error(`dia 範囲外: ${String(diaIndex)}`);
  return dia.ressyaCont[houkou];
}

/** 列車を取り出す(範囲外は例外)。 */
function ressyaAt(draft: RosenFileData, diaIndex: number, houkou: Ressyahoukou, i: number): Ressya {
  const r = ressyaListOf(draft, diaIndex, houkou)[i];
  if (r === undefined) throw new Error(`列車 範囲外: ${String(i)}`);
  return r;
}

/**
 * 駅時刻スロットを取り出す。リーダーは末尾の運行なしスロットを切り詰めるため
 * (runRange.ts getEkiJikoku 参照)、駅数の範囲内なら none スロットで埋めて確保する
 * (原典はコンテナが常に駅数分あるため書込みが成立する。末尾 none の切り詰めは
 * ライターが再度行うので byte 一致に影響しない)。駅数の範囲外は例外。
 */
function slotAt(draft: RosenFileData, ressya: Ressya, ekiOrder: number): EkiJikoku {
  const ekiCount = draft.rosen.ekiCont.length;
  if (!(ekiOrder >= 0 && ekiOrder < ekiCount)) {
    throw new Error(`駅時刻 範囲外: ${String(ekiOrder)}`);
  }
  while (ressya.ekiJikokuCont.length <= ekiOrder) {
    ressya.ekiJikokuCont.push({
      ekiatsukai: 'none',
      chakuJikoku: null,
      hatsuJikoku: null,
      ressyaTrackIndex: null,
      beforeOperationCont: [],
      afterOperationCont: [],
    });
  }
  const ej = ressya.ekiJikokuCont[ekiOrder];
  if (ej === undefined) throw new Error(`駅時刻 範囲外: ${String(ekiOrder)}`); // 直前で確保済み
  return ej;
}

/**
 * 前後作業の deep copy(JSON 経由。作業は入れ子コンテナ(増結/解結の編成作業)を含むため
 * 浅い spread では共有が起きる。Immer draft からも安全に平オブジェクト化できる)。
 */
function deepCloneOps<T>(ops: readonly T[]): T[] {
  return JSON.parse(JSON.stringify(ops)) as T[];
}

/** 列車の平コピー(draft からも可。Immer draft は structuredClone 不可のため手動 deep copy)。 */
function cloneRessyaPlain(r: Ressya): Ressya {
  const out: Ressya = {
    ...r,
    ekiJikokuCont: r.ekiJikokuCont.map((ej) => ({
      ...ej,
      beforeOperationCont: deepCloneOps(ej.beforeOperationCont),
      afterOperationCont: deepCloneOps(ej.afterOperationCont),
    })),
  };
  if (r.unknownEntries !== undefined) out.unknownEntries = r.unknownEntries.map((u) => ({ ...u }));
  return out;
}

/** 原典 CentDedRessya::setSihatsuEki(378-419): 前方駅を全 None 化 + 発ありなら当駅の着消去。 */
function applySihatsuEki(draft: RosenFileData, r: Ressya, ekiOrder: number): void {
  for (let o = 0; o < ekiOrder; o++) {
    const ej = r.ekiJikokuCont[o];
    if (ej !== undefined) clearToNone(ej);
  }
  const ej = slotAt(draft, r, ekiOrder);
  if (ej.hatsuJikoku !== null) ej.chakuJikoku = null; // 発ありのときだけ着消去
}

/** 原典 CentDedRessya::setSyuuchakuEki(442-484): 着ありなら当駅の発消去 + 後方駅を全 None 化。 */
function applySyuuchakuEki(draft: RosenFileData, r: Ressya, ekiOrder: number): void {
  const ej = slotAt(draft, r, ekiOrder);
  if (ej.chakuJikoku !== null) ej.hatsuJikoku = null; // 着ありのときだけ発消去
  for (let o = ekiOrder + 1; o < r.ekiJikokuCont.length; o++) {
    const later = r.ekiJikokuCont[o];
    if (later !== undefined) clearToNone(later);
  }
}

/** 原典 setEkiatsukai(None) の副作用を再現(全消去)。 */
function clearToNone(ej: EkiJikoku): void {
  ej.ekiatsukai = 'none';
  ej.chakuJikoku = null;
  ej.hatsuJikoku = null;
  ej.ressyaTrackIndex = null; // C++ m_iRessyaTrackIndex=0 ↔ model none=null
  ej.beforeOperationCont = []; // M7: enableOperation=0 では常に空 → no-op
  ej.afterOperationCont = [];
}

/** 原典 setChakujikoku/setHatsujikoku の None→Teisya 自動昇格(非 null を書いたとき)。 */
function autoTeisya(ej: EkiJikoku): void {
  if (ej.ekiatsukai === 'none' && (ej.chakuJikoku !== null || ej.hatsuJikoku !== null)) {
    ej.ekiatsukai = 'teisya';
  }
}

/** 参照時刻: ekiOrder-1 から後方へ最初の非 none 駅の時刻(発優先, なければ着)。 */
function findRevJikoku(ressya: Ressya, fromOrder: number): EkiJikoku['hatsuJikoku'] {
  for (let o = fromOrder; o >= 0; o--) {
    const ej = getEkiJikoku(ressya, o);
    if (ej.ekiatsukai === 'none') continue;
    if (ej.hatsuJikoku !== null) return ej.hatsuJikoku;
    if (ej.chakuJikoku !== null) return ej.chakuJikoku;
  }
  return null;
}

/** 非 null の時刻に delta 秒加算(24h wrap)。null はそのまま。 */
function addWrapped(j: Jikoku, delta: number): Jikoku {
  return j === null ? null : asSeconds(mod86400((j as number) + delta));
}

/**
 * 前作業の時刻シフト(原典 CentDedBeforeOperation::modifyOperationJikoku 400-433)。
 * 種別ごとの対象フィールドへ delta 加算(null は不変)。増結は相手編成の前作業、
 * 解結は後作業へ再帰。junction の JikokuData2/3 は非永続(モデル外)のため対象外。
 */
function shiftBeforeOps(ops: BeforeOperation[], delta: number): void {
  for (const op of ops) {
    switch (op.kind) {
      case 'shunt':
        op.shuntHatsuJikoku = addWrapped(op.shuntHatsuJikoku, delta);
        op.shuntChakuJikoku = addWrapped(op.shuntChakuJikoku, delta);
        break;
      case 'connect':
        op.connectJikoku = addWrapped(op.connectJikoku, delta);
        shiftBeforeOps(op.formationBeforeOperationCont, delta);
        break;
      case 'release':
        op.releaseJikoku = addWrapped(op.releaseJikoku, delta);
        shiftAfterOps(op.formationAfterOperationCont, delta);
        break;
      case 'out':
        op.outJikoku = addWrapped(op.outJikoku, delta);
        break;
      case 'outer':
        op.outerHatsuJikoku = addWrapped(op.outerHatsuJikoku, delta);
        op.chakuJikoku = addWrapped(op.chakuJikoku, delta);
        break;
      case 'junction':
        op.kitenJikoku = addWrapped(op.kitenJikoku, delta);
        break;
      case 'numberChange':
        break;
    }
  }
}

/** 後作業の時刻シフト(原典 CentDedAfterOperation::modifyOperationJikoku 434-464)。 */
function shiftAfterOps(ops: AfterOperation[], delta: number): void {
  for (const op of ops) {
    switch (op.kind) {
      case 'shunt':
        op.shuntHatsuJikoku = addWrapped(op.shuntHatsuJikoku, delta);
        op.shuntChakuJikoku = addWrapped(op.shuntChakuJikoku, delta);
        break;
      case 'connect':
        op.connectJikoku = addWrapped(op.connectJikoku, delta);
        shiftBeforeOps(op.formationBeforeOperationCont, delta);
        break;
      case 'release':
        op.releaseJikoku = addWrapped(op.releaseJikoku, delta);
        shiftAfterOps(op.formationAfterOperationCont, delta);
        break;
      case 'in':
        op.inJikoku = addWrapped(op.inJikoku, delta);
        break;
      case 'outer':
        op.hatsuJikoku = addWrapped(op.hatsuJikoku, delta);
        op.outerChakuJikoku = addWrapped(op.outerChakuJikoku, delta);
        break;
      case 'junction':
        op.syuutenJikoku = addWrapped(op.syuutenJikoku, delta); // Before と非対称(JD1 のみ)
        break;
      case 'numberChange':
        break;
    }
  }
}

/**
 * 原典 modifyRessyaJikoku(CentDedRessya.cpp 717-767): 基準 (order, item) 自身を含み、
 * 着→発→次駅着…の順で末尾まで、非 null 時刻へ delta 秒加算(null はスキップして続行)。
 * 駅扱は見ない。各 Order で着なら前作業・発なら後作業の時刻を無条件シフトし、
 * 基準が(有効始発駅, 発)ならその駅の前作業も先にシフトする(732-739)。
 */
function shiftWalkFwd(ressya: Ressya, order: number, item: 'chaku' | 'hatsu', delta: number): void {
  if (delta === 0) return;
  if (item === 'hatsu' && order === getValidSihatsuEki(ressya)) {
    const ej0 = ressya.ekiJikokuCont[order];
    if (ej0 !== undefined) shiftBeforeOps(ej0.beforeOperationCont, delta);
  }
  const cont = ressya.ekiJikokuCont;
  for (let o = order; o < cont.length; o++) {
    const ej = cont[o];
    if (ej === undefined) continue;
    if (o > order || item === 'chaku') {
      ej.chakuJikoku = addWrapped(ej.chakuJikoku, delta);
      shiftBeforeOps(ej.beforeOperationCont, delta); // 着 Order → 前作業(時刻 null でも無条件)
    }
    ej.hatsuJikoku = addWrapped(ej.hatsuJikoku, delta);
    shiftAfterOps(ej.afterOperationCont, delta); // 発 Order → 後作業
  }
}

/**
 * 原典 modifyRessyaJikokuRev(CentDedRessya.cpp 769-821): 基準自身を含み駅 0 の着まで逆走査。
 * 基準が(有効終着駅, 着)ならその駅の後作業も先にシフト(784-791)。
 */
function shiftWalkRev(ressya: Ressya, order: number, item: 'chaku' | 'hatsu', delta: number): void {
  if (delta === 0) return;
  if (item === 'chaku' && order === getValidSyuuchakuEki(ressya)) {
    const ej0 = ressya.ekiJikokuCont[order];
    if (ej0 !== undefined) shiftAfterOps(ej0.afterOperationCont, delta);
  }
  const cont = ressya.ekiJikokuCont;
  for (let o = order; o >= 0; o--) {
    const ej = cont[o];
    if (ej === undefined) continue;
    if (o < order || item === 'hatsu') {
      ej.hatsuJikoku = addWrapped(ej.hatsuJikoku, delta);
      shiftAfterOps(ej.afterOperationCont, delta);
    }
    ej.chakuJikoku = addWrapped(ej.chakuJikoku, delta);
    shiftBeforeOps(ej.beforeOperationCont, delta);
  }
}

/**
 * 基準番線(原典 StandardRessyaTrackIndexSearch、CentDedRosen.cpp 2447-2497)。
 * 基準運転時分ダイヤ(M7)未対応の現段階では常に初期値 = 当該駅・当該方向の主本線
 * (getMainTrack: 下り=downMain / 上り=upMain)。停車用 [0]・通過用 [1] とも同値。
 */
function mainTrackOf(draft: RosenFileData, houkou: Ressyahoukou, ekiOrder: number): number {
  const ekiCont = draft.rosen.ekiCont;
  const eki = ekiCont[ekiIndexOfEkiOrder(ekiOrder, ekiCont.length, houkou)];
  if (eki === undefined) return 0;
  return houkou === 0 ? eki.downMain : eki.upMain;
}

/**
 * コマンド型 → draft レデューサ。draft は Immer の可変プロキシ。
 */
export const commandReducers: {
  [K in EditCommand['type']]: (
    draft: RosenFileData,
    cmd: Extract<EditCommand, { type: K }>,
  ) => void;
} = {
  'comment/set': (draft, cmd) => {
    draft.rosen.comment = normalizeToLf(cmd.comment);
  },

  'ressya/replaceRange': (draft, cmd) => {
    const cont = ressyaListOf(draft, cmd.diaIndex, cmd.houkou);
    if (cmd.count < 0 || cmd.index < 0 || cmd.index > cont.length - cmd.count) {
      throw new Error(
        `ressya/replaceRange 範囲外: index=${String(cmd.index)} count=${String(cmd.count)} len=${String(cont.length)}`,
      );
    }
    // 挿入列車は draft 外(クリップボード/テンプレート)由来のため deep copy する
    // (Immer が freeze するため alias 不可)。
    const inserted = cmd.trains.map((r) => structuredClone(r));
    cont.splice(cmd.index, cmd.count, ...inserted);
  },

  'ressya/swap': (draft, cmd) => {
    const cont = ressyaListOf(draft, cmd.diaIndex, cmd.houkou);
    const { indexA, sizeA, indexB } = cmd;
    if (sizeA <= 0 || indexA < 0 || indexA > cont.length - sizeA) {
      throw new Error(
        `ressya/swap A 範囲外: A=${String(indexA)} size=${String(sizeA)} len=${String(cont.length)}`,
      );
    }
    if (indexB < 0 || indexB >= cont.length) {
      throw new Error(`ressya/swap B 範囲外: B=${String(indexB)}`);
    }
    if (indexA <= indexB && indexB < indexA + sizeA) {
      throw new Error(
        `ressya/swap B が A ブロック内: A=[${String(indexA)},${String(indexA + sizeA)}) B=${String(indexB)}`,
      );
    }
    const block = cont.slice(indexA, indexA + sizeA);
    const b = cont[indexB];
    if (b === undefined) throw new Error(`ressya/swap B が空: B=${String(indexB)}`);
    if (indexA < indexB) {
      // [pre, A-block, mid, B, post] → [pre, B, A-block, mid, post]
      const mid = cont.slice(indexA + sizeA, indexB);
      cont.splice(indexA, indexB - indexA + 1, b, ...block, ...mid);
    } else {
      // [pre, B, mid, A-block, post] → [pre, mid, A-block, B, post]
      const mid = cont.slice(indexB + 1, indexA);
      cont.splice(indexB, indexA + sizeA - indexB, ...mid, ...block, b);
    }
  },

  'ressya/setProp': (draft, cmd) => {
    const r = ressyaAt(draft, cmd.diaIndex, cmd.houkou, cmd.ressyaIndex);
    switch (cmd.prop.key) {
      case 'syubetsuIndex':
        r.syubetsuIndex = cmd.prop.value;
        break;
      case 'ressyabangou':
        r.ressyabangou = cmd.prop.value;
        break;
      case 'ressyamei':
        r.ressyamei = cmd.prop.value;
        break;
      case 'gousuu':
        r.gousuu = cmd.prop.value;
        break;
      case 'bikou':
        r.bikou = cmd.prop.value;
        break;
    }
  },

  'ressya/setCanceled': (draft, cmd) => {
    const list = ressyaListOf(draft, cmd.diaIndex, cmd.houkou);
    for (const i of cmd.ressyaIndices) {
      const r = list[i];
      if (r !== undefined) r.isCanceled = cmd.canceled;
    }
  },

  'ressya/toggleCanceled': (draft, cmd) => {
    // 原典 OnJikokuhyouCanceled(9981): 各列車独立に反転。代表値方式ではない。
    const list = ressyaListOf(draft, cmd.diaIndex, cmd.houkou);
    for (const i of cmd.ressyaIndices) {
      const r = list[i];
      if (r !== undefined) r.isCanceled = !r.isCanceled;
    }
  },

  'ressya/stepSyubetsu': (draft, cmd) => {
    const n = draft.rosen.ressyasyubetsuCont.length;
    if (n === 0) return;
    const list = ressyaListOf(draft, cmd.diaIndex, cmd.houkou);
    for (const i of cmd.ressyaIndices) {
      const r = list[i];
      if (r === undefined) continue;
      r.syubetsuIndex = (((r.syubetsuIndex + cmd.step) % n) + n) % n; // 端でラップ
      r.isNull = false; // 原典 setRessyasyubetsuIndex(219-222)
    }
  },

  'ressya/modifyBangou': (draft, cmd) => {
    // 原典 modifyRessyaBangou(%0*d 0 詰め)/ modifyGou(0 詰めなし)。
    const list = ressyaListOf(draft, cmd.diaIndex, cmd.houkou);
    for (const i of cmd.ressyaIndices) {
      const r = list[i];
      if (r === undefined) continue;
      if (cmd.target === 'ressyabangou') {
        r.ressyabangou = addToTrailingNumber(r.ressyabangou, cmd.delta, true);
      } else {
        r.gousuu = addToTrailingNumber(r.gousuu, cmd.delta, false);
      }
    }
  },

  'ressya/setSihatsuEki': (draft, cmd) => {
    const list = ressyaListOf(draft, cmd.diaIndex, cmd.houkou);
    for (const i of cmd.ressyaIndices) {
      const r = list[i];
      if (r !== undefined) applySihatsuEki(draft, r, cmd.ekiOrder);
    }
  },

  'ressya/setSyuuchakuEki': (draft, cmd) => {
    const list = ressyaListOf(draft, cmd.diaIndex, cmd.houkou);
    for (const i of cmd.ressyaIndices) {
      const r = list[i];
      if (r !== undefined) applySyuuchakuEki(draft, r, cmd.ekiOrder);
    }
  },

  'ressya/reorder': (draft, cmd) => {
    // 選択スロットへ permutation を適用(原典 CWjkState_Ressyahensyu.cpp 4479-4486)。
    const cont = ressyaListOf(draft, cmd.diaIndex, cmd.houkou);
    const n = cmd.targetIndices.length;
    if (cmd.order.length !== n) throw new Error('ressya/reorder: order 長不一致');
    const seen = new Set(cmd.order);
    if (seen.size !== n || cmd.order.some((o) => o < 0 || o >= n)) {
      throw new Error('ressya/reorder: order が permutation でない');
    }
    const picked = cmd.targetIndices.map((i) => {
      const r = cont[i];
      if (r === undefined) throw new Error(`ressya/reorder: 範囲外 ${String(i)}`);
      return cloneRessyaPlain(r);
    });
    for (let k = 0; k < n; k++) {
      const ti = cmd.targetIndices[k];
      const src = picked[cmd.order[k] ?? -1];
      if (ti === undefined || src === undefined) continue; // 検証済みのため到達しない
      cont[ti] = src;
    }
  },

  'ressya/direct': (draft, cmd) => {
    // 原典 CentDedRessya::direct(1087-1241)+ OnJikokuhyouDirect(5361-5411)。
    const cont = ressyaListOf(draft, cmd.diaIndex, cmd.houkou);
    const syu = cont[cmd.syuuchakuIndex]; // 終着側(this)
    const si = cont[cmd.sihatsuIndex]; // 始発側
    if (syu === undefined || si === undefined) return;
    const terminal = getRunLastEkiOrder(syu);
    const start = getRunFirstEkiOrder(si);
    // 原典 -1/-2/-3 相当(データ無変更。原典は空 Undo を積むがここでは no-op)。
    if (terminal === -1 || start === -1 || !(terminal <= start)) return;

    // 始発側のデータを先に平コピー(splice 前に読み切る)。
    const siPlain = cloneRessyaPlain(si);

    // (terminal, start) 間の駅は運行なし化。
    for (let o = terminal + 1; o < start; o++) clearToNone(slotAt(draft, syu, o));

    // 接続駅の合成(ベース = 終着側の start 駅。駅扱は変えない)。
    const dst = slotAt(draft, syu, start);
    const siStart = getEkiJikoku(siPlain, start);
    dst.chakuJikoku = dst.chakuJikoku ?? dst.hatsuJikoku; // 着 = this の着(なければ発)
    dst.hatsuJikoku = siStart.hatsuJikoku ?? siStart.chakuJikoku; // 発 = 始発側の発(なければ着)
    if (terminal < start) dst.ressyaTrackIndex = siStart.ressyaTrackIndex; // 別駅なら始発側
    autoTeisya(dst);

    // start より後は始発側を丸ごとコピー。
    for (let o = start + 1; o < draft.rosen.ekiCont.length; o++) {
      const src = getEkiJikoku(siPlain, o);
      const d = slotAt(draft, syu, o);
      d.ekiatsukai = src.ekiatsukai;
      d.chakuJikoku = src.chakuJikoku;
      d.hatsuJikoku = src.hatsuJikoku;
      d.ressyaTrackIndex = src.ressyaTrackIndex;
      d.beforeOperationCont = deepCloneOps(src.beforeOperationCont);
      d.afterOperationCont = deepCloneOps(src.afterOperationCont);
    }

    // 列車情報は終着側優先(空のときだけ始発側)。種別は常に終着側。
    if (syu.ressyabangou === '' && siPlain.ressyabangou !== '')
      syu.ressyabangou = siPlain.ressyabangou;
    if (syu.ressyamei === '' && siPlain.ressyamei !== '') syu.ressyamei = siPlain.ressyamei;
    if (syu.gousuu === '' && siPlain.gousuu !== '') syu.gousuu = siPlain.gousuu;
    if (syu.bikou === '' && siPlain.bikou !== '') syu.bikou = siPlain.bikou;
    syu.isNull = false;

    cont.splice(cmd.sihatsuIndex, 1); // 始発側を削除
  },

  'ressya/undirect': (draft, cmd) => {
    // 原典 CentDedRessya::undirect(1243-1302)。実行可否は呼出側(-21/-22)。
    const cont = ressyaListOf(draft, cmd.diaIndex, cmd.houkou);
    const r = cont[cmd.ressyaIndex];
    if (r === undefined) return;
    const ekiCount = draft.rosen.ekiCont.length;

    // 前半終着: 直下に運行区間がある駅まで下げる。0 到達で -31 相当(no-op)。
    let terminalOrd = cmd.ekiOrder;
    while (terminalOrd > 0 && !isRunBetweenNextEki(r, terminalOrd - 1)) terminalOrd -= 1;
    if (terminalOrd === 0) return;
    // 後半始発: 直上に運行区間がある駅まで上げる。駅数-1 到達で -1 相当。
    let startOrd = cmd.ekiOrder;
    while (startOrd < ekiCount - 1 && !isRunBetweenNextEki(r, startOrd)) startOrd += 1;
    if (startOrd >= ekiCount - 1 && !isRunBetweenNextEki(r, startOrd)) return;

    const front = cloneRessyaPlain(r); // 全属性コピー(列車番号等も複製)
    applySyuuchakuEki(draft, front, terminalOrd);
    slotAt(draft, front, terminalOrd).afterOperationCont = []; // 当駅の後作業を全削除
    const back = cloneRessyaPlain(r);
    applySihatsuEki(draft, back, startOrd);
    slotAt(draft, back, startOrd).beforeOperationCont = []; // 当駅の前作業を全削除

    cont.splice(cmd.ressyaIndex, 1, front, back); // 後半はフォーカス列車の直後
  },

  'ressya/pasteEkiJikoku': (draft, cmd) => {
    // 原典 CentDedRessya::pasteEkiJikoku(1054-1085)。
    const r = ressyaAt(draft, cmd.diaIndex, cmd.houkou, cmd.ressyaIndex);
    for (let o = 0; o < draft.rosen.ekiCont.length; o++) {
      const s = cmd.src.ekiJikokuCont[o];
      if (s === undefined || s.ekiatsukai === 'none') continue; // 運行なし駅は既存維持
      const dst = slotAt(draft, r, o);
      dst.ekiatsukai = s.ekiatsukai;
      if (s.chakuJikoku !== null) dst.chakuJikoku = s.chakuJikoku; // 非 null のときだけ
      if (s.hatsuJikoku !== null) dst.hatsuJikoku = s.hatsuJikoku;
      dst.ressyaTrackIndex = s.ressyaTrackIndex; // 番線は常に
      dst.beforeOperationCont = deepCloneOps(s.beforeOperationCont); // 作業は常に置換
      dst.afterOperationCont = deepCloneOps(s.afterOperationCont);
    }
    r.isNull = false;
  },

  'ressya/unify': (draft, cmd) => {
    // 原典 CRessyaContUnifier::unify(170-303)。分岐環状グループ(M5)・入区出区(M7)は
    // 未対応領域のため「同一駅 Order」のみで判定する。時刻の整合チェックは原典どおり無い。
    const cont = ressyaListOf(draft, cmd.diaIndex, cmd.houkou);
    const idxs = (
      cmd.targetIndices === null
        ? cont.map((_, i) => i)
        : [...cmd.targetIndices].sort((a, b) => a - b)
    ).filter((i) => cont[i] !== undefined);

    for (let a = 0; a < idxs.length - 1; a++) {
      const ri = cont[idxs[a] ?? -1];
      if (ri === undefined || ri.ressyabangou === '') continue;
      for (let b = a + 1; b < idxs.length; b++) {
        const jIdx = idxs[b] ?? -1;
        const rj = cont[jIdx];
        if (rj === undefined) continue;
        if (rj.ressyabangou !== ri.ressyabangou || rj.syubetsuIndex !== ri.syubetsuIndex) continue;
        const iS = getValidSihatsuEki(ri);
        const iE = getValidSyuuchakuEki(ri);
        if (iS === -1 || iE === -1) continue;
        const jS = getValidSihatsuEki(rj);
        const jE = getValidSyuuchakuEki(rj);
        if (jS === -1 || jE === -1) continue;
        if (iE <= jS) {
          if (iE !== jS) continue; // 接続駅が同一駅 Order のときのみ(分岐環状グループは M5)
        } else if (jE <= iS) {
          if (jE !== iS) continue;
        }
        // 運行範囲が重なる場合は追加条件なしで併合。
        // 併合: j の有効始発〜有効終着のうち j が停車/通過の駅だけコピー。
        for (let o = jS; o <= jE; o++) {
          const src = getEkiJikoku(rj, o);
          if (src.ekiatsukai !== 'teisya' && src.ekiatsukai !== 'tsuuka') continue;
          const dst = slotAt(draft, ri, o);
          dst.ekiatsukai = src.ekiatsukai;
          if (src.chakuJikoku !== null) dst.chakuJikoku = src.chakuJikoku;
          if (src.hatsuJikoku !== null) dst.hatsuJikoku = src.hatsuJikoku;
          dst.ressyaTrackIndex = src.ressyaTrackIndex;
          // 前作業: j の有効始発駅で i の始発が手前なら捨てる(U 131-136)。
          if (!(o === jS && iS < jS))
            dst.beforeOperationCont = deepCloneOps(src.beforeOperationCont);
          // 後作業: j の有効終着駅で i の終着が後ろなら捨てる(U 137-142)。
          if (!(o === jE && iE > jE)) dst.afterOperationCont = deepCloneOps(src.afterOperationCont);
        }
        ri.isNull = false;
        cont.splice(jIdx, 1); // 生き残りは常にインデクスの小さい方
        idxs.splice(b, 1);
        for (let k = 0; k < idxs.length; k++) {
          const v = idxs[k];
          if (v !== undefined && v > jIdx) idxs[k] = v - 1;
        }
        b -= 1; // 連鎖併合(同番号 3 本以上)
      }
    }
  },

  'ekiJikoku/setChaku': (draft, cmd) => {
    const r = ressyaAt(draft, cmd.diaIndex, cmd.houkou, cmd.ressyaIndex);
    const slot = slotAt(draft, r, cmd.ekiOrder);
    const jikokuRev = findRevJikoku(r, cmd.ekiOrder - 1);
    const decoded = decodeJikokuWithHourCompletion(cmd.input, jikokuRev);
    if (decoded === 'invalid') return; // 不正入力は無視
    slot.chakuJikoku = decoded;
    autoTeisya(slot);
    r.isNull = false;
  },

  'ekiJikoku/setHatsu': (draft, cmd) => {
    const r = ressyaAt(draft, cmd.diaIndex, cmd.houkou, cmd.ressyaIndex);
    const slot = slotAt(draft, r, cmd.ekiOrder);
    const jikokuRev = slot.chakuJikoku ?? findRevJikoku(r, cmd.ekiOrder - 1);
    const decoded = decodeJikokuWithHourCompletion(cmd.input, jikokuRev);
    if (decoded === 'invalid') return;
    slot.hatsuJikoku = decoded;
    autoTeisya(slot);
    r.isNull = false;
  },

  'ekiJikoku/writeJikoku': (draft, cmd) => {
    // 原典 CPropEditUi_EkiJikoku::UiDataToTarget → modify/setCentDedEkiJikoku の直訳。
    // 補完基準: 着 = 前駅の時刻、発 = (新)着 ?? 前駅の時刻(getJikokuFromUI の解決順)。
    const r = ressyaAt(draft, cmd.diaIndex, cmd.houkou, cmd.ressyaIndex);
    const slot = slotAt(draft, r, cmd.ekiOrder);
    const jikokuRev = findRevJikoku(r, cmd.ekiOrder - 1);
    const decChaku = decodeJikokuWithHourCompletion(cmd.chakuInput, jikokuRev);
    if (decChaku === 'invalid') return; // 検証はダイアログ側の責務。ここでは防御的 no-op
    const decHatsu = decodeJikokuWithHourCompletion(cmd.hatsuInput, decChaku ?? jikokuRev);
    if (decHatsu === 'invalid') return;

    // 駅扱の同時変更(原典は EkiJikoku 全体を 1 回で書く。ダイアログ OK 1 回 = Undo 1 単位)。
    if (cmd.ekiatsukai !== undefined) slot.ekiatsukai = cmd.ekiatsukai;

    const oldChaku = slot.chakuJikoku;
    const oldHatsu = slot.hatsuJikoku;
    slot.chakuJikoku = decChaku;
    slot.hatsuJikoku = decHatsu;
    autoTeisya(slot);
    r.isNull = false;

    if (!cmd.modify) return; // setCentDedEkiJikoku 相当(置換のみ)

    // modifyCentDedEkiJikoku(CentDedRessya.cpp 284-356): 発優先で 1 回だけ伝播。
    if (oldHatsu !== null && decHatsu !== null) {
      const delta = subJikokuWrapped(decHatsu, oldHatsu);
      shiftAfterOps(slot.afterOperationCont, delta); // 当駅の後作業(318-319)
      if (cmd.ekiOrder === getValidSihatsuEki(r)) {
        shiftBeforeOps(slot.beforeOperationCont, delta); // 有効始発駅なら前作業も発差分(320-324)
      } else if (oldChaku !== null && decChaku !== null) {
        shiftBeforeOps(slot.beforeOperationCont, subJikokuWrapped(decChaku, oldChaku)); // 着差分(325-332)
      }
      shiftWalkFwd(r, cmd.ekiOrder + 1, 'chaku', delta); // 次駅の着以後
    } else if (oldChaku !== null && decChaku !== null) {
      const delta = subJikokuWrapped(decChaku, oldChaku);
      shiftBeforeOps(slot.beforeOperationCont, delta); // 当駅の前作業(347-348)
      shiftWalkFwd(r, cmd.ekiOrder, 'hatsu', delta); // 当該駅の発以後(当駅後作業はループ内で)
    }
  },

  'ekiJikoku/shiftJikoku': (draft, cmd) => {
    const list = ressyaListOf(draft, cmd.diaIndex, cmd.houkou);
    // 原典 modifyRessyaJikoku: 基準 order が駅数の範囲外なら -1 で no-op(722-727)。
    // 判定は駅数基準(リーダーの末尾 none 切り詰めでコンテナが短くても、範囲内なら
    // Rev で手前の時刻をシフトできる。walk 側が欠落スロットをスキップする)。
    if (cmd.ekiOrder < 0 || cmd.ekiOrder >= draft.rosen.ekiCont.length) return;
    for (const i of cmd.ressyaIndices) {
      const r = list[i];
      if (r === undefined) continue;
      if (cmd.rev === true) shiftWalkRev(r, cmd.ekiOrder, cmd.item, cmd.deltaSeconds);
      else shiftWalkFwd(r, cmd.ekiOrder, cmd.item, cmd.deltaSeconds);
    }
  },

  'ekiJikoku/setTrack': (draft, cmd) => {
    const r = ressyaAt(draft, cmd.diaIndex, cmd.houkou, cmd.ressyaIndex);
    slotAt(draft, r, cmd.ekiOrder).ressyaTrackIndex = cmd.ressyaTrackIndex;
    r.isNull = false; // 原典 setCentDedEkiJikoku は書込みで m_bIsNull=false(256-258)
  },

  'ekiJikoku/clear': (draft, cmd) => {
    const list = ressyaListOf(draft, cmd.diaIndex, cmd.houkou);
    for (const i of cmd.ressyaIndices) {
      const r = list[i];
      if (r === undefined) continue;
      const ej = slotAt(draft, r, cmd.ekiOrder);
      // 連続入力モード版はいったん停車化(通過駅の片側消去で停車になる。1118-1130)。
      if (cmd.teisyaFirst === true) ej.ekiatsukai = 'teisya';
      if (cmd.target === 'chaku') ej.chakuJikoku = null;
      else ej.hatsuJikoku = null;
      if (ej.chakuJikoku === null && ej.hatsuJikoku === null) clearToNone(ej); // 両 null → None
      r.isNull = false; // 原典 setCentDedEkiJikoku(256-258)
    }
  },

  'ekiJikoku/modifyOperation2': (draft, cmd) => {
    // 原典 CentDedRessya_EkijikokuModifyOperation2::execute(86-183)+
    // execCdModifyEkijikokuCmd(選択全列車へ同じ時刻 Order で適用)。
    if (cmd.ekiOrder < 0 || cmd.ekiOrder >= draft.rosen.ekiCont.length) return; // -1 相当
    const list = ressyaListOf(draft, cmd.diaIndex, cmd.houkou);
    const op = cmd.op;
    for (const i of cmd.ressyaIndices) {
      const r = list[i];
      if (r === undefined) continue;
      const slot = slotAt(draft, r, cmd.ekiOrder);
      // ① 駅扱変更(駅単位)。None は全消去(setEkiatsukai の不変条件)。
      if (op.setEkiatsukai) {
        if (op.ekiatsukai === 'none') clearToNone(slot);
        else slot.ekiatsukai = op.ekiatsukai;
      }
      // ② 時刻変更(駅扱変更の後)。
      if (op.operation === 'modify') {
        // フォーカスの時刻 Order 自身を含む以後へ伝播(modifyRessyaJikoku)。
        shiftWalkFwd(r, cmd.ekiOrder, cmd.item, op.seconds);
      } else if (op.operation === 'copy') {
        // コピー元(絶対)の時刻 + seconds を片側へ単純代入。元が null なら null(± は no-op)。
        const srcSlot = op.copySrc === null ? null : getEkiJikoku(r, op.copySrc.ekiOrder);
        const srcVal =
          srcSlot === null || op.copySrc === null
            ? null
            : op.copySrc.item === 'chaku'
              ? srcSlot.chakuJikoku
              : srcSlot.hatsuJikoku;
        const val = srcVal === null ? null : addWrapped(srcVal, op.seconds);
        if (cmd.item === 'chaku') slot.chakuJikoku = val;
        else slot.hatsuJikoku = val;
        autoTeisya(slot); // 非 null 代入は運行なし → 停車へ自動昇格
      } else if (op.operation === 'toNull') {
        // 片側のみ null 化。伝播なし・駅扱不変(時刻消去コマンドとは異なり None 化しない)。
        if (cmd.item === 'chaku') slot.chakuJikoku = null;
        else slot.hatsuJikoku = null;
      }
      if (op.setEkiatsukai || op.operation !== 'nop') r.isNull = false;
      // adjustOperation(M7)・分岐環状補正(M5)は未対応領域のため no-op。
    }
  },

  'ekiJikoku/renzokuInput': (draft, cmd) => {
    // 原典 CWjkState_Renzoku::OnChar(919-1028)の 2 桁確定処理。
    const r = ressyaAt(draft, cmd.diaIndex, cmd.houkou, cmd.ressyaIndex);
    const slot = slotAt(draft, r, cmd.ekiOrder);
    const rev = findRevJikokuItem(r, cmd.ekiOrder, cmd.item);
    if (rev === null) return; // canEnter 相当のガード(防御的 no-op)
    if (!(cmd.minutes >= 0 && cmd.minutes < 60)) return;
    const hour = Math.floor((rev as number) / 3600);
    let sec = mod86400(hour * 3600 + cmd.minutes * 60);
    // 直前時刻より前になるなら +1 時間(同値は補正なし。24h 循環)。
    if (subJikokuWrapped(asSeconds(sec), rev) < 0) sec = mod86400(sec + 3600);
    const wasNone = slot.ekiatsukai === 'none';
    if (cmd.item === 'chaku') slot.chakuJikoku = asSeconds(sec);
    else slot.hatsuJikoku = asSeconds(sec);
    if (wasNone) {
      // setChakujikoku/setHatsujikoku の自動停車化 + 基準番線 [0](停車用 = 主本線)。
      slot.ekiatsukai = 'teisya';
      slot.ressyaTrackIndex = mainTrackOf(draft, cmd.houkou, cmd.ekiOrder);
    } else {
      slot.ekiatsukai = 'teisya'; // 通過駅に分を打つと停車化(番線は変更しない)
    }
    r.isNull = false;
  },

  'ekiJikoku/toggleTsuuka': (draft, cmd) => {
    // 原典 OnJikokuhyouTsuuka(CWjkState_Ressyahensyu.cpp 4802-4916)。
    const list = ressyaListOf(draft, cmd.diaIndex, cmd.houkou);
    for (const i of cmd.ressyaIndices) {
      const r = list[i];
      if (r === undefined) continue;
      const ej = slotAt(draft, r, cmd.ekiOrder);
      const wasRun = ej.ekiatsukai === 'teisya' || ej.ekiatsukai === 'tsuuka';
      ej.ekiatsukai = 'tsuuka';
      ej.chakuJikoku = null; // 原典: 時刻も NULL に(破壊的通過)
      ej.hatsuJikoku = null;
      // 運行なし(経由なし)からの変更時のみ基準番線 [1](通過用)を設定。
      // 基準運転時分ダイヤ未対応(M7)の現段階では常に主本線。停車/通過からは番線維持。
      if (!wasRun) ej.ressyaTrackIndex = mainTrackOf(draft, cmd.houkou, cmd.ekiOrder);
      r.isNull = false; // 原典 setCentDedEkiJikoku(256-258)
    }
  },

  'ekiJikoku/toggleTsuukaTeisya': (draft, cmd) => {
    // 原典 OnJikokuhyouTsuukateisya(CWjkState_Ressyahensyu.cpp 4954-5021)。
    // 各列車が自身の駅扱で独立トグル。停車⇔通過では駅時刻・番線とも一切変更しない。
    const list = ressyaListOf(draft, cmd.diaIndex, cmd.houkou);
    for (const i of cmd.ressyaIndices) {
      const r = list[i];
      if (r === undefined) continue;
      const ej = slotAt(draft, r, cmd.ekiOrder);
      if (ej.ekiatsukai === 'tsuuka') {
        ej.ekiatsukai = 'teisya';
      } else if (ej.ekiatsukai === 'teisya') {
        ej.ekiatsukai = 'tsuuka';
      } else {
        // 運行なし→通過 + 基準番線 [1](通過用。M7 まで主本線)。時刻は元々 null。
        ej.ekiatsukai = 'tsuuka';
        ej.ressyaTrackIndex = mainTrackOf(draft, cmd.houkou, cmd.ekiOrder);
      }
      r.isNull = false; // 原典 setCentDedEkiJikoku(256-258)
    }
  },

  'ekiJikoku/setKeiyunasi': (draft, cmd) => {
    const list = ressyaListOf(draft, cmd.diaIndex, cmd.houkou);
    for (const i of cmd.ressyaIndices) {
      const r = list[i];
      if (r === undefined) continue;
      clearToNone(slotAt(draft, r, cmd.ekiOrder));
      r.isNull = false; // 原典 setCentDedEkiJikoku(256-258)
    }
  },

  'ekiJikoku/setEkiatsukai': (draft, cmd) => {
    // 原典 CentDedEkiJikoku::setEkiatsukai(CentDedEkiJikoku.cpp 182-194)の忠実移植:
    // None のときのみ全消去(時刻・番線・前後作業)。停車⇔通過の切替は時刻を保持する
    // (時刻消去つきの通過はグリッドコマンド ekiJikoku/toggleTsuuka の責務)。
    const list = ressyaListOf(draft, cmd.diaIndex, cmd.houkou);
    for (const i of cmd.ressyaIndices) {
      const r = list[i];
      if (r === undefined) continue;
      const ej = slotAt(draft, r, cmd.ekiOrder);
      if (cmd.ekiatsukai === 'none') {
        clearToNone(ej); // 不変条件: none ⇒ track null
      } else {
        ej.ekiatsukai = cmd.ekiatsukai; // teisya / tsuuka は時刻保持
      }
      r.isNull = false; // 原典 setCentDedEkiJikoku(256-258)
    }
  },
};

/** 到達不能分岐(判別可能ユニオンの網羅性検査)。 */
function assertNever(x: never): never {
  throw new Error(`未対応のコマンド型: ${JSON.stringify(x)}`);
}

/**
 * コマンドを draft に適用する(判別子で型を絞る型安全ディスパッチ)。
 * commandReducers[type] を直接呼ぶと関数ユニオンが never に潰れるため、判別子で分岐する。
 */
export function applyCommand(draft: RosenFileData, cmd: EditCommand): void {
  switch (cmd.type) {
    case 'comment/set':
      commandReducers['comment/set'](draft, cmd);
      return;
    case 'ressya/replaceRange':
      commandReducers['ressya/replaceRange'](draft, cmd);
      return;
    case 'ressya/swap':
      commandReducers['ressya/swap'](draft, cmd);
      return;
    case 'ressya/setProp':
      commandReducers['ressya/setProp'](draft, cmd);
      return;
    case 'ressya/setCanceled':
      commandReducers['ressya/setCanceled'](draft, cmd);
      return;
    case 'ressya/toggleCanceled':
      commandReducers['ressya/toggleCanceled'](draft, cmd);
      return;
    case 'ressya/stepSyubetsu':
      commandReducers['ressya/stepSyubetsu'](draft, cmd);
      return;
    case 'ressya/modifyBangou':
      commandReducers['ressya/modifyBangou'](draft, cmd);
      return;
    case 'ressya/setSihatsuEki':
      commandReducers['ressya/setSihatsuEki'](draft, cmd);
      return;
    case 'ressya/setSyuuchakuEki':
      commandReducers['ressya/setSyuuchakuEki'](draft, cmd);
      return;
    case 'ressya/reorder':
      commandReducers['ressya/reorder'](draft, cmd);
      return;
    case 'ressya/direct':
      commandReducers['ressya/direct'](draft, cmd);
      return;
    case 'ressya/undirect':
      commandReducers['ressya/undirect'](draft, cmd);
      return;
    case 'ressya/pasteEkiJikoku':
      commandReducers['ressya/pasteEkiJikoku'](draft, cmd);
      return;
    case 'ressya/unify':
      commandReducers['ressya/unify'](draft, cmd);
      return;
    case 'ekiJikoku/setChaku':
      commandReducers['ekiJikoku/setChaku'](draft, cmd);
      return;
    case 'ekiJikoku/setHatsu':
      commandReducers['ekiJikoku/setHatsu'](draft, cmd);
      return;
    case 'ekiJikoku/writeJikoku':
      commandReducers['ekiJikoku/writeJikoku'](draft, cmd);
      return;
    case 'ekiJikoku/shiftJikoku':
      commandReducers['ekiJikoku/shiftJikoku'](draft, cmd);
      return;
    case 'ekiJikoku/setTrack':
      commandReducers['ekiJikoku/setTrack'](draft, cmd);
      return;
    case 'ekiJikoku/clear':
      commandReducers['ekiJikoku/clear'](draft, cmd);
      return;
    case 'ekiJikoku/renzokuInput':
      commandReducers['ekiJikoku/renzokuInput'](draft, cmd);
      return;
    case 'ekiJikoku/modifyOperation2':
      commandReducers['ekiJikoku/modifyOperation2'](draft, cmd);
      return;
    case 'ekiJikoku/toggleTsuuka':
      commandReducers['ekiJikoku/toggleTsuuka'](draft, cmd);
      return;
    case 'ekiJikoku/toggleTsuukaTeisya':
      commandReducers['ekiJikoku/toggleTsuukaTeisya'](draft, cmd);
      return;
    case 'ekiJikoku/setKeiyunasi':
      commandReducers['ekiJikoku/setKeiyunasi'](draft, cmd);
      return;
    case 'ekiJikoku/setEkiatsukai':
      commandReducers['ekiJikoku/setEkiatsukai'](draft, cmd);
      return;
    default:
      assertNever(cmd);
  }
}
