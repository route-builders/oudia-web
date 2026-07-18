// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 up-tri
//
// Based on OuDiaSecond (Copyright (C) 2017-2026 diagram_mania)
// and OuDia (Copyright (C) 2006-2017 take-okm)

/**
 * 現行世代ライター(RosenFileData → ノードツリー)。reader/current.ts の逆写像。
 * 原典 CconvCentDed::CentDed*_To_OuPropertiesText ほかの忠実移植(file-io §4)。
 *
 * 不変条件: 各エンティティの既知キーを**原典の書き出し順(= オンディスク順)**で push し、
 * 最後に unknownEntries を記録 index 位置へ差し戻す(NodeBuilder)。書き出す/省略するの
 * 判断は「キーが在る/無い」の厳密な逆でなければならない。値エンコードは既存の encode*
 * スキャナを再利用する。
 *
 * 空文字列 vs 省略の区別が T1 の最大の失敗要因。原典が「値が空でも常に出力」するキーは
 * 空でも行を出し、「既定/false のとき省略」するキーは省略する(下記各コメント参照)。
 */

import type { UnknownEntry } from '../model/basic.js';
import { RESSYAHOUKOU_KUDARI } from '../model/basic.js';
import type {
  CrossingCheckRule,
  Dia,
  DispProp,
  Eki,
  EkiJikoku,
  EkiTrack2,
  OuterTerminal,
  Ressya,
  Ressyasyubetsu,
  Rosen,
  TrackContent,
} from '../model/entities.js';
import type { PtDirectory } from '../node/types.js';
import {
  encodeJikokuDisplay,
  encodeOuterDisplay,
  encodeSyubetsuChangeDisplay,
  encodeTrackOmit,
} from '../reader/composite.js';
import {
  DIAGRAM_RESSYAJOUHOU_TO_FILE,
  EKIJIKOKUKEISIKI_TO_FILE,
  EKIKIBO_TO_FILE,
  SENSTYLE_TO_FILE,
  STOPMARK_TO_FILE,
  TRACKTYPE_TO_CODE,
} from '../reader/enumMaps.js';
import { encodeColor } from '../value/color.js';
import type { DecodedEkiJikoku } from '../value/ekiJikoku.js';
import { encodeEkiJikoku } from '../value/ekiJikoku.js';
import { encodeFont } from '../value/font.js';
import { encodeJikoku } from '../value/jikoku.js';
import { encodeInt } from '../value/number.js';
import { encodeAfterOperationCont, encodeBeforeOperationCont } from '../value/operation.js';
import { NodeBuilder, partitionUnknownByContainer } from './builder.js';

/** 書き出し不変条件違反(空必須フィールド等。原典は負コードで abort)。到達したらバグ。 */
export class WriteError extends Error {
  constructor(
    readonly code: number,
    message: string,
  ) {
    super(`WriteError(${String(code)}): ${message}`);
    this.name = 'WriteError';
  }
}

const bool1 = (b: boolean): string => (b ? '1' : '0');

// ---- TrackContent(平面交差)----

/** TrackContent[] → "type$index" を `;` 連結。空は ''(区切りなし)。 */
function encodeTrackContentCont(cont: TrackContent[]): string {
  return cont
    .map((tc) => `${String(TRACKTYPE_TO_CODE[tc.trackType])}$${String(tc.index)}`)
    .join(';');
}

// ---- EkiTrack2 / OuterTerminal / CrossingCheckRule ----

function writeEkiTrack2(track: EkiTrack2): PtDirectory {
  if (track.trackName === '') {
    throw new WriteError(-11, 'TrackName が空です');
  }
  if (track.trackRyakusyou === '') {
    throw new WriteError(-21, 'TrackRyakusyou が空です');
  }
  const b = new NodeBuilder();
  b.prop('TrackName', track.trackName);
  b.prop('TrackRyakusyou', track.trackRyakusyou);
  if (track.trackNoboriRyakusyou !== '') b.prop('TrackNoboriRyakusyou', track.trackNoboriRyakusyou);
  return b.buildDir('EkiTrack2', track.unknownEntries);
}

function writeOuterTerminal(ot: OuterTerminal): PtDirectory {
  const b = new NodeBuilder();
  b.prop('OuterTerminalEkimei', ot.ekimei); // 常に出力
  if (ot.jikokuRyaku !== '') b.prop('OuterTerminalJikokuRyaku', ot.jikokuRyaku);
  if (ot.diaRyaku !== '') b.prop('OuterTerminalDiaRyaku', ot.diaRyaku);
  return b.buildDir('OuterTerminal', ot.unknownEntries);
}

function writeCrossingCheckRule(rule: CrossingCheckRule): PtDirectory {
  if (rule.caption === '') {
    throw new WriteError(-1, 'CrossingCheckRule.Caption が空です');
  }
  const b = new NodeBuilder();
  b.prop('Caption', rule.caption);
  b.prop('Enable', bool1(rule.enable));
  b.prop('HeadwaySecond', encodeInt(rule.headwaySecond));
  b.prop('HeadwaySecondMinimum', encodeInt(rule.headwaySecondMinimum));
  b.prop('BeforeFromTrackContentCont', encodeTrackContentCont(rule.beforeFromTrackContentCont));
  b.prop('BeforeToTrackContentCont', encodeTrackContentCont(rule.beforeToTrackContentCont));
  b.prop('BeforeIsArrival', bool1(rule.beforeIsArrival));
  b.prop('BeforeIsTsuuka', bool1(rule.beforeIsTsuuka));
  b.prop('AfterFromTrackContentCont', encodeTrackContentCont(rule.afterFromTrackContentCont));
  b.prop('AfterToTrackContentCont', encodeTrackContentCont(rule.afterToTrackContentCont));
  b.prop('AfterIsArrival', bool1(rule.afterIsArrival));
  b.prop('AfterIsTsuuka', bool1(rule.afterIsTsuuka));
  return b.buildDir('CrossingCheckRule', rule.unknownEntries);
}

// ---- Eki(駅)----

/** Eki. ノードを書く。物理書き出し順(原典 CentDedEki_To の setValue/insert 順)。 */
function writeEki(eki: Eki): PtDirectory {
  const b = new NodeBuilder();

  b.prop('Ekimei', eki.ekimei); // 1. 常に
  if (eki.ekimeiJikokuRyaku !== '') b.prop('EkimeiJikokuRyaku', eki.ekimeiJikokuRyaku);
  if (eki.ekimeiDiaRyaku !== '') b.prop('EkimeiDiaRyaku', eki.ekimeiDiaRyaku);
  b.prop('Ekijikokukeisiki', EKIJIKOKUKEISIKI_TO_FILE[eki.ekijikokukeisiki]); // 常に
  b.prop('Ekikibo', EKIKIBO_TO_FILE[eki.ekikibo]); // 常に

  // DiagramRessyajouhouHyouji: TO_FILE が null('origin')のときは省略。
  const drhK = DIAGRAM_RESSYAJOUHOU_TO_FILE[eki.diagramRessyajouhouHyoujiKudari];
  if (drhK !== null) b.prop('DiagramRessyajouhouHyoujiKudari', drhK);
  const drhN = DIAGRAM_RESSYAJOUHOU_TO_FILE[eki.diagramRessyajouhouHyoujiNobori];
  if (drhN !== null) b.prop('DiagramRessyajouhouHyoujiNobori', drhN);

  b.prop('DownMain', encodeInt(eki.downMain)); // 常に(零番線補正なし)
  b.prop('UpMain', encodeInt(eki.upMain));

  // Brunch/Loop: index が非 null(>=0)のときのみ。opposite は true のときのみ。
  if (eki.brunchCoreEkiIndex !== null && eki.brunchCoreEkiIndex >= 0) {
    b.prop('BrunchCoreEkiIndex', encodeInt(eki.brunchCoreEkiIndex));
    if (eki.brunchOpposite) b.prop('BrunchOpposite', '1');
  }
  if (eki.loopOriginEkiIndex !== null && eki.loopOriginEkiIndex >= 0) {
    b.prop('LoopOriginEkiIndex', encodeInt(eki.loopOriginEkiIndex));
    if (eki.loopOpposite) b.prop('LoopOpposite', '1');
  }

  if (eki.jikokuhyouTrackDisplayKudari) b.prop('JikokuhyouTrackDisplayKudari', '1');
  if (eki.jikokuhyouTrackDisplayNobori) b.prop('JikokuhyouTrackDisplayNobori', '1');
  if (eki.diagramTrackDisplay) b.prop('DiagramTrackDisplay', '1');

  // DiagramTrackOmit: 常に。番線数と同数(不足なら false 埋め)。EkiTrack2Cont の前。
  b.prop('DiagramTrackOmit', encodeTrackOmit(normalizeTrackOmit(eki)));

  // EkiTrack2Cont.: 常にディレクトリを出力(番線 0 でも)。中間直下未知を差し戻す。
  const { direct: ekiDirect, byContainer } = partitionUnknownByContainer(eki.unknownEntries);
  const track2Unknown = byContainer.get('EkiTrack2Cont.');
  const track2Builder = new NodeBuilder();
  for (const t2 of eki.ekiTrack2Cont) track2Builder.node(writeEkiTrack2(t2));
  b.node(track2Builder.buildDir('EkiTrack2Cont', track2Unknown));

  // OuterTerminal.(要素ごと 1 ディレクトリ)
  for (const ot of eki.outerTerminalCont) b.node(writeOuterTerminal(ot));

  if (eki.nextEkiDistance > 0) b.prop('NextEkiDistance', encodeInt(eki.nextEkiDistance));
  if (eki.jikokuhyouTrackOmit) b.prop('JikokuhyouTrackOmit', '1');

  if (eki.jikokuhyouOperationOrigin > 0) {
    b.prop('JikokuhyouOperationOrigin', encodeInt(eki.jikokuhyouOperationOrigin));
  }
  if (eki.jikokuhyouOperationTerminal > 0) {
    b.prop('JikokuhyouOperationTerminal', encodeInt(eki.jikokuhyouOperationTerminal));
  }
  if (eki.jikokuhyouOperationOriginDownBeforeUpAfter) {
    b.prop('JikokuhyouOperationOriginDownBeforeUpAfter', '1');
  }
  if (eki.jikokuhyouOperationOriginDownAfterUpBefore) {
    b.prop('JikokuhyouOperationOriginDownAfterUpBefore', '1');
  }
  if (eki.jikokuhyouOperationTerminalDownBeforeUpAfter) {
    b.prop('JikokuhyouOperationTerminalDownBeforeUpAfter', '1');
  }
  if (eki.jikokuhyouOperationTerminalDownAfterUpBefore) {
    b.prop('JikokuhyouOperationTerminalDownAfterUpBefore', '1');
  }

  b.prop('JikokuhyouJikokuDisplayKudari', encodeJikokuDisplay(eki.jikokuhyouJikokuDisplayKudari));
  b.prop('JikokuhyouJikokuDisplayNobori', encodeJikokuDisplay(eki.jikokuhyouJikokuDisplayNobori));
  b.prop(
    'JikokuhyouSyubetsuChangeDisplayKudari',
    encodeSyubetsuChangeDisplay(eki.jikokuhyouSyubetsuChangeDisplayKudari),
  );
  b.prop(
    'JikokuhyouSyubetsuChangeDisplayNobori',
    encodeSyubetsuChangeDisplay(eki.jikokuhyouSyubetsuChangeDisplayNobori),
  );

  b.prop('DiagramColorNextEki', encodeInt(eki.diagramColorNextEki)); // 常に
  if (eki.operationTableDisplayJikoku) b.prop('OperationTableDisplayJikoku', '1');

  b.prop('JikokuhyouOuterDisplayKudari', encodeOuterDisplay(eki.jikokuhyouOuterDisplayKudari));
  b.prop('JikokuhyouOuterDisplayNobori', encodeOuterDisplay(eki.jikokuhyouOuterDisplayNobori));
  b.prop(
    'JikokuhyouPrevSyubetsuChangeDisplayKudari',
    encodeSyubetsuChangeDisplay(eki.jikokuhyouPrevSyubetsuChangeDisplayKudari),
  );
  b.prop(
    'JikokuhyouPrevSyubetsuChangeDisplayNobori',
    encodeSyubetsuChangeDisplay(eki.jikokuhyouPrevSyubetsuChangeDisplayNobori),
  );

  if (eki.jikokuhyouNyuusenJikokuDisplayKudari) b.prop('JikokuhyouNyuusenJikokuDisplayKudari', '1');
  if (eki.jikokuhyouNyuusenJikokuDisplayNobori) b.prop('JikokuhyouNyuusenJikokuDisplayNobori', '1');

  // CrossingCheckRule.: 物理的に最後。
  for (const rule of eki.crossingCheckRuleCont) b.node(writeCrossingCheckRule(rule));

  return b.buildDir('Eki', ekiDirect);
}

/** DiagramTrackOmit を番線数に合わせる(不足 false 埋め・超過切詰め)。 */
function normalizeTrackOmit(eki: Eki): boolean[] {
  const n = eki.ekiTrack2Cont.length;
  const out: boolean[] = [];
  for (let i = 0; i < n; i++) out.push(eki.diagramTrackOmit[i] ?? false);
  return out;
}

// ---- Ressyasyubetsu(列車種別)----

function writeRessyasyubetsu(rs: Ressyasyubetsu): PtDirectory {
  if (rs.syubetsumei === '') {
    throw new WriteError(-11, 'Syubetsumei が空です');
  }
  const b = new NodeBuilder();
  b.prop('Syubetsumei', rs.syubetsumei); // 常に
  if (rs.ryakusyou !== '') b.prop('Ryakusyou', rs.ryakusyou);
  b.prop('JikokuhyouMojiColor', encodeColor(rs.jikokuhyouMojiColor)); // 常に
  b.prop('JikokuhyouFontIndex', encodeInt(rs.jikokuhyouFontIndex)); // 常に(0 でも)
  b.prop('JikokuhyouBackColor', encodeColor(rs.jikokuhyouBackColor)); // 常に
  b.prop('DiagramSenColor', encodeColor(rs.diagramLineStyle.senColor)); // 常に
  b.prop('DiagramSenStyle', SENSTYLE_TO_FILE[rs.diagramLineStyle.senStyle]); // 常に
  if (rs.diagramLineStyle.isBold) b.prop('DiagramSenIsBold', '1');
  b.prop('StopMarkDrawType', STOPMARK_TO_FILE[rs.stopMarkDrawType]); // 常に
  if (rs.parentSyubetsuIndex !== null && rs.parentSyubetsuIndex >= 0) {
    b.prop('ParentSyubetsuIndex', encodeInt(rs.parentSyubetsuIndex));
  }
  if (rs.hidden) b.prop('Hidden', '1');
  return b.buildDir('Ressyasyubetsu', rs.unknownEntries);
}

// ---- Dia / Ressya / EkiJikoku / Operation ----

/** ekiJikokuCont の終着駅Order(末尾から最初に ekiatsukai!=='none' の index。無ければ -1)。 */
function syuuchakuEkiOrder(cont: EkiJikoku[]): number {
  for (let i = cont.length - 1; i >= 0; i--) {
    if (cont[i]?.ekiatsukai !== 'none') return i;
  }
  return -1;
}

/** EkiJikoku 1 要素 → DecodedEkiJikoku(encodeEkiJikoku 用。none は track 無視)。 */
function toDecodedEkiJikoku(ej: EkiJikoku): DecodedEkiJikoku {
  return {
    ekiatsukai: ej.ekiatsukai,
    chakuJikoku: ej.chakuJikoku,
    hatsuJikoku: ej.hatsuJikoku,
    // none 以外は number 不変(reader が null を入れるのは none のみ)。安全側で 0。
    ressyaTrackIndex: ej.ressyaTrackIndex ?? 0,
  };
}

function writeRessya(ressya: Ressya): PtDirectory {
  const b = new NodeBuilder();
  if (ressya.isNull) {
    // 記述なし列車 = 空ディレクトリ(キーを一切出さない)。
    return b.buildDir('Ressya', ressya.unknownEntries);
  }

  b.prop('Houkou', ressya.houkou === RESSYAHOUKOU_KUDARI ? 'Kudari' : 'Nobori');
  b.prop('Syubetsu', encodeInt(ressya.syubetsuIndex)); // 常に(0 でも)
  if (ressya.ressyabangou !== '') b.prop('Ressyabangou', ressya.ressyabangou);
  if (ressya.ressyamei !== '') b.prop('Ressyamei', ressya.ressyamei);
  if (ressya.gousuu !== '') b.prop('Gousuu', ressya.gousuu);

  // EkiJikoku: 終着駅Order まで(含む)を encode してカンマ連結。-1 なら空値。常に出力。
  const syuuchaku = syuuchakuEkiOrder(ressya.ekiJikokuCont);
  const elements: string[] = [];
  for (let order = 0; order <= syuuchaku; order++) {
    const ej = ressya.ekiJikokuCont[order];
    elements.push(ej === undefined ? '' : encodeEkiJikoku(toDecodedEkiJikoku(ej)));
  }
  b.prop('EkiJikoku', elements.join(','));

  // Operation キー: 同じ終着 index までを走査。各駅で B ブロック → A ブロック。
  for (let order = 0; order <= syuuchaku; order++) {
    const ej = ressya.ekiJikokuCont[order];
    if (ej === undefined) continue;
    if (ej.beforeOperationCont.length > 0) {
      for (const entry of encodeBeforeOperationCont(ej.beforeOperationCont, `${String(order)}B`)) {
        b.prop(`Operation${entry.path}`, entry.value);
      }
    }
    if (ej.afterOperationCont.length > 0) {
      for (const entry of encodeAfterOperationCont(ej.afterOperationCont, `${String(order)}A`)) {
        b.prop(`Operation${entry.path}`, entry.value);
      }
    }
  }

  if (ressya.bikou !== '') b.prop('Bikou', ressya.bikou);
  if (ressya.isCanceled) b.prop('Canceled', '1');

  return b.buildDir('Ressya', ressya.unknownEntries);
}

function writeDia(dia: Dia): PtDirectory {
  const b = new NodeBuilder();
  b.prop('DiaName', dia.name); // 常に(空でも)
  b.prop('MainBackColorIndex', encodeInt(dia.mainBackColorIndex));
  b.prop('SubBackColorIndex', encodeInt(dia.subBackColorIndex));
  b.prop('BackPatternIndex', encodeInt(dia.backPatternIndex));
  if (dia.patternDiagramPreviewEnable) b.prop('PatternDiagramPreviewEnable', '1');
  b.prop('PatternDiagramPreviewCycleSecond', encodeInt(dia.patternDiagramPreviewCycleSecond)); // 常に

  // Kudari. / Nobori.(常に両方)。中間ディレクトリ直下の未知を差し戻す。
  const { direct: diaDirect, byContainer } = partitionUnknownByContainer(dia.unknownEntries);
  b.node(writeRessyaCont('Kudari', dia.ressyaCont[0], byContainer.get('Kudari.')));
  b.node(writeRessyaCont('Nobori', dia.ressyaCont[1], byContainer.get('Nobori.')));

  return b.buildDir('Dia', diaDirect);
}

function writeRessyaCont(
  name: 'Kudari' | 'Nobori',
  list: Ressya[],
  containerUnknown: UnknownEntry[] | undefined,
): PtDirectory {
  const b = new NodeBuilder();
  for (const ressya of list) b.node(writeRessya(ressya));
  return b.buildDir(name, containerUnknown);
}

// ---- DispProp(表示設定)----

/** 多値フォント/色を既定長に合わせて出力(不足分は既定で埋める)。 */
function padArray<T>(arr: readonly T[], count: number, fill: T): T[] {
  const out: T[] = [];
  for (let i = 0; i < count; i++) out.push(arr[i] ?? fill);
  return out;
}

/** DispProp. ノードを書く。全 32 キー無条件・原典の物理順。 */
export function writeDispProp(dp: DispProp): PtDirectory {
  const b = new NodeBuilder();

  // JikokuhyouFont ×8
  const fallbackFont = dp.jikokuhyouFont[0];
  for (const font of padArray(dp.jikokuhyouFont, 8, fallbackFont ?? dp.jikokuhyouVFont)) {
    b.prop('JikokuhyouFont', encodeFont(font));
  }
  b.prop('JikokuhyouVFont', encodeFont(dp.jikokuhyouVFont));
  b.prop('DiaEkimeiFont', encodeFont(dp.diaEkimeiFont));
  b.prop('DiaJikokuFont', encodeFont(dp.diaJikokuFont));
  b.prop('DiaRessyaFont', encodeFont(dp.diaRessyaFont));
  b.prop('OperationTableFont', encodeFont(dp.operationTableFont));
  b.prop('AllOperationTableJikokuFont', encodeFont(dp.allOperationTableJikokuFont));
  b.prop('CommentFont', encodeFont(dp.commentFont));

  b.prop('DiaMojiColor', encodeColor(dp.diaMojiColor));
  const whiteFallback = dp.diaBackColor[0] ?? dp.diaMojiColor;
  for (const c of padArray(dp.diaBackColor, 5, whiteFallback))
    b.prop('DiaBackColor', encodeColor(c));
  b.prop('DiaRessyaColor', encodeColor(dp.diaRessyaColor));
  b.prop('DiaJikuColor', encodeColor(dp.diaJikuColor));
  const jbFallback = dp.jikokuhyouBackColor[0] ?? dp.diaMojiColor;
  for (const c of padArray(dp.jikokuhyouBackColor, 4, jbFallback)) {
    b.prop('JikokuhyouBackColor', encodeColor(c));
  }
  b.prop('StdOpeTimeLowerColor', encodeColor(dp.stdOpeTimeLowerColor));
  b.prop('StdOpeTimeHigherColor', encodeColor(dp.stdOpeTimeHigherColor));
  b.prop('StdOpeTimeUndefColor', encodeColor(dp.stdOpeTimeUndefColor));
  b.prop('StdOpeTimeIllegalColor', encodeColor(dp.stdOpeTimeIllegalColor));
  b.prop('OperationStringColor', encodeColor(dp.operationStringColor));
  b.prop('OperationGridColor', encodeColor(dp.operationGridColor));

  b.prop('EkimeiLength', encodeInt(dp.ekimeiLength));
  b.prop('JikokuhyouRessyaWidth', encodeInt(dp.jikokuhyouRessyaWidth));
  b.prop('AnySecondIncDec1', encodeInt(dp.anySecondIncDec1));
  b.prop('AnySecondIncDec2', encodeInt(dp.anySecondIncDec2));
  b.prop('DisplayRessyamei', bool1(dp.displayRessyamei));
  b.prop('DisplayOuterTerminalEkimeiOriginSide', bool1(dp.displayOuterTerminalEkimeiOriginSide));
  b.prop(
    'DisplayOuterTerminalEkimeiTerminalSide',
    bool1(dp.displayOuterTerminalEkimeiTerminalSide),
  );
  b.prop('DiagramDisplayOuterTerminal', encodeInt(dp.diagramDisplayOuterTerminal)); // int
  b.prop('SecondRoundChaku', encodeInt(dp.secondRoundChaku));
  b.prop('SecondRoundHatsu', encodeInt(dp.secondRoundHatsu));
  b.prop('Display2400', bool1(dp.display2400));
  b.prop('OperationNumberRows', encodeInt(dp.operationNumberRows));
  b.prop('DisplayInOutLinkCode', bool1(dp.displayInOutLinkCode));

  return b.buildDir('DispProp', dp.unknownEntries);
}

// ---- Rosen(路線)----

/** Rosen. ノードを書く。原典 CentDedRosen_To の setValue/insert 順。 */
export function writeRosen(rosen: Rosen): PtDirectory {
  const b = new NodeBuilder();

  b.prop('Rosenmei', rosen.rosenmei); // 常に(空でも)
  b.prop('KudariDiaAlias', rosen.kudariDiaAlias); // 常に
  b.prop('NoboriDiaAlias', rosen.noboriDiaAlias); // 常に

  // 路線構造(エイリアスと KitenJikoku の間に挟まる)
  for (const eki of rosen.ekiCont) b.node(writeEki(eki));
  for (const rs of rosen.ressyasyubetsuCont) b.node(writeRessyasyubetsu(rs));
  for (const dia of rosen.diaCont) b.node(writeDia(dia));

  b.prop('KitenJikoku', encodeJikoku(rosen.kitenJikoku)); // 常に(null → 'KitenJikoku=')
  b.prop('DiagramDgrYZahyouKyoriDefault', encodeInt(rosen.diagramDgrYZahyouKyoriDefault)); // 常に
  if (rosen.enableOperation > 0) b.prop('EnableOperation', encodeInt(rosen.enableOperation));
  if (rosen.operationNumberReverse) b.prop('OperationNumberReverse', '1');
  if (rosen.operationCrossKitenJikoku) b.prop('OperationCrossKitenJikoku', '1');
  b.prop('KijunDiaIndex', encodeInt(rosen.kijunDiaIndex)); // 常に(明示)
  if (rosen.disableHiddenSyubetsu) b.prop('DisableHiddenSyubetsu', '1');
  b.prop('Comment', rosen.comment); // 常に(空でも)。エスケープは serialize 側。

  return b.buildDir('Rosen', rosen.unknownEntries);
}
