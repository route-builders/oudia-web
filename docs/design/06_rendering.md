# 描画エンジン設計

本書は OuDiaSecond Web 再実装における描画エンジン(`packages/render` および `packages/derive` のレイアウト計算)の設計書である。`docs/design/02_architecture.md` §5(レンダリング戦略)で確定した方針 — **ダイヤグラム = Canvas 2D × 4 レイヤ、時刻表 = Canvas 自前グリッド、entDgr レイアウトの忠実移植、DOM 仮想化グリッド・WebGL 不採用** — を実装可能な粒度まで具体化する。

原典の対応箇所: `DcDrawLib`(分析 §01 §6)、`entDgr` + `ViewDiagram`(分析 §05)、`CWndDcdGrid` + `CCellBuilder`(分析 §04)。

---

## 0. 全体構成と責務分割

```
packages/derive/
  diagram/computeDiagramLayout.ts   entDgr 移植。RosenFileData → DiagramLayout(純関数)
  diagram/estimateRessya.ts         createEstimateRessya 移植(通過時刻推定・乗継ソート共有)
  grid/cellSpec.ts                  CCellBuilder 圧縮。(viewModel, row, col) → CellSpec(純関数)
  grid/colSpec.ts                   CdXColSpecCont / CdYColSpecCont 移植(行列 ⇔ 意味の双方向対応)

packages/render/
  core/RenderTarget.ts              Canvas 2D コンテキストの薄いラッパ(クリップ・原点・DPI)
  core/ViewTransform.ts             Dgr 座標 ⇔ ビュー座標の線形変換(CconvContentPosToTarget 相当)
  core/textStyle.ts                 FontSpec → ctx.font 文字列(変換結果キャッシュ)
  core/primitives.ts                折れ線・破線・回転テキスト・縦書きテキスト・記号
  diagram/DiagramRenderer.ts        4 レイヤの描画本体
  diagram/hitTest.ts                列車線ヒットテスト(CEnumRessyasen + 距離判定)
  grid/GridGeometry.ts              行高・列幅の prefix-sum と座標 ⇔ 行列番号変換
  grid/GridRenderer.ts              セル描画・罫線・固定行列・部分再描画
  grid/GridEngine.ts                フォーカス・選択・スクロール・キーボードの統合(DOM イベント接続)
  print/PagedRenderer.ts            ページ分割描画(CaDcdGrid_PageSelector / CaDcdDiagram_PageSelector 相当)
```

責務の境界(02_architecture §3.3 の再掲 + 具体化):

- **derive**: 「何をどこに描くか」を決める。出力(`DiagramLayout` / `CellSpec`)はデバイス非依存・純データ。DOM / Canvas API を一切参照しない(Node で単体テスト可能)。
- **render**: 「どう描くか」だけを担う。入力はすべて引数(レイアウト + ビュー状態 + 表示オプション)。Zustand ストアを直接参照しない。
- **apps/web**: Canvas 要素の生成・リサイズ・イベント接続・rAF ループ・ストア購読とレンダラ呼び出し。

---

## 1. ダイヤグラム描画エンジン

### 1.1 座標系

3 つの座標系を区別する。名称は原典に揃える。

| 座標系           | 単位             | 内容                                                                                                                                             |
| ---------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Dgr 座標**     | 秒(整数)         | デバイス非依存のダイヤグラム座標。X = 午前 0 時からの経過秒(86400 超・負を許容)、Y = 駅間最小所要秒数の累積。`computeDiagramLayout` の出力座標系 |
| **ビュー座標**   | CSS px(浮動小数) | Canvas の CSS ピクセル。原典の Dcd(GDI 論理座標)に対応。描画・ヒットテストはこの座標系で行う                                                     |
| **デバイス座標** | 物理 px          | `CSS px × devicePixelRatio`。render 内部でのみ扱い(`ctx.setTransform(dpr,0,0,dpr,0,0)` を張って以後 CSS px で描く)、上位には見せない             |

#### X 軸(時刻 → x)

- `DgrX = 午前 0 時からの経過秒`。ダイヤグラム左端 = 路線プロパティの『ダイヤグラム起点時刻』(`kitenJikoku`)、全体幅は**常に 24 時間分(86400 秒)**。
- 日跨ぎ列車は差分累積により DgrX > 86400 になる(レイアウト側は正規化しない。描画時に ±86400 シフトで繰り返し描画する。§1.3)。

#### Y 軸(駅 → y)

原典 `CentDedDgrDia::readCentDedRosen_02` / `CentDedDgrEki::getDgrYZahyouKyoriOrg/Ter` を忠実移植する。

- 駅間の縦幅(秒):
  1. 駅の手動値 `nextEkiDistance` が設定されていればそれを両方向に使う。
  2. なければそのダイヤの全列車を走査して下り/上り別に最小所要秒数を求め、**両方向とも > 0 なら小さい方**、片方だけ > 0 ならその値。
  3. 両方向 0(列車なし・計算不能)なら既定駅間幅(路線プロパティ、**既定 60 秒**)。
- 駅の Y = 起点駅からの駅間幅の累積 + 上余白 `originExtraDisplaySpace`。上下余白(`originExtraDisplaySpace` / `terminalExtraDisplaySpace`。入出区・折返し記号用)は端駅(起点 / 終点)の在線表設定 `DiagramTrackDisplay` で 3 分岐する(原典 `readCentDedRosen_06_updateEkiContForOperation`、entDgr/CentDedDgrDia.cpp):
  - `0`(在線表なし): 既定駅間幅 ×1、運用機能レベル > 1 なら ×2。
  - `1`(発着形式): 運用機能レベルに関わらず既定駅間幅 ×1。
  - `2` / `3`(下り着 / 上り着形式): 0。
- 同関数の追加規則(v0.7 対象): 運用機能レベル > 1 のとき、途中駅が「下り着形式 → 上り着形式」の並びで、どちらかが在線表非表示なら、その駅間幅を既定駅間幅の 2 倍にする。
- 在線表表示駅は `(表示番線数 + 1) × 既定駅間幅` の縦空間を追加で持ち、Org(起点側)/ Ter(終点側)の 2 座標を持つ。番線ごとの横線 Y = `Org + (番線表示 index + 1) × 既定駅間幅`(v0.6 以降)。
- 全体 Y サイズ = 終端駅 Ter + 下余白。

#### 駅 Index と駅 Order

『駅 Index』= 下り基準の駅番号、『駅 Order』= 列車方向別の駅番号(上りは `size()-1-order`)。**`DiagramLayout` 内の列車・駅時刻・列車線はすべて駅 Order でインデックスする**(原典同型)。変換関数 `ekiIndexOfOrder / ekiOrderOfIndex` を `DiagramLayout` に持たせる。

#### ViewTransform(Dgr → ビュー座標)

`CconvContentPosToDcdTarget` 相当の線形変換。X / Y 独立。

```typescript
interface ViewTransform {
  readonly contentX: number; // ビュー左上に表示する DgrX(秒)
  readonly contentY: number; // ビュー左上に表示する DgrY(秒)
  readonly pxPerSecX: number; // DgrX 1 秒あたりの CSS px(既定 0.05。クランプ 0.0001〜10)
  readonly pxPerSecY: number; // DgrY 1 秒あたりの CSS px(同上)
}
// x_px = (dgrX - contentX) * pxPerSecX 、逆変換も提供
```

- 既定倍率は原典と同じ **0.05 px/秒(1 分 = 3px)**。クランプ範囲 0.0001〜10 も踏襲。
- リサイズ時は原典既定モード(`EModePosAndRate`)と同じく**倍率を保持し表示範囲が変わる**。`EModeZone`(表示範囲固定)は移植しない(OuDia 1.00.04 互換モードは需要がないため不採用と決定)。
- ズームは倍率を直接いじらず「表示 Dgr 範囲の離散増減 → 新しい範囲をビューポート px に割り付けて倍率を逆算」で実現する(§2.2)。
- **右下マージン**: 原典の `DIAGRAM_SIZE_MARGIN_DCD = 2`(論理座標 2 単位。ViewDiagram/CDcdDiagram.cpp:112。終端の横罫線・スジが画面右下端で欠けないための余裕)を踏襲し、表示範囲 → 倍率逆算時にビューポート px から右・下それぞれ 2px を控除する(Y 全体表示リセット時に終端駅の線が欠けないため)。

#### 画面レイアウト(CDcdDiagram2 相当)

ビューポートを「上 = 時ラベル行」「左 = 駅名欄」「残り = グラフ」に 3 分割する。

- 駅名欄の幅 = 駅名フォントの文字高 × 表示文字数(**既定 6 文字、最小 1**)+ 左右太罫線。
- 時ラベル行の高さ = 時刻フォントの行高 + 上下 2px。
- グラフ領域が ViewTransform の適用対象。時ラベル・駅名欄はそれぞれ X のみ / Y のみ変換に追従する。

### 1.2 描画パイプライン

```
RosenFileData ──(derive)──▶ DiagramLayout ──(render)──▶ 4 枚の Canvas
                 computeDiagramLayout        DiagramRenderer
                 (コマンド型ディスパッチで      (rAF、ダーティレイヤのみ、
                  列車単位 / 全体を再計算)       ビューポートカリング)
```

#### DiagramLayout(derive の出力)

```typescript
interface DiagramLayout {
  kitenJikoku: Seconds; // 左端 DgrX
  zone: { x: DgrZone; y: DgrZone }; // 全体範囲(X サイズは常に 86400)
  ekis: DgrEki[]; // 駅 Index 順。y座標(Org/Ter)・主要駅・在線表・個別背景色 index・駅名
  syubetsus: DgrSyubetsu[]; // 線スタイル・時刻表文字色・停車記号種別・親種別 index
  ressyaCont: [DgrRessya[], DgrRessya[]]; // [0]=下り / [1]=上り
}

interface DgrRessya {
  houkou: 0 | 1;
  syubetsuIndex: number;
  ressyabangou: string;
  ressyamei: string;
  gousuu: string;
  xZone: DgrZone; // 全列車線を含む X 範囲(始終同時刻なら例外的にサイズ 1)
  ekiJikokus: DgrEkiJikoku[]; // 駅 Order 順・駅数と同数
  ressyasens: DgrRessyasen[]; // 折れ線の直線区間列(0 本以上)
}

interface DgrEkiJikoku {
  ekiatsukai: Ekiatsukai; // 停車 / 通過 / 経由なし / 運行なし
  xChaku: Seconds | null; // 着 X(INT_MIN → null)
  xHatsu: Seconds | null; // 発 X
  xRessyasen: Seconds | null; // 中間駅での列車線交点 X(線形補間値。端点では null)
  ressyaTrackIndex: number | null;
  shouldRessyajouhouDraw: boolean; // この駅位置にラベルを描くか
}

interface DgrRessyasen {
  kitenEkiOrder: number; // 起点駅 Order(この 2 値のみ。座標は駅時刻から導出)
  syuutenEkiOrder: number;
}
```

原典の `CentDedDgr*` 群と同型。差分は INT_MIN → null のみ(02_architecture §4.1)。在線線(`DgrRessyaTrackLine`)は v0.6/v0.7 で同構造体に追加する。

#### 再計算の粒度(原典 OnUpdate 分岐の移植)

`computeDiagramLayout` は全体計算だが、コマンド型ディスパッチで増分更新する:

| コマンド型                                       | 再計算                                                                                                                                                                                                                                                                                                                                                                                  |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ressya/replaceRange` / `ressya/swap`            | 該当 `DgrRessya` のみ再構築(`readCentDedRessya` 相当の 1 列車パイプラインを公開関数 `computeDgrRessya(rosen, diaIndex, houkou, ressyaIndex, ekis)` として切り出す。v0.7 で前列車接続によるラベル抑止入力 `bRessyajouhouOmit` 相当が引数に加わる — §1.3 手順 3)。ただしパターンダイヤプレビュー中・運用機能有効時は全再構築(原典同様 — 駅間最小秒やプレビュー複製が他列車に依存するため) |
| `eki/*` / `syubetsu/*` / `rosen/*` / `diaProp/*` | 全再構築(駅間最小所要秒の再走査を含む)                                                                                                                                                                                                                                                                                                                                                  |
| 表示オプション変更                               | 再構築不要(render 側の再描画のみ)                                                                                                                                                                                                                                                                                                                                                       |

注意: 列車編集は駅間最小所要秒(= Y 座標)を変え得るが、原典同様**列車編集では Y を再計算しない**。メニュー[表示]-[更新]相当の「再計算して再描画」コマンドを提供する(原典仕様踏襲)。

#### 4 レイヤ構成(02_architecture §5.1 を基に確定)

同一サイズ・同一位置に `position:absolute` で重ねた 4 枚の `<canvas>`。**各 Canvas のサイズはビューポートサイズ(× dpr)であり、ダイヤ全体サイズではない**(スクロールは ViewTransform の contentX/Y 変更 + 再描画で表現し、巨大 Canvas を作らない)。この「ビューポートサイズ Canvas」の帰結として、L1〜L3 すべてがスクロール / ズーム / リサイズで再描画対象になる — 02_architecture §5.1 の初期表からダーティ契機を拡張しており(同表も本書に合わせて更新済み)、以下が確定版である。

| レイヤ     | 内容                                                           | ダーティ契機                                             |
| ---------- | -------------------------------------------------------------- | -------------------------------------------------------- |
| L1(最背面) | 背景色(基本 + 駅間個別 4 色)・縦罫線・横罫線・時ラベル・駅名欄 | スクロール・ズーム・リサイズ・駅/表示設定変更            |
| L2         | スジ(列車線)・在線表運用線(v0.6+)                              | レイアウト再計算・スクロール・ズーム・リサイズ           |
| L3         | 列車ラベル(回転)・停車駅明示 ○・入出区記号(v0.7+)              | 同上                                                     |
| L4(最前面) | 選択・ホバーのオーバレイ                                       | ポインタ移動(高頻度。このレイヤだけが独立して更新される) |

rAF ループはダーティフラグの立ったレイヤのみ全再描画する。原典の `ScrollWindow` 部分ブリット・OpenMP 並列・駅 Y キャッシュの永続化は移植しない(rAF 全再描画 + カリングで置換。ただし駅 → ビュー Y のフレーム内キャッシュ `Float64Array` は毎フレーム冒頭で構築する — `ReadYDcdCache` 相当で、スジ 1 本ごとの座標変換関数呼び出しを配列参照にする。キャッシュは駅 Index 基準の **Org-Y / Ter-Y の 2 配列**で持ち、スジ端点では列車方向に応じて参照を入れ替える — §1.3 手順 7)。

#### 描画順(L1 の内部、CDcdDiagram::DcDraw 忠実)

1. グラフ領域でクリップ。
2. 背景: 基本背景色で塗り、駅間個別背景色オプション ON なら駅間ごとに個別色(基本 + 4 色)。
3. 縦罫線: 8 択固定テーブル(原典 `m_arVline` そのまま移植)

   | mode    | pitch | middlePitch | boldPitch |
   | ------- | ----- | ----------- | --------- |
   | 0       | 1 分  | 5 分        | 30 分     |
   | 1(既定) | 2 分  | 10 分       | 60 分     |
   | 2       | 5 分  | 10 分       | 60 分     |
   | 3       | 10 分 | 30 分       | 60 分     |
   | 4       | 15 分 | 15 分       | 60 分     |
   | 5       | 20 分 | 20 分       | 60 分     |
   | 6       | 30 分 | 30 分       | 60 分     |
   | 7       | 60 分 | 60 分       | 60 分     |

   時刻が boldPitch の倍数 → 太線(2px)、middlePitch の倍数 → 実線(1px)、それ以外 → 細点線(`setLineDash([1,2])`)。色はすべて『縦横軸色』。開始位置は表示左端以降の最初のピッチ倍数。表示範囲内のみ描画。

4. 横罫線: 駅ごとに 1 本。主要駅 = 太線(2px)、一般駅 = 実線(1px)。在線表駅は Org/Ter の 2 本 + 番線線。上下余白境界も太線。
5. 時ラベル: 表示左端以降の**毎正時**に「時」数字を中央揃え(左右端はクリップ内に収まるよう位置調整)。
6. 駅名欄: 横罫線の延長 + 駅名テキスト(一般駅名非表示オプション時も起終点は常に表示)+ 在線表駅の番線名。

### 1.3 スジ折れ線の生成規則(computeDiagramLayout の核)

原典 `CentDedDgrRessya::readCentDedRessya` パイプラインを**手順番号ごと忠実移植**する。この順序・閾値が OuDia の見た目の同一性を決めるため、独自最適化・再設計をしない。

1. **(01) 属性読取**: 方向・種別・列車番号等。運休(`isCanceled`)ならスジなしで終了。
2. **(02) 駅時刻 → X 座標化**: 駅 Order 順に着 → 発の順で走査し、「直前の非 null 時刻との差分を累積加算」して X を作る(差分は 24h 循環の `subJikoku` 前提。日跨ぎで自然に 86400 超になる)。最初の非 null 時刻を基準に全体をシフト正規化。**通過駅で片方だけ時刻がある場合はもう片方へ複製**(長時間停車補完の誤発動防止)。列車の `xZone`(min〜max)を確定。
3. **(04) ラベル描画駅の決定**: 列車線の存在する駅間のうち (a) まだ 1 箇所も描画していなければ駅設定が「表示しない」以外の駅、(b)「常に表示」の駅、に `shouldRessyajouhouDraw = true`。該当ゼロなら最初の列車線位置に強制表示。原典はさらに引数 `bRessyajouhouOmit`(前列車から接続 — `FirstOperation` が `BOperation_Junction` かつ `RessyajouhouOmit` — のとき真)を持ち、真なら「既に 1 箇所描画済み」として初回表示・強制表示を抑止する(entDgr/CentDedDgrRessya.cpp `readCentDedRessya_04_updateShouldRessyajouhouDraw`)。この入力は**運用機能(v0.7)で追加**する(それまでは常に false 相当)。
4. **(05) 経由なし区間端の時刻補完**: 連続する経由なしの直前 / 直後で欠けている着・発を反対側からコピー。
5. **(06) 長時間停車の補完**: 「発時刻あり駅 →(時刻なし駅列)→ 着なし発あり駅」の並びで、`前駅発 + 区間最小所要秒 < 当駅発 - 60 秒` なら `当駅着 = 前駅発 + 区間最小所要秒` を補う(長時間停車を水平線で見せる)。対称形(着あり発なし側)も同様。**60 秒閾値は定数として移植**。
6. **(08) 折れ線分割**:
   - 起点探索: 「着・発いずれかの時刻があり、次駅 Order の駅扱が停車 or 通過」の駅。
   - 終点探索: 起点の次以降で「着・発両方の時刻がある」or「列車の終着駅」。終点候補に時刻がなければ始発方向へ後退。
   - 補正 4: 途中に「時刻指定のある主要駅」「時刻指定のある通過駅」があればそこで折る。
   - 補正 5: 線を張った後、中間駅の補間 X と実時刻の差が **60 秒以上**の駅があればそこで折って張り直す(リトライループ)。
   - 補正 6: 途中に経由なしを含む場合は直前まで短縮し、両端の着発を補間値に置換(**経由なし区間はスジを描かない**)。
   - 補正 7: 途中に在線表表示駅があれば必ず折る。
   - 次の起点 = 直前の終点として繰り返し。1 列車 = 0 本以上の直線区間の列。
   - **中間駅の X 補間**は区間確定時に自動実行: 区間両端の X(起点 = 発、終点 = 着)を**駅間 Y 距離(駅間最小秒の累積)の比で線形補間**し `xRessyasen` に設定。区間削除時はクリア。
7. **線分端点の座標**(描画時): 起点 =(起点駅の発 X、なければ着 X、駅の Ter-Y)→ 終点 =(終点駅の着 X、なければ発 X、駅の Org-Y)。ここでの **Ter-Y / Org-Y は列車方向基準で選択する**: 上り列車では駅 Index 基準の Org / Ter が入れ替わる(原典 `CentDedDgrDia::calcDgrPosRessyasenKiten/Syuuten` が `getDgrYPosOfEkiTer/Org(ERessyahoukou, iEkiOrder)` を呼び、Nobori では Org↔Ter を反転して返す — entDgr/CentDedDgrDia.cpp。分析 05 §4 の「(方向基準)」)。Org = Ter の駅(在線表なし)では差が出ないが、在線表表示駅(v0.6+)では区別しないと上り列車の端点 Y が在線表スペース分ずれる。停車は「停車駅自体が折り目(終点かつ次の起点)になる」ことで水平線として現れる(着 X ≠ 発 X の駅は必ず折り目)。

**日跨ぎ・24 時間繰り返し描画**(2 段構え、原典 `CRessyaDraw::execute` 忠実):

- (a) レイアウト内: 上記差分累積により X > 86400 を許容。
- (b) 描画時: 各列車について `shiftSecond` を「列車の xZone が表示域左端より左に来るまで -86400 ずつ → 表示域右端を超えるまで +86400 ずつ」動かしながら繰り返し描画する。0 時をまたぐ列車が左右両端の 2 箇所に描かれる。パターンダイヤプレビュー(実列車を ±Range 秒までサイクル秒ごとに複製列車としてコンテナ末尾に追加する方式。v0.8)もこの仕組みにそのまま乗る。

**推定時刻の逆生成**(`createEstimateRessya`): 列車線と駅横線の交点(= `xRessyasen`、なければ着発)から中間駅の推定時刻を持つ Ressya を生成する関数を derive に置き、時刻表ビューの通過時刻推定・乗継ソートと共有する。

### 1.4 種別スタイルの適用

種別 index → `DgrSyubetsu` → Canvas 線属性への変換(`CconvCentDed::CentDedRessyasyubetsu_to_CDcdFreeLineProp` 相当):

| 原典 ESenStyle                | Canvas                      |
| ----------------------------- | --------------------------- |
| 実線(SenStyle_Jissen)         | `setLineDash([])`           |
| 破線(SenStyle_Hasen)          | `setLineDash([6, 3])`       |
| 点線(SenStyle_Tensen)         | `setLineDash([2, 2])`       |
| 一点鎖線(SenStyle_Ittensasen) | `setLineDash([8, 3, 2, 3])` |

- 色 = 種別の `DiagramSenColor`。太さ = `DiagramSenIsBold ? 2 : 1`(CSS px。原典の論理幅 2/1 と同義)。
- ダッシュパターンの具体値は GDI の PS_DASH 等と厳密一致しない(GDI はデバイス依存)ため、上記を Web 版の確定値とする。線幅とともにズームに追従させない(常に固定 px — 原典も論理単位固定)。
- **親種別表示 ON** のとき `parentSyubetsuIndex >= 0` なら親種別の線属性・ラベル色に差し替える(描画時差し替え。レイアウトは不変)。
- 1 列車のスジは「moveTo → lineTo 連結の 1 パス」ではなく**直線区間ごとに 1 ストローク**とする(原典同型。折り目での line join の見た目差異を避け、区間単位のカリングを可能にするため)。同一列車・同一スタイルの連続区間は `beginPath` 内で複数セグメントをまとめて 1 回 `stroke()` する(状態切替コスト削減)。

### 1.5 ラベル配置(列車情報・停車記号)

**列車情報ラベル**(L3、`CRessyaDraw::RessyajouhouDraw` 忠実):

- 描画条件: `shouldRessyajouhouDraw` が真、かつその駅が列車線の**終点でない**こと。
- テキスト = (表示 ON なら)列車番号 + ' ' + 列車名 + ' ' + 号数 + "号"。色 = 種別の『時刻表文字色』。フォント = ダイヤ列車フォント。
- 位置と角度: 当該駅の発時刻位置(X, Y)をビュー座標に変換した点を基準に、**列車線のビュー座標での実傾き**に沿って回転:

  ```typescript
  // 下り: deg = 270 + atan(dxPx / dyPx) 、上り: deg = 90 - atan(dxPx / dyPx)(原典式そのまま)
  // dxPx = dxDgr * pxPerSecX, dyPx = dyDgr * pxPerSecY — 角度はズーム比に依存するため描画時に計算
  // 注意: deg は GDI lfEscapement(反時計回り)の角度。Canvas の rotate は y 軸下向き座標系で
  // 正 = 時計回りのため符号を反転して適用する。
  const rad = (-deg * Math.PI) / 180;
  ctx.save();
  ctx.translate(xPx, yPx);
  ctx.rotate(rad);
  ctx.fillText(text, 0, -(textHeight + 2)); // 線の上側にテキスト高 + 2px オフセット
  ctx.restore();
  ```

- ラベルの当たり判定・重なり回避は**行わない**(原典に存在しない。重なるのが OuDia の見た目)。
- 回転テキストはコストが高いため、**表示域と交差する列車のみ**描画する(スジと同じカリング。§3.2)。

**停車記号**(L3、`StopMarkDraw` 忠実): 停車駅明示オプション ON のとき、種別の停車記号種別が「停車時に描く」かつ駅扱 = 停車かつ停車秒 < 60(着発 X 差)かつ始発・終着駅でなく列車線終点でもない駅の発時刻位置に、**白抜き ○(塗り = 背景色、縁 = スジ色、半径 2.5px)**を描く。

**入出区記号・運用番号・路線外発着駅名・接続円弧**(L3)は在線表機能(v0.6/v0.7)で追加する。作業コード(-5〜5)分岐は `CRessyaDraw` の該当部を移植し、本書のレイヤ構成・カリングにそのまま載せる。

---

## 2. インタラクション

### 2.1 ヒットテスト(スジ選択)

原典 `CCalcCentDedDgrRessyasenOfPoint` を移植する。

1. ポインタ位置(ビュー座標)を中心にマージン矩形を作り、Dgr 座標に逆変換。
2. `CEnumRessyasen` 相当の列挙器で「その Dgr 矩形に交差し得る列車線」を列挙(方向 × 列車 × shiftSecond 繰り返し × 区間。xZone / 駅 Order 範囲で事前カリング)。
3. 各候補区間をビュー座標の線分にし、バウンディングボックス判定(垂直 / 水平線はサイズ 0 → 1 に補正)→ X 成分が長い線は `y = f(x)`、Y 成分が長い線は `x = f(y)` で点との距離を計算し、**マージン以内なら命中。最初の 1 本**(方向・列車 index・区間 index・shiftSecond)を返す。
4. パターンダイヤプレビューの複製列車は `index % 実列車数` で本体列車に還元(原典仕様)。

マージンは**マウス 4px / タッチ・ペン 12px**(CSS px)と確定する(原典は呼び出し側指定のため Web 版で決める)。

イベント割当:

| 操作                                    | 挙動                                                                                                                                                                                                |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ダブルクリック / ダブルタップ(列車線上) | 列車を特定 → 時刻表ビューのタブを開き該当列車・駅時刻セルへフォーカス(原典 `OnLButtonDblClk_openJikokuhyouView`)                                                                                    |
| ダブルクリック(駅名欄)                  | 駅のプロパティダイアログ                                                                                                                                                                            |
| ホバー(ポインタ移動)                    | **Web 版追加**: 命中スジを L4 に強調描画(同一列車の全区間を線幅 +2px の半透明同色で重畳)+ カーソル `pointer` + ツールチップ(列車番号・種別・列車名)。原典に無いが表示専用ビューのため互換を壊さない |
| シングルクリック                        | 命中スジを「選択」状態にして L4 に強調維持(Esc / 空白クリックで解除)。時刻表への遷移はしない(ダブルクリックのみ)                                                                                    |
| 右クリック                              | コンテキストメニューなし(原典踏襲。ブラウザ既定も抑止しない)                                                                                                                                        |

### 2.2 ズーム / パン

**ズームは倍率型にせず、原典の「表示 Dgr 範囲の離散増減」を踏襲する**(02_architecture §5.1 確定)。

- X 縮小 / 拡大: 表示幅を **30 分(1800 秒)単位**で増減。ダイヤ全体が画面内に収まっている場合は全体幅の 1/2 単位。拡大の下限 = 1 単位、縮小の上限 = ダイヤ全体端まで。横軸表示範囲は『ダイヤグラム起点時刻』をまたげない。
- Y 縮小 / 拡大: 表示高さを**ダイヤ全体 Y サイズの 1/10 単位**で増減(全体が収まっている場合は 1/2 単位)。上限は全体サイズの 10 倍。
- Y リセット: Y 表示範囲を全体(起点〜終点)に戻す。
- X / Y は完全に独立。範囲変更後、`pxPerSec = ビューポート px / 新範囲秒` で倍率を逆算し ViewTransform を更新(0.0001〜10 にクランプ)。
- プロパティダイアログで X =「左端時刻 + 幅(時:分)」、Y =「上端 % + 幅 %」の数値指定(原典 `CDlgDiagramViewProp` 踏襲)。

入力割当:

| 入力                                                 | 挙動                                                                                                | 由来                                           |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| ホイール(修飾なし)                                   | **縦スクロールのみ**。移動量 = 縦罫ピッチ × ノッチ数                                                | 原典忠実                                       |
| Shift + ホイール                                     | 横スクロール(同量)                                                                                  | Web 追加                                       |
| Ctrl + ホイール                                      | X 表示範囲の離散増減(上記 30 分規則。ブラウザのページズームは `preventDefault`)                     | Web 追加(離散規則は原典)                       |
| Ctrl + Shift + ホイール                              | Y 表示範囲の離散増減                                                                                | Web 追加                                       |
| ツールバー / メニュー / キー(原典アクセラレータ準拠) | X/Y 拡大縮小・Y リセット                                                                            | 原典忠実                                       |
| 矢印キー / Home / End / PgUp / PgDn                  | スクロール(原典と同じ移動量)                                                                        | 原典忠実                                       |
| **ポインタドラッグ**                                 | **パン(2 軸スクロール)**。`setPointerCapture` 使用。ドラッグ距離 4px 未満で離した場合はクリック扱い | Web 追加(原典はドラッグ無反応のため衝突しない) |
| ピンチ(タッチ 2 本)                                  | 軸ごとの離散ズームに量子化: ピンチの累積スケールが √2 を超えるたびに主方向の軸へ 1 段階適用         | Web 追加                                       |
| 指定列車番号へ移動                                   | 検索バーから該当スジ位置へスクロール(`setZoneCenter` 相当)                                          | 原典忠実                                       |

スクロール位置・罫線モード等の表示状態は localStorage に永続化(原典 .ini 相当。ビュー記述子をキーに含める)。

### 2.3 ドラッグ編集

**実装しない(確定)。** 原典のダイヤグラムビューは表示専用であり、ドラッグによる時刻修正・スジ引き(新規列車入力)は存在しない。編集は列車線ダブルクリック → 時刻表ビュー遷移で行う、という原典の動線を維持する。

将来拡張の余地としては次の 2 点のみ確保する(実装はしない):

- ヒットテストが「方向・列車 index・区間 index・駅 Order」まで返すため、将来「スジの区間ドラッグ → `ressya/replaceRange` コマンド生成」を足す場合も既存のコマンドチョークポイントに載る。
- L4(オーバレイ)がドラッグプレビュー描画の置き場になる。

### 2.4 タブ表示・ビューライフサイクル

- ダイヤグラムビューはビュー記述子 `{type:'diagram', diaName}` のタブとして開く(1 ダイヤ = 1 タブ、二重オープン防止。02_architecture §4.5)。上下ダイヤは同一ビュー内の表示 ON/OFF 重畳(原典踏襲。別ウィンドウ重ね合わせはない)。
- 非アクティブタブは rAF ループを停止し、レイアウト再計算要求フラグのみ保持 → アクティブ化時にまとめて再計算(原典 `m_bUpdate_All_Requested` 踏襲)。

---

## 3. 性能設計

### 3.1 目標(02_architecture §8.1 の内訳)

代表規模 500 列車 × 50 駅、フレーム予算 16.6ms に対する配分:

| 処理                               | 予算    | 備考                                                                                                                       |
| ---------------------------------- | ------- | -------------------------------------------------------------------------------------------------------------------------- |
| L4 のみ更新(ホバー)                | ≤ 2ms   | ポインタ移動時はこれだけ。ヒットテストは列挙カリング済みで ≤ 0.5ms                                                         |
| L1+L2+L3 全再描画(パン 1 フレーム) | ≤ 10ms  | 罫線 ≤ 1ms、スジ ≤ 5ms、ラベル ≤ 4ms                                                                                       |
| computeDgrRessya(1 列車)           | ≤ 0.5ms | 編集反映。列単位再計算                                                                                                     |
| computeDiagramLayout(全体)         | ≤ 100ms | 駅・種別編集時のみ。同期実行を許容(Worker に出さない — 全再構築は対話頻度が低く、転送コストが利益を上回るため不採用と決定) |

CI ベンチマーク(Vitest bench + happy-path の OffscreenCanvas 実測は Playwright)でレイアウト計算・描画コマンド発行数を追跡する。

### 3.2 仮想化 / カリング

- **列車カリング**(CEnumRessyasen 相当): 各列車の `xZone`(± shiftSecond)と表示 X 範囲の交差判定で列車単位にスキップ。次に区間単位で「起点 / 終点駅 Order が表示駅 Order 範囲 [displayOriginOrder, displayTerminalOrder] と交差するか」で区間スキップ(原典の事前カリングと同じ 2 段)。
- **表示駅 Order 範囲**は毎フレーム冒頭に表示 Y 範囲から二分探索で求める(駅 Y は昇順配列)。
- 罫線・時ラベルは表示範囲内のピッチ倍数のみ生成(全体を舐めない)。
- ラベル(回転テキスト)はスジと同じカリング結果を使い、さらに描画点が表示矩形の外(マージン = テキスト長)なら描かない。
- Canvas はビューポートサイズ固定(§1.2)。`devicePixelRatio > 2` の環境では描画上限 dpr = 2 にクランプする(Retina 以上の精細度はスジ描画では視認差がなく、ピクセル量が支配的コストのため)。

### 3.3 レイヤ分離と再描画最小化

- ダーティフラグはレイヤ単位: `dirtyL1 / dirtyL2L3 / dirtyL4`(L2 と L3 は常に同時に無効化されるため実質 3 区分)。
- ストア購読はコマンド型ディスパッチ(02_architecture §4.4): `ressya/*` → 該当 DgrRessya 再計算 + dirtyL2L3、`eki/* ほか` → 全再計算 + 全レイヤ、表示オプション → 該当レイヤのみ。スクロール / ズームは L1〜L3。
- rAF コールバックは「ダーティが 1 つでもあれば該当レイヤを描画してフラグクリア」。ダーティなしのフレームでは何もしない(常時 60fps でループを回さない。`requestAnimationFrame` は無効化イベント時にのみスケジュール)。
- 描画状態の切替(`strokeStyle` / `lineWidth` / `setLineDash` / `font`)は変更時のみ設定する(直前値をレンダラが記憶)。スジは種別ごとにグルーピングして描画順を並べ替え**しない**(原典は方向 × 列車 index 順で描画し、後勝ちの重なり順が見た目の一部のため。状態切替の削減は同一列車内のバッチングまでとする)。

### 3.4 メモリ

- `DiagramLayout` は数値配列中心の純データ(500 列車 × 50 駅で概算 2〜4MB)。列車単位再計算は該当 `DgrRessya` の差し替えのみで、レイアウト全体を immutable 再生成しない(derive の出力キャッシュはストア外。02_architecture §4.1)。
- フレーム内キャッシュ(駅 Y 配列)は `Float64Array` を使い回す。

---

## 4. 時刻表グリッドの描画

### 4.1 方式: Canvas 自前グリッド(確定)

02_architecture §5.2 の確定通り、DOM 仮想化グリッドは不採用。`CWndDcdGrid` 相当のグリッド基盤を render に実装し、時刻表・カスタマイズ時刻表・駅時刻表・駅時刻表一覧・駅 / 種別ビュー・運用系グリッドすべてを同一基盤に載せる。

DOM 構成(1 グリッドあたり):

```html
<div class="grid-root">
  <!-- position:relative、フォーカス保持(tabindex=0) -->
  <canvas class="grid-content" />
  <!-- セル・罫線・固定行列(ビューポートサイズ) -->
  <canvas class="grid-overlay" />
  <!-- フォーカス枠・選択ハイライト・連続入力中セル表示 -->
  <div class="grid-scroller">
    <!-- overflow:auto、ネイティブスクロールバー -->
    <div class="grid-spacer" />
    <!-- コンテンツ総サイズを持つ空 div -->
  </div>
  <input class="grid-ime-proxy" />
  <!-- フォーカスセル位置に重ねる透明 input(IME・キー捕捉) -->
  <div aria-live="polite" class="sr-only" />
  <!-- フォーカスセル内容の読み上げ通知 -->
</div>
```

- **スクロールはネイティブスクロールバー方式**: `grid-scroller` の scroll イベントでスクロール位置を取得し Canvas を再描画する。自前スクロールバー描画はしない(OS 慣習・タッチ慣性・アクセシビリティをブラウザに委ねる)。原典の Dgr 座標スクロールバー(`SetScrollInfo`)はこれで置換。
- Canvas は 2 枚: content(セル + 罫線 + 固定行列)と overlay(フォーカス・選択・編集中表示)。ダイヤグラムの 4 レイヤと違い、グリッドは「セル単位の部分再描画」が主戦略のため content を 1 枚に統合する。

### 4.2 ジオメトリ(GridGeometry)

- 行高・列幅はビューモデル構築時に一括計算し、**prefix-sum 配列**(`colX: Float64Array`, `rowY: Float64Array`)として保持する。座標 → 行列番号は二分探索、行列番号 → 座標は O(1)。数千列 × 数百行でも構築は 1ms 未満。
- 行高 = 行フォントの行高(px)+ 上下 2px。縦書き行(列車名・備考)は「対象列の最大文字数 × 文字高」で構築時に決定(原典の内容依存サイズを踏襲)。列幅 = 表示プロパティの列車幅文字数 × 全角文字幅(既定フォントの `measureText('あ')` で実測)。
- **固定行列**: 固定列数(時刻表では駅名 + 着発の 2)・固定行数(ヘッダ部)を GridGeometry が持ち、描画は 4 象限(固定コーナー / 固定行 / 固定列 / 可動ボディ)に分けてそれぞれ `ctx.save() → clip() → translate() → 描画 → restore()` する。スクロールオフセットはボディに X/Y 両方、固定行に X のみ、固定列に Y のみ適用。
- 行列 ⇔ 意味の対応は derive の **ColSpec**(`CdXColSpecCont` / `CdYColSpecCont` 移植)が持つ。X = [0:駅名, 1:着発, 2..:列車, 末尾:新規列車追加位置]、Y = ヘッダ部 + 駅ごと(着・入線・前作業・番線・後作業・発)+ 路線外終着 / 備考。行の有無は駅プロパティ × ビュートグルで決まり、**非表示行への参照は代替行に解決**する(`ColumnNumberFromSpec` 移植。フォーカス維持・スクロール位置維持の要)。
- **可視域のみの遅延評価**: ColSpec の「行列番号 → 意味」対応表自体は全域を構築する(駅数 × 行種別で高々数千エントリ、軽量)が、**セル内容(CellSpec)の評価は可視セル + ダーティセルに限定**する。原典の「ColSpec 遅延評価」はこの意味で実装する。

### 4.3 セル描画(cellSpec → 宣言的レンダラ)

CCellBuilder 群 2.4 万行は移植せず、derive の純関数に圧縮する(02_architecture §5.2 確定):

```typescript
interface CellSpec {
  text: string; // 表示文字列(記号 'ﾚ' '||' '・・' '----' '○' '====' を含む)
  fontIndex: number; // 表示プロパティのフォント表 index(種別フォント)
  color: Rgb; // 文字色(種別の時刻表文字色 / 通過灰色 128,128,128)
  bgColor: Rgb | null; // null = 既定背景。運休列車 = 灰 128,128,128、駅名列 = 見出し色
  align: 'left' | 'center' | 'right';
  vertical: boolean; // 縦書き(列車名・備考)
  borders: { top: BorderStyle; bottom: BorderStyle; left: BorderStyle; right: BorderStyle };
  attachRows?: number; // 縦セル結合(駅時刻表の時セル等。結合起点セルのみ >1)
}

function cellSpec(vm: JikokuhyouViewModel, row: number, col: number): CellSpec;
```

- 時刻書式・記号規則・色フォント規則(分析 §04 §7)は cellSpec 側の責務。レンダラは CellSpec を機械的に描くだけで、**時刻表固有の知識を持たない**。
- 通常テキスト: `ctx.fillText` + セル矩形クリップ。整列は `measureText` で計算(`textAlign` は 'left' 固定にし自前計算 — 固定小数の丸め差異を避ける)。
- 縦書き(`CDcdTextboxV3` 相当): Canvas に縦書きレイアウトはないため **1 文字ずつ縦に積んで描画**する(文字送り = フォント行高。長音・括弧の回転はしない — 原典も単純積み)。
- 罫線はセル描画と分離し、行 / 列単位でまとめて 1 ストローク(隣接セルの重複描画を避ける)。
- CellSpec は「可視セル + ダーティセル」のみ評価し、評価結果は `Map<row*colCount+col, CellSpec>` にキャッシュ、無効化はコマンド型ディスパッチで列単位 / 全体を選ぶ。

### 4.4 部分再描画と更新経路

原典 `InvalidateCell` / `updateUI_ReplaceRessya` の写像:

| 契機                               | 無効化                                                                                                                    |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `ressya/replaceRange`(列車編集)    | 該当列車列のみ: ColSpec の X 対応を範囲更新(挿入 / 削除で後続列をシフト)+ 該当列のセルキャッシュ破棄 + 該当列矩形の再描画 |
| `ressya/swap`                      | 2 列のみ                                                                                                                  |
| `eki/*` / `syubetsu/*` / `rosen/*` | ビューモデル・ColSpec・Geometry 全再構築 + 全再描画                                                                       |
| フォーカス移動・選択変更           | overlay のみ再描画(content 不変)                                                                                          |
| スクロール                         | content 全再描画(可視域変化。セルキャッシュは残るため CellSpec 再評価は新規可視分のみ)                                    |
| 表示トグル変更                     | 行構成が変わるもの(全時刻表示等)は ColSpec 再構築、書式のみ(秒表示等)はセルキャッシュ破棄 + 全再描画                      |

再描画は rAF に合流(同一フレーム内の複数無効化を 1 回に統合)。非アクティブタブは保留フラグ方式(§2.4 と同じ)。

### 4.5 フォーカス・選択・入力

- **フォーカスセル**: overlay に 2px 枠。移動時は自動スクロール(フォーカスセルが可視域に入るよう scroller の scrollLeft/Top を調整。固定行列域を除いた可視判定)。
- **選択**: 時刻表は列(列車)単位選択(`SelectMode_XColumn` 相当)。Shift + クリック / Shift + ←→ = 箱型範囲、Ctrl + クリック = 非連続個別選択(`CRandomSelect` 相当)。選択状態は「選択列 index の順序付き集合」で持ち、コマンド生成時に `CaMuiSelect` 相当の引数(選択 index 配列)へ写す。overlay に半透明ハイライト。
- **キー入力**: `grid-ime-proxy`(透明 input)が常にフォーカスを持ち、keydown をキーマップ(apps/web)へ転送する。文字 / 数字キーは「初期文字列付きダイアログ起動」(CKeyinputSenderToModalDlg 代替)、連続入力モード(Ctrl+T)は proxy の入力を分 2 桁ステートマシンに流し、編集中セル表示(`printf("%2d%-2s", 直前駅の時, 入力中分)` 相当)を overlay に描く。IME 変換ウィンドウがセル位置に出るよう proxy をフォーカスセル位置へ移動させる。
- **アクセシビリティ部分補償**: フォーカス移動のたびに aria-live 領域へ「駅名 行種別 セル内容」を書き込む。列車番号検索(検索バー)を全グリッドで提供(02_architecture §9.3)。

### 4.6 駅時刻表・一覧・その他グリッド

- 駅時刻表(読み取り専用): 同一基盤。X = [時, 列車 0..n]、Y = 時ごとに種別 / 分 / 行き先 /(番線)行。時セルは `attachRows` の縦結合で表現。バケツ分け(発時刻の時 → 分昇順)は derive のビューモデル構築が担う。
- 駅時刻表一覧・入出区連携コード一覧・交差支障チェック等も CellSpec 供給関数を差し替えるだけで同一レンダラに載る。
- カスタマイズ時刻表(v0.6)は ColSpec / cellSpec の供給側差し替え(列 = `CustomizeJikokuhyouContent` チェーン)であり、グリッド基盤・レンダラは共通。

---

## 5. 印刷・エクスポート

優先度は Tier4(v0.8 以降)だが、方式をここで確定する。

### 5.1 方式の決定

- **「画面用描画コードをそのまま印刷に流用する」原典の構図(CaDcdTargetZoomDisplay)を、ViewTransform のスケール差し替えで再現する。** render のレンダラは RenderTarget(§6)にのみ依存するため、出力先を OffscreenCanvas に替えるだけで同一コードが動く。
- 出力はビットマップ経由とする(Canvas 共用の帰結として**ベクタ印刷は不採用**。SVG / PDF ベクタ生成の二重実装はコード共用の利点を失うため棄却)。印刷解像度 300dpi 相当で描画するため実用上の品質劣化はない。

### 5.2 ブラウザ印刷パイプライン

1. ページ設定(余白上下左右 mm・ヘッダ / フッタ有無 — `CdPrintPageProp` 同型)を localStorage に永続化。用紙サイズは A4 縦 / 横等をユーザ選択(ブラウザの用紙設定と一致させる責務はユーザに提示)。
2. `PagedRenderer` が印刷対象(グリッド全域 / ダイヤグラムの現在表示範囲)を余白控除後のページ内寸(mm → px @300dpi、`scale = 300/96 = 3.125`)で X × Y ページに分割(グリッドは列 / 行境界で割る `PageSelector` 相当、ダイヤグラムは表示範囲 = 1 ページ起点の等分割)。
3. ページごとに OffscreenCanvas(ページ内寸 × 300dpi)へ描画: キャプション(路線名・ダイヤ名)+ ページ番号 + 本体(ViewTransform を 300dpi スケールで再構成 — フォント px も同率スケール)。
4. `convertToBlob({type:'image/png'})` → `<img>` を印刷専用 DOM(`@media print` でのみ表示、1 ページ 1 `<img>` + `break-after: page`)に並べ、`window.print()`。
5. **PDF 出力はブラウザの「PDF に保存」に委ねる。専用 PDF ライブラリ(jsPDF 等)は採用しない**(依存最小化。出力品質はブラウザ印刷と同一)。

印刷対応ビューは原典と同じ 10 種を上限とし、v0.8 では時刻表・ダイヤグラム・駅時刻表を先行する。

### 5.3 PNG エクスポート

- 対象: 「現在の表示範囲」または「ダイヤ全体(現在のズーム倍率)」をメニューから選択。
- OffscreenCanvas に描画して `convertToBlob` → ダウンロード(File System Access API があれば保存ダイアログ)。
- サイズ上限: 起動時(初回エクスポート時)に**実測プローブで検出**する(小さな Canvas から段階的に面積を上げ、描画結果を読み戻して成否確認 — canvas-size 方式)。プローブ不能な場合のフォールバックは **4096 × 4096 物理 px(面積 16.7M px)**とする。iOS Safari の Canvas 面積上限は約 16.7M px(4096 × 4096 相当)と報告されており、8192 × 8192(67.1M px)は超過して**黙って失敗する(空白 PNG になる)**ため上限として採用しない。超過時は収まる縮小率を提示して自動縮小する(タイル分割合成は行わない — 単一 PNG の需要に対し複雑さが見合わないため不採用)。
- クリップボードコピー(`navigator.clipboard.write` + `image/png`)も同経路で提供。

### 5.4 CSV

CSV 入出力(時刻表 / カスタマイズ / 運用表 / 駅時刻表)は `@oudia-web/format` の責務であり、描画エンジンは関与しない(参照: 02_architecture §6.1)。「表示設定込みの CSV」(原典 `CDlgOuJikokuhyouCsvExport`)は、グリッドのビューモデル + CellSpec のテキストを format の CSV エンコーダに渡す構成とし、書式ロジックの二重実装を避ける。

---

## 6. DcDrawLib の機能と Web 実装の対応表

方針: **抽象は「RenderTarget + ViewTransform」の 2 つだけ残し、それ以外の GDI 都合の機構は移植しない。**

### 6.1 RenderTarget(IfDcdTarget の縮約)

```typescript
interface RenderTarget {
  readonly ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
  readonly zone: { x: number; y: number; w: number; h: number }; // 描画領域(CSS px 相当の論理座標)
  withClip(zone: Zone, fn: () => void): void; // CaDcdTargetClip 相当
  withOffset(dx: number, dy: number, fn: () => void): void; // CaDcdTargetItemPosition 相当
}
```

`getDrawableZone`(ダーティ矩形)は**持たない** — 再描画最小化はレイヤ / セル単位で上位が制御する(§3.3, §4.4)。`createGdiXxxHolder` 群は不要(ctx への直接代入)。

### 6.2 対応表

| DcDrawLib / 原典機構                                                                       | Web 実装                                                                                                                                                                                                        | 区分                |
| ------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| `IfDcdTarget::getHdc()`                                                                    | `CanvasRenderingContext2D`(RenderTarget 経由)                                                                                                                                                                   | 標準 API            |
| `CDcdTargetOnPaint`(WM_PAINT)                                                              | 画面 Canvas + rAF ループ                                                                                                                                                                                        | 標準 API            |
| `CDcdTargetCompatibleBitmap`(ダブルバッファ)                                               | **不要**(Canvas はブラウザが合成。ちらつき無し)                                                                                                                                                                 | 消滅                |
| `CDcdTargetPrinter` / `CDcdTargetMfcPrintInfo`                                             | OffscreenCanvas + PagedRenderer(§5.2)                                                                                                                                                                           | 自作(小)            |
| `CaDcdTargetZoomDisplay`(印刷 DPI スケール)                                                | ViewTransform のスケール差し替え(300/96)                                                                                                                                                                        | 自作(小)            |
| `CaDcdTargetClip` / `CaDcdTargetItemPosition`                                              | `ctx.save() + clip()/translate() + restore()`(RenderTarget のヘルパ)                                                                                                                                            | 標準 API            |
| `CconvContentPosToTarget`(原点 + 倍率変換)                                                 | `ViewTransform` 自作(数十行。将来の描画バックエンド差し替え点)                                                                                                                                                  | 自作(小)            |
| `CGdiCache` + `CGdiHFont/HPen/HBrushHolder`                                                | **不要**。`FontSpec → ctx.font 文字列` の変換結果のみ Map キャッシュ(textStyle.ts)                                                                                                                              | 消滅                |
| `CdFontProp`(フォント名・高さ 3 態)                                                        | `{family, sizePx, bold, italic}`。pt 指定は `pt × 96/72` で px 化(9pt → 12px)。既定 `"Meiryo UI", Meiryo, "Hiragino Sans", sans-serif`(フォント同梱はしない。非 Windows 環境はフォールバックによる字形差を受容) | 自作(小)            |
| `CdPenProp`(色・太さ・線種)                                                                | `strokeStyle` / `lineWidth` / `setLineDash`(§1.4 の確定パターン)                                                                                                                                                | 標準 API            |
| `CdBrushProp` / `CdColorProp`                                                              | `fillStyle`。COLORREF(0x00BBGGRR)⇔ RGB 変換は format 層                                                                                                                                                         | 標準 API            |
| `CDcdLine` / `CDcdFreeLine`(直線・折れ線)                                                  | `beginPath / moveTo / lineTo / stroke`(primitives.ts)                                                                                                                                                           | 標準 API            |
| `CDcdRectangle` / `CDcdFillrect`                                                           | `strokeRect` / `fillRect`                                                                                                                                                                                       | 標準 API            |
| `CDcdFillrectRop`(ROP 塗り)                                                                | **不要**(XOR 描画の用途 = 選択表示はオーバレイレイヤの半透明塗りで代替)                                                                                                                                         | 消滅                |
| `CDcdText` / `CDcdTextbox`(枠内テキスト)                                                   | `fillText` + `measureText` + クリップ + 自前整列                                                                                                                                                                | 標準 API            |
| `CDcdTextboxV3` / `CVerticalTextElement`(縦書き)                                           | **自作**: 1 文字ずつ縦積み描画(§4.3。CSS `writing-mode` は Canvas に効かない)                                                                                                                                   | 自作(小)            |
| GDI 回転テキスト(`lfEscapement`)                                                           | `ctx.translate + rotate + fillText`(§1.5)                                                                                                                                                                       | 標準 API            |
| `Ellipse`(停車記号)                                                                        | `ctx.arc + fill + stroke`                                                                                                                                                                                       | 標準 API            |
| `CDcdGrid`(X/Y 列・罫線・セル)                                                             | **GridGeometry + GridRenderer 自作**(§4。prefix-sum + 4 象限クリップ)                                                                                                                                           | 自作(中)            |
| `CWndDcdGrid`(フォーカス・箱型 / 個別選択・キーボードナビ・自動スクロール・InvalidateCell) | **GridEngine 自作**(§4.4–4.5。DOM イベント + overlay Canvas + ネイティブスクロールバー)                                                                                                                         | 自作(大)            |
| `CaDcdGrid_PageSelector` / `CaDcdDiagram_PageSelector`                                     | PagedRenderer(§5.2)                                                                                                                                                                                             | 自作(小)            |
| `ScrollWindow` 部分スクロールブリット                                                      | **不要**(rAF 全再描画 + カリング。§1.2)                                                                                                                                                                         | 消滅                |
| `SetScrollInfo` / `CdScrollbarProp`                                                        | ダイヤグラム: 自前(ドラッグパン + キー)。グリッド: ネイティブスクロールバー(spacer div)                                                                                                                         | 標準 API + 自作(小) |
| OpenMP 並列描画 + GDI critical section                                                     | **不要**(単一スレッド Canvas で予算内。§3.1)                                                                                                                                                                    | 消滅                |
| `CLineFunc`(直線計算)                                                                      | hitTest.ts 内の線分距離関数として移植                                                                                                                                                                           | 自作(小)            |
| `CconvDcDrawProp`(描画プロパティ ⇔ 文字列)                                                 | format 層(oud2 のフォント・色文字列の読み書き)に移管。render は数値化済み Spec を受ける                                                                                                                         | 移管                |
| devicePixelRatio(GDI に相当なし)                                                           | 全 Canvas で `物理 px = CSS px × min(dpr, 2)`、`setTransform` で論理座標 = CSS px に統一(§3.2)                                                                                                                  | 新規                |

### 6.3 テキストメトリクスに関する注意(確定事項)

GDI と Canvas でフォントメトリクスは一致しない。**見た目のピクセル一致は互換目標に含めない**(バイト互換はファイルのみ)。セル寸法・駅名欄幅など「文字高 / 文字幅基準」のレイアウトは `measureText` / `TextMetrics.actualBoundingBoxAscent+Descent` の実測値から計算し、構造(行列構成・折れ線形状・記号・色)の同一性を互換の基準とする。render のスナップショットテストは描画コマンド列(モック ctx への呼び出し記録)を主とし、ピクセル比較は回帰検知の補助に留める(02_architecture §7.2)。
