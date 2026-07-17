// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 oudia-second-web contributors
//
// Based on OuDiaSecond (Copyright (C) 2017-2026 diagram_mania)
// and OuDia (Copyright (C) 2006-2017 take-okm)

/**
 * 現行世代(グループ 5、OuDiaSecond.1.10〜1.17)リーダー。
 * 原典 CconvCentDed::CentDedRosen_From_OuPropertiesText ほかの忠実移植(file-io §3)。
 *
 * ノードツリー(PtDirectory)→ ファイル同型モデル(Rosen / DispProp)へ写像する。
 * NodeCursor で各コンテナのノードを消費追跡し、未消費ノードは unknownEntries に保全する。
 *
 * 導出データ(brunch/loop position・運用リンク)は持たない(§1.4)。原典 From 後半の
 * adjustBrunchLoopCont / adjustOperation / OperationConnect は derive 層の責務のため呼ばない。
 * 値レベルの範囲補正(番線・作業 index → 主本線 / 0)は各値スキャナが担う。
 */

import type { Colorref, FontProp, Ressyahoukou, UnknownEntry } from '../model/basic.js';
import { RESSYAHOUKOU_KUDARI, RESSYAHOUKOU_NOBORI } from '../model/basic.js';
import type {
  CrossingCheckRule,
  DiagramLineStyle,
  DispProp,
  Eki,
  EkiJikoku,
  EkiTrack2,
  Dia,
  OuterTerminal,
  Ressya,
  Ressyasyubetsu,
  Rosen,
  TrackContent,
} from '../model/entities.js';
import type {
  DiagramRessyajouhouHyouji,
  Ekijikokukeisiki,
  Ekikibo,
  SenStyle,
  StopMarkDrawType,
} from '../model/enums.js';
import type { PtDirectory, PtNode } from '../node/types.js';
import { NodeCursor } from '../node/cursor.js';
import type { UnconsumedNode } from '../node/cursor.js';
import { decodeColor } from '../value/color.js';
import { splitEkiJikokuList } from '../value/ekiJikoku.js';
import type { DecodedEkiJikoku } from '../value/ekiJikoku.js';
import { decodeFont } from '../value/font.js';
import { decodeAfterOperationCont, decodeBeforeOperationCont } from '../value/operation.js';
import type { OperationKeyStore } from '../value/operation.js';
import {
  decodeSyubetsuChangeDisplay,
  decodeJikokuDisplay,
  decodeOuterDisplay,
  decodeTrackOmit,
} from './composite.js';
import type { ReadContext } from './context.js';
import type { ReaderProfile } from './profile.js';
import { CURRENT_PROFILE } from './profile.js';
import { createDefaultDispProp, COLOR_BLACK, COLOR_WHITE } from './defaults.js';
import {
  DIAGRAM_RESSYAJOUHOU_FROM_FILE,
  EKIJIKOKUKEISIKI_FROM_FILE,
  EKIKIBO_FROM_FILE,
  SENSTYLE_FROM_FILE,
  STOPMARK_FROM_FILE,
  TRACKTYPE_BY_CODE,
} from './enumMaps.js';
import {
  readBool,
  readColor,
  readFont,
  readIndexOrNull,
  readInt,
  readJikokuProp,
  readStr,
} from './props.js';

// ---- 未知ノード保全 ----

/** 未消費ノードを UnknownEntry[] に変換する(§1.5)。空なら undefined。 */
function collectUnknown(unconsumed: UnconsumedNode[]): UnknownEntry[] | undefined {
  if (unconsumed.length === 0) return undefined;
  return unconsumed.map(({ index, node }) => unknownEntryOf(index, node, undefined));
}

function unknownEntryOf(index: number, node: PtNode, container: string | undefined): UnknownEntry {
  if (node.kind === 'property') {
    return container === undefined
      ? { index, name: node.name, value: node.value }
      : { index, container, name: node.name, value: node.value };
  }
  const children = node.children.map((c) => rawEntryOf(c));
  return container === undefined
    ? { index, name: node.name, children }
    : { index, container, name: node.name, children };
}

/** 未解釈サブツリーを RawEntry に落とす。 */
function rawEntryOf(node: PtNode): {
  name: string;
  value?: string;
  children?: ReturnType<typeof rawEntryOf>[];
} {
  if (node.kind === 'property') {
    return { name: node.name, value: node.value };
  }
  return { name: node.name, children: node.children.map((c) => rawEntryOf(c)) };
}

// ---- enum 読み(欠落・不正時のフォールバックは呼出し側で指定)----

function readEkijikokukeisiki(cur: NodeCursor, ctx: ReadContext): Ekijikokukeisiki {
  const v = cur.value('Ekijikokukeisiki');
  if (v === undefined || v === '') return 'hatsu';
  const mapped = EKIJIKOKUKEISIKI_FROM_FILE[v];
  if (mapped === undefined) {
    ctx.warn({ kind: 'sjisReplacementChar', count: 0 });
    return 'hatsu';
  }
  return mapped;
}

function readEkikibo(cur: NodeCursor): Ekikibo {
  const v = cur.value('Ekikibo');
  if (v === undefined || v === '') return 'ippan';
  return EKIKIBO_FROM_FILE[v] ?? 'ippan';
}

function readDiagramRessyajouhou(cur: NodeCursor, name: string): DiagramRessyajouhouHyouji {
  const v = cur.value(name);
  if (v === undefined || v === '') return 'origin';
  return DIAGRAM_RESSYAJOUHOU_FROM_FILE[v] ?? 'origin';
}

function readSenStyle(cur: NodeCursor): SenStyle {
  const v = cur.value('DiagramSenStyle');
  if (v === undefined || v === '') return 'jissen';
  return SENSTYLE_FROM_FILE[v] ?? 'jissen';
}

function readStopMark(cur: NodeCursor): StopMarkDrawType {
  const v = cur.value('StopMarkDrawType');
  if (v === undefined || v === '') return 'drawOnStop';
  return STOPMARK_FROM_FILE[v] ?? 'drawOnStop';
}

// ---- TrackContent(平面交差の番線集合)----

/** "type$index" を `;` で連結した値を TrackContent[] に(analysis §03 §5.7)。 */
function decodeTrackContentCont(value: string | undefined): TrackContent[] {
  if (value === undefined || value === '') return [];
  const out: TrackContent[] = [];
  for (const item of value.split(';')) {
    if (item === '') continue;
    const dollar = item.indexOf('$');
    const typeStr = dollar === -1 ? item : item.slice(0, dollar);
    const idxStr = dollar === -1 ? '' : item.slice(dollar + 1);
    const typeCode = Number.parseInt(typeStr, 10);
    const trackType = TRACKTYPE_BY_CODE[typeCode] ?? 'track';
    const index = idxStr === '' ? 0 : Number.parseInt(idxStr, 10);
    out.push({ trackType, index: Number.isNaN(index) ? 0 : index });
  }
  return out;
}

// ---- EkiTrack2 / OuterTerminal / CrossingCheckRule サブディレクトリ ----

function readEkiTrack2(dir: PtDirectory): EkiTrack2 {
  const cur = new NodeCursor(dir);
  const trackName = readStr(cur, 'TrackName');
  const trackRyakusyou = readStr(cur, 'TrackRyakusyou');
  const trackNoboriRyakusyou = readStr(cur, 'TrackNoboriRyakusyou');
  const unknownEntries = collectUnknown(cur.unconsumed());
  const base: EkiTrack2 = { trackName, trackRyakusyou, trackNoboriRyakusyou };
  return unknownEntries === undefined ? base : { ...base, unknownEntries };
}

function readOuterTerminal(dir: PtDirectory): OuterTerminal {
  const cur = new NodeCursor(dir);
  const ekimei = readStr(cur, 'OuterTerminalEkimei');
  const jikokuRyaku = readStr(cur, 'OuterTerminalJikokuRyaku');
  const diaRyaku = readStr(cur, 'OuterTerminalDiaRyaku');
  const unknownEntries = collectUnknown(cur.unconsumed());
  const base: OuterTerminal = { ekimei, jikokuRyaku, diaRyaku };
  return unknownEntries === undefined ? base : { ...base, unknownEntries };
}

function readCrossingCheckRule(dir: PtDirectory): CrossingCheckRule {
  const cur = new NodeCursor(dir);
  const caption = readStr(cur, 'Caption');
  // Enable はキー省略時 true(model コメント)。原典 1.11〜。
  const enableRaw = cur.value('Enable');
  const enable = enableRaw === undefined ? true : enableRaw === '1';
  const headwaySecond = readInt(cur, 'HeadwaySecond', 60);
  const headwaySecondMinimum = readInt(cur, 'HeadwaySecondMinimum', 0);
  const beforeFromTrackContentCont = decodeTrackContentCont(
    cur.value('BeforeFromTrackContentCont'),
  );
  const beforeToTrackContentCont = decodeTrackContentCont(cur.value('BeforeToTrackContentCont'));
  const afterFromTrackContentCont = decodeTrackContentCont(cur.value('AfterFromTrackContentCont'));
  const afterToTrackContentCont = decodeTrackContentCont(cur.value('AfterToTrackContentCont'));
  const beforeIsArrival = readBool(cur, 'BeforeIsArrival');
  const beforeIsTsuuka = readBool(cur, 'BeforeIsTsuuka');
  const afterIsArrival = readBool(cur, 'AfterIsArrival');
  const afterIsTsuuka = readBool(cur, 'AfterIsTsuuka');
  const unknownEntries = collectUnknown(cur.unconsumed());
  const base: CrossingCheckRule = {
    caption,
    enable,
    headwaySecond,
    headwaySecondMinimum,
    beforeFromTrackContentCont,
    beforeToTrackContentCont,
    afterFromTrackContentCont,
    afterToTrackContentCont,
    beforeIsArrival,
    beforeIsTsuuka,
    afterIsArrival,
    afterIsTsuuka,
  };
  return unknownEntries === undefined ? base : { ...base, unknownEntries };
}

// ---- Eki(駅)----

function readEki(dir: PtDirectory, id: number, ctx: ReadContext, profile: ReaderProfile): Eki {
  const cur = new NodeCursor(dir);

  const ekimei = readStr(cur, 'Ekimei');
  const ekimeiJikokuRyaku = readStr(cur, 'EkimeiJikokuRyaku');
  const ekimeiDiaRyaku = readStr(cur, 'EkimeiDiaRyaku');
  const ekijikokukeisiki = readEkijikokukeisiki(cur, ctx);
  const ekikibo = readEkikibo(cur);
  const diagramRessyajouhouHyoujiKudari = readDiagramRessyajouhou(
    cur,
    'DiagramRessyajouhouHyoujiKudari',
  );
  const diagramRessyajouhouHyoujiNobori = readDiagramRessyajouhou(
    cur,
    'DiagramRessyajouhouHyoujiNobori',
  );
  // DownMain / UpMain は世代で読み方が異なる(S05 は −1、S00 は既定 0/1)。
  const { downMain, upMain } = profile.readMainTracks(cur);

  // Brunch/Loop: 空 → null。opposite は index >= 0 のときのみ読む(原典)。
  const brunchCoreEkiIndex = readIndexOrNull(cur, 'BrunchCoreEkiIndex');
  const brunchOpposite = brunchCoreEkiIndex !== null && readBool(cur, 'BrunchOpposite');
  const loopOriginEkiIndex = readIndexOrNull(cur, 'LoopOriginEkiIndex');
  const loopOpposite = loopOriginEkiIndex !== null && readBool(cur, 'LoopOpposite');

  const jikokuhyouTrackDisplayKudari = readBool(cur, 'JikokuhyouTrackDisplayKudari');
  const jikokuhyouTrackDisplayNobori = readBool(cur, 'JikokuhyouTrackDisplayNobori');
  const diagramTrackDisplay = readBool(cur, 'DiagramTrackDisplay');

  // OuterTerminal.(空 ekimei は原典が捨てるが、ここでは保全的に空も保持しない)
  const outerTerminalCont: OuterTerminal[] = [];
  for (const otDir of cur.directories('OuterTerminal')) {
    const ot = readOuterTerminal(otDir);
    if (ot.ekimei !== '') outerTerminalCont.push(ot);
  }

  const nextEkiDistance = readInt(cur, 'NextEkiDistance', 0);
  const jikokuhyouTrackOmit = readBool(cur, 'JikokuhyouTrackOmit');
  const jikokuhyouOperationOrigin = clamp03(readOperationCount(cur, 'JikokuhyouOperationOrigin'));
  const jikokuhyouOperationTerminal = clamp03(
    readOperationCount(cur, 'JikokuhyouOperationTerminal'),
  );

  // 作業欄の前後配置 4 種は Origin/Terminal>0 のときのみ原典が読む。欠落 → false。
  const jikokuhyouOperationOriginDownBeforeUpAfter =
    jikokuhyouOperationOrigin > 0 && readBool(cur, 'JikokuhyouOperationOriginDownBeforeUpAfter');
  const jikokuhyouOperationOriginDownAfterUpBefore =
    jikokuhyouOperationOrigin > 0 && readBool(cur, 'JikokuhyouOperationOriginDownAfterUpBefore');
  const jikokuhyouOperationTerminalDownBeforeUpAfter =
    jikokuhyouOperationTerminal > 0 &&
    readBool(cur, 'JikokuhyouOperationTerminalDownBeforeUpAfter');
  const jikokuhyouOperationTerminalDownAfterUpBefore =
    jikokuhyouOperationTerminal > 0 &&
    readBool(cur, 'JikokuhyouOperationTerminalDownAfterUpBefore');

  const jikokuhyouJikokuDisplayKudari = decodeJikokuDisplay(
    cur.value('JikokuhyouJikokuDisplayKudari'),
  );
  const jikokuhyouJikokuDisplayNobori = decodeJikokuDisplay(
    cur.value('JikokuhyouJikokuDisplayNobori'),
  );
  const jikokuhyouSyubetsuChangeDisplayKudari = decodeSyubetsuChangeDisplay(
    cur.value('JikokuhyouSyubetsuChangeDisplayKudari'),
  );
  const jikokuhyouSyubetsuChangeDisplayNobori = decodeSyubetsuChangeDisplay(
    cur.value('JikokuhyouSyubetsuChangeDisplayNobori'),
  );
  const jikokuhyouPrevSyubetsuChangeDisplayKudari = decodeSyubetsuChangeDisplay(
    cur.value('JikokuhyouPrevSyubetsuChangeDisplayKudari'),
  );
  const jikokuhyouPrevSyubetsuChangeDisplayNobori = decodeSyubetsuChangeDisplay(
    cur.value('JikokuhyouPrevSyubetsuChangeDisplayNobori'),
  );
  const jikokuhyouNyuusenJikokuDisplayKudari = readBool(
    cur,
    'JikokuhyouNyuusenJikokuDisplayKudari',
  );
  const jikokuhyouNyuusenJikokuDisplayNobori = readBool(
    cur,
    'JikokuhyouNyuusenJikokuDisplayNobori',
  );

  const diagramColorNextEki = readInt(cur, 'DiagramColorNextEki', 0);
  const operationTableDisplayJikoku = readBool(cur, 'OperationTableDisplayJikoku');
  const jikokuhyouOuterDisplayKudari = decodeOuterDisplay(
    cur.value('JikokuhyouOuterDisplayKudari'),
  );
  const jikokuhyouOuterDisplayNobori = decodeOuterDisplay(
    cur.value('JikokuhyouOuterDisplayNobori'),
  );

  // CrossingCheckRule.(1.11〜)
  const crossingCheckRuleCont = cur
    .directories('CrossingCheckRule')
    .map((ccDir) => readCrossingCheckRule(ccDir));

  // EkiTrack2Cont.(中間ディレクトリ)。既定は 2 番線だが、コンテナが空/欠落なら空配列。
  const ekiTrack2Cont: EkiTrack2[] = [];
  const trackContUnknown: UnknownEntry[] = [];
  const track2Dir = cur.directory('EkiTrack2Cont');
  if (track2Dir !== undefined) {
    const track2Cur = new NodeCursor(track2Dir);
    for (const t2 of track2Cur.directories('EkiTrack2')) {
      ekiTrack2Cont.push(readEkiTrack2(t2));
    }
    // 中間ディレクトリ直下の未知ノードは親 Eki に container 付きで保全(§1.5)。
    for (const { index, node } of track2Cur.unconsumed()) {
      trackContUnknown.push(unknownEntryOf(index, node, 'EkiTrack2Cont.'));
    }
  }

  // DiagramTrackOmit は番線数に依存(EkiTrack2Cont 読込後)。
  const diagramTrackOmit = decodeTrackOmit(cur.value('DiagramTrackOmit'), ekiTrack2Cont.length);

  const directUnknown = collectUnknown(cur.unconsumed()) ?? [];
  const allUnknown = [...directUnknown, ...trackContUnknown];

  const base: Eki = {
    id,
    ekimei,
    ekimeiJikokuRyaku,
    ekimeiDiaRyaku,
    ekijikokukeisiki,
    ekikibo,
    diagramRessyajouhouHyoujiKudari,
    diagramRessyajouhouHyoujiNobori,
    downMain,
    upMain,
    ekiTrack2Cont,
    brunchCoreEkiIndex,
    brunchOpposite,
    loopOriginEkiIndex,
    loopOpposite,
    outerTerminalCont,
    nextEkiDistance,
    crossingCheckRuleCont,
    jikokuhyouTrackDisplayKudari,
    jikokuhyouTrackDisplayNobori,
    diagramTrackDisplay,
    diagramTrackOmit,
    jikokuhyouTrackOmit,
    jikokuhyouOperationOrigin,
    jikokuhyouOperationTerminal,
    jikokuhyouOperationOriginDownBeforeUpAfter,
    jikokuhyouOperationOriginDownAfterUpBefore,
    jikokuhyouOperationTerminalDownBeforeUpAfter,
    jikokuhyouOperationTerminalDownAfterUpBefore,
    jikokuhyouJikokuDisplayKudari,
    jikokuhyouJikokuDisplayNobori,
    jikokuhyouSyubetsuChangeDisplayKudari,
    jikokuhyouSyubetsuChangeDisplayNobori,
    jikokuhyouPrevSyubetsuChangeDisplayKudari,
    jikokuhyouPrevSyubetsuChangeDisplayNobori,
    jikokuhyouNyuusenJikokuDisplayKudari,
    jikokuhyouNyuusenJikokuDisplayNobori,
    diagramColorNextEki,
    operationTableDisplayJikoku,
    jikokuhyouOuterDisplayKudari,
    jikokuhyouOuterDisplayNobori,
  };
  const eki = allUnknown.length === 0 ? base : { ...base, unknownEntries: allUnknown };
  // 旧世代は keisiki からの表示フラグ導出・空 Ekimei 補完などをフックで適用する。
  return profile.fixupEki === undefined ? eki : profile.fixupEki(eki, cur);
}

/** 作業欄数の生読み(空 → 0、1..3 以外 → 0。原典 stoi + 範囲チェック)。 */
function readOperationCount(cur: NodeCursor, name: string): number {
  const v = cur.value(name);
  if (v === undefined || v === '') return 0;
  const n = Number.parseInt(v, 10);
  if (Number.isNaN(n) || n < 1 || n > 3) return 0;
  return n;
}

function clamp03(n: number): 0 | 1 | 2 | 3 {
  return n === 1 ? 1 : n === 2 ? 2 : n === 3 ? 3 : 0;
}

// ---- Ressyasyubetsu(列車種別)----

function readDiagramLineStyle(cur: NodeCursor): DiagramLineStyle {
  const senColor = readColor(cur, 'DiagramSenColor', COLOR_BLACK);
  const senStyle = readSenStyle(cur);
  // DiagramSenIsBold は _tcstoul != 0 判定(原典)。"0"/空 → false。
  const boldRaw = cur.value('DiagramSenIsBold');
  const isBold = boldRaw !== undefined && boldRaw !== '' && Number.parseInt(boldRaw, 10) !== 0;
  return { senColor, senStyle, isBold };
}

function readRessyasyubetsu(dir: PtDirectory): Ressyasyubetsu {
  const cur = new NodeCursor(dir);
  const syubetsumei = readStr(cur, 'Syubetsumei');
  const ryakusyou = readStr(cur, 'Ryakusyou');
  const jikokuhyouMojiColor = readColor(cur, 'JikokuhyouMojiColor', COLOR_BLACK);
  const jikokuhyouFontIndex = readInt(cur, 'JikokuhyouFontIndex', 0);
  const jikokuhyouBackColor = readColor(cur, 'JikokuhyouBackColor', COLOR_WHITE);
  const diagramLineStyle = readDiagramLineStyle(cur);
  const stopMarkDrawType = readStopMark(cur);
  const parentSyubetsuIndex = readIndexOrNull(cur, 'ParentSyubetsuIndex');
  const hidden = readBool(cur, 'Hidden');
  const unknownEntries = collectUnknown(cur.unconsumed());
  const base: Ressyasyubetsu = {
    syubetsumei,
    ryakusyou,
    jikokuhyouMojiColor,
    jikokuhyouFontIndex,
    jikokuhyouBackColor,
    diagramLineStyle,
    stopMarkDrawType,
    parentSyubetsuIndex,
    hidden,
  };
  return unknownEntries === undefined ? base : { ...base, unknownEntries };
}

// ---- Ressya(列車)/ EkiJikoku(駅時刻)----

/** その方向の各駅Orderごとの番線数・主本線・路線外発着数(原典の per-order 配列)。 */
interface EkiOrderContext {
  ekiTrack2Count: number[];
  mainTrack: number[];
  outerTerminalCount: number[];
}

/**
 * 方向別の駅Order配列コンテキストを構築する(原典 CentDedDia_From の per-houkou ループ)。
 * Kudari は路線順、Nobori は逆順。主本線は Kudari=downMain / Nobori=upMain。
 */
function buildEkiOrderContext(ekiCont: Eki[], houkou: Ressyahoukou): EkiOrderContext {
  const ekiTrack2Count: number[] = [];
  const mainTrack: number[] = [];
  const outerTerminalCount: number[] = [];
  const ekiCount = ekiCont.length;
  for (let order = 0; order < ekiCount; order++) {
    // 駅Order → 駅Index: Kudari は同一、Nobori は反転(domain ekiOrderOfEkiIndex と対称)。
    const idx = houkou === RESSYAHOUKOU_KUDARI ? order : ekiCount - 1 - order;
    const eki = ekiCont[idx];
    if (eki === undefined) {
      ekiTrack2Count.push(0);
      mainTrack.push(0);
      outerTerminalCount.push(0);
      continue;
    }
    ekiTrack2Count.push(eki.ekiTrack2Cont.length);
    mainTrack.push(houkou === RESSYAHOUKOU_KUDARI ? eki.downMain : eki.upMain);
    outerTerminalCount.push(eki.outerTerminalCont.length);
  }
  return { ekiTrack2Count, mainTrack, outerTerminalCount };
}

/** NodeCursor を Operation キー値の供給元にするアダプタ。 */
function makeOperationStore(cur: NodeCursor): OperationKeyStore {
  return {
    get(path: string): string | undefined {
      return cur.value(`Operation${path}`);
    },
  };
}

function readRessya(dir: PtDirectory, orderCtx: EkiOrderContext, profile: ReaderProfile): Ressya {
  const cur = new NodeCursor(dir);

  // Houkou: 不正・欠落 → isNull(この列車に関する記述なし)。
  const houkouStr = cur.value('Houkou');
  const houkou: Ressyahoukou = houkouStr === 'Nobori' ? RESSYAHOUKOU_NOBORI : RESSYAHOUKOU_KUDARI;
  const isNull = houkouStr !== 'Kudari' && houkouStr !== 'Nobori';

  if (isNull) {
    // 記述なし列車。EkiJikoku は空(駅数は Dia 側の整形で補完される想定)。
    const unknownEntries = collectUnknown(cur.unconsumed());
    const base: Ressya = {
      isNull: true,
      houkou,
      syubetsuIndex: 0,
      ressyabangou: '',
      ressyamei: '',
      gousuu: '',
      bikou: '',
      isCanceled: false,
      ekiJikokuCont: [],
    };
    return unknownEntries === undefined ? base : { ...base, unknownEntries };
  }

  const syubetsuIndex = readInt(cur, 'Syubetsu', 0);
  const ressyabangou = readStr(cur, 'Ressyabangou');
  const ressyamei = readStr(cur, 'Ressyamei');
  const gousuu = readStr(cur, 'Gousuu');

  // EkiJikoku: カンマ連結。iEkiOrder は min(要素数, 駅Order数) まで。
  const opStore = makeOperationStore(cur);
  const ekiJikokuValue = cur.value('EkiJikoku') ?? '';
  const elements = splitEkiJikokuList(ekiJikokuValue);
  // S05 は番線を兄弟キー RessyaTrack= の対応要素から得る(それ以外の世代は無視)。
  const trackElements = profile.readsRessyaTrack
    ? splitEkiJikokuList(cur.value('RessyaTrack') ?? '')
    : [];
  const orderMax = Math.min(elements.length, orderCtx.ekiTrack2Count.length);
  const ekiJikokuCont: EkiJikoku[] = [];
  for (let order = 0; order < orderMax; order++) {
    const el = elements[order] ?? '';
    const trackEl = trackElements[order] ?? '';
    const trackCount = orderCtx.ekiTrack2Count[order] ?? 0;
    const main = orderCtx.mainTrack[order] ?? 0;
    const outerCount = orderCtx.outerTerminalCount[order] ?? 0;
    const decoded: DecodedEkiJikoku = profile.decodeEkiJikokuElement(el, trackEl, trackCount, main);
    const beforeOperationCont = decodeBeforeOperationCont(
      opStore,
      `${String(order)}B`,
      trackCount,
      outerCount,
    );
    const afterOperationCont = decodeAfterOperationCont(
      opStore,
      `${String(order)}A`,
      trackCount,
      outerCount,
    );
    ekiJikokuCont.push({
      ekiatsukai: decoded.ekiatsukai,
      chakuJikoku: decoded.chakuJikoku,
      hatsuJikoku: decoded.hatsuJikoku,
      ressyaTrackIndex: decoded.ekiatsukai === 'none' ? null : decoded.ressyaTrackIndex,
      beforeOperationCont,
      afterOperationCont,
    });
  }

  const bikou = readStr(cur, 'Bikou');
  const isCanceled = readBool(cur, 'Canceled');

  const unknownEntries = collectUnknown(cur.unconsumed());
  const base: Ressya = {
    isNull: false,
    houkou,
    syubetsuIndex,
    ressyabangou,
    ressyamei,
    gousuu,
    bikou,
    isCanceled,
    ekiJikokuCont,
  };
  return unknownEntries === undefined ? base : { ...base, unknownEntries };
}

// ---- Dia(ダイヤ)----

function readDia(dir: PtDirectory, ekiCont: Eki[], profile: ReaderProfile): Dia {
  const cur = new NodeCursor(dir);
  const name = readStr(cur, 'DiaName');
  const mainBackColorIndex = readInt(cur, 'MainBackColorIndex', 0);
  const subBackColorIndex = readInt(cur, 'SubBackColorIndex', 0);
  const backPatternIndex = readInt(cur, 'BackPatternIndex', 0);
  const patternDiagramPreviewEnable = readBool(cur, 'PatternDiagramPreviewEnable');
  const patternDiagramPreviewCycleSecond = readInt(cur, 'PatternDiagramPreviewCycleSecond', 600);

  const kudariCtx = buildEkiOrderContext(ekiCont, RESSYAHOUKOU_KUDARI);
  const noboriCtx = buildEkiOrderContext(ekiCont, RESSYAHOUKOU_NOBORI);

  const midUnknown: UnknownEntry[] = [];
  const kudariList = readRessyaCont(cur, 'Kudari', kudariCtx, midUnknown, profile);
  const noboriList = readRessyaCont(cur, 'Nobori', noboriCtx, midUnknown, profile);

  const directUnknown = collectUnknown(cur.unconsumed()) ?? [];
  const allUnknown = [...directUnknown, ...midUnknown];

  const base: Dia = {
    name,
    mainBackColorIndex,
    subBackColorIndex,
    backPatternIndex,
    patternDiagramPreviewEnable,
    patternDiagramPreviewCycleSecond,
    ressyaCont: [kudariList, noboriList],
  };
  return allUnknown.length === 0 ? base : { ...base, unknownEntries: allUnknown };
}

/** Kudari./Nobori. 中間ディレクトリ内の Ressya. を読む。中間直下の未知は container 付きで蓄積。 */
function readRessyaCont(
  cur: NodeCursor,
  containerName: 'Kudari' | 'Nobori',
  orderCtx: EkiOrderContext,
  midUnknown: UnknownEntry[],
  profile: ReaderProfile,
): Ressya[] {
  const dir = cur.directory(containerName);
  if (dir === undefined) return [];
  const inner = new NodeCursor(dir);
  const list = inner.directories('Ressya').map((rDir) => readRessya(rDir, orderCtx, profile));
  for (const { index, node } of inner.unconsumed()) {
    midUnknown.push(unknownEntryOf(index, node, `${containerName}.`));
  }
  return list;
}

// ---- Rosen(路線)----

/** Rosen. ノードを読む。原典 CentDedRosen_From_OuPropertiesText の読込順に従う。 */
export function readRosen(
  dir: PtDirectory,
  ctx: ReadContext,
  profile: ReaderProfile = CURRENT_PROFILE,
): Rosen {
  const cur = new NodeCursor(dir);

  const rosenmei = readStr(cur, 'Rosenmei');
  const kudariDiaAlias = readStr(cur, 'KudariDiaAlias');
  const noboriDiaAlias = readStr(cur, 'NoboriDiaAlias');

  // Eki[](駅Index 順)。id は読込順に自動採番(§1.4)。
  const ekiCont: Eki[] = cur
    .directories('Eki')
    .map((ekiDir, i) => readEki(ekiDir, i, ctx, profile));

  const ressyasyubetsuCont: Ressyasyubetsu[] = cur
    .directories('Ressyasyubetsu')
    .map((rsDir) => readRessyasyubetsu(rsDir));

  const diaCont: Dia[] = cur.directories('Dia').map((diaDir) => readDia(diaDir, ekiCont, profile));

  const kitenJikoku = readJikokuProp(cur, 'KitenJikoku');
  const diagramDgrYZahyouKyoriDefault = readInt(cur, 'DiagramDgrYZahyouKyoriDefault', 60);

  // EnableOperation: 空 → 0、それ以外は intOf。0|1|2 に丸める。
  const enableOperation = toEnableOperation(readInt(cur, 'EnableOperation', 0));
  const operationNumberReverse = readBool(cur, 'OperationNumberReverse');
  const operationCrossKitenJikoku = readBool(cur, 'OperationCrossKitenJikoku');

  // KijunDiaIndex: 空のとき名前 "基準運転時分" のダイヤを探し、なければ 0(原典)。
  const kijunDiaIndex = readKijunDiaIndex(cur, diaCont);
  const disableHiddenSyubetsu = readBool(cur, 'DisableHiddenSyubetsu');
  const comment = readStr(cur, 'Comment');

  const unknownEntries = collectUnknown(cur.unconsumed());
  const base: Rosen = {
    rosenmei,
    kudariDiaAlias,
    noboriDiaAlias,
    ekiCont,
    ressyasyubetsuCont,
    diaCont,
    kitenJikoku,
    diagramDgrYZahyouKyoriDefault,
    enableOperation,
    operationNumberReverse,
    operationCrossKitenJikoku,
    kijunDiaIndex,
    disableHiddenSyubetsu,
    comment,
  };
  let rosen = unknownEntries === undefined ? base : { ...base, unknownEntries };
  // 旧世代の Rosen 補正(S05: EnableOperation 非空→2)。
  if (profile.fixupRosen !== undefined) rosen = profile.fixupRosen(rosen, cur);
  // 旧世代の全体後処理(S00: Kyoukaisen からの分岐駅推定)。
  if (profile.postProcess !== undefined) rosen = profile.postProcess(rosen);
  return rosen;
}

function toEnableOperation(n: number): 0 | 1 | 2 {
  return n === 1 ? 1 : n === 2 ? 2 : 0;
}

function readKijunDiaIndex(cur: NodeCursor, diaCont: Dia[]): number {
  const v = cur.value('KijunDiaIndex');
  if (v !== undefined && v !== '') {
    const n = Number.parseInt(v, 10);
    return Number.isNaN(n) ? 0 : n;
  }
  const found = diaCont.findIndex((d) => d.name === '基準運転時分');
  return found < 0 ? 0 : found;
}

// ---- DispProp(表示設定)----

/** DispProp. ノードを読む。全キー既定値つき(analysis §03 §5.8)。 */
export function readDispProp(dir: PtDirectory): DispProp {
  const cur = new NodeCursor(dir);
  const def = createDefaultDispProp();

  const jikokuhyouFont = readFontList(cur, 'JikokuhyouFont', def.jikokuhyouFont);
  const jikokuhyouVFont = readFont(cur, 'JikokuhyouVFont', def.jikokuhyouVFont);
  const diaEkimeiFont = readFont(cur, 'DiaEkimeiFont', def.diaEkimeiFont);
  const diaJikokuFont = readFont(cur, 'DiaJikokuFont', def.diaJikokuFont);
  const diaRessyaFont = readFont(cur, 'DiaRessyaFont', def.diaRessyaFont);
  const operationTableFont = readFont(cur, 'OperationTableFont', def.operationTableFont);
  const allOperationTableJikokuFont = readFont(
    cur,
    'AllOperationTableJikokuFont',
    def.allOperationTableJikokuFont,
  );
  const commentFont = readFont(cur, 'CommentFont', def.commentFont);

  const diaMojiColor = readColor(cur, 'DiaMojiColor', def.diaMojiColor);
  const diaBackColor = readColorList(cur, 'DiaBackColor', def.diaBackColor);
  const diaRessyaColor = readColor(cur, 'DiaRessyaColor', def.diaRessyaColor);
  const diaJikuColor = readColor(cur, 'DiaJikuColor', def.diaJikuColor);
  const jikokuhyouBackColor = readColorList(cur, 'JikokuhyouBackColor', def.jikokuhyouBackColor);
  const stdOpeTimeLowerColor = readColor(cur, 'StdOpeTimeLowerColor', def.stdOpeTimeLowerColor);
  const stdOpeTimeHigherColor = readColor(cur, 'StdOpeTimeHigherColor', def.stdOpeTimeHigherColor);
  const stdOpeTimeUndefColor = readColor(cur, 'StdOpeTimeUndefColor', def.stdOpeTimeUndefColor);
  const stdOpeTimeIllegalColor = readColor(
    cur,
    'StdOpeTimeIllegalColor',
    def.stdOpeTimeIllegalColor,
  );
  const operationStringColor = readColor(cur, 'OperationStringColor', def.operationStringColor);
  const operationGridColor = readColor(cur, 'OperationGridColor', def.operationGridColor);

  const ekimeiLength = readInt(cur, 'EkimeiLength', def.ekimeiLength);
  const jikokuhyouRessyaWidth = readInt(cur, 'JikokuhyouRessyaWidth', def.jikokuhyouRessyaWidth);
  const anySecondIncDec1 = readInt(cur, 'AnySecondIncDec1', def.anySecondIncDec1);
  const anySecondIncDec2 = readInt(cur, 'AnySecondIncDec2', def.anySecondIncDec2);

  // DisplayRessyamei: 既定 true。"0" のときのみ false(原典)。
  const displayRessyameiRaw = cur.value('DisplayRessyamei');
  const displayRessyamei = displayRessyameiRaw !== '0';

  const displayOuterTerminalEkimeiOriginSide = readBool(
    cur,
    'DisplayOuterTerminalEkimeiOriginSide',
  );
  const displayOuterTerminalEkimeiTerminalSide = readBool(
    cur,
    'DisplayOuterTerminalEkimeiTerminalSide',
  );
  const diagramDisplayOuterTerminal = readInt(cur, 'DiagramDisplayOuterTerminal', 0);
  const secondRoundChaku = toSecondRound(readInt(cur, 'SecondRoundChaku', 0));
  const secondRoundHatsu = toSecondRound(readInt(cur, 'SecondRoundHatsu', 0));
  const display2400 = readBool(cur, 'Display2400');
  const operationNumberRows = readInt(cur, 'OperationNumberRows', def.operationNumberRows);
  const displayInOutLinkCode = readBool(cur, 'DisplayInOutLinkCode');

  const unknownEntries = collectUnknown(cur.unconsumed());
  const base: DispProp = {
    jikokuhyouFont,
    jikokuhyouVFont,
    diaEkimeiFont,
    diaJikokuFont,
    diaRessyaFont,
    operationTableFont,
    allOperationTableJikokuFont,
    commentFont,
    diaMojiColor,
    diaBackColor,
    diaRessyaColor,
    diaJikuColor,
    jikokuhyouBackColor,
    stdOpeTimeLowerColor,
    stdOpeTimeHigherColor,
    stdOpeTimeUndefColor,
    stdOpeTimeIllegalColor,
    operationStringColor,
    operationGridColor,
    ekimeiLength,
    jikokuhyouRessyaWidth,
    anySecondIncDec1,
    anySecondIncDec2,
    displayRessyamei,
    displayOuterTerminalEkimeiOriginSide,
    displayOuterTerminalEkimeiTerminalSide,
    diagramDisplayOuterTerminal,
    secondRoundChaku,
    secondRoundHatsu,
    display2400,
    operationNumberRows,
    displayInOutLinkCode,
  };
  return unknownEntries === undefined ? base : { ...base, unknownEntries };
}

function toSecondRound(n: number): 0 | 1 | 2 {
  return n === 1 ? 1 : n === 2 ? 2 : 0;
}

/**
 * 同名フォント複数値(JikokuhyouFont×8)。存在した要素だけ既定を上書きし、
 * 既定長(8)を保つ。空値要素は既定のまま。
 */
function readFontList(cur: NodeCursor, name: string, def: FontProp[]): FontProp[] {
  const values = cur.values(name);
  const out = def.slice();
  for (const [i, v] of values.entries()) {
    const fallback = def[i] ?? out[i];
    if (i < out.length && fallback !== undefined) {
      out[i] = v === '' ? fallback : decodeFont(v);
    }
  }
  return out;
}

/** 色の複数値(DiaBackColor×5 / JikokuhyouBackColor×4)。存在数だけ既定を上書き。 */
function readColorList(cur: NodeCursor, name: string, def: Colorref[]): Colorref[] {
  const values = cur.values(name);
  const out = def.slice();
  for (const [i, v] of values.entries()) {
    const fallback = def[i] ?? COLOR_WHITE;
    if (i < out.length && v !== '') {
      out[i] = decodeColor(v, fallback);
    }
  }
  return out;
}
