// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 oudia-second-web contributors
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

import type { EkiJikoku, Jikoku, Ressya, Ressyahoukou, RosenFileData } from '@oudia/format';
import { asSeconds } from '@oudia/format';
import { getEkiJikoku } from '../runRange.js';
import { ekiIndexOfEkiOrder } from '../ekiOrder.js';
import type { EditCommand } from './types.js';
import { decodeJikokuWithHourCompletion, subJikokuWrapped } from './jikokuCompletion.js';
import { addToTrailingNumber } from './clipboard.js';

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

/** 駅時刻スロットを取り出す(範囲外は例外)。 */
function slotAt(ressya: Ressya, ekiOrder: number): EkiJikoku {
  const ej = ressya.ekiJikokuCont[ekiOrder];
  if (ej === undefined) throw new Error(`駅時刻 範囲外: ${String(ekiOrder)}`);
  return ej;
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
 * 原典 modifyRessyaJikoku(CentDedRessya.cpp 717-767): 基準 (order, item) 自身を含み、
 * 着→発→次駅着…の順で末尾まで、非 null 時刻へ delta 秒加算(null はスキップして続行)。
 * 駅扱は見ない。前後作業の時刻シフトは M7(enableOperation=0 では常に空)。
 */
function shiftWalkFwd(ressya: Ressya, order: number, item: 'chaku' | 'hatsu', delta: number): void {
  if (delta === 0) return;
  const cont = ressya.ekiJikokuCont;
  for (let o = order; o < cont.length; o++) {
    const ej = cont[o];
    if (ej === undefined) continue;
    if (o > order || item === 'chaku') ej.chakuJikoku = addWrapped(ej.chakuJikoku, delta);
    ej.hatsuJikoku = addWrapped(ej.hatsuJikoku, delta);
  }
}

/** 原典 modifyRessyaJikokuRev(CentDedRessya.cpp 769-821): 基準自身を含み駅 0 の着まで逆走査。 */
function shiftWalkRev(ressya: Ressya, order: number, item: 'chaku' | 'hatsu', delta: number): void {
  if (delta === 0) return;
  const cont = ressya.ekiJikokuCont;
  for (let o = order; o >= 0; o--) {
    const ej = cont[o];
    if (ej === undefined) continue;
    if (o < order || item === 'hatsu') ej.hatsuJikoku = addWrapped(ej.hatsuJikoku, delta);
    ej.chakuJikoku = addWrapped(ej.chakuJikoku, delta);
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
      if (r === undefined) continue;
      for (let o = 0; o < cmd.ekiOrder; o++) {
        const ej = r.ekiJikokuCont[o];
        if (ej !== undefined) clearToNone(ej); // 前方全 None
      }
      const ej = slotAt(r, cmd.ekiOrder);
      if (ej.hatsuJikoku !== null) ej.chakuJikoku = null; // 発ありのときだけ着消去
    }
  },

  'ressya/setSyuuchakuEki': (draft, cmd) => {
    const list = ressyaListOf(draft, cmd.diaIndex, cmd.houkou);
    for (const i of cmd.ressyaIndices) {
      const r = list[i];
      if (r === undefined) continue;
      const ej = slotAt(r, cmd.ekiOrder);
      if (ej.chakuJikoku !== null) ej.hatsuJikoku = null; // 着ありのときだけ発消去
      for (let o = cmd.ekiOrder + 1; o < r.ekiJikokuCont.length; o++) {
        const later = r.ekiJikokuCont[o];
        if (later !== undefined) clearToNone(later); // 後方全 None
      }
    }
  },

  'ekiJikoku/setChaku': (draft, cmd) => {
    const r = ressyaAt(draft, cmd.diaIndex, cmd.houkou, cmd.ressyaIndex);
    const slot = slotAt(r, cmd.ekiOrder);
    const jikokuRev = findRevJikoku(r, cmd.ekiOrder - 1);
    const decoded = decodeJikokuWithHourCompletion(cmd.input, jikokuRev);
    if (decoded === 'invalid') return; // 不正入力は無視
    slot.chakuJikoku = decoded;
    autoTeisya(slot);
    r.isNull = false;
  },

  'ekiJikoku/setHatsu': (draft, cmd) => {
    const r = ressyaAt(draft, cmd.diaIndex, cmd.houkou, cmd.ressyaIndex);
    const slot = slotAt(r, cmd.ekiOrder);
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
    const slot = slotAt(r, cmd.ekiOrder);
    const jikokuRev = findRevJikoku(r, cmd.ekiOrder - 1);
    const decChaku = decodeJikokuWithHourCompletion(cmd.chakuInput, jikokuRev);
    if (decChaku === 'invalid') return; // 検証はダイアログ側の責務。ここでは防御的 no-op
    const decHatsu = decodeJikokuWithHourCompletion(cmd.hatsuInput, decChaku ?? jikokuRev);
    if (decHatsu === 'invalid') return;

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
      shiftWalkFwd(r, cmd.ekiOrder + 1, 'chaku', delta); // 次駅の着以後
    } else if (oldChaku !== null && decChaku !== null) {
      const delta = subJikokuWrapped(decChaku, oldChaku);
      shiftWalkFwd(r, cmd.ekiOrder, 'hatsu', delta); // 当該駅の発以後(発が非 null なら発も動く)
    }
    // 前後作業の時刻シフト(318-332)は M7(enableOperation=0 では常に空)。
  },

  'ekiJikoku/shiftJikoku': (draft, cmd) => {
    const list = ressyaListOf(draft, cmd.diaIndex, cmd.houkou);
    for (const i of cmd.ressyaIndices) {
      const r = list[i];
      if (r === undefined) continue;
      // 原典 modifyRessyaJikoku: 基準 order が範囲外なら -1 で no-op(722-727)。
      if (cmd.ekiOrder < 0 || cmd.ekiOrder >= r.ekiJikokuCont.length) continue;
      if (cmd.rev === true) shiftWalkRev(r, cmd.ekiOrder, cmd.item, cmd.deltaSeconds);
      else shiftWalkFwd(r, cmd.ekiOrder, cmd.item, cmd.deltaSeconds);
    }
  },

  'ekiJikoku/setTrack': (draft, cmd) => {
    const r = ressyaAt(draft, cmd.diaIndex, cmd.houkou, cmd.ressyaIndex);
    slotAt(r, cmd.ekiOrder).ressyaTrackIndex = cmd.ressyaTrackIndex;
  },

  'ekiJikoku/clear': (draft, cmd) => {
    const list = ressyaListOf(draft, cmd.diaIndex, cmd.houkou);
    for (const i of cmd.ressyaIndices) {
      const r = list[i];
      if (r === undefined) continue;
      const ej = slotAt(r, cmd.ekiOrder);
      if (cmd.target === 'chaku') ej.chakuJikoku = null;
      else ej.hatsuJikoku = null;
      if (ej.chakuJikoku === null && ej.hatsuJikoku === null) clearToNone(ej); // 両 null → None
    }
  },

  'ekiJikoku/toggleTsuuka': (draft, cmd) => {
    // 原典 OnJikokuhyouTsuuka(CWjkState_Ressyahensyu.cpp 4802-4916)。
    const list = ressyaListOf(draft, cmd.diaIndex, cmd.houkou);
    for (const i of cmd.ressyaIndices) {
      const r = list[i];
      if (r === undefined) continue;
      const ej = slotAt(r, cmd.ekiOrder);
      const wasRun = ej.ekiatsukai === 'teisya' || ej.ekiatsukai === 'tsuuka';
      ej.ekiatsukai = 'tsuuka';
      ej.chakuJikoku = null; // 原典: 時刻も NULL に(破壊的通過)
      ej.hatsuJikoku = null;
      // 運行なし(経由なし)からの変更時のみ基準番線 [1](通過用)を設定。
      // 基準運転時分ダイヤ未対応(M7)の現段階では常に主本線。停車/通過からは番線維持。
      if (!wasRun) ej.ressyaTrackIndex = mainTrackOf(draft, cmd.houkou, cmd.ekiOrder);
    }
  },

  'ekiJikoku/toggleTsuukaTeisya': (draft, cmd) => {
    // 原典 OnJikokuhyouTsuukateisya(CWjkState_Ressyahensyu.cpp 4954-5021)。
    // 各列車が自身の駅扱で独立トグル。停車⇔通過では駅時刻・番線とも一切変更しない。
    const list = ressyaListOf(draft, cmd.diaIndex, cmd.houkou);
    for (const i of cmd.ressyaIndices) {
      const r = list[i];
      if (r === undefined) continue;
      const ej = slotAt(r, cmd.ekiOrder);
      if (ej.ekiatsukai === 'tsuuka') {
        ej.ekiatsukai = 'teisya';
      } else if (ej.ekiatsukai === 'teisya') {
        ej.ekiatsukai = 'tsuuka';
      } else {
        // 運行なし→通過 + 基準番線 [1](通過用。M7 まで主本線)。時刻は元々 null。
        ej.ekiatsukai = 'tsuuka';
        ej.ressyaTrackIndex = mainTrackOf(draft, cmd.houkou, cmd.ekiOrder);
      }
    }
  },

  'ekiJikoku/setKeiyunasi': (draft, cmd) => {
    const list = ressyaListOf(draft, cmd.diaIndex, cmd.houkou);
    for (const i of cmd.ressyaIndices) {
      const r = list[i];
      if (r !== undefined) clearToNone(slotAt(r, cmd.ekiOrder));
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
      const ej = slotAt(r, cmd.ekiOrder);
      if (cmd.ekiatsukai === 'none') {
        clearToNone(ej); // 不変条件: none ⇒ track null
      } else {
        ej.ekiatsukai = cmd.ekiatsukai; // teisya / tsuuka は時刻保持
      }
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
