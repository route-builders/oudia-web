// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 up-tri

// 代表規模(500 列車 × 50 駅)のベンチ用合成フィクスチャ(architecture §8.1)。
// 決定論的に生成し、レイアウト計算・グリッド構築・コマンド実行の所要時間を CI で追跡する。

import type {
    Dia,
    DispProp,
    Eki,
    EkiJikoku,
    Ressya,
    Ressyasyubetsu,
    RosenFileData,
} from '@oudia-web/format';
import { asSeconds } from '@oudia-web/format';

function mkEki(i: number): Eki {
  return {
    id: i,
    ekimei: `駅${String(i)}`,
    ekimeiJikokuRyaku: '',
    ekimeiDiaRyaku: '',
    ekijikokukeisiki: 'hatsuchaku',
    // 3 駅ごとに主要駅で見た目を多様化。
    ekikibo: i % 3 === 0 ? 'syuyou' : 'ippan',
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
    jikokuhyouTrackOmit: false,
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

/**
 * 1 列車の駅時刻を生成する。始発時刻 baseSec から駅間 180 秒で進み、3 駅に 1 回停車
 * (それ以外は通過)。列車ごとに始発時刻をずらして現実的なダイヤにする。
 */
function mkRessya(index: number, ekiCount: number, houkou: 0 | 1): Ressya {
  const baseSec = 5 * 3600 + index * 90; // 5:00 から 90 秒間隔で発車。
  const cont: EkiJikoku[] = [];
  for (let order = 0; order < ekiCount; order++) {
    const arr = baseSec + order * 180;
    const dep = arr + (order % 3 === 0 ? 60 : 30);
    const teisya = order % 3 === 0 || order === 0 || order === ekiCount - 1;
    cont.push({
      ekiatsukai: teisya ? 'teisya' : 'tsuuka',
      chakuJikoku: order === 0 ? null : asSeconds(arr % 86400),
      hatsuJikoku: order === ekiCount - 1 ? null : asSeconds(dep % 86400),
      ressyaTrackIndex: order % 2,
      beforeOperationCont: [],
      afterOperationCont: [],
    });
  }
  return {
    isNull: false,
    houkou,
    syubetsuIndex: index % 3,
    ressyabangou: `${String(index)}M`,
    ressyamei: index % 5 === 0 ? `快速${String(index)}` : '',
    gousuu: '',
    bikou: '',
    isCanceled: false,
    ekiJikokuCont: cont,
  };
}

function mkSyubetsu(name: string, ryaku: string): Ressyasyubetsu {
  return {
    syubetsumei: name,
    ryakusyou: ryaku,
    jikokuhyouMojiColor: 0 as never,
    jikokuhyouFontIndex: 0,
    jikokuhyouBackColor: 0 as never,
    diagramLineStyle: { senColor: 0 as never, senStyle: 'jissen', isBold: false },
    stopMarkDrawType: 'drawOnStop',
    parentSyubetsuIndex: null,
    hidden: false,
  };
}

function mkDispProp(): DispProp {
  return {
    displayRessyamei: true,
    secondRoundChaku: 0,
    secondRoundHatsu: 0,
    display2400: false,
  } as unknown as DispProp;
}

/**
 * 代表規模の合成 RosenFileData を作る(既定 500 列車 × 50 駅、下り上り各半分)。
 */
export function makeBenchRosen(ekiCount = 50, ressyaCount = 500): RosenFileData {
  const ekiCont: Eki[] = [];
  for (let i = 0; i < ekiCount; i++) ekiCont.push(mkEki(i));

  const kudari: Ressya[] = [];
  const nobori: Ressya[] = [];
  const half = Math.floor(ressyaCount / 2);
  for (let i = 0; i < half; i++) kudari.push(mkRessya(i, ekiCount, 0));
  for (let i = 0; i < ressyaCount - half; i++) nobori.push(mkRessya(i, ekiCount, 1));

  const dia: Dia = {
    name: 'ベンチダイヤ',
    mainBackColorIndex: 0,
    subBackColorIndex: 0,
    backPatternIndex: 0,
    patternDiagramPreviewEnable: false,
    patternDiagramPreviewCycleSecond: 600,
    ressyaCont: [kudari, nobori],
  };

  return {
    sourceFileType: 'OuDiaSecond.1.17',
    rosen: {
      rosenmei: 'ベンチ線',
      kudariDiaAlias: '',
      noboriDiaAlias: '',
      ekiCont,
      ressyasyubetsuCont: [
        mkSyubetsu('普通', '普'),
        mkSyubetsu('快速', '快'),
        mkSyubetsu('特急', '特'),
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
    dispProp: mkDispProp(),
    windowPlacement: null,
    sourceFileTypeAppComment: null,
  };
}
