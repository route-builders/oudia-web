// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 up-tri
//
// Based on OuDiaSecond (Copyright (C) 2017-2026 diagram_mania)
// and OuDia (Copyright (C) 2006-2017 take-okm)

/**
 * 運用一覧図の描画(原典 ViewAllOperationTable2/CDcdAllOperationTable2::DcDraw と
 * CDcdAllOperationTable::DcDraw)。M7e。
 *
 * 描画順(原典 :1481-1486):
 * 1. 左ヘッダ → 2. 右ヘッダ → 3. 時目盛 → 4. 左パネル → 5. 右パネル → 6. 図本体
 *
 * ★px/秒 は倍率ではなく「表示する時間範囲(秒)を図領域の幅にフィットさせた値」
 * (原典 CconvContentPosToTarget.cpp:100)。ウィンドウ幅が変われば px/秒 も変わる。
 * ★行の実 px 高は「岡」の文字高 × 2 + 4(原典 :335-352)。Dgr 30 単位がこの高さに対応する。
 * ★駅名・分ラベルの重なり回避はテキスト実測が要るのでここで行う(原典 :986-1136)。
 */

import type {
  OperationDiagramEkimeiLabel,
  OperationDiagramRow,
  OperationDiagramSegment,
} from '@oudia-web/derive';
import { OPERATION_VLINE_PITCHES } from '@oudia-web/derive';
import { DASH_PATTERN, strokeLine } from '../core/primitives.js';
import type { RenderContext2D } from '../core/RenderTarget.js';

/** 図の余白(原典 DIAGRAM_SIZE_MARGIN_DCD = 2)。 */
export const OPERATION_DIAGRAM_MARGIN = 2;

export interface AllOperationDiagramTheme {
  /** 行境界・パネル罫線(DispProp OperationGridColor)。 */
  readonly gridColor: string;
  /** 時間目盛の縦罫(DiaJikuColor)。 */
  readonly jikuColor: string;
  /** 文字色(OperationStringColor)。 */
  readonly stringColor: string;
  /** ヘッダ背景(原典は COLOR_MENU システム色)。 */
  readonly headerBackColor: string;
  readonly backColor: string;
  /** 駅名・運用情報のフォント(既定 9pt)。 */
  readonly font: string;
  /** 分ラベルのフォント(既定 8pt)。 */
  readonly jikokuFont: string;
}

/** 左右パネルに出す 1 運用ぶんの情報。 */
export interface AllOperationDiagramPanelRow {
  readonly operationNumber: string;
  readonly outEkimei: string;
  readonly outJikokuText: string;
  readonly inEkimei: string;
  readonly inJikokuText: string;
}

export interface AllOperationDiagramView {
  /** 表示開始の絶対秒(起点時刻以上)。 */
  readonly viewStartSec: number;
  /** 表示する時間範囲(秒)。24h = 86400。 */
  readonly viewRangeSec: number;
  /** 縦スクロール(先頭に出す行 index)。 */
  readonly firstRow: number;
  /** 時間目盛の粗密(0..7)。 */
  readonly vlineMode: number;
  /** 左右の運用情報部を出すか(原典 m_bDisplayEkimeiJikoku、既定 true)。 */
  readonly displayEkimeiJikoku: boolean;
  readonly viewW: number;
  readonly viewH: number;
  /** 起点時刻(絶対秒)。X 全体範囲 = [kiten, kiten+86400)。 */
  readonly kitenJikoku: number;
}

/** 計算済みのレイアウト(ヒットテストでも使う)。 */
export interface AllOperationDiagramLayout {
  readonly leftW: number;
  readonly rightW: number;
  readonly headerH: number;
  readonly graphX: number;
  readonly graphY: number;
  readonly graphW: number;
  readonly graphH: number;
  readonly rowH: number;
  readonly pxPerSec: number;
  /** 画面に入る行数。 */
  readonly visibleRows: number;
}

/** 駅名 6 文字ぶん(原典 m_iEkimeiLength = 6)。 */
const EKIMEI_LENGTH = 6;

/**
 * レイアウトを決める(原典 setCdDcdZone_X :205-270 / calc*ZoneDcd :1991-2230)。
 * 列幅はすべてテキスト実測から決まる。
 */
export function layoutAllOperationDiagram(
  ctx: RenderContext2D,
  view: AllOperationDiagramView,
  theme: AllOperationDiagramTheme,
  jikokuhyouRessyaWidth: number,
): AllOperationDiagramLayout {
  ctx.save();
  ctx.font = theme.font;
  const textH = Math.ceil(measureHeight(ctx, theme.font));
  const w = (s: string): number => Math.ceil(ctx.measureText(s).width);
  const wNum = (count: number): number => w('0'.repeat(Math.max(count, 1)));
  const wEki = w('岡'.repeat(EKIMEI_LENGTH));

  // 左: [列番号 "000"][運用番号][出区駅名][発時刻]
  let x = 1;
  x += w('000') + 1;
  x += wNum(Math.max(jikokuhyouRessyaWidth, 8));
  if (view.displayEkimeiJikoku) {
    x += 1 + wEki;
    x += 1 + wNum(Math.max(jikokuhyouRessyaWidth, 6)) + 1;
  }
  const leftW = x + 2;
  // 右: [入区駅名][着時刻]
  const rightW = view.displayEkimeiJikoku
    ? 2 + wEki + 1 + wNum(Math.max(jikokuhyouRessyaWidth, 6)) + 1
    : 1;
  ctx.restore();

  const headerH = 1 + textH + 1;
  // 行の実 px 高 = 「岡」の高さ × 2 + 太線 2 + 1 + 細線 1(原典 :335-352)。
  const rowH = textH * 2 + 4;
  const graphX = leftW;
  const graphY = headerH;
  const graphW = Math.max(1, view.viewW - leftW - rightW);
  const graphH = Math.max(1, view.viewH - headerH);
  const pxPerSec = (graphW - OPERATION_DIAGRAM_MARGIN * 2) / view.viewRangeSec;
  return {
    leftW,
    rightW,
    headerH,
    graphX,
    graphY,
    graphW,
    graphH,
    rowH,
    pxPerSec,
    visibleRows: Math.ceil(graphH / rowH) + 1,
  };
}

/** フォント指定文字列から高さ(px)をざっくり取る。 */
function measureHeight(ctx: RenderContext2D, font: string): number {
  const m = /(\d+(?:\.\d+)?)px/.exec(font);
  const px = m === null ? 12 : Number.parseFloat(m[1] ?? '12');
  // 全角 1 文字の実高はフォントサイズ + 行間ぶん。原典も文字高実測なのでこれで合わせる。
  void ctx;
  return px + 3;
}

/** 秒 → ビュー X。 */
export function xOfSec(
  layout: AllOperationDiagramLayout,
  view: AllOperationDiagramView,
  sec: number,
): number {
  return layout.graphX + OPERATION_DIAGRAM_MARGIN + (sec - view.viewStartSec) * layout.pxPerSec;
}

/** 行 index → 線の中心 Y。 */
export function yOfRow(
  layout: AllOperationDiagramLayout,
  view: AllOperationDiagramView,
  row: number,
): number {
  return layout.graphY + (row - view.firstRow) * layout.rowH + layout.rowH / 2;
}

/** Y → 行 index(ヒットテスト。原典 :1789-1801)。 */
export function rowOfY(
  layout: AllOperationDiagramLayout,
  view: AllOperationDiagramView,
  y: number,
): number {
  return view.firstRow + Math.floor((y - layout.graphY) / layout.rowH);
}

/** 全面描画。 */
export function drawAllOperationDiagram(
  ctx: RenderContext2D,
  layout: AllOperationDiagramLayout,
  view: AllOperationDiagramView,
  theme: AllOperationDiagramTheme,
  rows: readonly OperationDiagramRow[],
  panel: readonly AllOperationDiagramPanelRow[],
): void {
  ctx.save();
  ctx.fillStyle = theme.backColor;
  ctx.fillRect(0, 0, view.viewW, view.viewH);
  ctx.textBaseline = 'top';

  drawHeader(ctx, layout, view, theme);
  drawVlines(ctx, layout, view, theme, rows.length);
  drawPanels(ctx, layout, view, theme, panel);
  drawGraph(ctx, layout, view, theme, rows);
  ctx.restore();
}

/** ヘッダ(項目名 + 時目盛)。 */
function drawHeader(
  ctx: RenderContext2D,
  layout: AllOperationDiagramLayout,
  view: AllOperationDiagramView,
  theme: AllOperationDiagramTheme,
): void {
  ctx.fillStyle = theme.headerBackColor;
  ctx.fillRect(0, 0, view.viewW, layout.headerH);
  ctx.strokeStyle = theme.gridColor;
  ctx.lineWidth = 1;
  strokeLine(ctx, 0, layout.headerH - 0.5, view.viewW, layout.headerH - 0.5);

  ctx.fillStyle = theme.stringColor;
  ctx.font = theme.font;
  if (view.displayEkimeiJikoku) {
    // 左ヘッダ「運用番号 / 出区駅名 / 発時刻」・右ヘッダ「入区駅名 / 着時刻」(原典 :530-590 / :730-765)。
    ctx.fillText('運用番号', 4, 1);
    ctx.fillText('入区駅名', layout.graphX + layout.graphW + 2, 1);
  }

  // 「時」目盛: 起点時刻の次の正時から 3600 秒刻み(原典 :812-861)。ラベルは左右端でクランプ。
  const endSec = view.viewStartSec + view.viewRangeSec;
  const first = view.kitenJikoku + ((3600 - (view.kitenJikoku % 3600)) % 3600);
  for (let t = first; t <= view.kitenJikoku + 86400; t += 3600) {
    if (t < view.viewStartSec - 3600 || t > endSec + 3600) continue;
    const label = String(Math.floor((t % 86400) / 3600));
    const wLbl = ctx.measureText(label).width;
    const x = Math.min(
      Math.max(xOfSec(layout, view, t) - wLbl / 2, layout.graphX),
      layout.graphX + layout.graphW - wLbl,
    );
    ctx.fillText(label, x, 1);
  }
}

/** 時間目盛の縦罫(原典 :288-303)。 */
function drawVlines(
  ctx: RenderContext2D,
  layout: AllOperationDiagramLayout,
  view: AllOperationDiagramView,
  theme: AllOperationDiagramTheme,
  rowCount: number,
): void {
  const pitch = OPERATION_VLINE_PITCHES[view.vlineMode] ?? OPERATION_VLINE_PITCHES[3];
  if (pitch === undefined) return;
  const top = layout.graphY;
  const bottom = Math.min(layout.graphY + layout.graphH, layout.graphY + rowCount * layout.rowH);
  const endSec = view.viewStartSec + view.viewRangeSec;
  const kiten = view.kitenJikoku;
  const start = kiten + ((pitch.dot - (kiten % pitch.dot)) % pitch.dot);
  ctx.strokeStyle = theme.jikuColor;
  for (let s = start; s <= kiten + 86400; s += pitch.dot) {
    if (s < view.viewStartSec || s > endSec) continue;
    const x = Math.round(xOfSec(layout, view, s)) + 0.5;
    if (s % pitch.bold === 0) {
      ctx.lineWidth = 2;
      ctx.setLineDash([]);
    } else if (s % pitch.solid === 0) {
      ctx.lineWidth = 1;
      ctx.setLineDash([]);
    } else {
      ctx.lineWidth = 1;
      ctx.setLineDash(DASH_PATTERN.tensen);
    }
    strokeLine(ctx, x, top, x, bottom);
  }
  ctx.setLineDash([]);
  ctx.lineWidth = 1;
}

/** 左右の運用情報部 + 行境界(原典 :1067-1215 / :1413-1478 / :391-395)。 */
function drawPanels(
  ctx: RenderContext2D,
  layout: AllOperationDiagramLayout,
  view: AllOperationDiagramView,
  theme: AllOperationDiagramTheme,
  panel: readonly AllOperationDiagramPanelRow[],
): void {
  ctx.font = theme.font;
  const rightX = layout.graphX + layout.graphW;
  for (let i = view.firstRow; i < panel.length && i < view.firstRow + layout.visibleRows; i++) {
    const row = panel[i];
    if (row === undefined) continue;
    const yTop = layout.graphY + (i - view.firstRow) * layout.rowH;
    // 行境界(1px 上へずらす。原典 :391-395)。
    ctx.strokeStyle = theme.gridColor;
    ctx.lineWidth = 1;
    const yLine = Math.round(yTop + layout.rowH) - 0.5;
    strokeLine(ctx, 0, yLine, view.viewW, yLine);

    ctx.fillStyle = theme.stringColor;
    const yText = yTop + (layout.rowH - measureHeight(ctx, theme.font)) / 2;
    ctx.fillText(String(i + 1), 2, yText);
    ctx.fillText(row.operationNumber, 4 + ctx.measureText('000').width, yText);
    if (view.displayEkimeiJikoku) {
      const midX = 8 + ctx.measureText('000').width + ctx.measureText('00000000').width;
      ctx.fillText(row.outEkimei, midX, yText);
      ctx.fillText(
        row.outJikokuText,
        midX + ctx.measureText('岡'.repeat(EKIMEI_LENGTH)).width + 2,
        yText,
      );
      ctx.fillText(row.inEkimei, rightX + 2, yText);
      ctx.fillText(
        row.inJikokuText,
        rightX + 3 + ctx.measureText('岡'.repeat(EKIMEI_LENGTH)).width,
        yText,
      );
    }
  }
  // 左右パネルと図の境界(太線 2px)。
  ctx.strokeStyle = theme.gridColor;
  ctx.lineWidth = 2;
  strokeLine(ctx, layout.graphX - 1, layout.headerH, layout.graphX - 1, view.viewH);
  strokeLine(ctx, rightX + 1, layout.headerH, rightX + 1, view.viewH);
  ctx.lineWidth = 1;
}

/** 図本体(線分 + ラベル)。 */
function drawGraph(
  ctx: RenderContext2D,
  layout: AllOperationDiagramLayout,
  view: AllOperationDiagramView,
  theme: AllOperationDiagramTheme,
  rows: readonly OperationDiagramRow[],
): void {
  ctx.save();
  // 図領域でクリップ(左右パネルへはみ出さない)。
  ctx.beginPath();
  ctx.rect(layout.graphX, layout.graphY, layout.graphW, layout.graphH);
  ctx.clip();

  const textH = measureHeight(ctx, theme.font);
  for (let i = view.firstRow; i < rows.length && i < view.firstRow + layout.visibleRows; i++) {
    const row = rows[i];
    if (row === undefined) continue;
    const y = yOfRow(layout, view, i);

    for (const seg of row.segments) {
      drawSegment(ctx, layout, view, theme, seg, y, textH);
    }
    // 駅名(線の下)・分(線の上)の重なり回避つき描画。
    ctx.font = theme.font;
    ctx.fillStyle = theme.stringColor;
    drawLabelRun(ctx, layout, view, row.ekimeiLabels, y + 2);
    ctx.font = theme.jikokuFont;
    drawLabelRun(ctx, layout, view, row.minuteLabels, y - measureHeight(ctx, theme.jikokuFont) - 1);
  }
  ctx.restore();
}

function drawSegment(
  ctx: RenderContext2D,
  layout: AllOperationDiagramLayout,
  view: AllOperationDiagramView,
  theme: AllOperationDiagramTheme,
  seg: OperationDiagramSegment,
  y: number,
  textH: number,
): void {
  const x1 = xOfSec(layout, view, seg.fromSec);
  const x2 = xOfSec(layout, view, seg.toSec);
  if (x2 < layout.graphX || x1 > layout.graphX + layout.graphW) return;
  ctx.strokeStyle = colorOf(seg.senColor);
  ctx.lineWidth = seg.lineWidth;
  ctx.setLineDash(dashOf(seg.senStyle));
  strokeLine(ctx, x1, y, x2, y);
  ctx.setLineDash([]);
  if (seg.info !== '') {
    ctx.font = theme.font;
    ctx.fillStyle = theme.stringColor;
    const w = ctx.measureText(seg.info).width;
    ctx.fillText(seg.info, (x1 + x2) / 2 - w / 2, y - textH - 1);
  }
}

/**
 * ラベル列を重なり回避しながら描く(原典 :986-1078 / :1104-1136)。
 * - 同一駅(sameAsPrev)で「前の右端 + 文字幅×3 > 次の位置」なら 1 個に統合して中点へ
 * - 別駅で「前の右端 > 次の左端」なら重なりの半分ずつ左右へ押し広げて両方描く
 */
function drawLabelRun(
  ctx: RenderContext2D,
  layout: AllOperationDiagramLayout,
  view: AllOperationDiagramView,
  labels: readonly OperationDiagramEkimeiLabel[],
  y: number,
): void {
  for (let i = 0; i < labels.length; i++) {
    const cur = labels[i];
    if (cur === undefined || cur.text === '') continue;
    const nx = labels[i + 1];
    const xc = xOfSec(layout, view, cur.sec);
    const wc = ctx.measureText(cur.text).width;
    if (nx === undefined || nx.text === '') {
      ctx.fillText(cur.text, xc - wc / 2, y);
      continue;
    }
    const xn = xOfSec(layout, view, nx.sec);
    const wn = ctx.measureText(nx.text).width;
    if (nx.sameAsPrev) {
      if (xc + wc * 3 > xn) {
        // 統合して中点へ。次のラベルは消費済みとして飛ばす。
        ctx.fillText(cur.text, (xc + xn) / 2 - wc / 2, y);
        i++;
        continue;
      }
    } else if (xc + wc / 2 > xn - wn / 2) {
      const c = (xc + wc / 2 - (xn - wn / 2)) / 2;
      ctx.fillText(cur.text, xc - c - wc / 2, y);
      ctx.fillText(nx.text, xn + c - wn / 2, y);
      i++;
      continue;
    }
    ctx.fillText(cur.text, xc - wc / 2, y);
  }
}

function colorOf(colorref: number): string {
  const r = colorref & 0xff;
  const g = (colorref >> 8) & 0xff;
  const b = (colorref >> 16) & 0xff;
  return `rgb(${String(r)},${String(g)},${String(b)})`;
}

function dashOf(senStyle: string): number[] {
  switch (senStyle) {
    case 'hasen':
      return DASH_PATTERN.hasen;
    case 'tensen':
      return DASH_PATTERN.tensen;
    case 'ittensasen':
      return DASH_PATTERN.ittensasen;
    default:
      return [];
  }
}
