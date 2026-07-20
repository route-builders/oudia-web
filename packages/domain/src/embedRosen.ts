// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 up-tri
//
// Based on OuDiaSecond (Copyright (C) 2017-2026 diagram_mania)
// and OuDia (Copyright (C) 2006-2017 take-okm)

/**
 * 路線ファイルの組入れ(embed。原典 CentDedRosen::insert、CentDedRosen.cpp:323)。
 * 編集中の路線 `base` の指定駅位置へ、別路線 `add` を組み入れた新しい RosenFileData を返す
 * 純変換(元ドキュメントは変更しない。UI は結果を executeCommand の rosen 全置換 or
 * 新規ドキュメントとして扱う)。
 *
 * 移植方針(実機フィクスチャ無し = 合成検証):
 * - 境界決定(始発側/中間駅/終着側)、中間駅の同名複製分割、駅の全追加(brunchCore/
 *   loopOrigin シフト + 端駅時刻形式補正)、中間駅分割時の列車 ekiJikoku 上下振り分け、
 *   種別マージ(同名再利用 + parentSyubetsuIndex 再マップ)、ダイヤマージ(同名再利用/新規空)、
 *   列車追加(駅Order オフセットで ekiJikoku コピー)、comment 連結を移植する。
 * - 同名駅併合(組入れ先 Min と Min+1 が同名 → Hatsuchaku 化 + 番線超過分マージ)は
 *   基本部分を移植する。OuterTerminal の compareOuterTerminal / 番線グループ伝播
 *   (adjustBrunchLoopOuterTerminal)は運用/番線グループ隣接のため簡略(基本コピー)とし、
 *   TODO として明記する。実機一致は実機入手時に検証する。
 *
 * 各駅の物理挿入では ekiJikokuCont 伸長・既存駅の index シフトを cascadeEkiInsert に委ね、
 * 追加駅自身の brunchCore/loopOrigin は挿入後に最終値で上書きして原典の onEkiInsert 相互
 * 作用(不要インクリメント抑制の後補正)を回避する。
 */

import type { Eki, EkiJikoku, RosenFileData } from '@oudia-web/format';
import { cascadeEkiInsert } from './command/ekiCascade.js';
import { adjustByEkijikokukeisiki } from './command/keisikiAdjust.js';
import { ekiOrderOfEkiIndex } from './ekiOrder.js';
import { makeNoneEkiJikoku } from './factory.js';
import { getSihatsuEki, getSyuuchakuEki } from './runRange.js';

/** 組入れの実行可否(原典 CMainFrame の ≥2 駅ガード)。 */
export function canEmbedRosen(base: RosenFileData, ekiIndexToInsert: number): boolean {
  const total = base.rosen.ekiCont.length;
  if (total < 2) return false; // 原典 OnFileRosenFileInsert_Process の rv=-21
  if (ekiIndexToInsert < 0 || ekiIndexToInsert >= total) return false;
  return true;
}

/**
 * 別路線を組み入れる(原典 CentDedRosen::insert)。
 * @param base            編集中の路線(変更しない)
 * @param add             組み入れる路線
 * @param ekiIndexToInsert 組入れ先駅Index
 */
export function embedRosen(
  base: RosenFileData,
  add: RosenFileData,
  ekiIndexToInsert: number,
): RosenFileData {
  if (!canEmbedRosen(base, ekiIndexToInsert)) {
    throw new Error(`embedRosen 範囲不正: index=${String(ekiIndexToInsert)}`);
  }
  const out: RosenFileData = structuredClone(base);
  const addClone: RosenFileData = structuredClone(add);
  const rosen = out.rosen;

  // ── 境界決定(原典 iEkiIndexToInsertMin / Max)──
  let min: number;
  let max: number;
  if (ekiIndexToInsert === 0) {
    min = -1; // 始発側
    max = 0;
  } else if (ekiIndexToInsert === rosen.ekiCont.length - 1) {
    min = rosen.ekiCont.length - 1; // 終着側
    max = rosen.ekiCont.length;
  } else {
    min = ekiIndexToInsert; // 中間駅
    max = ekiIndexToInsert;
  }

  // ── 中間駅なら分割 ──
  const isMiddle = 0 < min && max < rosen.ekiCont.length - 1;
  if (isMiddle) {
    max = min + 1;
    splitMiddleEki(out, min, max);
    adjustByEkijikokukeisiki(out, min); // 分割後 Min の駅時刻形式補正
  }

  // ── 駅を全追加(組入れ先 min+1 位置から)──
  const addEkiCont = addClone.rosen.ekiCont;
  const addCount = addEkiCont.length;
  for (let idxEki = 0; idxEki < addCount; idxEki++) {
    const src = addEkiCont[idxEki];
    if (src === undefined) continue;
    const eki: Eki = structuredClone(src);
    // 端駅の駅時刻形式補正(発着以外 → 起点 NoboriChaku / 終点 KudariChaku)。
    if (idxEki === 0 && eki.ekijikokukeisiki !== 'hatsuchaku') eki.ekijikokukeisiki = 'noboriChaku';
    else if (idxEki === addCount - 1 && eki.ekijikokukeisiki !== 'hatsuchaku')
      eki.ekijikokukeisiki = 'kudariChaku';
    // 追加駅内の brunch/loop 参照を最終オフセット(min+1)へシフト(挿入後に上書き)。
    const insertPos = min + 1 + idxEki;
    rosen.ekiCont.splice(insertPos, 0, eki);
    cascadeEkiInsert(out, insertPos); // ekiJikokuCont 伸長 + 既存駅の参照シフト
    // 追加駅自身の参照は cascade が触った可能性があるので最終値で上書き。
    const inserted = rosen.ekiCont[insertPos];
    if (inserted !== undefined) {
      inserted.brunchCoreEkiIndex =
        src.brunchCoreEkiIndex !== null && src.brunchCoreEkiIndex >= 0
          ? src.brunchCoreEkiIndex + min + 1
          : null;
      inserted.loopOriginEkiIndex =
        src.loopOriginEkiIndex !== null && src.loopOriginEkiIndex >= 0
          ? src.loopOriginEkiIndex + min + 1
          : null;
      if (idxEki === addCount - 1) inserted.nextEkiDistance = 0;
    }
    max += 1;
  }

  // ── 種別マージ + 対照表 ──
  const syubetsuMap = mergeSyubetsu(out, addClone);

  // ── ダイヤマージ + 対照表 ──
  const diaMap = mergeDia(out, addClone);

  // ── 列車追加 ──
  addRessya(out, addClone, min, max, syubetsuMap, diaMap);

  // ── 同名駅併合(Min と Min+1 が同名)──
  if (min >= 0) mergeSameNameEki(out, min);

  // ── comment 連結(base + "\n\n" + add)──
  out.rosen.comment =
    out.rosen.comment === '' && addClone.rosen.comment === ''
      ? ''
      : `${out.rosen.comment}\n\n${addClone.rosen.comment}`;

  return out;
}

/** 中間駅を同名複製して分割(原典 insert の中間駅分割部)。 */
function splitMiddleEki(out: RosenFileData, min: number, max: number): void {
  const ekiCont = out.rosen.ekiCont;
  const ekiMin = ekiCont[min];
  if (ekiMin === undefined) return;

  // 組み入れ駅を基幹駅とする派生駅の分岐設定を解除(または自身が派生駅なら分岐解除)。
  if (ekiMin.brunchCoreEkiIndex !== null && ekiMin.brunchCoreEkiIndex >= 0) {
    ekiMin.brunchCoreEkiIndex = null;
  } else if (ekiMin.ekikibo === 'syuyou' && ekiMin.ekijikokukeisiki === 'hatsuchaku') {
    for (const e of ekiCont) {
      if (e.brunchCoreEkiIndex === min) e.brunchCoreEkiIndex = null;
    }
  }

  // 同名複製を max へ挿入(cascade で ekiJikoku 伸長 + 既存参照シフト)。
  const dup: Eki = structuredClone(ekiMin);
  ekiCont.splice(max, 0, dup);
  cascadeEkiInsert(out, max);

  const upper = ekiCont[min]; // 上側 = 下り着
  const lower = ekiCont[max]; // 下側 = 上り着
  if (upper !== undefined) {
    upper.ekijikokukeisiki = 'kudariChaku';
    upper.nextEkiDistance = 0;
  }
  if (lower !== undefined) {
    lower.ekijikokukeisiki = 'noboriChaku';
    if (lower.loopOriginEkiIndex !== null && lower.loopOriginEkiIndex >= 0) {
      lower.loopOriginEkiIndex = null;
    }
  }
  // 上側(min)を起点とする環状の終点を下側(max)へずらす。
  for (let idx = max + 1; idx < ekiCont.length; idx++) {
    const e = ekiCont[idx];
    if (e !== undefined && e.loopOriginEkiIndex === min) e.loopOriginEkiIndex = max;
  }

  // 各ダイヤ・各方向の列車の駅時刻を上下へ振り分ける。
  for (const dia of out.rosen.diaCont) {
    const ekiCount = ekiCont.length;
    for (const houkou of [0, 1] as const) {
      const list = dia.ressyaCont[houkou];
      const o1 = ekiOrderOfEkiIndex(min, ekiCount, houkou);
      const o2 = ekiOrderOfEkiIndex(max, ekiCount, houkou);
      const orderMin = Math.min(o1, o2);
      const orderMax = Math.max(o1, o2);
      for (const ressya of list) {
        const slotMin = ressya.ekiJikokuCont[orderMin];
        const slotMax = ressya.ekiJikokuCont[orderMax];
        if (slotMin === undefined || slotMax === undefined) continue;
        splitRessyaSlots(ressya, orderMin, orderMax, houkou);
      }
    }
  }
}

/** 1 列車の分割点スロットを上下に振り分ける(原典 中間駅分割の列車ループ)。 */
function splitRessyaSlots(
  ressya: { ekiJikokuCont: EkiJikoku[] },
  orderMin: number,
  orderMax: number,
  _houkou: 0 | 1,
): void {
  const cont = ressya.ekiJikokuCont;
  const slotMin = cont[orderMin];
  const slotMax = cont[orderMax];
  if (slotMin === undefined || slotMax === undefined) return;
  const sihatsu = getSihatsuEki(ressya as never);
  const syuuchaku = getSyuuchakuEki(ressya as never);

  if (sihatsu === orderMin) {
    // 始発駅: Max に Min をコピー、Min は運行なし。
    cont[orderMax] = structuredClone(slotMin);
    cont[orderMin] = makeNoneEkiJikoku();
  } else if (sihatsu < orderMin && orderMin < syuuchaku) {
    // 中間駅: Max に Min をコピー、Min の発 null化・Max の着 null化。
    const copy = structuredClone(slotMin);
    if (slotMin.chakuJikoku !== null) slotMin.hatsuJikoku = null;
    if (copy.hatsuJikoku !== null) copy.chakuJikoku = null;
    cont[orderMax] = copy;
  } else if (syuuchaku === orderMin) {
    // 終着駅: Min はそのまま、Max は運行なし。
    cont[orderMax] = makeNoneEkiJikoku();
  }
}

/** 種別マージ。add 側 → out 側の index 対照表を返す(原典 arRessyasyubetsuIdx_AddedToThis)。 */
function mergeSyubetsu(out: RosenFileData, add: RosenFileData): number[] {
  const thisCont = out.rosen.ressyasyubetsuCont;
  const addCont = add.rosen.ressyasyubetsuCont;
  const sizeBefore = thisCont.length;
  const map: number[] = [];
  for (const src of addCont) {
    let idx = thisCont.findIndex((s) => s.syubetsumei === src.syubetsumei);
    if (idx === -1) {
      thisCont.push(structuredClone(src));
      idx = thisCont.length - 1;
    }
    map.push(idx);
  }
  // 追加された種別の parentSyubetsuIndex を対照表で付け替え。
  for (let i = sizeBefore; i < thisCont.length; i++) {
    const s = thisCont[i];
    if (s === undefined) continue;
    if (
      s.parentSyubetsuIndex !== null &&
      s.parentSyubetsuIndex >= 0 &&
      s.parentSyubetsuIndex < map.length
    ) {
      s.parentSyubetsuIndex = map[s.parentSyubetsuIndex] ?? null;
    }
  }
  return map;
}

/** ダイヤマージ。add 側 → out 側の index 対照表を返す(原典 arDiaIdx_AddedToThis)。 */
function mergeDia(out: RosenFileData, add: RosenFileData): number[] {
  const thisCont = out.rosen.diaCont;
  const addCont = add.rosen.diaCont;
  const ekiCount = out.rosen.ekiCont.length;
  const map: number[] = [];
  for (const src of addCont) {
    let idx = thisCont.findIndex((d) => d.name === src.name);
    if (idx === -1) {
      // 同名なし → 列車が空の新規ダイヤを追加(名前のみ引き継ぎ)。
      thisCont.push({
        name: src.name,
        mainBackColorIndex: src.mainBackColorIndex,
        subBackColorIndex: src.subBackColorIndex,
        backPatternIndex: src.backPatternIndex,
        patternDiagramPreviewEnable: src.patternDiagramPreviewEnable,
        patternDiagramPreviewCycleSecond: src.patternDiagramPreviewCycleSecond,
        ressyaCont: [[], []],
      });
      idx = thisCont.length - 1;
    }
    map.push(idx);
  }
  void ekiCount;
  return map;
}

/** 組入れ路線の列車を out の対応ダイヤへ追加(駅Order オフセットで ekiJikoku コピー)。 */
function addRessya(
  out: RosenFileData,
  add: RosenFileData,
  min: number,
  max: number,
  syubetsuMap: readonly number[],
  diaMap: readonly number[],
): void {
  const ekiCountThis = out.rosen.ekiCont.length;
  const addEkiCount = add.rosen.ekiCont.length;
  for (let idxDia = 0; idxDia < add.rosen.diaCont.length; idxDia++) {
    const diaAdd = add.rosen.diaCont[idxDia];
    const diaThisIndex = diaMap[idxDia];
    if (diaAdd === undefined || diaThisIndex === undefined) continue;
    const diaThis = out.rosen.diaCont[diaThisIndex];
    if (diaThis === undefined) continue;
    for (const houkou of [0, 1] as const) {
      const listAdd = diaAdd.ressyaCont[houkou];
      const listThis = diaThis.ressyaCont[houkou];
      // 追加路線の駅Order0 が入る、this の駅Order。
      const orderToInsert =
        houkou === 0
          ? ekiOrderOfEkiIndex(min + 1, ekiCountThis, houkou)
          : ekiOrderOfEkiIndex(max - 1, ekiCountThis, houkou);
      for (const rAdd of listAdd) {
        const rNew = structuredClone(rAdd);
        // syubetsuIndex を対照表で変換。
        rNew.syubetsuIndex = syubetsuMap[rAdd.syubetsuIndex] ?? 0;
        // 駅時刻を this の駅数に合わせて再構築(オフセット外は運行なし)。
        const newCont: EkiJikoku[] = [];
        for (let ekiOrder = 0; ekiOrder < ekiCountThis; ekiOrder++) {
          const addOrder = ekiOrder - orderToInsert;
          if (addOrder >= 0 && addOrder < addEkiCount) {
            const slot = rAdd.ekiJikokuCont[addOrder];
            newCont.push(slot !== undefined ? structuredClone(slot) : makeNoneEkiJikoku());
          } else {
            newCont.push(makeNoneEkiJikoku());
          }
        }
        rNew.ekiJikokuCont = newCont;
        rNew.houkou = houkou;
        listThis.push(rNew);
      }
    }
  }
}

/**
 * 同名駅併合(組入れ先 min と min+1 が同名 → Hatsuchaku 化 + 番線超過分マージ)。
 * OuterTerminal の compareOuterTerminal / 番線グループ伝播は簡略(基本コピー)。
 * TODO(実機検証): OuterTerminal マージ・adjustBrunchLoopOuterTerminal の完全移植。
 */
function mergeSameNameEki(out: RosenFileData, min: number): void {
  const ekiCont = out.rosen.ekiCont;
  const ekiMin = ekiCont[min];
  const ekiMin1 = ekiCont[min + 1];
  if (ekiMin === undefined || ekiMin1 === undefined) return;
  if (ekiMin.ekimei !== ekiMin1.ekimei) return;

  ekiMin.ekijikokukeisiki = 'hatsuchaku';
  ekiMin.brunchCoreEkiIndex = null;
  ekiMin.brunchOpposite = false;
  ekiMin.jikokuhyouTrackOmit = false;

  // 番線超過分を min へ追加(min+1 の番線数 > min の番線数のとき)。
  for (let t = ekiMin.ekiTrack2Cont.length; t < ekiMin1.ekiTrack2Cont.length; t++) {
    const track = ekiMin1.ekiTrack2Cont[t];
    if (track === undefined) continue;
    ekiMin.ekiTrack2Cont.push(structuredClone(track));
    ekiMin.diagramTrackOmit.push(ekiMin1.diagramTrackOmit[t] ?? false);
  }
  // OuterTerminal は基本コピー(min に無いものを追加。簡略)。
  for (const ot of ekiMin1.outerTerminalCont) {
    if (!ekiMin.outerTerminalCont.some((o) => o.ekimei === ot.ekimei)) {
      ekiMin.outerTerminalCont.push(structuredClone(ot));
    }
  }
}
