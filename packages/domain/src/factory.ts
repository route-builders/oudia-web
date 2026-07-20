// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 up-tri
//
// Based on OuDiaSecond (Copyright (C) 2017-2026 diagram_mania)
// and OuDia (Copyright (C) 2006-2017 take-okm)

/**
 * 新規エンティティのファクトリ(data-model 付録 A の createDefault* 系)。
 *
 * 値は原典コンストラクタの初期化子リストを直訳する:
 * - CentDedRosen::CentDedRosen (entDed/CentDedRosen.cpp:225-238) と clear() (2323)
 * - CentDedEki::CentDedEki (entDed/CentDedEki.cpp:112-186)
 * - CentDedEkiTrack2('1番線','1') / ('2番線','2')
 * - CentDedRessyasyubetsu('普通','') (entDed/CentDedRessyasyubetsu.h:366-373 の既定引数)
 * - CentDedDia (ressyaCont 空)
 *
 * ファイル省略時の「読込デフォルト」(format 層)とは別物である点に注意
 * (例: operationCrossKitenJikoku は新規作成 true / ファイル省略時 false — data-model 付録 A)。
 */

import type {
  Dia,
  DispProp,
  Eki,
  EkiJikoku,
  EkiTrack2,
  Ressyasyubetsu,
  Rosen,
  RosenFileData,
} from '@oudia-web/format';
import { COLOR_BLACK, COLOR_WHITE, createDefaultDispProp } from '@oudia-web/format';

/** 新規作成時の FileType(現行世代固定)。書き出しは常にこの版。 */
export const NEW_FILE_TYPE = 'OuDiaSecond.1.17';

/** 原典 nameRessyasyubetsuDefault(CentDedRosen.cpp:101)。 */
const NAME_RESSYASYUBETSU_DEFAULT = '普通';

/**
 * 運行なしの空駅時刻(原典 CentDedEkiJikoku 既定コンストラクタ)。
 * createNullRessya / slotAt / getEkiJikoku で重複していたリテラルの単一定義。
 */
export function makeNoneEkiJikoku(): EkiJikoku {
  return {
    ekiatsukai: 'none',
    chakuJikoku: null,
    hatsuJikoku: null,
    ressyaTrackIndex: null,
    beforeOperationCont: [],
    afterOperationCont: [],
  };
}

/**
 * 既定の番線(原典 CentDedEkiTrack2(name, ryaku))。
 * trackNoboriRyakusyou は空(共通略称を使用)。ライターは空 trackName/trackRyakusyou で
 * 例外を投げるため、name/ryaku は非空にする(writer/current.ts:83-94)。
 */
export function createDefaultEkiTrack2(trackName: string, trackRyakusyou: string): EkiTrack2 {
  return { trackName, trackRyakusyou, trackNoboriRyakusyou: '' };
}

/**
 * 既定の駅(原典 CentDedEki::CentDedEki、entDed/CentDedEki.cpp:112-186 の直訳)。
 * 番線 2 個('1番線'/'1'・'2番線'/'2')、downMain=0 / upMain=1、id は呼出側で採番するため
 * ここでは -1 相当のプレースホルダを入れず引数で受ける。全表示フラグは原典既定。
 */
export function createDefaultEki(id: number, ekimei = ''): Eki {
  return {
    id,
    ekimei,
    ekimeiJikokuRyaku: '',
    ekimeiDiaRyaku: '',
    ekijikokukeisiki: 'hatsu', // Jikokukeisiki_Hatsu
    ekikibo: 'ippan', // Ekikibo_Ippan
    diagramRessyajouhouHyoujiKudari: 'origin',
    diagramRessyajouhouHyoujiNobori: 'origin',
    downMain: 0,
    upMain: 1,
    ekiTrack2Cont: [createDefaultEkiTrack2('1番線', '1'), createDefaultEkiTrack2('2番線', '2')],
    brunchCoreEkiIndex: null, // -1 → null
    brunchOpposite: false,
    loopOriginEkiIndex: null,
    loopOpposite: false,
    outerTerminalCont: [],
    nextEkiDistance: 0,
    crossingCheckRuleCont: [],

    jikokuhyouTrackDisplayKudari: false,
    jikokuhyouTrackDisplayNobori: false,
    diagramTrackDisplay: false,
    diagramTrackOmit: [false, false], // 番線数と同数
    jikokuhyouTrackOmit: false,
    jikokuhyouOperationOrigin: 0,
    jikokuhyouOperationTerminal: 0,
    jikokuhyouOperationOriginDownBeforeUpAfter: false,
    jikokuhyouOperationOriginDownAfterUpBefore: false,
    jikokuhyouOperationTerminalDownBeforeUpAfter: false,
    jikokuhyouOperationTerminalDownAfterUpBefore: false,
    jikokuhyouJikokuDisplayKudari: { chaku: true, hatsu: true },
    jikokuhyouJikokuDisplayNobori: { chaku: true, hatsu: true },
    jikokuhyouSyubetsuChangeDisplayKudari: makeSyubetsuChangeDisplayDefault(),
    jikokuhyouSyubetsuChangeDisplayNobori: makeSyubetsuChangeDisplayDefault(),
    jikokuhyouPrevSyubetsuChangeDisplayKudari: makeSyubetsuChangeDisplayDefault(),
    jikokuhyouPrevSyubetsuChangeDisplayNobori: makeSyubetsuChangeDisplayDefault(),
    jikokuhyouNyuusenJikokuDisplayKudari: false,
    jikokuhyouNyuusenJikokuDisplayNobori: false,
    diagramColorNextEki: 0,
    operationTableDisplayJikoku: false,
    jikokuhyouOuterDisplayKudari: { origin: false, terminal: false },
    jikokuhyouOuterDisplayNobori: { origin: false, terminal: false },
  };
}

/** SyubetsuChangeDisplay の既定("0,0,0,0,1")。 */
function makeSyubetsuChangeDisplayDefault(): Eki['jikokuhyouSyubetsuChangeDisplayKudari'] {
  return { ressyabangou: 0, operationNumber: 0, syubetsu: 0, ressyamei: 0, operationNumberRows: 1 };
}

/**
 * 既定の列車種別(原典 CentDedRessyasyubetsu(name, ryaku)、
 * CentDedRessyasyubetsu.h:366-373 + .cpp:91-108 の直訳)。
 * 文字色黒・背景白・線=実線黒細・停車駅明示・親なし・非隠し。
 */
export function createDefaultRessyasyubetsu(syubetsumei: string, ryakusyou = ''): Ressyasyubetsu {
  return {
    syubetsumei,
    ryakusyou,
    jikokuhyouMojiColor: COLOR_BLACK,
    jikokuhyouFontIndex: 0,
    jikokuhyouBackColor: COLOR_WHITE,
    diagramLineStyle: { senColor: COLOR_BLACK, senStyle: 'jissen', isBold: false },
    stopMarkDrawType: 'drawOnStop',
    parentSyubetsuIndex: null,
    hidden: false,
  };
}

/**
 * 既定のダイヤ(原典 CentDedDia)。ressyaCont は下り・上りとも空配列。
 * 名前は路線内一意である必要があるため呼出側の責務。
 */
export function createDefaultDia(name: string): Dia {
  return {
    name,
    mainBackColorIndex: 0,
    subBackColorIndex: 0,
    backPatternIndex: 0,
    patternDiagramPreviewEnable: false,
    patternDiagramPreviewCycleSecond: 600,
    ressyaCont: [[], []],
  };
}

/**
 * 既定の路線(原典 CentDedRosen::CentDedRosen + clear、
 * CentDedRosen.cpp:225-238 / 2323 の直訳)。
 * 駅 0・ダイヤ 0、種別は '普通' 1 個のみ。空のスターターであってチュートリアル路線ではない。
 * operationCrossKitenJikoku は新規作成 true(ファイル省略時 false との差 — data-model 付録 A)。
 */
export function createDefaultRosen(): Rosen {
  return {
    rosenmei: '',
    kudariDiaAlias: '',
    noboriDiaAlias: '',
    ekiCont: [],
    ressyasyubetsuCont: [createDefaultRessyasyubetsu(NAME_RESSYASYUBETSU_DEFAULT)],
    diaCont: [],
    kitenJikoku: null, // 空 KitenJikoku= 相当。演算では 0 扱い
    diagramDgrYZahyouKyoriDefault: 60,
    enableOperation: 0,
    operationNumberReverse: false,
    operationCrossKitenJikoku: true,
    kijunDiaIndex: 0,
    disableHiddenSyubetsu: false,
    comment: '',
  };
}

/**
 * 新規ファイル 1 個ぶん(原典 CDedRosenFileData::clear 後の状態)。
 * OnNewDocument はスターター内容を作らないため、既定路線 + 既定 DispProp のみ。
 */
export function createNewRosen(): RosenFileData {
  return {
    sourceFileType: NEW_FILE_TYPE,
    rosen: createDefaultRosen(),
    dispProp: createDefaultDispProp(),
    windowPlacement: null,
    // 書き出し時にライターが現行版の FileTypeAppComment を再生成するため null で開始する。
    sourceFileTypeAppComment: null,
  };
}

export type { DispProp };
/**
 * 既定 DispProp(format 層の createDefaultDispProp を domain から使えるよう再輸出)。
 */
export { createDefaultDispProp };
