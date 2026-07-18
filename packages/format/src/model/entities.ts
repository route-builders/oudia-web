// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 up-tri
//
// Based on OuDiaSecond (Copyright (C) 2017-2026 diagram_mania)
// and OuDia (Copyright (C) 2006-2017 take-okm)

/**
 * ファイル同型モデルのエンティティ型。data-model §2.3–§2.6, §2.9。
 * フィールドコメントに原典 C++ フィールド名 / ファイルキーを併記する。
 */

import type { Colorref, FontProp, Jikoku, Ressyahoukou, UnknownEntry } from './basic.js';
import type {
  DiagramRessyajouhouHyouji,
  Ekiatsukai,
  Ekijikokukeisiki,
  Ekikibo,
  SecondRound,
  SenStyle,
  StopMarkDrawType,
  TrackType,
} from './enums.js';
import type { AfterOperation, BeforeOperation } from './operation.js';

// ---- Rosen(路線)----

/** 路線(原典 CentDedRosen)。 */
export interface Rosen {
  rosenmei: string; // m_strName / キー Rosenmei
  kudariDiaAlias: string; // m_strKudariDiaAlias(空 = 「下り」)
  noboriDiaAlias: string; // m_strNoboriDiaAlias(空 = 「上り」)
  ekiCont: Eki[]; // m_CentDedEkiCont。添字 = 駅Index(下り始発 = 0)
  ressyasyubetsuCont: Ressyasyubetsu[]; // m_CentDedRessyasyubetsuCont。1 要素以上
  diaCont: Dia[]; // m_CentDedDiaCont。name が路線内一意
  /**
   * ダイヤグラム起点時刻(m_jikokuKitenJikoku)。空 KitenJikoku= は null のまま往復し、
   * compareJikoku 等では null を 0(00:00:00)相当として扱う(data-model §2.3 / I5)。
   */
  kitenJikoku: Jikoku;
  diagramDgrYZahyouKyoriDefault: number; // m_iDiagramDgrYZahyouKyoriDefault(既定 60、秒)
  enableOperation: 0 | 1 | 2; // m_iEnableOperation(0=無効/1=簡易/2=通常)
  operationNumberReverse: boolean; // m_bOperationNumberReverse
  /** m_bOperationCrossKitenJikoku。読込は ==="1" 判定のためキー省略時 false(§2.3)。 */
  operationCrossKitenJikoku: boolean;
  kijunDiaIndex: number; // m_iKijunDiaIndex(diaCont への index。既定 0)
  disableHiddenSyubetsu: boolean; // m_bDisableHiddenSyubetsu
  comment: string; // m_strComment(複数行可。ファイルでは \n エスケープ)
  unknownEntries?: UnknownEntry[];
}

// ---- Eki(駅)と付随構造 ----

/** 着/発時刻表示("着,発" の 2 値。既定 両方 true)。 */
export interface JikokuDisplay {
  chaku: boolean;
  hatsu: boolean;
}

/** 種別変更/次列車・前列車情報欄の表示設定("a,b,c,d,e" の 5 値。既定 0,0,0,0,1)。 */
export interface SyubetsuChangeDisplay {
  ressyabangou: 0 | 1 | 2 | 3; // a: 列車番号
  operationNumber: 0 | 1 | 2 | 3 | 4; // b: 運用番号
  syubetsu: 0 | 1 | 2 | 3; // c: 列車種別
  ressyamei: 0 | 1 | 2 | 3; // d: 列車名
  operationNumberRows: 1 | 2 | 3 | 4 | 5; // e: 運用番号段数
}

/** 路線外始発/終着欄表示("始発,終着" の 2 値。既定 0,0)。 */
export interface OuterDisplay {
  origin: boolean;
  terminal: boolean;
}

/** 番線(原典 CentDedEkiTrack2)。 */
export interface EkiTrack2 {
  trackName: string; // m_strTrackName(空文字列 = isNull)
  trackRyakusyou: string; // m_strTrackRyakusyou(略称。共通または下り用)
  trackNoboriRyakusyou: string; // m_strTrackNoboriRyakusyou(空 = 共通略称を使用)
  unknownEntries?: UnknownEntry[]; // EkiTrack2. ノード直下の未知キー
}

/** 路線外発着駅(原典 CentDedEki.h の OuterTerminal 構造体)。 */
export interface OuterTerminal {
  ekimei: string; // OuterTerminalEkimei
  jikokuRyaku: string; // OuterTerminalJikokuRyaku(空 = 頭文字)
  diaRyaku: string; // OuterTerminalDiaRyaku
  unknownEntries?: UnknownEntry[]; // OuterTerminal. ノード直下の未知キー
}

/** 交差チェックの番線指定(原典 TrackContent)。 */
export interface TrackContent {
  trackType: TrackType; // eTrackType
  index: number; // iTrackIndex(意味は trackType 依存 — §5.7)
}

/** 平面交差支障チェックルール(原典 CrossingCheckRule。1.11〜)。 */
export interface CrossingCheckRule {
  caption: string; // strCaption(必須・空不可)
  enable: boolean; // bEnable(ファイル省略時 true)
  headwaySecond: number; // iHeadwaySecond(時隔上限秒。既定 60。これ未満で支障)
  headwaySecondMinimum: number; // iHeadwaySecondMinimum(下限秒。1.13〜。既定 0)
  beforeFromTrackContentCont: TrackContent[]; // BeforeFromTrackContentCont(";" 連結)
  beforeToTrackContentCont: TrackContent[];
  afterFromTrackContentCont: TrackContent[];
  afterToTrackContentCont: TrackContent[];
  beforeIsArrival: boolean; // bBeforeIsArrival(着基準か)
  beforeIsTsuuka: boolean; // bBeforeIsTsuuka(通過対象か)
  afterIsArrival: boolean;
  afterIsTsuuka: boolean;
  unknownEntries?: UnknownEntry[]; // CrossingCheckRule. ノード直下の未知キー
}

/** 駅(原典 CentDedEki)。 */
export interface Eki {
  /** 駅 ID(m_iID)。同名駅の区別用。ファイル非出力。読込・挿入時に自動採番(§1.4)。 */
  id: number;
  ekimei: string; // m_strEkimei
  ekimeiJikokuRyaku: string; // キー EkimeiJikokuRyaku(空 = 駅名を使用)
  ekimeiDiaRyaku: string; // キー EkimeiDiaRyaku
  ekijikokukeisiki: Ekijikokukeisiki; // m_eEkijikokukeisiki
  ekikibo: Ekikibo; // m_eEkikibo
  diagramRessyajouhouHyoujiKudari: DiagramRessyajouhouHyouji;
  diagramRessyajouhouHyoujiNobori: DiagramRessyajouhouHyouji;
  downMain: number; // m_iDownMain(下り主本線。ekiTrack2Cont への index)
  upMain: number; // m_iUpMain(上り主本線)
  ekiTrack2Cont: EkiTrack2[]; // m_CentDedEkiTrack2Cont(既定 2 番線)
  brunchCoreEkiIndex: number | null; // m_iBrunchCoreEkiIndex(-1 → null)
  brunchOpposite: boolean; // m_bBrunchOpposite
  loopOriginEkiIndex: number | null; // m_iLoopOriginEkiIndex(-1 → null)
  loopOpposite: boolean; // m_bLoopOpposite
  outerTerminalCont: OuterTerminal[]; // m_OuterTerminalCont
  nextEkiDistance: number; // m_iNextEkiDistance(秒。0 = 路線既定を使用)
  crossingCheckRuleCont: CrossingCheckRule[]; // m_CrossingCheckRuleCont

  // ---- 時刻表・ダイヤグラム表示設定 ----
  jikokuhyouTrackDisplayKudari: boolean; // m_bJikokuhyouTrackDisplayKudari(発番線表示)
  jikokuhyouTrackDisplayNobori: boolean;
  diagramTrackDisplay: boolean; // m_bDiagramTrackDisplay(在線表表示)
  diagramTrackOmit: boolean[]; // m_bDiagramTrackOmit(番線数と同数)
  jikokuhyouTrackOmit: boolean; // m_bJikokuhyouTrackOmit(番線編集モードの欄省略)
  jikokuhyouOperationOrigin: 0 | 1 | 2 | 3; // m_iJikokuhyouOperationOrigin(始発側作業欄数)
  jikokuhyouOperationTerminal: 0 | 1 | 2 | 3; // m_iJikokuhyouOperationTerminal(終着側)
  jikokuhyouOperationOriginDownBeforeUpAfter: boolean;
  jikokuhyouOperationOriginDownAfterUpBefore: boolean;
  jikokuhyouOperationTerminalDownBeforeUpAfter: boolean;
  jikokuhyouOperationTerminalDownAfterUpBefore: boolean;
  jikokuhyouJikokuDisplayKudari: JikokuDisplay; // キー JikokuhyouJikokuDisplayKudari("着,発")
  jikokuhyouJikokuDisplayNobori: JikokuDisplay;
  jikokuhyouSyubetsuChangeDisplayKudari: SyubetsuChangeDisplay; // 次列車情報欄(5 値)
  jikokuhyouSyubetsuChangeDisplayNobori: SyubetsuChangeDisplay;
  jikokuhyouPrevSyubetsuChangeDisplayKudari: SyubetsuChangeDisplay; // 前列車情報欄(1.17〜)
  jikokuhyouPrevSyubetsuChangeDisplayNobori: SyubetsuChangeDisplay;
  jikokuhyouNyuusenJikokuDisplayKudari: boolean; // 入線時刻欄(1.17〜)
  jikokuhyouNyuusenJikokuDisplayNobori: boolean;
  diagramColorNextEki: number; // m_iDiagramColorNextEki(0–4。DiaBackColor の index)
  operationTableDisplayJikoku: boolean; // m_bOperationTableDisplayJikoku
  jikokuhyouOuterDisplayKudari: OuterDisplay; // キー JikokuhyouOuterDisplayKudari("始発,終着")
  jikokuhyouOuterDisplayNobori: OuterDisplay;
  unknownEntries?: UnknownEntry[];
}

// ---- Ressyasyubetsu(列車種別)----

/** 列車線スタイル(原典 CdDiagramLineStyle)。 */
export interface DiagramLineStyle {
  senColor: Colorref; // m_colorDiagramSenColor / キー DiagramSenColor
  senStyle: SenStyle; // m_eDiagramSenStyle / キー DiagramSenStyle
  isBold: boolean; // m_bDiagramSenIsBold / キー DiagramSenIsBold
}

/** 列車種別(原典 CentDedRessyasyubetsu)。 */
export interface Ressyasyubetsu {
  syubetsumei: string; // m_strSyubetsumei(コンテナ所属中は空不可)
  ryakusyou: string; // m_strRyakusyou
  jikokuhyouMojiColor: Colorref; // m_colorJikokuhyouMojiColor(既定 黒)
  jikokuhyouFontIndex: number; // m_iJikokuhyouFontIndex(0–7)
  jikokuhyouBackColor: Colorref; // m_colorJikokuhyouBackColor(既定 白)
  diagramLineStyle: DiagramLineStyle; // m_CdDiagramLineStyle
  stopMarkDrawType: StopMarkDrawType; // m_eStopMarkDrawType
  parentSyubetsuIndex: number | null; // m_iParentSyubetsuIndex(-1 → null)
  hidden: boolean; // m_bHidden(隠し種別。1.15〜)
  unknownEntries?: UnknownEntry[];
}

// ---- Dia(ダイヤ)・Ressya(列車)・EkiJikoku(駅時刻)----

/** ダイヤ(原典 CentDedDia)。導出コンテナ・ランタイムフラグは持たない(§1.4)。 */
export interface Dia {
  name: string; // m_strName(路線内一意・空不可)
  mainBackColorIndex: number; // m_iJikokuhyouMainBackColorIndex
  subBackColorIndex: number; // m_iJikokuhyouSubBackColorIndex
  backPatternIndex: number; // m_iJikokuhyouBackPatternIndex
  patternDiagramPreviewEnable: boolean; // m_bPatternDiagramPreviewEnable(1.16〜)
  patternDiagramPreviewCycleSecond: number; // 60–10800。既定 600
  /** m_CentDedRessyaCont[2]。[0] = 下り、[1] = 上り(Ressyahoukou と一致)。 */
  ressyaCont: [Ressya[], Ressya[]];
  unknownEntries?: UnknownEntry[];
}

/** 列車(原典 CentDedRessya)。 */
export interface Ressya {
  /** m_bIsNull: 時刻表ビューの空行。true でも ekiJikokuCont は駅数分持つ。 */
  isNull: boolean;
  houkou: Ressyahoukou; // m_eRessyahoukou(所属コンテナと常に一致 — 不変条件 §8)
  syubetsuIndex: number; // m_iRessyasyubetsuIndex(既定 0)
  ressyabangou: string; // m_strRessyabangou
  ressyamei: string; // m_strRessyamei
  gousuu: string; // m_strGousuu
  bikou: string; // m_strBikou
  isCanceled: boolean; // m_bIsCanceled(運休。1.15〜)
  /** m_CentDedEkiJikokuCont: 常に路線の駅数と同数。添字 = 駅Order(方向基準)。 */
  ekiJikokuCont: EkiJikoku[];
  unknownEntries?: UnknownEntry[];
}

/** 駅時刻(原典 CentDedEkiJikoku)。最もインスタンス数が多い型。 */
export interface EkiJikoku {
  ekiatsukai: Ekiatsukai; // m_eEkiatsukai
  chakuJikoku: Jikoku; // m_jikokuChakujikoku
  hatsuJikoku: Jikoku; // m_jikokuHatsujikoku
  /** m_iRessyaTrackIndex: その駅の ekiTrack2Cont への index。null = 未設定。 */
  ressyaTrackIndex: number | null;
  beforeOperationCont: BeforeOperation[]; // m_CentDedBeforeOperationCont(時系列順)
  afterOperationCont: AfterOperation[]; // m_CentDedAfterOperationCont(時系列順)
}

// ---- DispProp(表示設定)----

/** 表示プロパティ(原典 CdDedDispProp / DispProp. ノード)。全キー常時出力(analysis §03 §5.8)。 */
export interface DispProp {
  jikokuhyouFont: FontProp[]; // JikokuhyouFont × 8
  jikokuhyouVFont: FontProp; // JikokuhyouVFont(縦書き)
  diaEkimeiFont: FontProp; // DiaEkimeiFont
  diaJikokuFont: FontProp; // DiaJikokuFont
  diaRessyaFont: FontProp; // DiaRessyaFont
  operationTableFont: FontProp; // OperationTableFont(1.09〜)
  allOperationTableJikokuFont: FontProp; // AllOperationTableJikokuFont(1.09〜)
  commentFont: FontProp; // CommentFont
  diaMojiColor: Colorref; // DiaMojiColor(既定 黒)
  diaBackColor: Colorref[]; // DiaBackColor × 5(1.09〜。既定 白 × 5)
  diaRessyaColor: Colorref; // DiaRessyaColor(原典に廃止予定注記)
  diaJikuColor: Colorref; // DiaJikuColor(既定 C0C0C0)
  jikokuhyouBackColor: Colorref[]; // JikokuhyouBackColor × 4(既定 白/F0F0F0/白/白)
  stdOpeTimeLowerColor: Colorref; // StdOpeTimeLowerColor(既定 FFE0E0)
  stdOpeTimeHigherColor: Colorref; // StdOpeTimeHigherColor(既定 E0FFFF)
  stdOpeTimeUndefColor: Colorref; // StdOpeTimeUndefColor(既定 FFFF80)
  stdOpeTimeIllegalColor: Colorref; // StdOpeTimeIllegalColor(既定 A0A0A0)
  operationStringColor: Colorref; // OperationStringColor(既定 黒)
  operationGridColor: Colorref; // OperationGridColor(既定 黒)
  ekimeiLength: number; // EkimeiLength(駅名欄幅・全角数。既定 6)
  jikokuhyouRessyaWidth: number; // JikokuhyouRessyaWidth(列車欄幅。既定 5)
  anySecondIncDec1: number; // AnySecondIncDec1(既定 5)
  anySecondIncDec2: number; // AnySecondIncDec2(既定 15)
  displayRessyamei: boolean; // DisplayRessyamei(既定 true。"0" のときのみ false)
  displayOuterTerminalEkimeiOriginSide: boolean;
  displayOuterTerminalEkimeiTerminalSide: boolean;
  diagramDisplayOuterTerminal: number; // DiagramDisplayOuterTerminal(既定 0)
  secondRoundChaku: SecondRound; // SecondRoundChaku(1.08〜)
  secondRoundHatsu: SecondRound; // SecondRoundHatsu
  display2400: boolean; // Display2400(1.08〜)
  operationNumberRows: number; // OperationNumberRows(運用番号段数。1.10〜。既定 1)
  displayInOutLinkCode: boolean; // DisplayInOutLinkCode(1.10〜)
  unknownEntries?: UnknownEntry[];
}
