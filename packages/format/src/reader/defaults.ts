// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 oudia-second-web contributors
//
// Based on OuDiaSecond (Copyright (C) 2017-2026 diagram_mania)
// and OuDia (Copyright (C) 2006-2017 take-okm)

/**
 * DispProp の読込デフォルト値(analysis §03 §5.8、原典 CdDedDispProp コンストラクタ)。
 * ファイルでキーが欠落・空のとき、これらの既定値を使う。
 */

import type { Colorref, FontProp } from '../model/basic.js';
import { asColorref } from '../model/basic.js';
import type { DispProp } from '../model/entities.js';
import { makeFontProp } from '../value/font.js';

const BLACK = asColorref(0x00000000);
const WHITE = asColorref(0x00ffffff);
const color = (bgr: number): Colorref => asColorref(bgr);

/** 9pt Meiryo UI(多くのフォント既定)。 */
function meiryoUi(pt: number): FontProp {
  return makeFontProp(pt, 'Meiryo UI');
}

/** JikokuhyouFont 8 スロットの既定(idx1=Bold, idx2=Itaric, idx3=Bold+Itaric)。 */
function defaultJikokuhyouFonts(): FontProp[] {
  const base = (): FontProp => meiryoUi(9);
  const bold = (): FontProp => ({ ...meiryoUi(9), bold: true });
  const italic = (): FontProp => ({ ...meiryoUi(9), italic: true });
  const boldItalic = (): FontProp => ({ ...meiryoUi(9), bold: true, italic: true });
  return [base(), bold(), italic(), boldItalic(), base(), base(), base(), base()];
}

/** DispProp の全既定値(analysis §5.8)。 */
export function createDefaultDispProp(): DispProp {
  return {
    jikokuhyouFont: defaultJikokuhyouFonts(),
    jikokuhyouVFont: makeFontProp(9, '@メイリオ'),
    diaEkimeiFont: meiryoUi(9),
    diaJikokuFont: meiryoUi(9),
    diaRessyaFont: meiryoUi(9),
    operationTableFont: meiryoUi(9),
    allOperationTableJikokuFont: meiryoUi(8),
    commentFont: meiryoUi(9),
    diaMojiColor: BLACK,
    diaBackColor: [WHITE, WHITE, WHITE, WHITE, WHITE],
    diaRessyaColor: BLACK,
    diaJikuColor: color(0x00c0c0c0),
    jikokuhyouBackColor: [WHITE, color(0x00f0f0f0), WHITE, WHITE],
    stdOpeTimeLowerColor: color(0x00ffe0e0),
    stdOpeTimeHigherColor: color(0x00e0ffff),
    stdOpeTimeUndefColor: color(0x00ffff80),
    stdOpeTimeIllegalColor: color(0x00a0a0a0),
    operationStringColor: BLACK,
    operationGridColor: BLACK,
    ekimeiLength: 6,
    jikokuhyouRessyaWidth: 5,
    anySecondIncDec1: 5,
    anySecondIncDec2: 15,
    displayRessyamei: true,
    displayOuterTerminalEkimeiOriginSide: false,
    displayOuterTerminalEkimeiTerminalSide: false,
    diagramDisplayOuterTerminal: 0,
    secondRoundChaku: 0,
    secondRoundHatsu: 0,
    display2400: false,
    operationNumberRows: 1,
    displayInOutLinkCode: false,
  };
}

export { BLACK as COLOR_BLACK, WHITE as COLOR_WHITE };
