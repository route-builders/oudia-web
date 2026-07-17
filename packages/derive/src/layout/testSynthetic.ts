// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 oudia-second-web contributors

// レイアウトテスト用の合成 RosenFileData ビルダー(最小構成)。

import { asSeconds } from '@oudia/format';
import type { Dia, Eki, EkiJikoku, Ressya, RosenFileData } from '@oudia/format';

/** EkiJikoku を簡潔に作る。 */
export function ej(
  ekiatsukai: EkiJikoku['ekiatsukai'],
  chaku: number | null,
  hatsu: number | null,
  track: number | null = 0,
): EkiJikoku {
  return {
    ekiatsukai,
    chakuJikoku: chaku === null ? null : asSeconds(chaku),
    hatsuJikoku: hatsu === null ? null : asSeconds(hatsu),
    ressyaTrackIndex: ekiatsukai === 'none' ? null : track,
    beforeOperationCont: [],
    afterOperationCont: [],
  };
}

function mkEki(ekimei: string): Eki {
  return {
    id: 0,
    ekimei,
    ekimeiJikokuRyaku: '',
    ekimeiDiaRyaku: '',
    ekijikokukeisiki: 'hatsuchaku',
    ekikibo: 'ippan',
    diagramRessyajouhouHyoujiKudari: 'origin',
    diagramRessyajouhouHyoujiNobori: 'origin',
    downMain: 0,
    upMain: 1,
    ekiTrack2Cont: [
      { trackName: '1', trackRyakusyou: '1', trackNoboriRyakusyou: '' },
      { trackName: '2', trackRyakusyou: '2', trackNoboriRyakusyou: '' },
    ],
    brunchCoreEkiIndex: null,
    brunchOpposite: false,
    loopOriginEkiIndex: null,
    loopOpposite: false,
    outerTerminalCont: [],
    nextEkiDistance: 0,
    crossingCheckRuleCont: [],
    jikokuhyouTrackDisplayKudari: false,
    jikokuhyouTrackDisplayNobori: false,
    diagramTrackDisplay: false,
    diagramTrackOmit: [false, false],
    jikokuhyouTrackOmit: true,
    jikokuhyouOperationOrigin: 0,
    jikokuhyouOperationTerminal: 0,
    jikokuhyouOperationOriginDownBeforeUpAfter: false,
    jikokuhyouOperationOriginDownAfterUpBefore: false,
    jikokuhyouOperationTerminalDownBeforeUpAfter: false,
    jikokuhyouOperationTerminalDownAfterUpBefore: false,
    jikokuhyouJikokuDisplayKudari: { chaku: true, hatsu: true },
    jikokuhyouJikokuDisplayNobori: { chaku: true, hatsu: true },
    jikokuhyouSyubetsuChangeDisplayKudari: {
      ressyabangou: 0,
      operationNumber: 0,
      syubetsu: 0,
      ressyamei: 0,
      operationNumberRows: 1,
    },
    jikokuhyouSyubetsuChangeDisplayNobori: {
      ressyabangou: 0,
      operationNumber: 0,
      syubetsu: 0,
      ressyamei: 0,
      operationNumberRows: 1,
    },
    jikokuhyouPrevSyubetsuChangeDisplayKudari: {
      ressyabangou: 0,
      operationNumber: 0,
      syubetsu: 0,
      ressyamei: 0,
      operationNumberRows: 1,
    },
    jikokuhyouPrevSyubetsuChangeDisplayNobori: {
      ressyabangou: 0,
      operationNumber: 0,
      syubetsu: 0,
      ressyamei: 0,
      operationNumberRows: 1,
    },
    jikokuhyouNyuusenJikokuDisplayKudari: false,
    jikokuhyouNyuusenJikokuDisplayNobori: false,
    diagramColorNextEki: 0,
    operationTableDisplayJikoku: false,
    jikokuhyouOuterDisplayKudari: { origin: false, terminal: false },
    jikokuhyouOuterDisplayNobori: { origin: false, terminal: false },
  };
}

/** 駅数 ekiCount・下り列車 kudari の最小 RosenFileData。既定駅間幅 60 秒。 */
export function makeSyntheticRosen(ekiCount: number, kudari: Ressya[]): RosenFileData {
  const ekiCont: Eki[] = [];
  for (let i = 0; i < ekiCount; i++) {
    ekiCont.push(mkEki(String.fromCharCode(65 + i)));
  }
  const dia: Dia = {
    name: 'テスト',
    mainBackColorIndex: 0,
    subBackColorIndex: 0,
    backPatternIndex: 0,
    patternDiagramPreviewEnable: false,
    patternDiagramPreviewCycleSecond: 600,
    ressyaCont: [kudari, []],
  };
  return {
    sourceFileType: 'OuDiaSecond.1.17',
    rosen: {
      rosenmei: 'テスト線',
      kudariDiaAlias: '',
      noboriDiaAlias: '',
      ekiCont,
      ressyasyubetsuCont: [
        {
          syubetsumei: '普通',
          ryakusyou: '普',
          jikokuhyouMojiColor: 0 as never,
          jikokuhyouFontIndex: 0,
          jikokuhyouBackColor: 0 as never,
          diagramLineStyle: { senColor: 0 as never, senStyle: 'jissen', isBold: false },
          stopMarkDrawType: 'drawOnStop',
          parentSyubetsuIndex: null,
          hidden: false,
        },
      ],
      diaCont: [dia],
      kitenJikoku: null,
      diagramDgrYZahyouKyoriDefault: 60,
      enableOperation: 0,
      operationNumberReverse: false,
      operationCrossKitenJikoku: false,
      kijunDiaIndex: 0,
      disableHiddenSyubetsu: false,
      comment: '',
    },
    dispProp: {} as unknown as RosenFileData['dispProp'],
    windowPlacement: null,
    sourceFileTypeAppComment: null,
  };
}
