# ダイヤグラムビュー(スジ描画)分析

対象: `origin/DiagramEdit/DiagramEdit/ViewDiagram/`、`origin/DiagramEdit/DiagramEdit/entDgr/`、マニュアル `origin/DiagramEdit/manual/oudia_manual/c03_reference/c06_diagramview/`

## 1. 概要

ダイヤグラムビューは「横軸=時刻、縦軸=駅」の平面に列車を斜め線(スジ、原文では『列車線』=Ressyasen)として描画するビュー。実装は3層に分離されている。

| 層                     | 名前空間/場所                         | 責務                                                                                                                               |
| ---------------------- | ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| ドメイン               | `entDed` (対象外、他エージェント担当) | 路線・駅・列車・駅時刻の生データ                                                                                                   |
| 描画用中間エンティティ | `entDgr` (`entDgr/`)                  | 時刻データから**デバイス非依存の座標**(『ダイヤグラムエンティティ座標系』、以下 Dgr座標)を計算し、折れ線(列車線)へ分解して保持する |
| ビュー                 | `ViewDiagram` (`ViewDiagram/`)        | Dgr座標→デバイス座標(Dcd座標=GDI論理座標)への変換、罫線・スジ・ラベル・在線表の実描画、スクロール・ズーム等のUI                    |

この分離は entDgr/entDgr.h の名前空間コメントに明記されている:「この名前空間では、ダイヤグラムの各要素の座標を、描画するデバイスに依存しない形式で保持します。これらの座標をデバイス固有の形式に変換するのは、CDcdDiagram, CDcdDiagram2 の責務です」。

ビューの MFC 構成: `CDedDiagramDoc`(ドキュメント。保持するのは**ダイヤ名文字列のみ**。1ダイヤ=1ドキュメント) → `CDedDiagramView`(CView派生。`CentDedDgrDia` を生成・保持、メニューコマンド処理) → `CWndDiagram`(子ウィンドウ。スクロールバー・マウス/キー入力・再描画) → `CDcdDiagram2`(枠(時ラベル・駅名欄)+グラフ全体) → `CDcdDiagram`(グラフ部分のみ) → `CRessyaDraw`(スジ・ラベル・停車記号・在線線の実描画)。

## 2. 座標系(最重要)

### 2.1 X軸(時刻)

- **DgrX = 午前0時からの経過秒数**(単位: 秒)。`24*60*60`(86400) 以上にも負にもなり得る(CentDedDgrDia.h のクラスコメント)。
- ダイヤグラム左端 `m_iDgrXPosMin` = 路線プロパティの『ダイヤグラム起点時刻』`CentDedRosen::getKitenJikoku().getTotalSeconds()`(CentDedDgrDia.cpp `readCentDedRosen_01_updateCentDedDgrDiaProp`)。
- 全体範囲は `CentDedDgrDia::getZone()`: X = `(m_iDgrXPosMin, サイズ 24*60*60)` — **常に24時間分**。

### 2.2 Y軸(駅)

- **DgrY の単位も「秒」**。駅間の縦幅は**実キロではなく「駅間最小所要秒数」**(その駅間を走る全列車の最短所要時間)を使う。つまりダイヤの傾きが最大45度相当で揃うようにする発想。
- 駅間幅の決定 (`CentDedDgrDia::readCentDedRosen_02_updateEkiCont`, CentDedDgrDia.cpp):
  - 駅の `NextEkiDistanceIsDefault` が真 → 下り方向・上り方向それぞれについて `CentDedRessyaCont::findEkikanSaisyouSec()` で**そのダイヤの全列車を走査して最小所要秒数を求める**(`m_iEkikanSaisyouSecKudari` / `m_iEkikanSaisyouSecNobori`)。
  - 偽 → 駅に手動設定された `CentDedEki::getNextEkiDistance()`(秒) をそのまま両方向に使う。
- 実際の駅間幅 `CentDedDgrEki::getDgrYZahyouKyoriOrg()/Ter()` (CentDedDgrEki.cpp):
  - 下り最小秒数と上り最小秒数が両方 >0 → **小さい方**。片方だけ >0 → その値。
  - 両方 0(列車設定なし・計算不能) → 既定駅間幅 `m_iDgrYSizeEkikanDefault`(**既定 60 秒**。路線プロパティ `getDiagramDgrYZahyouKyoriDefault()` 由来)。
  - `Org` 版はさらに在線表表示スペース `m_iEkiTrackDisplaySpace` を加算(`Ter` 版は加算しない)。
- 駅の DgrY 座標 = 起点駅からの駅間幅の累積 + `m_iOriginExtraDisplaySpace`(上余白)。`CentDedDgrDia::getDgrYPosOfEkiOrg(iEkiIndex)` / `getDgrYPosOfEkiTer(iEkiIndex)`。在線表表示駅では Org=駅表示空間の起点側、Ter=終点側の座標(在線表がなければ同値)。
- **上下余白** `m_iOriginExtraDisplaySpace` / `m_iTerminalExtraDisplaySpace` (`readCentDedRosen_06_updateEkiContForOperation`): 起点/終点駅で入出区・折返し記号を描くための余白。在線表なしの端駅では既定駅間幅×1(運用機能レベル>1なら×2)、在線表(発着形式)ならば×1、それ以外は0。
- **在線表(在線表示)スペース**: 在線表表示駅は `(表示番線数+1) × m_iDgrYSizeEkikanDefault` の縦空間を持ち、番線ごとの横線Y座標は `getDgrYPosOfEkiTrack()` = 駅Org + `(番線表示Index+1)×既定駅間幅`。省略番線は `m_iDiagramTrackIndex[]` に INT_MIN。
- Y全体サイズ = `getDgrYPosOfEkiTer(INT_MAX) + TerminalExtraDisplaySpace`(`getZone()`)。

### 2.3 駅Index と 駅Order

- 『駅Index』= 下り基準の駅番号(0=下り起点)。『駅Order』= 列車方向別の駅番号。変換は `CentDedDgrDia::EkiIndexOfEkiOrder()` / `EkiOrderOfEkiIndex()`(上りは `size()-1-iEkiOrder`)。entDgr の列車・駅時刻・列車線はすべて**駅Order**でインデックスされる。

### 2.4 Dgr座標 → デバイス座標(Dcd)変換

- `CDcdDiagram` が `CconvContentPosToDcdTarget m_CconvContentPosToDcdTarget`(DcDrawLib) を保持。X/Y独立に「ContentPos(左上に表示するDgr座標)」と「TargetPosPerContent(Dgr 1 あたりの論理座標数)」を持つ線形変換。
- 既定倍率 `DEFAULT_DCD_PER_DGR_X() = DEFAULT_DCD_PER_DGR_Y() = 0.05`(=1秒0.05論理単位。1分=3単位)。`adjustProp()` で 0.0001~10 にクランプ (CDcdDiagram.cpp)。
- 変換 API: `XDgrToDcd/YDgrToDcd/XDgrFromDcd/YDgrFromDcd/DgrToDcd/DgrFromDcd`(点・Zone両対応)。
- 2モード (`setKeepZoneDgrOnSize`): `EModePosAndRate`(ウィンドウリサイズで表示範囲が変わる。既定) / `EModeZone`(表示範囲固定=OuDia 1.00.04 互換)。
- 右下に `DIAGRAM_SIZE_MARGIN_DCD = 2`(論理座標)の余裕を持たせ、終端の線が画面外に消えないようにしている。

### 2.5 ズームの実体

ズーム倍率を直接いじるのではなく、**「表示する Dgr 範囲 (Zone_Dgr) のサイズを変更する」**ことで実現(cdeddiagramview.cpp):

- 横軸縮小/拡大 `OnDiagramXDgrSize{Inc,Dec}_Process`: 表示幅を **30分単位**で増減(ダイヤ全体が画面内に収まっている場合は全体幅の1/2単位)。拡大の下限=1単位、縮小の上限=ダイヤ全体端まで。
- 縦軸縮小/拡大 `OnDiagramYDgrSize{Inc,Dec}_Process`: 表示高さを**ダイヤ全体Y サイズの 1/10 単位**で増減(全体が収まっている場合は 1/2 単位)。上限は全体サイズの10倍。
- 縦軸リセット `OnDiagramYDgrSizeReset_Process`: Y表示範囲を全体(起点~終点)に戻す。
- X/Y は完全に独立。プロパティダイアログ(`CDlgDiagramViewProp`)では X を「左端時刻+幅(時:分)」、Y を「上端%+幅%」で数値指定できる(マニュアル c08_dialog/c11_dlgdiagramviewprop)。横軸表示範囲は『ダイヤグラム起点時刻』をまたげない。

## 3. entDgr クラスカタログ

| クラス                             | ファイル                         | 役割・主要フィールド                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ---------------------------------- | -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CentDedDgrDia`                    | CentDedDgrDia.h/.cpp             | ルートコンテナ。`m_strName`, `m_iDgrXPosMin`, `m_iDgrYSizeEkikanDefault`, `m_iEnableOperation`, `m_iOriginExtraDisplaySpace`, `m_iTerminalExtraDisplaySpace`, `m_iPatternDiagramPreviewCycleSecond/Range`。包含: `m_CentDedDgrEkiCont`(駅Index順), `m_MuCentDedDgrRessyasyubetsu`, `m_CentDedDgrRessyaCont[2]`([0]=下り,[1]=上り)。`readCentDedRosen()` で entDed から全構築                                                                                                                                                                                                                  |
| `CentDedDgrEki`                    | CentDedDgrEki.h/.cpp             | 駅1つ。`m_strEkimei`, `m_bIsSyuyoueki`(主要駅), `m_iEkikanSaisyouSecKudari/Nobori`(次駅までの方向別最小秒), `m_iDgrYSizeEkikanDefault`, `m_eDiagramRessyajouhouHyoujiKudari/Nobori`(列車情報表示: Origin/Anytime/Not), 分岐駅`m_iBrunchCoreEkiIndex`/`m_bBrunchOpposite`, 環状線`m_iLoopOriginEkiIndex`/`m_bLoopOpposite`, 在線表`m_iDiagramTrackDisplay`(0=なし,1=発着,2=下り着,3=上り着)・`m_iDiagramTrackIndex`(省略番線=INT_MIN)・`m_iEkiTrackDisplaySpace`, 個別背景色`m_iDiagramColorNextEki`(0=基本,1-4=個別), 路線外発着駅名`m_strOuterTerminalEkimei`, 番線`m_MuCentDedDgrEkiTrack2` |
| `CentDedDgrEkiCont`                | CentDedDgrEkiCont.h/.cpp         | 駅コンテナ。`getMuPtr(ERessyahoukou)` で方向別ビュー(`CdDedDgrEki`)を提供                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `CentDedDgrEkijikoku`              | CentDedDgrEkijikoku.h            | 列車×駅の時刻。`m_eEkiatsukai`(駅扱: 停車/通過/経由なし/運行なし), `m_iDgrXPosChaku`, `m_iDgrXPosHatsu`(着・発のDgrX。**INT_MIN=NULL**), `m_iDgrXPosRessyasen`(列車線中間駅での「列車線と駅横線の交点」X。端点ではNULL), `m_iRessyaTrackIndex`, `m_bShouldRessyajouhouDraw`(この駅位置に列車番号等を描くか)。`getDgrXPosChaku(bHatsuIfNull)`=着がNULLなら発で代用(逆も)                                                                                                                                                                                                                       |
| `CentDedDgrRessya`                 | CentDedDgrRessya.h/.cpp          | 列車1本。`m_bIsNull`, `m_eRessyahoukou`, `m_iRessyasyubetsuIndex`, `m_strRessyabangou/Ressyamei/Gousuu`, `m_DgrXZone`(全列車線を含むX範囲。始終同時刻なら例外的にサイズ1)。包含: 駅数分の `CentDedDgrEkiJikoku`, `CentDedDgrRessyasenCont`, `CentDedDgrRessyaTrackLineCont`。`readCentDedRessya()` が構築パイプライン                                                                                                                                                                                                                                                                         |
| `CentDedDgrRessyasen`              | CentDedDgrRessyasen.h            | 折れ線の1直線区間。`m_iRessyasenKitenEkiOrder`(起点駅Order), `m_iRessyasenSyuutenEkiOrder`(終点駅Order) の2値のみ。座標は駅時刻とDiaから導出                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `CentDedDgrRessyasenCont`          | CentDedDgrRessyasenCont.h/.cpp   | 列車線コンテナ。**insert/set 時に自動で中間駅の `m_iDgrXPosRessyasen` を線形補間で設定**、erase 時にクリア(`setDgrXPosRessyasen()`)                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `CentDedDgrRessyasyubetsu`         | CentDedDgrRessyasyubetsu.h       | 種別の描画属性。`m_colorJikokuhyouMojiColor`(文字色=ダイヤ上のラベル色兼用), `m_CdDiagramLineStyle`(線色+線種+太線フラグ), `m_eStopMarkDrawType`, `m_iParentSyubetsuIndex`(親種別。-1=なし)                                                                                                                                                                                                                                                                                                                                                                                                   |
| `CentDedDgrEkiTrack2`              | CentDedDgrEkiTrack2.h            | 番線(名称・上下略称)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `CentDedDgrRessyaTrackLine`(+Cont) | CentDedDgrRessyaTrackLine.h ほか | 在線表上の「在線線」。`m_iEkiOrder`, `m_iTsuukaTeisya`, `m_iChakuOperation`/`m_iHatsuOperation`(着側/発側作業コード: -5~5。-1=通常発着, -2=分岐方向発着(補助列車線描画), 3=出区○/入区△, 4=路線外始発/終着, 5=前/次列車接続 等), `m_bIsTrackDisplay`, `deque<Zaisen> m_contZaisen`(Zaisen={番線,着X,発X,運用番号})                                                                                                                                                                                                                                                                             |
| `CEnumRessyasen`                   | CEnumRessyasen.h/.cpp            | 指定Dgr領域に交差し得る列車線を列挙するループエンジン(仮想関数 `onCentDedDgrRessyasen()` をコールバック)。ヒットテスト等の基底                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `CDedRessyaSoater_Transfer`        | CDedRessyaSoater_Transfer.h/.cpp | 『乗継ソート』。推定時刻(`createEstimateRessya`)を使って時刻表ビューの列車並び順を決めるソーター(ダイヤグラム描画そのものには不使用)                                                                                                                                                                                                                                                                                                                                                                                                                                                          |

### entDed ↔ entDgr の対応

| entDed (ドメイン)             | entDgr (描画用)                                     | 変換箇所                                                                         |
| ----------------------------- | --------------------------------------------------- | -------------------------------------------------------------------------------- |
| `CentDedRosen` + `CentDedDia` | `CentDedDgrDia`                                     | `CentDedDgrDia::readCentDedRosen()`                                              |
| `CentDedEki`                  | `CentDedDgrEki`                                     | `readCentDedRosen_02_updateEkiCont`(+ 全列車走査で駅間最小秒を決定)              |
| `CentDedRessyasyubetsu`       | `CentDedDgrRessyasyubetsu`                          | `readCentDedRosen_03_updateMuRessyasyubetsu`                                     |
| `CentDedRessya`               | `CentDedDgrRessya`                                  | `readCentDedRosen_04_updateRessyaCont` → `CentDedDgrRessya::readCentDedRessya()` |
| `CentDedEkiJikoku`(時:分等)   | `CentDedDgrEkiJikoku`(絶対秒X座標)                  | `readCentDedRessya_02_CreateCentDedEkiJikoku`                                    |
| ― (導出)                      | `CentDedDgrRessyasen` / `CentDedDgrRessyaTrackLine` | `readCentDedRessya_08` / `_11`                                                   |

逆方向の変換として `CentDedDgrDia::createEstimateRessya()/createEstimateRessya2()` があり、列車線から**推定時刻**(中間駅=列車線と駅線の交点時刻)を書き込んだ `CentDedRessya` を生成する(時刻表ビューの通過時刻推定・乗継ソートに利用)。

## 4. 列車線(スジ)構築アルゴリズム — `CentDedDgrRessya::readCentDedRessya()`

パイプライン(CentDedDgrRessya.cpp 5384行~):

1. **(01) 属性読取** `readCentDedRessya_01_readProp`: 方向・種別Index・列車番号・列車名・号数。運休(`isCanceled()`)ならここで終了(スジなし)。
2. **(02) 駅時刻→X座標** `readCentDedRessya_02_CreateCentDedEkiJikoku`:
   - 駅Order順に着→発の順で走査。「直前の非NULL時刻とのその差分を累積加算」してX座標を作る。これにより**日跨ぎ列車は 86400 超のX座標**になる(例: 23:00発→1:00着は X=82800→90000)。最初の非NULL時刻は `shiftDgrXPos()` で基準に正規化。
   - 通過駅で片方だけ時刻がある場合はもう片方に複製(長時間停車補正の誤発動防止)。
   - 列車の `m_DgrXZone`(min~max)を確定。
3. **(04) 列車情報描画位置** `readCentDedRessya_04_updateShouldRessyajouhouDraw`: 列車線の存在する駅間のうち、(a) まだ1箇所も描画していなければ駅の設定が「表示しない」以外の駅、(b) 「常に表示」の駅、に `m_bShouldRessyajouhouDraw=true`。該当ゼロなら最初の列車線位置に強制表示。前列車から同一列車扱いで接続している場合は「既に表示済み」として扱う。
4. **(05) 経由なし区間の端の時刻補完** `readCentDedRessya_05_complementKeiyunasiSide`: 連続する経由なしの直前/直後で欠けている着・発時刻を反対側からコピー。
5. **(06) 長時間停車の補完** `readCentDedRessya_06_complementLongStop_01/_02`: 「発時刻あり駅 → (時刻なし駅列) → 着なし発あり駅」の並びで、`前駅発+区間最小所要秒 < 当駅発-60秒` なら 当駅着 = 前駅発+区間最小所要秒 を補う(=長時間停車を水平線で見せるため)。_02 は対称(着あり発なし側)。
6. **(08) 列車線分割** `readCentDedRessya_08_updateRessyasenCont`: 折れ線化の本体。
   - **起点探索**(`_01_calcRessyasenKiten`): 「着・発いずれかの時刻があり、次駅Orderの駅扱が停車or通過」の駅。
   - **終点探索**(`_02_calcRessyasenSyuuten`): 起点の次以降で「着・発両方の時刻がある」or「列車の終着駅」。終点候補に時刻がなければ始発方向へ後退。
   - **補正4**(`_04`): 起点-終点間の途中に「時刻指定のある主要駅」または「時刻指定のある通過駅」があればそこで折る。
   - **補正5**(`_05`): 一旦線を張った後、中間駅の補間位置 `m_iDgrXPosRessyasen` と実時刻の差が **60秒以上**ある駅があればそこで折り、線を張り直す(リトライループ)。
   - **補正6**(`_06_reduceToKeiyunasi`): 線の途中に『運行なし(経由なし)』を含む場合、その直前までに短縮し、直前/直後駅の着発を補間値に置換(**経由なし区間はスジが描かれない**。両端は補間時刻で切れる)。
   - **補正7**(`_07_reduceToTrackDisplay`): 途中に在線表表示駅があればそこで必ず折る(着発を補間値に置換)。
   - 次の起点=直前の終点として繰り返し。**1列車=0本以上の直線区間(CentDedDgrRessyasen)の列**になる。
   - **中間駅の補間**は `CentDedDgrRessyasenCont::setDgrXPosRessyasen()`(CentDedDgrRessyasenCont.cpp)が insert 時に自動実行: 区間両端の X(起点=発, 終点=着)を、**駅間Y距離(=駅間最小秒の累積, `calcDgrYEkikanSize`)の比で線形補間**。
7. **(11) 在線線構築** `readCentDedRessya_11_updateRessyaTrackLineCont`: 始発・終着駅の入出区/接続/増解結等の運用情報(`CentDedBefore/AfterOperationCont`)から `CentDedDgrRessyaTrackLine` を生成。

### 線分の端点座標(描画時)

`CentDedDgrDia::calcDgrPosRessyasenKiten/Syuuten()` (CentDedDgrDia.cpp):

- 起点 = (起点駅の**発**X(なければ着) + iShiftSecond, 起点駅の `getDgrYPosOfEkiTer`(方向基準))
- 終点 = (終点駅の**着**X(なければ発) + iShiftSecond, 終点駅の `getDgrYPosOfEkiOrg`(方向基準))

停車駅では「着で折れて水平線(停車)、発で再び斜め」という表現は、**停車駅自体が列車線の折り目(=終点かつ次の起点)になる**ことで実現される(着X≠発Xの駅は必ず折り目になる)。

## 5. 描画(ViewDiagram)

### 5.1 レイアウト — `CDcdDiagram2`

- ウィンドウ全面を「上=時ラベル行」「左=駅名欄」「残り=グラフ(CDcdDiagram)」に分割。`calcJikokuZoneDcd()/calcEkimeiZoneDcd()/calcDiagramZoneDcd()` (CDcdDiagram2.cpp)。
- 駅名欄の幅 = **全角基準文字『岡』を `m_iEkimeiLength` 個並べた文字列の実測幅**(`getCDcdTextEkimei()` が基準文字列を生成し、`calcEkimeiZoneDcd()` が `getItemSize` で実測。CDcdDiagram2.cpp)+左右の太罫線(論理幅2×2)。ヘッダコメントの「文字高×文字数」は等幅・正方形グリフ前提の近似で、Web再実装ではフォントサイズ×N ではなく基準文字列の実測幅で求めないと欄幅がずれる。`m_iEkimeiLength` は `CdDedDispProp` 由来で**既定6、範囲1~29**(`setEkimeiLength` でクランプ。DedRosenFileData/CdDedDispProp.cpp:114, 333-337)。
- 時ラベル: ダイヤ左端以降の**毎正時**に「時」の数字を中央揃えで描画(左右端でクリップ調整)。
- 駅名欄: 駅ごとの横罫線(主要駅=太線)、駅名テキスト(オプションで一般駅名非表示 `m_bHideIppanekiEkimei`。ただし起終点は常に表示)、在線表駅は番線名も表示。個別背景色にも対応。
- フォント既定はすべて `CdFontProp(9, "Meiryo UI")`。ダブルバッファリング対応(`m_bDoubleBuffering`)。

### 5.2 グラフ部分 — `CDcdDiagram::DcDraw()` (CDcdDiagram.cpp)

描画順:

1. ダイヤ範囲でクリップ(`CaDcdTargetClip`)。
2. **背景**: 基本背景色で塗り、`DisplayBackColorNextEki` 有効時は駅間ごとの個別背景色(`m_colorDiaBackColor[]`、`CentDedEki::DIAGRAMBACKCOLOR_COUNT`=基本+4色)。
3. **縦罫線**(時刻グリッド): `m_arVline[8]` テーブルから `m_idxVlineMode`(既定1=2分目)で選択。`{pitch, middlePitch, boldPitch}`(秒) =
   `{1分,5分,30分} {2分,10分,60分} {5分,10分,60分} {10分,30分,60分} {15分,15分,60分} {20分,20分,60分} {30分,30分,60分} {60分,60分,60分}`。
   位置が boldPitch の倍数→太線(幅2)、middlePitch の倍数→実線(幅1)、それ以外→点線(LINESTYLE_DOT2)。色はすべて『縦横軸色』`m_colorDiaJikuColor`。開始位置はダイヤ左端以降の最初のピッチ倍数時刻。
4. **横罫線**(駅線): 駅ごとに1本。主要駅=太線(幅2)、一般駅=実線(幅1)。在線表駅は起点側・終点側の2本+番線ごとの線。上下余白の境界線も太線。
5. **列車線・列車情報・停車記号・在線線**: `CRessyaDraw(this, target, 下り表示, 上り表示, 親種別表示).execute()` に一括委譲。

補足: `CRessyasenDraw` / `CRessyajouhouDraw` / `CDcdDiagram_CStopMarkDraw` / `CRessyaTrackDraw` は旧実装(個別パス)で、現在は CDcdDiagram::DcDraw 内で**すべてコメントアウト**され、統合版 `CRessyaDraw` に置き換えられている。OpenMP (`#pragma omp`) で並列描画し、GDI 呼び出しだけ critical セクションにしている。

### 5.3 列車走査と日跨ぎ・24時間繰り返し — `CRessyaDraw::execute()`

- 方向(下り→上り)×列車のループ。NULL列車・列車線ゼロの列車はスキップ。
- 各列車について `iShiftSecond` を「列車のX範囲が表示域左端より左に来るまで24時間(`CdDedJikoku::TOTALSECONDS_A_DAY`)ずつ減算→そこから表示域右端を超えるまで24時間ずつ加算しながら繰り返し描画」。これにより **0時をまたぐ列車が左右両端(例: -1:00→1:00 と 23:00→25:00)の2箇所に描かれる**。パターンダイヤプレビューの複製もこの仕組みに乗る。
- 高速化: 駅ごとのY実座標キャッシュ `m_DcdYCache` / `m_DcdYEkiTrackCache` を `ReadYDcdCache()` で事前計算。表示域内の駅Order範囲 `m_iDisplayOriginSideEkiOrder/TerminalSideEkiOrder` で列車線を事前カリング。

### 5.4 スジ1本の描画 — `CRessyaDraw::RessyasenDraw()`

- 種別Index→`CentDedDgrRessyasyubetsu`(親種別表示ONで `ParentSyubetsuIndex`≥0 なら親に差替え)→`CconvCentDed::CentDedRessyasyubetsu_to_CDcdFreeLineProp()` (entDed/CconvCentDed.cpp 2962行) で線属性へ変換:
  - 色 = `DiagramSenColor`
  - 線種 `ESenStyle`(entDed/CentDedRessyasyubetsu.h): `SenStyle_Jissen`(実線)→LINESTYLE_SOLID / `SenStyle_Hasen`(破線)→LINESTYLE_DASH / `SenStyle_Tensen`(点線)→LINESTYLE_DOT / `SenStyle_Ittensasen`(一点鎖線)→LINESTYLE_DASH_DOT
  - 太さ = `DiagramSenIsBold` ? 論理幅2 : 1
- 起点(発X, 駅Ter-Y)→終点(着X, 駅Org-Y)の直線を `CDcdFreeLine` で描く。

### 5.5 列車情報ラベル — `CRessyaDraw::RessyajouhouDraw()`

- 描画条件: 駅時刻の `ShouldRessyajouhouDraw` が真、かつその駅が列車線の**終点でない**こと。
- テキスト = (表示ONなら)列車番号 + ' ' + 列車名 + ' ' + 号数+"号"。色 = 種別の『時刻表文字色』。フォント=ダイヤ画面列車フォント。
- 位置と角度: 当該駅の発時刻位置 (X,Y) を基準に、**列車線の実傾き(Dcd座標での atan)に沿って回転したテキスト**を線の上側にオフセットして描画(CRessyaDraw.cpp 634-665行付近)。角度・オフセットの幾何は方向別に異なる:
  - 下り: `c = atan(dx/dy)`(dx=x終点-x起点, dy=y終点-y起点)、`iDeg = 270 + c`。オフセットはX方向のみ: 位置=(X+e, Y)、`e = d / cos(c)`(d=テキスト高+2 の斜辺換算)。
  - 上り: `c = atan(dx / (y起点 - y終点))`、`iDeg = 90 - c`。dy=y終点-y起点 と書けば **iDeg = 90 + atan(dx/dy)** に相当(符号に注意。下り式の記法で `90 - atan(dx/dy)` と実装すると逆方向に傾く)。オフセットは法線方向: 位置=(X - d·cos(c), Y - d·sin(c))、d=テキスト高+2。
  - GDI の `CreateFont(lfEscapement=iDeg*10)` + `TextOut` を直接使用。
- つまり**ラベルは通常は始発駅(または「常に表示」設定駅)の発時刻位置で、スジと平行に描かれる**。

### 5.6 停車記号 — `CRessyaDraw::StopMarkDraw()`

- ビュー属性 `m_eStopMarkDraw == EStopMarkDraw_DrawOnBriefStop`(停車駅明示ON)のとき。
- 条件: 種別の `EStopMarkDrawType_DrawOnStop` かつ 駅扱=停車 かつ 停車秒 <60(着発Xの差) かつ 始発・終着駅でない かつ 列車線終点でない。
- 描画: 発時刻位置に半径2px程度の**白抜き○**(`Ellipse(x-2,y-2,x+3,y+3)`)。将来用に通過駅明示(`EStopMarkDrawType_DrawOnPass`)が予約されているが未使用。

### 5.7 在線表・運用表示 — `CRessyaDraw::RessyaTrackLineDraw()` ほか(約2000行)

- 在線表表示駅では、列車の在線を番線ごとの横太線で描く(`RessyaTrackHorizontalLineDraw`)。実体はペン幅指定の線ではなく **Y-1~Y+1 の高さ3論理単位の塗り潰し多角形(Polygon)** で、転線の縦線と接続する側の端(`iYChamferLeft/iYChamferRight`)の角を接続方向に応じて斜めに削る(chamfer)。番線移動(転線)は幅1の縦線(`RessyaTrackVerticalLineDraw`)で接続する。縦線自体は端部加工なしの単純な直線(端をずらす iYShift 系の処理はコメントアウト済み)。
- 着側/発側の作業コード(`m_iChakuOperation/m_iHatsuOperation`)に応じて: 出区=○記号、入区=△記号、路線外始発/終着=駅名(ダイヤ略称)+運用番号のテキスト(`OuterEkimeiAndOperationNumberDraw`、表示方法は `m_iDiagramDisplayOuterTerminal` 0=駅名+運用番号/1=駅名/2=運用番号/3=なし)、次列車接続(非表示区間)=円弧(`ConnectNextNoDisplayDraw`)。運用番号テキストは `OperationNumberDraw`。
- 分岐駅・環状線駅では「補助列車線」を描き、`BrunchOpposite/LoopOpposite` により凸方向を反転する。
- 在線表を出さない端駅でも、上下余白スペースに入出区記号・折返し記号を描く。

### 5.8 更新経路

- `CDedDiagramView::OnUpdate()`(cdeddiagramview.cpp): 編集コマンド(Hint)種別で分岐。列車編集(`CRfEditCmd_Ressya`)は該当 `CentDedDgrRessya` のみ再構築(`OnUpdate_CentDedRessya`)。ただしパターンプレビュー中や運用機能有効時は全列車再構築(`OnUpdate_CentDedRessya_All`)。駅・種別・路線・表示プロパティの変更は全更新(`OnUpdate_All` → `CentDedDgrDia::readCentDedRosen()`)。非アクティブ時の全更新は `m_bUpdate_All_Requested` で保留し、アクティブ化時に実行。
- メニュー[表示]-[更新]で駅間最小所要秒の再計算を伴う再描画(マニュアル)。
- `CWndDiagram::update_updateScreen()`: スクロール時は `ScrollWindow()` で既存ピクセルを流用し無効領域のみ再描画。スクロールバー範囲はダイヤ全体Zone、ページサイズは表示Zone。

## 6. UI・操作の挙動

| 操作                         | 挙動                                                                                                                                                 | 根拠                                                  |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| マウスホイール               | **縦スクロールのみ**。移動量 = 縦罫ピッチ(VlinePitch)×ノッチ数。Ctrl/Shift 修飾なし(nFlags==0 のみ処理)                                              | CWndDiagram.cpp `OnMouseWheel`                        |
| 矢印キー/Home/End/PgUp/PgDn  | H/Vスクロールと等価                                                                                                                                  | CWndDiagram.cpp `OnKeyDown`                           |
| スクロールバー               | X=時刻方向、Y=駅方向。Dgr座標単位                                                                                                                    | `OnHScroll/OnVScroll`                                 |
| **ダブルクリック(列車線上)** | ヒットテストで列車を特定し、**時刻表ビューを開いてその列車・駅時刻セルにフォーカス**。パターンプレビュー中は複製列車を `idx % 実列車数` で本体に還元 | CWndDiagram.cpp `OnLButtonDblClk_openJikokuhyouView`  |
| ダブルクリック(駅名欄)       | 駅のプロパティダイアログを開く                                                                                                                       | `OnLButtonDblClk_openDlgEkiProp`                      |
| 右クリック                   | コンテキストメニューなし(明示的に未実装)                                                                                                             | `OnContextMenu`                                       |
| シングルクリック/ドラッグ    | **何もしない。ドラッグによる時刻修正・スジ引き(新規列車入力)機能は存在しない**(ビューは表示専用。編集は時刻表系ビューで行う)                         | メッセージマップに LButtonDown/MouseMove ハンドラなし |
| 指定列車番号へ移動           | 列車番号を入力し該当スジ位置へスクロール(`OnDiagramRessyabangouMove`, `setZoneCenter_Dgr`)                                                           | cdeddiagramview.cpp                                   |
| 印刷/印刷プレビュー          | 現在の表示範囲(Zone_Dgr)を1ページとして `CaDcdDiagram_PageSelector` が X×Y ページに分割して印刷                                                      | CaDcdDiagram_PageSelector.h                           |
| 初期表示                     | 初回のみ .ini からスクロール位置・罫線設定を復元(`readCWndDiagramViewProp`)                                                                          | CWndDiagram.cpp `onUpdateCentDedDgrDia`               |

### ヒットテスト — `CDcdDiagram::calcCentDedDgrRessyasenOfPoint()` → `CCalcCentDedDgrRessyasenOfPoint`

1. クリック点を含む表示域を Dgr 座標に変換し、`CEnumRessyasen` で交差候補の列車線を列挙。
2. 各列車線を Dcd 座標の直線にし、まずバウンディングボックス判定(垂直/水平線はサイズ0→1に補正)。
3. X成分が長い線は `y=f(x)` で、Y成分が長い線は `x=f(y)` で点との距離を計算し、**マージン(ピクセル)以内なら命中**。最初に見つかった1本(方向・列車Index・列車線Index)を返す。

- 駅Order の逆引きは `calcEkiOrderOfPoint()`(方向に応じて上/下の駅を返す)。

## 7. 表示オプション一覧

| オプション                                                            | 保持場所                                                                 | 既定                             |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------ | -------------------------------- |
| 列車番号表示 / 列車名表示                                             | `CDcdDiagram::m_bDisplayRessyabangou/Ressyamei`                          | true                             |
| 下り/上り列車線表示                                                   | `m_bDisplayRessyasenKudari/Nobori`                                       | true                             |
| 時間目盛(1/2/5/10/15/20/30/60分)                                      | `m_idxVlineMode`                                                         | 1(2分目)                         |
| 停車駅明示(○)                                                         | `m_eStopMarkDraw`                                                        | OFF                              |
| 一般駅の駅名非表示                                                    | `CDcdDiagram2::m_bHideIppanekiEkimei`                                    | false                            |
| 親種別による表示                                                      | `m_bDisplayParentSyubetsu`                                               | false                            |
| 駅間個別背景色                                                        | `m_bDisplayBackColorNextEki`                                             | false                            |
| 色・フォント(列車/駅名/時刻フォント、背景色、軸色、文字色、背景色1-4) | `CdDedDispProp` から `readCdDedDispProp()` で読込                        | Meiryo UI 9pt、白背景、黒軸/文字 |
| 路線外発着の表示方法                                                  | `m_iDiagramDisplayOuterTerminal`                                         | 0(駅名+運用番号)                 |
| ウインドウサイズ変更時の表示範囲維持                                  | `setKeepZoneDgrOnSize`                                                   | false(範囲可変)                  |
| パターンダイヤプレビュー                                              | `CentDedDgrDia::m_iPatternDiagramPreviewCycleSecond`(60~10800秒)/`Range` | OFF                              |

**存在しない機能**: 現在時刻線(リアルタイム表示)、上下ダイヤの別ウィンドウ重ね合わせ(下り/上りは同一ビューにON/OFF重畳)、ドラッグでのスジ編集。

パターンダイヤプレビューは、`readCentDedRosen_04_updateRessyaCont`(および view 側の全列車再読込)で**実列車を ±Range 秒までサイクル秒ごとに時刻シフトした複製 `CentDedDgrRessya` としてコンテナ末尾に追加**する実装(CentDedDgrDia.cpp / cdeddiagramview.cpp)。

## 8. Web再実装に向けた論点

### 移植の核(そのまま再実装すべきロジック)

1. **entDgr 層はほぼ純粋なアルゴリズム**で Windows 依存がなく、TypeScript へ素直に移植できる。特に:
   - 駅間最小所要秒の走査と Y座標決定(§2.2)
   - `readCentDedRessya` の 02→04→05→06→08 パイプライン(§4)。この順序・60秒閾値・補間ルールが OuDia 特有の見た目(長時間停車の水平線、主要駅での折れ、経由なしの切断)を決めるため、忠実に再現する価値が高い。
   - 中間駅X補間(Y距離比の線形補間)と `m_iDgrXPosRessyasen`。推定時刻(`createEstimateRessya`)は時刻表側機能とも共有される。
2. **日跨ぎ処理**は2段階: (a) entDgr 内で累積差分により X>86400 を許容、(b) 描画時に 24時間周期で `iShiftSecond` を変えて繰り返し描画。Canvas/SVG 実装でも同じ2段構えが簡潔。
3. 座標変換は「表示範囲 Zone(Dgr) ⇔ ビューポート」の線形変換1つに集約できる。ズームは倍率でなく**表示範囲サイズの離散増減**(X=30分刻み、Y=全体の1/10刻み)である点が OuDia 互換の操作感。

### Windows / MFC 依存(置き換えが必要)

- GDI 直叩き箇所: 回転テキスト(`lfEscapement`)、`Ellipse`、`ScrollWindow` による部分スクロール、`SetScrollInfo`。Canvas なら `ctx.rotate` +全再描画で単純化できる(部分スクロール最適化は不要になる可能性が高い)。
- OpenMP 並列描画・Yキャッシュは GDI が遅いための最適化。Web では viewport カリング(表示駅範囲・列車線の事前カリングは流用価値あり)+requestAnimationFrame で十分と思われる。
- Doc/View の更新 Hint 分岐(列車単位の差分更新)は、状態管理(例: signals/store)で「列車単位の再計算」として再現するとパターンプレビュー時の全再計算コストも制御しやすい。
- .ini による表示状態永続化 → localStorage 等。
- 線種(破線/点線/一点鎖線)は Canvas `setLineDash` で対応可。DOT2(縦罫の細点線)も同様。

### 単純化・注意点

- 旧描画クラス(CRessyasenDraw / CRessyajouhouDraw / CDcdDiagram_CStopMarkDraw / CRessyaTrackDraw)は死にコード。**CRessyaDraw のみ移植すればよい**。
- 在線表・運用(RessyaTrackLine)関連は作業コード(-5~5)の分岐が非常に多く(CRessyaDraw.cpp の約2/3)、分岐駅・環状線・反転(Opposite)まで絡む最難関。第一段階では「基本スジ+ラベル+停車記号+罫線」を先行し、在線表/運用線/分岐・環状表示は後続フェーズに分離するのが現実的。
- ヒットテストは線分と点の距離判定のみで単純。マージンは呼び出し側指定(ピクセル)。
- ビューは表示専用なので、Web 版で「ドラッグで時刻修正」等を足す場合は本家に前例がない=自由設計領域。逆に互換性目標なら実装不要。
- 縦罫ピッチ値は「60分の約数」制約があるテーブル固定。ユーザー拡張しないならテーブルごと移植。
- `INT_MIN` を NULL 値として多用している。TS では `null`/`undefined` に置き換えるべき(演算前の NULL チェック漏れに注意)。
- Y軸は「%指定」(プロパティダイアログ)と「駅Index指定」(setZone_Dgr/setZoneCenter_Dgr)の2通りのナビゲーションがある。
